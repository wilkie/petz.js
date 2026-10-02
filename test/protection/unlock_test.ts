import {
  NEURON_STRINGS,
  NO_DRIVE,
  serialString,
  unlockCode,
  unlockPrefix,
  validationCode,
} from '../../src/protection/unlock.js';

describe('the adoption unlock code', () => {
  it('is 3485 on a drive whose serial DOS will not give', () => {
    // DOSBox answers INT 21h AX=6900h with carry set, so THINK takes 0.
    expect(serialString(null)).toBe('0');
    expect(unlockPrefix(serialString(null))).toBe('3485');
    expect(unlockCode('0')).toBe('3485-0000');
  });

  it('reads hex digits 6, 4, 0 and 2 through the scrambled table', () => {
    // 1234ABCD: '1'=0 at 0, '3'=13 at 2, 'A'=6 at 4, 'C'=11 at 6.
    // 11<<12 + 6<<8 + 0<<4 + 13 = 46605.
    expect(unlockPrefix('1234ABCD')).toBe('4660');
  });

  it('has an answer when no drive from C: to F: can be selected', () => {
    expect(unlockPrefix(NO_DRIVE)).toMatch(/^[0-9]{4}$/);
  });

  it('pads a value under 1000 with 8s', () => {
    // '1' everywhere is 0: the value is 0, printed "0", then three 8s.
    expect(unlockPrefix('1111111')).toBe('0888');
  });

  it('takes only four digits after the prefix', () => {
    expect(() => unlockCode('0', '12')).toThrow();
  });
});

describe('the validation code', () => {
  /* Two installations' NEURON.DLL strings, and the code each one's adoption
   * screen showed. */
  const installations: [string[], string][] = [
    [[...NEURON_STRINGS], '0331-8556-9724-8845-863'],
    [
      ['8521008427183626705636', '2871025748602185105363', '6185110902189021375345'],
      '5958-6801-1764-4833-575',
    ],
  ];

  it.each(installations)('is what the screen showed, at any time', (neuron, shown) => {
    const codes = new Set(Array.from({ length: 10 }, (_, digit) => validationCode(neuron, digit)));

    expect([...codes]).toEqual([shown]);
  });
});
