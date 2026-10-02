import { parseNe } from '../../src/formats/ne.ts';
import { readPalette } from '../../src/formats/palette.ts';

/**
 * A small NE library built byte by byte: one code segment with two
 * relocations -- an import by ordinal chained through two places, and a call
 * to its own entry -- one export with a name, and one resource.
 */
function library() {
  const data = new Uint8Array(0x400);
  const view = new DataView(data.buffer);
  const word = (at: number, value: number) => view.setUint16(at, value, true);
  const text = (at: number, value: string) => {
    data[at] = value.length;
    data.set(new TextEncoder().encode(value), at + 1);
    return at + 1 + value.length;
  };

  word(0, 0x5a4d);
  view.setUint32(0x3c, 0x40, true);

  const ne = 0x40;
  word(ne, 0x454e);
  word(ne + 0x1c, 1); // segments
  word(ne + 0x1e, 1); // module references
  word(ne + 0x32, 0); // alignment shift

  // Segment table at +0x40: the code segment at 0x200, 16 bytes, with relocations.
  word(ne + 0x22, 0x40);
  word(ne + 0x40, 0x200);
  word(ne + 0x42, 16);
  word(ne + 0x44, 0x100);

  // Resource table at +0x48: shift 0, one type 0x8010 holding one id 0x8007.
  word(ne + 0x24, 0x48);
  word(ne + 0x48, 0);
  word(ne + 0x4a, 0x8010);
  word(ne + 0x4c, 1);
  word(ne + 0x52, 0x300);
  word(ne + 0x54, 6);
  word(ne + 0x58, 0x8007);
  word(ne + 0x5e, 0);
  data.set([1, 2, 3, 4, 5, 6], 0x300);

  // Resident names at +0x60: the module's name, then an export.
  word(ne + 0x26, 0x60);
  let at = text(ne + 0x60, 'TINY');
  word(at, 0);
  at = text(at + 2, 'HELLO');
  word(at, 1);
  data[at + 2] = 0;

  // Module references at +0x80, imported names at +0x84.
  word(ne + 0x28, 0x80);
  word(ne + 0x80, 1);
  word(ne + 0x2a, 0x84);
  text(ne + 0x85, 'KERNEL');

  // Entry table at +0x90: one fixed entry in segment 1 at 0x0004.
  word(ne + 0x04, 0x90);
  word(ne + 0x06, 5);
  data.set([1, 1, 1, 0x04, 0x00], ne + 0x90);
  word(ne + 0x2c, 0); // no non-resident names

  // The code: a chain at 2 -> 8 -> end, and a far pointer at 12.
  word(0x200 + 2, 8);
  word(0x200 + 8, 0xffff);
  word(0x200 + 12, 0xffff);
  word(0x210, 2);
  data.set([3, 1, 2, 0, 1, 0, 0x29, 0], 0x212); // far pointer, by ordinal: KERNEL.41 at 2
  data.set([3, 0, 12, 0, 1, 0, 4, 0], 0x21a); // far pointer, internal: 1:0004 at 12

  return data;
}

describe('an NE library', () => {
  const module = parseNe(library());

  it('names itself and its exports', () => {
    expect(module.name).toBe('TINY');
    expect(module.entries).toEqual([{ ordinal: 1, segment: 1, offset: 4, name: 'HELLO' }]);
    expect(module.imports).toEqual(['KERNEL']);
  });

  it('follows a relocation through every place it patches', () => {
    expect(module.relocations(1)).toEqual([
      { offset: 2, source: 3, target: { kind: 'ordinal', module: 'KERNEL', ordinal: 41 } },
      { offset: 8, source: 3, target: { kind: 'ordinal', module: 'KERNEL', ordinal: 41 } },
      { offset: 12, source: 3, target: { kind: 'internal', segment: 1, offset: 4 } },
    ]);
  });

  it('finds its resources, with their bytes', () => {
    const [resource] = module.resources();

    expect(resource.type).toBe(0x10);
    expect(resource.id).toBe(7);
    expect([...resource.data]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('refuses what is not an NE file', () => {
    expect(() => parseNe(new Uint8Array(0x100))).toThrow(/not an MZ/);
  });
});

describe('a palette resource', () => {
  it('is RGB triples', () => {
    const fake = { ...parseNe(library()), name: 'TINY' };
    fake.resources = () => [{ type: 32513, id: 10016, data: new Uint8Array([1, 2, 3, 4, 5, 6]) }];

    expect(readPalette(fake, 10016, 2)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(() => readPalette(fake, 10016, 3)).toThrow(/fewer than 3/);
    expect(() => readPalette(fake, 10256, 1)).toThrow(/no palette 10256/);
  });
});
