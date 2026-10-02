/**
 * The engine's behaviour tables, the trick data and the dog left to itself,
 * against the game's own files where the oracle is built (`pnpm oracle`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pet, STATE } from '../../src/behaviour/pet.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { Stage } from '../../src/behaviour/stage.ts';
import { findTransition, transitionTable } from '../../src/behaviour/transitions.ts';
import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import {
  FIRST_TRICK,
  POSITION,
  readEngineScripts,
  readEngineStateNames,
  readPositionKinds,
  readTrickScripts,
} from '../../src/formats/engine.ts';
import { parseLnz, readFactors } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { parseScripts, readOpcodes, readStateNames } from '../../src/formats/script.ts';
import { parseTricks } from '../../src/formats/tricks.ts';

const ROOT = join(process.cwd(), 'oracle', 'build', 'drive-c');
const DOGZ = join(ROOT, 'DOGZ.DOG');
const describeWithOracle = existsSync(DOGZ) ? describe : describe.skip;

const read = (path: string) => new Uint8Array(readFileSync(join(DOGZ, path)));

describeWithOracle('the engine’s behaviour', () => {
  const engine = parseNe(new Uint8Array(readFileSync(join(ROOT, 'WINDOWS', 'DOGZDLL.DLL'))));
  const names = readEngineStateNames(engine);
  const positions = readStateNames(engine);
  const kinds = readPositionKinds(engine, positions.length);
  const scripts = parseScripts(read('DATA/ALL_PTZ.SCP'), readOpcodes(engine));
  const tricks = parseTricks(read('TRICKS.TDT'));
  const trickScripts = readTrickScripts(engine);
  const engineScripts = readEngineScripts(engine);
  const table = transitionTable(scripts);
  const at = (script: number) =>
    `${positions[scripts[script].from]} to ${positions[scripts[script].to]}`;

  it('names 109 states, from eNOTASTATE to eIconBeg, the tricks from 0x2b', () => {
    expect(names).toHaveLength(109);
    expect(names[0]).toBe('eNOTASTATE');
    expect(names[STATE.idle]).toBe('eIdle');
    expect(names[STATE.sleeping]).toBe('eSleeping');
    expect(names[FIRST_TRICK]).toBe('eTrickBegging');
    expect(names[108]).toBe('eIconBeg');
  });

  it('knows which positions are sitting, standing, lying and on the move', () => {
    expect(kinds[positions.indexOf('sitting')]).toBe(POSITION.sitting);
    expect(kinds[positions.indexOf('standing')]).toBe(POSITION.standing);
    expect(kinds[positions.indexOf('sleeping')]).toBe(POSITION.lying);
    expect(kinds[positions.indexOf('walking')]).toBe(POSITION.standing | POSITION.moving);
  });

  it('walks, trots and runs, and sleeps, with scripts that stay where they are', () => {
    const [walk, trot, run] = engineScripts.locomotion;
    expect([at(walk), at(trot), at(run)]).toEqual([
      'walking to walking',
      'trotting to trotting',
      'running to running',
    ]);
    expect(
      engineScripts.sleep.map(({ script }) => kinds[scripts[script].from] & POSITION.lying)
    ).toEqual([2, 2, 2, 2, 2]);
  });

  it('begs by sitting up, and has a script for every trick it does not play its own way', () => {
    expect(at(trickScripts[0].script)).toBe('sitting_up to sitting_up');

    trickScripts.forEach(({ script }, n) => {
      if (script >= 0) {
        expect(scripts[script]).toBeDefined();
      } else {
        expect(names[FIRST_TRICK + n]).toBeTruthy();
      }
    });
  });

  it('has trick data whose current table is still its defaults, for a dog never trained', () => {
    expect(tricks.current).toEqual(tricks.defaults);
    expect(tricks.current.filter((trick) => trick.withBall).length).toBe(5);
  });

  it('can take the dog from standing to every position a trick or sleep starts from', () => {
    const standing = positions.indexOf('standing');
    const starts = [
      ...trickScripts.filter(({ script }) => script >= 0).map(({ script }) => scripts[script].from),
      ...engineScripts.sleep.map(({ script }) => scripts[script].from),
    ];

    for (const start of new Set(starts)) {
      if (start !== standing) {
        expect(findTransition(table, scripts, standing, start).length).toBeGreaterThan(0);
      }
    }
  });

  describe('a terrier left to itself', () => {
    const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
    const frames = header.animations.flatMap((_, n) =>
      parseAnimation(header, n, read(`DATA/${n}.BDT`))
    );
    const breed = parseLnz(
      new TextDecoder('latin1').decode(read('DATA/TERRIER.LNZ')),
      header.ballCount
    );

    const run = (seed: number, seconds: number) => {
      const stage = new Stage(640, 480, breed, header, frames, 5);
      const pet = new Pet(
        {
          scripts,
          table,
          positionKinds: kinds,
          tricks: structuredClone(tricks.current),
          trickDefaults: tricks.defaults,
          trickScripts,
          engineScripts,
          flags: (frame) => frames[frame]?.tag ?? 3,
        },
        stage,
        borlandRand(seed),
        readFactors(breed.sections),
        5
      );
      const states: number[] = [];
      const shown: number[] = [];

      pet.start(0);

      for (let tick = 0; tick < seconds * 12; tick++) {
        const step = pet.tick((tick * 1000) / 12 / 17);
        stage.show(step, step.rotation, step.placedBy);
        states.push(step.state);
        shown.push(step.frame);
      }

      return { states, shown, pet };
    };

    const { states, shown, pet } = run(1, 600);

    it('wanders, idles and does tricks, and never one with the ball when idle', () => {
      const visited = new Set(states);
      expect(visited.has(STATE.locomote)).toBe(true);
      expect(visited.has(STATE.idle)).toBe(true);
      expect(
        [...visited].some((state) => state >= FIRST_TRICK && state <= STATE.lastIdleTrick)
      ).toBe(true);
      expect([...visited].some((state) => state > STATE.lastIdleTrick)).toBe(false);
    });

    it('shows only frames that exist, and keeps its factors from 1 to 100', () => {
      expect(shown.every((frame) => frame >= 0 && frame < frames.length)).toBe(true);
      expect(pet.factors.slice(2).every((factor) => factor >= 1 && factor <= 100)).toBe(true);
    });

    it('chooses the same, given the same seed', () => {
      expect(run(1, 60).states).toEqual(states.slice(0, 720));
    });

    it('picks idle tricks that suit its excitement', () => {
      const excitement = pet.factor(0);

      for (let n = 0; n < 50; n++) {
        const trick = tricks.current[pet.pickIdleTrick()];
        expect(Math.abs(excitement - trick.excitement)).toBeLessThanOrEqual(trick.excitementRange);
        expect(trick.withBall).toBe(0);
      }
    });
  });
});
