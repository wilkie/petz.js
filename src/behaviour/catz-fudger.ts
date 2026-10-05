/**
 * A Catz cat's `Fudger`s (CATZDLL.DLL segment 38): each eases one of its
 * numbers -- its rotation, roll and tilt, its head's, its eyelids', where
 * its eyes look -- toward a target, drifts it, lets an offset decay, spreads
 * a turn over some ticks, or swings it, once a tick (`Update`, 38:07ac),
 * between limits. The scripts set them through `ScriptSprite::PopScript`,
 * one fudger or a group (`UpdateRequestedFudgerList`, seg40:6141). See
 * kb/formats/scp.md, "How Catz plays them".
 *
 * Its arithmetic is the engine's: doubles where it keeps them, whole numbers
 * truncated toward 0 where it makes them, angles wrapped to -128..128.
 */

/** What a fudger's value is (`FudgeMode`, `+0xd8`): a number, an angle, or an angle whose differences are taken straight. */
export type CatzFudgeKind = 0 | 1 | 2;

/** What a fudger is doing (`+0xe2`). */
export const FUDGING = {
  off: 0,
  aim: 1,
  drift: 2,
  align: 3,
  decay: 4,
  swing: 5,
  suspended: 6,
} as const;

/** The default target that is none (`+0xb4`). */
const NONE = 0x55555555;

export interface CatzFudger {
  name: string;
  kind: CatzFudgeKind;

  /** `+0xe2`, and what `Suspend` kept of it (`+0xe4`). */
  state: number;
  saved: number;

  /** This tick's value and last tick's (`+0xc8`, `+0xc4`). */
  value: number;
  previous: number;

  /** Whether the value rose at the last update, and at the one before (`+0xcc`, `+0xce`). */
  rising: boolean;
  risingBefore: boolean;

  target: number;
  lower: number;
  upper: number;

  /** Aiming: speed (`+0xb8`, also a decay's offset left), step and top speed, damping (`+0x80`, `+0x90`, `+0xa0`). */
  velocity: number;
  step: number;
  top: number;
  damping: number;

  /** How many steps to top speed, and the stopping distance's divisor less 1 (`+0xb0`, `+0xb2`). */
  steps: number;
  divisor: number;

  /** What `Reset` puts back (`+0x88`, `+0x98`, `+0xa8`, `+0xb4`). */
  defaults: { step: number; top: number; damping: number; target: number };
  aimingOff: boolean;

  /** A step every tick (`+0xda`), and a decay's step (`+0xde`). */
  drift: number;
  decayStep: number;

  /** Aligning: its target, whether set up, how many ticks, how many done, the running total and its step (`+0xe6` to `+0xf8`). */
  align: { target: number; armed: boolean; ticks: number; done: number; sum: number; by: number };

  /** Swinging: the target before, the last change of target, its energy and direction (`+0x102`, `+0x10a`, `+0x10c`, `+0x11c`). */
  swing: { before: number; last: number; energy: number; direction: number };
}

/** A 16-bit word's value. */
const i16 = (n: number) => (n << 16) >> 16;

/** An angle into -128..128, both ends kept (seg48:1889). */
export function wrapCatzAngle(angle: number) {
  let a = i16(angle);

  while (a < -128) {
    a = i16(a + 256);
  }

  while (a > 128) {
    a = i16(a - 256);
  }

  return a;
}

/** From a to b the short way, as the engine works it (seg48:1857): one 256 off at most. */
function angleFrom(a: number, b: number) {
  let d = i16(b);

  while (d < i16(a)) {
    d = i16(d + 256);
  }

  d = i16(d - i16(a));
  return d > 128 ? i16(d - 256) : d;
}

/** A whole number and a double added and truncated toward 0, exactly, as the x87 does it in 80 bits. */
function truncSum(n: number, f: number) {
  const whole = Math.floor(f);
  const sum = n + whole;
  return (sum >= 0 || f === whole ? sum : sum + 1) | 0;
}

const wrapIfAngle = (fudger: CatzFudger, n: number) =>
  fudger.kind === 1 || fudger.kind === 2 ? wrapCatzAngle(n) : n;

