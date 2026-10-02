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

import { type AnimationHeader, type Frame } from '../formats/animation.js';
import { type Breed } from '../formats/lnz.js';

/** The game's sine and cosine of an angle in 256ths of a turn, times 256. */
function sine(angle: number) {
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

/** Where a ball is drawn, and how large, in pixels from the dog's origin. */
export interface Placed {
  x: number;
  y: number;

  /** Larger is farther from the viewer. */
  depth: number;
  diameter: number;
}

/**
 * Places each ball of a frame: scaled by the pet scale, turned by `yaw`
 * about the upright axis, then tilted by the pitch the game derives from
 * the yaw, `-7 - |64 - |yaw|| / 10` in 256ths of a turn.
 */
export function project(
  breed: Breed,
  header: AnimationHeader,
  frame: Frame,
  scales: Scales,
  yaw = 0
): Placed[] {
  const turn = wrap(yaw);
  const pitch = -7 - Math.trunc(Math.abs(-Math.abs(turn) + 64) / 10);
  const [cy, sy, cp, sp] = [cosine(turn), sine(turn), cosine(pitch), sine(pitch)];

  return frame.balls.map((ball, index) => {
    const x = shift(ball.x * scales.pet);
    const y = shift(ball.y * scales.pet);
    const z = shift(ball.z * scales.pet);

    // About the upright axis, then about the across one.
    const turnedZ = shift(cy * z - sy * x);
    const turnedX = shift(sy * z + cy * x);
    const depth = shift(cp * turnedZ - sp * y);
    const tiltedY = shift(sp * turnedZ + cp * y);

    /* Radius `size × ball scale >> 9`: the diameter is twice that. */
    const size = header.ballSizes[index] + breed.ballSizeDiffs[index];
    const radius = Math.floor((Math.max(0, size) * scales.ball) / 512);

    return { x: turnedX, y: tiltedY, depth, diameter: 2 * radius };
  });
}
