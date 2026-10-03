/**
 * Drawing as Dogz draws: into a bitmap of palette indices, a ball at a time,
 * a row of pixels at a time. kb/topics/drawing-a-dog.md is the read-out
 * this follows, from `XDrawPort::InitCircleLookup` and
 * `XDrawPort::XFillPartialCircleKernel` in DOGZDLL.DLL.
 *
 * A ball of radius r is drawn in a square 2r across, as a circle of
 * diameter D = 2r - 1: rows 1 to D - 1 down from the square's top, row i
 * as wide as `sqrt(D² - (D - 2i)²)`, centred, and moved right by the
 * ball's fuzz from a table made once at random. It is filled in the ball's
 * colour; by its outline type, with a pixel of the outline colour before
 * each row (0, a half outline), that many pixels of it at each end and that
 * many whole rows at top and bottom (more than 0), or none (-1); and, but
 * for a full outline, one speckle in each row of its upper half.
 */

import { FIDELITY } from './fidelity.ts';
import { sine } from './project.ts';

/** A bitmap of palette indices. `TRANSPARENT` is nothing drawn. */
export class IndexedBitmap {
  static readonly TRANSPARENT = -1;
  readonly width: number;
  readonly height: number;
  readonly pixels: Int16Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Int16Array(width * height).fill(IndexedBitmap.TRANSPARENT);
  }

  set(x: number, y: number, colour: number) {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.pixels[y * this.width + x] = colour;
    }
  }

  get(x: number, y: number) {
    return this.pixels[y * this.width + x];
  }

  /** A row of pixels, from `x` for `length`. */
  span(x: number, y: number, length: number, colour: number) {
    for (let at = 0; at < length; at++) {
      this.set(x + at, y, colour);
    }
  }

  /** As RGBA, through a palette of RGB triples, transparent where nothing is drawn. */
  toRgba(palette: readonly (readonly [number, number, number])[]) {
    const rgba = new Uint8ClampedArray(this.width * this.height * 4);

    this.pixels.forEach((index, at) => {
      if (index !== IndexedBitmap.TRANSPARENT) {
        const [red, green, blue] = palette[index] ?? [0, 0, 0];
        rgba.set([red, green, blue, 255], at * 4);
      }
    });

    return rgba;
  }
}

/** A small, seeded source of random numbers, so that a drawing can be made again. */
export function random(seed: number) {
  let state = seed >>> 0 || 1;

  return (below: number) => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return below > 0 ? state % below : 0;
  };
}

/** How wide a circle of diameter `d` is on row `r`, counting rows from 1. */
export function rowWidth(d: number, r: number) {
  return Math.floor(Math.sqrt(d * d - (d - 2 * r) * (d - 2 * r)));
}

export interface Ball {
  /** The ball's centre, in the bitmap's pixels. */
  x: number;
  y: number;
  diameter: number;
  colour: number;
  outlineColour: number;

  /** The speckles' colour, or -1 for none: then they are the ball's own. */
  speckleColour: number;

  /** -1 none, 0 a half outline, more than 0 an outline that thick. */
  outline: number;

  /** Up to 7. */
  fuzz: number;
}

/** The largest diameter `InitCircleLookup` makes tables for. */
const LARGEST = 119;

/**
 * The tables `InitCircleLookup` (seg8:200f) makes once, with `rand()`:
 * for every diameter to 119 and each of its rows, for each fuzz level 0 to
 * 7 how far right the row is moved, `rand() % (level + 1)`, then where in it
 * its speckle goes, `rand() % (width + 1)`; and, first, the rows' moves for
 * the full outlines, 256 to a level (`XInitScreenPort`, seg8:14d7).
 */
export interface CircleTables {
  /** By level, then the diameter's rows from `d(d - 1) / 2`. */
  fuzz: Int8Array[];
  /**
   * By level, then diameter: the move every row of the diameter is less by.
   * The kernel steps from row to row by the difference of their moves, and
   * the table starts each diameter from the last move of the one before
   * (`InitCircleLookup` never resets it), so a whole ball sits that much left.
   */
  carry: Int8Array[];
  speckle: Int8Array;
  /** By level, a row each. */
  outline: Int8Array[];
}

const tables = new Map<number, CircleTables>();

