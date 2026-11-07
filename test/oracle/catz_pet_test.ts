import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import { catzTimeline } from '../../src/behaviour/catz-timeline.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { describeWithOracle } from './with-oracle.ts';

const PETZ = 'oracle/build/catz-drive-c/CATZ.DOG/PTZFILES';
const ENGINE = 'oracle/build/catz-drive-c/WINDOWS/SYSTEM/CATZDLL.DLL';
const RESOURCE = join(PETZ, 'CAT', 'RESOURCE');
const describe = describeWithOracle(PETZ);

/** The brains and centres of the playpen's cat as the 2,000 frames' day began (CATZTRACE.OUT). */
const BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];

describe('a Catz cat on its own, its actions played by its own scripts', () => {
  it('lives 5,000 ticks, each action as long as its script plays and leaving it in its script’s pose', () => {
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const header = parseBhd(read('CAT.BHD'));
    const frames = header.animations.flatMap((_, n) =>
      existsSync(join(RESOURCE, `CAT${n}.BDT`))
        ? parseAnimation(header, n, read(`CAT${n}.BDT`))
        : []
    );
    const engine = parseNe(new Uint8Array(readFileSync(ENGINE)));
    const data = read('CAT.SCP');
    const scripts = parseScripts(data, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz);
    const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
    const positions = { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) };
    const rand = borlandRand(1);
    const random = (n: number) => rand() % n;
    let pose = positions.neutral;
    const lengths: number[] = [];

    const pet = new CatzPet({
      brains: BRAINS,
      centres: CENTRES,
      stage: { left: 0, top: 0, right: 470, bottom: 370 },
      /* The user moving the cursor somewhere else every 300 ticks. */
      cursor: (tick) => ({
        x: 60 + ((Math.trunc(tick / 300) * 137) % 350),
        y: 100 + ((Math.trunc(tick / 300) * 89) % 250),
      }),
      play: (action) => {
        const steps = scripts[action]
          ? catzTimeline(scripts, positions, action, {
              flags: (frame) => frames[frame]?.tag ?? 3,
              random: (n) => random(n),
              limit: 600,
              from: pose,
            })
          : [];
        const ticks = steps.filter((step) => !step.reference).length;
        pose = scripts[action]?.to || pose;
        lengths.push(ticks);
        return { ticks, pose };
      },
      random,
    });
    const states: Record<number, number> = {};

    for (let n = 0; n < 5000; n++) {
      const { state } = pet.tick();
      states[state] = (states[state] ?? 0) + 1;
    }

    const played = lengths.filter((n) => n > 0);
    console.log(
      `states ${JSON.stringify(states)}\nactions ${lengths.length}, ${played.length} with frames, ${Math.round(played.reduce((a, b) => a + b, 0) / Math.max(1, played.length))} ticks each on average\nstood in ${JSON.stringify(pet.stoodIn)}`
    );
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    expect(played.length).toBeGreaterThan(0);
  });
});
