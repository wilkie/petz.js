/**
 * The dog's `Fudger`s (DOGZDLL.DLL seg4, made in `ScriptSprite`'s constructor
 * at seg7:0f5b on): each eases one of its numbers to a target a step a frame,
 * or drifts it. The scripts set them with `0x8ae6` to `0x8ae9`, by an axis:
 * one fudger, or from 12 a group of them by a mask (`theirMultiFudgeFilters`).
 * The rotation, axis 1, is played by the pet itself; these are the rest.
 * See kb/topics/behaviour.md, the dog's angles.
 */

/** The axes, by the names at seg7:00e3. */
export const AXIS = {
  tilt: 0,
  rotation: 1,
  spin: 2,
  roll: 3,
  leftEyelidHeight: 4,
  rightEyelidHeight: 5,
  leftEyelidTilt: 6,
  rightEyelidTilt: 7,
  headTrackMaxLeft: 8,
  headTrackMaxRight: 9,
  headTrackMaxUp: 10,
  headTrackMaxDown: 11,
} as const;

/** Each axis's mask (`+0x44`), as the constructor gives it. */
const MASKS = [9, 1, 9, 9, 2, 2, 4, 4, 0x10, 0x10, 0x20, 0x20];

/**
 * The masks of the group axes from 12 (seg27:0000): everything, both eyelid
 * heights, both eyelid tilts, then 1 and 8 — the rotation, and the tilt,
 * spin and roll — where the names say the head's left-right and up-down
 * limits. From 17, `HeadTrackMaxAll` on, 0: no fudger.
 */
const FILTERS = [0xffff, 2, 4, 1, 8];

/** Whether an axis or group axis takes in the fudger of an axis. */
export function selects(axis: number, of: number) {
  return axis < 12 ? axis === of : ((FILTERS[axis - 12] ?? 0) & MASKS[of]) !== 0;
}

export interface Fudger {
  axis: number;

  /** Its tilt, spin or roll goes round in 256ths of a turn (`AngleFudger`); the rest are numbers. */
  angle: boolean;

  value: number;
  target: number;

  /** The step a frame toward the target, 0 when there (`+0x3e`). */
  by: number;

  /** A step every frame, 0 for none (`+0x42`). */
  drift: number;
}

/** An angle into -128 to 128 (seg11:1f32). */
function wrap(angle: number) {
  let wrapped = angle;

  while (wrapped < -0x80) {
    wrapped += 0x100;
  }

  while (wrapped > 0x80) {
    wrapped -= 0x100;
  }

  return wrapped;
}

/** The fudgers but the rotation's, as the constructor starts them: angles level, the eyelids and the head's reach 100. */
export function makeFudgers(): Fudger[] {
  return MASKS.flatMap((_, axis) =>
    axis === AXIS.rotation
      ? []
      : [
          {
            axis,
            angle: axis <= AXIS.roll,
            value: axis >= AXIS.headTrackMaxLeft || axis === 4 || axis === 5 ? 100 : 0,
            target: 0,
            by: 0,
            drift: 0,
          },
        ]
  );
}

/** How far it is to go to a target (`BestDiff`): the short way round, for an angle. */
function difference(fudger: Fudger, to: number) {
  return fudger.angle ? wrap(to - fudger.value) : to - fudger.value;
}

/**
 * `SetTarget` (seg4:0e32, and `AngleFudger`'s, seg4:0e98): toward a target
 * by `speed` a frame — for an angle, whichever way round is shorter.
 */
export function setTarget(fudger: Fudger, to: number, speed: number) {
  if (fudger.angle) {
    let ahead = to;

    while (ahead < fudger.value) {
      ahead += 0x100;
    }

    fudger.target = wrap(to);
    fudger.by = ahead - fudger.value > 0x80 ? -speed : speed;
  } else {
    fudger.target = to;
    fudger.by = to - fudger.value < 0 !== speed < 0 ? -speed : speed;
  }
}

/**
 * `SetTargetFudge` (seg4:0f37), for `0x8ae6`: to a target over so many
 * frames, a whole step more than the share of each.
 */
export function fudgeTo(fudger: Fudger, to: number, frames: number) {
  setTarget(fudger, to, Math.trunc(Math.abs(difference(fudger, to)) / Math.max(1, frames)) + 1);
}

/** A frame: a step toward the target (`DoIncrement`, seg4:1094), then the drift (`DoDrift`, seg4:118e). */
export function fudgeFrame(fudger: Fudger) {
  const keep = (value: number) => (fudger.angle ? wrap(value) : value);

  if (fudger.by !== 0) {
    if (Math.abs(difference(fudger, fudger.target)) < Math.abs(fudger.by)) {
      fudger.value = keep(fudger.target);
      fudger.by = 0;
    } else {
      fudger.value = keep(fudger.value + fudger.by);
    }
  }

  if (fudger.drift !== 0) {
    fudger.value = keep(fudger.value + fudger.drift);
  }
}
