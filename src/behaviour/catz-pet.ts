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

import { type CatzMind, catzSound } from './catz-behavior.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { catzGlobalBegin, catzGlobalTick } from './catz-global.ts';
import { catzMomentBegin, type CatzMomentState, catzMomentTick } from './catz-moment.ts';
import {
  catzBehaviorChange,
  catzCursorWiggling,
  catzChildRespond,
  catzExtremeSituations,
  catzKitMessage,
  catzLayering,
  catzMessage,
  catzPurring,
  catzScruff,
  catzShowWords,
  catzKitText,
  type CatzKitText,
  makeCatzKitText,
  catzSeesMouse,
  type CatzWiggle,
} from './catz-reflexes.ts';
import {
  CATZ_BASKETS,
  catzBasketHit,
  type CatzBox,
  type CatzKit,
  catzCuriosities,
  catzFaceForward,
  catzPreMoment,
  type CatzPetting,
  catzPtToPtAngle,
  catzStateBetween,
  catzStateTick,
  catzStrike,
  type CatzStateTick,
  type CatzStateWorld,
} from './catz-states.ts';

/** What the cat is given: its brains and their centres, the stage, how long each action plays, and C's `rand`. */
export interface CatzPetOptions {
  brains: number[];
  centres: number[];
  stage: CatzBox;

  /** The pen's mouse (kin 0x1b), where there is one: its own state (1 in its hole) and its target point. */
  mouse?: () => { state: number; at: { x: number; y: number } } | undefined;

  /** The user's button (`PetParams` `+0xa`, pressed this tick, and `+0xc`, held from before); none without. */
  buttons?: () => { pressed: boolean; held: boolean };

  /** What the user holds (`IsSomethingBeingHeld`, a thing dragged: state 3), by kind; none without. */
  holding?: () => number | undefined;

  /** The hand down (`PetParams` `+0x1e`), to pet it; never without. */
  hand?: () => boolean;

  /** The ball of it under the cursor (`XBallz::HitTest`), as whoever places it says; -1 for none. */
  ballUnder?: () => number;

  /** Its rectangle grown by 10 each way holds the cursor (for `HasUserStoppedPetting`), as whoever places it says. */
  cursorOver?: () => boolean;

  /** How much of its script is left (`GetStackRemaining`), as whoever plays it says. */
  scriptLeft?: () => number;

  /** A layered action pushed (`PushLayeredAction`), and whether one plays (`GetLayeredFramesRemaining`). */
  layer?: (action: number) => void;
  layering?: () => boolean;

  /**
   * The Adoption Kit (`PetParams` `+0xc4`), where the cat lives in it: where
   * the Kit is (`+0xdc`, `+0xde`), from which its baskets lie, and `+0xca`,
   * whether its kittens come out of themselves.
   */
  kit?: {
    origin: { x: number; y: number };
    ca: number;
    /** Which Kit it is (`PetParams` `+0xc6`, `+0xc8`), picking its things' words: 0 by default. */
    edition?: { xc6: number; xc8: number };
    /** `PetParams` `+0xea`, the host's: set (or an age), its baskets' hints show. 0 by default. */
    xea?: number;
  };

  /** The mouse's fear moved by the cat (falling asleep, 50 less: `XBrain::Decrement` of its brain at `+0x25d0`). */
  mouseFear?: (by: number) => void;

  /**
   * A thing's condition set by the cat (`XApt::CatSetCond`): a bowl's, the
   * catnip's or the bottle's, as it eats, nibbles or suckles.
   */
  setCond?: (kind: number, cond: number) => void;

  /**
   * A thing the user held taken from them (`XApt::ForceRelease`, seg2:017a):
   * let go where it is, the user's hand and press none (`PetParams` `+0x1e`,
   * `+0xa`), and the playpen told so (its state 1, `SetState`).
   */
  forceRelease?: (kind: number) => void;

  /** Words for the Kit's text bar (`TextStatusBar`): a string of CATZDLL's (`RT_STRING`); none, cleared. */
  words?: (string: number | undefined) => void;

  /** Put in a basket, the kitten made again as that basket's breed (`SetupNewBasket`): its brains and centres as made. */
  remade?: (basket: number) => { brains: number[]; centres: number[] } | undefined;

  /** A purr played or stopped (`HandlePurring`): its sound. */
  purr?: (sound: number) => void;

  /**
   * CatNapz's dog (kin 0x1a, `DogSprite`), played by its own scripts where
   * whoever shows it has one: where its target point is across, as its
   * frame this tick leaves it (none where it is put away); whether its
   * script is done; an action pushed for it; put with its target point at
   * a point, facing so (`+0x688`), let go and shown; put away (its slot
   * `0x7c`). Without one, a stand-in runs across (`dream.dogX`).
   */
  dog?: {
    at: () => number | undefined;
    done: () => boolean;
    push: (action: number) => void;
    put: (at: { x: number; y: number }, facing: number) => void;
    away: () => void;
  };

  /**
   * CatNapz's cloud (kin 0x10, `CloudSprite`), played by its own scripts
   * where whoever shows it has one: its width and height (`+0x251e`,
   * `+0x2520`); put with its target point at a point (`0x44`) and shown
   * (`0x78`); sent to a point (its words 0x7534, -11, there; 2 pushed) and
   * on (`+0x2518` 1); whether the frame it shows is cued so; its draw point
   * (`GetDrawPt`); moved, its target point at a point; let go and playing 1
   * (the dream's end); put away (`0x7c`); off (`+0x2518` 0). Without one,
   * it is stood in for, come 283 ticks after it is sent, as the engine's
   * own cloud comes (its 284 frames).
   */
  cloud?: {
    size: () => { width: number; height: number };
    put: (at: { x: number; y: number }) => void;
    fly: (to: { x: number; y: number }) => void;
    cued: (cue: number) => boolean;
    drawPoint: () => { x: number; y: number } | undefined;
    moveTo: (at: { x: number; y: number }) => void;
    end: () => void;
    away: () => void;
    off: () => void;
  };

  /** The shelf's draw rectangle (kin 0x22; its definition's, 1000's first line): what it grooms beside and climbs onto. None, an empty one. */
  shelf?: { left: number; top: number; right: number; bottom: number };

  /** Its rotation's fudger's aim rate set (`SetAimRate`), by whoever plays its body. */
  aimRate?: (rate: number) => void;

  /** Put with its target point at a point (its slot `0x44`, as the dog's chase puts it past the stage), by whoever places it. */
  moveTo?: (at: { x: number; y: number }) => void;

  /** Where one of its balls is drawn on the stage, as whoever places it says: ball 2 for the scruff. */
  ballAt?: (ball: number) => { x: number; y: number } | undefined;

  /** Picked up by the scruff, this tick. */
  scruffed?: () => void;

  /** Whether the prey is within its paws' reach (`IsSpriteCaught`), as whoever places it says; never without. */
  inReach?: () => boolean;

  /**
   * The mouse held by the cat: caught; stilled as its victim (its fear 100,
   * `DoCatVictimCaptured` entering); put down, held by the cat to its mind
   * (`+0x26ca` 0x1d, seg19:08b9); thrown, leaving its victim's states
   * unless let go (`StrikeToy`, the throw's motion not modelled); free
   * again (0, as dangling frees it, seg23:4285).
   */
  mouseHeld?: (how: 'caught' | 'stilled' | 'putDown' | 'thrown' | 'free') => void;
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

  /** A state of its own entered (`CatSprite::NewState`), after any drop and before its entering's actions play. */
  entered?: (state: number) => void;

  /** The cues its script gave as this tick's frame was popped (`IsCued`), where whoever plays its scripts knows. */
  cues?: () => number[];

  /** Whether `PopScript` found what it walks to in its box this tick (answering 2), where whoever plays its scripts knows; else `foundWithin` stands in. */
  found?: () => boolean;

  /** Where a thing on the shelf is (its target point), by its kind: standing in, by default, along the stage's top. */
  shelfAt?: (kind: number) => { x: number; y: number };

  /** The things off the shelf in the pen, by kind, and where each is (its target point): none by default. */
  pen?: () => ReadonlyMap<number, { x: number; y: number }>;

