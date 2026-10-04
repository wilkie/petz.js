/**
 * `ALL_PTZ.SCP`, the animation scripts every breed shares: each takes the
 * dog from one state to another -- standing to sitting, sitting to rolling
 * over -- by showing frames of the animations ([[format:bdt]]) in an order,
 * with the sounds, blinks and moves between. See kb/formats/scp.md.
 *
 * A script has one or more variants, which the game chooses among at
 * random. A variant is a list of elements: a word that is not negative is a
 * frame, numbered over every animation together; a negative one is an
 * opcode, from `0x8ad0` to `0x8b0c`, followed by its operands. How many
 * operands each opcode takes is a table of DOGZDLL.DLL's (`readOpcodes`),
 * and an operand may itself be `0x8b05 lo hi`, a random number between.
 *
 * Catz's scripts (`CAT.SCP` and the rest, one file a creature) are laid out
 * alike but numbered otherwise: their opcodes run from 30000, `startPos`, to
 * 30063, `endPos`, named in CATZDLL.DLL's own table (`readCatzOpcodes`); a
 * random operand is `rand2`, 30028; the file has three words more before its
 * records, and each record two more words. `SCRIPTS` says which.
 */

import { dataSegment, type NeModule } from './ne.ts';

/** The first and last opcodes. */
export const FIRST_OPCODE = 0x8ad0;
export const LAST_OPCODE = 0x8b0c;

/** Some opcodes, as `ScriptSprite::PushScript` and `PopScript` use them. */
export const OP = {
  /** Every variant's first element. */
  begin: 0x8ad0,

  /** `n`: what follows, up to `endRepeat`, n times; 999 is for ever. */
  repeat: 0x8ad1,
  endRepeat: 0x8ad2,

  /** `a b`: frames a to b, counting down where b is less. */
  frames: 0x8ad4,

  /** `f`: frames from f forward to the end of its sequence. */
  framesToEnd: 0x8ad5,

  /** `f`: frames from f back to the start of its sequence. */
  framesToStart: 0x8ad6,

  /** `lo hi`: as an operand, a random number from lo to hi. */
  random: 0x8b05,

  /** `s n ball`: script s, n times, each a variant at random. */
  call: 0x8b09,

  /** Every variant's last element. */
  end: 0x8b0c,
} as const;

/** How a game numbers and lays out its scripts. */
export interface ScriptLayout {
  /** The first opcode: any word from it up is one. */
  firstOpcode: number;

  /** The opcode that, as an operand, is a random number between its two. */
  random: number;

  /** How many words come between the title and the count of records. */
  preamble: number;

  /** How many words of a record, between its states and its flag, are not yet known. */
  unknown: number;
}

export const SCRIPTS = {
  dogz: { firstOpcode: FIRST_OPCODE, random: OP.random, preamble: 0, unknown: 0 },

  /** Catz: 123, 66 and 0 before the records; a record's 67 or 68 and 0 before its flag. */
  catz: { firstOpcode: 30000, random: 30028, preamble: 3, unknown: 2 },
} satisfies Record<string, ScriptLayout>;

/** An operand: a number, or a random one between two. */
export type Operand = number | { random: [number, number] };

export type Element = { frame: number } | { op: number; operands: Operand[] };

export interface Script {
  /** The state the dog is in before, and after; see `readStateNames`. */
  from: number;
  to: number;

  /** The record's word before where its variants start, 0 or 1. Not yet known. */
  flag: number;

  /** In Catz, the record's two words before its flag, 67 or 68 and 0. Not yet known. */
  unknown?: number[];
  variants: Element[][];
}

/**
 * How many operands each opcode takes, from DOGZDLL.DLL's own table: 35
 * bytes an opcode in its data segment, the count first, at
 * `opcode × 0x23 + 0xc22` as the engine computes it with 16-bit words
 * (`ScriptSprite::CountFrames`, seg7:382c).
 */
