import { DEFAULT_GLUE, timeline } from '../../src/behaviour/timeline.ts';
import { OP, parseScripts } from '../../src/formats/script.ts';

/** Opcodes' operand counts, as DOGZDLL.DLL's table gives the ones used here. */
const ARITY = new Map<number, number>([
  [OP.begin, 0],
  [OP.repeat, 1],
  [OP.endRepeat, 0],
  [OP.frames, 2],
  [OP.framesToEnd, 1],
  [OP.framesToStart, 1],
  [OP.random, 2],
  [OP.call, 3],
  [OP.end, 0],
  [0x8ada, 1],
  [0x8adb, 2],
  [0x8ad7, 0],
  [0x8ad8, 1],
  [0x8ae5, 3],
]);

/** A script file: a copyright line, records, a total, and variants, each led by its length. */
function file(scripts: { from: number; to: number; variants: number[][] }[]) {
  const words: number[] = [];
  const offsets: number[] = [];

  for (const script of scripts) {
    offsets.push(words.length);

    for (const variant of script.variants) {
      words.push(variant.length + 1, ...variant);
    }
  }

  const head = new TextEncoder().encode('(c) test\0');
  const data = new Uint8Array(head.length + 2 + 12 * scripts.length + 4 + 2 * words.length);
  const view = new DataView(data.buffer);
  let at = head.length;

  data.set(head);
  view.setUint16(at, scripts.length, true);
  at += 2;
  scripts.forEach((script, index) => {
    view.setUint16(at, script.variants.length, true);
    view.setUint16(at + 2, script.from, true);
    view.setUint16(at + 4, script.to, true);
    view.setUint16(at + 6, 1, true);
    view.setUint32(at + 8, offsets[index], true);
    at += 12;
  });
  view.setUint32(at, words.length, true);
  at += 4;
  words.forEach((word, index) => view.setUint16(at + 2 * index, word & 0xffff, true));

  return data;
}

const flags = (frame: number) => ({ 10: 1, 13: 2 })[frame] ?? 0;
const frames = (steps: { frame: number }[]) => steps.map(({ frame }) => frame);

describe('the scripts', () => {
  const scripts = parseScripts(
    file([
      { from: 9, to: 9, variants: [[OP.begin, 5, OP.frames, 7, 9, OP.end]] },
      {
        from: 9,
        to: 6,
        variants: [
          [OP.begin, OP.repeat, 2, 1, OP.endRepeat, OP.end],
          [OP.begin, OP.framesToEnd, 11, OP.framesToStart, 12, OP.end],
        ],
      },
      { from: 6, to: 6, variants: [[OP.begin, OP.call, 0, OP.random, 1, 1, 65, OP.end]] },
    ]),
    ARITY
  );

  it('read each record and its variants', () => {
    expect(scripts.map((script) => [script.from, script.to, script.variants.length])).toEqual([
      [9, 9, 1],
      [9, 6, 2],
      [6, 6, 1],
    ]);
    expect(scripts[2].variants[0][1]).toEqual({
      op: OP.call,
      operands: [0, { random: [1, 1] }, 65],
    });
  });

  it('play frames and ranges in order', () => {
    expect(frames(timeline(scripts, 0, 0, { flags, random: () => 0 }))).toEqual([5, 7, 8, 9]);
  });

  it('repeat, and walk to the end or the start of a sequence by its flags', () => {
    expect(frames(timeline(scripts, 1, 0, { flags, random: () => 0 }))).toEqual([1, 1]);
    expect(frames(timeline(scripts, 1, 1, { flags, random: () => 0 }))).toEqual([
      11, 12, 13, 12, 11, 10,
    ]);
  });

  it('call other scripts, gluing each by the belly', () => {
    const steps = timeline(scripts, 2, 0, { flags, random: () => 0 });

    expect(frames(steps)).toEqual([5, 7, 8, 9]);
    expect(steps[0].glue).toBe(DEFAULT_GLUE);
  });

  it('give the next frame its sounds, its glue and its turn', () => {
    const [events] = parseScripts(
      file([
        {
          from: 0,
          to: 0,
          variants: [
            [
              OP.begin,
              0x8ada,
              56,
              0x8adb,
              3,
              4,
              0x8ad8,
              52,
              0x8ae5,
              1,
              16,
              0,
              20,
              0x8ad7,
              21,
              OP.end,
            ],
          ],
        },
      ]),
      ARITY
    ).map((_, index, all) => timeline(all, index, 0, { flags, random: (n) => n - 1 }));

    expect(events).toEqual([
      { frame: 20, sounds: [56, 4], glue: 52, turn: 16 },
      { frame: 21, glue: 50 },
    ]);
  });

  it('refuse a variant longer than its length', () => {
    const bad = file([{ from: 0, to: 0, variants: [[OP.begin, OP.frames, 1]] }]);
    expect(() => parseScripts(bad, ARITY)).toThrow(/runs past its length/);
  });
});
