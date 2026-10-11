/**
 * A Catz cat's own states, a tick at a time, once its script is done: what
 * each does then, and which it goes to next (CATZDLL.DLL's `DoCat…`
 * handlers). See kb/topics/catz-behaviour.md ("States of its own").
 */

import { type CatzMind, catzBehavior, catzSound } from './catz-behavior.ts';
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
}

/** The angle from one point to another (`PtToPtAngle`, seg14:1c93): `atan2` in 256ths of a turn, rounded toward 0 (seg48:17a2), the shorter way (`ShortestAngle`, seg48:1d00); 0x81 where they are one. */
export function catzPtToPtAngle(from: { x: number; y: number }, to: { x: number; y: number }) {
  const [dx, dy] = [from.x - to.x, from.y - to.y];

  if (!dx && !dy) {
    return 0x81;
  }

  const angle = Math.trunc((Math.atan2(dy, dx) * 256) / CATZ_TURN);

  /* As `ShortestAngle` has it: below -128 it gives -256 less the angle, which `atan2` never asks of it. */
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
  let mark = { ...world.goal! };
  let kind = world.x35a6 ?? 0x16;
  let walkedTo = kind;

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

  switch (g) {
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

  if (percent() < chance && aligned && near) {
    if (G === 16) {
      tick.state = 4;
    } else if (givenUp) {
      tick.global = 6;
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

  /* Its layered actions as it goes (`StartLocomotionLayering`, seg25:4521; `LayerAnimation`, seg15:1a24). */
  const layer = (type: number, a: number, b: number) => {
    if (tick.layered !== undefined) {
      return;
    }

    const x1500 = world.x1500 ?? 0;
    const matches = a === -1 || a === x1500 || b === -1 || b === x1500;
    const [odds, behaviour, action] = [
      [20, 28, 0x1d9],
      [75, 24, 0x1e0],
      [75, 25, 0x1e2],
      [brain(CATZ_BRAIN.fear), 27, 0x287],
    ][type];

    if (percent() < odds && matches && behave(behaviour)) {
      tick.layered = action;
    }
  };

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
