/**
 * Draws a dog: a breed (`lnz.ts`) in one frame of an animation
 * (`animation.ts`), into palette indices, as Dogz does.
 *
 * Dogz draws its pets as balls -- filled circles, nearest last -- joined by
 * thick lines, in real time. Each ball is placed as `project.ts` places it,
 * and filled as `raster.ts` fills it; what is read out and what is not yet is
 * kb/topics/drawing-a-dog.md.
 */

import { type AnimationHeader, type Frame } from '../formats/animation.ts';
import { SHINE } from '../formats/palette.ts';
import { type Breed } from '../formats/lnz.ts';
import { FIDELITY } from './fidelity.ts';
import { type Skeleton, skeletonOf } from './skeleton.ts';
import {
  type Angles,
  angle256,
  type Blend,
  type Eyelids,
  type Head,
  type Placed,
  project,
  scalesForAge,
} from './project.ts';
import {
  drawLine,
  drawWhisker,
  fillBall,
  fillLid,
  fillShaded,
  IndexedBitmap,
  circleTables,
  type CircleTables,
  speckleColour,
  wrapAngle,
} from './raster.ts';

/** Something to draw: a ball, or a line between two balls, at a depth. */
type Mark =
  | { kind: 'ball'; ball: number; depth: number }
  | { kind: 'line'; line: number; from: number; to: number; depth: number }
  | { kind: 'whisker'; whisker: number; depth: number };

export interface DrawOptions {
  /** Which of the breed's colour sections to draw in. */
  colours: 256 | 16;

  /** Where the dog's origin is drawn, in the bitmap's pixels. */
  originX: number;
  originY: number;

  /** The dog's age, from 0, a puppy, to 100. */
  age?: number;

  /** Which way the dog is turned, in 256ths of a turn. */
  yaw?: number;

  /**
   * The seed of the tables of fuzz and speckles, which Dogz makes at random
   * once (`InitCircleLookup`): the same seed, the same ragged edges.
   */
  seed?: number;

  /** The head turned toward what the dog looks at (`HeadTrackPrep`), if it is. */
  head?: Head;

  /** The dog's tilt, spin and roll. */
  angles?: Angles;

  /** The frame blended from a reference frame, as the dog breathes. */
  blend?: Blend;

  /** How many levels the fur bristles: added to every ball's fuzz (the `BallState`'s `+0x46`). */
  bristle?: number;

  /**
   * The order the balls were drawn in last, which `ZOrder` sorts from and
   * which is kept for the next frame; without, the balls in turn.
   */
  order?: number[];

  /** Whether the tongue shows (`Ballz` `+0x66`, cleared with something in its mouth); it does without. */
  tongue?: boolean;

  /** Each eyelid's height and tilt, as the dog's fudgers have them: 100 and level without. */
  eyelids?: Eyelids;

  /**
   * Where the eyes look (the `BallState`'s `+0x2c` and `+0x28`): 0 as the
   * frame has them, 1 toward a point from the dog's middle, 2 straight out.
   */
  eyes?: { mode: 0 | 1 | 2; x: number; y: number };

  /**
   * The irises' eased offset (`Ballz` `+0x177`, `+0x17b`), kept from one
   * drawing to the next; without it the irises are drawn where they are going.
   */
  iris?: { x: number; y: number };

  /** How far the eyelids are closed, in hundredths (the `BallState`'s `+0x30`); 0 for not at all. */
  lids?: number;

  /** How many pixels wider each side the eyes are drawn (the `BallState`'s `+0x2e`). */
  eyesWide?: number;

  /**
   * Something drawn with a ball, just after it and before the balls nearer
   * (`Ballz::SetBonusDrawProc`, called by `DisplayBallzFrame`, seg10:4d28):
   * what the dog holds. It is given where that ball's centre is drawn.
   */
  bonus?: { ball: number; draw: (centre: { x: number; y: number }) => void };

