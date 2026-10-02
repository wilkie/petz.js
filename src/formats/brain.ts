/**
 * `BRAIN.PBT`, the "Petz Brain File" DOGZDLL.DLL's `XBrain` reads
 * (`ReadFile`, `DispatchRecord`, seg12:1a8f and seg13:0835) and writes back
 * (`WriteFile`, `PrintBrain`). See kb/formats/pbt.md.
 *
 * Text, in sections each headed `!NAME`: lists of names, numbers a line,
 * and three sections of binary records, five little-endian words each,
 * ended by a record whose first word is -1. The engine writes that last
 * record from the buffer it wrote the one before with, so it repeats the
 * last record written, anywhere, with its first word made -1; and this
 * writes it so, so that a file read and written comes back byte for byte.
 */

/** A record of the binary sections: what its five words are for each section is in `Brain`. */
export type BrainRecord = [number, number, number, number, number];

export interface BrainFile {
  version: string;
  inputVerbs: string[];
  outputVerbs: string[];
  objects: string[];
  desires: string[];

  /** Desire, output verb, object, instinct type (an index into `:LMH=`), weight. */
  synapses: BrainRecord[];

  /** Desire, input verb, object, effect type (an index into `:!`), amount. */
  inEffects: BrainRecord[];

  /** Desire, output verb, object, effect type, amount. */
  outEffects: BrainRecord[];

  gestalt: number;

  /**
   * Entropy, in hundredths a trick chosen keeps; the instinct weights of L,
   * M and H; learn-situation; jolt mode; situation bleed mode.
   */
  globalControls: number[];

  /** The most a synapse may weigh, and the most it may change at a lesson. */
  moreGlobalControls: number[];

  /** How desire proclivities decay, and undecay. */
  decayDesires: [number, number];

  /** How much a lesson teaches the trick done so many outputs ago. */
  memOutLearnWeights: number[];
  desireValues: number[];
  desireThresholds: number[];
  desireBounds: [number, number][];
}

const BINARY = ['SYNAPSESBINARY', 'INEFFECTSBINARY', 'OUTEFFECTSBINARY'] as const;

