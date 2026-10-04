#!/usr/bin/env node
/**
 * The walking probe -- not yet a measurement: whether a cat travels on the
 * oracle as the reimplementation places it. In the demo's Adoption Kit the
 * kittens keep to their baskets, mostly hidden behind them and the caption,
 * and the pictures so far show too little of one to line a drawing up
 * with; see kb/guides/reproducing.md. A Catz variant has every sequence its scripts
 * show made one walk's (`variant.mjs --stride <record>`), which leaves the
 * kitten coming out and going wherever the engine has it go, walking; a
 * burst of pictures is taken of it; and in each the cat is found
 * (`findCat`) and matched against every frame of that action, at turns near
 * the first picture's, for which frame it shows and where the drawing must
 * be put to lie on it.
 *
 * As `PopScript` places frames (kb/formats/scp.md), the drawing's place
 * stays the same through a cycle -- the frames' own coordinates carry the
 * cat on -- and at each new cycle moves by the cycle's stride, the glue
 * ball's travel from its first frame to its last, so that the cat goes on
 * from where it was. This prints, for each picture, the frame, the turn and
 * the place, and the stride the reimplementation works out at that turn.
 *
 * The Adoption Kit keeps its kittens at their baskets, walking about and
 * behind them; what a basket may hide is masked. Which kitten comes out
 * varies from run to run: it is told by its colours in the first picture.
 * With `--carry` it is carried out by the scruff to the open floor first,
 * which DOSBox's narrow window often defeats.
 *
 *   node scripts/oracle/walk.mjs --record 0
 *   node scripts/oracle/walk.mjs --record 0 --reuse     the pictures already taken
 *   node scripts/oracle/walk.mjs --record 0 --fresh     the variant made again
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { catzTimeline } from '../../src/behaviour/catz-timeline.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import { ballAt } from '../../src/render/ballz.ts';
import { BUILD, exists, log } from './lib.mjs';
import { align, findCat, loadScene } from './match.ts';
import { withWindows } from './session.mjs';
import { makeVariant, VARIANTS } from './variant.mjs';

const OUT = join(BUILD, 'probes');

/** The playpen, less the supply shelf at its left and the captions along its foot. */
const REGION = { left: 175, top: 70, right: 630, bottom: 403 };

/** The Adoption Kit's baskets, left to right, each a breed's kitten's, by where each is. */
const BASKETS = [
  { breed: 'siamese', left: 180, right: 268 },
  { breed: 'clown', left: 270, right: 358 },
  { breed: 'persian', left: 360, right: 444 },
  { breed: 'hunter', left: 446, right: 534 },
  { breed: 'scaredy', left: 536, right: 628 },
];

/** Where a kitten is let go: the open floor above the baskets, under the logo. */
const DROP = [400, 200];

