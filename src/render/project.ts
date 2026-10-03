/**
 * From a frame's balls to where Dogz draws them on the screen: scaled,
 * turned to face the way the dog faces, tilted to be seen from a little
 * above, as `Ballz::GetCartesianCoordinates` does it (DOGZDLL.DLL
 * seg10:367a). The scales are the breed's, by the dog's age, as
 * `PetModule::SetBallScaleFromAge` sets them (seg21:4c4c). See
 * kb/topics/drawing-a-dog.md.
 *
 * Fixed point, as the game is: angles in 256ths of a turn, sines and
 * cosines times 256, products shifted right by 8.
 */

import { type AnimationHeader, type Frame } from '../formats/animation.ts';
import { type Breed } from '../formats/lnz.ts';

/** The dog's tilt, spin and roll (`BallState` `+0xe`, `+0x10`, `+0x12`), in 256ths of a turn. */
export interface Angles {
  tilt: number;
  spin: number;
  roll: number;
}

/** Each eyelid's height, the share of the eye it may leave open, in hundredths, and its tilt. */
export interface Eyelids {
  left: { height: number; tilt: number };
  right: { height: number; tilt: number };
}

/** The angle of a point from the origin, in 256ths of a turn (seg11:1e8a, as `atan2`). */
export function angle256(y: number, x: number) {
  return Math.trunc((Math.atan2(y, x) * 128) / Math.PI);
}

/** The game's sine and cosine of an angle in 256ths of a turn, times 256. */
export function sine(angle: number) {
  return Math.trunc(Math.sin((angle * Math.PI) / 128) * 256);
}

function cosine(angle: number) {
  return Math.trunc(Math.cos((angle * Math.PI) / 128) * 256);
}

/** An angle into -128 to 128. */
function wrap(angle: number) {
  return ((((angle + 128) % 256) + 256) % 256) - 128;
}

/** Fixed-point products shift right as the game's longs do: rounding down. */
const shift = (value: number) => Math.floor(value / 256);

export interface Scales {
  /** Frame units to pixels, in 256ths, for positions. */
  pet: number;

  /** And for balls' sizes. */
  ball: number;
}

/**
 * The scales for a breed at an age from 0, a puppy, to 100, as
 * `SetBallScaleFromAge` makes them from `[Default Scales]`: the adult's pet
 * and ball scales, then the puppy's.
 */
export function scalesForAge(breed: Breed, age: number): Scales {
  const [adultPet, adultBall, puppyPet, puppyBall] = breed.defaultScales;
  const between = (adult: number, puppy: number) =>
    Math.trunc((age * (adult - puppy)) / 100) + puppy;

  return { pet: between(adultPet, puppyPet), ball: between(adultBall, puppyBall) };
}

/**
 * A ball's size before scaling, as `Ballz::LoadSpecialBallInfo` and
 * `SetPuppiness` make it: the skeleton's, with half the breed's
 * `[Ball Size Diffs]`, and half its `[Puppy Balls]` in proportion to how much
 * of a puppy the dog is, from 0 to 100. Halves are C's, rounding toward 0.
 */
export function ballSize(breed: Breed, header: AnimationHeader, ball: number, puppiness: number) {
  const base = header.ballSizes[ball] + Math.trunc(breed.ballSizeDiffs[ball] / 2);
  return base + Math.trunc((Math.trunc(breed.puppyBalls[ball] / 2) * puppiness) / 100);
}

/** Where a ball is drawn, and how large, in pixels from the dog's origin. */
export interface Placed {
  x: number;
  y: number;

  /** Larger is farther from the viewer. */
  depth: number;
  diameter: number;
}

/**
 * The head turned toward what the dog looks at, as `Ballz::HeadTrackPrep`
 * (seg5:05ba) works it out each frame and `GetCartesianCoordinates` applies
 * it to the breed's head balls: turned by `yaw`, `pitch` and `roll` (in
 * 256ths of a turn) about the snout, then moved by `offset`.
 */
