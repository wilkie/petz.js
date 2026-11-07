/**
 * A Catz cat on its own: the reimplemented pieces run together, tick after
 * tick, without the engine -- its states (`catzStateTick`, and what each
 * writes every tick, `catzStateBetween`), its global states begun
 * (`catzGlobalBegin`), the moment (`catzMomentBegin`, `catzMomentTick`) and
 * its extreme situations (`catzExtremeSituations`). See
 * kb/topics/catz-behaviour.md ("On its own").
 *
 * What is not the engine's, and is said so where it stands in: how long an
 * action plays is given (`play`), not the script player's; walking moves
 * straight toward the goal at a fixed pace, not by the cat's steering and
 * frames; the pen is empty -- no toys, cursor or mouse -- and the cat is
 * placed nowhere in particular (its place, 0); and a global state whose
 * beginning is not reimplemented is idled instead, and counted.
 */

import { type CatzMind, catzBehavior } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { catzGlobalBegin, catzGlobalTick } from './catz-global.ts';
import { catzMomentBegin, type CatzMomentState, catzMomentTick } from './catz-moment.ts';
import { catzBehaviorChange, catzExtremeSituations } from './catz-reflexes.ts';
import {
  type CatzBox,
  catzCuriosities,
  catzPtToPtAngle,
  catzStateBetween,
  catzStateTick,
  type CatzStateTick,
  type CatzStateWorld,
} from './catz-states.ts';

/** What the cat is given: its brains and their centres, the stage, how long each action plays, and C's `rand`. */
export interface CatzPetOptions {
  brains: number[];
  centres: number[];
  stage: CatzBox;
  /**
   * How many ticks an action plays, and the pose (`+0x1500`) it leaves the
   * cat in, where known (its script's `to`); walking on, with what steers it
   * (`targetSprite4`).
   */
  play: (action: number, steer?: CatzSteer) => number | { ticks: number; pose?: number };
  random: (n: number) => number;

  /** Its width and height (`+0x33c4`, `+0x33c6`); a cat's, by default. */
  size?: { width: number; height: number };

  /** Whether it moves itself, straight to what it walks to (the default); else whoever places it sets `point`, as its frames carry it. */
  moves?: boolean;

  /** How near what it walks to it is found (standing in for its focus box, `PopScript` answering 2): 8 by default. */
  foundWithin?: number;

  /** A state entered, what was left of the last script dropped: whoever plays its scripts drops its frames still to come. */
  dropped?: () => void;

  /** Whether `PopScript` found what it walks to in its box this tick (answering 2), where whoever plays its scripts knows; else `foundWithin` stands in. */
  found?: () => boolean;

  /** Where a thing on the shelf is (its target point), by its kind: standing in, by default, along the stage's top. */
  shelfAt?: (kind: number) => { x: number; y: number };

  /** Whether the cursor is about (`PetParams` `+0x46`), by the ticks gone: by default never. */
  cursorAbout?: (tick: number) => boolean;

  /** Where the cursor (kin 0x17) is, by the ticks gone: by default still at the stage's lower middle. */
  cursor?: (tick: number) => { x: number; y: number };
}

/**
 * What an action is steered by. A walk, at what it walks to
 * (`targetSprite4`, seg41:0e8d): where that is, as it is each tick, and the
 * box it is looked for in -- the cat's width and height or more, and the
 * share of their diagonal it lies ahead of the head. A stalk's creep, its
 * rotation's fudger aimed at an angle, at a rate of 100, and reset after.
 */
export type CatzSteer =
  | {
      to: () => { x: number; y: number } | undefined;
      box: { width: number; height: number; share: number };
    }
  | { rotation: number };

/** What a tick did, for a viewer or a test to follow. */
export interface CatzPetTicked {
  state: number;
  global: number;

  /** The actions pushed this tick, in turn. */
  pushes: number[];
}

/** The global states whose beginning is reimplemented. */
const BEGUN = new Set([1, 3, 6, 8, 9, 15, 16]);