/** The circle tables, made with Borland's `rand` from a seed, once each. */
export function circleTables(seed = 1): CircleTables {
  const made = tables.get(seed);

  if (made) {
    return made;
  }

  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 0x015a4e35) + 1) >>> 0;
    return (state >>> 16) & 0x7fff;
  };
  const size = (LARGEST * (LARGEST + 1)) / 2;
  const outline = Array.from({ length: 8 }, (_, level) =>
    Int8Array.from({ length: 256 }, () => rand() % (level + 1))
  );
  const fuzz = Array.from({ length: 8 }, () => new Int8Array(size));
  const carry = Array.from({ length: 8 }, () => new Int8Array(LARGEST + 1));
  const speckle = new Int8Array(size);
  const last = new Int8Array(8);

  for (let d = 1; d <= LARGEST; d++) {
    for (let level = 0; level < 8; level++) {
      carry[level][d] = last[level];
    }

    for (let r = 1; r <= d; r++) {
      const at = (d * (d - 1)) / 2 + r - 1;

      for (let level = 0; level < 8; level++) {
        fuzz[level][at] = rand() % (level + 1);
        last[level] = fuzz[level][at];
      }

      speckle[at] = rand() % (rowWidth(d, r) + 1);
    }
  }

  const result = { fuzz, carry, speckle, outline };

  /* A few kept: a session draws with one seed, a search with each in turn. */
  if (tables.size >= 4) {
    tables.delete(tables.keys().next().value!);
  }

  tables.set(seed, result);
  return result;
}

/** A ball's circle, as the kernel lays it out: its rows, each one's place and width. */

function circleRows(
  ball: { x: number; y: number; diameter: number },
  level: number,
  fuzz: CircleTables
) {
  const radius = Math.floor(Math.round(ball.diameter) / 2);
  const d = 2 * radius - 1;
  const x = Math.round(ball.x);
  const top = Math.round(ball.y) - radius;
  const inTable = d >= 1 && d <= LARGEST;
  const carry = inTable && FIDELITY.carriedFuzz ? fuzz.carry[level][d] : 0;
  const rows: {
    r: number;
    y: number;
    start: number;
    width: number;
    spot: number;
    speckled: boolean;
    edge: number;
  }[] = [];

  for (let r = 1; r < d; r++) {
    const width = rowWidth(d, r);
    /* The table's row for this one: counted from the top, or from the bottom. */
    const k = FIDELITY.bottomUp ? d - r : r;
    const at = (d * (d - 1)) / 2 + k - 1;
    rows.push({
      r,
      /* Both the kernel and XDrawLine find a row as the port's bottom less
       * it, where a bottom-up bitmap's row is that less one: so a ball's rows,
       * counted up from below its square, land a row lower than top-down. */
      y: top + r - (FIDELITY.bottomUp ? 0 : 1),
      /* The square's left, plus half of D rounded up, less half the width. */
      start: x - Math.floor(width / 2) + (inTable ? fuzz.fuzz[level][at] - carry : 0),
      width,
      spot: inTable ? fuzz.speckle[at] : 0,
      /* A speckle in each row of the upper half, as the kernel counts it either way up. */
      speckled: FIDELITY.bottomUp ? k > Math.trunc(d / 2) : k < Math.trunc(d / 2),
      /* The full outlines' rows: the square's left plus half what the row leaves. */
      edge: x - radius + Math.trunc((d - width) / 2) + fuzz.outline[level][(k - 1) & 0xff],
    });
  }

  return { rows, d };
}

/** Draws a ball as `XFillPartialCircleKernel` does in modes -1, 0 and above (seg8:3db8 on). */
export function fillBall(bitmap: IndexedBitmap, ball: Ball, fuzz: CircleTables = circleTables()) {
  const level = Math.max(0, Math.min(7, ball.fuzz));
  const { rows, d } = circleRows(ball, level, fuzz);
  const speckle = ball.speckleColour >= 0 ? ball.speckleColour : ball.colour;
  const thick = ball.outline;

  for (const { r, y, start, width, spot, speckled, edge } of rows) {
    if (thick > 0) {
      /* Whole rows of the outline at top and bottom, its ends between. */
      if (r <= thick || r >= d - thick) {
        bitmap.span(edge, y, width, ball.outlineColour);
      } else {
        bitmap.span(edge, y, thick, ball.outlineColour);
        bitmap.span(edge + thick, y, width - 1 - 2 * thick, ball.colour);
        bitmap.span(
          edge + thick + Math.max(0, width - 1 - 2 * thick),
          y,
          thick,
          ball.outlineColour
        );
      }

      continue;
    }

    if (thick === 0) {
      /* A pixel of the outline before the row, which is one shorter. */
      bitmap.set(start - 1, y, ball.outlineColour);
      bitmap.span(start, y, width - 1, ball.colour);
    } else {
      bitmap.span(start, y, width, ball.colour);
    }

    /* A speckle in each row of the upper half, anywhere to one past its end. */
    if (speckled) {
      bitmap.set(start + spot, y, speckle);
    }
  }
}

/**
 * Draws a ball shaded down its rows, as `XFillPartialCircleKernel` does in
 * mode -4 (seg8:37ae to 398e): the top `0.3` of its rows (at least one) go
 * from the ramp's eighth colour down through a quarter turn of the sine,
 * `sin × 256 >> 5`, to its first, which fills the rest. No outline, no
 * speckles; the rows' starts fuzzed as ever.
 */
