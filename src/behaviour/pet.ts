/**
 * The dog on its own: what it does when nobody plays with it. The engine's
 * `PetModule` is a state machine (`StateDispatch`, DOGZDLL.DLL seg21:503f)
 * whose states push scripts onto the dog's queue and react as the queue
 * plays out; this is the part of it that runs without the user: idling,
 * tricks, sleeping and wandering about. See kb/topics/behaviour.md, which
 * says which parts are read from the code and which are inferred.
 *
 * Every choice is made with the engine's `rand() % n`, so that given the
 * same seed it chooses as the engine would where the two agree.
 */

import {
  AREA,
  FIRST_TRICK,
  type EngineScripts,
  POSITION,
  type TrickScript,
} from '../formats/engine.ts';
import { type Script } from '../formats/script.ts';
import { type Trick } from '../formats/tricks.ts';
import { type Brain } from './brain.ts';
import { type Ball } from './stage.ts';
import { type Rand } from './random.ts';
import { DEFAULT_GLUE, type Step, timeline } from './timeline.ts';
import { AUTO, findTransition, type TransitionTable } from './transitions.ts';

/** The engine's states this file plays, by the numbers `readEngineStateNames` names. */
export const STATE = {
  waitState: 1,
  chasingOwner: 3,
  idle: 4,
  sleeping: 5,
  locomoteTrip: 6,
  locomote: 7,
  postLocomote: 8,
  chasingPetting: 0x13,
  waitPetting: 0x14,
  pettingGood: 0x15,
  pettingBad: 0x16,
  aligningPetting: 0x17,
  chasingBall: 0x18,
  returningBallDirect: 0x19,
  returningBallIndirect: 0x1a,
  anticipatingBall: 0x1b,
  guardingBall: 0x1c,
  grabbingBall: 0x1d,
  grabbingBallMiss: 0x1e,
  jumpingGrabbingBall: 0x1f,
  jumpingGrabbingBallMiss: 0x20,
  releasingBall: 0x21,
  observingBallThrown: 0x25,
  beggingChasing: 0x26,
  eating: 0x28,
  grabbingTreat: 0x29,
  begging: 0x2a,
  firstTrick: FIRST_TRICK,
  chasingWall: 0x54,
  lastIdleTrick: 0x60,
  lungingWall: 0x66,
  firstBallTrick: 0x61,
  lastBallTrick: 0x65,
} as const;

/**
 * The global states this file plays (`NewGlobalState`, seg21:5dfa): left
 * alone, being petted, and after a treat, 0x3ed blue, 0x3ee green and
 * 0x3ef red, which `ReducedGlobalState` reduces, with food and water, to 0x3eb.
 */
export const GLOBAL = {
  idle: 1000,
  begEat: 0x3eb,
  firstTreat: 0x3ed,
  fetch: 0x3f0,
  petting: 0x3f3,
} as const;

/** Script positions the engine names by number (`readStateNames`). */
const SITTING = 6;
const STANDING = 9;

/** Balls glued by: the belly, and the chest. */
const BELLY = DEFAULT_GLUE;
const CHEST = 50;

/** Scripts the engine plays by number. */
const SCRIPT = {
  pant: 2,
  sitPant: 74,
  sitUp: 14,
  petHead: 47,
  petHeadMore: 45,
  thump: 64,
  thumpMore: 65,
  thumpMost: 66,
  rollover: 29,
  rollOnBack: 59,
  sleepOnBack: 140,
  growl: 43,
  shake: 120,
  shakeOther: 121,
  flinch: 122,
  startWalking: 21,
  startBackwards: 210,
  stopWalking: 22,
  stopBackwards: 211,
  walkBackwards: 210,
  eatTreat: 86,
  stopRunning: 26,
  stopRunningHard: 205,
  snatch: 240,
  reachForBall: 82,
  grabBall: 81,
  pounceOnBall: 29,
  dropBall: 8,
  lookAgain: 60,
  jumpForBall: 25,
  jumpMissed: 83,
  fumble: 185,
  pawBall: 186,
  pantLonger: 30,
  sitPantLonger: 119,
  walk: 13,
  turnAround: 219,
  circle: 212,
  lieDown: 213,
  run: 9,
  standUp: 73,
  standUpExcited: 202,
  startRunning: 10,
  trip: 224,
  bark: 112,
  barkSitting: 191,
  boing: 188,
  sneeze: 159,
} as const;

/** Engine ticks a second: its clock is milliseconds over 17. */
export const TICKS_PER_SECOND = 1000 / 17;

/** The excitement cycle's period, in seconds over pi (`PetModule::LoadFactors`). */
const MOOD_PERIOD = 400;

/** The ball the dog arrives by: a target is reached when it is ahead of the nose (seg7:6b45). */
const NOSE = 55;

/** How fast the dog turns towards a target, in 256ths of a turn a frame (`DoLocomote`). */
const TURN_RATE = 6;

/** What `SetTargetLocation`'s last number is when the engine gives it (`DoLocomote`). */
const FOCUS_DISTANCE = 4;

export interface PetData {
  scripts: Script[];
  table: TransitionTable;
  positionKinds: number[];
  tricks: Trick[];
  trickDefaults: Trick[];
  trickScripts: TrickScript[];
  engineScripts: EngineScripts;

  /** Each frame's sequence flags, numbered over every animation. */
  flags: (frame: number) => number;

  /** The brain, if the dog has one (`XBrain`, from `BRAIN.PBT`). */
  brain?: Brain;
}

/** The treats' names, as `FoodSprite::theirNames` gives them after food and water. */
const TREATS = ['BlueTreat', 'GreenTreat', 'RedTreat'];

/** What the engine needs to know of the stage, and of where the dog is on it. */
export interface PetWorld {
  width: number;
  height: number;

  /** Where the dog is, from the stage's top left. */
  where(): { x: number; y: number };

  /** The rotation that faces the dog towards a point. */
  aim(target: { x: number; y: number }): number;

  /** The user's cursor, and whether its primary button is down; optional, for a dog left alone. */
  cursor?(): { x: number; y: number; button: boolean };

  /** The part of the dog's body under a point (`AREA`), or -1. */
  areaAt?(point: { x: number; y: number }): number;

  /** A ball of the dog on the stage, and how wide it is drawn. */
  ballOnStage?(ball: number): { x: number; y: number; diameter: number };

  /** The middle of the rectangle the dog is drawn in: where the engine takes it to be (`0x86`). */
  centre?(): { x: number; y: number };

  /** The pet's standard size: frame 35 drawn side on (`FigureOutStandardWidthAndHeight`). */
  standardSize?(): { width: number; height: number };

  /** The rectangle the dog is drawn in. */
  rect?(): { left: number; top: number; right: number; bottom: number };

  /** The treat out of its box, if any: 0 blue, 1 green, 2 red. */
  treat?: {
    colour: number;
    held: boolean;
    x: number;
    y: number;
    inMouth?: boolean;
    beingEaten?: boolean;
  } | null;

  /** Takes the treat away: the dog has eaten it. */
  eatTreat?(): void;

  /** The ball out of the toy box, if any. */
  ball?: Ball | null;

  /** Where the ball will be so many frames on, and how often it will bounce. */
  projectBall?(frames: number): { x: number; y: number; bounces: number };
  grabBall?(slot: number): void;
  releaseBall?(slot: number): void;
  ballHasMoved?(): boolean;

  /** A frame of the ball (`XStage::UpdateSprites`), after the dog's. */
  updateBall?(): void;

  /** Where a ball of the dog would be in a frame, were the dog not to move; and moving it. */
  ballInFrame?(frame: number, ball: number, rotation: number): { x: number; y: number };
  nudge?(dx: number, dy: number): void;
}

/** A cursor sample, one a frame: `ReallyDoDrawFrame` keeps thirty. */
interface Sample {
  x: number;
  y: number;
  button: boolean;
}

/** How many past cursor samples this keeps: as many as the engine reads. */
const SAMPLES = 6;

/** How near the cursor or a treat the dog walks before it begs or waits. Inferred. */
const NEAR = 40;

/**
 * One tick: the frame to show, with what happens as it is, the dog's
 * rotation after, and the reference frame it is placed by, if any.
 */
export interface Tick extends Step {
  rotation: number;
  state: number;
  placedBy?: number;
}

/** A state's handler runs as the state is entered, as it is left, and every tick between. */
type Mode = 'enter' | 'exit' | 'run';

type Item =
  | { step: Step; script?: number }
  | { end: number }
  | { glue: number }
  | { goto: number }
  | { ease: number }
  | { drift: number }
  | { cue: number }
  | { trick: number }
  | { aim: { ball: number; at: { x: number; y: number } | null } };

/** An angle in 256ths of a turn, from -128 to 127. */
const wrap = (angle: number) => ((((angle + 128) % 256) + 256) % 256) - 128;

export class Pet {
  readonly factors: number[];

  /** The centres the factors drift back to (`0x11f4`). */
  readonly centres: number[];

  state = 0;
  global: number = GLOBAL.idle;
  history: number[] = [];

  /** The idle or sleep plan, and how far through it the dog is. */
  plan: number[] = [];
  planAt = 0;

  /** The script position the last script pushed leaves the dog in. */
  position = STANDING;

  rotation = 0;
  target: { x: number; y: number } | null = null;

  /**
   * Where the sprite is steering to (`SetTargetLocation`, seg7:295e): a
   * point, how fast to turn, and the size and distance of the box ahead of
   * the nose the point must fall in to be reached.
   */
  steer: {
    point: { x: number; y: number };
    rate: number;
    width: number;
    height: number;
    distance: number;
  } | null = null;

  private queue: Item[] = [];
  private gotoState = 0;
  private lastScript = -1;
  private locomotion: number = SCRIPT.walk;
  private clumsyCount = 0;

  private ease: { to: number; by: number } | null = null;
  private placedBy: number | undefined;
  private drift = 0;
  private lastStep: Step = { frame: 0 };

  private phase = 0;
  private time = 0;
  private nextDrift = 0;

  /** Cues raised by what was popped this tick: `PopScript` clears them each time. */
  private cues = new Set<number>();

  /** The script playing, and the trick last done (`0x8b06`), for a treat to reward. */
  private playing = -1;
  lastTrick = 0;

  /** A state is waiting on the user (`0x222`), set by cue 0 or 4 and cleared by cue 1. */
  private waiting = false;

  // What the user is doing, from `ReallyDoDrawFrame` and `DoPettingHandler`.
  private samples: Sample[] = [];
  private area = -1;
  petting = false;

  /** The cursor waggles: moving 8 pixels a frame and more, but staying within 100 (`0x21e`). */
  private waggling = false;

  /** How much the dog has enjoyed this petting, 0 to 16 (`0x122a`). */
  pettingLevel = 0;

  /** The spot it wants petting (`PickNewPetSpot`), and for how many more strokes. */
  petSpot = 0;
  private spotStrokes = 0;
  private offSpot = 0;
  private waitCount = 0;
  private walkDirection = 1;

  /** The brain is consulted from the first beg on (`ActivateBrain`). */
  brainActive = false;

  get brain() {
    return this.data.brain;
  }

  private readonly idleWeights: number;
  private readonly data: PetData;
  private readonly world: PetWorld;
  private readonly rand: Rand;

  constructor(
    data: PetData,
    world: PetWorld,
    rand: Rand,
    factors: { centre: number; spread: number }[],
    age = 0
  ) {
    this.data = data;
    this.world = world;
    this.rand = rand;
    this.factors = new Array(11).fill(0);
    this.centres = factors.map((factor) => factor.centre);
    this.idleWeights = data.tricks.reduce((sum, trick) => sum + trick.idleWeight, 0);
    this.loadFactors(factors, age);
  }

