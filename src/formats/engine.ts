/**
 * Tables of DOGZDLL.DLL's that decide what the dog does: the names of the
 * engine's states, what kind of position each of the scripts' positions is,
 * and which scripts the engine plays for tricks, for walking and for sleep.
 * They are compiled into the engine, not read from a data file. See
 * kb/topics/behaviour.md.
 */

import { dataSegment, type NeModule } from './ne.ts';

/** How many tricks there are: engine states 0x2b to 0x65. */
export const TRICK_COUNT = 59;

/** The first trick's engine state, `eTrickBegging`. */
export const FIRST_TRICK = 0x2b;

/**
 * What kind of position a script position is, from the word after its name
 * (`ScriptSprite::GetNeutralType`).
 */
export const POSITION = {
  moving: 1,
  lying: 2,
  onBack: 4,
  sitting: 8,
  standing: 16,
} as const;

/** How the engine plays a trick that a script does: `PetModule::PushTrick`. */
export interface TrickScript {
  /** The script, or -1 for the tricks the engine plays its own way. */
  script: number;

  /** It is played `repeats + random(extra)` times; `extra` is at least 1. */
  repeats: number;
  extra: number;

  /** Raise cue 0 before the trick, and cues 7 and 6 around it. */
  cueBefore: boolean;
  cueAround: boolean;
}

/** Scripts the engine plays by number, from tables in its data segment. */
export interface EngineScripts {
  /** Walking, trotting and running, slowest first (`PickLocomotionAction`, DS:0x22d8). */
  locomotion: [number, number, number];

  /** The four roll-and-wiggle scripts, one chosen at random (DS:0x22d0). */
  rolls: number[];

  /** Sleep: five scripts, each with how many times at most it is played in a row (DS:0x20a4). */
  sleep: { script: number; times: number }[];

  /** The two scripts sleep is broken with now and then (DS:0x20b8). */
  sleepBreaks: [number, number];

  /** What a dog on its back does when petted, one at random (DS:0x20c4). */
  pettedOnBack: number[];

  /** What a dog does when poked in the face, one at random (DS:0x20ca). */
  pokedInFace: number[];

  /**
   * The three spots a dog likes to be petted on, by ball, how likely each
   * is to be chosen, in hundredths, and for how many strokes: at least
   * `strokes`, and up to `extra` more (DS:0x20d0, `PetModule::PickNewPetSpot`).
   */
  petSpots: { ball: number; chance: number; strokes: number; extra: number }[];
}

/** The parts of the body, as `Ballz::HitTestBodyArea` names them. */
export const AREA = {
  head: 0,
  tongue: 1,
  face: 2,
  hindquarters: 3,
  rightLeg: 4,
  leftLeg: 5,
  tail: 7,
  body: 8,
} as const;

const words = (data: Uint8Array, at: number, count: number) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return Array.from({ length: count }, (_, n) => view.getInt16(at + 2 * n, true));
};

/**
 * The engine's states, by number: `eNOTASTATE`, `eWaitState`, ... `eIconBeg`.
 * They are the strings of its string table numbered from 10000.
 */
export function readEngineStateNames(engine: NeModule): string[] {
  const names: string[] = [];

  for (const resource of engine.resources()) {
    if (resource.type !== 6 || typeof resource.id !== 'number') {
      continue;
    }

    /* A string table resource holds 16 strings, each its length and then its
     * characters; resource n holds strings 16(n - 1) on. */
    let at = 0;

    for (let n = 0; n < 16 && at < resource.data.length; n++) {
      const length = resource.data[at];
      const id = (resource.id - 1) * 16 + n;

      if (id >= 10000 && length) {
        names[id - 10000] = new TextDecoder('latin1').decode(
          resource.data.subarray(at + 1, at + 1 + length)
        );
      }

      at += 1 + length;
    }
  }

  return Array.from(names, (name) => name ?? '');
}

/** Each script position's kind (`POSITION`): the word after its name, at 0xedb. */
export function readPositionKinds(engine: NeModule, count: number): number[] {
  const data = dataSegment(engine);
  return Array.from({ length: count }, (_, n) => words(data, 0xece + 15 * n + 13, 1)[0]);
}

