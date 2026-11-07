/**
 * A Catz cat's global states begun: what each sets of the cat and which of
 * its own states it begins in (`GlobalCatStateMachine::NewState`, CATZDLL.DLL
 * seg16:0000, and each global state's handler entering). See
 * kb/topics/catz-behaviour.md ("Global states").
 */

import { catzBehavior, type CatzMind, catzSound } from './catz-behavior.ts';
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

  /** Eating: whether a kind of sprite is on the shelf (`XApt::isSpriteInShelf`) -- all of them, in an empty pen. */
  inShelf?: (kind: number) => boolean;

  /** Eating: what sent it to eat (`+0x35ce`: 0 hunger, 1 the bowl, 2 food at hand, 3 water), and what is left in the food bowl (`+0x35d2`). */
  x35ce?: number;
  x35d2?: number;

  /** Playing: what it plays with (`+0x35a4`). */
  x35a4?: number;
}

/** What a global state begun did: the global states the cat was put in, in turn, and the state of its own it began in. */
export interface CatzGlobalBegun {
  globals: number[];
  state?: number;

  /** Its mode (`+0x3508`), where it was set. */
  mode?: number;

  /** The effects on its brains (`SetBehaviorEffect`, seg15:1ca9): liveliness, independence, seriousness, groom. */
  effects?: number[];

  /** Eating: what it goes to (`+0x35a4` and `+0x35a6`), what is left in the bowl (`+0x35d2`), the sound it made and the actions it pushed, where so. */
  kind?: number;
  x35d2?: number;

  /** Chasing: `+0x35ac` set, so it runs. */
  x35ac?: number;
  sound?: number;
  pushes?: number[];
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
    case 3:
      return catzEatingBegin(mind, world, random, begun);
    case 15:
      return catzPlayingBegin(mind, world, random, begun);
    case 16: {
      /* Chasing (`DoGSChasing`, seg19:0000), entering: idling's effects;
       * what it chases (`+0x35a4`) on the shelf, it plays (15) instead; else
       * it runs to it (22, `+0x35a6` made `+0x35a4`, `+0x35ac` 1). Each tick
       * after, the machine's `+0x46` set and not after the mouse, its moment
       * readied and had (8): not reimplemented. */
      const kind = world.x35a4 ?? 0;

      if ((world.inShelf ?? (() => true))(kind)) {
        const playing = catzPlayingBegin(mind, world, random, {
          globals: [15],
          effects: [15, 15, 15, 0],
        });
        return { ...playing, globals: [16, ...playing.globals] };
      }

      begun.kind = kind;
      begun.x35ac = 1;
      begun.state = 22;
      break;
    }
  }

  return begun;
}

/**
 * Eating begun (`DoGSEating`, seg22:0000), entering: the effects set as
 * idling sets them; inclined to behaviour 21, one time in two, a sound (1)
 * and 0xdf; and then by what sent it (`+0x35ce`, made 0):
 *
 * - hunger (0): what it goes to by what is off the shelf -- the treat (0xb)
 *   where it is out: inclined to behaviour 7, one time in two, and fuller
 *   than behaviour 11 answers, it attacks it (global 1); else, inclined to
 *   9, a sound (10) and 0xf1 (0x2aa without an age), or, under its energy,
 *   a sound (3). Without an age, the bottle (0xf), playing (global 15)
 *   where it is on the shelf. Else the food bowl (0xc), but: inclined to
 *   26, the bowl on the shelf and a piece (8) out, the piece; the bowl on
 *   the shelf or under 20 in it, one time in two, the water bowl (0xd)
 *   where it is out; under 50 of age, under what its age leaves of 100 and
 *   the bottle out -- or inclined to 16 and the bowl on the shelf -- the
 *   bottle; inclined to 14 and the bowl on the shelf, one time in four the
 *   catnip (0xe) to attack (global 1), else, one time in four, the water
 *   bowl on the shelf, to play (global 15); inclined to 15, under a third
 *   of its fullness and the bowl out, playing (global 15). The food bowl
 *   empty (`+0x35d2` 0), one time in two it is made 1, else it idles (6);
 *   `+0x35d2` -1 is made 0. It walks there (22, `+0x35a2` 0);
 * - the bowl (1): it eats from it (40);
 * - food at hand (2): it aligns to eat (38);
 * - water (3): the water bowl (0xd), and without an age it plays (global
 *   15), else walks there (22).
 *
 * Each tick after, the machine's `+0x46` set, it readies its moment
 * (`PreMoment` 6, 0x93, 1) and has it (global 8): not reimplemented.
 */
