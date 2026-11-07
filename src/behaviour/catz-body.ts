/**
 * A Catz cat's body on the stage: each action its pet pushes played out by
 * its script (`catzTimeline`, its fudgers along), and each frame placed as
 * `PopScript` places it (`placeCatzTick`) as the frame before left it --
 * and, walking on, each tick aimed at what it walks to from where the tick
 * before left it, and that looked for in its focus box (`SetTargetLocation`,
 * `MakeFocusRect`; CATZDLL.DLL seg41:1302 on), as the engine steers it.
 *
 * What the pet pushes is played out at once, frame after frame queued; a new
 * state entered drops what was left of the old (`drop`), the body put back
 * where the frame shown left it.
 */
import { type Frame } from '../formats/animation.ts';
import { type Script } from '../formats/script.ts';
import {
  aimCatzFudger,
  type CatzBlink,
  type CatzFudger,
  rateCatzFudger,
  resetCatzFudger,
  wrapCatzAngle,
} from './catz-fudger.ts';
import { type CatzSteer } from './catz-pet.ts';
import {
  catzAimAt,
  catzFocusRect,
  catzInside,
  type CatzPlaced,
  type CatzPlacer,
  type CatzPoint,
  type CatzPose,
  type CatzRect,
  placeCatzTick,
} from './catz-stage.ts';
import { type CatzPositions, type CatzStep, catzTimeline } from './catz-timeline.ts';

/** A frame to show, placed: its step, its rectangle, its pose, and whether its steering found what it walks to. */
export interface CatzShown {
  step: CatzStep;
  rect: CatzRect;
  pose: CatzPose;

  /** Walking on: what it walks to in its focus box as this tick was aimed (`PopScript` answering 2). */
  there?: boolean;

  /** Its fudgers once it is done, and the pose its action leaves it in: kept, to go on from were what follows dropped. */
  fudgers: CatzFudger[];
  position: number;
  blink: CatzBlink;

  /** The last frame of its action. */
  ends?: boolean;
}

export interface CatzBodyOptions {
  scripts: Script[];
  positions: CatzPositions;
  /** A frame's sequence flags (`GetBallFrameFlags`). */
  flags: (frame: number) => number;
  /** The breed's frames, reshaped, and the placer of them. */
  shaped: Frame[];
  placer: CatzPlacer;
  /** Which way a frame lies (`catzFrameAngle`), to turn the cat by at each reference frame. */
  angle: (frame: number) => number | null;
  /** The stage it is kept touching. */
  stage: CatzRect;
  /** The cat's fudgers as they stand, played on. */
  fudgers: CatzFudger[];
  random: (n: number) => number;
  /** Where its feet are first: the stage's lower middle by default. */
  start?: CatzPoint;
}

/** A pose from a step and its fudgers' fields: rotation, roll, tilt, the head's rotation, tilt and cock. */
export function catzPoseOf(step: CatzStep, fields = step.fudged): CatzPose {
  const [rotation = 0, roll = 0, tilt = 0, turn = 0, up = 0, cock = 0] = fields ?? [];
  return {
    frame: step.frame,
    rotation,
    tilt,
    roll,
    head: { rotation: turn, tilt: up, cock },
    layer: step.layer,
  };
}

const copy = (fudgers: CatzFudger[]) => fudgers.map((fudger) => structuredClone(fudger));

export class CatzBody {
  /** The frames still to show, in turn. */
  readonly queue: CatzShown[] = [];

  /** The frame shown now. */
  shown?: CatzShown;

  /** Where the last frame queued leaves it, which the next is placed and aimed from. */
  private tail: CatzPlaced | null = null;
  private tailLayer?: CatzStep['layer'];
  private held?: CatzStep;
  private position: number;

  /**
   * Whether the next frame popped is a reference frame (`+0x1462`): set as
   * an action ends (`alignScripts`, seg41:0514), cleared only by the frame
   * popped after (seg41:1153) -- so it holds from one push to the next,
   * however many ticks later.
   */
  private aligned = false;
  private blink: CatzBlink;
  private readonly options: CatzBodyOptions;

  constructor(options: CatzBodyOptions) {
    this.options = options;
    this.position = options.positions.neutral;
    this.blink = { wait: options.random(100) + 30, shut: false, kept: 20 };
  }