/** How each trick is played: six bytes a trick, at DS:0x216e. */
export function readTrickScripts(engine: NeModule): TrickScript[] {
  const data = dataSegment(engine);

  return Array.from({ length: TRICK_COUNT }, (_, n) => {
    const at = 0x216e + 6 * n;
    const signed = (byte: number) => (byte << 24) >> 24;

    return {
      script: words(data, at, 1)[0],
      repeats: signed(data[at + 2]),
      extra: Math.max(1, signed(data[at + 3])),
      cueBefore: data[at + 4] !== 0,
      cueAround: data[at + 5] !== 0,
    };
  });
}

export function readEngineScripts(engine: NeModule): EngineScripts {
  const data = dataSegment(engine);
  const sleep = words(data, 0x20a4, 10);
  const [walk, trot, run] = words(data, 0x22d8, 3);
  const [first, second] = words(data, 0x20b8, 2);

  const spots = words(data, 0x20d0, 12);

  return {
    locomotion: [walk, trot, run],
    rolls: words(data, 0x22d0, 4),
    sleep: Array.from({ length: 5 }, (_, n) => ({ script: sleep[2 * n], times: sleep[2 * n + 1] })),
    sleepBreaks: [first, second],
    pettedOnBack: words(data, 0x20c4, 3),
    pokedInFace: words(data, 0x20ca, 3),
    petSpots: Array.from({ length: 3 }, (_, n) => ({
      ball: spots[4 * n],
      chance: spots[4 * n + 1],
      strokes: spots[4 * n + 2],
      extra: spots[4 * n + 3],
    })),
  };
}

/**
 * The part of the body each ball is (`AREA`): the `Ballz` constructor sets
 * them one by one, `mov word [es:bx+0xa05 + 2 × ball], area` (seg10:0051
 * on), and this reads them out of its code.
 */
export function readBodyAreas(engine: NeModule, balls = 65): number[] {
  const code = engine.segmentBytes(10);
  const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
  const areas = new Array<number>(balls).fill(-1);

  /* Within the constructor, which the destructor follows at 0x503. */
  for (let at = 0; at < 0x503 - 6; at++) {
    if (code[at] === 0x26 && code[at + 1] === 0xc7 && code[at + 2] === 0x87) {
      const ball = (view.getUint16(at + 3, true) - 0xa05) / 2;

      if (Number.isInteger(ball) && ball >= 0 && ball < balls) {
        areas[ball] = view.getInt16(at + 5, true);
      }
    }
  }

  return areas;
}

/**
 * A string a far pointer in the data segment points to: the loader's
 * relocation at that place says where.
 */
function farString(engine: NeModule, at: number): string | null {
  const relocation = engine
    .relocations(dataSegmentNumber(engine))
    .find((r) => r.offset === at && r.target.kind === 'internal');

  if (!relocation || relocation.target.kind !== 'internal') {
    return null;
  }

  const bytes = engine.segmentBytes(relocation.target.segment);
  let text = '';

  for (let n = relocation.target.offset; bytes[n]; n++) {
    text += String.fromCharCode(bytes[n]);
  }

  return text;
}

function dataSegmentNumber(engine: NeModule) {
  const view = new DataView(engine.data.buffer, engine.data.byteOffset, engine.data.byteLength);
  return view.getUint16(view.getUint32(0x3c, true) + 0x0e, true);
}

/**
 * How the engine maps the brain's outputs to its states (seg15:160b): a
 * table at DS:0x1f2c of five words a row -- output verb and object, each by
 * its place in a list of names (DS:0x1e9c, DS:0x1e6c), the state, a flag
 * that makes it none, and frames before the choice is made real -- ended
 * by -1.
 */
export function readBrainMap(engine: NeModule) {
  const data = dataSegment(engine);
  const names = (at: number) => {
    const list: string[] = [];

    for (let n = 0; ; n++) {
      const name = farString(engine, at + 4 * n);

      if (!name) {
        return list;
      }

      list.push(name);
    }
  };

  const verbs = names(0x1e9c);
  const objects = names(0x1e6c);
  const map = [];

  for (let at = 0x1f2c; ; at += 10) {
    const [verb, object, state, flag, delay] = words(data, at, 5);

    if (verb === -1) {
      return map;
    }

    map.push({ verb: verbs[verb], object: objects[object], state, flag, delay });
  }
}
