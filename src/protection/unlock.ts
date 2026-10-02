/**
 * The Dogz adoption kit's unlock code: what `THINK.DLL` expects to be typed
 * into the "Purchase your Dogz" screen, worked out from the code that checks
 * it. See `kb/topics/adoption-unlock.md` for the read-out.
 *
 * The screen shows a "Dogz Validation Code", but that number is a constant of
 * the release, not of the machine. The code that is actually checked comes
 * from the volume serial number of the first hard disk: `THINK.DLL` asks DOS
 * for it (INT 21h AX=6900h, through DPMI), prints it in upper-case hex, takes
 * hex digits 6, 4, 0 and 2, maps each through a scrambled table, packs the
 * four results into a 16-bit number and prints that in decimal. The first
 * four characters typed must match the first four of that, and nothing else
 * of the eight typed is checked.
 *
 * Written so Node can run it as it is (types only, nothing to transpile), so
 * the oracle's scripts import it directly.
 */

/**
 * The scrambled value of each hex digit, from `THINK.DLL` seg2:01e7. Any
 * character not in the table -- including a string's terminator -- is 8.
 */
const SCRAMBLE: Record<string, number> = {
  '0': 2,
  '1': 0,
  '2': 15,
  '3': 13,
  '4': 1,
  '5': 14,
  '6': 7,
  '7': 10,
  '8': 9,
  '9': 4,
  A: 6,
  B: 3,
  C: 11,
  D: 8,
  E: 5,
  F: 12,
};

const OTHER = 8;

/** The volume serial number's string when no drive from C: to F: answers. */
export const NO_DRIVE = '8E3B27C5';

/**
 * The string `THINK.DLL` makes of a volume serial number: upper-case hex
 * without leading zeros, as Borland's `ltoa(serial, buffer, 16)` writes it.
 *
 * Where DOS refuses the call -- as DOSBox does, for every drive -- the serial
 * is taken as 0, and the string is `"0"`. The characters after its
 * terminator are whatever the buffer held before; `unlockPrefix` reads them,
 * and treats them as the table does any character that is not a hex digit.
 */
export function serialString(serial: number | null): string {
  return (serial ?? 0).toString(16).toUpperCase();
}

/**
 * The four characters an unlock code must start with, for a volume serial
 * string. `seg2:031a` reads its characters 6, 4, 0 and 2; one past the end of
 * a short string is read as the table's default, which is what the leftover
 * bytes in the buffer were in every run recorded so far.
 */
export function unlockPrefix(serial: string): string {
  const at = (index: number) => SCRAMBLE[serial[index] ?? ''] ?? OTHER;
  const value = (at(6) << 12) + (at(4) << 8) + (at(0) << 4) + at(2);

  /* Printed with "%ld"; anything in the first four places that is not a
   * digit becomes an 8. A value under 1000 leaves its terminator there. */
  return Array.from(String(value).padEnd(4, '\0').slice(0, 4), (character) =>
    character >= '0' && character <= '9' ? character : '8'
  ).join('');
}

/**
 * An unlock code the adoption screen accepts, in the `XXXX-XXXX` form it
 * shows: the prefix, then four characters it never looks at.
 */
export function unlockCode(serial: string, tail = '0000'): string {
  if (!/^[0-9]{4}$/.test(tail)) {
    throw new Error('the tail of an unlock code is four digits');
  }

  return `${unlockPrefix(serial)}-${tail}`;
}

/**
 * The digit keys `THINK.DLL`'s `_LookAtBrain` (seg2:003e) adds or subtracts,
 * one table per branch, over the first 18 digits of a string.
 */
export const BRAIN_KEYS: readonly (readonly number[])[] = [
  [3, 6, 7, 3, 4, 2, 8, 3, 1, 0, 5, 4, 9, 8, 9, 3, 2, 3],
  [7, 9, 2, 3, 4, 4, 5, 6, 3, 1, 0, 6, 8, 3, 5, 2, 6, 3],
  [1, 2, 3, 7, 5, 3, 0, 8, 9, 5, 5, 4, 5, 2, 9, 8, 8, 0],
];

/**
 * The strings `NEURON.DLL`'s three exports copy out, one per branch, as the
 * oracle's first installation had them. Setup rewrites them in the DLL's data
 * segment for each installation, so every installation has its own; all
 * three decode to the same validation code.
 */
export const NEURON_STRINGS: readonly string[] = [
  '3904273907787638093636',
  '7254290228206197493363',
  '1568385482783033663345',
];

/**
 * Which branch the adoption screen takes for the last digit of its time id
 * (`_GetTimeId`: the last four digits of the time in seconds), from its jump
 * table at `DOGZ.WAD` seg3:878b.
 */
export const BRANCH_FOR_DIGIT: readonly number[] = [0, 1, 2, 1, 0, 2, 0, 2, 2, 1];

/** `_LookAtBrain` with mode 0x541: subtract the branch's keys, digit by digit. */
export function lookAtBrain(digits: string, branch: number): string {
  return Array.from(digits, (character, index) =>
    index < 18 ? String((Number(character) + 10 - BRAIN_KEYS[branch][index]) % 10) : character
  ).join('');
}

/**
 * The "Dogz Validation Code" the adoption screen shows at a given time, in
 * its dashed form, from an installation's three `NEURON.DLL` strings. Which
 * string is decoded depends on the time, but on an installation all three
 * give the same 19 digits: the code names the installation, not the moment.
 * It plays no part in checking the unlock code.
 */
export function validationCode(neuron: readonly string[], seconds: number): string {
  const branch = BRANCH_FOR_DIGIT[Math.floor(seconds) % 10];
  const digits = lookAtBrain(neuron[branch], branch).slice(0, 19);

  return digits.match(/.{1,4}/g)!.join('-');
}
