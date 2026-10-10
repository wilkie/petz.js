/**
 * What a Catz cat is inclined to do, by its brains: `MapCatBehavior`
 * (CATZDLL.DLL seg15:0000), which the state handlers ask a number or a yes
 * of, by one of 29 behaviours. See kb/topics/catz-behaviour.md.
 */

import { CATZ_BRAIN } from './catz-brain.ts';

/** What `MapCatBehavior` reads of the cat besides its brains. */
export interface CatzMind {
  /** The 12 brains' values (`XBrain::GetVal`, `+0x3a`), in `CATZ_BRAIN`'s order. */
  brains: number[];

  /** Its state (`+0x2552`) and its global state (the machine `+0x2fba` points to). */
  state: number;
  global: number;

  /** The kind of sprite it is after (`+0x35a4`), and `+0x35d6`, a count. */
  target: number;
  count: number;
}

/** `low` and `high` by a value out of 100, rounded toward 0 (`MapValue`, seg48:1cb2). */
export function mapCatzValue(low: number, high: number, value: number) {
  return low + Math.trunc((value * (high - low)) / 100);
}

/**
 * A behaviour, as `MapCatBehavior` answers it: a number, a yes (1) or no
 * (0), or -1 for none. `random(n)` is C's `rand() % n`, drawn as the engine
 * draws it -- only where a test before it has not settled the answer, as C
 * leaves the rest of a `&&` or `||`. The engine works out its answers in
 * pairs and blocks, and answers the one asked; so does this.
 */
export function catzBehavior(
  mind: CatzMind,
  behaviour: number,
  random: (n: number) => number
): number {
  const brain = (n: number) => mind.brains[n];
  const L = brain(CATZ_BRAIN.liveliness);
  const E = brain(CATZ_BRAIN.energy);
  const I = brain(CATZ_BRAIN.independence);
  const S = brain(CATZ_BRAIN.seriousness);
  const F = brain(CATZ_BRAIN.fullness);
  const fear = brain(CATZ_BRAIN.fear);
  const diet = brain(CATZ_BRAIN.properDiet);
  const nip = brain(CATZ_BRAIN.catnipped);
  const age = brain(CATZ_BRAIN.age);
  const { state, global, target, count } = mind;
  const percent = () => random(101);
  const answers: number[] = Array(29).fill(-1);

  switch (behaviour) {
    case 1:
      answers[1] = mapCatzValue(60, 100, 100 - S);
      break;
    case 2:
      answers[2] = 100 - (fear < 76 ? I : fear);
      break;
    case 3:
      answers[3] = fear < 50 && L < 50 && I > 49 && S > 49 ? 10 : fear < S ? S : fear;
      break;
    case 4:
      answers[4] = fear < 50 && (L < 50 || I > 49 || S > 49) ? 20 : 80;
      break;
    case 5:
      if (fear < 50) {
        answers[5] = mapCatzValue(4, 30, I < S ? S : I);

        if (S > 49 || I > 49) {
          answers[5] -= mapCatzValue(4, 15, 100 - L);
        }
      } else {
        answers[5] = mapCatzValue(4, 30, fear);
      }
      break;
    case 6: {
      const most = fear < L ? L : fear;
      answers[6] = I < most ? most : I;

      if (percent() < 20) {
        answers[6] = percent();
      }
      break;
    }
    case 7:
    case 14:
      answers[7] = (L < 50 || I < 50 || S < 50) && percent() > 9 ? 0 : 1;
      answers[14] =
        answers[7] !== 0 || (percent() < 100 - fear && percent() < Math.trunc((100 - F) / 2))
          ? 1
          : 0;
      break;
    case 8:
    case 21:
      answers[8] = (E < 50 || S > 49 || percent() > 89) && percent() > 9 ? 0 : 1;
      answers[21] =
        answers[8] === 0 ? Number(random(3) + 1 < count) : Number(random(5) + 3 < count);
      break;
    case 9:
    case 15:
    case 18:
    case 20:
    case 24:
    case 25:
    case 26:
    case 27:
    case 28: {
      const e = L < 50 && I > 49 && S > 49 && fear < 50;
      const c = !(L < 50 || I < 50 || S < 50 || fear > 49);
      const a = L < 50 && I < 50 && S < 50 && fear < 50;
      const scared = fear > 49;
      answers[24] = Number(e);
      answers[25] = Number(c);
      answers[26] = Number(a);
      answers[27] = Number(scared);
      answers[28] = Number(!(L < 50 || I > 49 || S > 49 || fear > 49));

      if (e) {
        answers[18] = Number(F < 80 && global !== 13 && global !== 9);
        answers[20] = Number(nip < 80 && global !== 13 && global !== 9);
      } else if (c) {
        answers[18] = Number(!(global === 1 && target === 0x1b));
        answers[20] = Number(nip < 80 && global !== 1 && global !== 9);
      } else if (a) {
        answers[18] = answers[20] = Number(nip < 80 && state !== 0x1c);
      } else if (!scared) {
        answers[18] = Number(F < 80 && state !== 0x1c);
        answers[20] = Number(nip < 80 && global !== 9);
      } else {
        answers[18] = Number(F < 80 && global !== 17 && state !== 0x1c);
        answers[20] = Number(nip < 80 && global !== 17 && global !== 9);
      }

      /* Whether it would play: by chance, one time in ten, or where it is
       * lively and not serious, by its fear and its energy. */
      const byChance = () => percent() < 10;
      answers[9] = Number(
        L < 50 || S > 49
          ? byChance()
          : percent() >= 100 - fear || percent() >= E
            ? byChance()
            : true
      );

      if (percent() < 100 - fear) {
        const odds = 100 - age < 30 ? 30 : 100 - age;
        answers[15] = Number(answers[9] !== 0 || percent() < odds);
      } else {
        answers[15] = 0;
      }

      if (global === 3 && (c || a)) {
        answers[15] = 0;
      }
      break;
    }
    case 10:
      answers[10] = Number(L < 50 && I > 49 && S > 49 && fear < 50 && percent() < 90);
      break;
    case 11:
    case 12:
      if ((L < 50 && I < 50 && S < 50 && percent() < 90) || percent() < 10) {
        answers[11] = mapCatzValue(30, 70, 100 - age);
        answers[12] = mapCatzValue(30, 50, 100 - age);
      } else {
        answers[11] = mapCatzValue(12, 50, 100 - age);
        answers[12] = mapCatzValue(12, 30, 100 - age);
      }
      break;
    case 13:
      answers[13] = 90;
      break;
    case 16:
    case 19:
      answers[16] = Number((L < 50 && I < 50 && S < 50) || percent() < Math.trunc((100 - E) / 10));

      if (answers[16] !== 0) {
        answers[19] = 1;
      } else if (age < 50) {
        answers[19] = Number(catzBehavior(mind, 11, random) > F || percent() < 100 - age - age);
      } else {
        answers[19] = 0;
      }
      break;
    case 17:
      answers[17] = Number(fear > 49);
      break;
    case 22:
      answers[22] = Number(diet < 10);
      break;
    case 23:
      answers[23] = Number(diet > 75);
      break;
  }

  return answers[behaviour] ?? -1;
}
