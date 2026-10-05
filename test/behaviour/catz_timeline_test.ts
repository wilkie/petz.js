import { CATZ_OP, catzTimeline, catzTransitions } from '../../src/behaviour/catz-timeline.ts';
import { type Element, type Operand, type Script } from '../../src/formats/script.ts';

const op = (code: number, ...operands: number[]): Element => ({ op: code, operands });
const variant = (...elements: Element[]): Element[] => [
  op(CATZ_OP.startPos),
  ...elements,
  op(CATZ_OP.endPos),
];
const script = (from: number, to: number, elements: Element[][], flag = 0): Script => ({
  from,
  to,
  flag,
  variants: elements,
});

const POSITIONS = { count: 10, neutral: 6 };
const options = { flags: () => 0, random: () => 0 };
const frames = (steps: { frame: number; reference?: boolean }[]) =>
  steps.map(({ frame, reference }) => (reference ? `${frame}r` : String(frame)));

describe('a Catz action played out', () => {
  it('shows a sequence’s frames, counting down where it ends lower', () => {
    const scripts = [
      script(1, 1, [variant(op(CATZ_OP.sequence, 5, 7), op(CATZ_OP.sequence, 3, 1))]),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, options))).toEqual([
      '5',
      '6',
      '7',
      '3',
      '2',
      '1',
    ]);
  });

  it('repeats a loop, and skips one of none', () => {
    const scripts = [
      script(1, 1, [
        variant(
          op(CATZ_OP.startLoop, 2),
          { frame: 4 },
          op(CATZ_OP.endLoop),
          op(CATZ_OP.startLoop, 0),
          { frame: 9 },
          op(CATZ_OP.endLoop),
          { frame: 5 }
        ),
      ]),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, options))).toEqual(['4', '4', '5']);
  });

  it('plays another action as often as it is told, the frame after each a reference', () => {
    const scripts = [
      script(1, 1, [variant(op(CATZ_OP.playAction, 1, 2), { frame: 9 })]),
      script(1, 1, [variant({ frame: 3 })]),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, options))).toEqual(['3', '3r', '9r']);
  });

  it('goes to where an action starts by the transitions first, from wherever the cat is', () => {
    const scripts = [
      script(3, 3, [variant({ frame: 30 })]),
      script(1, 2, [variant({ frame: 12 })], 1),
      script(2, 3, [variant({ frame: 23 })], 1),
    ];

    expect(catzTransitions(scripts, 1, 3)).toEqual([1, 2]);
    expect(frames(catzTimeline(scripts, POSITIONS, 0, { ...options, from: 1 }))).toEqual([
      '12',
      '23r',
      '30r',
    ]);
  });

  it('needs no transition from the neutral position', () => {
    const scripts = [
      script(3, 3, [variant({ frame: 30 })]),
      script(6, 3, [variant({ frame: 63 })], 1),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, options))).toEqual(['30']);
  });

  it('glues each turn of a loop ending endLoopAlign but the first', () => {
    const scripts = [
      script(1, 1, [
        variant(op(CATZ_OP.startLoop, 3), { frame: 4 }, { frame: 5 }, op(CATZ_OP.endLoopAlign)),
      ]),
    ];
    const steps = catzTimeline(scripts, POSITIONS, 0, options);

    expect(steps.map(({ frame, glue }) => `${frame}${glue ? 'g' : ''}`)).toEqual([
      '4',
      '5',
      '4g',
      '5',
      '4g',
      '5',
    ]);
  });

  it('plays an action again and again, aligned each time, as a walk goes on', () => {
    const scripts = [script(1, 1, [variant({ frame: 3 }, { frame: 4 })])];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, { ...options, times: 3 }))).toEqual([
      '3',
      '4',
      '3r',
      '4',
      '3r',
      '4',
    ]);
  });

  it('ends no loop at an end with none open, as a loop skipped with one inside leaves', () => {
    const scripts = [
      script(1, 1, [
        variant(
          op(CATZ_OP.startLoop, 0),
          op(CATZ_OP.startLoop, 2),
          { frame: 4 },
          op(CATZ_OP.endLoop),
          op(CATZ_OP.endLoop),
          { frame: 5 }
        ),
      ]),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, options))).toEqual(['5']);
  });

  it('draws a variant and a sequence’s operands from the table, the rest from rand', () => {
    const rand = (lo: number, hi: number): Operand => ({ random: [lo, hi] });
    const scripts = [
      script(1, 1, [
        [op(CATZ_OP.startPos), { frame: 1 }],
        [
          op(CATZ_OP.startPos),
          { op: CATZ_OP.sequence, operands: [rand(10, 19), 20] },
          { op: CATZ_OP.startLoop, operands: [rand(1, 3)] },
          { frame: 7 },
          op(CATZ_OP.endLoop),
        ],
      ]),
    ];
    const drawn: string[] = [];
    const random = (n: number, from: 'table' | 'rand') => {
      drawn.push(`${from} ${n}`);
      return from === 'table' ? 1 : 2;
    };
    const steps = catzTimeline(scripts, POSITIONS, 0, { flags: () => 0, random });

    expect(drawn).toEqual(['table 2', 'table 10', 'rand 3']);
    expect(frames(steps)).toEqual([...'11 12 13 14 15 16 17 18 19 20'.split(' '), '7', '7', '7']);
  });

  it('pushes a nested action from where the cat is, not where it is going', () => {
    const scripts = [
      script(1, 2, [variant(op(CATZ_OP.playAction, 1, 1))]),
      script(1, 1, [variant({ frame: 3 })]),
      /* From 2 to 1: a transition the nested action would take from where the first ends. */
      script(2, 1, [variant({ frame: 8 })], 1),
    ];

    expect(frames(catzTimeline(scripts, POSITIONS, 0, { ...options, from: 1 }))).toEqual(['3']);
  });
});
