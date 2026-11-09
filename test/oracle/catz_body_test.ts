import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { averageBreed, parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import { CatzBody } from '../../src/behaviour/catz-body.ts';
import { makeCatzFudgers, resetCatzEyelids } from '../../src/behaviour/catz-fudger.ts';
import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import { CatzMouseLive, readMouseFactors } from '../../src/behaviour/catz-mouse-live.ts';
import { CatzPlacer } from '../../src/behaviour/catz-stage.ts';
import { catzFrameAngle } from '../../src/behaviour/catz-timeline.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { extendFrames } from '../../src/render/extend.ts';
import { skeletonOf } from '../../src/render/skeleton.ts';
import { describeWithOracle } from './with-oracle.ts';

const PETZ = 'oracle/build/catz-drive-c/CATZ.DOG/PTZFILES';
const ENGINE = 'oracle/build/catz-drive-c/WINDOWS/SYSTEM/CATZDLL.DLL';
const RESOURCE = join(PETZ, 'CAT', 'RESOURCE');
const describe = describeWithOracle(PETZ);

/** The brains and centres of the playpen's cat as the 2,000 frames' day began (CATZTRACE.OUT). */
const BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];
const STAGE = { left: 0, top: 0, right: 640, bottom: 480 };

/** The food bowl (0xc), the water bowl (0xd) and the Cat Dancer (5) in the pen, and nothing. */
const PEN = new Map([
  [0xc, { x: 520, y: 400 }],
  [0xd, { x: 120, y: 410 }],
  [5, { x: 330, y: 300 }],
  [6, { x: 220, y: 330 }],
  [8, { x: 420, y: 330 }],
]);
const NONE = new Map<number, { x: number; y: number }>();

/** The cat's scripts, frames and breed (the clown's), from the demo's files. */
function load() {
  const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
  const text = (name: string) => new TextDecoder('latin1').decode(read(name));
  const header = parseBhd(read('CAT.BHD'));
  const frames = header.animations.flatMap((_, n) =>
    existsSync(join(RESOURCE, `CAT${n}.BDT`)) ? parseAnimation(header, n, read(`CAT${n}.BDT`)) : []
  );
  const adult = parseLnz(text('ACLOWN.LNZ'), header.ballCount);
  const kitten = parseLnz(text(adult.catz!.littleOne!.toUpperCase()), header.ballCount);
  const breed = averageBreed(adult, kitten, 0);
  const shaped = extendFrames(frames, breed);
  const { neck, butt } = skeletonOf(breed);
  const engine = parseNe(new Uint8Array(readFileSync(ENGINE)));
  const data = read('CAT.SCP');
  const scripts = parseScripts(data, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz);
  const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
  const positions = { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) };
  return { scripts, positions, frames, shaped, breed, header, neck, butt };
}

