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
  TRICK_COUNT,
  type TrickScript,
} from '../formats/engine.ts';
import { type Script } from '../formats/script.ts';
import { type Trick } from '../formats/tricks.ts';
import { angle256, type Angles, type Eyelids, type Head } from '../render/project.ts';
import {
  AXIS,
  fudgeFrame,
  type Fudger,
  fudgeTo,
  makeFudgers,
  selects,
  setTarget,
} from './fudger.ts';
import { Swing } from './swing.ts';
import { type Brain } from './brain.ts';
import { type Ball, type Food, type Shoe, foodSize, ballRect, isTreat } from './stage.ts';
import { type Rand } from './random.ts';
import { ageFactor } from './age.ts';
import { DEFAULT_GLUE, type Fudge, type Step, timeline } from './timeline.ts';
import { AUTO, findTransition, type TransitionTable } from './transitions.ts';

/** The engine's states this file plays, by the numbers `readEngineStateNames` names. */
export const STATE = {
  waitState: 1,
  leaveKennel: 2,
  chasingOwner: 3,
  idle: 4,
  sleeping: 5,
  locomoteTrip: 6,
  locomote: 7,
  postLocomote: 8,
  scruff: 0xa,
  chasingCursor: 0xd,
  chargingCursor: 0xe,
  grabbingCursor: 0xf,
  prowlingCursor: 0x10,
  stalkingCursor: 0x11,
  lungingCursor: 0x12,
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
  ownerTooCloseToBall: 0x22,
  fakingBall: 0x23,
  observingBallThrown: 0x25,
  beggingChasing: 0x26,
  beggingChasingHindLegs: 0x27,
  eating: 0x28,
  grabbingTreat: 0x29,
  begging: 0x2a,
  firstTrick: FIRST_TRICK,
  chasingWall: 0x54,
  lastIdleTrick: 0x60,
  lungingWall: 0x66,
  sprayReact: 0x68,
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
  taunt: 0x3f5,
} as const;

/** Script positions the engine names by number (`readStateNames`). */
const SITTING = 6;
const SIT_PANT = 7;
const STANDING = 9;
const RUNNING = 21;

/** The yelp a sprayed dog gives (`PlaySound(75, 1)`, seg20:17ff on). */
const SPRAY_SOUND = 75;
const SITTING_UP = 30;

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
  standOverBowl: 37,
  eatFromBowl: 36,
  eatFromBowlMore: 54,
  eatFromBowlPause: 328,
  lap: 262,
  sick: 287,
  begReact: 41,
  begShuffle: 15,
  begShuffleBack: 18,
  hindLegsWalk: 33,
  leaveKennel: 93,
  leaveKennelOther: 92,
  pickedUp: 4,
  dangling: 3,
  growlOverBall: 55,
  sprayed: 68,
  shakeOffSpray: 323,
  grabShoeRunning: 1,
  reachForShoe: 215,
  grabShoe: 214,
  shakeShoe: 130,
  stalk: 206,
  gatherToLunge: 187,
  lunge: 168,
  hang: 167,
  dangle: 169,
  landFromLunge: 171,
  lookAbout: 184,
  stopRunning: 26,
  /** Running to standing, as the grab counts its frames (seg19:09e1). */
  stopRunningGrab: 11,
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

/** How near the user may come to a guarded ball (`0x1246`, set by `EnterFetch`, seg19:0024). */
const OWNER_TOO_CLOSE = 180;

/** How likely a begging dog chases on its hind legs, in 100 (`0x1ce4`, set by `ResetParams`). */
const HIND_LEGS_CHANCE = 60;

/**
 * The head's wobbles (`Lube`s, set up at seg5:0d1b): for each, the range it
 * eases about in, in the order they lie at DS:0x1ba, 0x48 apart; each
 * eases over 3 to 20 frames, and waits up to 5000 milliseconds between.
 */
const LUBES = [
  [-25, 25],
  [-0.5, 0.5],
  [-3, 3],
  [-6, 6],
  [-6, 0.75],
  [-0.1, 0.1],
  [-0.2, 0.2],
  [-0.2, 0.025],
  [-0.15, 0.15],
  [-0.15, 0.3],
  [-0.15, 0.0375],
  [-0.0015, 0.0015],
  [-0.0015, 0.0045],
  [-0.0015, 0.000375],
].map(([min, max]) => ({ min, max, shortest: 3, longest: 20 }));

/** The neck, by which the dog is scruffed (`DoScruffHandler`). */
const NECK = 54;

/** The group axes for both eyelids' tilts, and the head's whole reach (which selects no fudger). */
const BOTH_EYELID_TILTS = 14;
const HEAD_TRACK_MAX_ALL = 17;

/** How fast the dog turns towards a target, in 256ths of a turn a frame (`DoLocomote`). */
const TURN_RATE = 6;

/** What `SetTargetLocation`'s last number is when the engine gives it (`DoLocomote`). */
const FOCUS_DISTANCE = 4;

export interface PetData {
  scripts: Script[];
  table: TransitionTable;
  positionKinds: number[];

  /** Each position's heart rate, -1 for none (`readHeartRates`); without, the heart stays as it starts. */
  heartRates?: number[];

  /** How many balls the breed has (the animation header's): a script's call glues only by one of them. */
  ballCount?: number;
  tricks: Trick[];
  trickDefaults: Trick[];
  trickScripts: TrickScript[];
  engineScripts: EngineScripts;

  /** Each frame's sequence flags, numbered over every animation. */
  flags: (frame: number) => number;

  /** The brain, if the dog has one (`XBrain`, from `BRAIN.PBT`). */
  brain?: Brain;
}

/** The foods' names, `FoodSprite::theirNames`, as the brain is told them. */
const FOOD_NAMES = ['Food', 'Water', 'BlueTreat', 'GreenTreat', 'RedTreat'];

/** What the engine needs to know of the stage, and of where the dog is on it. */
export interface PetWorld {
  width: number;
  height: number;

  /** Where the dog is, from the stage's top left. */
  where(): { x: number; y: number };

  /** The rotation that faces the dog towards a point. */
  aim(target: { x: number; y: number }): number;

  /** The user's cursor, and whether its primary button is down; optional, for a dog left alone. */
  cursor?(): { x: number; y: number; button: boolean; secondary?: boolean };

  /** Whether the user holds a toy, food or tool (`0x220`, seg21:4533 on): the dog cannot be scruffed. */
  holding?(): boolean;

  /** The part of the dog's body under a point (`AREA`), or -1. */
  areaAt?(point: { x: number; y: number }, slop?: { x: number; y: number }): number;

  /** A ball of the dog on the stage, and how wide it is drawn. */
  ballOnStage?(ball: number): { x: number; y: number; diameter: number };

  /** The middle of the rectangle the dog is drawn in: where the engine takes it to be (`0x86`). */
  centre?(): { x: number; y: number };

  /** The pet's standard size: frame 35 drawn side on (`FigureOutStandardWidthAndHeight`). */
  standardSize?(): { width: number; height: number };

  /** The rectangle the dog is drawn in. */
  rect?(): { left: number; top: number; right: number; bottom: number };

  /** The food out of the toy box: bowls of food and water, and treats. */
  foods?: Food[];

  /** Puts a food back in the box: a treat the dog has eaten. */
  putAwayFood?(food: Food): void;

  /** The shoe out of the toy box, if any. */
  shoe?: Shoe | null;

  /** Where the dog's kennel is: the dog button of the toolbox, beside the playpen (`PetParams` +0x50). */
  kennel?: { x: number; y: number } | null;

  /** The user's cursor moved by the engine (`SetCursorPos`): the dog tugging at the shoe. */
  moveCursor?(point: { x: number; y: number }): void;

  /** The ball out of the toy box, if any. */
  ball?: Ball | null;

  /** Where the ball will be so many frames on, and how often it will bounce. */
  projectBall?(frames: number): { x: number; y: number; bounces: number };
  grabBall?(slot: number): void;
  releaseBall?(slot: number): void;
  ballHasMoved?(): boolean;

  /** A frame of the ball (`XStage::UpdateSprites`), after the dog's. */
  updateBall?(): void;

  /** Where a ball of the dog would be after showing these frames, and moving the dog. */
  lookAhead?(
    frames: { step: Step; rotation: number; placedBy?: number }[],
    ball: number
  ): { x: number; y: number };
  nudge?(dx: number, dy: number): void;
  /** The dog's frame placed from a point: its origin there (`FindStartingLocation`). */
  placeAt?(x: number, y: number): void;
  /** A check made with a step shown as it will be, the stage then as it was (`Stage.peek`). */
  peek?<T>(step: Step, rotation: number, reference: number | undefined, check: () => T): T;
}

/** A cursor sample, one a frame: `ReallyDoDrawFrame` keeps thirty. */
interface Sample {
  x: number;
  y: number;
  button: boolean;

  /** The secondary button, which scruffs. */
  secondary?: boolean;
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

  /**
   * Frames placed earlier in the tick than this one, in order, each by a pop
   * of its own -- a state changed between them -- for the stage to place
   * before it, as the engine does (frame 325 of the ball's day: the chase's
   * frame, then the grab's glued from it).
   */
  passed?: { step: Step; rotation: number; placedBy?: number }[];

  /** The head placed afresh for the frame before, taken at the new angles, as the plain move does turning (`MoveFrameRect`). */
  headCopy?: Head;

  /** Where the dog steers, if anywhere (`+0x2108`, `+0x2110`): a point off the stage lets it go off too. */
  steering?: { x: number; y: number };

  /** A ball of the dog held to a point, the dog drawn about it: hanging from the shoe. */
  pinned?: { ball: number; x: number; y: number };

  /** The dog moved so the middle of its rectangle is at a point (`XSprite::MoveSpritePt`). */
  centredAt?: { x: number; y: number };

  /** The head turned toward what the dog looks at (`HeadTrackPrep`), if it is. */
  head?: Head;

  /** Where the eyes look: 0 as the frame has them, 1 toward a point (`x`, `y` from the dog's middle), 2 at the user. */
  eyes?: { mode: 0 | 1 | 2; x: number; y: number };

  /** How far the eyelids are closed, in hundredths, and how many pixels wider each side the eyes are. */
  lids?: number;
  eyesWide?: number;

  /** The dog's tilt, spin and roll, in 256ths of a turn. */
  angles?: Angles;

  /** How many levels the fur bristles: added to every ball's fuzz. */
  bristle?: number;

  /** Each ball this many hundredths of the way from where a reference frame has it to where the frame does. */
  blend?: { scale: number; reference: number };

  /** Each eyelid's height, in hundredths open at most, and tilt (`BallState` `+0x24`, `+0x26`, `+0x20`, `+0x22`). */
  eyelids?: Eyelids;
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
  | { fudge: Fudge }
  | { lids: number }
  | { begin: number }
  | { after: Omit<Step, 'frame'> }
  | { cue: number }
  | { trick: number }
  | { aim: { ball: number; at: { x: number; y: number } | null } }
  | { factor: [number, number] }
  | { steerAt: { x: number; y: number; rate: number; width: number; height: number } }
  | { grab: number }
  | { release: number }
  | { repeat: number }
  | { endRepeat: true }
  | { lookAt: null }
  | { seek: 'user' | 'cursor' | 'held' };

/**
 * How many words of the engine's queue an item takes (`PushScript` copies
 * each opcode and its operands a word each, a frame a word): what the
 * repeats' places are counted in.
 */
const itemWords = (item: Item): number => {
  if ('whole' in item) {
    return itemWords((item as { whole: Item }).whole);
  }

  if ('words' in item && typeof item.words === 'number') {
    return item.words;
  }

  if ('step' in item) {
    return item.step.words ?? 1;
  }

  if ('after' in item) {
    return item.after.words ?? 0;
  }

  if ('fudge' in item) {
    return item.fudge.kind === 'by' || item.fudge.kind === 'target' ? 4 : 3;
  }

  if ('steerAt' in item) {
    return 6;
  }

  if ('aim' in item) {
    return 4;
  }

  if ('ease' in item || 'drift' in item || 'factor' in item || 'lookAt' in item) {
    return 3;
  }

  if ('end' in item || 'endRepeat' in item || ('seek' in item && item.seek === 'user')) {
    return 1;
  }

  /* An opcode and one operand: a start, a glue, a cue, a state to go to, the lids, a repeat. */
  return 2;
};

/** An angle in 256ths of a turn, from -128 to 127. */
const wrap = (angle: number) => ((((angle + 128) % 256) + 256) % 256) - 128;

/**
 * An angle brought within -128 to 128, both kept (seg11:1f32): as the
 * rotation's fudger writes it, easing or drifting. A turn by `0x8ae5` adds
 * to it unwrapped (seg7:5c74), and so it stays until the fudger next moves it.
 */
const normalise = (angle: number) => {
  while (angle < -128) {
    angle += 256;
  }

  while (angle > 128) {
    angle -= 256;
  }

  return angle;
};

/**
 * An idle dog's plan (`PetModule::SetupIdle`, seg16:0104): `rand() % (13 -
 * e/10) + 6 - e/20` items, e its excitement, after a draw it does not use.
 * Each, if `rand() % 100` is over e, one to four runs of one to three pants
 * (0), each run maybe a pant looking about (1) and -- `(rand() == 0) % 3`,
 * one time in 32,768 -- a longer pant (2); else a trick (3).
 */
export function idlePlan(excitement: number, rand: Rand): number[] {
  const plan: number[] = [];

  rand();
  const length = (rand() % (13 - Math.trunc(excitement / 10))) + (6 - Math.trunc(excitement / 20));

  for (let n = 0; n < length; n++) {
    if (rand() % 100 > excitement) {
      for (let pants = (rand() % 4) + 1; pants; pants--) {
        for (let still = (rand() % 3) + 1; still; still--) {
          plan.push(0);
        }

        if (rand() % 2) {
          plan.push(1);
        }

        /* The engine pushes the longer pant only when rand() is 0. */
        if ((rand() === 0 ? 1 : 0) % 3) {
          plan.push(2);
        }
      }
    } else {
      plan.push(3);
    }
  }

  return plan;
}

/**
 * Where an idle dog goes with its plan done (`DoIdle`, seg16:05eb): asleep
 * (5) where `rand() % 30 + 30` -- the module's `+0x1220`, 30 as it is made
 * -- is over its excitement, else walking (7). (In the screen saver, `PetParams`
 * `+0x5e` 3, an excited dog, over 70, goes to state 11 first: not here.)
 */
export function idleEnd(excitement: number, rand: Rand): number {
  return (rand() % 30) + 30 > excitement ? STATE.sleeping : STATE.locomote;
}

/** How many times a trick's script plays (`PushTrick`, seg21:7844): `rand() % extra` more than its repeats, its extra at least 1. */
export function trickRepeats(trick: { repeats: number; extra: number }, rand: Rand): number {
  return (rand() % Math.max(1, trick.extra)) + trick.repeats;
}

/**
 * Where the dog walks to next (`PetModule::GetNewTarget`, seg16:177b): a
 * point at random 60 within the stage's edges, drawn again until it is at
 * least so far from the dog -- or, the stage too small for that, as far as
 * half the inner stage's diagonal, less 50.
 */
export function pickTarget(
  stage: { width: number; height: number },
  at: { x: number; y: number },
  distance: number,
  rand: Rand
) {
  const { width, height } = stage;
  const most = Math.trunc(Math.hypot(width - 120, height - 120) / 2) - 50;
  const least = Math.min(distance, most);

  for (let tries = 0; tries < 1000; tries++) {
    const target = {
      x: (rand() % Math.max(1, width - 120)) + 60,
      y: (rand() % Math.max(1, height - 120)) + 60,
    };

    if (Math.hypot(at.x - target.x, at.y - target.y) >= least) {
      return target;
    }
  }

  return { x: width / 2, y: height / 2 };
}

/**
 * A sleeping dog's plan (`PetModule::PushSleepScripts`, seg16:1f61): 10 to
 * 24 stretches, each of one of five kinds of sleep (`rand() % 5`) played
 * `rand() % times + times` over; after the first 10 to 19 a break (one of
 * two scripts, `rand() % 2`), and another 6 to 11 after each.
 */
export function sleepPlan(
  sleep: { script: number; times: number }[],
  breaks: number[],
  rand: Rand
): number[] {
  const plan: number[] = [];
  let untilBreak = (rand() % 10) + 10;
  const length = (rand() % 15) + 10;

  for (let n = 0; n < length; n++) {
    const kind = sleep[rand() % 5];

    for (let times = (rand() % kind.times) + kind.times; times; times--) {
      plan.push(kind.script);
    }

    if (untilBreak-- < 0) {
      plan.push(breaks[rand() % 2]);
      untilBreak = (rand() % 6) + 6;
    }
  }

  return plan;
}

/**
 * How the dog goes (`PetModule::PickLocomotionAction`, seg21:837c): walking,
 * trotting or running by `((rand() % 21 + e - 10) * 3) / 100`, e its
 * excitement, held to 0 to 2; or the pace asked; and, overrides asked,
 * maybe a strut (241: e and ham over 70), a sad walk (220: both under 30)
 * or a march (111: e over 60 and under 80, ham over 70), each one time in two.
 */
export function pickGait(
  excitement: number,
  ham: number,
  paces: number[],
  pace: number,
  overrides: boolean,
  rand: Rand
): number {
  const byExcitement = Math.min(
    2,
    Math.max(0, Math.trunc((((rand() % 21) + excitement - 10) * 3) / 100))
  );

  if (pace !== 0) {
    return paces[pace];
  }

  let action = paces[byExcitement];

  if (!overrides) {
    return action;
  }

  if (excitement > 70 && ham > 70 && rand() % 2) {
    action = 241;
  }

  if (excitement < 30 && ham < 30 && rand() % 2) {
    action = 220;
  }

  if (excitement > 60 && excitement < 80 && ham > 70 && rand() % 2) {
    action = 111;
  }

  return action;
}

/** Whether a walking dog, at its target, picks another (`DoLocomote`, seg16:1413): `rand() % 150` under its excitement; else it stops. */
export function keepsWalking(excitement: number, rand: Rand): boolean {
  return rand() % 150 < excitement;
}

/**
 * The petting hand's next frame (`DoPettingHandler`, seg17:01e7): its count
 * run down, a step on, turned back at 4 and 7, and the count put at two or
 * three (`rand() % 2 + 2`).
 */
export function stepHand(
  hand: { frame: number; step: number; countdown: number },
  rand: Rand
): { frame: number; step: number; countdown: number } {
  let { frame, step, countdown } = hand;

  if (countdown-- < 0) {
    frame += step;

    if (frame > 7) {
      frame = 6;
      step = -step;
    }

    if (frame < 4) {
      frame = 5;
      step = -step;
    }

    countdown = (rand() % 2) + 2;
  }

  return { frame, step, countdown };
}

/**
 * The spot the dog wants petting on next (`PetModule::PickNewPetSpot`,
 * seg17:192b): another of the three than it had, at random, kept by its
 * chance in 100; and for how many strokes, `rand() % extra + strokes`.
 */
export function pickPetSpot(
  was: number,
  spots: { chance: number; strokes: number; extra: number }[],
  rand: Rand
): { spot: number; strokes: number } {
  let spot = was;

  for (let tries = 0; tries < 1000; tries++) {
    do {
      spot = rand() % 3;
    } while (spot === was);

    if (spots[spot].chance >= rand() % 100) {
      break;
    }
  }

  return { spot, strokes: (rand() % spots[spot].extra) + spots[spot].strokes };
}

/**
 * Where a dog waiting to be petted looks before each pant (`DoWaitPetting`,
 * seg17:07ec): one time in two about (`8afb`); else, one time in two, at
 * the cursor (`8af9`); else nowhere new.
 */
export function waitLook(rand: Rand): 'about' | 'cursor' | undefined {
  if (rand() % 2) {
    return 'about';
  }

  return rand() % 2 ? 'cursor' : undefined;
}

/**
 * Whether a dog petted on its head, body or hindquarters rolls onto its
 * back instead (`DoPettingGood`, seg17:1056, 111f): `rand() % 16 + 7` under
 * how much it has enjoyed the petting -- never before its eighth stroke, and
 * at most nine times in sixteen, its enjoyment held to 16.
 */
export function rollsOver(level: number, rand: Rand): boolean {
  return (rand() % 16) + 7 < level;
}

/**
 * Where a petted dog's eyes go (`PetModule::PushPettingEyePos`, seg17:12f7):
 * one time in two shut, a blink of `rand() % 15 + 30` frames; else one time
 * in two a look at the user; else a look at a random point, and four times
 * in five that blink after it.
 */
export function pettingEyes(rand: Rand): Omit<Step, 'frame'>[] {
  const blink = () => ({ blink: (rand() % 15) + 30 });

  if (rand() % 2) {
    return [blink()];
  }

  if (rand() % 2) {
    return [{ look: 'user' }];
  }

  return rand() % 5 ? [{ look: 'random' }, blink()] : [{ look: 'random' }];
}

/**
 * A dog's pants waiting for the treat after a trick, or for the ball
 * (`PetModule::PushBegWaitLoops`, seg18:25e0), step by step, so that what
 * is pushed between its draws is pushed between them as the engine pushes
 * it: `(100 - e) / 20 + 1`, e its excitement -- at play `(130 - keen) / 20
 * + 1`, keen its excitement and 30 more for a ball held, nothing when that
 * is under 1 -- and as many again at random; it settles, sitting if `rand()
 * % 85` is over e or it sits already; then that many pants and as many
 * again at random, each maybe sitting from then on (`rand() % 85` over e
 * and `rand() % 10` 0), every other one or two a look -- at the user (0),
 * the cursor (1) or what is held (2), `rand() % 3`, never the last again;
 * after a look at the user, every other one --
 * and, after it, one time in ten a longer pant.
 */
export function* begWaitLoops(
  excitement: number,
  keen: number | undefined,
  sitting: boolean,
  rand: Rand
): Generator<
  { begin: true } | { settle: boolean } | { pant: boolean; look?: number } | { longer: boolean }
> {
  let loops: number;

  if (keen !== undefined) {
    loops = Math.trunc((130 - keen) / 20) + 1;

    if (loops < 1) {
      return;
    }
  } else {
    loops = Math.trunc((100 - excitement) / 20) + 1;
  }

  loops += rand() % loops;
  yield { begin: true };
  let sits = excitement < rand() % 85 || sitting;
  yield { settle: sits };
  let looks = 0;
  let lastLook = 1;

  for (let left = loops + (rand() % loops); left > 0; left--) {
    if (excitement < rand() % 85 && rand() % 10 === 0) {
      sits = true;
    }

    let look: number | undefined;

    if (looks-- < 0) {
      looks = rand() % 2;

      do {
        look = rand() % 3;
      } while (look === lastLook);

      lastLook = look;

      /* A look at the user puts the count back to 0 (seg18:2827). */
      if (look === 0) {
        looks = 0;
      }
    }

    yield { pant: sits, look };

    if (rand() % 10 === 0) {
      yield { longer: sits };
    }
  }
}

/**
 * A poked dog's reaction (`DoPettingBad`, seg17:1416), its scripts in turn:
 * in the face (or tongue), one of the three of DS:0x20ca (`rand() % 3`);
 * elsewhere a growl (43) or, as often, a flinch (122; `rand() % 2`). After
 * the face or a growl, three times in four (`rand() % 4` not 0) it shakes
 * it off, one way or the other (120, 121; `rand() % 2`). Each is yielded
 * as it is drawn, so the engine's pushes fall between the draws as they do.
 */
export function* pokeReaction(face: boolean, pokedInFace: number[], rand: Rand): Generator<number> {
  const first = face ? pokedInFace[rand() % 3] : rand() % 2 === 0 ? SCRIPT.growl : SCRIPT.flinch;
  yield first;

  if (first !== SCRIPT.flinch && rand() % 4 !== 0) {
    yield rand() % 2 === 0 ? SCRIPT.shake : SCRIPT.shakeOther;
  }
}

/**
 * The states whose engine handler goes on from entering to its tick's work
 * in one call (their enter block falling through, not jumping to the end):
 * read from each handler of `StateDispatch`'s table (seg21:534a). Waiting,
 * scruffed, grabbing and leaping for the ball, the owner too close, faking,
 * tumbling and eating return; the states the table does not name are left
 * as they were.
 */
const ENTER_RUNS_ON = new Set([
  2,
  105,
  3,
  19,
  24,
  25,
  38,
  84,
  4,
  5,
  6,
  7,
  8,
  11,
  12,
  26,
  27,
  28,
  30,
  32,
  33,
  37,
  39,
  41,
  42,
  ...Array.from({ length: 96 - 43 + 1 }, (_, n) => 43 + n).filter((n) => n !== 84),
  97,
  98,
  99,
  100,
  101,
  102,
  104,
  106,
  107,
  108,
]);

/** The INI's sliders as Dogz installs them (`Control Val0` to `2`): factor 1 keeps its 30. */
export const SLIDERS = [10, 30, 100];

/** A bowl taken out of the toy box filled (`FoodSprite::Update`, seg20:0e35): `rand() % 11 + 25` servings. */
export function fillBowl(rand: Rand): number {
  return (rand() % 11) + 25;
}

/**
 * A dog's laps from a bowl of water (`DoEating`, seg18:1a14): `rand() % 4 +
 * 3`, no more than the servings the bowl was filled with, whatever is left.
 */
export function lapsOf(full: number, rand: Rand): number {
  return Math.min((rand() % 4) + 3, full);
}

/**
 * A dog's mouthfuls from a bowl of food (`DoEating`, seg18:18ba), step by
 * step, so that what is pushed between its draws is pushed between them as
 * the engine pushes it: for each serving left a mouthful, one time in six a
 * second after (`rand() % 6` 0), a pause once the count -- `rand() % 10 +
 * 5`, then `+ 6` drawn after each pause -- has run below 0, and the
 * serving's cue.
 */
export function* bowlPlan(
  servings: number,
  rand: Rand
): Generator<'mouthful' | 'more' | 'pause' | 'served'> {
  let untilPause = (rand() % 10) + 5;

  for (let n = 0; n < servings; n++) {
    yield 'mouthful';

    if (rand() % 6 === 0) {
      yield 'more';
    }

    if (untilPause-- < 0) {
      yield 'pause';
      untilPause = (rand() % 10) + 6;
    }

    yield 'served';
  }
}

/**
 * A trick done for the ball (`PickTrickState`, seg21:69b0 to 6aa4): one of
 * the 59 at random (`rand() % 59`), kept if its play weight is at least
 * `rand() %` the play weights' sum as the dog was made; never one with the
 * ball while the ball is held or in the box, nor while it cannot be
 * grabbed (`IsBallGrabbable`, asked only of a trick with the ball).
 */
export function pickPlayTrick(
  tricks: { playWeight: number; withBall: number }[],
  sum: number,
  ball: { held: boolean; out: boolean },
  grabbable: () => boolean,
  rand: Rand
): number {
  for (let tries = 0; tries < 100000; tries++) {
    const n = rand() % tricks.length;
    const trick = tricks[n];
    let reject = trick.playWeight < rand() % sum;

    if (trick.withBall && (ball.held || !ball.out)) {
      reject = true;
    }

    if (trick.withBall && !grabbable()) {
      reject = true;
    }

    if (!reject) {
      return n;
    }
  }

  return 0;
}

/** A wobble of the head (`Lube`, DS:0x1ba on, 0x48 bytes each): its range and glide, where it is, and when it next moves. */
export interface Lube {
  min: number;
  max: number;
  shortest: number;
  longest: number;
  current: number;
  from: number;
  to: number;
  frames: number;
  count: number;
  next: number;
}

/** The fourteen wobbles at rest, as they are set up (seg5:0d1b). */
export function restingLubes(): Lube[] {
  return LUBES.map((range) => ({
    ...range,
    current: 0,
    from: 0,
    to: 0,
    frames: 0,
    count: -1,
    next: 1,
  }));
}

/** The wobbles put back to rest, not tracking (`HeadTrackPrep`, seg5:0ae0). */
export function restLubes(lubes: Lube[]) {
  for (const lube of lubes) {
    Object.assign(lube, { current: 0, count: -1, next: 1 });
  }
}

/**
 * A wobble moved on (`Lube::Next`, seg5:0468): waiting, once its time comes
 * a glide from where it is to a point at random in its range over 3 to 20
 * frames; gliding, a frame on, and at its end a wait of up to 5 seconds.
 */
export function nextLube(lube: Lube, now: number, rand: Rand) {
  if (lube.count === -1) {
    if (lube.next <= now) {
      lube.from = lube.current;
      lube.to = lube.min + ((lube.max - lube.min) * (rand() % 1000)) / 1000;
      lube.frames = (rand() % (lube.longest - lube.shortest + 1)) + lube.shortest;
      lube.count = 0;
    }
  } else {
    lube.count++;
    lube.current = lube.from + (lube.count * (lube.to - lube.from)) / lube.frames;

    if (lube.count >= lube.frames) {
      lube.count = -1;
      lube.next = now + (rand() % 5000);
    }
  }

  return lube.current;
}

/**
 * The head's wobbles for a placing (`Ballz::HeadTrackPrep`, seg5:05ba), the
 * head turned and nodded so, at a time in ms, scaled: each pair a share of
 * the turn -- or, up and down and back, of the nod (seg5:092f, 0985, 0a18,
 * 0a52) -- and a wobble, in the engine's order; the roll held within 42.
 */
export function wobbleHead(
  lubes: Lube[],
  yaw: number,
  pitch: number,
  now: number,
  scale: number,
  rand: Rand
): Head {
  const next = (n: number) => nextLube(lubes[n], now, rand) * scale;
  const roll = Math.max(-42, Math.min(42, Math.trunc(next(1) * yaw + next(0))));
  const drift = {
    x: next(11) * yaw + next(8),
    y: next(12) * pitch + next(9),
    z: next(13) * pitch + next(10),
  };
  const offsetX = Math.trunc(next(5) * yaw + next(2));
  const offsetY = Math.trunc(next(6) * pitch + next(3));
  const offsetZ = Math.trunc(next(7) * pitch + next(4)) - Math.trunc(Math.abs(offsetY) / 2);

  return { yaw, pitch, roll, offset: { x: offsetX, y: offsetY, z: offsetZ }, drift };
}

/** Chasing the cursor or charging it (`DecideChasingChargingCursor`, seg3:1d71): `rand() % 175` over the dog's excitement, chasing (13); else charging (14). */
export function chaseOrCharge(excitement: number, rand: Rand): number {
  return excitement < rand() % 175 ? STATE.chasingCursor : STATE.chargingCursor;
}

/** Whether a dog chasing the shoe may lunge at it (`DoChasingChargingCursor`, seg3:0431): `rand() % 1000` under its excitement, the shoe then in reach. */
export function lungeChance(excitement: number, rand: Rand): boolean {
  return rand() % 1000 < excitement;
}

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

