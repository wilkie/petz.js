import { parseLnz, parseLnzSections } from '../../src/formats/lnz.js';

/** A breed of two balls, written as the game's own files are: tabs, comments, CRLF. */
const BREED = [
  '[Skeleton Type]',
  '4',
  '',
  '[Eyes]',
  '1, 0\t\t\tRightEye/leftEye',
  '1, 0 \t\t\tRightIris/leftIris',
  '',
  '[Head Balls]',
  '1\t\teBall_head,\t\t\t// 1',
  '',
  '[Omissions]',
  '',
  '[Linez]\t\t// start ball, end ball, fuzz amount',
  '1, 0, 1\t\t\thead/chest',
  '',
  ...[
    '256 Ball Color',
    '16 Ball Color',
    'Speckle Color',
    'Ball Size Diffs',
    'Puppy Balls',
    'Outline Type',
    'Outline Color',
    'Fuzz',
  ].flatMap((name, index) => [
    `[${name}]\t\t 0blk, 1dkRed`,
    `${index}\teBall_chest,\t\t\t// 0`,
    `-${index}\teBall_head,\t\t\t// 1`,
    '',
  ]),
  '[Default Scales]',
  '220',
  ';110\t\t\tnormal pet scale',
  '140',
  '',
  '[Sound List]',
  'sounds/masndlst.txt\t\t// adult',
].join('\r\n');

describe('a breed file', () => {
  it('reads values before the first tab and the comment after it', () => {
    const sections = parseLnzSections(BREED);

    expect(sections.get('Linez')).toEqual([{ values: [1, 0, 1], comment: 'head/chest' }]);
    expect(sections.get('Sound List')).toEqual([
      { values: ['sounds/masndlst.txt'], comment: '// adult' },
    ]);
  });

  it('names what a breed says', () => {
    const breed = parseLnz(BREED, 2);

    expect(breed.skeletonType).toBe(4);
    expect(breed.eyes).toEqual([1, 0]);
    expect(breed.irises).toEqual([1, 0]);
    expect(breed.headBalls).toEqual([1]);
    expect(breed.omissions).toEqual([]);
    expect(breed.lines).toEqual([{ from: 1, to: 0, fuzz: 1 }]);
    expect(breed.ballColor256).toEqual([0, -0]);
    expect(breed.ballSizeDiffs).toEqual([3, -3]);
    expect(breed.fuzz).toEqual([7, -7]);
    expect(breed.ballNames).toEqual(['eBall_chest', 'eBall_head']);
    expect(breed.defaultScales).toEqual([220, 140]);
  });

  it('refuses a per-ball section without a line for every ball', () => {
    expect(() => parseLnz(BREED, 3)).toThrow(/not one for each of 3 balls/);
  });
});
