#!/usr/bin/env node
/**
 * Decompiles functions of one of the oracle's modules with Ghidra, headless,
 * and prints them as C.
 *
 *   node scripts/re/decompile.mjs DOGZDLL.DLL 8:347d
 *   node scripts/re/decompile.mjs DOGZDLL.DLL XDrawPort::InitCircleLookup 8:002a
 *
 * A function is given as segment:offset (the segment in decimal, the offset
 * in hexadecimal, as the knowledge base writes them) or by name. The first
 * time a module is asked for, Ghidra imports and analyses it into a project
 * in oracle/build/ghidra/, which takes a minute; after that each run reuses
 * the analysis. The C is Ghidra's reading of 16-bit segmented code: for
 * understanding, never to be copied into the project or the knowledge base.
 *
 * Needs the tools: node scripts/re/fetch-tools.mjs.
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BUILD, DRIVE, exists, log, ROOT } from '../oracle/lib.mjs';
import { toolPaths } from './fetch-tools.mjs';

const PROJECTS = join(BUILD, 'ghidra');

function find(at, name) {
  for (const entry of readdirSync(at)) {
    const path = join(at, entry);

    if (statSync(path).isDirectory()) {
      const found = find(path, name);

      if (found) {
        return found;
      }
    } else if (entry.toUpperCase() === name.toUpperCase()) {
      return path;
    }
  }

  return null;
}

function headless(args, javaHome, headlessPath) {
  return new Promise((done, fail) => {
    const child = spawn(headlessPath, args, {
      env: { ...process.env, JAVA_HOME: javaHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(output) : fail(new Error(`Ghidra exited ${code}:\n${output.slice(-2000)}`))
    );
  });
}

async function main() {
  const [module, ...functions] = process.argv.slice(2);

  if (!module || !functions.length) {
    throw new Error('decompile.mjs <module> <segment:offset | name>...');
  }

  const file = find(DRIVE, module);

  if (!file) {
    throw new Error(`no ${module} on the oracle's drive`);
  }

  const { javaHome, headless: headlessPath } = await toolPaths();
  const project = module.toUpperCase().replace(/\W/g, '_');
  const scripts = ['-scriptPath', join(ROOT, 'scripts', 're', 'ghidra')];
  const imported = await exists(join(PROJECTS, `${project}.rep`));

  if (!imported) {
    log(`Importing and analysing ${module}, once...`);
  }

  const args = imported
    ? [PROJECTS, project, '-process', module, '-noanalysis', '-readOnly']
    : [PROJECTS, project, '-import', file];

  const output = await headless(
    [...args, ...scripts, '-postScript', 'Decompile.java', ...functions],
    javaHome,
    headlessPath
  );

  /* Ghidra prints a script's line behind its own log prefix, and the rest of
   * a many-line one bare, up to its next log line. */
  let capturing = false;

  for (const line of output.split('\n')) {
    const match = /Decompile\.java> (.*?)(?: \(GhidraScript\))?\s*$/.exec(line);

    if (match) {
      capturing = true;
      log(match[1]);
    } else if (/^(INFO|WARN|ERROR|DEBUG) /.test(line)) {
      capturing = false;
    } else if (capturing) {
      log(line.replace(/ \(GhidraScript\)\s*$/, ''));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`decompile: ${error.message}`);
    process.exitCode = 1;
  });
}
