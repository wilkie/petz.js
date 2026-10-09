/**
 * Where a Catz cat is: its rectangle, which `PopScript` (CATZDLL.DLL
 * seg41:0052) moves from frame to frame by the cat's `XBallz` methods. See
 * kb/topics/catz-behaviour.md ("Where the cat is").
 */

import { type AnimationHeader, type Frame } from '../formats/animation.ts';
import { type Breed } from '../formats/lnz.ts';
import { layeredCatzFrame } from '../render/extend.ts';
import { wrapCatzAngle } from './catz-fudger.ts';
import { CATZ_TURN } from '../render/raster.ts';
import { skeletonOf } from '../render/skeleton.ts';
import {
  type CatzHead,
  catzFrameBounds,
  cosine,
  sine,
  type Placed,
  project,
  type Scales,
  scalesForAge,
} from '../render/project.ts';

/** A rectangle, its right and bottom past its last column and row. */
export interface CatzRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What of the cat's state (`BallState`) moves its balls: the frame and how it is turned. */
export interface CatzPose {
  frame: number;

  /** Rotation, tilt and roll (`+0x10`, `+0x12`, `+0x14`), in 256ths of a turn. */
  rotation: number;
  tilt: number;
  roll: number;

  /** The head's turn (`+0x1c` to `+0x20`). */
  head: CatzHead;

  /** A layered action played over it: its first frame and its frame now (`+0x4a`, `+0x4c`). */
  layer?: { first: number; frame: number };

  /**
   * Its eyelids' tilts, openings and heights and where its eyes look
   * (`+0x22` to `+0x32`): nothing to where its balls are, but part of what
   * the engine tells states apart by.
   */
  eyes?: number[];
}

/** A pose's balls and rectangle, as worked out once. */
interface Worked {
  placed: Placed[];
  bounds: CatzRect;
}

/**
 * A cat's frames placed as the engine places them, for one breed at one
 * age; the frames shaped for the breed already (`extendFrames`). Its balls
 * are sized by the scale its state holds (`BallState` `+0x16`), the
 * breed's for its age unless given.
 *
 * Not modelled: the engine remembers the last five states it worked out
 * (`GetCartesianCoordinates`, seg47:419c), each by all but its layered
 * action, so a state met again with a layered action playing, or no longer
 * playing, is placed as it was the first time; the harness's actions never
 * come upon it.
 */
export class CatzPlacer {
  readonly breed: Breed;
  readonly header: AnimationHeader;
  readonly frames: Frame[];
  readonly age: number;
  readonly scales: Scales;
  readonly #worked = new Map<string, Worked>();

  constructor(
    breed: Breed,
    header: AnimationHeader,
    frames: Frame[],
    { age = 0, scales = scalesForAge(breed, age) }: { age?: number; scales?: Scales } = {}
  ) {
    this.breed = breed;
    this.header = header;
    this.frames = frames;
    this.age = age;
    this.scales = scales;
  }

  /** What the engine tells two states apart by: all but its layered action. */
  static keyOf(pose: CatzPose) {
    const { frame, rotation, tilt, roll, head, eyes = [] } = pose;
    return JSON.stringify([frame, rotation, tilt, roll, head.rotation, head.tilt, head.cock, eyes]);
  }

  /** A pose worked out: its balls from the cat's origin, and its rectangle (`GetCartesianCoordinates`). */
  get(pose: CatzPose): Worked {
    const full = JSON.stringify(pose);
    let worked = this.#worked.get(full);

    if (!worked) {
      const { first, frame } = pose.layer ?? { first: -1, frame: -1 };
      const shown =
        first >= 0 && frame >= 0
          ? layeredCatzFrame(
              this.frames[pose.frame],
              this.frames[first],
              this.frames[frame],
              this.breed
            )
          : this.frames[pose.frame];
      const place = (frame: Frame) =>
        project(
          this.breed,
          this.header,
          frame,
          this.scales,
          pose.rotation,
          100 - this.age,
          undefined,
          { tilt: pose.tilt, roll: pose.roll, spin: 0 },
          undefined,
          { catzHead: pose.head }
        );
      const placed = place(shown);
      const unsized = shown.extras.length ? place({ ...shown, extras: [] }) : placed;

      worked = { placed, bounds: catzFrameBounds(this.breed, placed, unsized) };
      this.#worked.set(full, worked);
    }

    return worked;
  }

