import { readFactors, parseLnzSections } from '../../src/formats/lnz.ts';
import { parseTricks, TRICKS_TITLE } from '../../src/formats/tricks.ts';

/** A trick file whose every record is these twelve words, the defaults each one more. */
function file(words: number[]) {
  const data = new Uint8Array(48 + 2 * 59 * 24);
  const view = new DataView(data.buffer);
  data.set(new TextEncoder().encode(TRICKS_TITLE));

  for (let table = 0; table < 2; table++) {
    for (let trick = 0; trick < 59; trick++) {
      words.forEach((word, n) =>
        view.setInt16(48 + table * 59 * 24 + trick * 24 + 2 * n, word + table, true)
      );
    }
  }

  return data;
}

describe('parseTricks', () => {
  it('reads the current table and then the defaults, twelve words a trick', () => {
    const { current, defaults } = parseTricks(
      file([80, 20, 20, -1, 128, 0, 1, 50, 60, 20, 30, 40])
    );

    expect(current).toHaveLength(59);
    expect(current[58]).toEqual({
      excitement: 80,
      excitementRange: 20,
      idleWeight: 20,
      playWeight: -1,
      facing: 128,
      withBall: 0,
      grabAfter: 1,
      sickness: 50,
      ham: 60,
      groom: 20,
      bark: 30,
      unknown: 40,
    });
    expect(defaults[0].excitement).toBe(81);
  });

  it('refuses a file that is not trick data', () => {
    expect(() => parseTricks(new Uint8Array(2880))).toThrow('not a trick data file');
  });
});

describe('readFactors', () => {
  it('reads each factor’s centre and spread, in the engine’s order', () => {
    const sections = parseLnzSections(
      '[Default Factors]\n70, 20 \t\t// excitement\n45, 10\t// naughty\n'
    );
    const factors = readFactors(sections);

    expect(factors).toHaveLength(11);
    expect(factors[0]).toEqual({ centre: 70, spread: 20 });
    expect(factors[1]).toEqual({ centre: 45, spread: 10 });
    expect(factors[3]).toEqual({ centre: 30, spread: 15 });
  });
});
