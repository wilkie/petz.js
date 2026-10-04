#!/usr/bin/env node
/**
 * Installs the Catz demo on its own Windows drive, oracle/build/catz-drive-c,
 * with its own Setup, as for Dogz (install-dogz.mjs): from Program Manager,
 * answering each of its screens by keys and clicks (`session.mjs`).
 *
 * The demo's installer is unpacked into `C:\CATZSET` and Setup is run from
 * it. The answers -- the owner's first and last name -- are Dogz's, in
 * oracle/manifest.json under `install`. Setup puts Catz in C:\CATZ.DOG.
 * `C:\CATZSET` is taken off the drive afterwards.
 *
 *   node scripts/oracle/install-windows.mjs --drive catz-drive-c
 *   node scripts/oracle/install-catz.mjs
 */

import { cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CATZ_STAGE } from './fetch.mjs';
import { BUILD, exists, log, readManifest, walk } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';

export const CATZ_DRIVE = join(BUILD, 'catz-drive-c');

const STAGE = 'CATZSET';

/** What Setup has to have put down before we believe in it. */
const REQUIRED = [
  'CATZ.DOG/CATZ.EXE',
  'CATZ.DOG/CATZ.WAD',
  'CATZ.DOG/KITTENZ.INI',
  'CATZ.DOG/PTZFILES/CAT/RESOURCE/CAT.BHD',
  'CATZ.DOG/PTZFILES/CAT/RESOURCE/CAT.SCP',
  'WINDOWS/SYSTEM/CATZDLL.DLL',
  'WINDOWS/SYSTEM/WING.DLL',
];

async function main() {
  const { install } = await readManifest();

  if (!(await exists(join(CATZ_DRIVE, 'WINDOWS', 'WIN.COM')))) {
    throw new Error(
      'Windows is not installed for Catz; run scripts/oracle/install-windows.mjs --drive catz-drive-c'
    );
  }

  if (await exists(join(CATZ_DRIVE, 'CATZ.DOG'))) {
    throw new Error(
      'Catz is already installed; install-windows.mjs --drive catz-drive-c --force starts again'
    );
  }

  if (!(await exists(CATZ_STAGE))) {
    throw new Error('the Catz demo is not fetched; run scripts/oracle/fetch.mjs first');
  }

  await cp(CATZ_STAGE, join(CATZ_DRIVE, STAGE), { recursive: true });
  log('Running Catz Setup...');

  await withWindows(
    'install-catz',
    `C:\\${STAGE}\\SETUP.EXE`,
    async (session) => {
      await session.pause(15);

      // "Enter Your Name": both fields, then Continue, the default.
      await session.screen('name');
      await session.type(install.firstName);
      await session.keys('Tab');
      await session.type(install.lastName);
      await session.keys('Return');
      await session.pause(6);

      // "Catz Default Destination", C:\CATZ.DOG: Install.
      await session.screen('destination');
      await session.keys('Alt_L+i');
      await session.pause(15);

      /* "Choose Program Group name". Its default is the owner's first name
       * and "'s Catz", and it refuses its own apostrophe without a word, so
       * the group is named plainly, over the default, which is selected. */
      await session.screen('group');
      await session.type('Catz');
      await session.keys('Return');

      await session.pause(40);

      // "Installation Complete": Return to Windows.
      await session.screen('complete');
      await session.keys('Alt_L+w');
      await session.pause(6);
      await session.screen('program-manager');
      await exitWindows(session);
    },
    { drive: CATZ_DRIVE, limit: 30 }
  );

  await rm(join(CATZ_DRIVE, STAGE), { recursive: true, force: true });
  const files = new Set((await walk(CATZ_DRIVE)).map((file) => file.toUpperCase()));
  const missing = REQUIRED.filter((file) => !files.has(file));

  if (missing.length) {
    throw new Error(
      `Setup did not finish; these are missing:\n  ${missing.join('\n  ')}\n` +
        'See oracle/build/screens/install-catz-*.png.'
    );
  }

  const progman = await readFile(join(CATZ_DRIVE, 'WINDOWS', 'PROGMAN.INI'), 'latin1');

  if (!/CATZ/i.test(progman)) {
    log("  warning: Setup made no program group; Program Manager did not answer Setup's DDE");
  }

  log(`Catz is in ${join(CATZ_DRIVE, 'CATZ.DOG')}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`install-catz: ${error.message}`);
    process.exitCode = 1;
  });
}
