/**
 * Pictures — the toys, treats and tools of the playpen — drawn as
 * `XPicture::XDrawPicture` (seg8:7041) draws them: every pixel but those
 * of the transparent colour copied over what is there. See
 * kb/topics/drawing-a-dog.md.
 */

import type { Dib } from '../formats/dib.ts';
import type { Colour } from '../formats/palette.ts';
import type { IndexedBitmap } from './raster.ts';

/** The colour a sprite's picture is transparent in: Windows' bright green, index 10, as the sprites pass it. */
export const TRANSPARENT = 10;

/**
 * The picture's colours as indices into the palette drawn with: its own
 * sixteen are the standard Windows ones, and each palette of Dogz's holds
 * them; anything else takes the nearest.
 */
export function mapColours(picture: Dib, palette: readonly Colour[]) {
  return picture.colours.map((colour) => {
    let best = 0;
    let bestDistance = Infinity;

    palette.forEach((candidate, index) => {
      const distance = candidate.reduce((sum, value, n) => sum + (value - colour[n]) ** 2, 0);

      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });

    return best;
  });
}

/** The screen's colour nearest each of the 4,096 colours of four bits a channel (each × 17), by the sum of squares, the first of equals: `XDrawPort::CreateITable` (Catz, seg44:1210), kept by palette. */
const itables = new WeakMap<readonly Colour[], Uint8Array>();

function itableOf(screen: readonly Colour[]) {
  let table = itables.get(screen);

  if (!table) {
    table = new Uint8Array(4096);

    for (let u = 0; u < 4096; u++) {
      const [r, g, b] = [(u & 15) * 17, ((u >> 4) & 15) * 17, ((u >> 8) & 15) * 17];
      let [best, distance] = [0, Infinity];

      screen.forEach(([sr, sg, sb], n) => {
        const d = (sr - r) ** 2 + (sg - g) ** 2 + (sb - b) ** 2;

        if (d < distance) {
          [best, distance] = [n, d];
        }
      });

      table[u] = best;
    }

    itables.set(screen, table);
  }

  return table;
}

/** A colour's index in the screen's palette, as a Catz picture's colours are mapped (`mapColoursCatz`). */
export function catzScreenIndex([r, g, b]: Colour, screen: readonly Colour[]) {
  return itableOf(screen)[((b & 0xf0) << 4) | (g & 0xf0) | ((r & 0xf0) >> 4)];
}

/**
 * A Catz picture's colours as indices into the screen's palette, as
 * `XPicture::InternalLoadPicture` maps them: each colour cut to four bits a
 * channel and through the inverse table (`CreateITable`,
 * `ColorIndexTranslate`, seg44) -- so a grey of (114, 114, 114) comes out
 * as the screen's (117, 117, 117), not a nearer 114 of its own.
 */
export function mapColoursCatz(picture: Dib, screen: readonly Colour[]) {
  const table = itableOf(screen);
  return picture.colours.map(
    ([r, g, b]) => table[((b & 0xf0) << 4) | (g & 0xf0) | ((r & 0xf0) >> 4)]
  );
}

/**
 * Draws a picture with its top left at a point, its transparent colour left
 * out; mirrored, left for right, as `XDrawPicture`'s last argument asks.
 * The transparent colour is the picture's index 10, as Dogz's sixteen
 * colours have bright green, unless another is given (Catz's pictures, of
 * 256 colours, have it at 11).
 */
export function drawPicture(
  bitmap: IndexedBitmap,
  picture: Dib,
  colours: readonly number[],
  left: number,
  top: number,
  mirrored = false,
  transparent = TRANSPARENT
) {
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const from = mirrored ? picture.width - 1 - x : x;
      const index = picture.pixels[y * picture.width + from];

      if (index !== transparent) {
        bitmap.set(left + x, top + y, colours[index]);
      }
    }
  }
}
