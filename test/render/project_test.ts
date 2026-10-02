import { type AnimationHeader, type Frame } from '../../src/formats/animation.js';
import { type Breed } from '../../src/formats/lnz.js';
import { project, scalesForAge } from '../../src/render/project.js';

const breed = {
  defaultScales: [220, 220, 140, 200],
  ballSizeDiffs: [0, 2],
} as unknown as Breed;

const header = { ballSizes: [10, 30] } as unknown as AnimationHeader;

const frame = (balls: [number, number, number][]) =>
  ({ balls: balls.map(([x, y, z]) => ({ x, y, z })) }) as unknown as Frame;

describe('a breed’s scales', () => {
  it('are the puppy’s at age 0 and the adult’s at 100', () => {
    expect(scalesForAge(breed, 0)).toEqual({ pet: 140, ball: 200 });
    expect(scalesForAge(breed, 100)).toEqual({ pet: 220, ball: 220 });
  });

  it('go between them in proportion to age', () => {
    expect(scalesForAge(breed, 50)).toEqual({ pet: 180, ball: 210 });
  });
});

describe('placing a frame', () => {
  it('scales positions by the pet scale in 256ths', () => {
    const [, ball] = project(
      breed,
      header,
      frame([
        [0, 0, 0],
        [256, 0, 0],
      ]),
      { pet: 128, ball: 256 }
    );

    expect(ball.x).toBe(128);
  });

  it('makes a ball’s diameter its size times the ball scale in 256ths, an even number', () => {
    const placed = project(
      breed,
      header,
      frame([
        [0, 0, 0],
        [0, 0, 0],
      ]),
      { pet: 256, ball: 200 }
    );

    // (10 × 200) >> 9 = 3, twice is 6; (32 × 200) >> 9 = 12, twice is 24.
    expect(placed.map((ball) => ball.diameter)).toEqual([6, 24]);
  });

  it('tilts a dog facing out by 13 256ths of a turn, and side-on by 7', () => {
    const above = frame([
      [0, 0, 0],
      [0, -100, 0],
    ]);
    const facing = project(breed, header, above, { pet: 256, ball: 256 }, 0)[1];
    const sideOn = project(breed, header, above, { pet: 256, ball: 256 }, 64)[1];

    // A point straight up leans back by the tilt: its depth is -100 × sin(pitch).
    expect(facing.depth).toBe(
      Math.floor((Math.trunc(Math.sin((-13 * Math.PI) / 128) * 256) * 100) / 256)
    );
    expect(sideOn.depth).toBe(
      Math.floor((Math.trunc(Math.sin((-7 * Math.PI) / 128) * 256) * 100) / 256)
    );
  });

  it('turns a dog about the upright axis', () => {
    const quarter = project(
      breed,
      header,
      frame([
        [0, 0, 0],
        [100, 0, 0],
      ]),
      { pet: 256, ball: 256 },
      64
    )[1];

    // A quarter turn takes a point on the right to the near side.
    expect(Math.abs(quarter.x)).toBeLessThanOrEqual(1);
  });
});
