/**
 * A Catz script -- an action -- played out as the frames the cat shows, one
 * a tick, as `ScriptSprite` pushes and pops it (CATZDLL.DLL segments 40 and
 * 41; kb/formats/scp.md, "How Catz plays them"). Only the frames and the
 * reference frames between actions are kept, with the sounds and cues; the
 * fudgers, looks and layers' frames are not played yet. Every random number
 * is drawn where the engine draws it, so given the engine's own the frames
 * are its, tick for tick (test/harness/catzdll_test.ts).
 */

import { type Frame } from '../formats/animation.ts';
import { type Element, type Operand, type Script } from '../formats/script.ts';
import { CATZ_TURN } from '../render/raster.ts';
import {
  aimCatzFudger,
  blinkCatz,
  type CatzBlink,
  alignCatzFudger,
  type CatzFudger,
  defaultCatzFudgerRate,
  driftCatzFudger,
  goAlignCatzFudger,
  rateCatzFudger,
  requestedCatzFudgers,
  resetCatzFudger,
  resumeCatzFudger,
  stopCatzFudger,
  suspendCatzFudger,
  updateCatzFudger,
  wrapCatzAngle,
} from './catz-fudger.ts';

/** Catz's opcodes this file plays, by their names in CATZDLL.DLL's table. */
export const CATZ_OP = {
  startPos: 30000,
  actionDone: 30001,
  actionStart: 30002,
  alignScripts: 30003,
  alignBallToPtSetup: 30004,
  alignBallToPtGo: 30005,
  alignBallToPtStop: 30006,
  alignFudgeBallToPtSetup: 30007,
  cueCode: 30008,
  disableFudgeAim: 30010,
  enableFudgeAim: 30012,
  lookAtLocation: 30020,
  lookAtRandomPt: 30021,
  lookAtSprite: 30022,
  setHeadTrackAcuteness: 30038,
  setHeadTrackMode: 30039,
  setReverseHeadTrack: 30040,
  lookAtUser: 30023,
  lookFoward: 30024,
  endLoop: 30014,
  endLoopAlign: 30015,
  playAction: 30025,
  playLayeredAction: 30026,
  rand: 30028,
  resetFudger: 30029,
  resumeFudging: 30030,
  sequence: 30031,
  sequenceToEnd: 30032,
  sequenceToStart: 30033,
  setFudgeAimDefaults: 30034,
  setFudgerDrift: 30035,
  setFudgerRate: 30036,
  setFudgerTarget: 30037,
  soundPlay1: 30044,
  soundEmptyQueue: 30041,
  soundPlay5: 30048,
  soundQueue1: 30049,
  soundQueue5: 30053,
  soundStop: 30057,
  startLoop: 30058,
  stopFudging: 30059,
  suspendFudging: 30060,
  endPos: 30063,
} as const;

/** The opcodes whose operands are drawn as an action is pushed, not as it plays. */
const SEQUENCES = new Set<number>([
  CATZ_OP.sequence,
  CATZ_OP.sequenceToEnd,
  CATZ_OP.sequenceToStart,
]);

/** One tick of a Catz action. */
export interface CatzStep {
  frame: number;

  /** The action this frame is of, by its record. */
  action: number;

  /**
   * Not shown, but the frame the next is placed by (`alignScripts0`,
   * seg41:114d): it takes no tick, the tick going on to the frame after it.
   * Last of all, with nothing after it, the tick ends on it, and it shows.
   */
  reference?: boolean;

  /**
   * Shown, but placed so the default glue ball is where it was in the frame
   * before: the first frame of each turn after the first of a loop ending
   * `endLoopAlign0` (seg41:03a2), which is how a walk goes on.
   */
  glue?: boolean;

  /**
   * On a reference frame: how far the cat is turned, in 256ths of a turn, as
   * it is placed by it (`XBallz::CheckAlignment`, seg47:29c9; `PopScript`
   * adds it to the rotation where it is more than 6 either way).
   */
  turn?: number;

  /**
   * The cat's 14 fudgers' values once the tick is done, as `PopScript`
   * leaves them (seg41:154a on): its rotation, roll and tilt, its head's
   * rotation, tilt and cock, its eyelids' heights and tilts, where its eyes
   * look; with `fudgers` given.
   */
  fudged?: number[];

