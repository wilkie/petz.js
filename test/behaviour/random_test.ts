import { borlandRand } from '../../src/behaviour/random.ts';

describe('borlandRand', () => {
  it('gives Borland C’s numbers for seed 1', () => {
    const rand = borlandRand(1);
    expect(Array.from({ length: 6 }, rand)).toEqual([346, 130, 10982, 1090, 11656, 7117]);
  });

  it('stays below 32768', () => {
    const rand = borlandRand(12345);
    expect(Array.from({ length: 1000 }, rand).every((n) => n >= 0 && n < 32768)).toBe(true);
  });
});
