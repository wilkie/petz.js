/**
 * The engine's random numbers: Borland C's `rand` (DOGZDLL.DLL seg1:4f11),
 * a 32-bit seed multiplied by 0x015a4e35 and 1 added, of which bits 16 to
 * 30 are the number. The engine takes them modulo what it wants, as
 * `rand() % n`, and so must anything that means to choose as it does.
 */

export type Rand = () => number;

export function borlandRand(seed: number): Rand {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 0x015a4e35) + 1) >>> 0;
    return (state >>> 16) & 0x7fff;
  };
}
