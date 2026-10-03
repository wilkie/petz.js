#!/usr/bin/env node
/**
 * Probes: the oracle's drawing of a held dog, measured against the
 * reimplementation's. Each probe in probes.json is a variant (variant.mjs's
 * options), a frame it is held in, and what was measured last; this makes
 * the variant, shoots it, finds the dog in the picture, finds the session's
 * seed if the drawing has fuzz or speckles worth it, lines the two up, and
 * counts the pixels that differ — failing a probe that differs by more than
 * it did.
 *
 *   node scripts/oracle/probe.mjs                 every probe
 *   node scripts/oracle/probe.mjs side35 fur35    those
 *   node scripts/oracle/probe.mjs --reuse         the pictures already taken
 *   node scripts/oracle/probe.mjs --record        keep what is measured as expected
 *   node scripts/oracle/probe.mjs --without shortPi   drawn without one of Dogz's
 *                                                 quirks (src/render/fidelity.ts), to see what it does
 *
 * Pictures of the oracle, the drawing and where they differ are kept in
 * oracle/build/probes/; only the numbers are kept in probes.json.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { FIDELITY, setFidelity } from '../../src/render/fidelity.ts';
import { BUILD, exists, log } from './lib.mjs';
import { align, differences, draw, findDog, loadScene, score, settleToPicture } from './match.ts';
import { shoot } from './shoot.mjs';
import { makeVariant, VARIANTS } from './variant.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBES = join(HERE, 'probes.json');
const OUT = join(BUILD, 'probes');

/** How many more pixels than last measured a probe may differ by: a seed's fuzz is not all found. */
const SLACK = 12;

