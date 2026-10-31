/**
 * A Catz cat's own states, a tick at a time, once its script is done: what
 * each does then, and which it goes to next (CATZDLL.DLL's `DoCat…`
 * handlers). See kb/topics/catz-behaviour.md ("States of its own").
 */

import { type CatzMind, catzBehavior, catzSound, mapCatzValue } from './catz-behavior.ts';
import { CATZ_TURN } from '../render/raster.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

/** The cat's own states these model, by CATZDLL.DLL's numbers (`eKatState_…`). */
export const CATZ_STATE = {
  lookAtObjects: 12,
  preExplore: 13,
  passTheTime: 19,
  locomote: 22,
  performLocomote: 23,
  tired: 26,
  dozing: 27,
  sleep: 28,
  wakeup: 29,
  sharpenClaws: 32,
  swatting: 56,
  preStalking: 1,
  stalking: 2,
  begging: 35,
  pouncing: 3,
  mayEndSwatting: 57,
  victimCaptured: 5,
  victimWrestle: 6,
  carryVictim: 7,
  lazyWatch: 30,
  snagPouncing: 8,
  snagging: 9,
  postSnagging: 10,
  postDangling: 34,
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

  /** Looking at things: what it is curious about (`+0x362c` on, to the first 0), ticks to its next look (`+0x3504`), and `+0x1500`. */
  curiosities?: number[];
  ticks?: number;
  x1500?: number;

  /** Exploring: the stage (CATZDLL's `ds:2ba6` to `2bac`), the cat's width and height (`+0x33c4`, `+0x33c6`), its target point (`GetTargetPt`, space 0), the draw rectangle of its kin 0x22 (`GetKin`), and the cursor's (`PetParams` `+0x104` to `+0x10a`; all 0 where it has not moved). */
  stage?: CatzBox;
  size?: { width: number; height: number };
  point?: { x: number; y: number };
  kin?: CatzBox;
  cursor?: CatzBox;

  /** Whether the state is being entered. */
  enter?: boolean;

  /** Walking: its mode (`+0x3508`), `+0x35fc`, the kind of sprite it walks to (`+0x35a6`, 0 for a point), `+0x35a2`, `+0x35ac`, and where it walks to (`+0x34cc`, `+0x34ce`). */
  mode?: number;
  x35fc?: number;
  x35a6?: number;
  x35a2?: number;
  x35ac?: number;
  goal?: { x: number; y: number };

  /** Whether the cat's place on the stage is 1 (`GetSpriteScreenArea`, 0x1d). */
  area1?: boolean;

  /** Walking on: its draw rectangle, `+0x688` (the angle steering left it), `+0x35a8`, `+0x35f4`, `+0x35ee` and `+0x35a4`, whether the shelf holds a kind of sprite, and `PetParams` `+0xc4`. */
  rect?: CatzBox;
  x688?: number;
  x35a8?: number;
  x35f4?: number;
  x35ee?: number;
  x35a4?: number;
  inShelf?: (kind: number) => boolean;
  c4?: number;

  /** Walking on: `+0x35aa` (there before), and whether `PopScript` finds what it walks to in its box (answering 2). */
  x35aa?: number;
  found?: boolean;

  /** Swatting: how what it plays with lies to its paw, and its swat's fields. */
  swat?: CatzSwat;

  /** Whether a layered action plays already (`GetLayeredFramesRemaining`). */
  layeredPlaying?: boolean;

  /** Stalking: where its prey (`+0x35a4`) is, whether the user holds it, and the stalk's action (`+0x35b8`, -1 for none). */
  prey?: { x: number; y: number };
  preyHeld?: boolean;
  preyArea3?: boolean;
  x35b8?: number;

  /** Eating, there: whether the user holds what it walked to (`+0x35a6`), and `+0x35d2`. */
  walkedToHeld?: boolean;
  x35d2?: number;

  /** Walking on: where what it walks to (`+0x35a6`) is, its target point, where that is not its goal (`+0x34cc`). */
  walkedToAt?: { x: number; y: number };

  /** Begging: whether its script cued it (cue 6) as it was popped. */
  cued?: boolean;

  /** The cues it was given (`IsCued`), where known; and pouncing, whether it has caught its prey (`+0xee0`). */
  cues?: number[];
  caught?: boolean;

  /** Its victim: whether it has let it go (`+0x35be`), its way back to a neutral pose pushed. */
  released?: boolean;

  /** Watching lazily: how (`+0x35b6`), 1 or 2. */
  x35b6?: number;

  /** Snagging: the cursor's (kin 0x17) target point. */
  cursorAt?: { x: number; y: number };
}

/**
 * A layered action begun, where none plays (`LayerAnimation`, seg15:1a24,
 * beginning): by its type, one time in five inclined to behaviour 28, 0x1d9;
 * three times in four to 24, 0x1e0; three in four to 25, 0x1e2; under its
 * fear, to 27, 0x287 -- where `+0x1500` is one of the two given, or either
 * is -1.
 */
function catzLayerAnimation(
  mind: CatzMind,
  world: CatzStateWorld,
  tick: CatzStateTick,
  type: number,
  a: number,
  b: number,
  random: (n: number) => number
) {
  if (tick.layered !== undefined || world.layeredPlaying) {
    return;
  }

  const x1500 = world.x1500 ?? 0;
  const matches = a === -1 || a === x1500 || b === -1 || b === x1500;
  const [odds, behaviour, action] = [
    [20, 28, 0x1d9],
    [75, 24, 0x1e0],
    [75, 25, 0x1e2],
    [mind.brains[CATZ_BRAIN.fear], 27, 0x287],
  ][type];

  if (random(101) < odds && matches && catzBehavior(mind, behaviour, random) !== 0) {
    tick.layered = action;
  }
}

/**
 * How what a cat plays with (`+0x35a4`) lies to its paw, ball 0x31, as
 * `GetOrientationInfo` (seg29:1999) and `GetSwatMissDistance` (seg29:1b55)
 * give it -- the paw where the cat's balls put it on the stage, not
 * reimplemented here -- and the swat's own fields.
 */
export interface CatzSwat {
  /** Which way it faces the toy (0 to 3, by `+0x688`), and the toy less the paw. */
  facing: number;
  dx: number;
  dy: number;

  /** Cued to strike, where it pushed and swung after all: which way it faced the toy, and the toy less the paw, as it asked again. */
  again?: { facing: number; dx: number; dy: number };

  /** Cued to strike: `+0x3592`, whether the toy is on the shelf, whether the shelf is closed (`XApt::m_nShelfClosed`), and the toy's `+0x1d0`. */
  x3592?: number;
  shelved?: boolean;
  shelfClosed?: boolean;
  x1d0?: number;

  /** How far the paw is from the toy, and where it asks again, its script done, how far then. */
  miss: number;
  missAgain?: number;

  /** Whether the mouse (kin 0x1b) is in its state 1. */
  mouseRunning: boolean;

  /** `+0x358e`, its side; `+0x3594`, the zone it swatted in last; `+0x3596`. */
  side: number;
  zone: number;
  x3596: number;
}

/** The angle from one point to another (`PtToPtAngle`, seg14:1c93): `atan2` in 256ths of a turn, rounded toward 0 (seg48:17a2), and a quarter turn more (`add ax,0x40` at seg14:1cec, as steering's aim has it), the shorter way (`ShortestAngle`, seg48:1d00); 0x81 where they are one. */
export function catzPtToPtAngle(from: { x: number; y: number }, to: { x: number; y: number }) {
  const [dx, dy] = [from.x - to.x, from.y - to.y];

  if (!dx && !dy) {
    return 0x81;
  }

  const angle = Math.trunc((Math.atan2(dy, dx) * 256) / CATZ_TURN) + 64;

  /* As `ShortestAngle` has it: below -128 it gives -256 less the angle, which a quarter turn more than `atan2` never asks of it. */
  return angle > 128 ? angle - 256 : angle < -128 ? -256 - angle : angle;
}

