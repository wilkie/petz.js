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

  /** And their centres (`+0x42`, `XBrain`'s slot `0x30`): its temperament, for its sounds. */
  centres?: number[];

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

/**
 * Which of two actions, by C's `rand` (seg48:1afb): the first for an even
 * draw, the second for an odd one.
 */
function eitherOf(first: number, second: number, random: (n: number) => number) {
  return random(2) === 0 ? first : second;
}

/**
 * The action a sound is made with (`MapCatSound`, seg15:1259), by one of
 * 12: by the cat's temperament -- its brains' centres, not where they are
 * now -- frightened (fear 50 or more), independent (lively under 50,
 * independence and seriousness 50 or more), lively (liveliness 50 or more,
 * the rest under), placid (all under 50) or serious (all but fear 50 or
 * more), first that fits, lively where none does; some by chance between
 * two; three of them a kitten's where it is young. 12 answers whether it
 * is placid now, by where its brains are. -1 for none.
 */
export function catzSound(mind: CatzMind, sound: number, random: (n: number) => number): number {
  const at = (from: number[]) => (n: number) => from[n];
  const centre = at(mind.centres ?? mind.brains);
  const now = at(mind.brains);
  const [L, I, S, fear] = [
    CATZ_BRAIN.liveliness,
    CATZ_BRAIN.independence,
    CATZ_BRAIN.seriousness,
    CATZ_BRAIN.fear,
  ].map(centre);
  const independent = L < 50 && I > 49 && S > 49 && fear < 50;
  let lively = L > 49 && I < 50 && S < 50 && fear < 50;
  const placid = L < 50 && I < 50 && S < 50 && fear < 50;
  const serious = L > 49 && I > 49 && S > 49 && fear < 50;
  const frightened = fear > 49;
  const placidNow =
    now(CATZ_BRAIN.liveliness) < 50 &&
    now(CATZ_BRAIN.independence) < 50 &&
    now(CATZ_BRAIN.seriousness) < 50 &&
    now(CATZ_BRAIN.fear) < 50;
  lively ||= !independent && !placid && !serious && !frightened;

  const age = now(CATZ_BRAIN.age);
  const percent = () => random(101);
  const young = () => percent() < 100 - age && age < 50;
  /* By temperament: frightened, independent, lively, placid, serious. */
  const by = (...actions: (number | (() => number))[]) => {
    const which = frightened ? 0 : independent ? 1 : lively ? 2 : placid ? 3 : serious ? 4 : -1;
    const action = actions[which];
    return action === undefined ? -1 : typeof action === 'function' ? action() : action;
  };
  const either = (first: number, second: number) => () => eitherOf(first, second, random);

  switch (sound) {
    case 1:
      return by(0x193, either(399, 400), 400, 0x191, 0x192);
    case 2:
      return by(0x197, 0x194, 0x195, 0x196, 0x196);
    case 3:
      return by(0x19c, 0x198, 0x199, 0x19a, 0x19b);
    case 4:
      return by(0x19e, 0x19d, 0x19e, 0x19e, 0x19f);
    case 5:
      return by(0x1a4, 0x1a0, 0x1a1, 0x1a2, 0x1a3);
    case 6:
      return by(0x1a9, 0x1a5, 0x1a6, 0x1a7, 0x1a8);
    case 7:
      return young() ? 0x1c2 : by(0x1ae, 0x1aa, 0x1ab, 0x1ac, 0x1ad);
    case 8:
      return by(0x1b3, 0x1af, either(0x1b0, 0x1b3), 0x1b1, 0x1b2);
    case 9: {
      if (young()) {
        return eitherOf(0x1c3, 0x1c2, random);
      }

      const full = now(CATZ_BRAIN.fullness);
      const notStuffed = () => full < 81 || percent() > 9;

      if (placidNow && !notStuffed()) {
        return 0x1b7;
      }

      return by(either(0x1b9, 0x197), 0x1b4, 0x1b5, () => (notStuffed() ? 0x1b6 : 0x1b7), 0x1b8);
    }
    case 10:
      return young() ? eitherOf(0x1c3, 0x1bb, random) : by(0x2d4, 0x1ba, 0x1bb, 0x1bc, 0x1bd);
    case 11:
      return by(either(0x1c1, 0x1b9), 0x1be, 0x1bf, 0x1c0, either(399, 0x192));
    case 12:
      return Number(placidNow);
    default:
      return -1;
  }
}