const readPicture = (path) =>
  new Uint8Array(execFileSync('convert', [path, '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 24 }));

const writePicture = (path, { width, height, rgb }) =>
  execFileSync(
    'convert',
    ['-size', `${width}x${height}`, '-depth', '8', 'rgb:-', '-scale', '400%', path],
    {
      input: rgb,
    }
  );

/** Searches every seed, in as many threads as there are to spare. */
async function searchSeeds(work) {
  const threads = Math.max(1, Math.min(8, availableParallelism() - 1));
  const share = Math.ceil(65536 / threads);
  const results = await Promise.all(
    Array.from(
      { length: threads },
      (_, n) =>
        new Promise((done, fail) => {
          const worker = new Worker(new URL('./seed-worker.mjs', import.meta.url), {
            workerData: { ...work, from: n * share, to: Math.min(65536, (n + 1) * share) },
          });
          worker.once('message', done);
          worker.once('error', fail);
        })
    )
  );
  return results.flat().sort((a, b) => a.wrong - b.wrong);
}

/**
 * A picture with the dog in it, shooting again (up to three times) when
 * WinG is busy, or the playpen cuts the dog off on both sides of a way.
 */
async function picture(probe, reuse) {
  const kept = join(OUT, `${probe.name}-oracle.png`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const path =
      reuse && attempt === 0 && (await exists(kept))
        ? kept
        : (await shoot(probe.name, { count: 1 }))[0];
    const rgb = readPicture(path);
    const dog = findDog(rgb);

    if (dog && !(dog.cut.left && dog.cut.right) && !(dog.cut.top && dog.cut.bottom)) {
      if (path !== kept) {
        await writeFile(kept, await readFile(path));
      }

      return { rgb, dog };
    }

    log(`  ${dog ? 'the dog is cut off both ways' : 'no playpen on the screen'}; again`);
  }

  throw new Error(`${probe.name}: no picture with the whole dog in three tries`);
}

async function run(probe, { reuse, without }) {
  const drive = join(VARIANTS, probe.name);

  if (!reuse || !(await exists(drive))) {
    await makeVariant(probe.name, probe.variant);
  }

  const { dog } = await picture(probe, reuse);
  const age = probe.age ?? 10;
  const read = (path) => new Uint8Array(readFileSync(join(drive, path)));
  /* The dog's turn is the session's too, near enough the probe's: searched 8 either way, or all round. */
  const yaws =
    probe.yaw === undefined
      ? Array.from({ length: 256 }, (_, n) => n - 128)
      : Array.from({ length: 17 }, (_, n) => probe.yaw - 8 + n);
  let best = null;

  /* The fur's bristling is the session's, as the seed is: each level tried, with its own seed. */
  for (const bristle of probe.bristle ?? [0, 1, 2, 3]) {
    const loaded = loadScene(read, probe.frame, age, bristle);
    /* The bitmap's way up is WinG's, unless the probe is drawn without it. */
    const scene = without.bottomUp === false ? { ...loaded, bottomUp: false } : loaded;
    const placed = align(scene, dog, yaws);
    let seed = 1;
    let seeds = null;

    if (probe.seed !== false) {
      seeds = await searchSeeds({
        drive,
        frame: probe.frame,
        age,
        bristle,
        fidelity: { ...FIDELITY, ...without },
        yaw: placed.yaw,
        dx: placed.dx,
        dy: placed.dy,
        order: placed.order,
        dog,
      });
      seed = seeds[0].seed;
    }

    const aligned = align(scene, dog, [placed.yaw], seed);
    const { order } = settleToPicture(scene, dog, aligned, aligned.order, seed);
    const result = {
      ...aligned,
      order,
      score: score(dog, draw(scene, aligned.yaw, [...order], seed), aligned.dx, aligned.dy),
    };

    if (!best || result.score.wrong < best.score.wrong) {
      best = { ...result, scene, seed, bristle, runnerUp: seeds?.[1], pixels: dog.count };
    }
  }

  /* The eyelids where a blink, which goes on while the dog is held, may have caught them. */
  let final = null;

  for (const lids of [0, 33, 66, 100]) {
    for (let dx = best.dx - 1; dx <= best.dx + 1; dx++) {
      for (let dy = best.dy - 1; dy <= best.dy + 1; dy++) {
        const drawing = draw(best.scene, best.yaw, [...best.order], best.seed, { lids });
        const result = score(dog, drawing, dx, dy);

        if (!final || result.wrong < final.score.wrong) {
          final = { ...best, dx, dy, lids, score: result, drawing };
        }
      }
    }
  }

  await writePicture(join(OUT, `${probe.name}.png`), differences(dog, final.drawing, final));
  return final;
}

async function main() {
  const args = process.argv.slice(2);
  const without = Object.fromEntries(
    args.flatMap((arg, at) => (args[at - 1] === '--without' ? [[arg, false]] : []))
  );

  for (const flag of Object.keys(without)) {
    if (!(flag in FIDELITY)) {
      throw new Error(`no quirk ${flag}: ${Object.keys(FIDELITY).join(', ')}`);
    }
  }

  setFidelity(without);
  const names = args.filter((arg, at) => !arg.startsWith('--') && args[at - 1] !== '--without');
  const probes = JSON.parse(await readFile(PROBES, 'utf8'));
  const chosen = names.length ? probes.filter((probe) => names.includes(probe.name)) : probes;
  let failed = 0;

  await mkdir(OUT, { recursive: true });

  for (const probe of chosen) {
    log(`${probe.name}: ${probe.about}`);
    const result = await run(probe, { reuse: args.includes('--reuse'), without });
    const { wrong } = result.score;
    const seedNote =
      (probe.seed === false
        ? ''
        : `, seed ${result.seed}${result.runnerUp ? ` (next best ${result.runnerUp.wrong})` : ''}`) +
      (result.bristle ? `, bristling ${result.bristle}` : '') +
      (result.lids ? `, eyelids ${result.lids} closed` : '') +
      (result.scene.bottomUp ? '' : ', top-down');
    const verdict =
      probe.expect === undefined || Object.keys(without).length
        ? 'measured'
        : wrong <= probe.expect.wrong + SLACK
          ? 'ok'
          : 'WORSE';

    log(
      `  ${wrong} of ${result.pixels} pixels differ at yaw ${result.yaw}${seedNote}; ` +
        `${verdict}${probe.expect ? `, ${probe.expect.wrong} expected` : ''}`
    );

    if (verdict === 'WORSE') {
      failed++;
    }

    if (args.includes('--record') && !Object.keys(without).length) {
      probe.expect = { wrong, pixels: result.pixels };
    }
  }

  if (args.includes('--record')) {
    await writeFile(PROBES, `${JSON.stringify(probes, null, 2)}\n`);
  }

  log(`Pictures in ${OUT}.`);

  if (failed) {
    throw new Error(`${failed} probe${failed === 1 ? '' : 's'} worse than expected`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`probe: ${error.message}`);
    process.exitCode = 1;
  });
}
