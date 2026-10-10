/**
 * A Catz cat's own states, a tick at a time, once its script is done: what
 * each does then, and which it goes to next (CATZDLL.DLL's `DoCat…`
 * handlers). See kb/topics/catz-behaviour.md ("States of its own").
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

/** The cat's own states these model, by CATZDLL.DLL's numbers (`eKatState_…`). */
export const CATZ_STATE = {
  locomote: 22,
  tired: 26,
  dozing: 27,
  sleep: 28,
  wakeup: 29,
} as const;

/** What the cat's state reads of it besides its brains. */
export interface CatzStateWorld {
  /** Its global state. */
  global: number;

  /** `+0x3502`: asleep, its ticks asleep. */
  count: number;
}

/** What a tick did: the state it went to, the global state it was put in, the action it pushed, and its energy and count after. */
export interface CatzStateTick {
  state?: number;
  global?: number;
  pushed?: number;
  energy: number;
  count: number;
}

/**
 * A tick of one of the cat's own states, its script done:
 *
 * - tired (26; `DoCatTired`, seg30:0113): catnapping (global 21), it has
 *   its energy put at 20 and walks off (`locomote`); else, under its
 *   energy, it dozes (27), and otherwise sleeps (28);
 * - asleep (28; `DoCatSleep`, seg30:0426): every 101 ticks a little more
 *   energy; under a quarter of its energy it wakes (29); else, asleep less
 *   than 26 ticks or nine times in ten, one time in two it dreams by its
 *   temperament (behaviours 28, 26, 25, 27 and 24: actions 0x26e, 0x25a,
 *   0x26d, 0x26f and 0x25b, else 0xd5) and the other sleeps on (0xd5);
 *   else it stirs (0x1d4);
 * - waking (29; `DoCatWakeup`, seg30:0741): it idles (global 6).
 */
export function catzStateTick(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  let energy = mind.brains[CATZ_BRAIN.energy];
  let count = world.count;
  const done = (rest: Partial<CatzStateTick>): CatzStateTick => ({ energy, count, ...rest });

  switch (state) {
    case CATZ_STATE.tired:
      if (world.global === 21) {
        energy = 20;
        return done({ state: CATZ_STATE.locomote });
      }

      return done({ state: percent() < energy ? CATZ_STATE.dozing : CATZ_STATE.sleep });
    case CATZ_STATE.sleep: {
      if (count < 101) {
        count++;
      } else {
        count = 0;
        energy = Math.min(100, energy + 1);
      }

      if (percent() < Math.trunc(energy / 4)) {
        return done({ state: CATZ_STATE.wakeup });
      }

      if (count < 26 || percent() > 9) {
        if (percent() >= 50) {
          return done({ pushed: 0xd5 });
        }

        const thinking = { ...mind, brains: [...mind.brains] };
        thinking.brains[CATZ_BRAIN.energy] = energy;
        const dreams: [number, number][] = [
          [28, 0x26e],
          [26, 0x25a],
          [25, 0x26d],
          [27, 0x26f],
          [24, 0x25b],
        ];
        const dream = dreams.find(([behaviour]) => catzBehavior(thinking, behaviour, random) !== 0);
        return done({ pushed: dream?.[1] ?? 0xd5 });
      }

      return done({ pushed: 0x1d4 });
    }
    case CATZ_STATE.wakeup:
      return done({ global: 6 });
    default:
      return done({});
  }
}
