/**
 * Dogz's own palettes: the 256 colours its breeds' `[256 Ball Color]`
 * numbers index, and the 16 their `[16 Ball Color]` numbers do. Both are
 * resources of `DOGZDLL.DLL` of type 32513, 10256 and 10016, which
 * `XDrawPort::InitStaticDraw` loads (seg8:0dd9 to 0e1e) by how many bits a
 * pixel the display has. See kb/topics/drawing-a-dog.md.
 *
 * Each is RGB triples, three bytes a colour, in a resource padded out to its
 * alignment.
 */

import { type NeModule } from './ne.ts';

/** The resource type, `0x7f01` with its high bit set: DOGZDLL.DLL's palettes'. */
const TYPE = 32513;

/** CATZDLL.DLL's palettes' type, `0x7f03`: its `0x7f01` holds other things. */
export const CATZ_PALETTE_TYPE = 32515;

/** On a display of more than 4 bits a pixel. */
export const PALETTE_256 = 10256;

/** On a display of 4 bits a pixel or fewer. */
export const PALETTE_16 = 10016;

export type Colour = [number, number, number];

/** A palette resource of `DOGZDLL.DLL`, as its first `count` colours. */
export function readPalette(
  module: NeModule,
  id: number,
  count: number,
  type: number = TYPE
): Colour[] {
  const resource = module.resources().find((each) => each.type === type && each.id === id);

  if (!resource) {
    throw new Error(`${module.name} has no palette ${id}`);
  }

  if (resource.data.length < 3 * count) {
    throw new Error(`palette ${id} holds fewer than ${count} colours`);
  }

  return Array.from({ length: count }, (_, index) => [
    resource.data[3 * index],
    resource.data[3 * index + 1],
    resource.data[3 * index + 2],
  ]);
}