  /**
   * Something drawn with the dog just before the first of its head balls
   * (`[Head Balls]`), so under the head: the food it eats. `DisplayBallzFrame`
   * calls the ball state's proc at `0x40c` there (seg10:5235), which
   * `DoEating` sets to `FoodSprite::StaticDraw`.
   */
  underHead?: () => void;

  /**
   * And just after all but the last two head balls (the proc at `0x414`,
   * seg10:5334): a bowl's rim, over the muzzle in it (`StaticDrawFront`).
   */
  overHead?: () => void;
}

/**
 * The ramps speckles are reflected in (`Ballz::GenerateSpeckleColors`), as
 * `XDrawPort::InitStaticDraw` sets them: 6 colours from 16 on the 256-colour
 * display; on the 16-colour one, a ramp is a colour.
 */
const RAMPS = { 256: { first: 16, length: 6 }, 16: { first: 0, length: 1 } } as const;

/** How much nearer a ball must be than the one before it to be drawn after it (`ZOrder`'s tolerance, seg10:4dee). */
const Z_TOLERANCE = 4;

/** The jaw, chin and tongue, in the order they are drawn with the tongue out (`ds:1d16`): Dogz's 53, 51, 63 and 64. */
const mouthOf = (skeleton: Skeleton) =>
  [skeleton.jaw, skeleton.chin, ...skeleton.tongue].filter((ball) => ball >= 0);

/**
 * The order the balls are drawn in, as `Ballz::ZOrder` (seg10:48ad) keeps
 * it: from the order before (each ball in turn, at first), a ball moved
 * before the one ahead of it only if farther than it by more than 4, so
 * balls about as far apart keep their places; then an eye nearer than the
 * head drawn after it, if it was not; and, with the tongue out, the jaw,
 * chin and tongue in that order.
 */
export function drawOrder(breed: Breed, placed: Placed[], before?: number[], tongueOut = true) {
  const order = before?.length === placed.length ? [...before] : placed.map((_, index) => index);
  const z = (ball: number) => placed[ball]?.depth ?? 0;

  if (FIDELITY.partialSort) {
    for (let i = 0; i < order.length; i++) {
      for (let j = 1; j <= i; j++) {
        if (z(order[j]) - z(order[j - 1]) > Z_TOLERANCE) {
          [order[j], order[j - 1]] = [order[j - 1], order[j]];
        }
      }
    }
  } else {
    /* Farther first, each frame afresh; balls as far apart in the skeleton's order. */
    order.sort((a, b) => z(b) - z(a) || a - b);
  }

  const swap = (a: number, b: number) => {
    const [at, bt] = [order.indexOf(a), order.indexOf(b)];
    [order[at], order[bt]] = [b, a];
  };
  const skeleton = skeletonOf(breed);
  const head = skeleton.head;

  /* The left eye (`+0x365`), then the right (`+0x363`). */
  for (const eye of [breed.eyes[1], breed.eyes[0]]) {
    if (head !== undefined && z(eye) < z(head) && order.indexOf(eye) < order.indexOf(head)) {
      swap(eye, head);
    }
  }

  const mouth = mouthOf(skeleton);

  if (tongueOut) {
    for (let i = 0; i < mouth.length; i++) {
      for (let j = 0; j < i; j++) {
        if (order.indexOf(mouth[j + 1]) < order.indexOf(mouth[j])) {
          swap(mouth[j], mouth[j + 1]);
        }
      }
    }
  }

  return order;
}

/**
 * The toe the dog holds things by (`GrabObject`, seg14:06d7, the other way
 * than in its mouth), never drawn itself: the pet module omits it as it
 * makes the dog (`InitPetModule`, seg21:0fb9) and again whenever it reloads
 * its lines, grabs or plays with a ball, whatever the breed's `[Omissions]`.
 */
export const HOLDING_TOE = 45;