export function fillShaded(
  bitmap: IndexedBitmap,
  ball: Pick<Ball, 'x' | 'y' | 'diameter' | 'fuzz'>,
  ramp: number,
  fuzz: CircleTables = circleTables()
) {
  const level = Math.max(0, Math.min(7, ball.fuzz));
  const { rows, d } = circleRows(ball, level, fuzz);
  const shaded = Math.max(1, Math.trunc(0.3 * d));
  const step = Math.trunc(((-1 / shaded) * 256) / 4) || -5;
  let phase = 0x40;

  for (const { y, start, width } of rows) {
    const shade = Math.max(0, Math.min(7, sine(phase) >> 5));
    bitmap.span(start, y, width, phase > 0 ? ramp + shade : ramp);
    phase += step;
  }
}

/** An angle in 256ths of a turn, brought within -128 to 128 (seg11:1f32). */
export function wrapAngle(angle: number) {
  let wrapped = angle;

  while (wrapped < -0x80) {
    wrapped += 0x100;
  }

  while (wrapped > 0x80) {
    wrapped -= 0x100;
  }

  return wrapped;
}

/**
 * Covers part of a ball drawn in a square `d` across, centred at `x`, `y`, in one colour,
 * from one side up to a line, as `XFillPartialCircleKernel` does in mode -2
 * (seg8:3995 to 3db5): an eyelid. `cover` rows are covered, from the top
 * when the line is level (the angle within 2 of 0), from the bottom when it
 * is upside down (within 2 of 128); otherwise the line, `cover` in from the
 * edge, is turned by the angle, and each row filled from the line to its
 * end on the one side or the other, by the angle's sign.
 */
export function fillLid(
  bitmap: IndexedBitmap,
  {
    x,
    y,
    d,
    colour,
    cover,
    angle,
  }: { x: number; y: number; d: number; colour: number; cover: number; angle: number }
) {
  /* The eye's square is `d` across; its circle one less, as every ball's. */
  const rows = d - 1;
  const top = Math.round(y) - Math.floor(d / 2);
  const rectLeft = Math.round(x) - Math.floor(d / 2);
  const across = d;
  const a = wrapAngle(angle);
  const row = (r: number) => {
    const width = rowWidth(rows, r);
    return { width, start: Math.round(x) - Math.floor(width / 2), y: top + r - 1 };
  };

  if (a > -3 && a < 3) {
    for (let r = 1; r < Math.min(cover, rows); r++) {
      const { width, start, y: at } = row(r);
      bitmap.span(start, at, width, colour);
    }

    return;
  }

  if (a > 0x7d || a < -0x7d) {
    for (let r = rows - cover + 2; r < rows; r++) {
      if (r >= 1) {
        const { width, start, y: at } = row(r);
        bitmap.span(start, at, width, colour);
      }
    }

    return;
  }

  /* The line through the point `cover` in from the edge, turned: where it
   * crosses each row, from the ball's rectangle's left, a slope a row. */
  const offset = Math.trunc(rows / 2) - cover;
  const theta = (wrapAngle(a + 0x40) * 6.283) / 256;
  const slope = -Math.tan(theta);
  let at =
    (Math.sin(theta) * offset + Math.trunc(-rows / 2)) * slope +
    (Math.cos(theta) * -offset + Math.trunc(across / 2));

  for (let r = 1; r < rows; r++, at += slope) {
    const { width, start, y: rowY } = row(r);
    const from = start - rectLeft;

    if (a > 0 && a <= 0x80) {
      /* Right of the line. */
      if (across < at) {
        continue;
      }

      const p = at < 0 ? -Infinity : Math.trunc(at);

      if (p > from) {
        const length = width - (p - from);

        if (length >= 0) {
          bitmap.span(rectLeft + p, rowY, length, colour);
        }
      } else {
        bitmap.span(start, rowY, width, colour);
      }
    } else if (at >= 0) {
      /* Left of it. */
      const n = across < at ? width : Math.min(Math.trunc(at) - from, width);

      if (n > 0) {
        bitmap.span(start, rowY, n, colour);
      }
    }
  }
}

/**
 * The speckle colour `Ballz::GenerateSpeckleColors` gives a ball: its colour
 * reflected within its ramp, so a dark shade speckles light and a light one
 * dark. The ramps are `length` colours from `first`: 6 from 16 on a
 * 256-colour display, 1 from 0 on a 16-colour one. A colour below `first`,
 * or a ball the breed gives no speckles, keeps what it has.
 */
export function speckleColour(colour: number, speckle: number, first: number, length: number) {
  if (speckle < 0 || colour < first) {
    return speckle;
  }

  const start = first + Math.floor((colour - first) / length) * length;
  return start + (start + length - 1 - colour);
}

