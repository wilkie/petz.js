/**
 * A Catz cat's reflexes (CATZDLL.DLL seg23; kb/topics/catz-behaviour.md,
 * "Reflexes"): the methods `CatSprite::Update` (seg16:23da) calls each tick,
 * after its brains move on and before its state machines.
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
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
