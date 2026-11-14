/**
 * A script played out as the frames the dog shows, one a tick, with what
 * happens as each is shown: what `ScriptSprite::PushScript` expands a script
 * into and `PopScript` steps through (DOGZDLL.DLL seg7:47e8 and 57ce). The
 * sounds, the turns, the glue between frames, the cues and the easing of
 * the dog's rotation, the blinks and the eyelids are kept; the dog's factors
 * and the rest are not yet. See kb/formats/scp.md.
 */

import { type Element, type Operand, OP, type Script } from '../formats/script.ts';

/** A fudger set by a script: see `Step.fudges`. */
export interface Fudge {
  kind: 'ease' | 'by' | 'target' | 'drift';
  axis: number;
  to: number;
  speed?: number;
  frames?: number;
}

/** One tick: the frame shown, and what happens as it is. */
export interface Step {
  frame: number;

  /** Sounds to play, by their number in the breed's sound list. */
  sounds?: number[];

  /** Sounds yet to be chosen, each from its choices, as the frame is played (`deferSounds`). */
  soundChoices?: number[][];

  /**
   * A ball to keep where it was: the dog is moved so that this ball of this
   * frame is where it was in the frame before.
   */
  glue?: number;

  /** How far the dog turns, in 256ths of a turn. */
  turn?: number;

  /**
   * Turned by `8ae5 1 turn frame`: the dog turned about its middle, the
   * frame it shows set at the new angles where the old was
   * (`MoveFrameRectCenter`, seg10:2e53), and `frame` then the frame before,
   * which the next frame is glued from (`+0x104`, seg7:5cb5); -1 where a
   * pop ran dry after it, the frame before then the frame shown.
   */
  turnFrame?: number;

  /**
   * Ease the dog's rotation to this, in 256ths of a turn, over the frames
   * left in the script (`8ae6 1 to`). Read as a fudge to a target; how the
   * engine spreads it is inferred from `Fudger::SetTargetFudge`.
   */
  ease?: { to: number; frames: number };

  /** Turn by this much every frame from here on, 0 to stop (`8ae9 1 by`, `Fudger::DoDrift`). */
  drift?: number;

  /** Cues raised for the engine, by number (`8ae3 n`, `ScriptSprite::ProcessCue`). */
  cues?: number[];

  /**
   * Not shown, but the frame the next shown frame is placed by: a frame
   * followed by `8ad3` (`PopScript`, seg7:597b). See `placeByReference`.
   */
  reference?: boolean;

  /** An object grabbed into a slot of the dog's — 0 the mouth, 1 a paw — or let go of (`8b03`, `8b04`). */
  grab?: number;
  release?: number;

  /**
   * Where the head and eyes are to look (`PopScript`, seg7:5e98 on):
   * `8afa` at a random point, `8afb` at the user, `8afc` ahead
   * (`LookAtRandomPoint`, `LookAtUser`, `LookAhead`).
   */
  look?: 'random' | 'user' | 'ahead';

  /**
   * The dog's other fudgers set (`8ae6 axis to`, eased over the frames left
   * in the script; `8ae7 axis by speed`, `8ae8 axis to speed`; `8ae9 axis
   * by`, a drift), and the rotation's by `8ae7` and `8ae8`. See fudger.ts.
   */
  fudges?: Fudge[];

  /** A blink, so many frames shut, or the length a blink has, at 0 (`8ae1 n`, `DoBlink`). */
  blink?: number;

  /** How far the eyelids rest closed, in hundredths, 30 when negative (`8ae0 n`). */
  lids?: number;

  /** How many levels the fur bristles, added to every ball's fuzz (`8b01 n`). */
  bristle?: number;

  /**
   * Breathing with the heart from a reference frame (`8aff frame`), or no
   * longer (`8b00`, null): the frames' motion from it scaled by the heart rate.
   */
  breathe?: number | null;