/** The states of its own `catzStateTick` reimplements (as the trace follows them, test/harness/catzpen_test.ts); the rest -- might it jump (14), jumping and crawling about the edges and shelf (15 to 18) -- are idled instead, and counted. */
const REIMPLEMENTED = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33,
  34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
  58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
]);

/** The states whose entering is reimplemented (as the trace holds them); the rest are entered doing nothing until their first tick. */
const ENTERED = new Set([
  3, 4, 8, 22, 24, 26, 31, 32, 33, 42, 44, 45, 46, 48, 49, 52, 54, 55, 58, 59, 60, 61, 63, 64, 65,
  67, 69, 70, 71, 72, 76, 77, 78, 79, 80, 81,
]);

/** How deep entering may go on into entering, before it is cut short (and counted). */
const DEPTH = 8;

export class CatzPet {
  readonly mind: CatzMind;
  state = 0;
  global = 0;

  /** The cat's own fields, as its states read and write them. */
  readonly fields: Partial<CatzStateWorld> & { count: number; passed: number; x35ce?: number };

  /** Where it is, and where it walks to. */
  point: { x: number; y: number };

  /** Its draw rectangle, where whoever places it says; else about its point, by its size. */
  rect?: CatzBox;

  /** The moment, while it has one, and as its readying left it. */
  moment?: CatzMomentState;
  private readied?: NonNullable<CatzStateTick['moment']>;

  /** In its moment, whether it minds the cursor (`+0x34ca`), once its first script is done. */
  private minded = false;

  /** Ticks left of what it plays, and what it pushed this tick. */
  private left = 0;
  private pushed: number[] = [];
  private x358c = 0;

  /** What stood in for the engine, counted: global states idled instead, states it could not read, and errors. */
  readonly stoodIn = {
    globals: {} as Record<number, number>,
    states: {} as Record<number, number>,
    unread: 0,
    errors: 0,
    deep: 0,
    firstError: undefined as string | undefined,
    deepAt: undefined as string | undefined,
  };

  private readonly options: CatzPetOptions;

  constructor(options: CatzPetOptions) {
    this.options = options;
    const { stage } = options;
    this.mind = {
      brains: [...options.brains],
      centres: [...options.centres],
      state: 0,
      global: 0,
      target: 0,
      count: 0,
    };
    this.point = {
      x: Math.trunc((stage.left + stage.right) / 2),
      y: Math.trunc((stage.top + stage.bottom) / 2),
    };
    /* `+0x35b8`, the stalk's creep, -1 for none: nothing sets it in an empty pen. */
    this.fields = {
      count: 0,
      passed: 0,
      x1500: 0,
      mode: 0,
      x35a4: 0,
      x35a6: 0,
      x688: 0,
      x35b8: -1,
    };
    this.beginGlobal(6, 0);
  }

  /** How many ticks are left of what it plays: a viewer keeps as many frames, a new state having dropped what was left. */
  get playing() {
    return this.left;
  }

  /** A tick: its reflexes, then its state's own -- its script playing on, or done. */
  tick(): CatzPetTicked {
    this.ticks++;
    this.pushed = [];
    this.reflexes();

    /* Its global state's handler, before its own state's. */
    if (this.globalTick()) {
      return { state: this.state, global: this.global, pushes: this.pushed };
    }

    if (this.left > 0) {
      this.left--;
      this.between();
      this.walk();

      /* Looking at things counts down to its next look, and looks, every
       * tick, its idle action playing on (the trace's `+0x3504`). */
      if (this.state === 12) {
        this.run(false, 0, true);
      }
    } else {
      this.act();
    }

    return { state: this.state, global: this.global, pushes: this.pushed };
  }

