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
import { skeletonOf } from './skeleton.ts';

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

/*
 * Catz's reshaping: `XBallz::ModifyBallzData` (CATZDLL.DLL seg36:0000), on
 * the cat's own skeleton, by the breed's values as written -- not halved, as
 * Dogz's are -- and by the further sections Catz adds (`CatzShape`). Its
 * words wrap at 16 bits as the engine's do; a vector is scaled to a length
 * in 32 bits; a percentage is a 16-bit product, its high word lost.
 */

const i16 = (n: number) => (n << 16) >> 16;
const wrapped = (p: Point): Point => ({ x: i16(p.x), y: i16(p.y), z: i16(p.z) });
const plus16 = (a: Point, b: Point) => wrapped(plus(a, b));
const minus16 = (a: Point, b: Point) => wrapped(minus(a, b));

/** `v` scaled by `by / of`, as `(long)v * by / of` truncated, or as it is with no length. */
const scaleTo = (v: Point, by: number, of: number): Point =>
  of === 0
    ? v
    : wrapped({
        x: Math.trunc((v.x * by) / of),
        y: Math.trunc((v.y * by) / of),
        z: Math.trunc((v.z * by) / of),
      });

const half16 = (v: Point): Point => wrapped(half(v));

/** `value × percent / 100` in 16 bits: the product's high word lost, then divided toward 0. */
export const percent16 = (value: number, percent: number) =>
  Math.trunc(i16(Math.imul(value, percent)) / 100);

/** A ball moved to `percent` of its distance from `about`. */
const towards = (ball: Point, about: Point, percent: number): Point => ({
  x: i16(percent16(i16(ball.x - about.x), percent) + about.x),
  y: i16(percent16(i16(ball.y - about.y), percent) + about.y),
  z: i16(percent16(i16(ball.z - about.z), percent) + about.z),
});

/** The cat's balls, by the names its breed files give them. */
const CAT = {
  ankleL: 0,
  ankleR: 1,
  belly: 2,
  butt: 3,
  chest: 6,
  earL2: 9,
  earR2: 11,
  elbowL: 12,
  elbowR: 13,
  handL: 22,
  handR: 23,
  head: 24,
  hipL: 25,
  hipR: 26,
  jaw: 29,
  kneeL: 32,
  kneeR: 33,
  nose: 37,
  shoulderL: 38,
  shoulderR: 39,
  soleL: 41,
  soleR: 42,
  wristL: 63,
  wristR: 64,
};

/** What `ExtendBody` (seg36:1ed1) moves back with the butt: the tail, the hind legs and their feet. */
const CAT_HIND_END = [
  3, 43, 44, 45, 46, 47, 48, 26, 25, 33, 32, 1, 0, 42, 41, 52, 53, 54, 49, 50, 51, 34, 35,
];

/** The butt and the tail, which follow the hips as the hind legs lengthen (`ExtendLegLength`, seg36:0341). */
const CAT_TAIL = [3, 43, 44, 45, 46, 47, 48];

/**
 * What follows the shoulders: the ears, eyes, irises, head, jaw, chin, snout,
 * jowls, tongue, neck, nose, chest, cheeks, whiskers -- and `zorient`, 65,
 * twice over, as the engine adds it twice.
 */
const CAT_FORE_END = [
  10, 11, 8, 9, 15, 28, 14, 27, 24, 29, 7, 40, 31, 30, 55, 56, 36, 37, 6, 4, 5, 57, 58, 59, 60, 61,
  62, 65, 65,
];

/** What `ExtendFace` (seg36:24c3) moves out with the nose; `zorient` twice again. */
const CAT_MUZZLE = [37, 40, 7, 31, 30, 55, 56, 4, 5, 57, 58, 59, 60, 61, 62, 65, 65];

/** Each leg from the ground: a sole, then three balls a segment further; the front legs from the hind soles, as the engine has them. */
const CAT_LEGS = {
  hind: [
    [42, 1, 33, 26],
    [41, 0, 32, 25],
  ],
  front: [
    [42, 64, 13, 39],
    [41, 63, 12, 38],
  ],
};

/** The toes and fingers `EnlargeFeet` (seg36:2d61) spreads, each about its hand or sole. */
export const CAT_FEET = [
  { about: 23, balls: [19, 20, 21] },
  { about: 22, balls: [16, 17, 18] },
  { about: 42, balls: [52, 53, 54] },
  { about: 41, balls: [49, 50, 51] },
];

/** The balls `EnlargeFeet` sizes: the hands and soles and their fingers and toes. */
export const CAT_FEET_SIZED = [23, 19, 20, 21, 22, 16, 17, 18, 42, 52, 53, 54, 41, 49, 50, 51];

