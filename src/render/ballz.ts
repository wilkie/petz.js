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
import { type Breed } from '../formats/lnz.ts';
import { type Head, type Placed, project, scalesForAge } from './project.ts';
import { drawTaperedLine, fillBall, IndexedBitmap, random, speckleColour } from './raster.ts';

/** Something to draw: a ball, or a line between two balls, at a depth. */
type Mark =
  | { kind: 'ball'; ball: number; depth: number }
  | { kind: 'line'; from: number; to: number; depth: number };

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

  /** The seed of the fuzz and speckles, which Dogz draws at random. */
  seed?: number;

  /** The head turned toward what the dog looks at (`HeadTrackPrep`), if it is. */
  head?: Head;

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

/** Everything to draw for a frame, farthest first. */
export function marks(breed: Breed, placed: Placed[]): Mark[] {
  /* The irises are not drawn with the balls but in their eyes (`drawIris`). */
  const omitted = new Set([...breed.omissions, ...breed.irises]);
  const list: Mark[] = [];

  placed.forEach((ball, index) => {
    if (!omitted.has(index) && ball.diameter > 0) {
      list.push({ kind: 'ball', ball: index, depth: ball.depth });
    }
  });

  for (const line of breed.lines) {
    if (!omitted.has(line.from) && !omitted.has(line.to)) {
      const depth = (placed[line.from].depth + placed[line.to].depth) / 2;
      list.push({ kind: 'line', from: line.from, to: line.to, depth });
    }
  }

  /* Farthest first; at the same depth a line goes under the balls it joins. */
  return list.sort((a, b) => b.depth - a.depth || (a.kind === 'line' ? -1 : 1));
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
  { age = 0, yaw = 0, head }: Pick<DrawOptions, 'age' | 'yaw' | 'head'>
) {
  const placed = project(breed, header, frame, scalesForAge(breed, age), yaw, 100 - age, head);
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
  }: DrawOptions
) {
  const next = random(seed);
  /* How much of a puppy: 100 less the age, as SetBallScaleFromAge asks.
   * Not yet read where it is applied. */
  const placed = project(breed, header, frame, scalesForAge(breed, age), yaw, 100 - age, head);
  const numbers = colours === 256 ? breed.ballColor256 : breed.ballColor16;
  const ramps = RAMPS[colours];
  const at = (ball: number) => ({ x: originX + placed[ball].x, y: originY + placed[ball].y });

  const list = marks(breed, placed);
  const headCount = list.filter(
    (mark) => mark.kind === 'ball' && breed.headBalls.includes(mark.ball)
  ).length;
  let headsDrawn = 0;

  for (const mark of list) {
    if (mark.kind === 'line') {
      /* Each end as thick as its ball's radius × 256 / 300, as
       * DisplayBallzFrame works them out for XDrawLine, not yet read. */
      const width = (ball: number) => ((placed[ball].diameter / 2) * 256) / 300;
      drawTaperedLine(
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

    fillBall(
      bitmap,
      {
        ...at(ball),
        diameter: placed[ball].diameter,
        colour: numbers[ball],
        outlineColour: breed.outlineColor[ball],
        speckleColour: speckleColour(
          numbers[ball],
          breed.speckleColor[ball],
          ramps.first,
          ramps.length
        ),
        outline: breed.outlineType[ball],
        fuzz: breed.fuzz[ball],
      },
      next
    );

    const eye = breed.eyes.indexOf(ball);

    if (overHead && headsDrawn === headCount - 2) {
      overHead();
      overHead = undefined;
    }

    if (bonus?.ball === ball) {
      bonus.draw(at(ball));
    }

    if (eye !== -1) {
      drawIris(bitmap, breed, placed, ball, breed.irises[eye], at, colours, eyes, iris);
    }
  }
}

/** The factor of the iris's radius kept inside the eye: `ds:1d3e` of DOGZDLL.DLL. */
const IRIS_INSET = 0.8;

/** How far the irises move toward where they look each eye drawn: `ds:1d36`. */
const IRIS_STEP = 0.6;

/**
 * Draws an eye's iris and pupil, as `DisplayBallzFrame` does after the eye
 * (seg10:54xx to 573f). Where the iris goes is, by the eye mode, where the
 * frame puts it relative to its eye, the point looked at from the dog's
 * middle, or the eye's centre. The irises share one offset, which moves 0.6
 * pixels toward that on each axis for every eye drawn, and is kept within the
 * eye by the eye's radius less 0.8 of the iris's; the iris is filled flat in
 * the breed's iris colour, and if it is more than 7 pixels across, the pupil,
 * the iris inset 2 pixels each side, in the pupil colour.
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
  eased: DrawOptions['iris']
) {
  const eye = placed[eyeBall];
  const iris = placed[irisBall];
  const limit = eye.diameter / 2 - Math.trunc((iris.diameter / 2) * IRIS_INSET);
  const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
  const mode = eyes?.mode ?? 0;
  const target =
    mode === 1 ? eyes! : mode === 2 ? { x: 0, y: 0 } : { x: iris.x - eye.x, y: iris.y - eye.y };
  let offset = { x: clamp(target.x), y: clamp(target.y) };

  if (eased) {
    const toward = (value: number, goal: number) =>
      Math.trunc(value) < goal ? value + IRIS_STEP : goal < Math.trunc(value) ? value - IRIS_STEP : value;

    eased.x = toward(eased.x, target.x);
    eased.y = toward(eased.y, target.y);
    offset = { x: Math.trunc(eased.x), y: Math.trunc(eased.y) };
    eased.x = clamp(eased.x);
    eased.y = clamp(eased.y);
  }

  const centre = at(eyeBall);
  const x = centre.x + offset.x;
  const y = centre.y + offset.y;
  const irisColour = (colours === 256 ? breed.irisColor256 : breed.irisColor16) ?? 3;
  const pupilColour = breed.pupilColor ?? 0;
  const disc = (diameter: number, colour: number) =>
    fillBall(
      bitmap,
      { x, y, diameter, colour, outlineColour: 0, speckleColour: -1, outline: -1, fuzz: 0 },
      () => 0
    );

  disc(iris.diameter, irisColour);

  if (iris.diameter > 7) {
    disc(iris.diameter - 4, pupilColour);
  }
}
