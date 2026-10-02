import { bowlPicture } from '../../src/behaviour/stage.ts';

describe('a bowl', () => {
  it('shows full until half are gone, then half, and empty with two left', () => {
    const full = 30;
    const pictures = [30, 18, 17, 3, 2, 0].map((servings) => bowlPicture({ servings, full }));

    /* ((full − left + 2) × 2) / full, at most 2. */
    expect(pictures).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