export interface Head {
  yaw: number;
  pitch: number;
  roll: number;
  offset: { x: number; y: number; z: number };

  /** Added to the snout's place before it is taken as the pivot. */
  drift: { x: number; y: number; z: number };
}

/** The ball the head turns about: the snout (offset 0x152 of a frame, `HeadTrackPrep`). */
export const HEAD_PIVOT = 56;

/**
 * Places each ball of a frame: scaled by the pet scale; the head turned,
 * if it is; rolled, spun and tilted by the dog's angles; turned by `yaw`
 * less the spin about the upright axis, then tilted by the pitch the game
 * derives from that, `-7 - |64 - |yaw|| / 10` in 256ths of a turn; sized
 * by `ballSize` (`GetCartesianCoordinates`, seg10:367a).
 */
export function project(
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  scales: Scales,
  yaw = 0,
  puppiness = 0,
  head?: Head,
  { tilt = 0, spin = 0, roll = 0 }: Partial<Angles> = {}
): Placed[] {
  const turn = wrap(yaw - spin);
  const pitch = -7 - Math.trunc(Math.abs(-Math.abs(turn) + 64) / 10);
  const [cy, sy, cp, sp] = [cosine(turn), sine(turn), cosine(pitch), sine(pitch)];
  const heads = head ? new Set(breed.headBalls) : null;
  const snout = frame.balls[HEAD_PIVOT];
  const pivot = head &&
    snout && {
      x: Math.trunc(shift(snout.x * scales.pet) + head.drift.x),
      y: Math.trunc(shift(snout.y * scales.pet) + head.drift.y),
      z: Math.trunc(shift(snout.z * scales.pet) + head.drift.z),
    };

  return frame.balls.map((ball, index) => {
    let x = shift(ball.x * scales.pet);
    let y = shift(ball.y * scales.pet);
    let z = shift(ball.z * scales.pet);

    /* The head turned about the snout (`GetCartesianCoordinates`, seg10:3c94 on): roll, then pitch, then yaw. */
    if (head && pivot && heads?.has(index)) {
      const [dx, dy, dz] = [x - pivot.x, y - pivot.y, z - pivot.z];
      const [cr, sr, cq, sq, cw, sw] = [
        cosine(head.roll),
        sine(head.roll),
        cosine(head.pitch),
        sine(head.pitch),
        cosine(head.yaw),
        sine(head.yaw),
      ];
      const a = shift(cr * dy - sr * dx);
      const b = shift(sr * dy + cr * dx);
      const e = shift(cq * dz - sq * a);
      x = shift(sw * e + cw * b) + head.offset.x + pivot.x;
      y = shift(sq * dz + cq * a) + head.offset.y + pivot.y;
      z = shift(cw * e - sw * b) + head.offset.z + pivot.z;
    }

    /* The dog's own angles: its roll in the screen's plane, its spin about
     * the upright axis, its tilt about the across one (seg10:3e19, 3e91 and 3f09). */
    if (roll) {
      [x, y] = [shift(sine(roll) * y + cosine(roll) * x), shift(cosine(roll) * y - sine(roll) * x)];
    }

    if (spin) {
      [x, z] = [shift(sine(spin) * z + cosine(spin) * x), shift(cosine(spin) * z - sine(spin) * x)];
    }

    if (tilt) {
      [y, z] = [shift(sine(tilt) * z + cosine(tilt) * y), shift(cosine(tilt) * z - sine(tilt) * y)];
    }

    // About the upright axis, then about the across one.
    const turnedZ = shift(cy * z - sy * x);
    const turnedX = shift(sy * z + cy * x);
    const depth = shift(cp * turnedZ - sp * y);
    const tiltedY = shift(sp * turnedZ + cp * y);

    /* Radius `size × ball scale >> 9`: the diameter is twice that. */
    const radius = Math.floor(
      (Math.max(0, ballSize(breed, header, index, puppiness)) * scales.ball) / 512
    );

    return { x: turnedX, y: tiltedY, depth, diameter: 2 * radius };
  });
}