describe('a Catz cat on its own, placed and steered by its own frames', () => {
  /* Some days of its, each 6,000 ticks -- ten minutes -- by C's `rand` from a seed. */
  it.each([1, 2, 3, 6])('walks where it means to and gets there, on day %i', (seed) => {
    const { scripts, positions, frames, shaped, breed, header, neck, butt } = load();
    const rand = borlandRand(seed);
    const random = (n: number) => rand() % n;
    const fudgers = makeCatzFudgers();
    resetCatzEyelids(fudgers);
    [fudgers[6].value, fudgers[7].value] = [20, 20];

    /* The pet, made after its body: where what its head tracks is, once there is one. */
    const made: { pet?: CatzPet } = {};
    const struck: unknown[] = [];
    const body = new CatzBody({
      scripts,
      positions,
      flags: (frame) => frames[frame]?.tag ?? 3,
      shaped,
      placer: new CatzPlacer(breed, header, shaped, { age: 100 }),
      angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
      stage: STAGE,
      fudgers,
      random,
      trackAt: (kind) => made.pet?.kinAt(kind),
    });
    const pet = new CatzPet({
      brains: BRAINS,
      centres: CENTRES,
      stage: STAGE,
      /* The user moving the cursor somewhere else every 300 ticks. */
      cursor: (tick) => ({
        x: 60 + ((Math.trunc(tick / 300) * 137) % 520),
        y: 100 + ((Math.trunc(tick / 300) * 89) % 340),
      }),
      /* And about the pen every other minute. */
      doubleClicked: (tick) => Math.trunc(tick / 600) % 2 === 1,
      /* And, on two days, the food bowl, the water bowl and the Cat Dancer off the shelf in the pen. */
      pen: () => (seed % 2 ? PEN : NONE),
      random,
      moves: false,
      play: (action, steer) => body.play(action, steer),
      dropped: () => body.drop(),
      entered: (state) => body.entered(state),
      layer: (action) => {
        layered.asked.push(action);
        body.layer(action);
        layered.played += body.layering ? 1 : 0;
      },
      layering: () => body.layering,
      head: (look) => body.look(look),
      strike: (strike) => {
        struck.push(strike);
      },
      found: () => !!body.shown?.there,
      cues: () => body.shown?.step.cues ?? [],
    });
    made.pet = pet;

    const layered = { asked: [] as number[], played: 0 };
    const states: Record<number, number> = {};
    /* Each walk: how long, how far it went, how far from what it walked to at its end. */
    const walks: {
      ticks: number;
      moved: number;
      left: number;
      found: number;
      there?: boolean;
      to: number;
    }[] = [];
    let walk: (typeof walks)[number] | undefined;

    for (let n = 0; n < 6000; n++) {
      const shown = body.next();

      if (shown) {
        const { rect } = shown;
        const was = pet.point;
        pet.rect = rect;
        pet.point = {
          x: Math.trunc((rect.left + rect.right) / 2),
          y: Math.trunc((rect.top + rect.bottom) / 2),
        };
        pet.fields.x688 = body.facing;

        if (walk) {
          walk.moved += Math.hypot(pet.point.x - was.x, pet.point.y - was.y);
          walk.found += shown.there ? 1 : 0;
        }
      }

      const { state } = pet.tick();
      states[state] = (states[state] ?? 0) + 1;

      if (state === 23) {
        walk ??= { ticks: 0, moved: 0, left: 0, found: 0, to: pet.fields.x35a6 ?? 0 };
        walk.ticks++;
      } else if (walk) {
        const at = pet.target();
        walk.left = at ? Math.round(Math.hypot(at.x - pet.point.x, at.y - pet.point.y)) : -1;
        walk.moved = Math.round(walk.moved);
        /* Ended found in its box, or otherwise. */
        walk.there = !!body.shown?.there;
        walks.push(walk);
        walk = undefined;
      }
    }

    const walking = walks.reduce((sum, { ticks }) => sum + ticks, 0);
    console.log(
      `states ${JSON.stringify(states)}\nwalks ${walks.length}, ${walking} ticks walking of 6000; longest ${Math.max(...walks.map(({ ticks }) => ticks))}\n${walks
        .slice(0, 40)
        .map(
          ({ ticks, moved, left, found, there }) =>
            `${ticks} ticks, ${moved} px, ${left} from it, found ${found} ticks${there ? ', there' : ''}`
        )
        .join(
          '\n'
        )}\nstood in ${JSON.stringify(pet.stoodIn)}\nlayered ${layered.asked.length} asked (${[...new Set(layered.asked)].map((a) => a.toString(16))}), ${layered.played} played\nstruck ${struck.length} ${JSON.stringify(struck.slice(0, 3))}`
    );
    /* Each leap's ball where it leapt to, but where the stage stopped it. */
    const missed = body.leaps.filter(
      ({ x, y, at }) =>
        (Math.abs(at.x - x) > 1 || Math.abs(at.y - y) > 1) &&
        at.x > STAGE.left &&
        at.x < STAGE.right &&
        at.y > STAGE.top &&
        at.y < STAGE.bottom
    );
    console.log(`leaps ${body.leaps.length}: ${JSON.stringify(body.leaps.slice(0, 6))}`);
    expect(missed).toEqual([]);
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    /* It walks, and its walks end where it found what it walked to -- but
     * after the cursor in its moment, which may end one time in five where
     * it is near and faces it, found or not. */
    const sought = walks.filter(({ to }) => to !== 0x17);
    expect(walks.length).toBeGreaterThan(0);
    expect(sought.filter(({ there }) => there).length).toBeGreaterThan(sought.length / 2);
  });

  /* Its leaps the demo has the frames of -- pounces (0x20f, 0x35) and a dive (0x238) -- each set up toward points about it. */
  it.each([0x20f, 0x35, 0x238])('lands a leap (action %i) where it leapt to', (action) => {
    const { scripts, positions, frames, shaped, breed, header, neck, butt } = load();
    const rand = borlandRand(action);
    const random = (n: number) => rand() % n;
    const fudgers = makeCatzFudgers();
    resetCatzEyelids(fudgers);
    const landed: { x: number; y: number; at: { x: number; y: number } }[] = [];

    for (const [x, y] of [
      [200, 250],
      [450, 320],
      [320, 200],
      [100, 400],
    ]) {
      const body = new CatzBody({
        scripts,
        positions,
        flags: (frame) => frames[frame]?.tag ?? 3,
        shaped,
        placer: new CatzPlacer(breed, header, shaped, { age: 100 }),
        angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
        stage: STAGE,
        fudgers,
        random,
      });
      /* Standing first, to be placed from; then the leap, ball 0x42 to the point. */
      body.play(0x15);
      body.play(action, { leap: { ball: 0x42, x, y } });
      landed.push(...body.leaps);
    }

    console.log(`action ${action}: ${JSON.stringify(landed)}`);
    expect(landed).toHaveLength(4);
    /* The engine's single floats, rounded toward 0, land it within a pixel. */
    expect(
      landed.filter(({ x, y, at }) => Math.abs(at.x - x) > 1 || Math.abs(at.y - y) > 1)
    ).toEqual([]);
  });

  /* The cat and the pen's mouse together, the mouse unafraid and restless to begin with (as `?mouse=bold`), the cat a kitten. */
  it.each([1, 2, 3, 4])('lives with the mouse, on day %i', (seed) => {
    const { scripts, positions, frames, shaped, breed, header, neck, butt } = load();
    const MOUSE = join(PETZ, 'MOUSE', 'RESOURCE');
    const readMouse = (name: string) => new Uint8Array(readFileSync(join(MOUSE, name)));
    const lnzText = new TextDecoder('latin1').decode(readMouse('MOUSE.LNZ'));
    const mouseHeader = parseBhd(readMouse('MOUSE.BHD'));
    const mouseFrames = mouseHeader.animations.flatMap((_, n) =>
      parseAnimation(mouseHeader, n, readMouse(`MOUSE${n}.BDT`))
    );
    const lnz = parseLnz(lnzText, mouseHeader.ballCount);
    const mouseShaped = extendFrames(mouseFrames, lnz);
    const engine = parseNe(new Uint8Array(readFileSync(ENGINE)));
    const mouseData = readMouse('MOUSE.SCP');
    const mousePre = new DataView(
      mouseData.buffer,
      mouseData.byteOffset + mouseData.indexOf(0) + 1
    );
    const rand = borlandRand(seed);
    const random = (n: number) => rand() % n;
    const fudgers = makeCatzFudgers();
    resetCatzEyelids(fudgers);
    const placer = new CatzPlacer(breed, header, shaped, { age: 20 });
    const made: { pet?: CatzPet; mouse?: CatzMouseLive } = {};
    const body = new CatzBody({
      scripts,
      positions,
      flags: (frame) => frames[frame]?.tag ?? 3,
      shaped,
      placer,
      angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
      stage: STAGE,
      fudgers,
      random,
      trackAt: (kind) => made.pet?.kinAt(kind),
    });
    const brains = [...BRAINS];
    brains[11] = 20;
    const pet = new CatzPet({
      brains,
      centres: CENTRES,
      stage: STAGE,
      cursor: () => ({ x: 630, y: 20 }),
      random,
      moves: false,
      play: (action, steer) => body.play(action, steer),
      dropped: () => body.drop(),
      entered: (state) => body.entered(state),
      layer: (action) => body.layer(action),
      layering: () => body.layering,
      head: (look) => body.look(look),
      found: () => !!body.shown?.there,
      cues: () => body.shown?.step.cues ?? [],
      mouse: () =>
        made.mouse
          ? {
              /* Hidden, in its hole (1), whatever its machine has yet. */
              state: made.mouse.hidden ? 1 : made.mouse.mouse.fields.state,
              at: made.mouse.at,
            }
          : undefined,
      inReach: () => {
        const prey = made.mouse?.rect;
        const shown = body.shown;

        if (!prey || !shown) {
          return false;
        }

        const [a, b] = [0x16, 0x17].map((ball) => placer.ballOnStage(shown.rect, shown.pose, ball));
        return (
          Math.max(Math.min(a.x, b.x) - 70, prey.left) <
            Math.min(Math.max(a.x, b.x) + 70, prey.right) &&
          Math.max(Math.min(a.y, b.y) - 40, prey.top) <
            Math.min(Math.max(a.y, b.y) + 40, prey.bottom)
        );
      },
      mouseHeld: (how) => made.mouse?.catHolds(how),
    });
    made.pet = pet;
    const mouse = new CatzMouseLive({
      scripts: parseScripts(mouseData, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz),
      positions: { count: mousePre.getUint16(0, true), neutral: mousePre.getUint16(2, true) },
      flags: (frame) => mouseFrames[frame]?.tag ?? 3,
      shaped: mouseShaped,
      placer: new CatzPlacer(lnz, mouseHeader, mouseShaped, { scales: { pet: 200, ball: 200 } }),
      stage: STAGE,
      hole: { x: 206, y: 403 },
      factors: readMouseFactors(lnzText),
      random,
      clearCatSaw: () => {
        pet.x33bc = 0;
      },
    });
    made.mouse = mouse;
    mouse.mouse.fields.brains[0] = 100;
    mouse.mouse.fields.brains[1] = 20;

    const pounces = { ticks: 0, cued: 0, reach: 0 };
    const catStates: Record<number, number> = {};
    let carried = 0;
    const globals: Record<number, number> = {};
    const mice: Record<string, number> = {};
    let after = 0;
    let clock = 0;

    for (let n = 0; n < 6000; n++) {
      clock += 100 / 17;
      const shown = body.next();

      if (shown) {
        const { rect } = shown;
        pet.rect = rect;
        pet.point = {
          x: Math.trunc((rect.left + rect.right) / 2),
          y: Math.trunc((rect.top + rect.bottom) / 2),
        };
        pet.fields.x688 = body.facing;
      }

      const { global, state: catState } = pet.tick();
      globals[global] = (globals[global] ?? 0) + 1;
      catStates[catState] = (catStates[catState] ?? 0) + 1;
      after += pet.fields.x35a4 === 0x1b ? 1 : 0;
      carried += made.mouse?.inMouth ? 1 : 0;

      /* Pouncing or diving at the mouse: its ticks, those cued to catch (2), and those in reach too. */
      if ((catState === 3 || catState === 4) && pet.fields.x35a4 === 0x1b) {
        const cued = (body.shown?.step.cues ?? []).includes(2);
        pounces.ticks++;
        pounces.cued += cued ? 1 : 0;
        pounces.reach += cued && pet.inReachNow() ? 1 : 0;
      }
      mouse.tick({
        cat: pet.point,
        catGlobal: global,
        catAge: pet.mind.brains[11],
        x33b8: pet.x33b8,
        cursor: { x: 630, y: 20 },
        things: new Map(),
        shelfAt: (kind) => ({ x: 30 * kind, y: 30 }),
        clock: Math.trunc(clock),
      });
      const { global: g, state } = mouse.mouse.fields;
      mice[`${g}/${state}`] = (mice[`${g}/${state}`] ?? 0) + 1;
    }

    console.log(
      `day ${seed}: cat ${JSON.stringify(globals)}, after the mouse ${after} ticks, pounced ${JSON.stringify(pounces)}, carried it ${carried} ticks, its states ${JSON.stringify(catStates)}; mouse ${JSON.stringify(mice)}; stood in ${JSON.stringify(pet.stoodIn)}`
    );
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    /* The mouse leaves waiting in its hole: out exploring, or at least at its mouth, where a cat sitting by the hole may catch it as it peeks (day 1). */
    expect(Object.keys(mice).some((key) => key !== '1/1')).toBe(true);
  });

  /* Petted: the hand on its middle for a minute, stroking, after half a minute on its own. */
  it.each([1, 2])('is petted with the hand on it, on day %i', (seed) => {
    const { scripts, positions, frames, shaped, breed, header, neck, butt } = load();
    const rand = borlandRand(seed);
    const random = (n: number) => rand() % n;
    const fudgers = makeCatzFudgers();
    resetCatzEyelids(fudgers);
    const placer = new CatzPlacer(breed, header, shaped, { age: 100 });
    const body = new CatzBody({
      scripts,
      positions,
      flags: (frame) => frames[frame]?.tag ?? 3,
      shaped,
      placer,
      angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
      stage: STAGE,
      fudgers,
      random,
    });
    let tick = 0;
    /* The cursor stroking about the middle of the cat. */
    const cursor = () => {
      const rect = body.shown?.rect ?? STAGE;
      return {
        x: Math.trunc((rect.left + rect.right) / 2) + ((tick % 6) * 6 - 15),
        y: Math.trunc((rect.top + rect.bottom) / 2) + (tick % 4) * 3,
      };
    };
    const hand = () => tick >= 300 && tick < 900;
    const pet = new CatzPet({
      brains: BRAINS,
      centres: CENTRES,
      stage: STAGE,
      cursor,
      random,
      moves: false,
      play: (action, steer) => body.play(action, steer),
      dropped: () => body.drop(),
      entered: (state) => body.entered(state),
      layer: (action) => body.layer(action),
      layering: () => body.layering,
      head: (look) => body.look(look),
      found: () => !!body.shown?.there,
      cues: () => body.shown?.step.cues ?? [],
      hand,
      ballUnder: () =>
        body.shown ? placer.ballAt(body.shown.rect, body.shown.pose, cursor()) : -1,
      cursorOver: () => true,
      scriptLeft: () => body.queue.length,
    });
    const states: Record<string, number> = {};

    for (; tick < 1200; tick++) {
      const shown = body.next();

      if (shown) {
        const { rect } = shown;
        pet.rect = rect;
        pet.point = {
          x: Math.trunc((rect.left + rect.right) / 2),
          y: Math.trunc((rect.top + rect.bottom) / 2),
        };
        pet.fields.x688 = body.facing;
      }

      const { state, global } = pet.tick();
      states[`${global}/${state}`] = (states[`${global}/${state}`] ?? 0) + 1;
    }

    console.log(
      `petted, day ${seed}: ${JSON.stringify(states)}; modes ${pet.petting.modes.slice(0, 8)}; stood in ${JSON.stringify(pet.stoodIn)}`
    );
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    expect(states['7/50']).toBeGreaterThan(0);
  });
});
