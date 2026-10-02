#!/usr/bin/env node
/**
 * Records, or checks, what the oracle's installation holds: every file on the
 * drive, by path, size and SHA-256, in oracle/installation.json.
 *
 * The manifest pins what goes in; this pins what comes out. Together they say
 * whether a clone that ran `pnpm oracle` somewhere else has the installation
 * this repository was built against, file for file. The record is committed;
 * the drive is not.
 *
 * A few files are written from the clock or from a measurement, and differ
 * from one installation to the next however faithfully it was made. They are
 * named in the manifest's `fingerprint.volatile` with the reason, and their
 * hashes are recorded but not held to. Every other difference is reported.
 *
 *   node scripts/oracle/fingerprint.mjs            # record
 *   node scripts/oracle/fingerprint.mjs --check    # compare; exits 1 on a difference
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DRIVE,
  ORACLE,
  STAGES,
  STAGE_NAMES,
  exists,
  log,
  readManifest,
  sha256,
  walk,
} from './lib.mjs';

const RECORD = join(ORACLE, 'installation.json');

/**
 * Every file on the drive, with the first stage that left it as it is: its
 * hashes as each stage left the drive are in oracle/build/stages/.
 */
async function measure() {
  const stages = [];

  for (const stage of STAGE_NAMES) {
    const path = join(STAGES, `${stage}.json`);

    if (!(await exists(path))) {
      throw new Error(
        `no record of the ${stage} stage; build the oracle again with \`pnpm oracle\``
      );
    }

    stages.push([stage, JSON.parse(await readFile(path, 'utf8'))]);
  }

  const files = {};

  for (const path of await walk(DRIVE)) {
    const data = await readFile(join(DRIVE, path));
    const hash = sha256(data);
    const stage = stages.find(([, hashes]) => hashes[path] === hash)?.[0] ?? 'after';

    files[path] = { bytes: data.length, sha256: hash, stage };
  }

  return files;
}

/** The differences between two records, as lines, ignoring volatile files' contents. */
function compare(recorded, measured, volatile) {
  const lines = [];

  for (const path of Object.keys(recorded)) {
    if (!measured[path]) {
      lines.push(`missing  ${path}`);
    } else if (
      measured[path].sha256 !== recorded[path].sha256 &&
      !volatile.some((entry) => entry.path === path)
    ) {
      lines.push(`changed  ${path} (${recorded[path].bytes} -> ${measured[path].bytes} bytes)`);
    }
  }

  for (const path of Object.keys(measured)) {
    if (!recorded[path]) {
      lines.push(`added    ${path}`);
    }
  }

  return lines;
}

async function main() {
  if (!(await exists(DRIVE))) {
    throw new Error('nothing is installed; run `pnpm oracle` first');
  }

  const manifest = await readManifest();
  const volatile = manifest.fingerprint?.volatile ?? [];
  const files = await measure();
  const count = Object.keys(files).length;

  if (process.argv.includes('--check')) {
    const recorded = JSON.parse(await readFile(RECORD, 'utf8')).files;
    const lines = compare(recorded, files, volatile);

    if (lines.length) {
      log(`The installation differs from oracle/installation.json in ${lines.length} places:`);
      lines.forEach((line) => log(`  ${line}`));
      process.exitCode = 1;
      return;
    }

    log(`The installation matches oracle/installation.json: ${count} files.`);
    return;
  }

  await writeFile(
    RECORD,
    `${JSON.stringify(
      {
        description:
          "Every file of the oracle drive after `pnpm oracle`: Windows 3.1, then Dogz installed and registered. A file's stage is the first that left it as it is: windows (Windows Setup), setup (Dogz Setup) or adoption (adopting a puppy). See scripts/oracle/fingerprint.mjs.",
        files,
      },
      null,
      2
    )}\n`
  );

  log(`Recorded ${count} files in oracle/installation.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`fingerprint: ${error.message}`);
    process.exitCode = 1;
  });
}