  /**
   * A tick of its global state (`catzGlobalTick`): the cursor about, most
   * ready its moment and have it; attacking after the mouse may run to the
   * catnip. Whether it went on to another state, so this tick is done.
   */
  private globalTick() {
    const ticked = catzGlobalTick(
      this.global,
      this.mind,
      {
        cursorAbout: this.options.cursorAbout?.(this.ticks) ?? false,
        cursorMoved: false,
        area3: false,
        area1: true,
        screenSaver: false,
        sleepy: false,
        x35a4: this.fields.x35a4 ?? 0,
        x35a6: this.fields.x35a6 ?? 0,
        /* `+0x34ca`: in its moment, whether it minds the cursor; else passing the time's. */
        x34ca: this.state === 21 ? Number(this.minded) : this.fields.passed,
        /* The mouse in its hole in an empty pen. */
        mouseState: 0,
      },
      this.options.random,
      { begin: false }
    );

    if (ticked.moment) {
      this.readied = ticked.moment;
    }

    if (ticked.pushes?.length) {
      this.push(ticked.pushes);
    }

    if (ticked.global !== undefined) {
      this.beginGlobal(ticked.global, 0);
      return true;
    }

    if (ticked.state !== undefined) {
      this.fields.x35a4 = ticked.kind;
      this.fields.x35a6 = ticked.kind;
      this.fields.x35ac = ticked.x35ac;
      this.fields.x35a2 = ticked.x35a2;
      this.enter(ticked.state, 0);
      return true;
    }

    return false;
  }

  /** Extreme situations: its behaviour changed by its diet every 281 ticks. */
  private reflexes() {
    const done = catzExtremeSituations(this.mind, this.x358c, false, this.options.random);
    this.x358c = done.x358c;

    if (done.change !== undefined) {
      catzBehaviorChange(this.mind, done.change, [0, 0, 0, 0]);
    }
  }

  /** What its state writes every tick, its script done or not -- and in its moment, the ticks to its next look counted down (`+0x3504`), the look itself left to its next lingering (the engine looks the tick it is 0). */
  private between() {
    if (this.state === 21 && this.moment && this.moment.ticks > 0) {
      this.moment.ticks--;
    }

    const now = catzStateBetween(state(this), this.asTick(), { cues: [], looked: 0 });
    this.take(now);
  }

  /** Where the cursor is. */
  private cursorAt() {
    const { stage, cursor } = this.options;
    return (
      cursor?.(this.ticks) ?? {
        x: Math.trunc((stage.left + stage.right) / 2),
        y: stage.bottom - 20,
      }
    );
  }

  /** The ticks gone. */
  private ticks = 0;

  /** Where what it walks to is (`+0x35a6`): the cursor, its marker (kin 0x16) where it put one, else its goal -- and, stalking, its prey. */
  target() {
    return this.state === 2 && this.fields.x35a4 === 0x17 ? this.cursorAt() : this.walkedToAt();
  }

  /** Where what it walks to is (`+0x35a6`): the cursor, its marker (kin 0x16) where it put one, a thing on the shelf, else its goal. */
  private walkedToAt() {
    const kind = this.fields.x35a6 ?? 0;
    return kind === 0x17
      ? this.cursorAt()
      : kind === 0x16 && this.marker
        ? this.marker
        : kind > 0 && shelved(kind)
          ? this.shelfAt(kind)
          : this.fields.goal;
  }

  /** Where a thing on the shelf is: as given, else standing in, the shelf along the stage's top, each kind in its place along it. */
  private shelfAt(kind: number) {
    const { stage, shelfAt } = this.options;
    return (
      shelfAt?.(kind) ?? {
        x: stage.left + Math.trunc(((stage.right - stage.left) * (kind + 1)) / 17),
        y: stage.top + 30,
      }
    );
  }

  /** Its marker (kin 0x16), where walking put it. */
  private marker?: { x: number; y: number };

