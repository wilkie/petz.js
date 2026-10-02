/**
 * Draws a dog: a breed (`lnz.ts`) in one frame of an animation
 * (`animation.ts`), into palette indices, as Dogz does.
 *
 * Dogz draws its pets as balls -- filled circles, nearest last -- joined by
 * thick lines, in real time. Each ball is placed as `project.ts` places it,
 * and filled as `raster.ts` fills it; what is read out and what is not yet is
 * kb/topics/drawing-a-dog.md.
 */

import { type AnimationHeader, type Frame } from '../formats/animation.js';
import { type Breed } from '../formats/lnz.js';
import { type Placed, project, scalesForAge } from './project.js';
import { drawTaperedLine, fillBall, IndexedBitmap, random, speckleColour } from './raster.js';

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
  const omitted = new Set(breed.omissions);
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

/** Draws the frame into a bitmap of palette indices, as Dogz does. */
export function drawPet(
  bitmap: IndexedBitmap,
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  { colours, originX, originY, age = 0, yaw = 0, seed = 1 }: DrawOptions
) {
  const next = random(seed);
  const placed = project(breed, header, frame, scalesForAge(breed, age), yaw);
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
  }
}
