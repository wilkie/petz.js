/**
 * What a Catz cat does next once its moment is over (`DoCatMoment`,
 * CATZDLL.DLL seg25:2ce9, from seg25:3530): it walks off, or chooses its
 * next global state at random from a list its brains fill. See
 * kb/topics/catz-behaviour.md ("The moment").
 */

import { type CatzMind, catzBehavior, catzSound } from './catz-behavior.ts';
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

/** The moment's own fields (`CatSprite` `+0x3502` on). */
export interface CatzMomentState {
  /** How many times it has looked about (`+0x3502`), and how many it must before it may go (`+0x3506`). */
  looks: number;
  looksBeforeGoing: number;

  /** Ticks to its next look about (`+0x3504`). */
  ticks: number;

  /** Its mode (`+0x3508`): 2 and 3 for watching something, 3 when it was the cursor. */
  mode: number;

  /** What it does meanwhile (`+0x350a`): action 0x93 or 0xc. */
  idle: number;

  /** A sound owed (`+0x35a0`). */
  soundOwed: number;

  /** The box it looks about in (`+0x350c` to `+0x3512`). */
  box: { left: number; top: number; right: number; bottom: number };

  /** Whether its mind is made up to go (`+0x3514`). */
  going: boolean;

  /** Where it looks (`+0x34cc`, `+0x34ce`), where it looked at a point. */
  look?: { x: number; y: number };
}

/** What a tick of lingering did besides changing the moment's fields. */
export interface CatzLingered {
  /** The sound it made (`MapAndPlayCatSound`): one of `catzSound`'s, and its action. */
  sound?: { sound: number; action: number };

  /** It looked at the user (`LookAtUser`). */
  lookedAtUser?: boolean;

  /** The action it pushed: what it does meanwhile, or 0x98 to go. */
  pushed?: number;
}

/**
 * A tick of the moment before its mind is made up (`DoCatMoment`,
 * seg25:314f to 34bb, 3c20 on), its script done: every so many ticks it
 * looks about -- at a point in its box three times in four, else at the
 * user -- may swing a fudger, change what it does meanwhile and make a
 * sound; then, its script done, may make up its mind to go, by behaviour 1
 * once it has looked about enough, and pushes what it does meanwhile or
 * 0x98. The ticks to its next look are 9 and up to half of what behaviour 3
 * leaves of 100 more -- the more serious it is, the fewer -- or 9 to 13 in
 * mode 3. `soundPlaying` is whether a layered action is playing, in which
 * case no sound is made.
 */
export function catzMomentLinger(
  mind: CatzMind,
  moment: CatzMomentState,
  soundPlaying: boolean,
  random: (n: number) => number
): CatzLingered {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const done: CatzLingered = {};
  const sound = (n: number) => {
    if (!soundPlaying) {
      done.sound = { sound: n, action: catzSound(mind, n, random) };
    }
  };

  if (moment.ticks === 0) {
    moment.looks++;
    const spread = Math.max(1, Math.trunc((100 - catzBehavior(mind, 3, random)) / 2));
    moment.ticks = random(moment.mode === 3 ? 5 : spread) + 9;

    if (moment.mode !== 3 && moment.mode !== 2) {
      if (percent() < 75) {
        const { left, top, right, bottom } = moment.box;
        const x = random(right - left || 1) + left;
        const y = random(bottom - top || 1) + top;
        moment.look = { x, y };
      } else {
        done.lookedAtUser = true;
      }
    }

    if (percent() < 70) {
      random(20);
    }

    if (moment.looks > 5 && percent() < 40) {
      moment.idle = moment.idle === 0x93 ? 0xc : 0x93;
    }

    const age = brain(CATZ_BRAIN.age);

    if (moment.soundOwed !== 0 && age !== 0) {
      moment.soundOwed = 0;
      sound(5);
    } else if (percent() < 100 - brain(CATZ_BRAIN.fullness) && percent() < 50 && age !== 0) {
      sound(6);
    } else if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.seriousness)) / 4)) {
      sound(7);
    }
  } else {
    moment.ticks--;
  }

  if (!moment.going && moment.looksBeforeGoing < moment.looks) {
    const willing = catzBehavior(mind, 1, random);

    if (percent() < willing || moment.mode === 3) {
      moment.going = true;
    }
  }

  done.pushed = moment.going ? 0x98 : moment.idle;
  return done;
}