/** How far apart two points are (`Dist`, seg48:1a21), rounded toward 0. */
export function catzDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.trunc(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

/** A rectangle, its edges. */
export interface CatzBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What the cat is curious about, looking at things (`GetCuriosities`,
 * seg24:2285, the cat's slot `0x240`), by its temperament and what is out of
 * the shelf, in turn: 0x1b where it is inclined to behaviour 25; 10 to 24;
 * inclined to 18, one time in two, 0xf under half of what its age leaves of
 * 100, one of 0xb, 0xc and 0xd, and, inclined to 26, 8 and 0xc; inclined to
 * 15, up to 5 of 0x17, 5, 6, 7 and 9; each kind of sprite of 1 to 13, 15,
 * 0x17 and 0x1b the shelf does not hold (`isSpriteInShelf`); and, inclined
 * to 20, one time in four, 4.
 */
export function catzCuriosities(
  mind: CatzMind,
  inShelf: (kind: number) => boolean,
  random: (n: number) => number
): number[] {
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const percent = () => random(101);
  const list: number[] = [];

  if (behave(25)) {
    list.push(0x1b);
  }

  if (behave(24)) {
    list.push(10);
  }

  if (behave(18) && percent() < 50) {
    if (percent() < Math.trunc((100 - mind.brains[CATZ_BRAIN.age]) / 2)) {
      list.push(0xf);
    }

    list.push([0xb, 0xc, 0xd][random(3)]);

    if (behave(26)) {
      list.push(8, 0xc);
    }
  }

  if (behave(15)) {
    const many = random(6);

    for (let n = 0; n < many; n++) {
      list.push([0x17, 5, 6, 7, 9][random(5)]);
    }
  }

  for (const kind of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 0x17, 0x1b]) {
    if (!inShelf(kind)) {
      list.push(kind);
    }
  }

  if (behave(20) && percent() < 25) {
    list.push(4);
  }

  return list;
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

  /** Exploring: where it walks to (`+0x34cc`, `+0x34ce`) and how (`+0x35a8`). */
  goal?: { x: number; y: number };
  explore?: number;

  /** Walking: its mode where it changed, where it put its marker (kin 0x16), and how it turned its head, in turn (`SetHeadTracking` on, `LookAtUser`). */
  mode?: number;
  marker?: { x: number; y: number };
  head?: ('track' | 'user' | 'off')[];

  /** All the actions it pushed, in turn. */
  pushes?: number[];

  /** Walking on: the words that set its steering (`targetSprite4`, 0x756d: what to, the box's width and height, and its share), the layered action begun, the sound made, `+0x688` (before the steering moves it on) and `+0x35aa` where set, and its fullness after. */
  steer?: number[];
  layered?: number;
  x688?: number;
  x35aa?: number;
  fullness?: number;

  /** There: `+0x33be` and `+0x34d0` where set, and whether the engine's way here reads what it never set (grooming, ways 4, 5, 8 and 9). */
  x33be?: number;
  x34d0?: number;
  unread?: boolean;

  /** Looking at things: ticks to its next look, and the sound it made (`MapAndPlayCatSound` 7), its action. */
  ticks?: number;
  sound?: number;
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
 * - sharpening its claws (32; `DoCatSharpenClaws`, seg30:0e84): entered, it
 *   pushes 0x13f; its script done, it idles (global 6);
 * - looking at things (12; `DoCatLookAtObjects`, seg24:0263): between looks
 *   it counts down; then, having looked at something, under its energy it
 *   may go on to do something with the last -- play (15) with most kinds,
 *   4 with 4, eat (3) with 0xb to 0xd, and 8 and 0xf where inclined to 26,
 *   attack (1) 0x17 and 0x1b where inclined to 7; else it looks at the next
 *   (`SetHeadTracking`), 9 to 58 ticks, and may make a sound (7) under a
 *   quarter of what its seriousness leaves of 100. With nothing left to look
 *   at, or without an age one time in two, it has its moment (8,
 *   `catzPreMoment`). Its script done, it pushes 0xc after 0x5f, else 0x93;
 * - walking (22; `DoCatLocomote`, seg25:01fc): entered, watching hard
 *   (mode 3), three times in four -- `+0x35fc` 0, not the screen saver nor
 *   affectionate already -- it turns affectionate instead (global 14, mode
 *   2). Else, walking to a point (`+0x35a6` 0, or `+0x35a2` 1), it keeps the
 *   point on the stage, but catnapping or in global states 16 and 17, and
 *   walks to its marker (kin 0x16) put there; nine times in ten, or
 *   attacking, it tracks it with its head, else looks at the user; placed
 *   so (1), not `+0x35ac` nor `+0x35a2`, it shies first where afraid (0xdc)
 *   and pushes 0xd7. Its script done, it tracks what it walks to and goes
 *   on (`performLocomote`, 23);
 * - exploring (13; `DoCatPreExplore`, seg24:05d1): it chooses where to
 *   walk (`locomote`): to the stage's left or right, a little in from it,
 *   level with its target point; 250 below that point, or, too low, up by
 *   the stage's top; or beside its kin 0x22, or the cursor where it has
 *   moved, four times in five -- left or right of it where there is room, a
 *   side at random where both, idling (6) where neither, 250 below its top;
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
    case CATZ_STATE.sharpenClaws:
      return world.enter ? done({ pushed: 0x13f }) : done({ global: 6 });
    case CATZ_STATE.swatting:
      return catzSwatting(mind, world, random);
    case CATZ_STATE.preStalking: {
      /* `DoCatPreStalking`, seg14:03cf: entered, it tracks what it plays with with its head (3000), and pushes 0xdf where inclined to behaviour 7, then 0x13d; its script done, it stalks (2). */
      if (world.enter) {
        const pushes = [...(catzBehavior(mind, 7, random) !== 0 ? [0xdf] : []), 0x13d];
        return done({ pushed: pushes[0], pushes, head: ['track'] });
      }

      return done({ state: CATZ_STATE.stalking });
    }
    case CATZ_STATE.stalking:
      return catzStalking(mind, world, random);
    case CATZ_STATE.begging:
      return catzBegging(mind, world, random);
    case CATZ_STATE.pouncing:
      return catzPouncing(mind, world, random);
    case CATZ_STATE.victimCaptured:
    case CATZ_STATE.victimWrestle:
      return catzVictim(state, mind, world, random);
    case CATZ_STATE.snagPouncing: {
      /* `DoCatSnagPouncing`, seg14:1261: entered, not readied to pounce (`+0x1500` 0x14), it stalks again (2); else it aims at the cursor's (kin 0x17) target point, kept at `+0x34cc` (its words 0x7534, 0x42, there, 0x756f), and pushes 0x156, its slot `0x170` with 5. Its script done, the cursor where it was, it snags (9); else it walks to its prey (22, `+0x35a6` the prey's kind, `+0x35ac` 1). */
      if (world.enter) {
        return world.x1500 !== 0x14
          ? done({ state: CATZ_STATE.stalking })
          : done({ pushed: 0x156, pushes: [0x156], goal: world.cursorAt });
      }

      const at = world.cursorAt;
      return at && world.goal && at.x === world.goal.x && at.y === world.goal.y
        ? done({ state: CATZ_STATE.snagging })
        : done({ state: CATZ_STATE.locomote, x35a6: world.x35a4 });
    }
    case CATZ_STATE.snagging: {
      /* `DoCatSnagging`, seg14:13c4, whose ticks carry what it snags along with its paw: what it plays with neither the cursor (0x17), nor held, nor on the shelf, it has it (its slots `0x9c` 2, `0xf0`, `0xf8`), and food (8, 0xb to 0xd) it lets go to (`PushTransitionToNeutralPos` 8) and goes on to (10), the rest its victim (5) -- its script done or not. Else, its script done, one time in ten it lets go (`0x9c` 2) and goes to 0x22, else turns its fudger by -4 to 3 and pushes 0x158. */
      const kind = world.x35a4!;

      if (kind !== 0x17 && !world.preyHeld && !world.inShelf?.(kind)) {
        return done({
          state: [8, 0xb, 0xc, 0xd].includes(kind)
            ? CATZ_STATE.postSnagging
            : CATZ_STATE.victimCaptured,
        });
      }

      if (percent() < 10) {
        return done({ state: 0x22 });
      }

      random(8);
      return done({ pushed: 0x158, pushes: [0x158] });
    }
    case CATZ_STATE.postSnagging: {
      /* `DoCatPostSnagging`, seg14:174d: its script done, it lets go (its slot `0xfc`), and food it eats (global 3), 8 and 0xb with `+0x35ce` 2, 0xc and 0xd with 1. */
      const kind = world.x35a4!;
      return [8, 0xb, 0xc, 0xd].includes(kind) ? done({ global: 3 }) : done({});
    }
    case CATZ_STATE.postDangling:
      return catzPostDangling(mind, world, random);
    case CATZ_STATE.lazyWatch: {
      /* `DoCatLazyWatch`, seg30:1695: entering, it tracks what it plays with with its head (2000); leaving, it stops; its script done, one time in five, as it watches (`+0x35b6`), it idles (global 6) or rests (9), else pushes 0x93 or 0x8c. */
      const goes = percent() < 20;

      if (world.x35b6 === 1) {
        return done(goes ? { global: 6 } : { pushed: 0x93 });
      }

      if (world.x35b6 === 2) {
        return done(goes ? { global: 9 } : { pushed: 0x8c });
      }

      return done({});
    }
    case CATZ_STATE.carryVictim:
      /* `DoCatCarryVictim`, seg33:15ac: its script done, it lets its victim go (its slot `0x238`) and walks on, to nothing (22). */
      return done({ state: CATZ_STATE.locomote, x35a6: 0 });
    case CATZ_STATE.mayEndSwatting:
      return catzMayEndSwatting(mind, world, random);
    case CATZ_STATE.lookAtObjects: {
      const list = world.curiosities ?? [];
      const brain = (n: number) => mind.brains[n];
      let ticks = world.ticks ?? 0;
      const tick: Partial<CatzStateTick> = {};

      if (ticks !== 0) {
        ticks--;
      } else {
        if (count >= 1 && percent() < brain(CATZ_BRAIN.energy)) {
          const kind = list[count - 1] ?? 0;
          tick.x35a4 = kind;
          const of = (n: number) => catzBehavior(mind, n, random) !== 0;
          const global = (() => {
            switch (kind) {
              case 4:
                return 4;
              case 8:
              case 0xf:
                return of(26) ? 3 : 15;
              case 0xb:
              case 0xc:
              case 0xd:
                return 3;
              case 0x17:
              case 0x1b:
                return of(7) ? 1 : 15;
              case 1:
              case 2:
              case 3:
              case 5:
              case 6:
              case 7:
              case 9:
              case 10:
                return 15;
            }
          })();

          if (global !== undefined) {
            return done({ ...tick, global, ticks });
          }
        }

        const kind = list[count] ?? 0;

        if (kind === 0 || (brain(CATZ_BRAIN.age) === 0 && percent() < 50)) {
          const moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
          return done({ ...tick, global: 8, moment, ticks });
        }

        count++;
        ticks = random(50) + 9;

        if (percent() < 70) {
          random(20);
        }

        if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.seriousness)) / 4)) {
          tick.sound = catzSound(mind, 7, random);
        }
      }

      return done({ ...tick, ticks, pushed: world.x1500 === 0x5f ? 0xc : 0x93 });
    }
    case CATZ_STATE.locomote: {
      if (!world.enter) {
        return done({ state: CATZ_STATE.performLocomote, head: ['track'] });
      }

      const tick: Partial<CatzStateTick> = { head: [], pushes: [] };

      if (
        world.mode === 3 &&
        percent() < 75 &&
        !world.x35fc &&
        !world.screenSaver &&
        world.global !== 14
      ) {
        return done({ mode: 2, global: 14 });
      }

      let target = world.x35a6 ?? 0;

      if (target === 0 || world.x35a2 === 1) {
        const stage = world.stage!;
        const goal = { ...world.goal! };

        if (world.global !== 21 && world.global !== 17 && world.global !== 16) {
          goal.x = Math.min(stage.right, Math.max(stage.left, goal.x));
          goal.y = Math.min(stage.bottom, Math.max(stage.top, goal.y));
        }

        target = 0x16;
        tick.goal = goal;
        tick.marker = goal;
      }

      tick.x35a6 = target;
      /* Looking at the user turns its head's tracking off (`SetHeadTracking` 0) as it does. */
      tick.head!.push(
        ...(percent() < 90 || world.global === 1
          ? ['track' as const]
          : ['user' as const, 'off' as const])
      );

      if (world.area1 && !world.x35ac && !world.x35a2) {
        if (mind.brains[CATZ_BRAIN.fear] > 49) {
          tick.pushes!.push(0xdc);
        }

        tick.pushes!.push(0xd7);
      }

      if (tick.pushes!.length) {
        return done({ ...tick, pushed: tick.pushes![0] });
      }

      tick.head!.push('track');
      return done({ ...tick, state: CATZ_STATE.performLocomote });
    }
    case CATZ_STATE.performLocomote: {
      const walked = catzWalkOn(mind, world, random);
      return { ...walked, pushed: walked.pushes?.[0] };
    }
    case CATZ_STATE.preExplore: {
      const stage = world.stage!;
      const { width, height } = world.size!;
      const point = world.point!;
      const cursor = world.cursor!;
      let way = random(world.screenSaver ? 3 : 5);
      const moved =
        cursor.left !== 0 || cursor.top !== 0 || cursor.right !== 0 || cursor.bottom !== 0;
      const chasing = moved && percent() < 80;
      let goal: { x: number; y: number };
      let explore: number;

      if (chasing) {
        way = 3;
      }

      if (way === 0) {
        explore = 1;
        goal = { x: width + stage.left, y: point.y };
      } else if (way === 1) {
        explore = 2;
        goal = { x: stage.right - width, y: point.y };
      } else if (way === 2) {
        explore = 3;
        const half = Math.trunc(height / 2) * 2;
        goal = { x: point.x, y: point.y + 250 };

        if (goal.y > stage.bottom - half) {
          goal.y = half + stage.top;
        }
      } else {
        const box = chasing ? cursor : world.kin!;
        const half = Math.trunc(width / 2);
        const high = stage.top + 20 < box.top;
        const left = half + stage.left < box.left - width && high;
        const right = stage.right - half > box.right + width && high;

        if (!left && !right) {
          return done({ global: 6 });
        }

        explore = left && right ? (percent() < 50 ? 4 : 5) : left ? 4 : 5;
        goal = { x: explore === 4 ? box.left - width : box.right + width, y: box.top + 250 };

        if (chasing) {
          explore += 4;
        }
      }

      return done({ state: CATZ_STATE.locomote, goal, explore, x35a6: 0 });
    }
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

