/**
 * A Catz cat's reflexes (CATZDLL.DLL seg23; kb/topics/catz-reflexes.md,
 * "Reflexes"): the methods `CatSprite::Update` (seg16:23da) calls each tick,
 * after its brains move on and before its state machines.
 */

import { type CatzMind, catzBehavior, catzSound } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { type CatzBox, catzDist } from './catz-states.ts';

/** How often extreme situations are looked for: every 280 ticks (`+0x358c`, set to 0x118). */
export const CATZ_EXTREME_TICKS = 0x118;

/**
 * Extreme situations (`HandleCatExtremeSituations`, seg23:0972, the cat's
 * slot `0x130`): `+0x358c` counts down a tick at a time; at 0 or under it is
 * 280 again, `+0x3574` 0, and, `PetParams` `+0xc4` clear, inclined to
 * behaviour 22 (a diet under 10 proper) its behaviour changes so (3); else
 * inclined to 23 (over 75) and full (brain 4 at 50 or more), so (4).
 */
export function catzExtremeSituations(
  mind: CatzMind,
  x358c: number,
  c4: boolean,
  random: (n: number) => number
): { x358c: number; x3574?: number; change?: number } {
  if (x358c > 0) {
    return { x358c: x358c - 1 };
  }

  const after = { x358c: CATZ_EXTREME_TICKS, x3574: 0 };

  if (c4) {
    return after;
  }

  if (catzBehavior(mind, 22, random) !== 0) {
    return { ...after, change: 3 };
  }

  if (catzBehavior(mind, 23, random) !== 0 && mind.brains[CATZ_BRAIN.fullness] >= 50) {
    return { ...after, change: 4 };
  }

  return after;
}

/** The amounts a change of 0 to 2 moves brains 0, 2, 3 and 5 by, mode 1 (`+0x3622` to `+0x3628`). */
export type CatzSliderAmounts = [number, number, number, number];

/**
 * A slider moved (`DoCatAdjustSlider`, seg15:1eae, slot `0x2b8`): a brain's
 * value (`XBrain::Increment`, kept within 0 to 100) by its amount times its
 * sign -- in mode 1, the amount turned against it where the brain's centre
 * is under 50.
 */
export function catzAdjustSlider(
  mind: CatzMind,
  brain: number,
  amount: number,
  sign: number,
  mode: number
) {
  const centre = (mind.centres ?? mind.brains)[brain];
  const by = mode === 1 ? (centre >= 50 ? amount : -amount) : mode === 0 ? amount : 0;

  mind.brains[brain] = Math.max(0, Math.min(100, mind.brains[brain] + by * sign));
}

/**
 * A change in its behaviour (`DoCatBehaviorChange`, seg15:1cff, slot
 * `0x2b4`, a jump table at seg15:1ea2), its brains moved as sliders:
 *
 * - 0, 1 and 2, by a sign 0, 1 and -1 -- 2 first taking 15 from its energy
 *   and 20 from its catnip -- liveliness, independence, seriousness and
 *   grooming by `+0x3622` to `+0x3628` (mode 1), and fear by 15 against it;
 * - 3 and 4, liveliness, independence and seriousness by 15, up for 3, down
 *   for 4;
 * - 5, those three by 15 each toward their centres' side of 50 (mode 1).
 */
export function catzBehaviorChange(mind: CatzMind, change: number, amounts: CatzSliderAmounts) {
  const slide = (brain: number, amount: number, sign: number, mode: number) =>
    catzAdjustSlider(mind, brain, amount, sign, mode);
  const { liveliness, independence, seriousness, groom, fear, energy, catnipped } = CATZ_BRAIN;

  if (change === 3 || change === 4) {
    const sign = change === 3 ? 1 : -1;
    [liveliness, independence, seriousness].forEach((brain) => slide(brain, 15, sign, 0));
    return;
  }

  if (change === 5) {
    [liveliness, independence, seriousness].forEach((brain) => slide(brain, 15, 1, 1));
    return;
  }

  if (change < 0 || change > 2) {
    return;
  }

  const sign = [0, 1, -1][change];

  if (change === 2) {
    slide(energy, 15, -1, 0);
    slide(catnipped, 20, -1, 0);
  }

  [liveliness, independence, seriousness, groom].forEach((brain, k) =>
    slide(brain, amounts[k], sign, 1)
  );
  slide(fear, 15, -sign, 0);
}

/** Where the cursor went, kept for wiggling (`+0x34d2` on). */
export interface CatzWiggle {
  /** The next of the 20 to fill (`+0x34d2`), and, at 20, a look at them. */
  index: number;

  /** Where the cursor was (`+0x34fc`, `+0x34fe`). */
  last: { x: number; y: number };

  /** Which way it went each tick (`+0x34d4`, 20): 0 up-left, 1 up, right or still, 2 left and down, 3 right or still and down or still. */
  ways: number[];

  /** Whether it went one way throughout (`+0x33b8`). */
  still: number;
}

/**
 * The cursor wiggled (`HandleCursorWiggling`, seg23:043d, the cat's slot
 * `0x128`). Each tick, under 20 kept, which way the cursor (kin 0x17) went
 * from where it was -- leftward 0 up, else 2; else 1 up, else 3 -- kept in
 * turn. At 20, the ring begun again, it counts how often the way changed
 * after fewer than four the same, `+0x33b8` 1 where it never changed; ten or
 * more, not swatting (56), after a treat (`+0x35a4` 0xb) nor being petted
 * (global 7), what it reacts to is what the user holds, else the cursor;
 * not asleep (28), and not playing (15) already where that is the cursor:
 * inclined to behaviour 17 (afraid) four times in five, scared of it (17);
 * else inclined to 15, playing with it (15); else to 14, attacking it (1) --
 * each letting go (its slot `0x9c` 1); else under half its energy its moment
 * readied (`PreMoment`, its moment after, 0x93 meanwhile), its head on the
 * cursor (3000), and its moment (8).
 */
