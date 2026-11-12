/**
 * The dog dangling by the scruff, swinging from the cursor: a weight on a
 * spring (`ScriptSprite::Fizziks`, seg7:4f08), and the tilt and spin it gives
 * the dog (`ScriptSprite::RotatoPet`, seg7:5340). The engine keeps one, in its
 * data segment (`ds:0x1318` the velocity, `0x1324` the place), started by cue
 * 11 of the pick-up (`ProcessCue`, seg7:7cc1, the sprite's `+0x210e` 2) and
 * run every tick until `ResetParams` stops it.
 *
 * Its place is the weight's from the cursor: x across, y down, z the
 * cursor's up and down taken as depth. Each tick the cursor's move pulls it
 * by a spring of rest length 52, gravity 16 over 4 adds to its fall, and
 * 0.95 of its velocity is kept. Each number is cut to a whole one where the
 * engine keeps it in a word.
 */

import { cosine, sine } from '../render/project.ts';

/** A number cut toward 0, as `__ftol` does, into a word. */
const word = (n: number) => Math.trunc(n);

/** An angle into −128 to 128 (seg11:1f32). */
const wrap = (angle: number) => {
  while (angle < -128) angle += 256;
  while (angle > 128) angle -= 256;
  return angle;
};

/** The engine's 2π, `ds:0x13a2`, and its π, `ds:0x1396`. */
const TWO_PI = 6.283;
const PI = 3.1415;

export class Swing {
  /** Its velocity (`ds:0x1318`). */
  v = [0, 0, 0];

  /** Its place from the cursor (`ds:0x1324`). */
  p = [0, 0, 0];

  /** The spring's pull last worked out, kept where the spring has no length. */
  private unit = [0, 0, 0];

  /**
   * Started (`+0x210e` 2): still, 10 out the way the dog faces, 50 below
   * (seg7:4f6e to 4fde): across by the sine of its rotation (`ds:0x3b62`),
   * in depth by its cosine (`ds:0x3b5e`).
   */
  constructor(rotation: number) {
    const r = wrap(rotation);
    this.p = [-Math.floor((sine(r) * 10) / 256), 50, -Math.floor((cosine(r) * 10) / 256)];
  }

  /** A tick (seg7:4fe8 to 52fa), the cursor having moved by `dx`, `dy`. */
  step(dx: number, dy: number) {
    const [v, p] = [this.v, this.p];
    /* Where the spring pulls to: the cursor's move, its up and down as depth, reversed. */
    const target = [dx, 0, word(dy * -1)];
    const s = target.map((t, n) => t - p[n]);
    const length = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);

    if (length > 0.1) {
      this.unit = s.map((each) => Math.fround(each / length));
    }

    const stretch = length - 52;
    const force = this.unit.map((each) => Math.fround(-each * stretch));
    const gravity = [0, 16, 0];

    for (let n = 0; n < 3; n++) {
      v[n] = word(v[n] + gravity[n] / 4);
    }

    p[0] = word(p[0] + (v[0] - dx - force[0]));
    p[1] = word(p[1] + (v[1] - force[1]));
    p[2] = word(p[2] + (v[2] - dy - force[2]));

    for (let n = 0; n < 3; n++) {
      v[n] = word(v[n] - force[n] / 4);
    }

    for (let n = 0; n < 3; n++) {
      p[n] = p[n] === 0 ? 1 : p[n];
    }

    for (let n = 0; n < 3; n++) {
      v[n] = word(v[n] * 0.95);
    }
  }

  /**
   * The dog's spin and tilt from where the weight is (`RotatoPet`): turned
   * from its rotation by the weight's bearing across, and tilted by its
   * height over its distance out; where too near to say, 0 turned, and the
   * tilt left as it was (seg7:5340 to 54f8).
   */
  angles(rotation: number) {
    const [x, y, z] = this.p;
    const bearing = Math.abs(x) > 0.1 && Math.abs(z) > 0.1 ? Math.atan2(-x, -z) + PI : 0;
    const spin = wrap(word(rotation + (256 * bearing) / TWO_PI));
    const out = Math.sqrt(x * x + z * z);
    const tilt =
      Math.abs(word(out)) > 0.1 && Math.abs(y) > 0.1
        ? wrap(word(-((Math.atan2(y, out) * 256) / TWO_PI) + 64))
        : undefined;
    return { spin, tilt };
  }
}
