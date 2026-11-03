/**
 * A Catz cat's reflexes (CATZDLL.DLL seg23; kb/topics/catz-behaviour.md,
 * "Reflexes"): the methods `CatSprite::Update` (seg16:23da) calls each tick,
 * after its brains move on and before its state machines.
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';

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