/** A fudger as the constructor and `InitFudger` make it (38:0000, 0152). */
export function makeCatzFudger(name: string, kind: CatzFudgeKind): CatzFudger {
  return {
    name,
    kind,
    state: FUDGING.off,
    saved: FUDGING.off,
    value: 0,
    previous: 0,
    rising: false,
    risingBefore: false,
    target: 0,
    lower: -99999,
    upper: 99999,
    velocity: 0,
    step: 0,
    top: 0,
    damping: 0,
    steps: 0,
    divisor: -1,
    defaults: { step: 0, top: 0, damping: 0, target: NONE },
    aimingOff: false,
    drift: 0,
    decayStep: 0,
    align: { target: 0, armed: false, ticks: 0, done: 0, sum: 0, by: 0 },
    swing: { before: 0, last: 0, energy: 0, direction: 0 },
  };
}

/** Aims at a target (`SetAimTarget`, 38:0183): it moves there under its own speed. */
export function aimCatzFudger(fudger: CatzFudger, target: number) {
  fudger.target = wrapIfAngle(fudger, target);
  fudger.state = FUDGING.aim;
}

/** Drifts by a step every tick (`SetDriftTarget`, 38:0342). */
export function driftCatzFudger(fudger: CatzFudger, by: number) {
  fudger.state = FUDGING.drift;
  fudger.drift = by;
}

/** Swings toward a target (`SetSwingTarget`, 38:01d9). */
export function swingCatzFudger(fudger: CatzFudger, target: number) {
  const before = fudger.target;
  fudger.target = target;
  fudger.swing.before = before;

  if (fudger.state !== FUDGING.swing) {
    fudger.swing.before = target;
    fudger.swing.energy = 0;
    fudger.swing.last = 0;
  }

  fudger.state = FUDGING.swing;
}

/** Stops it (`DeactivateFudger`, 38:032a). */
export function stopCatzFudger(fudger: CatzFudger) {
  fudger.state = FUDGING.off;
}

/** Sets its top speed, in hundredths a tick, and its step from that (`SetAimRate`, 38:0367): at least 1. */
export function rateCatzFudger(fudger: CatzFudger, rate: number) {
  fudger.top = rate / 100;
  fudger.step = fudger.top / fudger.steps;

  if (1 > fudger.step) {
    fudger.step = 1;
  }
}

/** Sets and keeps its rate, steps, damping and divisor (`SetDefaultAimRate`, 38:03e6); a negative one left as it is. */
export function defaultCatzFudgerRate(
  fudger: CatzFudger,
  rate: number,
  steps: number,
  damping: number,
  divisor: number
) {
  if (steps >= 0) {
    fudger.steps = steps;
  }

  if (damping >= 0) {
    fudger.damping = damping / 100;
  }

  if (divisor >= 0) {
    fudger.divisor = divisor;
  }

  rateCatzFudger(fudger, rate);
  fudger.defaults = {
    ...fudger.defaults,
    step: fudger.step,
    top: fudger.top,
    damping: fudger.damping,
  };
}

/** Its rate and damping put back, and its default target aimed at, or it stopped without one (`Reset`, 38:0516). */
export function resetCatzFudger(fudger: CatzFudger) {
  fudger.top = fudger.defaults.top;
  fudger.step = fudger.defaults.step;
  fudger.damping = fudger.defaults.damping;

  if (fudger.defaults.target === NONE) {
    fudger.state = FUDGING.off;
  } else {
    aimCatzFudger(fudger, fudger.defaults.target);
  }
}

/** Holds it where it is (`Suspend`, 38:05c8), or lets it go on (`Resume`, 38:0640). */
export function suspendCatzFudger(fudger: CatzFudger) {
  if (fudger.state !== FUDGING.suspended) {
    fudger.saved = fudger.state;
    fudger.state = FUDGING.suspended;
  }
}

export function resumeCatzFudger(fudger: CatzFudger) {
  if (fudger.state === FUDGING.suspended) {
    fudger.state = fudger.saved;
  }
}

