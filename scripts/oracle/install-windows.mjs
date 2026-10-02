#!/usr/bin/env node
/**
 * Installs Windows 3.1 from the fetched floppy images, unattended, on the
 * 256-colour Super VGA Dogz asks for.
 *
 * This runs Windows' own installer rather than expanding its files by hand:
 * `SETUP.EXE` is what decides which drivers land in `SYSTEM.INI`, in what
 * order, with what settings, and an installation composed from guesses would
 * be a fine place for our own misconceptions to hide. `SETUP /H:file.SHH`
 * reads every answer it would otherwise prompt for out of that file, which is
 * how corporate rollouts were done in 1992 and is why this is scriptable.
 *
 * All six disks are unpacked into one directory and mounted as A:, so Setup
 * finds each disk's marker file and never asks for a swap it has no way to
 * receive. The display driver comes from outside the retail disks, so it is
 * given to Setup the way a user would, by its `OEMSETUP.INF`; see
 * `addDriver`. DOSBox writes to an ordinary host directory, so what comes out
 * is a tree on disk, oracle/build/drive-c/.
 *
 * This is winbox.js's installer (scripts/oracle/install-windows.mjs there),
 * kept to the one display, so that an installation made here is the one a
 * winbox.js recording would be made against.
 *
 *   node scripts/oracle/install-windows.mjs
 *   node scripts/oracle/install-windows.mjs --force    # reinstall
 *
 * Needs `mtools` and `dosbox`.
 */

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DISPLAY, WINDOWS_FLOPPIES } from './fetch.mjs';
import { BUILD, CACHE, DRIVE, exists, log, run, snapshot, unpackFloppy, walk } from './lib.mjs';

const STAGE = join(CACHE, 'windows', 'setup-disk');

/**
 * The machine DOSBox emulates, and the display profile Setup installs for it.
 *
 * `8et4480` is the ET4000's 640x480 256-colour line in the [display] section
 * of the driver's `OEMSETUP.INF`; `svga_et4000` is the card DOSBox emulates
 * that the driver drives.
 */
export const MACHINE = 'svga_et4000';
const PROFILE = '8et4480';

/**
 * The answers Setup would otherwise ask for. Every profile string comes from
 * a section of `SETUP.INF` on the media -- [network], [keyboard.types] -- and
 * a wrong one sends Setup to a prompt nothing will answer.
 *
 * Accessories are installed: Notepad, for one, is what Dogz's own Setup opens
 * its read-me with. Games, screen savers, wallpapers and read-mes are not.
 */
const ANSWERS = [
  '[sysinfo]',
  'showsysinfo=no',
  '',
  '[configuration]',
  'machine = ibm_compatible',
  `display = ${PROFILE}`,
  'mouse = ps2mouse',
  'network = nonet',
  'keyboard = t4s0enha',
  'language = enu',
  'kblayout = nodll',
  '',
  '[windir]',
  'c:\\windows',
  '',
  '[userinfo]',
  '"Dogz oracle"',
  '"dogz-reverse"',
  '',
  '[dontinstall]',
  'readmes',
  'games',
  'screensavers',
  'bitmaps',
  '',
  '[options]',
  '',
  '[printers]',
  '',
  '[endinstall]',
  'configfiles = save',
  'endopt = exit',
];

/** What a finished installation has to contain before we believe in it. */
const REQUIRED = [
  'WINDOWS/WIN.COM',
  'WINDOWS/SYSTEM.INI',
  'WINDOWS/WIN.INI',
  'WINDOWS/PROGMAN.INI',
  'WINDOWS/SYSTEM/KRNL386.EXE',
  'WINDOWS/SYSTEM/USER.EXE',
  'WINDOWS/SYSTEM/GDI.EXE',
  'WINDOWS/SYSTEM/SVGA256.DRV',
];

async function stageDisks() {
  if (!(await exists(WINDOWS_FLOPPIES))) {
    throw new Error('no Windows floppy images; run scripts/oracle/fetch.mjs first');
  }

  const images = (await readdir(WINDOWS_FLOPPIES, { recursive: true }))
    .filter((name) => /\.img$/i.test(name))
    .sort();

  await rm(STAGE, { recursive: true, force: true });

  for (const image of images) {
    await unpackFloppy(join(WINDOWS_FLOPPIES, image), STAGE);
  }

  const files = await readdir(STAGE);
  log(`  ${files.length} files from ${images.length} disks`);

  if (!files.includes('SETUP.EXE')) {
    throw new Error(`no SETUP.EXE among the staged files in ${STAGE}`);
  }
}

/**
 * Gives Setup the display driver, as a user would by pointing Setup at the
 * driver's disk: the driver's files on the staged disk, and from its
 * `OEMSETUP.INF` the profile's [display] line and the sections that line
 * names, added to `SETUP.INF`, so Setup installs it as it installs its own
 * and writes `SYSTEM.INI` itself.
 *
 * Only the files the retail installation lacks are copied: everything else on
 * the driver's disk is byte for byte the retail one. The driver's `?:`, its
 * own disk, becomes disk 1: every disk is in the one directory, so any number
 * finds it.
 */