/**
 * A line between two points as `XDrawPort::XDrawLine` draws one (seg8:4fda):
 * a four-cornered shape, each end `width` out either side of its point,
 * square to the line (`width × the line's direction / its length`, rounded
 * toward 0), the corners kept on the bitmap. It is filled a row at a time
 * from the top corner down, its two edges stepped by their slopes in
 * 1024ths, each row's first and last pixels black (0) and the colour
 * between; an edge turns toward the next corner when the row of the one
 * it was heading for is reached. The last corner's row is not drawn.
 */
export function drawLine(
  bitmap: IndexedBitmap,
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromWidth: number,
  toWidth: number,
  colour: number
) {
  /* On a bottom-up bitmap the points are turned upside down first, from the
   * port's bottom (seg8:505e), and the quad is scanned in memory's order,
   * from the bottom up, so its edges round the other way; the port's bottom
   * less a point is the row above the point's on such a bitmap, so a line
   * lands a row higher than top-down, as a ball lands a row lower. */
  const { width, height } = bitmap;
  const flip = (y: number) => (FIDELITY.bottomUp ? height - y : y);
  const [ax, ay, bx, by] = [from.x, flip(from.y), to.x, flip(to.y)].map(Math.trunc);
  const [px, py] = [by - ay, ax - bx];
  const length = Math.trunc(Math.sqrt(px * px + py * py));

  if (length === 0) {
    return;
  }

  const offset = (width: number) => [
    Math.trunc((px * width) / length),
    Math.trunc((py * width) / length),
  ];
  const [fx, fy] = offset(fromWidth);
  const [tx, ty] = offset(toWidth);
  const keep = (value: number, size: number) => Math.max(0, Math.min(size - 1, value));
  const corners = [
    [ax + fx, ay + fy],
    [ax - fx, ay - fy],
    [bx - tx, by - ty],
    [bx + tx, by + ty],
  ].map(([x, y]) => ({ x: keep(x, width), y: keep(y, height) }));

  /* The corners from the top down, by four passes of swaps (seg8:5165). */
  const order = [0, 1, 2, 3];

  for (let pass = 0; pass < 4; pass++) {
    for (let n = 0; n < 3; n++) {
      if (corners[order[n + 1]].y < corners[order[n]].y) {
        [order[n], order[n + 1]] = [order[n + 1], order[n]];
      }
    }
  }

  const slope = (from: number, toward: number) => {
    const dx = corners[toward].x - corners[from].x;
    const dy = corners[toward].y - corners[from].y;
    return dy === 0 ? dx * 1024 : Math.trunc((dx * 1024) / dy);
  };

  const top = order[0];
  let ahead = (top + 3) % 4;
  let behind = (top + 1) % 4;
  let rightSlope = slope(top, ahead);
  let leftSlope = slope(top, behind);

  /* The steeper to the right is the right edge. */
  if (rightSlope < leftSlope) {
    [ahead, behind] = [behind, ahead];
    [rightSlope, leftSlope] = [leftSlope, rightSlope];
  }

  let left: number;
  let right: number;

  if (corners[order[1]].y === corners[top].y) {
    /* The top edge level: from its two ends (seg8:54ca). */
    right = Math.max(corners[order[1]].x, corners[top].x);
    left = Math.min(corners[order[1]].x, corners[top].x);
  } else {
    left = right = corners[top].x;
  }

  let [leftPart, rightPart] = [0, 0];
  let row = corners[top].y;
  let rows = corners[order[1]].y - corners[top].y;

  const step = (at: number, part: number, by: number): [number, number] => {
    part += by;

    while (part > 0x400) {
      part -= 0x400;
      at++;
    }

    while (part < -0x400) {
      part += 0x400;
      at--;
    }

    return [at, part];
  };

  for (let segment = 0; segment < 3; segment++) {
    for (let n = rows - 1; n >= 0; n--, row++) {
      [left, leftPart] = step(left, leftPart, leftSlope);
      [right, rightPart] = step(right, rightPart, rightSlope);
      const y = FIDELITY.bottomUp ? height - 1 - row : row;
      bitmap.set(left, y, 0);

      if (right - left - 1 > 0) {
        bitmap.span(left + 1, y, right - left - 1, colour);
        bitmap.set(right, y, 0);
      }
    }

    const reached = order[segment + 1];

    if (segment < 2) {
      rows = corners[order[segment + 2]].y - corners[reached].y;
    }

    if (reached === ahead) {
      ahead = (ahead + 3) % 4;
      rightSlope = slope(reached, ahead);
    }

    if (reached === behind) {
      behind = (behind + 1) % 4;
      leftSlope = slope(reached, behind);
    }
  }
}
