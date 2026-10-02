import { type Ball, rollBall } from '../../src/behaviour/stage.ts';

const ball = (x: number, y: number, vx: number, vy: number): Ball => ({
  x,
  y,
  vx,
  vy,
  held: false,
  slot: null,
  recorded: null,
});

describe('a ball rolling', () => {
  it('slows by a fortieth of its speed a frame, and moves by the whole of what is left', () => {
    const rolling = ball(100, 100, 20, -10);
    rollBall(rolling, 640, 480);

    expect(rolling.vx).toBe(19.5);
    expect(rolling.vy).toBe(-9.75);
    expect(rolling).toMatchObject({ x: 119, y: 91 });
  });

  it('stops once its speed falls below a pixel a frame', () => {
    const rolling = ball(100, 100, 1.02, 0);
    rollBall(rolling, 640, 480);
    expect(rolling.vx).toBe(0);
    expect(rolling.x).toBe(100);

    let frames = 0;
    const thrown = ball(100, 100, 30, 0);

    while (thrown.vx !== 0) {
      rollBall(thrown, 1e6, 480);
      frames++;
    }

    /* 30 × (39/40)^n < 1 */
    expect(frames).toBe(135);
  });

  it('bounces back off the stage’s edges', () => {
    const rolling = ball(630, 100, 10, 0);
    expect(rollBall(rolling, 640, 480)).toBe(true);
    expect(rolling.vx).toBeLessThan(0);

    /* Not again while it rolls back in. */
    expect(rollBall(rolling, 640, 480)).toBe(false);
  });
});