/**
 * Everything to draw for a frame, in `DisplayBallzFrame`'s order (seg10:4e12
 * on): each ball in the draw order, after the lines it joins that are not
 * drawn yet — each line kept with both its balls, the end's first, up to
 * four a ball (`LoadSpecialBallInfo`, seg10:1f96) — so a line goes under the
 * first of its balls drawn. The irises are drawn in their eyes, and the
 * tongue, and lines to it, only when it is out; a ball omitted — or the
 * holding toe — is not drawn, but its lines are.
 *
 * Catz (`XBallz::DisplayBallzFrame`, CATZDLL.DLL seg47:5e0b) draws a ball's
 * whiskers just after it, and never the ball a whisker ends at; and a line
 * to the tongue put away is passed over, not the end of the ball's lines.
 */
export function marks(breed: Breed, placed: Placed[], order: number[], tongueOut = true): Mark[] {
  const skeleton = skeletonOf(breed);
  const whiskers = breed.whiskers ?? [];
  const catz = !!breed.catz;
  const omitted = new Set([
    ...breed.omissions,
    skeleton.holdingToe,
    ...whiskers.map((whisker) => whisker.to),
  ]);
  const irises = new Set(breed.irises);
  const tongue = new Set(skeleton.tongue.filter((ball) => ball >= 0));
  const lines = new Map<number, number[]>();

  breed.lines.forEach((line, n) => {
    for (const ball of [line.to, line.from]) {
      lines.set(ball, [...(lines.get(ball) ?? []), n].slice(0, 4));
    }
  });

  const drawn = new Set<number>();
  const list: Mark[] = [];

  for (const ball of order) {
    if ((!tongueOut && tongue.has(ball)) || irises.has(ball)) {
      continue;
    }

    for (const n of lines.get(ball) ?? []) {
      if (drawn.has(n)) {
        continue;
      }

      const { from, to } = breed.lines[n];

      /* A line to the tongue, put away, ends the ball's lines (seg10:4fc7);
       * in Catz it is only not drawn (seg47:61a0). */
      if (!tongueOut && (tongue.has(from) || tongue.has(to))) {
        if (catz) {
          drawn.add(n);
          continue;
        }

        break;
      }

      drawn.add(n);
      list.push({ kind: 'line', line: n, from, to, depth: placed[ball].depth });
    }

    if (!omitted.has(ball) && placed[ball].diameter > 0) {
      list.push({ kind: 'ball', ball, depth: placed[ball].depth });
      whiskers.forEach((whisker, n) => {
        if (whisker.from === ball) {
          list.push({ kind: 'whisker', whisker: n, depth: placed[ball].depth });
        }
      });
    }
  }

  return list;
}

/**
 * Where a ball of a frame is drawn, relative to the dog's origin: what a
 * player needs to keep a glued ball in place from one frame to the next.
 */
export function ballAt(
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  ball: number,
  {
    age = 0,
    yaw = 0,
    head,
    angles,
    blend,
  }: Pick<DrawOptions, 'age' | 'yaw' | 'head' | 'angles' | 'blend'>
) {
  const placed = project(
    breed,
    header,
    frame,
    scalesForAge(breed, age),
    yaw,
    100 - age,
    head,
    angles,
    blend
  );
  return { x: placed[ball].x, y: placed[ball].y };
}