/** A turn spread over some ticks (`SetupAlign`, `AlignOverStepsGo`, 38:06af, 06ea): numbers from the value to the target, angles from the target to the value. */
export function alignCatzFudger(fudger: CatzFudger, target: number) {
  fudger.align.target = target;
  fudger.align.armed = true;
}

export function goAlignCatzFudger(fudger: CatzFudger, ticks: number) {
  if (!fudger.align.armed) {
    return;
  }

  const delta =
    fudger.kind === 1
      ? angleFrom(fudger.value, fudger.align.target)
      : i16(fudger.value - fudger.align.target);
  fudger.align = { ...fudger.align, armed: false, ticks, done: 0, sum: 0, by: delta / ticks };
  fudger.state = FUDGING.align;
}

/** Let an offset decay back by a step a tick (`DecayToTarget`, 38:026c). */
export function decayCatzFudger(fudger: CatzFudger, offset: number, step: number) {
  fudger.state = FUDGING.decay;
  fudger.velocity = offset;
  fudger.decayStep = step;
}

function aim(fudger: CatzFudger, input: number) {
  if (fudger.aimingOff) {
    fudger.value = input;
    return;
  }

  const { step, top, target } = fudger;
  const direction =
    fudger.kind === 0
      ? i16(target - input)
      : fudger.kind === 1
        ? angleFrom(input, target)
        : target - input;

  /* How far it would go braking from its speed now: at most 10,000 steps. */
  let v = fudger.velocity;
  const positive = 0 < v;
  let distance = 0;

  if (v !== 0) {
    for (let n = 0; n < 10000; n++) {
      distance += v;
      v += positive ? -step : step;

      if (0 < v !== positive) {
        break;
      }
    }
  }

  distance /= i16(fudger.divisor + 1);

  const moving =
    fudger.velocity > step ||
    fudger.velocity < -step ||
    target - input < fudger.velocity - step ||
    target - input > fudger.velocity + step;

  if (!moving) {
    fudger.velocity = 0;
    fudger.value = target;
  } else {
    const brake =
      (target >= input && distance >= target - input) ||
      (target <= input && distance <= target - input);

    fudger.velocity = brake
      ? fudger.velocity - (0 < fudger.velocity ? step : -step)
      : fudger.velocity + (direction > 0 ? step : -step);
    fudger.velocity = Math.max(-top, Math.min(top, fudger.velocity));
    fudger.value = truncSum(input, fudger.velocity);
  }

  fudger.velocity *= fudger.damping;
  fudger.value = wrapIfAngle(fudger, fudger.value);

  if (fudger.value <= fudger.lower) {
    fudger.value = fudger.lower;
    fudger.velocity = 0;
  }

  if (fudger.value >= fudger.upper) {
    fudger.value = fudger.upper;
    fudger.velocity = 0;
  }
}

function decay(fudger: CatzFudger, input: number) {
  const value = wrapIfAngle(fudger, truncSum(input, fudger.velocity));
  const wasPositive = i16(Math.trunc(fudger.velocity)) > 0;
  fudger.velocity += 0 < fudger.velocity ? -fudger.decayStep : fudger.decayStep;

  if (0 < fudger.velocity !== wasPositive) {
    fudger.state = FUDGING.off;
  }

  fudger.value = (value + fudger.drift) | 0;
}

function alignTick(fudger: CatzFudger, input: number) {
  const before = i16(Math.trunc(fudger.align.sum));
  fudger.align.sum += fudger.align.by;
  const after = i16(Math.trunc(fudger.align.sum));
  fudger.value = wrapIfAngle(fudger, (input + i16(after - before)) | 0);
  fudger.align.done = i16(fudger.align.done + 1);

  if (fudger.align.done >= fudger.align.ticks) {
    fudger.state = FUDGING.off;
  }
}