export function readOpcodes(engine: NeModule): Map<number, number> {
  const data = dataSegment(engine);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const arity = new Map<number, number>();

  for (let op = FIRST_OPCODE; op <= LAST_OPCODE; op++) {
    const at = ((op - 0x10000) * 0x23 + 0xc22) & 0xffff;
    arity.set(op, view.getInt16(at, true));
  }

  return arity;
}

/** One of Catz's opcodes, as CATZDLL.DLL's table describes it. */
export interface CatzOpcode {
  /** Its name, mostly with the count of its operands last: `sequence2`, `soundPlay3`, `startPos`. */
  name: string;

  /** How many operands it takes, as the engine counts them. */
  count: number;

  /**
   * A letter an operand saying what it is: `#` a number, `a` an action, `b`
   * a ball, `c` a cue, `d` a sound, `f` a fudger, `o` a sprite, `s` a frame.
   */
  operands: string;
}

/**
 * Catz's 64 opcodes, from CATZDLL.DLL's table: 44 bytes an opcode from
 * `0x524` in its data segment -- its operands' count, a letter each (ten
 * bytes), and its name (32) -- as `ScriptSprite::PushScriptElements`
 * (seg40:6069) indexes it, `(op - 30000) × 0x2c + 0x524`, by the count.
 * Two disagree with themselves: `setFudgeAimDefaults5` has five but six
 * letters, `f#####`, and `targetSprite4` three and three letters after its
 * `o`, `o###`.
 */
export function readCatzOpcodes(engine: NeModule): Map<number, CatzOpcode> {
  const data = dataSegment(engine);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (at: number, length: number) => {
    const bytes = data.subarray(at, at + length);
    const end = bytes.indexOf(0);
    return new TextDecoder('latin1').decode(end < 0 ? bytes : bytes.subarray(0, end));
  };
  const opcodes = new Map<number, CatzOpcode>();

  for (let n = 0; ; n++) {
    const at = 0x524 + n * 0x2c;
    const count = view.getInt16(at, true);
    const name = text(at + 12, 32);

    if (count < 0 || !/^[a-z]\w+$/.test(name)) {
      return opcodes;
    }

    opcodes.set(SCRIPTS.catz.firstOpcode + n, { name, count, operands: text(at + 2, 10) });
  }
}

/** Catz's operand counts, as `parseScripts` takes them. */
export function catzArity(opcodes: Map<number, CatzOpcode>): Map<number, number> {
  return new Map([...opcodes].map(([op, { count }]) => [op, count]));
}

/**
 * The names of the dog's 59 states, which scripts go from and to: 15 bytes
 * a name in DOGZDLL.DLL's data segment from `0xece`, `NONE`, `AUTO`,
 * `sleeping` and on.
 */
export function readStateNames(engine: NeModule): string[] {
  const data = dataSegment(engine);
  const names: string[] = [];

  for (let at = 0xece; ; at += 15) {
    let name = '';

    for (let byte = at; data[byte] >= 0x20 && data[byte] < 0x7f; byte++) {
      name += String.fromCharCode(data[byte]);
    }

    if (name.length < 2) {
      return names;
    }

    names.push(name);
  }
}

/** The size of a record, in bytes. */
const recordSize = (layout: ScriptLayout) => 12 + 2 * layout.unknown;