export function catzCursorWiggling(
  mind: CatzMind,
  wiggle: CatzWiggle,
  cursor: { x: number; y: number },
  x35a4: number,
  held: number,
  random: (n: number) => number
): { global?: number; x35a4?: number; moment?: boolean; changes?: number } {
  if (wiggle.index < 20) {
    const left = wiggle.last.x > cursor.x;
    const up = wiggle.last.y > cursor.y;
    wiggle.ways[wiggle.index] = left ? (up ? 0 : 2) : up ? 1 : 3;
    wiggle.last = { ...cursor };
    wiggle.index++;
    return {};
  }

  wiggle.index = 0;
  wiggle.still = 1;
  let run = 0;
  let changes = 0;

  for (let k = 1; k < 20; k++) {
    if (wiggle.ways[k - 1] !== wiggle.ways[k]) {
      if (run < 4) {
        changes++;
      }

      run = 0;
      wiggle.still = 0;
    } else {
      run++;
    }
  }

  const { state, global } = mind;

  if (changes < 10 || state === 0x38 || x35a4 === 0xb || global === 7) {
    return { changes };
  }

  if (state === 0x1c || (global === 15 && held === 0x17)) {
    return { changes };
  }

  if (catzBehavior(mind, 17, random) !== 0 && random(101) < 80) {
    return { changes, x35a4: held, global: 17 };
  }

  if (catzBehavior(mind, 15, random) !== 0) {
    return { changes, x35a4: held, global: 15 };
  }

  if (catzBehavior(mind, 14, random) !== 0) {
    return { changes, x35a4: held, global: 1 };
  }

  if (random(101) < Math.trunc(mind.brains[CATZ_BRAIN.energy] / 2)) {
    return { changes, moment: true, global: 8 };
  }

  return { changes };
}

/** What the cat sees of the mouse (kin 0x1b), for `catzSeesMouse`. */
export interface CatzMouseSeen {
  /** The mouse's state (its machine's slot `0x8`), 1 in its hole; -1 with no mouse. */
  state: number;
  at: { x: number; y: number };

  /** The cat's own target point, and the stage (`ds:2ba6` on). */
  point: { x: number; y: number };
  stage: CatzBox;

  /** Whether it has reacted to it since its global state last changed (`+0x33bc`). */
  x33bc: number;
}

/**
 * The cat sees the mouse (`HandleCatSeesMouse`, seg23:0a56, the cat's slot
 * `0x134`). The mouse out of its hole (not its state 1) and within the stage,
 * the cat not having reacted since its global state changed (`+0x33bc`, which
 * the global machine's `NewState` clears) nor with a victim (global 2):
 * dangling (33, 34) it only turns its head to it (3000); else, asked whether
 * inclined to behaviours 14 to 17 in turn, asleep (28) and not inclined to
 * 25, nothing; afraid (17), scared of it (17); inclined to 24 and not 8,
 * `rand() % 101` under its age, snubbing it (11); inclined to 14 and not 16,
 * or within 200 of it, attacking it (1); inclined to 15, playing with it
 * (15); inclined to 16, watching it lazily (10, `+0x35b6` 2 resting or
 * lazy, else 1). Reacting, the mouse is what it plays with (`+0x35a4`), it
 * lets go (its slot `0x9c` 1), and `+0x33bc` is 1.
 */
export function catzSeesMouse(
  mind: CatzMind,
  seen: CatzMouseSeen,
  random: (n: number) => number
): { global?: number; x35b6?: number; head?: boolean } {
  const { stage, at } = seen;

  if (seen.state === 1 || seen.state === -1) {
    return {};
  }

  if (at.x < stage.left || at.y < stage.top || at.x > stage.right || at.y > stage.bottom) {
    return {};
  }

  if (seen.x33bc !== 0 || mind.global === 2) {
    return {};
  }

  if (mind.state === 0x21 || mind.state === 0x22) {
    return { head: true };
  }

  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const attack = behave(14);
  const play = behave(15);
  const lazy = behave(16);
  const afraid = behave(17);

  if (mind.state === 0x1c && !behave(25)) {
    return {};
  }

  if (afraid) {
    return { global: 17 };
  }

  if (behave(24) && !behave(8) && random(101) < mind.brains[CATZ_BRAIN.age]) {
    return { global: 11 };
  }

  if ((attack && !lazy) || catzDist(seen.point, at) < 200) {
    return { global: 1 };
  }

  if (play) {
    return { global: 15 };
  }

  if (lazy) {
    return { global: 10, x35b6: mind.global === 9 || mind.global === 10 ? 2 : 1 };
  }

  return {};
}

/** What picking the cat up by the scruff asks (`HandleScruff`). */
export interface CatzScruff {
  /** The button pressed and held (`PetParams` `+0xa`, `+0xc`), and whether the user holds anything already (the apt root's slot `0x20`). */
  left: boolean;
  right: boolean;
  holding: boolean;

  /** Ball 2 where it is drawn, the cursor's point (`PetParams` `+0x5a`), and its own target point. */
  ball: { x: number; y: number };
  cursor: { x: number; y: number };
  point: { x: number; y: number };

  /** Hiding (`+0x9e` 0xb1e0) and kin 0x22's draw rectangle. */
  x9e: number;
  hidden: CatzBox;

  /** In the Adoption Kit: `+0x35fc`, `+0x35fa`, its basket (`+0x35f6`) and `+0x35f8`. */
  x35fc: number;
  x35fa: number;
  x35f6: number;
  x35f8: number;
}

/** Strictly within a rectangle, its edges out (`XPointInXRect`, seg48:1272). */
function within(box: CatzBox, at: { x: number; y: number }) {
  return box.left < at.x && at.x < box.right && box.top < at.y && at.y < box.bottom;
}

/**
 * Picked up by the scruff (`HandleScruff`, seg23:3e6e, the cat's slot
 * `0x120`): the button pressed (`PetParams` `+0xa`), not held already
 * (`+0xc`), nothing held, and the cursor strictly within 100 of ball 2 where
 * it is drawn (its ballz' slot `0x38`): not hiding (`+0x9e` 0xb1e0) within
 * kin 0x22; in the Adoption Kit (global 22) not jumping or dropping in (77,
 * 78), `+0x35fc` clear, and `+0x35fa` clear unless climbing out (76) -- its
 * basket (`+0x35f6`) `+0x35f8` where none, out of it (slot `0x3d8`) from 73
 * to 76, `+0x35fe` 0, its slot `0xfc`, the basket marked (`+0x3614`) and the
 * root's apt 0x18 shown so (`SetCond` 2) -- it lets go (slot `0x9c` 2), is
 * held (`+0xfc` 1) and dangles (33). It draws nothing.
 */