  /**
   * The dog moved so many pixels across and down before this frame is
   * placed (`8aeb n`, `8aec n`: `PopScript`, seg7:5b71 to 5bc7): the
   * rectangle offset, then moved on by the frame. Script 5, put down from
   * the scruff, lowers it so onto the floor.
   */
  shift?: { x: number; y: number };

  /**
   * Glued later in a tick than an earlier pop, the old state's blend as that
   * pop left it (null, none), not as the frame before was drawn: see
   * `Stage.show`.
   */
  glueBlend?: { scale: number; reference: number } | null;
}

/** The ball a script glues by when it says none: the belly (`GetDefaultGlueBall`). */
export const DEFAULT_GLUE = 48;

/** Opcodes this file plays that `script.ts` does not name. */
const SOUND_FIRST = 0x8ada;
const SOUND_LAST = 0x8ade;
const GLUE_CHEST = 0x8ad7;
const GLUE = 0x8ad8;
const TURN = 0x8ae5;
const SHIFT_X = 0x8aeb;
const SHIFT_Y = 0x8aec;
const REFERENCE = 0x8ad3;
const GRAB = 0x8b03;
const RELEASE = 0x8b04;
const LIDS = 0x8ae0;
const BLINK = 0x8ae1;
const CUE = 0x8ae3;
const BREATHE = 0x8aff;
const STILL = 0x8b00;
const BRISTLE = 0x8b01;
const EASE = 0x8ae6;
const DRIFT = 0x8ae9;
const LOOKS = { 0x8afa: 'random', 0x8afb: 'user', 0x8afc: 'ahead' } as const;

const BY = 0x8ae7;
const TARGET = 0x8ae8;

/** The angle the fudge opcodes name the dog's rotation by. */
const ROTATION = 1;

/** A frame's sequence flags: the start of one, and the end. */
export const START = 1;
export const END = 2;

export interface TimelineOptions {
  /** Each frame's flags, numbered over every animation together: the word after its bounds. */
  flags: (frame: number) => number;

  /** A random number below `n`. */
  random: (n: number) => number;

  /**
   * A number below `n` from the game's table, as `PushScript` takes an
   * operand's (`0x8b05`, seg7:4b99) and `0x8b09`'s variants; without, `random`.
   */
  table?: (n: number) => number;

  /** Sounds left to be chosen as each frame is played (`soundChoices`), not as pushed. */
  deferSounds?: boolean;

  /** How many frames at most: a repeat of 999 is for ever. */
  limit?: number;

  /** What follows the script's last frame, which `PopScript` acts on before the next. */
  tail?: (after: Omit<Step, 'frame'>) => void;

  /**
   * A script called (`0x8b09 script times glue`), as `PushScript` pushes it
   * (seg7:4ae6 to 4ca0): handed the frames so far and what is pending, and
   * left to the caller, not played here. Without, called scripts are played
   * in place.
   */
  call?: (
    call: { script: number; times: number; glue: number },
    frames: Step[],
    pending: Omit<Step, 'frame'>,
    element: Element
  ) => void;
}