  /**
   * A layered action's frame played over this one, and its first frame
   * (`BallState` `+0x4c`, `+0x4a`): drawn moved by how far it has moved
   * from that (`layeredCatzFrame`).
   */
  layer?: { first: number; frame: number };

  /** Sounds played as it is shown, one of each soundPlay's at random. */
  sounds?: number[];

  /** Cues raised for this tick (`cueCode1`). */
  cues?: number[];

  /**
   * A leap begun as this tick ends (`alignBallToPtGo0` popped in it with a
   * leap set up; `InitializeAlignRequest`, seg40:65e0): over the `count`
   * frames after this one -- up to `alignBallToPtStop0` or the action's end
   * -- the cat is carried so its `ball` lands on the point (`catzLeapFrom`).
   */
  leap?: CatzLeap;
}

/** A leap: a ball (-11 for the middle of the cat's rectangle) carried to a point over so many frames. */
export interface CatzLeap {
  ball: number;
  x: number;
  y: number;
  count: number;
}

/**
 * How the head looks at a point, as scripts set it: the distance over
 * which it reaches its furthest (`+0x150e`, `setHeadTrackAcuteness`, 30038; 4, the default
 * `+0x1510`, for none or less), whether what it tracks is on the shelf
 * (`+0x1512`, `setHeadTrackMode`, 30039), and whether it looks away (`+0x1514`,
 * `setReverseHeadTrack`, 30040).
 */
export interface CatzHeadState {
  divisor: number;
  shelved: boolean;
  away: boolean;
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

  /**
   * A random number below `n`, from where the engine draws it: `table` for
   * what is drawn as an action is pushed -- a variant, a sequence's
   * operands -- from `ScriptRand`'s table of 150 (seg40:1a28); `rand` for
   * what is drawn as it plays -- any other operand, a sound -- from C's
   * `rand` (`Stack::Pop`, `HandleSoundVerb`). Each is the number drawn
   * modulo `n`.
   */
  random: (n: number, from: 'table' | 'rand') => number;

  /** How many frames at most: a loop of 999 is for ever. */
  limit?: number;

  /** Where the cat is to begin with; the neutral position without. */
  from?: number;

  /** Which variant of the action to play, as `PushStoredAction` may be told; one at random without. */
  variant?: number;

  /** Which way a frame lies, as `catzFrameAngle` has it, to turn the cat by at each reference frame; none without. */
  angle?: (frame: number) => number | null;

  /** The frame shown before, which a reference frame first of all is measured against; none without. */
  shown?: number;

  /**
   * Whether an action pushed with it, before it, ended aligned to it
   * (`alignScripts0 actionDone0`), so its first frame is a reference frame,
   * as it is where the two are pushed together.
   */
  aligned?: boolean;

  /**
   * The cat's fudgers as they stand (`makeCatzFudgers`), to play the
   * scripts' settings on and update a tick at a time; changed as they play.
   * Without, they are not played.
   */
  fudgers?: CatzFudger[];

  /** A cat's blinking, done at the start of every tick, with `fudgers`; none without. */
  blink?: CatzBlink;

  /**
   * How many times the action is played, one after another, as the engine
   * plays a walk or a run again for as long as the cat goes on: each time
   * a variant at random, aligned to the last.
   */
  times?: number;

  /**
   * A target the cat walks to (`targetSprite4`, seg41:0e8d): each shown
   * tick, once its frame is popped and before its layered action and
   * fudgers move on, where the rotation is to be aimed (`SetTargetLocation`,
   * seg41:1302 on), given the step and the cat's angles then -- its rotation
   * turned by any reference frame, and the fudgers' other fields as they
   * stand; none to leave it. With `fudgers`.
   */
  aim?: (step: CatzStep, rotation: number, fields: number[]) => number | undefined;

  /**
   * Where the head and eyes are to be aimed to look at a point -- the
   * head's turn and tilt, the eyes' across and down (`SetHeadTarget`,
   * `catzHeadTarget`), from where the cat is as the script is popped (the
   * shown ticks so far, and its rotation then) -- for `lookAtLocation`
   * and `lookAtRandomPt`; none to leave them. With `fudgers`.
   */
  look?: (
    point: { x: number; y: number },
    ticked: number,
    rotation: number,
    head: CatzHeadState
  ) => number[] | undefined;