async function addDriver() {
  const oem = (await readFile(join(DISPLAY, 'OEMSETUP.INF'), 'latin1')).replace(/\r\n/g, '\n');
  const section = (name) => {
    const match = new RegExp(
      `^\\[${name.replace('.', '\\.')}\\][^\\n]*\\n((?:(?!\\[)[^\\n]*\\n)*)`,
      'im'
    ).exec(oem);

    if (!match) {
      throw new Error(`no [${name}] in the driver's OEMSETUP.INF`);
    }

    return match[1].trim();
  };
  const line = section('display')
    .split('\n')
    .find((entry) => /^\s*\S+/.exec(entry)?.[0].trim() === PROFILE);

  if (!line) {
    throw new Error(`no ${PROFILE} in the driver's [display]`);
  }

  /* driver, description, resolution, 286 grabber, logo code, VDD, 386
   * grabber, ega.sys, logo data, work section -- split at the commas outside
   * quotes, for the resolution is "100,96,96". */
  const fields = [''];
  let quoted = false;

  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
    }

    if (character === ',' && !quoted) {
      fields.push('');
    } else {
      fields[fields.length - 1] += character;
    }
  }

  const trimmed = fields.map((field) => field.trim());
  const named = [trimmed[9], trimmed[6].replace(/^\?:/, '')].filter(Boolean);
  const files = [trimmed[0].split('=')[1].trim(), trimmed[5], trimmed[6]].map((file) =>
    file.replace(/^\?:/, '').toUpperCase()
  );

  for (const file of files) {
    await copyFile(join(DISPLAY, file), join(STAGE, file));
  }

  const setup = join(STAGE, 'SETUP.INF');
  let inf = (await readFile(setup, 'latin1')).replace(/\r\n/g, '\n');

  inf = inf.replace(/^\[display\][^\n]*\n/im, (head) => `${head}${line.replace(/\?:/g, '1:')}\n`);
  inf += named.map((name) => `\n[${name}]\n${section(name).replace(/\?:/g, '1:')}\n`).join('');

  await writeFile(setup, inf.replace(/\n/g, '\r\n'), 'latin1');
  log(`  ${PROFILE} from the driver's OEMSETUP.INF: ${files.join(', ')}`);
}

async function install() {
  // Setup is a DOS program from 1992; it wants CRLF.
  await writeFile(join(STAGE, 'ORACLE.SHH'), `${ANSWERS.join('\r\n')}\r\n`);

  const config = join(BUILD, 'install-windows.conf');

  await writeFile(
    config,
    [
      '[dosbox]',
      `machine=${MACHINE}`,
      'memsize=16',
      '[cpu]',
      'core=auto',
      'cycles=max',
      '[sdl]',
      'autolock=false',
      '[autoexec]',
      `mount c ${DRIVE}`,
      `mount a ${STAGE} -t floppy`,
      'a:',
      'setup /h:a:\\ORACLE.SHH',
      'exit',
      '',
    ].join('\n')
  );

  /* Setup draws a full-screen installer either way, so it renders into
   * nothing rather than onto a display nobody is watching. */
  await run('dosbox', ['-conf', config, '-exit'], {
    env: { SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy' },
  });
}

/**
 * Checks the installation rather than trusting the exit code: DOSBox exits
 * zero whatever the program inside it did, so the only real evidence is the
 * files on the drive.
 */
async function verify() {
  const files = await walk(DRIVE);
  const upper = new Set(files.map((file) => file.toUpperCase()));
  const missing = REQUIRED.filter((path) => !upper.has(path));

  if (missing.length) {
    throw new Error(`Setup did not finish; these are missing:\n  ${missing.join('\n  ')}`);
  }

  // A file Setup failed to expand would leave the compressed name behind.
  const leftover = files.find((file) => /\.[a-z0-9]{2}_$/i.test(file));

  if (leftover) {
    throw new Error(`${leftover} was never expanded`);
  }

  return files.length;
}

async function main() {
  const force = process.argv.includes('--force');

  if (!force && (await exists(join(DRIVE, REQUIRED[0])))) {
    log(`Windows is installed in ${DRIVE}; --force reinstalls it, and Dogz with it.`);
    return;
  }

  log('Staging the Windows disks...');
  await stageDisks();
  await addDriver();

  await rm(DRIVE, { recursive: true, force: true });
  await mkdir(DRIVE, { recursive: true });

  log('Running Windows Setup...');
  await install();

  const count = await verify();
  await snapshot('windows');
  log(`  ${count} files in ${DRIVE}`);
  log('\nNext: node scripts/oracle/install-dogz.mjs');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`install-windows: ${error.message}`);
    process.exitCode = 1;
  });
}
