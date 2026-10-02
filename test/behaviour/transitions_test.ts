import { findTransition, transitionTable } from '../../src/behaviour/transitions.ts';
import { type Script } from '../../src/formats/script.ts';

const script = (from: number, to: number, flag = 1): Script => ({
  from,
  to,
  flag,
  variants: [[]],
});

describe('transitionTable', () => {
  it('keeps the first script for a pair, flagged or not, as the engine’s one pass does', () => {
    const scripts = [script(0, 0), script(6, 9, 0), script(6, 9), script(6, 9)];
    expect(transitionTable(scripts)[6][9]).toBe(1);
  });

  it('leaves out scripts that stay put', () => {
    const scripts = [script(0, 0), script(9, 9)];
    expect(transitionTable(scripts)[9][9]).toBe(0);
  });
});

describe('findTransition', () => {
  // 1 sits a standing dog down, 2 lays a sitting dog down, 3 curls a lying one up.
  const scripts = [script(0, 0), script(9, 6), script(6, 28), script(28, 5)];
  const table = transitionTable(scripts);

  it('takes the pair’s own script', () => {
    expect(findTransition(table, scripts, 9, 6)).toEqual([1]);
  });

  it('joins two scripts, or three, where no one script goes', () => {
    expect(findTransition(table, scripts, 9, 28)).toEqual([1, 2]);
    expect(findTransition(table, scripts, 9, 5)).toEqual([1, 2, 3]);
  });

  it('plays nothing to stay put, to go nowhere, or where there is no way', () => {
    expect(findTransition(table, scripts, 6, 6)).toEqual([]);
    expect(findTransition(table, scripts, 9, 0)).toEqual([]);
    expect(findTransition(table, scripts, 9, 1)).toEqual([]);
    expect(findTransition(table, scripts, 5, 9)).toEqual([]);
  });
});
