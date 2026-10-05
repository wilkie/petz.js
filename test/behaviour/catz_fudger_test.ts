import {
  aimCatzFudger,
  driftCatzFudger,
  makeCatzFudgers,
  requestedCatzFudgers,
  resumeCatzFudger,
  suspendCatzFudger,
  updateCatzFudger,
  wrapCatzAngle,
} from '../../src/behaviour/catz-fudger.ts';

/** A fudger's next values, each tick's input the number it drives as it stands. */
const ticks = (fudger: ReturnType<typeof makeCatzFudgers>[number], n: number) =>
  Array.from({ length: n }, () => updateCatzFudger(fudger, fudger.value));

describe('a Catz cat’s fudgers', () => {
  it('ease an eyelid open from 0 to where it rests, 30, as the engine did as it made a cat: 16, then 30', () => {
    const fudgers = makeCatzFudgers();

    expect(ticks(fudgers[6], 3)).toEqual([16, 30, 30]);
  });

  it('aim an angle from rest as the engine turns a head: 3, 9, 18, 28 a tick', () => {
    const fudgers = makeCatzFudgers();
    aimCatzFudger(fudgers[3], 80);

    expect(ticks(fudgers[3], 4)).toEqual([3, 9, 18, 28]);
  });

  it('keep an aimed angle within its limits, its target wrapped first', () => {
    const fudgers = makeCatzFudgers();
    aimCatzFudger(fudgers[2], 200);

    expect(fudgers[2].target).toBe(-56);
    expect(ticks(fudgers[2], 12).at(-1)).toBe(-56);
  });

  it('drift an angle round, wrapped to -128..128', () => {
    const [rotation] = makeCatzFudgers();
    rotation.value = 120;
    driftCatzFudger(rotation, 5);

    expect(ticks(rotation, 3)).toEqual([125, -126, -121]);
  });

  it('hold a suspended fudger to what it drives, and go on once resumed', () => {
    const fudgers = makeCatzFudgers();
    aimCatzFudger(fudgers[1], 40);
    suspendCatzFudger(fudgers[1]);

    expect(ticks(fudgers[1], 2)).toEqual([0, 0]);
    resumeCatzFudger(fudgers[1]);
    expect(ticks(fudgers[1], 1)).toEqual([3]);
  });

  it('are named one at a time, or both eyelids’ heights, both their tilts, or all', () => {
    expect(requestedCatzFudgers(3)).toEqual([3]);
    expect(requestedCatzFudgers(14)).toEqual([6, 7]);
    expect(requestedCatzFudgers(15)).toEqual([8, 9]);
    expect(requestedCatzFudgers(16)).toHaveLength(14);
    expect(requestedCatzFudgers(17)).toEqual([]);
  });

  it('wrap angles keeping both ends, -128 and 128', () => {
    expect([128, -128, 129, -129, 384].map(wrapCatzAngle)).toEqual([128, -128, -127, 127, 128]);
  });
});