export function catzScruff(
  mind: CatzMind,
  scruff: CatzScruff
): { dangles: boolean; x35f6?: number; outOfBasket?: boolean } {
  const { ball } = scruff;

  if (!scruff.left || scruff.right || scruff.holding) {
    return { dangles: false };
  }

  const box = { left: ball.x - 100, top: ball.y - 100, right: ball.x + 100, bottom: ball.y + 100 };

  if (!within(box, scruff.cursor)) {
    return { dangles: false };
  }

  if (scruff.x9e === 0xb1e0 && within(scruff.hidden, scruff.point)) {
    return { dangles: false };
  }

  if (mind.global !== 22) {
    return { dangles: true };
  }

  const { state } = mind;

  if (state === 77 || state === 78 || scruff.x35fc !== 0 || (scruff.x35fa !== 0 && state !== 76)) {
    return { dangles: false };
  }

  return {
    dangles: true,
    x35f6: scruff.x35f6 === -1 ? scruff.x35f8 : scruff.x35f6,
    outOfBasket: state >= 73 && state <= 76,
  };
}

/** The purrs, louder by 1 and softer by 2 (`HandlePurring`'s switch). */
const CATZ_PURRS: Record<number, [number, number]> = {
  0x9c: [0x9d, 0x9c],
  0x9d: [0x9e, 0x9c],
  0x9e: [0x99, 0x9d],
  0x99: [0x9a, 0x9e],
  0x9a: [0x9b, 0x99],
  0x9b: [0x99, 0x9a],
};

/**
 * Purring (`HandlePurring`, seg23:3496, the cat's slot `0x140`), as asked
 * (`+0x3572`): 0, nothing; 4, the purr playing (`+0x3570`) stopped with
 * 0xe4 and none (-1), still asked; else the sound stopped and -- none
 * playing, asked 1, 0xe6 and 0x9c, else nothing -- 1 the next purr, 2 the
 * one before (`CATZ_PURRS`), 3 the same, queued (its slot `0x174`) and
 * asked no more (0). It draws nothing itself: a purr begun (0xe6) is played
 * by `XPlayStereoSound`, which draws its loudness (the pet draws so).
 */
export function catzPurring(
  x3570: number,
  x3572: number
): { x3570: number; x3572: number; sound?: number } {
  if (x3572 === 0) {
    return { x3570, x3572 };
  }

  if (x3572 === 4) {
    return { x3570: -1, x3572, ...(x3570 !== -1 ? { sound: 0xe4 } : {}) };
  }

  if (x3570 === -1) {
    return x3572 === 1 ? { x3570: 0x9c, x3572: 0, sound: 0xe6 } : { x3570, x3572 };
  }

  const next = CATZ_PURRS[x3570];
  const purr = x3572 === 1 ? next?.[0] : x3572 === 2 ? next?.[1] : x3570;
  return { x3570: purr ?? x3570, x3572: 0 };
}

/**
 * The message a thing of the pen leaves the cat (`+0x33c0`) as the playpen
 * tells it of the thing's condition (0 on the shelf, 1 in the pen) and
 * state (0 ready, 1 let go, 2 selected, 3 dragged, 4 pressed) changing
 * (`XApt::ParentNotify` to `CatSprite::ChildRespond`, seg16:3e3e, a
 * responder by kind, seg16:403f to 4590). Taken off the shelf by the user
 * (`flag`), the first of its pair -- in the Adoption Kit (`kit`, `PetParams`
 * `+0xc4`) the Kit's own, 0x1c to 0x29; then by its state, the second, which
 * wins where both. None where it says nothing.
 */
export function catzChildRespond(
  kind: number,
  cond: number,
  state: number,
  flag: boolean,
  kit = false
): number | undefined {
  /* Each kind: the conditions it answers in, its taken-off message (and the Kit's), and its message by state. */
  const responders: Record<
    number,
    { conds: number[]; taken?: number; kitTaken: number; byState?: Record<number, number> }
  > = {
    1: { conds: [1], kitTaken: 0x1c },
    2: { conds: [1], taken: 0xf, kitTaken: 0x1d, byState: { 1: 0x10 } },
    3: { conds: [1], kitTaken: 0x1e, byState: { 1: 0x11 } },
    4: { conds: [1, 2, 3, 4, 5, 6, 7], taken: 7, kitTaken: 0x1f, byState: { 1: 8 } },
    5: { conds: [1], taken: 0xc, kitTaken: 0x20, byState: { 4: 0xc } },
    6: { conds: [1, 2], taken: 0xa, kitTaken: 0x22, byState: { 4: 0xa } },
    7: { conds: [1, 2], taken: 9, kitTaken: 0x23, byState: { 4: 9 } },
    8: { conds: [1], taken: 0xe, kitTaken: 0x24 },
    9: { conds: [1], taken: 0xb, kitTaken: 0x21, byState: { 4: 0xb } },
    0xa: { conds: [1], kitTaken: 0x25 },
    0xb: { conds: [1], taken: 5, kitTaken: 0x26, byState: { 1: 6, 4: 5 } },
    0xc: { conds: [1, 2, 3, 4, 5, 6, 7, 8], taken: 1, kitTaken: 0x27, byState: { 1: 2 } },
    0xd: { conds: [1, 2, 3], taken: 3, kitTaken: 0x28, byState: { 1: 4 } },
    0xf: { conds: [1], taken: 0xd, kitTaken: 0x29, byState: { 3: 0xd } },
  };
  const responder = responders[kind];

  if (!responder || !responder.conds.includes(cond)) {
    return undefined;
  }

  let message: number | undefined;

  if (flag) {
    message = kit ? responder.kitTaken : responder.taken;
  }

  /* (The bottle dragged leaves its own unless the Kit's is left already.) */
  const byState = responder.byState?.[state];

  if (byState !== undefined && !(kind === 0xf && message === 0x29)) {
    message = byState;
  }

  return message;
}

/** What the cat's messages ask of it and of where it is (`HandleCatAptMessages`). */
export interface CatzMessaged {
  /** What it plays with and walks to (`+0x35a4`, `+0x35a6`), and `+0x35d6`, a count. */
  x35a4: number;
  x35a6: number;
  x35d6: number;

