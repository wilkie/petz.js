import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { averageBreed, parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import { CatzBody } from '../../src/behaviour/catz-body.ts';
import { makeCatzFudgers, resetCatzEyelids } from '../../src/behaviour/catz-fudger.ts';
import { CatzPet } from '../../src/behaviour/catz-pet.ts';
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

describe('a Catz cat on its own, placed and steered by its own frames', () => {
  /* Some days of its, each 6,000 ticks -- ten minutes -- by C's `rand` from a seed. */
  it.each([1, 2, 3, 6])('walks where it means to and gets there, on day %i', (seed) => {
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const text = (name: string) => new TextDecoder('latin1').decode(read(name));
    const header = parseBhd(read('CAT.BHD'));
    const frames = header.animations.flatMap((_, n) =>
      existsSync(join(RESOURCE, `CAT${n}.BDT`))
        ? parseAnimation(header, n, read(`CAT${n}.BDT`))
        : []
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
      cursorAbout: (tick) => Math.trunc(tick / 600) % 2 === 1,
      /* And, on two days, the food bowl, the water bowl and the Cat Dancer off the shelf in the pen. */
      pen: () => (seed % 2 ? PEN : NONE),
      random,
      moves: false,
      play: (action, steer) => body.play(action, steer),
      dropped: () => body.drop(),
      head: (look) => body.look(look),
      strike: (strike) => {
        struck.push(strike);
      },
      found: () => !!body.shown?.there,
      cues: () => body.shown?.step.cues ?? [],
    });
    made.pet = pet;

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
        )}\nstood in ${JSON.stringify(pet.stoodIn)}\nstruck ${struck.length} ${JSON.stringify(struck.slice(0, 3))}`
    );
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    /* It walks, and its walks end where it found what it walked to -- but
     * after the cursor in its moment, which may end one time in five where
     * it is near and faces it, found or not. */
    const sought = walks.filter(({ to }) => to !== 0x17);
    expect(walks.length).toBeGreaterThan(0);
    expect(sought.filter(({ there }) => there).length).toBeGreaterThan(sought.length / 2);
  });
});
