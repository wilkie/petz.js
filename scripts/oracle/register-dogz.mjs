#!/usr/bin/env node
/**
 * Registers the oracle's Dogz: adopts a puppy through the adoption kit's own
 * screens, with the unlock code its copy protection expects.
 *
 * The adoption kit runs as a time-limited trial until a puppy is adopted.
 * Adopting one asks for an unlock code a PF.Magic operator would have read
 * out over the phone. That code is worked out here rather than looked up:
 * `THINK.DLL` derives it from the volume serial number of drive C:, and DOSBox
 * does not report one, so it is the same for every DOSBox installation
 * (`src/protection/unlock.ts`, and kb/topics/adoption-unlock.md for how that
 * was read out of the binaries).
 *
 * The first run of Dogz also has WinG time the display, once, and keep the
 * result in WIN.INI, as it would on any machine.
 *
 * The answers -- which puppy, its name, the unlock code's unchecked tail --
 * are in oracle/manifest.json under `registration`. The screens' controls are
 * clicked where they are on the 640x480 display; each step's screen is kept
 * in oracle/build/screens/register-dogz-*.png.
 *
 *   node scripts/oracle/register-dogz.mjs
 *
 * Run after install-dogz.mjs. Then: fingerprint.mjs.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { serialString, unlockCode } from '../../src/protection/unlock.ts';
import { DRIVE, exists, log, readManifest, snapshot } from './lib.mjs';
import { exitWindows, withWindows } from './session.mjs';

/** The doghouses on the adoption play area, left to right, by the puppy in each. */
const DOGHOUSES = {
  Bootz: [78, 365],
  Scrappy: [198, 345],
  ChiChi: [318, 365],
  Chip: [438, 375],
  Jowls: [558, 375],
};

/** Where the controls of each adoption screen are, on the 640x480 display. */
const CONTROLS = {
  adoptMeNow: [592, 160],
  adoptByPhone: [313, 262],
  adoptNow: [311, 258],
  imSure: [300, 354],
  unlockContinue: [218, 370],
  nameContinue: [298, 369],
  startDogz: [303, 357],
};

async function main() {
  const { registration } = await readManifest();
  const ini = join(DRIVE, 'DOGZ.DOG', 'DOGZ.INI');

  if (!(await exists(ini))) {
    throw new Error('Dogz is not installed; run scripts/oracle/install-dogz.mjs first');
  }

  if (/^Serialized=1/im.test(await readFile(ini, 'latin1'))) {
    log('Dogz is already registered.');
    return;
  }

  const house = DOGHOUSES[registration.puppy];

  if (!house) {
    throw new Error(`no puppy ${registration.puppy}; the five are ${Object.keys(DOGHOUSES)}`);
  }

  // DOSBox reports no volume serial number, so THINK.DLL takes it as 0.
  const code = unlockCode(serialString(null), registration.unlockTail);
  const click = (session, [x, y]) => session.click(x, y);

  log(`Adopting ${registration.puppy} with unlock code ${code}...`);

  await withWindows(
    'register-dogz',
    'C:\\DOGZ.DOG\\DOGZ.EXE',
    async (session) => {
      /* The first run: WinG times the display, which takes the better part
       * of two minutes, and then the adoption kit's welcome. */
      await session.pause(120);
      await session.screen('welcome');

      // PLAY AREA is the default button.
      await session.keys('Return');
      await session.pause(15);
      await session.screen('play-area');

      await click(session, CONTROLS.adoptMeNow);
      await session.pause(4);
      await session.screen('adopt');

      await click(session, CONTROLS.adoptByPhone);
      await session.pause(4);
      await session.screen('pick');

      await click(session, house);
      await session.pause(3);
      await session.screen('picked');

      await click(session, CONTROLS.adoptNow);
      await session.pause(5);
      await session.screen('sure');

      await click(session, CONTROLS.imSure);
      await session.pause(5);
      await session.screen('purchase');

      /* The unlock code's box has the focus, its "XXXX-XXXX" selected, so
       * typing replaces it. (Over an edit box the pointer is an I-beam,
       * which xinput.py cannot find to steer.) */
      await session.type(code);
      await session.screen('unlock-code');
      await click(session, CONTROLS.unlockContinue);
      await session.pause(8);

      // "Name your Dogz": the default name is selected, so typing replaces it.
      await session.screen('name');
      await session.type(registration.petName);
      await click(session, CONTROLS.nameContinue);
      await session.pause(10);

      await session.screen('congratulations');
      await click(session, CONTROLS.startDogz);
      await session.pause(20);
      await session.screen('playpen');

      // Options, Exit; then Windows, from Program Manager.
      await session.keys('Alt_L+o', 'x');
      await session.pause(8);
      await session.screen('closed');
      await exitWindows(session);
    },
    { limit: 30 }
  );

  const text = await readFile(ini, 'latin1');

  if (!/^Serialized=1/im.test(text)) {
    throw new Error('Dogz was not registered; see oracle/build/screens/register-dogz-*.png');
  }

  await snapshot('adoption');
  log(`${/^Pet Name=(.*)$/im.exec(text)?.[1]} is adopted.`);
  log('Next: node scripts/oracle/fingerprint.mjs');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`register-dogz: ${error.message}`);
    process.exitCode = 1;
  });
}
