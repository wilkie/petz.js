/**
 * Where the dog is on the stage as its frames play, as `PopScript` places
 * each frame (DOGZDLL.DLL seg7:6e8e to 6f32; see kb/formats/scp.md):
 *
 * - glued by a ball, so that the ball stays where it was
 *   (`Ballz::MoveFrameRectBall`, inferred from its name: not yet read);
 * - after a reference frame, moved by the difference between the centres of
 *   the reference's rectangle and its own (`Ballz::GetCenterOffset`), which
 *   is how a walk carries the dog on from one cycle to the next;
 * - otherwise where its own coordinates put it (`Ballz::MoveFrameRect`).
 */

import { type AnimationHeader, type Frame } from '../formats/animation.ts';
import { type Breed } from '../formats/lnz.ts';
import { ballAt } from '../render/ballz.ts';
import { type Placed, project, scalesForAge } from '../render/project.ts';
import { type PetWorld } from './pet.ts';
import { DEFAULT_GLUE, type Step } from './timeline.ts';

/** A treat out of its box: held on the cursor, or put down on the stage. */
export interface Treat {
  /** 0 blue, 1 green, 2 red, as `FoodSprite::theirNames` lists them after food and water. */
  colour: number;
  held: boolean;
  x: number;
  y: number;
}

/**
 * The size of the ball's picture, bitmap 10200 of DOGZDLL.DLL
 * (`BALL_PICTURE`), in Dogz's pixels: its rectangle on the stage.
 */
export const BALL_SIZE = { width: 31, height: 29 };

/**
 * The ball's rectangle, centred on where it is as `XSprite::MoveSpritePt`
 * and `GrabSprite::Update` centre it: half the size, rounded down, to the
 * left and above.
 */
export function ballRect({ x, y }: { x: number; y: number }) {
  const left = x - Math.trunc(BALL_SIZE.width / 2);
  const top = y - Math.trunc(BALL_SIZE.height / 2);
  return { left, top, right: left + BALL_SIZE.width, bottom: top + BALL_SIZE.height };
}

/**
 * A ball: where it is, how fast it rolls, and who has it — the user, on
 * the cursor; the dog, in its mouth (slot 0) or under a paw (slot 1); or
 * nobody, on the stage.
 */
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: boolean;
  slot: number | null;

  /** Where it was put down, and where the dog's chin was then (`RecordPosition`). */
  recorded: { x: number; y: number; chinX: number; chinY: number } | null;
}

/** The dog's balls an object is held by: the chin, and a toe (`GrabObject`, seg14:04e4). */
const HOLDERS = [51, 45];

/**
 * `BallSprite::UpdateLocation` (seg20:2634): a frame of rolling. The speed
 * loses a fortieth of itself, stops within a pixel a frame, and turns back
 * when its rectangle is past the stage's edges. Returns whether it bounced.
 */
export function rollBall(ball: Ball, width: number, height: number) {
  if (ball.vx === 0 && ball.vy === 0) {
    return false;
  }

  ball.vx -= ball.vx / 40;
  ball.vy -= ball.vy / 40;

  if (ball.vx < 1 && ball.vx > -1) {
    ball.vx = 0;
  }

  if (ball.vy < 1 && ball.vy > -1) {
    ball.vy = 0;
  }

  ball.x += Math.trunc(ball.vx);
  ball.y += Math.trunc(ball.vy);

  const rect = ballRect(ball);
  let bounced = false;

  if ((rect.left < 0 && ball.vx < 0) || (rect.right > width && ball.vx > 0)) {
    ball.vx = -ball.vx;
    bounced = true;
  }

  if ((rect.top < 0 && ball.vy < 0) || (rect.bottom > height && ball.vy > 0)) {
    ball.vy = -ball.vy;
    bounced = true;
  }

  return bounced;
}

export class Stage implements PetWorld {
  /** The dog's origin on the stage, from its top left. */
  x: number;
  y: number;

  /** Where the user's cursor is, and whether its primary button is down. */
  pointer = { x: -1000, y: -1000, button: false };

  treat: Treat | null = null;
  ball: Ball | null = null;

  /** Where the cursor was the frame before: a ball let go takes half the difference as its speed. */
  private lastPointer = { x: -1000, y: -1000 };

  /** Each ball's part of the body (`readBodyAreas`); without them, nothing is hit. */
  bodyAreas: number[] = [];

  readonly width: number;
  readonly height: number;

  private frame: Frame;
  private rotation = 0;
  private readonly breed: Breed;
  private readonly header: AnimationHeader;
  private readonly frames: Frame[];
  private readonly age: number;

