import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { averageBreed, parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import {
  catzArity,
  parseScripts,
  readCatzOpcodes,
  SCRIPTS,
  writeScripts,
} from '../../src/formats/script.ts';
import { describeWithOracle } from './with-oracle.ts';

const PETZ = 'oracle/build/catz-drive-c/CATZ.DOG/PTZFILES';
const ENGINE = 'oracle/build/catz-drive-c/WINDOWS/SYSTEM/CATZDLL.DLL';
const describe = describeWithOracle(PETZ);

/** Each of the Catz demo's creatures: its folder, its files' stem, and its skeleton's balls. */
const CREATURES = [
  { folder: 'CAT', stem: 'CAT', balls: 67, scripts: 805, positions: 123 },
  { folder: 'DOG', stem: 'DOG', balls: 65, scripts: 9, positions: 5 },
  { folder: 'MOUSE', stem: 'MOUSE', balls: 16, scripts: 36, positions: 11 },
  { folder: 'BOTTLE', stem: 'BOTTL', balls: 5, scripts: 1, positions: 2 },
  { folder: 'CLOUD', stem: 'CLOUD', balls: 12, scripts: 3, positions: 2 },
];

describe('the Catz demo’s files', () => {
  const opcodes = readCatzOpcodes(parseNe(new Uint8Array(readFileSync(ENGINE))));

  it('name 64 opcodes in CATZDLL.DLL, from startPos to endPos', () => {
    expect(opcodes.size).toBe(64);
    expect(opcodes.get(30000)?.name).toBe('startPos');
    expect(opcodes.get(30028)).toEqual({ name: 'rand2', count: 2, operands: '##' });
    expect(opcodes.get(30031)).toEqual({ name: 'sequence2', count: 2, operands: 'ss' });
    expect(opcodes.get(30063)?.name).toBe('endPos');
  });

  for (const { folder, stem, balls, scripts, positions } of CREATURES) {
    const resource = join(PETZ, folder, 'RESOURCE');
    const read = (name: string) => new Uint8Array(readFileSync(join(resource, name)));

    it(`reads the ${folder.toLowerCase()}’s skeleton, and every frame of the animations the demo has`, () => {
      const header = parseBhd(read(`${stem}.BHD`));
      const files = new Set(readdirSync(resource));

      expect(header.ballCount).toBe(balls);

      header.animations.forEach((_, n) => {
        if (files.has(`${stem}${n}.BDT`)) {
          const frames = parseAnimation(header, n, read(`${stem}${n}.BDT`));
          expect(frames.every((frame) => frame.balls.length === balls)).toBe(true);
        }
      });
    });

    it(`reads the ${folder.toLowerCase()}’s ${scripts} scripts, between ${positions} positions, and writes them back byte for byte`, () => {
      const data = read(`${stem}.SCP`);
      const parsed = parseScripts(data, catzArity(opcodes), SCRIPTS.catz);
      const actions = parsed.flatMap(({ variants }) =>
        variants
          .flat()
          .flatMap((element) =>
            'op' in element && opcodes.get(element.op)?.operands[0] === 'a'
              ? [element.operands[0]]
              : []
          )
      );

      expect(parsed).toHaveLength(scripts);
      expect(new DataView(data.buffer).getUint16(data.indexOf(0) + 1, true)).toBe(positions);
      expect(parsed.every(({ from, to }) => from < positions && to < positions)).toBe(true);
      expect(actions.every((action) => typeof action === 'number' && action < scripts)).toBe(true);
      expect(writeScripts(data, parsed, SCRIPTS.catz)).toEqual(data);
    });

    it(`reads the ${folder.toLowerCase()}’s breed files, their lines laid out with tabs too`, () => {
      const header = parseBhd(read(`${stem}.BHD`));

      for (const name of readdirSync(resource).filter((file) => file.endsWith('.LNZ'))) {
        const breed = parseLnz(new TextDecoder('latin1').decode(read(name)), header.ballCount);
        expect(breed.ballColor256).toHaveLength(balls);
        expect(breed.lines.every(({ from, to }) => from < balls && to < balls)).toBe(true);
      }
    });
  }

  it('shape the Siamese by Catz’s own sections', () => {
    const header = parseBhd(new Uint8Array(readFileSync(join(PETZ, 'CAT', 'RESOURCE', 'CAT.BHD'))));
    const text = readFileSync(join(PETZ, 'CAT', 'RESOURCE', 'ASIAMESE.LNZ'), 'latin1');
    const { catz } = parseLnz(text, header.ballCount);

    expect(catz).toEqual({
      head: { percent: 93, extra: 0 },
      feet: { percent: 70, extra: 0 },
      ears: 100,
      up: [
        [2, 4],
        [4, -5],
        [5, -5],
      ],
      forward: [
        [37, -2],
        [4, 10],
        [5, 10],
        [40, 2],
      ],
      sideways: [
        [4, 0],
        [5, 0],
        [9, 5],
        [11, -5],
        [31, -3],
        [30, 3],
      ],
      project: [
        [43, 44, 120],
        [44, 45, 120],
        [45, 46, 120],
        [46, 47, 120],
        [47, 48, 120],
      ],
      littleOne: 'ksiamese.lnz',
    });
  });

  it('average Pouncer, the Hunter, with its kitten’s file as Catz does', () => {
    const header = parseBhd(new Uint8Array(readFileSync(join(PETZ, 'CAT', 'RESOURCE', 'CAT.BHD'))));
    const lnz = (name: string) =>
      parseLnz(readFileSync(join(PETZ, 'CAT', 'RESOURCE', name), 'latin1'), header.ballCount);
    const [adult, kitten] = [lnz('AHUNTER.LNZ'), lnz('KHUNTER.LNZ')];
    const at = (percent: number) => averageBreed(adult, kitten, percent);

    /* The adult's own at 0, the kitten's at 100: but the colours and lines always the adult's. */
    expect(at(0).catz?.head).toEqual(adult.catz?.head);
    expect(at(100).catz?.head).toEqual(kitten.catz?.head);
    expect(at(100).defaultScales.slice(0, 2)).toEqual(kitten.defaultScales.slice(0, 2));
    expect(at(100).ballColor256).toEqual(adult.ballColor256);
    expect(at(100).lines).toEqual(adult.lines);

    /* Move lists come out in ball order, a ball once. */
    for (const list of ['up', 'forward', 'sideways'] as const) {
      const balls = at(50).catz![list].map(([ball]) => ball);
      expect(balls).toEqual([...new Set(balls)].sort((a, b) => a - b));
    }
  });

  it('ships the first 98 of the cat’s 275 animations', () => {
    const header = parseBhd(new Uint8Array(readFileSync(join(PETZ, 'CAT', 'RESOURCE', 'CAT.BHD'))));
    const files = readdirSync(join(PETZ, 'CAT', 'RESOURCE')).filter((file) =>
      /^CAT\d+\.BDT$/.test(file)
    );

    expect(header.animations).toHaveLength(275);
    expect(files).toHaveLength(98);
  });
});