/**
 * A tick of walking on (23; `DoCatPerformLocomote`, seg25:07c6), not
 * entered, its script done, walking to its marker (`+0x35a6` 0x16), until
 * it is there (`+0x35aa` 0): see `catzStateTick`.
 */
function catzWalkOn(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const percent = () => random(101);
  const stage = world.stage!;
  const { width, height } = world.size!;
  const at = world.point!;
  const G = world.global;
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
    head: [],
  };
  const push = (action: number) => tick.pushes!.push(action);
  const age = brain(CATZ_BRAIN.age);
  let mark = { ...(world.walkedToAt ?? world.goal!) };
  let kind = world.x35a6 ?? 0x16;
  let walkedTo = kind;
  let moved = false;

  /* Its marker kept on the stage, but catnapping or in global states 16 and 17. */
  if (G !== 21 && G !== 17 && G !== 16) {
    const kept = {
      x: Math.min(stage.right, Math.max(stage.left, mark.x)),
      y: Math.min(stage.bottom, Math.max(stage.top, mark.y)),
    };

    if (kept.x !== mark.x || kept.y !== mark.y) {
      mark = kept;
      tick.marker = kept;
      walkedTo = 0x16;
      moved = true;
    }
  }

  /* Past 20 strides, but catnapping or in 16 and 17, it gives up its goal for the stage's middle. */
  const givenUp = world.count > 20 && G !== 21 && G !== 17 && G !== 16;
  let g = G;

  if (givenUp) {
    kind = 0x16;
    tick.x35a6 = 0x16;
    mark = {
      x: Math.trunc((stage.right - stage.left) / 2) + stage.left,
      y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top,
    };
    tick.marker = mark;
    tick.head!.push('off');
    tick.mode = 1;
    g = 0;
  } else {
    tick.count = world.count + 1;
  }

  let x688 = world.x688 ?? 0;
  const rect = world.rect!;
  const onStage =
    rect.right > stage.left &&
    rect.left < stage.right &&
    rect.bottom > stage.top &&
    rect.top < stage.bottom;

  if (!onStage) {
    x688 = catzPtToPtAngle(at, mark);
    tick.x688 = x688;
  }

  /* Steering (`targetSprite4`): the box it looks for its marker in, by its global state. */
  let near = world.area1 ?? false;
  let within = 0x60;
  let chance = 0;
  let box = [width, height, 4];
  const notArea3 = !world.area3;
  /* Attacking, it may be there at once, facing what it walks to. */
  let pounces = false;

  switch (g) {
    case 1:
      /* Attacking: 0xe its width and height, share 3; else twice, share 4, within 0x80, and, without `+0x35a2`, there at once where it faces within 10 of what it walks to and is serious (50 or more) or one time in ten. */
      near = notArea3;

      if (world.x35a4 === 0xe) {
        box = [width, height, 3];
        break;
      }

      box = [width * 2, height * 2, 4];
      within = 0x80;

      if (!world.x35a2) {
        const off = catzPtToPtAngle(at, mark) - x688;
        pounces =
          off >= -10 && off <= 10 && (brain(CATZ_BRAIN.seriousness) >= 50 || percent() < 10);
      }
      break;
    case 3:
    case 4:
      box = [width * 2, height * 2, 4];
      near = notArea3;
      break;
    case 8:
      chance = 20;
      break;
    case 0xd:
      box = world.c4 ? [width, height, 4] : [Math.trunc(width / 2), height, 10];
      break;
    case 0xe:
      box = [width, height, 3];
      break;
    case 0xf:
      box = [Math.trunc((width * 3) / 2), Math.trunc((height * 3) / 2), 3];
      near = notArea3;
      break;
    case 0x10:
      box = [width * 2, height * 2, 1];
      near = true;
      within = 0x80;
      break;
    case 0x14:
      box = [width * 2, height * 2, 4];
      break;
    case 0x15:
      box = [width * 2, height * 2, 4];
      within = 0x80;
      break;
    case 0x16:
      box = [width * 2, height * 2, 4];
      within = 0x80;
      break;
  }

  tick.steer = [0x756d, walkedTo, ...box, 0x756f];

  const aligned = world.inShelf!(kind)
    ? x688 <= -64 || x688 >= 64
    : x688 >= -within && x688 <= within;

  if (pounces || ((world.found || percent() < chance) && aligned && near)) {
    if (G === 16) {
      tick.state = 4;
      tick.x35aa = world.x35aa;
    } else if (world.x35aa) {
      tick.x35aa = 0;
      catzArrive(mind, world, tick, moved, x688, random);
    } else if (givenUp) {
      /* Having given up: on the Adoption Kit, grooming (0xd) and inclined to behaviour 24, its state 0x1f; else it idles. */
      if (world.c4 && G === 0xd && behave(24)) {
        tick.state = 0x1f;
      } else {
        tick.global = 6;
      }
    } else {
      /* Its transition to a neutral pose (`PushTransitionToNeutral` 0x6b), by its pose: not reimplemented. */
      tick.x35aa = 1;
      tick.pushes = undefined;
    }

    return tick;
  }

  /* On the way: the next stride. */
  tick.x35aa = 0;
  const distance = catzDist(mark, at);

  if (behave(26) && percent() < Math.trunc((100 - brain(CATZ_BRAIN.energy)) / 2)) {
    push(0x2a6);
  }

  if (world.area3) {
    push(0x254);
    return tick;
  }

  /* Found but not there: its steering stopped (`targetSprite4` all 0), 0x254. */
  if (world.found && G !== 21) {
    push(0x254);
    return tick;
  }

  const fleas = brain(CATZ_BRAIN.fleas);

  if (
    fleas >= 50 &&
    percent() < Math.trunc((fleas - 50) / 2) &&
    G !== 21 &&
    brain(CATZ_BRAIN.fear) < 75 &&
    world.area1
  ) {
    if (fleas > catzBehavior(mind, 13, random) && percent() < 50) {
      tick.global = 13;
    } else {
      push(0x26a);
    }

    return tick;
  }

  if (percent() < Math.trunc(brain(CATZ_BRAIN.catnipped) / 2) && world.area1) {
    push(0x27b);
    return tick;
  }

  const runs =
    (width * 4 < distance && (G !== 13 || world.c4) && brain(CATZ_BRAIN.energy) > 20) ||
    G === 16 ||
    (G === 17 && (width * 3 < distance || world.x35f4)) ||
    (G === 21 && world.x35ee === 10);

  if (runs) {
    if (percent() < Math.trunc((100 - age) / 20) + 1 && age !== 0 && world.area1) {
      tick.state = 25;
      return tick;
    }

    push(age < 50 ? 10 : 0x254);

    /* Tired and hungry by it (`CatGetsTiredAndHungry` 1, 1, seg16:36fb). */
    if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
      tick.energy = Math.max(0, tick.energy - 1);
    }

    if (percent() < 10) {
      tick.fullness = Math.max(0, tick.fullness! - 1);
    }

    return tick;
  }

  if (
    G === 15 &&
    world.x35a4 !== 12 &&
    world.area1 &&
    percent() < Math.trunc((100 - age) / 5) + 5
  ) {
    tick.sound = catzSound(mind, 10, random);
    push(age === 0 ? 0x2aa : 0xf1);
    return tick;
  }

  if (brain(CATZ_BRAIN.fear) >= 50 && percent() < 15 && G !== 22 && G !== 17 && world.area1) {
    tick.sound = catzSound(mind, 10, random);
    push(age === 0 ? 0x2ab : 0x296);
    return tick;
  }

  /* Its layered actions as it goes (`StartLocomotionLayering`, seg25:4521). */
  const layer = (type: number, a: number, b: number) =>
    catzLayerAnimation(mind, world, tick, type, a, b, random);

  if (brain(CATZ_BRAIN.energy) > 25) {
    layer(0, 0x74, 0x76);
  }

  layer(1, -1, -1);
  layer(2, -1, -1);
  layer(3, -1, -1);

  const near3 =
    (G === 13 &&
      !world.c4 &&
      Math.abs(catzPtToPtAngle(at, world.goal!) - x688) <= 30 &&
      width * 4 > distance &&
      world.x35a8 !== 3) ||
    (brain(CATZ_BRAIN.fear) >= 50 && width * 3 > distance && G !== 17 && G !== 22);

  if (near3) {
    push(age < 50 ? 3 : 0);
    return tick;
  }

  if (
    percent() < 100 - brain(CATZ_BRAIN.energy) &&
    kind !== 0xc &&
    kind !== 0xf &&
    kind !== 0xb &&
    G !== 22 &&
    behave(26)
  ) {
    push(0x2af);
  } else {
    push(age < 50 ? 0xb7 : 5);
  }

  return tick;
}