  constructor(
    width: number,
    height: number,
    breed: Breed,
    header: AnimationHeader,
    frames: Frame[],
    age = 0
  ) {
    this.width = width;
    this.height = height;
    this.breed = breed;
    this.header = header;
    this.frames = frames;
    this.age = age;
    this.x = width / 2;
    this.y = (height * 5) / 8;
    this.frame = frames[0];
  }

  private ballOf(frame: Frame, ball: number, rotation: number) {
    return ballAt(this.breed, this.header, frame, ball, { age: this.age, yaw: rotation });
  }

  /** The centre of the rectangle a frame is drawn in, from the dog's origin. */
  private frameCentre(frame: Frame, rotation: number) {
    const placed = project(
      this.breed,
      this.header,
      frame,
      scalesForAge(this.breed, this.age),
      rotation,
      100 - this.age
    );
    const left = Math.min(...placed.map((ball) => ball.x - ball.diameter / 2));
    const right = Math.max(...placed.map((ball) => ball.x + ball.diameter / 2));
    const top = Math.min(...placed.map((ball) => ball.y - ball.diameter / 2));
    const bottom = Math.max(...placed.map((ball) => ball.y + ball.diameter / 2));
    return { x: Math.trunc((left + right) / 2), y: Math.trunc((top + bottom) / 2) };
  }

  /**
   * Moves on to a step's frame, turned to `rotation`: glued, or placed by a
   * reference frame, or where its own coordinates put it.
   */
  show(step: Step, rotation: number, reference?: number) {
    const next = this.frames[step.frame];

    if (step.glue !== undefined) {
      const before = this.ballOf(this.frame, step.glue, this.rotation);
      const after = this.ballOf(next, step.glue, rotation);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    } else if (reference !== undefined) {
      const from = this.frameCentre(this.frames[reference], rotation);
      const to = this.frameCentre(next, rotation);
      this.x += from.x - to.x;
      this.y += from.y - to.y;
    }

    this.frame = next;
    this.rotation = rotation;
  }

  /** Every ball of the frame shown, placed on the stage. */
  placed(): Placed[] {
    return project(
      this.breed,
      this.header,
      this.frame,
      scalesForAge(this.breed, this.age),
      this.rotation,
      100 - this.age
    ).map((ball) => ({ ...ball, x: this.x + ball.x, y: this.y + ball.y }));
  }

  cursor() {
    return this.pointer;
  }

  /** A ball on the stage, and how wide it is drawn. */
  ballOnStage(ball: number) {
    return this.placed()[ball];
  }

  /** The rectangle the dog is drawn in. */
  rect() {
    const placed = this.placed();
    return {
      left: Math.min(...placed.map((ball) => ball.x - ball.diameter / 2)),
      top: Math.min(...placed.map((ball) => ball.y - ball.diameter / 2)),
      right: Math.max(...placed.map((ball) => ball.x + ball.diameter / 2)),
      bottom: Math.max(...placed.map((ball) => ball.y + ball.diameter / 2)),
    };
  }

  /**
   * The part of the body under a point, or -1: the nearest ball whose square
   * holds it, as `Ballz::HitTest` (seg10:46d8) tries them nearest first, and
   * that ball's area (`HitTestBodyArea`).
   */
  areaAt(point: { x: number; y: number }) {
    const placed = this.placed();
    const nearestFirst = placed
      .map((_, ball) => ball)
      .sort((a, b) => placed[a].depth - placed[b].depth);

    for (const ball of nearestFirst) {
      const { x, y, diameter } = placed[ball];
      const half = diameter / 2;

      if (point.x > x - half && point.x < x + half && point.y > y - half && point.y < y + half) {
        return this.bodyAreas[ball] ?? -1;
      }
    }

    return -1;
  }

  /** The middle of the rectangle the dog is drawn in: the sprite's position (`XSprite::MoveSpriteRect`). */
  centre() {
    const { left, top, right, bottom } = this.rect();
    return { x: Math.trunc((left + right) / 2), y: Math.trunc((top + bottom) / 2) };
  }

  /**
   * The pet's standard size: frame 35 drawn side on, rotation 64, as
   * `PetModule::FigureOutStandardWidthAndHeight` (seg21:0289) measures it.
   */
  standardSize() {
    const placed = project(
      this.breed,
      this.header,
      this.frames[35],
      scalesForAge(this.breed, this.age),
      64,
      100 - this.age
    );
    const extent = (axis: 'x' | 'y') =>
      Math.max(...placed.map((ball) => ball[axis] + ball.diameter / 2)) -
      Math.min(...placed.map((ball) => ball[axis] - ball.diameter / 2));
    return { width: Math.trunc(extent('x')), height: Math.trunc(extent('y')) };
  }

