/**
 * A Catz cat's global states begun: what each sets of the cat and which of
 * its own states it begins in (`GlobalCatStateMachine::NewState`, CATZDLL.DLL
 * seg16:0000, and each global state's handler entering). See
 * kb/topics/catz-behaviour.md ("Global states").
 */

import { catzBehavior, type CatzMind, catzSound } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { catzPreMoment, type CatzPreMoment } from './catz-states.ts';

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

  /**
   * Attacking: the stage (`ds:2ba6` to `2bac`), the cat's width and height
   * (`+0x33c4`, `+0x33c6`), where what it attacks is (its target point),
   * and, for the mouse, whether it is after the cursor (its `+0x26ca` 0x17).
   */
  stage?: { left: number; top: number; right: number; bottom: number };
  size?: { width: number; height: number };

  /** In the Adoption Kit: how its entering takes it (`+0x33be`) and its basket's place (`GetBasketLocation`). */
  kit?: { x33be: number; basket: { x: number; y: number } };
  preyAt?: { x: number; y: number };
  mouseAfterCursor?: boolean;
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

  /** A window event: what it walks to (`+0x35a6`) alone, none. */
  x35a6?: number;

  /** Chasing: `+0x35ac` set, so it runs. */
  x35ac?: number;

  /** Attacking: `+0x35a2` (walking to a point), and the corner it makes for (`+0x34cc`), which (`+0x35ae`, 1 to 4) and the way it is to face there (`+0x33c2`). */
  x35a2?: number;
  goal?: { x: number; y: number };
  x35ae?: number;
  x33c2?: number;
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
    case 18:
    case 19:
      /* Sprayed (`DoGSSprayed`, seg31:0ab5) or flea-sprayed or painted (`DoGSFleaSprayedOrColored`, seg31:0e15): no effects of their own; sprayed (0x3f) or flea-sprayed (0x40). */
      begun.effects = [0, 0, 0, 0];
      begun.state = global === 18 ? 0x3f : 0x40;
      break;
    case 12:
      /* Ignoring something (`DoGSIgnore`, seg30:1964): no effects of its own; it ignores it (0x51). */
      begun.effects = [0, 0, 0, 0];
      begun.state = 0x51;
      break;
    case 20: {
      /* A window event (`DoGSWindowEvent`, seg24:1b12): liveliness,
       * seriousness and grooming's effects 15, independence's none; the cat
       * more than a third of the stage across or high, a sound (2) and 0xdc;
       * else three times in four a sound of 3, 7 or 10 (`rand() % 3`,
       * seg48:1b3a); then under its energy it lets go and readies a walk to
       * nothing (22, `+0x35a6` 0), else looks about the window (0x14). */
      begun.effects = [15, 0, 15, 15];
      const { stage, size } = world;
      const big =
        !!stage &&
        !!size &&
        (size.width * 3 > stage.right - stage.left || size.height * 3 > stage.bottom - stage.top);

      if (big) {
        begun.sound = catzSound(mind, 2, random);
        begun.pushes = [0xdc];
      } else if (percent() < 75) {
        begun.sound = catzSound(mind, [3, 7, 10][random(3)], random);
      }

      if (percent() < mind.brains[CATZ_BRAIN.energy]) {
        begun.x35a6 = 0;
        begun.state = 22;
      } else {
        begun.state = 0x14;
      }
      break;
    }
    case 22: {
      /* The Adoption Kit (`DoGSAdoptionKit`, seg13:0000), by `+0x33be`: 1
       * beginning it (0x48); 2 back to its basket, walking to 150 above it
       * (0x16, `+0x35a6` 0, `+0x35ac` 1); 3 jumping in (0x4d); 4 dropping in
       * (0x4e). No effects of its own. */
      begun.effects = [0, 0, 0, 0];
      const how = world.kit?.x33be ?? 1;

      if (how === 1) {
        begun.state = 0x48;
      } else if (how === 2 && world.kit) {
        begun.x35a6 = 0;
        begun.x35ac = 1;
        begun.goal = { x: world.kit.basket.x, y: world.kit.basket.y - 150 };
        begun.state = 0x16;
      } else if (how === 3) {
        begun.state = 0x4d;
      } else if (how === 4) {
        begun.state = 0x4e;
      }
      break;
    }
    case 7:
      /* Petted (`DoGSPetting`, seg28:0000): the effect on seriousness alone 15 (its slot `0x114`, 2 and 0xf), and it begins to be petted (0x31). No sound of its own and its modes cleared are its petting's (`CatzPet`). */
      begun.effects = [0, 0, 15, 0];
      begun.state = 0x31;
      break;
    case 2:
      /* Having its victim (`DoGSHasVictim`, seg33:14c0): no effects of its own; it carries it (7). Leaving, it lets go of what it holds (its slot `0xfc`) and the mouse, held by the cat to its mind, is free (`+0x26ca` 0). */
      begun.effects = [0, 0, 0, 0];
      begun.state = 7;
      break;
    case 11:
      /* Snubbing (`DoGSSnub`, seg30:17e4): no effects of its own; it snubs what it plays with (0x50). Leaving, its head no longer looks away (`+0x1514` 0, not modelled). */
      begun.effects = [0, 0, 0, 0];
      begun.state = 0x50;
      break;
    case 3:
      return catzEatingBegin(mind, world, random, begun);
    case 15:
      return catzPlayingBegin(mind, world, random, begun);
    case 1:
      return catzAttackingBegin(mind, world, random, begun);
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
 *   mouse hole (0xe) to attack (global 1), else, one time in four, the water
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

