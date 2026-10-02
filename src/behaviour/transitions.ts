/**
 * How the dog gets from one position to another: sitting to standing,
 * standing to lying down. Every script goes from one of the 59 script
 * positions to another (or the same), and the engine keeps, for each pair
 * of positions, one script that goes between them (`ScriptSprite::
 * LoadScripts`, DOGZDLL.DLL seg7:2180). To reach a position it plays that
 * script, or, where there is none, the first two or three that join up
 * (`PushTransitionToNeutralPos`, seg7:3d2f). See kb/topics/behaviour.md.
 */

import { type Script } from '../formats/script.ts';

/** The script positions: `NONE`, `AUTO`, `sleeping` and on (`readStateNames`). */
export const POSITIONS = 59;
export const NONE = 0;
export const AUTO = 1;

/** For each pair of positions, from and to, a script between them, or 0 for none. */
export type TransitionTable = number[][];

/**
 * Each pair of positions' script: the first, in the file's order, that goes
 * from the one to the other. The engine tests first for a script whose flag
 * is set and then for any, in the same pass, so the flag makes no
 * difference. A script that stays where it starts goes in no pair, and
 * script 0 in none, since 0 is none.
 */
export function transitionTable(scripts: Script[]): TransitionTable {
  const table = Array.from({ length: POSITIONS }, () => new Array<number>(POSITIONS).fill(0));

  scripts.forEach(({ from, to, flag }, index) => {
    if (from === to || from >= POSITIONS || to >= POSITIONS) {
      return;
    }

    if (flag !== 0 && table[from][to] === 0) {
      table[from][to] = index;
    }

    if (table[from][to] === 0) {
      table[from][to] = index;
    }
  });

  return table;
}

/**
 * The scripts that take the dog from one position to another, in the order
 * the engine finds them: the pair's own script, or the first two that join,
 * or the first three, searching every position in order. Empty where none
 * is needed or none is found; the engine then plays nothing.
 */
export function findTransition(
  table: TransitionTable,
  scripts: Script[],
  from: number,
  to: number
): number[] {
  if (from === to || from < 0 || from === NONE || to === NONE || to === AUTO) {
    return [];
  }

  if (table[from][to]) {
    return [table[from][to]];
  }

  const joins = (a: number, b: number) => a !== 0 && b !== 0 && scripts[a].to === scripts[b].from;

  for (let i = 0; i < POSITIONS; i++) {
    for (let j = 0; j < POSITIONS; j++) {
      if (joins(table[from][i], table[j][to])) {
        return [table[from][i], table[j][to]];
      }
    }
  }

  for (let i = 0; i < POSITIONS; i++) {
    for (let j = 0; j < POSITIONS; j++) {
      for (let k = 0; k < POSITIONS; k++) {
        const [a, b, c] = [table[from][i], table[j][k], table[k][to]];

        if (joins(a, b) && joins(b, c)) {
          return [a, b, c];
        }
      }
    }
  }

  return [];
}