function catzEatingBegin(
  mind: CatzMind,
  world: CatzGlobalWorld,
  random: (n: number) => number,
  begun: CatzGlobalBegun
): CatzGlobalBegun {
  const percent = () => random(101);
  const behave = (n: number) => catzBehavior(mind, n, random);
  const brain = (n: number) => mind.brains[n];
  const age = brain(CATZ_BRAIN.age);
  const inShelf = world.inShelf ?? (() => true);
  let kind = 0xc;
  let x35d2 = world.x35d2 ?? 0;
  /* Another global state asked, begun after it as far as it is reimplemented. */
  const then = (global: number) => {
    begun.kind = kind;
    begun.x35d2 = x35d2;

    if (global === 6) {
      const idling = catzGlobalBegin(6, mind, world, random);
      return { ...begun, ...idling, globals: [3, ...idling.globals], effects: idling.effects };
    }

    begun.globals.push(global);
    return begun;
  };
  const walk = () => {
    begun.kind = kind;
    begun.x35d2 = x35d2;
    begun.state = 22;
    return begun;
  };

  if (behave(0x15) !== 0 && percent() < 50) {
    begun.sound = catzSound(mind, 1, random);
    begun.pushes = [0xdf];
  }

  switch (world.x35ce ?? 0) {
    case 1:
      begun.state = 40;
      return begun;
    case 2:
      begun.state = 38;
      return begun;
    case 3:
      kind = 0xd;
      return age === 0 ? then(15) : walk();
    case 0:
      break;
    default:
      return begun;
  }

  if (!inShelf(0xb)) {
    kind = 0xb;

    if (behave(7) !== 0 && percent() < 50 && brain(CATZ_BRAIN.fullness) > behave(0xb)) {
      return then(1);
    }

    if (behave(9) !== 0) {
      begun.sound = catzSound(mind, 10, random);
      begun.pushes = [...(begun.pushes ?? []), age === 0 ? 0x2aa : 0xf1];
    } else if (percent() < brain(CATZ_BRAIN.energy)) {
      begun.sound = catzSound(mind, 3, random);
    }
  } else if (age === 0) {
    kind = 0xf;

    if (inShelf(0xf)) {
      return then(15);
    }
  } else if (behave(0x1a) !== 0 && inShelf(kind) && !inShelf(8)) {
    kind = 8;
  } else if ((inShelf(0xc) || x35d2 < 20) && percent() < 50 && !inShelf(0xd)) {
    kind = 0xd;
  } else if (
    (age < 50 && percent() < 100 - age && !inShelf(0xf)) ||
    (behave(0x10) !== 0 && inShelf(kind))
  ) {
    kind = 0xf;
  } else if (behave(0xe) !== 0 && inShelf(kind)) {
    if (percent() < 25) {
      kind = 0xe;
      return then(1);
    }

    if (percent() < 25 && inShelf(0xd)) {
      kind = 0xd;
    }

    return then(15);
  } else if (
    behave(0xf) !== 0 &&
    percent() < Math.trunc(brain(CATZ_BRAIN.fullness) / 3) &&
    !inShelf(kind)
  ) {
    return then(15);
  }

  if (kind === 0xc && x35d2 === 0) {
    if (percent() < 50) {
      x35d2 = 1;
    } else {
      return then(6);
    }
  } else if (x35d2 === -1) {
    x35d2 = 0;
  }

  return walk();
}

/**
 * Playing begun (`DoGSPlaying`, seg29:08e4), entering: the effect on
 * seriousness 15 only; under what its fear leaves of 100, under its energy
 * and under what its seriousness leaves of 100, and not playing with the
 * food bowl (0xc), a sound (10) and 0xf1 (0x2aa without an age). Then,
 * what it plays with (`+0x35a4`) the cursor (0x17), the mouse (0x1b), or 6,
 * 7 or 9, off the shelf, under half its liveliness, it chases it (global
 * 16); else it walks to it (22, `+0x35a6` made `+0x35a4`).
 *
 * Each tick after, the machine's `+0x46` set and not after the mouse, it
 * readies its moment (`PreMoment` 6, 0x93, 1) and has it (8); leaving,
 * inclined to behaviour 9 it pushes 0x141, else its slot `0x1fc`, and
 * turns its head (slot `0xe0`, 2500): not reimplemented.
 */
function catzPlayingBegin(
  mind: CatzMind,
  world: CatzGlobalWorld,
  random: (n: number) => number,
  begun: CatzGlobalBegun
): CatzGlobalBegun {
  const percent = () => random(101);
  const brain = (n: number) => mind.brains[n];
  const kind = world.x35a4 ?? 0;
  const inShelf = world.inShelf ?? (() => true);
  begun.effects = [0, 0, 15, 0];

  if (
    percent() < 100 - brain(CATZ_BRAIN.fear) &&
    percent() < brain(CATZ_BRAIN.energy) &&
    percent() < 100 - brain(CATZ_BRAIN.seriousness) &&
    kind !== 0xc
  ) {
    begun.sound = catzSound(mind, 10, random);
    begun.pushes = [brain(CATZ_BRAIN.age) === 0 ? 0x2aa : 0xf1];
  }

  if (
    [6, 7, 9, 0x17, 0x1b].includes(kind) &&
    !inShelf(kind) &&
    percent() < Math.trunc(brain(CATZ_BRAIN.liveliness) / 2)
  ) {
    begun.globals.push(16);
    return begun;
  }

  begun.kind = kind;
  begun.state = 22;
  return begun;
}
