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
  type CatzHead,
  type Eyelids,
  type Head,
  type Placed,
  project,
  scalesForAge,
} from './project.ts';
import {
  CATZ_TURN,
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
   * Catz's `ColorIndexTranslate` on 256 colours (`catzTranslation`): every
   * colour a ball or line is drawn in goes through it, after a Catz breed's
   * depth shading. Without it, colours are as they are.
   */
  translate?: (colour: number) => number;

  /**
   * How far a Catz cat's eyelids are shut, in hundredths: 20 where its
   * states leave them (`CatSprite::ResetEyelids`, seg14:1d10), 100 in a
   * blink; or each its own (`BallState` `+0x2a`, `+0x2c`). How far each may
   * open and its tilt are `eyelids`'.
   */
  catzLids?: number | { right: number; left: number };

  /** A Catz cat's head turned about its neck. */
  catzHead?: CatzHead;

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

/** Catz's colour ramps on 256 colours: ten of ten from 28 (`XDrawPort::InitStaticDraw`, seg44:0ebe). */
const CATZ_RAMPS = { first: 28, length: 10 };

/**
 * A colour shifted `by` along its ramp, kept within it, as
 * `GenerateZDepthColor` (CATZDLL.DLL seg47:5d04) does; a colour below the
 * ramps as it is.
 */
export function catzShade(colour: number, by: number) {
  const { first, length } = CATZ_RAMPS;

  if (colour < first) {
    return colour;
  }

  const ramp = first + Math.trunc((colour - first) / length) * length;
  return Math.max(ramp, Math.min(ramp + length - 1, colour + by));
}

/**
 * How far each ball's colour is shaded by its depth, as `XBallz::ZOrder`
 * works it out (seg47:579c on): its depth from the middle of the chest and
 * the butt, × 6 in 16 bits, × 2.2, over the depth the frame's balls span --
 * the farthest back of a ball less the nearest front, those omitted left
 * out -- toward 0, and kept within 6 either way. Farther is darker. The
 * engine works it out again only when a ball's depth has moved by more
 * than 10, so a still cat's are as here.
 */
export function depthShades(breed: Breed, placed: Placed[]) {
  const { chest, butt } = skeletonOf(breed);
  const omitted = new Set(breed.omissions);
  const middle =
    chest >= 0 && butt >= 0 ? Math.trunc((placed[chest].depth + placed[butt].depth) / 2) : 0;
  let [near, far] = [Infinity, -Infinity];

  placed.forEach(({ depth, diameter }, ball) => {
    if (!omitted.has(ball)) {
      const radius = Math.trunc(diameter / 2);
      [near, far] = [Math.min(near, depth - radius), Math.max(far, depth + radius)];
    }
  });

  const span = far - near;

  return placed.map(({ depth }) => {
    const sixfold = (((depth - middle) * 6) << 16) >> 16;
    const shift = span > 0 ? Math.trunc((sixfold * 2.2) / span) : 0;
    return Math.max(-6, Math.min(6, shift));
  });
}

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
    translate = (colour: number) => colour,
    catzLids = 20,
    catzHead,
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
    blend,
    { catzHead }
  );
  const numbers = colours === 256 ? breed.ballColor256 : breed.ballColor16;
  const ramps = RAMPS[colours];
  const shades = breed.catz && colours === 256 ? depthShades(breed, placed) : null;
  const shade = (colour: number, by: number) => (shades ? catzShade(colour, by) : colour);

  /* Catz's speckle is the ball's own colour, unshaded, for a ball given
   * speckles in its ramps (`Linez::GenerateSpeckleColors`, seg39:2815, with
   * `[Speckle Map]` as it is unless a breed says); so it shows where the
   * ball is shaded. */
  const speckled = (ball: number) => {
    const file = breed.speckleColor[ball];

    if (shades) {
      const own = numbers[ball];
      const speckle = file >= 0 && own > CATZ_RAMPS.first && own <= 128 ? own : file;
      return speckle < 0 ? speckle : translate(speckle);
    }

    return colours === 256 ? speckleColour(numbers[ball], file, ramps.first, ramps.length) : file;
  };
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
       * its colour its own, or its start's or end's ball's; its left edge
       * the same or its left colour, its right edge the same or, where it
       * has a right colour, its left colour again (`PrepareDrawLine`
       * seg47:7008, `XDrawLine` seg44:70e0). */
      const line = breed.lines[mark.line];
      const [start, end] = line.thickness ?? [90, 90];
      const width = (ball: number, thickness: number) =>
        Math.max(1, Math.trunc((Math.trunc(placed[ball].diameter / 2) * thickness) / 100));
      const own = line.colour ?? -1;
      const chosen = own === -1 ? numbers[mark.from] : own < -1 ? numbers[mark.to] : own;
      /* Shaded by its ends' depths together, halved toward 0 (seg47:724e). */
      const colour = shade(
        chosen,
        shades ? Math.trunc((shades[mark.from] + shades[mark.to]) / 2) : 0
      );
      const left = line.leftColour ?? -1;

      drawLine(
        bitmap,
        at(mark.from),
        at(mark.to),
        width(mark.from, start),
        width(mark.to, end),
        translate(colour),
        /* The right edge the left's colour where the line gives one of its
         * own, the line's otherwise: XDrawLine reads the left's for it (seg44:70e0). */
        {
          left: translate(left >= 0 ? left : colour),
          right: translate((line.rightColour ?? -1) >= 0 && left >= 0 ? left : colour),
        }
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
      /* Catz's ramp by the ball's number: the second for 8 and 32 (seg44:3b83). */
      fillShaded(
        bitmap,
        { ...at(ball), diameter: placed[ball].diameter, fuzz: breed.fuzz[ball] + bristle },
        shades && (ball === 8 || ball === 32) ? SHINE + 8 : SHINE,
        tables,
        shades ? { translate } : undefined
      );
    } else {
      fillBall(
        bitmap,
        {
          ...at(ball),
          diameter: placed[ball].diameter + widened,
          /* Catz shades a ball by its depth (seg47:63da), and translates it. */
          colour: translate(shade(numbers[ball], shades?.[ball] ?? 0)),
          outlineColour: translate(breed.outlineColor[ball]),
          /* Made from the ball's colour only on more than 4 bits a pixel
           * (GenerateSpeckleColors, seg10:21da); on 16 colours the breed's
           * own number is the speckles' colour. */
          speckleColour: speckled(ball),
          catz: !!shades,
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

    if (eye !== -1 && shades) {
      const shut =
        typeof catzLids === 'number' ? catzLids : eye === 1 ? catzLids.left : catzLids.right;
      drawCatzEye(bitmap, breed, placed, eye, at, eyes, translate, tables, shut);

      if (shut > 0) {
        drawLid(bitmap, breed, placed, eye, at, colours, shut, eyesWide, eyelids, translate);
      }
    } else if (eye !== -1) {
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

/** The share of the eye's radius a Catz pupil may not travel: `ds:1e82` of CATZDLL.DLL. */
const CATZ_PUPIL_INSET = 0.63;

/**
 * A Catz eye's pupil, as `XBallz::DrawEyeball` (CATZDLL.DLL seg47:6752)
 * draws it over the eye: no iris -- its colour is set and overwritten
 * before anything is drawn (seg47:69e7) -- but a pupil the first iris's
 * size, 2 in from it each side if it is wider than 7, in the pupil colour.
 * It is put off the eye's centre as the eye's own iris is in the frame, or
 * as the eyes are told to look; brought back to the eye's radius less 0.63
 * of it if farther, and then each way to within a pixel of that; and a
 * pixel left, and no higher than the eyelid lets it be seen.
 */
function drawCatzEye(
  bitmap: IndexedBitmap,
  breed: Breed,
  placed: Placed[],
  eye: number,
  at: (ball: number) => { x: number; y: number },
  eyes: DrawOptions['eyes'],
  translate: (colour: number) => number,
  tables: CircleTables,
  lids: number
) {
  const eyeBall = breed.eyes[eye];
  const irisBall = breed.irises[eye];
  const radius = Math.trunc(placed[eyeBall].diameter / 2);
  const travel = radius - Math.trunc(radius * CATZ_PUPIL_INSET);
  const mode = eyes?.mode ?? 0;
  let dx = placed[irisBall].x - placed[eyeBall].x;
  let dy = placed[irisBall].y - placed[eyeBall].y;

  if (mode === 1) {
    [dx, dy] = [dx + eyes!.x, dy + eyes!.y];
  } else if (mode === 2) {
    [dx, dy] = [0, 0];
  }

  const length = Math.trunc(Math.sqrt(dx * dx + dy * dy));

  if (travel < length) {
    [dx, dy] = [Math.trunc((travel * dx) / length), Math.trunc((travel * dy) / length)];
  }

  const keep = (value: number) => Math.max(1 - travel, Math.min(travel - 1, value));
  const size = placed[breed.irises[0]].diameter;
  const centre = at(eyeBall);
  /* No higher than the eyelid lets it be seen (seg47:6968). */
  const low = Math.trunc((2 * lids * travel) / 100) - travel - 1;

  fillBall(
    bitmap,
    {
      x: centre.x + keep(dx) - 1,
      y: centre.y + Math.max(low, keep(dy)),
      diameter: size > 7 ? size - 4 : size,
      colour: translate(breed.pupilColor ?? 0),
      outlineColour: 0,
      speckleColour: -1,
      outline: -1,
      fuzz: 0,
      catz: true,
    },
    tables
  );
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
  eyelids: Eyelids = LEVEL_LIDS,
  translate?: (colour: number) => number
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
  /* Catz turns by its own 2π (seg47:6d00, `ds:1eb6`), Dogz by its own. */
  const catzBearing = () => -Math.trunc((Math.atan2(nx, ny) * 256) / CATZ_TURN);
  const bearing =
    Math.abs(nx) > 1 || Math.abs(ny) > 1 ? (translate ? catzBearing() : -angle256(nx, ny)) : 0;

  /* Each eye's own tilt, `+0x20` added for the left and `+0x22` taken for the right. */
  const tilt = eye === 1 ? eyelids.left.tilt : -eyelids.right.tilt;
  const angle = wrapAngle(Math.trunc(((bearing + tilt) * open) / 100));
  const ball = placed[breed.eyes[eye]];
  const d = Math.round(ball.diameter + 2 * wide);
  const centre = at(breed.eyes[eye]);

  const colour = (colours === 256 ? breed.eyelidColor256 : breed.eyelidColor16) ?? 4;
  const cover = Math.trunc((d * (100 - open)) / 100);

  /* Catz draws no lid that covers nothing (`XFillCircleEx`, seg44:5671). */
  if (translate && cover < 1) {
    return;
  }

  fillLid(bitmap, {
    x: centre.x,
    y: centre.y,
    d,
    colour: translate ? translate(colour) : colour,
    cover,
    angle,
    ...(translate ? { turn: CATZ_TURN, flip: FIDELITY.bottomUp } : {}),
  });
}
