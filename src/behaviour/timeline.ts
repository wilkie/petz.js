/**
 * A script played out as the frames the dog shows, one a tick, with what
 * happens as each is shown: what `ScriptSprite::PushScript` expands a script
 * into and `PopScript` steps through (DOGZDLL.DLL seg7:47e8 and 57ce). The
 * sounds, the turns and the glue between frames are kept; blinks, the dog's
 * factors and the rest are not yet. See kb/formats/scp.md.
 */

import { type Element, type Operand, OP, type Script } from '../formats/script.ts';

/** One tick: the frame shown, and what happens as it is. */
export interface Step {
  frame: number;

  /** Sounds to play, by their number in the breed's sound list. */
  sounds?: number[];

  /**
   * A ball to keep where it was: the dog is moved so that this ball of this
   * frame is where it was in the frame before.
   */
  glue?: number;

  /** How far the dog turns, in 256ths of a turn. */
  turn?: number;
}

/** The ball a script glues by when it says none: the belly (`GetDefaultGlueBall`). */
export const DEFAULT_GLUE = 48;

/** Opcodes this file plays that `script.ts` does not name. */
const SOUND_FIRST = 0x8ada;
const SOUND_LAST = 0x8ade;
const GLUE_CHEST = 0x8ad7;
const GLUE = 0x8ad8;
const TURN = 0x8ae5;

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

/** The steps a variant of a script plays out as, in order. */
export function timeline(
  scripts: Script[],
  index: number,
  variant: number,
  { flags, random, limit = 2000 }: TimelineOptions
): Step[] {
  const frames: Step[] = [];

  /* What happens with the next frame shown. */
  let pending: Omit<Step, 'frame'> = {};

  const show = (frame: number) => {
    frames.push({ frame, ...pending });
    pending = {};
  };

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
          show(element.frame);
          continue;
        }

        if (element.op >= SOUND_FIRST && element.op <= SOUND_LAST) {
          const choices = element.operands.map(value);
          pending.sounds = [...(pending.sounds ?? []), choices[random(choices.length)]];
          continue;
        }

        const [a, b, c] = element.operands;

        switch (element.op) {
          case OP.frames: {
            const first = value(a);
            const last = value(b);
            const step = first <= last ? 1 : -1;

            for (let frame = first; frame !== last + step && frames.length < limit; frame += step) {
              show(frame);
            }
            break;
          }
          case OP.framesToEnd: {
            let frame = value(a) - 1;

            do {
              show(++frame);
            } while (!(flags(frame) & END) && frames.length < limit);
            break;
          }
          case OP.framesToStart: {
            let frame = value(a) + 1;

            do {
              show(--frame);
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
          case GLUE_CHEST:
            pending.glue = 50;
            break;
          case GLUE:
            pending.glue = value(a);
            break;
          case TURN:
            // `1 turn x`: only the first operand of 1 turns the dog.
            if (value(a) === 1) {
              pending.turn = (pending.turn ?? 0) + value(b);
            }
            break;
          case OP.call: {
            const script = scripts[value(a)];
            const times = value(b);

            for (let n = 0; n < times && depth < 8 && script; n++) {
              /* Scripts are glued one to the next by the belly, unless one
               * says otherwise (GlueScriptsIfNotGlued). Inferred: not yet
               * read how. */
              pending.glue ??= DEFAULT_GLUE;
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