/** Draws the frame into a bitmap of palette indices, as Dogz does. */
export function drawPet(
  bitmap: IndexedBitmap,
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  {
    colours,
    originX,
    originY,
    age = 0,
    yaw = 0,
    seed = 1,
    bonus,
    underHead,
    overHead,
    head,
    eyes,
    iris,
    lids = 0,
    eyesWide = 0,
    angles,
    eyelids,
    blend,
    bristle = 0,
    order,
    tongue = true,
  }: DrawOptions
) {
  const tables = circleTables(seed);
  /* How much of a puppy: 100 less the age, as SetBallScaleFromAge asks.
   * Not yet read where it is applied. */
  const placed = project(
    breed,
    header,
    frame,
    scalesForAge(breed, age),
    yaw,
    100 - age,
    head,
    angles,
    blend
  );
  const numbers = colours === 256 ? breed.ballColor256 : breed.ballColor16;
  const ramps = RAMPS[colours];
  const at = (ball: number) => ({ x: originX + placed[ball].x, y: originY + placed[ball].y });

  const tongueOut = tongue;
  const ballOrder = drawOrder(breed, placed, order, tongueOut);

  if (order) {
    order.splice(0, order.length, ...ballOrder);
  }

  const shiny = shinyOf(skeletonOf(breed));
  const list = marks(breed, placed, ballOrder, tongueOut);
  const headCount = list.filter(
    (mark) => mark.kind === 'ball' && breed.headBalls.includes(mark.ball)
  ).length;
  let headsDrawn = 0;

  for (const mark of list) {
    if (mark.kind === 'whisker') {
      /* In its own palette colour, from its ball's centre (seg47:64e7). */
      const { from, to, colour } = breed.whiskers![mark.whisker];
      drawWhisker(bitmap, at(from), at(to), colour, Math.trunc(placed[from].diameter / 2));
      continue;
    }

    if (mark.kind === 'line' && breed.catz) {
      /* Each end its ball's radius × the line's thickness / 100, at least 1;
       * its colour its own, or its start's or end's ball's; its edges the
       * same, or its left's -- the right's never, as the engine reads the
       * left's for both (`PrepareDrawLine` seg47:7008, `XDrawLine` seg44:70e0). */
      const line = breed.lines[mark.line];
      const [start, end] = line.thickness ?? [90, 90];
      const width = (ball: number, thickness: number) =>
        Math.max(1, Math.trunc((Math.trunc(placed[ball].diameter / 2) * thickness) / 100));
      const own = line.colour ?? -1;
      const colour = own === -1 ? numbers[mark.from] : own < -1 ? numbers[mark.to] : own;
      const left = line.leftColour ?? -1;

      drawLine(
        bitmap,
        at(mark.from),
        at(mark.to),
        width(mark.from, start),
        width(mark.to, end),
        colour,
        { edges: left >= 0 ? left : colour }
      );
      continue;
    }

    if (mark.kind === 'line') {
      /* Each end its ball's radius × 256 / 300 out either side, in the
       * first ball's colour; the line's fuzz XDrawLine leaves unused
       * (DisplayBallzFrame, seg10:50a4 to 5134). */
      const width = (ball: number) => Math.trunc(((placed[ball].diameter / 2) * 256) / 300);

      if (width(mark.from) === 0 || width(mark.to) === 0) {
        continue;
      }

      drawLine(
        bitmap,
        at(mark.from),
        at(mark.to),
        width(mark.from),
        width(mark.to),
        numbers[mark.from]
      );
      continue;
    }

    const { ball } = mark;

    const head = breed.headBalls.includes(ball);

    if (head) {
      headsDrawn++;
    }

    if (underHead && head) {
      underHead();
      underHead = undefined;
    }

    /* The eyes widened, looking at the user (`XInsetRect` by -n, seg10:51aa). */
    const widened = breed.eyes.includes(ball) ? 2 * eyesWide : 0;

    if (colours === 256 && shiny.includes(ball)) {
      /* The nose and nostrils shine (mode -4, seg10:523d). */
      fillShaded(
        bitmap,
        { ...at(ball), diameter: placed[ball].diameter, fuzz: breed.fuzz[ball] + bristle },
        SHINE,
        tables
      );
    } else {
      fillBall(
        bitmap,
        {
          ...at(ball),
          diameter: placed[ball].diameter + widened,
          colour: numbers[ball],
          outlineColour: breed.outlineColor[ball],
          /* Made from the ball's colour only on more than 4 bits a pixel
           * (GenerateSpeckleColors, seg10:21da); on 16 colours the breed's
           * own number is the speckles' colour. */
          speckleColour:
            colours === 256
              ? speckleColour(numbers[ball], breed.speckleColor[ball], ramps.first, ramps.length)
              : breed.speckleColor[ball],
          outline: breed.outlineType[ball],
          fuzz: breed.fuzz[ball] + bristle,
        },
        tables
      );
    }

    const eye = breed.eyes.indexOf(ball);

    if (overHead && headsDrawn === headCount - 2) {
      overHead();
      overHead = undefined;
    }

    if (bonus?.ball === ball) {
      bonus.draw(at(ball));
    }

    if (eye !== -1) {
      drawIris(bitmap, breed, placed, ball, breed.irises[eye], at, colours, eyes, iris, tables);

      if (lids > 0) {
        drawLid(bitmap, breed, placed, eye, at, colours, lids, eyesWide, eyelids);
      }
    }
  }
}