  /**
   * How the head looks, as scripts set it, kept from one action to the next
   * (`+0x150e`, `+0x1512`, `+0x1514`); changed as they play. Without, a
   * cat's as made.
   */
  head?: CatzHeadState;

  /** The area a random point is drawn in (`PetParams` `+0xac` to `+0xb2`); 1 by 1 without. */
  area?: { left: number; top: number; right: number; bottom: number };

  /**
   * A script's looking changing what the head tracks (`+0x1508`): a kind
   * of sprite (`lookAtSprite`, 0 for none), or nothing, looking at a
   * point, at the user or ahead.
   */
  tracking?: (kind: number) => void;

  /**
   * Each shown tick, after `aim`: where to aim the head and eyes at what it
   * tracks (`PopScript`, seg41:1391, `SetHeadTarget` at its target point),
   * given the step and its rotation and fields; none where it tracks
   * nothing. With `fudgers`.
   */
  track?: (step: CatzStep, rotation: number, fields: number[]) => number[] | undefined;

  /**
   * A leap set up before the action (`alignBallToPtSetup3`, which the cat's
   * states push ahead of it, seg41:0fa4): its ball carried to the point
   * once the script says go. None without.
   */
  align?: { ball: number; x: number; y: number };

  /** The leap set up said go to, so no longer set up (seg41:1020). */
  went?: () => void;

  /**
   * Each step as it is done, in turn: a reference frame as it is popped, a
   * shown one once its tick is done (its fudgers moved on) -- so whoever
   * places the cat can place each before the next is aimed.
   */
  done?: (step: CatzStep) => void;

  /**
   * Cues after its last frame (`cueCode1` before `endPos`, as the cloud's
   * come (4) and gone (0)): raised by the pop that ends it, so with its
   * last frame, as it is seen done.
   */
  trailing?: (cues: number[]) => void;
}

/**
 * The transitions from one position to another (`BuildTransition`,
 * seg40:3a75): the first chain of up to five transition records found, as
 * the engine searches its table of them. The table holds, for each pair of
 * positions, the first record whose flag is set and which goes somewhere,
 * record 0 counting as none (`LoadScripts`, seg40:1ea2). The search tries a
 * direct one, then chains through each position in turn: of three, the
 * first middle position, then the second; of four and five, the first,
 * then the last, then those between. Empty where none is.
 */
export function catzTransitions(scripts: Script[], from: number, to: number): number[] {
  const table = new Map<string, number>();

  scripts.forEach((script, index) => {
    const key = `${script.from},${script.to}`;

    if (index && script.flag && script.from !== script.to && !table.has(key)) {
      table.set(key, index);
    }
  });

  const step = (a: number, b: number) => table.get(`${a},${b}`);
  const count = Math.max(0, ...scripts.flatMap((script) => [script.from, script.to])) + 1;
  const chain = (...positions: number[]) => {
    const found = positions.slice(1).map((position, n) => step(positions[n], position));
    return found.every((index) => index !== undefined) ? (found as number[]) : null;
  };

  const direct = chain(from, to);

  if (direct) {
    return direct;
  }

  for (let a = 0; a < count; a++) {
    const found = chain(from, a, to);

    if (found) {
      return found;
    }
  }

  for (let a = 0; a < count; a++) {
    for (let b = 0; step(from, a) !== undefined && b < count; b++) {
      const found = chain(from, a, b, to);

      if (found) {
        return found;
      }
    }
  }

  for (let a = 0; a < count; a++) {
    for (let last = 0; step(from, a) !== undefined && last < count; last++) {
      for (let b = 0; step(last, to) !== undefined && b < count; b++) {
        const found = chain(from, a, b, last, to);

        if (found) {
          return found;
        }
      }
    }
  }

  for (let a = 0; a < count; a++) {
    for (let last = 0; step(from, a) !== undefined && last < count; last++) {
      for (let b = 0; step(last, to) !== undefined && b < count; b++) {
        for (let c = 0; step(a, b) !== undefined && c < count; c++) {
          const found = chain(from, a, b, c, last, to);

          if (found) {
            return found;
          }
        }
      }
    }
  }

  return [];
}

/**
 * Which way a frame lies, as `XBallz::CheckAlignment` (seg47:29c9) measures
 * it to turn the cat by: the angle, in 256ths of a turn rounded toward 0, of
 * the line from the neck to the butt across the ground (x and z); none where
 * that line is shorter than 50 (`ds:1e6e`).
 */
