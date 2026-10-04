import { type Breed } from '../../src/formats/lnz.ts';
import { drawOrder, HOLDING_TOE, marks } from '../../src/render/ballz.ts';
import { type Placed } from '../../src/render/project.ts';

const at = (depth: number): Placed => ({ x: 0, y: 0, depth, diameter: 10 });
const breed = {
  eyes: [98, 99],
  irises: [96, 97],
  keyBalls: [],
  tongueBalls: [],
  omissions: [],
  lines: [] as { from: number; to: number; fuzz: number }[],
} as unknown as Breed;

describe('the order balls are drawn in', () => {
  it('puts the farther first, but leaves balls within 4 of each other where they were', () => {
    expect(drawOrder(breed, [at(0), at(10), at(5)])).toEqual([1, 2, 0]);
    expect(drawOrder(breed, [at(5), at(3), at(10)], [0, 1, 2])).toEqual([0, 2, 1]);
  });

  it('sorts only so far each frame, a ball moving one place nearer the front a pass', () => {
    const placed = [at(0), at(3), at(10)];
    const first = drawOrder(breed, placed);

    expect(first).toEqual([0, 2, 1]);
    expect(drawOrder(breed, placed, first)).toEqual([2, 0, 1]);
  });

  it('draws a line just before the first of its balls drawn', () => {
    const withLine = { ...breed, lines: [{ from: 0, to: 2, fuzz: 1 }] } as unknown as Breed;
    const placed = [at(0), at(10), at(5)];
    const order = drawOrder(withLine, placed);

    expect(
      marks(withLine, placed, order).map((mark) => (mark.kind === 'ball' ? mark.ball : mark.kind))
    ).toEqual([1, 'line', 2, 0]);
  });

  it('never draws the toe the dog holds things by, but draws its lines', () => {
    const placed = Array.from({ length: HOLDING_TOE + 2 }, (_, ball) => at(ball));
    const withLine = {
      ...breed,
      lines: [{ from: HOLDING_TOE, to: HOLDING_TOE + 1, fuzz: 1 }],
    } as unknown as Breed;
    const list = marks(withLine, placed, drawOrder(withLine, placed));

    expect(list.some((mark) => mark.kind === 'ball' && mark.ball === HOLDING_TOE)).toBe(false);
    expect(list.filter((mark) => mark.kind === 'line')).toHaveLength(1);
  });
});
