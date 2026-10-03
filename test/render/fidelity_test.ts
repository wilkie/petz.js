import { type Breed } from '../../src/formats/lnz.ts';
import { screenPalette } from '../../src/formats/palette.ts';
import { drawOrder } from '../../src/render/ballz.ts';
import { DOGZ, MODERN, setFidelity } from '../../src/render/fidelity.ts';
import { angle256, type Placed, sine } from '../../src/render/project.ts';
import { circleTables, fillBall, IndexedBitmap } from '../../src/render/raster.ts';

const at = (depth: number): Placed => ({ x: 0, y: 0, depth, diameter: 10 });
const breed = {
  eyes: [98, 99],
  irises: [96, 97],
  keyBalls: [],
  tongueBalls: [],
  omissions: [],
  lines: [],
} as unknown as Breed;

describe('drawing as Dogz drew, or as meant', () => {
  afterEach(() => setFidelity(DOGZ));

  it('makes sines with the engine’s short π, or the true one', () => {
    expect([sine(64), angle256(1, 0)]).toEqual([255, 64]);
    setFidelity(MODERN);
    expect([sine(64), angle256(1, 0)]).toEqual([256, 64]);
  });

  it('sorts the balls partly, kept from frame to frame, or afresh', () => {
    const placed = [at(0), at(3), at(10)];

    expect(drawOrder(breed, placed)).toEqual([0, 2, 1]);
    setFidelity(MODERN);
    expect(drawOrder(breed, placed)).toEqual([2, 1, 0]);
  });

  it('carries the fuzz from one diameter to the next, or not', () => {
    const tables = circleTables(1);
    tables.carry[0][9] = 2;
    const left = () => {
      const bitmap = new IndexedBitmap(20, 16);
      fillBall(
        bitmap,
        {
          x: 8,
          y: 8,
          diameter: 10,
          colour: 1,
          outlineColour: 0,
          speckleColour: -1,
          outline: -1,
          fuzz: 0,
        },
        tables
      );
      return Math.min(
        ...Array.from({ length: 16 }, (_, y) =>
          bitmap.pixels.slice(y * 20, y * 20 + 20).findIndex((v) => v >= 0)
        ).filter((x) => x >= 0)
      );
    };

    const carried = left();
    setFidelity(MODERN);
    expect(left()).toBe(carried + 2);
    tables.carry[0][9] = 0;
  });

  it('shows the dark static colours as the oracle’s driver does, or as Windows has them', () => {
    const palette = Array.from({ length: 256 }, () => [0, 128, 0] as [number, number, number]);

    expect(screenPalette(palette)[2]).toEqual([0, 192, 0]);
    expect(screenPalette(palette, { driverColours: false })[2]).toEqual([0, 128, 0]);
  });
});
