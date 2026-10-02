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

/** Draws a picture with its top left at a point, its transparent colour left out. */
export function drawPicture(
  bitmap: IndexedBitmap,
  picture: Dib,
  colours: readonly number[],
  left: number,
  top: number
) {
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const index = picture.pixels[y * picture.width + x];

      if (index !== TRANSPARENT) {
        bitmap.set(left + x, top + y, colours[index]);
      }
    }
  }
}