/** Reads `ALL_PTZ.SCP`, or Catz's. Throws if any variant does not end where its length says. */
export function parseScripts(
  data: Uint8Array,
  arity: Map<number, number>,
  layout: ScriptLayout = SCRIPTS.dogz
): Script[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = data.indexOf(0) + 1 + 2 * layout.preamble;
  const count = view.getUint16(header, true);
  const table = header + 2;
  const size = recordSize(layout);
  const body = table + size * count + 4;
  const words = view.getUint32(table + size * count, true);

  if (body + 2 * words !== data.byteLength) {
    throw new Error(`the scripts' ${words} words do not reach the end of the file`);
  }

  const word = (at: number) => view.getUint16(body + 2 * at, true);
  const signed = (at: number) => view.getInt16(body + 2 * at, true);

  /** An operand at `at`, and where the next begins. */
  const operand = (at: number): [Operand, number] => {
    const value = word(at);

    if (value === layout.random) {
      return [{ random: [signed(at + 1), signed(at + 2)] }, at + 3];
    }

    return [signed(at), at + 1];
  };

  return Array.from({ length: count }, (_, index) => {
    const record = table + size * index;
    const flag = record + 6 + 2 * layout.unknown;
    let at = view.getUint32(flag + 2, true);
    const variants: Element[][] = [];

    for (let variant = 0; variant < view.getUint16(record, true); variant++) {
      const end = at + word(at);
      const elements: Element[] = [];
      at += 1;

      while (at < end) {
        const value = word(at);

        if (value < layout.firstOpcode) {
          elements.push({ frame: value });
          at += 1;
          continue;
        }

        const count = arity.get(value);

        if (count === undefined) {
          throw new Error(`script ${index}: ${value.toString(16)} is not an opcode`);
        }

        const operands: Operand[] = [];
        at += 1;

        for (let n = 0; n < count; n++) {
          if (at >= end) {
            throw new Error(`script ${index}, variant ${variant}, runs past its length`);
          }

          const [read, next] = operand(at);
          operands.push(read);
          at = next;
        }

        elements.push({ op: value, operands });
      }

      if (at !== end) {
        throw new Error(`script ${index}, variant ${variant}, runs past its length`);
      }

      variants.push(elements);
    }

    const unknown = Array.from({ length: layout.unknown }, (_, n) =>
      view.getUint16(record + 6 + 2 * n, true)
    );

    return {
      from: view.getUint16(record + 2, true),
      to: view.getUint16(record + 4, true),
      flag: view.getUint16(flag, true),
      ...(layout.unknown ? { unknown } : {}),
      variants,
    };
  });
}

/**
 * `ALL_PTZ.SCP` again, from its scripts, after the title of the file they
 * came from: the records, then each variant in turn, its length first, an
 * operand drawn at random as `0x8b05 lo hi`. For the oracle's variants,
 * which change a script to measure the engine by. Catz's (`layout`) keep
 * the original's words before the records, and each script's unknown ones.
 */
export function writeScripts(
  original: Uint8Array,
  scripts: Script[],
  layout: ScriptLayout = SCRIPTS.dogz
): Uint8Array {
  const header = original.subarray(0, original.indexOf(0) + 1 + 2 * layout.preamble);
  const size = recordSize(layout);
  const body: number[] = [];
  const records = scripts.map((script) => {
    const offset = body.length;

    for (const variant of script.variants) {
      const words: number[] = [];

      for (const element of variant) {
        if ('frame' in element) {
          words.push(element.frame);
          continue;
        }

        words.push(element.op);

        for (const operand of element.operands) {
          words.push(
            ...(typeof operand === 'number' ? [operand] : [layout.random, ...operand.random])
          );
        }
      }

      body.push(words.length + 1, ...words);
    }

    return { script, offset };
  });

  const data = new Uint8Array(header.length + 2 + size * scripts.length + 4 + 2 * body.length);
  const view = new DataView(data.buffer);
  data.set(header);
  let at = header.length;
  view.setUint16(at, scripts.length, true);
  at += 2;

  for (const { script, offset } of records) {
    view.setUint16(at, script.variants.length, true);
    view.setUint16(at + 2, script.from, true);
    view.setUint16(at + 4, script.to, true);
    (script.unknown ?? []).forEach((word, n) => view.setUint16(at + 6 + 2 * n, word, true));
    view.setUint16(at + 6 + 2 * layout.unknown, script.flag, true);
    view.setUint32(at + 8 + 2 * layout.unknown, offset, true);
    at += size;
  }

  view.setUint32(at, body.length, true);
  at += 4;
  body.forEach((word, n) => view.setUint16(at + 2 * n, word & 0xffff, true));
  return data;
}