  /** A factor, as the engine reads it: from 1 to 100 (`PetModule::GetFactor`). */
  factor(n: number) {
    return Math.min(100, Math.max(1, this.factors[n]));
  }

  /** `PetModule::LoadFactors`: each factor near its breed's centre, the spread either side. */
  private loadFactors(factors: { centre: number; spread: number }[], age: number) {
    this.setFactor(10, Math.min(99, age * 10));
    this.centres[3] += Math.trunc((100 - this.factor(10)) / 3);

    for (let n = 0; n < 10; n++) {
      const spread = factors[n].spread;
      let offset = Math.trunc(spread - Math.sqrt(this.rand() % Math.max(1, spread * spread)));

      if (this.rand() % 2) {
        offset = -offset;
      }

      this.centres[n] = Math.min(100, Math.max(1, this.centres[n] + offset));

      if (n !== 1) {
        this.setFactor(n, this.centres[n]);
      }
    }
  }

  setFactor(n: number, value: number) {
    const clamped = Math.min(100, Math.max(1, value));

    if (n === 0) {
      this.setExcitement(clamped);
    } else {
      this.factors[n] = clamped;
    }
  }

  /** The angle of the mood cycle now, without its phase. */
  private moodAngle() {
    return (Math.PI * (this.time / 60)) / MOOD_PERIOD;
  }

  /**
   * `PetModule::SetExcitement`: puts the mood cycle where excitement is this
   * now. Excitement is a sine of time, raised to a power its centre sets.
   */
  private setExcitement(value: number) {
    const power = (101 - this.centres[0]) / 25;
    const level = Math.trunc(Math.pow(value / 100, 1 / power) * 100);

    this.phase = Math.asin((level - 50) / 50) - this.moodAngle();
    this.factors[0] = level;
  }

  /**
   * `PetModule::PulseTrickData`: excitement follows its cycle, and now and
   * then the trick weights and the other factors step back towards their
   * defaults and centres.
   */
  private pulse() {
    const power = (100 - this.centres[0]) / 25;
    const wave = (1 + Math.sin(this.phase + this.moodAngle())) / 2;

    this.factors[0] = Math.trunc(Math.pow(wave, power) * 100);

    if (this.time < this.nextDrift) {
      return;
    }

    this.nextDrift = this.time + 900 + 400 - 4 * this.factor(0);

    if (this.state === STATE.sleeping) {
      this.nextDrift += 3600;
    }

    this.data.tricks.forEach((trick, n) => {
      const defaults = this.data.trickDefaults[n];
      trick.idleWeight += Math.sign(defaults.idleWeight - trick.idleWeight);
      trick.playWeight += Math.sign(defaults.playWeight - trick.playWeight);
    });

    for (let n = 1; n < 10; n++) {
      this.factors[n] += Math.sign(this.centres[n] - this.factors[n]);
    }
  }

  /** Starts the dog off, as `NewGlobalState` into idle does: walking (`EnterIdle`). */
  start(time = 0) {
    this.time = time;
    this.nextDrift = time;
    this.setExcitement(this.centres[0]);
    this.enterIdle(0);
  }

  /**
   * One tick of the engine, `time` in its ticks, in the order of
   * `ReallyDoDrawFrame` (seg21:3dee): the cursor is sampled, petting is
   * looked for, the dog's state acts and a frame plays, and its mood moves on.
   */
  tick(time: number): Tick {
    this.time = time;
    this.sample();
    this.doPettingHandler();

    const shown = this.dispatch();
    this.world.updateBall?.();
    this.pulse();
    this.data.brain?.pulse();
    return { ...shown, rotation: this.rotation, state: this.state, placedBy: this.placedBy };
  }

  // The script queue: what `ScriptSprite` keeps and `PopScript` plays.

  private push(...items: Item[]) {
    this.queue.push(...items);
  }

  private isGlued() {
    const last = this.queue[this.queue.length - 1];
    return last !== undefined && 'glue' in last;
  }

  /** `GlueScriptsIfNotGlued`. */
  private glueIfNotGlued(ball: number) {
    if (!this.isGlued()) {
      this.push({ glue: ball });
    }
  }

  private pushScript(index: number) {
    const script = this.data.scripts[index];
    const variant = this.rand() % script.variants.length;
    const steps = timeline(this.data.scripts, index, variant, {
      flags: this.data.flags,
      random: (n) => this.rand() % n,
      limit: 600,
    });

    this.push(...steps.map((step) => ({ step, script: index })), { end: index });
  }

  /**
   * `ScriptSprite::PushStoredScript`: a script, after whatever takes the dog
   * to where it starts, glued by the belly unless it repeats.
   */
  private pushStored(index: number) {
    const script = this.data.scripts[index];

    this.pushTransition(script.from, this.lastScript === index ? -1 : BELLY);
    this.pushScript(index);

    if (script.to !== AUTO) {
      this.position = script.to;
    }

    this.lastScript = index;
  }

  /** `ScriptSprite::PushTransitionToNeutralPos`. Returns whether it pushed any script. */
  private pushTransition(to: number, glue: number) {
    const path = findTransition(this.data.table, this.data.scripts, this.position, to);

    path.forEach((index, step) => {
      let script = index;
      let tripped = false;

      if (script === SCRIPT.standUp && (this.rand() % 30) + 30 < this.factor(0)) {
        script = SCRIPT.standUpExcited;
      }

      if (script === SCRIPT.startRunning && this.decideIfClumsy()) {
        script = SCRIPT.trip;
        tripped = true;
      }

      if (step > 0) {
        this.push({ glue: CHEST });
      }

      this.pushScript(script);

      if (tripped) {
        this.push({ glue: BELLY });
      }
    });

    if (path.length) {
      this.position = to;
    }

    if (glue >= 0 && glue < 65) {
      if (path.length) {
        this.push({ glue });
      } else {
        this.glueIfNotGlued(glue);
      }
    }

    return path.length > 0;
  }

  /** `PetModule::DecideIfClumsy`: now and then, more often the clumsier the dog. */
  private decideIfClumsy() {
    this.clumsyCount++;
    const clumsy = this.rand() % 400 < this.factor(3) && this.clumsyCount > 5;

    if (clumsy) {
      this.clumsyCount = 0;
    }

    return clumsy;
  }

  /**
   * `ScriptSprite::PopScript`, for what this file plays: shows the next frame
   * and returns flags, 1 when the queue has run out, 2 when the dog has
   * reached its target, 8 when the queue says which state to go to.
   */
  private pop(): { step: Step; flags: number } {
    let flags = 0;
    let glue: number | undefined;
    let step: Step | undefined;
    let placedBy: number | undefined;

    this.cues.clear();

    const control = (item: Item) => {
      if ('cue' in item) {
        this.cues.add(item.cue);
      } else if ('trick' in item) {
        this.lastTrick = item.trick;
      } else if ('aim' in item) {
        this.startAim(item.aim.ball, item.aim.at);
      } else if ('glue' in item) {
        glue = item.glue;
      } else if ('goto' in item) {
        this.gotoState = item.goto;
        flags |= 8;
      } else if ('ease' in item) {
        this.startEase(item.ease, this.framesAhead());
      } else if ('drift' in item) {
        this.drift = item.drift;
      }
    };

    while (this.queue.length && !step) {
      const item = this.queue.shift()!;

      if ('step' in item && item.step.reference) {
        placedBy = item.step.frame;
      } else if ('step' in item) {
        step = { ...item.step, glue: item.step.glue ?? glue };
        this.playing = item.script ?? this.playing;
      } else {
        control(item);
      }
    }

    /* What follows the last frame -- a state to go to -- is acted on now. */
    while (this.queue.length && !('step' in this.queue[0]) && !('glue' in this.queue[0])) {
      control(this.queue.shift()!);
    }

    if (!this.queue.some((item) => 'step' in item && !item.step.reference)) {
      flags |= 1;
    }

    if (this.steer) {
      flags |= this.steerFrame();
    }

    if (step) {
      this.turn(step);
      this.lastStep = step;
      this.placedBy = placedBy;

      if (this.slide && this.slide.left-- > 0) {
        this.slide.x += this.slide.dx;
        this.slide.y += this.slide.dy;
        const [x, y] = [Math.trunc(this.slide.x), Math.trunc(this.slide.y)];
        this.world.nudge?.(x - this.slide.movedX, y - this.slide.movedY);
        this.slide.movedX = x;
        this.slide.movedY = y;
      }

      if (step.release !== undefined) {
        this.releaseObject(step.release);
      }

      if (step.grab !== undefined) {
        this.grabObject(step.grab);
      }

      for (const cue of step.cues ?? []) {
        this.cues.add(cue);
      }
    } else {
      step = { frame: this.lastStep.frame };
      this.placedBy = undefined;
    }

    return { step, flags };
  }

  /** `ScriptSprite::SetTargetLocation` (seg7:295e): steer to a point, or, with none, stop. */
  setTargetLocation(
    point: { x: number; y: number } | null,
    rate = TURN_RATE,
    width = 0,
    height = 0,
    distance = FOCUS_DISTANCE
  ) {
    this.steer = point ? { point: { ...point }, rate, width, height, distance } : null;
  }

  /**
   * What `PopScript` does each frame for a target (seg7:6b38 to 6d24): it is
   * reached if it falls in a box of the target's size ahead of the nose —
   * the box's diagonal over the distance, the way the dog faces
   * (`MakeFocusRect`, seg7:3565); otherwise the dog's rotation is set
   * turning towards it, `atan2` of where it is from the middle of the dog.
   */
  private steerFrame() {
    const { point, rate, width, height, distance } = this.steer!;
    const nose = this.world.ballOnStage?.(NOSE);
    const centre = this.world.centre?.() ?? this.world.where();

    if (nose) {
      const ahead = Math.trunc(Math.trunc(Math.sqrt(width * width + height * height)) / distance);
      const sine = Math.trunc(Math.sin((this.rotation * Math.PI) / 128) * 256);
      const x = nose.x - Math.trunc((256 * ahead * sine) / 65536);
      const half = { x: Math.trunc(width / 2), y: Math.trunc(height / 2) };

      if (
        point.x >= x - half.x &&
        point.x < x + half.x &&
        point.y >= nose.y - half.y &&
        point.y < nose.y + half.y
      ) {
        return 2;
      }
    }

    const dx = Math.trunc(point.x - centre.x);
    const dy = Math.trunc(point.y - centre.y);

    if (dx === 0 && dy === 0) {
      return 2;
    }

    let bearing = Math.trunc((Math.atan2(-dy, -dx) * 256) / 6.283) + 64;

    if (bearing > 128) {
      bearing -= 256;
    }

    /* `AngleFudger::SetTarget` (seg4:0e98): the shorter way round. */
    const ahead = (((bearing - this.rotation) % 256) + 256) % 256;
    this.ease = { to: wrap(bearing), by: ahead > 128 ? -rate : rate };
    return 0;
  }

  /** Frames queued before the next state change: what an ease is spread over. */
  private framesAhead() {
    let count = 0;

    for (const item of this.queue) {
      if ('step' in item && !item.step.reference) {
        count++;
      } else if ('goto' in item) {
        break;
      }
    }

    return Math.max(1, count);
  }

  private startEase(to: number, frames: number) {
    const difference = wrap(to - this.rotation);
    this.ease = { to, by: Math.trunc(difference / frames) + Math.sign(difference) };
  }

