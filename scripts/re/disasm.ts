/**
 * Disassembles a function of one of the oracle's 16-bit modules, with its
 * far calls and fixups named: imports by the name the exporting module gives
 * its ordinal, read from that module on the oracle's drive, and calls within
 * the module by its own exports.
 *
 *   node scripts/re/disasm.ts DOGZDLL.DLL XDrawPort::MakeColorRamp
 *   node scripts/re/disasm.ts DOGZDLL.DLL 8:1a71 --bytes 400
 *   node scripts/re/disasm.ts THINK.DLL 2:031a --to 03f5
 *   node scripts/re/disasm.ts DOGZDLL.DLL --exports
 *   node scripts/re/disasm.ts DOGZDLL.DLL --callers XDrawPort::MakeColorRamp
 *
 * A function is named as `Class::Method` or by its exported name, or given
 * as segment:offset in hexadecimal. Without `--to` or `--bytes`, it runs to
 * the next export in its segment, or 512 bytes. Reads the module from the
 * oracle's drive, by its file name anywhere on it. Needs `ndisasm` (NASM).
 *
 * What this prints is for reading; the knowledge base quotes only a few
 * instructions of it where they are the evidence for a claim.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { type NeModule, parseNe, type Target } from '../../src/formats/ne.ts';

const DRIVE = join(process.cwd(), 'oracle', 'build', 'drive-c');

/** Every file on the drive, by its name in upper case. */
function index(at: string, found = new Map<string, string>()) {
  for (const name of readdirSync(at)) {
    const path = join(at, name);

    if (statSync(path).isDirectory()) {
      index(path, found);
    } else if (!found.has(name.toUpperCase())) {
      found.set(name.toUpperCase(), path);
    }
  }

  return found;
}

const FILES = index(DRIVE);

/** The file a module name is in: KERNEL is KRNL386.EXE; the rest, NAME.DLL, .EXE or .DRV. */
function fileFor(module: string) {
  if (module.toUpperCase() === 'KERNEL') {
    return FILES.get('KRNL386.EXE');
  }

  for (const extension of ['.DLL', '.EXE', '.DRV', '']) {
    const path = FILES.get(`${module.toUpperCase()}${extension}`);

    if (path) {
      return path;
    }
  }

  return undefined;
}

const modules = new Map<string, NeModule | null>();

function load(module: string) {
  if (!modules.has(module)) {
    const path = fileFor(module);
    modules.set(module, path ? parseNe(new Uint8Array(readFileSync(path))) : null);
  }

  return modules.get(module)!;
}

/** `@XDrawPort@0MakeColorRamp$qn15BIG...` as `XDrawPort::MakeColorRamp`. */
export function demangle(name: string) {
  const match = /^@(.+?)\$/.exec(name) ?? /^@(.+)$/.exec(name);

  if (!match) {
    return name;
  }

  return match[1]
    .replace(/@0/g, '::')
    .replace(/@/g, '::')
    .replace(/\$bctr/, '(constructor)');
}

function label(module: NeModule, target: Target): string | null {
  switch (target.kind) {
    case 'internal': {
      const entry = module.entries.find(
        (each) => each.segment === target.segment && each.offset === target.offset
      );
      const where = `${target.segment}:${target.offset.toString(16).padStart(4, '0')}`;
      return entry?.name ? `${where} ${demangle(entry.name)}` : where;
    }
    case 'entry': {
      const entry = module.entries.find((each) => each.ordinal === target.ordinal);
      return entry
        ? `${entry.segment}:${entry.offset.toString(16).padStart(4, '0')} ${demangle(entry.name ?? `#${entry.ordinal}`)}`
        : `entry ${target.ordinal}`;
    }
    case 'ordinal': {
      const exporter = load(target.module);
      const name = exporter?.entries.find((each) => each.ordinal === target.ordinal)?.name;
      return `${target.module}.${name ? demangle(name) : target.ordinal}`;
    }
    case 'name':
      return `${target.module}.${target.name}`;
    case 'fixup':
      /* The loader's patches for the floating-point emulator, on every x87
       * instruction: noise unless asked for. */
      return null;
  }
}

