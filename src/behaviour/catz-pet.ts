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

import { type CatzMind } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { catzGlobalBegin } from './catz-global.ts';
import { catzMomentBegin, type CatzMomentState, catzMomentTick } from './catz-moment.ts';
import { catzBehaviorChange, catzExtremeSituations } from './catz-reflexes.ts';
import {
  type CatzBox,
  catzCuriosities,
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
  play: (action: number) => number;
  random: (n: number) => number;

  /** Its width and height (`+0x33c4`, `+0x33c6`); a cat's, by default. */
  size?: { width: number; height: number };

  /** Where the cursor (kin 0x17) rests, still: by default the stage's lower middle. */
  cursor?: { x: number; y: number };
}

/** What a tick did, for a viewer or a test to follow. */
export interface CatzPetTicked {
  state: number;
  global: number;

  /** The actions pushed this tick, in turn. */
  pushes: number[];
}

/** The global states whose beginning is reimplemented. */
const BEGUN = new Set([6, 8, 9]);

/** How deep entering may go on into entering, before it is cut short (and counted). */
const DEPTH = 8;

export class CatzPet {
  readonly mind: CatzMind;
  state = 0;
  global = 0;

  /** The cat's own fields, as its states read and write them. */
  readonly fields: Partial<CatzStateWorld> & { count: number; passed: number };

  /** Where it is, and where it walks to. */
  point: { x: number; y: number };

  /** The moment, while it has one, and as its readying left it. */
  moment?: CatzMomentState;
  private readied?: NonNullable<CatzStateTick['moment']>;

  /** Ticks left of what it plays, and what it pushed this tick. */
  private left = 0;
  private pushed: number[] = [];
  private x358c = 0;

  /** What stood in for the engine, counted: global states idled instead, states it could not read, and errors. */
  readonly stoodIn = { globals: {} as Record<number, number>, unread: 0, errors: 0, deep: 0 };

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
    this.fields = { count: 0, passed: 0, x1500: 0, mode: 0, x35a4: 0, x35a6: 0, x688: 0 };
    this.beginGlobal(6, 0);
  }

  /** A tick: its reflexes, then its state's own -- its script playing on, or done. */
  tick(): CatzPetTicked {
    this.pushed = [];
    this.reflexes();

    if (this.left > 0) {
      this.left--;
      this.between();
      this.walk();
    } else {
      this.act();
    }

    return { state: this.state, global: this.global, pushes: this.pushed };
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

  /** Where the cursor rests. */
  private cursorAt() {
    const { stage, cursor } = this.options;
    return cursor ?? { x: Math.trunc((stage.left + stage.right) / 2), y: stage.bottom - 20 };
  }

  /** Where what it walks to is (`+0x35a6`): the cursor, its marker (kin 0x16) where it put one, else its goal. */
  private walkedToAt() {
    const kind = this.fields.x35a6;
    return kind === 0x17
      ? this.cursorAt()
      : kind === 0x16 && this.marker
        ? this.marker
        : this.fields.goal;
  }

  /** Its marker (kin 0x16), where walking put it. */
  private marker?: { x: number; y: number };

  /** Walking on: straight toward what it walks to, four a tick -- standing in for its steering. */
  private walk() {
    const goal = this.walkedToAt();

    if (this.state !== 23 || !goal) {
      return;
    }

    const dx = goal.x - this.point.x;
    const dy = goal.y - this.point.y;
    const far = Math.hypot(dx, dy);

    if (far > 4) {
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
          cursorAbout: false,
          minded: false,
          soundPlaying: false,
        },
        this.options.random
      );

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

  /** Its state's tick, entering or not, and what it asks. */
  private run(enter: boolean, depth: number) {
    let ticked: CatzStateTick;

    try {
      ticked = catzStateTick(this.state, this.mind, this.world(enter), this.options.random);
    } catch {
      this.stoodIn.errors++;
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

    if (ticked.pushes?.length) {
      this.push(ticked.pushes);
    } else if (ticked.pushed !== undefined) {
      this.push([ticked.pushed]);
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
      { cursorMoved: false, area3: false, screenSaver: false, sleepy: false },
      this.options.random
    );

    if (begun.mode !== undefined) {
      this.fields.mode = begun.mode;
    }

    if (begun.state !== undefined) {
      this.enter(begun.state, depth + 1);
    }
  }

  /** A state of its own entered (`CatSprite::NewState`): its entering run at once. */
  private enter(state: number, depth: number) {
    if (depth > DEPTH) {
      this.stoodIn.deep++;
      return;
    }

    this.state = state;
    this.mind.state = state;
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
    if (ticked.x35aa !== undefined) f.x35aa = ticked.x35aa;
    if (ticked.ticks !== undefined) f.ticks = ticked.ticks;
    if (ticked.goal !== undefined) f.goal = ticked.goal;
    if (ticked.explore !== undefined) f.x35a8 = ticked.explore;
    if (ticked.marker !== undefined) this.marker = ticked.marker;
    if (ticked.energy !== undefined) this.mind.brains[CATZ_BRAIN.energy] = ticked.energy;
  }

  /** Actions pushed: played for as long as each is given to. */
  private push(actions: number[]) {
    for (const action of actions) {
      this.pushed.push(action);
      this.left += Math.max(1, this.options.play(action));
    }
  }

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
      global: this.global,
      enter,
      curiosities: this.fields.curiosities ?? [],
      cursor: none,
      kin: none,
      stage: this.options.stage,
      size,
      point: this.point,
      rect: {
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
      walkedToAt: this.walkedToAt(),
      /* Found where it walks to: within 8 of it, standing in for its box (`PopScript` answering 2). */
      found: (() => {
        const at = this.walkedToAt();
        return !!at && Math.hypot(at.x - x, at.y - y) <= 8;
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
