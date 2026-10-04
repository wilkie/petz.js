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
 *
 * With `--cd`, from the Catz CD-ROM's image (`fetch.mjs`, the manifest's
 * `catzRetail`) mounted as D:, its Setup in `D:\CATZ`, onto a drive of its
 * own, oracle/build/catz-retail-drive-c:
 *
 *   node scripts/oracle/install-windows.mjs --drive catz-retail-drive-c
 *   node scripts/oracle/install-catz.mjs --cd
 */

import { cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CATZ_CD, CATZ_STAGE } from './fetch.mjs';
import { BUILD, exists, log, readManifest, walk } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';

export const CATZ_DRIVE = join(BUILD, 'catz-drive-c');

/** The drive the CD-ROM's Catz is installed on (`--cd`). */
export const CATZ_RETAIL_DRIVE = join(BUILD, 'catz-retail-drive-c');

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
  const fromCd = process.argv.includes('--cd');
  const drive = fromCd ? CATZ_RETAIL_DRIVE : CATZ_DRIVE;
  const driveName = fromCd ? 'catz-retail-drive-c' : 'catz-drive-c';

  if (!(await exists(join(drive, 'WINDOWS', 'WIN.COM')))) {
    throw new Error(
      `Windows is not installed for Catz; run scripts/oracle/install-windows.mjs --drive ${driveName}`
    );
  }

  if (await exists(join(drive, 'CATZ.DOG'))) {
    throw new Error(
      `Catz is already installed; install-windows.mjs --drive ${driveName} --force starts again`
    );
  }

  if (fromCd && !(await exists(CATZ_CD))) {
    throw new Error('the Catz CD-ROM is not fetched; run scripts/oracle/fetch.mjs first');
  }

  if (!fromCd && !(await exists(CATZ_STAGE))) {
    throw new Error('the Catz demo is not fetched; run scripts/oracle/fetch.mjs first');
  }

  if (!fromCd) {
    await cp(CATZ_STAGE, join(drive, STAGE), { recursive: true });
  }

  log(`Running Catz Setup${fromCd ? ' from the CD-ROM' : ''}...`);

  await withWindows(
    fromCd ? 'install-catz-cd' : 'install-catz',
    fromCd ? 'D:\\CATZ\\SETUP.EXE' : `C:\\${STAGE}\\SETUP.EXE`,
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
    { drive, limit: 30, ...(fromCd ? { cd: CATZ_CD } : {}) }
  );

  await rm(join(drive, STAGE), { recursive: true, force: true });
  const files = new Set((await walk(drive)).map((file) => file.toUpperCase()));
  const missing = REQUIRED.filter((file) => !files.has(file));

  if (missing.length) {
    throw new Error(
      `Setup did not finish; these are missing:\n  ${missing.join('\n  ')}\n` +
        'See oracle/build/screens/install-catz-*.png.'
    );
  }

  const progman = await readFile(join(drive, 'WINDOWS', 'PROGMAN.INI'), 'latin1');

  if (!/CATZ/i.test(progman)) {
    log("  warning: Setup made no program group; Program Manager did not answer Setup's DDE");
  }

  log(`Catz is in ${join(drive, 'CATZ.DOG')}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`install-catz: ${error.message}`);
    process.exitCode = 1;
  });
}