  /** What it ignored last (`+0x35b2`), where it is placed (its slot `0x234`, 0x1d), and the mouse's state (-1 none). */
  x35b2: number;
  area: number;
  mouseState: number;

  /** Whether the treat (kin 0xb) is on the shelf (`isSpriteInShelf`). */
  treatShelved?: boolean;

  /** In the Adoption Kit: whether each kind of sprite (0 to 15) is on the shelf, `+0x35fa`, and its basket (`+0x35f6`) and `+0x35f8`. */
  shelved?: boolean[];
  x361e?: number;
  stage?: CatzBox;
  x35fa?: number;
  x35f6?: number;
  x35f8?: number;

  /** On its way to its basket (`+0x35fc`): the pen's own messages, 1 to 21, not read. */
  x35fc?: number;

  /** Which Kit it is (`PetParams` `+0xc6`, `+0xc8`), which picks the words its things show. */
  edition?: { xc6: number; xc8: number };

  /** Its draw rectangle, and the spray's (kin 2) and flea spray's (kin 3) target points. */
  rect?: CatzBox;
  spray?: { x: number; y: number };
  flea?: { x: number; y: number };
}

/** Whether two rectangles meet (`XDoRectsSect`, seg48:11c7): the greater left under the lesser right, and so down. */
function meet(a: CatzBox, b: CatzBox) {
  return (
    Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
    Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom)
  );
}

/** What a message did: the global state it asked, `+0x35a4` and `+0x35d6` where set, its pushes, and what it ignored. */
export interface CatzMessageDone {
  global?: number;

  /** The state of its own it was put in, where the message put it in one (the Kit's baskets). */
  state?: number;

  x35a4?: number;
  x35d6?: number;
  pushes?: number[];
  head?: boolean;
  ignored?: { kin: number; x35b4?: number };

  /** Food or catnip just brought out, full (`SetupSpriteJustBroughtOut`, seg23:315f): the bowl's `+0x35d2` or the catnip's `+0x35d4` 100. */
  x35d2?: number;
  x35d4?: number;

  /** Words shown on the Kit's text bar (`TextStatusBar`, the cat's slot `0x158`): a string of CATZDLL's. */
  words?: number;
}

/**
 * Noticing something and ignoring it (`ShouldNoticeAndIgnore`, seg30:1ab9,
 * the cat's slot `0x274`): not asleep (28), not what it plays with already,
 * not scared (global 17), not after the mouse (`+0x35a4` 0x1b) unless the
 * mouse is in its hole (state 1), not placed 3, and not what it ignored
 * last (`+0x35b2`): it keeps it (`+0x35b2`, `+0x35b0`), and, not ignoring
 * already (12), its global state (`+0x35b4`), lets go (its slot `0x9c` 1)
 * and ignores it (12). It draws nothing.
 */
export function catzNoticeAndIgnore(
  mind: CatzMind,
  seen: CatzMessaged,
  kin: number
): CatzMessageDone | undefined {
  if (mind.state === 0x1c || seen.x35a4 === kin || mind.global === 17) {
    return undefined;
  }

  if (seen.x35a4 === 0x1b && seen.mouseState !== 1) {
    return undefined;
  }

  if (seen.area === 3 || seen.x35b2 === kin) {
    return undefined;
  }

  return {
    global: 12,
    ignored: { kin, ...(mind.global !== 12 ? { x35b4: mind.global } : {}) },
  };
}

/**
 * A message the playpen left (`HandleCatAptMessages`, seg23:13db, the cat's
 * slot `0x138`; `+0x33c0`, taken as it is read), out of the Adoption Kit
 * (`PetParams` `+0xc4` clear) and not on its way to its basket (`+0x35fc`):
 *
 * - 2, food (kin 0xc; seg23:1ea7; 1 first its slot `0x17c` 0xc): without an
 *   age, playing (15) with it unless at it already; walking to it (23) on
 *   its way, nothing; inclined to behaviour 18 (hungry) -- asleep, only under
 *   its liveliness -- one time in four not at the water (`+0x35a4` 0xd),
 *   `+0x35d6` one more, it lets go and, asleep, turns its head to it (3000)
 *   and pushes 0x22b, and eats (3); else inclined to 15 one time in two and
 *   awake, playing with it (15); else noticing and ignoring it.
 * - 3 and 4, water (kin 0xd; seg23:20fe): as food, but at the food already
 *   it goes on so, without a draw; drinking sets `+0x35ce` 3; and else it
 *   ignores it outright.
 * - 5 and 6, a treat (kin 0xb; seg23:2346, 2317): 6 not after snagging (9)
 *   nor with the treat on the shelf, `+0x35ac` 1 and on as 5; without an
 *   age, playing with it; asleep, only under its liveliness; else `+0x35d6`
 *   one more, it lets go and, asleep, turns its head to it and pushes 0x22b,
 *   and eats (3).
 * - 7 and 8, catnip (kin 4; seg23:2482, 2498): as food, 7 first its catnip
 *   left full (`SetupSpriteJustBroughtOut`, `+0x35d4` 100; for food, 1,
 *   `+0x35d2`), inclined to behaviour 20, and to it (4); else noticing and
 *   ignoring it.
 * - 13, the milk bottle (kin 0xf; seg23:2635): `+0x35d6` one more;
 *   inclined to behaviours 19 and 18 (asleep, only under its liveliness),
 *   or without an age, it lets go (asleep, its head to it and 0x22b) and
 *   suckles (5); else inclined to 24, or one time in ten, not snubbing
 *   already, snubbing it (11); else noticing and ignoring it.
 * - 9 to 12, a toy (7, 6, 9 and 5; seg23:27f6 on, then 2dd8): asked whether
 *   inclined to behaviours 15 and 14; asleep, only under its liveliness; at
 *   it already playing (15) or attacking (1), nothing; inclined to 15, or
 *   one time in two not to 14 and under 75 fear: playing already one time
 *   in ten it plays on elsewhere, else it is what it plays with, it lets go
 *   (asleep, its head to it and 0x22b), and plays (15) eight times in ten,
 *   else attacks (1); else inclined to 14: attacking or eating already
 *   three times in four it goes on so, else attacks it so; else noticing and
 *   ignoring it.
 * - 15, the spray bottle (kin 2; seg23:282a): afraid (fear 50 or more), with
 *   an age, not placed 3, asleep only under its liveliness, it lets go
 *   (asleep, its head to it and 0x22b) and the spray is what it plays with;
 *   over 80 fear, scared (17); else its head on it (3000) and one time in
 *   two 0x272, else a sound (1) and 0x271, and idling (6).
 * - 18 (seg23:2b56): not flea-sprayed already (19), awake one time in two
 *   or else under its liveliness, it lets go and is flea-sprayed (19), the
 *   user (kin 1) what it plays with.
 * - 19, its window resized (seg23:2bd3): placed 3, awake, or asleep under
 *   its liveliness, it lets go and has a window event (20).
 * - 21, the camera (seg23:2c44): awake, with an age, not placed 3, and
 *   `rand() % 101` under its energy, it lets go and, inclined to behaviour
 *   24, 0x276; to 27, 0x277; to 28, looking at the user, 0x243; to 26,
 *   looking at the user, 0x93 -- and idles (6); else nothing more.
 *
 * - 16 and 17, the spray (kin 2) and flea spray (kin 3; seg23:29be, 2a9f):
 *   where a box from its target point (100 left for the spray, 75 for the
 *   flea spray, to it; 50 above to 10 below) meets the cat's draw rectangle
 *   -- the spray: it lets go (its slot `0x9c` 2), its behaviour changes (2),
 *   its fear up 25 where its centre is 50 or more, and it is sprayed (18);
 *   the flea spray, asleep only under its liveliness: it lets go and is
 *   flea-sprayed (19), the flea spray what it plays with.
 *
 * Not reimplemented: 14 (the mouse told so, its slot `0x114`).
 */
