#!/usr/bin/env node
/**
 * Runs the oracle's Dogz on your own display, to play with and watch.
 *
 * It runs on a copy of the installed drive, oracle/build/play/, never on the
 * drive itself: Dogz keeps its dog's state on the drive, and its age moves
 * with the clock, so a single session would leave the installation no longer
 * the one `installation.json` records. The copy is made the first time and
 * kept between runs, so the dog in it lives on; `--fresh` starts it again
 * from the installation.
 *
 *   node scripts/oracle/run.mjs
 *   node scripts/oracle/run.mjs --fresh
 *   node scripts/oracle/run.mjs --windows      # Windows alone, without Dogz
 *
 * Needs `dosbox` and a display (`DISPLAY`, as WSLg and any X desktop set).
 * Sound is on: Dogz barks through DOSBox's Sound Blaster when Windows has a
 * driver for one, which the oracle's does not yet.
 */

import { spawn } from 'node:child_process';
import { cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MACHINE } from './install-windows.mjs';
import { BUILD, DRIVE, exists, log } from './lib.mjs';

const PLAY = join(BUILD, 'play');

async function main() {
  const args = process.argv.slice(2);

  if (!(await exists(join(DRIVE, 'DOGZ.DOG', 'DOGZ.INI')))) {
    throw new Error('the oracle is not built; run `pnpm oracle` first');
  }

  if (!process.env.DISPLAY) {
    throw new Error('no DISPLAY to show DOSBox on');
  }

  if (args.includes('--fresh') || !(await exists(PLAY))) {
    log('Copying the installation to oracle/build/play/...');
    await rm(PLAY, { recursive: true, force: true });
    await cp(DRIVE, PLAY, { recursive: true });
  }

  const program = args.includes('--windows') ? '' : ' C:\\DOGZ.DOG\\DOGZ.EXE';
  const config = join(BUILD, 'run.conf');

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
      // Click into the window to give it the mouse; Ctrl+F10 takes it back.
      'autolock=true',
      '[autoexec]',
      `mount c ${PLAY}`,
      'c:',
      'cd \\WINDOWS',
      `win /s${program}`,
      'exit',
      '',
    ].join('\n')
  );

  const dosbox = spawn('dosbox', ['-conf', config, '-exit'], { stdio: 'inherit' });
  dosbox.on('exit', (code) => (process.exitCode = code ?? 0));
}

main().catch((error) => {
  console.error(`run: ${error.message}`);
  process.exitCode = 1;
});