export function catzFrameAngle(frame: Frame, neck: number, butt: number): number | null {
  const [from, to] = [frame.balls[neck], frame.balls[butt]];

  if (!from || !to) {
    return null;
  }

  const [dx, dz] = [to.x - from.x, to.z - from.z];

  if ((!dx && !dz) || Math.sqrt(dx * dx + dz * dz) < 50) {
    return null;
  }

  return Math.trunc((Math.atan2(dz, dx) * 256) / CATZ_TURN);
}

/** The steps action `index` plays out as, a variant at random, with the transitions into it. */
export function catzTimeline(
  scripts: Script[],
  positions: CatzPositions,
  index: number,
  {
    flags,
    random,
    limit = 2000,
    from,
    times = 1,
    variant,
    angle,
    fudgers,
    shown: earlier,
    blink,
    aim,
    done,
    trailing,
    aligned = false,
    look,
    area,
    tracking,
    track,
    head = { divisor: 4, shelved: false, away: false },
    align,
    went,
  }: CatzTimelineOptions
): CatzStep[] {
  const steps: CatzStep[] = [];
  /* Where the cat will be once what is pushed has played (`+0x14fe`), and
   * where it is as it plays (`+0x1500`): `actionStart1` and `actionDone0`
   * set the second to the action's from and to. */
  let end = from ?? positions.neutral;
  let actual = end;
  let pending: Omit<CatzStep, 'frame' | 'action'> = {};
  let glue = false;
  let reference = aligned;

  const value = (operand: Operand, from: 'table' | 'rand' = 'rand') =>
    typeof operand === 'number'
      ? operand
      : operand.random[0] + random(Math.max(1, operand.random[1] - operand.random[0] + 1), from);

  /**
   * The layered action's frames and opcodes still to come, a frame a tick
   * (`+0x1466`). Only its sounds are played, which draw as any other; the
   * rest is passed over without its operands (seg41:143e on).
   */
  const layer: Element[] = [];

  /* The numbers the fudgers drive (`BallState` `+0x10` on, by the fudgers'
   * numbers), apart from the fudgers' own: a blink or a turn sets them, and
   * each tick each fudger is updated from its own and sets it. */
  const fields = (fudgers ?? []).map(({ value }) => value);

  /* A turn a reference frame makes, applied to the rotation as the tick ends. */
  let turned = 0;

  /* A leap set up (`+0x1478`, `+0x147a` on), said go to with the frames
   * to come, and what the tick it begins in plays ahead. */
  let armed = align;
  let going: Omit<CatzLeap, 'count'> | undefined;
  let ahead: { draws: Element[]; count: number } | undefined;

  /**
   * An opcode popped playing ahead (`InitializeAlignRequest` running
   * `PopScript` over the leap's frames, seg40:66ea): its random operands
   * drawn, and a sound's choice and loudness, or a random point's.
   */
  const drawAhead = (element: Element) => {
    if (!('op' in element)) {
      return;
    }

    if (!sound(element, true)) {
      element.operands.forEach((operand) => value(operand));

      if (element.op === CATZ_OP.lookAtRandomPt) {
        const { left = 0, top = 0, right = 1, bottom = 1 } = area ?? {};
        random(right - left, 'rand');
        random(bottom - top, 'rand');
      }
    }
  };

  /**
   * A leap said go to, as the tick it is in ends: the frames after its
   * first counted to its stop -- or the action's end -- passing over
   * opcodes (seg40:6609 on), and the opcodes before each of them, which
   * playing ahead pops.
   */
  const leapAhead = (elements: Element[]) => {
    let count = 0;
    let popped: Element[] = [];
    const drawn: Element[] = [];

    for (const element of frames(elements)) {
      if ('op' in element && element.op === CATZ_OP.alignBallToPtStop) {
        break;
      }

      if (!('frame' in element)) {
        popped.push(element);
      } else {
        count++;
        drawn.push(...popped);
        popped = [];
      }
    }

    return { count, drawn };
  };

  /**
   * What is left on the stack being played (`+0x145e`): each action run
   * its own, innermost last -- the frames still to come of a sequence
   * being shown, then the elements after it.
   */
  const playing: { elements: Element[]; at: number; rest: number[] }[] = [];

  /** The tick done: each fudger updated from the number it drives, the rotation turned first (seg41:154a on). */
  /** What a cat does before its script each tick: blink. */
  const startTick = () => {
    if (blink && fudgers) {
      blinkCatz(blink, fields, (n) => random(n, 'rand'));
    }
  };

  const tick = (step: CatzStep) => {
    const aimed = fudgers ? aim?.(step, wrapCatzAngle(fields[0] + turned), fields) : undefined;

    if (aimed !== undefined) {
      aimCatzFudger(fudgers![0], aimed);
    }

    /* And what it tracks, its head and eyes aimed at it. */
    const tracked = fudgers ? track?.(step, wrapCatzAngle(fields[0] + turned), fields) : undefined;

    if (tracked) {
      headAt(tracked);
    }

    layerTick(step);

    if (fudgers) {
      step.fudged = fudgers.map(
        (fudger, n) =>
          (fields[n] = updateCatzFudger(
            fudger,
            n === 0 ? wrapCatzAngle(fields[0] + turned) : fields[n]
          ))
      );
    }

    turned = 0;

    /* A leap begun this tick: the frames ahead played and put back, all
     * but C's `rand`, whose draws stay drawn. */
    if (ahead) {
      const { draws, count } = ahead;
      ahead = undefined;

      /* Each fudger set up to align (`alignFudgeBallToPtSetup2`) going
       * over the leap's frames (`AlignOverStepsGo`, slot `0x54`,
       * seg40:669f), before it is played ahead. */
      for (const fudger of fudgers ?? []) {
        goAlignCatzFudger(fudger, count);
      }

      draws.forEach(drawAhead);
    }

    startTick();
  };

  /** The head's turn and tilt and the eyes' across and down aimed (fudgers 3, 4, 10 and 11). */
  const headAt = (targets: number[]) => {
    [3, 4, 10, 11].forEach((n, k) => aimCatzFudger(fudgers![n], targets[k]));
  };

  /** A script's setting of the fudgers it names, as `PopScript` does it (seg41:0052). */
  const fudge = (op: number, operands: number[]) => {
    const [type, a, b, c, d] = operands;

    for (const n of fudgers ? requestedCatzFudgers(type) : []) {
      const fudger = fudgers![n];

      switch (op) {
        case CATZ_OP.setFudgerTarget:
          aimCatzFudger(fudger, a);
          break;
        case CATZ_OP.setFudgerDrift:
          driftCatzFudger(fudger, a);
          break;
        case CATZ_OP.setFudgerRate:
          rateCatzFudger(fudger, a);
          break;
        case CATZ_OP.setFudgeAimDefaults:
          defaultCatzFudgerRate(fudger, a, b, c, d);
          break;
        case CATZ_OP.resetFudger:
          resetCatzFudger(fudger);
          break;
        case CATZ_OP.stopFudging:
          stopCatzFudger(fudger);
          break;
        case CATZ_OP.suspendFudging:
          suspendCatzFudger(fudger);
          break;
        case CATZ_OP.resumeFudging:
          resumeCatzFudger(fudger);
          break;
        case CATZ_OP.disableFudgeAim:
          fudger.aimingOff = true;
          break;
        case CATZ_OP.enableFudgeAim:
          fudger.aimingOff = false;
          break;
        case CATZ_OP.alignFudgeBallToPtSetup:
          alignCatzFudger(fudger, a);
          break;
      }
    }
  };

  const show = (frame: number, action: number) => {
    const shown = !reference;
    /* A reference frame turns the cat by how its axis lies from the frame
     * before's, where that is more than 6 either way. */
    const before = steps.at(-1)?.frame ?? earlier;
    const [was, is] = [
      before === undefined ? null : (angle?.(before) ?? null),
      angle?.(frame) ?? null,
    ];
    const turn = reference && was !== null && is !== null ? is - was : 0;
    const step: CatzStep = {
      frame,
      action,
      ...pending,
      ...(reference ? { reference: true } : {}),
      ...(glue && !reference ? { glue: true } : {}),
      ...(turn > 6 || turn < -6 ? { turn } : {}),
    };
    steps.push(step);
    turned += step.turn ?? 0;

    if (going && shown) {
      /* Counted on the stack its tick's frame came from, after it. */
      const { elements, at, rest } = playing.at(-1)!;
      const { count, drawn } = leapAhead([
        ...rest.map((frame) => ({ frame })),
        ...elements.slice(at),
      ]);

      if (count > 0) {
        step.leap = { ...going, count };
        ahead = { draws: drawn, count };
      }

      going = undefined;
    }

    if (shown) {
      tick(step);
    }

    done?.(step);
    pending = {};
    reference = false;
    glue = false;
  };

  /**
   * The layer's first frame as it was pushed (`+0x146a`), -1 for none; and
   * a tick's turn of it: its next frame, and its sounds before it, played
   * as the tick ends, before the fudgers (seg41:143e on). Where it runs out
   * before a frame, it is done.
   */
  let layerFirst = -1;

  const layerTick = (step: CatzStep) => {
    if (layerFirst < 0) {
      return;
    }

    while (layer.length) {
      const next = layer.shift()!;

      if ('frame' in next) {
        step.layer = { first: layerFirst, frame: next.frame };
        break;
      }

      sound(next);
    }

    if (pending.sounds) {
      step.sounds = [...(step.sounds ?? []), ...pending.sounds];
      pending = {};
    }

    if (!step.layer) {
      layerFirst = -1;
    }
  };

  /**
   * A sound opcode, as `HandleSoundVerb` (seg41:1ca3) does it: its operands
   * popped; a sound played or queued, one of its sounds at random, a played
   * one's loudness by another `rand` (`XApt::XPlayStereoSound`, seg2:0c79).
   * Whether it was one.
   */
  const sound = ({ op, operands }: { op: number; operands: Operand[] }, ahead = false) => {
    if (op < CATZ_OP.soundEmptyQueue || op > CATZ_OP.soundStop) {
      return false;
    }

    const choices = operands.map((operand) => value(operand)).filter((n) => n >= 0);
    const played = op >= CATZ_OP.soundPlay1 && op <= CATZ_OP.soundPlay5;

    if ((played || (op >= CATZ_OP.soundQueue1 && op <= CATZ_OP.soundQueue5)) && choices.length) {
      const chosen = choices[random(choices.length, 'rand')];

      if (played) {
        if (!ahead) {
          pending.sounds = [...(pending.sounds ?? []), chosen];
        }

        random(1, 'rand');
      }
    }

    return true;
  };

  /** A variant's sequences as the frames they are, as `PushScript` queues them. */
  const frames = (elements: Element[]): Element[] =>
    elements.flatMap((element): Element[] => {
      if (!('op' in element) || !SEQUENCES.has(element.op)) {
        return [element];
      }

      const [a, b] = element.operands as number[];
      const list: number[] = [];

      if (element.op === CATZ_OP.sequence) {
        for (let frame = a; frame !== b + (a <= b ? 1 : -1); frame += a <= b ? 1 : -1) {
          list.push(frame);
        }
      } else {
        const [step, end] = element.op === CATZ_OP.sequenceToEnd ? [1, 2] : [-1, 1];

        for (let frame = a; list.push(frame) < 2000 && !(flags(frame) & end); frame += step) {
          /* On to the sequence's end, or back to its start. */
        }
      }

      return list.map((frame) => ({ frame }));
    });

  /** An action as pushed: which, and its variant's elements, its sequences' operands drawn. */
  interface Pushed {
    action: number;
    elements: Element[];
  }

  /** A variant as `PushScript` queues it (seg40:5ece): its sequences' random operands drawn. */
  const expand = (elements: Element[]) =>
    elements.map((element) =>
      'op' in element && SEQUENCES.has(element.op)
        ? { ...element, operands: element.operands.map((operand) => value(operand, 'table')) }
        : element
    );

  /**
   * Pushes an action as `PushStoredAction` (seg40:57bb) does: its variant
   * drawn, the transitions to where it starts pushed, each an action of its
   * own (`PushTransitionToNeutralPos`, seg40:5384), and then the variant,
   * its sequences' random operands drawn as `PushScript` expands them
   * (seg40:5ece). Where the cat is moves on as each is pushed.
   */
  const push = (action: number, depth: number, chosen?: number): Pushed[] => {
    const script = scripts[action];

    if (!script || depth > 8) {
      return [];
    }

    const which = chosen ?? random(script.variants.length, 'table');
    const pushed: Pushed[] = [];
    const neutral = positions.neutral;
    const target = script.from;

    /* Nothing to or from position 0, "any"; to or from the neutral one, the
     * cat is taken to be there already. */
    if (end !== target && target && end) {
      if (target === neutral || end === neutral) {
        end = neutral;
      } else {
        for (const transition of catzTransitions(scripts, end, target)) {
          pushed.push(...push(transition, depth + 1));
        }
      }
    }

    pushed.push({ action, elements: expand(script.variants[which % script.variants.length]) });

    if (script.to) {
      end = script.to;
    }

    return pushed;
  };

  /** Plays what was pushed, in turn, each ending aligned to the next (`alignScripts0 actionDone0`). */
  const playPushed = (pushed: Pushed[], depth: number) => {
    for (const { action: each, elements } of pushed) {
      if (steps.length >= limit) {
        return;
      }

      const { from: start, to } = scripts[each];

      if (start) {
        actual = start;
      }

      run(elements, each, depth);
      reference = true;

      if (to) {
        actual = to;
      }
    }
  };

  /**
   * The loops open, the innermost last: each its count left and where it
   * goes back to. One list for the whole cat, as the engine keeps it
   * (`+0x14da` deep, counts from `+0x14c6`, places from `+0x14dc`).
   */
  const loops: { count: number; at: number }[] = [];

  const run = (elements: Element[], action: number, depth: number) => {
    let at = 0;
    const stack = { elements, at, rest: [] as number[] };
    playing.push(stack);

    /* A sequence's frames shown in turn, those after each still to come. */
    const showAll = (list: number[]) => {
      for (const [n, frame] of list.entries()) {
        if (steps.length >= limit) {
          break;
        }

        stack.rest = list.slice(n + 1);
        show(frame, action);
      }

      stack.rest = [];
    };

    while (at < elements.length && steps.length < limit) {
      const element = elements[at++];
      stack.at = at;

      if ('frame' in element) {
        show(element.frame, action);
        continue;
      }

      const { op, operands } = element;
      const [a, b] = operands;

      if (sound(element)) {
        continue;
      }

      switch (op) {
        case CATZ_OP.sequence: {
          const [first, last] = [value(a), value(b)];
          const way = first <= last ? 1 : -1;
          const list: number[] = [];

          for (let frame = first; frame !== last + way && list.length < limit; frame += way) {
            list.push(frame);
          }

          showAll(list);
          break;
        }
        case CATZ_OP.sequenceToEnd:
        case CATZ_OP.sequenceToStart: {
          /* On to the sequence's end, or back to its start. */
          const [way, end] = op === CATZ_OP.sequenceToEnd ? [1, 2] : [-1, 1];
          const list = [value(a)];

          while (!(flags(list.at(-1)!) & end) && list.length < limit) {
            list.push(list.at(-1)! + way);
          }

          showAll(list);
          break;
        }
        case CATZ_OP.startLoop: {
          const times = value(a);

          if (times === 0) {
            /* Skipped to the first loop's end, whatever its nesting, so a
             * loop within leaves its outer end unmatched (seg41:0f9f). */
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
          } else {
            loops.push({ count: times, at });
          }
          break;
        }
        case CATZ_OP.endLoop:
        case CATZ_OP.endLoopAlign: {
          /* Counted down, 999 for ever; back to the loop's start while any
           * is left. An end with no loop open does nothing. */
          const loop = loops.at(-1);

          if (loop) {
            if (loop.count !== 999) {
              loop.count--;
            }

            if (loop.count < 1) {
              loops.pop();
            } else {
              at = loop.at;
              glue ||= op === CATZ_OP.endLoopAlign;
            }
          }
          break;
        }
        case CATZ_OP.playAction: {
          /* All n pushed at once, on a stack of their own, from where the
           * cat is, not where it is going (`PushStackList`, seg40:393c);
           * that put back when they are done (`PopStackList`, 38d7). */
          const nested = value(a);
          const times = value(b);

          if (times) {
            const planned = end;
            end = actual;
            const pushed: Pushed[] = [];

            for (let n = 0; n < times; n++) {
              pushed.push(...push(nested, depth + 1));
            }

            playPushed(pushed, depth + 1);
            end = planned;
          }
          break;
        }
        case CATZ_OP.playLayeredAction: {
          /* Its variant and sequences drawn as it is pushed (`PushLayeredAction`,
           * seg40:561f), and queued after any layer still playing. */
          const layered = scripts[value(a)];

          if (layered) {
            const which = random(layered.variants.length, 'table');
            layer.push(...frames(expand(layered.variants[which])));
            /* Its first frame is the first of all still queued (seg40:561f). */
            const first = layer.find((element) => 'frame' in element);
            layerFirst = first && 'frame' in first ? first.frame : 0;
          }
          break;
        }
        case CATZ_OP.cueCode:
          pending.cues = [...(pending.cues ?? []), value(a)];
          break;
        case CATZ_OP.alignScripts:
          reference = true;
          break;
        case CATZ_OP.alignBallToPtSetup:
          armed = { ball: value(a), x: value(b), y: value(operands[2]) };
          break;
        case CATZ_OP.alignBallToPtGo:
          /* Set up, the leap begins as this tick ends, over the frames
           * still on the stack (seg41:100d, 1bb6). */
          if (armed) {
            going = armed;
            armed = undefined;
            went?.();
          }
          break;
        case CATZ_OP.alignBallToPtStop:
          break;
        case CATZ_OP.lookFoward:
          /* Head and eyes straight ahead (`SetHeadTarget` with no point, seg40:5a47), tracking nothing. */
          for (const n of fudgers ? [3, 4, 10, 11] : []) {
            aimCatzFudger(fudgers![n], 0);
          }
          tracking?.(0);
          break;
        case CATZ_OP.lookAtUser:
          /* The head turned against the cat's own rotation, so to face out, and level (seg41:0d25), tracking nothing. */
          if (fudgers) {
            aimCatzFudger(fudgers[3], -wrapCatzAngle(fields[0] + turned));
            aimCatzFudger(fudgers[4], 0);
          }
          tracking?.(0);
          break;
        case CATZ_OP.lookAtRandomPt: {
          /* A point in the area, across then down (`rand() %` its width,
           * its height, from its left and top; seg41:0c72), looked at
           * (`SetHeadTarget`), tracking nothing. */
          const { left = 0, top = 0, right = 1, bottom = 1 } = area ?? {};
          const x = random(right - left, 'rand') + left;
          const y = random(bottom - top, 'rand') + top;
          const shown = steps.filter((step) => !step.reference).length;
          const targets = fudgers
            ? look?.({ x, y }, shown, wrapCatzAngle(fields[0] + turned), head)
            : undefined;

          if (targets) {
            headAt(targets);
          }

          tracking?.(0);
          break;
        }
        case CATZ_OP.setHeadTrackAcuteness: {
          /* The head's reach's divisor; none or less, its default (seg41:0e45). */
          const divisor = value(a);
          head.divisor = divisor > 0 ? divisor : 4;
          break;
        }
        case CATZ_OP.setHeadTrackMode:
          head.shelved = value(a) !== 0;
          break;
        case CATZ_OP.setReverseHeadTrack:
          head.away = value(a) !== 0;
          break;
        case CATZ_OP.lookAtLocation: {
          /* A point given, across then down, looked at (`SetHeadTarget`), tracking nothing (seg41:0c0b). */
          const [x, y] = [value(a), value(operands[1])];
          const shown = steps.filter((step) => !step.reference).length;
          const targets = fudgers
            ? look?.({ x, y }, shown, wrapCatzAngle(fields[0] + turned), head)
            : undefined;

          if (targets) {
            headAt(targets);
          }

          tracking?.(0);
          break;
        }
        case CATZ_OP.lookAtSprite:
          /* What it tracks: a kind of sprite, the cursor where there is none of it, 0 none (seg41:0dba). */
          tracking?.(value(a));
          break;
        default: {
          /* Popped, a random operand drawn as any other (`Stack::Pop`,
           * seg42:1097); the fudgers' set, the rest not played. */
          const values = operands.map((operand) => value(operand));
          fudge(op, values);
        }
      }
    }

    playing.pop();
  };

  startTick();

  for (let n = 0; n < times && steps.length < limit; n++) {
    playPushed(push(index, 0, n === 0 ? variant : undefined), 0);
  }

  /* Cued after its last frame: raised as it ends. */
  if (pending.cues?.length && steps.length) {
    trailing?.(pending.cues);
  }

  /* Ended on a reference frame, with nothing after it, the tick ends on it. */
  const last = steps.at(-1);

  if (last?.reference) {
    tick(last);
    done?.(last);
  }

  return steps;
}
