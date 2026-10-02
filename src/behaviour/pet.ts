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

import { FIRST_TRICK, type EngineScripts, POSITION, type TrickScript } from '../formats/engine.ts';
import { type Script } from '../formats/script.ts';
import { type Trick } from '../formats/tricks.ts';
import { type Rand } from './random.ts';
import { DEFAULT_GLUE, type Step, timeline } from './timeline.ts';
import { AUTO, findTransition, type TransitionTable } from './transitions.ts';

/** The engine's states this file plays, by the numbers `readEngineStateNames` names. */
export const STATE = {
  idle: 4,
  sleeping: 5,
  locomote: 7,
  postLocomote: 8,
  firstTrick: FIRST_TRICK,
  lastIdleTrick: 0x60,
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
}

/** What the engine needs to know of the stage, and of where the dog is on it. */
export interface PetWorld {
  width: number;
  height: number;

  /** Where the dog is, from the stage's top left. */
  where(): { x: number; y: number };

  /** The rotation that faces the dog towards a point. */
  aim(target: { x: number; y: number }): number;
}

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
  | { step: Step }
  | { end: number }
  | { glue: number }
  | { goto: number }
  | { ease: number }
  | { drift: number }
  | { cue: number };

/** An angle in 256ths of a turn, from -128 to 127. */
const wrap = (angle: number) => ((((angle + 128) % 256) + 256) % 256) - 128;

export class Pet {
  readonly factors: number[];

  /** The centres the factors drift back to (`0x11f4`). */
  readonly centres: number[];

  state = 0;
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
    this.newState(STATE.locomote);
  }

  /** One tick of the engine, `time` in its ticks: the dog's state acts, and a frame plays. */
  tick(time: number): Tick {
    this.time = time;
    this.pulse();

    const shown = this.dispatch();
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

    this.push(...steps.map((step) => ({ step })), { end: index });
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

    const control = (item: Item) => {
      if ('glue' in item) {
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
          this.pushTransition(this.data.scripts[SCRIPT.walk].from, BELLY);
          this.push({ ease: rotation < 0 ? 5 - facing : facing - 5 });
          this.pushStored(SCRIPT.walk);
        }
      }

      this.pushTrick(this.state);
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
        this.push({ cue: 0 });
        repeat((this.rand() % 3) + 2, () => this.pushStored(roll));
        return;
      }
      case 0x2d:
        this.pushTransition(this.data.scripts[SCRIPT.run].from, BELLY);
        this.push({ drift: (this.rand() % 4) + 8 });
        repeat((this.rand() % 4) + 2, () => this.pushStored(SCRIPT.run));
        this.push({ cue: 0 }, { drift: 0 });
        this.pushTransition(this.data.scripts[SCRIPT.pant].from, BELLY);
        return;
      case 0x37: {
        const sitting = this.data.positionKinds[this.position] & POSITION.sitting;
        const bark = sitting ? SCRIPT.barkSitting : SCRIPT.bark;
        this.pushTransition(this.data.scripts[bark].from, BELLY);
        this.push({ cue: 0 });
        repeat((this.rand() % 3) + 1, () => this.pushStored(bark));
        return;
      }
      case 0x43:
        this.pushTransition(this.data.scripts[SCRIPT.boing].from, BELLY);
        this.push({ cue: 0 }, { drift: 5 - (this.rand() % 11) });
        repeat((this.rand() % 8) + 2, () => this.pushStored(SCRIPT.boing));
        this.push({ drift: 0 });
        return;
      case 0x46:
        this.pushTransition(this.data.scripts[SCRIPT.sneeze].from, BELLY);
        this.push({ cue: 0 });
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
}