function swingTick(fudger: CatzFudger, input: number) {
  const { swing } = fudger;
  const change = i16(fudger.target - swing.before);
  const k = (change - swing.last) * swing.direction * 5;

  swing.energy =
    change - swing.last === (swing.direction > 0 ? 1 : 0) ? swing.energy - k : k + swing.energy;

  if (0 > swing.energy) {
    swing.direction = -swing.direction;
    swing.energy = -swing.energy;
  }

  swing.last = change;

  const height = (1 - Math.cos((input * 6.28318530717959) / 256)) * 256;
  let left = swing.energy - height;

  if (!(0 < left)) {
    swing.direction = input < 0 ? 1 : -1;
    swing.energy = height;
    left = Math.sqrt(swing.energy);
  }

  const speed = Math.sqrt(left) * 1.1;
  swing.energy -= left * 0.5;
  fudger.value = truncSum(input, swing.direction * speed);

  if (fudger.upper < input) {
    swing.direction = -1;
  } else if (fudger.lower > input) {
    swing.direction = 1;
  }
}

/**
 * A tick (`Update`, 38:07ac): the value worked out from the input, the
 * number it drives as it now is; kept within its limits; and, where it has
 * turned back by less than 2, held where it was.
 */
export function updateCatzFudger(fudger: CatzFudger, input: number) {
  fudger.previous = fudger.value;

  switch (fudger.state) {
    case FUDGING.off:
    case FUDGING.suspended:
      fudger.value = input;
      break;
    case FUDGING.aim:
      aim(fudger, input);
      break;
    case FUDGING.drift:
      fudger.value = wrapIfAngle(fudger, (input + fudger.drift) | 0);
      break;
    case FUDGING.align:
      alignTick(fudger, input);
      break;
    case FUDGING.decay:
      decay(fudger, input);
      break;
    case FUDGING.swing:
      swingTick(fudger, input);
      break;
  }

  fudger.value = Math.max(fudger.lower, Math.min(fudger.upper, fudger.value));
  fudger.risingBefore = fudger.rising;
  fudger.rising = fudger.value > fudger.previous;

  if (Math.abs(fudger.value - fudger.previous) < 2 && fudger.rising !== fudger.risingBefore) {
    fudger.value = fudger.previous;
  }

  return fudger.value;
}

/**
 * A cat's 14, as `ScriptSprite`'s constructor makes them (seg40:1210 on):
 * each its name, kind, rate, steps to top speed, damping and default
 * target; its limits; then reset. Its "XTrans" and "YTrans" are both made
 * over the left eyelid's tilt, so the last two are never made.
 */
export function makeCatzFudgers(): CatzFudger[] {
  const made: [string, CatzFudgeKind, number, number, number | null, number][] = [
    ['rotation', 1, 1000, 3, null, 0],
    ['roll', 1, 1000, 3, 0, 70],
    ['tilt', 1, 1000, 3, 0, 70],
    ['head rotation', 2, 1000, 3, 0, 80],
    ['head tilt', 1, 1000, 3, 0, 75],
    ['head cock', 1, 1000, 3, 0, 70],
    ['rEyelid height', 0, 5000, 3, 30, 0],
    ['lEyelid height', 0, 5000, 3, 30, 0],
    ['rEyelid tilt', 0, 1000, 3, 0, 0],
    ['YTrans', 0, 1000, 3, 0, 0],
    ['eyeTargetX', 0, 1000, 1, 0, 0],
    ['eyeTargetY', 0, 1000, 1, 0, 0],
  ];
  const fudgers = made.map(([name, kind, rate, steps, target, limit]) => {
    const fudger = makeCatzFudger(name, kind);
    defaultCatzFudgerRate(fudger, rate, steps, 90, 0);

    if (target === null) {
      fudger.aimingOff = true;
    } else {
      fudger.defaults.target = target;
    }

    if (limit) {
      [fudger.lower, fudger.upper] = [-limit, limit];
    }

    return fudger;
  });

  fudgers.push(makeCatzFudger('', 0), makeCatzFudger('', 0));
  fudgers.forEach(resetCatzFudger);
  return fudgers;
}

/** The fudgers a script's number names (`UpdateRequestedFudgerList`, seg40:6141): one, both eyelids' heights (14), both their tilts (15), all (16). */
export function requestedCatzFudgers(type: number): number[] {
  if (type >= 0 && type < 14) {
    return [type];
  }

  return type === 14 ? [6, 7] : type === 15 ? [8, 9] : type === 16 ? [...Array(14).keys()] : [];
}