  /** Walking on, toward what it walks to, and stalking, toward its prey: straight there, four a tick, facing it (`+0x688`) -- standing in for its steering, turns and creeping. */
  private walk() {
    if (this.options.moves === false) {
      return;
    }

    const goal =
      this.state === 23
        ? this.walkedToAt()
        : this.state === 2 && this.fields.x35a4 === 0x17
          ? this.cursorAt()
          : undefined;

    if (!goal) {
      return;
    }

    const facing = catzPtToPtAngle(this.point, goal);

    if (facing !== 0x81) {
      this.fields.x688 = facing;
    }

    const dx = goal.x - this.point.x;
    const dy = goal.y - this.point.y;
    const far = Math.hypot(dx, dy);
    /* Stalking creeps only so near, to leap the rest. */
    const short = this.state === 2 ? 120 : 4;

    if (far > short) {
      this.point = {
        x: this.point.x + Math.round((dx / far) * 4),
        y: this.point.y + Math.round((dy / far) * 4),
      };
    }
  }

  /** Its script done: its state's tick, and what it asks. */
  private act(depth = 0) {
    if (this.state === 21 && this.moment) {
      const done = catzMomentTick(
        this.mind,
        this.moment,
        {
          shelf: true,
          screenSaver: false,
          c4: 0,
          x35d2: 0,
          x3516: this.readied?.after ?? 0,
          area3: false,
          cursorAbout: this.options.cursorAbout?.(this.ticks) ?? false,
          minded: this.minded,
          soundPlaying: false,
        },
        this.options.random
      );
      /* Minding the cursor (`+0x34ca`) once its first script is done. */
      this.minded = true;

      if (done.pushed !== undefined) {
        this.push([done.pushed]);
      }

      if (done.x35a6 !== undefined) {
        this.fields.x35a6 = done.x35a6;
      }

      this.change(done.global, done.state, depth);
      return;
    }

    this.run(false, depth);
  }

  /** Its state's tick, entering or not, and what it asks -- `playing`, its script still playing, pushing nothing more. */
  private run(enter: boolean, depth: number, playing = false) {
    let ticked: CatzStateTick;

    try {
      ticked = catzStateTick(this.state, this.mind, this.world(enter), this.options.random);
    } catch (error) {
      this.stoodIn.errors++;
      this.stoodIn.firstError ??= `${this.state}: ${String(error)}`;
      this.beginGlobal(6, depth + 1);
      return;
    }

    if (ticked.unread) {
      this.stoodIn.unread++;
    }

    this.take(ticked);

    if (ticked.moment) {
      this.readied = ticked.moment;
    }

    const before = this.left;

    if (playing) {
      /* Nothing more pushed while it plays. */
    } else if (ticked.pushes?.length) {
      this.push(ticked.pushes, this.steering(ticked));
    } else if (ticked.pushed !== undefined) {
      this.push([ticked.pushed], this.steering(ticked));
    }

    /* Entered, and pushing: what comes after waits for that script to be
     * done, as a pounce's leap -- the model has some states' entering go on
     * as though their script were popped at once (the trace holds them by
     * their pushes only). */
    if (enter && this.left > before) {
      return;
    }

    this.change(ticked.global, ticked.state, depth);
  }

  /** A global state or a state of its own asked: begun, or entered. */
  private change(global: number | undefined, state: number | undefined, depth: number) {
    if (global !== undefined) {
      this.beginGlobal(global, depth + 1);
    } else if (state !== undefined) {
      this.enter(state, depth + 1);
    }
  }