  /**
   * A frame of the ball (`BallSprite::Update`, seg20:20b8): held, it follows
   * the cursor; in the dog's mouth or under its paw, that ball of the dog;
   * else it rolls.
   */
  updateBall() {
    const ball = this.ball;

    if (ball?.held) {
      ball.vx = Math.trunc((this.pointer.x - this.lastPointer.x) / 2);
      ball.vy = Math.trunc((this.pointer.y - this.lastPointer.y) / 2);
      ball.x = this.pointer.x;
      ball.y = this.pointer.y;

      /* Kept on the stage (`GrabSprite::Update`, seg20:018c). */
      const rect = ballRect(ball);
      ball.x += Math.max(0, -rect.left) - Math.max(0, rect.right - this.width);
      ball.y += Math.max(0, -rect.top) - Math.max(0, rect.bottom - this.height);
    } else if (ball && ball.slot !== null) {
      const holder = this.placed()[HOLDERS[ball.slot]];
      ball.x = holder.x;
      ball.y = holder.y;
      ball.vx = ball.vy = 0;
    } else if (ball) {
      rollBall(ball, this.width, this.height);
    }

    this.lastPointer = { x: this.pointer.x, y: this.pointer.y };
  }

  /** A ball of the dog in some frame, were the dog to stay where it is: what `8af4` aims with. */
  ballInFrame(frame: number, ball: number, rotation: number) {
    const at = this.ballOf(this.frames[frame], ball, rotation);
    return { x: this.x + at.x, y: this.y + at.y };
  }

  /** Moves the dog by so much, as `PopScript` slides it towards an aim (seg7:6f6b). */
  nudge(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  /** `BallSprite::ProjectLocation`: where the ball will be so many frames on, and how often it will bounce. */
  projectBall(frames: number) {
    const ball = this.ball!;
    const ahead = { ...ball };
    let bounces = 0;

    for (let n = 0; n < frames; n++) {
      if (rollBall(ahead, this.width, this.height)) {
        bounces++;
      }
    }

    return { x: ahead.x, y: ahead.y, bounces };
  }

  /** `PetModule::GrabObject`: the ball into the dog's mouth, or under its paw. */
  grabBall(slot: number) {
    if (this.ball) {
      this.ball.slot = slot;
      this.ball.held = false;
    }
  }

  /**
   * `PetModule::ReleaseObject`: the ball put down at the dog's chin, at
   * rest; from the mouth, recorded there (`RecordPosition`).
   */
  releaseBall(slot: number) {
    const ball = this.ball;

    if (!ball || ball.slot !== slot) {
      return;
    }

    /* Put down at the chin, whichever slot held it (`ActualReleaseObject`, seg14:0df1). */
    const holder = this.placed()[HOLDERS[0]];
    ball.slot = null;
    ball.x = Math.trunc(holder.x);
    ball.y = Math.trunc(holder.y);
    ball.vx = ball.vy = 0;
    ball.recorded = slot === 0 ? { x: ball.x, y: ball.y, chinX: holder.x, chinY: holder.y } : null;
  }

  /** `BallSprite::HasMoved` (seg20:1f28): moved since put down, or the dog's chin 7 pixels from where it was. */
  ballHasMoved() {
    const ball = this.ball;
    const chin = this.placed()[HOLDERS[0]];

    if (!ball?.recorded) {
      return true;
    }

    const { x, y, chinX, chinY } = ball.recorded;
    return !(
      ball.x === x &&
      ball.y === y &&
      Math.abs(chinX - chin.x) < 7 &&
      Math.abs(chinY - chin.y) < 7
    );
  }

  eatTreat() {
    this.treat = null;
  }

  /** Where the dog is: its belly, on the stage. */
  where() {
    const belly = this.ballOf(this.frame, DEFAULT_GLUE, this.rotation);
    return { x: this.x + belly.x, y: this.y + belly.y };
  }

  /**
   * The rotation that points the dog's head, from its belly, most nearly at
   * a point on the stage: the way it then walks. Found by trying every
   * sixteenth of a turn on the frame it is showing.
   */
  aim(target: { x: number; y: number }) {
    const head = this.breed.keyBalls[0];
    const at = this.where();
    const want = Math.atan2(target.y - at.y, target.x - at.x);
    let best = 0;
    let closest = Infinity;

    for (let rotation = -128; rotation < 128; rotation += 16) {
      const from = this.ballOf(this.frame, DEFAULT_GLUE, rotation);
      const to = this.ballOf(this.frame, head, rotation);
      const angle = Math.atan2(to.y - from.y, to.x - from.x) - want;
      const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));

      if (off < closest) {
        closest = off;
        best = rotation;
      }
    }

    return best;
  }
}
