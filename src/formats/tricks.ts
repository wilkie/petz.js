/**
 * `TRICKS.TDT`, what the dog has learned: for each of the 59 tricks, how
 * likely it is to do it when idle and when playing, and how its mood and
 * its nature bear on that. Treats and the spray bottle move the weights
 * (`PetModule::PositiveReinforcement`, `NegativeReinforcement`), and over
 * time they drift back towards the defaults the file also holds
 * (`PulseTrickData`). See kb/formats/tdt.md.
 *
 * The file is a 48-byte title, then the current table and the defaults
 * table, each 59 records of 12 words (`PetModule::LoadTrickData`). The
 * defaults are also a resource of the engine's, used when the file is not
 * there.
 */

import { TRICK_COUNT } from './engine.ts';

export const TRICKS_TITLE = 'DOGZ Trick Data (c)1995 PF Magic, Inc.  Vers 20';

/** One trick's record. Fields not yet known keep their place as `unknown`. */
export interface Trick {
  /** The excitement the trick suits, and how far from it the dog may be. */
  excitement: number;
  excitementRange: number;

  /** Its weight when the dog is idle, out of the sum of every trick's. */
  idleWeight: number;

  /** Its weight when playing ball, out of the sum of every trick's; -1 never. */
  playWeight: number;

  /** How far, in 256ths of a turn, the dog may face away from you to do it. */
  facing: number;

  /** A trick with the ball: never done when idle. */
  withBall: number;

  /** Whether the dog may grab the ball after it, when playing. */
  grabAfter: number;

  /**
   * How much of each factor the trick tolerates: done only if a random
   * number below the factor is at most this (`PetModule::DoIdle`).
   */
  sickness: number;
  ham: number;
  groom: number;
  bark: number;

  unknown: number;
}

export interface TrickData {
  current: Trick[];
  defaults: Trick[];
}

const RECORD = 24;

function readTrick(view: DataView, at: number): Trick {
  const word = (n: number) => view.getInt16(at + 2 * n, true);

  return {
    excitement: word(0),
    excitementRange: word(1),
    idleWeight: word(2),
    playWeight: word(3),
    facing: word(4),
    withBall: word(5),
    grabAfter: word(6),
    sickness: word(7),
    ham: word(8),
    groom: word(9),
    bark: word(10),
    unknown: word(11),
  };
}

export function parseTricks(data: Uint8Array): TrickData {
  const title = new TextDecoder('latin1').decode(data.subarray(0, TRICKS_TITLE.length));

  if (title !== TRICKS_TITLE || data.length !== 48 + 2 * TRICK_COUNT * RECORD) {
    throw new Error('not a trick data file');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const table = (at: number) =>
    Array.from({ length: TRICK_COUNT }, (_, n) => readTrick(view, at + RECORD * n));

  return { current: table(48), defaults: table(48 + TRICK_COUNT * RECORD) };
}