/** Reads a brain file. Throws on a section this does not know. */
export function parseBrain(data: Uint8Array): BrainFile {
  const text = (from: number, to: number) =>
    new TextDecoder('latin1').decode(data.subarray(from, to));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 0;

  const line = () => {
    const end = data.indexOf(0x0a, at);
    const read = text(at, end === -1 ? data.length : end).replace(/\r$/, '');
    at = end === -1 ? data.length : end + 1;
    return read;
  };

  const numbers = (count: number) => Array.from({ length: count }, () => Number(line()));

  const brain: BrainFile = {
    version: line().replace(/^#!Petz Brain File /, ''),
    inputVerbs: [],
    outputVerbs: [],
    objects: [],
    desires: [],
    synapses: [],
    inEffects: [],
    outEffects: [],
    gestalt: 0,
    globalControls: [],
    moreGlobalControls: [],
    decayDesires: [1, 0],
    memOutLearnWeights: [],
    desireValues: [],
    desireThresholds: [],
    desireBounds: [],
  };

  while (at < data.length) {
    const heading = line();

    if (heading === '') {
      continue;
    }

    const section = /^!(\w+)$/.exec(heading)?.[1];

    if (!section) {
      throw new Error(`bad line in brain file: ${heading}`);
    }

    if ((BINARY as readonly string[]).includes(section)) {
      const records: BrainRecord[] = [];

      for (;;) {
        const record = [0, 1, 2, 3, 4].map((n) => view.getInt16(at + 2 * n, true)) as BrainRecord;
        at += 10;

        if (record[0] === -1) {
          break;
        }

        records.push(record);
      }

      at += 1;
      const key = ({ SYNAPSESBINARY: 'synapses', INEFFECTSBINARY: 'inEffects' } as const)[
        section as 'SYNAPSESBINARY' | 'INEFFECTSBINARY'
      ];
      brain[key ?? 'outEffects'] = records;
      continue;
    }

    switch (section) {
      case 'INPUTVERBS':
      case 'OUTPUTVERBS':
      case 'OBJECTS':
      case 'DESIRES': {
        const names = Array.from({ length: Number(line()) }, line);
        const key = (
          {
            INPUTVERBS: 'inputVerbs',
            OUTPUTVERBS: 'outputVerbs',
            OBJECTS: 'objects',
            DESIRES: 'desires',
          } as const
        )[section];
        brain[key] = names;
        break;
      }
      case 'GESTALT':
        brain.gestalt = Number(line());
        break;
      case 'GLOBALCONTROLS':
        brain.globalControls = numbers(7);
        break;
      case 'MOREGLOBALCONTROLS':
        brain.moreGlobalControls = numbers(2);
        break;
      case 'DECAYDESIRES':
        brain.decayDesires = [Number(line()), Number(line())];
        break;
      case 'MEMOUTLEARNWEIGHTS':
        brain.memOutLearnWeights = numbers(10);
        break;
      case 'DESIREVALUES':
        brain.desireValues = numbers(Number(line()));
        break;
      case 'DESIRETHRESHHOLDS':
        brain.desireThresholds = numbers(Number(line()));
        break;
      case 'DESIREBOUNDS':
        brain.desireBounds = Array.from({ length: Number(line()) }, () => {
          const [low, high] = line().trim().split(/\s+/).map(Number);
          return [low, high] as [number, number];
        });
        break;
      default:
        throw new Error(`unknown record type in brain file: ${section}`);
    }
  }

  return brain;
}

/** Writes a brain file as the engine lays it out. */
export function writeBrain(brain: BrainFile): Uint8Array {
  const parts: Uint8Array[] = [];
  const add = (text: string) => parts.push(new Uint8Array([...text].map((c) => c.charCodeAt(0))));
  const list = (name: string, items: (string | number)[]) =>
    add(`!${name}\n${items.length}\n${items.map((item) => `${item}\n`).join('')}`);

  /* The engine's record buffer: what the terminator repeats. */
  let last: BrainRecord = [0, 0, 0, 0, 0];

  const records = (name: string, items: BrainRecord[]) => {
    add(`!${name}\n`);

    for (const record of [...items, null]) {
      const words = record ?? ([-1, ...last.slice(1)] as BrainRecord);
      const bytes = new Uint8Array(10);
      const view = new DataView(bytes.buffer);
      words.forEach((word, n) => view.setInt16(2 * n, word, true));
      parts.push(bytes);

      if (record) {
        last = record;
      }
    }

    add('\n');
  };

  add(`#!Petz Brain File ${brain.version}\r\n\n`);
  list('INPUTVERBS', brain.inputVerbs);
  add('\n');
  list('OUTPUTVERBS', brain.outputVerbs);
  add('\n');
  list('OBJECTS', brain.objects);
  add('\n');
  list('DESIRES', brain.desires);
  add('\n');
  records('SYNAPSESBINARY', brain.synapses);
  records('INEFFECTSBINARY', brain.inEffects);
  records('OUTEFFECTSBINARY', brain.outEffects);
  add('\n');
  add(`!GESTALT\n${brain.gestalt}\n`);
  add(`!GLOBALCONTROLS\n${brain.globalControls.map((n) => `${n}\n`).join('')}`);
  add(`!MOREGLOBALCONTROLS\n${brain.moreGlobalControls.map((n) => `${n}\n`).join('')}`);
  add(`!DECAYDESIRES\n${brain.decayDesires.map((n) => `${n.toFixed(6)}\n`).join('')}`);
  add(`!MEMOUTLEARNWEIGHTS\n${brain.memOutLearnWeights.map((n) => `${n}\n`).join('')}`);
  list('DESIREVALUES', brain.desireValues);
  list('DESIRETHRESHHOLDS', brain.desireThresholds);
  add(
    `!DESIREBOUNDS\n${brain.desireBounds.length}\n${brain.desireBounds
      .map(([low, high]) => `${String(low).padStart(5)}${String(high).padStart(7)}   end\n`)
      .join('')}\n`
  );

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}
