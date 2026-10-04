/**
 * Which balls of a creature's skeleton play which part in drawing it: the
 * head the eyes are drawn over, the neck the head turns about, the nose that
 * shines, the mouth drawn in its own order, the tongue put away.
 *
 * Dogz's engine knows its one skeleton's balls by number (DOGZDLL.DLL), its
 * breeds naming only the head and the chest (`[Key Balls]`). Catz's creatures
 * each name all of them, in order, in their `[Key Balls]` — a cat's file says
 * so in its comments: head, chest, neck, jaw, the two tongue balls, chin,
 * nose, the two nostrils, butt — with -1 for a part the creature has not; and
 * its `[Skeleton Type]` is -1, where Dogz's breeds give 0 to 4. See
 * kb/topics/drawing-a-dog.md and kb/formats/lnz.md.
 */

import { type Breed } from '../formats/lnz.ts';

export interface Skeleton {
  head: number;
  chest: number;

  /** The ball the head turns about. */
  neck: number;
  jaw: number;
  tongue: [number, number];
  chin: number;
  nose: number;
  nostrils: [number, number];
  butt: number;

  /** The ball the pet module never draws, holding things by it (Dogz's toe, 45), or -1. */
  holdingToe: number;

  /** Whether the frames are reshaped by Dogz's engine's own lists of its skeleton's balls (`ModifyBallzData`). */
  dogzShaped: boolean;
}

/** Dogz's skeleton, as its engine numbers its balls. */
const DOGZ: Skeleton = {
  head: 52,
  chest: 50,
  neck: 54,
  jaw: 53,
  tongue: [63, 64],
  chin: 51,
  nose: 55,
  nostrils: [17, 41],
  butt: 49,
  holdingToe: 45,
  dogzShaped: true,
};

/** A breed's skeleton: Dogz's, its head and chest as the breed names them, or as a Catz creature names every part. */
export function skeletonOf(breed: Breed): Skeleton {
  const key = breed.keyBalls ?? [];

  if (!(breed.skeletonType < 0)) {
    return { ...DOGZ, head: key[0] ?? DOGZ.head, chest: key[1] ?? DOGZ.chest };
  }

  const at = (n: number) => key[n] ?? -1;
  return {
    head: at(0),
    chest: at(1),
    neck: at(2),
    jaw: at(3),
    tongue: [at(4), at(5)],
    chin: at(6),
    nose: at(7),
    nostrils: [at(8), at(9)],
    butt: at(10),
    holdingToe: -1,
    dogzShaped: false,
  };
}
