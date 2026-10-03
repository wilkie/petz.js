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

/** An operand: a number, or a random one between two. */
export type Operand = number | { random: [number, number] };

export type Element = { frame: number } | { op: number; operands: Operand[] };

export interface Script {
  /** The state the dog is in before, and after; see `readStateNames`. */
  from: number;
  to: number;

  /** The record's fourth word, 0 or 1. Not yet known. */
  flag: number;
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

/** Reads `ALL_PTZ.SCP`. Throws if any variant does not end where its length says. */
export function parseScripts(data: Uint8Array, arity: Map<number, number>): Script[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = data.indexOf(0) + 1;
  const count = view.getUint16(header, true);
  const table = header + 2;
  const body = table + 12 * count + 4;
  const words = view.getUint32(table + 12 * count, true);

  if (body + 2 * words !== data.byteLength) {
    throw new Error(`the scripts' ${words} words do not reach the end of the file`);
  }

  const word = (at: number) => view.getUint16(body + 2 * at, true);
  const signed = (at: number) => view.getInt16(body + 2 * at, true);

  /** An operand at `at`, and where the next begins. */
  const operand = (at: number): [Operand, number] => {
    const value = word(at);

    if (value === OP.random) {
      return [{ random: [signed(at + 1), signed(at + 2)] }, at + 3];
    }

    return [signed(at), at + 1];
  };

  return Array.from({ length: count }, (_, index) => {
    const record = table + 12 * index;
    let at = view.getUint32(record + 8, true);
    const variants: Element[][] = [];

    for (let variant = 0; variant < view.getUint16(record, true); variant++) {
      const end = at + word(at);
      const elements: Element[] = [];
      at += 1;

      while (at < end) {
        const value = word(at);

        if (value < 0x8000) {
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

    return {
      from: view.getUint16(record + 2, true),
      to: view.getUint16(record + 4, true),
      flag: view.getUint16(record + 6, true),
      variants,
    };
  });
}

/**
 * `ALL_PTZ.SCP` again, from its scripts, after the title of the file they
 * came from: the records, then each variant in turn, its length first, an
 * operand drawn at random as `0x8b05 lo hi`. For the oracle's variants,
 * which change a script to measure the engine by.
 */
export function writeScripts(original: Uint8Array, scripts: Script[]): Uint8Array {
  const header = original.subarray(0, original.indexOf(0) + 1);
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
          words.push(...(typeof operand === 'number' ? [operand] : [OP.random, ...operand.random]));
        }
      }

      body.push(words.length + 1, ...words);
    }

    return { script, offset };
  });

  const data = new Uint8Array(header.length + 2 + 12 * scripts.length + 4 + 2 * body.length);
  const view = new DataView(data.buffer);
  data.set(header);
  let at = header.length;
  view.setUint16(at, scripts.length, true);
  at += 2;

  for (const { script, offset } of records) {
    view.setUint16(at, script.variants.length, true);
    view.setUint16(at + 2, script.from, true);
    view.setUint16(at + 4, script.to, true);
    view.setUint16(at + 6, script.flag, true);
    view.setUint32(at + 8, offset, true);
    at += 12;
  }

  view.setUint32(at, body.length, true);
  at += 4;
  body.forEach((word, n) => view.setUint16(at + 2 * n, word & 0xffff, true));
  return data;
}
