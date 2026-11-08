import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import { CatzMouseLive, readMouseFactors } from '../../src/behaviour/catz-mouse-live.ts';
import { CatzPlacer } from '../../src/behaviour/catz-stage.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { extendFrames } from '../../src/render/extend.ts';
import { describeWithOracle } from './with-oracle.ts';

const PETZ = 'oracle/build/catz-drive-c/CATZ.DOG/PTZFILES';
const ENGINE = 'oracle/build/catz-drive-c/WINDOWS/SYSTEM/CATZDLL.DLL';
const RESOURCE = join(PETZ, 'MOUSE', 'RESOURCE');
const describe = describeWithOracle(PETZ);
const STAGE = { left: 0, top: 0, right: 640, bottom: 480 };
const HOLE = { x: 206, y: 403 };

describe('the playpen’s mouse on its own, its body played by its own scripts', () => {
  /* Days 1 and 3 by C's `rand` from a seed. On day 2 it never comes out in
   * ten minutes: its fear, made 50 to 99, draws back toward its centre (15)
   * a step every so long by the clock, and at 50 or more it is always in
   * danger. */
  it.each([1, 3])('comes out, explores and goes home, on day %i', (seed) => {
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const text = new TextDecoder('latin1').decode(read('MOUSE.LNZ'));
    const header = parseBhd(read('MOUSE.BHD'));
    const frames = header.animations.flatMap((_, n) =>
      existsSync(join(RESOURCE, `MOUSE${n}.BDT`))
        ? parseAnimation(header, n, read(`MOUSE${n}.BDT`))
        : []
    );
    const lnz = parseLnz(text, header.ballCount);
    const shaped = extendFrames(frames, lnz);
    const engine = parseNe(new Uint8Array(readFileSync(ENGINE)));
    const data = read('MOUSE.SCP');
    const scripts = parseScripts(data, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz);
    const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
    const rand = borlandRand(seed);
    const random = (n: number) => rand() % n;
    const live = new CatzMouseLive({
      scripts,
      positions: { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) },
      flags: (frame) => frames[frame]?.tag ?? 3,
      shaped,
      placer: new CatzPlacer(lnz, header, shaped, { scales: { pet: 200, ball: 200 } }),
      stage: STAGE,
      hole: HOLE,
      factors: readMouseFactors(text),
      random,
    });
    const states: Record<string, number> = {};
    let clock = 0;
    let far = 0;

    for (let tick = 0; tick < 6000; tick++) {
      clock += 100 / 17;
      live.tick({
        /* The cat asleep at the far side, a kitten; the cursor in the corner. */
        cat: { x: 520, y: 150 },
        catGlobal: 6,
        catAge: 7,
        cursor: { x: 630, y: 10 },
        things: new Map(),
        shelfAt: (kind) => ({ x: 30 * kind, y: 30 }),
        clock: Math.trunc(clock),
      });
      const { global, state } = live.mouse.fields;
      states[`${global}/${state}`] = (states[`${global}/${state}`] ?? 0) + 1;
      const { x, y } = live.at;
      far = Math.max(far, Math.round(Math.hypot(x - HOLE.x, y - HOLE.y)));
    }

    console.log(
      `day ${seed}: ${JSON.stringify(states)}, as far as ${far} from its hole, brains ${live.mouse.fields.brains}`
    );
    /* It comes out and walks, and back in its hole it waits again. */
    expect(states['2/3']).toBeGreaterThan(0);
    expect(states['1/1']).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(60);
  });
});
