#!/usr/bin/env node
/**
 * Fetches the reverse-engineering tools, pinned in oracle/manifest.json
 * under `tools`: Ghidra, whose decompiler reads Dogz's 16-bit code back into
 * something like C, and a Java runtime of the version it needs, so nothing
 * has to be installed on the system. Both land in oracle/.cache/tools/ and
 * are checked against their SHA-256 like every other input.
 *
 *   node scripts/re/fetch-tools.mjs
 *
 * About 780 MB. Then: node scripts/re/decompile.mjs.
 */

import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import sevenZip from '7zip-bin';

import { CACHE, exists, fetchPinned, log, readManifest, run } from '../oracle/lib.mjs';

export const TOOLS = join(CACHE, 'tools');

/** The directory an archive unpacked to: the one entry it made. */
async function only(at) {
  const [entry] = (await readdir(at)).filter((name) => !name.startsWith('.'));
  return join(at, entry);
}

export async function toolPaths() {
  const java = await only(join(TOOLS, 'jdk'));
  const ghidra = await only(join(TOOLS, 'ghidra'));

  return {
    java: join(java, 'bin', 'java'),
    javaHome: java,
    headless: join(ghidra, 'support', 'analyzeHeadless'),
    ghidra,
  };
}

async function main() {
  const { tools } = await readManifest();
  await mkdir(TOOLS, { recursive: true });

  for (const [name, tool] of [
    ['jdk', tools.jdk],
    ['ghidra', tools.ghidra],
  ]) {
    const into = join(TOOLS, name);
    const archive = join(TOOLS, tool.url.split('/').pop());

    log(`${name} ${tool.version}`);
    await fetchPinned(tool.url, archive, tool.sha256);

    if (await exists(into)) {
      log('  unpacked already');
      continue;
    }

    await mkdir(into, { recursive: true });

    if (archive.endsWith('.tar.gz')) {
      await run('tar', ['-xzf', archive, '-C', into]);
    } else {
      await run(sevenZip.path7za, ['x', '-y', `-o${into}`, archive]);
    }

    await rm(archive);
    log(`  unpacked into ${into}`);
  }

  const paths = await toolPaths();
  log(`\n${(await run(paths.java, ['-version'])).split('\n')[0]}`);
  log(`Ghidra in ${paths.ghidra}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`fetch-tools: ${error.message}`);
    process.exitCode = 1;
  });
}