export function catzMessage(
  mind: CatzMind,
  message: number,
  seen: CatzMessaged,
  random: (n: number) => number
): CatzMessageDone | undefined {
  const percent = () => random(101);
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const { state, global } = mind;
  const asleep = state === 0x1c;
  const age = mind.brains[CATZ_BRAIN.age];
  const liveliness = mind.brains[CATZ_BRAIN.liveliness];

  /* On its way to its basket, only a basket's message is read (seg23:1e6c). */
  if (seen.x35fc && (message < 22 || message > 26)) {
    return {};
  }

  switch (message) {
    case 2: {
      if (age === 0) {
        return global === 15 && seen.x35a4 === 0xc ? {} : { global: 15, x35a4: 0xc };
      }

      if (seen.x35a6 === 0xc && state === 0x17) {
        return {};
      }

      if (behave(18) && (!asleep || percent() < liveliness)) {
        if (seen.x35a4 === 0xd && percent() < 75) {
          return {};
        }

        return {
          global: 3,
          x35d6: seen.x35d6 + 1,
          ...(asleep ? { head: true, pushes: [0x22b] } : {}),
        };
      }

      if (behave(15) && percent() < 50 && !asleep) {
        return { global: 15, x35a4: 0xc };
      }

      return catzNoticeAndIgnore(mind, seen, 0xc) ?? {};
    }
    case 3:
    case 4: {
      if (age === 0) {
        return global === 15 && seen.x35a4 === 0xd ? {} : { global: 15, x35a4: 0xd };
      }

      if (seen.x35a6 === 0xd && state === 0x17) {
        return {};
      }

      if (behave(18) && (!asleep || percent() < liveliness)) {
        if (seen.x35a4 === 0xc) {
          return {};
        }

        return {
          global: 3,
          x35d6: seen.x35d6 + 1,
          ...(asleep ? { head: true, pushes: [0x22b] } : {}),
        };
      }

      if (behave(15) && percent() < 50 && !asleep) {
        return { global: 15, x35a4: 0xd };
      }

      return {};
    }
    case 6:
      if (seen.treatShelved === undefined) {
        return undefined;
      }

      /* `+0x35ac` 1, and on as 5. */
      return state === 9 || seen.treatShelved ? {} : catzMessage(mind, 5, seen, random);
    case 5:
      if (age === 0) {
        return global === 15 && seen.x35a4 === 0xb ? {} : { global: 15, x35a4: 0xb };
      }

      if (asleep && percent() >= liveliness) {
        return {};
      }

      return {
        global: 3,
        x35d6: seen.x35d6 + 1,
        ...(asleep ? { head: true, pushes: [0x22b] } : {}),
      };
    case 1:
    case 7:
    case 8: {
      const kin = message === 1 ? 0xc : 4;

      if (message === 1) {
        return { ...catzMessage(mind, 2, seen, random), x35d2: 100 };
      }

      if (message === 7) {
        return { ...catzMessage(mind, 8, seen, random), x35d4: 100 };
      }

      if (age === 0) {
        return global === 15 && seen.x35a4 === kin ? {} : { global: 15, x35a4: kin };
      }

      if (behave(20) && (!asleep || percent() < liveliness)) {
        return {
          global: 4,
          x35d6: seen.x35d6 + 1,
          ...(asleep ? { head: true, pushes: [0x22b] } : {}),
        };
      }

      return catzNoticeAndIgnore(mind, seen, kin) ?? {};
    }
    case 13: {
      const x35d6 = seen.x35d6 + 1;
      const suckle = () => ({
        global: 5,
        x35d6,
        ...(asleep ? { head: true, pushes: [0x22b] } : {}),
      });

      if (behave(19) && behave(18) && (!asleep || percent() < liveliness)) {
        return suckle();
      }

      if (age === 0) {
        return suckle();
      }

      if ((behave(24) || percent() < 10) && global !== 11) {
        return { global: 11, x35a4: 0xf, x35d6 };
      }

      return { x35d6, ...catzNoticeAndIgnore(mind, seen, 0xf) };
    }
    case 9:
    case 10:
    case 11:
    case 12: {
      const toy = { 9: 7, 10: 6, 11: 9, 12: 5 }[message]!;
      const play = behave(15);
      const attack = behave(14);
      const goes = (to: number) => ({
        global: to,
        x35a4: toy,
        ...(asleep ? { head: true, pushes: [0x22b] } : {}),
      });

      if (asleep && percent() >= liveliness) {
        return {};
      }

      if (seen.x35a4 === toy && (global === 15 || global === 1)) {
        return {};
      }

      if (play || (percent() < 50 && !attack && mind.brains[CATZ_BRAIN.fear] < 75)) {
        if (global === 15 && percent() < 10) {
          return {};
        }

        return goes(percent() < 80 ? 15 : 1);
      }

      if (attack) {
        if ((global === 1 || global === 3) && percent() < 75) {
          return {};
        }

        return goes(1);
      }

      return catzNoticeAndIgnore(mind, seen, toy) ?? {};
    }
    case 15: {
      const fear = mind.brains[CATZ_BRAIN.fear];

      if (fear < 50 || age <= 0 || seen.area === 3 || (asleep && percent() >= liveliness)) {
        return {};
      }

      if (fear > 80) {
        return { global: 17, x35a4: 2, ...(asleep ? { head: true, pushes: [0x22b] } : {}) };
      }

      if (percent() < 50) {
        return { global: 6, x35a4: 2, head: true, pushes: [...(asleep ? [0x22b] : []), 0x272] };
      }

      catzSound(mind, 1, random);
      return { global: 6, x35a4: 2, head: true, pushes: [...(asleep ? [0x22b] : []), 0x271] };
    }
    case 16:
    case 17: {
      const at = message === 16 ? seen.spray : seen.flea;

      if (!seen.rect || !at) {
        return undefined;
      }

      const reach = message === 16 ? 100 : 75;
      const box = { left: at.x - reach, top: at.y - 50, right: at.x, bottom: at.y + 10 };

      if (!meet(box, seen.rect)) {
        return {};
      }

      if (message === 16) {
        return { global: 18 };
      }

      return asleep && percent() >= liveliness ? {} : { global: 19, x35a4: 3 };
    }
    case 22:
    case 23:
    case 24:
    case 25:
    case 26:
      /* A basket (seg23:1cbd): its own, a sound (0xe7) and back to it (`MakeCatReturnToBasket`, seg23:5838: it lets go, its slot `0x168`, `+0x33be` 2, `+0x35fc` 1, the Kit, 22); another, a sound (0x9f) and the words to put the kitten away (`GivePutAwayKittenMessage`, its slot `0x164`), and nothing more. */
      if (seen.x35f6 === undefined) {
        return undefined;
      }

      /* Going back, "… is returning to its basket" (`GiveReturningKittenMessage`, its slot `0x168`); else "… please put … away" (seg23:31ae): 0x2355 and 0x2350 on by its basket. */
      return seen.x35f6 === message - 22
        ? { global: 22, words: 0x2355 + seen.x35f6 }
        : { words: 0x2350 + seen.x35f6 };
    case 18:
      if (global === 19) {
        return {};
      }

      return (!asleep && percent() < 50) || percent() < liveliness ? { global: 19, x35a4: 1 } : {};
    case 19:
      return seen.area === 3 || !asleep || percent() < liveliness ? { global: 20 } : {};
    case 21: {
      if (asleep || age === 0 || seen.area === 3) {
        return {};
      }

      if (percent() >= mind.brains[CATZ_BRAIN.energy]) {
        return {};
      }

      if (behave(24)) {
        return { global: 6, pushes: [0x276] };
      }

      if (behave(27)) {
        return { global: 6, pushes: [0x277] };
      }

      if (behave(28)) {
        return { global: 6, head: true, pushes: [0x243] };
      }

      if (behave(26)) {
        return { global: 6, head: true, pushes: [0x93] };
      }

      return {};
    }
    default:
      return undefined;
  }
}

