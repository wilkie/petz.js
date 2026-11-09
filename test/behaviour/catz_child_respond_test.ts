import { catzChildRespond } from '../../src/behaviour/catz-reflexes.ts';

/** The messages the pen's things leave the cat, as `ChildRespond`'s responders leave them (seg16:403f to 4590). */
describe('what the playpen tells a Catz cat of its things', () => {
  it.each([
    /* Taken off the shelf (dragged, the user's), then let go in the pen. */
    ['food bowl taken', 0xc, 1, 3, true, false, 1],
    ['food bowl let go', 0xc, 1, 1, false, false, 2],
    ['water bowl taken', 0xd, 1, 3, true, false, 3],
    ['water bowl let go', 0xd, 1, 1, false, false, 4],
    ['treat taken', 0xb, 1, 3, true, false, 5],
    ['treat let go', 0xb, 1, 1, false, false, 6],
    ['treat pressed', 0xb, 1, 4, false, false, 5],
    ['catnip taken', 4, 1, 3, true, false, 7],
    ['catnip let go', 4, 1, 1, false, false, 8],
    ['jingle ball pressed', 7, 1, 4, false, false, 9],
    ['yarn ball taken', 6, 1, 3, true, false, 0xa],
    ['squeaky toy pressed', 9, 1, 4, false, false, 0xb],
    ['Cat Dancer pressed', 5, 1, 4, false, false, 0xc],
    ['bottle dragged', 0xf, 1, 3, false, false, 0xd],
    ['cheese taken', 8, 1, 3, true, false, 0xe],
    ['spray taken', 2, 1, 3, true, false, 0xf],
    ['spray let go', 2, 1, 1, false, false, 0x10],
    ['flea spray let go', 3, 1, 1, false, false, 0x11],
    /* In the Adoption Kit, the Kit's own as it is taken; the state's still wins. */
    ['food bowl taken in the Kit', 0xc, 1, 3, true, true, 0x27],
    ['bottle taken in the Kit', 0xf, 1, 3, true, true, 0x29],
    /* Nothing said: on the shelf, the mouse hole, the paint bucket outside the Kit, a ball merely let go. */
    ['food bowl on the shelf', 0xc, 0, 1, false, false, undefined],
    ['mouse hole', 0xe, 1, 1, true, false, undefined],
    ['paint bucket taken', 1, 1, 3, true, false, undefined],
    ['yarn ball let go', 6, 1, 1, false, false, undefined],
  ])('%s', (_, kind, cond, state, flag, kit, message) => {
    expect(catzChildRespond(kind, cond, state, flag, kit)).toBe(message);
  });
});