  /** Whether the left button was double-clicked (`PetParams` `+0x46`), by the ticks gone: by default never. */
  doubleClicked?: (tick: number) => boolean;

  /**
   * Where its head looks, as its states turn it (`SetHeadTracking`, the
   * cat's slot `0xe0`; `LookAtUser`): tracking a kind of sprite at a speed,
   * its shelf's or not; at the user; or nothing (0), its head's turn and
   * tilt reset. And, leaving a global state, its eyelids reset
   * (`ResetEyelids`, slot `0x1fc`). For whoever plays its scripts.
   */
  head?: (
    look: { kind: number; speed: number; shelved: boolean } | 'user' | 'off' | 'lids'
  ) => void;

  /** A toy it swatted struck (`StrikeToy`): the kind, and the speed it is given. For whoever moves the pen's things. */
  strike?: (strike: { kind: number; v: { x: number; y: number } }) => void;

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
  | { rotation: number }
  /** Its rotation's fudger aimed at a heading first, left aiming after (the mouse's `SetAimTarget`). */
  | { heading: number }
  /** A leap set up before it (`alignBallToPtSetup3`): a ball of the cat's carried to a point. */
  | { leap: { ball: number; x: number; y: number; keep?: number; turn?: number } };

/** What a tick did, for a viewer or a test to follow. */
export interface CatzPetTicked {
  state: number;
  global: number;

  /** The actions pushed this tick, in turn. */
  pushes: number[];
}

/** The global states whose beginning is reimplemented. */
const BEGUN = new Set([1, 2, 3, 4, 6, 21, 7, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22]);

/** The states of its own `catzStateTick` reimplements (as the trace follows them, test/harness/catzpen_test.ts); the rest -- might it jump (14), jumping and crawling about the edges and shelf (15 to 18) -- are idled instead, and counted. */
const REIMPLEMENTED = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
  76, 77, 78, 79, 80, 81,
]);

/** The states whose entering is reimplemented (as the trace holds them); the rest are entered doing nothing until their first tick. */
const ENTERED = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 19, 20, 25, 27, 28, 29, 30, 34, 35, 36, 37, 38, 39,
  40, 41, 43, 47, 56, 57, 65, 66, 67, 68, 69, 70, 71, 53, 62, 15, 16, 17, 18, 22, 24, 26, 31, 32,
  33, 42, 44, 45, 46, 48, 49, 50, 51, 52, 54, 55, 58, 59, 60, 61, 63, 64, 65, 67, 69, 70, 71, 72,
  73, 74, 75, 76, 77, 78, 79, 80, 81,
]);

/** How deep entering may go on into entering, before it is cut short (and counted). The engine has no limit: a state whose tick runs as it is entered may change state at once, and pre-exploring off the stage and idling went nine deep before a walk began. */
const DEPTH = 20;

export class CatzPet {
  readonly mind: CatzMind;
  state = 0;
  global = 0;