/**
 * There, past the first time (`+0x35aa` 1): what the cat walked there for,
 * by its global state (seg25:141f to 21fe). `moved` is whether its marker
 * was moved onto the stage this tick.
 */
function catzArrive(
  mind: CatzMind,
  world: CatzStateWorld,
  tick: CatzStateTick,
  moved: boolean,
  x688: number,
  random: (n: number) => number
) {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const stage = world.stage!;
  const middle = {
    x: Math.trunc((stage.right - stage.left) / 2) + stage.left,
    y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top,
  };
  const age = brain(CATZ_BRAIN.age);
  /* The moment readied (`PreMoment`, after it idling, 0x93 meanwhile, not watching) and had: where the switch goes on to seg25:21aa. */
  const walkTo = (goal: { x: number; y: number }) => {
    if ((tick.x35a6 ?? world.x35a6) === 0x16) {
      tick.marker = goal;
    }
  };
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
  };

  switch (world.global) {
    case 1:
      if (moved) {
        return moment();
      }

      tick.state = world.x35a4 === 0xe ? 0xb : !world.x35a2 || age === 0 ? 2 : 1;
      return;
    case 2:
      tick.state = 7;
      return;
    case 3: {
      if (moved) {
        return moment();
      }

      /* Eating: its food off the shelf -- 0xc with `+0x35d2` -- it aligns to eat it (0x26), or, the user holding it, begs (0x23), waits for the treat (0x24) for 0xb; 0xf goes to global state 5. On the shelf, it begs. The marker: hiding its food (0x29), inclined to behaviour 27, else grooming (global 13). Another kind reads what nothing set (`bp-0x1c`). */
      const kind = world.x35a6!;
      let off: boolean;

      if (kind === 8 || kind === 0xb || kind === 0xd || kind === 0xf) {
        off = !world.inShelf!(kind);
      } else if (kind === 0xc) {
        off = !world.inShelf!(kind) && world.x35d2! > 0;
      } else if (kind === 0x16) {
        if (catzBehavior(mind, 27, random) !== 0) {
          tick.state = 0x29;
        } else {
          tick.global = 13;
        }

        return;
      } else {
        tick.unread = true;
        return;
      }

      if (off && kind === 0xf) {
        tick.global = 5;
      } else if (off && kind === 0xb) {
        tick.state = world.walkedToHeld ? 0x24 : 0x26;
      } else {
        tick.state = off && !world.walkedToHeld ? 0x26 : 0x23;
      }

      return;
    }
    case 5:
      if (moved) {
        return moment();
      }

      tick.state = 0x2e;
      return;
    case 6: {
      const { width } = world.size!;
      const above = () => world.point!.y - (random(100) + 150);
      const kin = world.kin!;
      const cursor = world.cursor!;

      switch (world.x35a8) {
        case 1:
          tick.goal = { x: stage.left, y: above() };
          break;
        case 2:
          tick.goal = { x: stage.right, y: above() };
          break;
        case 3:
          tick.goal = { x: world.goal!.x, y: above() };
          break;
        case 4:
        case 5:
          tick.goal = { x: Math.trunc((kin.right - kin.left) / 2) + kin.left, y: kin.top };
          break;
        case 8:
          tick.goal = { x: width + cursor.left, y: cursor.top };
          break;
        case 9:
          tick.goal = { x: cursor.right - width, y: cursor.top };
          break;
      }

      tick.explore = world.x35a8;
      /* What it walks to is moved to its goal (its method `0x44`). */
      walkTo(tick.goal ?? world.goal!);
      tick.state = 14;
      return;
    }
    case 8:
      tick.state = 0x15;
      return;
    case 0xb:
      tick.global = 13;
      return;
    case 0xd: {
      if (world.c4) {
        tick.state = 0x1f;
        return;
      }

      /* Grooming: a place by how it went (`+0x35a8`), its width times 0.55 (`ds:0x372`) in from an edge -- the stage's or its kin 0x22's -- and the angles it must face within. */
      const reach = world.size!.width * 0.55;
      const kin = world.kin!;
      const ways: Record<number, [number, number, number?, number?]> = {
        1: [0x22, 0x5e, 0x40, Math.trunc(reach + stage.left)],
        2: [-0x5e, -0x22, -0x40, Math.trunc(stage.right - reach)],
        3: [-10, 10],
        6: [-0x5e, -0x22, -0x40, Math.trunc(kin.left - reach)],
        7: [0x22, 0x5e, 0x40, Math.trunc(reach + kin.right)],
      };
      const way = ways[world.x35a8 ?? 0];

      if (!way) {
        tick.unread = true;
        return;
      }

      const [low, high, facing, x] = way;

      if (facing !== undefined) {
        tick.x34d0 = facing;
        tick.goal = { x: x!, y: world.goal!.y };
      }

      if (x688 > low && x688 < high) {
        if (world.x35a8 !== 3) {
          walkTo(tick.goal ?? world.goal!);
        }

        tick.state = world.x35a8 === 3 ? 0x20 : 0x18;
      } else {
        tick.state = 0x1f;
      }

      return;
    }
    case 0xe:
      if (age === 0 && catzBehavior(mind, 26, random) !== 0 && world.area1 && percent() < 75) {
        tick.pushes!.push(0x2a6, 0x8c, 0x8c, 0x8c);

        tick.state = 0x16;
        return;
      }

      return moment();
    case 0xf:
      if (moved) {
        return moment();
      }

      tick.state =
        world.x688! >= -32 &&
        world.x688! <= 32 &&
        (world.x35a6 === 0xc || world.x35a6 === 8) &&
        world.inShelf!(world.x35a6)
          ? 0x16
          : 0x38;
      return;
    case 0x10:
      if (moved) {
        return moment();
      }

      return;
    case 0x14:
      if (percent() < 50) {
        tick.x35a6 = 0;
        tick.state = 0x16;
        return;
      }

      return moment();
    case 0x15:
      if (world.x35ee !== 10) {
        tick.state = world.x35ee === 0xb ? 0x47 : 0x41;
        return;
      }

      if (percent() > 24) {
        tick.explore = world.x35a8 === 1 ? 2 : 1;
        tick.state = 0x47;
        return;
      }

      tick.goal = middle;
      tick.explore = world.x35a8;
      tick.x35a6 = 0;
      tick.state = 0x16;
      return;
    case 0x16:
      tick.x33be = 3;
      tick.global = 0x16;
      return;
    default:
      return moment();
  }
}

