/**
 * What every oracle script shares: where things live, the manifest that pins
 * every input, and the few ways of running things they all need.
 *
 * The oracle is a real Windows 3.1 with a real, registered Dogz installed on
 * it, built from media fetched from where it is published. None of the media
 * and none of the installation is committed. What is committed is
 * `oracle/manifest.json`, which says where each input comes from and what its
 * bytes hash to, and `oracle/installation.json`, which says what the finished
 * installation holds, file by file. A clone that runs `pnpm oracle` anywhere
 * else either gets exactly the same drive or is told where it differs.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORACLE = join(ROOT, 'oracle');
export const CACHE = join(ORACLE, '.cache');
export const BUILD = join(ORACLE, 'build');
export const SCREENS = join(BUILD, 'screens');
export const MANIFEST = join(ORACLE, 'manifest.json');

/** The installed drive: Windows, then Dogz on it. DOSBox mounts it as C:. */
export const DRIVE = join(BUILD, 'drive-c');

export function log(...args) {
  console.log(...args);
}

export async function exists(path) {
  return (await stat(path).catch(() => null)) !== null;
}

export async function readManifest() {
  return JSON.parse(await readFile(MANIFEST, 'utf8'));
}

/** Writes the manifest back, as Prettier would format it. */
export async function writeManifest(manifest) {
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function sha1(data) {
  return createHash('sha1').update(data).digest('hex');
}

export function formatSize(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/**
 * Runs a command to completion, collecting what it prints. A missing command
 * says which one, since every tool here is a system package someone may not
 * have.
 */
export function run(command, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
      env: { ...process.env, MTOOLS_SKIP_CHECK: '1', ...options.env },
    });

    let output = '';
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.stderr?.on('data', (chunk) => (output += chunk));

    child.on('error', (error) =>
      fail(
        error.code === 'ENOENT'
          ? new Error(`${command} is not installed; the oracle needs it (see oracle/README.md)`)
          : error
      )
    );

    child.on('close', (code) =>
      code === 0 ? done(output) : fail(new Error(`${command} exited ${code}: ${output.trim()}`))
    );
  });
}

/**
 * Fetches a URL into `target` unless a file is already there with the
 * expected SHA-256, and checks what was fetched against it.
 *
 * `expected` may be null, for an input whose hash has not been pinned yet:
 * the file is fetched and its hash returned for the caller to record.
 */
export async function fetchPinned(url, target, expected, options = {}) {
  await mkdir(dirname(target), { recursive: true });

  if (expected && (await exists(target))) {
    const data = await readFile(target);

    if (sha256(data) === expected) {
      log(`  cached ${target.slice(ROOT.length + 1)}`);
      return data;
    }
  }

  log(`  fetching ${url}`);
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const actual = sha256(data);

  if (expected && actual !== expected) {
    throw new Error(
      `${url} has SHA-256 ${actual}, but oracle/manifest.json pins ${expected}.\n` +
        'The source changed; nothing built from it would be the installation the repository describes.'
    );
  }

  await writeFile(target, data);
  return data;
}

/** Every file under `at`, as paths relative to it with forward slashes, sorted. */
export async function walk(at) {
  const found = [];

  async function descend(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await descend(join(directory, entry.name), `${prefix}${entry.name}/`);
      } else {
        found.push(`${prefix}${entry.name}`);
      }
    }
  }

  await descend(at, '');
  return found.sort();
}

/** Copies every file of a floppy image into `into`, keeping timestamps. */
export async function unpackFloppy(image, into) {
  await mkdir(into, { recursive: true });
  // -m keeps the timestamps, -n overwrites without asking.
  await run('mcopy', ['-s', '-m', '-n', '-i', image, '::/*', into]);
}

/**
 * Sets `[boot] shell=` in the drive's `SYSTEM.INI`, answering what it was:
 * the way a Windows program is run as the only thing Windows does, and
 * Windows made to end when it ends.
 */
export async function setShell(shell, drive = DRIVE) {
  const path = join(drive, 'WINDOWS', 'SYSTEM.INI');
  const text = await readFile(path, 'latin1');
  const was = /^shell=(.*)$/im.exec(text)?.[1];

  if (was === undefined) {
    throw new Error(`no shell= line in ${path}`);
  }

  await writeFile(path, text.replace(/^shell=.*$/im, `shell=${shell}`), 'latin1');
  return was.trim();
}

export const pause = (seconds) => new Promise((done) => setTimeout(done, seconds * 1000));

/** Where each stage keeps the hashes of the drive as it left it. */
export const STAGES = join(BUILD, 'stages');

/**
 * The stages of building the oracle, in order. A file belongs to the first
 * stage that left it as it finally is: `fingerprint.mjs` says so for every
 * file, so it is on record which were Windows', which Dogz's Setup put down,
 * and which adopting a puppy wrote.
 */
export const STAGE_NAMES = ['windows', 'setup', 'adoption'];

/** Records the drive's hashes as a stage leaves it. */
export async function snapshot(stage) {
  const files = {};

  for (const path of await walk(DRIVE)) {
    files[path] = sha256(await readFile(join(DRIVE, path)));
  }

  await mkdir(STAGES, { recursive: true });
  await writeFile(join(STAGES, `${stage}.json`), `${JSON.stringify(files, null, 2)}\n`);
}
