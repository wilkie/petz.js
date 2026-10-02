/**
 * Windows device-independent bitmaps, as DOGZDLL.DLL holds its pictures:
 * bitmap resources (type 2), each a `BITMAPINFOHEADER`, a colour table of
 * blue, green, red and a spare byte, and rows of pixels from the bottom up,
 * each padded to four bytes. Only the 4- and 8-bit kinds, which are all
 * Dogz has. See kb/files/dogzdll-dll.md.
 */

import type { Colour } from './palette.ts';

export interface Dib {
  width: number;
  height: number;

  /** The bitmap's own colours, red, green, blue. */
  colours: Colour[];

  /** Each pixel's index into `colours`, row by row from the top. */
  pixels: Uint8Array;
}

export function parseDib(data: Uint8Array): Dib {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const height = view.getInt32(8, true);
  const bits = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  const used = view.getUint32(32, true);

  if ((bits !== 4 && bits !== 8) || compression !== 0) {
    throw new Error(`unsupported bitmap: ${bits} bits, compression ${compression}`);
  }

  const count = used || 1 << bits;
  const colours = Array.from({ length: count }, (_, n): Colour => {
    const at = headerSize + 4 * n;
    return [data[at + 2], data[at + 1], data[at]];
  });

  const start = headerSize + 4 * count;
  const stride = Math.ceil((width * bits) / 32) * 4;
  const pixels = new Uint8Array(width * Math.abs(height));

  for (let y = 0; y < Math.abs(height); y++) {
    /* A positive height is stored bottom up. */
    const row = start + stride * (height > 0 ? height - 1 - y : y);

    for (let x = 0; x < width; x++) {
      pixels[y * width + x] =
        bits === 8 ? data[row + x] : (data[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 0x0f;
    }
  }

  return { width, height: Math.abs(height), colours, pixels };
}