/**
 * Attacking begun (`DoGSAttacking`, seg14:0057), entering: idling's
 * effects; then by what it attacks (`+0x35a4`): the food or water bowl
 * (0xc, 0xd), it eats (global 3); 5 or 0x22, it plays (15); the catnip
 * (0xe), it walks to it (22, `+0x35a6` 0xe, `+0x35a2` 0). Else, `+0x35a2` 0,
 * inclined to behaviour 7 and under its age, 0xdf, and then, nine times in
 * ten, after the cursor (0x17) -- or the mouse (0x1b) while it is not after
 * the cursor -- it makes for a corner away from it (`+0x35a2` 1,
 * `TargetACornerToAvoidSprite`, its slot `0x238`); and walks (22,
 * `+0x35a6` made `+0x35a4`), to the corner where it made for one.
 *
 * Each tick after, after the mouse, by the mouse's state (its `+0x2518`'s
 * slot 8): not 1, three things by behaviour 7 and its age -- the mouse hole run
 * to (0xe, `+0x35ac` 1, 22), or its moment readied (`PreMoment` 6, 0x93, 0)
 * and had (8); else, the machine's `+0x46` set and not inclined to
 * behaviour 14, its moment (`PreMoment` 6, 0x93, 1, and 8). Leaving, its
 * slot `0x1fc` and its head turned (slot `0xe0`, 2500). Not reimplemented.
 */
function catzAttackingBegin(
  mind: CatzMind,
  world: CatzGlobalWorld,
  random: (n: number) => number,
  begun: CatzGlobalBegun
): CatzGlobalBegun {
  const percent = () => random(101);
  const kind = world.x35a4 ?? 0;
  /* Another global state asked instead, begun after it. */
  const then = (global: number) => {
    const after = catzGlobalBegin(global, mind, world, random);
    return { ...after, globals: [1, ...after.globals] };
  };

  if (kind === 0xc || kind === 0xd) {
    return then(3);
  }

  if (kind === 5 || kind === 0x22) {
    return then(15);
  }

  begun.x35a2 = 0;
  begun.kind = kind;
  begun.state = 22;

  if (kind === 0xe) {
    return begun;
  }

  if (catzBehavior(mind, 7, random) === 0 || percent() >= mind.brains[CATZ_BRAIN.age]) {
    return begun;
  }

  begun.pushes = [0xdf];
  const avoids = kind === 0x1b ? !world.mouseAfterCursor : kind === 0x17;

  if (percent() < 90 && avoids) {
    begun.x35a2 = 1;
    Object.assign(begun, catzCornerToAvoid(world, kind, random));
  }

  return begun;
}

/**
 * The corner of the stage away from what it avoids
 * (`TargetACornerToAvoidSprite`, seg24:1f25): by which side of the stage's
 * middle that lies on, across and down -- each one time in two where it
 * avoids nothing (kind 0) -- the corner across from it, half the cat's
 * width in from the side and its height (as twice half of it) in from the
 * top or bottom; which corner (`+0x35ae`: 1 top left, 2 top right, 3 bottom
 * left, 4 bottom right); and which way it is to face there (`+0x33c2`), one
 * time in two each: 0x80 or 0x40 for 4, 0 or 0x40 for 2, 0x80 or -0x40 for
 * 3, 0 or -0x40 for 1.
 */
export function catzCornerToAvoid(
  world: CatzGlobalWorld,
  kind: number,
  random: (n: number) => number
): { goal: { x: number; y: number }; x35ae: number; x33c2: number } {
  const percent = () => random(101);
  const stage = world.stage ?? { left: 0, top: 0, right: 640, bottom: 480 };
  const size = world.size ?? { width: 137, height: 104 };
  const half = (n: number) => Math.trunc(n / 2);
  const middle = {
    x: half(stage.right - stage.left) + stage.left,
    y: half(stage.bottom - stage.top) + stage.top,
  };
  let left: boolean;
  let above: boolean;

  if (kind === 0) {
    left = percent() < 50;
    above = percent() < 50;
  } else {
    const at = world.preyAt ?? middle;
    left = at.x < middle.x;
    above = at.y < middle.y;
  }

  const across = half(size.width);
  const down = half(size.height) * 2;
  const x = left ? stage.right - across : stage.left + across;
  const y = above ? stage.bottom - down : stage.top + down;
  const x35ae = left ? (above ? 4 : 2) : above ? 3 : 1;
  const one = percent() < 50;
  const x33c2 = [0, one ? 0 : -0x40, one ? 0 : 0x40, one ? 0x80 : -0x40, one ? 0x80 : 0x40][x35ae];

  return { goal: { x, y }, x35ae, x33c2 };
}