/**
 * A swat (56; `DoCatSwatting`, seg29:0bd3), its script done and not cued to
 * strike (cue 5, the strike, is not reimplemented): by how far the toy is
 * above its paw, against its width times 0.8, 0.45, 0.3, 0.2 and -0.2
 * (`ds:0x386` to `0x3a6`), a zone, 8 down to 1, and the swat for it, one of
 * two by its side (`+0x358e`). In zone 8 again it may give up the toy
 * instead -- under `MapValue(10, 60, 100 - age)`, 0x138, and three times in
 * four walking off (22), else playing (global 15). Under a third of its
 * energy it makes a sound (10); it swats, tires and hungers, counts the swat
 * (two in zone 8), may change its side or `+0x3596`, and past a twentieth
 * of its energy in swats, one time in two -- or the mouse running -- may end
 * (57).
 */
function catzSwatting(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  let swat = world.swat!;
  let before: number[] = [];

  /* Cued to strike (cue 5, and `+0x3590` 1: where it turns its head to the toy). */
  if (world.cued) {
    const struck = catzStrike(mind, world, random);

    if ('tick' in struck) {
      return struck.tick;
    }

    ({ swat, before } = struck);
  }

  const width = world.size!.width;
  const up = -swat.dy;
  const over = (share: number) => Math.trunc(width * share) < up;
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  let zone: number;
  let left: number;
  let right: number;

  if (over(0.8)) {
    [zone, left, right] = [8, 0x5f, 0x60];

    if (swat.zone === 8 && percent() < mapCatzValue(10, 60, 100 - age)) {
      tick.pushes!.push(...before, 0x138);
      tick.pushed = before[0] ?? 0x138;

      if (percent() < 75) {
        tick.state = 0x16;
      } else {
        tick.global = 0xf;
      }

      return tick;
    }
  } else if (over(0.45)) {
    zone = 7;
    [left, right] = percent() < Math.trunc(age / 4) ? [0x27e, 0x27e] : [0xf4, 0xf5];
  } else if (over(0.3)) {
    [zone, left, right] = [6, 0x54, 0x59];
  } else if (over(0.2)) {
    if (swat.dx > 0 && swat.facing === 1) {
      [zone, left, right] = [4, 0x63, 0x63];
    } else if (swat.dx < -0x28 && swat.facing === 1) {
      [zone, left, right] = [5, 0x66, 0x66];
    } else {
      [zone, left, right] = swat.x3596 === 1 ? [3, 0x4b, 0x4f] : [3, 0x53, 0x58];
    }
  } else if (over(-0.2)) {
    [zone, left, right] = swat.x3596 === 1 ? [2, 0x4c, 0x50] : [2, 0x55, 0x5a];
  } else {
    [zone, left, right] = [1, 0x5c, 0x5d];
  }

  const action = swat.side ? right : left;

  if (percent() < Math.trunc(brain(CATZ_BRAIN.energy) / 3)) {
    tick.sound = catzSound(mind, 10, random);
  }

  tick.pushes!.push(...before, action);
  tick.pushed = before[0] ?? action;

  if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
    tick.energy = Math.max(0, tick.energy - 1);
  }

  if (percent() < 10) {
    tick.fullness = Math.max(0, tick.fullness! - 1);
  }

  tick.count = world.count + (zone === 8 ? 2 : 1);

  if (percent() < 30) {
    percent();
  } else if (percent() < 20) {
    percent();
  }

  if (Math.trunc(tick.energy / 20) < tick.count && percent() < 50) {
    tick.state = 0x39;
  } else if (world.x35a4 === 0x1b && swat.mouseRunning) {
    tick.state = 0x39;
  }

  return tick;
}

