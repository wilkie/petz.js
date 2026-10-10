/**
 * A Catz cat's own states, a tick at a time, once its script is done: what
 * each does then, and which it goes to next (CATZDLL.DLL's `DoCat…`
 * handlers). See kb/topics/catz-behaviour.md ("States of its own").
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

/** The cat's own states these model, by CATZDLL.DLL's numbers (`eKatState_…`). */
export const CATZ_STATE = {
  lookAtObjects: 12,
  passTheTime: 19,
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

  /** `+0x3502`: asleep or dozing, its ticks so. */
  count: number;

  /** `+0x34ca`: passing the time, whether it has done something yet. */
  passed?: number;

  /** Whether the game is the screen saver (`IsScreenSaver`). */
  screenSaver?: boolean;

  /** Whether the cat's place on the stage is 3 (`GetSpriteScreenArea`, 0x1d). */
  area3?: boolean;
}

/** What `PreMoment` (seg25:42ff) readies the moment with. */
export interface CatzPreMoment {
  /** The global state it would play after (`+0x3516`), and what it does meanwhile (`+0x350a`). */
  after: number;
  idle: number;

  /** How many times it must look about before it may go (`+0x3506`), and its mode (`+0x3508`). */
  looksBeforeGoing: number;
  mode: number;

  /** The action it pushed, where it did. */
  pushed?: number;
}

/**
 * The moment readied (`PreMoment`, seg25:42ff, the cat's slot `0x28c`), its
 * script cleared: the global state to play after and what to do meanwhile
 * as given, and 1 to 3 looks before it may go. Watching nothing, or so
 * placed (3), it is in mode 1; else mode 3, and then, afraid (fear over 49)
 * with an age, four times in five it shies (0x96), doing 0x83 meanwhile
 * with 2 to 4 looks; and lively, independent and serious (each over 49),
 * four times in five it puts on a show (0x97), doing 0x15 meanwhile with 2
 * or 3.
 */
export function catzPreMoment(
  mind: CatzMind,
  area3: boolean,
  after: number,
  idle: number,
  watching: boolean,
  random: (n: number) => number
): CatzPreMoment {
  const brain = (n: number) => mind.brains[n];
  const ready: CatzPreMoment = { after, idle, looksBeforeGoing: random(3) + 1, mode: 1 };

  if (!watching || area3) {
    return ready;
  }

  ready.mode = 3;

  if (brain(CATZ_BRAIN.fear) > 49 && brain(CATZ_BRAIN.age) !== 0 && random(101) < 80) {
    ready.pushed ??= 0x96;
    ready.idle = 0x83;
    ready.looksBeforeGoing = random(3) + 2;
  }

  if (
    brain(CATZ_BRAIN.liveliness) > 49 &&
    brain(CATZ_BRAIN.independence) > 49 &&
    brain(CATZ_BRAIN.seriousness) > 49 &&
    random(101) < 80
  ) {
    ready.pushed ??= 0x97;
    ready.idle = 0x15;
    ready.looksBeforeGoing = random(2) + 2;
  }

  return ready;
}

/** What a tick did: the state it went to, the global state it was put in, the action it pushed, and its energy and count after. */
export interface CatzStateTick {
  state?: number;
  global?: number;
  pushed?: number;
  energy: number;
  count: number;
  passed?: number;

  /** The moment readied, where it went to it by `PreMoment`. */
  moment?: CatzPreMoment;

  /** `+0x35a6` and `+0x35a4`, where it set them. */
  x35a6?: number;
  x35a4?: number;
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
 * - dozing (27; `DoCatShortRest`, seg30:022e): its ticks and energy as
 *   asleep; under its energy it wakes (29); else one time in two it naps
 *   by its temperament (behaviours 26 and 24: 0x25c and 0x266), else 0xb4;
 * - waking (29; `DoCatWakeup`, seg30:0741): it idles (global 6);
 * - passing the time (19; `DoCatPassTheTime`, seg24:1896): having done
 *   something, one time in two it looks at things (12), or on the screen
 *   saver readies its moment (`catzPreMoment`) and has it (8); else it does
 *   something by its temperament -- behaviour 24, 0x25f; 25, one time in
 *   two with an age attacking (global 1, `+0x35a6` and `+0x35a4` 14), else
 *   0x25e; 26, 0x25d; 27, 0x261; else 0x260.
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
    case CATZ_STATE.dozing: {
      if (count < 101) {
        count++;
      } else {
        count = 0;
        energy = Math.min(100, energy + 1);
      }

      if (percent() < energy) {
        return done({ state: CATZ_STATE.wakeup });
      }

      if (percent() < 50) {
        const thinking = { ...mind, brains: [...mind.brains] };
        thinking.brains[CATZ_BRAIN.energy] = energy;
        const nap = [
          [26, 0x25c],
          [24, 0x266],
        ].find(([behaviour]) => catzBehavior(thinking, behaviour, random) !== 0);
        return done({ pushed: nap?.[1] ?? 0xb4 });
      }

      return done({ pushed: 0xb4 });
    }
    case CATZ_STATE.wakeup:
      return done({ global: 6 });
    case CATZ_STATE.passTheTime: {
      const behave = (n: number) => catzBehavior(mind, n, random) !== 0;

      if (world.passed && percent() < 50) {
        if (!world.screenSaver) {
          return done({ state: CATZ_STATE.lookAtObjects });
        }

        const moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
        return done({ global: 8, moment });
      }

      const passed = 1;

      if (behave(24)) {
        return done({ passed, pushed: 0x25f });
      }

      if (behave(25)) {
        if (percent() < 50 && !world.screenSaver && mind.brains[CATZ_BRAIN.age] !== 0) {
          return done({ passed, global: 1, x35a6: 14, x35a4: 14 });
        }

        return done({ passed, pushed: 0x25e });
      }

      if (behave(26)) {
        return done({ passed, pushed: 0x25d });
      }

      return done({ passed, pushed: behave(27) ? 0x261 : 0x260 });
    }
    default:
      return done({});
  }
}