  /** Every ball of a pose, from the cat's origin. */
  placed(pose: CatzPose): Placed[] {
    return this.get(pose).placed;
  }

  /** A pose's own rectangle (`BallState` `+0x36` to `+0x3c`). */
  bounds(pose: CatzPose): CatzRect {
    return this.get(pose).bounds;
  }

  /**
   * A ball where it is on the stage, the cat in `rect`: its place from the
   * cat's origin, and the origin where the rectangle puts the pose's own
   * (`GetBallOffset`, seg47:2c57).
   */
  ballOnStage(rect: CatzRect, pose: CatzPose, ball: number) {
    const { placed, bounds } = this.get(pose);
    return {
      x: placed[ball].x + rect.left - bounds.left,
      y: placed[ball].y + rect.top - bounds.top,
    };
  }

  /**
   * The cat's rectangle moved from one pose to the next as their frames' own
   * rectangles move (`XBallz::MoveFrameRect`, seg47:1e64): the one before
   * worked out again turned as the new one is, the rectangle moved by how far
   * the top left moved from that, and sized as the new one. The same state
   * again moves it nowhere.
   */
  moveFrameRect(rect: CatzRect, next: CatzPose, before: CatzPose): CatzRect {
    if (CatzPlacer.keyOf(next) === CatzPlacer.keyOf(before)) {
      return rect;
    }

    const is = this.bounds(next);
    const was = this.bounds({
      ...before,
      rotation: next.rotation,
      tilt: next.tilt,
      roll: next.roll,
    });
    const left = rect.left + is.left - was.left;
    const top = rect.top + is.top - was.top;

    return { left, top, right: left + is.right - is.left, bottom: top + is.bottom - is.top };
  }

  /**
   * The cat's rectangle moved so that a ball is where it was
   * (`XBallz::MoveFrameRectBall`, seg47:212d; `GetBallOffset`, seg47:2c57).
   * The same state again moves it nowhere.
   */
  moveFrameRectBall(rect: CatzRect, next: CatzPose, before: CatzPose, ball: number): CatzRect {
    if (CatzPlacer.keyOf(next) === CatzPlacer.keyOf(before)) {
      return rect;
    }

    const was = this.get(before);
    const is = this.get(next);
    const then = was.placed[ball];
    const now = is.placed[ball];
    const left = is.bounds.left - now.x + then.x + rect.left - was.bounds.left;
    const top = is.bounds.top - now.y + then.y + rect.top - was.bounds.top;

    return {
      left,
      top,
      right: left + is.bounds.right - is.bounds.left,
      bottom: top + is.bounds.bottom - is.bounds.top,
    };
  }
}

/**
 * The cat's rectangle kept touching an area, as `PopScript` keeps it once
 * placed (seg41:188a to 1922): its right edge no further left than the
 * area's left, its bottom no higher than the area's top, its left no
 * further right than the area's right and its top no lower than its bottom
 * (`PetParams` `+0xac` to `+0xb2`).
 */
export function keepCatzTouching(rect: CatzRect, area: CatzRect): CatzRect {
  let dx = 0;
  let dy = 0;

  if (area.left > rect.right) {
    dx = area.left - rect.right;
  }

  if (area.top > rect.bottom) {
    dy = area.top - rect.bottom;
  }

  if (area.right < rect.left + dx) {
    dx = area.right - rect.left;
  }

  if (area.bottom < rect.top + dy) {
    dy = area.bottom - rect.top;
  }

  return {
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  };
}

/** Where a tick leaves the cat, and the states it goes on from. */
export interface CatzPlaced {
  rect: CatzRect;

  /** The state it was last placed in (`+0x246`), and the state it is in (`+0x678`). */
  before: CatzPose;
  current: CatzPose;
}

