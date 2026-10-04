/**
 * A copy of a Windows 3.1 NE module that Ghidra's NE loader will read.
 *
 * Ghidra reads the NE header's table offsets as signed 16-bit numbers, so a
 * module whose tables lie more than 32K past its header is refused ("No load
 * spec found") and taken for a DOS program, of which only the stub is
 * imported. CATZDLL.DLL's resident name table alone is 44K, after a 5K
 * resource table. The copy drops the resource table and puts the small
 * tables -- module references, imported names, entries -- before the
 * resident names, so every offset is under 32K. The segments are untouched.
 */

import { readFile, writeFile } from 'node:fs/promises';

/** Writes `file` to `copy`, rearranged so Ghidra reads it, if it must be; whether it was. */
export async function neForGhidra(file, copy) {
  const bytes = await readFile(file);
  const ne = bytes.readUInt32LE(0x3c);

  if (bytes.toString('latin1', ne, ne + 2) !== 'NE') {
    return false;
  }

  const word = (at) => bytes.readUInt16LE(ne + at);
  const put = (at, value) => bytes.writeUInt16LE(value, ne + at);
  const [entry, entryLength] = [word(4), word(6)];
  const [resources, resident, modules, imported] = [0x24, 0x26, 0x28, 0x2a].map(word);

  if (entry < 0x8000 && resident < 0x8000) {
    return false;
  }

  if (!(resources <= resident && resident <= modules && modules <= imported && imported <= entry)) {
    throw new Error(`${file}'s NE tables are not in the usual order`);
  }

  const parts = [
    ['modules', bytes.subarray(ne + modules, ne + entry)],
    ['entry', bytes.subarray(ne + entry, ne + entry + entryLength)],
    ['resident', bytes.subarray(ne + resident, ne + modules)],
  ].map(([name, part]) => [name, Buffer.from(part)]);

  const placed = {};
  let at = resources;

  for (const [name, part] of parts) {
    placed[name] = at;
    part.copy(bytes, ne + at);
    at += part.length;
  }

  if (Math.max(...Object.values(placed)) >= 0x8000) {
    throw new Error(`${file}'s NE tables do not fit in 32K however laid out`);
  }

  put(0x28, placed.modules);
  put(0x2a, placed.modules + imported - modules);
  put(4, placed.entry);
  put(0x26, placed.resident);
  put(0x24, placed.resident); // no resources

  await writeFile(copy, bytes);
  return true;
}
