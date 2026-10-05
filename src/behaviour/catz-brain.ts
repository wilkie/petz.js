/**
 * A Catz cat's brain: 12 numbers, each 0 to 100, most drawn back toward a
 * centre of its own a step at a time (`XBrain`, CATZDLL.DLL segment 45).
 * Its breed's `[Default Factors]` set each centre, drawn about the breed's
 * own as each cat is made (`CatSprite::InitBrain`, seg16:1c30). See
 * kb/topics/catz-behaviour.md.
 */

/** The cat's numbers, as `HandleAutoBreedSwitch`'s debugging names them (seg23:3ab5 on), and their order. */
export const CATZ_BRAIN = {
  liveliness: 0,
  energy: 1,
  independence: 2,
  seriousness: 3,
  fullness: 4,
  groom: 5,
  fleas: 6,
  fear: 7,
  sickness: 8,
  properDiet: 9,
  catnipped: 10,
  age: 11,
} as const;

/** How a brain changes on its own (`+0x46`): not at all, by a sine of the clock, back toward its centre, or never. */
export const BRAIN_KIND = { none: 0, periodic: 1, centring: 2, fixed: 3 } as const;

export interface CatzBrain {
  /** Its value now, and before it last moved of itself (`+0x3a`, `+0x3c`). */
  value: number;
  previous: number;

  /** Where it is drawn back to, and every how many 60 ticks of the clock (`+0x42`, `+0x44`). */
  centre: number;
  rate: number;

  kind: number;

  /** The clock it next moves back after (`+0x4a`). */
  due: number;
}

/** A brain as `XBrain`'s constructor makes one (seg45:1656): at 50, doing nothing. */
export function makeCatzBrain(): CatzBrain {
  return { value: 50, previous: 50, centre: 0, rate: 0, kind: BRAIN_KIND.none, due: 0 };
}

/** Sets a brain's value, kept within 0 to 100 (`SetVal`, seg45:1787); what it was before is left as it was. */
export function setCatzBrain(brain: CatzBrain, value: number) {
  brain.value = Math.max(0, Math.min(100, value));
}

/**
 * A brain's tick (`Update`, seg45:1995): a centring one, once the clock is
 * past when it is due, a step back toward its centre, and due again `rate`
 * × 60 later. The clock is the engine's: milliseconds over 17 (seg45:004b).
 */
export function updateCatzBrain(brain: CatzBrain, clock: number) {
  if (brain.kind !== BRAIN_KIND.centring || clock >>> 0 <= brain.due >>> 0) {
    return;
  }

  const was = brain.value;
  brain.value += brain.value < brain.centre ? 1 : brain.value > brain.centre ? -1 : 0;
  brain.due = (clock + brain.rate * 60) >>> 0;

  if (brain.value !== was) {
    brain.previous = was;
  }
}

/**
 * A cat's 12 brains as `CatSprite::InitBrain` makes them (seg16:1c30): each
 * but its age centring, its centre the breed's less or more by C's `rand`,
 * `centre + spread − 2 × (rand() % spread)`, and its value there; its age as
 * given. In the Adoption Kit, a kitten has no fleas, a diet half proper and
 * all its energy.
 */
export function initCatzBrains(
  factors: [number, number, number][],
  random: (n: number) => number,
  { age = 0, kit = false }: { age?: number; kit?: boolean } = {}
): CatzBrain[] {
  const brains = Array.from({ length: 12 }, makeCatzBrain);

  brains.forEach((brain, n) => {
    brain.kind = n === CATZ_BRAIN.age ? BRAIN_KIND.fixed : BRAIN_KIND.centring;

    if (n === CATZ_BRAIN.age) {
      return;
    }

    const [centre, spread, rate] = factors[n] ?? [0, 0, 0];
    brain.rate = rate;
    const drawn = spread > 0 ? random(spread) : spread;
    brain.centre = Math.max(0, Math.min(100, centre + spread - 2 * drawn));
    setCatzBrain(brain, brain.centre);
  });

  setCatzBrain(brains[CATZ_BRAIN.age], age);

  if (kit) {
    setCatzBrain(brains[CATZ_BRAIN.fleas], 0);
    setCatzBrain(brains[CATZ_BRAIN.properDiet], 50);
    setCatzBrain(brains[CATZ_BRAIN.energy], 100);
  }

  return brains;
}
