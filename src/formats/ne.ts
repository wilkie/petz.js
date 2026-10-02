/**
 * Windows' New Executable format, the 16-bit programs and libraries Dogz is
 * made of: enough of it to find a module's segments, its exports by ordinal
 * and name, its imports, and the relocations that say where in its code each
 * import and each far call goes. See kb/formats/ne.md.
 *
 * Self-contained, with no imports, so the reverse-engineering scripts run it
 * under Node as it is.
 */

export interface Segment {
  /** Numbered from 1, as Windows numbers them. */
  number: number;

  /** Where the segment's bytes start in the file, and how many there are. */
  offset: number;
  length: number;
  flags: number;

  /** A data segment, rather than code. */
  data: boolean;
}

/** An exported entry point. */
export interface Entry {
  ordinal: number;
  segment: number;
  offset: number;
  name: string | null;
}

/** Where a relocation points. */
export type Target =
  | { kind: 'internal'; segment: number; offset: number }
  | { kind: 'entry'; ordinal: number }
  | { kind: 'ordinal'; module: string; ordinal: number }
  | { kind: 'name'; module: string; name: string }
  | { kind: 'fixup'; type: number };

/** One place in a segment that the loader patches. */
export interface Relocation {
  /** The patched bytes' offset in the segment. */
  offset: number;

  /** What is patched in: 2 a selector, 3 a far pointer, 5 an offset, and others. */
  source: number;
  target: Target;
}

/** A resource: its type and id, each a number or a name, and its bytes. */
export interface Resource {
  type: number | string;
  id: number | string;
  data: Uint8Array;
}

export interface NeModule {
  name: string;
  description: string;
  segments: Segment[];
  entries: Entry[];

  /** The modules imported from, in the order their numbers refer to. */
  imports: string[];
  data: Uint8Array;

  /** A segment's bytes. */
  segmentBytes(number: number): Uint8Array;

  /** A segment's relocations, each chained one followed to every place it patches. */
  relocations(number: number): Relocation[];

  /** Every resource, in the order of the resource table. */
  resources(): Resource[];
}

export function parseNe(data: Uint8Array): NeModule {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const word = (at: number) => view.getUint16(at, true);

  if (word(0) !== 0x5a4d) {
    throw new Error('not an MZ executable');
  }

  const base = view.getUint32(0x3c, true);

  if (word(base) !== 0x454e) {
    throw new Error('not an NE executable');
  }

  const header = (at: number) => word(base + at);
  const shift = header(0x32);
  const pascal = (at: number) =>
    new TextDecoder('latin1').decode(data.subarray(at + 1, at + 1 + data[at]));

  const segments: Segment[] = Array.from({ length: header(0x1c) }, (_, index) => {
    const at = base + header(0x22) + 8 * index;
    const offset = word(at) << shift;
    const flags = word(at + 4);

    return {
      number: index + 1,
      offset,
      length: word(at + 2) || (offset ? 0x10000 : 0),
      flags,
      data: (flags & 1) === 1,
    };
  });

  const imports = Array.from({ length: header(0x1e) }, (_, index) =>
    pascal(base + header(0x2a) + word(base + header(0x28) + 2 * index))
  );

  /* The name tables: a length-prefixed name and an ordinal, until a zero
   * length. The first of each names the module or describes it. */
  const names = new Map<number, string>();
  const readNames = (at: number) => {
    const found: string[] = [];

    while (data[at]) {
      const name = pascal(at);
      at += 1 + data[at];
      const ordinal = word(at);
      at += 2;

      if (found.length) {
        names.set(ordinal, name);
      }

      found.push(name);
    }

    return found[0] ?? '';
  };

  const name = readNames(base + header(0x26));
  const description = header(0x20) ? readNames(view.getUint32(base + 0x2c, true)) : '';

  const entries: Entry[] = [];
  let at = base + header(0x04);
  const end = at + header(0x06);
  let ordinal = 1;

  while (at < end) {
    const count = data[at];
    const segment = data[at + 1];
    at += 2;

    if (count === 0) {
      break;
    }

    for (let index = 0; index < count; index++, ordinal++) {
      if (segment === 0) {
        continue;
      }

      if (segment === 0xff) {
        entries.push({ ordinal, segment: data[at + 3], offset: word(at + 4), name: null });
        at += 6;
      } else {
        entries.push({ ordinal, segment, offset: word(at + 1), name: null });
        at += 3;
      }
    }
  }

  for (const entry of entries) {
    entry.name = names.get(entry.ordinal) ?? null;
  }

  const segmentBytes = (number: number) => {
    const segment = segments[number - 1];
    return data.subarray(segment.offset, segment.offset + segment.length);
  };

  const relocations = (number: number): Relocation[] => {
    const segment = segments[number - 1];

    if (!(segment.flags & 0x100)) {
      return [];
    }

    const bytes = segmentBytes(number);
    const bytesView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = segment.offset + segment.length;
    const count = word(at);
    at += 2;
    const found: Relocation[] = [];

    for (let index = 0; index < count; index++, at += 8) {
      const source = data[at];
      const flags = data[at + 1];
      const offset = word(at + 2);
      const a = word(at + 4);
      const b = word(at + 6);
      let target: Target;

      switch (flags & 3) {
        case 0:
          /* A movable segment's entries are reached through the entry table. */
          target =
            (a & 0xff) === 0xff
              ? { kind: 'entry', ordinal: b }
              : { kind: 'internal', segment: a & 0xff, offset: b };
          break;
        case 1:
          target = { kind: 'ordinal', module: imports[a - 1], ordinal: b };
          break;
        case 2:
          target = { kind: 'name', module: imports[a - 1], name: pascal(base + header(0x2a) + b) };
          break;
        default:
          target = { kind: 'fixup', type: a };
      }

      /* An additive relocation patches one place; any other is the head of a
       * chain through the places it patches, ended by 0xffff. */
      const seen = new Set<number>();
      let place = offset;

      while (place < bytes.length && !seen.has(place)) {
        seen.add(place);
        found.push({ offset: place, source, target });

        if (flags & 4) {
          break;
        }

        place = bytesView.getUint16(place, true);
      }
    }

    return found;
  };

  /* The resource table: an alignment shift, then for each type its id, a
   * count and that many resources; an id with its high bit set is a number,
   * any other the offset of a name in the table. */
  const resources = (): Resource[] => {
    const table = base + header(0x24);

    if (header(0x24) === header(0x26)) {
      return [];
    }

    const alignment = word(table);
    const named = (value: number) => (value & 0x8000 ? value & 0x7fff : pascal(table + value));
    const found: Resource[] = [];
    let at = table + 2;

    for (let type = word(at); type !== 0; type = word(at)) {
      const count = word(at + 2);
      at += 8;

      for (let index = 0; index < count; index++, at += 12) {
        const offset = word(at) << alignment;
        const length = word(at + 2) << alignment;
        found.push({
          type: named(type),
          id: named(word(at + 6)),
          data: data.subarray(offset, offset + length),
        });
      }
    }

    return found;
  };

  return {
    name,
    description,
    segments,
    entries,
    imports,
    data,
    segmentBytes,
    relocations,
    resources,
  };
}

/** A module's automatic data segment, whose number its NE header gives at 0x0e. */
export function dataSegment(module: NeModule) {
  const view = new DataView(module.data.buffer, module.data.byteOffset, module.data.byteLength);
  const header = view.getUint32(0x3c, true);
  return module.segmentBytes(view.getUint16(header + 0x0e, true));
}
