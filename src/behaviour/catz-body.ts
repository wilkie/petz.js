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
  alignCatzFudger,
  goAlignCatzFudger,
  type CatzBlink,
  type CatzFudger,
  rateCatzFudger,
  resetCatzEyelids,
  resetCatzFudger,
  wrapCatzAngle,
} from './catz-fudger.ts';
import { type CatzSteer } from './catz-pet.ts';
import {
  catzAimAt,
  catzFocusRect,
  catzHeadTarget,
  catzInside,
  type CatzLeaping,
  catzLeapFrom,
  catzLeapTick,
  type CatzPlaced,
  type CatzPlacer,
  type CatzPoint,
  type CatzPose,
  type CatzRect,
  placeCatzTick,
} from './catz-stage.ts';
import {
  type CatzHeadState,
  type CatzPositions,
  type CatzStep,
  catzTimeline,
} from './catz-timeline.ts';

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

  /** Where a kind of sprite its head may track is (its target point); none where there is none. */
  trackAt?: (kind: number) => CatzPoint | undefined;

  /** The area a point at random is looked at in (`PetParams` `+0xac` to `+0xb2`): the stage by default. */
  area?: CatzRect;
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

  /** What its head tracks (`+0x1508`: a kind of sprite, 0 none), and how it looks, as its scripts set it. */
  tracked = 0;
  private readonly head: CatzHeadState = { divisor: 4, shelved: false, away: false };

  /**
   * Whether the next frame popped is a reference frame (`+0x1462`): set as
   * an action ends (`alignScripts`, seg41:0514), cleared only by the frame
   * popped after (seg41:1153) -- so it holds from one push to the next,
   * however many ticks later.
   */
  private aligned = false;

  /**
   * A leap: begun, the frames after the tick it begins in held back until
   * all of them are played out, to be placed ahead of time (`leapFrom`);
   * then under way, a tick at a time.
   */
  private leapFrom?: { leap: CatzStep['leap'] & {}; held: { step: CatzStep; there?: boolean }[] };
  private leaping?: CatzLeaping;
  private armed?: { ball: number; x: number; y: number };
  private leapTo?: { ball: number; x: number; y: number };

  /** Each leap landed: its ball, where it leapt to, and where the ball is at its last frame (kept touching the stage, it may fall short). */
  readonly leaps: { ball: number; x: number; y: number; at: CatzPoint }[] = [];
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
    let trailing: number[] | undefined;
    const walk = steer && 'to' in steer ? steer : undefined;

    /* Steered by a heading: its rotation's fudger aimed so, as the mouse aims it each tick. */
    if (steer && 'heading' in steer) {
      aimCatzFudger(fudgers[0], steer.heading);
    }

    /* A creep: the words pushed before it, its rotation's fudger at a rate of 100 aimed at the angle. */
    if (steer && 'rotation' in steer) {
      rateCatzFudger(fudgers[0], 100);
      aimCatzFudger(fudgers[0], steer.rotation);
    }

    const position = scripts[action].to || this.position;

    /* A leap set up: kept until a script says go (`+0x1478`). */
    if (steer && 'leap' in steer) {
      const { ball, x, y, keep, turn } = steer.leap;

      /* Its rotation set up to align as the leap goes, its words popped first. */
      if (turn !== undefined) {
        alignCatzFudger(fudgers[0], turn);
      }

      /* Within `keep` of the point on an axis, the ball's own place on it, where the cat is (seg25:3db7 on). */
      const from = this.tail ?? (this.shown && { rect: this.shown.rect, current: this.shown.pose });
      const at =
        keep !== undefined && from ? placer.ballOnStage(from.rect, from.current, ball) : undefined;
      this.armed = {
        ball,
        x: at && Math.abs(x - at.x) <= keep! ? at.x : x,
        y: at && Math.abs(y - at.y) <= keep! ? at.y : y,
      };
    }

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
      area: this.options.area ?? stage,
      head: this.head,
      tracking: (kind) => {
        /* (`lookAtSprite`: the cursor where there is none of the kind.) */
        this.tracked = kind && !this.options.trackAt?.(kind) ? 0x17 : kind;
      },
      /* A point at random, and what it tracks each tick, looked at from where the frame before left it. */
      look: (point, _ticked, rotation, how) =>
        this.tail ? this.lookAt(point, rotation, how) : undefined,
      track: (_step, rotation) => {
        const at = this.tracked ? this.options.trackAt?.(this.tracked) : undefined;
        return at && this.tail ? this.lookAt(at, rotation, this.head) : undefined;
      },
      align: this.armed,
      went: () => {
        this.armed = undefined;
      },
      trailing: (cues) => {
        trailing = cues;
      },
      done: (step) => {
        if (!shaped[step.frame]) {
          return;
        }

        /* A leap's frames held back until it has all of them. */
        if (this.leapFrom) {
          this.leapFrom.held.push({ step, there });
          there = undefined;

          if (
            this.leapFrom.held.filter(({ step }) => !step.reference).length >=
            this.leapFrom.leap.count
          ) {
            this.leapt(position);
          }

          return;
        }

        this.place(step, there, position);
        there = undefined;
      },
    });

    /* A leap cut short by its action's end: its frames placed as they are. */
    if (this.leapFrom) {
      this.leapt(position);
    }

    /* Cued after its last frame: the cues its last shown frame raises, as it is done. */
    const last = this.queue.at(-1);

    if (trailing && last && this.queue.length > before) {
      this.queue[this.queue.length - 1] = {
        ...last,
        step: { ...last.step, cues: [...(last.step.cues ?? []), ...trailing] },
      };
    }

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

  /**
   * A step done placed, as `PopScript` places it, and queued: a reference
   * frame kept to place the next by; a leap under way carrying it; a leap
   * begun in its tick waited on.
   */
  private place(step: CatzStep, there: boolean | undefined, position: number) {
    const { placer, stage, fudgers } = this.options;

    if (step.reference) {
      /* Popped, it places the next; the last of all, done again as its tick ends, the same. */
      this.held = step;
      return;
    }

    /* Its cues raised in the tick it is popped in with the next (`IsCued` asks of the tick's), so the next shown has them too. */
    if (this.held?.cues?.length) {
      step = { ...step, cues: [...this.held.cues, ...(step.cues ?? [])] };
    }

    const pose = catzPoseOf(step);

    /* A layered action whose frames these files lack (the demo's) not layered. */
    if (
      pose.layer &&
      (!this.options.shaped[pose.layer.first] || !this.options.shaped[pose.layer.frame])
    ) {
      pose.layer = undefined;
      step.layer = undefined;
    }

    const shift = this.leaping && catzLeapTick(this.leaping);
    const landed =
      this.leaping && this.leaping.done >= this.leaping.count ? this.leapTo : undefined;

    if (landed) {
      this.leaping = undefined;
    }

    this.tail = this.tail
      ? placeCatzTick(placer, this.tail, pose, {
          reference: this.held,
          glued: !!step.glue,
          area: stage,
          shift,
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

    /* Where its ball landed, against where it leapt to. */
    if (landed) {
      const { ball } = landed;
      const { rect, current } = this.tail;
      const at =
        ball === -11
          ? {
              x: Math.trunc((rect.left + rect.right) / 2),
              y: Math.trunc((rect.top + rect.bottom) / 2),
            }
          : placer.ballOnStage(rect, current, ball);
      this.leaps.push({ ...landed, at });
    }

    if (step.leap) {
      this.leapFrom = { leap: step.leap, held: [] };
    }
  }

  /**
   * A leap's frames all played out: placed ahead from where its first tick
   * left the cat (`catzLeapFrom`), and then each placed in turn, carried.
   */
  private leapt(position: number) {
    const { leap, held } = this.leapFrom!;
    this.leapFrom = undefined;
    const ahead: Parameters<typeof catzLeapFrom>[2] = [];
    let before: CatzStep | undefined;

    for (const { step } of held) {
      if (step.reference) {
        before = step;
      } else {
        ahead.push({ pose: catzPoseOf(step), reference: before, glued: !!step.glue });
        before = undefined;
      }
    }

    this.leapTo = leap;
    this.leaping =
      this.tail && ahead.length === leap.count
        ? catzLeapFrom(this.options.placer, this.tail, ahead, leap)
        : undefined;

    for (const { step, there } of held) {
      this.place(step, there, position);
    }
  }

  /** The head and eyes aimed at a point (`catzHeadTarget`) from where the last frame queued leaves it. */
  private lookAt(point: CatzPoint, rotation: number, how: CatzHeadState) {
    const { placer, fudgers } = this.options;
    return catzHeadTarget(placer, this.tail!.rect, this.tail!.current, point, {
      rotation,
      ...how,
      lower: fudgers[3].lower,
      upper: fudgers[3].upper,
    });
  }

  /**
   * Where its states turn its head (`SetHeadTracking`, `LookAtUser`): to
   * track a kind at a speed, its head's turn and tilt aimed so fast, and
   * whether it is on the shelf; at the user, the head turned against the
   * cat's rotation and level, tracking nothing; off, tracking nothing and
   * the turn and tilt reset. Or its eyelids reset (`ResetEyelids`).
   */
  look(look: { kind: number; speed: number; shelved: boolean } | 'user' | 'off' | 'lids') {
    const { fudgers } = this.options;

    if (look === 'lids') {
      resetCatzEyelids(fudgers);
    } else if (look === 'off') {
      this.tracked = 0;
      resetCatzFudger(fudgers[3]);
      resetCatzFudger(fudgers[4]);
    } else if (look === 'user') {
      this.tracked = 0;
      aimCatzFudger(fudgers[3], -wrapCatzAngle(fudgers[0].value));
      aimCatzFudger(fudgers[4], 0);
    } else {
      this.tracked = look.kind;
      this.head.shelved = look.shelved;
      rateCatzFudger(fudgers[3], look.speed);
      rateCatzFudger(fudgers[4], look.speed);
    }
  }

  /**
   * A state of its own entered (`CatSprite::NewState`, seg16:22dd): but for
   * 9, 0x21 and 0x22, tilted (`+0x68a`) its tilt's fudger (2), and rolled
   * (`+0x68c`) its roll's (1), set up to align to 0 and gone over 5 ticks
   * (`Fudger` slots `0x50`, `0x54`).
   */
  entered(state: number) {
    const pose = this.shown?.pose;

    if (!pose || state === 9 || state === 0x21 || state === 0x22) {
      return;
    }

    const { fudgers } = this.options;

    for (const [n, value] of [
      [2, pose.tilt],
      [1, pose.roll],
    ]) {
      if (value) {
        alignCatzFudger(fudgers[n], 0);
        goAlignCatzFudger(fudgers[n], 5);
      }
    }
  }

  /** Hung by a ball under a point (dangling from the cursor, ball 0x24): the frame shown, and those queued, moved so. */
  hang(ball: number, point: CatzPoint) {
    const shown = this.shown;

    if (!shown) {
      return;
    }

    const at = this.options.placer.ballOnStage(shown.rect, shown.pose, ball);
    const rect = shown.rect;
    this.moveTo({
      x: Math.trunc((rect.left + rect.right) / 2) + point.x - at.x,
      y: Math.trunc((rect.top + rect.bottom) / 2) + point.y - at.y,
    });
  }

  /** Its rotation's fudger's aim rate set (`SetAimRate`): what it plays after turns so. */
  aimRate(rate: number) {
    rateCatzFudger(this.options.fudgers[0], rate);
  }

  /**
   * Put so that the middle of its rectangle -- its target point -- is at a
   * point (`MoveDrawPt`): the frame shown, and those queued, moved with it.
   */
  moveTo({ x, y }: CatzPoint) {
    const rect = (this.queue.at(-1) ?? this.shown)?.rect;
    const from = this.shown?.rect ?? rect;

    if (!from) {
      this.options.start = { x, y };
      return;
    }

    const dx = x - Math.trunc((from.left + from.right) / 2);
    const dy = y - Math.trunc((from.top + from.bottom) / 2);
    const move = (r: CatzRect) => ({
      left: r.left + dx,
      top: r.top + dy,
      right: r.right + dx,
      bottom: r.bottom + dy,
    });

    /* Whether each frame found what it walked to was looked for where it was: moved, not yet looked for. */
    if (this.shown) {
      this.shown = { ...this.shown, rect: move(this.shown.rect), there: undefined };
    }

    this.queue.forEach(
      (shown, n) => (this.queue[n] = { ...shown, rect: move(shown.rect), there: undefined })
    );

    if (this.tail) {
      this.tail = { ...this.tail, rect: move(this.tail.rect) };
    }
  }

  /**
   * Made again as another breed (the Adoption Kit's `SetupNewBasket`): its
   * frames reshaped, placer and frames' angles its new breed's; what was
   * queued dropped, and it put at a point, standing in its new shape.
   */
  rebreed(
    shaped: Frame[],
    placer: CatzPlacer,
    angle: (frame: number) => number | null,
    at: CatzPoint
  ) {
    Object.assign(this.options, { shaped, placer, angle, start: at });
    this.queue.length = 0;
    this.layered.length = 0;
    this.shown = undefined;
    this.tail = null;
    this.held = undefined;
    this.leaping = undefined;
    this.leapFrom = undefined;
    this.armed = undefined;
  }

  /** A layered action pushed on its own (`PushLayeredAction`): its frames, one a tick, drawn over what is shown. */
  private readonly layered: { first: number; frame: number; sounds?: number[] }[] = [];

  /** The sounds the frames newly shown this tick play (`HandleSoundVerb`'s, by their numbers): its own frame's, and its layered action's. */
  heard: number[] = [];

  /** Whether a layered action pushed on its own plays (`GetLayeredFramesRemaining`). */
  get layering() {
    return this.layered.length > 0;
  }

  /**
   * A layered action played over what it shows, as a reflex pushes one
   * (`HandleMiscLayering`): its frames as its script has them (a variant,
   * its sequences, drawn so), each drawn over a frame shown in turn -- not
   * placed by them. None where its frames are missing.
   */
  layer(action: number) {
    const { scripts, positions, flags, shaped, random } = this.options;

    if (!scripts[action] || this.layered.length) {
      return;
    }

    const steps = catzTimeline(scripts, positions, action, {
      flags,
      random: (n) => random(n),
      limit: 200,
      from: scripts[action].from || positions.neutral,
    }).filter(({ reference }) => !reference);
    const first = steps[0]?.frame;

    if (first === undefined || steps.some(({ frame }) => !shaped[frame])) {
      return;
    }

    this.layered.push(...steps.map(({ frame, sounds }) => ({ first, frame, sounds })));
  }

  /** The next frame shown, where there is one; else the last stays. A layered action pushed on its own drawn over it. */
  next() {
    const popped = this.queue.shift();
    this.shown = popped ?? this.shown;
    const played = this.layered.shift();
    this.heard = [...(popped?.step.sounds ?? []), ...(played?.sounds ?? [])];

    if (played && this.shown && !this.shown.step.layer) {
      const layer = { first: played.first, frame: played.frame };
      this.shown = {
        ...this.shown,
        step: { ...this.shown.step, layer },
        pose: { ...this.shown.pose, layer },
      };
    }

    return this.shown;
  }

  /** A new state entered drops what was left of the old: the frames still queued, the body put back where the frame shown left it. */
  drop() {
    if (!this.queue.length || !this.shown) {
      return;
    }

    this.queue.length = 0;
    this.leaping = undefined;
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
