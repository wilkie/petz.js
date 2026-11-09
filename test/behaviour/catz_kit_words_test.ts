import {
  catzKitMessage,
  catzKitText,
  catzKitWords,
  type CatzMessaged,
  makeCatzKitText,
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

/** `HandleKitContextSensitiveText`: its hints in its baskets, its breed's tip and the adverts out of them. */
describe("the Catz Adoption Kit's text", () => {
  const run = (
    ticks: number,
    world: Parameters<typeof catzKitText>[1],
    text = makeCatzKitText()
  ) => {
    const shown: [number, number][] = [];

    for (let tick = 0; tick < ticks; tick++) {
      const words = catzKitText(text, world);

      if (words !== undefined) {
        shown.push([tick, words]);
      }
    }

    return { shown, text };
  };

  it('in its baskets: click, pick up, pet, and round again', () => {
    const text = { ...makeCatzKitText(), x35fe: 0 };
    const { shown } = run(1000, { state: 74, global: 22, basket: 1, age: 0, xca: 1, xea: 1 }, text);
    expect(shown.slice(0, 4)).toEqual([
      [0, 0x233c],
      [0x8e, 0x235a],
      [0x11b, 0x235b],
      [0x1a9, 0x233c],
    ]);
  });

  it('in its baskets, without `+0xea` or an age, nothing', () => {
    expect(run(500, { state: 74, global: 22, basket: 1, age: 0, xca: 1, xea: 0 }).shown).toEqual(
      []
    );
  });

  /* The first advert, "On-Line Help" (0x2371), is a tip: set the tick after the breed's tip, it is not shown (`+0x3606` under 0x1c). */
  it("out of the Kit: its breed's tip at 0x54, then the adverts in turn", () => {
    const text = { ...makeCatzKitText(), x35fe: 0, x3602: 0 };
    const { shown } = run(0x800, { state: 22, global: 6, basket: 3, age: 0, xca: 1, xea: 0 }, text);
    expect(shown.map(([, words]) => words)).toEqual([
      0x2375, 0x236a, 0x236b, 0x236c, 0x236d, 0x236e, 0x236f, 0x2370, 0x2371, 0x236a,
    ]);
    expect(shown[0][0]).toBe(0x54);
  });

  it('with `+0xc8` alone, "Soon …" in place of the adverts that have one', () => {
    const text = { ...makeCatzKitText(), x35fe: 0x60, x3602: 0 };
    const world = {
      state: 22,
      global: 6,
      basket: 3,
      age: 0,
      xca: 1,
      xea: 0,
      edition: { xc6: 0, xc8: 1 },
    };
    expect(run(0x700, world, text).shown.map(([, words]) => words)).toEqual([
      0x2386, 0x2381, 0x236b, 0x236c, 0x2382, 0x2383, 0x2384, 0x2385, 0x2386,
    ]);
  });

  it('in the Kit but out of its baskets, nothing', () => {
    expect(run(300, { state: 76, global: 22, basket: 3, age: 0, xca: 1, xea: 1 }).shown).toEqual(
      []
    );
  });
});