/**
 * Whether to stop swatting (57; `DoCatMayEndSwatting`, seg29:15d9), not
 * entered: the toy near (its paw missing it by under 100) -- and, where it
 * was near as it began (`+0x34ca`), one time in five -- and the mouse not
 * running, it swats again (56). Else, its script done, it counts; past a
 * twentieth of its energy it stops -- the toy far, or not inclined to
 * behaviour 8, or the mouse running -- for eating (3) after 0xb or 0xc, else
 * idling (6), or swats again; and otherwise pushes, by the zone it swatted in
 * last, 0x15 (1), one of two by its side (2 to 6), or 0x40 (7 and 8).
 */
function catzMayEndSwatting(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const swat = world.swat!;
  const mouse = world.x35a4 === 0x1b && swat.mouseRunning;
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (swat.miss < 100) {
    const stays = world.passed ? percent() > 19 : false;

    if (!stays && !mouse) {
      tick.state = 0x38;
      return tick;
    }
  }

  tick.count = world.count + 1;

  if (Math.trunc(brain(CATZ_BRAIN.energy) / 20) < tick.count) {
    if ((swat.missAgain ?? swat.miss) > 100 || catzBehavior(mind, 8, random) === 0 || mouse) {
      tick.global = world.x35a4 === 0xc || world.x35a4 === 0xb ? 3 : 6;
    } else {
      tick.state = 0x38;
    }

    return tick;
  }

  if (tick.count > 1) {
    catzBehavior(mind, 9, random);
  }

  const pick = (still: number, aged: number, other: number) =>
    swat.x3596 === 1 ? (age === 0 ? 0xd7 : still) : age !== 0 && percent() < 50 ? aged : other;

  switch (swat.zone) {
    case 1:
      tick.pushed = 0x15;
      break;
    case 2:
    case 3:
    case 4:
    case 5:
    case 6: {
      const left = pick(0x128, 0x2ba, 0x127);
      const right = pick(299, 699, 0x12a);
      tick.pushed = swat.side ? right : left;
      break;
    }
    case 7:
    case 8:
      tick.pushed = 0x40;
      break;
  }

  return tick;
}

/** `ShortestAngle` (seg48:1d00): an angle the shorter way, but below -128 -256 less it. */
function catzShortestAngle(angle: number) {
  return angle > 128 ? angle - 256 : angle < -128 ? -256 - angle : angle;
}

/**
 * A tick of stalking (2; `DoCatStalking`, seg14:050f), its script done, by
 * the angle it must turn to face its prey (`+0x35a4`; its angle to it less
 * `+0x688`, the shorter way) and how far it is. Far (400 or more) and not
 * serious (49 or less), it gives up and walks to it (22). Else, turned more
 * than 100 away, it turns: 0x239, under half of what its energy leaves of
 * 100, with an age; else 0x104 and 0x15. Then, the prey not placed so (3,
 * `GetSpriteScreenArea` of it), facing it within 29 and nearer than 400 --
 * or, nearer than 200, under its age -- unless a third of what its age leaves of 100
 * says no, and not afraid or seven times in ten, it pounces: diving (8),
 * where the prey is the cursor (0x17) or held, under `MapValue(0, 75, age)`,
 * else pouncing (3); otherwise it pushes 0x103. The cat itself placed so
 * (3), it makes for a corner away from the prey
 * (`TargetACornerToAvoidSprite`, `+0x35a2` 1) and walks there (22); else it
 * creeps on: its layered
 * actions (the mouse's: one time in four with an age, inclined to behaviour
 * 7, one of 0x2ff to 0x302; else `LayerAnimation` 0 and 3 by 0x6a or 0x14);
 * three times in four it creeps -- seven in ten its creep (`+0x35b8`, 0x6a
 * or 0x151 at random where none), steered at its angle, else 0xb1 or 0xb0
 * by which way it is turned, and 0x15 -- tiring and hungering; else 0x15,
 * and, inclined to behaviour 26, one time in ten 0x259 and idling (6).
 */
