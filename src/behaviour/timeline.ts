/**
 * A script played out as the frames the dog shows, one a tick: what
 * `ScriptSprite::PushScript` expands a script into and `PopScript` steps
 * through (DOGZDLL.DLL seg7:47e8 and 57ce), less everything that is not a
 * frame -- sounds, blinks, moves, the dog's factors -- which is not yet read.
 * See kb/formats/scp.md.
 */

import { type Element, type Operand, OP, type Script } from '../formats/script.ts';

/** A frame's sequence flags: the start of one, and the end. */
export const START = 1;
export const END = 2;

export interface TimelineOptions {
  /** Each frame's flags, numbered over every animation together: the word after its bounds. */
  flags: (frame: number) => number;

  /** A random number below `n`. */
  random: (n: number) => number;

  /** How many frames at most: a repeat of 999 is for ever. */
  limit?: number;
}

/** The frames a variant of a script shows, in order. */
export function timeline(
  scripts: Script[],
  index: number,
  variant: number,
  { flags, random, limit = 2000 }: TimelineOptions
): number[] {
  const frames: number[] = [];

  const value = (operand: Operand) =>
    typeof operand === 'number'
      ? operand
      : operand.random[0] + random(Math.max(1, operand.random[1] - operand.random[0] + 1));

  const play = (elements: Element[], depth: number) => {
    let at = 0;

    const block = (): void => {
      while (at < elements.length && frames.length < limit) {
        const element = elements[at++];

        if ('frame' in element) {
          frames.push(element.frame);
          continue;
        }

        const [a, b, c] = element.operands;

        switch (element.op) {
          case OP.frames: {
            const first = value(a);
            const last = value(b);
            const step = first <= last ? 1 : -1;

            for (let frame = first; frame !== last + step && frames.length < limit; frame += step) {
              frames.push(frame);
            }
            break;
          }
          case OP.framesToEnd: {
            let frame = value(a) - 1;

            do {
              frames.push(++frame);
            } while (!(flags(frame) & END) && frames.length < limit);
            break;
          }
          case OP.framesToStart: {
            let frame = value(a) + 1;

            do {
              frames.push(--frame);
            } while (!(flags(frame) & START) && frames.length < limit);
            break;
          }
          case OP.repeat: {
            const times = value(a) === 999 ? Infinity : value(a);
            const from = at;

            for (let n = 0; n < times && frames.length < limit; n++) {
              at = from;
              block();
            }
            break;
          }
          case OP.endRepeat:
            return;
          case OP.call: {
            const script = scripts[value(a)];
            const times = value(b);

            for (let n = 0; n < times && depth < 8 && script; n++) {
              play(script.variants[random(script.variants.length)], depth + 1);
            }

            void c;
            break;
          }
        }
      }
    };

    block();
  };

  play(scripts[index].variants[variant], 0);
  return frames;
}
