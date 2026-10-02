#!/usr/bin/env node
/**
 * Fetches everything the oracle is built from, and checks every byte of it
 * against `oracle/manifest.json`.
 *
 * Three inputs, each from where it is published:
 *
 * - Windows 3.1, the retail 3.5-inch set, from WinWorld's library. Getting a
 *   file there takes three hops -- the product page lists releases, a release
 *   page lists mirrors, and a mirror redirects to the archive -- so this walks
 *   that chain rather than hardcoding a URL that would rot. The edition is
 *   matched by its label, and the archive and each floppy image inside it are
 *   checked against their pinned SHA-256.
 * - Microsoft's Super VGA 256-colour display driver, from archive.org. Dogz
 *   wants 256 colours; every 256-colour driver on the retail disks is for a
 *   card DOSBox does not emulate, and this one drives the ET4000 it does.
 * - The two Dogz floppies, from archive.org's copy of the adoption kit.
 *
 * Everything lands in oracle/.cache/ and none of it is committed: this is
 * thirty-year-old software still under its owners' copyright, and a fetch the
 * user runs is a different thing from a redistribution.
 *
 *   node scripts/oracle/fetch.mjs
 *   node scripts/oracle/fetch.mjs --pin     # record new hashes instead of checking them
 *
 * `--pin` is for changing an input on purpose: it writes what was fetched into
 * the manifest, and the diff is the record of the change.
 *
 * Needs `mtools`. 7-Zip comes from the `7zip-bin` package.
 */

import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import sevenZip from '7zip-bin';

import {
  CACHE,
  fetchPinned,
  formatSize,
  log,
  readManifest,
  run,
  sha256,
  unpackFloppy,
  writeManifest,
} from './lib.mjs';

export const WINDOWS = join(CACHE, 'windows');
export const WINDOWS_FLOPPIES = join(WINDOWS, 'floppies');
export const DISPLAY = join(CACHE, 'svga256');
export const DOGZ = join(CACHE, 'dogz');

/** Every disk of the Dogz kit, unpacked into one directory; see install-dogz.mjs. */
export const DOGZ_STAGE = join(DOGZ, 'stage');

const SITE = 'https://winworldpc.com';

/** WinWorld serves the library to browsers; say so rather than pretending. */
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
};

async function fetchText(url, referer) {
  const response = await fetch(url, { headers: referer ? { ...HEADERS, referer } : HEADERS });

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.text();
}

/** The download page of the edition whose label the manifest names. */
async function findEdition(product, label) {
  const page = await fetchText(product);
  const pattern = /href="(\/download\/[0-9a-f-]+)"[^>]*>([\s\S]*?)<\/a>/g;

  for (const match of page.matchAll(pattern)) {
    const text = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text === label) {
      return `${SITE}${match[1]}`;
    }
  }

  throw new Error(`${product} no longer offers "${label}"`);
}

/**
 * The URL a working mirror serves the edition from. The release page offers
 * the same file from several; any will do, so this takes the first that
 * answers with a file rather than a page.
 */
async function findMirror(release) {
  const page = await fetchText(release);
  const mirrors = [...page.matchAll(/href="(\/download\/[0-9a-f-]+\/from\/[0-9a-f-]+)"/g)].map(
    (match) => `${SITE}${match[1]}`
  );
  const failures = [];

  for (const mirror of mirrors) {
    const response = await fetch(mirror, {
      headers: { ...HEADERS, referer: release },
      redirect: 'follow',
    });
    await response.body?.cancel();

    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
      return response.url;
    }

    failures.push(`${mirror}: HTTP ${response.status}`);
  }

  throw new Error(`${release}: no mirror served a file\n  ${failures.join('\n  ')}`);
}

function extract(archive, into) {
  return run(sevenZip.path7za, ['x', '-y', `-o${into}`, archive]);
}

async function fetchWindows(manifest, pin) {
  const { windows } = manifest;
  const archive = join(WINDOWS, 'distribution.7z');
  const cached = await readFile(archive).catch(() => null);
  let data;

  log(`Windows: ${windows.edition}`);

  if (cached && sha256(cached) === windows.archive.sha256) {
    log(`  cached ${archive.slice(CACHE.length - 'oracle/.cache'.length)}`);
    data = cached;
  } else {
    const release = await findEdition(windows.product, windows.edition);
    const mirror = await findMirror(release);
    data = await fetchPinned(mirror, archive, pin ? null : windows.archive.sha256, {
      headers: { ...HEADERS, referer: release },
    });
  }

  if (pin) {
    windows.archive = { sha256: sha256(data), bytes: data.length };
  }

  await rm(WINDOWS_FLOPPIES, { recursive: true, force: true });
  await extract(archive, WINDOWS_FLOPPIES);

  const images = [];

  for (const name of (await readdir(WINDOWS_FLOPPIES, { recursive: true })).sort()) {
    if (/\.(img|ima|dsk)$/i.test(name)) {
      images.push({ path: name, sha256: sha256(await readFile(join(WINDOWS_FLOPPIES, name))) });
    }
  }

  if (pin) {
    windows.images = images;
  } else if (JSON.stringify(images) !== JSON.stringify(windows.images)) {
    throw new Error('the floppy images in the Windows archive are not the ones the manifest pins');
  }

  log(`  ${images.length} floppy images, ${formatSize(data.length)}`);
}

async function fetchDisplay(manifest, pin) {
  const { display } = manifest;
  const archive = join(DISPLAY, 'svga.exe');

  log('Display driver: SVGA256');
  const data = await fetchPinned(display.url, archive, pin ? null : display.sha256);

  if (pin) {
    Object.assign(display, { sha256: sha256(data), bytes: data.length });
  }

  // A ZIP behind a DOS stub.
  await extract(archive, DISPLAY);

  for (const name of ['OEMSETUP.INF', 'SVGA256.DRV']) {
    if (!(await stat(join(DISPLAY, name)).catch(() => null))) {
      throw new Error(`no ${name} in ${archive}`);
    }
  }
}

async function fetchDogz(manifest, pin) {
  const { dogz } = manifest;

  log('Dogz: the adoption kit');
  await rm(DOGZ_STAGE, { recursive: true, force: true });

  for (const [index, disk] of dogz.disks.entries()) {
    const image = join(DOGZ, `disk${index + 1}.img`);
    const data = await fetchPinned(disk.url, image, pin ? null : disk.sha256);

    if (pin) {
      Object.assign(disk, { sha256: sha256(data), bytes: data.length });
    }

    await unpackFloppy(image, DOGZ_STAGE);
  }

  const files = await readdir(DOGZ_STAGE);
  log(`  ${files.length} files from ${dogz.disks.length} disks`);
}

async function main() {
  const pin = process.argv.includes('--pin');
  const manifest = await readManifest();

  await fetchWindows(manifest, pin);
  await fetchDisplay(manifest, pin);
  await fetchDogz(manifest, pin);

  if (pin) {
    await writeManifest(manifest);
    log('\nPinned what was fetched in oracle/manifest.json.');
  } else {
    log('\nEverything matches oracle/manifest.json.');
  }

  log('Next: node scripts/oracle/install-windows.mjs');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`fetch: ${error.message}`);
    process.exitCode = 1;
  });
}
