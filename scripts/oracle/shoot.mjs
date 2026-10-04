#!/usr/bin/env node
/**
 * Runs Dogz on a variant of the oracle's drive and keeps pictures of the
 * screen: what a Measured claim about how Dogz looks is made from.
 *
 *   node scripts/oracle/shoot.mjs vga16
 *   node scripts/oracle/shoot.mjs vga16 --wait 45 --count 6 --every 10
 *
 * Windows starts with Dogz; after `--wait` seconds (by default 45, or 150
 * the first time, when WinG times the display) `--count` pictures are taken
 * `--every` seconds apart, into oracle/build/screens/<variant>-*.png; then
 * Dogz is closed from its Options menu, which saves its dog, and Windows is
 * ended. The variant is from variant.mjs.
 *
 * A Catz variant (`variant.mjs --game catz`) runs Catz, past its welcome and
 * on with "Use a Visit", the default -- a fresh drive's visit, so the
 * demo's own allowance is never touched -- into the playpen; the pictures
 * are taken from there, and Windows is stopped, not ended.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exists, log } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';
import { VARIANTS } from './variant.mjs';

/**
 * Runs Dogz on the variant `name` and returns the pictures it kept: `count`
 * of them `every` seconds apart, after `wait` seconds (by default 45, or 150
 * when WinG has not timed the display).
 */
export async function shoot(name, { wait: waitFor, count = 3, every = 6 } = {}) {
  const drive = join(VARIANTS, name ?? '');

  if (!name || !(await exists(drive))) {
    throw new Error(`no variant ${name}; make it with variant.mjs`);
  }

  /* WinG keeps its timing of a display in WIN.INI; without one for the
   * display the variant has, the first run times it, for about two minutes. */
  const winIni = await readFile(join(drive, 'WINDOWS', 'WIN.INI'), 'latin1');
  const systemIni = await readFile(join(drive, 'WINDOWS', 'SYSTEM.INI'), 'latin1');
  const driver = /^display\.drv=(.*)$/im.exec(systemIni)?.[1].trim().toLowerCase() ?? '';
  const timed = new RegExp(`^${driver.replace('.', '\\.')}`, 'im').test(winIni);

  const wait = waitFor ?? (timed ? 45 : 150);
  const pictures = [];
  const catz = await exists(join(drive, 'CATZ.DOG', 'CATZ.EXE'));

  if (catz) {
    log(`Running Catz on ${name}, ${count} pictures in the playpen...`);

    await withWindows(
      name,
      'C:\\CATZ.DOG\\CATZ.EXE',
      async (session) => {
        /* WinG's timing, if it has to, then the welcome; Return on it, and on
         * the supply shelf's Use a Visit. */
        await session.pause(waitFor ?? (timed ? 30 : 150));
        await session.keys('Return');
        await session.pause(8);
        await session.keys('Return');
        await session.pause(12);

        for (let shot = 0; shot < count; shot++) {
          const picture = await session.screen(`catz-${shot}`);
          pictures.push(picture);
          log(`  ${picture}`);
          await session.pause(every);
        }
      },
      /* The dynamic core stops on Catz's second run (session.mjs). */
      { drive, core: 'normal', ends: false }
    );

    return pictures;
  }

  log(`Running Dogz on ${name}, ${count} pictures after ${wait} seconds...`);

  await withWindows(
    name,
    'C:\\DOGZ.DOG\\DOGZ.EXE',
    async (session) => {
      await session.pause(wait);

      for (let shot = 0; shot < count; shot++) {
        const picture = await session.screen(`dogz-${shot}`);
        pictures.push(picture);
        log(`  ${picture}`);
        await session.pause(every);
      }

      await session.keys('Alt_L+o', 'x');
      await session.pause(8);
      await exitWindows(session);
    },
    { drive, limit: 40 }
  );

  return pictures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...args] = process.argv.slice(2);
  const number = (flag) => {
    const at = args.indexOf(flag);
    return at === -1 ? undefined : Number(args[at + 1]);
  };

  shoot(name, { wait: number('--wait'), count: number('--count'), every: number('--every') }).catch(
    (error) => {
      console.error(`shoot: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
