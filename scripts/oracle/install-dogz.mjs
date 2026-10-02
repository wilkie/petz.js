#!/usr/bin/env node
/**
 * Installs Dogz on the oracle's Windows with Dogz's own Setup, as its owners
 * did: from Program Manager, answering each of its screens.
 *
 * Setup is InstallShield's, and has no unattended mode, so it is driven by
 * keys and clicks (`session.mjs`). Both disks are unpacked into one directory
 * on the drive, `C:\DOGZSET`, so that when Setup asks for disk 2 it is
 * already there, and Setup is run from it with Program Manager as the shell,
 * so that the program group it makes over DDE is made.
 *
 * The answers -- the owner's first and last name, the directory, the group --
 * are in oracle/manifest.json under `install`. Setup puts Dogz in
 * C:\DOGZ.DOG, WinG in the system directory, and the screen saver beside
 * Windows. `C:\DOGZSET` is taken off the drive afterwards, as the floppies
 * would have been taken out.
 *
 *   node scripts/oracle/install-dogz.mjs
 *
 * Run after install-windows.mjs. Then: register-dogz.mjs.
 */

import { cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { DOGZ_STAGE } from './fetch.mjs';
import { DRIVE, exists, log, readManifest, snapshot, walk } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';

const STAGE = 'DOGZSET';

/** What Setup has to have put down before we believe in it. */
const REQUIRED = [
  'DOGZ.DOG/DOGZ.EXE',
  'DOGZ.DOG/DOGZ.WAD',
  'DOGZ.DOG/THINK.DLL',
  'DOGZ.DOG/NEURON.DLL',
  'DOGZ.DOG/DOGZ.INI',
  'DOGZ.DOG/PUPPY.AGE',
  'WINDOWS/DOGZDLL.DLL',
  'WINDOWS/SYSTEM/WING.DLL',
];

async function main() {
  const { install } = await readManifest();

  if (!(await exists(join(DRIVE, 'WINDOWS', 'WIN.COM')))) {
    throw new Error('Windows is not installed; run scripts/oracle/install-windows.mjs first');
  }

  if (await exists(join(DRIVE, 'DOGZ.DOG'))) {
    throw new Error(
      'Dogz is already installed; install-windows.mjs --force starts again from a clean drive'
    );
  }

  if (!(await exists(DOGZ_STAGE))) {
    throw new Error('the Dogz disks are not fetched; run scripts/oracle/fetch.mjs first');
  }

  await cp(DOGZ_STAGE, join(DRIVE, STAGE), { recursive: true });
  log('Running Dogz Setup...');

  await withWindows(
    'install-dogz',
    `C:\\${STAGE}\\SETUP.EXE`,
    async (session) => {
      await session.pause(15);

      // "Enter Your Name": both fields, then Continue, the default.
      await session.screen('name');
      await session.type(install.firstName);
      await session.keys('Tab');
      await session.type(install.lastName);
      await session.keys('Return');
      await session.pause(4);

      /* "Dogz Default Destination". Exit is the default button here, so
       * Install is taken by its mnemonic. */
      await session.screen('destination');
      await session.keys('Alt_L+i');
      await session.pause(6);

      // "Please enter the name of the Program Group": the default.
      await session.screen('group');
      await session.keys('Return');
      await session.pause(15);

      // "Please insert Disk 2": it is already in C:\DOGZSET.
      await session.screen('disk-2');
      await session.keys('Return');
      await session.pause(30);

      // "Installation Complete": Return to Windows.
      await session.screen('complete');
      await session.keys('Alt_L+w');
      await session.pause(6);

      await session.screen('program-manager');
      await exitWindows(session);
    },
    { limit: 30 }
  );

  await rm(join(DRIVE, STAGE), { recursive: true, force: true });

  const files = new Set((await walk(DRIVE)).map((file) => file.toUpperCase()));
  const missing = REQUIRED.filter((file) => !files.has(file));

  if (missing.length) {
    throw new Error(
      `Setup did not finish; these are missing:\n  ${missing.join('\n  ')}\n` +
        'See oracle/build/screens/install-dogz-*.png.'
    );
  }

  const progman = await readFile(join(DRIVE, 'WINDOWS', 'PROGMAN.INI'), 'latin1');

  if (!/DOGZ/i.test(progman)) {
    log("  warning: Setup made no program group; Program Manager did not answer Setup's DDE");
  }

  await snapshot('setup');
  log(`Dogz is in ${join(DRIVE, 'DOGZ.DOG')}.`);
  log('Next: node scripts/oracle/register-dogz.mjs');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`install-dogz: ${error.message}`);
    process.exitCode = 1;
  });
}
