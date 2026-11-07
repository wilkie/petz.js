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
export function catzToyTick(toy: CatzToy, area: CatzPenArea): CatzToyTicked {
  const ticked: CatzToyTicked = { rolled: false, bounces: 0 };

  if (!toy.friction || (!toy.v.x && !toy.v.y)) {
    toy.v = { x: 0, y: 0 };
    return ticked;
  }

  const rebound = toy.rebound >= 0 ? toy.rebound : toy.friction - 10;
  const next = { x: toy.at.x + toy.v.x, y: toy.at.y + toy.v.y };
  ticked.rolled = true;
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
