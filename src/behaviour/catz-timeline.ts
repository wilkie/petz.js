/**
 * A Catz script -- an action -- played out as the frames the cat shows, one
 * a tick, as `ScriptSprite` pushes and pops it (CATZDLL.DLL segments 40 and
 * 41; kb/formats/scp.md, "How Catz plays them"). Only the frames and the
 * reference frames between actions are kept, with the sounds and cues; the
 * fudgers, looks and layers are not played yet.
 */

import { type Element, type Operand, type Script } from '../formats/script.ts';

/** Catz's opcodes this file plays, by their names in CATZDLL.DLL's table. */
export const CATZ_OP = {
  startPos: 30000,
  actionDone: 30001,
  actionStart: 30002,
  alignScripts: 30003,
  cueCode: 30008,
  endLoop: 30014,
  endLoopAlign: 30015,
  playAction: 30025,
  rand: 30028,
  sequence: 30031,
  sequenceToEnd: 30032,
  sequenceToStart: 30033,
  soundPlay1: 30044,
  soundPlay5: 30048,
  startLoop: 30058,
  endPos: 30063,
} as const;

/** One tick of a Catz action. */
export interface CatzStep {
  frame: number;

  /** The action this frame is of, by its record. */
  action: number;

  /** Not shown, but the frame the next is placed by (`alignScripts0`, seg41:114d). */
  reference?: boolean;

  /**
   * Shown, but placed so the default glue ball is where it was in the frame
   * before: the first frame of each turn after the first of a loop ending
   * `endLoopAlign0` (seg41:03a2), which is how a walk goes on.
   */
  glue?: boolean;

  /** Sounds played as it is shown, one of each soundPlay's at random. */
  sounds?: number[];

  /** Cues raised for this tick (`cueCode1`). */
  cues?: number[];
}

/** What the file says of its positions, its preamble's first two words. */
export interface CatzPositions {
  /** How many positions there are: 123 for the cat. */
  count: number;

  /** The neutral position, where a cat starts: 66 for the cat. */
  neutral: number;
}

export interface CatzTimelineOptions {
  /** A frame's sequence flags (`GetBallFrameFlags`): 1 a sequence's start, 2 its end. */
  flags: (frame: number) => number;

  /** A random number below `n`. */
  random: (n: number) => number;

  /** How many frames at most: a loop of 999 is for ever. */
  limit?: number;

  /** Where the cat is to begin with; the neutral position without. */
  from?: number;

  /**
   * How many times the action is played, one after another, as the engine
   * plays a walk or a run again for as long as the cat goes on: each time
   * a variant at random, aligned to the last.
   */
  times?: number;
}

/**
 * The transitions from one position to another (`BuildTransition`,
 * seg40:3a75): the first chain of up to five transition records -- those
 * whose flag is set and which go somewhere -- found by trying a direct one,
 * then two through each position in turn, and so on. Empty where none is.
 */
export function catzTransitions(scripts: Script[], from: number, to: number): number[] {
  const direct = new Map<string, number>();

  scripts.forEach((script, index) => {
    const key = `${script.from},${script.to}`;

    if (script.flag && script.from !== script.to && !direct.has(key)) {
      direct.set(key, index);
    }
  });

  const step = (a: number, b: number) => direct.get(`${a},${b}`);
  const positions = [...new Set(scripts.flatMap((script) => [script.from, script.to]))].sort(
    (a, b) => a - b
  );

  const search = (at: number, depth: number): number[] | null => {
    if (depth === 1) {
      const one = step(at, to);
      return one === undefined ? null : [one];
    }

    for (const via of positions) {
      const first = step(at, via);

      if (first !== undefined) {
        const rest = search(via, depth - 1);

        if (rest) {
          return [first, ...rest];
        }
      }
    }

    return null;
  };

  for (let depth = 1; depth <= 5; depth++) {
    const found = search(from, depth);

    if (found) {
      return found;
    }
  }

  return [];
}