function catzStalking(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  const push = (action: number) => {
    tick.pushes!.push(action);
    tick.pushed ??= action;
  };
  const at = world.point!;
  const prey = world.prey!;
  const angle = catzPtToPtAngle(at, prey);
  const off = angle - (world.x688 ?? 0);
  const turn = catzShortestAngle(off);
  const distance = catzDist(at, prey);
  const age = brain(CATZ_BRAIN.age);

  if (distance >= 401 && brain(CATZ_BRAIN.seriousness) <= 49) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  if (turn > 100 || turn < -100) {
    if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.energy)) / 2) && age !== 0) {
      push(0x239);
    } else {
      push(0x104);
      push(0x15);
    }

    return tick;
  }

  /* Where the prey, not the cat, is placed so (3), it does not creep up. */
  if (!world.preyArea3) {
    let creeps = turn < -29 || turn > 29 || distance > 399;

    if (creeps && distance < 200 && percent() < age) {
      creeps = false;
    }

    if (!creeps) {
      if (
        percent() >= Math.trunc((100 - age) / 3) &&
        (brain(CATZ_BRAIN.fear) < 50 || percent() > 29)
      ) {
        const dives =
          (world.x35a4 === 0x17 || world.preyHeld) && percent() < mapCatzValue(0, 75, age);
        tick.state = dives ? 8 : 3;
        return tick;
      }

      push(0x103);
    }
  }

  if (world.area3) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  if (world.x35a4 === 0x1b && percent() < 25 && age !== 0 && catzBehavior(mind, 7, random) !== 0) {
    tick.layered = [0x2ff, 0x300, 0x301, 0x302][random(4)];
  } else {
    catzLayerAnimation(mind, world, tick, 0, 0x6a, 0x14, random);
    catzLayerAnimation(mind, world, tick, 3, 0x6a, 0x14, random);
  }

  if (percent() < 75) {
    if (percent() < 70) {
      const creep = world.x35b8 === -1 ? [0x6a, 0x151][random(2)] : world.x35b8!;
      push(creep);
    } else {
      push(off < 0 ? 0xb1 : 0xb0);
      push(0x15);
    }

    if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
      tick.energy = Math.max(0, tick.energy - 1);
    }

    if (percent() < 10) {
      tick.fullness = Math.max(0, tick.fullness! - 1);
    }
  } else {
    push(0x15);

    if (catzBehavior(mind, 26, random) !== 0 && percent() < 10) {
      push(0x259);
      tick.global = 6;
    }
  }

  return tick;
}

/**
 * Begging (35; `DoCatBegging`, seg22:0689). Cued (6) as its script is
 * popped, one time in two it makes a sound (its slot `0x2ac`, 6), and four
 * times in five tracks what it plays with (`+0x35a4`) with its head, else
 * looks at the user. For the bottle (0xf) it may suckle, every tick: not
 * reimplemented. Its script done -- for 4, having begged (`+0x34ca`), one
 * time in ten it idles (6); else, seven times in ten or not having begged,
 * it begs (0x2ac without an age; 0x1d0 inclined to behaviour 10; else
 * 0x146 under 15 energy, else 0x145) and has begged; else it eats (global
 * 3) where less full than behaviour 11 answers, or idles.
 */
function catzBegging(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.cued) {
    if (percent() < 50) {
      tick.sound = 6;
    }

    tick.head = [percent() < 80 ? 'track' : 'user'];
  }

  if (world.x35a4 === 0xf) {
    tick.unread = true;
    return tick;
  }

  const begged = world.passed !== 0;

  if (world.x35a4 === 4 && percent() <= 9 && begged) {
    tick.global = 6;
    return tick;
  }

  if (percent() > 29 || !begged) {
    const action =
      brain(CATZ_BRAIN.age) === 0
        ? 0x2ac
        : catzBehavior(mind, 10, random) !== 0
          ? 0x1d0
          : brain(CATZ_BRAIN.energy) < 15
            ? 0x146
            : 0x145;
    tick.pushed = action;
    tick.pushes = [action];
    tick.passed = 1;
    return tick;
  }

  tick.global = brain(CATZ_BRAIN.fullness) < catzBehavior(mind, 11, random) ? 3 : 6;
  return tick;
}

/**
 * A swat's strike (`DoCatSwatting`, seg29:0cee to 113b): cued (cue 5) with
 * `+0x3590` 1, it asks how the toy lies (writing the toy's point to
 * `+0x34cc`) and turns its head to it (3000). Facing it as 3, three times in
 * four it walks off (22), else plays (global 15). As 0 to 2, the paw more
 * than 100 off: the first time (`+0x3592`) it turns to its other side
 * (`+0x358e`), pushes 0xdf where not inclined to behaviour 8, or 0x141
 * where inclined to 9, and swings; again, it may end (57). Nearer, it
 * strikes -- on the shelf, open, only under 30 without an age, else 2 --
 * off its angle (`+0x688`) by up to 49 one way or the other by its side:
 * the cursor (0x17) it moves; from the open shelf it may take the toy into
 * the pen (`ShelfToPen`), and food (0xc, 0xd, 0xf) so taken has it eat
 * (global 3); the ball (5) off the shelf, nine times in ten, it swings
 * after all. Then, `+0x35ac` 1, three times in four it walks off (22), else
 * plays (15). Otherwise, facing another way, it swings as it was not cued.
 */
function catzStrike(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): { tick: CatzStateTick } | { swat: CatzSwat; before: number[] } {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const swat = world.swat!;
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  /* Swinging after all, it asks how the toy lies again. */
  const swing = (before: number[], side = swat.side) => ({
    swat: { ...swat, ...swat.again, side },
    before,
  });
  /* (`+0x35ac` is made 1.) */
  const leave = () => {
    if (percent() < 75) {
      tick.state = 0x16;
    } else {
      tick.global = 0xf;
    }

    return { tick };
  };

  if (swat.facing === 3) {
    if (percent() < 75) {
      tick.state = 0x16;
    } else {
      tick.global = 0xf;
    }

    return { tick };
  }

  if (swat.facing < 0 || swat.facing > 2) {
    return swing([]);
  }

  if (swat.miss > 100) {
    if (swat.x3592) {
      tick.state = 0x39;
      return { tick };
    }

    const side = swat.side === 1 ? 0 : 1;

    if (catzBehavior(mind, 8, random) === 0) {
      return swing([0xdf], side);
    }

    return swing(catzBehavior(mind, 9, random) !== 0 ? [0x141] : [], side);
  }

  const shelved = swat.shelved!;
  const open = shelved && !swat.shelfClosed;

  if (open && percent() >= (brain(CATZ_BRAIN.age) === 0 ? 30 : 2)) {
    return swing([]);
  }

  /* Its angle off `+0x688`, by up to 49 (`rand() % 50`), for where the toy goes. */
  random(50);

  if (world.x35a4 !== 0x17 && open) {
    /* `ShelfToPen` answers the cat's slot `0x14c` where the toy's `+0x1d0` is 0: not reimplemented. */
    if (swat.x1d0 === 0) {
      return { tick: { ...tick, unread: true } };
    }

    if (world.x35a4 === 0xc || world.x35a4 === 0xd || world.x35a4 === 0xf) {
      tick.global = 3;
      return { tick };
    }
  }

  if (world.x35a4 === 5 && percent() < 90 && !shelved) {
    return swing([]);
  }

  return leave();
}

/**
 * A pounce (3; `DoCatPouncing`, seg14:0c60). Entered: not readied to pounce
 * (`+0x1500` 0x14) it stalks again (2); else it aims at what it plays with
 * (`+0x35a4`, its target point to `+0x34cc`, led by 50 along the mouse's way
 * for the mouse), one time in two pushes 0xdf, and leaps (its words 0x7534,
 * 0x42 and where it aims, through its slot `0xa4`): under 200 away, 0x20f
 * one time in two or without an age, else 0x21b; farther, 0x2c5 where it
 * faces 33 to 95 either way (`+0x688`) and so lies the prey from it, with an
 * age, else 0x35. Cued to catch (2), with an age: food (8, 0xb) it eats
 * (global 3, `+0x35ce` 2); the mouse it may catch, by draws by its age; the
 * others it catches where it can. Its script done: having caught it
 * (`+0xee0`) with an age, the cursor (0x17) has it ready its moment
 * (watching), else it has its victim (5); else, three times in four without
 * an age, or under its energy with one, it walks to it (22); else idles (6).
 */
