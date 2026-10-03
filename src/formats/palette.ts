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

/** The resource type, `0x7f01` with its high bit set. */
const TYPE = 32513;

/** On a display of more than 4 bits a pixel. */
export const PALETTE_256 = 10256;

/** On a display of 4 bits a pixel or fewer. */
export const PALETTE_16 = 10016;

export type Colour = [number, number, number];

/** A palette resource of `DOGZDLL.DLL`, as its first `count` colours. */
export function readPalette(module: NeModule, id: number, count: number): Colour[] {
  const resource = module.resources().find((each) => each.type === TYPE && each.id === id);

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
 * are the display's (`DRIVER_DARK`).
 */
export function screenPalette(palette: readonly Colour[]): Colour[] {
  const blue: Colour = [170, 204, 255];
  const ramps = [
    ...colorRamp([0, 0, 0], [255, 255, 255], 8, 0.7),
    ...colorRamp([255, 255, 255], blue, 8, 0.5),
    ...colorRamp(palette[3], blue, 8, 0.7),
  ];
  return palette.map((colour, n) =>
    n >= SHINE && n < SHINE + ramps.length
      ? ramps[n - SHINE]
      : n >= 1 && n <= DRIVER_DARK.length
        ? DRIVER_DARK[n - 1]
        : colour
  );
}