  /** A global state begun (`GlobalCatStateMachine::NewState`), and the state of its own it begins in. */
  private beginGlobal(global: number, depth: number) {
    if (depth > DEPTH) {
      this.stoodIn.deep++;
      this.stoodIn.deepAt ??= `global ${global} from state ${this.state}`;
      return;
    }

    if (this.beginOwn(global, depth)) {
      return;
    }

    if (!BEGUN.has(global)) {
      this.stoodIn.globals[global] = (this.stoodIn.globals[global] ?? 0) + 1;
      global = 6;
    }

    this.global = global;
    this.mind.global = global;
    const begun = catzGlobalBegin(
      global,
      this.mind,
      {
        cursorMoved: false,
        area3: false,
        screenSaver: false,
        sleepy: false,
        inShelf: shelved,
        x35ce: this.fields.x35ce ?? 0,
        x35d2: this.fields.x35d2 ?? 0,
        x35a4: this.fields.x35a4 ?? 0,
        stage: this.options.stage,
        size: this.options.size ?? { width: 137, height: 104 },
        preyAt: this.fields.x35a4 === 0x17 ? this.cursorAt() : this.walkedToAt(),
        /* The mouse in its hole in an empty pen, after nothing. */
        mouseAfterCursor: false,
      },
      this.options.random
    );

    if (begun.mode !== undefined) {
      this.fields.mode = begun.mode;
    }

    /* Eating: what it goes to, the bowl, and what sent it spent. */
    if (global === 3) {
      this.fields.x35ce = 0;
    }

    if (begun.kind !== undefined) {
      this.fields.x35a4 = begun.kind;
      this.fields.x35a6 = begun.kind;
    }

    if (begun.x35d2 !== undefined) {
      this.fields.x35d2 = begun.x35d2;
    }

    if (begun.x35ac !== undefined) {
      this.fields.x35ac = begun.x35ac;
    }

    /* Attacking: walking to a point, the corner it made for. */
    if (begun.x35a2 !== undefined) {
      this.fields.x35a2 = begun.x35a2;
    }

    if (begun.goal) {
      this.fields.goal = begun.goal;
    }

    if (begun.pushes) {
      this.push(begun.pushes);
    }

    /* Another global state asked after it, begun in turn where it is not begun here. */
    const last = begun.globals.at(-1)!;

    if (begun.state === undefined && last !== global) {
      this.beginGlobal(last, depth + 1);
      return;
    }

    if (begun.state !== undefined) {
      /* Eating going on to idle begins idling's state in idling. */
      this.global = last;
      this.mind.global = last;
      this.enter(begun.state, depth + 1);
    }
  }

  /**
   * The global states the pet begins itself, as far as they are read out --
   * and where not, standing in, counted:
   *
   * - grooming (13; `DoGSGrooming`, seg30:07d3): with fleas over what
   *   behaviour 13 answers, or one time in two, or playing with the user
   *   (`+0x35a4` 1), it grooms where it is (31; facing the user first where
   *   it has no fleas, not reimplemented); else it walks somewhere to groom,
   *   its way drawn as the engine draws it (`rand() % 5` of 1, 2, 3, 6 and 7,
   *   `+0x35a8`), its goal -- by that way, beside it, along an edge or by
   *   its hiding place -- standing in at random on the stage;
   * - affectionate (14; `DoGSAffectionate`): no sound of its own
   *   (`+0x3570`), and it walks to the cursor (22, `+0x35a6` 0x17).
   *
   * Attacking (1), playing (15) and chasing (16) begin as the engine begins
   * them (`catzGlobalBegin`): walking to what it attacks or plays with, or
   * making for a corner away from it first, or running to it.
   */
  private beginOwn(global: number, depth: number) {
    const { random } = this.options;
    const set = (to: number) => {
      this.global = to;
      this.mind.global = to;
    };

    switch (global) {
      case 13: {
        const fleas = this.mind.brains[CATZ_BRAIN.fleas] > catzBehavior(this.mind, 13, random);
        set(13);

        if (random(101) < 50 || this.fields.x35a4 === 1 || fleas) {
          this.enter(31, depth + 1);
          return true;
        }

        this.fields.x35a8 = [1, 2, 3, 6, 7][random(5)];
        const { stage } = this.options;
        this.fields.goal = {
          x: stage.left + random(Math.max(1, stage.right - stage.left)),
          y: stage.top + random(Math.max(1, stage.bottom - stage.top)),
        };
        this.fields.x35a6 = 0;
        this.enter(22, depth + 1);
        return true;
      }
      case 14:
        set(14);
        this.fields.x35a6 = 0x17;
        this.enter(22, depth + 1);
        return true;
      default:
        return false;
    }
  }

