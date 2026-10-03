import {
  AXIS,
  fudgeFrame,
  type Fudger,
  fudgeTo,
  makeFudgers,
  selects,
  setTarget,
} from '../../src/behaviour/fudger.ts';

const of = (fudgers: Fudger[], axis: number) => fudgers.find((each) => each.axis === axis)!;

describe('the dog’s fudgers', () => {
  it('start level, the eyelids and the head’s reach at 100', () => {
    const fudgers = makeFudgers();

    expect(fudgers.map((each) => each.axis)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(of(fudgers, AXIS.tilt).value).toBe(0);
    expect(of(fudgers, AXIS.leftEyelidHeight).value).toBe(100);
    expect(of(fudgers, AXIS.headTrackMaxUp).value).toBe(100);
  });

  it('are picked by the group axes’ masks, and from 17 by none', () => {
    expect([0, 2, 3, 4, 5, 6, 7].filter((axis) => selects(13, axis))).toEqual([4, 5]);
    expect([0, 2, 3, 4, 5, 6, 7].filter((axis) => selects(14, axis))).toEqual([6, 7]);
    expect([0, 1, 2, 3].filter((axis) => selects(16, axis))).toEqual([0, 2, 3]);
    expect(
      Array.from({ length: 12 }, (_, axis) => axis).filter((axis) => selects(17, axis))
    ).toEqual([]);
  });

  it('step to a target, the short way round for an angle, and stop there', () => {
    const spin = of(makeFudgers(), AXIS.spin);
    spin.value = 120;
    setTarget(spin, -120, 10);

    fudgeFrame(spin);
    expect(spin.value).toBe(-126);
    fudgeFrame(spin);
    expect(spin.value).toBe(-120);
    expect(spin.by).toBe(0);
  });

  it('ease over so many frames, a whole step more than the share of each', () => {
    const tilt = of(makeFudgers(), AXIS.tilt);
    tilt.value = 30;
    fudgeTo(tilt, 0, 10);

    expect(tilt.by).toBe(-4);
  });

  it('drift every frame', () => {
    const roll = of(makeFudgers(), AXIS.roll);
    roll.drift = 3;
    fudgeFrame(roll);
    fudgeFrame(roll);

    expect(roll.value).toBe(6);
  });
});
