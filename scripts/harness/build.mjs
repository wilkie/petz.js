#!/usr/bin/env node
/**
 * Builds the harness's drivers: small Win16 programs, in harness/, that load
 * CATZDLL.DLL and call its functions on cases of their own, writing what they
 * answer, for test/harness/ to hold the reimplementation to. Compiled with
 * Open Watcom, the compiler winbox.js's oracle fetches: `$WATCOM`, or
 * winbox.js's beside this repository (../winbox.js/oracle/.cache/watcom).
 *
 *   node scripts/harness/build.mjs
 *
 * The programs go to oracle/build/harness/, each as <NAME>.EXE.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { BUILD, log, ROOT } from '../oracle/lib.mjs';

export const HARNESS = join(BUILD, 'harness');
const SOURCES = join(ROOT, 'harness');
const WATCOM = process.env.WATCOM ?? join(ROOT, '..', 'winbox.js', 'oracle', '.cache', 'watcom');

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd: HARNESS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WATCOM,
        PATH: `${join(WATCOM, 'binl64')}:${process.env.PATH ?? ''}`,
        /* The 16-bit compiler finds its headers through INCLUDE. */
        INCLUDE: [join(WATCOM, 'h'), join(WATCOM, 'h', 'win'), SOURCES].join(':'),
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) =>
      code === 0 ? done(output) : fail(new Error(`${command} exited ${code}: ${output.trim()}`))
    );
  });
}

async function main() {
  if (!existsSync(join(WATCOM, 'binl64', 'wcc'))) {
    throw new Error(
      `no Open Watcom at ${WATCOM}: set WATCOM, or fetch winbox.js's (pnpm oracle:toolchain there)`
    );
  }

  await mkdir(HARNESS, { recursive: true });

  for (const source of (await readdir(SOURCES)).filter((file) => file.endsWith('.c'))) {
    const name = source.replace(/\.c$/, '');
    const object = join(HARNESS, `${name}.o`);
    const executable = join(HARNESS, `${name.toUpperCase()}.EXE`);

    /* Win16, the large model -- far pointers by default -- and the windowed prologue. */
    await run('wcc', [
      '-bt=windows',
      '-ml',
      '-zW',
      '-q',
      '-w4',
      `-fo=${object}`,
      join(SOURCES, source),
    ]);
    await run('wlink', [
      'system',
      'windows',
      'option',
      'quiet',
      'name',
      executable,
      'file',
      object,
    ]);
    await rm(object, { force: true });
    log(`  ${executable}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`harness: ${error.message}`);
    process.exitCode = 1;
  });
}