  /** A state of its own entered (`CatSprite::NewState`): its entering run at once. */
  private enter(state: number, depth: number) {
    if (depth > DEPTH) {
      this.stoodIn.deep++;
      this.stoodIn.deepAt ??= `state ${state} from state ${this.state}, global ${this.global}`;
      return;
    }

    if (!REIMPLEMENTED.has(state)) {
      this.stoodIn.states[state] = (this.stoodIn.states[state] ?? 0) + 1;
      this.beginGlobal(6, depth + 1);
      return;
    }

    this.state = state;
    this.mind.state = state;

    if (this.left > 0) {
      this.options.dropped?.();
    }

    this.left = 0;

    if (state === 21) {
      const readied = this.readied;
      this.moment = {
        looks: 0,
        ticks: 0,
        looksBeforeGoing: readied?.looksBeforeGoing ?? 2,
        mode: readied?.mode ?? 1,
        idle: readied?.idle ?? 0x93,
        soundOwed: 0,
        box: { left: 0, top: 0, right: 0, bottom: 0 },
        going: false,
      };
      catzMomentBegin(this.mind, this.moment, this.options.stage, this.options.random);
      this.act(depth);
      /* Its first script only now begun: not minding the cursor yet. */
      this.minded = this.state === 21 ? false : this.minded;
      return;
    }

    this.moment = undefined;

    /* Looking at things: what it is curious about, filled as it is entered
     * (`GetCuriosities`), its looks and ticks to its next none. */
    if (state === 12) {
      this.fields.curiosities = catzCuriosities(this.mind, shelved, this.options.random);
      this.fields.count = 0;
      this.fields.ticks = 0;
    }

    if (!ENTERED.has(state)) {
      return;
    }

    this.run(true, depth);
  }

  /** What a tick wrote, kept. */
  private take(ticked: Partial<CatzStateTick>) {
    const f = this.fields;

    if (ticked.count !== undefined) f.count = ticked.count;
    if (ticked.passed !== undefined) f.passed = ticked.passed;
    if (ticked.mode !== undefined) f.mode = ticked.mode;
    if (ticked.x35a6 !== undefined) f.x35a6 = ticked.x35a6;
    if (ticked.x35a4 !== undefined) f.x35a4 = ticked.x35a4;
    if (ticked.x35ac !== undefined) f.x35ac = ticked.x35ac;
    if (ticked.x35ee !== undefined) f.x35ee = ticked.x35ee;
    if (ticked.x35f4 !== undefined) f.x35f4 = ticked.x35f4;
    if (ticked.x688 !== undefined) f.x688 = ticked.x688;
    if (ticked.x35b8 !== undefined) f.x35b8 = ticked.x35b8;
    if (ticked.x35aa !== undefined) f.x35aa = ticked.x35aa;
    if (ticked.ticks !== undefined) f.ticks = ticked.ticks;
    if (ticked.goal !== undefined) f.goal = ticked.goal;
    if (ticked.explore !== undefined) f.x35a8 = ticked.explore;
    if (ticked.marker !== undefined) this.marker = ticked.marker;
    if (ticked.energy !== undefined) this.mind.brains[CATZ_BRAIN.energy] = ticked.energy;
  }

  /** Walking on, what it is steered at: what it walks to, in the box its words give; none where its steering stopped. Creeping, the angle to its prey. */
  private steering(ticked: CatzStateTick): CatzSteer | undefined {
    if (ticked.creepAim !== undefined) {
      return { rotation: ticked.creepAim };
    }

    const words = ticked.steer;

    if (!words || ticked.steerStopped) {
      return undefined;
    }

    const [width, height, share] = words.slice(2, 5);
    return { to: () => this.walkedToAt(), box: { width, height, share } };
  }

