/**
 * The pen's things moving: a tick of a toy's physics, as the playpen moves
 * it (`XApt::ToyPhysics`, CATZDLL.DLL seg29:0140), and a swat's strike
 * (`XApt::StrikeToy`, seg29:073c). See kb/topics/catz-behaviour.md ("The
 * pen's things").
 */

import { cosine, sine } from '../render/project.ts';

/** A toy loose in the pen, as its physics read and write it. */
export interface CatzToy {
  /** Its target point, where it is. */
  at: { x: number; y: number };

  /** Its speed, across and down (`+0x13a`, `+0x13c`). */
  v: { x: number; y: number };

  /** How much of its speed it keeps a tick, in hundredths (`+0x21a`, its definition's): 0 for none moving. */
  friction: number;

  /** How much it keeps at a bounce, in hundredths (`+0x21c`); -1 for its friction less 10. */
  rebound: number;

  /** Half its grab rectangle's width and height (`GetGrabRect`, space 1), which it is kept that far in from the pen's edges by. */
  half: { x: number; y: number };

  /** Ticks into its rolling sound (`+0x23c`, 0 to 11): it sounds at 0. */
  rolls?: number;
}

/**
 * Its rolling sound (`XApt::PlayRollSound`, seg29:0073): at the start of
 * every twelve ticks rolling it plays (`XPlayStereoSound`), drawing C's
 * `rand` once, for its loudness. (Its bouncing sound, `PlayBounceSound`,
 * plays nothing.)
 */
function roll(toy: { rolls?: number }, random?: (n: number) => number) {
  if (!toy.rolls) {
    random?.(1);
  }

  toy.rolls = ((toy.rolls ?? 0) + 1) % 12;
}

/** The pen's rectangle on the stage: its window's client rectangle, less `PetParams` `+0xd8` and `+0xda`. */
export interface CatzPenArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a tick of its physics did besides moving it: whether it rolled, and how many times it bounced. */
export interface CatzToyTicked {
  rolled: boolean;
  bounces: number;
}

/** A number times a share in hundredths, as the engine works it -- the share a single-precision float -- rounded toward 0 (`__ftol`). */
const share = (n: number, hundredths: number) => Math.trunc(n * Math.fround(hundredths / 100));

/**
 * A tick of a toy's physics (`XApt::ToyPhysics`, seg29:0140): moving (its
 * speed not 0, and some friction), a rolling sound, and it moves by its
 * speed; its speed keeps its friction's share, rounded toward 0. Past an
 * edge of the pen -- less half its grab rectangle -- it is put at the edge,
 * and that way its speed turns back, its rebound's share (`+0x21c`, or its
 * friction less 10, `GetReboundTrackSpeed`): left, top, right, bottom, in
 * turn, each a bounce. Changes the toy.
 */
export function catzToyTick(
  toy: CatzToy,
  area: CatzPenArea,
  random?: (n: number) => number
): CatzToyTicked {
  const ticked: CatzToyTicked = { rolled: false, bounces: 0 };

  if (!toy.friction || (!toy.v.x && !toy.v.y)) {
    toy.v = { x: 0, y: 0 };
    toy.rolls = 0;
    return ticked;
  }

  const rebound = toy.rebound >= 0 ? toy.rebound : toy.friction - 10;
  const next = { x: toy.at.x + toy.v.x, y: toy.at.y + toy.v.y };
  ticked.rolled = true;
  roll(toy, random);
  toy.v = { x: share(toy.v.x, toy.friction), y: share(toy.v.y, toy.friction) };

  if (area.left + toy.half.x > next.x) {
    toy.v.x = share(-toy.v.x, rebound);
    next.x = area.left + toy.half.x;
    ticked.bounces++;
  }

  if (area.top + toy.half.y > next.y) {
    toy.v.y = share(-toy.v.y, rebound);
    next.y = area.top + toy.half.y;
    ticked.bounces++;
  }

  if (area.right - toy.half.x < next.x) {
    toy.v.x = share(-toy.v.x, rebound);
    next.x = area.right - toy.half.x;
    ticked.bounces++;
  }

  if (area.bottom - toy.half.y < next.y) {
    toy.v.y = share(-toy.v.y, rebound);
    next.y = area.bottom - toy.half.y;
    ticked.bounces++;
  }

  toy.at = next;
  return ticked;
}