/**
 * A tick's frame placed as `PopScript` places it (seg41:114d to 1257, 1784
 * to 1922): a reference frame first, as it is popped -- made from the
 * state as it is, turned to align where that is more than 6 either way,
 * and glued by the glue ball -- and then the tick's own state, moved to
 * from the last placed, by the glue ball where the tick is glued; and kept
 * touching `area`. The shift by fudgers 12 and 13 (seg41:1817 to 1856) is
 * not modelled.
 */
export function placeCatzTick(
  placer: CatzPlacer,
  { rect, before, current }: CatzPlaced,
  pose: CatzPose,
  {
    reference,
    glued = false,
    ball = catzGlueBall(placer.breed),
    area,
  }: {
    reference?: { frame: number; turn?: number };
    glued?: boolean;
    ball?: number;
    area?: CatzRect;
  } = {}
): CatzPlaced {
  if (reference) {
    const turn = reference.turn ?? 0;
    const held: CatzPose = {
      ...current,
      frame: reference.frame,
      rotation: Math.abs(turn) > 6 ? wrapCatzAngle(current.rotation + turn) : current.rotation,
    };

    rect = placer.moveFrameRectBall(rect, held, before, ball);
    before = held;
  }

  rect = glued
    ? placer.moveFrameRectBall(rect, pose, before, ball)
    : placer.moveFrameRect(rect, pose, before);

  return { rect: area ? keepCatzTouching(rect, area) : rect, before: pose, current: pose };
}

/** A point on the stage. */
export interface CatzPoint {
  x: number;
  y: number;
}

/**
 * Which way to turn the cat to face a point (`SetTargetLocation`,
 * seg40:596d): the angle from the point to its nose -- the lines' key ball
 * 7 (`+0xd9d`) -- `atan2` of the two in 256ths of a turn by the true 2π,
 * rounded toward 0, and a quarter turn more; none where the nose is on the
 * point.
 */
export function catzAimAt(placer: CatzPlacer, rect: CatzRect, pose: CatzPose, point: CatzPoint) {
  const nose = placer.ballOnStage(rect, pose, skeletonOf(placer.breed).nose);
  const [dx, dy] = [nose.x - point.x, nose.y - point.y];

  if (!dx && !dy) {
    return undefined;
  }

  return wrapCatzAngle(Math.trunc((Math.atan2(dy, dx) * 256) / CATZ_TURN) + 64);
}

/** How big the box a target is looked for in is, and how far ahead of the head it is: the size's diagonal over `share` (`+0x250e`, `+0x2510`, `+0x2512`). */
export interface CatzFocus {
  width: number;
  height: number;
  share: number;
}

/**
 * The box a target is looked for in (`MakeFocusRectBall`, seg40:3850;
 * `MakeFocusRect`, seg40:36f5): about the head -- the lines' key ball 0
 * (`+0xd8f`) -- moved toward the way the cat faces by its diagonal over
 * `share`, by the cat's rotation and tilt, by the engine's tables.
 */
export function catzFocusRect(
  placer: CatzPlacer,
  rect: CatzRect,
  pose: CatzPose,
  { width, height, share }: CatzFocus
): CatzRect {
  const head = placer.ballOnStage(rect, pose, skeletonOf(placer.breed).head);
  const [tilt, turn] = [wrapCatzAngle(pose.tilt), wrapCatzAngle(pose.rotation)];
  const ahead = Math.trunc(Math.trunc(Math.sqrt(width * width + height * height)) / share);
  const x = head.x - Math.trunc((cosine(tilt, true) * ahead * sine(turn, true)) / 0x10000);
  const y = head.y - Math.trunc((sine(tilt, true) * ahead) / 0x100);
  const [w, h] = [Math.trunc(width / 2), Math.trunc(height / 2)];

  return { left: x - w, top: y - h, right: x + w, bottom: y + h };
}

/** Whether a point is inside a rectangle, its edges not (`XPointInXRect`, seg48:1272). */
export function catzInside(rect: CatzRect, { x, y }: CatzPoint) {
  return rect.left < x && x < rect.right && rect.top < y && y < rect.bottom;
}

/** The ball a cat is glued by where a script says none: its lines' `[Default Glue Ball]` (`XBallz` `+0x236`). */
export function catzGlueBall(breed: Breed) {
  return Number(breed.sections.get('Default Glue Ball')?.[0]?.values[0] ?? 0);
}