/** The share of the eye's radius the iris's offset may not use: `ds:1d3e` of DOGZDLL.DLL. */
const IRIS_INSET = 0.8;

/** How far the irises move toward where they look each eye drawn: `ds:1d36`. */
const IRIS_STEP = 0.6;

/**
 * Draws an eye's iris and pupil, as `DisplayBallzFrame` does after the eye
 * (seg10:54xx to 573f). Where the iris goes is, by the eye mode, where the
 * frame puts it relative to its eye, the point looked at from the dog's
 * middle, or the eye's centre. The irises share one offset, which moves 0.6
 * pixels toward that on each axis for every eye drawn, and is kept within the
 * eye's radius less 0.8 of the eye's radius again (seg10:5537 — not the
 * iris's), a couple of pixels; the iris's square is the first iris's size,
 * whichever eye (`+0x367`), set a pixel left of the eye's centre plus the
 * offset (seg10:565d); the iris is filled flat in
 * the breed's iris colour, and if it is more than 7 pixels across, the pupil,
 * the iris inset 2 pixels each side, in the pupil colour. Both go through the
 * kernel as a ball without speckles does: its speckle spot from the circle
 * tables, in its own colour, which shows only one past a row's end (the
 * kernel takes a speckle colour below 0 for the ball's, seg8:3555).
 */
function drawIris(
  bitmap: IndexedBitmap,
  breed: Breed,
  placed: Placed[],
  eyeBall: number,
  irisBall: number,
  at: (ball: number) => { x: number; y: number },
  colours: 256 | 16,
  eyes: DrawOptions['eyes'],
  eased: DrawOptions['iris'],
  tables: CircleTables
) {
  const eye = placed[eyeBall];
  const iris = placed[irisBall];
  /* By the eye's radius as the engine has it, or the iris's, as meant. */
  const radius = eye.diameter / 2;
  const limit =
    radius - Math.trunc((FIDELITY.irisAsDrawn ? radius : iris.diameter / 2) * IRIS_INSET);
  const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
  const mode = eyes?.mode ?? 0;
  const target =
    mode === 1 ? eyes! : mode === 2 ? { x: 0, y: 0 } : { x: iris.x - eye.x, y: iris.y - eye.y };
  let offset = { x: clamp(target.x), y: clamp(target.y) };

  if (eased) {
    const toward = (value: number, goal: number) =>
      Math.trunc(value) < goal
        ? value + IRIS_STEP
        : goal < Math.trunc(value)
          ? value - IRIS_STEP
          : value;

    eased.x = toward(eased.x, target.x);
    eased.y = toward(eased.y, target.y);
    offset = { x: Math.trunc(eased.x), y: Math.trunc(eased.y) };
    eased.x = clamp(eased.x);
    eased.y = clamp(eased.y);
  }

  const centre = at(eyeBall);
  const x = centre.x + offset.x - (FIDELITY.irisAsDrawn ? 1 : 0);
  const y = centre.y + offset.y;
  const irisColour = (colours === 256 ? breed.irisColor256 : breed.irisColor16) ?? 3;
  const pupilColour = breed.pupilColor ?? 0;
  /* Through the kernel as any ball, its speckle in its own colour (seg10:56b6 on). */
  const disc = (diameter: number, colour: number) =>
    fillBall(
      bitmap,
      {
        x,
        y,
        diameter,
        colour,
        outlineColour: 0,
        speckleColour: -1,
        outline: -1,
        fuzz: 0,
      },
      tables
    );

  const size = FIDELITY.irisAsDrawn
    ? (placed[breed.irises[0]]?.diameter ?? iris.diameter)
    : iris.diameter;
  disc(size, irisColour);

  if (size > 7) {
    disc(size - 4, pupilColour);
  }
}

