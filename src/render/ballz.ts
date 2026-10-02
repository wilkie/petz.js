/**
 * Draws a dog: a breed (`lnz.ts`) in one frame of an animation
 * (`animation.ts`), as the 16-colour display shows it.
 *
 * Dogz draws its pets as balls -- filled circles, nearest last -- joined by
 * thick lines, in real time. What is known and what is guessed here is
 * kb/topics/drawing-a-dog.md: the frame's positions, the balls' sizes, the
 * lines and the 16 colours are read out of the files; how sizes and
 * positions are scaled, and the shading, are not yet known and are kept
 * simple.
 */

import { type AnimationHeader, type Frame } from '../formats/animation.js';
import { type Breed } from '../formats/lnz.js';

/**
 * The 16 colours of `[16 Ball Color]` and `[Outline Color]`, as the oracle's
 * 16-colour display draws them (kb/topics/drawing-a-dog.md). The breed files'
 * comments name them "0blk, 1dkRed, 2dkGrn, 3dkYel, 4dkBlu, 5dkMag, 6dkCyan,
 * 7dkGry, 8ltGry, 9Rd, 10Grn, 11Yel, 12Blu, 13Mag, 14Cyan, 15White", and
 * every breed drawn on the oracle agrees: colour 7 is the dark grey. The dark
 * colours are mixes of 170 and 85 there rather than Windows' 128s; the light
 * grey, 8, is the one no breed uses, and is Windows' button face. Colours no
 * breed uses -- 5, 8, 12, 13, 14 -- are placed by elimination, not seen on a
 * dog.
 */
export const SIXTEEN_COLOURS = [
  '#000000',
  '#aa0055',
  '#00aa55',
  '#aaaa55',
  '#0000aa',
  '#aa55aa',
  '#55aaaa',
  '#868a8e',
  '#c3c7cb',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
];

/** Something to draw: a ball, or a line between two balls, at a depth. */
type Mark =
  | { kind: 'ball'; ball: number; depth: number }
  | { kind: 'line'; from: number; to: number; depth: number };

export interface DrawOptions {
  /** Pixels for one unit of the frame's coordinates. */
  scale: number;

  /** Where the frame's origin is drawn. */
  originX: number;
  originY: number;
}

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

/** Draws the frame onto a 2D canvas context. */
export function drawPet(
  context: CanvasRenderingContext2D,
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  { scale, originX, originY }: DrawOptions
) {
  const diameters = ballDiameters(breed, header);
  const at = (ball: number) => ({
    x: originX + frame.balls[ball].x * scale,
    y: originY + frame.balls[ball].y * scale,
  });
  const colour = (ball: number) => SIXTEEN_COLOURS[breed.ballColor16[ball] & 15];

  for (const mark of marks(breed, header, frame)) {
    if (mark.kind === 'line') {
      const from = at(mark.from);
      const to = at(mark.to);

      context.strokeStyle = colour(mark.from);
      context.lineCap = 'round';
      context.lineWidth = (Math.min(diameters[mark.from], diameters[mark.to]) * scale) / 2;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      continue;
    }

    const { ball } = mark;
    const centre = at(ball);
    const radius = (diameters[ball] * scale) / 2;
    const outline = breed.outlineType[ball];

    context.fillStyle = colour(ball);
    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    context.fill();

    if (outline >= 0) {
      context.strokeStyle = SIXTEEN_COLOURS[breed.outlineColor[ball] & 15];
      context.lineWidth = Math.max(1, outline);
      context.beginPath();

      // A half outline is drawn round the lower half only. Not yet measured.
      if (outline === 0) {
        context.arc(centre.x, centre.y, radius, 0, Math.PI);
      } else {
        context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      }

      context.stroke();
    }
  }
}