/** The Adoption Kit's own messages (28 to 42), each the kind of sprite it asks of the shelf and the pen's message it is, off it. */
/**
 * The Kit's own messages' words (seg23:14e8 on, a jump table at seg23:311c
 * by the message less 0x1c): each its thing's line where `PetParams`
 * `+0xc6` is set; else, where it has them, "Soon you can …" with `+0xc8`
 * and "Adopt Now …" without. The paint bucket, the jingle ball and the
 * squeaky toy have their line with either set; the Cat Dancer, the yarn,
 * the cheese and the milk bottle always. 42 is "Please wait for the kitten
 * to return.", with a sound (0x9f).
 */
const CATZ_KIT_WORDS: Record<
  number,
  { line: number; soon?: number; adopt?: number; either?: boolean }
> = {
  28: { line: 0x2342, adopt: 0x2367, either: true },
  29: { line: 0x2343, soon: 0x2377, adopt: 0x2362 },
  30: { line: 0x2344, soon: 0x2378, adopt: 0x2363 },
  31: { line: 0x2345, soon: 0x2379, adopt: 0x2364 },
  32: { line: 0x2346 },
  33: { line: 0x234c, adopt: 0x2369, either: true },
  34: { line: 0x2347 },
  35: { line: 0x2348, adopt: 0x2368, either: true },
  36: { line: 0x2349 },
  37: { line: 0x234a, soon: 0x237a, adopt: 0x2365 },
  38: { line: 0x234b, soon: 0x237b, adopt: 0x2366 },
  39: { line: 0x234d, soon: 0x237c, adopt: 0x237e },
  40: { line: 0x234e, soon: 0x237d, adopt: 0x237f },
  41: { line: 0x234f },
  42: { line: 0x235c },
};

/** A Kit message's words, by which Kit it is. */
export function catzKitWords(message: number, edition = { xc6: 0, xc8: 0 }) {
  const words = CATZ_KIT_WORDS[message];

  if (!words) {
    return undefined;
  }

  if (words.adopt === undefined || edition.xc6) {
    return words.line;
  }

  if (edition.xc8) {
    return words.either ? words.line : (words.soon ?? words.line);
  }

  return words.adopt;
}

const CATZ_KIT_MESSAGES: Record<number, [number, number]> = {
  29: [2, 15],
  31: [4, 7],
  32: [5, 12],
  33: [9, 11],
  34: [6, 10],
  35: [7, 9],
  36: [8, 14],
  38: [0xb, 5],
  39: [0xc, 1],
  40: [0xd, 3],
  41: [0xf, 13],
};

/**
 * A message in the Adoption Kit (`HandleCatAptMessages` with `PetParams`
 * `+0xc4` set, seg23:1431 on). 19, the kit just maximized: `+0x361e`, the
 * stage 640 by 400 or more, and in its baskets (73 to 75), the kit begun
 * again (`+0x33be` 1, global 22). Else nothing while `+0x35fa`. Its own (28
 * to 42) show their words (its slot `0x158`, by `PetParams` `+0xc6` and
 * `+0xc8`), and some, their sprite off the shelf, go on as the pen's
 * (`CATZ_KIT_MESSAGES`); 28, 30, 37 and 42 only show them. Then, in its
 * baskets, only 22 to 26 -- a basket chosen: a sound (0xe7), it lets go,
 * `+0x35fa` 1, its basket `+0x35f8` where none, the same cat coming out or
 * another -- and else as the pen's (`catzMessage`). Its own show their
 * words (`catzKitWords`), even on the shelf.
 */