/**
 * A toy struck (`XApt::StrikeToy`, seg29:073c): its speed, each way within
 * 50. A swat strikes at an angle, in 256ths of a turn (`DoCatSwatting`,
 * seg29:0eee on): 100 that way (seg48:1934, by the engine's tables of the
 * true π: across less its sine, down its cosine, each times 100 over 256,
 * rounded toward 0).
 */
export function catzStrikeSpeed(angle: number) {
  const clamp = (n: number) => Math.max(-50, Math.min(50, n));
  return {
    x: clamp(-Math.trunc((sine(angle, true) * 100) / 256)),
    y: clamp(Math.trunc((cosine(angle, true) * 100) / 256)),
  };
}

/** The jingle ball loose in the pen: as any toy, but its speed kept as single floats (`+0x242`, `+0x246`). */
export interface CatzJingleBall {
  at: { x: number; y: number };
  v: { x: number; y: number };
  half: { x: number; y: number };

  /** Ticks into its rolling sound (`+0x23c`). */
  rolls?: number;
}

/** The jingle ball's own, from the playpen's parameters: `PetParams` `+0x138` (its friction, from 400) and `+0x140` (how far its bounces turn it, in degrees). */
export interface CatzJingleParams {
  x138: number;
  x140: number;
}

/**
 * A tick of the jingle ball (`JingleBallSprite::ToyPhysics`, seg32:0a10):
 * its speed, single floats, moving it by their whole parts (rounded toward
 * 0) and then kept at (400 less `+0x138`) over 400, a single; within 0.01
 * either way, 0. Past an edge of the pen -- left, top, right, bottom, in
 * turn -- it is put at the edge and sent off again: its speed's size the
 * root of its whole parts' squares, its way that speed's turned back that
 * way (`atan2`), turned by `+0x140` less `rand() % (2 × +0x140 + 1)`
 * degrees, each a draw of C's `rand`. Rolling -- its sound, as any toy's
 * (`roll`) -- where the square of its speed, rounded toward 0, is over 6.
 * Changes the ball.
 */
export function catzJingleTick(
  ball: CatzJingleBall,
  area: CatzPenArea,
  { x138, x140 }: CatzJingleParams,
  random: (n: number) => number
): CatzToyTicked {
  const f32 = Math.fround;
  const ticked: CatzToyTicked = {
    rolled: Math.trunc(ball.v.x * ball.v.x + ball.v.y * ball.v.y) > 6,
    bounces: 0,
  };

  if (ticked.rolled) {
    roll(ball, random);
  }

  if (!ball.v.x && !ball.v.y) {
    ball.rolls = 0;
    return { rolled: false, bounces: 0 };
  }

  const keep = f32((400 - x138) / f32(400));
  const next = { x: ball.at.x + Math.trunc(ball.v.x), y: ball.at.y + Math.trunc(ball.v.y) };
  const stop = (n: number) => (n < 0.01 && n > -0.01 ? 0 : n);
  ball.v = { x: stop(f32(ball.v.x * keep)), y: stop(f32(ball.v.y * keep)) };

  /* Sent off again: from the way its speed goes, turned back on the axis it met. */
  const bounce = (y: number, x: number) => {
    const size = Math.sqrt(Math.trunc(ball.v.x) ** 2 + Math.trunc(ball.v.y) ** 2);
    let degrees = (Math.atan2(y, x) * f32(180)) / Math.PI;
    degrees += x140 - random(2 * x140 + 1);
    const radians = (degrees * Math.PI) / f32(180);
    ball.v = { x: f32(Math.cos(radians) * size), y: f32(Math.sin(radians) * size) };
    ticked.bounces++;
  };

  if (ball.v.x || ball.v.y) {
    if (area.left + ball.half.x > next.x) {
      bounce(ball.v.y, -ball.v.x);
      next.x = area.left + ball.half.x;
    }

    if (area.top + ball.half.y > next.y) {
      bounce(-ball.v.y, ball.v.x);
      next.y = area.top + ball.half.y;
    }

    if (area.right - ball.half.x < next.x) {
      bounce(ball.v.y, -ball.v.x);
      next.x = area.right - ball.half.x;
    }

    if (area.bottom - ball.half.y < next.y) {
      bounce(-ball.v.y, ball.v.x);
      next.y = area.bottom - ball.half.y;
    }
  }

  ball.at = next;
  return ticked;
}
