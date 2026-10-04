import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { parseLnz } from '../../src/formats/lnz.ts';
import { describeWithOracle } from './with-oracle.ts';

const PETZ = 'oracle/build/catz-drive-c/CATZ.DOG/PTZFILES';
const describe = describeWithOracle(PETZ);

/** Each of the Catz demo's creatures: its folder, its files' stem, and its skeleton's balls. */
const CREATURES = [
  { folder: 'CAT', stem: 'CAT', balls: 67 },
  { folder: 'DOG', stem: 'DOG', balls: 65 },
  { folder: 'MOUSE', stem: 'MOUSE', balls: 16 },
  { folder: 'BOTTLE', stem: 'BOTTL', balls: 5 },
  { folder: 'CLOUD', stem: 'CLOUD', balls: 12 },
];

describe('the Catz demo’s files', () => {
  for (const { folder, stem, balls } of CREATURES) {
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

    it(`reads the ${folder.toLowerCase()}’s breed files, their lines laid out with tabs too`, () => {
      const header = parseBhd(read(`${stem}.BHD`));

      for (const name of readdirSync(resource).filter((file) => file.endsWith('.LNZ'))) {
        const breed = parseLnz(new TextDecoder('latin1').decode(read(name)), header.ballCount);
        expect(breed.ballColor256).toHaveLength(balls);
        expect(breed.lines.every(({ from, to }) => from < balls && to < balls)).toBe(true);
      }
    });
  }

  it('ships the first 98 of the cat’s 275 animations', () => {
    const header = parseBhd(new Uint8Array(readFileSync(join(PETZ, 'CAT', 'RESOURCE', 'CAT.BHD'))));
    const files = readdirSync(join(PETZ, 'CAT', 'RESOURCE')).filter((file) =>
      /^CAT\d+\.BDT$/.test(file)
    );

    expect(header.animations).toHaveLength(275);
    expect(files).toHaveLength(98);
  });
});