/**
 * The balls drawn shining, shaded down the screen's first shine ramp: the
 * left nostril, the right and the nose (`DisplayBallzFrame`, seg10:523d;
 * Dogz's 17, 41 and 55). On a 16-colour display there is no ramp; they are
 * drawn as any other.
 */
const shinyOf = (skeleton: Skeleton) =>
  [...skeleton.nostrils, skeleton.nose].filter((ball) => ball >= 0);

/** Eyelids as the dog starts: each 100 high and level. */
const LEVEL_LIDS: Eyelids = { left: { height: 100, tilt: 0 }, right: { height: 100, tilt: 0 } };

/**
 * Draws an eyelid over an eye, as `DisplayBallzFrame` does after its iris
 * (seg10:5746 to 5b60): closed by `lids` in hundredths, it covers that share
 * of the eye's height in the breed's eyelid colour (`XFillPartialCircleRotate`),
 * its edge slanted by the nose's bearing from between the eyes, less as the
 * lids open. The engine works out the slant of the line between the eyes too,
 * and a blend of the two, but draws by the nose's alone.
 */
function drawLid(
  bitmap: IndexedBitmap,
  breed: Breed,
  placed: Placed[],
  eye: number,
  at: (ball: number) => { x: number; y: number },
  colours: 256 | 16,
  lids: number,
  wide: number,
  eyelids: Eyelids = LEVEL_LIDS
) {
  const [right, left] = breed.eyes.map((ball) => placed[ball]);
  /* The nose, which the eyelids slant by: Dogz's ball 55 (`+0x676` of the placed balls). */
  const nose = placed[skeletonOf(breed).nose];

  if (!right || !left || !nose) {
    return;
  }

  /* The share left open, by the eye's height (`+0x24` the left's, `+0x26` the right's). */
  const own = eye === 1 ? eyelids.left : eyelids.right;
  const open = Math.min(100, Math.trunc((own.height * (100 - lids)) / 100));
  const between = { x: Math.trunc((right.x - left.x) / 2), y: Math.trunc((right.y - left.y) / 2) };
  const nx = Math.trunc(nose.x) - (Math.trunc(left.x) + between.x);
  const ny = Math.trunc(nose.y) - (Math.trunc(left.y) + between.y);
  const bearing = Math.abs(nx) > 1 || Math.abs(ny) > 1 ? -angle256(nx, ny) : 0;

  /* Each eye's own tilt, `+0x20` added for the left and `+0x22` taken for the right. */
  const tilt = eye === 1 ? eyelids.left.tilt : -eyelids.right.tilt;
  const angle = wrapAngle(Math.trunc(((bearing + tilt) * open) / 100));
  const ball = placed[breed.eyes[eye]];
  const d = Math.round(ball.diameter + 2 * wide);
  const centre = at(breed.eyes[eye]);

  fillLid(bitmap, {
    x: centre.x,
    y: centre.y,
    d,
    colour: (colours === 256 ? breed.eyelidColor256 : breed.eyelidColor16) ?? 4,
    cover: Math.trunc((d * (100 - open)) / 100),
    angle,
  });
}
