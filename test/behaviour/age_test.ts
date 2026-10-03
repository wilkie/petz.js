import { ageFactor, startOn } from '../../src/behaviour/age.ts';

describe('growing up', () => {
  const saved = { age: 3, lastDay: 14, lastMonth: 2 };

  it('is a day older started on another day, and remembers the day', () => {
    expect(startOn(saved, new Date(1996, 1, 15))).toEqual({ age: 4, lastDay: 15, lastMonth: 2 });
    expect(startOn(saved, new Date(1996, 2, 14))).toEqual({ age: 4, lastDay: 14, lastMonth: 3 });
  });

  it('is no older started again the same day, or the same day a year on', () => {
    expect(startOn(saved, new Date(1996, 1, 14))).toBe(saved);
    expect(startOn(saved, new Date(1997, 1, 14))).toBe(saved);
  });

  it('makes the age factor ten a day, grown at ten days', () => {
    expect([0, 1, 5, 10, 30].map(ageFactor)).toEqual([1, 10, 50, 100, 100]);
  });
});
