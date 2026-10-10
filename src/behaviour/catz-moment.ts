/**
 * What a Catz cat does next once its moment is over (`DoCatMoment`,
 * CATZDLL.DLL seg25:2ce9, from seg25:3530): it walks off, or chooses its
 * next global state at random from a list its brains fill. See
 * kb/topics/catz-behaviour.md ("The moment").
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

/** What else the moment reads of the cat and the game. */
export interface CatzMomentWorld {
  /** Whether the shelf holds the sprite of kind 0xc (`XApt::isSpriteInShelf`). */
  shelf: boolean;

  /** Whether the game is the screen saver (`IsScreenSaver`), and `PetParams` `+0xc4`. */
  screenSaver: boolean;
  c4: number;

  /** `+0x35d2`, and the global state it chose to play last (`+0x3516`, 0 for none). */
  x35d2: number;
  x3516: number;

  /** Whether the cat's place on the stage is 3 (`GetSpriteScreenArea`, 0x1d); on the screen saver. */
  area3?: boolean;
}

/** What the moment did: walked off (`locomote`, state 22), or chose a global state. */
export type CatzMomentChoice = { locomote: true } | { locomote: false; global: number };

/**
 * The moment's end, its mind made up to go (`+0x3514`): by its fear, it
 * walks off -- unafraid, one time in two; afraid, almost never -- or else
 * chooses a global state, `list[rand() % count]`, from a list it fills:
 * eating where it is hungrier than it would be (behaviour 11) or may look
 * for food (18), resting where it is more tired than it would be (12), and
 * otherwise by chance a little of everything, by its brains.
 */
export function catzMomentChoice(
  mind: CatzMind,
  world: CatzMomentWorld,
  random: (n: number) => number
): CatzMomentChoice {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const fear = brain(CATZ_BRAIN.fear);
  const odds = fear < 50 ? 50 : Number(percent() < 100 - fear);

  if (percent() < odds) {
    return { locomote: true };
  }

  const behave = (n: number) => catzBehavior(mind, n, random);
  const list: number[] = [];

  if (world.screenSaver) {
    if (world.area3) {
      list.push(8);
    } else {
      list.push(9, 9, 13, 6, 8);

      if (percent() < 50) {
        list.push(21);
      }
    }
  } else if (world.c4) {
    list.push(22);
  } else if (brain(CATZ_BRAIN.fullness) < behave(11)) {
    list.push(3);
  } else if (behave(18) && percent() < 25 && !world.shelf && (world.x35d2 > 0 || percent() < 10)) {
    list.push(3);
  } else if (brain(CATZ_BRAIN.energy) < behave(12)) {
    list.push(9);
  } else if (percent() < 5 && brain(CATZ_BRAIN.age) !== 0) {
    list.push(3);
  } else {
    const S = brain(CATZ_BRAIN.seriousness);
    const L = brain(CATZ_BRAIN.liveliness);
    const E = brain(CATZ_BRAIN.energy);

    if (percent() < S && percent() < L && percent() < E) {
      list.push(1);
    } else if (percent() < 100 - S && percent() < E) {
      list.push(15);
    }

    list.push(13);

    if (percent() < 100 - brain(CATZ_BRAIN.fullness)) {
      list.push(3);
    }

    if (percent() < brain(CATZ_BRAIN.groom)) {
      list.push(13);
    }

    if (percent() < 100 - E) {
      list.push(9);
    }

    if (percent() < 100 - E) {
      list.push(9);
    }

    if (percent() < 100 - brain(CATZ_BRAIN.independence)) {
      list.push(14, 14, 14);
    }

    if (percent() < 100 - E) {
      list.push(world.x3516 || 8);
    }

    list.push(6, 6);
  }

  return { locomote: false, global: list[random(Math.max(list.length, 1))] ?? 0 };
}
