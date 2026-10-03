#!/usr/bin/env node
/**
 * Makes a variant of the oracle's drive to measure something on: the same
 * installation with one thing changed, in oracle/build/variants/<name>/. The
 * installation itself is never touched, so it stays the one
 * `installation.json` records.
 *
 *   node scripts/oracle/variant.mjs vga16 --display vga
 *   node scripts/oracle/variant.mjs terrier16 --display vga --breed terrier
 *
 * --display vga   Windows' own 16-colour VGA driver in place of the
 *                 256-colour one, as Windows Setup's display change would
 *                 set it: `display.drv=vga.drv` in SYSTEM.INI, the retail
 *                 VGA.DRV in the system directory. Everything else the two
 *                 share -- the VGA fonts, the grabber -- is already there.
 * --breed <name>  The adopted dog made another breed: `Your Pet` in DOGZ.INI
 *                 names DATA\<name>.LNZ (bigdog, bulldog, chiua, scotty,
 *                 terrier), and the saved dog is removed, so Dogz starts
 *                 with that breed rather than the one it saved.
 * --hold <frame>  The dog held still in one frame: every script in
 *                 ALL_PTZ.SCP rewritten to show that frame for ever, its
 *                 eyelids open (`0x8ae0 0`) and its head straight (cue 7:
 *                 nothing looked at), so whatever the dog plays first it
 *                 stays in. With --turn <n>, turned n 256ths first (`0x8ae5`).
 *
 * Then: node scripts/oracle/shoot.mjs <name>
 */

import { copyFile, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseNe } from '../../src/formats/ne.ts';
import { OP, parseScripts, readOpcodes, writeScripts } from '../../src/formats/script.ts';
import { DISPLAY } from './fetch.mjs';
import { BUILD, DRIVE, exists, log } from './lib.mjs';

export const VARIANTS = join(BUILD, 'variants');

/** The files Dogz keeps its dog in between runs. */
const SAVED = ['SAVED.LNZ', 'BRAIN.BAK', 'TRICKS.TDT'];

async function edit(path, change) {
  const text = await readFile(path, 'latin1');
  const changed = change(text);

  if (changed === text) {
    throw new Error(`nothing to change in ${path}`);
  }

  await writeFile(path, changed, 'latin1');
}

async function main() {
  const [name, ...args] = process.argv.slice(2);
  const option = (flag) => {
    const at = args.indexOf(flag);
    return at === -1 ? null : args[at + 1];
  };

  if (!name || name.startsWith('-')) {
    throw new Error('name the variant: variant.mjs <name> [--display vga] [--breed <name>]');
  }

  if (!(await exists(join(DRIVE, 'DOGZ.DOG', 'DOGZ.INI')))) {
    throw new Error('the oracle is not built; run `pnpm oracle` first');
  }

  const drive = join(VARIANTS, name);
  await rm(drive, { recursive: true, force: true });
  await cp(DRIVE, drive, { recursive: true });

  const display = option('--display');

  if (display === 'vga') {
    await copyFile(join(DISPLAY, 'VGA.DRV'), join(drive, 'WINDOWS', 'SYSTEM', 'VGA.DRV'));
    await edit(join(drive, 'WINDOWS', 'SYSTEM.INI'), (text) =>
      text
        .replace(/^display\.drv=svga256\.drv/im, 'display.drv=vga.drv')
        .replace(/^display\.drv=ET4000 .*$/im, 'display.drv=VGA')
    );
    log('  the 16-colour VGA driver');
  } else if (display) {
    throw new Error(`no display ${display}; the one there is is vga`);
  }

  const breed = option('--breed');

  if (breed) {
    if (!(await exists(join(drive, 'DOGZ.DOG', 'DATA', `${breed.toUpperCase()}.LNZ`)))) {
      throw new Error(`no breed ${breed}: no DATA\\${breed.toUpperCase()}.LNZ`);
    }

    await edit(join(drive, 'DOGZ.DOG', 'DOGZ.INI'), (text) =>
      text.replace(/^Your Pet=.*$/m, `Your Pet=.\\data\\${breed.toLowerCase()}.lnz`)
    );

    for (const file of SAVED) {
      await rm(join(drive, 'DOGZ.DOG', file), { force: true });
    }

    log(`  the dog a ${breed}`);
  }

  const hold = option('--hold');

  if (hold !== null) {
    const frame = Number(hold);
    const turn = Number(option('--turn') ?? 0);
    const engine = parseNe(new Uint8Array(await readFile(join(drive, 'WINDOWS', 'DOGZDLL.DLL'))));
    const path = join(drive, 'DOGZ.DOG', 'DATA', 'ALL_PTZ.SCP');
    const original = new Uint8Array(await readFile(path));
    const scripts = parseScripts(original, readOpcodes(engine));
    const held = [
      { op: OP.begin, operands: [] },
      { op: 0x8ae0, operands: [0] },
      /* Cue 7: nothing looked at, and nothing to be, so the head stays straight. */
      { op: 0x8ae3, operands: [7] },
      ...(turn ? [{ op: 0x8ae5, operands: [1, turn, frame] }] : []),
      { op: OP.repeat, operands: [999] },
      { frame },
      { op: OP.endRepeat, operands: [] },
      { op: OP.end, operands: [] },
    ];

    /* Every script, whatever the dog plays first. */
    for (const script of scripts) {
      script.variants = script.variants.map(() => held);
    }

    await writeFile(path, writeScripts(original, scripts));
    log(`  held in frame ${frame}${turn ? `, turned ${turn}` : ''}`);
  }

  log(`The variant is in ${drive}.`);
  log(`Next: node scripts/oracle/shoot.mjs ${name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`variant: ${error.message}`);
    process.exitCode = 1;
  });
}