  /** The dog's rotation through a frame: its turn, then any ease and drift. */
  private turn(step: Step) {
    this.rotation = wrap(this.rotation + (step.turn ?? 0));

    if (step.ease) {
      this.startEase(step.ease.to, step.ease.frames);
    }

    if (step.drift !== undefined) {
      this.drift = step.drift;
    }

    if (this.ease) {
      const left = wrap(this.ease.to - this.rotation);

      if (Math.abs(left) <= Math.abs(this.ease.by)) {
        this.rotation = this.ease.to;
        this.ease = null;
      } else {
        this.rotation = wrap(this.rotation + this.ease.by);
      }
    }

    this.rotation = wrap(this.rotation + this.drift);
  }

  // The state machine.

  /**
   * `PetModule::NewState`: the old state leaves, the dog is glued by the
   * chest unless the queue already glues it, and the new state enters.
   */
  newState(state: number) {
    this.handle(this.state, 'exit');
    this.history = [state, ...this.history].slice(0, 10);
    this.state = state;
    this.glueIfNotGlued(CHEST);
    this.handle(state, 'enter');
  }

  private dispatch(): Step {
    return this.handle(this.state, 'run') ?? this.pop().step;
  }

  /**
   * `PetModule::StateDispatch`: the state's handler, as it enters, as it
   * leaves, or as it goes from tick to tick.
   */
  private handle(state: number, mode: Mode): Step | undefined {
    if (state === STATE.idle) {
      return this.doIdle(mode);
    }

    if (state === STATE.sleeping) {
      return this.doSleeping(mode);
    }

    if (state === STATE.locomote) {
      return this.doLocomote(mode);
    }

    if (state === STATE.postLocomote) {
      return this.doPostLocomote(mode);
    }

    switch (state) {
      case STATE.chasingOwner:
      case STATE.chasingPetting:
      case STATE.beggingChasing:
      case STATE.chasingWall:
        return this.doTargettedLocomote(mode);
      case STATE.locomoteTrip:
        return this.doLocomoteTrip(mode);
      case STATE.lungingWall:
        return this.doLungingWall(mode);
      case STATE.chasingBall:
      case STATE.returningBallDirect:
      case STATE.returningBallIndirect:
        return this.doTargettedLocomote(mode);
      case STATE.waitState:
        return this.doWaitState(mode);
      case STATE.anticipatingBall:
      case STATE.guardingBall:
        return this.doAnticipatingBall(mode);
      case STATE.grabbingBall:
        return this.doGrabbingBall(mode);
      case STATE.grabbingBallMiss:
      case STATE.jumpingGrabbingBallMiss:
        return this.doMissingBall(mode);
      case STATE.jumpingGrabbingBall:
        return this.doJumpingGrabbingBall(mode);
      case STATE.releasingBall:
        return this.doReleasingBall(mode);
      case STATE.observingBallThrown:
        return this.doObservingBallThrown(mode);
    }

    if (state >= STATE.firstBallTrick && state <= STATE.lastBallTrick) {
      return this.doBallTrick(mode);
    }

    if (state >= STATE.firstTrick && state <= STATE.lastIdleTrick) {
      return this.doTrick(mode);
    }

    switch (state) {
      case STATE.waitPetting:
        return this.doWaitPetting(mode);
      case STATE.pettingGood:
        return this.doPettingGood(mode);
      case STATE.pettingBad:
        return this.doPettingBad(mode);
      case STATE.aligningPetting:
        return this.doAligningPetting(mode);
      case STATE.eating:
        return this.doEating(mode);
      case STATE.grabbingTreat:
        return this.doGrabbingTreat(mode);
      case STATE.begging:
        return this.doBegging(mode);
    }

    return undefined;
  }

  /**
   * `ResetScriptSoft`: the script playing plays to its end, and what was
   * queued after it is dropped. Inferred from its name and its callers.
   */
  private resetSoft() {
    const end = this.queue.findIndex((item) => 'end' in item);
    this.queue = end === -1 ? [] : this.queue.slice(0, end + 1);
    this.target = null;
    this.steer = null;
  }

  private isOnscreen() {
    const { x, y } = this.world.where();
    return x > 0 && y > 0 && x < this.world.width && y < this.world.height;
  }

  /** `PetModule::SetupIdle`: a plan of pants and tricks, shorter the more excited the dog. */
  private setupIdle() {
    const excitement = this.factor(0);

    this.rand();
    const length =
      (this.rand() % (13 - Math.trunc(excitement / 10))) + (6 - Math.trunc(excitement / 20));

    this.plan = [];
    this.planAt = 0;

    for (let n = 0; n < length; n++) {
      if (this.rand() % 100 > excitement) {
        for (let pants = (this.rand() % 4) + 1; pants; pants--) {
          for (let still = (this.rand() % 3) + 1; still; still--) {
            this.plan.push(0);
          }

          if (this.rand() % 2) {
            this.plan.push(1);
          }

          /* The engine pushes the longer pant only when rand() is 0. */
          if ((this.rand() === 0 ? 1 : 0) % 3) {
            this.plan.push(2);
          }
        }
      } else {
        this.plan.push(3);
      }
    }
  }

  /** `PetModule::DoIdle`, seg16:02ce. */
  private doIdle(mode: Mode): Step | undefined {
    const excitement = this.factor(0);

    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      if (this.planAt >= this.plan.length) {
        const desktop = this.checkDesktop();

        if (desktop) {
          this.newGlobalState(desktop);
          return undefined;
        }

        this.pushTransition(this.rand() % 100 < excitement ? STANDING : SITTING, BELLY);
        this.push({ glue: CHEST });
        this.setupIdle();
      }
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (!this.isOnscreen()) {
        this.newState(STATE.postLocomote);
        return step;
      }

      if (this.planAt >= this.plan.length) {
        this.newState((this.rand() % 30) + 30 > excitement ? STATE.sleeping : STATE.locomote);
        return step;
      }

      const sitting = this.data.positionKinds[this.position] & POSITION.sitting;
      this.push({ glue: BELLY });

      const item = this.plan[this.planAt++];

      switch (item) {
        case 0:
        case 1:
          /* Cue 12 is the dog looking about. */
          if (item === 1) {
            this.push({ cue: 12 });
          }

          this.pushStored(sitting ? SCRIPT.sitPant : SCRIPT.pant);
          break;
        case 2:
          this.pushStored(sitting ? SCRIPT.sitPantLonger : SCRIPT.pantLonger);
          break;
        case 3:
          this.newState(FIRST_TRICK + this.pickIdleTrick());
          this.push({ goto: STATE.idle });
          break;
      }
    }

