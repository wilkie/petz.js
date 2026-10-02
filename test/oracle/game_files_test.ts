/**
 * The parsers against the game's own files, where the oracle is built
 * (`pnpm oracle`). Without it these are skipped: the files are never part of
 * the repository.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.js';
import { parseLnz } from '../../src/formats/lnz.js';

const DATA = join(process.cwd(), 'oracle', 'build', 'drive-c', 'DOGZ.DOG', 'DATA');
const describeWithOracle = existsSync(DATA) ? describe : describe.skip;

const read = (name: string) => new Uint8Array(readFileSync(join(DATA, name)));

describeWithOracle("the oracle's game files", () => {
  const header = parseBhd(read('ALL_PTZ.BHD'));

  it('have 65 balls and 3,852 frames in 36 animations', () => {
    expect(header.ballCount).toBe(65);
    expect(header.frameCount).toBe(3852);
    expect(header.animations).toHaveLength(36);
  });

  it('have every frame start where the one before ended, and nothing after the last', () => {
    for (let index = 0; index < header.animations.length; index++) {
      const data = read(`${index}.BDT`);
      const frames = parseAnimation(header, index, data);
      const { start } = header.animations[index];
      let at = 0;

      frames.forEach((frame, n) => {
        expect(header.frameOffsets[start + n]).toBe(at);
        at += frame.length;
      });

      expect(at).toBe(data.length);
    }
  });

  it('have every ball’s centre inside its frame’s bounds', () => {
    let outside = 0;

    for (let index = 0; index < header.animations.length; index++) {
      for (const frame of parseAnimation(header, index, read(`${index}.BDT`))) {
        const [minX, minY, minZ, maxX, maxY, maxZ] = frame.bounds;

        for (const { x, y, z } of frame.balls) {
          if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
            outside++;
          }
        }
      }
    }

    expect(outside).toBe(0);
  });

  it('bound each frame by its balls, each widened by half its size, rounded down', () => {
    let wrong = 0;

    for (let index = 0; index < header.animations.length; index++) {
      for (const frame of parseAnimation(header, index, read(`${index}.BDT`))) {
        const reach = (axis: 'x' | 'y' | 'z', sign: number) =>
          frame.balls.map((ball, n) => ball[axis] + sign * Math.trunc(header.ballSizes[n] / 2));
        const expected = [
          Math.min(...reach('x', -1)),
          Math.min(...reach('y', -1)),
          Math.min(...reach('z', -1)),
          Math.max(...reach('x', 1)),
          Math.max(...reach('y', 1)),
          Math.max(...reach('z', 1)),
        ];

        wrong += expected.some((value, n) => value !== frame.bounds[n]) ? 1 : 0;
      }
    }

    expect(wrong).toBe(0);
  });

  it('bound every frame by the header’s bounds, which are all the frames’ together', () => {
    const union = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];

    for (let index = 0; index < header.animations.length; index++) {
      for (const frame of parseAnimation(header, index, read(`${index}.BDT`))) {
        frame.bounds.forEach((value, n) => {
          union[n] = n < 3 ? Math.min(union[n], value) : Math.max(union[n], value);
        });
      }
    }

    expect(union).toEqual(header.bounds);
  });

  it.each(['BIGDOG', 'BULLDOG', 'CHIUA', 'SCOTTY', 'TERRIER'])(
    'read %s.LNZ, with a name for every ball',
    (name) => {
      const breed = parseLnz(new TextDecoder('latin1').decode(read(`${name}.LNZ`)));

      expect(breed.ballNames.filter((ball) => ball.startsWith('eBall_'))).toHaveLength(65);
      expect(breed.ballNames[52]).toBe('eBall_head');
    }
  );
});
