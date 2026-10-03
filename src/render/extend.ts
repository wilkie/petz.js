/**
 * A breed's own shape: `Ballz::ModifyBallzData` (DOGZDLL.DLL seg6:0000)
 * reshapes every frame of an animation as it loads it (`GetRawFramePtr`,
 * seg10:357a) by the breed's extensions — the body longer, then the legs,
 * then the face, each the breed's number halved — and `PostProcess` moves
 * one toe in a few frames. All in
 * C's whole numbers, as the engine has them. See kb/topics/drawing-a-dog.md.
 */

import { type Frame } from '../formats/animation.ts';
import { type Breed } from '../formats/lnz.ts';

type Point = { x: number; y: number; z: number };

const BUTT = 49;
const CHEST = 50;
const BELLY = 48;
const JAW = 53;
const NOSE = 55;
const TAIL = [57, 58, 59, 60, 61, 62];

/**
 * What `ExtendBody` (seg6:1dee) moves back with the butt: the tail and the
 * hind legs, but the right's middle toe — the one the dog holds things by,
 * which is never drawn (`HOLDING_TOE`).
 */
const HIND_END = [BUTT, ...TAIL, 43, 19, 40, 16, 24, 0, 36, 12, 44, 46, 20, 21, 22];

/** What moves with the shoulders (`ExtendLegLength`): the chest, neck and the whole head. */
const FORE_END = [
  1, 2, 3, 4, 5, 6, 8, 14, 15, 17, 25, 26, 27, 28, 29, 30, 32, 38, 39, 41, 50, 51, 52, 53, 54, 55,
  56, 63, 64,
];

/** What `ExtendFace` (seg6:2350) moves out with the nose: the nostrils, chin, jowls and tongue. */
const MUZZLE = [NOSE, 41, 17, 51, 39, 15, 63, 64];

/**
 * Each leg from the ground up: a foot, then three balls each a segment
 * further. The front legs start from the hind feet, as the engine has them.
 */
const LEGS = {
  hind: [
    [36, 24, 40, 43],
    [12, 0, 16, 19],
  ],
  front: [
    [36, 47, 31, 42],
    [12, 23, 7, 18],
  ],
};

/** The frames `PostProcess` lowers the right hind leg's middle toe in (seg6:0087), and by how much a skeleton type. */
const TOE = 45;
const TOE_FRAMES = [912, 980];
const TOE_FACTORS = [0, 0.9, 0, 0, 1.7].map(Math.fround);

const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const length = (v: Point) => Math.trunc(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));

/** A vector `by` along it, or, with no length, none (the engine complains and leaves it). */
const along = (v: Point, by: number): Point | null => {
  const of = length(v);
  return of === 0
    ? null
    : {
        x: Math.trunc((v.x * by) / of),
        y: Math.trunc((v.y * by) / of),
        z: Math.trunc((v.z * by) / of),
      };
};

/** A segment lengthened by so much, or as it is when it has no length. */
const lengthen = (v: Point, by: number): Point => {
  const of = length(v);
  return of === 0 ? v : along(v, of + by)!;
};

const half = (v: Point): Point => ({
  x: Math.trunc(v.x / 2),
  y: Math.trunc(v.y / 2),
  z: Math.trunc(v.z / 2),
});

/** One frame reshaped, its index over every animation `at`. */
export function extendFrame(frame: Frame, at: number, breed: Breed): Frame {
  /* Halved as they are read (`LoadSpecialBallInfo`, seg10:1595 on), as the ball sizes are. */
  const [frontLeg, hindLeg, body, face] = [
    breed.extensions.frontLeg,
    breed.extensions.hindLeg,
    breed.extensions.body,
    breed.extensions.face,
  ].map((value) => Math.trunc(value / 2));
  const balls = frame.balls.map((ball) => ({ ...ball }));
  const move = (list: number[], by: Point) =>
    list.forEach((n) => {
      if (balls[n]) {
        balls[n] = plus(balls[n], by);
      }
    });

  /* The body: the hind end moved back along the butt-to-chest line, the belly half as far. */
  const back = along(minus(balls[CHEST], balls[BUTT]), -body);

  if (back) {
    move(HIND_END, back);
    move([BELLY], half(back));
  }

  /* The legs: rebuilt from the foot up, the first segment a fifth as much
   * longer; the hind end follows the thighs' middle, the fore end the
   * shoulders', the belly half of both. */
  const rebuild = (legs: number[][], by: number) => {
    const tops = legs.map((leg) => balls[leg[3]]);

    for (const leg of legs) {
      const segments = [1, 2, 3].map((n) => minus(balls[leg[n]], balls[leg[n - 1]]));
      [Math.trunc(by / 5), by, by].forEach((extra, n) => {
        balls[leg[n + 1]] = plus(balls[leg[n]], lengthen(segments[n], extra));
      });
    }

    const middle = (points: Point[]) => ({
      x: Math.trunc((points[0].x + points[1].x) / 2),
      y: Math.trunc((points[0].y + points[1].y) / 2),
      z: Math.trunc((points[0].z + points[1].z) / 2),
    });
    return minus(middle(legs.map((leg) => balls[leg[3]])), middle(tops));
  };

  const hindRise = rebuild(LEGS.hind, hindLeg);
  move([BUTT, ...TAIL], hindRise);
  const foreRise = rebuild(LEGS.front, frontLeg);
  move([BELLY], half(plus(foreRise, hindRise)));
  move(FORE_END, foreRise);

  /* The face: the muzzle moved out along the jaw-to-nose line. */
  const out = along(minus(balls[JAW], balls[NOSE]), -face);

  if (out) {
    move(MUZZLE, out);
  }

  /* `PostProcess`: one toe lowered in a few frames, by the front leg and face together. */
  if (at >= TOE_FRAMES[0] && at <= TOE_FRAMES[1] && balls[TOE]) {
    const factor = TOE_FACTORS[breed.skeletonType] ?? 0;
    balls[TOE] = { ...balls[TOE], y: balls[TOE].y - Math.trunc((frontLeg + face) * factor) };
  }

  return { ...frame, balls };
}

const reshaped = new WeakMap<Breed, WeakMap<readonly Frame[], Frame[]>>();

/** Every frame, numbered over every animation, reshaped for a breed: once each. */
export function extendFrames(frames: readonly Frame[], breed: Breed): Frame[] {
  const { frontLeg, hindLeg, body, face } = breed.extensions;

  if (!frontLeg && !hindLeg && !body && !face) {
    return frames as Frame[];
  }

  const forBreed = reshaped.get(breed) ?? new WeakMap();
  reshaped.set(breed, forBreed);
  const made = forBreed.get(frames) ?? frames.map((frame, at) => extendFrame(frame, at, breed));
  forBreed.set(frames, made);
  return made;
}