    return step;
  }

  /**
   * The trick an idle dog does (`DoIdle`, seg16:0724): one at random, kept
   * only if it suits the dog's excitement, wins against its idle weight,
   * passes each of the dog's sickness, ham, groom and bark, and needs no ball.
   */
  pickIdleTrick(): number {
    const excitement = this.factor(0);

    for (let tries = 0; tries < 100000; tries++) {
      const n = this.rand() % this.data.tricks.length;
      const trick = this.data.tricks[n];

      if (
        Math.abs(excitement - trick.excitement) > trick.excitementRange ||
        trick.idleWeight < this.rand() % this.idleWeights ||
        this.rand() % this.factor(5) > trick.ham ||
        this.rand() % this.factor(7) > trick.sickness ||
        this.rand() % this.factor(4) > trick.groom ||
        this.rand() % this.factor(6) > trick.bark ||
        trick.withBall !== 0
      ) {
        continue;
      }

      return n;
    }

    return 0;
  }

  /** `PetModule::DoBeggingTrick`, seg18:0722, as it is when idle: face the user, do the trick. */
  private doTrick(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      if (this.reducedGlobal() === GLOBAL.begEat && !this.world.treat?.held) {
        this.newState(STATE.eating);
        return undefined;
      }

      const facing = this.data.tricks[this.state - FIRST_TRICK].facing;
      const rotation = this.rotation;

      if (rotation > facing || rotation < -facing) {
        let around = rotation + 128;

        if (around > 128) {
          around = rotation - 128;
        }

        if (around < facing && around > -facing) {
          this.pushStored(SCRIPT.turnAround);
        } else {
          /* Idle, it turns the way it is turned; begging, towards the treat or the ball. */
          const left =
            this.global === GLOBAL.idle
              ? rotation < 0
              : this.world.where().x < (this.heldObject()?.x ?? 0);
          this.pushTransition(this.data.scripts[SCRIPT.walk].from, BELLY);
          this.push({ ease: left ? 5 - facing : facing - 5 });
          this.pushStored(SCRIPT.walk);
        }
      }

      this.pushTrick(this.state);

      if (this.global !== GLOBAL.idle) {
        this.pushBegWaitLoops();
      }

      this.waiting = false;
      return undefined;
    }

    const { step, flags } = this.pop();
    this.noteWaiting();

    if (this.waiting && this.reducedGlobal() === GLOBAL.begEat) {
      if (!this.treatNear()) {
        this.queue = [];
        this.newState(STATE.beggingChasing);
        return step;
      }

      if (this.waggling) {
        this.resetSoft();
        this.newState(this.pickTrickState());
        return step;
      }
    }

    if (flags & 8) {
      this.newState(this.gotoState);
    } else if (flags & 1) {
      const global = this.reducedGlobal();

      if (global === GLOBAL.fetch) {
        this.newState(this.world.ball?.held ? this.pickTrickState() : STATE.chasingBall);
      } else {
        this.newState(global === GLOBAL.begEat ? this.pickTrickState() : STATE.idle);
      }
    }

    return step;
  }

  /** `PetModule::PushTrick`, seg21:708a, for the tricks without the ball. */
  private pushTrick(state: number) {
    const repeat = (times: number, then: () => void) => {
      for (let n = 0; n < times; n++) {
        then();
      }
    };

    /* The engine also eases the dog's tilt level here (`8ae6 0 0`); tilt is
     * not drawn yet. */
    this.glueIfNotGlued(CHEST);

    /* At play, after some tricks the dog may grab the ball; else it drops it. */
    const weights = this.data.tricks[state - FIRST_TRICK];

    if (weights?.withBall) {
      this.pushBallTrick(state);
      return;
    }

    if (weights?.grabAfter && this.global === GLOBAL.fetch && this.rand() % 2 === 0) {
      if (this.isBallGrabbable()) {
        this.pushBallGrabAction();
      }
    } else {
      this.pushBallReleaseAction();
    }

    switch (state) {
      case 0x2c: {
        const roll = this.data.engineScripts.rolls[this.rand() % 4];
        this.pushTransition(this.data.scripts[roll].from, BELLY);
        this.push({ cue: 0 }, { trick: state });
        repeat((this.rand() % 3) + 2, () => this.pushStored(roll));
        return;
      }
      case 0x2d:
        this.pushTransition(this.data.scripts[SCRIPT.run].from, BELLY);
        this.push({ trick: state }, { drift: (this.rand() % 4) + 8 });
        repeat((this.rand() % 4) + 2, () => this.pushStored(SCRIPT.run));
        this.push({ cue: 0 }, { drift: 0 });
        this.pushTransition(this.data.scripts[SCRIPT.pant].from, BELLY);
        return;
      case 0x37: {
        const sitting = this.data.positionKinds[this.position] & POSITION.sitting;
        const bark = sitting ? SCRIPT.barkSitting : SCRIPT.bark;
        this.pushTransition(this.data.scripts[bark].from, BELLY);
        this.push({ cue: 0 }, { trick: state });
        repeat((this.rand() % 3) + 1, () => this.pushStored(bark));
        return;
      }
      case 0x43:
        this.pushTransition(this.data.scripts[SCRIPT.boing].from, BELLY);
        this.push({ cue: 0 }, { trick: state }, { drift: 5 - (this.rand() % 11) });
        repeat((this.rand() % 8) + 2, () => this.pushStored(SCRIPT.boing));
        this.push({ drift: 0 });
        return;
      case 0x46:
        this.pushTransition(this.data.scripts[SCRIPT.sneeze].from, BELLY);
        this.push({ cue: 0 }, { trick: state });
        repeat((this.rand() % 3) + 2, () => {
          this.pushStored(SCRIPT.sneeze);
          this.push({ glue: BELLY });
        });
        return;
    }

    const trick = this.data.trickScripts[state - FIRST_TRICK];

    if (trick.script < 0) {
      return;
    }

    this.pushTransition(this.data.scripts[trick.script].from, BELLY);

    if (trick.cueBefore) {
      this.push({ cue: 0 });
    }

    if (trick.cueAround) {
      this.push({ cue: 7 });
    }

    this.push({ trick: state });
    repeat((this.rand() % trick.extra) + trick.repeats, () => this.pushStored(trick.script));

    if (trick.cueAround) {
      this.push({ cue: 6 });
    }
  }

  /** `PetModule::PushSleepScripts`: a plan of 10 to 24 stretches of sleep, broken now and then. */
  private pushSleepScripts() {
    const { sleep, sleepBreaks } = this.data.engineScripts;
    let untilBreak = (this.rand() % 10) + 10;
    const length = (this.rand() % 15) + 10;

    this.plan = [];
    this.planAt = 0;

    for (let n = 0; n < length; n++) {
      const kind = sleep[this.rand() % 5];

      for (let times = (this.rand() % kind.times) + kind.times; times; times--) {
        this.plan.push(kind.script);
      }

      if (untilBreak-- < 0) {
        this.plan.push(sleepBreaks[this.rand() % 2]);
        untilBreak = (this.rand() % 6) + 6;
      }
    }
  }

  /** `PetModule::DoSleeping`, seg16:198e, undisturbed. */
  private doSleeping(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.plan = [];
      this.planAt = 0;
      return undefined;
    }

    if (mode === 'enter') {
      this.push({ cue: 3 });

      if (!(this.data.positionKinds[this.position] & POSITION.onBack)) {
        this.pushStored(SCRIPT.circle);
        this.push({ glue: BELLY });
        this.pushStored(SCRIPT.lieDown);
        this.push({ glue: BELLY });
      }

      this.pushSleepScripts();
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (!this.isOnscreen() || this.planAt >= this.plan.length) {
        this.newState(STATE.idle);
      } else {
        this.push({ glue: BELLY });
        this.pushStored(this.plan[this.planAt++]);
      }
    }

    return step;
  }

  /**
   * `PetModule::PickLocomotionAction` (seg21:837c): walk, trot or run by
   * excitement, or the pace asked for; and, when asked, sometimes a strut,
   * a sad walk or a march by ham.
   */
  private pickLocomotion(pace = 0, overrides = true) {
    const excitement = this.factor(0);
    const paces = this.data.engineScripts.locomotion;
    const byExcitement = Math.min(
      2,
      Math.max(0, Math.trunc((((this.rand() % 21) + excitement - 10) * 3) / 100))
    );

    if (pace !== 0) {
      return paces[pace];
    }

    let action = paces[byExcitement];

    if (!overrides) {
      return action;
    }

    if (excitement > 70 && this.factor(5) > 70 && this.rand() % 2) {
      action = 241;
    }

    if (excitement < 30 && this.factor(5) < 30 && this.rand() % 2) {
      action = 220;
    }

    if (excitement > 60 && excitement < 80 && this.factor(5) > 70 && this.rand() % 2) {
      action = 111;
    }

    return action;
  }

  /** `PickFasterLocomotionAction` (seg21:84f4): a walk to a trot, the rest to a run, a sad walk to a walk. */
  private fasterLocomotion(action: number) {
    return (
      ({ 9: 9, 13: 71, 71: 9, 111: 9, 220: 13, 241: 9 } as Record<number, number>)[action] ?? action
    );
  }

  /**
   * `PetModule::GetLocomotionFudge` (seg21:85ad): the box a target must fall
   * in, by the pet's standard size: walking 0.8 of it, trotting half, running
   * 1.2 of its width wide and 0.7 high.
   */
  private locomotionFudge(action: number) {
    const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };

    if (action === 9) {
      return { width: Math.trunc(width * 1.2), height: Math.trunc(width * 0.7) };
    }

    if (action === 71) {
      return { width: Math.trunc(width * 0.5), height: Math.trunc(height * 0.5) };
    }

    return { width: Math.trunc(width * 0.8), height: Math.trunc(height * 0.8) };
  }

  /** `PetModule::GetNewTarget`: a point on the stage at least so far from the dog. */
  private newTarget(distance = 400) {
    const { width, height } = this.world;
    const most = Math.trunc(Math.hypot(width - 120, height - 120) / 2) - 50;
    const least = Math.min(distance, most);
    const at = this.world.where();

    for (let tries = 0; tries < 1000; tries++) {
      const target = {
        x: (this.rand() % Math.max(1, width - 120)) + 60,
        y: (this.rand() % Math.max(1, height - 120)) + 60,
      };

      if (Math.hypot(at.x - target.x, at.y - target.y) >= least) {
        return target;
      }
    }

    return { x: width / 2, y: height / 2 };
  }

  /** Walks a stretch towards the target, steered by `SetTargetLocation`. */
  private pushLocomotion() {
    if (this.target) {
      const box = this.locomotionFudge(this.locomotion);
      this.setTargetLocation(this.target, TURN_RATE, box.width, box.height);
    }

    this.pushStored(this.locomotion);
  }

  /**
   * `PetModule::DoLocomote` (seg16:1263): off to somewhere, steering there
   * from the start of each stride (cue 4), and on to somewhere else.
   */
  private doLocomote(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.locomotion = this.pickLocomotion(0, true);
      this.target = this.newTarget();
      this.pushStored(this.locomotion);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (this.cues.has(4) && this.target) {
      const box = this.locomotionFudge(this.locomotion);
      this.setTargetLocation(this.target, TURN_RATE, box.width, box.height);
    }

    if (flags & 2) {
      this.setTargetLocation(null);

      if (this.rand() % 150 >= this.factor(0)) {
        this.newState(STATE.postLocomote);
        return step;
      }

      this.target = this.newTarget();
      const box = this.locomotionFudge(this.locomotion);
      this.setTargetLocation(this.target, TURN_RATE, box.width, box.height);
    }

    if (flags & 1) {
      if (this.rand() % 5 === 0) {
        this.locomotion = this.pickLocomotion(0, true);
      }

      this.pushStored(this.locomotion);
    }

    return step;
  }

  /**
   * `PetModule::DoPostLocomote` (seg16:1544): stop and stand; or, off the
   * stage, walk back to its middle (`0x8af2`, then script 13).
   */
  private doPostLocomote(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.target = null;
      this.setTargetLocation(null);
      this.pushTransition(STANDING, BELLY);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (this.isOnscreen()) {
        this.newState(STATE.idle);
      } else {
        const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
        this.setTargetLocation(
          { x: this.world.width / 2, y: this.world.height / 2 },
          5,
          width,
          height
        );
        this.locomotion = SCRIPT.walk;
        this.pushStored(SCRIPT.walk);
      }
    }

    return step;
  }

  /**
   * `PetModule::DoTargettedLocomote` (seg21:79d4), for the states that
   * chase something: the user's cursor (3, and 0x13 to be petted), the
   * treat held (0x26), a wall (0x54). The dog walks, trots or runs at it,
   * faster if the user waggles it, re-aiming each stride; tripping now and
   * then; and on reaching it waits to be petted, does a trick for the treat,
   * or lunges at the wall.
   */
  private doTargettedLocomote(mode: Mode): Step | undefined {
    const state = this.state;
    const target = () => {
      if (state === STATE.chasingWall) {
        return this.wallTarget;
      }

      if (state === STATE.beggingChasing && this.world.treat) {
        return this.world.treat;
      }

      if (state === STATE.chasingBall && this.world.ball) {
        /* Where the ball will be four frames on (seg21:7a8f). */
        return this.world.projectBall?.(4) ?? this.world.ball;
      }

      if (state === STATE.returningBallIndirect) {
        return this.naughtyTarget;
      }

      const cursor = this.samples[0] ?? this.wallTarget;

      if (state === STATE.returningBallDirect) {
        /* To the user, kept 100 pixels in from the stage's edges (seg21:7a0f). */
        return {
          x: Math.min(this.world.width - 100, Math.max(100, cursor.x)),
          y: Math.min(this.world.height - 100, Math.max(100, cursor.y)),
        };
      }

      return cursor;
    };

    if (mode === 'exit') {
      this.queue = [];
      this.setTargetLocation(null);

      const stopping = [
        STATE.chasingOwner,
        STATE.chasingPetting,
        STATE.returningBallDirect,
        STATE.returningBallIndirect,
        STATE.beggingChasing,
      ] as number[];

      if (this.playing === SCRIPT.run && stopping.includes(state) && this.rand() % 3 === 0) {
        this.push({ glue: BELLY });
        this.pushStored(SCRIPT.stopRunningHard);
      }

      return undefined;
    }

    if (mode === 'enter') {
      if (state === STATE.chasingWall) {
        const at = this.world.centre?.() ?? this.world.where();
        const { width } = this.world.standardSize?.() ?? { width: 60, height: 60 };
        let y = at.y + 70 - (this.rand() % 140);
        y = Math.min(this.world.height - 150, Math.max(150, y));
        this.wallTarget = {
          x: at.x < this.world.width / 2 ? this.world.width - width : width,
          y,
        };
      }

      if (state === STATE.returningBallIndirect) {
        this.resetSoft();
        this.pushBallGrabAction();
        this.naughtyTarget = this.newNaughtyTarget();
      }

      const ballMoving = state === STATE.chasingBall && this.ballMoving();
      const pace =
        state === STATE.chasingPetting ? 1 : state === STATE.chasingWall || ballMoving ? 2 : 0;
      this.locomotion = this.pickLocomotion(pace, false);
      this.pushStored(this.locomotion);
      this.waiting = false;
      return undefined;
    }

    if (state === STATE.beggingChasing && !this.world.treat) {
      this.newGlobalState(GLOBAL.idle);
      return this.pop().step;
    }

    if (state === STATE.chasingBall && this.jumpForBall()) {
      return this.pop().step;
    }

    if (state === STATE.returningBallIndirect && this.waggling && !this.decideIfNaughty()) {
      this.newState(STATE.returningBallDirect);
      return this.pop().step;
    }

    if (this.waiting && this.waggling) {
      this.locomotion = this.fasterLocomotion(this.locomotion);
    }

    const { step, flags } = this.pop();

    if (this.cues.has(4)) {
      this.waiting = true;
    }

    if (this.waiting) {
      const box = this.locomotionFudge(this.locomotion);
      this.setTargetLocation(target(), TURN_RATE, box.width, box.height);
    }

    if (flags & 2) {
      this.setTargetLocation(null);

      switch (state) {
        case STATE.chasingOwner:
          this.newState(STATE.idle);
          return step;
        case STATE.chasingPetting:
          this.newState(STATE.waitPetting);
          return step;
        case STATE.beggingChasing:
          this.newState(this.pickTrickState());
          return step;
        case STATE.chasingWall:
          this.newState(STATE.lungingWall);
          return step;
        case STATE.chasingBall: {
          /* Grab it if it will not bounce in the next four frames and is not moving fast. */
          const ahead = this.world.projectBall?.(4);

          if (ahead && ahead.bounces === 0 && !this.ballMovingFast()) {
            this.newState(this.decideIfClumsy() ? STATE.grabbingBallMiss : STATE.grabbingBall);
            return step;
          }

          break;
        }
        case STATE.returningBallDirect:
        case STATE.returningBallIndirect:
          this.newState(STATE.releasingBall);
          return step;
      }
    }

    if (flags & 1) {
      const fast = this.locomotion === SCRIPT.run || this.locomotion === 71;

      if (this.playing === this.locomotion && fast && this.decideIfClumsy()) {
        this.newState(STATE.locomoteTrip);
        return step;
      }

      this.pushStored(this.locomotion);
    }

    return step;
  }

  /** Where a dog chasing the wall is running to (`0x127c`). */
  private wallTarget = { x: 0, y: 0 };

  /**
   * `PetModule::DoLocomoteTrip` (seg21:8735): a stumble out of a run or a
   * trot, then back to what the dog was doing.
   */
  private doLocomoteTrip(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      const stumble = this.playing === SCRIPT.run ? (this.rand() % 2 === 0 ? 155 : 24) : 204;
      this.push({ glue: BELLY });
      this.pushStored(stumble);
      this.push({ glue: BELLY });
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newState(this.history[1] ?? STATE.idle);
    }

    return step;
  }

  /**
   * `PetModule::DoLungingWall` (seg16:22c1): at the wall, the dog turns to
   * it and leaps at it two to four times, then goes back to idle. Where
   * the engine sets the leap's target (`0x8af4`), not yet played.
   */
  private doLungingWall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      const right = this.rotation < 1;
      this.rand();
      this.pushStored(263);
      this.push({ ease: right ? -64 : 64 });
      this.pushStored(228);

      for (let times = (this.rand() % 3) + 2; times; times--) {
        this.pushStored(227);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newState(STATE.idle);
    }

    return step;
  }

  // Global states.

  /** `ReducedGlobalState`: the three treats, food and water are all one, begging and eating. */
  reducedGlobal() {
    if (this.global >= GLOBAL.begEat && this.global <= GLOBAL.begEat + 4) {
      return GLOBAL.begEat;
    }

    return this.global >= GLOBAL.fetch && this.global <= GLOBAL.fetch + 2
      ? GLOBAL.fetch
      : this.global;
  }

  /**
   * `PetModule::NewGlobalState` (seg21:5dfa): the old global state leaves,
   * and the new one enters, choosing the state to start in unless told.
   */
  newGlobalState(global: number, state = 0) {
    if (this.reducedGlobal() === GLOBAL.fetch) {
      this.exitFetch();
    }

    this.global = global;

    if (global === GLOBAL.idle) {
      this.enterIdle(state);
    } else if (global === GLOBAL.petting) {
      this.enterPetting(state);
    } else if (this.reducedGlobal() === GLOBAL.begEat) {
      this.enterBegEat(state);
    } else if (this.reducedGlobal() === GLOBAL.fetch) {
      this.enterFetch(state);
    }
  }

  /** `PetModule::EnterIdle` (seg16:0000): to what is out on the desktop, or else walking. */
  private enterIdle(state: number) {
    const desktop = this.checkDesktop();

    if (desktop) {
      this.newGlobalState(desktop);
    } else {
      this.newState(state || STATE.locomote);
    }
  }

  /** `PetModule::CheckDesktop` (seg16:20b6), for the treats: one out of its box is begged for. */
  private checkDesktop() {
    const treat = this.world.treat;

    if (treat) {
      return GLOBAL.firstTreat + treat.colour;
    }

    /* A toy out is noticed only by a dog excited enough, 70 and more. */
    const ball = this.world.ball;
    return ball && !ball.held && this.factor(0) >= 70 ? GLOBAL.fetch : 0;
  }

  // The cursor.

  /**
   * What `ReallyDoDrawFrame` keeps of the cursor (seg21:4700 to 4899): its
   * last positions and buttons, and whether it waggles.
   */
  private sample() {
    const cursor = this.world.cursor?.();

    if (!cursor) {
      return;
    }

    this.samples = [{ ...cursor }, ...this.samples].slice(0, SAMPLES);
    this.waggling = this.samples.length === SAMPLES;

    for (let n = 1; n < SAMPLES && this.waggling; n++) {
      const [now, before, then] = [this.samples[0], this.samples[n - 1], this.samples[n]];

      if (Math.hypot(now.x - then.x, now.y - then.y) > 100) {
        this.waggling = false;
      }

      if (Math.hypot(before.x - then.x, before.y - then.y) < 8) {
        this.waggling = false;
      }
    }
  }

  private inRect(point: { x: number; y: number }, inset = 0) {
    const rect = this.world.rect?.();
    return (
      rect !== undefined &&
      point.x > rect.left + inset &&
      point.x < rect.right - inset &&
      point.y > rect.top + inset &&
      point.y < rect.bottom - inset
    );
  }

  /** The kind of position the script playing ends in (`0x94a`). */
  private playingKind() {
    const script = this.data.scripts[this.playing];
    return script ? this.data.positionKinds[script.to] : this.data.positionKinds[this.position];
  }

  /**
   * `PetModule::DoPettingHandler` (seg17:0000), every frame: petting is the
   * button held and the cursor moving, over the dog, for four frames running.
   * A click on a standing dog's face, legs or tail is a poke.
   */
  private doPettingHandler() {
    const cursor = this.samples[0];

    if (!cursor || !this.world.areaAt) {
      return;
    }

    const was = this.petting;
    const lastArea = this.area;
    let moves = 0;

    this.area = this.world.areaAt(cursor);
    this.petting = this.samples.length >= 5;

    for (let n = 0; n < 4 && this.petting; n++) {
      const [now, then] = [this.samples[n], this.samples[n + 1]];

      if (now.x !== then.x || now.y !== then.y) {
        moves++;
      }

      if (!now.button || !this.inRect(now)) {
        this.petting = false;
      }
    }

    if (moves < 2 || this.world.treat?.held) {
      this.petting = false;
    }

    if (this.data.scripts[this.playing]?.to === 21) {
      this.petting = false;
    }

    if (this.state === STATE.grabbingTreat) {
      this.petting = false;
    }

    if (!was && this.petting && this.global !== GLOBAL.petting) {
      this.newGlobalState(GLOBAL.petting);
    }

    const clicked = cursor.button && !this.samples[1]?.button;
    const poked = [AREA.face, AREA.tail, AREA.rightLeg, AREA.leftLeg] as number[];

    if (
      clicked &&
      this.area === lastArea &&
      this.playingKind() & POSITION.standing &&
      this.state !== STATE.pettingBad &&
      poked.includes(this.area)
    ) {
      this.newState(STATE.pettingBad);
    }
  }

  // Petting.

  /** `PetModule::EnterPetting` (seg17:0352): to good petting, or first to turn side on. */
  private enterPetting(state: number) {
    this.pettingLevel = 0;
    this.pickNewPetSpot();
    this.offSpot = 0;

    const rotation = this.rotation;
    const facing = (rotation < 20 && rotation > -20) || rotation > 108 || rotation < -108;
    this.newState(state || (facing ? STATE.aligningPetting : STATE.pettingGood));
  }

  /** `PetModule::PickNewPetSpot` (seg17:192b): another spot, by the spots' chances. */
  private pickNewPetSpot() {
    const was = this.petSpot;
    const spots = this.data.engineScripts.petSpots;

    for (let tries = 0; tries < 1000; tries++) {
      do {
        this.petSpot = this.rand() % 3;
      } while (this.petSpot === was);

      if (spots[this.petSpot].chance >= this.rand() % 100) {
        break;
      }
    }

    const spot = spots[this.petSpot];
    this.spotStrokes = (this.rand() % spot.extra) + spot.strokes;
  }

  /**
   * `PetModule::IsCursorOverPetSpot` (seg17:17de): within 0.8 of its ball's
   * drawn width either side of it, and 300 pixels above or below.
   */
  private isCursorOverPetSpot() {
    const cursor = this.samples[0];
    const ball = this.world.ballOnStage?.(this.data.engineScripts.petSpots[this.petSpot].ball);

    if (!cursor || !ball) {
      return false;
    }

    const half = Math.trunc(ball.diameter * 0.8);
    return Math.abs(cursor.x - ball.x) < half && Math.abs(cursor.y - ball.y) < 300;
  }

  /** Cue 0 or 4 sets a state waiting on the user; cue 1 ends it. */
  private noteWaiting() {
    if (this.cues.has(0) || this.cues.has(4)) {
      this.waiting = true;
    }

    if (this.cues.has(1)) {
      this.waiting = false;
    }
  }

  /** `PetModule::DoWaitPetting` (seg17:0410): side on to the user, panting, waiting to be petted. */
  private doWaitPetting(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.resetSoft();
      const rotation = this.rotation;

      if ((rotation < 20 && rotation > -20) || rotation > 108 || rotation < -108) {
        this.push({ glue: BELLY });
        this.pushTransition(this.data.scripts[SCRIPT.walk].from, BELLY);

        if (rotation < 20 && rotation > -20) {
          this.push({ ease: rotation < 1 ? -20 : 20 });
        } else {
          this.push({ ease: rotation < 1 ? -108 : 108 });
        }

        this.pushStored(SCRIPT.walk);
        this.push({ glue: BELLY });
      }

      this.waitCount = (this.rand() % 20) + 20;
      this.pushStored(SCRIPT.pant);
      this.waiting = false;
      return undefined;
    }

    if (this.waiting) {
      if (!this.inRect(this.samples[0] ?? { x: -1, y: -1 }, 8)) {
        this.queue = [];
        this.newState(STATE.chasingPetting);
        return this.pop().step;
      }

      if (!this.isCursorOverPetSpot()) {
        this.newState(STATE.aligningPetting);
        return this.pop().step;
      }
    }

    if (this.petting) {
      this.resetSoft();
      this.newState(STATE.pettingGood);
      return this.pop().step;
    }

    const { step, flags } = this.pop();

    if (this.cues.has(4)) {
      this.waiting = true;
      this.pettingLevel = Math.max(this.pettingLevel - 1, Math.min(this.pettingLevel, -2));
    }

    if (flags & 1) {
      if (this.waitCount-- < 1) {
        this.newGlobalState(GLOBAL.idle);
        return step;
      }

      /* Before each pant, now and then the engine has the dog look at the
       * cursor or about (`0x8af9`, `0x8afb`); not yet played. */
      this.rand();
      this.pushStored(SCRIPT.pant);
    }

    return step;
  }

  /**
   * `PetModule::DoAligningPetting` (seg17:08f7): walks forward or back
   * until the spot it wants petting is under the cursor. Its walking on is
   * simplified: it walks a cycle at a time and stops when the spot is there.
   */
  private doAligningPetting(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    const cursor = this.samples[0] ?? { x: -1, y: -1, button: false };

    if (mode === 'enter') {
      const spot = this.world.ballOnStage?.(this.data.engineScripts.petSpots[this.petSpot].ball);
      const rotation = this.rotation;
      const sideOn = (rotation > 20 && rotation < 108) || (rotation < -20 && rotation > -108);

      if (sideOn && spot && !this.isCursorOverPetSpot()) {
        /* Facing right, forward is to the right; facing left, to the left. */
        const ahead = cursor.x > spot.x === rotation > 0;
        this.walkDirection = ahead ? 1 : -1;
        this.pushStored(ahead ? SCRIPT.startWalking : SCRIPT.startBackwards);
      } else if (!sideOn) {
        /* Facing the user or away: it turns side on. Inferred: the engine's
         * own pushes here are not yet read. */
        this.pushTransition(this.data.scripts[SCRIPT.walk].from, BELLY);
        this.push({ ease: cursor.x > this.world.where().x ? 64 : -64 });
        this.pushStored(SCRIPT.walk);
        this.walkDirection = 0;
      }

      this.push({ glue: BELLY }, { cue: 0 }, { glue: BELLY });
      this.waiting = false;
      return undefined;
    }

    if (this.waiting && !this.inRect(cursor, 8)) {
      this.queue = [];
      this.newState(STATE.chasingPetting);
      return this.pop().step;
    }

    const { step, flags } = this.pop();
    this.noteWaiting();

    if (flags & 1) {
      if (this.isCursorOverPetSpot() || this.walkDirection === 0) {
        if (this.walkDirection !== 0) {
          this.push({ glue: BELLY });
          this.pushStored(this.walkDirection < 0 ? SCRIPT.stopBackwards : SCRIPT.stopWalking);
          this.walkDirection = 0;
          this.push({ glue: BELLY });
        } else {
          this.newState(STATE.waitPetting);
        }
      } else {
        this.pushStored(this.walkDirection < 0 ? SCRIPT.walkBackwards : SCRIPT.walk);
      }
    }

    return step;
  }

  /**
   * `PetModule::DoPettingGood` (seg17:0e25): a stroke, and what the dog
   * does for it by where it is stroked; the more it has enjoyed, the likelier
   * it rolls over, and on its back it may fall asleep.
   */
  private doPettingGood(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      if (this.spotStrokes-- < 0) {
        this.pickNewPetSpot();
      }

      this.resetSoft();
      this.pettingLevel = Math.min(this.pettingLevel, 16);

      let area = -1;

      if (this.samples[0]?.button) {
        area = this.playingKind() & POSITION.lying ? 1000 : this.area;
      }

      if (area === AREA.head || area === AREA.body || area === AREA.hindquarters) {
        if (this.rand() % 16 < this.pettingLevel) {
          return this.pettedOnBack();
        }

        this.queue = [];
        this.push({ glue: BELLY });

        if (area === AREA.hindquarters) {
          const level = this.pettingLevel;
          this.pushStored(
            level < 2 ? SCRIPT.thump : level < 3 ? SCRIPT.thumpMore : SCRIPT.thumpMost
          );
        } else if (this.pettingLevel <= 1) {
          this.pushStored(SCRIPT.petHead);
        } else if (this.pettingLevel <= 2) {
          this.pushStored(this.rand() % 2 ? SCRIPT.petHead : SCRIPT.petHeadMore);
        } else {
          this.pushStored(SCRIPT.petHeadMore);
        }

        this.pettingLevel++;
        return undefined;
      }

      if (area === 1000 || (area >= 0 && this.playingKind() & POSITION.onBack)) {
        return this.pettedOnBack();
      }

      this.pushStored(SCRIPT.pant);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (
      !this.isCursorOverPetSpot() &&
      !(this.playingKind() & POSITION.onBack) &&
      this.offSpot++ > 20
    ) {
      this.offSpot = 0;
      this.newState(STATE.aligningPetting);
    } else if (flags & 1) {
      this.newState(this.petting ? STATE.pettingGood : STATE.waitPetting);
    }

    return step;
  }

  /** Petted lying down: onto its back, one of three wriggles, and maybe to sleep (seg17:0f48). */
  private pettedOnBack(): undefined {
    const rolls = this.data.engineScripts.pettedOnBack;

    this.resetSoft();
    this.pushTransition(SCRIPT.rollover, BELLY);
    this.pushStored(rolls[this.rand() % 3]);
    this.pettingLevel++;

    if (
      this.pettingLevel > 14 &&
      this.playing === SCRIPT.rollOnBack &&
      this.rand() % 150 > this.factor(0)
    ) {
      this.pushStored(SCRIPT.sleepOnBack);
      this.newGlobalState(GLOBAL.idle, STATE.sleeping);
    }

    return undefined;
  }

  /**
   * `PetModule::DoPettingBad` (seg17:1416): poked in the face it shies or
   * snaps, in a leg or the tail it growls or flinches; and it is readier to
   * bark.
   */
  private doPettingBad(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.factors[6] = Math.min(100, this.factors[6] + 5);

      const shake = () => {
        if (this.rand() % 4 !== 0) {
          this.push({ glue: CHEST });
          this.pushStored(this.rand() % 2 === 0 ? SCRIPT.shake : SCRIPT.shakeOther);
          this.push({ glue: CHEST });
        }
      };

      if (this.area === AREA.tongue || this.area === AREA.face) {
        this.queue = [{ glue: BELLY }];
        this.pushStored(this.data.engineScripts.pokedInFace[this.rand() % 3]);
        this.pettingLevel--;
        shake();
      } else if (this.rand() % 2 === 0) {
        this.queue = [{ glue: BELLY }];
        this.pushStored(SCRIPT.growl);
        this.pettingLevel--;
        shake();
      } else {
        this.pushStored(SCRIPT.flinch);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (this.global === GLOBAL.petting) {
        this.newState(STATE.waitPetting);
      } else if (this.reducedGlobal() === GLOBAL.begEat) {
        this.newState(STATE.eating);
      } else if (this.global === GLOBAL.idle) {
        this.newState(STATE.idle);
      } else {
        this.newGlobalState(GLOBAL.idle);
      }
    }

    return step;
  }

  private near(point: { x: number; y: number }) {
    const at = this.world.where();
    return Math.hypot(point.x - at.x, point.y - at.y) < NEAR + 40;
  }

  private treatNear() {
    const held = this.heldObject();
    return held !== null && held !== undefined && this.near(held);
  }

  /** What the dog begs for: the ball at play, else the treat (`0x11d4`). */
  private heldObject() {
    return this.reducedGlobal() === GLOBAL.fetch ? this.world.ball : this.world.treat;
  }

  // Treats.

  /** `PetModule::EnterBegEat` (seg18:0000): to eat a treat put down, or chase one held. */
  private enterBegEat(state: number) {
    this.brainActive = false;
    this.newState(state || (this.world.treat?.held ? STATE.beggingChasing : STATE.eating));
  }

  /**
   * The treat picked up, as `FoodSprite::Update` (seg20:0de4) sees it: the
   * dog begs for it; picked up while the dog eats it, the dog begs again.
   */
  treatPickedUp() {
    const treat = this.world.treat;

    if (!treat) {
      return;
    }

    if (this.state === STATE.eating && this.global === GLOBAL.firstTreat + treat.colour) {
      if (this.brainActive) {
        this.data.brain?.tell('[+]BringOut*', `[u]${TREATS[treat.colour]}`);
      }

      this.newState(STATE.begging);
    } else {
      this.newGlobalState(GLOBAL.firstTreat + treat.colour);
    }
  }

  /** The treat put down: the dog goes to eat it (`FoodSprite::Update`). */
  treatPutDown() {
    const treat = this.world.treat;

    if (!treat) {
      return;
    }

    if (this.brainActive) {
      this.data.brain?.tell('[w]Throw!', `[u]${TREATS[treat.colour]}`);
    }

    if (this.global === GLOBAL.firstTreat + treat.colour) {
      this.newState(STATE.eating);
    } else {
      this.newGlobalState(GLOBAL.firstTreat + treat.colour, STATE.eating);
    }
  }

  /** The treat put back in its box: the dog is left alone (`FoodSprite::Update`). */
  treatPutAway() {
    if (this.reducedGlobal() === GLOBAL.begEat) {
      this.newGlobalState(GLOBAL.idle);
    }
  }

  /**
   * `PetModule::DoBegging` (seg18:0bec): sits up, five to ten times, for the
   * treat held; then the brain is woken and a trick chosen. The engine's
   * following the treat about while begging is simplified to chasing it
   * when it is taken away.
   */
  private doBegging(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.queue = [];
      return undefined;
    }

    if (mode === 'enter') {
      if (this.reducedGlobal() === GLOBAL.begEat && !this.world.treat?.held) {
        this.newState(STATE.eating);
        return undefined;
      }

      this.waiting = false;
      this.pushTransition(this.data.scripts[SCRIPT.sitUp].from, BELLY);
      this.push({ cue: 0 });

      for (let times = (this.rand() % 6) + 5; times; times--) {
        this.pushStored(SCRIPT.sitUp);
      }

      return undefined;
    }

    const { step, flags } = this.pop();
    this.noteWaiting();

    if (this.waiting && !this.treatNear() && this.reducedGlobal() === GLOBAL.begEat) {
      this.queue = [];
      this.newState(STATE.beggingChasing);
    } else if (flags & 1) {
      this.activateBrain();
      this.newState(this.pickTrickState());
    }

    return step;
  }

  /**
   * `PetModule::ActivateBrain` (seg18:290d): begging, from now on the brain
   * chooses. Its desires are cleared, and it is told the treat was brought
   * out, which sets the desire of the treat's colour.
   */
  private activateBrain() {
    const treat = this.world.treat;

    if (this.reducedGlobal() === GLOBAL.begEat && !this.brainActive) {
      this.brainActive = true;
      this.data.brain?.zeroOutDesires();
      this.data.brain?.tell('[+]BringOut*', `[u]${treat ? TREATS[treat.colour] : ''}`);
    }
  }

  /**
   * `PetModule::PickTrickState` (seg21:6907), begging: frustrated, the dog
   * may grab the treat; with the brain awake, a trick, its choice or else
   * one at random that needs no ball; without, it begs on.
   */
  pickTrickState(): number {
    const treat = this.world.treat;

    if (this.reducedGlobal() === GLOBAL.fetch) {
      return this.pickPlayTrick();
    }

    if (this.reducedGlobal() === GLOBAL.begEat && treat?.held) {
      this.factors[9] = Math.min(100, this.factors[9] + 4);

      if (this.decideIfGrabFromUser()) {
        /* Allowed to take it from the hand (`0x96`, seg21:6b1d). */
        this.grabFromUser = true;
        return STATE.grabbingTreat;
      }
    }

    if (!this.brainActive) {
      return STATE.begging;
    }

    /* Each try, the brain thinks; with no opinion, a trick at random (seg21:6b3c). */
    for (let tries = 0; tries < 1000; tries++) {
      const state = this.data.brain?.think() || (this.rand() % 0x3a) + FIRST_TRICK;

      if (!this.data.tricks[state - FIRST_TRICK].withBall) {
        return state;
      }
    }

    return STATE.begging;
  }

  /** `PetModule::DecideIfGrabFromUser` (seg14:215e): frustrated and grabby enough, by chance. */
  private decideIfGrabFromUser() {
    const range = 0x1a4;
    return this.rand() % range < this.factor(9) && this.rand() % range < this.factor(2);
  }

  /** `PetModule::PushBegWaitLoops` (seg18:25e0): pants, waiting for the treat after a trick. */
  private pushBegWaitLoops() {
    const excitement = this.factor(0);
    let loops: number;

    if (this.reducedGlobal() === GLOBAL.fetch) {
      /* At play, a held ball makes the dog keener: fewer pants, maybe none. */
      const keen = excitement + (this.world.ball?.held ? 30 : 0);
      loops = Math.trunc((130 - keen) / 20) + 1;

      if (loops < 1) {
        return;
      }

      loops += this.rand() % loops;
      this.pushBallReleaseAction();
    } else {
      loops = Math.trunc((100 - excitement) / 20) + 1;
      loops += this.rand() % loops;
    }

    this.push({ glue: CHEST });
    let sitting = excitement < this.rand() % 85 || this.position === SITTING;
    this.pushTransition(this.data.scripts[sitting ? SCRIPT.sitPant : SCRIPT.pant].from, BELLY);
    this.push({ cue: 0 });

    let looks = 0;

    for (let left = loops + (this.rand() % loops); left > 0; left--) {
      if (excitement < this.rand() % 85 && this.rand() % 10 === 0) {
        sitting = true;
      }

      /* Now and then the engine has the dog look at the user or about
       * (`0x8afb`, `0x8afe`); not yet played, but its choices are made. */
      if (looks-- < 0) {
        looks = this.rand() % 2;
        this.rand();
      }

      this.pushStored(sitting ? SCRIPT.sitPant : SCRIPT.pant);

      if (this.rand() % 10 === 0) {
        this.pushStored(sitting ? SCRIPT.sitPantLonger : SCRIPT.pantLonger);
      }
    }

    this.push({ glue: CHEST });
  }

  /**
   * `PetModule::DoEating` (seg18:12cb), for a treat: goes to it and eats it
   * in one bite; the bite (cue 10) rewards the trick last done if the brain
   * was not yet awake. The walk to the treat is simplified.
   */
  private doEating(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      if (this.world.treat) {
        this.world.treat.beingEaten = false;
      }

      this.resetSoft();
      return undefined;
    }

    const treat = this.world.treat;

    if (mode === 'enter') {
      if (!treat) {
        this.newGlobalState(GLOBAL.idle);
        return undefined;
      }

      this.target = { x: treat.x, y: treat.y };

      if (!this.near(treat)) {
        this.locomotion = this.pickLocomotion();
        this.pushLocomotion();
      } else {
        this.eat();
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    /* From cue 0 the treat is drawn with the dog, under its head, until cue 13 or eaten (seg18:1c62). */
    if (this.cues.has(0) && this.world.treat && !this.world.treat.held) {
      this.world.treat.beingEaten = true;
    }

    if (this.cues.has(13) && this.world.treat) {
      this.world.treat.beingEaten = false;
    }

    if (this.cues.has(10) && this.world.treat) {
      this.world.eatTreat?.();
      this.factors[9] = this.centres[9];

      if (!this.brainActive) {
        this.positiveReinforcement();
      }
    }

    if (this.target && treat && (flags & 2 || this.near(treat))) {
      this.target = null;
      this.setTargetLocation(null);
      this.queue = this.queue.filter((item) => !('step' in item));
      this.eat();
    } else if (flags & 1) {
      if (this.target && treat) {
        this.pushLocomotion();
      } else {
        this.newGlobalState(GLOBAL.idle);
      }
    }

    return step;
  }

  /** The bite: script 86, its frames glued by the chest (seg18:1757). */
  private eat() {
    this.pushTransition(this.data.scripts[SCRIPT.eatTreat].from, BELLY);
    this.push({ cue: 0 }, { glue: CHEST }, { cue: 3 });
    this.pushStored(SCRIPT.eatTreat);
  }

  /**
   * `PetModule::PositiveReinforcement` (seg14:1f1d), begging: the trick last
   * done is 5 likelier, and at least 200, idle.
   */
  private positiveReinforcement() {
    const n = this.lastTrick - FIRST_TRICK;
    const trick = this.data.tricks[n];

    if (this.reducedGlobal() === GLOBAL.begEat && trick) {
      trick.idleWeight = Math.max(200, trick.idleWeight + 5);
    }
  }

  /**
   * `PetModule::DoGrabbingTreat` (seg18:210a): the dog snatches the treat
   * from the user's hand and eats it, and its frustration settles.
   */
  private doGrabbingTreat(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.queue = [];
      this.pushStored(SCRIPT.stopRunning);
      this.pushStored(SCRIPT.snatch);
      this.pushStored(SCRIPT.eatTreat);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (this.cues.has(10)) {
      this.factors[9] = this.centres[9];
      this.world.eatTreat?.();
    }

    if (flags & 1) {
      this.newGlobalState(GLOBAL.idle);
    }

    return step;
  }

  // The ball.

  /** Where a naughty dog runs off to with the ball (`0x11d0`). */
  private naughtyTarget = { x: 0, y: 0 };

  /** A fumbled grab: the dog chases the ball again (`DAT_3b90`). */
  private fumbled = false;

  /** Is the dog naughty this time (`0x124c`, `DecideIfNaughty`, seg14:20a6)? */
  naughty = false;

  private decideIfNaughty() {
    this.naughty = this.rand() % 100 < this.factor(1);
    return this.naughty;
  }

  private ballMoving() {
    const ball = this.world.ball;
    return !!ball && (ball.vx !== 0 || ball.vy !== 0);
  }

  /** `BallSprite::IsMovingFast` (seg20:1e5d): faster than 120 pixels squared a frame. */
  private ballMovingFast() {
    const ball = this.world.ball;
    return !!ball && ball.vx * ball.vx + ball.vy * ball.vy > 120;
  }

  /** The ball in the dog's mouth once the queue has played out (`IsBallInMouthAsOfLastAction`). */
  private ballInMouthAfterQueue() {
    let inMouth = this.world.ball?.slot === 0;

    for (const item of this.queue) {
      if ('step' in item) {
        if (item.step.release === 0) {
          inMouth = false;
        }

        if (item.step.grab === 0) {
          inMouth = true;
        }
      }
    }

    return inMouth;
  }

  /**
   * `PetModule::GrabObject` (seg14:04e4): at play, the ball into a slot;
   * slot 2, the food, into the mouth. Not from the user's hand, unless the
   * dog is snatching it.
   */
  private grabFromUser = false;

  private grabObject(slot: number) {
    const ball = this.world.ball;
    const treat = this.world.treat;

    if (slot === 2) {
      if (treat && (!treat.held || this.grabFromUser)) {
        this.grabFromUser = false;
        treat.held = false;
        treat.inMouth = true;
      }

      return;
    }

    if (!ball || this.reducedGlobal() !== GLOBAL.fetch || (ball.held && !this.grabFromUser)) {
      return;
    }

    this.grabFromUser = false;

    if (ball.slot !== null && ball.slot !== slot) {
      this.world.releaseBall?.(ball.slot);
    }

    this.world.grabBall?.(slot);
  }

  private releaseObject(slot: number) {
    this.world.releaseBall?.(slot);
  }

  /** `IsBallGrabbable` (seg19:018e): within a box half again the dog's standard size, ahead of it. */
  private isBallGrabbable() {
    const ball = this.world.ball;
    return !!ball && this.inFocusBox(ball, 1.5);
  }

  /**
   * `MakeFocusRect` about the middle of the dog: a box of so many times its
   * standard size, a quarter of the box's diagonal ahead the way it faces.
   */
  private inFocusBox(point: { x: number; y: number }, scale: number) {
    const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
    const [w, h] = [Math.trunc(width * scale), Math.trunc(height * scale)];
    const centre = this.world.centre?.() ?? this.world.where();
    const ahead = Math.trunc(Math.trunc(Math.sqrt(w * w + h * h)) / FOCUS_DISTANCE);
    const sine = Math.trunc(Math.sin((this.rotation * Math.PI) / 128) * 256);
    const x = centre.x - Math.trunc((256 * ahead * sine) / 65536);

    return (
      point.x >= x - Math.trunc(w / 2) &&
      point.x < x + Math.trunc(w / 2) &&
      point.y >= centre.y - Math.trunc(h / 2) &&
      point.y < centre.y + Math.trunc(h / 2)
    );
  }

  /**
   * `PetModule::PushBallGrabAction` (seg19:2bf9): if the ball has not moved
   * since the dog put it down, a pounce (script 29); otherwise reach down to
   * it (82) and grab it (81).
   */
  private pushBallGrabAction() {
    const ball = this.world.ball;

    if (!ball || ball.held || this.ballInMouthAfterQueue()) {
      return;
    }

    this.push({ glue: CHEST });

    if (!(this.world.ballHasMoved?.() ?? true)) {
      this.push({ cue: 7 });
      this.pushStored(SCRIPT.pounceOnBall);
      this.push({ cue: 6 });
    } else {
      /* The engine also turns the dog towards the ball (`0x8ae8`); not yet played. */
      this.pushStored(SCRIPT.reachForBall);
      this.push({ aim: { ball: NOSE, at: null } });
      this.pushStored(SCRIPT.grabBall);
    }

    this.push({ glue: CHEST });
  }

  /** `PetModule::PushBallReleaseAction` (seg19:2a84): with the ball in its mouth, it drops it (script 8). */
  private pushBallReleaseAction() {
    if (!this.ballInMouthAfterQueue()) {
      return;
    }

    this.push({ cue: 7 });
    this.glueIfNotGlued(CHEST);
    this.pushStored(SCRIPT.dropBall);
    this.push({ glue: CHEST }, { cue: 6 });
  }

  /** `PetModule::EnterFetch` (seg19:0000): to beg for the ball held, or chase it. */
  private enterFetch(state: number) {
    this.naughty = false;
    this.anticipations = (this.rand() % 2) + 2;
    this.newState(state || (this.world.ball?.held ? STATE.begging : STATE.chasingBall));
  }

  /** `PetModule::ExitFetch` (seg19:00f4): the ball let go of. */
  private exitFetch() {
    if (this.world.ball?.slot === 0) {
      this.releaseObject(0);
    }
  }

  /** The user picks the ball up (`BallSprite::Update`, seg20:20b8): at play, the dog begs for it. */
  ballPickedUp() {
    if (this.reducedGlobal() === GLOBAL.fetch) {
      this.releaseObject(0);
      this.releaseObject(1);
      this.resetSoft();
      this.newState(STATE.begging);
    } else {
      this.newGlobalState(GLOBAL.fetch);
    }
  }

  /**
   * The user lets the ball go (`BallSprite::Update`, seg20:2236 to 2330):
   * the dog's frustration settles, and it chases the ball, or, calm and with
   * its head on the stage, watches it go.
   */
  ballThrown() {
    if (this.reducedGlobal() !== GLOBAL.fetch) {
      return;
    }

    const excitement = this.factor(0);
    this.queue = [{ glue: 36 }];
    this.factors[9] = this.centres[9];

    /* Whether it will misjudge the catch, by its clumsiness; not yet played. */
    this.rand();

    const chase = this.rand() % 30 < excitement + 10 || !this.isOnscreen();
    this.newState(chase ? STATE.chasingBall : STATE.observingBallThrown);
  }

  /** The ball put back in the toy box: the dog is left alone (`BallSprite::Update`). */
  ballPutAway() {
    if (this.reducedGlobal() === GLOBAL.fetch) {
      this.newGlobalState(GLOBAL.idle);
    }
  }

  /**
   * At play, the trick for the ball held (`PickTrickState`, seg21:6907): a
   * frustrated dog may leap and snatch it; otherwise a trick by its play
   * weight, one with the ball only if the ball is free and within reach.
   */
  private pickPlayTrick(): number {
    const ball = this.world.ball;

    if (ball?.held) {
      this.factors[9] = Math.min(100, this.factors[9] + 4);

      if (this.rand() % 0xd2 < this.factor(9) && this.rand() % 0xd2 < this.factor(2)) {
        this.grabFromUser = true;
        return STATE.jumpingGrabbingBall;
      }
    }

    const total = this.data.tricks.reduce((sum, trick) => sum + trick.playWeight, 0);

    for (let tries = 0; tries < 100000; tries++) {
      const n = this.rand() % this.data.tricks.length;
      const trick = this.data.tricks[n];
      let reject = trick.playWeight < this.rand() % total;

      if (trick.withBall && (ball?.held || !ball)) {
        reject = true;
      }

      if (!this.isBallGrabbable() && trick.withBall) {
        reject = true;
      }

      if (!reject) {
        return FIRST_TRICK + n;
      }
    }

    return STATE.begging;
  }

  /**
   * Running after a ball in the air, a leap for it (seg21:7f4d to 80b6): if
   * the ball will pass over the dog's chin in the next fourteen frames.
   */
  private jumpForBall() {
    const ball = this.world.ball;

    if (
      !ball ||
      ball.held ||
      this.locomotion !== SCRIPT.run ||
      this.history[1] === STATE.jumpingGrabbingBall
    ) {
      return false;
    }

    const ahead = this.world.projectBall?.(14);
    const chin = this.world.ballOnStage?.(51);

    if (!ahead || !chin || ahead.bounces > 1 || (ahead.bounces === 1 && !this.ballMoving())) {
      return false;
    }

    /* A box 150 wide and high, 200 above the chin. */
    if (Math.abs(ahead.x - chin.x) < 75 && Math.abs(ahead.y - (chin.y - 200)) < 75) {
      this.newState(
        this.decideIfClumsy() ? STATE.jumpingGrabbingBallMiss : STATE.jumpingGrabbingBall
      );
      return true;
    }

    return false;
  }

  /**
   * `PetModule::DoGrabbingBall` (seg19:0941): grabs the ball; a clumsy dog
   * fumbles it and chases it again. Then back to the user with it, or, if
   * naughty, off somewhere else.
   */
  private doGrabbingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.setTargetLocation(null);
      const ahead = this.world.projectBall?.(4);

      if (ahead && ahead.bounces !== 0 && (ahead.bounces !== 1 || this.rand() % 3 !== 0)) {
        this.newState(STATE.chasingBall);
        return undefined;
      }

      this.queue = [];
      this.pushBallGrabAction();
      this.fumbled = false;

      if (this.decideIfClumsy()) {
        this.pushStored(SCRIPT.fumble);
        this.pushStored(SCRIPT.pawBall);
        this.push({ step: { frame: this.lastStep.frame, release: 1 } });
        this.fumbled = true;
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (this.cues.has(12)) {
      this.releaseObject(0);
    }

    if (flags & 1) {
      this.newState(
        this.fumbled
          ? STATE.chasingBall
          : this.decideIfNaughty()
            ? STATE.returningBallIndirect
            : STATE.returningBallDirect
      );
    }

    return step;
  }

  /** A miss (seg19:070c, 0d44): a look about, maybe (60), and after the ball again. */
  private doMissingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.queue = [];

      if (this.state === STATE.jumpingGrabbingBallMiss) {
        this.pushStored(SCRIPT.jumpMissed);
      }

      if (this.rand() % 2 !== 0) {
        this.pushStored(SCRIPT.lookAgain);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newState(STATE.chasingBall);
    }

    return step;
  }

  /** `PetModule::DoJumpingGrabbingBall` (seg19:0e30): pulls up (26) and leaps for it (25). */
  private doJumpingGrabbingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.queue = [];
      this.setTargetLocation(null);

      if (this.playingKind() & POSITION.moving) {
        this.pushStored(SCRIPT.stopRunning);
      }

      const ahead = this.world.projectBall?.(14) ?? null;
      this.push({ aim: { ball: 51, at: ahead } });
      this.pushStored(SCRIPT.jumpForBall);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (this.world.ball?.held) {
        this.world.ball.held = false;
      }

      this.newState(
        this.decideIfNaughty() ? STATE.returningBallIndirect : STATE.returningBallDirect
      );
    }

    return step;
  }

  /**
   * `PetModule::DoReleasingBall` (seg19:033d): stops, faces the user, and
   * drops the ball; then waits for the next throw, or, naughty, guards it.
   */
  private doReleasingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      if (this.world.ball?.slot !== 0) {
        this.newState(this.naughty ? STATE.guardingBall : STATE.anticipatingBall);
        return undefined;
      }

      this.pushTransition(STANDING, BELLY);
      this.push({ cue: 0 }, { glue: CHEST });

      const rotation = this.rotation;

      if (rotation < -0x50 || rotation > 0x50) {
        this.pushStored(SCRIPT.turnAround);
      }

      this.pushBallReleaseAction();
      this.push({ glue: 37 });
      this.waiting = false;
      return undefined;
    }

    if (!this.waiting && this.naughty) {
      const cursor = this.samples[0];

      if (cursor && this.inFocusBox(cursor, 1.8)) {
        /* Keep-away: the user reaches for it, and the dog snatches it back. */
        this.pushBallGrabAction();
        this.newState(STATE.returningBallIndirect);
        return this.pop().step;
      }
    }

    const { step, flags } = this.pop();

    if (this.cues.has(0)) {
      this.waiting = true;
    }

    if (flags & 1) {
      const ball = this.world.ball;
      const onStage =
        !!ball &&
        ball.x >= 0 &&
        ball.y >= 0 &&
        ball.x < this.world.width &&
        ball.y < this.world.height;

      if (!onStage) {
        this.pushBallGrabAction();
        this.newState(this.naughty ? STATE.returningBallIndirect : STATE.returningBallDirect);
      } else {
        this.newState(this.naughty ? STATE.guardingBall : STATE.anticipatingBall);
      }
    }

    return step;
  }

  /** How many tricks more the dog will do waiting for a throw (`0x127a`). */
  private anticipations = 0;

  /**
   * `PetModule::DoAnticipatingBall` (seg19:101d): the ball dropped, the dog
   * waits for the throw, doing a trick or two; if the user goes away from
   * it, it takes the ball back itself; after enough, it loses interest. A
   * naughty dog's guarding (0x1c, seg19:1ec7) is played the same way.
   */
  private doAnticipatingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.anticipations = (this.rand() % (Math.trunc(this.factor(0) / 30) + 2)) + 1;
      this.pushBallReleaseAction();

      if (!(this.playingKind() & POSITION.moving)) {
        this.push({ cue: 0 });
      }

      const pant = this.position === SITTING ? SCRIPT.sitPant : SCRIPT.pant;
      this.pushTransition(this.data.scripts[pant].from, BELLY);
      this.push({ cue: 0 });
      this.pushBegWaitLoops();
      this.waiting = false;
      return undefined;
    }

    if (this.waiting) {
      const cursor = this.samples[0];

      if (!this.isOnscreen() || !cursor || !this.inFocusBox(cursor, 1.8)) {
        this.queue = [{ glue: 36 }];

        if (this.isBallGrabbable()) {
          this.pushBallGrabAction();
          this.newState(STATE.returningBallDirect);
        } else {
          this.newState(STATE.chasingBall);
        }

        return this.pop().step;
      }
    }

    const { step, flags } = this.pop();
    this.noteWaiting();

    if (flags & 8) {
      this.newState(this.gotoState);
    } else if (flags & 1) {
      if (this.anticipations-- > 0) {
        this.waiting = false;
        this.push({ glue: CHEST });
        this.pushTrick(this.pickTrickState());
        this.push({ cue: 0 });
        this.pushBegWaitLoops();
      } else {
        this.queue = [{ glue: CHEST }];
        this.naughty = false;
        this.newGlobalState(GLOBAL.idle);
      }
    }

    return step;
  }

  /** `PetModule::DoObservingBallThrown` (seg19:022b): sits and watches six to ten pants, then loses interest. */
  private doObservingBallThrown(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      for (let times = (this.rand() % 5) + 5; times >= 0; times--) {
        this.pushStored(SCRIPT.sitPant);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newGlobalState(GLOBAL.idle);
    }

    return step;
  }

  /** `PetModule::DoWaitState` (seg21:6073): plays the queue out to the state it names. */
  private doWaitState(mode: Mode): Step | undefined {
    if (mode !== 'run') {
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 8) {
      this.newState(this.gotoState);
    } else if (flags & 1) {
      this.newState(STATE.idle);
    }

    return step;
  }

  /**
   * `PetModule::GetNewNaughtyTarget` (seg19:275f): a point on the stage far
   * from the dog and from the user. How far, the engine's callers say;
   * here half the stage's diagonal, inferred.
   */
  private newNaughtyTarget() {
    const cursor = this.samples[0] ?? { x: 0, y: 0 };
    const at = this.world.centre?.() ?? this.world.where();
    const { width, height } = this.world;
    const most = Math.trunc(Math.hypot(width - 120, height - 120) / 2) - 50;
    let fromUser = Math.hypot(at.x - cursor.x, at.y - cursor.y);

    for (let tries = 0; tries < 10000; tries++) {
      const point = {
        x: (this.rand() % Math.max(1, width - 120)) + 60,
        y: (this.rand() % Math.max(1, height - 120)) + 60,
      };

      if (
        Math.hypot(at.x - point.x, at.y - point.y) > most &&
        Math.hypot(cursor.x - point.x, cursor.y - point.y) > fromUser
      ) {
        return point;
      }

      fromUser = Math.max(20, fromUser - 1);
    }

    return { x: width / 2, y: height / 2 };
  }

  /** `PetModule::DoBallTrick` (seg18:061d): a trick with the ball, then the next trick or idle. */
  private doBallTrick(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.pushBallTrick(this.state);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 8) {
      this.newState(this.gotoState);
    } else if (flags & 1) {
      const global = this.reducedGlobal();
      this.newState(
        global === GLOBAL.begEat || global === GLOBAL.fetch ? this.pickTrickState() : STATE.idle
      );
    }

    return step;
  }

  /**
   * `PetModule::PushBallTrick` (seg21:6bde): nosing the ball (102), walking
   * on it (88 then 89) or bouncing on it (87), throwing it (97), balancing
   * it (85). How the engine moves the ball during them (`0x8af4`, `0x8aed`,
   * `0x8ae9`) is not yet played.
   */
  private pushBallTrick(state: number) {
    const repeat = (times: number, then: () => void) => {
      for (let n = 0; n < times; n++) {
        then();
      }
    };

    switch (state) {
      case 0x61:
        this.pushBallReleaseAction();

        if (this.world.ballHasMoved?.()) {
          this.pushBallGrabAction();
          this.push({ step: { frame: this.lastStep.frame, release: 0 } }, { glue: CHEST });
        }

        repeat((this.rand() % 4) + 1, () => this.pushStored(102));
        break;
      case 0x62:
      case 0x63: {
        const on = state === 0x63 ? 87 : 89;
        this.pushBallReleaseAction();
        this.pushStored(88);
        this.pushTransition(this.data.scripts[on].from, BELLY);
        this.push({ drift: 2 - (this.rand() % 5) });
        repeat((this.rand() % 4) + 1, () => this.pushStored(on));
        this.push({ cue: 3 }, { drift: 0 });
        break;
      }
      case 0x64:
        this.pushBallGrabAction();
        this.pushStored(97);
        this.push({ goto: STATE.chasingBall });
        break;
      case 0x65:
        this.pushBallGrabAction();
        this.pushTransition(this.data.scripts[85].from, BELLY);
        repeat(this.rand() % 4, () => this.pushStored(85));
        break;
    }

    this.push({ glue: CHEST });
  }

  /** A slide under way towards an aim (`-0x71ec` on). */
  private slide: {
    dx: number;
    dy: number;
    x: number;
    y: number;
    movedX: number;
    movedY: number;
    left: number;
  } | null = null;

  /**
   * `0x8af4 ball x y` (`PopScript`, seg7:5e98 and 7144 on): the frames up to
   * the next cue 2 are counted, and the dog slid evenly over them so that
   * the ball named is at the point when that frame shows; `0x7ffd` for the
   * point is the ball at play. Where the engine plays the frames ahead to
   * know where that ball will be, this takes the frame where the dog now
   * stands, so moves within the frames between are not counted.
   */
  private startAim(ball: number, at: { x: number; y: number } | null) {
    const point = at ?? this.world.ball;
    let frames = 0;
    let target: Step | undefined;

    for (const item of this.queue) {
      if ('step' in item && !item.step.reference) {
        frames++;

        if (item.step.cues?.includes(2)) {
          target = item.step;
          break;
        }
      }
    }

    if (!point || !target || !this.world.ballInFrame || frames < 1) {
      return;
    }

    const there = this.world.ballInFrame(target.frame, ball, this.rotation);
    this.slide = {
      dx: (point.x - there.x) / frames,
      dy: (point.y - there.y) / frames,
      x: 0,
      y: 0,
      movedX: 0,
      movedY: 0,
      left: frames,
    };
  }
}
