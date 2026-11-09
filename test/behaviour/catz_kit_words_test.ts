import {
  catzKitMessage,
  catzKitWords,
  type CatzMessaged,
} from '../../src/behaviour/catz-reflexes.ts';

/** A kitten out in the pen in the Kit: its basket 2, every thing on the shelf but the food bowl. */
const MIND = {
  brains: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0],
  state: 22,
  global: 6,
  target: 0,
  count: 0,
};
const seen = (more: Partial<CatzMessaged> = {}): CatzMessaged => ({
  x35a4: 0,
  x35a6: 0,
  x35d6: 0,
  x35b2: 0,
  area: 1,
  mouseState: 1,
  shelved: Array.from({ length: 16 }, (_, kind) => kind !== 0xc),
  x361e: 0,
  x35fa: 0,
  x35f6: 2,
  x35f8: 2,
  ...more,
});
const never = () => 0;

/** The Kit's words for its things (seg23:14e8 on), by `PetParams` `+0xc6` and `+0xc8`. */
describe("the Catz Adoption Kit's words", () => {
  it.each([
    ['the spray bottle, adopted', 29, 1, 0, 0x2343],
    ['the spray bottle, soon', 29, 0, 1, 0x2377],
    ['the spray bottle, adopt now', 29, 0, 0, 0x2362],
    ['the paint bucket, soon: its line', 28, 0, 1, 0x2342],
    ['the paint bucket, adopt now', 28, 0, 0, 0x2367],
    ['the jingle ball, soon: its line', 35, 0, 1, 0x2348],
    ['the squeaky toy, adopt now', 33, 0, 0, 0x2369],
    ['the treat, soon', 38, 0, 1, 0x237b],
    ['the food bowl, adopt now', 39, 0, 0, 0x237e],
    ['the yarn, always its line', 34, 0, 0, 0x2347],
    ['the cheese, always its line', 36, 0, 0, 0x2349],
    ['please wait', 42, 0, 0, 0x235c],
    ["not the Kit's", 20, 0, 0, undefined],
  ])('%s', (_, message, xc6, xc8, words) => {
    expect(catzKitWords(message, { xc6, xc8 })).toBe(words);
  });

  it("shows a shelved thing's words and does no more; off the shelf, goes on as the pen's", () => {
    expect(catzKitMessage(MIND, 29, seen(), never)).toEqual({ words: 0x2362 });
    const food = catzKitMessage(MIND, 39, seen({ edition: { xc6: 1, xc8: 0 } }), never);
    expect(food?.words).toBe(0x234d);
  });

  it("says another basket's kitten must be put away, and its own that it is returning", () => {
    expect(catzKitMessage(MIND, 22 + 4, seen(), never)).toEqual({ words: 0x2350 + 2 });
    expect(catzKitMessage(MIND, 22 + 2, seen(), never)).toEqual({ global: 22, words: 0x2355 + 2 });
  });

  it("on its way to its basket, reads its words and baskets but not the pen's messages", () => {
    const back = seen({ x35fc: 1 });
    expect(catzKitMessage(MIND, 42, back, never)).toEqual({ words: 0x235c });
    expect(catzKitMessage(MIND, 39, back, never)).toEqual({ words: 0x237e });
    expect(catzKitMessage(MIND, 22 + 4, back, never)).toEqual({ words: 0x2350 + 2 });
    expect(catzKitMessage(MIND, 21, back, never)).toEqual({});
  });

  it('climbing out (`+0x35fa`), reads nothing', () => {
    expect(catzKitMessage(MIND, 42, seen({ x35fa: 1 }), never)).toEqual({});
  });
});