function catzPouncing(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.enter) {
    if (world.x1500 !== 0x14) {
      tick.state = 2;
      return tick;
    }

    const pushes = percent() < 50 ? [0xdf] : [];
    const at = world.point!;
    const prey = world.prey!;
    const distance = catzDist(at, prey);
    const angle = catzPtToPtAngle(at, prey);
    const x688 = world.x688 ?? 0;
    const aimed =
      Math.abs(x688) >= 33 &&
      Math.abs(x688) <= 95 &&
      Math.abs(angle) >= 33 &&
      Math.abs(angle) <= 95 &&
      age !== 0;
    const leap =
      distance < 200 ? (percent() < 50 || age === 0 ? 0x20f : 0x21b) : aimed ? 0x2c5 : 0x35;
    pushes.push(leap);
    tick.pushes = pushes;
    tick.pushed = pushes[0];
    return tick;
  }

  if (world.cues?.includes(2) && age !== 0) {
    if (world.x35a4 === 8 || world.x35a4 === 0xb) {
      tick.global = 3;
      return tick;
    }

    /* The mouse: caught at or over what its age leaves of 100, halved; else, with an age, over 69 of another draw. */
    if (world.x35a4 === 0x1b && percent() < 100 - Math.trunc(age / 2)) {
      percent();
    }
  }

  if (age !== 0 && world.caught) {
    if (world.x35a4 === 0x17) {
      tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
      tick.global = 8;
    } else {
      tick.state = 5;
    }

    return tick;
  }

  if ((age === 0 && percent() <= 74) || (age !== 0 && percent() < brain(CATZ_BRAIN.energy))) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  tick.global = 6;
  return tick;
}

/**
 * Its victim caught (5; `DoCatVictimCaptured`, seg19:06af) or wrestled
 * (6; `DoCatVictimWrestle`, seg19:0ab8). Entering, it holds it (its slots
 * `0xf0`, `0xf8`), has done nothing with it (`+0x34ca`) nor let it go
 * (`+0x35be`), and the mouse is stilled; leaving, unless let go, it throws
 * it (`StrikeToy`, a draw of the angle). Each tick, its script cued so (cue
 * 7), three times in four it makes the victim's sound
 * (`PlaySpriteContactSound`: the mouse's and 9's one of two) and one time in
 * five its own (`MapAndPlayCatSound`, 10 or 3 by a draw).
 *
 * Its script done, caught (5): let go, it walks off from the mouse (kin
 * 0x1b's `+0x26ca` 0x1d), puts it down (its slot `0xf0`, 7) and pushes
 * 0x269, and idles (global 2); having done something, under a third of its
 * liveliness, it lets go (`PushTransitionToNeutralPos` 0x20, by its script's
 * code); else nine times in ten it does something: the mouse, inclined to
 * behaviour 28 one time in two, it wrestles (6), else 0x232; 6 one time in
 * four or where `+0x1500` is 0x44 it wrestles, else 0x236; the others one
 * time in four it wrestles, else 0x233; the tenth time, it readies its moment
 * (`PreMoment`, after it idling, 0x93 meanwhile) and has it (global 8).
 *
 * Wrestled (6): nine times in ten, one time in four having done something
 * (which wrestling never sets) it is caught again (5); else 0x295 the mouse
 * or where inclined to behaviour 15 one time in four, 0x268 the others; the
 * tenth time its moment, as caught.
 */
function catzVictim(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const kind = world.x35a4;
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
    return tick;
  };
  const push = (action: number) => {
    tick.pushed = action;
    tick.pushes = [action];
    return tick;
  };

  if (world.cues?.includes(7)) {
    if (percent() < 75 && (kind === 9 || kind === 0x1b)) {
      random(2);
    }

    if (percent() < 20) {
      tick.sound = catzSound(mind, percent() < 50 ? 10 : 3, random);
    }
  }

  if (state === CATZ_STATE.victimWrestle) {
    if (percent() >= 90) {
      return moment();
    }

    if (percent() < 25 && world.passed !== 0) {
      tick.state = CATZ_STATE.victimCaptured;
      return tick;
    }

    return push(
      (catzBehavior(mind, 15, random) !== 0 && percent() < 25) || kind === 0x1b ? 0x295 : 0x268
    );
  }

  if (world.released) {
    tick.global = 2;
    return push(0x269);
  }

  /* Its way back to a neutral pose is pushed by its script's code, not held. */
  if (world.passed !== 0 && percent() < Math.trunc(brain(CATZ_BRAIN.liveliness) / 3)) {
    return tick;
  }

  if (percent() >= 90) {
    return moment();
  }

  tick.passed = 1;
  const wrestles =
    kind === 0x1b
      ? catzBehavior(mind, 28, random) !== 0 && percent() < 50
      : kind === 6
        ? percent() < 25 || world.x1500 === 0x44
        : percent() < 25;

  if (wrestles) {
    tick.state = CATZ_STATE.victimWrestle;
    return tick;
  }

  return push(kind === 0x1b ? 0x232 : kind === 6 ? 0x236 : 0x233);
}

/**
 * Turning to face the user where it faces more than 96 from them
 * (`MakeCatFaceForwardIfNeeded`, seg16:35e0, the cat's slot `0x16c`): without
 * an age 0x80; else by its energy and which half of the stage its target
 * point is in, 50 or more 0x11b on the left and 0x80 on the right, under
 * 0x87 and 0x86; then 0x150. The actions pushed, or none where it need not
 * turn.
 */
export function catzFaceForward(mind: CatzMind, world: CatzStateWorld): number[] | undefined {
  const facing = world.x688 ?? 0;

  if (facing >= -0x60 && facing <= 0x60) {
    return undefined;
  }

  const stage = world.stage!;
  const left = Math.trunc((stage.right - stage.left) / 2) + stage.left > world.point!.x;
  const turn =
    mind.brains[CATZ_BRAIN.age] === 0
      ? 0x80
      : mind.brains[CATZ_BRAIN.energy] >= 50
        ? left
          ? 0x11b
          : 0x80
        : left
          ? 0x87
          : 0x86;
  return [turn, 0x150];
}

/**
 * After dangling from the cursor (34; `DoPostDangling`, seg23:4a7e), its
 * script done: it turns to face the user where it must; else, afraid
 * (behaviour 17) four times in five, it attacks the cursor (global 17, `+0x35a4`
 * 0x17); else one time in four, not so placed (3), not inclined to behaviour
 * 26 and with an age, it pushes 0x275 and idles (6); else, under half its
 * liveliness and half its energy, 0x254 and idles; else it readies its
 * moment (`PreMoment`, after it idling, 0x93 meanwhile) and has it (8).
 * Entering, it lands as it was thrown, by how the cursor moved: not
 * reimplemented.
 */
function catzPostDangling(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const turns = catzFaceForward(mind, world);

  if (turns) {
    tick.pushes = turns;
    tick.pushed = turns[0];
    return tick;
  }

  if (catzBehavior(mind, 17, random) !== 0 && percent() < 80) {
    tick.x35a4 = 0x17;
    tick.global = 17;
    return tick;
  }

  if (
    percent() < 25 &&
    !world.area3 &&
    catzBehavior(mind, 26, random) === 0 &&
    brain(CATZ_BRAIN.age) !== 0
  ) {
    tick.pushed = 0x275;
    tick.global = 6;
    return tick;
  }

  if (
    percent() < Math.trunc(brain(CATZ_BRAIN.liveliness) / 2) &&
    percent() < Math.trunc(brain(CATZ_BRAIN.energy) / 2)
  ) {
    tick.pushed = 0x254;
    tick.global = 6;
    return tick;
  }

  tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
  tick.global = 8;
  return tick;
}
