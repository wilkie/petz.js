/**
 * The engine's behaviour tables, the trick data and the dog left to itself,
 * against the game's own files where the oracle is built (`pnpm oracle`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Brain } from '../../src/behaviour/brain.ts';
import { GLOBAL, Pet, STATE } from '../../src/behaviour/pet.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import {
  BALL_SIZE,
  BOWL_SIZE,
  FOOD,
  type Food,
  Stage,
  TREAT_SIZE,
} from '../../src/behaviour/stage.ts';
import { findTransition, transitionTable } from '../../src/behaviour/transitions.ts';
import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import {
  AREA,
  BALL_PICTURE,
  BOWL_PICTURE,
  FIRST_TRICK,
  POSITION,
  readBodyAreas,
  readBrainMap,
  readEngineScripts,
  readEngineStateNames,
  readPicture,
  readPositionKinds,
  readTrickScripts,
  TREAT_PICTURE,
} from '../../src/formats/engine.ts';
import { parseLnz, readFactors } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { parseScripts, readOpcodes, readStateNames } from '../../src/formats/script.ts';
import { parseTricks } from '../../src/formats/tricks.ts';
import { parseBrain, writeBrain } from '../../src/formats/brain.ts';

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
      /* The tricks with the ball are 0x61 to 0x65. */
      expect([...visited].some((state) => state >= 0x61 && state <= 0x65)).toBe(false);
    });

    it('steers to where it walks, and gets there', () => {
      expect(states.slice(0, 12 * 30)).toContain(STATE.postLocomote);
    });

    it('chases the wall, when it chooses to, and lunges at it', () => {
      const chased = states.indexOf(STATE.chasingWall);

      if (chased !== -1) {
        expect(states.slice(chased)).toContain(STATE.lungingWall);
      }
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

    const setUp = (seed: number, width = 320, height = 240) => {
      const stage = new Stage(width, height, breed, header, frames, 5);
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

    it('follows a cursor that leaves it while it waits to be petted, and waits again there', () => {
      const { stage, pet, run, states } = setUp(3);
      run(300);
      run(60, (n) => {
        const chest = stage.ballOnStage(50);
        stage.pointer = { x: chest.x + ((n % 6) - 3) * 3, y: chest.y, button: true };
      });

      const away = { x: stage.centre().x < 160 ? 280 : 40, y: 120, button: false };
      pet.newState(STATE.waitPetting);
      run(600, () => {
        stage.pointer = away;
      });

      const chased = states.lastIndexOf(STATE.chasingPetting);
      expect(chased).toBeGreaterThan(-1);
      expect(states.slice(chased)).toContain(STATE.waitPetting);
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

    /** A food out of the box, and the dog told of it. */
    const takeOut = (
      stage: Stage,
      pet: Pet,
      kind: number,
      at: { x: number; y: number },
      held: boolean
    ) => {
      const food: Food = { kind, held: true, ...at, servings: 0, full: 0, touched: 0 };
      stage.foods.push(food);
      pet.foodTakenOut(food);

      if (!held) {
        food.held = false;
        pet.foodPutDown(food);
      }

      return food;
    };

    it('begs for a treat held up, and eats it when it is put down', () => {
      const { stage, pet, run, states } = setUp(3);
      run(200);

      const treat = takeOut(stage, pet, FOOD.redTreat, { x: 0, y: 0 }, true);
      expect(pet.global).toBe(GLOBAL.begEat + FOOD.redTreat);

      run(600, () => {
        const at = stage.where();
        treat.x = at.x;
        treat.y = at.y - 40;
      });
      expect(states).toContain(STATE.begging);

      treat.held = false;
      pet.foodPutDown(treat);
      let eaten = false;
      run(600, () => {
        eaten ||= !!treat.beingEaten;
      });

      expect(stage.foods).toEqual([]);
      expect(states).toContain(STATE.eating);

      /* Drawn with the dog, under its head, as it bites. */
      expect(eaten).toBe(true);
    });

    it('snatches a treat into its mouth, and eats it', () => {
      const { stage, pet, run } = setUp(3);
      run(200);

      const treat: Food = {
        kind: FOOD.greenTreat,
        held: false,
        ...stage.where(),
        servings: 0,
        full: 0,
        touched: 0,
      };
      stage.foods.push(treat);
      pet.newGlobalState(GLOBAL.begEat + FOOD.greenTreat, STATE.grabbingTreat);
      let inMouth = false;
      run(300, () => {
        inMouth ||= !!treat.inMouth;
      });

      expect(inMouth).toBe(true);
      expect(stage.foods).toEqual([]);
    });

    it('rewards the trick last done, when the treat is given before the dog has begged', () => {
      const { stage, pet, run } = setUp(3);
      run(200);

      pet.lastTrick = FIRST_TRICK + 9;
      takeOut(stage, pet, FOOD.blueTreat, stage.where(), false);
      run(400);

      expect(stage.foods).toEqual([]);
      expect(pet.brainActive).toBe(false);
    });

    it('eats from a bowl put down, a serving a mouthful, its nose in the bowl', () => {
      const { stage, pet, run, states } = setUp(3, 640, 480);
      run(200);

      const bowl = takeOut(stage, pet, FOOD.food, { x: 320, y: 300 }, false);
      expect(bowl.full).toBeGreaterThanOrEqual(25);
      expect(bowl.full).toBeLessThanOrEqual(35);

      let eaten = false;
      let nose = Infinity;
      run(1500, () => {
        eaten ||= !!bowl.beingEaten;

        if (bowl.beingEaten) {
          const at = stage.ballOnStage(55);
          nose = Math.min(nose, Math.hypot(at.x - bowl.x, at.y - bowl.y));
        }
      });

      expect(eaten).toBe(true);
      expect(nose).toBeLessThan(40);
      expect(bowl.servings).toBe(0);

      /* A mouthful a serving, less one worn off every 420 ticks. */
      expect(pet.fullness).toBeGreaterThan(10);
      expect(states).toContain(STATE.eating);
    });

    it('laps from a bowl of water three to six times', () => {
      const { stage, pet, run } = setUp(3, 640, 480);
      run(200);

      const bowl = takeOut(stage, pet, FOOD.water, { x: 320, y: 300 }, false);
      run(1000);

      expect(bowl.full - bowl.servings).toBeGreaterThanOrEqual(3);
      expect(bowl.full - bowl.servings).toBeLessThanOrEqual(6);
    });

    it('is sick of food past half again a bowl, and will not eat more', () => {
      const { stage, pet, run } = setUp(3, 640, 480);
      run(200);

      const bowl = takeOut(stage, pet, FOOD.food, { x: 320, y: 300 }, false);
      const sick = Math.trunc(bowl.full * 1.5);
      pet.fullness = sick + 3;
      let fullest = 0;
      run(700, () => {
        fullest = Math.max(fullest, pet.fullness);
      });

      /* A mouthful past it, five more, and calmed (script 287). */
      expect(fullest).toBeGreaterThan(sick + 5);
      expect(pet.factor(0)).toBeLessThan(10);

      /* Fuller than that by 7, a bowl put down is left alone. */
      pet.fullness = Math.ceil(bowl.full * 1.5 + 8);
      bowl.held = true;
      pet.foodPickedUp(bowl);
      bowl.held = false;
      pet.foodPutDown(bowl);
      expect(pet.global).toBe(GLOBAL.idle);
    });

    it('has the bowls the size of their pictures: full, half, empty and the rim', () => {
      for (const n of [0, 1, 2, 3, 10, 11, 12, 13]) {
        const picture = readPicture(engine, BOWL_PICTURE + n);
        expect({ width: picture.width, height: picture.height }).toEqual(BOWL_SIZE);
      }
    });

    it('has the treats the size of their pictures', () => {
      for (const colour of [0, 1, 2]) {
        const picture = readPicture(engine, TREAT_PICTURE + colour);
        expect({ width: picture.width, height: picture.height }).toEqual(TREAT_SIZE);
        expect(picture.pixels[0]).toBe(10);
      }
    });

    it('has the ball the size of its picture, in the Windows colours, green where it is not', () => {
      const picture = readPicture(engine, BALL_PICTURE);

      expect({ width: picture.width, height: picture.height }).toEqual(BALL_SIZE);
      expect(picture.colours[10]).toEqual([0, 255, 0]);
      expect(picture.pixels[0]).toBe(10);
      expect(picture.pixels[picture.pixels.length - 1]).toBe(10);
    });

    /* On Dogz's own 640 by 480 screen: a dog runs too far for a smaller one. */
    it('fetches a ball thrown, brings it back and drops it', () => {
      const { stage, pet, run, states } = setUp(3, 640, 480);
      run(200);

      stage.ball = { x: 320, y: 120, vx: 0, vy: 0, held: true, slot: null, recorded: null };
      stage.pointer = { x: 320, y: 120, button: true };
      pet.ballPickedUp();
      expect(pet.global).toBe(GLOBAL.fetch);
      run(180);

      /* Thrown to the right, fast, and let go. */
      run(3, (n) => {
        stage.pointer = { x: 340 + 20 * n, y: 140, button: true };
      });
      stage.ball.held = false;
      stage.pointer.button = false;
      pet.ballThrown();

      const thrown = states.length;
      let inMouth = false;
      run(700, () => {
        inMouth ||= stage.ball?.slot === 0;
      });
      /* Run after, or leapt and caught. */
      const chased: number[] = [STATE.chasingBall, STATE.jumpingGrabbingBall];
      expect(states.slice(thrown).some((state) => chased.includes(state))).toBe(true);
      expect(inMouth).toBe(true);
      expect(states.slice(thrown)).toContain(STATE.returningBallDirect);
      expect(states.slice(thrown)).toContain(STATE.releasingBall);
      expect(stage.ball).toMatchObject({ held: false });
    });

    it('waits for the ball held up, and does its tricks', () => {
      const { stage, pet, run, states } = setUp(3, 640, 480);
      run(200);

      stage.ball = { x: 320, y: 120, vx: 0, vy: 0, held: true, slot: null, recorded: null };
      stage.pointer = { x: 320, y: 120, button: true };
      pet.ballPickedUp();
      run(600);

      expect(states.slice(200).some((state) => state === STATE.begging)).toBe(true);
      expect(states.slice(200).some((state) => state >= FIRST_TRICK)).toBe(true);
    });
  });

  describe('the brain', () => {
    const data = read('DATA/BRAIN.PBT');
    const file = parseBrain(data);
    const map = readBrainMap(engine);

    it('reads BRAIN.PBT and writes it back byte for byte', () => {
      expect(writeBrain(file)).toEqual(data);
      expect(file.inputVerbs).toEqual([
        '[w]Throw!',
        '[-]Putaway',
        '[a]Wave',
        '[+]BringOut*',
        'Use',
      ]);
      expect(file.desires.slice(0, 3)).toEqual(['TrickBlue', 'TrickGreen', 'TrickRed']);
      expect(file.synapses).toHaveLength(42);
    });

    it('maps every trick the brain can choose, with the null object, to the engine’s state of its name', () => {
      expect(map).toHaveLength(35);

      for (const { verb, object, state } of map) {
        expect(object).toBe('Null');
        expect(names[state]).toBe(verb);
      }
    });

    it('gives each colour of treat its own tricks', () => {
      const tricksOf = (desire: number) =>
        file.synapses.filter(([d]) => d === desire).map(([, verb]) => file.outputVerbs[verb]);

      expect(tricksOf(0)).toContain('eTrickRollAndWiggle');
      expect(tricksOf(2)).not.toContain('eTrickRollAndWiggle');
      expect(tricksOf(2)).toContain('eTrickHowl');
    });

    it('learns: a red treat brought out and given after each trick raises the tricks rewarded', () => {
      const brain = new Brain(parseBrain(data), map, borlandRand(3));
      const before = brain.weight[2].map((verbs) => verbs[0]);

      for (let session = 0; session < 10; session++) {
        brain.zeroOutDesires();
        brain.tell('[+]BringOut*', '[u]RedTreat');

        for (let frame = 0; frame < 30; frame++) {
          brain.pulse();
        }

        brain.tell('[w]Throw!', '[u]RedTreat');
      }

      const after = brain.weight[2].map((verbs) => verbs[0]);
      const gained = after.map((weight, verb) => weight - before[verb]);

      expect(Math.max(...gained)).toBeGreaterThan(20);
      expect(brain.desire[2]).toBe(480);
    });
  });
});