/** The steps action `index` plays out as, a variant at random, with the transitions into it. */
export function catzTimeline(
  scripts: Script[],
  positions: CatzPositions,
  index: number,
  { flags, random, limit = 2000, from, times = 1 }: CatzTimelineOptions
): CatzStep[] {
  const steps: CatzStep[] = [];
  let end = from ?? positions.neutral;
  let pending: Omit<CatzStep, 'frame' | 'action'> = {};
  let glue = false;
  let reference = false;

  const value = (operand: Operand) =>
    typeof operand === 'number'
      ? operand
      : operand.random[0] + random(Math.max(1, operand.random[1] - operand.random[0] + 1));

  const show = (frame: number, action: number) => {
    steps.push({
      frame,
      action,
      ...pending,
      ...(reference ? { reference: true } : {}),
      ...(glue && !reference ? { glue: true } : {}),
    });
    pending = {};
    reference = false;
    glue = false;
  };

  /** Plays an action: the transitions to where it starts, then a variant of it. */
  const play = (action: number, depth: number) => {
    const script = scripts[action];

    if (!script || depth > 8 || steps.length >= limit) {
      return;
    }

    /* `PushTransitionToNeutralPos` (seg40:5384): nothing to or from the
     * neutral position, nor to or from position 0, "any". */
    const neutral = positions.neutral;

    if (script.from !== end && script.from && end && script.from !== neutral && end !== neutral) {
      for (const transition of catzTransitions(scripts, end, script.from)) {
        play(transition, depth + 1);
      }
    }

    run(script.variants[random(script.variants.length)], action, depth);
    /* Each action ends aligned to the next (`alignScripts0 actionDone0`). */
    reference = true;

    if (script.to) {
      end = script.to;
    }
  };

  const run = (elements: Element[], action: number, depth: number) => {
    let at = 0;

    /* What ended a block: an `endLoop0`, an `endLoopAlign0`, or the variant's end. */
    const block = (): number | null => {
      while (at < elements.length && steps.length < limit) {
        const element = elements[at++];

        if ('frame' in element) {
          show(element.frame, action);
          continue;
        }

        const { op, operands } = element;
        const [a, b] = operands;

        if (op >= CATZ_OP.soundPlay1 && op <= CATZ_OP.soundPlay5) {
          const choices = operands.map(value).filter((n) => n >= 0);

          if (choices.length) {
            pending.sounds = [...(pending.sounds ?? []), choices[random(choices.length)]];
          }

          continue;
        }

        switch (op) {
          case CATZ_OP.sequence: {
            const [first, last] = [value(a), value(b)];
            const way = first <= last ? 1 : -1;

            for (let frame = first; frame !== last + way && steps.length < limit; frame += way) {
              show(frame, action);
            }
            break;
          }
          case CATZ_OP.sequenceToEnd: {
            let frame = value(a);
            show(frame, action);

            while (!(flags(frame) & 2) && steps.length < limit) {
              show(++frame, action);
            }
            break;
          }
          case CATZ_OP.sequenceToStart: {
            let frame = value(a);
            show(frame, action);

            while (!(flags(frame) & 1) && steps.length < limit) {
              show(--frame, action);
            }
            break;
          }
          case CATZ_OP.startLoop: {
            const times = value(a);

            if (times === 0) {
              /* Skipped to the first loop's end, whatever its nesting (seg41:0f9f). */
              while (
                at < elements.length &&
                !(
                  'op' in elements[at] &&
                  ((elements[at] as { op: number }).op === CATZ_OP.endLoop ||
                    (elements[at] as { op: number }).op === CATZ_OP.endLoopAlign)
                )
              ) {
                at++;
              }

              at++;
              break;
            }

            const body = at;

            for (let n = 0; (times === 999 || n < times) && steps.length < limit; n++) {
              at = body;

              if (block() === CATZ_OP.endLoopAlign && (times === 999 || n + 1 < times)) {
                glue = true;
              }
            }
            break;
          }
          case CATZ_OP.endLoop:
          case CATZ_OP.endLoopAlign:
            return op;
          case CATZ_OP.playAction: {
            const times = value(b);

            for (let n = 0; n < times && steps.length < limit; n++) {
              play(value(a), depth + 1);
            }
            break;
          }
          case CATZ_OP.cueCode:
            pending.cues = [...(pending.cues ?? []), value(a)];
            break;
          case CATZ_OP.alignScripts:
            reference = true;
            break;
        }
      }

      return null;
    };

    block();
  };

  for (let n = 0; n < times && steps.length < limit; n++) {
    play(index, 0);
  }

  return steps;
}
