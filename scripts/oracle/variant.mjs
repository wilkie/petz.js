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
 * --plain        Nothing drawn at random, and the dog on a plain ground:
 *                 the adopted breed's every ball without fuzz ([Fuzz] 0) or
 *                 speckles ([Speckle Color] -1), the saved dog removed so
 *                 its own colours are drawn, the playpen's paw tile solid
 *                 magenta, and the playpen window 480 square at the right.
 *                 With --keep-fur, the breed's fuzz and speckles stay.
 * --hold <frame>  The dog held still in one frame: every script in
 *                 ALL_PTZ.SCP rewritten to show that frame for ever, its
 *                 eyelids open (`0x8ae0 0`) and its head straight (cue 7:
 *                 nothing looked at), so whatever the dog plays first it
 *                 stays in. With --turn <n>, turned n 256ths first (`0x8ae5`).
 * --game catz    A variant of the Catz demo's drive (install-catz.mjs) in place
 *                 of Dogz's; of the rest, only --hold, which for Catz keeps
 *                 every script's opcodes -- its cues, loops and actions,
 *                 without which no kitten comes out -- and makes every frame
 *                 it shows the one held, `sequence2 a b` becoming
 *                 `sequence2 f f` so that CAT.SCP stays its size: Catz
 *                 refuses a larger one as "Data Corruption". And --hide:
 *                 every script one frame for ever, as Dogz's --hold, so
 *                 that no kitten comes out at all -- the playpen as it is
 *                 without one, for a probe to tell a cat from.
 * --set <section>=<value>  Every line of a section of the adopted breed's
 *                 file given the value, as `--set "Body Extension=100"`,
 *                 or one ball's line, as `--set "256 Ball Color[45]=80"`;
 *                 as many as wanted.
 *
 * Then: node scripts/oracle/shoot.mjs <name>
 */

import { copyFile, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseNe } from '../../src/formats/ne.ts';
import {
  catzArity,
  OP,
  parseScripts,
  readCatzOpcodes,
  readOpcodes,
  SCRIPTS,
  writeScripts,
} from '../../src/formats/script.ts';
import { DISPLAY } from './fetch.mjs';
import { CATZ_DRIVE } from './install-catz.mjs';
import { BUILD, DRIVE, exists, log } from './lib.mjs';

export const VARIANTS = join(BUILD, 'variants');

/** The files Dogz keeps its dog in between runs. */
const SAVED = ['SAVED.LNZ', 'BRAIN.BAK', 'TRICKS.TDT'];

async function edit(path, change, { already = false } = {}) {
  const text = await readFile(path, 'latin1');
  const changed = change(text);

  if (changed === text && !already) {
    throw new Error(`nothing to change in ${path}`);
  }

  await writeFile(path, changed, 'latin1');
}

/** Each line of a section of a breed file, or only its line `only`, given one value, its comment kept. */
function setSection(text, name, value, only) {
  const lines = text.split('\r\n');
  let inside = false;
  let at = 0;

  return lines
    .map((line) => {
      if (line.startsWith('[')) {
        inside = line.startsWith(`[${name}]`);
        at = 0;
        return line;
      }

      if (!inside || !/^\s*-?\d/.test(line)) {
        return line;
      }

      at += 1;
      return only === undefined || at - 1 === only ? line.replace(/^\s*-?\d+/, value) : line;
    })
    .join('\r\n');
}