const readPicture = (path) =>
  new Uint8Array(execFileSync('convert', [path, '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 24 }));

async function main() {
  const args = process.argv.slice(2);
  const option = (flag, otherwise) => {
    const at = args.indexOf(flag);
    return at === -1 ? otherwise : args[at + 1];
  };
  const record = Number(option('--record', 0));
  const count = Number(option('--count', 30));
  const adopted = args.includes('--adopted');
  const name = `catwalk${adopted ? 'adopted' : ''}${record}`;
  const drive = join(VARIANTS, name);
  const reuse = args.includes('--reuse');

  /* Kept from run to run unless asked afresh: its first run has WinG time the display. */
  if (args.includes('--fresh') || !(await exists(drive))) {
    await makeVariant(name, [
      '--game',
      'catz',
      '--stride',
      String(record),
      ...(adopted ? ['--from', 'catz-adopted'] : []),
    ]);
  }

  const shots = join(BUILD, 'screens');
  const kept = join(OUT, `${name}.json`);

  if (adopted) {
    return walkAdopted({ name, drive, record, count, reuse, shots, kept });
  }

  const background = join(OUT, 'pouncer300-catless.png');

  if (!(await exists(background))) {
    throw new Error('no picture of the playpen without a cat: run probe.mjs pouncer300 first');
  }

  const backgroundRgb = readPicture(background);

  if (!reuse) {
    for (const file of (await readdir(shots)).filter((file) => file.startsWith(`${name}-`))) {
      await rm(join(shots, file));
    }

    const read = (path) => new Uint8Array(readFileSync(join(drive, path)));
    /* The colours any kitten could be: to tell one from its basket by. */
    const possible = new Map(
      BASKETS.map(({ breed }) => [
        breed,
        loadScene(read, 2308, 100, 0, { breed, percent: 100 }).possible,
      ])
    );
    const breed = await carryAndShoot(
      name,
      drive,
      count,
      backgroundRgb,
      possible,
      args.includes('--carry')
    );
    await writeFile(kept, JSON.stringify({ breed }));
  }

  const { breed } = JSON.parse(await readFile(kept, 'utf8'));
  const cat = { breed, percent: 100 };
  const pictures = (await readdir(shots))
    .filter((file) => file.startsWith(`${name}-`) && file.includes('walk'))
    .sort()
    .map((file) => join(shots, file));
  log(`The kitten carried out: the ${breed}'s.`);

  await analyse({ drive, record, cat, pictures, background: backgroundRgb, region: REGION });
}

/** Each picture matched against the walk's frames, and the stride at each turn found. */
async function analyse({ drive, record, cat, pictures, background, region }) {
  const read = (path) => new Uint8Array(readFileSync(join(drive, path)));
  const engine = parseNe(read('WINDOWS/SYSTEM/CATZDLL.DLL'));
  const scripts = parseScripts(
    read('CATZ.DOG/PTZFILES/CAT/RESOURCE/CAT.SCP'),
    catzArity(readCatzOpcodes(engine)),
    SCRIPTS.catz
  );
  const positions = { count: 0, neutral: scripts[record].from };
  const cycle = catzTimeline(scripts, positions, record, {
    flags: () => 3,
    random: () => 0,
  })
    .filter((step) => !step.reference)
    .map((step) => step.frame);
  const scenes = cycle.map((frame) => loadScene(read, frame, 100, 0, cat));
  const rows = [];
  let yaws = Array.from({ length: 256 }, (_, n) => n - 128);

  log(`Record ${record}: ${cycle.length} frames, ${cycle[0]} to ${cycle.at(-1)}.`);

  for (const path of pictures) {
    const dog = findCat(readPicture(path), background, region, scenes[0].possible);

    if (!dog || dog.count < 300) {
      rows.push({ path, found: false });
      continue;
    }

    let best = null;

    cycle.forEach((frame, at) => {
      const placed = align(scenes[at], dog, yaws);

      if (!best || placed.score.wrong < best.score.wrong) {
        best = { ...placed, frame, at };
      }
    });

    /* The cat turns slowly if at all: after the first, near the last turn found. */
    yaws = Array.from({ length: 17 }, (_, n) => best.yaw - 8 + n);
    rows.push({ path, found: true, pixels: dog.count, ...best });
  }

  const scene = scenes[0];
  const [first, last] = [cycle[0], cycle.at(-1)].map((frame) =>
    loadScene(read, frame, 100, 0, cat)
  );
  const glue = Number(scene.breed.sections.get('Default Glue Ball')?.[0]?.values[0] ?? 6);

  for (const row of rows) {
    if (!row.found) {
      log(`  ${row.path.split('/').pop()}: no cat`);
      continue;
    }

    const at = (s) => ballAt(s.breed, s.header, s.frame, glue, { age: 100, yaw: row.yaw });
    const [a, b] = [at(first), at(last)];
    log(
      `  ${row.path.split('/').pop()}: frame ${row.frame} (${row.at + 1} of ${cycle.length}), ` +
        `yaw ${row.yaw}, at ${row.dx},${row.dy}, ${row.score.wrong} of ${row.pixels} differ; ` +
        `stride here ${b.x - a.x},${b.y - a.y}`
    );
  }

  await mkdir(OUT, { recursive: true });
}

/**
 * Runs Catz on the variant into the playpen, finds which basket's kitten
 * has come out -- whichever does varies from run to run -- carries it by
 * the scruff (the right button) to the open floor, and takes `count`
 * pictures as fast as they come of it walking back. Returns its breed.
 */
async function carryAndShoot(name, drive, count, background, possible, carry) {
  let breed = null;

  await withWindows(
    name,
    'C:\\CATZ.DOG\\CATZ.EXE',
    async (session) => {
      const winIni = readFileSync(join(drive, 'WINDOWS', 'WIN.INI'), 'latin1');
      await session.pause(/^svga256\.drv/im.test(winIni) ? 30 : 150);
      await session.keys('Return');
      await session.pause(8);
      await session.keys('Return');
      await session.pause(12);

      /* Windows has left the pointer at the middle: learnt there, Catz's hand. */
      const rgb = readPicture(await session.screen('baskets'));
      await session.learnPointer();
      const at = (image, index) =>
        (image[3 * index] << 16) | (image[3 * index + 1] << 8) | image[3 * index + 2];
      const counts = BASKETS.map(({ breed: kind, left, right }) => {
        let changed = { count: 0, x: 0, y: 0 };

        for (let y = 250; y < 432; y++) {
          for (let x = left; x <= right; x++) {
            const index = y * 640 + x;
            const [r, g, b] = [rgb[3 * index], rgb[3 * index + 1], rgb[3 * index + 2]];
            const yellow = r >= 200 && g >= 180 && b <= 64;

            if (
              at(rgb, index) !== at(background, index) &&
              !yellow &&
              possible.get(kind).has(at(rgb, index))
            ) {
              changed = { count: changed.count + 1, x: changed.x + x, y: changed.y + y };
            }
          }
        }

        return changed;
      });
      const out = counts.indexOf(counts.reduce((a, b) => (b.count > a.count ? b : a)));
      const { count: seen, x, y } = counts[out];
      breed = BASKETS[out].breed;
      const from = [Math.round(x / seen), Math.round(y / seen)];
      log(`  the ${breed}'s kitten is out, ${seen} pixels of it about ${from}`);

      /* Carried out by the scruff, if asked: but DOSBox's window spans only
       * 200 of Windows' rows, and while Catz carries a kitten it hides its
       * pointer, so a long carry loses it. */
      if (carry) {
        await session.drag(from, DROP, 3);
        await session.screen('dropped');
      }

      for (let shot = 0; shot < count; shot++) {
        await session.screen(`walk-${String(shot).padStart(2, '0')}`);
      }
    },
    { drive, core: 'normal', ends: false }
  );

  return breed;
}

/** The playpen of an adopted cat, right of the supply shelf's panel and under the title bar. */
const PLAYPEN = { left: 205, top: 45, right: 630, bottom: 470 };

/**
 * The walk of an adopted kitten (`--adopted`): Pouncer, the Hunter's, in
 * its own playpen, the whole screen, where it goes where it likes. The
 * playpen's tiled wallpaper is told from the cat by each pixel's commonest
 * colour over the burst, the cat moving on.
 */
async function walkAdopted({ name, drive, record, count, reuse, shots }) {
  if (!reuse) {
    for (const file of (await readdir(shots)).filter((file) => file.startsWith(`${name}-`))) {
      await rm(join(shots, file));
    }

    await withWindows(
      name,
      'C:\\CATZ.DOG\\CATZ.EXE',
      async (session) => {
        await session.pause(30);

        for (let shot = 0; shot < count; shot++) {
          await session.screen(`walk-${String(shot).padStart(2, '0')}`);
        }
      },
      { drive, core: 'normal', ends: false }
    );
  }

  const pictures = (await readdir(shots))
    .filter((file) => file.startsWith(`${name}-`) && file.includes('walk'))
    .sort()
    .map((file) => join(shots, file));
  const images = pictures.map(readPicture);
  const background = new Uint8Array(images[0].length);

  for (let at = 0; at < background.length; at += 3) {
    const counts = new Map();
    let best = [0, -1];

    for (const image of images) {
      const key = (image[at] << 16) | (image[at + 1] << 8) | image[at + 2];
      const seen = (counts.get(key) ?? 0) + 1;
      counts.set(key, seen);

      if (seen > best[1]) {
        best = [key, seen];
      }
    }

    background.set([(best[0] >> 16) & 255, (best[0] >> 8) & 255, best[0] & 255], at);
  }

  log(`The adopted kitten's walk: ${pictures.length} pictures.`);
  await analyse({
    drive,
    record,
    cat: { breed: 'hunter', percent: 100 },
    pictures,
    background,
    region: PLAYPEN,
  });
}

main().catch((error) => {
  console.error(`walk: ${error.message}`);
  process.exitCode = 1;
});