  /** Actions pushed: played for as long as each is given to. */
  private push(actions: number[], steer?: CatzSteer) {
    for (const action of actions) {
      const played = this.options.play(action, steer);
      const { ticks, pose } =
        typeof played === 'number' ? { ticks: played, pose: undefined } : played;
      this.pushed.push(action);
      this.left += Math.max(1, ticks);

      if (pose !== undefined) {
        this.fields.x1500 = pose;
        this.posed = true;
      }
    }
  }

  /** Whether its poses are given (by its scripts), or stood in for. */
  private posed = false;

  /** Its fields as a tick of its state reads them. */
  private asTick(): CatzStateTick {
    return {
      energy: this.mind.brains[CATZ_BRAIN.energy],
      count: this.fields.count,
      passed: this.fields.passed,
    };
  }

  /** The world its state reads: its own fields, and an empty pen. */
  private world(enter: boolean): CatzStateWorld {
    const size = this.options.size ?? { width: 137, height: 104 };
    const { x, y } = this.point;
    const none = { left: 0, top: 0, right: 0, bottom: 0 };

    return {
      ...this.fields,
      /* Its pose (`+0x1500`), as its scripts leave it where they are given;
       * else, stalking, crouched (0x14) as its creep leaves it, standing in. */
      x1500: !this.posed && (this.state === 2 || this.state === 3) ? 0x14 : this.fields.x1500,
      global: this.global,
      enter,
      curiosities: this.fields.curiosities ?? [],
      cursor: none,
      kin: none,
      stage: this.options.stage,
      size,
      point: this.point,
      rect: this.rect ?? {
        left: x - Math.trunc(size.width / 2),
        top: y - size.height,
        right: x + Math.trunc(size.width / 2),
        bottom: y,
      },
      /* On the pen's floor, as the cat mostly is (`GetSpriteScreenArea`, 1). */
      area1: true,
      area3: false,
      inShelf: shelved,
      c4: 0,
      goal: this.fields.goal ?? this.point,
      cursorAt: this.cursorAt(),
      /* What it plays with, where it is: the cursor, still. */
      prey: this.fields.x35a4 === 0x17 ? this.cursorAt() : undefined,
      /* Swatting: how the cursor lies to its paw, standing in -- its offset
       * from the cat, its first side, nothing shelved. */
      swat: {
        facing: 0,
        dx: this.cursorAt().x - x,
        dy: this.cursorAt().y - y,
        /* Its paw missing it by how far the cursor is from it, standing in for `GetSwatMissDistance`. */
        miss: Math.trunc(Math.hypot(this.cursorAt().x - x, this.cursorAt().y - y)),
        x3592: 0,
        shelved: false,
        shelfClosed: false,
        x1d0: 0,
        mouseRunning: false,
        side: 0,
        zone: 0,
        x3596: 0,
      },
      preyHeld: false,
      /* The bottle, on the shelf in an empty pen, not held: near it within
       * the cat's width of its point, standing in for
       * `IsCatProximateToBottle`; the teat far from its mouth. */
      bottle: (() => {
        const at = this.shelfAt(0xf);
        return {
          held: false,
          x1da: 0,
          shelved: true,
          at,
          near: Math.hypot(at.x - x, at.y - y) < size.width,
          mouth: 1000,
          reach: 30,
        };
      })(),
      walkedToAt: this.walkedToAt(),
      /* Found where it walks to: within 8 of it, standing in for its box (`PopScript` answering 2). */
      found: (() => {
        if (this.options.found) {
          return this.options.found();
        }

        const at = this.walkedToAt();
        return !!at && Math.hypot(at.x - x, at.y - y) <= (this.options.foundWithin ?? 8);
      })(),
    } as CatzStateWorld;
  }
}

/** The pen's things on the shelf; the cursor, its marker and the rest of the cast never are. */
function shelved(kind: number) {
  return kind < 0x10;
}

/** The state a tick of the cat is in. */
function state(pet: CatzPet) {
  return pet.state;
}
