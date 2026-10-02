import { parseDib } from '../../src/formats/dib.ts';

/** A 4-bit bitmap, 3 by 2, as Windows lays one out: bottom row first, rows padded to four bytes. */
function bitmap() {
  const header = new Uint8Array(40);
  const view = new DataView(header.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, 3, true);
  view.setInt32(8, 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 4, true);

  const colours = new Uint8Array(16 * 4);
  colours.set([0x30, 0x20, 0x10, 0], 4 * 1);
  colours.set([0, 0xff, 0, 0], 4 * 10);

  const rows = new Uint8Array([0xaa, 0x10, 0, 0, 0x1a, 0xa0, 0, 0]);
  return new Uint8Array([...header, ...colours, ...rows]);
}

describe('a device-independent bitmap', () => {
  it('reads its colours red first, and its rows from the top', () => {
    const dib = parseDib(bitmap());

    expect(dib).toMatchObject({ width: 3, height: 2 });
    expect(dib.colours[1]).toEqual([0x10, 0x20, 0x30]);
    expect(dib.colours[10]).toEqual([0, 0xff, 0]);
    expect([...dib.pixels]).toEqual([1, 10, 10, 10, 10, 1]);
  });
});