export function catzKitMessage(
  mind: CatzMind,
  message: number,
  seen: CatzMessaged,
  random: (n: number) => number
): CatzMessageDone | undefined {
  if (!seen.shelved || seen.x35fa === undefined) {
    return undefined;
  }

  if (message === 19) {
    const stage = seen.stage;

    if (seen.x361e === undefined || !stage) {
      return undefined;
    }

    const big = stage.right - stage.left >= 0x280 || stage.bottom - stage.top >= 0x190;
    const inBaskets = mind.state === 73 || mind.state === 74 || mind.state === 75;
    return seen.x361e !== 0 && big && inBaskets ? { global: 22 } : {};
  }

  if (seen.x35fa !== 0) {
    return {};
  }

  let asked = message;

  let words: number | undefined;

  if (message >= 28 && message <= 42) {
    words = catzKitWords(message, seen.edition);
    const goes = CATZ_KIT_MESSAGES[message];

    if (!goes || seen.shelved[goes[0]]) {
      return { words };
    }

    asked = goes[1];
  }

  const done = catzKitAsked(mind, asked, seen, random);
  return done && words !== undefined ? { ...done, words: done.words ?? words } : done;
}

/** A Kit message after its words: a basket in its baskets, else as the pen's. */
function catzKitAsked(
  mind: CatzMind,
  asked: number,
  seen: CatzMessaged,
  random: (n: number) => number
): CatzMessageDone | undefined {
  const { state } = mind;

  if (state === 73 || state === 74 || state === 75) {
    if (asked >= 22 && asked <= 26) {
      /* A basket chosen (seg23:1b1d): its own, the same cat coming out (76); another, it its basket, a different one (75). */
      const basket = seen.x35f6 === -1 ? seen.x35f8 : seen.x35f6;
      return { state: basket === asked - 22 ? 76 : 75 };
    }

    return asked === 14 ? catzMessage(mind, asked, seen, random) : {};
  }

  return catzMessage(mind, asked, seen, random);
}

/** Its eyes for blinking: ticks to its next (`+0x3584`), whether shut (`+0x3586`), the lid kept (`+0x3588`), and its eyelids (`+0x6a2`, `+0x6a4`). */
export interface CatzBlink {
  due: number;
  shut: number;
  kept: number;
  lids: [number, number];
}

/**
 * Blinking (`HandleBlinking`, seg23:0825, the cat's slot `0x12c`): `+0x3584`
 * counts down a tick at a time; at 0 or under, shut, its eyelids open again
 * as kept and it blinks next in `rand() % 100 + 30`; else it keeps the
 * second lid, shuts both (100), and opens in `rand() % 2 + 2`.
 */
export function catzBlinking(eyes: CatzBlink, random: (n: number) => number): CatzBlink {
  if (eyes.due > 0) {
    return { ...eyes, due: eyes.due - 1 };
  }

  if (eyes.shut) {
    return { due: random(100) + 30, shut: 0, kept: eyes.kept, lids: [eyes.kept, eyes.kept] };
  }

  return { due: random(2) + 2, shut: 1, kept: eyes.lids[1], lids: [100, 100] };
}

/**
 * Layering (`HandleMiscLayering`, seg23:3270, the cat's slot `0x13c`): what
 * it plays over itself (its slot `0xc0`), every so often. `+0x358a` counts
 * down a tick at a time; at 0 or under, no layer playing (its slot `0xa8`):
 * `rand() % 101` under its catnip (brain 10), not eating, resting nor in
 * CatNapz (3, 9, 21), 0x27c; else awake one time in four with an age, one of
 * 0x2ff to 0x302 by `rand() % 4` (seg48:1b86); else over 98 full one time in
 * ten with an age, 0x324; else in its moment, lazy or affectionate (8, 10,
 * 14) or dangling (33), `+0x696` clear, 0x1da -- and either way, next in
 * `rand() % 200 + 60`. The layer played is not reimplemented: answered,
 * the next.
 */
export function catzLayering(
  mind: CatzMind,
  x358a: number,
  playing: boolean,
  random: (n: number) => number
): { x358a: number; layer?: number } {
  if (x358a > 0) {
    return { x358a: x358a - 1 };
  }

  const percent = () => random(101);
  const age = mind.brains[CATZ_BRAIN.age];
  const { state, global } = mind;
  let layer: number | undefined;

  if (!playing) {
    if (percent() < mind.brains[CATZ_BRAIN.catnipped]) {
      layer = global === 3 || global === 9 || global === 21 ? undefined : 0x27c;
    } else if (state !== 0x1c && percent() < 25 && age !== 0) {
      layer = [0x2ff, 0x300, 0x301, 0x302][random(4)];
    } else if (mind.brains[CATZ_BRAIN.fullness] > 98 && percent() < 10 && age !== 0) {
      layer = 0x324;
    } else if (global === 8 || global === 10 || global === 14 || state === 0x21) {
      layer = 0x1da;
    }
  }

  return { x358a: random(200) + 60, layer };
}

/** The Kit's text: its basket hint (`+0x360a`) and advert (`+0x360c`), their counts (`+0x35fe`, `+0x3602`), and ticks since words were shown (`+0x3606`). */
export interface CatzKitText {
  x360a: number;
  x360c: number;
  x35fe: number;
  x3602: number;
  x3606: number;
}

/** As the cat is made (seg16:150c): its counts -1, words long since shown; its hint and advert none. */
export function makeCatzKitText(): CatzKitText {
  return { x360a: 0x2380, x360c: 0x2380, x35fe: -1, x3602: -1, x3606: 1000 };
}

/** The tips (`TextStatusBar`, seg23:574c, and its table at seg23:580a), shown only 28 ticks or more after the last words. */
function catzTip(string: number) {
  return (
    string === 0x233c ||
    string === 0x235a ||
    string === 0x235b ||
    (string >= 0x236a && string <= 0x2371) ||
    (string >= 0x2381 && string <= 0x2386)
  );
}