/** Every far call in the module to one of its exports, by the relocations that make them. */
function callers(module: NeModule, name: string) {
  const entry = module.entries.find(
    (each) => each.name && (demangle(each.name) === name || each.name === name)
  );

  if (!entry) {
    throw new Error(`${module.name} exports no ${name}`);
  }

  /* Each caller is named by the export it follows: the function it is in. */
  const within = (segment: number, offset: number) =>
    module.entries
      .filter((each) => each.segment === segment && each.offset <= offset)
      .sort((a, b) => b.offset - a.offset)[0];

  for (const segment of module.segments) {
    if (segment.data) {
      continue;
    }

    for (const relocation of module.relocations(segment.number)) {
      const { target } = relocation;
      const hit =
        (target.kind === 'entry' && target.ordinal === entry.ordinal) ||
        (target.kind === 'internal' &&
          target.segment === entry.segment &&
          target.offset === entry.offset);

      if (hit && relocation.source === 3) {
        report(segment.number, relocation.offset - 1, 'far');
      }
    }
  }

  /* Within its own segment a call needs no relocation: `push cs` and a near
   * call, found in the segment's disassembly. */
  const listing = execFileSync('ndisasm', ['-b16', '-'], {
    input: module.segmentBytes(entry.segment),
    encoding: 'latin1',
    maxBuffer: 1 << 26,
  });
  const near = new RegExp(`^([0-9A-F]{8})\\s+\\S+\\s+call 0x${entry.offset.toString(16)}$`, 'gm');

  for (const match of listing.matchAll(near)) {
    report(entry.segment, parseInt(match[1], 16), 'near');
  }

  function report(segment: number, offset: number, kind: string) {
    const host = within(segment, offset);
    const at = `${segment}:${offset.toString(16).padStart(4, '0')}`;
    console.log(
      `${at.padEnd(8)} ${kind.padEnd(5)} in ${host?.name ? demangle(host.name) : 'an unexported function'}`
    );
  }
}

function main() {
  const [file, where, ...args] = process.argv.slice(2);
  const path = file && FILES.get(file.toUpperCase());

  if (!path) {
    throw new Error(`no ${file} on the oracle's drive; build it with \`pnpm oracle\``);
  }

  const module = parseNe(new Uint8Array(readFileSync(path)));

  if (where === '--exports') {
    for (const entry of module.entries) {
      const at = `${entry.segment}:${entry.offset.toString(16).padStart(4, '0')}`;
      console.log(
        `${String(entry.ordinal).padStart(4)} ${at.padEnd(8)} ${demangle(entry.name ?? '')}`
      );
    }

    return;
  }

  if (where === '--callers') {
    callers(module, args[0]);
    return;
  }

  let segment: number;
  let start: number;
  const address = /^([0-9a-f]+):([0-9a-f]+)$/i.exec(where ?? '');

  if (address) {
    segment = parseInt(address[1], 16);
    start = parseInt(address[2], 16);
  } else {
    const entry = module.entries.find(
      (each) => each.name && (demangle(each.name) === where || each.name === where)
    );

    if (!entry) {
      throw new Error(`${module.name} exports no ${where}; --exports lists what it does`);
    }

    segment = entry.segment;
    start = entry.offset;
  }

  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at === -1 ? null : args[at + 1];
  };
  const bytes = module.segmentBytes(segment);
  const next = module.entries
    .filter((entry) => entry.segment === segment && entry.offset > start)
    .reduce((least, entry) => Math.min(least, entry.offset), Math.min(bytes.length, start + 512));
  const end = option('--to')
    ? parseInt(option('--to')!, 16)
    : option('--bytes')
      ? start + Number(option('--bytes'))
      : next;

  const relocations = new Map(module.relocations(segment).map((each) => [each.offset, each]));
  const entries = new Map(
    module.entries.filter((each) => each.segment === segment).map((each) => [each.offset, each])
  );

  const listing = execFileSync('ndisasm', ['-b16', '-o', String(start), '-'], {
    input: bytes.subarray(start, end),
    encoding: 'latin1',
    maxBuffer: 1 << 26,
  });

  for (const line of listing.split('\n')) {
    const match = /^([0-9A-F]{8})\s+([0-9A-F]+)\s+(.*)$/.exec(line);

    if (!match) {
      continue;
    }

    const at = parseInt(match[1], 16);
    const length = match[2].length / 2;
    const entry = entries.get(at);

    if (entry) {
      console.log(`\n${demangle(entry.name ?? `#${entry.ordinal}`)}:`);
    }

    const notes: string[] = [];

    for (let byte = at; byte < at + length; byte++) {
      const relocation = relocations.get(byte);

      const note = relocation && label(module, relocation.target);

      if (note) {
        notes.push(note);
      }
    }

    /* A near call within the segment, to one of its exports. */
    const near = /^call 0x([0-9a-f]+)$/.exec(match[3]);
    const callee = near && entries.get(parseInt(near[1], 16));

    if (callee?.name) {
      notes.push(demangle(callee.name));
    }

    const text = `${segment}:${at.toString(16).padStart(4, '0')}  ${match[3]}`;
    console.log(notes.length ? `${text.padEnd(52)} ; ${notes.join(', ')}` : text);
  }
}

try {
  main();
} catch (error) {
  console.error(`disasm: ${(error as Error).message}`);
  process.exitCode = 1;
}