  /**
   * The queue, and what has been read from it since the last push: the
   * engine's array, from the place a push last moved what was left unread
   * to its front (`PushScript`, seg7:47fc to 4899), which a repeat's place
   * is counted from.
   */
  private unread: Item[] = [];
  private read: Item[] = [];

  private get queue(): Item[] {
    return this.unread;
  }

  private set queue(items: Item[]) {
    this.unread = items;
    this.read = [];
  }

  /**
   * The repeats under way (`+0x20ac` on): each its count left and its place,
   * in words from the front of the array as it was then (seg7:5a5a to 5ab2).
   */
  private repeats: { count: number; at: number }[] = [];
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

  /** The script whose start was last popped (`+0x948`, seg7:65ee): where a soft reset leaves the dog. */
  private begun = -1;

  /** Sounds the engine plays itself (`ScriptSprite::PlaySound`), with the next frame shown. */
  private sounds: number[] = [];

  /** When the trick last done was begun, in ticks (`0x1ce6` of the sprite). */
  private lastTrickTime = 0;

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

  /** The sum of the tricks' play weights, as they were when the dog was made (`ds:0x3d90`, seg21:0df6: not summed again as they drift). */
  private readonly playWeights: number;
  private readonly data: PetData;
  private readonly world: PetWorld;
  private readonly rand: Rand;

  constructor(
    data: PetData,
    world: PetWorld,
    rand: Rand,
    factors: { centre: number; spread: number }[],
    age = 0,
    sliders: number[] = SLIDERS
  ) {
    this.data = data;
    this.world = world;
    this.rand = rand;
    /* Each factor first the INI's slider for it (`Control Val0` on, `PetParams`
     * `+0x1ee`, `LoadSliderVals`), at least 1 (seg21:0c07 on); `LoadFactors`
     * then draws all but factor 1 afresh. */
    this.sliders = Array.from({ length: 11 }, (_, n) => sliders[n] ?? 0);
    this.factors = this.sliders.map((slider) => Math.max(1, slider));
    this.centres = factors.map((factor) => factor.centre);
    this.idleWeights = data.tricks.reduce((sum, trick) => sum + trick.idleWeight, 0);
    this.playWeights = data.tricks.reduce((sum, trick) => sum + trick.playWeight, 0);
    this.loadFactors(factors, age);
  }

  /** A factor, as the engine reads it: from 1 to 100 (`PetModule::GetFactor`). */
  factor(n: number) {
    return Math.min(100, Math.max(1, this.factors[n]));
  }

