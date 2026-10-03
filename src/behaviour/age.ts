/**
 * How a dog grows up: `InitStaticIni` (DOGZDLL.DLL seg2:0190), as Dogz
 * starts, reads its age from `DOGZ.INI` (`age`, in days played) and the
 * day and month it was last played (`last day use`, `last month use`);
 * started on another day than that, it is a day older, and writes the age
 * and today back. Only the day and month are kept, not the year.
 * `PetModule::LoadFactors` makes the age factor ten times the age, kept to
 * 1 to 100: a dog is grown at ten days. See kb/topics/behaviour.md, growing up.
 */

export interface Aging {
  /** Days it has been played (`age`). */
  age: number;
  /** The day of the month and the month, from 1, it was last played. */
  lastDay: number;
  lastMonth: number;
}

/** Started today: a day older if it was last played on another day (seg2:030a to 03b2). */
export function startOn(saved: Aging, today: Date): Aging {
  const [day, month] = [today.getDate(), today.getMonth() + 1];

  if (saved.lastMonth === month && saved.lastDay === day) {
    return saved;
  }

  return { age: saved.age + 1, lastDay: day, lastMonth: month };
}

/** The age factor for an age in days (`LoadFactors`, seg21:1f99): ten a day, at most 100. */
export function ageFactor(age: number) {
  return Math.max(1, Math.min(100, Math.trunc((age * 100) / 10)));
}
