import { type AnimationHeader, type Frame } from '../../src/formats/animation.ts';
import { type Breed, type CatzShape } from '../../src/formats/lnz.ts';
import {
  extendCatzFrame,
  extendFrames,
  layeredCatzFrame,
  percent16,
} from '../../src/render/extend.ts';
import { ballSize } from '../../src/render/project.ts';

/** A cat's 67 balls, all at the origin but those given. */
const frame = (at: Record<number, [number, number, number]>) =>
  ({
    balls: Array.from({ length: 67 }, (_, n) => {
      const [x, y, z] = at[n] ?? [0, 0, 0];
      return { x, y, z };
    }),
    extras: [],
  }) as unknown as Frame;

const shape = (changes: Partial<CatzShape> = {}): CatzShape => ({
  head: { percent: 100, extra: 0 },
  feet: { percent: 100, extra: 0 },
  ears: 100,
  up: [],
  forward: [],
  sideways: [],
  project: [],
  littleOne: null,
  ...changes,
});

const cat = (catz: CatzShape, extensions = { frontLeg: 0, hindLeg: 0, body: 0, face: 0 }) =>
  ({
    skeletonType: -1,
    keyBalls: [24, 6, 36, -1, 55, 56, -1, 37, -1, -1, 3],
    headBalls: [24, 14],
    ballSizeDiffs: Array(67).fill(0),
    puppyBalls: Array(67).fill(0),
    extensions,
    catz,
  }) as unknown as Breed;

const at = (result: Frame, n: number) => {
  const { x, y, z } = result.balls[n];
  return [x, y, z];
};

describe('a percentage as Catz takes one', () => {
  it('is a 16-bit product, its high word lost, divided toward 0', () => {
    expect(percent16(50, 93)).toBe(46);
    expect(percent16(-50, 93)).toBe(-46);
    expect(percent16(200, 120)).toBe(240);
    expect(percent16(400, 120)).toBe(-175);
    expect(percent16(300, 300)).toBe(Math.trunc(((90000 << 16) >> 16) / 100));
  });
});

describe('reshaping a cat’s frame', () => {
  it('draws the head balls in toward the head, by the percentage less its extra', () => {
    const result = extendCatzFrame(
      frame({ 24: [100, 100, 0], 14: [200, 0, 50] }),
      cat(shape({ head: { percent: 93, extra: 3 } }))
    );

    expect(at(result, 24)).toEqual([100, 100, 0]);
    expect(at(result, 14)).toEqual([190, 10, 45]);
  });

  it('projects each ball from the one before, already moved, in order', () => {
    const result = extendCatzFrame(
      frame({ 43: [0, 0, 0], 44: [10, 0, 0], 45: [20, 0, 0] }),
      cat(
        shape({
          project: [
            [43, 44, 120],
            [44, 45, 120],
          ],
        })
      )
    );

    expect(at(result, 44)).toEqual([12, 0, 0]);
    // (20 - 12) × 1.2, 9.6, toward 0.
    expect(at(result, 45)).toEqual([21, 0, 0]);
  });

  it('moves a ball up, away from the feet, so far along the belly-to-feet line', () => {
    /* The soles and hands 100 below the belly: up 5 is 5 nearer the top. */
    const feet: Record<number, [number, number, number]> = {
      2: [0, 0, 0],
      41: [0, 100, 0],
      42: [0, 100, 0],
      22: [0, 100, 0],
      23: [0, 100, 0],
      4: [7, 7, 7],
    };
    const result = extendCatzFrame(frame(feet), cat(shape({ up: [[4, 5]] })));

    expect(at(result, 4)).toEqual([7, 2, 7]);
  });

  it('lengthens the body back from the chest, the belly half as far', () => {
    const result = extendCatzFrame(
      frame({ 6: [100, 0, 0], 3: [0, 0, 0], 43: [-10, 0, 0], 2: [50, 0, 0] }),
      cat(shape(), { frontLeg: 0, hindLeg: 0, body: 20, face: 0 })
    );

    expect(at(result, 3)).toEqual([-20, 0, 0]);
    expect(at(result, 43)).toEqual([-30, 0, 0]);
    expect(at(result, 2)).toEqual([40, 0, 0]);
  });

  it('leaves the frames be when the breed changes nothing', () => {
    const frames = [frame({ 1: [1, 2, 3] })];
    expect(extendFrames(frames, { ...cat(shape()), catz: undefined } as Breed)).toBe(frames);
  });
});

describe('a cat’s ball sizes', () => {
  const header = { ballSizes: Array(67).fill(100) } as unknown as AnimationHeader;

  it('are enlarged by the percentage and its extra: the head’s balls and the feet’s', () => {
    const breed = cat(shape({ head: { percent: 93, extra: 3 }, feet: { percent: 70, extra: 0 } }));

    expect(ballSize(breed, header, 14, 0)).toBe(96);
    expect(ballSize(breed, header, 41, 0)).toBe(70);
    expect(ballSize(breed, header, 3, 0)).toBe(100);
  });
});

describe('a layered action played over a cat’s frame', () => {
  it('moves each ball by how far the layer’s frame has it from its first frame', () => {
    const shown = frame({ 3: [10, 20, 30] });
    const first = frame({ 3: [1, 1, 1], 5: [4, 4, 4] });
    const now = frame({ 3: [3, 0, 1], 5: [4, 6, 4] });
    const result = layeredCatzFrame(shown, first, now, cat(shape()));

    expect(at(result, 3)).toEqual([12, 19, 30]);
    expect(at(result, 5)).toEqual([0, 2, 0]);
  });

  it('leaves the balls the breed says not to, and the frame itself on the layer’s first frame', () => {
    const shown = frame({ 3: [10, 20, 30] });
    const first = frame({});
    const now = frame({ 3: [5, 5, 5] });
    const kept = { ...cat(shape()), dontLayer: [3] } as Breed;

    expect(at(layeredCatzFrame(shown, first, now, kept), 3)).toEqual([10, 20, 30]);
    expect(layeredCatzFrame(shown, first, first, cat(shape()))).toBe(shown);
  });
});
