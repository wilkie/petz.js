import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import {
  CATZ_STATE,
  catzProjectToCatnip,
  catzProjectToFood,
  catzStateTick,
  type CatzStateWorld,
} from '../../src/behaviour/catz-states.ts';

/** A cat eating, aged and middling in all. */
const MIND = {
  brains: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  state: 40,
  global: 3,
  target: 0,
  count: 0,
};
const world = (more: Partial<CatzStateWorld>): CatzStateWorld => ({
  global: 3,
  count: 0,
  passed: 0,
  inShelf: () => true,
  prey: { x: 0, y: 0 },
  goal: { x: 0, y: 0 },
  ...more,
});
const never = () => 0;

/** `XApt::CatSetCond` as the cat eats and nibbles: the things shown by what is left of them. */
describe('the conditions a Catz cat sets its things to', () => {
  it.each([
    [101, 2],
    [96, 3],
    [86, 3],
    [50, 5],
    [30, 6],
    [10, 7],
    [5, 8],
  ])('a bite of the food bowl with %d left (5 less) shows it as %d', (left, cond) => {
    const tick = catzStateTick(
      CATZ_STATE.eatFromBowl,
      MIND,
      world({ x35a6: 0xc, x35d2: left, cues: [5] }),
      never
    );
    expect(tick.conds).toEqual([[0xc, cond]]);
  });

  it('the water bowl lapped, 3 then 2; no cue, none', () => {
    const lap = (cues: number[]) =>
      catzStateTick(CATZ_STATE.eatFromBowl, MIND, world({ x35a6: 0xd, cues }), never).conds;
    expect(lap([1])).toEqual([[0xd, 3]]);
    expect(lap([0])).toEqual([[0xd, 2]]);
    expect(lap([])).toBeUndefined();
  });

  it.each([
    [101, 2],
    [70, 4],
    [30, 6],
    [20, 7],
  ])('a nibble of the catnip with %d left (20 less) shows it as %d', (left, cond) => {
    const tick = catzStateTick(
      CATZ_STATE.nibbleCatnip,
      { ...MIND, state: 43, global: 4 },
      world({ global: 4, x35a6: 4, x35d4: left, cues: [5] }),
      never
    );
    expect(tick.conds).toEqual([[4, cond]]);
  });
});

/** `CatSetCond` on what the user holds: `ForceRelease` first, then the condition. */
describe('a Catz cat taking a thing from the user', () => {
  it('lets the held thing go before it sets its condition; another, only the condition', () => {
    const happened: string[] = [];
    const pet = new CatzPet({
      brains: MIND.brains,
      centres: MIND.brains,
      stage: { left: 0, top: 0, right: 640, bottom: 480 },
      play: () => 10,
      random: () => 0,
      holding: () => 0xc,
      forceRelease: (kind) => happened.push(`released ${kind}`),
      setCond: (kind, cond) => happened.push(`${kind} ${cond}`),
    });
    const set = (
      pet as unknown as { catSetCond: (kind: number, cond: number) => void }
    ).catSetCond.bind(pet);
    set(0xc, 5);
    set(0xd, 3);
    expect(happened).toEqual(['released 12', '12 5', '13 3']);
  });
});

/** `ProjectToFoodObject` and `ProjectToCatnip`: where the cat puts its nose or paw to eat. */
describe('where a Catz cat aligns to eat', () => {
  const calm = { ...MIND, centres: [50, 50, 10, 10, 50, 50, 50, 10, 50, 50, 50, 50] };

  it('puts its nose above the food by its height, across by its angle and age', () => {
    /* Calm: 0.45 of 104 up (46); angle 35 across, times 1.125 at age 50. */
    expect(catzProjectToFood(calm, { x: 300, y: 400 }, 35, 104)).toEqual({ x: 339, y: 354 });
    /* Not calm: 0.4 (41); angle -40 folds to -40. */
    expect(
      catzProjectToFood({ ...MIND, centres: MIND.brains }, { x: 300, y: 400 }, -40, 104)
    ).toEqual({ x: 255, y: 359 });
  });

  it('puts its paw by the catnip, right of it at 35 or more, else left', () => {
    expect(catzProjectToCatnip({ x: 100, y: 100 }, 35)).toEqual({ x: 120, y: 110 });
    expect(catzProjectToCatnip({ x: 100, y: 100 }, -32)).toEqual({ x: 60, y: 110 });
  });
});
