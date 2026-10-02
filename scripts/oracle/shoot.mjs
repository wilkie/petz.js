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
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exists, log } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';
import { VARIANTS } from './variant.mjs';

async function main() {
  const [name, ...args] = process.argv.slice(2);
  const number = (flag, otherwise) => {
    const at = args.indexOf(flag);
    return at === -1 ? otherwise : Number(args[at + 1]);
  };
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

  const wait = number('--wait', timed ? 45 : 150);
  const count = number('--count', 3);
  const every = number('--every', 6);

  log(`Running Dogz on ${name}, ${count} pictures after ${wait} seconds...`);

  await withWindows(
    name,
    'C:\\DOGZ.DOG\\DOGZ.EXE',
    async (session) => {
      await session.pause(wait);

      for (let shot = 0; shot < count; shot++) {
        log(`  ${await session.screen(`dogz-${shot}`)}`);
        await session.pause(every);
      }

      await session.keys('Alt_L+o', 'x');
      await session.pause(8);
      await exitWindows(session);
    },
    { drive, limit: 40 }
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`shoot: ${error.message}`);
    process.exitCode = 1;
  });
}
