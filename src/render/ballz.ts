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
import { type Placed, project, scalesForAge } from './project.ts';
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
  { age = 0, yaw = 0 }: Pick<DrawOptions, 'age' | 'yaw'>
) {
  const placed = project(breed, header, frame, scalesForAge(breed, age), yaw, 100 - age);
  return { x: placed[ball].x, y: placed[ball].y };
}

/** Draws the frame into a bitmap of palette indices, as Dogz does. */
export function drawPet(
  bitmap: IndexedBitmap,
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  { colours, originX, originY, age = 0, yaw = 0, seed = 1 }: DrawOptions
) {
  const next = random(seed);
  /* How much of a puppy: 100 less the age, as SetBallScaleFromAge asks.
   * Not yet read where it is applied. */
  const placed = project(breed, header, frame, scalesForAge(breed, age), yaw, 100 - age);
  const numbers = colours === 256 ? breed.ballColor256 : breed.ballColor16;
  const ramps = RAMPS[colours];
  const at = (ball: number) => ({ x: originX + placed[ball].x, y: originY + placed[ball].y });

  for (const mark of marks(breed, placed)) {
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

    if (eye !== -1) {
      drawIris(bitmap, breed, placed, ball, breed.irises[eye], at, colours);
    }
  }
}

/** The factor of the iris's radius kept inside the eye: `ds:1d3e` of DOGZDLL.DLL. */
const IRIS_INSET = 0.8;

/**
 * Draws an eye's iris and pupil, as `DisplayBallzFrame` does after the eye
 * (seg10:54xx to 573f): the iris where the frame puts it relative to its
 * eye, kept within the eye by the eye's radius less 0.8 of the iris's on
 * each axis, filled flat in the breed's iris colour; and if it is more than
 * 7 pixels across, the pupil, the iris inset 2 pixels each side, in the
 * pupil colour. The game eases the iris toward that place 0.6 pixels a frame
 * (`ds:1d36`); a single frame is drawn where it is going.
 */
function drawIris(
  bitmap: IndexedBitmap,
  breed: Breed,
  placed: Placed[],
  eyeBall: number,
  irisBall: number,
  at: (ball: number) => { x: number; y: number },
  colours: 256 | 16
) {
  const eye = placed[eyeBall];
  const iris = placed[irisBall];
  const limit = eye.diameter / 2 - Math.trunc((iris.diameter / 2) * IRIS_INSET);
  const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
  const centre = at(eyeBall);
  const x = centre.x + clamp(iris.x - eye.x);
  const y = centre.y + clamp(iris.y - eye.y);
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
