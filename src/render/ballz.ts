/**
 * Draws a dog: a breed (`lnz.ts`) in one frame of an animation
 * (`animation.ts`), as the 16-colour display shows it.
 *
 * Dogz draws its pets as balls -- filled circles, nearest last -- joined by
 * thick lines, in real time, in palette indices. What is known and what is guessed here is
 * kb/topics/drawing-a-dog.md: the frame's positions, the balls' sizes, the
 * lines and the palettes are read out of the files, and each ball is filled
 * as `XFillPartialCircleKernel` fills it (`raster.ts`); how sizes and
 * positions are scaled, and how lines are drawn, are not yet known.
 */

import { type AnimationHeader, type Frame } from '../formats/animation.js';
import { type Breed } from '../formats/lnz.js';
import { drawLine, fillBall, IndexedBitmap, random, speckleColour } from './raster.js';

/** Something to draw: a ball, or a line between two balls, at a depth. */
type Mark =
  | { kind: 'ball'; ball: number; depth: number }
  | { kind: 'line'; from: number; to: number; depth: number };

export interface DrawOptions {
  /** Which of the breed's colour sections to draw in. */
  colours: 256 | 16;

  /** Frame units to a pixel: a frame's coordinates are multiplied by it. Not yet measured. */
  scale: number;

  /** Where the frame's origin is drawn, in the bitmap's pixels. */
  originX: number;
  originY: number;

  /** The seed of the fuzz and speckles, which Dogz draws at random. */
  seed?: number;
}

/**
 * The ramps speckles are reflected in (`Ballz::GenerateSpeckleColors`), as
 * `XDrawPort::InitStaticDraw` sets them: 6 colours from 16 on the 256-colour
 * display; on the 16-colour one, a ramp is a colour.
 */
const RAMPS = { 256: { first: 16, length: 6 }, 16: { first: 0, length: 1 } } as const;

/** Each ball's drawn diameter in frame units: the skeleton's size and the breed's difference. */
export function ballDiameters(breed: Breed, header: AnimationHeader) {
  return header.ballSizes.map((size, ball) => Math.max(0, size + breed.ballSizeDiffs[ball]));
}

/**
 * Everything to draw for a frame, farthest first. A larger z is farther from
 * the viewer: drawn that way, frame 0 of animation 0 shows the dog's face.
 */
export function marks(breed: Breed, header: AnimationHeader, frame: Frame): Mark[] {
  const omitted = new Set(breed.omissions);
  const diameters = ballDiameters(breed, header);
  const list: Mark[] = [];

  frame.balls.forEach((position, ball) => {
    if (!omitted.has(ball) && diameters[ball] > 0) {
      list.push({ kind: 'ball', ball, depth: position.z });
    }
  });

  for (const line of breed.lines) {
    if (omitted.has(line.from) || omitted.has(line.to)) {
      continue;
    }

    const depth = (frame.balls[line.from].z + frame.balls[line.to].z) / 2;
    list.push({ kind: 'line', from: line.from, to: line.to, depth });
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
  { colours, scale, originX, originY, seed = 1 }: DrawOptions
) {
  const next = random(seed);
  const diameters = ballDiameters(breed, header);
  const numbers = colours === 256 ? breed.ballColor256 : breed.ballColor16;
  const ramps = RAMPS[colours];
  const at = (ball: number) => ({
    x: originX + frame.balls[ball].x * scale,
    y: originY + frame.balls[ball].y * scale,
  });

  for (const mark of marks(breed, header, frame)) {
    if (mark.kind === 'line') {
      // Lines are drawn by XDrawPort::XDrawLine, not yet read: as thick as
      // half the smaller end, in the first ball's colour.
      drawLine(
        bitmap,
        at(mark.from),
        at(mark.to),
        (Math.min(diameters[mark.from], diameters[mark.to]) * scale) / 2,
        numbers[mark.from]
      );
      continue;
    }

    const { ball } = mark;
    const centre = at(ball);

    fillBall(
      bitmap,
      {
        x: centre.x,
        y: centre.y,
        diameter: diameters[ball] * scale,
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