/** The steps a variant of a script plays out as, in order. */
export function timeline(
  scripts: Script[],
  index: number,
  variant: number,
  { flags, random, table = random, deferSounds = false, limit = 2000, tail, call }: TimelineOptions
): Step[] {
  const frames: Step[] = [];

  /* What happens with the next frame shown. */
  let pending: Omit<Step, 'frame'> = {};

  /* Eases, whose frames are counted once the script is played out. */
  const eases: Step[] = [];

  const fudge = (each: Fudge) => {
    pending.fudges = [...(pending.fudges ?? []), each];
  };

  const show = (frame: number) => {
    const step = { frame, ...pending };

    if (step.ease || step.fudges?.some((each) => each.kind === 'ease')) {
      eases.push(step);
    }

    frames.push(step);
    pending = {};
  };

  /* A random operand is drawn once as the script is pushed, its value
   * written into the queue (seg7:4ae0), so a block repeated has it again. */
  const drawn = new Map<Operand, number>();
  const value = (operand: Operand) => {
    if (typeof operand === 'number') {
      return operand;
    }

    if (!drawn.has(operand)) {
      drawn.set(
        operand,
        operand.random[0] + table(Math.max(1, operand.random[1] - operand.random[0] + 1))
      );
    }

    return drawn.get(operand)!;
  };

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

          /* (Kept to be chosen as the frame is played, where asked: `PopScript` draws then, seg7:620a.) */
          if (deferSounds) {
            pending.soundChoices = [...(pending.soundChoices ?? []), choices];
          } else {
            pending.sounds = [...(pending.sounds ?? []), choices[random(choices.length)]];
          }
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
            const count = value(a);
            const times = count === 999 ? Infinity : count;
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
          case GRAB:
            pending.grab = value(a);
            break;
          case RELEASE:
            pending.release = value(a);
            break;
          case REFERENCE:
            if (frames.length) {
              frames[frames.length - 1].reference = true;
            }
            break;
          case LIDS:
            pending.lids = value(a);
            break;
          case BLINK:
            pending.blink = value(a);
            break;
          case BREATHE:
            pending.breathe = value(a);
            break;
          case STILL:
            pending.breathe = null;
            break;
          case BRISTLE:
            pending.bristle = value(a);
            break;
          case CUE:
            pending.cues = [...(pending.cues ?? []), value(a)];
            break;
          case EASE:
            if (value(a) === ROTATION) {
              pending.ease = { to: value(b), frames: frames.length };
            } else {
              fudge({ kind: 'ease', axis: value(a), to: value(b), frames: frames.length });
            }
            break;
          case BY:
            fudge({ kind: 'by', axis: value(a), to: value(b), speed: value(c) });
            break;
          case TARGET:
            fudge({ kind: 'target', axis: value(a), to: value(b), speed: value(c) });
            break;
          case 0x8afa:
          case 0x8afb:
          case 0x8afc:
            pending.look = LOOKS[element.op];
            break;
          case DRIFT:
            if (value(a) === ROTATION) {
              pending.drift = value(b);
            } else {
              fudge({ kind: 'drift', axis: value(a), to: value(b) });
            }
            break;
          case SHIFT_X:
          case SHIFT_Y: {
            const shift = pending.shift ?? { x: 0, y: 0 };
            pending.shift =
              element.op === SHIFT_X
                ? { ...shift, x: shift.x + value(a) }
                : { ...shift, y: shift.y + value(a) };
            break;
          }
          case TURN:
            // `1 turn frame`: only the first operand of 1 turns the dog.
            if (value(a) === 1) {
              pending.turn = (pending.turn ?? 0) + value(b);
              /* And the frame before taken as `frame`, the dog turned about its middle (seg7:5c26 to 5cdb). */
              pending.turnFrame = value(c);
            }
            break;
          case OP.call: {
            if (call) {
              call({ script: value(a), times: value(b), glue: value(c) }, frames, pending, element);
              pending = {};
              break;
            }

            const script = scripts[value(a)];
            const times = value(b);

            for (let n = 0; n < times && depth < 8 && script; n++) {
              /* Scripts are glued one to the next by the belly, unless one
               * says otherwise (GlueScriptsIfNotGlued). Inferred: not yet
               * read how. */
              pending.glue ??= DEFAULT_GLUE;
              play(script.variants[table(script.variants.length)], depth + 1);
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

  if (Object.keys(pending).length) {
    tail?.(pending);
  }

  /* An ease is spread over the frames from where it is to the script's end. */
  for (const step of eases) {
    if (step.ease) {
      step.ease = { to: step.ease.to, frames: frames.length - step.ease.frames };
    }

    step.fudges = step.fudges?.map((each) =>
      each.kind === 'ease' ? { ...each, frames: frames.length - each.frames! } : each
    );
  }

  return frames;
}
