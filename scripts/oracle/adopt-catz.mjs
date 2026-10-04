#!/usr/bin/env node
/**
 * Adopts a kitten in the registered CD-ROM's Catz, as its owner would: on
 * a copy of the registered drive (register-catz.mjs --cd), in
 * oracle/build/variants/catz-adopted, through Options, "Choose Another
 * Kitten...", the Adoption Kit's "Adopt me Now", the breed, and its name;
 * then Catz is closed from its Options menu, which saves the cat.
 *
 * [[measured]] So adopted, the kitten lives in "<name>'s Playpen", the
 * whole screen, and goes where it likes in it; its file is the next
 * `CATZ<n>.CAT` in CATZ.DOG, which `LASTCAT.INI` names.
 *
 *   node scripts/oracle/adopt-catz.mjs
 *   node scripts/oracle/adopt-catz.mjs --breed siamese --name Sophisto
 */

import { cp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { exists, log } from './lib.mjs';
import { withWindows } from './session.mjs';
import { VARIANTS } from './variant.mjs';

/** The breeds, in the order "Adopt a Catz" shows them, and where each is on the screen. */
const BREEDS = {
  siamese: [72, 170],
  clown: [196, 170],
  persian: [320, 170],
  hunter: [444, 170],
  scaredy: [568, 170],
};

/** On Windows' screen: the Catz panel's Options menu, its "Choose Another Kitten...", the Adoption Kit's "Adopt me Now", and "Adopt a Catz"'s OK. */
const OPTIONS = [86, 95];
const CHOOSE_ANOTHER = [130, 210];
const ADOPT_ME_NOW = [87, 121];
const BREED_OK = [198, 294];

async function main() {
  const args = process.argv.slice(2);
  const option = (flag, otherwise) => {
    const at = args.indexOf(flag);
    return at === -1 ? otherwise : args[at + 1];
  };
  const breed = option('--breed', 'hunter').toLowerCase();
  const name = option('--name', 'Pouncer');
  const registered = join(VARIANTS, 'catz-cd-registered');

  if (!BREEDS[breed]) {
    throw new Error(`no breed ${breed}: ${Object.keys(BREEDS).join(', ')}`);
  }

  if (!(await exists(join(registered, 'WINDOWS', 'CATZ.INI')))) {
    throw new Error('Catz is not registered; run scripts/oracle/register-catz.mjs --cd first');
  }

  const drive = join(VARIANTS, 'catz-adopted');
  await rm(drive, { recursive: true, force: true });
  await cp(registered, drive, { recursive: true });

  /* As just registered: no cat saved, so Catz opens on its Welcome and the
   * Adoption Kit's kitten, not in a playpen of a cat adopted before. */
  const saved = join(drive, 'CATZ.DOG');
  const cats = (await readdir(saved)).filter((file) => /^(CATZ\d+\.CAT|LASTCAT\.INI)$/i.test(file));
  await Promise.all(cats.map((file) => rm(join(saved, file))));

  log(`Adopting the ${breed}'s kitten, named ${name}...`);

  await withWindows(
    'catz-adopted',
    'C:\\CATZ.DOG\\CATZ.EXE',
    async (session) => {
      /* The display was timed when the drive was registered, if it was today. */
      await session.pause(30);
      await session.screen('welcome');
      await session.keys('Return');
      await session.pause(12);
      await session.click(...OPTIONS);
      await session.pause(3);
      await session.click(...CHOOSE_ANOTHER);
      await session.pause(10);
      await session.screen('choose');
      await session.keys('Return');
      await session.pause(15);
      await session.click(...ADOPT_ME_NOW);
      await session.pause(14);
      await session.screen('breeds');
      await session.click(...BREEDS[breed]);
      await session.pause(2);
      await session.click(...BREED_OK);
      await session.pause(14);
      await session.screen('name');
      await session.type(name);
      await session.keys('Return');
      await session.pause(15);
      await session.screen('playpen');
      await session.keys('Alt_L+o');
      await session.pause(2);
      await session.keys('x');
      await session.pause(10);
      await session.screen('exited');
    },
    { drive, core: 'normal', ends: false }
  );

  /* The adopted cat: the file LASTCAT.INI names, one this run wrote. */
  const lastPath = join(saved, 'LASTCAT.INI');
  const last = (await exists(lastPath)) ? await readFile(lastPath, 'latin1') : '';
  const file = /This Last Cat=C:\\CATZ\.DOG\\(\w+\.cat)/i.exec(last)?.[1];
  const cat = file ? await readFile(join(saved, file.toUpperCase()), 'latin1') : '';

  if (!new RegExp(`^petName=${name}\\s*$`, 'm').test(cat)) {
    throw new Error('no cat of that name was saved; see oracle/build/screens/catz-adopted-*.png');
  }

  log(`  ${name} is in CATZ.DOG\\${file.toUpperCase()}: ${/^Cat1=(.*)$/m.exec(cat)?.[1].trim()}`);
  log(`The adopted drive is ${drive}.`);
}

main().catch((error) => {
  console.error(`adopt-catz: ${error.message}`);
  process.exitCode = 1;
});
