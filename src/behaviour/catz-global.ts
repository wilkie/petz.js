/**
 * A Catz cat's global states begun: what each sets of the cat and which of
 * its own states it begins in (`GlobalCatStateMachine::NewState`, CATZDLL.DLL
 * seg16:0000, and each global state's handler entering). See
 * kb/topics/catz-behaviour.md ("Global states").
 */

import { type CatzMind } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

/** What a global state begun reads of the game. */
export interface CatzGlobalWorld {
  /** Whether the cursor has moved (`PetParams` `+0x104` to `+0x10a`). */
  cursorMoved: boolean;

  /** Whether the cat's place on the stage is 3 (`GetSpriteScreenArea`, 0x1d). */
  area3: boolean;

  /** Whether the game is the screen saver (`IsScreenSaver`). */
  screenSaver: boolean;

  /** `+0x3574`: whether resting is lying down tired (0) or sleeping (1). */
  sleepy: boolean;
}

/** What a global state begun did: the global states the cat was put in, in turn, and the state of its own it began in. */
export interface CatzGlobalBegun {
  globals: number[];
  state?: number;

  /** Its mode (`+0x3508`), where it was set. */
  mode?: number;

  /** The effects on its brains (`SetBehaviorEffect`, seg15:1ca9): liveliness, independence, seriousness, groom. */
  effects?: number[];
}

/**
 * The cat put in a global state from none (seg16:0000): the effects on its
 * liveliness, independence, seriousness and groom set to 0, and then, for
 * the three this models, its handler entering, which sets the first three
 * to 15 --
 *
 * - idling (`DoGSIdling`, seg24:0000): watching nothing (mode 1); then,
 *   under a third of its age, or the cursor moved and four times in five,
 *   or so placed (3) and with an age, it goes to explore (`preExplore`,
 *   13); else, one time in four or on the screen saver, it passes the time
 *   (`passTheTime`, 19) where it has an age; else it looks at things
 *   (`lookAtObjects`, 12);
 * - the moment (`DoGSMoment`, seg25:0000): the cursor moved, three times in
 *   four, and not so placed, it idles instead; else its own moment (21);
 * - resting (`DoGSResting`, seg30:0000): tired (26), or asleep (28).
 */
export function catzGlobalBegin(
  global: number,
  mind: CatzMind,
  world: CatzGlobalWorld,
  random: (n: number) => number
): CatzGlobalBegun {
  const percent = () => random(101);
  const age = mind.brains[CATZ_BRAIN.age];
  const begun: CatzGlobalBegun = { globals: [global], effects: [15, 15, 15, 0] };

  switch (global) {
    case 6: {
      begun.mode = 1;

      if (
        percent() < Math.trunc(age / 3) ||
        (world.cursorMoved && percent() < 80) ||
        (world.area3 && age !== 0)
      ) {
        begun.state = 13;
      } else if ((percent() < 25 || world.screenSaver) && age !== 0) {
        begun.state = 19;
      } else {
        begun.state = 12;
      }
      break;
    }
    case 8:
      if (world.cursorMoved && percent() < 75 && !world.area3) {
        const idling = catzGlobalBegin(6, mind, world, random);
        return { ...idling, globals: [8, ...idling.globals] };
      }

      begun.state = 21;
      break;
    case 9:
      begun.state = world.sleepy ? 28 : 26;
      break;
  }

  return begun;
}
