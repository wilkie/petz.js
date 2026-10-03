import { type AnimationHeader, type Frame } from '../../src/formats/animation.ts';
import { type Breed } from '../../src/formats/lnz.ts';
import { ballSize, project, scalesForAge } from '../../src/render/project.ts';

const breed = {
  defaultScales: [220, 220, 140, 200],
  ballSizeDiffs: [0, 2],
  puppyBalls: [0, 0],
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

    // (10 × 200) >> 9 = 3, twice is 6; (31 × 200) >> 9 = 12, twice is 24.
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

describe('a ball’s size', () => {
  const sized = {
    ...breed,
    ballSizeDiffs: [0, -5],
    puppyBalls: [9, 0],
  } as unknown as Breed;

  it('takes half the breed’s difference, rounded toward 0', () => {
    expect(ballSize(sized, header, 1, 0)).toBe(28);
  });

  it('takes half the puppy balls in proportion to puppiness', () => {
    expect(ballSize(sized, header, 0, 0)).toBe(10);
    expect(ballSize(sized, header, 0, 100)).toBe(14);
    expect(ballSize(sized, header, 0, 50)).toBe(12);
  });
});

describe('turning the head', () => {
  /* Ball 0 is of the head, ball 1 is not; ball 56, the snout, is what it turns about. */
  const withHead = { ...breed, headBalls: [0] } as unknown as Breed;
  const balls = frame(
    Array.from({ length: 57 }, (_, n): [number, number, number] => (n < 2 ? [40, 0, 0] : [0, 0, 0]))
  );
  const still = {
    yaw: 0,
    pitch: 0,
    roll: 0,
    offset: { x: 0, y: 0, z: 0 },
    drift: { x: 0, y: 0, z: 0 },
  };
  const place = (head?: typeof still) =>
    project(withHead, header, balls, { pet: 256, ball: 256 }, 0, 0, head);

  it('leaves the head where it is when it is not turned', () => {
    expect(place(still)).toEqual(place());
  });

  it('turns the head’s balls about the snout, and no others', () => {
    const turned = place({ ...still, yaw: 64 });
    const [head, body] = place();

    expect(turned[1]).toEqual(body);
    expect(Math.abs(turned[0].x - turned[56].x)).toBeLessThan(Math.abs(head.x - turned[56].x));
  });

  it('moves the head by its offset', () => {
    const moved = place({ ...still, offset: { x: 5, y: 0, z: 0 } });
    expect(moved[0].x).toBe(place()[0].x + 5);
  });
});
