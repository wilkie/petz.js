/**
 * The engine's behaviour tables, the trick data and the dog left to itself,
 * against the game's own files where the oracle is built (`pnpm oracle`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GLOBAL, Pet, STATE } from '../../src/behaviour/pet.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { Stage } from '../../src/behaviour/stage.ts';
import { findTransition, transitionTable } from '../../src/behaviour/transitions.ts';
import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import {
  AREA,
  FIRST_TRICK,
  POSITION,
  readBodyAreas,
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
  const breedNames = parseLnz(new TextDecoder('latin1').decode(read('DATA/TERRIER.LNZ'))).ballNames;
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

  it('knows each ball’s part of the body: the head, the face, the legs, the tail', () => {
    const areas = readBodyAreas(engine);
    const named = (name: string) => areas[breedNames.indexOf(`eBall_${name}`)];

    expect(areas.every((area) => area >= 0)).toBe(true);
    expect([
      named('head'),
      named('nose'),
      named('tongue1'),
      named('chest'),
      named('belly'),
    ]).toEqual([AREA.head, AREA.face, AREA.tongue, AREA.body, AREA.body]);
    expect([named('Lfoot'), named('Rfoot'), named('tail3'), named('butt')]).toEqual([
      AREA.leftLeg,
      AREA.rightLeg,
      AREA.tail,
      AREA.hindquarters,
    ]);
  });

  it('likes being petted on the chest, the belly or the rump', () => {
    expect(engineScripts.petSpots.map(({ ball }) => breedNames[ball])).toEqual([
      'eBall_chest',
      'eBall_belly',
      'eBall_butt',
    ]);
    expect(engineScripts.pettedOnBack.map(at)).toEqual([
      'rollover to rollover',
      'rollover to rollover',
      'rollover to rollover',
    ]);
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

  describe('a terrier petted and given a treat', () => {
    const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
    const frames = header.animations.flatMap((_, n) =>
      parseAnimation(header, n, read(`DATA/${n}.BDT`))
    );
    const breed = parseLnz(
      new TextDecoder('latin1').decode(read('DATA/TERRIER.LNZ')),
      header.ballCount
    );

    const setUp = (seed: number) => {
      const stage = new Stage(320, 240, breed, header, frames, 5);
      stage.bodyAreas = readBodyAreas(engine);
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
      let tick = 0;
      const states: number[] = [];

      const run = (frameCount: number, act?: (n: number) => void) => {
        for (let n = 0; n < frameCount; n++, tick++) {
          act?.(n);
          const step = pet.tick((tick * 45) / 17);
          stage.show(step, step.rotation, step.placedBy);
          states.push(step.state);
        }
      };

      pet.start(0);
      return { stage, pet, run, states };
    };

    it('takes stroking the chest for petting, enjoys it more and more, and rolls over', () => {
      const { stage, pet, run, states } = setUp(3);
      run(300);
      run(400, (n) => {
        const chest = stage.ballOnStage(50);
        stage.pointer = { x: chest.x + ((n % 6) - 3) * 3, y: chest.y, button: true };
      });

      expect(pet.global === GLOBAL.petting || pet.global === GLOBAL.idle).toBe(true);
      expect(states).toContain(STATE.pettingGood);
      expect(pet.pettingLevel).toBeGreaterThan(3);
    });

    it('does not take a cursor merely resting on the dog, button down, for petting', () => {
      const { stage, pet, run } = setUp(3);
      run(300);
      const chest = stage.ballOnStage(50);
      run(100, () => {
        stage.pointer = { x: chest.x, y: chest.y, button: true };
      });

      expect(pet.petting).toBe(false);
    });

    it('begs for a treat held up, and eats it when it is put down', () => {
      const { stage, pet, run, states } = setUp(3);
      run(200);

      stage.treat = { colour: 2, held: true, x: 0, y: 0 };
      pet.treatPickedUp();
      expect(pet.global).toBe(GLOBAL.firstTreat + 2);

      run(600, () => {
        const at = stage.where();
        stage.treat!.x = at.x;
        stage.treat!.y = at.y - 40;
      });
      expect(states).toContain(STATE.begging);

      stage.treat!.held = false;
      pet.treatPutDown();
      run(600);

      expect(stage.treat).toBeNull();
      expect(states).toContain(STATE.eating);
    });

    it('rewards the trick last done, when the treat is given before the dog has begged', () => {
      const { stage, pet, run } = setUp(3);
      run(200);

      pet.lastTrick = FIRST_TRICK + 9;
      stage.treat = { colour: 0, held: false, x: stage.where().x, y: stage.where().y };
      pet.treatPutDown();
      run(400);

      expect(stage.treat).toBeNull();
      expect(pet.brainActive).toBe(false);
    });
  });
});