  /** The cat's own fields, as its states read and write them. */
  readonly fields: Partial<CatzStateWorld> & {
    count: number;
    passed: number;
    x35ce?: number;
    x35d6?: number;
    /** The corner it last made for (`TargetACornerToAvoidSprite`, 1 to 4), by which its dream's cloud comes. */
    x35ae?: number;
  };

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
    /* In the Adoption Kit, its kitten in the Kit (`SetupCatForAdoption`: basket 0, `+0x33be` 1, global 22). */
    if (options.kit) {
      (this as { kit?: CatzKit }).kit = {
        peekMode: 0,
        peeks: 0,
        wait: 0,
        basket: 0,
        baskets: [0, 0, 0, 0, 0],
        ca: options.kit.ca,
        rootCount: 0,
        mouseState: 1,
        origin: options.kit.origin,
        last: -1,
        out: 0,
      };
      this.x33be = 1;
      this.beginGlobal(22, 0);
    } else {
      this.beginGlobal(6, 0);
    }
  }

  /** How many ticks are left of what it plays: a viewer keeps as many frames, a new state having dropped what was left. */
  get playing() {
    return this.left;
  }

  /**
   * CatNapz's dream as it goes on (`+0x35da` its phase, `+0x35ec` what it
   * dreams of, `+0x35d8`, the float's doubles `+0x35dc`, `+0x35e4`), and
   * what the screen saver's other scripts would do, standing in as the
   * harness's driver does: its own script's cue to dream (6) on the second
   * tick of phase 0, the cloud's that it has come (4) on the 283rd of
   * phase 1, where it has no cloud of its own; the dog and the dream's mouse each set off 200 left of the
   * stage and run across, 10 and 8 a tick.
   */
  readonly dream = {
    phase: 0,
    kind: 0,
    x35d8: 0,
    at: { x: 0, y: 0 },
    inPhase: 0,
    dogX: undefined as number | undefined,
    /** Its cloud's draw point less its own (`+0x35f0`, `+0x35f2`), kept as it begins to float. */
    cloudOffset: { x: 0, y: 0 },
    /** How far the dog's stand-in runs a tick: right as it starts, then the way it is put facing. */
    dogStep: 10,
    mouseX: 0,
    /** The dream sprite (kin 0x13) shown: what it shows (`SetDream`, `+0x35ec`) and where its target point is; none where put away. */
    shown: undefined as { kind: number; at: { x: number; y: number } } | undefined,
  };

  /** A tick of the dream's stand-ins: the ticks in its phase, the dog and the mouse on their way. */
  private dreamOn() {
    const dream = this.dream;
    dream.inPhase++;

    if (this.global !== 21) {
      /* (Leaving CatNapz puts its dog and its cloud away.) */
      if (dream.dogX !== undefined) {
        this.options.dog?.away();
      }

      if (dream.phase !== -1) {
        this.options.cloud?.away();
        dream.phase = -1;
      }

      dream.dogX = undefined;
      dream.shown = undefined;
      return;
    }

    /* Dreaming well, cued (7): the dream sprite put above it by its height, showing what it dreams of, and shown; cued (6), put away (`DoCatGoodDream`, seg18:0a55 on). */
    const cues = this.cues();

    if (this.state === 66 && cues.includes(7)) {
      dream.shown = {
        kind: dream.kind,
        at: { x: this.point.x, y: this.point.y - (this.options.size?.height ?? 104) },
      };
    }

    if (cues.includes(6)) {
      dream.shown = undefined;
    }

    if (dream.dogX !== undefined) {
      dream.dogX += dream.dogStep;
    }

    if (this.state === 68) {
      dream.mouseX += 8;
    }
  }

  /**
   * The dog's part of its chase (71, chasing: `DoCatDogChase`, seg18:18f2),
   * each tick before the cat's own, where it has a dog of its own: the
   * dog's script done and it not yet 100 past the stage on the side the
   * cat ran to, within 200 of the stage's middle across, three times in
   * ten it barks (7), else the cat makes a sound (2, drawn, not played);
   * and it runs on (1).
   */
  private dogChases() {
    const dog = this.options.dog;
    const x = dog?.at();

    if (
      !dog ||
      x === undefined ||
      this.global !== 21 ||
      this.state !== 71 ||
      this.fields.x35ee !== 10
    ) {
      return;
    }

    const { stage, random } = this.options;
    const past = this.fields.x35a8 === 1 ? x > stage.right + 100 : x < stage.left - 100;

    if (!dog.done() || past) {
      return;
    }

    const middle = Math.trunc((stage.right - stage.left) / 2) + stage.left;

    if (Math.abs(x - middle) < 200 && random(101) < 30) {
      dog.push(7);
    } else {
      catzSound(this.mind, 2, random);
    }

    dog.push(1);
  }

  /** The dream's end (69; `DoCatDreamEnd`, seg18:151d), each tick: its cloud cued (0) at the end of what it plays, put away and off. */
  private cloudGoes() {
    const cloud = this.options.cloud;

    if (cloud && this.global === 21 && this.state === 69 && cloud.cued(0)) {
      cloud.away();
      cloud.off();
    }
  }

  /**
   * Its cloud as its dream's phase goes on (`DoCatStartDream`): cued to
   * dream (0 to 1), it is put twice its width and height beyond the corner
   * the cat last made for (`+0x35ae`: 1 top left, 2 top right, 3 bottom
   * left, 4 bottom right; none, the top left's standing in for a point
   * never set), shown, and sent to 25 right of the cat's target point; its
   * 28 ticks counted (2 to 3), how far it is from the cat kept, draw point
   * from draw point.
   */
  private cloudPhase(from: number, to: number) {
    const cloud = this.options.cloud;

    if (!cloud) {
      return;
    }

    if (from === 0 && to === 1) {
      const { stage } = this.options;
      const { width, height } = cloud.size();
      const corner = this.fields.x35ae ?? 0;
      const right = corner === 2 || corner === 4;
      const below = corner === 3 || corner === 4;
      cloud.put({
        x: right ? stage.right + width * 2 : stage.left - width * 2,
        y: below ? stage.bottom + height * 2 : stage.top - height * 2,
      });
      cloud.fly({ x: this.point.x + 25, y: this.point.y });
    }

    if (from === 2 && to === 3) {
      const cloudAt = cloud.drawPoint();
      const rect = this.rect;

      if (cloudAt && rect) {
        this.dream.cloudOffset = { x: cloudAt.x - rect.left, y: cloudAt.y - rect.top };
      }
    }
  }

  /** The dream's world, for its states (`catzDream`, `catzDogChase`). */
  private dreamWorld() {
    const dream = this.dream;
    return {
      phase: dream.phase,
      kind: dream.kind,
      x35d8: dream.x35d8,
      cloudCome:
        this.state === 65 &&
        dream.phase === 1 &&
        (this.options.cloud ? this.options.cloud.cued(4) : dream.inPhase >= 283),
      at: dream.at,
      stage: this.options.stage,
      mouseX: dream.mouseX,
      dogX: dream.dogX === undefined ? undefined : (this.options.dog?.at() ?? dream.dogX),
    };
  }

  /** Where the cursor was the tick before (`PetParams` `+0x86`, `+0x88`), for how it moved as it let the cat go. */
  private cursorWas?: { x: number; y: number };

  /** A tick: its reflexes, then its state's own -- its script playing on, or done. */
  tick(): CatzPetTicked {
    const ticked = this.tickOn();
    this.cursorWas = this.cursorAt();
    return ticked;
  }

  private tickOn(): CatzPetTicked {
    this.ticks++;
    this.pushed = [];
    this.dreamOn();
    this.reflexes();

    /* Its global state's handler, before its own state's. */
    if (this.globalTick()) {
      return { state: this.state, global: this.global, pushes: this.pushed };
    }

    this.dogChases();
    this.cloudGoes();

    if (this.left > 0) {
      this.left--;
      this.between();
      this.walk();

      /* Looking at things counts down to its next look, and looks, every
       * tick, its idle action playing on (the trace's `+0x3504`). */
      if (this.state === 12) {
        this.run(false, 0, true);
      }

      /* Swatting, cued to strike (cue 5) as its frame was popped: the
       * strike, as the handler does it then (`DoCatSwatting`, seg29:0cee),
       * its script played on but where the strike asks for another state. */
      if (this.state === 0x38 && this.cues().includes(5)) {
        this.strikes();
      }

      /* Being petted, mid-script: its fidgeting and where the cursor was, every tick (`DoCatPetting`). */
      if (this.state === 50) {
        this.take(
          catzStateTick(50, this.mind, { ...this.world(false), done: false }, this.options.random)
        );
      }

      /* Peeking from its basket or climbing out, mid-script: a double-click, it climbs out; cued, it has been in its basket (seg13). */
      if (this.kit && (this.state === 74 || this.state === 76)) {
        const ticked = catzStateTick(
          this.state,
          this.mind,
          { ...this.world(false), cues: this.cues(), done: false },
          this.options.random
        );
        this.take(ticked);

        if (ticked.state !== undefined || ticked.global !== undefined) {
          this.change(ticked.global, ticked.state, 0);
        }
      }

      /* Eating from a bowl, nibbling catnip or tripping, mid-script: what they are cued to (`DoCatEatFromBowl`, `DoCatNibbleCatnip`, `DoCatTripAndSkid` ask every tick); the catnip moved or held, after it again. */
      /* Napping, its bad dream cued (7): the breed it dreams of, at random (`LoadRandomLinezFile`, seg18:1e1e: one time in two `rand() % 6`, else `rand() % 9`, into `+0x35ee`). */
      if (this.state === 67 && this.cues().includes(7)) {
        this.fields.x35ee =
          this.options.random(101) < 50 ? this.options.random(6) : this.options.random(9);
      }

      if (
        this.state === 18 ||
        this.state === 40 ||
        this.state === 43 ||
        this.state === 25 ||
        this.state === 65 ||
        this.state === 68
      ) {
        const ticked = catzStateTick(
          this.state,
          this.mind,
          { ...this.world(false), cues: this.cues(), done: false },
          this.options.random
        );
        this.take(ticked);

        if (ticked.state !== undefined || ticked.global !== undefined) {
          this.change(ticked.global, ticked.state, 0);
        }
      }

      /* Dangling, let go mid-script: it falls (`DoDangling` asks every tick). */
      if (this.state === 33) {
        const ticked = catzStateTick(
          33,
          this.mind,
          { ...this.world(false), done: false },
          this.options.random
        );

        if (ticked.state !== undefined || ticked.global !== undefined) {
          this.take(ticked);
          this.change(ticked.global, ticked.state, 0);
        }
      }

      /* Pouncing or diving, cued to catch (cue 2) mid-script: the catch, as
       * the handler checks it each tick (`DoCatPouncing`, seg14:0f70). */
      if ((this.state === 3 || this.state === 4) && this.cues().includes(2)) {
        const ticked = catzStateTick(
          this.state,
          this.mind,
          { ...this.world(false), cues: this.cues(), done: false },
          this.options.random
        );

        if (ticked.caught) {
          this.take({ caught: true });
        }
      }
    } else {
      this.act();
    }

    return { state: this.state, global: this.global, pushes: this.pushed };
  }

  /**
   * A tick of its global state (`catzGlobalTick`): a double-click, most
   * ready its moment and have it; attacking after the mouse may run to the
   * catnip. Whether it went on to another state, so this tick is done.
   */
  private globalTick() {
    const ticked = catzGlobalTick(
      this.global,
      this.mind,
      {
        doubleClicked: this.options.doubleClicked?.(this.ticks) ?? false,
        cursorMoved: false,
        area3: this.screenArea(0x1d) === 3,
        area1: this.screenArea(0x1d) === 1,
        screenSaver: false,
        sleepy: false,
        x35a4: this.fields.x35a4 ?? 0,
        x35a6: this.fields.x35a6 ?? 0,
        /* `+0x34ca`: in its moment, whether it minds the cursor; else passing the time's. */
        x34ca: this.state === 21 ? Number(this.minded) : this.fields.passed,
        /* The mouse in its hole in an empty pen. */
        mouseState: this.options.mouse?.()?.state ?? 0,
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

  /** Where the mouse is: the live one's point, else standing in, in its hole at the floor's lower left (as the viewer has it, 206, 403 of 640 by 480). */
  private mouseAt() {
    const { stage } = this.options;
    return (
      this.options.mouse?.()?.at ?? {
        x: stage.left + Math.trunc(((stage.right - stage.left) * 206) / 640),
        y: stage.top + Math.trunc(((stage.bottom - stage.top) * 403) / 480),
      }
    );
  }

  /** Whether its prey is within its paws' reach now, as whoever places it says. */
  inReachNow() {
    return this.options.inReach?.() ?? false;
  }

  /** Where the cursor went, kept for wiggling (`+0x34d2` on); and whether, at its last look, it went one way throughout (`+0x33b8`, which the mouse reads). */
  private readonly wiggle: CatzWiggle = { index: 0, last: { x: 0, y: 0 }, ways: [], still: 0 };
  get x33b8() {
    return this.wiggle.still;
  }

  /**
   * Its petting (`+0x351c` on): its rate, its own sound (`+0x3570`), the
   * sound wanted (`+0x3572`), `+0x3576`, where the cursor was, the cursor's
   * action, the mode it came to may-end with, and its 40 modes; and
   * `+0x3574`, not to be petted again (after petting resting).
   */
  readonly petting: Omit<CatzPetting, 'ball'> = {
    rate: 2,
    x3570: -1,
    x3572: 0,
    x3576: 0,
    x362a: -1,
    x356c: 0,
    cursorWas: { x: -1, y: -1 },
    modes: Array(40).fill(0),
  };
  x3574 = 0;

  /**
   * In the Adoption Kit: its fields (`CatzKit`: its peek's mode, peeks, wait,
   * basket, the baskets been in, the last it was in, whether it is out);
   * how the Kit's entering takes it (`+0x33be`: 1 beginning, 2 back to its
   * basket, 3 jumping in, 4 dropping in); and on its way to its basket
   * (`+0x35fc`).
   */
  readonly kit?: CatzKit;
  x33be = 1;
  x35fc = 0;

  /** Its basket's place (`GetBasketLocation`): the basket's from the Kit's origin. */
  basketAt(basket: number) {
    const origin = this.options.kit?.origin ?? { x: 0, y: 0 };
    const place = CATZ_BASKETS[basket] ?? CATZ_BASKETS[0];
    return { x: place.x + origin.x, y: place.y + origin.y };
  }

  /** Swatting's fields (`+0x358e` its side, `+0x3590`, `+0x3592`, `+0x3594` its last zone, `+0x3596`), as its entering, its swats and its strikes write them. */
  private readonly swatFields = { side: 0, x3590: 0, x3592: 0, zone: 0, x3596: 0 };

  /** The Kit's highlight (kin 0x19, `baskhi.apt`): the basket it is shown over, -1 hidden. */
  kitHighlight = -1;

  /** The Kit's text bar: its hint, advert and counts (`catzKitText`). */
  readonly kitText: CatzKitText = makeCatzKitText();

  /** A thing's condition set (`XApt::CatSetCond`, seg2:02ce): held by the user, taken from them first (`ForceRelease`, its slot `0x28`). */
  private catSetCond(kind: number, cond: number) {
    if (this.options.holding?.() === kind) {
      this.options.forceRelease?.(kind);
    }

    this.options.setCond?.(kind, cond);
  }

  /** Words to the Kit's text bar (`TextStatusBar`): a tip only once enough ticks have passed. */
  private say(string: number) {
    const shown = catzShowWords(this.kitText, string);

    if (shown !== undefined) {
      this.options.words?.(shown);
    }
  }

  /** Climbing out or on its way back (`IsBasketExitOrReturn`, seg13:16be, its slot `0x118`): `+0x35fc` or `+0x35fa`. */
  exitOrReturn() {
    return !!(this.x35fc || this.kit?.out);
  }

  /**
   * The Kit's baskets pressed (`XApt::BasketHitTest`, seg6:30ca, run each
   * frame by the playpen's root where none of its sprites took the mouse).
   * The button down (`PetParams` `+0x1e`) and its press (`m_ptDown`) in
   * basket n: the basket held (the root's `+0x1e0`, 0xb + n), the highlight
   * shown over it where it is not the cat's own (`+0x35f6`), else the cat's
   * lit (`SetCond` 2). The button up with a basket held: let go (`m_ptUp`) in
   * that basket, none held, and its command (`DoCommand` 0x821 + n, which
   * leaves message 0x16 + n) or, climbing out or on its way back, message
   * 0x2a (its words, "wait for the kitten"); the highlight hidden but in the
   * Kit (global 22) neither. Let go elsewhere, none held and it hidden.
   * Whether it lit the cat's basket.
   */
  basketHitTest(button: {
    down: boolean;
    downAt: { x: number; y: number };
    upAt: { x: number; y: number };
  }) {
    const kit = this.kit;

    if (!kit) {
      return false;
    }

    if (button.down) {
      const n = catzBasketHit(button.downAt, kit.origin ?? { x: 0, y: 0 });

      if (n < 0) {
        return false;
      }

      kit.rootCount = 0xb + n;

      if (kit.basket !== n) {
        this.kitHighlight = n;
        return false;
      }

      return true;
    }

    if (kit.rootCount < 0xb) {
      return false;
    }

    const n = catzBasketHit(button.upAt, kit.origin ?? { x: 0, y: 0 });

    if (n < 0 || kit.rootCount !== 0xb + n) {
      kit.rootCount = 0;
      this.kitHighlight = -1;
      return false;
    }

    kit.rootCount = 0;
    const back = this.exitOrReturn();
    this.x33c0 = back ? 0x2a : 0x16 + n;

    if (this.global !== 22 || back) {
      this.kitHighlight = -1;
    }

    return false;
  }

  /** Ticks to its next layering (`+0x358a`). */
  private x358a = 0;

  /** The ball petted, as `WhichBallBeingPet` answers: under the hand, 0 to 0x40. */
  private ballPetted() {
    const ball = this.options.hand?.() ? (this.options.ballUnder?.() ?? -1) : -1;
    return ball >= 0 && ball < 0x41 ? ball : -1;
  }

  /** Its petting as its states read it this tick: the ball petted, whether the user stopped, how far the cursor moved. */
  private pettingNow(): CatzPetting {
    const cursor = this.cursorAt();
    const was = this.petting.cursorWas;
    const movement = was.x === -1 ? 1 : Math.trunc(Math.hypot(cursor.x - was.x, cursor.y - was.y));
    const stopped = !(
      movement !== 0 &&
      (this.options.cursorOver?.() ?? false) &&
      this.options.hand?.()
    );
    return {
      ...this.petting,
      ball: this.ballPetted(),
      stopped,
      movement,
      pose: this.fields.x1500,
      left: this.options.scriptLeft?.(),
      cursor,
    };
  }

  /** The message the playpen left it (`+0x33c0`), 0 none. */
  x33c0 = 0;

  /**
   * The playpen telling it of a thing of the pen (`XApt::ParentNotify`):
   * its kind, its condition (0 on the shelf, 1 in the pen), its state (1 let
   * go, 3 dragged, 4 pressed) and whether the user just took it off the
   * shelf -- its message left as `ChildRespond` leaves it, the last left
   * the one read.
   */
  notify(kind: number, cond: number, state: number, flag: boolean) {
    const message = catzChildRespond(kind, cond, state, flag, !!this.kit);

    if (message !== undefined) {
      this.x33c0 = message;
    }
  }

  /** Put to nap, as CatNapz, the screen saver, puts it (global 21, `DoGSCatNapz`). */
  nap() {
    this.beginGlobal(21, 0);
  }

  /** A message the playpen's commands leave it (`XApt::DoCommand`): 19 its window resized (0x7f1), 21 the camera (0x7f2). */
  leave(message: number) {
    this.x33c0 = message;
  }

  /** A message read (`HandleCatAptMessages`): what it asks of it. */
  private messaged() {
    const message = this.x33c0;
    this.x33c0 = 0;

    if (!message) {
      return false;
    }

    const f = this.fields;

    const answer = this.kit ? catzKitMessage : catzMessage;
    const done = answer(
      this.mind,
      message,
      {
        x35a4: f.x35a4 ?? 0,
        x35a6: f.x35a6 ?? 0,
        x35d6: f.x35d6 ?? 0,
        x35b2: this.x35b2,
        area: this.screenArea(0x1d),
        mouseState: this.options.mouse?.()?.state ?? 1,
        treatShelved: this.isShelved(0xb),
        rect: this.rect,
        spray: this.thingAt(2),
        flea: this.thingAt(3),
        x35f6: this.kit?.basket,
        x35fc: this.x35fc,
        ...(this.kit
          ? {
              shelved: Array.from({ length: 16 }, (_, kind) => this.isShelved(kind)),
              x361e: 0,
              stage: this.options.stage,
              x35fa: this.kit.out ?? 0,
              x35f8: this.kit.last ?? -1,
              edition: this.options.kit?.edition,
            }
          : {}),
      },
      this.options.random
    );

    if (!done) {
      return false;
    }

    if (done.words !== undefined) {
      this.say(done.words);
    }

    if (done.x35a4 !== undefined) {
      f.x35a4 = done.x35a4;
    }

    if (done.x35d6 !== undefined) {
      f.x35d6 = done.x35d6;
    }

    if (done.x35d2 !== undefined) {
      f.x35d2 = done.x35d2;
    }

    if (done.x35d4 !== undefined) {
      f.x35d4 = done.x35d4;
    }

    if (done.ignored) {
      this.x35b2 = done.ignored.kin;
      f.x35b0 = done.ignored.kin;

      if (done.ignored.x35b4 !== undefined) {
        f.x35b4 = done.ignored.x35b4;
      }
    }

    if (done.head) {
      this.options.head?.({ kind: f.x35a4 ?? 0, speed: 3000, shelved: false });
    }

    if (done.pushes?.length) {
      this.push(done.pushes);
    }

    /* In its baskets, another basket clicked: that its basket, to be made as its breed and come out of it. */
    if (this.kit && done.state === 75 && message >= 0x16 && message <= 0x1a) {
      this.kit.basket = message - 0x16;
    }

    /* Its own basket clicked: back to it (`MakeCatReturnToBasket`: `+0x33be` 2, `+0x35fc` 1, the Kit). */
    if (done.global === 22 && message >= 0x16 && message <= 0x1a) {
      this.x33be = 2;
      this.x35fc = 1;
    }

    if (done.global !== undefined || done.state !== undefined) {
      this.change(done.global, done.state, 0);
      return true;
    }

    return false;
  }

  /**
   * Where a kind of sprite's target point lies (`GetSpriteScreenArea`,
   * seg24:1e2d): 1 within the stage less half the cat's width and height
   * each side, 2 within the stage, 3 off it; 3 where it is nowhere.
   */
  screenArea(kind: number) {
    const at = kind === 0x1d ? this.point : this.kinAt(kind);

    if (!at) {
      return 3;
    }

    const { stage } = this.options;
    const size = this.options.size ?? { width: 137, height: 104 };
    const [w, h] = [Math.trunc(size.width / 2), Math.trunc(size.height / 2)];
    const within = (left: number, top: number, right: number, bottom: number) =>
      at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;

    if (within(stage.left + w, stage.top + h, stage.right - w, stage.bottom - h)) {
      return 1;
    }

    return within(stage.left, stage.top, stage.right, stage.bottom) ? 2 : 3;
  }

  /** What it ignored last (`+0x35b2`). */
  private x35b2 = 0;

  /** Whether it has reacted to the mouse since its global state last changed (`+0x33bc`). */
  x33bc = 0;

  /**
   * Its reflexes, as `CatSprite::Update` runs them: seeing the mouse
   * (`catzSeesMouse`) -- dangling, its head turned to it; else reacting, the
   * mouse what it plays with (`+0x35a4` 0x1b), a global state begun, and
   * `+0x33bc` 1 after (the global machine's `NewState` clears it) -- and
   * then extreme situations: its behaviour changed by its diet every 281
   * ticks.
   */
  private reflexes() {
    /* The playpen's messages first (`HandleCatAptMessages`); then, in the Kit, its text (`HandleKitContextSensitiveText`). */
    const changed = this.messaged();

    if (this.kit) {
      const words = catzKitText(this.kitText, {
        state: this.state,
        global: this.global,
        basket: this.kit.basket,
        age: this.mind.brains[CATZ_BRAIN.age],
        xca: this.kit.ca,
        xea: this.options.kit?.xea ?? 0,
        edition: this.options.kit?.edition,
      });

      if (words !== undefined) {
        this.options.words?.(words);
      }
    }

    if (changed) {
      return;
    }

    /* In its baskets (73), no more (`CatSprite::Update`, seg16:26b5). */
    if (this.state === 73) {
      return;
    }

    /* Picked up by the scruff (`catzScruff`): the button pressed, not held, within 100 of its ball 2. */
    const buttons = this.options.buttons?.();

    if (buttons && this.state !== 33) {
      const none = { left: 0, top: 0, right: 0, bottom: 0 };
      const scruff = catzScruff(this.mind, {
        left: buttons.pressed,
        right: buttons.held,
        holding: this.options.holding?.() !== undefined,
        ball: this.options.ballAt?.(2) ?? this.point,
        cursor: this.cursorAt(),
        point: this.point,
        x9e: 0,
        hidden: none,
        x35fc: this.x35fc,
        x35fa: this.kit?.out ?? 0,
        x35f6: this.kit?.basket ?? -1,
        x35f8: this.kit?.last ?? 0,
      });

      /* In the Kit, its basket kept (`+0x35f8` where none) and marked been in; out of it from 73 to 76, its breed's words (`GiveBreedDescriptions`, its slot `0x3d8`). */
      if (scruff.dangles && this.kit && scruff.x35f6 !== undefined) {
        this.kit.basket = scruff.x35f6;
        this.kit.baskets[scruff.x35f6] = 1;
        this.kitText.x35fe = 0;

        if (scruff.outOfBasket) {
          this.say(0x233d + scruff.x35f6);
        }
      }

      if (scruff.dangles) {
        this.options.scruffed?.();
        this.change(undefined, 33, 0);
        return;
      }
    }

    /* Peeking, ending a peek, climbing out, jumping or dropping in (74 to 78), or on its way to its basket (`+0x35fc`): no more (seg16:26d9 on). */
    if ((this.state >= 74 && this.state <= 78) || this.x35fc) {
      return;
    }

    const mouse = this.options.mouse?.();

    if (mouse) {
      const seen = catzSeesMouse(
        this.mind,
        {
          state: mouse.state,
          at: mouse.at,
          point: this.point,
          stage: this.options.stage,
          x33bc: this.x33bc,
        },
        this.options.random
      );

      if (seen.head) {
        this.options.head?.({ kind: 0x1b, speed: 3000, shelved: false });
      }

      if (seen.global !== undefined) {
        this.fields.x35a4 = 0x1b;

        if (seen.x35b6 !== undefined) {
          this.fields.x35b6 = seen.x35b6;
        }

        this.beginGlobal(seen.global, 0);
        this.x33bc = 1;
      }
    }

    /* The cursor wiggled (`catzCursorWiggling`): scared of it, playing with it or attacking it, or its moment, watching it. */
    const wiggled = catzCursorWiggling(
      this.mind,
      this.wiggle,
      this.cursorAt(),
      this.fields.x35a4 ?? 0,
      0x17,
      this.options.random
    );

    if (wiggled.global !== undefined) {
      if (wiggled.moment) {
        this.readied = catzPreMoment(this.mind, false, 6, 0x93, true, this.options.random);
        this.options.head?.({ kind: 0x17, speed: 3000, shelved: false });
      } else {
        this.fields.x35a4 = wiggled.x35a4;
      }

      this.beginGlobal(wiggled.global, 0);
      return;
    }

    /* Petted (`HandlePetting`, seg23:0000): not petted already nor resting
     * after it (`+0x3574`), the hand on one of its balls, on the floor,
     * nothing held but the hairbrush (0xa): its behaviour changed (1, `DoCatBehaviorChange`), it
     * lets go, and is petted (7), `+0x3576` whether it was resting. */
    const held = this.options.holding?.();

    if (
      this.global !== 7 &&
      this.x3574 === 0 &&
      this.ballPetted() !== -1 &&
      (held === undefined || held === 0xa)
    ) {
      catzBehaviorChange(this.mind, 1, [0, 0, 0, 0]);
      this.petting.x3576 = this.global === 9 ? 1 : 0;
      this.beginGlobal(7, 0);
      return;
    }

    /* Purring (`catzPurring`), as asked. */
    const purred = catzPurring(this.petting.x3570, this.petting.x3572);
    this.petting.x3570 = purred.x3570;
    this.petting.x3572 = purred.x3572;

    if (purred.sound !== undefined) {
      this.options.purr?.(purred.sound);
    }

    /* Its purr begun (0xe6) is played by `XPlayStereoSound` (seg23:36a2), which draws its loudness (seg10:0d5d). */
    if (purred.sound === 0xe6) {
      this.options.random(1);
    }

    const done = catzExtremeSituations(this.mind, this.x358c, false, this.options.random);
    this.x358c = done.x358c;

    if (done.x3574 !== undefined) {
      this.x3574 = done.x3574;
    }

    /* Layering (`catzLayering`), last of its reflexes: every so long, a layered action where none plays. */
    const layered = catzLayering(
      this.mind,
      this.x358a,
      this.options.layering?.() ?? false,
      this.options.random
    );
    this.x358a = layered.x358a;

    if (layered.layer !== undefined) {
      this.options.layer?.(layered.layer);
    }

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

  /** The cues its script gave as this tick's frame was popped (`IsCued`): as whoever plays its scripts says; none without. */
  private cues() {
    return this.options.cues?.() ?? [];
  }

  /** A swat's strike mid-script (`catzStrike`): the toy struck, and any state it asks for. */
  private strikes() {
    const world = { ...this.world(false), cued: true, cues: this.cues() };
    const struck = catzStrike(this.mind, world, this.options.random);

    if ('tick' in struck) {
      this.take(struck.tick);
      this.change(struck.tick.global, struck.tick.state, 0);
      return;
    }

    if (struck.fields) {
      Object.assign(this.swatFields, struck.fields);
    }

    if (struck.strike) {
      /* Struck, and swinging on after all: the toy given its speed all the same. */
      this.options.strike?.(struck.strike);
    }
  }

  /** Where a kind of sprite is (its target point), for its head to track: the cursor, its marker, or one of the pen's things, on the shelf or off; none else. */
  kinAt(kind: number) {
    return kind === 0x1b
      ? this.mouseAt()
      : kind === 0x17
        ? this.cursorAt()
        : kind === 0x16
          ? this.marker
          : kind > 0 && kind < 0x10
            ? this.thingAt(kind)
            : undefined;
  }

  /** Where what it plays with (`+0x35a4`) is: the cursor, or one of the pen's things, in the pen or on the shelf. */
  private preyAt() {
    const kind = this.fields.x35a4 ?? 0;
    return kind === 0x1b
      ? this.mouseAt()
      : kind === 0x17
        ? this.cursorAt()
        : kind > 0 && kind < 0x10
          ? this.thingAt(kind)
          : undefined;
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
    return kind === 0x1b
      ? this.mouseAt()
      : kind === 0x17
        ? this.cursorAt()
        : kind === 0x16 && this.marker
          ? this.marker
          : kind > 0 && kind < 0x10
            ? this.thingAt(kind)
            : this.fields.goal;
  }

  /** Whether a kind of the pen's things is on the shelf (`isSpriteInShelf`): the cursor, its marker and the rest of the cast never are; the others but those put in the pen. */
  private readonly isShelved = (kind: number) => kind < 0x10 && !this.options.pen?.().has(kind);

  /** Where one of the pen's things is: in the pen where it was put, else on the shelf. */
  private thingAt(kind: number) {
    return this.options.pen?.().get(kind) ?? this.shelfAt(kind);
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
          c4: this.kit ? 1 : 0,
          x35d2: 0,
          x3516: this.readied?.after ?? 0,
          area3: this.screenArea(0x1d) === 3,
          doubleClicked: this.options.doubleClicked?.(this.ticks) ?? false,
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
      this.stoodIn.firstError ??= `${this.state}: ${String(error)} (+0x35a4 ${this.fields.x35a4}, +0x35a6 ${this.fields.x35a6}, global ${this.global})`;
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
      this.push(ticked.pushes, this.steering(ticked), ticked.leap?.before);
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

    /* The Kit: entering, its peeks none; leaving, no longer out (`+0x35fa`). */
    if (this.kit) {
      if (global === 22) {
        this.kit.peeks = 0;
      } else if (this.global === 22) {
        this.kit.out = 0;
      }
    }

    if (!BEGUN.has(global)) {
      this.stoodIn.globals[global] = (this.stoodIn.globals[global] ?? 0) + 1;
      global = 6;
    }

    /* A new global state: it may see the mouse again (`GlobalCatStateMachine::NewState`). */
    this.x33bc = 0;

    /* Petted (`DoGSPetting`): no sound of its own, its modes cleared. Affectionate (`DoGSAffectionate`): no sound of its own. */
    if (global === 7) {
      this.petting.x3570 = -1;
      this.petting.modes = Array(40).fill(0);
    } else if (global === 14) {
      this.petting.x3570 = -1;
    }

    /* Leaving having its victim (2): the mouse free (`DoGSHasVictim`, seg33:1527). */
    if (this.global === 2 && global !== 2) {
      this.options.mouseHeld?.('free');
    }

    /* The global state left: most reset its eyelids and turn its head's tracking off. */
    this.options.head?.('lids');
    this.options.head?.('off');
    this.global = global;
    this.mind.global = global;
    const begun = catzGlobalBegin(
      global,
      this.mind,
      {
        cursorMoved: false,
        area3: this.screenArea(0x1d) === 3,
        screenSaver: false,
        sleepy: false,
        inShelf: this.isShelved,
        x35ce: this.fields.x35ce ?? 0,
        x35d2: this.fields.x35d2 ?? 0,
        x35a4: this.fields.x35a4 ?? 0,
        stage: this.options.stage,
        size: this.options.size ?? { width: 137, height: 104 },
        preyAt: this.fields.x35a4 === 0x17 ? this.cursorAt() : this.walkedToAt(),
        point: this.point,
        shelf: this.options.shelf,
        c4: !!this.kit,
        /* The mouse in its hole in an empty pen, after nothing. */
        mouseAfterCursor: false,
        kit: this.kit ? { x33be: this.x33be, basket: this.basketAt(this.kit.basket) } : undefined,
      },
      this.options.random
    );

    /* The Kit entered (`DoGSAdoptionKit`, seg13:0033 on): beginning it, its text's hint, advert and counts none; jumping or dropping in, its hint and count. */
    if (global === 22 && this.kit && this.x33be !== 2) {
      this.kitText.x35fe = 0;
      this.kitText.x360a = 0x2380;

      if (this.x33be === 1) {
        this.kitText.x3602 = 0;
        this.kitText.x360c = 0x2380;
      }
    }

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

    if (begun.x35a6 !== undefined) {
      this.fields.x35a6 = begun.x35a6;
    }

    /* CatNapz: `+0x35ee` none, and its energy at 20. */
    if (begun.x35ee !== undefined) {
      this.fields.x35ee = begun.x35ee;
    }

    if (begun.energy !== undefined) {
      this.mind.brains[CATZ_BRAIN.energy] = begun.energy;
    }

    /* Attacking: walking to a point, the corner it made for. */
    if (begun.x35a8 !== undefined) {
      this.fields.x35a8 = begun.x35a8;
    }

    if (begun.x35ae !== undefined) {
      this.fields.x35ae = begun.x35ae;
    }

    if (begun.x35a2 !== undefined) {
      this.fields.x35a2 = begun.x35a2;
    }

    if (begun.goal) {
      this.fields.goal = begun.goal;
    }

    /* Its sound made, beginning (`MapAndPlayCatSound`), as a layered action. */
    if (begun.sound !== undefined && begun.sound > 0) {
      this.options.layer?.(begun.sound);
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

    /* Leaving its victim's states (5, 6) holding it, not let go: it throws it (`StrikeToy`). */
    if (
      (this.state === 5 || this.state === 6) &&
      state !== 5 &&
      state !== 6 &&
      this.fields.caught
    ) {
      this.options.mouseHeld?.('thrown');
    }

    /* Into its baskets from jumping or dropping in, its text cleared (`SetText` of kin 0x11, seg13:0e5c and 101a). */
    if (state === 73 && (this.state === 77 || this.state === 78) && this.kit) {
      this.options.words?.(undefined);
    }

    this.state = state;
    this.mind.state = state;

    /* In the baskets, no longer on its way to one (`DoCatInBaskets`). */
    if (state === 73) {
      this.x35fc = 0;
    }

    /* The highlight hidden: a basket picked, held or not (`PickANewBasket`, or `DoCatInBaskets` with one), or the cat's own chosen (76). */
    /* Suckling the bottle in the pen, it shown so (1; `DoSucklingSelf`, seg33:0461), held or not. (Eating from a bowl, its own entering shows it so.) */
    if (state === 45 && !this.isShelved(0xf)) {
      this.catSetCond(0xf, 1);
    }

    /* Climbing out (`DoCatExitBasket`): its breed's words (`GiveBreedDescriptions`, 0x233d on by its basket), its hint's count 0. */
    if (state === 76 && this.kit) {
      this.kitText.x35fe = 0;
      this.say(0x233d + this.kit.basket);
    }

    if (state === 73 || state === 76) {
      this.kitHighlight = -1;
    }

    /* Its victim, the mouse, stilled (its fear 100) as it is held; the
     * catch forgotten once it is past pouncing and its victim; and, the cat
     * itself picked up (0x21, 0x22), the mouse free. */
    if ((state === 5 || state === 6) && this.fields.x35a4 === 0x1b && this.fields.caught) {
      this.options.mouseHeld?.('stilled');
    } else if (state !== 3 && state !== 4 && state !== 5 && state !== 6) {
      this.fields.caught = false;
    }

    if (state === 0x21 || state === 0x22) {
      this.options.mouseHeld?.('free');
    }

    if (this.left > 0) {
      this.options.dropped?.();
    }

    this.left = 0;
    this.options.entered?.(state);

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

      /* Turned to face the user, where it faces more than 96 from them (`MakeCatFaceForwardIfNeeded`). */
      const turns = catzFaceForward(this.mind, this.world(false));

      if (turns) {
        this.push(turns);
      }

      this.act(depth);
      /* Its first script only now begun: not minding the cursor yet. */
      this.minded = this.state === 21 ? false : this.minded;
      return;
    }

    this.moment = undefined;

    /* Looking at things: what it is curious about, filled as it is entered
     * (`GetCuriosities`), its looks and ticks to its next none. */
    if (state === 12) {
      this.fields.curiosities = catzCuriosities(this.mind, this.isShelved, this.options.random);
      this.fields.count = 0;
      this.fields.ticks = 0;
    }

    /* Its victim captured or wrestled (`DoCatVictimCaptured`, seg19:06bd; `DoCatVictimWrestle`, 0ac6), entering: had by its ball 0x42, its eyelids reset, nothing done yet (`+0x34ca` 0; `+0x35be` 0 too, captured), the mouse's fear 100 (stilled, above) and its prey kept (`+0x35c0`); then on into their ticks. Carrying it (7) and after snagging (10) enter doing nothing; snagging (9) pushes its words and has what it snags. */
    if (state === 5 || state === 6) {
      this.fields.passed = 0;
    }

    /* A good dream (`DoCatGoodDream`, seg18:091b), entering: `+0x34ca` 0 and a sound (0x89, drawing nothing); then on into its tick. The suckle attempt (47; `DoSuckleAttempt`, seg33:026c) does nothing at all. */
    if (state === 66) {
      this.fields.passed = 0;
    }

    /* Napping: starting a dream, its phase 0 begun; the dog's chase begun, the dog set off 200 left of the stage; the dream's mouse, so. */
    if (state === 65) {
      this.dream.phase = 0;
      this.dream.inPhase = 0;
    } else if (state === 69) {
      /* The dream's end, entering: its cloud let go, playing 1. */
      this.options.cloud?.end();
    } else if (state === 70) {
      const { stage } = this.options;
      this.dream.dogX = stage.left - 200;
      this.dream.dogStep = 10;
      this.options.dog?.put(
        { x: stage.left - 200, y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top },
        -0x40
      );
    } else if (state === 71 && this.fields.x35ee !== 10) {
      /* The chase over, entering it: its dog put away (and 0x2a3, its own). */
      this.options.dog?.away();
    } else if (state === 68) {
      this.dream.mouseX = this.options.stage.left - 200;
    }

    /* Begging (`DoCatBegging`, seg22:0697), waiting for a treat (`DoCatWaitForTreat`, 0a67) and nibbling it (`DoCatNibbleTreat`, 108c), entering: `+0x34ca` 0 for the first two, `+0x3504` 0 and its count 0 for the last two (`+0x3504` the second only), its head on what it plays with (2500 begging, else 3000); then on into their ticks, nothing pushed. */
    if (state === 35 || state === 36 || state === 37) {
      const f = this.fields;

      if (state !== 37) {
        f.passed = 0;
      }

      if (state === 36) {
        f.ticks = 0;
      }

      if (state !== 35) {
        f.count = 0;
      }

      this.options.head?.({
        kind: f.x35a4 ?? 0,
        speed: state === 35 ? 2500 : 3000,
        shelved: false,
      });
    }

    /* Walking on (`DoCatPerformLocomote`, seg25:07d5): not there before (`+0x35aa`), not walked (`+0x34ca`), no strides (`+0x3502`), and its head on what it walks to (3000): what it plays with where it walks to a point (`+0x35a2`), else what it walks to. */
    if (state === 23) {
      const f = this.fields;
      f.x35aa = 0;
      f.passed = 0;
      f.count = 0;
      this.options.head?.({
        kind: (f.x35a2 ? f.x35a4 : f.x35a6) ?? 0,
        speed: 3000,
        shelved: false,
      });
    }

    if (!ENTERED.has(state)) {
      return;
    }

    this.run(true, depth);
  }

  /** What a tick wrote, kept. */
  private take(ticked: Partial<CatzStateTick>) {
    const f = this.fields;

    /* Its sound made (`MapAndPlayCatSound`, seg15:11ae): the action its temperament answers, played as a layered action, unless one plays. */
    if (ticked.sound !== undefined && ticked.sound > 0) {
      this.options.layer?.(ticked.sound);
    }

    /* After petting, resting at once (`DoCatAfterPetting` entering): not to be petted again so soon (`+0x3574`). */
    if (this.state === 52 && ticked.global === 9) {
      this.x3574 = 1;
    }

    /* What it wrote of the Kit; put in a basket, made again as its breed (`SetupNewBasket`). */
    if (ticked.kit && this.kit) {
      Object.assign(this.kit, ticked.kit);
    }

    if (ticked.remade !== undefined) {
      const made = this.options.remade?.(ticked.remade);

      if (made) {
        this.mind.brains = [...made.brains];
        this.mind.centres = [...made.centres];
      }
    }

    if (ticked.x33be !== undefined) {
      this.x33be = ticked.x33be;
    }

    /* What it wrote of its petting; resting after it, not to be petted again so soon. */
    if (ticked.petting) {
      const {
        ball: _ball,
        stopped: _s,
        movement: _m,
        pose: _p,
        left: _l,
        cursor: _c,
        ...written
      } = ticked.petting;
      Object.assign(this.petting, written);
    }

    /* Its prey caught and held (`+0xee0`). */
    if (ticked.caught) {
      f.caught = true;
      this.options.mouseHeld?.('caught');
    }

    if (ticked.strike) {
      this.options.strike?.(ticked.strike);
    }

    /* Its head, as the tick turned it: walking, at what it walks to; else at what it plays with. */
    for (const look of ticked.head ?? []) {
      if (look === 'track') {
        const walking = this.state === 22 || this.state === 23;
        const { kind, speed } = ticked.headTrack ?? {
          kind: (walking ? (ticked.x35a6 ?? f.x35a6) : (ticked.x35a4 ?? f.x35a4)) ?? 0,
          speed: 3000,
        };
        this.options.head?.({ kind, speed, shelved: this.isShelved(kind) });
      } else {
        this.options.head?.(look);
      }
    }

    if (ticked.count !== undefined) f.count = ticked.count;
    if (ticked.x35c2 !== undefined) f.x35c2 = ticked.x35c2;
    if (ticked.dream) {
      if (ticked.dream.phase !== undefined && ticked.dream.phase !== this.dream.phase) {
        this.cloudPhase(this.dream.phase, ticked.dream.phase);
        this.dream.phase = ticked.dream.phase;
        this.dream.inPhase = 0;
      }

      if (ticked.dream.kind !== undefined) this.dream.kind = ticked.dream.kind;
      if (ticked.dream.x35d8 !== undefined) this.dream.x35d8 = ticked.dream.x35d8;
      if (ticked.dream.at !== undefined) this.dream.at = ticked.dream.at;
    }
    /* Put elsewhere (the chase's ends): its rectangle and point moved there; the dog put with it, its stand-in sets off the way it now faces. */
    if (ticked.place) {
      const { x, y } = ticked.place;

      if (this.rect) {
        const dx = x - this.point.x;
        const dy = y - this.point.y;
        this.rect = {
          left: this.rect.left + dx,
          top: this.rect.top + dy,
          right: this.rect.right + dx,
          bottom: this.rect.bottom + dy,
        };
      }

      this.point = { x, y };
      this.options.moveTo?.({ x, y });

      if (ticked.place.dog) {
        this.dream.dogX = x;
        this.dream.dogStep = ticked.x688 === 0x40 ? -10 : 10;
        this.options.dog?.put({ x, y }, ticked.x688 ?? -0x40);
      }
    }
    if (ticked.aimRate !== undefined) this.options.aimRate?.(ticked.aimRate);
    if (ticked.swatFields) Object.assign(this.swatFields, ticked.swatFields);
    if (ticked.calmsMouse) this.options.mouseFear?.(-50);
    if (ticked.x35d2 !== undefined) f.x35d2 = ticked.x35d2;
    if (ticked.x35d4 !== undefined) f.x35d4 = ticked.x35d4;

    for (const [kind, cond] of ticked.conds ?? []) {
      this.catSetCond(kind, cond);
    }

    if (ticked.passed !== undefined) f.passed = ticked.passed;
    if (ticked.mode !== undefined) f.mode = ticked.mode;
    if (ticked.x35a6 !== undefined) f.x35a6 = ticked.x35a6;
    if (ticked.x35a4 !== undefined) f.x35a4 = ticked.x35a4;
    if (ticked.x35ac !== undefined) f.x35ac = ticked.x35ac;
    if (ticked.x35ee !== undefined) f.x35ee = ticked.x35ee;
    if (ticked.x35f4 !== undefined) f.x35f4 = ticked.x35f4;
    if (ticked.x688 !== undefined) f.x688 = ticked.x688;
    if (ticked.x35ba !== undefined) f.x35ba = ticked.x35ba;
    if (ticked.x35b8 !== undefined) f.x35b8 = ticked.x35b8;
    if (ticked.x35aa !== undefined) f.x35aa = ticked.x35aa;
    if (ticked.ticks !== undefined) f.ticks = ticked.ticks;
    if (ticked.goal !== undefined) f.goal = ticked.goal;

    /* Floating (65, phase 3): its cloud moved with it, its target point at its goal less its offset (seg18:0874). */
    if (this.state === 65 && this.dream.phase === 3 && ticked.goal) {
      const { cloudOffset } = this.dream;
      this.options.cloud?.moveTo({
        x: ticked.goal.x + cloudOffset.x,
        y: ticked.goal.y + cloudOffset.y,
      });
    }
    if (ticked.explore !== undefined) f.x35a8 = ticked.explore;
    if (ticked.marker !== undefined) this.marker = ticked.marker;
    if (ticked.energy !== undefined) this.mind.brains[CATZ_BRAIN.energy] = ticked.energy;
    /* Its behaviour changed (`DoCatBehaviorChange`), then, eating or tiring, its fullness and diet as they are after. */
    ticked.changes?.forEach((change) => catzBehaviorChange(this.mind, change, [0, 0, 0, 0]));
    if (ticked.fullness !== undefined) this.mind.brains[CATZ_BRAIN.fullness] = ticked.fullness;
    if (ticked.properDiet !== undefined)
      this.mind.brains[CATZ_BRAIN.properDiet] = ticked.properDiet;
    if (ticked.x35d6 !== undefined) f.x35d6 = ticked.x35d6;
  }

  /** Walking on, what it is steered at: what it walks to, in the box its words give; none where its steering stopped. Creeping, the angle to its prey. */
  private steering(ticked: CatzStateTick): CatzSteer | undefined {
    if (ticked.creepAim !== undefined) {
      return { rotation: ticked.creepAim };
    }

    if (ticked.leap) {
      const { ball, to, keep, turn } = ticked.leap;
      const at = ticked.leap.at
        ? ticked.leap.at
        : to === 'goal'
          ? this.fields.goal
          : to === 'prey'
            ? (this.preyAt() ?? this.walkedToAt())
            : this.walkedToAt();
      return at && { leap: { ball, x: at.x, y: at.y, keep, turn } };
    }

    const words = ticked.steer;

    if (!words || ticked.steerStopped) {
      return undefined;
    }

    const [width, height, share] = words.slice(2, 5);
    return { to: () => this.walkedToAt(), box: { width, height, share } };
  }

  /** Actions pushed: played for as long as each is given to. */
  private push(actions: number[], steer?: CatzSteer, steerAt = 0) {
    /* Put down by its victim's handler, let go (0x269): the mouse held by the cat to its mind. */
    if (this.state === 5 && this.fields.x35a4 === 0x1b && actions.includes(0x269)) {
      this.options.mouseHeld?.('putDown');
    }

    for (const [n, action] of actions.entries()) {
      /* A leap's words pushed once, ahead of the action they go before (the first, else as asked). */
      const played = this.options.play(
        action,
        steer && 'leap' in steer ? (n === steerAt ? steer : undefined) : steer
      );
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
      inReach: this.options.inReach?.() ?? false,
      preyArea3: this.screenArea(this.fields.x35a4 ?? 0) === 3,
      ...(this.kit
        ? {
            kit: { ...this.kit, mouseState: this.options.mouse?.()?.state ?? 1 },
            doubleClicked: this.options.doubleClicked?.(this.ticks) ?? false,
          }
        : {}),
      petting: this.pettingNow(),
      ...(this.options.buttons
        ? {
            buttons: {
              left: this.options.buttons().pressed ? 1 : 0,
              right: this.options.buttons().held ? 1 : 0,
            },
          }
        : {}),
      curiosities: this.fields.curiosities ?? [],
      cursor: none,
      kin: this.options.shelf ?? none,
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
      area1: this.screenArea(0x1d) === 1,
      area3: this.screenArea(0x1d) === 3,
      inShelf: this.isShelved,
      c4: this.kit ? 1 : 0,
      goal: this.fields.goal ?? this.point,
      cursorAt: this.cursorAt(),
      /* Napping: its dream, and its own script's cue to dream on phase 0's second tick (standing in). */
      ...(this.global === 21 ? { dream: this.dreamWorld() } : {}),
      ...(this.state === 65 && this.dream.phase === 0 && this.dream.inPhase === 2
        ? { cued: true }
        : {}),
      /* How the cursor moved its last frame, as it let the cat go. */
      thrown: this.cursorWas
        ? { dx: this.cursorAt().x - this.cursorWas.x, dy: this.cursorAt().y - this.cursorWas.y }
        : { dx: 0, dy: 0 },
      /* What it plays with, where it is: the cursor, or a thing in the pen. */
      prey: this.preyAt(),
      /* Swatting: how the cursor lies to its paw, standing in -- its offset
       * from the cat, its first side, nothing shelved. */
      swat: {
        facing: 0,
        dx: (this.preyAt() ?? this.cursorAt()).x - x,
        dy: (this.preyAt() ?? this.cursorAt()).y - y,
        /* Its paw missing it by how far what it plays with is from it,
         * standing in for `GetSwatMissDistance` -- on the shelf, out of its
         * paw's reach but by jumping (not reimplemented), far. */
        miss: this.isShelved(this.fields.x35a4 ?? 0)
          ? 1000
          : Math.trunc(
              Math.hypot(
                (this.preyAt() ?? this.cursorAt()).x - x,
                (this.preyAt() ?? this.cursorAt()).y - y
              )
            ),
        x3592: this.swatFields.x3592,
        shelved: this.isShelved(this.fields.x35a4 ?? 0),
        shelfClosed: false,
        x1d0: 0,
        /* (What the trace calls the mouse running: back in its hole, its state 1, seg29:1580.) */
        mouseRunning: this.options.mouse?.()?.state === 1,
        side: this.swatFields.side,
        zone: this.swatFields.zone,
        x3596: this.swatFields.x3596,
      },
      preyHeld: false,
      /* The bottle, on the shelf or in the pen, not held: near it within
       * the cat's width of its point, standing in for
       * `IsCatProximateToBottle`; the teat far from its mouth. */
      bottle: (() => {
        const at = this.thingAt(0xf);
        return {
          held: false,
          x1da: 0,
          shelved: this.isShelved(0xf),
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

/** The state a tick of the cat is in. */
function state(pet: CatzPet) {
  return pet.state;
}