  /** An action played out from the pose it is in, its frames queued placed; walking on, steered each tick. How many ticks it takes, and the pose it leaves. */
  play(action: number, steer?: CatzSteer) {
    const { scripts, positions, flags, shaped, placer, angle, stage, fudgers, random } =
      this.options;

    if (!scripts[action]) {
      return { ticks: 0, pose: this.position };
    }

    const before = this.queue.length;
    let there: boolean | undefined;
    const walk = steer && 'to' in steer ? steer : undefined;

    /* A creep: the words pushed before it, its rotation's fudger at a rate of 100 aimed at the angle. */
    if (steer && 'rotation' in steer) {
      rateCatzFudger(fudgers[0], 100);
      aimCatzFudger(fudgers[0], steer.rotation);
    }

    const position = scripts[action].to || this.position;

    catzTimeline(scripts, positions, action, {
      flags,
      random,
      limit: 600,
      from: this.position,
      fudgers,
      angle,
      blink: this.blink,
      shown: (this.queue.at(-1) ?? this.shown)?.step.frame,
      aligned: this.aligned,
      /* Aimed as the engine aims: in the rectangle the tick before left,
       * its new frame turned as it now is, its layered action not yet moved
       * on; and what it walks to looked for in the box ahead of its head. */
      aim: walk
        ? (step, rotation, fields) => {
            const target = walk.to();

            if (!target || !this.tail || !shaped[step.frame]) {
              there = undefined;
              return undefined;
            }

            const pose: CatzPose = {
              ...catzPoseOf(step, [rotation, ...fields.slice(1)]),
              layer: this.tailLayer,
            };
            there = catzInside(catzFocusRect(placer, this.tail.rect, pose, walk.box), target);
            return catzAimAt(placer, this.tail.rect, pose, target);
          }
        : undefined,
      done: (step) => {
        if (!shaped[step.frame]) {
          return;
        }

        if (step.reference) {
          /* Popped, it places the next; the last of all, done again as its tick ends, the same. */
          this.held = step;
          return;
        }

        const pose = catzPoseOf(step);
        this.tail = this.tail
          ? placeCatzTick(placer, this.tail, pose, {
              reference: this.held,
              glued: !!step.glue,
              area: stage,
            })
          : this.first(pose);
        this.tailLayer = step.layer;
        this.held = undefined;
        this.queue.push({
          step,
          rect: this.tail.rect,
          pose,
          there,
          fudgers: copy(fudgers),
          position,
          blink: { ...this.blink },
        });
        there = undefined;
      },
    });

    /* And the word after it: the fudger reset. */
    if (steer && 'rotation' in steer) {
      resetCatzFudger(fudgers[0]);
    }

    this.position = position;
    this.aligned = true;

    if (this.queue.length > before) {
      this.queue.at(-1)!.ends = true;
    }

    return { ticks: this.queue.length - before, pose: position };
  }

  /** The next frame shown, where there is one; else the last stays. */
  next() {
    this.shown = this.queue.shift() ?? this.shown;
    return this.shown;
  }

  /** A new state entered drops what was left of the old: the frames still queued, the body put back where the frame shown left it. */
  drop() {
    if (!this.queue.length || !this.shown) {
      return;
    }

    this.queue.length = 0;
    this.rewind(this.shown);
    /* Cut short, its action never got to its end to align what follows. */
    this.aligned = !!this.shown.ends;
  }

  /** Put back to where a frame left it. */
  private rewind({ step, rect, pose, fudgers, position, blink }: CatzShown) {
    this.tail = { rect, before: pose, current: pose };
    this.tailLayer = step.layer;
    this.options.fudgers.forEach((fudger, n) => Object.assign(fudger, structuredClone(fudgers[n])));
    this.position = position;
    this.blink = { ...blink };
    this.held = undefined;
  }

  /** The first frame, its feet at the start. */
  private first(pose: CatzPose): CatzPlaced {
    const { placer, stage, start } = this.options;
    const bounds = placer.bounds(pose);
    const at = start ?? {
      x: Math.trunc((stage.left + stage.right) / 2),
      y: Math.trunc(stage.top + ((stage.bottom - stage.top) * 5) / 8),
    };
    const [dx, dy] = [at.x - (bounds.left + bounds.right) / 2, at.y - bounds.bottom];
    const rect = {
      left: Math.round(bounds.left + dx),
      top: Math.round(bounds.top + dy),
      right: Math.round(bounds.right + dx),
      bottom: Math.round(bounds.bottom + dy),
    };
    return { rect, before: pose, current: pose };
  }

  /** Which way it faces (`+0x688`): its rotation as drawn, -128 to 127. */
  get facing() {
    const rotation = this.shown?.pose.rotation ?? 0;
    return wrapCatzAngle(rotation) === 128 ? -128 : wrapCatzAngle(rotation);
  }
}
