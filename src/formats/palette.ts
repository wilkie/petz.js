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

import { type NeModule } from './ne.js';

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