  /** `PetModule::LoadFactors`: each factor near its breed's centre, the spread either side. */
  private loadFactors(factors: { centre: number; spread: number }[], age: number) {
    /* Ten a day played, as `LoadFactors` has it (seg21:1f99): grown at ten days. */
    this.setFactor(10, ageFactor(age));
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
      /* The factor and its slider both (seg14:22bf to 22d7). */
      this.factors[n] = clamped;
      this.sliders[n] = clamped;
    }
  }

  /**
   * The sliders of the dog's nature (`PetParams` `+0x1ee` on): set with the
   * factors, copied into them each pulse and back from them after
   * (`PulseTrickData`, seg14:18b5; seg21:4bf9 to 4c27).
   */
  private sliders: number[];

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
    /* (Its slider the value asked, seg14:2461: the next pulse takes that as the factor.) */
    this.sliders[0] = value;
  }

  /**
   * `PetModule::PulseTrickData`: excitement follows its cycle, and now and
   * then the trick weights and the other factors step back towards their
   * defaults and centres.
   */
  private pulse() {
    /* Its slider moved from its excitement, the excitement set to it, and
     * no wave this pulse (seg14:17f8 to 181d); else the wave. */
    if (this.sliders[0] !== this.factor(0)) {
      this.setExcitement(this.sliders[0]);
    } else {
      const power = (100 - this.centres[0]) / 25;
      const wave = (1 + Math.sin(this.phase + this.moodAngle())) / 2;
      this.factors[0] = Math.trunc(Math.pow(wave, power) * 100);
      this.sliders[0] = this.factors[0];
    }

    /* Every factor its slider's (seg14:18b5 to 191c). */
    this.sliders.forEach((slider, n) => (this.factors[n] = Math.min(100, Math.max(1, slider))));

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

    /* Shown the first time, the dog comes out of its kennel (seg21:3fc8). */
    this.global = GLOBAL.idle;
    this.enterIdle(STATE.leaveKennel);
  }

  /**
   * The dog made in the playpen as `InitPetModule` makes it, after
   * `LoadFactors` (the constructor), with no kennel to come out of:
   * the script sprite's own draws -- its last script one of two (seg7:1372,
   * the sprite's `-0x7222`), and the game's table of 50 numbers and its
   * place in it (seg7:1568 to 1591) -- the moon's phase (`MoonSprite`,
   * seg20:39e5), its middle somewhere on the stage at least 100 in
   * (`FindStartingLocation`, seg21:5805: across within the stage's width
   * less 200, down within its height less 200, at least 10 each), whether it
   * has the hiccups (`rand() % 100` under the INI's `Hiccup Proclivity`, 10,
   * seg21:1d6f), facing 64 and level (seg21:1db3), and idle (seg21:1e7f),
   * which sets it walking.
   */
  startInPen(time = 0, hiccupProclivity = 10, middle?: { x: number; y: number }) {
    this.time = time;
    this.nextDrift = time;
    /* Its neutral position as the module leaves it: standing panting, 14 --
     * [[measured]], the engine's dog then playing script 28, 14 to 9, back
     * from frame 38. (The script sprite is made at 6, sitting, seg7:1366;
     * what puts it at 14 is not yet read out.) */
    this.position = 14;
    this.lastScript = this.rand() % 2 ? 0x4a : 2;
    this.randomTable = Array.from({ length: 50 }, () => this.rand());
    this.randomAt = this.rand() % 49;
    this.rand();
    const across = Math.max(10, this.world.width - 200);
    const down = Math.max(10, this.world.height - 200);
    const x = (this.rand() % across) + 100;
    const y = (this.rand() % down) + 100;
    /* (Put there at once -- the point the frame is placed from, its
     * rectangle then the sprite's, seg21:5876 to 58cb -- so that where it
     * walks to is worked out from there.) */
    this.world.placeAt?.(x, y);

    /* (Or with its middle where the engine's ends up: the frames it is
     * placed by, and moved by, as the module is made are not yet followed.) */
    const now = this.world.centre?.();

    if (middle && now) {
      this.world.nudge?.(middle.x - now.x, middle.y - now.y);
    }

    this.hiccups = this.rand() % 100 < hiccupProclivity;
    this.rotation = 64;
    this.global = GLOBAL.idle;
    this.enterIdle(0);

    /* One frame played as it is made, by idle and walking's going on from
     * entering (frame 38, [[measured]]). */
    /* (Its pops the module's making, before the first frame.) */
    this.popsThisTick = 0;
    this.placedThisTick = [];
    return this.enteredStep ?? this.lastStep;
  }

  /** The game's table of numbers the scripts take in turn (`theirSavedThings` `+0xa`), and its place (`+0x6e`). */
  private randomTable: number[] = [];
  private randomAt = 0;

  /**
   * The table's next number: its place moved on, back to the first at 50
   * (seg7:44df to 4500). Without a table made (`start`, not `startInPen`), a
   * fresh `rand()`, as the model had it.
   */
  private tableNext() {
    if (!this.randomTable.length) {
      return this.rand();
    }

    this.randomAt = this.randomAt + 1 >= 50 ? 0 : this.randomAt + 1;
    return this.randomTable[this.randomAt];
  }

  /** Whether the dog has the hiccups (`+0x1cde`): not yet played. */
  hiccups = false;

  /**
   * One tick of the engine, `time` in its ticks, in the order of
   * `ReallyDoDrawFrame` (seg21:3dee): the cursor is sampled, petting is
   * looked for, the dog's state acts and a frame plays, and its mood moves
   * on, `pulsedAt` the clock as it does, where not `time`, and `wobbledAt`
   * the head's wobbles' clock in milliseconds.
   */
  tick(time: number, pulsedAt?: number, wobbledAt?: number): Tick {
    this.time = time;
    this.wobbledAt = wobbledAt;
    this.poppedCentre = undefined;
    this.askedBall = false;

    /* After a tick that showed nothing new, its head tracking, the frame
     * before is placed afresh before the module pulses -- its head, its turn
     * and nod as they were, the wobbles moved on (the trace's `head 0` ahead
     * of `pulse`, frames 2758 to 2854 of the day of 3,000; [[inferred]]: what
     * places it is not yet read out). */
    let freshened: Head | undefined;

    if (this.lastStill && this.lastPose?.tracking && this.headTracking) {
      const [yaw, pitch] = [this.headYaw, this.headPitch];
      [this.headYaw, this.headPitch] = [this.lastPose.yaw, this.lastPose.pitch];
      freshened = this.headTrackPrep();
      [this.headYaw, this.headPitch] = [yaw, pitch];
    }

    this.sample();
    this.doPettingHandler();
    this.doScruffHandler();
    this.doCallingHandler();
    this.called = false;
    this.checkFake();

    /* The ball's sprite moved on before the dog's state acts (`BallSprite::Update`, ahead of the module's pulse). */
    this.world.updateBall?.();
    const shown = this.dispatch();
    /* Every sound popped since the last tick played, shown or not (as
     * `PopScript` plays them): a frame popped and passed over keeps its own. */
    shown.sounds = this.popSounds.length ? this.popSounds : undefined;
    this.popSounds = [];
    this.wearFullness();

    /* (The engine reads its clock afresh as it pulses, a little on: where it is known, that.) */
    if (pulsedAt !== undefined) {
      this.time = pulsedAt;
    }

    this.pulse();
    /* And the sliders the factors as the pulse left them (seg21:4bf9 to 4c27). */
    this.sliders = this.factors.map((_, n) => this.factor(n));
    this.data.brain?.pulse();
    const centredAt = this.centreAt ?? undefined;
    this.centreAt = null;
    /* (Placed again for the steering's ask, before the frame's own, the turn and nod as they were.) */
    /* (Nothing shown, nothing placed: the head not wobbled.) */
    const still = !!shown.still;
    this.lastStill = still;

    if (this.steeredTracking && this.lastPose && !still) {
      const [yaw, pitch] = [this.headYaw, this.headPitch];
      [this.headYaw, this.headPitch] = [this.lastPose.yaw, this.lastPose.pitch];
      this.headTrackPrep();
      [this.headYaw, this.headPitch] = [yaw, pitch];
    }

    const was = this.lastPose;
    /* (A glue reads the frame before as it was so placed; else places it
     * afresh itself, its head tracking, as `MoveFrameRectBall` reads its
     * ball -- the trace's `head 0` in the glue, frame 2869.) */
    let headCopy: Head | undefined = shown.glue !== undefined ? freshened : undefined;

    /* (Only where the frame before is not what Ballz last placed:
     * `MoveFrameRectBall` reads it again only if the old state differs from
     * that one, seg10:2b55 to 2ce4 -- as after the steering has asked where
     * the nose is, or anything has asked where a ball of it is, placing the
     * dog as it now is (frame 124 of the ball's day, steering; frame 2869
     * of the day of 3,000, a target set; not frame 113).) */
    const moved = this.steeredTracking || this.askedBall;

    if (
      !still &&
      !freshened &&
      shown.glue !== undefined &&
      was?.tracking &&
      this.headTracking &&
      moved
    ) {
      const [yaw, pitch] = [this.headYaw, this.headPitch];
      [this.headYaw, this.headPitch] = [was.yaw, was.pitch];
      headCopy = this.headTrackPrep();
      [this.headYaw, this.headPitch] = [yaw, pitch];
    }

    const head = still ? undefined : this.headTrackPrep();
    const angles = {
      tilt: this.fudged(AXIS.tilt),
      spin: this.fudged(AXIS.spin),
      roll: this.fudged(AXIS.roll),
    };

    /* Swinging, after the fudgers, the swing sets the spin and tilt
     * itself (`Fizziks`, `RotatoPet`; seg7:6dbe), stepped by the cursor's
     * move since the tick before. */
    if (this.swingAsked || this.swing) {
      if (this.swingAsked || !this.swing) {
        this.swing = new Swing(this.rotation);
        this.swingAsked = false;
      }

      const [now, before] = [this.samples[0], this.samples[1] ?? this.samples[0]];
      this.swing.step(now ? now.x - before.x : 0, now ? now.y - before.y : 0);
      const { spin, tilt } = this.swing.angles(this.rotation);
      angles.spin = spin;
      angles.tilt = tilt ?? angles.tilt;
    }

    /* Moved plainly and turned, the head tracking, the engine takes the
     * frame before at the new angles and places its head afresh -- its turn
     * and nod as they were, the wobbles moved on again (`MoveFrameRect`'s
     * second `GetFrame`, seg10:29ee): so here, after the head of the frame. */
    const turned =
      was &&
      (was.rotation !== this.rotation ||
        was.tilt !== angles.tilt ||
        was.spin !== angles.spin ||
        was.roll !== angles.roll);
    /* (The frame before's head is placed afresh only if it tracked: its
     * state's `+0x1e` set, as the engine's `GetFrame` asks.) */
    if (head && was?.tracking && turned && shown.glue === undefined) {
      const [yaw, pitch] = [this.headYaw, this.headPitch];
      [this.headYaw, this.headPitch] = [was.yaw, was.pitch];
      headCopy = this.headTrackPrep();
      [this.headYaw, this.headPitch] = [yaw, pitch];
    }

    this.lastPose = still
      ? this.lastPose
      : {
          rotation: this.rotation,
          ...angles,
          yaw: this.headYaw,
          pitch: this.headPitch,
          tracking: !!head,
        };

    /* (The frames taken this tick before the one shown: placed first, in turn.) */
    const at = this.placedThisTick.findIndex((each) => each.step === shown);
    const passed = at === -1 ? this.placedThisTick : this.placedThisTick.slice(0, at);
    /* (Cleared as the tick ends, not as it begins: a pop between ticks --
     * the user taking out the ball, say, before the frame -- is the next
     * tick's, as the engine's is the frame's.) */
    this.lastTickPops = this.popsThisTick;
    this.popsThisTick = 0;
    this.placedThisTick = [];

    return {
      ...shown,
      passed: passed.length ? passed : undefined,
      rotation: this.rotation,
      state: this.state,
      placedBy: this.placedBy,
      steering: this.steer?.point,
      pinned: this.pinned ?? undefined,
      centredAt,
      head,
      headCopy,
      eyes: { mode: this.eyeMode, ...this.eyeTarget },
      lids: this.lids,
      eyesWide: this.eyesWide,
      bristle: this.bristle,
      blend:
        this.motionScale === 100
          ? undefined
          : { scale: this.motionScale, reference: this.reference },
      angles,
      eyelids: {
        left: {
          height: this.fudged(AXIS.leftEyelidHeight),
          tilt: this.fudged(AXIS.leftEyelidTilt),
        },
        right: {
          height: this.fudged(AXIS.rightEyelidHeight),
          tilt: this.fudged(AXIS.rightEyelidTilt),
        },
      },
    };
  }

  // The script queue: what `ScriptSprite` keeps and `PopScript` plays.

  private push(...items: Item[]) {
    /* (What was read let go, the rest at the front: the repeats' places not moved with it.) */
    this.read = [];
    this.unread.push(...items);
  }

  /** The words left unread in the queue (for the harness, against the engine's). */
  unreadWords() {
    return this.unread.reduce((sum, item) => sum + itemWords(item), 0);
  }

  /** The queue as items and their words (for the harness). */
  describeQueue(limit = 400) {
    return this.unread
      .slice(0, limit)
      .map((item) => {
        const [key] = Object.keys(item).filter((name) => name !== 'words' && name !== 'script');
        const value =
          'step' in item
            ? item.step.frame.toString(16)
            : JSON.stringify((item as Record<string, unknown>)[key]);
        return `${key}=${value}/${itemWords(item)}`;
      })
      .join(' ');
  }

  /**
   * `0x8ad2`: the count down, and while any is left the queue read again
   * from the repeat's place -- the place as it was, in words from the array's
   * front, though a push since may have moved what is there (seg7:5acc to 5b38).
   */
  private endRepeat() {
    const top = this.repeats[this.repeats.length - 1];

    if (!top) {
      return;
    }

    if (top.count !== 999) {
      top.count--;
    }

    if (top.count <= 0) {
      this.repeats.pop();
      return;
    }

    const all = [...this.read, ...this.unread];
    let at = 0;
    let index = 0;

    while (index < all.length && at + itemWords(all[index]) <= top.at) {
      at += itemWords(all[index++]);
    }

    /* (Landed within a frame's words, the opcodes before it passed over: the
     * frame read as it is, without them. Within anything else, read on from
     * the next.) */
    if (at < top.at && index < all.length) {
      const within = all[index];

      if ('step' in within) {
        /* (Read as the frame alone; the item kept whole in the array.) */
        this.read = all.slice(0, index);
        this.unread = [
          {
            step: { frame: within.step.frame, reference: within.step.reference },
            script: within.script,
            whole: within,
          } as Item,
          ...all.slice(index + 1),
        ];
        return;
      }

      index++;
    }

    this.read = all.slice(0, index);
    this.unread = all.slice(index);
  }

  /**
   * `ScriptSprite::IsScriptGlued` (seg7:36fb): a glue queued that no frame
   * follows, whatever else (an end, say) comes after it.
   */
  private isGlued() {
    return this.gluedAhead() !== undefined;
  }

  /** What follows a script's frames, queued: its glue as a glue of its own, as the engine queues it (`0x8ad7`, `0x8ad8`). */
  private pushAfter(after: Omit<Step, 'frame'>) {
    const { glue, ...rest } = after;

    if (Object.keys(rest).length) {
      this.push({ after: rest });
    }

    /* (Its word counted with the rest.) */
    if (glue !== undefined) {
      this.push({ glue, words: 0 } as Item);
    }
  }

  /** `GlueScriptsIfNotGlued`. */
  private glueIfNotGlued(ball: number, words = 2) {
    if (!this.isGlued()) {
      this.push({ glue: ball, words } as Item);
    }
  }

  private pushScript(index: number) {
    const script = this.data.scripts[index];
    /* Its variant, and its numbers, from the game's table (`PushStoredScript`, seg7:44df; `PushScript`, seg7:4b99). */
    const variant = this.tableNext() % script.variants.length;
    let after: Omit<Step, 'frame'> | undefined;
    let pushed = 0;

    /* Its start (`0x8b0a`), its frames, what follows them, its end (`0x8b0b`). */
    this.push({ begin: index });

    const steps = timeline(this.data.scripts, index, variant, {
      flags: this.data.flags,
      random: (n) => this.rand() % n,
      table: (n) => this.tableNext() % n,
      deferSounds: true,
      limit: 600,
      tail: (rest) => (after = rest),
      /* A script it calls pushed as `PushScript` pushes it (seg7:4ae6 to
       * 4ca0): an end, then the script stored, so many times, each taken
       * to where it starts, and glued after by the ball the call names. */
      call: ({ script: called, times, glue }, frames, pending) => {
        this.push(...frames.slice(pushed).map((step) => ({ step, script: index })));
        pushed = frames.length;
        this.pushAfter(pending);

        this.push({ end: index });

        for (let n = 0; n < times; n++) {
          this.pushStored(called);

          /* (A ball the breed has: most calls name 65, which none has, `ds:0x3bbe` `+0x58`.) */
          if (glue >= 0 && glue < (this.data.ballCount ?? 0)) {
            this.push({ glue });
          }
        }
      },
      /* A repeat left to the pop, its block pushed once (seg7:5a5a to 5b38). */
      repeat: (marker, frames, pending) => {
        this.push(...frames.slice(pushed).map((step) => ({ step, script: index })));
        pushed = frames.length;
        this.pushAfter(pending);
        this.push(marker);
      },
    });

    this.push(...steps.slice(pushed).map((step) => ({ step, script: index })));

    if (after) {
      this.pushAfter(after);
    }

    this.push({ end: index });
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
    /* (A glue met by a pop that ran dry stands for the next frame shown: `+0x950`, done with only once used, seg7:6e81.) */
    let glue: number | undefined = this.heldGlue;
    this.heldGlue = undefined;
    let step: Step | undefined;
    /* (A frame held to place the next by, taken up by a pop that ran dry, places the next pop's.) */
    let placedBy: number | undefined = this.heldReference;
    this.heldReference = undefined;
    /* The old state a glue starts from: as the last pop this tick left it,
     * where there was one (`PopScript` copies the state into the old as it
     * ends, run dry or not, seg7:71eb). */
    const earlier = this.popsThisTick > 0 ? this.poppedBlend : undefined;
    this.popsThisTick++;

    this.cues.clear();
    this.easeMotionScale();
    /* (Each pop pulses the sprite, `ScriptSprite::Pulse` from `PopScript`,
     * seg7:590e: its blinking goes on once a pop.) */
    this.blinkPulse();
    this.tails.splice(0).forEach((after) => this.applyTail(after));
    this.grabbedSlot = -1;

    const control = (item: Item) => {
      if ('cue' in item) {
        this.processCue(item.cue);
      } else if ('trick' in item) {
        this.lastTrick = item.trick;
        this.lastTrickTime = this.time;
      } else if ('steerAt' in item) {
        /* `0x8af2 x y rate width height` (`SetTargetLocation`). */
        const { x, y, rate, width, height } = item.steerAt;
        this.setTargetLocation(rate ? { x, y } : null, rate, width, height);
      } else if ('grab' in item) {
        this.grabbedSlot = item.grab;
        this.grabObject(item.grab);
      } else if ('release' in item) {
        this.releaseObject(item.release);
      } else if ('factor' in item) {
        /* `0x8adf n value` (`PetModule::SetFactor`). */
        this.setFactor(...item.factor);
      } else if ('aim' in item) {
        /* (Played ahead once the frame it comes with is placed, seg7:7144 on.) */
        this.pendingAim = item.aim;
      } else if ('glue' in item) {
        glue = item.glue;
      } else if ('goto' in item) {
        this.gotoState = item.goto;
        flags |= 8;
      } else if ('ease' in item) {
        this.startEase(item.ease, this.framesAhead());
      } else if ('drift' in item) {
        this.drift = item.drift;
      } else if ('fudge' in item) {
        this.applyFudge(item.fudge, this.framesAhead());
      } else if ('lids' in item) {
        this.restLids(item.lids);
      } else if ('seek' in item) {
        /* `0x8afb`; `0x8afe 6`, the cursor; `0x8afe 7`, what is held, or else the cursor. */
        if (item.seek === 'user') {
          this.lookAtUser();
        } else {
          const held = item.seek === 'held' ? this.heldObject() : undefined;
          this.lookAt(held ?? this.samples[0]);
        }
      } else if ('lookAt' in item) {
        /* `0x8af9 7ffe 7ffe`: the head and the eyes look at nothing (seg7:62f0 to 6350). */
        this.lookAt(null);
      } else if ('repeat' in item) {
        /* (Its place the word after it, seg7:5a96 to 5aad.) */
        this.repeats.push({
          count: item.repeat,
          at: this.read.reduce((sum, each) => sum + itemWords(each), 0),
        });
      } else if ('endRepeat' in item) {
        this.endRepeat();
      } else if ('end' in item) {
        /* `0x8b0b`: the script at its end, and so to be cut short (seg7:6688 to 6692). */
        this.scriptEnded = true;
        this.interruptible = true;
      } else if ('begin' in item) {
        this.begun = item.begin;
        this.scriptEnded = false;
        this.framesShown = 0;
        this.updateHeartRate(item.begin);
      } else if ('after' in item) {
        /* Met after this frame, it is for the next (`PopScript` reaches it then). */
        if (step) {
          this.tails.push(item.after);
        } else {
          this.applyTail(item.after);
        }
      }
    };

    while (this.queue.length && !step) {
      const item = this.queue.shift()!;
      this.read.push((item as { whole?: Item }).whole ?? item);

      if ('step' in item && item.step.reference) {
        placedBy = item.step.frame;
      } else if ('step' in item) {
        step = { ...item.step, glue: item.step.glue ?? glue };
        /* (One more of the script's frames shown, seg7:713f.) */
        this.framesShown++;

        /* (A glue by no ball of the dog's, -1 say, is none: the frame placed as it is, seg7:6e33 to 6e44.) */
        if (step.glue !== undefined && (step.glue < 0 || step.glue >= 65)) {
          delete step.glue;
        }

        if (step.glue !== undefined && earlier !== undefined) {
          step.glueBlend = earlier;
        }

        if (this.tailTurnFrame !== undefined) {
          step.turnFrame ??= this.tailTurnFrame;
          this.tailTurnFrame = undefined;
        }

        /* Its sounds chosen now, as `PopScript` plays them (seg7:620a). */
        if (step.soundChoices) {
          const chosen = step.soundChoices.map((choices) => choices[this.rand() % choices.length]);
          step.sounds = [...(step.sounds ?? []), ...chosen];
          delete step.soundChoices;
        }

        if (this.sounds.length) {
          step.sounds = [...(step.sounds ?? []), ...this.sounds];
          this.sounds = [];
        }

        this.popSounds.push(...(step.sounds ?? []));
        this.playing = item.script ?? this.playing;
      } else {
        control(item);
      }
    }

    /* Done only once it finds nothing more to show (`PopScript` reaching the
     * queue's end, seg7:58f9): what follows the last frame -- a state to go
     * to, a frame held to place the next by -- is taken up then, the tick
     * after the last frame was shown, as the engine's is. */
    this.dryPop = !step;

    if (!step && placedBy !== undefined) {
      this.heldReference = placedBy;
    }

    if (!step) {
      this.heldGlue = glue;

      /* (Run dry after a turn, the state copied into the old as the pop
       * ends, seg7:71eb: the turn's frame lost, the dog still turned about
       * its middle.) */
      if (this.tailTurnFrame !== undefined) {
        this.tailTurnFrame = -1;
      }
    }

    if (!step) {
      flags |= 1;
    }

    /* Steering, the engine asks where the nose of the frame before is
     * (`GetBallOffset`), its state changed since it was kept: while the head
     * tracks, its head placed again (seg7:6b38 on; the tick does it). */
    this.steeredTracking = !!this.steer && this.headTracking;

    /* Turned toward where it steers as the last frame left it (the engine
     * sets the turn as a call ends, and its fudgers take it up the next). */
    if (this.steer) {
      this.steerFrame();
    }

    if (step) {
      this.turn(step);
    }

    /* The head after the fudgers have moved the dog's angles on (`Fudger::ForAll`, seg7:6d3b, before seg7:6de2). */
    this.updateHeadTracking();

    if (step) {
      this.lastStep = step;
      this.placedThisTick.push({ step, rotation: this.rotation, placedBy });
      this.placedBy = placedBy;

      if (this.slide && this.slide.left-- > 0) {
        /* Each kept as a float (`-0x71ec`, `-0x71e8`), as the engine stores it. */
        this.slide.x = Math.fround(this.slide.x + this.slide.dx);
        this.slide.y = Math.fround(this.slide.y + this.slide.dy);
        const [x, y] = [Math.trunc(this.slide.x), Math.trunc(this.slide.y)];
        this.world.nudge?.(x - this.slide.movedX, y - this.slide.movedY);
        this.slide.movedX = x;
        this.slide.movedY = y;
      }

      /* An aim met in this pop, played ahead from the frame now placed. */
      if (this.pendingAim) {
        const aim = this.pendingAim;
        this.pendingAim = undefined;
        this.startAim(aim.ball, aim.at, this.placedThisTick[this.placedThisTick.length - 1]);
      }

      this.applyEffects(step);
    } else {
      step = { frame: this.lastStep.frame, still: true };
      this.placedBy = undefined;
    }

    /* Its middle as the frame just placed has it (`+0x86`, `+0x88`), for
     * what the tick asks after (a new target measured from it, seg16:177b). */
    this.poppedCentre =
      step && !step.still && this.world.peek && this.world.centre
        ? this.world.peek(step, this.rotation, this.placedBy, () => this.world.centre!())
        : this.poppedCentre;

    /* Reached, asked of the frame just placed (seg7:7144 on): the point
     * within the box ahead of its nose (`MakeFocusRect`), flag 2. */
    if (this.steer) {
      const shown = step;
      flags |= this.world.peek
        ? this.world.peek(shown, this.rotation, this.placedBy, () => this.steerReached())
        : this.steerReached();
    }

    /* Breathing, the frames move as far as the heart beats fast (seg7:6aea). */
    if (this.breathing) {
      this.motionTarget = Math.trunc(this.heart / 10);
    }

    this.poppedBlend =
      this.motionScale === 100 ? null : { scale: this.motionScale, reference: this.reference };
    return { step, flags };
  }

  /** What a step does besides its frame: as the frame is shown, or after a script's last. */
  private applyEffects(step: Omit<Step, 'frame'>) {
    if (step.release !== undefined) {
      this.releaseObject(step.release);
    }

    if (step.grab !== undefined) {
      this.grabbedSlot = step.grab;
      this.grabObject(step.grab);
    }

    if (step.look === 'random') {
      this.lookAtRandomPoint();
    } else if (step.look === 'user') {
      this.lookAtUser();
    } else if (step.look === 'ahead') {
      this.lookAhead();
    }

    for (const each of step.fudges ?? []) {
      this.applyFudge(each, each.frames ?? 1);
    }

    if (step.lids !== undefined) {
      this.restLids(step.lids);
    }

    if (step.blink !== undefined) {
      this.doBlink(step.blink);
    }

    if (step.breathe !== undefined) {
      this.breathe(step.breathe);
    }

    if (step.bristle !== undefined) {
      this.bristle = step.bristle;
    }

    for (const cue of step.cues ?? []) {
      this.processCue(cue);
    }
  }

  /** What followed the last frame shown, done as the next is reached. */
  private tails: Omit<Step, 'frame'>[] = [];

  /** What follows a script's last frame (`PopScript`, before the next): its turns as well. */
  private applyTail(after: Omit<Step, 'frame'>) {
    this.rotation += after.turn ?? 0;

    /* (Turned about its middle with a frame taken as the one before: for the next frame shown.) */
    if (after.turnFrame !== undefined) {
      this.tailTurnFrame = after.turnFrame;
    }

    if (after.ease) {
      this.startEase(after.ease.to, this.framesAhead());
    }

    if (after.drift !== undefined) {
      this.drift = after.drift;
    }

    this.sounds.push(...(after.sounds ?? []));
    this.sounds.push(
      ...(after.soundChoices ?? []).map((choices) => choices[this.rand() % choices.length])
    );
    this.applyEffects(after);
  }

  /**
   * A cue raised (`0x8ae3`): the states see it, and `ProcessCue` (seg7:7c1d)
   * acts on some itself: cue 2 ends a slide (`0x8af4`), cue 11 sets the
   * dog swinging from the cursor (`Fizziks`), cue 3 resets the
   * dog's easing and drift (`ResetParams`, seg7:33ae, through every
   * `Fudger`, the eyelids' tilts eased level) and what it looks at, cue 7 stops it looking at anything and
   * cue 6 lets it again.
   */
  private processCue(cue: number) {
    this.cues.add(cue);

    if (cue === 2) {
      this.slide = null;
    } else if (cue === 8) {
      this.interruptible = true;
    } else if (cue === 9) {
      this.interruptible = false;
    } else if (cue === 6) {
      this.targetsOn = true;
    } else if (cue === 7) {
      this.setHeadTarget(null);
      this.setEyeTarget(null);
      this.targetsOn = false;
    } else if (cue === 3) {
      this.resetParams();
    } else if (cue === 11) {
      /* The pick-up's: the dog swings from the cursor (seg7:7cc1, `+0x210e` 2). */
      this.swingAsked = true;
    }
  }

  /** Swinging from the cursor, dangling (`Fizziks`), and asked to start afresh. */
  private swing: Swing | null = null;
  private swingAsked = false;

  /**
   * `ScriptSprite::ResetParams` (seg7:33ae), from cue 3, `ResetScript` and
   * `ResetScriptHard`: the easing and drift of its angles stopped (every
   * `Fudger` reset), nothing looked at and looking allowed again, the eyes
   * their own size, and the eyelids and blinks as they start.
   */
  private resetParams() {
    /* (No repeat under way, seg7:347a; the script to be cut short, seg7:3502.) */
    this.repeats = [];
    this.interruptible = true;
    this.ease = null;
    this.drift = 0;
    /* (No steering, `+0x2108` 0, seg7:3484, its distance back at 4; and no slide, `-0x71f2` 0.) */
    this.steer = null;
    this.slide = null;
    /* (And the swing stopped, `+0x210e` 0, seg7:3498.) */
    this.swing = null;
    this.swingAsked = false;

    /* Every fudger stopped, and the eyelids' tilts back level at 10 a frame. */
    for (const fudger of this.fudgers) {
      fudger.by = 0;
      fudger.drift = 0;

      if (selects(BOTH_EYELID_TILTS, fudger.axis)) {
        setTarget(fudger, 0, 10);
      }
    }

    this.blinkGap = 40;
    this.blinkLength = 5;
    this.blinkAsked = 0;

    if (this.blinkAt !== 0) {
      this.blinkAt = this.blinkShut;
    }

    this.lidRest = 30;
    this.breathing = false;
    this.motionTarget = 100;
    this.targetsOn = true;
    this.lookAt(null);
    this.eyesWide = 0;
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
  /** Whether the point steered to is within the box ahead of the nose: 2, else 0. */
  private steerReached() {
    const { point, width, height, distance } = this.steer!;
    const box = this.noseBox(width, height, distance);
    const inside =
      !!box &&
      point.x >= box.left &&
      point.x < box.right &&
      point.y >= box.top &&
      point.y < box.bottom;
    return inside ? 2 : 0;
  }

  private steerFrame() {
    const centre = this.world.centre?.() ?? this.world.where();

    if (this.steerReached()) {
      return 2;
    }

    return this.steerFrom(centre);
  }

  /** The turn toward where it steers, from a middle: an ease the shorter way round. */
  private steerFrom(centre: { x: number; y: number }) {
    const { point, rate } = this.steer!;
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

  /**
   * `MakeFocusRect` (seg7:3565): a box so wide and high, its middle ahead of
   * the nose by its diagonal over a distance, the way the dog faces.
   */
  private noseBox(width: number, height: number, distance = FOCUS_DISTANCE) {
    const nose = this.askBall(NOSE);

    if (!nose) {
      return null;
    }

    const ahead = Math.trunc(Math.trunc(Math.sqrt(width * width + height * height)) / distance);
    const sine = Math.trunc(Math.sin((this.rotation * Math.PI) / 128) * 256);
    const x = nose.x - Math.trunc((256 * ahead * sine) / 65536);
    const half = { x: Math.trunc(width / 2), y: Math.trunc(height / 2) };
    return { left: x - half.x, right: x + half.x, top: nose.y - half.y, bottom: nose.y + half.y };
  }

  /** Frames queued before the next state change: what an ease is spread over. */
  private framesAhead() {
    let count = 0;

    for (const item of this.queue) {
      if ('step' in item && !item.step.reference) {
        count++;
      } else if ('goto' in item || 'end' in item) {
        /* (To the script's end, `0x8b0b` or `0x8b0c`, seg4:0f66 to 0f72.) */
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
    this.rotation += step.turn ?? 0;

    if (step.ease) {
      this.startEase(step.ease.to, step.ease.frames);
    }

    if (step.drift !== undefined) {
      this.drift = step.drift;
    }

    if (this.ease) {
      const left = wrap(this.ease.to - this.rotation);

      if (Math.abs(left) <= Math.abs(this.ease.by)) {
        this.rotation = normalise(this.ease.to);
        this.ease = null;
      } else {
        this.rotation = normalise(this.rotation + this.ease.by);
      }
    }

    /* (Drifting only where there is a drift, seg4:119b: else left as it is, unwrapped or not.) */
    if (this.drift) {
      this.rotation = normalise(this.rotation + this.drift);
    }
    this.fudgers.forEach(fudgeFrame);
  }

  /** The dog's other fudgers: its tilt, spin and roll, eyelids and the head's reach. */
  private fudgers = makeFudgers();

  /** A fudger's number. */
  private fudged(axis: number) {
    return this.fudgers.find((fudger) => fudger.axis === axis)?.value ?? 0;
  }

  /**
   * A fudger set by a script or a state: every one its axis selects. The
   * rotation is eased as the dog turns, its target the shorter way round.
   */
  private applyFudge(each: Fudge, frames: number) {
    for (const fudger of this.fudgers) {
      if (!selects(each.axis, fudger.axis)) {
        continue;
      }

      if (each.kind === 'ease') {
        fudgeTo(fudger, each.to, frames);
      } else if (each.kind === 'by') {
        setTarget(fudger, fudger.value + each.to, each.speed ?? 0);
      } else if (each.kind === 'target') {
        setTarget(fudger, each.to, each.speed ?? 0);
      } else {
        fudger.drift = each.to;
      }
    }

    if (selects(each.axis, AXIS.rotation)) {
      if (each.kind === 'ease') {
        this.startEase(each.to, frames);
      } else if (each.kind === 'drift') {
        this.drift = each.to;
      } else {
        const rotation: Fudger = {
          axis: AXIS.rotation,
          angle: true,
          value: this.rotation,
          target: 0,
          by: 0,
          drift: 0,
        };
        setTarget(
          rotation,
          each.kind === 'by' ? this.rotation + each.to : each.to,
          each.speed ?? 0
        );
        this.ease = rotation.by === 0 ? null : { to: rotation.target, by: rotation.by };
      }
    }
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
    /* (By the chest, `0x8ad7`, a word, seg21:5c48.) */
    this.glueIfNotGlued(CHEST, 1);
    /* (An enter that pops itself shows that frame this tick, as the grab's does.) */
    const entered = this.handle(state, 'enter');

    if (entered && this.state === state) {
      this.enteredStep = entered;
    }

    /* Most of the engine's handlers go on from entering to their tick's
     * work, a pop among it, in the one call (`NewState`'s dispatch with
     * `+0xe2` set, seg21:5d9c): the frame that pop shows is the tick's. */
    if (ENTER_RUNS_ON.has(state) && this.state === state) {
      const ran = this.handle(state, 'run') ?? this.pop().step;

      /* (Unless it went on into another state, whose frame stands.) */
      if (this.state === state) {
        this.enteredStep = ran;
      }
    }
  }

  /** A turn's frame met after a script's last frame (`8ae5 1 turn frame`), for the next frame shown. */
  private tailTurnFrame: number | undefined;

  /** The sounds popped since the last tick, each played as it is popped. */
  private popSounds: number[] = [];

  /** The frame the state last entered showed, going on from entering in the same call. */
  private enteredStep: Step | undefined;

  private dispatch(): Step {
    this.dryPop = false;
    this.enteredStep = undefined;
    const handled = this.handle(this.state, 'run') ?? this.pop().step;
    const step = this.enteredStep ?? handled;

    return step;
  }

  /** Whether the last pop found nothing to show. */
  private dryPop = false;

  /** A frame held to place the next by (`0x8ad3`, `+0x20aa`), taken up by a pop that ran dry. */
  private heldReference: number | undefined;

  /** A glue taken up by a pop that ran dry, for the next frame shown. */
  private heldGlue: number | undefined;

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
        return this.doAnticipatingBall(mode);
      case STATE.guardingBall:
        return this.doGuardingBall(mode);
      case STATE.ownerTooCloseToBall:
        return this.doOwnerTooCloseToBall(mode);
      case STATE.fakingBall:
        return this.doFakingBall(mode);
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
      case STATE.sprayReact:
        return this.doSprayReact(mode);
      case STATE.scruff:
        return this.doScruff(mode);
      case STATE.beggingChasingHindLegs:
        return this.doBeggingChasingHindLegs(mode);
      case STATE.leaveKennel:
        return this.doLeaveKennel(mode);
      case STATE.chasingCursor:
      case STATE.chargingCursor:
        return this.doChasingChargingCursor(mode);
      case STATE.grabbingCursor:
        return this.doGrabbingCursor(mode);
      case STATE.stalkingCursor:
        return this.doStalkingCursor(mode);
      case STATE.prowlingCursor:
        return this.doProwlingCursor(mode);
      case STATE.lungingCursor:
        return this.doLungingCursor(mode);
    }

    return undefined;
  }

  /**
   * `ScriptSprite::ResetScript` (seg7:2dd0): where the script playing may
   * not be cut short (cue 9 until cue 8, `+0x952`), or is a move under way
   * -- past its first frame, not yet at its end, from one position to
   * another -- it plays out (`ResetScriptSoft`). Else the queue is
   * cleared to the glue given (a ball of the dog's; else the one queued
   * that no frame follows; else the chest) and an end; `ResetParams`; and
   * the dog is where the script started, or, past its first frame, where it
   * ends -- and starting at 21, glued by the belly too.
   */
  private resetScript(glue = -1) {
    const script = this.data.scripts[this.begun];

    if (
      !this.interruptible ||
      (!this.scriptEnded && this.framesShown > 1 && script && script.to !== script.from)
    ) {
      this.resetSoft(glue);
      return;
    }

    const ball =
      glue >= 0 && glue < (this.data.ballCount ?? 65) ? glue : (this.gluedAhead() ?? CHEST);
    this.queue = [{ glue: ball }, { end: this.begun }];
    this.repeats = [];
    this.resetParams();

    /* And the slide it was aimed over: inferred, as the queue it counted is gone. */
    this.slide = null;

    if (script) {
      this.lastScript = this.begun;

      if (script.from !== script.to) {
        this.position = this.framesShown > 1 ? script.to : script.from;
      } else {
        this.position = script.from;

        if (this.position === 21) {
          this.push({ glue: BELLY });
        }
      }
    }
  }

  /** Whether the script playing may be cut short (`+0x952`): not from cue 9 to cue 8. */
  private interruptible = true;

  /** Whether the script playing has reached its end (`+0x94c`), and how many of its frames have been shown (`+0x94e`). */
  private scriptEnded = false;
  private framesShown = 0;

  /**
   * `ResetScriptSoft` (seg7:31f1): the script playing plays to its end, and
   * what was queued after it is dropped; then cue 3, so `ResetParams` once
   * it has played, and a glue — the one that followed, or the chest.
   */
  private resetSoft(glue = -1) {
    /* (No repeat under way, seg7:339e.) */
    this.repeats = [];
    /* Kept to the end of the script playing, or all of it where none ends
     * (seg7:3248 to 32a1); its glue the one given, a ball of the dog's, or
     * else the one `IsScriptGlued` finds ahead -- the last not followed by a
     * frame (seg7:36fb) -- else the chest (seg7:320b to 3243). */
    const glued = glue >= 0 && glue < (this.data.ballCount ?? 65) ? glue : this.gluedAhead();
    const end = this.queue.findIndex((item) => 'end' in item);
    this.queue = end === -1 ? this.queue : this.queue.slice(0, end + 1);

    /* The dog where the script playing leaves it, and that script the last
     * pushed (seg7:331e to 3345), whatever was pushed after it. */
    if (this.begun >= 0) {
      this.position = this.data.scripts[this.begun].to;
      this.lastScript = this.begun;
    }

    this.target = null;
    this.steer = null;
    /* (Cue 3, an end, and the glue: `8ae3 3 8b0b`, `8ad8 n`, seg7:3362 to 3394.) */
    this.push({ cue: 3 }, { end: this.begun }, { glue: glued ?? CHEST });
  }

  /** `IsScriptGlued` (seg7:36fb): the last glue queued that no frame follows, if any. */
  private gluedAhead(): number | undefined {
    let glued: number | undefined;

    for (const item of this.queue) {
      if ('glue' in item) {
        glued = item.glue;
      } else if ('step' in item) {
        glued = undefined;
      }
    }

    return glued;
  }

  /**
   * `IsPetTotallyOnscreenMargin` (seg21:59c9): its rectangle within the
   * stage by a margin, at most half the stage less the standard size --
   * across and down each -- the across one taken for the left and top, the
   * down one for the right and bottom, as the engine pairs them.
   */
  private isOnscreen() {
    const { x, y } = this.world.where();
    return x > 0 && y > 0 && x < this.world.width && y < this.world.height;
  }

  private isOnscreenMargin(margin: number) {
    const rect = this.world.rect?.();
    const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };

    if (!rect) {
      const { x, y } = this.world.where();
      return x > 0 && y > 0 && x < this.world.width && y < this.world.height;
    }

    const across = Math.min(margin, Math.trunc(this.world.width / 2) - width);
    const down = Math.min(margin, Math.trunc(this.world.height / 2) - height);
    return (
      rect.left > across &&
      rect.right < this.world.width - down &&
      rect.top > across &&
      rect.bottom < this.world.height - down
    );
  }

  /** `PetModule::SetupIdle`: a plan of pants and tricks, shorter the more excited the dog. */
  private setupIdle() {
    this.plan = idlePlan(this.factor(0), this.rand);
    this.planAt = 0;
  }

  /**
   * The cursor's frame the dog asks for, petted (`PushCursorRequest`): the
   * hand's 4 to 7; none, the cursor as the user has it.
   */
  hand: number | undefined;

  /** The petting hand's frame, its step and its count to the next (`+0x1232`, `+0x1236`, `+0x1234`; the step -1 as the module is made). */
  private handFrame = 0;
  private handStep = -1;
  private handCountdown = 0;

  /** Whether this tick's pop steered with the head tracking: the head placed once more. */
  private steeredTracking = false;

  /** The dog's rotation, angles and head turn and nod as the last tick left them (`BallState` `+0xec`). */
  private lastPose:
    | {
        rotation: number;
        tilt: number;
        spin: number;
        roll: number;
        yaw: number;
        pitch: number;
        /** Whether its head tracked (`+0x1e`): only then is it placed afresh. */
        tracking: boolean;
      }
    | undefined;

  /** Whether the dog has left `eIdle` since it was last made idle (`0xda`, seg16:02fe). */
  private leftIdle = false;

  /** `PetModule::DoIdle`, seg16:02ce. */
  private doIdle(mode: Mode): Step | undefined {
    const excitement = this.factor(0);

    if (mode === 'exit') {
      this.leftIdle = true;
      this.resetSoft();
      /* `ExitIdle` (seg16:00b4). */
      this.lookAt(null);
      return undefined;
    }

    if (mode === 'enter') {
      this.headWobble = 100;

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

    /* The cursor moving is watched; else, on cue 12 last frame, somewhere at random. */
    if (this.cursorMoved(1)) {
      this.lookAt(this.samples[0]);
    } else if (this.cues.has(12)) {
      this.lookAtRandomPoint();
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      /* All of it on the stage, but for half the standard width less 5 (seg16:0594 to 05b2). */
      const { width } = this.world.standardSize?.() ?? { width: 60, height: 60 };

      if (!this.isOnscreenMargin(Math.trunc(width / 2) - 5)) {
        this.newState(STATE.postLocomote);
        return step;
      }

      if (this.planAt >= this.plan.length) {
        this.newState(idleEnd(excitement, this.rand));
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
      if (this.reducedGlobal() === GLOBAL.begEat && !this.food?.held) {
        this.newState(STATE.eating);
        return undefined;
      }

      /* Its tilt eased level (`8ae6 0 0`, seg18:07bf to 07df). */
      this.push({ fudge: { kind: 'ease', axis: 0, to: 0 } });

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

    if (this.waiting && this.cursorMoved()) {
      this.lookAt(this.samples[0]);
    }

    /* Waiting, for a treat or at play for the ball (seg18:09fc to 0a0c),
     * the cursor -- what it holds -- still in a box 1.8 times the standard
     * size about the dog's middle (`MakeFocusRect`, seg18:0990 to 09e6,
     * `ds:0x20f7`; the module's `+0x86`, and its `+0xfa`, which stays 0):
     * asked before the pop (seg18:0ad8), a new state's frame the tick's. */
    if (
      this.waiting &&
      (this.reducedGlobal() === GLOBAL.begEat || this.reducedGlobal() === GLOBAL.fetch)
    ) {
      const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
      const middle = this.world.centre?.() ?? this.world.where();
      const box = this.focusRectAt(middle, Math.trunc(width * 1.8), Math.trunc(height * 1.8), 3);
      const cursor = this.samples[0];

      if (!cursor || !Pet.within(box, cursor)) {
        this.queue = [];
        this.newState(STATE.beggingChasing);
        return this.enteredStep ?? this.pop().step;
      }

      if (this.waggling) {
        this.resetSoft();
        this.newState(this.pickTrickState());
        return this.enteredStep ?? this.pop().step;
      }
    }

    const { step, flags } = this.pop();
    this.noteWaiting();

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

    /* At play, after some tricks the dog may grab the ball; else it drops it. */
    const weights = this.data.tricks[state - FIRST_TRICK];

    if (weights?.withBall) {
      this.pushBallTrick(state);
      return;
    }

    /* Glued by the chest; looking nowhere, its tilt eased level (`8af9 7ffe
     * 7ffe 8ae6 0 0`, seg21:70d4 to 711c). */
    this.glueIfNotGlued(CHEST);
    this.push({ lookAt: null }, { fudge: { kind: 'ease', axis: 0, to: 0 } });

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
    repeat(trickRepeats(trick, this.rand), () => this.pushStored(trick.script));

    if (trick.cueAround) {
      this.push({ cue: 6 });
    }
  }

  /** `PetModule::PushSleepScripts`: a plan of 10 to 24 stretches of sleep, broken now and then. */
  private pushSleepScripts() {
    const { sleep, sleepBreaks } = this.data.engineScripts;
    this.plan = sleepPlan(sleep, sleepBreaks, this.rand);
    this.planAt = 0;
  }

  /** `PetModule::DoSleeping`, seg16:198e, undisturbed. */
  private doSleeping(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.plan = [];
      this.planAt = 0;
      return undefined;
    }

    if (mode === 'enter') {
      this.lookAt(null);
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
    return pickGait(
      this.factor(0),
      this.factor(5),
      this.data.engineScripts.locomotion,
      pace,
      overrides,
      this.rand
    );
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
  /** `GetNewTarget` (seg16:177b): far enough from the dog's middle (`+0x86`, `+0x88`, seg16:1867). */
  private newTarget(distance = 400) {
    const at = this.poppedCentre ?? this.world.centre?.() ?? this.world.where();
    return pickTarget(this.world, at, distance, this.rand);
  }

  /** The dog's middle as this tick's last pop placed it, if it did. */
  private poppedCentre: { x: number; y: number } | undefined;

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
      /* And cue 3, its tilt eased level (`8ae3 3 8ae6 0 0`, seg16:129b to 12c0). */
      this.push({ cue: 3 }, { fudge: { kind: 'ease', axis: 0, to: 0 } });
      return undefined;
    }

    if (mode === 'enter') {
      this.locomotion = this.pickLocomotion(0, true);
      this.target = this.newTarget();
      this.push({ lids: this.eyelidHeight() });
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

      if (!keepsWalking(this.factor(0), this.rand)) {
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

      this.push({ lids: this.eyelidHeight() });
      this.pushStored(this.locomotion);

      /* And popped again, the gait's first frame shown this tick (seg16:1536):
       * frame 27 of the harness's day of 300, a dry call, script 9 pushed,
       * a second showing frame 15 placed from the held 25. */
      return this.pop().step ?? step;
    }

    return step;
  }

  /**
   * `PetModule::DoPostLocomote` (seg16:1544): stop and stand; or, off the
   * stage, walk back to its middle (`0x8af2`, then script 13).
   */
  private doPostLocomote(mode: Mode): Step | undefined {
    /* Leaving, nothing (seg16:1554 to 155c): no soft reset, so no cue 3 queued. */
    if (mode === 'exit') {
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
      const { width } = this.world.standardSize?.() ?? { width: 60, height: 60 };

      if (this.isOnscreenMargin(Math.trunc(width / 2) + 5)) {
        /* `rand() % 40` against its excitement, though either way it is idle
         * (the jump to sleep is never taken, seg16:15e1 to 15f7). */
        this.rand();
        this.newState(STATE.idle);
      } else {
        /* Taken to the walk's start, glued by the belly, or else not glued;
         * steered at the stage's middle as the walk begins; the walk; taken
         * on to position 24; and popped again, the first of it shown this
         * tick (seg16:160d to 1713). */
        const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };

        if (!this.pushTransition(this.data.scripts[SCRIPT.walk].from, BELLY)) {
          this.push({ glue: -1 });
        }

        this.push({
          steerAt: {
            x: Math.trunc(this.world.width / 2),
            y: Math.trunc(this.world.height / 2),
            rate: 5,
            width,
            height,
          },
        });
        this.locomotion = SCRIPT.walk;
        this.pushStored(SCRIPT.walk);
        this.pushTransition(24, BELLY);
        return this.pop().step ?? step;
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

      /* What it begs for (`0x11d4`): the food, the ball, or the shoe. */
      const held = this.heldObject();

      if (state === STATE.beggingChasing && held) {
        return { x: held.x, y: held.y };
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
      /* Looking at nothing, the script reset, its tilt eased level
       * (seg21:7b71 to 7bf2); then, from a run, maybe a hard stop. */
      this.lookAt(null);
      this.setTargetLocation(null);
      this.resetScript();
      this.push({ fudge: { kind: 'ease', axis: 0, to: 0 } });

      const stopping = [
        STATE.chasingOwner,
        STATE.chasingPetting,
        STATE.returningBallDirect,
        STATE.returningBallIndirect,
        STATE.beggingChasing,
      ] as number[];

      if (this.begun === SCRIPT.run && stopping.includes(state) && this.rand() % 3 === 0) {
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
      this.push({ lids: this.eyelidHeight() });
      this.pushStored(this.locomotion);
      this.waiting = false;
      return undefined;
    }

    if (state === STATE.beggingChasing && !this.heldObject()) {
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
      /* (Its distance a word `GetLocomotionFudge` does not set, left on the
       * stack, seg21:80fa: [[measured]] 1 chasing the ball, else 4.) */
      const distance = state === STATE.chasingBall ? 1 : FOCUS_DISTANCE;
      this.setTargetLocation(target(), TURN_RATE, box.width, box.height, distance);
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

      this.push({ lids: this.eyelidHeight() });
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

  /** The global state before this one (`0xd6`). */
  private previousGlobal = 0;

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
    if (this.global === GLOBAL.taunt && global !== GLOBAL.taunt) {
      this.exitTaunt();
    }

    if (this.reducedGlobal() === GLOBAL.fetch) {
      this.exitFetch();
    }

    this.previousGlobal = this.global;
    this.global = global;

    if (global === GLOBAL.idle) {
      this.enterIdle(state);
    } else if (global === GLOBAL.petting) {
      this.enterPetting(state);
    } else if (this.reducedGlobal() === GLOBAL.begEat) {
      this.enterBegEat(state);
    } else if (this.reducedGlobal() === GLOBAL.fetch) {
      this.enterFetch(state);
    } else if (global === GLOBAL.taunt) {
      this.enterTaunt();
    }
  }

  /** `PetModule::EnterIdle` (seg16:0000): to what is out on the desktop, or else walking. */
  private enterIdle(state: number) {
    this.leftIdle = false;
    const desktop = this.checkDesktop();

    if (desktop) {
      this.newGlobalState(desktop);
    } else {
      this.newState(state || STATE.locomote);
    }
  }

  /**
   * `PetModule::CheckDesktop` (seg16:20b6): what out of the toy box the dog
   * goes to. A treat out is begged for at once. Otherwise one of the things
   * out, not the one the dog last left until it has done something since
   * (`0xda`, set as it leaves `eIdle`): a bowl once long enough has passed
   * since it was last eaten from or held — the emptier, the longer — and
   * anything else, the ball, only by a dog excited enough, 70 and more.
   */
  private checkDesktop() {
    const foods = this.world.foods ?? [];
    const treat = [...foods].reverse().find(isTreat);

    if (treat) {
      return GLOBAL.begEat + treat.kind;
    }

    const ball = this.world.ball;
    const shoe = this.world.shoe;
    const out = [
      ...foods.map((food) => ({ global: GLOBAL.begEat + food.kind, food })),
      ...(ball ? [{ global: GLOBAL.fetch, food: null }] : []),
      ...(shoe ? [{ global: GLOBAL.taunt, food: null }] : []),
    ].filter(({ global }) => global !== this.previousGlobal || this.leftIdle);

    /* The engine starts at a random sprite of the stage's and takes the
     * first it can; here, one of these at random. */
    const r = this.rand();

    if (!out.length) {
      return 0;
    }

    const { global, food } = out[r % out.length];

    if (food && !isTreat(food)) {
      /* Minutes, of 60 ticks, from (315 − 300 × left) for food, (325 − 275 × left) for water. */
      const [most, scale] = food.kind === 0 ? [315, 300] : [325, 275];
      const wait = (most - Math.trunc((food.servings * scale) / food.full)) * 60;
      return this.time < food.touched + wait ? 0 : global;
    }

    return this.factor(0) < 70 ? 0 : global;
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

    /* `HitTestBodyArea` with a seventh of the standard width and a third of its height to spare (seg17:002c to 0078). */
    const standard = this.world.standardSize?.() ?? { width: 0, height: 0 };
    this.area = this.world.areaAt(cursor, {
      x: Math.trunc(standard.width / 7),
      y: Math.trunc(standard.height / 3),
    });
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

    /* Not while the user holds anything (`0x220`, seg17:0145). */
    if (moves < 2 || this.food?.held || this.world.holding?.()) {
      this.petting = false;
    }

    if (this.data.scripts[this.playing]?.to === 21) {
      this.petting = false;
    }

    /* Nor grabbing a treat, nor leaping for the ball (seg17:0170). */
    if (this.state === STATE.grabbingTreat || this.state === STATE.jumpingGrabbingBall) {
      this.petting = false;
    }

    if (!was && this.petting && this.global !== GLOBAL.petting) {
      this.newGlobalState(GLOBAL.petting);
    }

    /* The hand petting, its frames 4 to 7 back and forth, a step each two
     * or three frames (seg17:01da to 0292); not petting, put away. */
    if (this.petting) {
      const hand = stepHand(
        { frame: this.handFrame, step: this.handStep, countdown: this.handCountdown },
        this.rand
      );
      this.handFrame = hand.frame;
      this.handStep = hand.step;
      this.handCountdown = hand.countdown;
      this.hand = this.handFrame;
    } else if (this.global === GLOBAL.petting) {
      this.hand = undefined;
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
    this.handStep = 1;
    this.pettingLevel = 0;
    this.pickNewPetSpot();
    this.offSpot = 0;

    const rotation = this.rotation;
    const facing = (rotation < 20 && rotation > -20) || rotation > 108 || rotation < -108;
    this.newState(state || (facing ? STATE.aligningPetting : STATE.pettingGood));
  }

  /** `PetModule::PickNewPetSpot` (seg17:192b): another spot, by the spots' chances. */
  private pickNewPetSpot() {
    const picked = pickPetSpot(this.petSpot, this.data.engineScripts.petSpots, this.rand);
    this.petSpot = picked.spot;
    this.spotStrokes = picked.strokes;
  }

  /**
   * `PetModule::IsCursorOverPetSpot` (seg17:17de): within 0.8 of its ball's
   * drawn width either side of it, and 300 pixels above or below.
   */
  private isCursorOverPetSpot() {
    const cursor = this.samples[0];
    const ball = this.askBall(this.data.engineScripts.petSpots[this.petSpot].ball);

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
      if (this.cursorMoved()) {
        this.lookAt(this.samples[0]);
      }

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

      /* Before each pant the dog may look about or at the cursor
       * (`0x8afb`, `0x8af9`); the looks are not yet played. */
      waitLook(this.rand);
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
      const spot = this.askBall(this.data.engineScripts.petSpots[this.petSpot].ball);
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
      this.hand = undefined;
      return undefined;
    }

    if (mode === 'enter') {
      if (this.spotStrokes-- < 0) {
        this.pickNewPetSpot();
      }

      this.resetSoft();

      /* The hand shown petting, from its fourth frame (seg17:0e92). */
      this.hand = 4;
      this.handFrame = 4;
      this.handCountdown = 2;
      this.pettingLevel = Math.min(this.pettingLevel, 16);

      let area = -1;

      if (this.samples[0]?.button) {
        area = this.playingKind() & POSITION.lying ? 1000 : this.area;
      }

      if (area === AREA.head || area === AREA.body || area === AREA.hindquarters) {
        if (rollsOver(this.pettingLevel, this.rand)) {
          return this.pettedOnBack();
        }

        this.queue = [];
        this.push({ glue: BELLY });
        this.pushPettingEyes();

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

  /** Its eyes as it is petted (`PushPettingEyePos`), each as a script's tail. */
  private pushPettingEyes() {
    for (const after of pettingEyes(this.rand)) {
      this.push({ after });
    }
  }

  /** Petted lying down: onto its back, one of three wriggles, and maybe to sleep (seg17:0f48). */
  private pettedOnBack(): undefined {
    const rolls = this.data.engineScripts.pettedOnBack;

    this.resetSoft();
    this.pushTransition(SCRIPT.rollover, BELLY);
    this.pushPettingEyes();
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
      this.setFactor(6, Math.min(100, this.factors[6] + 5));

      const face = this.area === AREA.tongue || this.area === AREA.face;

      for (const script of pokeReaction(face, this.data.engineScripts.pokedInFace, this.rand)) {
        if (script === SCRIPT.flinch) {
          this.pushStored(script);
        } else if (script === SCRIPT.shake || script === SCRIPT.shakeOther) {
          this.push({ glue: CHEST });
          this.pushStored(script);
          this.push({ glue: CHEST });
        } else {
          this.queue = [{ glue: BELLY }];
          this.pushStored(script);
          this.pettingLevel--;
        }
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
    const global = this.reducedGlobal();
    return global === GLOBAL.fetch
      ? this.world.ball
      : global === GLOBAL.taunt
        ? this.world.shoe
        : this.food;
  }

  // Food and treats.

  /** Which food the dog is begging for or eating (`0x1242`): its kind, while the global state is its. */
  private foodKind = -1;

  /** The food at play, if it is out. */
  private get food(): Food | null {
    return this.world.foods?.find((food) => food.kind === this.foodKind) ?? null;
  }

  /**
   * How full the dog is (`0x188` of the food bowl): a mouthful from the bowl
   * adds 1, and every 420 ticks one wears off (`FoodSprite::Update`, at
   * `0x18a`). Fuller than half again a bowl, it is sick; fuller still, it
   * will not eat.
   */
  fullness = 0;
  private fullnessWears = 0;

  private wearFullness() {
    if (this.fullness > 0 && this.time > this.fullnessWears) {
      this.fullness--;
      this.fullnessWears = this.time + 420;
    }
  }

  /** Too full to eat from a bowl of so many servings, put down or held while it eats (seg20:0e86). */
  private tooFull(food: Food) {
    return food.kind === 0 && this.fullness > food.full * 1.5 + 7;
  }

  /** `PetModule::EnterBegEat` (seg18:0000): to eat a food put down, or chase one held. */
  private enterBegEat(state: number) {
    this.brainActive = false;
    this.foodKind = this.global - GLOBAL.begEat;
    this.newState(state || (this.food?.held ? STATE.beggingChasing : STATE.eating));
  }

  /**
   * A food taken out of the toy box (`FoodSprite::Update`): a bowl is filled
   * with 25 to 35 servings; then it is held, as picked up.
   */
  foodTakenOut(food: Food) {
    if (!isTreat(food)) {
      food.full = food.servings = fillBowl(this.rand);
    }

    food.touched = this.time;
    this.foodPickedUp(food);
  }

  /**
   * A food picked up, as `FoodSprite::Update` (seg20:0de4) sees it: the dog
   * begs for it; picked up while the dog eats it, the dog begs again,
   * unless it is too full.
   */
  foodPickedUp(food: Food) {
    if (this.state === STATE.eating && this.global === GLOBAL.begEat + food.kind) {
      if (this.tooFull(food)) {
        this.newGlobalState(GLOBAL.idle);
        return;
      }

      if (this.brainActive) {
        this.data.brain?.tell('[+]BringOut*', `[u]${FOOD_NAMES[food.kind]}`);
      }

      this.newState(STATE.begging);
    } else {
      this.newGlobalState(GLOBAL.begEat + food.kind);
    }
  }

  /** A food put down: the dog goes to eat it, unless too full (`FoodSprite::Update`). */
  foodPutDown(food: Food) {
    food.touched = this.time;

    if (this.brainActive) {
      this.data.brain?.tell('[w]Throw!', `[u]${FOOD_NAMES[food.kind]}`);
    }

    if (this.tooFull(food)) {
      this.newGlobalState(GLOBAL.idle);
    } else if (this.global === GLOBAL.begEat + food.kind) {
      this.newState(STATE.eating);
    } else {
      this.newGlobalState(GLOBAL.begEat + food.kind, STATE.eating);
    }
  }

  /** A food put back in its box: the dog is left alone (`FoodSprite::Update`). */
  foodPutAway() {
    if (this.reducedGlobal() === GLOBAL.begEat) {
      this.newGlobalState(GLOBAL.idle);
    }
  }

  /**
   * `PetModule::DoBegging` (seg18:0bec): sits up and begs, five to ten
   * times (script 14), for the treat held, the ball, or the shoe; settled
   * (cue 0), it follows the cursor: gone further than a box twice its
   * standard width about its belly, it chases it; come within one that
   * width, it reacts (41); both then and six frames before outside it, it
   * chases on its hind legs if the cursor is level with it, within 10 of
   * 256ths of a turn, by chance, 60 in 100 (`0x1ce4`), else shuffles after
   * it (15, then 18). Waggled at it, settled, it does a trick at once;
   * begged out, its brain is woken and a trick chosen.
   */
  private doBegging(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetScript();
      this.lookAt(null);
      return undefined;
    }

    if (mode === 'enter') {
      const food = this.food;

      if (this.reducedGlobal() === GLOBAL.begEat && food && !food.held) {
        this.newState(STATE.eating);
        return undefined;
      }

      this.headWobble = 30;
      this.waiting = false;
      /* Its tilt eased level (`8ae6 0 0`, seg18:0d07). */
      this.push({ fudge: { kind: 'ease', axis: 0, to: 0 } });
      this.pushTransition(this.data.scripts[SCRIPT.sitUp].from, BELLY);
      this.push({ cue: 0 });

      for (let times = (this.rand() % 6) + 5; times; times--) {
        this.pushStored(SCRIPT.sitUp);
      }

      return undefined;
    }

    const cursor = this.samples[0];

    if (this.waiting && cursor) {
      const belly = this.askBall(BELLY) ?? this.world.where();
      const { width } = this.world.standardSize?.() ?? { width: 60 };
      const wide = this.focusRectAt(belly, width * 2, width * 2);
      const close = this.focusRectAt(belly, width, width);
      const before = this.samples[6] ?? cursor;

      if (!Pet.within(wide, cursor)) {
        this.newState(STATE.beggingChasing);
        return this.pop().step;
      }

      if (!Pet.within(close, before) && Pet.within(close, cursor)) {
        this.resetScript(36);
        this.pushStored(SCRIPT.begReact);
        this.push({ cue: 0 }, { glue: CHEST });
        this.waiting = false;
      } else if (!Pet.within(close, before) && !Pet.within(close, cursor)) {
        const centre = this.world.centre?.() ?? this.world.where();

        if (Pet.level(centre, cursor) < 10 && this.rand() % 100 < HIND_LEGS_CHANCE) {
          this.newState(STATE.beggingChasingHindLegs);
          return this.pop().step;
        }

        this.resetScript(36);
        this.push({ steerAt: { x: cursor.x, y: cursor.y, rate: 5, width: 10, height: 10 } });
        this.pushStored(SCRIPT.begShuffle);
        /* (`8ad7 8af2 0 0 0 0 0 8ae6 0 0`: by the chest, a word; no steering; its tilt eased level, seg18:1044 to 1074.) */
        this.push(
          { glue: CHEST, words: 1 } as Item,
          { steerAt: { x: 0, y: 0, rate: 0, width: 0, height: 0 } },
          { fudge: { kind: 'ease', axis: 0, to: 0 } }
        );
        this.pushStored(SCRIPT.begShuffleBack);
        this.push({ cue: 0 }, { glue: CHEST });
        this.waiting = false;
      }
    }

    if (this.waiting && this.waggling) {
      this.resetSoft();
      this.activateBrain();
      this.newState(this.pickTrickState());
      return this.pop().step;
    }

    this.lookAt(this.samples[0]);
    const { step, flags } = this.pop();

    if (flags & 1) {
      this.activateBrain();
      this.newState(this.pickTrickState());
      return step;
    }

    if (this.cues.has(0)) {
      this.waiting = true;
    }

    if (this.cues.has(1)) {
      this.waiting = false;
    }

    return step;
  }

  /**
   * `PetModule::DoBeggingChasingHindLegs` (seg18:23f2): on its hind legs
   * (script 33, once or twice), it steers at the treat — or the cursor —
   * with a box half its standard width and 40 more; then a trick.
   */
  private doBeggingChasingHindLegs(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetScript();
      return undefined;
    }

    if (mode === 'enter') {
      const { width } = this.world.standardSize?.() ?? { width: 60 };
      const food = this.reducedGlobal() === GLOBAL.begEat ? this.food : null;
      const at = food ?? this.samples[0] ?? this.world.where();
      const box = Math.trunc(width / 2) + 40;
      this.push({ cue: 3 }, { steerAt: { x: at.x, y: at.y, rate: 5, width: box, height: box } });

      for (let n = (this.rand() % 2) + 1; n > 0; n--) {
        this.pushStored(SCRIPT.hindLegsWalk);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newState(this.pickTrickState());
    }

    return step;
  }

  /**
   * How level a point is with another (seg11:1f57): the angle between
   * them, in 256ths of a turn, folded to between 0, level, and 64, one
   * above the other.
   */
  private static level(from: { x: number; y: number }, to: { x: number; y: number }) {
    let angle = Math.trunc((Math.atan2(to.y - from.y, to.x - from.x) * 128) / Math.PI);

    if (angle < 0) {
      angle += 128;
    }

    return angle > 63 ? 128 - angle : angle;
  }

  /** `MakeFocusRect` (seg7:3565) about a point: a box so wide and high, ahead of it the way the dog faces. */
  private focusRectAt(
    point: { x: number; y: number },
    width: number,
    height: number,
    distance = FOCUS_DISTANCE
  ) {
    const [w, h] = [Math.trunc(width), Math.trunc(height)];
    const ahead = Math.trunc(Math.trunc(Math.sqrt(w * w + h * h)) / distance);
    const sine = Math.trunc(Math.sin((this.rotation * Math.PI) / 128) * 256);
    const x = point.x - Math.trunc((256 * ahead * sine) / 65536);
    return {
      left: x - Math.trunc(w / 2),
      right: x + Math.trunc(w / 2),
      top: point.y - Math.trunc(h / 2),
      bottom: point.y + Math.trunc(h / 2),
    };
  }

  /**
   * `PetModule::ActivateBrain` (seg18:290d): begging, from now on the brain
   * chooses. Its desires are cleared, and it is told the treat was brought
   * out, which sets the desire of the treat's colour.
   */
  private activateBrain() {
    const treat = this.food;

    if (this.reducedGlobal() === GLOBAL.begEat && !this.brainActive) {
      this.brainActive = true;
      this.data.brain?.zeroOutDesires();
      this.data.brain?.tell('[+]BringOut*', `[u]${treat ? FOOD_NAMES[treat.kind] : ''}`);
    }
  }

  /**
   * `PetModule::PickTrickState` (seg21:6907), begging: frustrated, the dog
   * may grab the treat; with the brain awake, a trick, its choice or else
   * one at random that needs no ball; without, it begs on.
   */
  pickTrickState(): number {
    const treat = this.food;

    if (this.reducedGlobal() === GLOBAL.fetch) {
      return this.pickPlayTrick();
    }

    /* Only a treat is snatched; a bowl, never (seg21:6927). */
    if (this.reducedGlobal() === GLOBAL.begEat && treat?.held && isTreat(treat)) {
      this.setFactor(9, Math.min(100, this.factors[9] + 4));

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
    const grab = this.rand() % range < this.factor(9) && this.rand() % range < this.factor(2);
    this.grabDecisions = [grab, ...this.grabDecisions].slice(0, 5);
    return grab;
  }

  /** The last few decisions to snatch, newest first (`0x1262`, and `0x1264` on). */
  private grabDecisions: boolean[] = [];

  /** `PetModule::PushBegWaitLoops` (seg18:25e0): pants, waiting for the treat after a trick. */
  private pushBegWaitLoops() {
    const excitement = this.factor(0);
    const fetch = this.reducedGlobal() === GLOBAL.fetch;
    let waited = false;

    for (const step of begWaitLoops(
      excitement,
      /* At play, a held ball makes the dog keener: fewer pants, maybe none. */
      fetch ? excitement + (this.world.ball?.held ? 30 : 0) : undefined,
      this.position === SITTING,
      this.rand
    )) {
      if ('begin' in step) {
        waited = true;

        if (fetch) {
          this.pushBallReleaseAction();
        }

        /* (`8ad7`, a word, seg18:26a8.) */
        this.push({ glue: CHEST, words: 1 } as Item);
      } else if ('settle' in step) {
        this.pushTransition(
          this.data.scripts[step.settle ? SCRIPT.sitPant : SCRIPT.pant].from,
          BELLY
        );
        this.push({ cue: 0 });
      } else if ('pant' in step) {
        /* Its look first, at the user, the cursor or what is held (`0x8afb`,
         * `0x8afe 6`, `0x8afe 7`, seg18:2804 to 2853). */
        if (step.look !== undefined) {
          this.push({ seek: (['user', 'cursor', 'held'] as const)[step.look] });
        }

        this.pushStored(step.pant ? SCRIPT.sitPant : SCRIPT.pant);
      } else {
        this.pushStored(step.longer ? SCRIPT.sitPantLonger : SCRIPT.pantLonger);
      }
    }

    if (!waited) {
      return;
    }

    this.push({ glue: CHEST });
  }

  /**
   * `PetModule::DoEating` (seg18:12cb): goes to the food and eats it. A
   * treat is one bite, and the bite (cue 10) rewards the trick last done if
   * the brain was not yet awake. A bowl is eaten from a mouthful at a time,
   * each a serving (cue 12), until it is empty or the dog is sick of it; or
   * lapped, three to six times. The walk to the food is simplified.
   */
  private doEating(mode: Mode): Step | undefined {
    const food = this.food;

    if (mode === 'exit') {
      if (food) {
        food.beingEaten = false;
        food.touched = this.time;
      }

      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      if (!food) {
        this.newGlobalState(GLOBAL.idle);
        return undefined;
      }

      this.resetScript();
      this.target = null;
      this.setTargetLocation(null);

      if (!this.foodInReach(food)) {
        this.target = { x: food.x, y: food.y };
        this.locomotion = this.pickLocomotion();
        this.pushLocomotion();
      } else {
        this.eat(food);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    /* From cue 0 the food is drawn with the dog, under its head, until cue 13 or eaten (seg18:1c62). */
    if (this.cues.has(0) && food && !food.held) {
      food.beingEaten = true;
    }

    if (this.cues.has(13) && food) {
      food.beingEaten = false;
    }

    if (this.cues.has(10) && food && isTreat(food)) {
      this.world.putAwayFood?.(food);
      this.setFactor(9, this.centres[9]);

      if (!this.brainActive) {
        this.positiveReinforcement();
      }
    }

    if (this.cues.has(12) && food) {
      this.mouthful(food);
    }

    /* The bowl taken from under its nose: after it again (seg18:2041, the engine chasing it as `0x26`). */
    if (this.cues.has(14) && food && !this.atBowl(food)) {
      this.newState(STATE.eating);
      return step;
    }

    if (this.target && food && (flags & 2 || this.foodInReach(food))) {
      this.target = null;
      this.setTargetLocation(null);
      this.queue = this.queue.filter((item) => !('step' in item));
      this.eat(food);
    } else if (flags & 1) {
      if (this.target && food) {
        this.pushLocomotion();
      } else {
        this.newGlobalState(GLOBAL.idle);
      }
    }

    return step;
  }

  /**
   * The dog lined up to eat (seg18:14d9 to 1c4e): it sits up, unless
   * running, turns towards the food if it faces the other way, and its nose
   * is slid to just above it, higher the older the dog. Then a treat is one
   * bite (script 86); a bowl is stood over (37), and eaten from (36, with
   * 54 now and then and 328 every so often) a mouthful a serving left, or
   * lapped (262) three to six times.
   */
  private eat(food: Food) {
    const range = (n: number) => Math.trunc(((this.factor(10) - 1) * n) / 100);
    let lift: number;

    if (this.position === RUNNING) {
      lift = range(13) + 49;
    } else {
      lift = range(10) + 40;

      if (this.position !== SITTING_UP) {
        this.pushTransition(SITTING_UP, BELLY);
        this.push({ glue: CHEST });
      }
    }

    /* The engine lifts it 0 to 7 more when the pet sprite's slot 0x80 says 1; not yet read. */
    const across = Math.trunc(-this.rotation / 16);
    this.push({ cue: 3 });

    const nose = this.askBall(NOSE);
    const turn = nose ? Math.max(-0x40, Math.min(0x40, Math.trunc((nose.x - food.x) / 3))) : 0;

    if ((turn > 0 && this.rotation < 0) || (turn < 0 && this.rotation > 0)) {
      this.push({ ease: turn });
    }

    /* `0x8ae8 0 0 6`, turning towards it, is not yet played. */
    this.push({ aim: { ball: NOSE, at: { x: food.x + across, y: food.y - lift } } });

    if (isTreat(food)) {
      this.pushTransition(this.data.scripts[SCRIPT.eatTreat].from, BELLY);
      this.push({ cue: 0 }, { glue: CHEST }, { cue: 3 });
      this.pushStored(SCRIPT.eatTreat);
      return;
    }

    this.pushTransition(this.data.scripts[SCRIPT.standOverBowl].from, BELLY);
    this.push({ cue: 0 }, { glue: CHEST }, { cue: 3 });
    this.pushTransition(this.data.scripts[SCRIPT.eatFromBowl].from, BELLY);
    this.push({ cue: 14 });

    if (food.kind === 0) {
      for (const step of bowlPlan(food.servings, this.rand)) {
        if (step === 'mouthful') {
          this.pushStored(SCRIPT.eatFromBowl);
        } else if (step === 'more') {
          this.pushStored(SCRIPT.eatFromBowlMore);
        } else if (step === 'pause') {
          this.pushStored(SCRIPT.eatFromBowlPause);
        } else {
          this.push({ cue: 12 });
        }
      }

      if (food.servings !== 0) {
        this.push({ cue: 13 });
      }
    } else {
      /* Laps by how full it was filled, not by what is left. */
      const laps = lapsOf(food.full, this.rand);

      for (let n = 0; n < laps; n++) {
        this.pushStored(SCRIPT.lap);
        this.push({ cue: 12 });
      }
    }
  }

  /**
   * Cue 12, a mouthful (seg18:1c4e on): a serving less in the bowl; from the
   * food bowl, the dog fuller, and fuller than half again the bowl it is
   * sick of it: it stops after this mouthful, stands and is sick (script 287), and is calmed to
   * an excitement under 10.
   */
  private mouthful(food: Food) {
    food.servings = Math.max(0, food.servings - 1);

    if (food.kind !== 0) {
      return;
    }

    this.fullness++;

    if (this.fullness > food.full * 1.5) {
      this.fullness += 5;

      /* `ResetScriptSoft` (vtable 0x2c): the mouthful playing finishes. */
      this.resetSoft();
      this.push({ cue: 13 });
      this.pushTransition(STANDING, BELLY);
      this.push({ glue: BELLY });
      this.pushStored(SCRIPT.sick);
      this.push({ factor: [0, this.rand() % 10] });
    }
  }

  /**
   * Whether the dog can eat the food where it stands: the box ahead of its
   * nose, a walk's (`0xc8`, seg18:1460 on), meets the food's rectangle; else
   * it walks to it. Which box the engine takes is the target's last set,
   * inferred to be a walk's.
   */
  private foodInReach(food: Food) {
    const { width, height } = this.locomotionFudge(SCRIPT.walk);
    const box = this.noseBox(width, height);
    const rect = ballRect(food, foodSize(food));

    if (!box) {
      return this.near(food);
    }

    return (
      box.left < rect.right &&
      rect.left < box.right &&
      box.top < rect.bottom &&
      rect.top < box.bottom
    );
  }

  /** Cue 14: the dog's tongue on the bowl, within 14 of its sides and up to 20 above it (seg18:2041). */
  private atBowl(food: Food) {
    const tongue = this.askBall(63);

    if (!tongue) {
      return true;
    }

    const rect = ballRect(food, foodSize(food));
    return (
      tongue.x >= rect.left + 14 &&
      tongue.x < rect.right - 14 &&
      tongue.y >= rect.top - 20 &&
      tongue.y < rect.bottom
    );
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
      this.setFactor(9, this.centres[9]);
      if (this.food) {
        this.world.putAwayFood?.(this.food);
      }
    }

    if (flags & 1) {
      this.newGlobalState(GLOBAL.idle);
    }

    return step;
  }

  // The taunt: the shoe.

  /** The slot an object was grabbed into this frame (`0xe4` of the sprite, -1 for none). */
  private grabbedSlot = -1;

  /** Whether the chase has got going, the shoe in hand, the dog hanging (`0x222`). */
  private going = false;

  /** Where the dog grabs or lunges for the shoe (`0x127c`). */
  private reachFor = { x: 0, y: 0 };

  /** Whether the dog hung from the shoe at its last lunge (`DAT_310c`). */
  private hungLast = false;

  /** The dog's chin held to the shoe while it hangs from it. */
  private pinned: Tick['pinned'] | null = null;

  /**
   * The shoe picked up (`ShoeSprite::Update`, seg20:3759): the taunt
   * begins, and the dog, letting go of it if it had it, charges at once.
   */
  shoePickedUp() {
    if (this.global !== GLOBAL.taunt) {
      this.newGlobalState(GLOBAL.taunt);
    }

    this.releaseObject(4);
    this.newState(STATE.chargingCursor);
  }

  /** The shoe put back in its box: the dog is left alone. */
  shoePutAway() {
    if (this.global === GLOBAL.taunt) {
      this.newGlobalState(GLOBAL.idle);
    }
  }

  /** The shoe's middle, which the dog goes for (`0x86` of the sprite at `0x74`). */
  private shoeAt() {
    const shoe = this.world.shoe;
    return shoe ? { x: shoe.x, y: shoe.y } : (this.samples[0] ?? this.world.where());
  }

  /**
   * `MakeFocusRect` (seg7:3565) about the dog's middle: a box so many times
   * its standard size, ahead of it by its diagonal over a distance.
   */
  private focusRect(scale: number, distance: number) {
    const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
    const [w, h] = [Math.trunc(width * scale), Math.trunc(height * scale)];
    const centre = this.world.centre?.() ?? this.world.where();
    const ahead = Math.trunc(Math.trunc(Math.sqrt(w * w + h * h)) / distance);
    const sine = Math.trunc(Math.sin((this.rotation * Math.PI) / 128) * 256);
    const x = centre.x - Math.trunc((256 * ahead * sine) / 65536);
    return {
      left: x - Math.trunc(w / 2),
      right: x + Math.trunc(w / 2),
      top: centre.y - Math.trunc(h / 2),
      bottom: centre.y + Math.trunc(h / 2),
    };
  }

  private static within(
    rect: { left: number; right: number; top: number; bottom: number },
    point: { x: number; y: number }
  ) {
    return (
      point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
    );
  }

  /** Within the dog's reach to lunge: 2.1 standard sizes, raised by half its height. */
  private lungeRect() {
    const rect = this.focusRect(2.1, 2);
    const { height } = this.world.standardSize?.() ?? { height: 60 };
    rect.top -= Math.trunc(height / 2);
    return rect;
  }

  /** How far the cursor has gone over the last frames (`0x19e` on, each frame's distance). */
  private cursorTravel(frames: number) {
    let travel = 0;

    for (let n = 0; n < frames; n++) {
      const [a, b] = [this.samples[n], this.samples[n + 1]];

      if (a && b) {
        travel = Math.trunc(travel + Math.hypot(a.x - b.x, a.y - b.y));
      }
    }

    return travel;
  }

  /** How far the shoe is from where the cursor was so many frames ago (`0xea` on). */
  private shoeMoved(frames: number) {
    const then = this.samples[frames];
    const shoe = this.shoeAt();
    return then ? Math.hypot(shoe.x - then.x, shoe.y - then.y) : 0;
  }

  /** `DecideChasingChargingCursor` (seg3:1d71): charges, the more excited the likelier. */
  private decideChasingCharging() {
    return chaseOrCharge(this.factor(0), this.rand);
  }

  /**
   * `PetModule::EnterTaunt` (seg3:0000): with the shoe close, the dog grabs
   * at it; within reach, it lunges; else it chases or charges.
   */
  private enterTaunt() {
    const shoe = this.shoeAt();

    if (Pet.within(this.focusRect(0.6, 4), shoe)) {
      this.newState(STATE.grabbingCursor);
    } else if (Pet.within(this.lungeRect(), shoe)) {
      this.newState(STATE.lungingCursor);
    } else {
      this.newState(this.decideChasingCharging());
    }
  }

  /** `PetModule::ExitTaunt` (seg3:016e): the shoe let go of. */
  private exitTaunt() {
    this.resetScript();
    this.releaseObject(4);
    this.pinned = null;
  }

  /**
   * `PetModule::DoChasingChargingCursor` (seg3:01d9): runs at the shoe,
   * steering at it from its first stride. The shoe held still, far off, it
   * prowls instead (but not charging); now and then, by its excitement, it
   * lunges if the shoe is within reach; at it, it grabs, unless the cursor
   * is going too fast. It looks at the shoe all the while.
   */
  private doChasingChargingCursor(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();

      /* Level, and the head's reach back to all of it (`HeadTrackMaxAll`, which moves no fudger). */
      this.push(
        { fudge: { kind: 'ease', axis: AXIS.tilt, to: 0 } },
        { fudge: { kind: 'ease', axis: HEAD_TRACK_MAX_ALL, to: 100 } }
      );
      this.headWobble = 100;
      return undefined;
    }

    if (mode === 'enter') {
      /* Its head's reach a fifth (which moves no fudger), and wobbling a fifth as much. */
      this.push({ fudge: { kind: 'ease', axis: HEAD_TRACK_MAX_ALL, to: 20 } });
      this.pushStored(SCRIPT.run);
      this.headWobble = 20;
      this.going = false;
      return undefined;
    }

    const shoe = this.shoeAt();
    const still = this.shoeMoved(1) < 1;

    if (
      still &&
      this.going &&
      !Pet.within(this.focusRect(4, 4), shoe) &&
      this.isOnscreen() &&
      this.state !== STATE.chargingCursor
    ) {
      this.resetScript();
      this.newState(STATE.prowlingCursor);
      return this.pop().step;
    }

    if (lungeChance(this.factor(0), this.rand) && Pet.within(this.lungeRect(), shoe)) {
      this.resetScript();
      this.newState(STATE.lungingCursor);
      return this.pop().step;
    }

    this.lookAt(shoe);
    const { step, flags } = this.pop();

    if (flags & 1) {
      this.pushStored(SCRIPT.run);
    }

    if (flags & 2) {
      if (this.cursorTravel(3) < 30) {
        this.resetScript(CHEST);
        this.newState(STATE.grabbingCursor);
        return step;
      }

      this.pushStored(SCRIPT.run);
    }

    if (this.cues.has(4)) {
      this.going = true;
    }

    if (this.going) {
      const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
      this.setTargetLocation(shoe, TURN_RATE, width, height);
    }

    return step;
  }

  /**
   * `PetModule::DoGrabbingCursor` (seg3:06ac): snaps its chin at where it
   * was going — on the run in one (script 1), else reaching (215, 214) —
   * and shakes it (130) two or three times. Grabbed, the shoe goes with its
   * chin and the cursor with it, a tug of war, until it is pulled 75 away;
   * moved 15 from where it snapped, it was missed.
   */
  private doGrabbingCursor(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.reachFor = this.steer ? { ...this.steer.point } : this.shoeAt();
      const at = { ...this.reachFor };

      if (this.position === RUNNING) {
        this.push({ aim: { ball: 51, at } });
        this.pushStored(SCRIPT.grabShoeRunning);
      } else {
        this.pushStored(SCRIPT.reachForShoe);
        this.push(
          { glue: CHEST },
          { steerAt: { ...at, rate: TURN_RATE, width: 0, height: 0 } },
          { aim: { ball: 51, at } }
        );
        this.pushStored(SCRIPT.grabShoe);
        this.push({ cue: 3 });
      }

      this.push({ glue: CHEST });

      for (let n = (this.rand() % 2) + 2; n > 0; n--) {
        this.pushStored(SCRIPT.shakeShoe);
      }

      this.going = false;
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      this.newGlobalState(GLOBAL.idle);
      return step;
    }

    const shoe = this.world.shoe;

    if (this.grabbedSlot === 4) {
      this.going = true;
      const at = this.shoeAt();

      if (Math.hypot(at.x - this.reachFor.x, at.y - this.reachFor.y) > 15) {
        this.resetScript(CHEST);
        this.newState(this.decideChasingCharging());
      }
    } else if (this.going && shoe) {
      const chin = this.askBall(51);

      if (chin && Math.hypot(chin.x - shoe.x, chin.y - shoe.y) > 75) {
        this.resetScript(36);
        this.newState(this.decideChasingCharging());
      } else if (chin) {
        shoe.x = Math.trunc(chin.x);
        shoe.y = Math.trunc(chin.y);

        if (shoe.held) {
          this.world.moveCursor?.(shoe);
        }
      }
    }

    return step;
  }

  /**
   * After the shoe jumps, while stalking or prowling: it lunges if the shoe
   * is in reach, else chases or charges (seg3:0cf9 and 11a5 on).
   */
  private shoeJumped() {
    if (!this.going || this.shoeMoved(2) <= 15) {
      return false;
    }

    this.resetScript(36);
    this.newState(
      Pet.within(this.lungeRect(), this.shoeAt())
        ? STATE.lungingCursor
        : this.decideChasingCharging()
    );
    return true;
  }

  /**
   * `PetModule::DoStalkingCursor` (seg3:0b08): creeps after the shoe
   * (script 206, three to five times); a sudden move of it sets it off; at
   * it, it grabs; done creeping, it prowls.
   */
  private doStalkingCursor(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      this.pushTransition(this.data.scripts[SCRIPT.stalk].from, BELLY);
      this.push({ cue: 0 });

      for (let n = (this.rand() % 3) + 3; n > 0; n--) {
        this.pushStored(SCRIPT.stalk);
      }

      this.going = false;
      return undefined;
    }

    if (!this.isOnscreen() && this.going) {
      this.resetScript();
      this.newState(this.decideChasingCharging());
      return this.pop().step;
    }

    if (this.shoeJumped()) {
      return this.pop().step;
    }

    if (this.going) {
      const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
      this.setTargetLocation(
        this.shoeAt(),
        TURN_RATE,
        Math.trunc(width * 1.2),
        Math.trunc(height * 1.2)
      );
    }

    this.lookAt(this.shoeAt());
    const { step, flags } = this.pop();

    if (this.cues.has(0)) {
      this.going = true;
    }

    if (flags & 1) {
      this.newState(STATE.prowlingCursor);
    } else if (flags & 2) {
      this.resetScript(BELLY);
      this.newState(STATE.grabbingCursor);
    }

    return step;
  }

  /**
   * `PetModule::DoProwlingCursor` (seg3:0f3c): stops, turned towards the
   * shoe if it was running, and pants, fewer times the more excited it is,
   * watching. A sudden move of the shoe sets it off; done, it lunges if the
   * shoe is in reach, else stalks it, two times in three, or chases.
   */
  private doProwlingCursor(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

    if (mode === 'enter') {
      if (this.position === RUNNING) {
        const centre = this.world.centre?.() ?? this.world.where();
        const turn = Math.max(-0x40, Math.min(0x40, Math.trunc(centre.x - this.shoeAt().x)));
        this.push({ ease: turn });
      }

      this.pushTransition(this.data.scripts[SCRIPT.pant].from, BELLY);
      this.push({ cue: 0 });

      let pants = Math.trunc((100 - this.factor(0)) / 20);

      if (pants) {
        pants += this.rand() % pants;
      }

      this.pushTransition(STANDING, BELLY);

      for (; pants > 0; pants--) {
        this.pushStored(SCRIPT.pant);
      }

      this.going = false;
      return undefined;
    }

    if (!this.isOnscreen() && this.going) {
      this.resetScript();
      this.newState(this.decideChasingCharging());
      return this.pop().step;
    }

    if (this.shoeJumped()) {
      return this.pop().step;
    }

    this.lookAt(this.shoeAt());
    const { step, flags } = this.pop();

    if (this.cues.has(0)) {
      this.going = true;
    }

    if (flags & 1) {
      if (Pet.within(this.lungeRect(), this.shoeAt())) {
        this.newState(STATE.lungingCursor);
      } else if (this.rand() % 3 !== 0) {
        this.newState(STATE.stalkingCursor);
      } else {
        this.newState(this.decideChasingCharging());
      }
    }

    return step;
  }

  /**
   * `PetModule::DoLungingCursor` (seg3:141a): gathers itself (script 187)
   * and leaps (168), its chin at the shoe, within its reach. Landing within
   * 50 of it, it hangs from it (167, then 169 six to seventeen times),
   * swaying: its chin held to the shoe, so the user swings it about. Let go
   * of, it drops with the shoe and shakes it (130); swung too fast, it
   * falls off. Missing, it drops back (171), maybe looking about.
   */
  private doLungingCursor(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetSoft();
      this.push({ drift: 0 });
      this.pinned = null;
      return undefined;
    }

    if (mode === 'enter') {
      this.resetScript();
      this.reachFor = this.shoeAt();
      this.pushStored(SCRIPT.gatherToLunge);
      this.push({ cue: 12 });
      this.going = false;
      return undefined;
    }

    this.lookAt(this.shoeAt());
    const shoe = this.world.shoe;
    const { step, flags } = this.pop();

    if (this.cues.has(12)) {
      const reach = this.lungeRect();
      const at = this.shoeAt();
      this.reachFor = {
        x: Math.min(Math.max(at.x, reach.left), reach.right),
        y: Math.min(Math.max(at.y, reach.top), reach.bottom),
      };
      this.push({ aim: { ball: 51, at: { ...this.reachFor } } });
      this.pushStored(SCRIPT.lunge);
      this.push({ cue: 13 });
    } else if (this.cues.has(13)) {
      const at = this.shoeAt();

      if (Math.hypot(this.reachFor.x - at.x, this.reachFor.y - at.y) < 50) {
        this.hungLast = true;
        this.going = true;
        this.grabObject(4);
        this.pushTransition(this.data.scripts[SCRIPT.hang].from, BELLY);
        this.push({ drift: 5 - (this.rand() % 11) });
        this.pushStored(SCRIPT.hang);

        for (let n = (this.rand() % 12) + 6; n > 0; n--) {
          this.pushStored(SCRIPT.dangle);
        }
      } else {
        this.hungLast = false;
        this.pushStored(SCRIPT.landFromLunge);

        if (this.rand() % 3 !== 0) {
          this.push({ glue: CHEST });
          this.pushStored(this.rand() % 2 ? SCRIPT.lookAgain : SCRIPT.lookAbout);
          this.push({ glue: CHEST });
        }
      }
    } else if (flags & 1) {
      this.afterLunge();
      return step;
    }

    if (this.going) {
      this.pinned = { ball: 51, ...this.shoeAt() };

      if (!shoe?.held) {
        /* Let go of: down it comes with the shoe, and shakes it. */
        this.going = false;
        this.pinned = null;
        this.resetScript();
        this.push({ grab: 4 });
        this.pushStored(SCRIPT.shakeShoe);
        this.push({ release: 4 });
      }

      if (this.cursorTravel(3) > 230) {
        this.pinned = null;
        this.going = false;
        this.resetScript();
        const global = this.reducedGlobal();
        this.newState(
          global === GLOBAL.begEat || global === GLOBAL.fetch
            ? this.pickTrickState()
            : this.decideChasingCharging()
        );
      }
    } else {
      this.pinned = null;
    }

    return step;
  }

  /**
   * The lunge done (seg3:1990 on): after it, a dog that hung last time, not
   * excited enough, is done; the shoe held, or down on the stage away from
   * its edges, it goes again; else it is done.
   */
  private afterLunge() {
    const global = this.reducedGlobal();

    if (global === GLOBAL.begEat || global === GLOBAL.fetch) {
      this.newState(this.pickTrickState());
      return;
    }

    /* The stage, 80 in from each side, and less a third of its height on
     * the right, as the engine has it (seg3:19cf). */
    const area = {
      left: 80,
      top: 0,
      right: this.world.width - 80 - Math.trunc(this.world.height / 3),
      bottom: this.world.height,
    };
    const shoe = this.world.shoe;

    if (this.factor(0) < this.rand() % 100 && this.hungLast) {
      this.newGlobalState(GLOBAL.idle);
    } else if (shoe?.held || (shoe && Pet.within(area, shoe))) {
      this.newState(this.decideChasingCharging());
    } else {
      this.newGlobalState(GLOBAL.idle);
    }
  }

  // Fetch: guarding, the owner too close, and faking.

  /** Whether the dog leaps for a ball that will bounce once, decided at each throw (`0x19e` of the ball). */
  private leapsBounce = false;

  /**
   * How far the cursor must jerk back for a throw to be taken as a fake
   * (`BallSprite::theirFakeDistance`, 0 to start): 50 more for each fake,
   * 13 less, to no less than 50, for each throw.
   */
  private fakeDistance = 0;

  /** The guarding dog's rounds left (`0x127a`). */
  private guardRounds = 0;

  /** Where the dog runs to after a fake (DS:0x3b92). */
  private fakeTarget = { x: 0, y: 0 };

  /**
   * The fake throw (`BallSprite::Update`, seg20:20b8, to 25fe): the ball
   * held, and the dog moving, standing or sitting up, the cursor's
   * distances from where it was the last four frames are taken in turn;
   * one falling by more than the fake distance, and none rising by more
   * after it, is a throw pulled back. The fourth is from where the ball's
   * holder flags would be read as a point, (0, 0) while the user holds it.
   */
  private checkFake() {
    const ball = this.world.ball;
    const now = this.samples[0];

    if (!ball?.held || !now || this.state === STATE.fakingBall) {
      return;
    }

    const moving = (this.playingKind() & POSITION.moving) !== 0;

    if (!moving && this.position !== STANDING && this.position !== SITTING_UP) {
      return;
    }

    let falling = true;
    let fake = true;
    let was = -5000;

    for (let n = 1; n < 5; n++) {
      const then = n < 4 ? this.samples[n] : { x: 0, y: 0 };

      if (!then) {
        return;
      }

      const distance = Math.trunc(Math.hypot(now.x - then.x, now.y - then.y));

      if (!falling && distance - was > this.fakeDistance) {
        fake = false;
        break;
      }

      if (falling && distance - was < -this.fakeDistance) {
        falling = false;
      }

      was = distance;
    }

    if (fake && !falling) {
      this.fakeDistance += 50;
      this.newState(STATE.fakingBall);
    }
  }

  private totallyOnscreen() {
    const rect = this.world.rect?.();
    return (
      !!rect &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= this.world.width &&
      rect.bottom <= this.world.height
    );
  }

  private totallyOffscreen() {
    const rect = this.world.rect?.();
    return (
      !!rect &&
      (rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > this.world.width ||
        rect.top > this.world.height)
    );
  }

  /**
   * `PetModule::DoFakingBall` (seg19:1a98): fooled, the dog runs where the
   * ball seemed bound, then, at the end of its run or once off the stage,
   * looks about (script 60) and begs for the ball still held. Where it
   * runs is fifteen times the longest step of the ball's last four places
   * on from the earlier — with, as the engine has it, the step's x for its
   * y too — and then turned to its negative, which is off the stage, up
   * and to the left (seg19:1c9d).
   */
  private doFakingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.setTargetLocation(null);
      return undefined;
    }

    if (mode === 'enter') {
      const places = this.samples.slice(0, 4);
      let best = 0;
      let [a, b] = [places[0], places[0]];

      places.forEach((from, i) =>
        places.slice(0, i).forEach((to) => {
          const d2 = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;

          if (d2 > best) {
            best = d2;
            [a, b] = [from, to];
          }
        })
      );

      if (a && b) {
        this.fakeTarget = {
          x: -((b.x - a.x) * 15 + a.x),
          y: -((b.x - a.y) * 15 + a.y),
        };
      }

      this.resetScript(36);
      this.pushTransition(this.data.scripts[SCRIPT.run].from, BELLY);
      this.push({ glue: CHEST });

      for (let n = this.rand() % 2; n > 0; n--) {
        this.pushStored(SCRIPT.run);
      }

      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags & 1 || this.totallyOffscreen()) {
      if (this.totallyOnscreen()) {
        this.pushStored(SCRIPT.lookAgain);
      }

      this.newState(this.world.ball?.held ? STATE.begging : STATE.anticipatingBall);
    } else if (this.cues.has(4)) {
      const { width } = this.world.standardSize?.() ?? { width: 60 };
      this.setTargetLocation(this.fakeTarget, 5, width, Math.trunc(width / 2));
    }

    return step;
  }

  /**
   * `PetModule::DoGuardingBall` (seg19:1ec7): the naughty dog guards the
   * ball dropped, panting, for 2 to 5 rounds, more the naughtier, with a
   * trick between; called, unless naughty again, it gives up and waits for
   * the throw. Its head off the stage, it takes the ball off, or goes after
   * it. The cursor within 180 of the ball, or come 40 nearer it over three
   * frames, and the owner is too close. Its head following the cursor is
   * not yet played.
   */
  private doGuardingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetScript();
      this.lookAt(null);
      return undefined;
    }

    if (mode === 'enter') {
      this.guardRounds = Math.trunc(((this.factor(1) - 1) * 4) / 100) + 2;
      this.pushBegWaitLoops();
      return undefined;
    }

    if (!this.isOnscreen()) {
      this.newState(this.isBallGrabbable() ? STATE.returningBallIndirect : STATE.chasingBall);
      return this.pop().step;
    }

    if (this.cursorMoved()) {
      this.lookAt(this.samples[0]);
    }

    if (this.called && !this.decideIfNaughty()) {
      this.newState(STATE.anticipatingBall);
      return this.pop().step;
    }

    const { step, flags } = this.pop();

    if (flags & 8) {
      this.resetScript();
      this.newState(this.gotoState);
    } else if (flags & 1) {
      if (this.guardRounds-- < 0) {
        this.naughty = false;
        this.newState(STATE.anticipatingBall);
      } else {
        this.pushTrick(this.pickTrickState());
        this.pushBegWaitLoops();
      }
    } else if (this.ownerTooClose()) {
      this.newState(STATE.ownerTooCloseToBall);
    }

    return step;
  }

  /** The cursor within 180 of the ball (`0x1246`), or come 40 nearer it over three frames (seg19:2130 on). */
  private ownerTooClose() {
    const ball = this.world.ball;
    const [now, then] = [this.samples[0], this.samples[3]];

    if (!ball || !now) {
      return false;
    }

    const near = Math.trunc(Math.hypot(ball.x - now.x, ball.y - now.y));
    const was = then ? Math.trunc(Math.hypot(ball.x - then.x, ball.y - then.y)) : near;
    return was - near > 40 || OWNER_TOO_CLOSE > near;
  }

  /**
   * `PetModule::DoOwnerTooCloseToBall` (seg19:22ca): the dog takes the ball
   * and growls over it (script 55, two to seven times); the user coming
   * within 180, or by chance, one frame in 150, it runs off with it; done,
   * it runs off one time in twenty, else drops it and guards it again.
   */
  private doOwnerTooCloseToBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.resetScript();
      this.pushBallGrabAction();

      for (let n = (this.rand() % 6) + 2; n > 0; n--) {
        this.pushStored(SCRIPT.growlOverBall);
      }

      return undefined;
    }

    const ball = this.world.ball;
    const now = this.samples[0];

    /* The engine tests whether it has settled (`0x222`) and does the same either way (seg19:244a). */
    if (ball && now) {
      const near = Math.trunc(Math.hypot(ball.x - now.x, ball.y - now.y));

      if (OWNER_TOO_CLOSE > near || this.rand() % 150 === 0) {
        this.resetScript(36);
        this.pushBallGrabAction();
        this.newState(STATE.returningBallIndirect);
        return this.pop().step;
      }
    }

    const { step, flags } = this.pop();

    if (flags & 1) {
      if (this.rand() % 20 === 0) {
        this.pushBallGrabAction();
        this.newState(STATE.returningBallIndirect);
      } else {
        this.pushBallReleaseAction();
        this.newState(STATE.guardingBall);
      }
    }

    return step;
  }

  // Where the dog looks.

  /** Whether it may look at anything (`-0x720c`): cue 7 stops it, cue 6 lets it again. */
  private targetsOn = true;

  /** What the head looks toward, from the dog's middle when it was set (`-0x720a`), and the eyes. */
  private headTarget: { x: number; y: number } | null = null;
  private eyeMode: 0 | 1 | 2 = 0;
  private eyeTarget = { x: 0, y: 0 };

  /** How surely the head looks (`-0x7204`): toward 1 while it has a target, back to 0 without. */
  private headWeight = 0;

  /** The head's turn and nod, this frame and the last (`0x534`, `0x106`), and whether it tracks at all. */
  private headYaw = 0;
  private headPitch = 0;
  private headTracking = false;

  /** How much the head wobbles, in hundredths, 0 for all of it (`0x550`). */
  headWobble = 0;

  /** The head's wobbles (`Lube`s, DS:0x1ba on). */
  private lubes = restingLubes();

  /** `ScriptSprite::SetHeadTarget` (seg5:0000): a point to look toward, kept from the dog's middle now. */
  setHeadTarget(point: { x: number; y: number } | null) {
    if (!this.targetsOn) {
      return;
    }

    if (!point) {
      this.headTarget = null;
      return;
    }

    const centre = this.world.centre?.() ?? this.world.where();
    this.headTarget = { x: Math.trunc(point.x - centre.x), y: Math.trunc(point.y - centre.y) };

    if (this.headWeight === 0) {
      this.headYaw = this.headPitch = 0;
    }
  }

  /** `ScriptSprite::SetEyeTarget` (seg7:29fc): the eyes toward a point, or as the frame has them. */
  setEyeTarget(point: { x: number; y: number } | null) {
    if (!point || !this.targetsOn) {
      this.eyeMode = 0;
      this.eyeTarget = { x: 0, y: 0 };
      return;
    }

    const centre = this.world.centre?.() ?? this.world.where();
    this.eyeMode = 1;
    this.eyeTarget = { x: Math.trunc(point.x - centre.x), y: Math.trunc(point.y - centre.y) };
  }

  /** `LookAtUser` (seg7:2a78): the head toward just past its nose, the eyes at the user. */
  private lookAtUser() {
    const nose = this.askBall(NOSE);

    if (nose) {
      this.setHeadTarget({ x: Math.trunc(nose.x) + this.rotation, y: Math.trunc(nose.y) + 10 });
    }

    this.setEyeTarget(null);
    this.eyeMode = 2;

    /* Wide-eyed, the lids up a little. */
    this.lidRest = 20;
    this.eyesWide = 1;
  }

  /** `LookAtRandomPoint` (seg7:2b1c): the eyes and head toward somewhere on the stage. */
  private lookAtRandomPoint() {
    this.eyesWide = 0;
    const point = { x: this.rand() % this.world.width, y: this.rand() % this.world.height };
    this.setEyeTarget(point);
    this.setHeadTarget(point);
  }

  /** The head and eyes toward a point, as the states set them both; or, with none, ahead. */
  private lookAt(point: { x: number; y: number } | null | undefined) {
    this.setHeadTarget(point ?? null);
    this.setEyeTarget(point ?? null);
  }

  /** Whether the cursor moved over a frame, so many back (`0x19e` this frame, `0x1a0` the last). */
  private cursorMoved(frames = 0) {
    const [a, b] = [this.samples[frames], this.samples[frames + 1]];
    return !!a && !!b && Math.trunc(Math.hypot(a.x - b.x, a.y - b.y)) !== 0;
  }

  /** `LookAhead` (seg7:2b8f): nothing in particular. */
  private lookAhead() {
    this.setHeadTarget(null);
    this.setEyeTarget(null);
  }

  /**
   * `ScriptSprite::UpdateHeadTracking` (seg5:00c2), each frame: the head
   * turns toward the target, as if it were 100 away, less the dog's own
   * turn, nodding to its height, at most 13 in 256ths of a turn a frame;
   * kept within about half its reach (51 in 100 across, 42 up and down);
   * and straightens again without one.
   */
  private updateHeadTracking() {
    const was = { yaw: this.headYaw, pitch: this.headPitch };

    /* Tracking carries on from the frame before (`0x10a`), or starts with a target. */
    if (!this.headTarget && !this.headTracking) {
      return;
    }

    this.headTracking = true;
    const target = this.headTarget ?? { x: 0, y: 0 };
    let yaw = angle256(-target.x, 100);
    let pitch = angle256(-target.y, 100);

    if (this.headTarget) {
      yaw -= this.rotation;
    }

    const most = Math.max(Math.abs(yaw - was.yaw), Math.abs(pitch - was.pitch));

    /* (In the engine's order: a share, 13 over the most, then each way's
     * difference times it and the old added, cut to a whole number; seg5:01f8 to 0279.) */
    if (most > 13) {
      const share = 13 / most;
      yaw = Math.trunc((yaw - was.yaw) * share + was.yaw);
      pitch = Math.trunc((pitch - was.pitch) * share + was.pitch);
    }

    /* Within its reach each way (`HeadTrackMaxLeft` and so on, 100 each). */
    const reach = (axis: number, share: number) => Math.trunc((this.fudged(axis) * share) / 100);
    this.headYaw = Math.max(
      -reach(AXIS.headTrackMaxLeft, 0x33),
      Math.min(reach(AXIS.headTrackMaxRight, 0x33), yaw)
    );
    this.headPitch = Math.max(
      -reach(AXIS.headTrackMaxDown, 0x2a),
      Math.min(reach(AXIS.headTrackMaxUp, 0x2a), pitch)
    );

    if (this.headTarget) {
      this.headWeight = 1 - (1 - this.headWeight) * 0.8;
    } else {
      this.headWeight *= 0.95;

      if (this.headWeight < 0.1) {
        this.headWeight = 0;
      }
    }

    if (!this.headTarget && this.headYaw === 0 && this.headPitch === 0) {
      this.headTracking = false;
    }
  }

  /**
   * `Ballz::HeadTrackPrep` (seg5:05ba), each frame drawn: tracking, the
   * head's turn and nod, a roll, a drift of the neck it turns about and
   * an offset, each a wobble (`Lube::Next`, seg5:0468) — waiting a while,
   * then easing to somewhere in its range — some in proportion to the turn
   * (the roll, and across) and some to the nod (up and down, and back),
   * scaled by `headWobble`; not tracking, the wobbles are put back.
   */
  private headTrackPrep(): Head | undefined {
    if (!this.headTracking) {
      restLubes(this.lubes);
      return undefined;
    }

    const scale = this.headWobble === 0 ? 1 : this.headWobble / 100;
    return wobbleHead(
      this.lubes,
      this.headYaw,
      this.headPitch,
      this.wobbledAt ?? Math.trunc(this.time * 17),
      scale,
      this.rand
    );
  }

  /** How many pops the last tick made (for the harness, against the engine's). */
  lastTickPops = 0;

  /** Each frame a pop has taken this tick, its heading and reference as it was. */
  private placedThisTick: { step: Step; rotation: number; placedBy?: number }[] = [];

  /** Whether a ball of the dog has been asked for this tick (`GetBallOffset`), placing it as it is. */
  private askedBall = false;

  /**
   * Where a ball of the dog is on the stage (`Ballz::GetBallOffset`), which
   * places the dog as it now is, so that Ballz's last placed is no longer
   * the frame before (see `MoveFrameRectBall`).
   */
  private askBall(ball: number) {
    this.askedBall = true;
    return this.world.ballOnStage?.(ball);
  }

  /** Whether the last tick showed nothing new (`Step.still`). */
  private lastStill = false;

  /** The wobbles' clock in milliseconds this tick, where known (`Lube::curtime`); else the tick's times 17. */
  private wobbledAt: number | undefined;

  // The eyelids.

  /** How far the eyelids rest closed, in hundredths (`-0x721e`): 30, 20 looking at the user, or as `8ae0` sets. */
  private lidRest = 30;

  /** Frames between blinks, at least, and how long a blink is unless asked otherwise (`-0x7216`, `-0x7214`). */
  private blinkGap = 40;
  private blinkLength = 5;

  /** A blink asked for, its length (`-0x7210`); the frame of the one under way and its length (`-0x720e`, `-0x7212`). */
  private blinkAsked = 0;
  private blinkAt = 0;
  private blinkShut = 0;

  /** Frames to the next blink (`-0x7218`). */
  /* (20 as the script sprite is made, seg7:12b0, `-0x7218`.) */
  private blinkWait = 20;

  /** How far the eyelids are closed this frame, in hundredths (`0x54a`). */
  private lids = 0;

  /** How many pixels wider each side the eyes are drawn (`0x548`): 1 looking at the user. */
  private eyesWide = 0;

  /**
   * The eyelids each frame, from `ScriptSprite::Pulse` (seg7:7403): a blink
   * comes every 40 to 49 frames, a third shut, then shut, two thirds for its
   * last frame, and open; otherwise the lids rest where they are set.
   */
  private blinkPulse() {
    let shut = 0;

    if (this.blinkAt < 1) {
      if (this.blinkWait-- < 0) {
        this.blinkAt = 1;
        shut = 33;
        this.blinkShut = this.blinkAsked || this.blinkLength;
        this.blinkAsked = 0;
      }
    } else {
      this.blinkAt++;

      if (this.blinkAt < this.blinkShut) {
        shut = 100;
      } else if (this.blinkAt === this.blinkShut) {
        shut = 66;
      } else {
        this.blinkAt = -1;
        const spread = Math.max(1, Math.trunc(this.blinkGap / 4));
        this.blinkWait = (this.rand() % spread) + this.blinkGap;
      }
    }

    this.lids = Math.max(shut, this.lidRest);
  }

  /**
   * `PetModule::GetEyelidHeightFromExcitement` (seg21:78da), for each stride
   * walking or running: the calmer the dog the droopier its lids,
   * `(100 - excitement) × 0.4 + rand() % 20`, at most 45.
   */
  private eyelidHeight() {
    const calm = (100 - this.factor(0)) * 0.4;
    return Math.min(45, Math.trunc(calm + (this.rand() % 20)));
  }

  /** `ScriptSprite::DoBlink` (seg7:28fc, `8ae1 n`): a blink so many frames long, or the usual, now or next. */
  private doBlink(frames: number) {
    if (this.blinkAt > 0) {
      this.blinkShut = frames || this.blinkLength;
      this.blinkAt = 1;
    } else {
      this.blinkWait = 0;
      this.blinkAsked = frames || this.blinkLength;
    }
  }

  /** `8ae0 n` (seg7:59dc): the lids to rest so far closed, 30 for less than 0; a blink asked for is dropped, one under way ends. */
  private restLids(closed: number) {
    this.blinkAsked = 0;

    if (this.blinkAt !== 0) {
      this.blinkAt = this.blinkShut;
    }

    this.lidRest = closed >= 0 ? closed : 30;
  }

  // The heart and breathing.

  /** The heart rate in tenths (`0x2094`): 40 to start. */
  private heart = 400;

  /** Whether the frames move by the heart (`0x2096`, `8aff`), and the frame they move from (`+0x34`). */
  private breathing = false;
  private reference = 0;

  /** How far, in hundredths, each frame's balls are from the reference frame (`+0x32`), and where that eases to (`0x2098`). */
  private motionScale = 100;

  /** Pops this tick, and the blend the last ended with: what a glue later in the tick starts from. */
  private popsThisTick = 0;
  private poppedBlend: { scale: number; reference: number } | null = null;
  private motionTarget = 100;

  /** How many levels the fur bristles (`+0x46`, `8b01`). */
  private bristle = 0;

  /**
   * `ScriptSprite::UpdateHeartRate` (seg7:79ab), as each script starts: the
   * heart goes toward the rate of the positions the script goes between,
   * their average, up 1.5 or down 0.5 a script.
   */
  private updateHeartRate(script: number) {
    const rates = this.data.heartRates;
    const { from, to } = this.data.scripts[script] ?? {};

    if (!rates || from === undefined || to === undefined) {
      return;
    }

    let [a, b] = [rates[from] ?? -1, rates[to] ?? -1];

    if (a < 0 && b < 0) {
      return;
    }

    a = a < 0 ? b : a;
    b = b < 0 ? a : b;
    const target = Math.trunc((a + b) / 2) * 10;

    if (target < this.heart) {
      this.heart -= 5;
    }

    if (this.heart < target) {
      this.heart += 15;
    }
  }

  /** `8aff frame`: breathe from a frame; `8b00`: stop, the frames as they are at once. */
  private breathe(reference: number | null) {
    if (reference === null) {
      this.breathing = false;
      this.motionTarget = 100;
      this.motionScale = 100;
    } else {
      this.breathing = true;
      this.reference = reference;
    }
  }

  /** As `PopScript` starts (seg7:5841): the motion scale 5 nearer its target. */
  private easeMotionScale() {
    if (this.reference < 0) {
      return;
    }

    const gap = this.motionTarget - this.motionScale;
    this.motionScale += Math.sign(gap) * Math.min(Math.abs(gap), 5);
  }

  // The kennel.

  /** Where the dog is put this frame, its rectangle's middle at the point. */
  private centreAt: { x: number; y: number } | null = null;

  /**
   * `eLeaveKennel`, played by `PetModule::DoPlayAnimation` (seg14:017a):
   * its angles set straight and its script dropped, the dog comes out of
   * its kennel (script 93 or 92, one at random), put with its middle at
   * the kennel — the toolbox's dog button, whose rectangle the host gives
   * (`PetParams` +0x50 to +0x56, less the stage's place, +0x1c) — and is
   * then left alone. Without a kennel it comes out where it is.
   */
  private doLeaveKennel(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      return undefined;
    }

    if (mode === 'enter') {
      this.rotation = 0;
      this.ease = null;
      this.drift = 0;
      this.resetScript();
      this.pushStored(this.rand() % 2 === 0 ? SCRIPT.leaveKennel : SCRIPT.leaveKennelOther);
      this.centreAt = this.world.kennel ?? null;
      this.push({ glue: CHEST });
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags) {
      this.newGlobalState(GLOBAL.idle);
    }

    return step;
  }

  // Scruffing and calling.

  /** The secondary button the frame before (`0x216`). */
  private secondaryWas = false;

  /** Called this frame: the user double-clicked the playpen (`0x21c`, `DOGZ.WAD`'s DS:0xf98). */
  private called = false;

  /** The user calls the dog (a double click on the playpen, `WM_LBUTTONDBLCLK`). */
  call() {
    this.called = true;
  }

  /**
   * `PetModule::DoScruffHandler` (seg21:4ec0), every frame: a press of the
   * secondary button within 50 of the dog's neck (ball 54) picks it up by
   * the scruff, unless the user holds something.
   */
  private doScruffHandler() {
    const cursor = this.samples[0];
    const secondary = !!cursor?.secondary;

    if (cursor && this.state !== STATE.scruff && !this.world.holding?.()) {
      const neck = this.askBall(NECK);

      if (
        neck &&
        Math.hypot(neck.x - cursor.x, neck.y - cursor.y) < 50 &&
        secondary &&
        !this.secondaryWas
      ) {
        this.newState(STATE.scruff);
      }
    }

    this.secondaryWas = secondary;
  }

  /**
   * `PetModule::DoCallingHandler` (seg21:4d36), every frame: called, an idle
   * dog runs to the cursor (`eChasingOwner`), or, with the cursor on it —
   * within its rectangle widened by a quarter of its standard size each
   * side — sits and pants; a dog being taunted leaves the shoe and comes.
   */
  private doCallingHandler() {
    if (!this.called) {
      return;
    }

    const cursor = this.samples[0];

    if (this.global === GLOBAL.idle && this.state !== STATE.chasingOwner && cursor) {
      const rect = this.world.rect?.();
      const { width, height } = this.world.standardSize?.() ?? { width: 60, height: 60 };
      /* `XInsetRect` by minus a quarter of the standard size: widened. */
      const [dx, dy] = [Math.trunc(-width / 4), Math.trunc(-height / 4)];
      const on =
        !!rect &&
        Pet.within(
          {
            left: rect.left + dx,
            right: rect.right - dx,
            top: rect.top + dy,
            bottom: rect.bottom - dy,
          },
          cursor
        );

      if (!on) {
        this.resetScript(BELLY);
        this.newState(STATE.chasingOwner);
        return;
      }

      this.resetSoft();
      this.pushTransition(SIT_PANT, BELLY);
    }

    if (this.global === GLOBAL.taunt) {
      this.resetScript(BELLY);
      this.newGlobalState(GLOBAL.idle, STATE.chasingOwner);
    }
  }

  /**
   * `PetModule::DoScruff` (seg21:637c): picked up (script 4), swaying, and
   * dangling (3, again and again) by its neck from the cursor while the
   * button is held; let go of, back to its food or the ball, or to idle.
   * It swings as it hangs (`Swing`, from the pick-up's cue 11), and is put
   * down by script 5, the way back to its feet. The cursor's shape is not
   * played.
   */
  private doScruff(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.resetScript();
      this.push({ drift: 0 }, { glue: CHEST });
      this.pinned = null;
      return undefined;
    }

    if (mode === 'enter') {
      this.releaseObject(1);
      this.resetScript(CHEST);
      this.push({ drift: 5 - (this.rand() % 11) });
      this.pushStored(SCRIPT.pickedUp);
      return undefined;
    }

    const cursor = this.samples[0];

    if (!cursor?.secondary) {
      this.pinned = null;
      const global = this.reducedGlobal();

      if (global === GLOBAL.begEat) {
        this.newState(STATE.eating);
      } else if (global === GLOBAL.fetch) {
        this.newState(STATE.anticipatingBall);
      } else {
        this.newGlobalState(GLOBAL.idle);
      }

      return this.pop().step;
    }

    const { step, flags } = this.pop();

    if (flags) {
      this.push({ glue: CHEST });
      this.pushStored(SCRIPT.dangling);
    }

    /* Held by the top of its neck: the neck half its width below the cursor (seg21:637c, `Ballz` slot 0x38). */
    const neck = this.askBall(NECK);
    this.pinned = {
      ball: NECK,
      x: cursor.x,
      y: cursor.y + Math.trunc((neck?.diameter ?? 0) / 2),
    };

    return step;
  }

  // The spray bottle.

  /**
   * The spray bottle let go of over the dog (`SpraySprite::Update`,
   * seg20:174d): what it did is discouraged, it yelps (sound 75), all it
   * was doing is dropped, and it reacts.
   */
  sprayed() {
    this.negativeReinforcement();
    this.sounds.push(SPRAY_SOUND);
    this.resetScript();
    this.newState(STATE.sprayReact);
  }

  /**
   * `PetModule::NegativeReinforcement` (seg14:1bc5). A dog that has lately
   * decided to snatch is 5 less grabby. Otherwise, left alone, the trick it
   * was at is 5 less likely, never less than 1: the state before this one if
   * the last trick began under a second ago, else that trick, either taking
   * the other's place if it is no trick and the trick was within ten
   * seconds. At play, it is 5 more naughty, or 5 less if it was being
   * naughty, and it changes its mind about being naughty.
   */
  private negativeReinforcement() {
    if (this.grabDecisions.slice(0, 3).some(Boolean)) {
      this.setFactor(2, Math.max(1, this.factors[2] - 5));
      this.grabDecisions = [];
      return;
    }

    const global = this.reducedGlobal();

    if (global === GLOBAL.idle && this.lastTrick && this.history[1]) {
      const seconds = Math.trunc((this.time - this.lastTrickTime) / 60);
      const isTrick = (n: number) => n >= 0 && n < TRICK_COUNT;
      let [first, second] = [this.history[1] - FIRST_TRICK, this.lastTrick - FIRST_TRICK];

      if (seconds >= 1) {
        [first, second] = [second, first];
      }

      const n = !isTrick(first) && seconds < 10 ? second : first;
      const trick = this.data.tricks[n];

      if (isTrick(n) && trick) {
        trick.idleWeight = Math.max(1, trick.idleWeight - 5);
      }
    } else if (global === GLOBAL.fetch) {
      this.setFactor(1, Math.min(100, Math.max(1, this.factors[1] + (this.naughty ? -5 : 5))));
      this.naughty = !this.naughty;
    }
  }

  /**
   * `PetModule::DoSprayReact` (seg14:0f69): lets go of what is under its
   * paw, starts afresh glued by its chest, flinches (script 68) and shakes
   * itself off or runs (323); then back to waiting for the ball at play, or
   * to being left alone.
   */
  private doSprayReact(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      /* Its fur lies flat again (seg14:0f85). */
      this.bristle = 0;
      return undefined;
    }

    if (mode === 'enter') {
      this.releaseObject(1);
      this.resetScript();

      /* With `0x8ae6 0 0`, its tilt eased level; not yet played. */
      this.pushStored(SCRIPT.sprayed);
      this.push({ glue: CHEST });
      this.pushStored(SCRIPT.shakeOffSpray);
      return undefined;
    }

    const { step, flags } = this.pop();

    if (flags) {
      if (this.reducedGlobal() === GLOBAL.fetch) {
        this.newState(STATE.anticipatingBall);
      } else {
        this.newGlobalState(GLOBAL.idle);
      }
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
    const treat = this.food;

    /* The shoe, at the taunt (`GrabObject` case 4, `ActualGrabObject`). */
    if (slot === 4) {
      const shoe = this.world.shoe;

      if (shoe && this.reducedGlobal() === GLOBAL.taunt && (!shoe.held || this.grabFromUser)) {
        this.grabFromUser = false;
        shoe.held = false;
        shoe.inMouth = true;
      }

      return;
    }

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

  /** `Clean up Toys` (`StandardButtonSwitch` 12, seg21:5461): whatever it holds let go of, slot by slot. */
  releaseAll() {
    for (let slot = 0; slot < 8; slot++) {
      this.releaseObject(slot);
    }
  }

  private releaseObject(slot: number) {
    const shoe = this.world.shoe;

    /* The shoe put down at the chin, as the ball is (`ActualReleaseObject`). */
    if (slot === 4 && shoe?.inMouth) {
      const chin = this.askBall(51);
      shoe.inMouth = false;
      shoe.x = Math.trunc(chin?.x ?? shoe.x);
      shoe.y = Math.trunc(chin?.y ?? shoe.y);
      return;
    }

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
  private pushBallGrabAction(point?: { x: number; y: number }) {
    const ball = this.world.ball;

    if (!ball || ball.held || this.ballInMouthAfterQueue()) {
      return;
    }

    this.push({ glue: CHEST });

    if (!(this.world.ballHasMoved?.() ?? true) && !point) {
      this.push({ cue: 7 });
      this.pushStored(SCRIPT.pounceOnBall);
      this.push({ cue: 6 });
    } else {
      /* Reaching for it where it is, or at the point given (seg19:2db7 to 2f13):
       * turned toward it where the chin is the other side of it from the way
       * it faces (`8ae8 1 d |d / 2|`, d the chin across from it, within a
       * half turn), the chin aimed at it (`8af4 55`, at nothing without a
       * point), and the grab. */
      const target = point ?? { x: ball.x, y: ball.y };
      this.pushStored(SCRIPT.reachForBall);
      const chin = this.askBall(NOSE);

      if (chin) {
        const across = Math.max(-128, Math.min(128, Math.trunc(chin.x) - Math.trunc(target.x)));

        if ((across > 0 && this.rotation < 0) || (across < 0 && this.rotation > 0)) {
          this.push({
            fudge: { kind: 'target', axis: 1, to: across, speed: Math.abs(Math.trunc(across / 2)) },
          });
        }
      }

      this.push({ aim: { ball: NOSE, at: point ?? null } });
      this.pushStored(SCRIPT.grabBall);
    }

    this.push({ glue: CHEST });
  }

  /**
   * `ScriptSprite::CountFrames` (seg7:382c), a variant of -1: a script's
   * frames, its variant and numbers from the game's table, which is left
   * where it was; the script pushed to be counted, so the queue's read is
   * let go of as by any push.
   */
  private countFrames(index: number) {
    const script = this.data.scripts[index];
    const place = this.randomAt;
    const variant = this.tableNext() % script.variants.length;
    const frames = timeline(this.data.scripts, index, variant, {
      flags: this.data.flags,
      random: (n) => this.rand() % n,
      table: (n) => this.tableNext() % n,
      deferSounds: true,
      limit: 600,
      repeat: () => undefined,
      call: () => undefined,
    });
    this.randomAt = place;
    this.read = [];
    return frames.length;
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
    /* Glued by ball 36, then the script reset (`8ad8 24`, `ResetScript(-1)`, seg20:2253 to 2294). */
    this.push({ glue: 36 });
    this.resetScript();
    this.setFactor(9, this.centres[9]);

    /* Whether it will leap for a ball that bounces once: the clumsier, the less likely (seg20:22b6). */
    this.leapsBounce = 50 + Math.trunc(((this.factor(3) - 1) * 50) / 100) < this.rand() % 105;

    /* A throw makes it readier to be fooled again, to a point (`theirFakeDistance`). */
    this.fakeDistance = this.fakeDistance - 13 > 49 ? this.fakeDistance - 13 : 50;

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
      this.setFactor(9, Math.min(100, this.factors[9] + 4));

      if (this.rand() % 0xd2 < this.factor(9) && this.rand() % 0xd2 < this.factor(2)) {
        this.grabFromUser = true;
        return STATE.jumpingGrabbingBall;
      }
    }

    return (
      FIRST_TRICK +
      pickPlayTrick(
        this.data.tricks,
        this.playWeights,
        { held: !!ball?.held, out: !!ball },
        () => this.isBallGrabbable(),
        this.rand
      )
    );
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
    const chin = this.askBall(51);

    if (!ahead || !chin || ahead.bounces > 1 || (ahead.bounces === 1 && !this.leapsBounce)) {
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

      if (this.position === RUNNING) {
        /* Running (seg19:09d5 to 0af1): the ball where it will be after the
         * frames of stopping (script 11); a glue by the chest, steering at it,
         * the chin aimed at it; standing; cue 3 and the grab. */
        const frames = this.countFrames(SCRIPT.stopRunningGrab);
        const ahead = this.world.projectBall?.(frames);
        const at = ahead ? { x: Math.trunc(ahead.x), y: Math.trunc(ahead.y) } : { x: 0, y: 0 };
        this.push(
          { glue: CHEST },
          { steerAt: { x: at.x, y: at.y, rate: 6, width: 0, height: 0 } },
          { aim: { ball: NOSE, at } }
        );
        this.pushTransition(STANDING, BELLY);
        this.push({ cue: 3 }, { grab: 0 });
      } else {
        /* Else (seg19:0af4 to 0bc7): where it will be 7 frames on, unless it
         * bounces by then, more than once or by `rand() % 3` once: back to the
         * chase. */
        const ahead = this.world.projectBall?.(7);

        if (ahead && ahead.bounces !== 0 && (ahead.bounces !== 1 || this.rand() % 3 !== 0)) {
          this.newState(STATE.chasingBall);
          return undefined;
        }

        this.setTargetLocation(null);
        this.resetScript();
        this.pushBallGrabAction(
          ahead ? { x: Math.trunc(ahead.x), y: Math.trunc(ahead.y) } : undefined
        );
      }

      this.fumbled = false;

      if (this.decideIfClumsy()) {
        this.pushStored(SCRIPT.fumble);
        this.pushStored(SCRIPT.pawBall);
        /* (`8b04 1`, seg19:0c3b.) */
        this.push({ release: 1 });
        this.fumbled = true;
      }

      /* And popped, its first frame the tick's (seg19:0c7c). */
      return this.pop().step;
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

      /* Moving (`GetNeutralType` of where it is, its first flag, seg19:039f
       * to 03ac): first to standing, waiting, then back here (`8b07 33`,
       * seg19:03b4 to 0406). */
      if (this.data.positionKinds[this.position] & POSITION.moving) {
        this.pushTransition(STANDING, BELLY);
        this.push({ goto: STATE.releasingBall });
        this.newState(STATE.waitState);
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
   * it, it takes the ball back itself; after enough, it loses interest.
   */
  private doAnticipatingBall(mode: Mode): Step | undefined {
    if (mode === 'exit') {
      this.lookAt(null);
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

      if (this.cursorMoved()) {
        this.lookAt(cursor);
      }

      /* (The cursor kept 100 in from the stage's edges, seg19:12a4 to 12fe;
       * the dog all on the stage; the script reset by ball 36, seg19:1394.) */
      const kept = cursor && {
        x: Math.min(this.world.width - 100, Math.max(100, cursor.x)),
        y: Math.min(this.world.height - 100, Math.max(100, cursor.y)),
      };

      if (!this.totallyOnscreen() || !kept || !this.inFocusBox(kept, 1.8)) {
        this.resetScript(36);

        if (this.isBallGrabbable()) {
          this.pushBallGrabAction();
          this.newState(STATE.returningBallDirect);
        } else {
          this.newState(STATE.chasingBall);
        }

        /* (No pop of its own after: the new state's, running on, is the tick's, seg19:13e1.) */
        return this.enteredStep ?? { frame: this.lastStep.frame, still: true };
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

      this.lookAt(this.world.ball);

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
    /* Leaving, the script let play out (`ResetScriptSoft(-1)`, seg21:6097 to 60af). */
    if (mode === 'exit') {
      this.resetSoft();
      return undefined;
    }

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
   * `0x8af4 ball x y` (`PopScript`, seg7:5e98, and 7144 on): the queue is
   * played ahead to the end of the next script (`0x8b0b`), or to a cue 2,
   * or until it runs out or names a state (seg7:667e, 6624), and the dog is
   * slid evenly over those frames so that the ball named is at the point
   * when the last of them shows;
   * `0x7ffd` for the point is the ball at play. Played ahead here are the
   * frames, their glue and placing, and the dog's turning, eases and drift.
   */
  /** An aim popped, to be played ahead once its frame is placed (`0x8af4`). */
  private pendingAim: { ball: number; at: { x: number; y: number } | null } | undefined;

  private startAim(
    ball: number,
    at: { x: number; y: number } | null,
    shown?: { step: Step; rotation: number; placedBy?: number }
  ) {
    const point = at ?? this.world.ball;
    /* (From the frames placed so far this tick, the one just placed last --
     * the stage not yet shown them -- the slide over those after.) */
    const frames: { step: Step; rotation: number; placedBy?: number }[] = shown
      ? this.placedThisTick.includes(shown)
        ? [...this.placedThisTick]
        : [...this.placedThisTick, shown]
      : [];
    const first = frames.length;
    let glue: number | undefined;
    let placedBy: number | undefined;
    const saved = { rotation: this.rotation, ease: this.ease, drift: this.drift };

    for (const [index, item] of this.queue.entries()) {
      /* Played ahead, `PopScript` stops at the end of a script (`0x8b0b`),
       * at cue 2, before the frame it comes with, and at a state named. */
      if ('end' in item || 'goto' in item || ('cue' in item && item.cue === 2)) {
        break;
      } else if ('ease' in item) {
        const after = this.queue.slice(index + 1);
        const goes = after.findIndex((later) => 'goto' in later);
        const frames = (goes < 0 ? after : after.slice(0, goes)).filter(
          (later) => 'step' in later && !later.step.reference
        ).length;
        this.startEase(item.ease, Math.max(1, frames));
      } else if ('drift' in item) {
        this.drift = item.drift;
      } else if ('glue' in item) {
        glue = item.glue;
      } else if ('step' in item && item.step.reference) {
        placedBy = item.step.frame;
      } else if ('step' in item) {
        if (item.step.cues?.includes(2)) {
          break;
        }

        /* (Steered afresh each pop played ahead, from where the dog is by then, seg7:6b38.) */
        if (this.steer && this.world.lookAhead) {
          this.steerFrom(this.world.lookAhead(frames, -1));
        }

        this.turn(item.step);

        frames.push({
          step: { ...item.step, glue: item.step.glue ?? glue },
          rotation: this.rotation,
          placedBy,
        });
        glue = placedBy = undefined;
      }
    }

    Object.assign(this, saved);
    const count = frames.length - first;

    /* Each pop played ahead pulses the sprite and plays its sounds -- the
     * blink's draws and the sounds' drawn for good, `rand` being the
     * program's -- and the sprite is then put back as it was, its blinking
     * too (`SaveEnvironmentVars` copies all of it, seg7:3aeb): the frames
     * ahead and one more, that finds the end. */
    const blinking = {
      blinkAt: this.blinkAt,
      blinkWait: this.blinkWait,
      blinkShut: this.blinkShut,
      blinkAsked: this.blinkAsked,
      lids: this.lids,
    };

    if (process.env.AIMLOG) {
      console.log(`aim ${this.time} count ${count} blink ${this.blinkAt} ${this.blinkWait}`);
    }

    for (let n = 0; n <= count; n++) {
      this.blinkPulse();

      for (const choices of frames[first + n]?.step.soundChoices ?? []) {
        this.rand() % choices.length;
      }
    }

    Object.assign(this, blinking);

    if (!point || !this.world.lookAhead || count < 1) {
      return;
    }

    const there = this.world.lookAhead(frames, ball);
    /* Its speed each way a float (`-0x71e4`, `-0x71e0`, seg7:730e on). */
    this.slide = {
      dx: Math.fround((point.x - there.x) / count),
      dy: Math.fround((point.y - there.y) / count),
      x: 0,
      y: 0,
      movedX: 0,
      movedY: 0,
      left: count,
    };
  }
}