/**
 * Words on the Kit's text bar (`TextStatusBar`, seg23:573b, the cat's slot
 * `0x158`): a tip only where `+0x3606` has reached 0x1c, anything else at
 * once; shown, `+0x3606` is 0. The string shown, if any.
 */
export function catzShowWords(text: CatzKitText, string: number) {
  if (text.x3606 < 0x1c && catzTip(string)) {
    return undefined;
  }

  text.x3606 = 0;
  return string;
}

/** The adverts in turn (`+0x360c`): each its next, and how long `+0x3602` must pass before it ("Soon you can …" where `+0xc6` is clear and `+0xc8` set). */
const CATZ_KIT_ADVERTS: { from: number[]; after: number; to: number; soon?: number }[] = [
  { from: [0x2371, 0x2386], after: 0xd2, to: 0x236a, soon: 0x2381 },
  { from: [0x236a, 0x2381], after: 0x1a4, to: 0x236b },
  { from: [0x236b], after: 0x276, to: 0x236c },
  { from: [0x236c], after: 0x348, to: 0x236d, soon: 0x2382 },
  { from: [0x236d, 0x2382], after: 0x41a, to: 0x236e, soon: 0x2383 },
  { from: [0x236e, 0x2383], after: 0x4ec, to: 0x236f, soon: 0x2384 },
  { from: [0x236f, 0x2384], after: 0x5be, to: 0x2370, soon: 0x2385 },
];

/**
 * The Kit's text each tick (`HandleKitContextSensitiveText`, seg23:5141,
 * the cat's slot `0x144`; `CatSprite::Update` runs it in the Kit before its
 * other gates). In its baskets (73 to 75), `PetParams` `+0xca` set, and
 * `+0xea` set or an age: its hint goes "Click on a basket…" (0x233c, at once,
 * `+0x3606` 1000), past 0x8c "To pick up kittenz…" (0x235a), past 0x118 "To
 * pet kittenz…" (0x235b), past 0x1a4 none again (0x2380, `+0x35fe` 0); else
 * `+0x35fe` and `+0x3606` count on. Else out of the Kit (global not 22): at
 * 0x54 of `+0x35fe`, its breed's tip (0x2372 on by its basket), counting on
 * to past it; after, the adverts in turn by `+0x3602` (from none, "On-Line
 * Help", 0x2371, or 0x2386; past 0x690 none again, `+0x3602` 0), else
 * counting on. Changed, its words go to `TextStatusBar`. The words shown, if
 * any.
 */
export function catzKitText(
  text: CatzKitText,
  world: {
    state: number;
    global: number;
    basket: number;
    age: number;
    xca: number;
    xea: number;
    edition?: { xc6: number; xc8: number };
  }
): number | undefined {
  const soon = !world.edition?.xc6 && !!world.edition?.xc8;

  if (world.state >= 73 && world.state <= 75 && world.xca && (world.xea || world.age)) {
    const steps: [number, number, number][] = [
      [0x233c, 0x8c, 0x235a],
      [0x235a, 0x118, 0x235b],
    ];

    if (text.x360a === 0x2380) {
      text.x360a = 0x233c;
      text.x3606 = 1000;
      return catzShowWords(text, text.x360a);
    }

    for (const [from, after, to] of steps) {
      if (text.x360a === from && text.x35fe >>> 0 > after) {
        text.x360a = to;
        return catzShowWords(text, to);
      }
    }

    if (text.x360a === 0x235b && text.x35fe >>> 0 > 0x1a4) {
      text.x360a = 0x2380;
      text.x35fe = 0;
      return undefined;
    }

    text.x35fe++;
    text.x3606++;
    return undefined;
  }

  if (world.global === 22) {
    return undefined;
  }

  /* (Its counts are unsigned: -1, as the cat is made, is past every mark.) */
  const x35fe = text.x35fe >>> 0;

  if (x35fe <= 0x54) {
    let shown: number | undefined;

    if (x35fe === 0x54) {
      if (world.basket >= 0 && world.basket <= 4) {
        text.x360a = 0x2372 + world.basket;
      }

      shown = catzShowWords(text, text.x360a);
    }

    text.x35fe++;
    text.x3606++;
    return shown;
  }

  if (text.x360c === 0x2380) {
    text.x360c = soon ? 0x2386 : 0x2371;
    return catzShowWords(text, text.x360c);
  }

  const x3602 = text.x3602 >>> 0;

  for (const advert of CATZ_KIT_ADVERTS) {
    if (advert.from.includes(text.x360c) && x3602 > advert.after) {
      text.x360c = soon && advert.soon !== undefined ? advert.soon : advert.to;
      return catzShowWords(text, text.x360c);
    }
  }

  if ((text.x360c === 0x2370 || text.x360c === 0x2385) && x3602 > 0x690) {
    text.x360c = 0x2380;
    text.x3602 = 0;
    return undefined;
  }

  text.x3602++;
  text.x3606++;
  return undefined;
}

/** The shelf's things the Kit leaves unlocked (`+0x1d0` 1): the Cat Dancer, yarn, cheese, mouse hole and milk bottle (`SetupToysLocked`, seg2:39c4); with `+0xc8`, the paint bucket, jingle ball and squeaky toy too (`SetupToysUnlocked`, seg2:3dc0). */
const CATZ_KIT_UNLOCKED = [5, 6, 8, 0xe, 0xf];
const CATZ_KIT_UNLOCKED_SOON = [1, 5, 6, 7, 8, 9, 0xe, 0xf];

/**
 * Whether a thing on the Kit's shelf is locked (`+0x1d0` 0), as
 * `XApt::SetupToys` (seg2:2c17) has it: with `PetParams` `+0xc6` none
 * (`SetupToysRetail`); else with `+0xc8` the fewer; else the more. Pressed,
 * a locked thing stays on the shelf and only tells the root (kind, 1, 3, 1)
 * (`XApt::DoUpdate`, seg6:03bb), so the cat shows its words.
 */
export function catzKitLocked(kind: number, edition = { xc6: 0, xc8: 0 }) {
  if (edition.xc6) {
    return false;
  }

  return !(edition.xc8 ? CATZ_KIT_UNLOCKED_SOON : CATZ_KIT_UNLOCKED).includes(kind);
}
