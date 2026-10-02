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
import { type Rand } from './random.ts';
import { DEFAULT_GLUE, type Step, timeline } from './timeline.ts';
import { AUTO, findTransition, type TransitionTable } from './transitions.ts';

/** The engine's states this file plays, by the numbers `readEngineStateNames` names. */
export const STATE = {
  idle: 4,
  sleeping: 5,
  locomote: 7,
  postLocomote: 8,
  chasingPetting: 0x13,
  waitPetting: 0x14,
  pettingGood: 0x15,
  pettingBad: 0x16,
  aligningPetting: 0x17,
  beggingChasing: 0x26,
  eating: 0x28,
  grabbingTreat: 0x29,
  begging: 0x2a,
  firstTrick: FIRST_TRICK,
  lastIdleTrick: 0x60,
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
  snatch: 240,
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

/** How close to a target the dog must come to have reached it. Inferred. */
const REACHED = 24;

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

  /** The rectangle the dog is drawn in. */
  rect?(): { left: number; top: number; right: number; bottom: number };

  /** The treat out of its box, if any: 0 blue, 1 green, 2 red. */
  treat?: { colour: number; held: boolean; x: number; y: number } | null;

  /** Takes the treat away: the dog has eaten it. */
  eatTreat?(): void;
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
  | { trick: number };

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

    if (step) {
      this.turn(step);
      this.lastStep = step;
      this.placedBy = placedBy;

      for (const cue of step.cues ?? []) {
        this.cues.add(cue);
      }
    } else {
      step = { frame: this.lastStep.frame };
      this.placedBy = undefined;
    }

    if (this.target) {
      const { x, y } = this.world.where();

      if (Math.hypot(this.target.x - x, this.target.y - y) < REACHED) {
        flags |= 2;
      }
    }

    return { step, flags };
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

    if (state >= STATE.firstTrick && state <= STATE.lastIdleTrick) {
      return this.doTrick(mode);
    }

    switch (state) {
      case STATE.chasingPetting:
      case STATE.beggingChasing:
        return this.doChasing(mode);
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
          /* Idle, it turns the way it is turned; begging, towards the treat. */
          const left =
            this.global === GLOBAL.idle
              ? rotation < 0
              : this.world.where().x < (this.world.treat?.x ?? 0);
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
      this.newState(this.reducedGlobal() === GLOBAL.begEat ? this.pickTrickState() : STATE.idle);
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
   * `PetModule::PickLocomotionAction`: walk, trot or run by excitement,
   * and sometimes a strut, a sad walk or a march by ham.
   */
  private pickLocomotion() {
    const excitement = this.factor(0);
    const [walk, trot, run] = this.data.engineScripts.locomotion;
    const pace = Math.min(
      2,
      Math.max(0, Math.trunc((((this.rand() % 21) + excitement - 10) * 3) / 100))
    );
    let action = [walk, trot, run][pace];

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

  /** Walks a stretch towards the target: steering is the sprite's, and inferred here. */
  private pushLocomotion() {
    if (this.target) {
      this.push({ ease: this.world.aim(this.target) });
    }

    this.pushStored(this.locomotion);
  }

  /** `PetModule::DoLocomote`, seg16:1263: off to somewhere, and on to somewhere else. */
  private doLocomote(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.locomotion = this.pickLocomotion();
      this.target = this.newTarget();
      this.pushLocomotion();
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 2) {
      if (this.rand() % 150 >= this.factor(0)) {
        this.newState(STATE.postLocomote);
        return step;
      }

      this.target = this.newTarget();
    }

    if (flags & 1) {
      if (this.rand() % 5 === 0) {
        this.locomotion = this.pickLocomotion();
      }

      this.pushLocomotion();
    }

    return step;
  }

  /** `PetModule::DoPostLocomote`, seg16:1544: stop and stand, or head back onto the stage. */
  private doPostLocomote(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.target = null;
      this.pushTransition(STANDING, BELLY);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (this.isOnscreen()) {
        this.newState(STATE.idle);
      } else {
        this.target = { x: this.world.width / 2, y: this.world.height / 2 };
        this.pushLocomotion();
      }
    }

    return step;
  }

  // Global states.

  /** `ReducedGlobalState`: the three treats, food and water are all one, begging and eating. */
  reducedGlobal() {
    return this.global >= GLOBAL.begEat && this.global <= GLOBAL.begEat + 4
      ? GLOBAL.begEat
      : this.global;
  }

  /**
   * `PetModule::NewGlobalState` (seg21:5dfa): the old global state leaves,
   * and the new one enters, choosing the state to start in unless told.
   */
  newGlobalState(global: number, state = 0) {
    this.global = global;

    if (global === GLOBAL.idle) {
      this.enterIdle(state);
    } else if (global === GLOBAL.petting) {
      this.enterPetting(state);
    } else if (this.reducedGlobal() === GLOBAL.begEat) {
      this.enterBegEat(state);
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
    return treat ? GLOBAL.firstTreat + treat.colour : 0;
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

  /**
   * Chasing the cursor to be petted (0x13), or the treat to beg for it
   * (0x26). The engine's `DoTargettedLocomote` is not yet read; this walks
   * to within reach, then waits or begs.
   */
  private doChasing(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    const goal = () => {
      const treat = this.world.treat;
      return this.state === STATE.beggingChasing && treat && !treat.held ? treat : this.samples[0];
    };

    if (mode === 'enter') {
      this.locomotion = this.pickLocomotion();
      this.target = goal() ?? null;
      this.pushLocomotion();
      return undefined;
    }

    if (this.state === STATE.beggingChasing && !this.world.treat) {
      this.newGlobalState(GLOBAL.idle);
      return this.pop().step;
    }

    if (this.state === STATE.beggingChasing && !this.world.treat?.held) {
      this.newState(STATE.eating);
      return this.pop().step;
    }

    const { step, flags } = this.pop();
    this.target = goal() ?? this.target;

    if (this.target && this.near(this.target)) {
      this.newState(this.state === STATE.beggingChasing ? STATE.begging : STATE.waitPetting);
    } else if (flags & 1) {
      this.pushLocomotion();
    }

    return step;
  }

  private near(point: { x: number; y: number }) {
    const at = this.world.where();
    return Math.hypot(point.x - at.x, point.y - at.y) < NEAR + 40;
  }

  private treatNear() {
    const treat = this.world.treat;
    return treat !== null && treat !== undefined && this.near(treat);
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
      if (!this.world.treat?.held) {
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

    if (this.waiting && !this.treatNear()) {
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

    if (this.reducedGlobal() === GLOBAL.begEat && treat?.held) {
      this.factors[9] = Math.min(100, this.factors[9] + 4);

      if (this.decideIfGrabFromUser()) {
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
    let loops = Math.trunc((100 - excitement) / 20) + 1;
    loops += this.rand() % loops;

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

    if (this.cues.has(10) && this.world.treat) {
      this.world.eatTreat?.();
      this.factors[9] = this.centres[9];

      if (!this.brainActive) {
        this.positiveReinforcement();
      }
    }

    if (this.target && treat && this.near(treat)) {
      this.target = null;
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
}