/** Makes the variant `name` from the installation, changed as `args` say (the command line's options). */
export async function makeVariant(name, args) {
  const option = (flag) => {
    const at = args.indexOf(flag);
    return at === -1 ? null : args[at + 1];
  };

  if (!name || name.startsWith('-')) {
    throw new Error('name the variant: variant.mjs <name> [--display vga] [--breed <name>]');
  }

  const game = option('--game') ?? 'dogz';

  if (game === 'catz') {
    return makeCatzVariant(name, option, args);
  }

  if (game !== 'dogz') {
    throw new Error(`no game ${game}: dogz or catz`);
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

  if (args.includes('--plain')) {
    const ini = await readFile(join(drive, 'DOGZ.DOG', 'DOGZ.INI'), 'latin1');
    const pet = /^Your Pet=\.\\data\\(\w+)\.lnz/im.exec(ini)?.[1] ?? 'bigdog';
    if (!args.includes('--keep-fur')) {
      await edit(join(drive, 'DOGZ.DOG', 'DATA', `${pet.toUpperCase()}.LNZ`), (text) =>
        setSection(setSection(text, 'Fuzz', '0'), 'Speckle Color', '-1')
      );
    }

    for (const file of SAVED) {
      await rm(join(drive, 'DOGZ.DOG', file), { force: true });
    }

    /* The paw tile, 64 by 64 at 4 bits, all its first colour, made magenta. */
    const tile = join(drive, 'DOGZ.DOG', 'PLAYPENZ', '16_PAW.BMP');
    const bmp = await readFile(tile);
    const pixels = bmp.readUInt32LE(10);
    bmp.fill(0, pixels);
    bmp.set([0xff, 0x00, 0xff, 0x00], 54);
    await writeFile(tile, bmp);

    await edit(join(drive, 'DOGZ.DOG', 'DOGZ.INI'), (text) =>
      text.replace(/^Compound Window Location=.*$/m, 'Compound Window Location=160, 0, 640, 480')
    );
    log(
      `  the ${pet}${args.includes('--keep-fur') ? '' : ' without fuzz or speckles'}, on magenta`
    );
  }

  const sets = args.flatMap((arg, at) => (args[at - 1] === '--set' ? [arg] : []));

  if (sets.length) {
    const ini = await readFile(join(drive, 'DOGZ.DOG', 'DOGZ.INI'), 'latin1');
    const pet = /^Your Pet=\.\\data\\(\w+)\.lnz/im.exec(ini)?.[1] ?? 'bigdog';

    for (const set of sets) {
      const [, section, only, value] = /^([^=[]+)(?:\[(\d+)\])?=(-?\d+)$/.exec(set) ?? [];

      if (!section) {
        throw new Error(`--set ${set}: not <section>[<line>]=<number>`);
      }

      await edit(
        join(drive, 'DOGZ.DOG', 'DATA', `${pet.toUpperCase()}.LNZ`),
        (text) => setSection(text, section, value, only === undefined ? undefined : Number(only)),
        /* A value it has already is set all the same. */
        { already: true }
      );
      log(`  the ${pet}'s [${section}]${only === undefined ? '' : ` line ${only}`} ${value}`);
    }
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

/** A variant of the Catz demo's drive: see `--game catz`. */
async function makeCatzVariant(name, option, args) {
  if (!(await exists(join(CATZ_DRIVE, 'CATZ.DOG', 'CATZ.EXE')))) {
    throw new Error('Catz is not installed; run scripts/oracle/install-catz.mjs first');
  }

  const drive = join(VARIANTS, name);
  await rm(drive, { recursive: true, force: true });
  await cp(CATZ_DRIVE, drive, { recursive: true });

  const hold = option('--hold');
  const hide = args.includes('--hide');

  if (hold !== null || hide) {
    const frame = Number(hold ?? 0);
    const engine = parseNe(
      new Uint8Array(await readFile(join(drive, 'WINDOWS', 'SYSTEM', 'CATZDLL.DLL')))
    );
    const arity = catzArity(readCatzOpcodes(engine));
    const path = join(drive, 'CATZ.DOG', 'PTZFILES', 'CAT', 'RESOURCE', 'CAT.SCP');
    const original = new Uint8Array(await readFile(path));
    const scripts = parseScripts(original, arity, SCRIPTS.catz);
    const SEQUENCE = 30031;

    /* Hidden: shown one frame for ever, which brings no kitten out. */
    const still = [
      { op: 30000, operands: [] },
      { op: 30058, operands: [999] },
      { op: SEQUENCE, operands: [frame, frame] },
      { op: 30014, operands: [] },
      { op: 30063, operands: [] },
    ];

    for (const script of scripts) {
      script.variants = script.variants.map((variant) =>
        hide
          ? still
          : variant.map((element) =>
              'frame' in element
                ? { frame }
                : element.op === SEQUENCE
                  ? { op: SEQUENCE, operands: [frame, frame] }
                  : element
            )
      );
    }

    const written = writeScripts(original, scripts, SCRIPTS.catz);

    if (!hide && written.length !== original.length) {
      throw new Error('the held scripts are not the size of the original');
    }

    await writeFile(path, written);
    log(hide ? '  no kitten coming out' : `  every cat's frame ${frame}`);
  }

  log(`The variant is in ${drive}.`);
  log(`Next: node scripts/oracle/shoot.mjs ${name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...args] = process.argv.slice(2);
  makeVariant(name, args).catch((error) => {
    console.error(`variant: ${error.message}`);
    process.exitCode = 1;
  });
}