/** What a tick of a global state reads, beyond what its beginning does. */
export interface CatzGlobalTickWorld extends CatzGlobalWorld {
  /** Whether the cursor is about (`PetParams` `+0x46`). */
  cursorAbout: boolean;

  /** `+0x35a6`, `+0x34ca` (minding the cursor), whether it is placed so (`GetSpriteScreenArea` of 0x1d, 1), and the mouse's own state (its machine's `+0x3a`). */
  x35a6?: number;
  x34ca?: number;
  area1?: boolean;
  mouseState?: number;
}

/** What a tick of a global state did: its moment readied, and the global states begun after, as their beginning goes; or, attacking, the mouse hole run to. */
export interface CatzGlobalTicked {
  moment?: CatzPreMoment;

  /** What the state left pushed, where it pushed anything. */
  pushes?: number[];

  /** Not begun here (`begin` false): the global state to begin. */
  global?: number;
  begun?: CatzGlobalBegun;
  kind?: number;
  x35ac?: number;
  x35a2?: number;
  state?: number;
}

/**
 * A tick of a global state, its handler neither entering nor leaving: for
 * most, the cursor about (`PetParams` `+0x46`), its moment readied
 * (`PreMoment` 6, 0x93, watching) and had (8, begun as its beginning goes):
 *
 * - idling (6, seg24:01d7), resting (9, seg30:00b5), affectionate (14,
 *   seg30:0fb4), eating (3, seg22:0621): so;
 * - playing (15, seg29:0b16) and chasing (16, seg19:00c5): so, not after
 *   the mouse (0x1b);
 * - the moment (8, seg25:012f): so, placed so (1), not walking to the
 *   cursor (`+0x35a6` 0x17) and minding it (`+0x34ca`);
 * - attacking (1, seg14:024e): after the mouse, the mouse's own state 1,
 *   inclined to behaviour 7 and under its age, it runs to the mouse hole
 *   (`+0x35a4`, `+0x35a6` 0xe, `+0x35ac` 1, `+0x35a2` 0, 22), else its
 *   moment readied not watching; after anything else, the cursor about and
 *   not inclined to behaviour 14, its moment.
 *
 * - having its victim (2, `DoGSHasVictim`, seg33:154e), and petted (7,
 *   `DoGSPetting`): the cursor about, its moment, watching.
 *
 * Others are not reimplemented: nothing. Where whoever ticks it begins the
 * global state asked itself (`begin` false), it is given as `global`.
 */
export function catzGlobalTick(
  global: number,
  mind: CatzMind,
  world: CatzGlobalTickWorld,
  random: (n: number) => number,
  { begin = true }: { begin?: boolean } = {}
): CatzGlobalTicked {
  const moment = (watching: boolean): CatzGlobalTicked => {
    const ready = catzPreMoment(mind, world.area3, 6, 0x93, watching, random);
    /* The state left as the moment begins: playing asks behaviour 9 for what it pushes. */
    const pushes = global === 15 ? catzGlobalLeave(global, mind, random) : undefined;
    return begin
      ? { moment: ready, pushes, begun: catzGlobalBegin(8, mind, world, random) }
      : { moment: ready, pushes, global: 8 };
  };
  const about = world.cursorAbout;

  switch (global) {
    case 6:
    case 9:
    case 14:
    case 3:
    case 2:
    case 7:
    case 20:
      return about ? moment(true) : {};
    case 15:
    case 16:
      return about && world.x35a4 !== 0x1b ? moment(true) : {};
    case 8:
      return about && world.area1 && world.x35a6 !== 0x17 && world.x34ca ? moment(true) : {};
    case 1: {
      if (world.x35a4 === 0x1b) {
        if (world.mouseState !== 1) {
          return {};
        }

        if (catzBehavior(mind, 7, random) !== 0 && random(101) < mind.brains[CATZ_BRAIN.age]) {
          return { kind: 0xe, x35ac: 1, x35a2: 0, state: 22 };
        }

        return moment(false);
      }

      return about && catzBehavior(mind, 0xe, random) === 0 ? moment(true) : {};
    }
    default:
      return {};
  }
}

/**
 * A global state left (its handler leaving), as far as it draws or pushes:
 * playing (15, seg29:0aa4), inclined to behaviour 9, pushes 0x141, else its
 * slot `0x1fc`; and turns its head (slot `0xe0`, 2500). Idling, resting and
 * attacking call their slot `0x1fc` and the moment its `+0x1996`'s slot
 * `0x30`, drawing nothing.
 */
export function catzGlobalLeave(
  global: number,
  mind: CatzMind,
  random: (n: number) => number
): number[] | undefined {
  if (global === 15) {
    return catzBehavior(mind, 9, random) !== 0 ? [0x141] : [];
  }

  return undefined;
}