/** One frame of a Catz creature reshaped by its breed, as `ModifyBallzData` does it. */
export function extendCatzFrame(frame: Frame, breed: Breed): Frame {
  const shape = breed.catz;
  const { frontLeg, hindLeg, body, face } = breed.extensions;
  const balls = frame.balls.map((ball) => ({ ...ball }));
  const add = (list: number[], by: Point) =>
    list.forEach((n) => {
      if (balls[n]) {
        balls[n] = { ...balls[n], ...plus16(balls[n], by) };
      }
    });

  if (body) {
    const v = minus16(balls[CAT.chest], balls[CAT.butt]);
    const back = scaleTo(v, -body, length(v));
    add(CAT_HIND_END, back);
    add([CAT.belly], half16(back));
  }

  if (frontLeg || hindLeg) {
    const rebuild = ([c0, c1, c2, c3]: number[], by: number) => {
      const segments = [
        minus16(balls[c1], balls[c0]),
        minus16(balls[c2], balls[c1]),
        minus16(balls[c3], balls[c2]),
      ];
      const longer = segments.map((segment, n) => {
        const of = length(segment);
        return of ? scaleTo(segment, of + (n === 0 ? Math.trunc(by / 5) : by), of) : segment;
      });
      [c1, c2, c3].forEach((ball, n) => {
        balls[ball] = { ...balls[ball], ...plus16(balls[[c0, c1, c2][n]], longer[n]) };
      });
    };

    const hips = between(balls[CAT.hipR], balls[CAT.hipL]);
    CAT_LEGS.hind.forEach((leg) => rebuild(leg, hindLeg));
    const hindRise = minus16(between(balls[CAT.hipR], balls[CAT.hipL]), hips);
    add(CAT_TAIL, hindRise);

    const shoulders = between(balls[CAT.shoulderR], balls[CAT.shoulderL]);
    CAT_LEGS.front.forEach((leg) => rebuild(leg, frontLeg));
    const foreRise = minus16(between(balls[CAT.shoulderR], balls[CAT.shoulderL]), shoulders);
    add([CAT.belly], half16(plus16(foreRise, hindRise)));
    add(CAT_FORE_END, foreRise);
  }

  if (face) {
    const v = minus16(balls[CAT.jaw], balls[CAT.nose]);
    add(CAT_MUZZLE, scaleTo(v, -face, length(v)));
  }

  if (!shape) {
    return { ...frame, balls };
  }

  const place = (n: number, to: Point) => {
    balls[n] = { ...balls[n], ...to };
  };

  if (shape.head.percent !== 100) {
    const head = { ...balls[CAT.head] };
    const by = shape.head.percent - shape.head.extra;
    breed.headBalls.forEach((n) => balls[n] && place(n, towards(balls[n], head, by)));
  }

  if (shape.ears !== 100) {
    [CAT.earL2, CAT.earR2].forEach((n) => place(n, towards(balls[n], balls[CAT.head], shape.ears)));
  }

  if (shape.feet.percent !== 100) {
    const by = shape.feet.percent - shape.feet.extra;
    for (const { about, balls: spread } of CAT_FEET) {
      spread.forEach((n) => place(n, towards(balls[n], balls[about], by)));
    }
  }

  /* Down, from the belly to the middle of the soles and hands, and forward, from the nose to the head. */
  const down = () =>
    minus16(
      between(
        between(balls[CAT.soleR], balls[CAT.soleL]),
        between(balls[CAT.handR], balls[CAT.handL])
      ),
      balls[CAT.belly]
    );
  const forward = () => minus16(balls[CAT.head], balls[CAT.nose]);
  const move = (list: [number, number][], direction: Point) => {
    const of = length(direction);

    if (of) {
      list.forEach(
        ([n, by]) => balls[n] && place(n, plus16(balls[n], scaleTo(direction, -by, of)))
      );
    }
  };

  if (shape.up.length) {
    move(shape.up, down());
  }

  if (shape.forward.length) {
    move(shape.forward, forward());
  }

  if (shape.sideways.length) {
    /* Not a cross product: the engine adds where one would subtract (seg36:3e14). */
    const d = down();
    const f = forward();
    move(shape.sideways, {
      x: i16(i16(f.y * d.z) + i16(f.z * d.y)),
      y: i16(i16(f.x * d.z) + i16(f.z * d.x)),
      z: i16(i16(f.x * d.y) + i16(f.y * d.x)),
    });
  }

  for (const [from, n, percent] of shape.project) {
    if (balls[from] && balls[n]) {
      place(n, towards(balls[n], balls[from], percent));
    }
  }

  return { ...frame, balls };
}

/** `(a + b) / 2` in 16 bits, toward 0. */
function between(a: Point, b: Point): Point {
  return {
    x: i16(Math.trunc(i16(a.x + b.x) / 2)),
    y: i16(Math.trunc(i16(a.y + b.y) / 2)),
    z: i16(Math.trunc(i16(a.z + b.z) / 2)),
  };
}

const reshaped = new WeakMap<Breed, WeakMap<readonly Frame[], Frame[]>>();

/** Every frame, numbered over every animation, reshaped for a breed: once each. */
export function extendFrames(frames: readonly Frame[], breed: Breed): Frame[] {
  const { frontLeg, hindLeg, body, face } = breed.extensions;

  const dogz = skeletonOf(breed).dogzShaped;

  if (
    dogz
      ? !frontLeg && !hindLeg && !body && !face
      : !breed.catz && !frontLeg && !hindLeg && !body && !face
  ) {
    return frames as Frame[];
  }

  const forBreed = reshaped.get(breed) ?? new WeakMap();
  reshaped.set(breed, forBreed);
  const made =
    forBreed.get(frames) ??
    frames.map((frame, at) =>
      dogz ? extendFrame(frame, at, breed) : extendCatzFrame(frame, breed)
    );
  forBreed.set(frames, made);
  return made;
}