export function css([red, green, blue]: Colour) {
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * `XDrawPort::MakeColorRamp` (seg8:1a71): `count` colours from `start`,
 * `from` blended toward `to`, `amount` of the way by the last, each channel
 * clamped at 255 and rounded down.
 */
export function colorRamp(from: Colour, to: Colour, count: number, amount: number): Colour[] {
  const step = (1 / (count - 1)) * amount;
  const ramp: Colour[] = [];

  /* The share added up a colour at a time, as the engine's double is. */
  for (let n = 0, t = 0; n < count; n++, t += step) {
    ramp.push(
      from.map((channel, at) => Math.trunc(Math.min(255, channel * (1 - t) + to[at] * t))) as Colour
    );
  }

  return ramp;
}

/** Where the shine ramps go, eight colours each (`XInitScreenPort`, seg8:16c9 to 1775). */
export const SHINE = 0xa4;

/**
 * Windows' six dark static colours, entries 1 to 6, as the oracle's screen
 * shows them: at 192 a channel where Windows' own table, and Dogz's palette,
 * have 128 — the display driver's, not Dogz's. Dogz takes the screen's
 * static colours as they are for its first ten (seg8:15d2), so an iris of
 * colour 2 is this green.
 */
const DRIVER_DARK: Colour[] = [
  [192, 0, 0],
  [0, 192, 0],
  [192, 192, 0],
  [0, 0, 192],
  [192, 0, 192],
  [0, 192, 192],
];

/**
 * The 256-colour palette as the screen has it: `XDrawPort::XInitScreenPort`
 * overwrites entries 164 to 187 with three ramps of eight — black toward
 * white, white toward a pale blue (`ds:1cba` to `1cc6`), and colour 3 toward
 * that blue — which the nose's shine is drawn from; and the static colours
 * are the display's (`DRIVER_DARK`), or Windows' own without `driverColours`.
 */
export function screenPalette(
  palette: readonly Colour[],
  { driverColours = true }: { driverColours?: boolean } = {}
): Colour[] {
  const blue: Colour = [170, 204, 255];
  const ramps = [
    ...colorRamp([0, 0, 0], [255, 255, 255], 8, 0.7),
    ...colorRamp([255, 255, 255], blue, 8, 0.5),
    ...colorRamp(palette[3], blue, 8, 0.7),
  ];
  return palette.map((colour, n) =>
    n >= SHINE && n < SHINE + ramps.length
      ? ramps[n - SHINE]
      : driverColours && n >= 1 && n <= DRIVER_DARK.length
        ? DRIVER_DARK[n - 1]
        : colour
  );
}

/**
 * The 16 colours as the oracle's Windows VGA driver shows them, after the
 * VGA's six bits a channel: measured, each of a dog's balls given one in
 * turn (`--display vga`). The bright eight are Windows' own; the dark ones
 * and the greys are the driver's.
 */
export const VGA_SHOWN: Colour[] = [
  [0, 0, 0],
  [170, 0, 85],
  [0, 170, 85],
  [170, 170, 85],
  [0, 0, 170],
  [170, 85, 170],
  [85, 170, 170],
  [134, 138, 142],
  [195, 199, 203],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

/** The 16-colour palette as the screen shows it: the oracle's VGA driver's (`VGA_SHOWN`), or Dogz's own without `driverColours`. */
export function screenPalette16(
  palette: readonly Colour[],
  { driverColours = true }: { driverColours?: boolean } = {}
): Colour[] {
  return driverColours ? VGA_SHOWN.map((colour) => [...colour] as Colour) : [...palette];
}

/** Windows' twenty static colours as it reports them: the first ten, then the last. */
const STATIC_FIRST: Colour[] = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [192, 220, 192],
  [166, 202, 240],
];
const STATIC_LAST: Colour[] = [
  [255, 251, 240],
  [160, 160, 164],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

/**
 * Catz's palette with its shine ramps put in, as `XInitScreenPort`
 * (CATZDLL.DLL seg44:1556) copies them back into it: what
 * `ColorIndexTranslate` looks a colour up in.
 */
function catzColours(palette: readonly Colour[]): Colour[] {
  const ramps = screenPalette(palette, { driverColours: false });
  return palette.map((colour, n) => (n >= SHINE && n < SHINE + 24 ? ramps[n] : colour));
}

/**
 * The palette on the screen while Catz runs, on 256 colours: the system's
 * own at 0 to 15 and 246 to 255 -- Windows' statics, and for 10 to 15,
 * which no static fills, a dark grey and black -- and Catz's palette, with its shine
 * ramps, between (`XInitScreenPort`, seg44:1556). `driverColours` shows the
 * dark statics as the oracle's driver does, as for Dogz.
 */
export function catzIdealPalette(
  palette: readonly Colour[],
  { driverColours = true }: { driverColours?: boolean } = {}
): Colour[] {
  const own = catzColours(palette);
  return own.map((colour, n): Colour => {
    if (n < 10) {
      return driverColours && n >= 1 && n <= DRIVER_DARK.length
        ? DRIVER_DARK[n - 1]
        : STATIC_FIRST[n];
    }

    if (n < 16) {
      /* [[inferred]] One of them a dark grey, about (17, 17, 17): the oracle
       * shows the cat's darkest shades as (16, 16, 16), which nothing else
       * here comes near. Which entry, and what the rest are, not yet known. */
      return n === 10 ? [17, 17, 17] : [0, 0, 0];
    }

    return n >= 246 ? STATIC_LAST[n - 246] : colour;
  });
}

/**
 * Catz's `ColorIndexTranslate` (seg44:0000) on 256 colours: a colour
 * number to its colour in Catz's palette, its channels cut to four bits,
 * and through a table of 4096 (`CreateITable`, seg44:1210) to the screen's
 * colour nearest it -- each channel's four bits × 17, the nearest by the
 * sum of squares, the first of equals. Neighbouring shades of a ramp may
 * come out the same.
 */
export function catzTranslation(palette: readonly Colour[]): (colour: number) => number {
  const screen = catzIdealPalette(palette, { driverColours: false });
  const own = catzColours(palette);
  const table = new Uint8Array(4096);

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

  return (colour) => {
    const [r, g, b] = own[colour & 255];
    return table[((b & 0xf0) << 4) | (g & 0xf0) | ((r & 0xf0) >> 4)];
  };
}
