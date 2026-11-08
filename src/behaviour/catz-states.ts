/**
 * A Catz cat's own states, a tick at a time, once its script is done: what
 * each does then, and which it goes to next (CATZDLL.DLL's `DoCat…`
 * handlers). See kb/topics/catz-behaviour.md ("States of its own").
 */

import { type CatzMind, catzBehavior, catzSound, mapCatzValue } from './catz-behavior.ts';
import { CATZ_TURN } from '../render/raster.ts';
import { CATZ_BRAIN } from './catz-brain.ts';
import { catzStrikeSpeed } from './catz-toys.ts';

/** The cat's own states these model, by CATZDLL.DLL's numbers (`eKatState_…`). */
export const CATZ_STATE = {
  mightJump: 14,
  jumpToEdge: 15,
  crawlUpEdge: 16,
  crawlAlongCeiling: 17,
  jumpToShelf: 18,
  lookAtObjects: 12,
  preExplore: 13,
  passTheTime: 19,
  locomote: 22,
  performLocomote: 23,
  tired: 26,
  dozing: 27,
  sleep: 28,
  wakeup: 29,
  sharpenClaws: 32,
  swatting: 56,
  preStalking: 1,
  stalking: 2,
  begging: 35,
  pouncing: 3,
  mayEndSwatting: 57,
  victimCaptured: 5,
  victimWrestle: 6,
  carryVictim: 7,
  lazyWatch: 30,
  snagPouncing: 8,
  snagging: 9,
  postSnagging: 10,
  windowResized: 20,
  dangling: 33,
  postDangling: 34,
  sniffMouseHole: 11,
  alignToEat: 38,
  eatPieceOfFood: 39,
  eatHide: 41,
  eatFromBowl: 40,
  groom: 31,
  snubObject: 80,
  ignoreObject: 81,
  sprayReaction: 63,
  fleaSprayReaction: 64,
  diving: 4,
  stayAway: 58,
  scaredWatch: 59,
  hide: 60,
  specialFearModes: 61,
  jumpToCeiling: 62,
  sniffCatnip: 42,
  nibbleCatnip: 43,
  beginPetting: 49,
  petting: 50,
  mayEndPetting: 51,
  afterPetting: 52,
  upsetPetting: 53,
  alignToTarget: 24,
  cursorLick: 54,
  lackingAffection: 55,
  sucklingUser: 44,
  sucklingSelf: 45,
  chasingSuckling: 46,
  suckleAttempt: 47,
  sucklingGrab: 48,
  waitForTreat: 36,
  nibbleTreat: 37,
  initKit: 72,
  inBaskets: 73,
  peekFromBasket: 74,
  endPeekFromBasket: 75,
  exitBasket: 76,
  jumpInBasket: 77,
  dropIntoBasket: 78,
  failSafe: 79,
  startDream: 65,
  goodDream: 66,
  badDream: 67,
  badDreamMouse: 68,
  dreamEnd: 69,
  startDogChase: 70,
  dogChase: 71,
} as const;

/** What the cat's state reads of it besides its brains. */
export interface CatzStateWorld {
  /** Its global state. */
  global: number;

  /** `+0x3502`: asleep or dozing, its ticks so. */
  count: number;

  /** `+0x34ca`: passing the time, whether it has done something yet. */
  passed?: number;

  /** Whether the game is the screen saver (`IsScreenSaver`). */
  screenSaver?: boolean;

  /** Whether the cat's place on the stage is 3 (`GetSpriteScreenArea`, 0x1d). */
  area3?: boolean;

  /** Looking at things: what it is curious about (`+0x362c` on, to the first 0), ticks to its next look (`+0x3504`), and `+0x1500`. */
  curiosities?: number[];
  ticks?: number;
  x1500?: number;

  /** Exploring: the stage (CATZDLL's `ds:2ba6` to `2bac`), the cat's width and height (`+0x33c4`, `+0x33c6`), its target point (`GetTargetPt`, space 0), the draw rectangle of its kin 0x22 (`GetKin`), and the cursor's (`PetParams` `+0x104` to `+0x10a`; all 0 where it has not moved). */
  stage?: CatzBox;
  size?: { width: number; height: number };
  point?: { x: number; y: number };
  kin?: CatzBox;
  cursor?: CatzBox;

  /** Dangling: the button pressed and held (`PetParams` `+0xa`, `+0xc`), and the mouse's (kin 0x1b) state. */
  buttons?: { left: number; right: number };
  mouseState?: number;

  /** Whether the state is being entered. */
  enter?: boolean;

  /** Walking: its mode (`+0x3508`), `+0x35fc`, the kind of sprite it walks to (`+0x35a6`, 0 for a point), `+0x35a2`, `+0x35ac`, and where it walks to (`+0x34cc`, `+0x34ce`). */
  mode?: number;
  x35fc?: number;
  x35a6?: number;
  x35a2?: number;
  x35ac?: number;
  goal?: { x: number; y: number };

  /** Whether the cat's place on the stage is 1 (`GetSpriteScreenArea`, 0x1d). */
  area1?: boolean;

  /** Walking on: its draw rectangle, `+0x688` (the angle steering left it), `+0x35a8`, `+0x35f4`, `+0x35ee` and `+0x35a4`, whether the shelf holds a kind of sprite, and `PetParams` `+0xc4`. */
  rect?: CatzBox;
  x688?: number;
  x35a8?: number;
  x35f4?: number;
  x35ee?: number;
  x35a4?: number;
  inShelf?: (kind: number) => boolean;
  c4?: number;

  /** Walking on: `+0x35aa` (there before), and whether `PopScript` finds what it walks to in its box (answering 2). */
  x35aa?: number;
  found?: boolean;

  /** Swatting: how what it plays with lies to its paw, and its swat's fields. */
  swat?: CatzSwat;

  /** Whether a layered action plays already (`GetLayeredFramesRemaining`). */
  layeredPlaying?: boolean;

  /** Stalking: where its prey (`+0x35a4`) is, whether the user holds it, and the stalk's action (`+0x35b8`, -1 for none). */
  prey?: { x: number; y: number };
  preyHeld?: boolean;
  preyArea3?: boolean;
  x35b8?: number;

  /** Eating, there: whether the user holds what it walked to (`+0x35a6`), and `+0x35d2`. */
  walkedToHeld?: boolean;
  x35d2?: number;

  /** Walking on: where what it walks to (`+0x35a6`) is, its target point, where that is not its goal (`+0x34cc`). */
  walkedToAt?: { x: number; y: number };

  /** Begging: whether its script cued it (cue 6) as it was popped. */
  cued?: boolean;

  /** The cues it was given (`IsCued`), where known; and pouncing, whether it has caught its prey (`+0xee0`). */
  cues?: number[];
  caught?: boolean;

  /** Its victim: whether it has let it go (`+0x35be`), its way back to a neutral pose pushed. */
  released?: boolean;

  /** Ignoring: the global state it goes back to (`+0x35b4`). */
  x35b4?: number;

  /** Watching lazily: how (`+0x35b6`), 1 or 2. */
  x35b6?: number;

  /** Snagging: the cursor's (kin 0x17) target point. */
  cursorAt?: { x: number; y: number };

  /** Nibbling catnip: what is left of it (`+0x35d4`). */
  x35d4?: number;

  /** Petted: see `CatzPetting`. */
  petting?: CatzPetting;

  /** Affectionate: where its ball 7 is, the cursor's point it keeps (`+0x35c2`, `+0x35c4`), and the stage it keeps lacking affection (`+0x3598` on). */
  ball7?: { x: number; y: number };
  x35c2?: { x: number; y: number };
  kept?: CatzBox;

  /** Ignoring: what it ignores (`+0x35b0`), which its head tracks. */
  x35b0?: number;

  /** Crawling up the edge: its climb (`+0x35ba`). */
  x35ba?: number;

  /** Its bottle (kin 0xf): see `CatzBottle`. */
  bottle?: CatzBottle;

  /** In the Adoption Kit: see `CatzKit`; and whether the cursor is about (`PetParams` `+0x46`). */
  kit?: CatzKit;
  cursorAbout?: boolean;

  /** Dreaming: see `CatzDream`. */
  dream?: CatzDream;
}

/** A dream in CatNapz, as the tick begins. */
export interface CatzDream {
  /** Its phase (`+0x35da`), what it dreams of (`+0x35ec`) and `+0x35d8`. */
  phase: number;
  kind: number;
  x35d8: number;

  /** Whether the cloud (kin 0x10) is cued that it has come (4). */
  cloudCome: boolean;

  /** Where the dream's float has the cat (`+0x35dc`, `+0x35e4`: doubles). */
  at: { x: number; y: number };

  /** The stage the dream keeps to (`ds:2ba6` to `ds:2bac`). */
  stage: { left: number; top: number; right: number; bottom: number };

  /** Where the dream's mouse (kin 0x1b) and the dog (kin 0x1a) are across. */
  mouseX: number;
  dogX?: number;
}

/** The cat in the Adoption Kit's baskets. */
export interface CatzKit {
  /** How it peeks (`+0x3610`), how many times it has (`+0x3612`), how long it waits in its basket (`+0x360e`), its basket (`+0x35f6`, -1 for none), and the baskets it has been in (`+0x3614` on). */
  peekMode: number;
  peeks: number;
  wait: number;
  basket: number;
  baskets: number[];

  /** `PetParams` `+0xca`, how many the apt's root has (`+0x1e0`), and the mouse's state (kin 0x1b's machine). */
  ca: number;
  rootCount: number;
  mouseState: number;

  /** Where the Kit is (`PetParams` `+0xdc`, `+0xde`), from which its baskets lie. */
  origin?: { x: number; y: number };
}

/** Where each basket of the Adoption Kit lies from the Kit (`GetBasketLocation`, seg13:113b, a jump table at seg13:12b5). */
export const CATZ_BASKETS = [
  { x: 0xe0, y: 0x113 },
  { x: 0x138, y: 0x11f },
  { x: 0x191, y: 0x124 },
  { x: 0x1e9, y: 0x11a },
  { x: 0x242, y: 0x119 },
];

/** The cat's bottle (kin 0xf), as the tick begins. */
export interface CatzBottle {
  /** Whether the user holds it (`+0xfc`), its `+0x1da`, and whether it is on the shelf. */
  held: boolean;
  x1da: number;
  shelved: boolean;

  /** Its target point, whether the cat is near it (`IsCatProximateToBottle`), and its mouth's distance from the teat (`MouthToNippleDist`). */
  at: { x: number; y: number };
  near: boolean;
  mouth: number;

  /** How far from the teat its mouth may be suckling (`+0x2520`). */
  reach: number;
}

/** What a petted cat reads of itself and of the cursor over it. */
export interface CatzPetting {
  /** Its rate (`+0x356e`), `+0x3570` (-1 for no sound of its own), `+0x3572`, `+0x3576`, the cursor's action (`+0x362a`) and the mode it came to may-end with (`+0x356c`). */
  rate: number;
  x3570: number;
  x3572: number;
  x3576: number;
  x362a: number;
  x356c: number;

  /** Where the cursor was (`+0x3518`, `+0x351a`; -1 not yet seen). */
  cursorWas: { x: number; y: number };

  /** Its petting modes, newest first (`+0x351c` on). */
  modes: number[];

  /** As its handler first asked: the ball under the cursor (`WhichBallBeingPet`, -1 for none), whether the user stopped (`HasUserStoppedPetting`), and how far the cursor moved (`GetCursorMovement`). */
  ball: number;
  stopped?: boolean;
  movement?: number;

  /** Its pose (`+0x1500`) as it asked how far the cursor moved, its script popped. */
  pose?: number;
}

/**
 * A layered action begun, where none plays (`LayerAnimation`, seg15:1a24,
 * beginning): by its type, one time in five inclined to behaviour 28, 0x1d9;
 * three times in four to 24, 0x1e0; three in four to 25, 0x1e2; under its
 * fear, to 27, 0x287 -- where `+0x1500` is one of the two given, or either
 * is -1.
 */
function catzLayerAnimation(
  mind: CatzMind,
  world: CatzStateWorld,
  tick: CatzStateTick,
  type: number,
  a: number,
  b: number,
  random: (n: number) => number
) {
  if (tick.layered !== undefined || world.layeredPlaying) {
    return;
  }

  const x1500 = world.x1500 ?? 0;
  const matches = a === -1 || a === x1500 || b === -1 || b === x1500;
  const [odds, behaviour, action] = [
    [20, 28, 0x1d9],
    [75, 24, 0x1e0],
    [75, 25, 0x1e2],
    [mind.brains[CATZ_BRAIN.fear], 27, 0x287],
  ][type];

  if (random(101) < odds && matches && catzBehavior(mind, behaviour, random) !== 0) {
    tick.layered = action;
  }
}

/**
 * How what a cat plays with (`+0x35a4`) lies to its paw, ball 0x31, as
 * `GetOrientationInfo` (seg29:1999) and `GetSwatMissDistance` (seg29:1b55)
 * give it -- the paw where the cat's balls put it on the stage, not
 * reimplemented here -- and the swat's own fields.
 */
export interface CatzSwat {
  /** Which way it faces the toy (0 to 3, by `+0x688`), and the toy less the paw. */
  facing: number;
  dx: number;
  dy: number;

  /** Cued to strike, where it pushed and swung after all: which way it faced the toy, and the toy less the paw, as it asked again. */
  again?: { facing: number; dx: number; dy: number };

  /** Cued to strike: `+0x3592`, whether the toy is on the shelf, whether the shelf is closed (`XApt::m_nShelfClosed`), and the toy's `+0x1d0`. */
  x3592?: number;
  shelved?: boolean;
  shelfClosed?: boolean;
  x1d0?: number;

  /** How far the paw is from the toy, and where it asks again, its script done, how far then. */
  miss: number;
  missAgain?: number;

  /** Whether the mouse (kin 0x1b) is in its state 1. */
  mouseRunning: boolean;

  /** `+0x358e`, its side; `+0x3594`, the zone it swatted in last; `+0x3596`. */
  side: number;
  zone: number;
  x3596: number;
}

/** The angle from one point to another (`PtToPtAngle`, seg14:1c93): `atan2` in 256ths of a turn, rounded toward 0 (seg48:17a2), and a quarter turn more (`add ax,0x40` at seg14:1cec, as steering's aim has it), the shorter way (`ShortestAngle`, seg48:1d00); 0x81 where they are one. */
export function catzPtToPtAngle(from: { x: number; y: number }, to: { x: number; y: number }) {
  const [dx, dy] = [from.x - to.x, from.y - to.y];

  if (!dx && !dy) {
    return 0x81;
  }

  const angle = Math.trunc((Math.atan2(dy, dx) * 256) / CATZ_TURN) + 64;

  /* As `ShortestAngle` has it: below -128 it gives -256 less the angle, which a quarter turn more than `atan2` never asks of it. */
  return angle > 128 ? angle - 256 : angle < -128 ? -256 - angle : angle;
}

/** How far apart two points are (`Dist`, seg48:1a21), rounded toward 0. */
export function catzDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.trunc(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

/** A rectangle, its edges. */
export interface CatzBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What the cat is curious about, looking at things (`GetCuriosities`,
 * seg24:2285, the cat's slot `0x240`), by its temperament and what is out of
 * the shelf, in turn: 0x1b where it is inclined to behaviour 25; 10 to 24;
 * inclined to 18, one time in two, 0xf under half of what its age leaves of
 * 100, one of 0xb, 0xc and 0xd, and, inclined to 26, 8 and 0xc; inclined to
 * 15, up to 5 of 0x17, 5, 6, 7 and 9; each kind of sprite of 1 to 13, 15,
 * 0x17 and 0x1b the shelf does not hold (`isSpriteInShelf`); and, inclined
 * to 20, one time in four, 4.
 */
export function catzCuriosities(
  mind: CatzMind,
  inShelf: (kind: number) => boolean,
  random: (n: number) => number
): number[] {
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const percent = () => random(101);
  const list: number[] = [];

  if (behave(25)) {
    list.push(0x1b);
  }

  if (behave(24)) {
    list.push(10);
  }

  if (behave(18) && percent() < 50) {
    if (percent() < Math.trunc((100 - mind.brains[CATZ_BRAIN.age]) / 2)) {
      list.push(0xf);
    }

    list.push([0xb, 0xc, 0xd][random(3)]);

    if (behave(26)) {
      list.push(8, 0xc);
    }
  }

  if (behave(15)) {
    const many = random(6);

    for (let n = 0; n < many; n++) {
      list.push([0x17, 5, 6, 7, 9][random(5)]);
    }
  }

  for (const kind of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 0x17, 0x1b]) {
    if (!inShelf(kind)) {
      list.push(kind);
    }
  }

  if (behave(20) && percent() < 25) {
    list.push(4);
  }

  return list;
}

/** What `PreMoment` (seg25:42ff) readies the moment with. */
export interface CatzPreMoment {
  /** The global state it would play after (`+0x3516`), and what it does meanwhile (`+0x350a`). */
  after: number;
  idle: number;

  /** How many times it must look about before it may go (`+0x3506`), and its mode (`+0x3508`). */
  looksBeforeGoing: number;
  mode: number;

  /** The action it pushed, where it did. */
  pushed?: number;
}

/**
 * The moment readied (`PreMoment`, seg25:42ff, the cat's slot `0x28c`), its
 * script cleared: the global state to play after and what to do meanwhile
 * as given, and 1 to 3 looks before it may go. Watching nothing, or so
 * placed (3), it is in mode 1; else mode 3, and then, afraid (fear over 49)
 * with an age, four times in five it shies (0x96), doing 0x83 meanwhile
 * with 2 to 4 looks; and lively, independent and serious (each over 49),
 * four times in five it puts on a show (0x97), doing 0x15 meanwhile with 2
 * or 3.
 */
export function catzPreMoment(
  mind: CatzMind,
  area3: boolean,
  after: number,
  idle: number,
  watching: boolean,
  random: (n: number) => number
): CatzPreMoment {
  const brain = (n: number) => mind.brains[n];
  const ready: CatzPreMoment = { after, idle, looksBeforeGoing: random(3) + 1, mode: 1 };

  if (!watching || area3) {
    return ready;
  }

  ready.mode = 3;

  if (brain(CATZ_BRAIN.fear) > 49 && brain(CATZ_BRAIN.age) !== 0 && random(101) < 80) {
    ready.pushed ??= 0x96;
    ready.idle = 0x83;
    ready.looksBeforeGoing = random(3) + 2;
  }

  if (
    brain(CATZ_BRAIN.liveliness) > 49 &&
    brain(CATZ_BRAIN.independence) > 49 &&
    brain(CATZ_BRAIN.seriousness) > 49 &&
    random(101) < 80
  ) {
    ready.pushed ??= 0x97;
    ready.idle = 0x15;
    ready.looksBeforeGoing = random(2) + 2;
  }

  return ready;
}

/** What a tick did: the state it went to, the global state it was put in, the action it pushed, and its energy and count after. */
export interface CatzStateTick {
  state?: number;
  global?: number;
  pushed?: number;
  energy: number;
  count: number;
  passed?: number;

  /** The moment readied, where it went to it by `PreMoment`. */
  moment?: CatzPreMoment;

  /** `+0x35a6` and `+0x35a4`, where it set them, and `+0x35f4`, scared, where it flees no more. */
  x35a6?: number;
  x35a4?: number;
  x35f4?: number;

  /** Exploring: where it walks to (`+0x34cc`, `+0x34ce`) and how (`+0x35a8`). */
  goal?: { x: number; y: number };
  explore?: number;

  /** Walking: its mode where it changed, where it put its marker (kin 0x16), and how it turned its head, in turn (`SetHeadTracking` on, `LookAtUser`). */
  mode?: number;
  marker?: { x: number; y: number };
  head?: ('track' | 'user' | 'off')[];

  /**
   * What its head tracks, and how fast (`SetHeadTracking`'s kind and speed),
   * where the state's own are not what it plays with at 3000.
   */
  headTrack?: { kind: number; speed: number };

  /** All the actions it pushed, in turn. */
  pushes?: number[];

  /** Walking on: the words that set its steering (`targetSprite4`, 0x756d: what to, the box's width and height, and its share), the layered action begun, the sound made, `+0x688` (before the steering moves it on) and `+0x35aa` where set, and its fullness after. */
  steer?: number[];

  /**
   * A leap set up before what it pushes (`alignBallToPtSetup3`, its words
   * 0x7534, a ball and `+0x34cc`): the ball, and where it aims -- at its
   * prey (`+0x35a4`'s target point, the mouse's led), at what it walks to
   * (`+0x35a6`'s, `GetOrientationInfo`), or at its goal.
   */
  leap?: { ball: number; to: 'prey' | 'walked' | 'goal' };

  /** Crawling up the edge: its climb (`+0x35ba`), as entering draws it. */
  x35ba?: number;

  /** Swatting, struck: the toy of a kind, and the speed it is given (`StrikeToy`). */
  strike?: { kind: number; v: { x: number; y: number } };

  /** Walking on, found but not there: its steering stopped (`targetSprite4` all 0), the stride after it walked straight on. */
  steerStopped?: boolean;

  /**
   * Stalking, creeping: the angle it is turned to as it creeps, at its prey
   * -- the words pushed before the creep, its rotation's fudger's rate 100
   * and its target (`setFudgerRate 0 100`, `setFudgerTarget 0`), and after,
   * the fudger reset (`resetFudger 0`; seg14:0a61 to 0abe) -- and its creep
   * kept (`+0x35b8`), or -1 where it turned instead.
   */
  creepAim?: number;
  x35b8?: number;
  layered?: number;
  x688?: number;
  x35aa?: number;
  fullness?: number;

  /** There: `+0x33be` and `+0x34d0` where set, and whether the engine's way here reads what it never set (grooming, ways 4, 5, 8 and 9). */
  x33be?: number;
  x34d0?: number;
  unread?: boolean;

  /** Looking at things: ticks to its next look, and the sound it made (`MapAndPlayCatSound` 7), its action. */
  ticks?: number;
  sound?: number;

  /** Chasing the dog: `+0x35ac` and `+0x35ee`, where set. */
  x35ac?: number;
  x35ee?: number;

  /** Dreaming: its phase, what it dreams of, `+0x35d8`, and where the float has it, where they changed. */
  dream?: Partial<Pick<CatzDream, 'phase' | 'kind' | 'x35d8' | 'at'>>;
}

/**
 * A tick of one of the cat's own states, its script done:
 *
 * - tired (26; `DoCatTired`, seg30:0113): catnapping (global 21), it has
 *   its energy put at 20 and walks off (`locomote`); else, under its
 *   energy, it dozes (27), and otherwise sleeps (28);
 * - asleep (28; `DoCatSleep`, seg30:0426): every 101 ticks a little more
 *   energy; under a quarter of its energy it wakes (29); else, asleep less
 *   than 26 ticks or nine times in ten, one time in two it dreams by its
 *   temperament (behaviours 28, 26, 25, 27 and 24: actions 0x26e, 0x25a,
 *   0x26d, 0x26f and 0x25b, else 0xd5) and the other sleeps on (0xd5);
 *   else it stirs (0x1d4);
 * - dozing (27; `DoCatShortRest`, seg30:022e): its ticks and energy as
 *   asleep; under its energy it wakes (29); else one time in two it naps
 *   by its temperament (behaviours 26 and 24: 0x25c and 0x266), else 0xb4;
 * - waking (29; `DoCatWakeup`, seg30:0741): it idles (global 6);
 * - sharpening its claws (32; `DoCatSharpenClaws`, seg30:0e84): entered, it
 *   pushes 0x13f; its script done, it idles (global 6);
 * - looking at things (12; `DoCatLookAtObjects`, seg24:0263): between looks
 *   it counts down; then, having looked at something, under its energy it
 *   may go on to do something with the last -- play (15) with most kinds,
 *   4 with 4, eat (3) with 0xb to 0xd, and 8 and 0xf where inclined to 26,
 *   attack (1) 0x17 and 0x1b where inclined to 7; else it looks at the next
 *   (`SetHeadTracking`), 9 to 58 ticks, and may make a sound (7) under a
 *   quarter of what its seriousness leaves of 100. With nothing left to look
 *   at, or without an age one time in two, it has its moment (8,
 *   `catzPreMoment`). Its script done, it pushes 0xc after 0x5f, else 0x93;
 * - walking (22; `DoCatLocomote`, seg25:01fc): entered, watching hard
 *   (mode 3), three times in four -- `+0x35fc` 0, not the screen saver nor
 *   affectionate already -- it turns affectionate instead (global 14, mode
 *   2). Else, walking to a point (`+0x35a6` 0, or `+0x35a2` 1), it keeps the
 *   point on the stage, but catnapping or in global states 16 and 17, and
 *   walks to its marker (kin 0x16) put there; nine times in ten, or
 *   attacking, it tracks it with its head, else looks at the user; placed
 *   so (1), not `+0x35ac` nor `+0x35a2`, it shies first where afraid (0xdc)
 *   and pushes 0xd7. Its script done, it tracks what it walks to and goes
 *   on (`performLocomote`, 23);
 * - exploring (13; `DoCatPreExplore`, seg24:05d1): it chooses where to
 *   walk (`locomote`): to the stage's left or right, a little in from it,
 *   level with its target point; 250 below that point, or, too low, up by
 *   the stage's top; or beside its kin 0x22, or the cursor where it has
 *   moved, four times in five -- left or right of it where there is room, a
 *   side at random where both, idling (6) where neither, 250 below its top;
 * - passing the time (19; `DoCatPassTheTime`, seg24:1896): having done
 *   something, one time in two it looks at things (12), or on the screen
 *   saver readies its moment (`catzPreMoment`) and has it (8); else it does
 *   something by its temperament -- behaviour 24, 0x25f; 25, one time in
 *   two with an age attacking (global 1, `+0x35a6` and `+0x35a4` 14), else
 *   0x25e; 26, 0x25d; 27, 0x261; else 0x260.
 */
export function catzStateTick(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  let energy = mind.brains[CATZ_BRAIN.energy];
  let count = world.count;
  const done = (rest: Partial<CatzStateTick>): CatzStateTick => ({ energy, count, ...rest });

  switch (state) {
    case CATZ_STATE.mightJump:
    case CATZ_STATE.jumpToEdge:
    case CATZ_STATE.crawlUpEdge:
    case CATZ_STATE.crawlAlongCeiling:
    case CATZ_STATE.jumpToShelf:
      return catzJumping(state, mind, world, random, done);
    case CATZ_STATE.tired:
      /* `DoCatTired`, seg30:0113: entering, 0xb3. */
      if (world.enter) {
        return done({ pushed: 0xb3, pushes: [0xb3] });
      }

      if (world.global === 21) {
        energy = 20;
        return done({ state: CATZ_STATE.locomote });
      }

      return done({ state: percent() < energy ? CATZ_STATE.dozing : CATZ_STATE.sleep });
    case CATZ_STATE.sleep: {
      if (count < 101) {
        count++;
      } else {
        count = 0;
        energy = Math.min(100, energy + 1);
      }

      if (percent() < Math.trunc(energy / 4)) {
        return done({ state: CATZ_STATE.wakeup });
      }

      if (count < 26 || percent() > 9) {
        if (percent() >= 50) {
          return done({ pushed: 0xd5 });
        }

        const thinking = { ...mind, brains: [...mind.brains] };
        thinking.brains[CATZ_BRAIN.energy] = energy;
        const dreams: [number, number][] = [
          [28, 0x26e],
          [26, 0x25a],
          [25, 0x26d],
          [27, 0x26f],
          [24, 0x25b],
        ];
        const dream = dreams.find(([behaviour]) => catzBehavior(thinking, behaviour, random) !== 0);
        return done({ pushed: dream?.[1] ?? 0xd5 });
      }

      return done({ pushed: 0x1d4 });
    }
    case CATZ_STATE.dozing: {
      if (count < 101) {
        count++;
      } else {
        count = 0;
        energy = Math.min(100, energy + 1);
      }

      if (percent() < energy) {
        return done({ state: CATZ_STATE.wakeup });
      }

      if (percent() < 50) {
        const thinking = { ...mind, brains: [...mind.brains] };
        thinking.brains[CATZ_BRAIN.energy] = energy;
        const nap = [
          [26, 0x25c],
          [24, 0x266],
        ].find(([behaviour]) => catzBehavior(thinking, behaviour, random) !== 0);
        return done({ pushed: nap?.[1] ?? 0xb4 });
      }

      return done({ pushed: 0xb4 });
    }
    case CATZ_STATE.wakeup:
      return done({ global: 6 });
    case CATZ_STATE.sharpenClaws:
      return world.enter ? done({ pushed: 0x13f }) : done({ global: 6 });
    case CATZ_STATE.swatting:
      return catzSwatting(mind, world, random);
    case CATZ_STATE.preStalking: {
      /* `DoCatPreStalking`, seg14:03cf: entered, it tracks what it plays with with its head (3000), and pushes 0xdf where inclined to behaviour 7, then 0x13d; its script done, it stalks (2). */
      if (world.enter) {
        const pushes = [...(catzBehavior(mind, 7, random) !== 0 ? [0xdf] : []), 0x13d];
        return done({ pushed: pushes[0], pushes, head: ['track'] });
      }

      return done({ state: CATZ_STATE.stalking });
    }
    case CATZ_STATE.stalking:
      return catzStalking(mind, world, random);
    case CATZ_STATE.begging:
      return catzBegging(mind, world, random);
    case CATZ_STATE.pouncing:
      return catzPouncing(mind, world, random);
    case CATZ_STATE.diving:
      return catzDiving(mind, world, random);
    case CATZ_STATE.petting: {
      /* Its script done, its count goes on (`+0x3502`), whatever it did. */
      const petted = catzPetting(mind, world, random);
      return world.enter ? petted : { ...petted, count: world.count + 1 };
    }
    case CATZ_STATE.initKit:
    case CATZ_STATE.inBaskets:
    case CATZ_STATE.peekFromBasket:
    case CATZ_STATE.endPeekFromBasket:
    case CATZ_STATE.exitBasket:
    case CATZ_STATE.jumpInBasket:
    case CATZ_STATE.dropIntoBasket:
      return catzKit(state, mind, world, random);
    case CATZ_STATE.startDream:
    case CATZ_STATE.goodDream:
    case CATZ_STATE.badDream:
    case CATZ_STATE.badDreamMouse:
    case CATZ_STATE.dreamEnd:
      return catzDream(state, mind, world, random);
    case CATZ_STATE.startDogChase:
    case CATZ_STATE.dogChase:
      return catzDogChase(state, mind, world);
    case CATZ_STATE.sprayReaction:
    case CATZ_STATE.fleaSprayReaction:
      return catzSprayed(state, mind, world, random);
    case CATZ_STATE.failSafe:
      /* `DoCatFailSafeState`, seg13:1093: entering, its slot `0x9c` 2 and 0x177; its script done, idling (6). */
      return world.enter ? done({ pushed: 0x177, pushes: [0x177] }) : done({ global: 6 });
    case CATZ_STATE.waitForTreat:
    case CATZ_STATE.nibbleTreat:
      return catzTreat(state, mind, world, random);
    case CATZ_STATE.sucklingUser:
    case CATZ_STATE.sucklingSelf:
    case CATZ_STATE.chasingSuckling:
    case CATZ_STATE.suckleAttempt:
    case CATZ_STATE.sucklingGrab:
      return catzSuckling(state, mind, world, random);
    case CATZ_STATE.alignToTarget:
    case CATZ_STATE.cursorLick:
    case CATZ_STATE.lackingAffection:
      return catzFond(state, mind, world, random);
    case CATZ_STATE.beginPetting:
    case CATZ_STATE.mayEndPetting:
    case CATZ_STATE.afterPetting:
    case CATZ_STATE.upsetPetting:
      return catzPettingTick(state, mind, world, random);
    case CATZ_STATE.sniffCatnip:
      /* `DoCatSniffCatnip`, seg22:2555: entering, 0x1cc; its script done, the catnip (4) off the shelf, it aligns to eat it (0x26), else idles (6). */
      return world.enter
        ? done({ pushed: 0x1cc, pushes: [0x1cc] })
        : world.inShelf!(4)
          ? done({ global: 6 })
          : done({ state: 0x26 });
    case CATZ_STATE.nibbleCatnip: {
      /* `DoCatNibbleCatnip`, seg22:2669: each tick, the catnip moved from its goal (`+0x34cc`) or held, it lets go (its slot `0x9c` 1) and goes for it again (global 4); cued (5), it eats 20 of what is left (`+0x35d4`, to 0) and grows more catnipped (20); its script done, having nibbled (`+0x34ca`, a draw against its catnip of no account), with none left it idles (6), else, having nibbled, 0x279 over 70 left, else 0x2d2. Leaving, under its catnip 0x27a, else, catnipped, a sound (10) and 0x250. */
      const prey = world.prey!;
      const goal = world.goal!;

      if (prey.x !== goal.x || prey.y !== goal.y || world.preyHeld) {
        return done({ global: 4 });
      }

      const left = world.cues?.includes(5) ? Math.max(0, (world.x35d4 ?? 0) - 20) : world.x35d4;

      if (world.passed !== 0) {
        percent();
      }

      return left === 0
        ? done({ global: 6 })
        : done({ passed: 1, pushed: left! > 70 ? 0x279 : 0x2d2 });
    }
    case CATZ_STATE.stayAway:
    case CATZ_STATE.scaredWatch:
    case CATZ_STATE.hide:
    case CATZ_STATE.specialFearModes:
    case CATZ_STATE.jumpToCeiling:
      return catzFear(state, mind, world, random);
    case CATZ_STATE.victimCaptured:
    case CATZ_STATE.victimWrestle:
      return catzVictim(state, mind, world, random);
    case CATZ_STATE.snagPouncing: {
      /* `DoCatSnagPouncing`, seg14:1261: entered, not readied to pounce (`+0x1500` 0x14), it stalks again (2); else it aims at the cursor's (kin 0x17) target point, kept at `+0x34cc` (its words 0x7534, 0x42, there, 0x756f), and pushes 0x156, its slot `0x170` with 5. Its script done, the cursor where it was, it snags (9); else it walks to its prey (22, `+0x35a6` the prey's kind, `+0x35ac` 1). */
      if (world.enter) {
        return world.x1500 !== 0x14
          ? done({ state: CATZ_STATE.stalking })
          : done({ pushed: 0x156, pushes: [0x156], goal: world.cursorAt });
      }

      const at = world.cursorAt;
      return at && world.goal && at.x === world.goal.x && at.y === world.goal.y
        ? done({ state: CATZ_STATE.snagging })
        : done({ state: CATZ_STATE.locomote, x35a6: world.x35a4 });
    }
    case CATZ_STATE.snagging: {
      /* `DoCatSnagging`, seg14:13c4, whose ticks carry what it snags along with its paw: what it plays with neither the cursor (0x17), nor held, nor on the shelf, it has it (its slots `0x9c` 2, `0xf0`, `0xf8`), and food (8, 0xb to 0xd) it lets go to (`PushTransitionToNeutralPos` 8) and goes on to (10), the rest its victim (5) -- its script done or not. Else, its script done, one time in ten it lets go (`0x9c` 2) and goes to 0x22, else turns its fudger by -4 to 3 and pushes 0x158. */
      const kind = world.x35a4!;

      if (kind !== 0x17 && !world.preyHeld && !world.inShelf?.(kind)) {
        return done({
          state: [8, 0xb, 0xc, 0xd].includes(kind)
            ? CATZ_STATE.postSnagging
            : CATZ_STATE.victimCaptured,
        });
      }

      if (percent() < 10) {
        return done({ state: 0x22 });
      }

      random(8);
      return done({ pushed: 0x158, pushes: [0x158] });
    }
    case CATZ_STATE.postSnagging: {
      /* `DoCatPostSnagging`, seg14:174d: its script done, it lets go (its slot `0xfc`), and food it eats (global 3), 8 and 0xb with `+0x35ce` 2, 0xc and 0xd with 1. */
      const kind = world.x35a4!;
      return [8, 0xb, 0xc, 0xd].includes(kind) ? done({ global: 3 }) : done({});
    }
    case CATZ_STATE.alignToEat: {
      /* `DoCatAlignToEat`, seg22:1291: entering, it tracks its food with its head (3000), turns toward it by `+0x688` (to -40, 40, -32 or 35, or as it faces), and moves its nose to it (0x123, 0x1cf, 0x125). Its script done, by what it walked to (`+0x35a6`): a treat (0xb) the user holds it nibbles (0x25), else, its head let go and the treat's `+0x9e` -1000, it eats (0x27), as a piece (8); catnip (4) it nibbles (0x2b); else it eats from the bowl (0x28). */
      const food = world.x35a6;

      if (food === 0xb) {
        return done({ state: world.walkedToHeld ? 0x25 : 0x27 });
      }

      return done({ state: food === 8 ? 0x27 : food === 4 ? 0x2b : 0x28 });
    }
    case CATZ_STATE.eatPieceOfFood:
      return catzEatPiece(mind, world, random);
    case CATZ_STATE.groom: {
      /* `DoCatGroom`, seg30:0c71: entering, its way (`+0x35a8`) cleared; placed so (3) it readies its moment, watching (`PreMoment`, after it idling, 0x93 meanwhile), and has it (8); without an age, 0x2a8; with more fleas than behaviour 13 answers, a sound (1) and 0x26b, scratching; else, inclined to behaviour 24 one time in two, 0x267, else 0x126, and one time in ten 0x270. Its script done, it idles (6). */
      if (!world.enter) {
        return done({ global: 6 });
      }

      if (world.area3) {
        return done({
          moment: catzPreMoment(mind, true, 6, 0x93, true, random),
          global: 8,
        });
      }

      if (mind.brains[CATZ_BRAIN.age] === 0) {
        return done({ pushed: 0x2a8, pushes: [0x2a8] });
      }

      if (mind.brains[CATZ_BRAIN.fleas] > catzBehavior(mind, 13, random)) {
        return done({ sound: catzSound(mind, 1, random), pushed: 0x26b, pushes: [0x26b] });
      }

      const pushes = [catzBehavior(mind, 24, random) !== 0 && percent() < 50 ? 0x267 : 0x126];

      if (percent() < 10) {
        pushes.push(0x270);
      }

      return done({ pushed: pushes[0], pushes });
    }
    case CATZ_STATE.snubObject:
      /* `DoCatSnubObject`, seg30:182e: entering, its slot `0x114` (2, 0xf), it tracks what it plays with with its head (2000) and pushes 0x206; cued (4), a sound (4); its script done, it lets it go (its slot `0x238`) and walks on to nothing (22, `+0x35a6` 0, `+0x35ac`, `+0x35a2` and `+0x1514` 1). */
      return world.enter
        ? done({
            pushed: 0x206,
            pushes: [0x206],
            head: ['track'],
            headTrack: { kind: world.x35a4 ?? 0, speed: 2000 },
          })
        : done({ state: CATZ_STATE.locomote, x35a6: 0 });
    case CATZ_STATE.ignoreObject:
      /* `DoCatIgnoreObject`, seg30:19a0: entering, its slot `0x114` (2, 0xf), it tracks what it ignores (`+0x35b0`) with its head (2500) and pushes 0x321; cued (4), one time in two a sound (4); its script done, it goes back to the global state it was in (`+0x35b4`). */
      if (world.enter) {
        return done({
          pushed: 0x321,
          pushes: [0x321],
          head: ['track'],
          headTrack: { kind: world.x35b0 ?? world.x35a4 ?? 0, speed: 2500 },
        });
      }

      if (world.cues?.includes(4)) {
        percent();
      }

      return done({ global: world.x35b4 });
    case CATZ_STATE.eatFromBowl:
      return catzEatBowl(mind, world, random);
    case CATZ_STATE.eatHide:
      /* `DoCatEatHide`, seg22:2353: entering, 0x20d; its script done, eating (global 3). */
      return done({ global: 3 });
    case CATZ_STATE.sniffMouseHole:
      /* `DoCatSniffMouseHole`, seg14:1850: entering, it tracks what it plays with with its head (3000); inclined to behaviour 7, the mouse in (kin 0x1b's slot `0x110`), under its age, it aims at the hole, a quarter of its width and height past its target point, faces 0x40, sniffs (0x123, 0x1cf, 0x125, 0x2b8), and keeps where kin 0xe is (`+0x35c2`, `+0x34ca` 1); else 0x2a4. Each tick, that kin moved, or its script done, it readies its moment (`PreMoment`, after it idling, 0x93 meanwhile) and has it (8). */
      return done({
        moment: catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random),
        global: 8,
      });
    case CATZ_STATE.windowResized: {
      /* `DoCatWindowResized`, seg24:1ce6 (global 20, `DoGSWindowEvent`, seg24:1b12, begins it or walking on): entering, nothing looked at yet (`+0x34ca` 0). Its script done: having looked, one time in two it idles (6); else it has looked (`+0x34ca` 1), lets go (its slot `0x238` 0), and looks to its marker (kin 0x16; `+0x35a6` 0x16, its point the goal, `+0x34cc`, by the marker's slot `0x44`), its head on it (2500), and pushes 0xd7. */
      if (world.enter) {
        return done({ passed: 0 });
      }

      if (world.passed && percent() < 50) {
        return done({ global: 6 });
      }

      return done({
        passed: 1,
        x35a6: 0x16,
        head: ['track'],
        headTrack: { kind: 0x16, speed: 2500 },
        pushed: 0xd7,
        pushes: [0xd7],
      });
    }
    case CATZ_STATE.dangling:
      return catzDangling(mind, world, random);
    case CATZ_STATE.postDangling:
      return catzPostDangling(mind, world, random);
    case CATZ_STATE.lazyWatch: {
      /* `DoCatLazyWatch`, seg30:1695: entering, it tracks what it plays with with its head (2000); leaving, it stops; its script done, one time in five, as it watches (`+0x35b6`), it idles (global 6) or rests (9), else pushes 0x93 or 0x8c. */
      const goes = percent() < 20;

      if (world.x35b6 === 1) {
        return done(goes ? { global: 6 } : { pushed: 0x93 });
      }

      if (world.x35b6 === 2) {
        return done(goes ? { global: 9 } : { pushed: 0x8c });
      }

      return done({});
    }
    case CATZ_STATE.carryVictim:
      /* `DoCatCarryVictim`, seg33:15ac: its script done, it lets its victim go (its slot `0x238`) and walks on, to nothing (22). */
      return done({ state: CATZ_STATE.locomote, x35a6: 0 });
    case CATZ_STATE.mayEndSwatting:
      return catzMayEndSwatting(mind, world, random);
    case CATZ_STATE.lookAtObjects: {
      const list = world.curiosities ?? [];
      const brain = (n: number) => mind.brains[n];
      let ticks = world.ticks ?? 0;
      const tick: Partial<CatzStateTick> = {};

      if (ticks !== 0) {
        ticks--;
      } else {
        if (count >= 1 && percent() < brain(CATZ_BRAIN.energy)) {
          const kind = list[count - 1] ?? 0;
          tick.x35a4 = kind;
          const of = (n: number) => catzBehavior(mind, n, random) !== 0;
          const global = (() => {
            switch (kind) {
              case 4:
                return 4;
              case 8:
              case 0xf:
                return of(26) ? 3 : 15;
              case 0xb:
              case 0xc:
              case 0xd:
                return 3;
              case 0x17:
              case 0x1b:
                return of(7) ? 1 : 15;
              case 1:
              case 2:
              case 3:
              case 5:
              case 6:
              case 7:
              case 9:
              case 10:
                return 15;
            }
          })();

          if (global !== undefined) {
            return done({ ...tick, global, ticks });
          }
        }

        const kind = list[count] ?? 0;

        if (kind === 0 || (brain(CATZ_BRAIN.age) === 0 && percent() < 50)) {
          const moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
          return done({ ...tick, global: 8, moment, ticks });
        }

        count++;
        ticks = random(50) + 9;

        if (percent() < 70) {
          random(20);
        }

        if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.seriousness)) / 4)) {
          tick.sound = catzSound(mind, 7, random);
        }
      }

      return done({ ...tick, ticks, pushed: world.x1500 === 0x5f ? 0xc : 0x93 });
    }
    case CATZ_STATE.locomote: {
      if (!world.enter) {
        return done({ state: CATZ_STATE.performLocomote, head: ['track'] });
      }

      const tick: Partial<CatzStateTick> = { head: [], pushes: [] };

      if (
        world.mode === 3 &&
        percent() < 75 &&
        !world.x35fc &&
        !world.screenSaver &&
        world.global !== 14
      ) {
        return done({ mode: 2, global: 14 });
      }

      let target = world.x35a6 ?? 0;

      if (target === 0 || world.x35a2 === 1) {
        const stage = world.stage!;
        const goal = { ...world.goal! };

        if (world.global !== 21 && world.global !== 17 && world.global !== 16) {
          goal.x = Math.min(stage.right, Math.max(stage.left, goal.x));
          goal.y = Math.min(stage.bottom, Math.max(stage.top, goal.y));
        }

        target = 0x16;
        tick.goal = goal;
        tick.marker = goal;
      }

      tick.x35a6 = target;
      /* Looking at the user turns its head's tracking off (`SetHeadTracking` 0) as it does. */
      tick.head!.push(
        ...(percent() < 90 || world.global === 1
          ? ['track' as const]
          : ['user' as const, 'off' as const])
      );

      if (world.area1 && !world.x35ac && !world.x35a2) {
        if (mind.brains[CATZ_BRAIN.fear] > 49) {
          tick.pushes!.push(0xdc);
        }

        tick.pushes!.push(0xd7);
      }

      if (tick.pushes!.length) {
        return done({ ...tick, pushed: tick.pushes![0] });
      }

      tick.head!.push('track');
      return done({ ...tick, state: CATZ_STATE.performLocomote });
    }
    case CATZ_STATE.performLocomote: {
      const walked = catzWalkOn(mind, world, random);
      return { ...walked, pushed: walked.pushes?.[0] };
    }
    case CATZ_STATE.preExplore: {
      const stage = world.stage!;
      const { width, height } = world.size!;
      const point = world.point!;
      const cursor = world.cursor!;
      let way = random(world.screenSaver ? 3 : 5);
      const moved =
        cursor.left !== 0 || cursor.top !== 0 || cursor.right !== 0 || cursor.bottom !== 0;
      const chasing = moved && percent() < 80;
      let goal: { x: number; y: number };
      let explore: number;

      if (chasing) {
        way = 3;
      }

      if (way === 0) {
        explore = 1;
        goal = { x: width + stage.left, y: point.y };
      } else if (way === 1) {
        explore = 2;
        goal = { x: stage.right - width, y: point.y };
      } else if (way === 2) {
        explore = 3;
        const half = Math.trunc(height / 2) * 2;
        goal = { x: point.x, y: point.y + 250 };

        if (goal.y > stage.bottom - half) {
          goal.y = half + stage.top;
        }
      } else {
        const box = chasing ? cursor : world.kin!;
        const half = Math.trunc(width / 2);
        const high = stage.top + 20 < box.top;
        const left = half + stage.left < box.left - width && high;
        const right = stage.right - half > box.right + width && high;

        if (!left && !right) {
          return done({ global: 6 });
        }

        explore = left && right ? (percent() < 50 ? 4 : 5) : left ? 4 : 5;
        goal = { x: explore === 4 ? box.left - width : box.right + width, y: box.top + 250 };

        if (chasing) {
          explore += 4;
        }
      }

      return done({ state: CATZ_STATE.locomote, goal, explore, x35a6: 0 });
    }
    case CATZ_STATE.passTheTime: {
      const behave = (n: number) => catzBehavior(mind, n, random) !== 0;

      if (world.passed && percent() < 50) {
        if (!world.screenSaver) {
          return done({ state: CATZ_STATE.lookAtObjects });
        }

        const moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
        return done({ global: 8, moment });
      }

      const passed = 1;

      if (behave(24)) {
        return done({ passed, pushed: 0x25f });
      }

      if (behave(25)) {
        if (percent() < 50 && !world.screenSaver && mind.brains[CATZ_BRAIN.age] !== 0) {
          return done({ passed, global: 1, x35a6: 14, x35a4: 14 });
        }

        return done({ passed, pushed: 0x25e });
      }

      if (behave(26)) {
        return done({ passed, pushed: 0x25d });
      }

      return done({ passed, pushed: behave(27) ? 0x261 : 0x260 });
    }
    default:
      return done({});
  }
}

/**
 * A tick of walking on (23; `DoCatPerformLocomote`, seg25:07c6), not
 * entered, its script done, walking to its marker (`+0x35a6` 0x16), until
 * it is there (`+0x35aa` 0): see `catzStateTick`.
 */
function catzWalkOn(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const percent = () => random(101);
  const stage = world.stage!;
  const { width, height } = world.size!;
  const at = world.point!;
  const G = world.global;
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
    head: [],
  };
  const push = (action: number) => tick.pushes!.push(action);
  const age = brain(CATZ_BRAIN.age);
  let mark = { ...(world.walkedToAt ?? world.goal!) };
  let kind = world.x35a6 ?? 0x16;
  let walkedTo = kind;
  let moved = false;

  /* Its marker kept on the stage, but catnapping or in global states 16 and 17. */
  if (G !== 21 && G !== 17 && G !== 16) {
    const kept = {
      x: Math.min(stage.right, Math.max(stage.left, mark.x)),
      y: Math.min(stage.bottom, Math.max(stage.top, mark.y)),
    };

    if (kept.x !== mark.x || kept.y !== mark.y) {
      mark = kept;
      tick.marker = kept;
      walkedTo = 0x16;
      moved = true;
    }
  }

  /* Past 20 strides, but catnapping or in 16 and 17, it gives up its goal for the stage's middle. */
  const givenUp = world.count > 20 && G !== 21 && G !== 17 && G !== 16;
  let g = G;

  if (givenUp) {
    kind = 0x16;
    tick.x35a6 = 0x16;
    mark = {
      x: Math.trunc((stage.right - stage.left) / 2) + stage.left,
      y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top,
    };
    tick.marker = mark;
    tick.head!.push('off');
    tick.mode = 1;
    g = 0;
  } else {
    tick.count = world.count + 1;
  }

  let x688 = world.x688 ?? 0;
  const rect = world.rect!;
  const onStage =
    rect.right > stage.left &&
    rect.left < stage.right &&
    rect.bottom > stage.top &&
    rect.top < stage.bottom;

  if (!onStage) {
    x688 = catzPtToPtAngle(at, mark);
    tick.x688 = x688;
  }

  /* Steering (`targetSprite4`): the box it looks for its marker in, by its global state. */
  let near = world.area1 ?? false;
  let within = 0x60;
  let chance = 0;
  let box = [width, height, 4];
  const notArea3 = !world.area3;
  /* Attacking, it may be there at once, facing what it walks to. */
  let pounces = false;

  switch (g) {
    case 1:
      /* Attacking: 0xe its width and height, share 3; else twice, share 4, within 0x80, and, without `+0x35a2`, there at once where it faces within 10 of what it walks to and is serious (50 or more) or one time in ten. */
      near = notArea3;

      if (world.x35a4 === 0xe) {
        box = [width, height, 3];
        break;
      }

      box = [width * 2, height * 2, 4];
      within = 0x80;

      if (!world.x35a2) {
        const off = catzPtToPtAngle(at, mark) - x688;
        pounces =
          off >= -10 && off <= 10 && (brain(CATZ_BRAIN.seriousness) >= 50 || percent() < 10);
      }
      break;
    case 3:
    case 4:
      box = [width * 2, height * 2, 4];
      near = notArea3;
      break;
    case 8:
      chance = 20;
      break;
    case 0xd:
      box = world.c4 ? [width, height, 4] : [Math.trunc(width / 2), height, 10];
      break;
    case 0xe:
      box = [width, height, 3];
      break;
    case 0xf:
      box = [Math.trunc((width * 3) / 2), Math.trunc((height * 3) / 2), 3];
      near = notArea3;
      break;
    case 0x10:
      box = [width * 2, height * 2, 1];
      near = true;
      within = 0x80;
      break;
    case 0x14:
      box = [width * 2, height * 2, 4];
      break;
    case 0x11:
      /* Scared: away from kin 0x22, or fleeing (`+0x35f4`), twice its width and height, share 4, near wherever it is; else, within twice its width of what it plays with, placed so (1), it stays away (0x3a, its slot `0x9c` 1); else twice, share 5, not placed 3. Within 0x80. */
      within = 0x80;

      if (world.x35a4 === 0x22 || world.x35f4) {
        box = [width * 2, height * 2, 4];
        near = true;
        break;
      }

      if (world.x35a4 && world.prey && catzDist(world.prey, at) < width * 2 && world.area1) {
        tick.state = 0x3a;
        return tick;
      }

      box = [width * 2, height * 2, 5];
      near = notArea3;
      break;
    case 0x15:
      /* Catnapping: `+0x35ee` 10, near wherever it is (and, placed so, a sound, 0xe9). */
      box = [width * 2, height * 2, 4];
      within = 0x80;

      if (world.x35ee === 10) {
        near = true;
      }
      break;
    case 0x16:
      box = [width * 2, height * 2, 4];
      within = 0x80;
      break;
  }

  tick.steer = [0x756d, walkedTo, ...box, 0x756f];

  const aligned = world.inShelf!(kind)
    ? x688 <= -64 || x688 >= 64
    : x688 >= -within && x688 <= within;

  if (pounces || ((world.found || percent() < chance) && aligned && near)) {
    if (G === 16) {
      tick.state = 4;
      tick.x35aa = world.x35aa;
    } else if (world.x35aa) {
      tick.x35aa = 0;
      catzArrive(mind, world, tick, moved, x688, random);
    } else if (givenUp) {
      /* Having given up: on the Adoption Kit, grooming (0xd) and inclined to behaviour 24, its state 0x1f; else it idles. */
      if (world.c4 && G === 0xd && behave(24)) {
        tick.state = 0x1f;
      } else {
        tick.global = 6;
      }
    } else {
      /* Its transition to a neutral pose (`PushTransitionToNeutral` 0x6b), by its pose: not reimplemented. */
      tick.x35aa = 1;
      tick.pushes = undefined;
    }

    return tick;
  }

  /* On the way: the next stride. */
  tick.x35aa = 0;
  const distance = catzDist(mark, at);

  if (behave(26) && percent() < Math.trunc((100 - brain(CATZ_BRAIN.energy)) / 2)) {
    push(0x2a6);
  }

  if (world.area3) {
    push(0x254);
    return tick;
  }

  /* Found but not there: its steering stopped (`targetSprite4` all 0), 0x254. */
  if (world.found && G !== 21) {
    tick.steerStopped = true;
    push(0x254);
    return tick;
  }

  const fleas = brain(CATZ_BRAIN.fleas);

  if (
    fleas >= 50 &&
    percent() < Math.trunc((fleas - 50) / 2) &&
    G !== 21 &&
    brain(CATZ_BRAIN.fear) < 75 &&
    world.area1
  ) {
    if (fleas > catzBehavior(mind, 13, random) && percent() < 50) {
      tick.global = 13;
    } else {
      push(0x26a);
    }

    return tick;
  }

  if (percent() < Math.trunc(brain(CATZ_BRAIN.catnipped) / 2) && world.area1) {
    push(0x27b);
    return tick;
  }

  const runs =
    (width * 4 < distance && (G !== 13 || world.c4) && brain(CATZ_BRAIN.energy) > 20) ||
    G === 16 ||
    (G === 17 && (width * 3 < distance || world.x35f4)) ||
    (G === 21 && world.x35ee === 10);

  if (runs) {
    if (percent() < Math.trunc((100 - age) / 20) + 1 && age !== 0 && world.area1) {
      tick.state = 25;
      return tick;
    }

    push(age < 50 ? 10 : 0x254);

    /* Tired and hungry by it (`CatGetsTiredAndHungry` 1, 1, seg16:36fb). */
    if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
      tick.energy = Math.max(0, tick.energy - 1);
    }

    if (percent() < 10) {
      tick.fullness = Math.max(0, tick.fullness! - 1);
    }

    return tick;
  }

  if (
    G === 15 &&
    world.x35a4 !== 12 &&
    world.area1 &&
    percent() < Math.trunc((100 - age) / 5) + 5
  ) {
    tick.sound = catzSound(mind, 10, random);
    push(age === 0 ? 0x2aa : 0xf1);
    return tick;
  }

  if (brain(CATZ_BRAIN.fear) >= 50 && percent() < 15 && G !== 22 && G !== 17 && world.area1) {
    tick.sound = catzSound(mind, 10, random);
    push(age === 0 ? 0x2ab : 0x296);
    return tick;
  }

  /* Its layered actions as it goes (`StartLocomotionLayering`, seg25:4521). */
  const layer = (type: number, a: number, b: number) =>
    catzLayerAnimation(mind, world, tick, type, a, b, random);

  if (brain(CATZ_BRAIN.energy) > 25) {
    layer(0, 0x74, 0x76);
  }

  layer(1, -1, -1);
  layer(2, -1, -1);
  layer(3, -1, -1);

  const near3 =
    (G === 13 &&
      !world.c4 &&
      Math.abs(catzPtToPtAngle(at, world.goal!) - x688) <= 30 &&
      width * 4 > distance &&
      world.x35a8 !== 3) ||
    (brain(CATZ_BRAIN.fear) >= 50 && width * 3 > distance && G !== 17 && G !== 22);

  if (near3) {
    push(age < 50 ? 3 : 0);
    return tick;
  }

  if (
    percent() < 100 - brain(CATZ_BRAIN.energy) &&
    kind !== 0xc &&
    kind !== 0xf &&
    kind !== 0xb &&
    G !== 22 &&
    behave(26)
  ) {
    push(0x2af);
  } else {
    push(age < 50 ? 0xb7 : 5);
  }

  return tick;
}

/**
 * There, past the first time (`+0x35aa` 1): what the cat walked there for,
 * by its global state (seg25:141f to 21fe). `moved` is whether its marker
 * was moved onto the stage this tick.
 */
function catzArrive(
  mind: CatzMind,
  world: CatzStateWorld,
  tick: CatzStateTick,
  moved: boolean,
  x688: number,
  random: (n: number) => number
) {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const stage = world.stage!;
  const middle = {
    x: Math.trunc((stage.right - stage.left) / 2) + stage.left,
    y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top,
  };
  const age = brain(CATZ_BRAIN.age);
  /* The moment readied (`PreMoment`, after it idling, 0x93 meanwhile, not watching) and had: where the switch goes on to seg25:21aa. */
  const walkTo = (goal: { x: number; y: number }) => {
    if ((tick.x35a6 ?? world.x35a6) === 0x16) {
      tick.marker = goal;
    }
  };
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
  };

  switch (world.global) {
    case 1:
      if (moved) {
        return moment();
      }

      tick.state = world.x35a4 === 0xe ? 0xb : !world.x35a2 || age === 0 ? 2 : 1;
      return;
    case 2:
      tick.state = 7;
      return;
    case 3: {
      if (moved) {
        return moment();
      }

      /* Eating: its food off the shelf -- 0xc with `+0x35d2` -- it aligns to eat it (0x26), or, the user holding it, begs (0x23), waits for the treat (0x24) for 0xb; 0xf goes to global state 5. On the shelf, it begs. The marker: hiding its food (0x29), inclined to behaviour 27, else grooming (global 13). Another kind reads what nothing set (`bp-0x1c`). */
      const kind = world.x35a6!;
      let off: boolean;

      if (kind === 8 || kind === 0xb || kind === 0xd || kind === 0xf) {
        off = !world.inShelf!(kind);
      } else if (kind === 0xc) {
        off = !world.inShelf!(kind) && world.x35d2! > 0;
      } else if (kind === 0x16) {
        if (catzBehavior(mind, 27, random) !== 0) {
          tick.state = 0x29;
        } else {
          tick.global = 13;
        }

        return;
      } else {
        tick.unread = true;
        return;
      }

      if (off && kind === 0xf) {
        tick.global = 5;
      } else if (off && kind === 0xb) {
        tick.state = world.walkedToHeld ? 0x24 : 0x26;
      } else {
        tick.state = off && !world.walkedToHeld ? 0x26 : 0x23;
      }

      return;
    }
    case 5:
      if (moved) {
        return moment();
      }

      tick.state = 0x2e;
      return;
    case 6: {
      const { width } = world.size!;
      const above = () => world.point!.y - (random(100) + 150);
      const kin = world.kin!;
      const cursor = world.cursor!;

      switch (world.x35a8) {
        case 1:
          tick.goal = { x: stage.left, y: above() };
          break;
        case 2:
          tick.goal = { x: stage.right, y: above() };
          break;
        case 3:
          tick.goal = { x: world.goal!.x, y: above() };
          break;
        case 4:
        case 5:
          tick.goal = { x: Math.trunc((kin.right - kin.left) / 2) + kin.left, y: kin.top };
          break;
        case 8:
          tick.goal = { x: width + cursor.left, y: cursor.top };
          break;
        case 9:
          tick.goal = { x: cursor.right - width, y: cursor.top };
          break;
      }

      tick.explore = world.x35a8;
      /* What it walks to is moved to its goal (its method `0x44`). */
      walkTo(tick.goal ?? world.goal!);
      tick.state = 14;
      return;
    }
    case 8:
      tick.state = 0x15;
      return;
    case 0xb:
      tick.global = 13;
      return;
    case 0xd: {
      if (world.c4) {
        tick.state = 0x1f;
        return;
      }

      /* Grooming: a place by how it went (`+0x35a8`), its width times 0.55 (`ds:0x372`) in from an edge -- the stage's or its kin 0x22's -- and the angles it must face within. */
      const reach = world.size!.width * 0.55;
      const kin = world.kin!;
      const ways: Record<number, [number, number, number?, number?]> = {
        1: [0x22, 0x5e, 0x40, Math.trunc(reach + stage.left)],
        2: [-0x5e, -0x22, -0x40, Math.trunc(stage.right - reach)],
        3: [-10, 10],
        6: [-0x5e, -0x22, -0x40, Math.trunc(kin.left - reach)],
        7: [0x22, 0x5e, 0x40, Math.trunc(reach + kin.right)],
      };
      const way = ways[world.x35a8 ?? 0];

      if (!way) {
        tick.unread = true;
        return;
      }

      const [low, high, facing, x] = way;

      if (facing !== undefined) {
        tick.x34d0 = facing;
        tick.goal = { x: x!, y: world.goal!.y };
      }

      if (x688 > low && x688 < high) {
        if (world.x35a8 !== 3) {
          walkTo(tick.goal ?? world.goal!);
        }

        tick.state = world.x35a8 === 3 ? 0x20 : 0x18;
      } else {
        tick.state = 0x1f;
      }

      return;
    }
    case 0xe: {
      if (age !== 0) {
        /* With an age: its marker moved this tick, it lacks affection (0x37); else its ball 7 more than 20 from the cursor, its moment, facing within 0x20 0x139; else it keeps the cursor's point and aligns to it (24). */
        if (moved) {
          tick.state = CATZ_STATE.lackingAffection;
          return;
        }

        const at = world.walkedToAt ?? world.goal!;

        if (world.ball7 && catzDist(world.ball7, at) > 20) {
          moment();

          if (world.x688! >= -0x20 && world.x688! <= 0x20) {
            tick.pushes!.push(0x139);
          }

          return;
        }

        tick.state = CATZ_STATE.alignToTarget;
        return;
      }

      if (catzBehavior(mind, 26, random) !== 0 && world.area1 && percent() < 75) {
        tick.pushes!.push(0x2a6, 0x8c, 0x8c, 0x8c);

        tick.state = 0x16;
        return;
      }

      return moment();
    }
    case 0xf:
      if (moved) {
        return moment();
      }

      tick.state =
        world.x688! >= -32 &&
        world.x688! <= 32 &&
        (world.x35a6 === 0xc || world.x35a6 === 8) &&
        world.inShelf!(world.x35a6)
          ? 0x16
          : 0x38;
      return;
    case 0x10:
      if (moved) {
        return moment();
      }

      return;
    case 0x14:
      if (percent() < 50) {
        tick.x35a6 = 0;
        tick.state = 0x16;
        return;
      }

      return moment();
    case 0x15:
      if (world.x35ee !== 10) {
        tick.state = world.x35ee === 0xb ? 0x47 : 0x41;
        return;
      }

      if (percent() > 24) {
        tick.explore = world.x35a8 === 1 ? 2 : 1;
        tick.state = 0x47;
        return;
      }

      tick.goal = middle;
      tick.explore = world.x35a8;
      tick.x35a6 = 0;
      tick.state = 0x16;
      return;
    case 0x16:
      tick.x33be = 3;
      tick.global = 0x16;
      return;
    case 0x11: {
      /* Scared, by how it flees (`+0x35f4`): 3, the moment readied; 1, one time in four it flees no more (3) and, under its fear, walks to the stage's left or right, 10 in, at its middle, else after the cursor (0x17), and otherwise turns its way (`+0x35a8`, 1 and 2) and goes to 0x3d; 2, one time in two the same, to the stage's middle, and otherwise lets go of what it plays with (its slot `0x238`) and walks on to nothing; else, from kin 0x22 it hides (0x3c), else watches scared (0x3b). */
      const flees = world.x35f4;
      const away = (to: () => { x: number; y: number }) => {
        tick.x35f4 = 3;

        if (percent() < brain(CATZ_BRAIN.fear)) {
          tick.goal = to();
          tick.x35a6 = 0;
        } else {
          tick.x35a6 = 0x17;
        }

        tick.state = 0x16;
      };

      if (flees === 3) {
        return moment();
      }

      if (flees === 1) {
        if (percent() < 25) {
          return away(() => ({
            x: percent() < 50 ? stage.left + 10 : stage.right - 10,
            y: middle.y,
          }));
        }

        tick.explore = world.x35a8 === 1 ? 2 : 1;
        tick.state = 0x3d;
        return;
      }

      if (flees === 2) {
        if (percent() < 50) {
          return away(() => middle);
        }

        tick.x35a6 = 0;
        tick.x35a4 = 0;
        tick.state = 0x16;
        return;
      }

      tick.state = world.x35a4 === 0x22 ? 0x3c : 0x3b;
      return;
    }
    default:
      return moment();
  }
}

/**
 * A swat (56; `DoCatSwatting`, seg29:0bd3), its script done and not cued to
 * strike (cue 5, the strike, is not reimplemented): by how far the toy is
 * above its paw, against its width times 0.8, 0.45, 0.3, 0.2 and -0.2
 * (`ds:0x386` to `0x3a6`), a zone, 8 down to 1, and the swat for it, one of
 * two by its side (`+0x358e`). In zone 8 again it may give up the toy
 * instead -- under `MapValue(10, 60, 100 - age)`, 0x138, and three times in
 * four walking off (22), else playing (global 15). Under a third of its
 * energy it makes a sound (10); it swats, tires and hungers, counts the swat
 * (two in zone 8), may change its side or `+0x3596`, and past a twentieth
 * of its energy in swats, one time in two -- or the mouse running -- may end
 * (57).
 */
function catzSwatting(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  let swat = world.swat!;
  let before: number[] = [];

  /* Cued to strike (cue 5, and `+0x3590` 1: where it turns its head to the toy). */
  if (world.cued) {
    const struck = catzStrike(mind, world, random);

    if ('tick' in struck) {
      return struck.tick;
    }

    ({ swat, before } = struck);
  }

  const width = world.size!.width;
  const up = -swat.dy;
  const over = (share: number) => Math.trunc(width * share) < up;
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  let zone: number;
  let left: number;
  let right: number;

  if (over(0.8)) {
    [zone, left, right] = [8, 0x5f, 0x60];

    if (swat.zone === 8 && percent() < mapCatzValue(10, 60, 100 - age)) {
      tick.pushes!.push(...before, 0x138);
      tick.pushed = before[0] ?? 0x138;

      if (percent() < 75) {
        tick.state = 0x16;
      } else {
        tick.global = 0xf;
      }

      return tick;
    }
  } else if (over(0.45)) {
    zone = 7;
    [left, right] = percent() < Math.trunc(age / 4) ? [0x27e, 0x27e] : [0xf4, 0xf5];
  } else if (over(0.3)) {
    [zone, left, right] = [6, 0x54, 0x59];
  } else if (over(0.2)) {
    if (swat.dx > 0 && swat.facing === 1) {
      [zone, left, right] = [4, 0x63, 0x63];
    } else if (swat.dx < -0x28 && swat.facing === 1) {
      [zone, left, right] = [5, 0x66, 0x66];
    } else {
      [zone, left, right] = swat.x3596 === 1 ? [3, 0x4b, 0x4f] : [3, 0x53, 0x58];
    }
  } else if (over(-0.2)) {
    [zone, left, right] = swat.x3596 === 1 ? [2, 0x4c, 0x50] : [2, 0x55, 0x5a];
  } else {
    [zone, left, right] = [1, 0x5c, 0x5d];
  }

  const action = swat.side ? right : left;

  if (percent() < Math.trunc(brain(CATZ_BRAIN.energy) / 3)) {
    tick.sound = catzSound(mind, 10, random);
  }

  tick.pushes!.push(...before, action);
  tick.pushed = before[0] ?? action;

  if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
    tick.energy = Math.max(0, tick.energy - 1);
  }

  if (percent() < 10) {
    tick.fullness = Math.max(0, tick.fullness! - 1);
  }

  tick.count = world.count + (zone === 8 ? 2 : 1);

  if (percent() < 30) {
    percent();
  } else if (percent() < 20) {
    percent();
  }

  if (Math.trunc(tick.energy / 20) < tick.count && percent() < 50) {
    tick.state = 0x39;
  } else if (world.x35a4 === 0x1b && swat.mouseRunning) {
    tick.state = 0x39;
  }

  return tick;
}

/**
 * Whether to stop swatting (57; `DoCatMayEndSwatting`, seg29:15d9), not
 * entered: the toy near (its paw missing it by under 100) -- and, where it
 * was near as it began (`+0x34ca`), one time in five -- and the mouse not
 * running, it swats again (56). Else, its script done, it counts; past a
 * twentieth of its energy it stops -- the toy far, or not inclined to
 * behaviour 8, or the mouse running -- for eating (3) after 0xb or 0xc, else
 * idling (6), or swats again; and otherwise pushes, by the zone it swatted in
 * last, 0x15 (1), one of two by its side (2 to 6), or 0x40 (7 and 8).
 */
function catzMayEndSwatting(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const swat = world.swat!;
  const mouse = world.x35a4 === 0x1b && swat.mouseRunning;
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (swat.miss < 100) {
    const stays = world.passed ? percent() > 19 : false;

    if (!stays && !mouse) {
      tick.state = 0x38;
      return tick;
    }
  }

  tick.count = world.count + 1;

  if (Math.trunc(brain(CATZ_BRAIN.energy) / 20) < tick.count) {
    if ((swat.missAgain ?? swat.miss) > 100 || catzBehavior(mind, 8, random) === 0 || mouse) {
      tick.global = world.x35a4 === 0xc || world.x35a4 === 0xb ? 3 : 6;
    } else {
      tick.state = 0x38;
    }

    return tick;
  }

  if (tick.count > 1) {
    catzBehavior(mind, 9, random);
  }

  const pick = (still: number, aged: number, other: number) =>
    swat.x3596 === 1 ? (age === 0 ? 0xd7 : still) : age !== 0 && percent() < 50 ? aged : other;

  switch (swat.zone) {
    case 1:
      tick.pushed = 0x15;
      break;
    case 2:
    case 3:
    case 4:
    case 5:
    case 6: {
      const left = pick(0x128, 0x2ba, 0x127);
      const right = pick(299, 699, 0x12a);
      tick.pushed = swat.side ? right : left;
      break;
    }
    case 7:
    case 8:
      tick.pushed = 0x40;
      break;
  }

  return tick;
}

/** `ShortestAngle` (seg48:1d00): an angle the shorter way, but below -128 -256 less it. */
function catzShortestAngle(angle: number) {
  return angle > 128 ? angle - 256 : angle < -128 ? -256 - angle : angle;
}

/**
 * A tick of stalking (2; `DoCatStalking`, seg14:050f), its script done, by
 * the angle it must turn to face its prey (`+0x35a4`; its angle to it less
 * `+0x688`, the shorter way) and how far it is. Far (400 or more) and not
 * serious (49 or less), it gives up and walks to it (22). Else, turned more
 * than 100 away, it turns: 0x239, under half of what its energy leaves of
 * 100, with an age; else 0x104 and 0x15. Then, the prey not placed so (3,
 * `GetSpriteScreenArea` of it), facing it within 29 and nearer than 400 --
 * or, nearer than 200, under its age -- unless a third of what its age leaves of 100
 * says no, and not afraid or seven times in ten, it pounces: diving (8),
 * where the prey is the cursor (0x17) or held, under `MapValue(0, 75, age)`,
 * else pouncing (3); otherwise it pushes 0x103. The cat itself placed so
 * (3), it makes for a corner away from the prey
 * (`TargetACornerToAvoidSprite`, `+0x35a2` 1) and walks there (22); else it
 * creeps on: its layered
 * actions (the mouse's: one time in four with an age, inclined to behaviour
 * 7, one of 0x2ff to 0x302; else `LayerAnimation` 0 and 3 by 0x6a or 0x14);
 * three times in four it creeps -- seven in ten its creep (`+0x35b8`, 0x6a
 * or 0x151 at random where none), steered at its angle, else 0xb1 or 0xb0
 * by which way it is turned, and 0x15 -- tiring and hungering; else 0x15,
 * and, inclined to behaviour 26, one time in ten 0x259 and idling (6).
 */
function catzStalking(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  const push = (action: number) => {
    tick.pushes!.push(action);
    tick.pushed ??= action;
  };
  const at = world.point!;
  const prey = world.prey!;
  const angle = catzPtToPtAngle(at, prey);
  const off = angle - (world.x688 ?? 0);
  const turn = catzShortestAngle(off);
  const distance = catzDist(at, prey);
  const age = brain(CATZ_BRAIN.age);

  if (distance >= 401 && brain(CATZ_BRAIN.seriousness) <= 49) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  if (turn > 100 || turn < -100) {
    if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.energy)) / 2) && age !== 0) {
      push(0x239);
    } else {
      push(0x104);
      push(0x15);
    }

    return tick;
  }

  /* Where the prey, not the cat, is placed so (3), it does not creep up. */
  if (!world.preyArea3) {
    let creeps = turn < -29 || turn > 29 || distance > 399;

    if (creeps && distance < 200 && percent() < age) {
      creeps = false;
    }

    if (!creeps) {
      if (
        percent() >= Math.trunc((100 - age) / 3) &&
        (brain(CATZ_BRAIN.fear) < 50 || percent() > 29)
      ) {
        const dives =
          (world.x35a4 === 0x17 || world.preyHeld) && percent() < mapCatzValue(0, 75, age);
        tick.state = dives ? 8 : 3;
        return tick;
      }

      push(0x103);
    }
  }

  if (world.area3) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  if (world.x35a4 === 0x1b && percent() < 25 && age !== 0 && catzBehavior(mind, 7, random) !== 0) {
    tick.layered = [0x2ff, 0x300, 0x301, 0x302][random(4)];
  } else {
    catzLayerAnimation(mind, world, tick, 0, 0x6a, 0x14, random);
    catzLayerAnimation(mind, world, tick, 3, 0x6a, 0x14, random);
  }

  if (percent() < 75) {
    if (percent() < 70) {
      const creep = world.x35b8 === -1 ? [0x6a, 0x151][random(2)] : world.x35b8!;
      tick.x35b8 = creep;
      tick.creepAim = angle;
      push(creep);
    } else {
      tick.x35b8 = -1;
      push(off < 0 ? 0xb1 : 0xb0);
      push(0x15);
    }

    if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
      tick.energy = Math.max(0, tick.energy - 1);
    }

    if (percent() < 10) {
      tick.fullness = Math.max(0, tick.fullness! - 1);
    }
  } else {
    push(0x15);

    if (catzBehavior(mind, 26, random) !== 0 && percent() < 10) {
      push(0x259);
      tick.global = 6;
    }
  }

  return tick;
}

/**
 * Begging (35; `DoCatBegging`, seg22:0689). Cued (6) as its script is
 * popped, one time in two it makes a sound (its slot `0x2ac`, 6), and four
 * times in five tracks what it plays with (`+0x35a4`) with its head, else
 * looks at the user. For the bottle (0xf) it may suckle, every tick: not
 * reimplemented. Its script done -- for 4, having begged (`+0x34ca`), one
 * time in ten it idles (6); else, seven times in ten or not having begged,
 * it begs (0x2ac without an age; 0x1d0 inclined to behaviour 10; else
 * 0x146 under 15 energy, else 0x145) and has begged; else it eats (global
 * 3) where less full than behaviour 11 answers, or idles.
 */
function catzBegging(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.cued) {
    if (percent() < 50) {
      tick.sound = 6;
    }

    tick.head = [percent() < 80 ? 'track' : 'user'];
    tick.headTrack = { kind: world.x35a4 ?? 0, speed: 2500 };
  }

  const begged = world.passed !== 0;

  /* Its bottle (0xf): off the shelf and not held, it grabs it (0x30); else, not near it, it goes after it (0x2e); else, its mouth within 30 of the teat and the bottle off the shelf, it suckles the user's (0x2c). Its script done, full past behaviour 11, one time in ten, having begged, it idles (6). */
  if (world.x35a4 === 0xf) {
    const bottle = world.bottle;

    if (!bottle) {
      tick.unread = true;
      return tick;
    }

    if (!bottle.held && !bottle.shelved) {
      tick.state = CATZ_STATE.sucklingGrab;
      return tick;
    }

    if (!bottle.near) {
      tick.state = CATZ_STATE.chasingSuckling;
      return tick;
    }

    if (bottle.mouth < 30 && !bottle.shelved) {
      tick.state = CATZ_STATE.sucklingUser;
      return tick;
    }

    if (brain(CATZ_BRAIN.fullness) > catzBehavior(mind, 11, random) && percent() < 10 && begged) {
      tick.global = 6;
      return tick;
    }
  }

  if (world.x35a4 === 4 && percent() <= 9 && begged) {
    tick.global = 6;
    return tick;
  }

  if (percent() > 29 || !begged) {
    const action =
      brain(CATZ_BRAIN.age) === 0
        ? 0x2ac
        : catzBehavior(mind, 10, random) !== 0
          ? 0x1d0
          : brain(CATZ_BRAIN.energy) < 15
            ? 0x146
            : 0x145;
    tick.pushed = action;
    tick.pushes = [action];
    tick.passed = 1;
    return tick;
  }

  tick.global = brain(CATZ_BRAIN.fullness) < catzBehavior(mind, 11, random) ? 3 : 6;
  return tick;
}

/**
 * A swat's strike (`DoCatSwatting`, seg29:0cee to 113b): cued (cue 5) with
 * `+0x3590` 1, it asks how the toy lies (writing the toy's point to
 * `+0x34cc`) and turns its head to it (3000). Facing it as 3, three times in
 * four it walks off (22), else plays (global 15). As 0 to 2, the paw more
 * than 100 off: the first time (`+0x3592`) it turns to its other side
 * (`+0x358e`), pushes 0xdf where not inclined to behaviour 8, or 0x141
 * where inclined to 9, and swings; again, it may end (57). Nearer, it
 * strikes -- on the shelf, open, only under 30 without an age, else 2 --
 * off its angle (`+0x688`) by up to 49 one way or the other by its side:
 * the cursor (0x17) it moves; from the open shelf it may take the toy into
 * the pen (`ShelfToPen`), and food (0xc, 0xd, 0xf) so taken has it eat
 * (global 3); the Cat Dancer (5) off the shelf, nine times in ten, it swings
 * after all. Then, `+0x35ac` 1, three times in four it walks off (22), else
 * plays (15). Otherwise, facing another way, it swings as it was not cued.
 */
export function catzStrike(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
):
  { tick: CatzStateTick } | { swat: CatzSwat; before: number[]; strike?: CatzStateTick['strike'] } {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const swat = world.swat!;
  const tick: CatzStateTick = {
    energy: brain(CATZ_BRAIN.energy),
    fullness: brain(CATZ_BRAIN.fullness),
    count: world.count,
    pushes: [],
  };
  /* Swinging after all, it asks how the toy lies again. */
  const swing = (before: number[], side = swat.side) => ({
    swat: { ...swat, ...swat.again, side },
    before,
  });
  /* (`+0x35ac` is made 1.) */
  const leave = () => {
    if (percent() < 75) {
      tick.state = 0x16;
    } else {
      tick.global = 0xf;
    }

    return { tick };
  };

  if (swat.facing === 3) {
    if (percent() < 75) {
      tick.state = 0x16;
    } else {
      tick.global = 0xf;
    }

    return { tick };
  }

  if (swat.facing < 0 || swat.facing > 2) {
    return swing([]);
  }

  if (swat.miss > 100) {
    if (swat.x3592) {
      tick.state = 0x39;
      return { tick };
    }

    const side = swat.side === 1 ? 0 : 1;

    if (catzBehavior(mind, 8, random) === 0) {
      return swing([0xdf], side);
    }

    return swing(catzBehavior(mind, 9, random) !== 0 ? [0x141] : [], side);
  }

  const shelved = swat.shelved!;
  const open = shelved && !swat.shelfClosed;

  if (open && percent() >= (brain(CATZ_BRAIN.age) === 0 ? 30 : 2)) {
    return swing([]);
  }

  /* Its angle off `+0x688`, by up to 49 (`rand() % 50`) one way or the
   * other by its side (`+0x358e`), for where the toy goes; the shelf's way
   * turned about. Struck (`StrikeToy`, seg29:1002), all but the cursor and
   * what is on the closed shelf, 100 that way. */
  const off = random(50);
  const x688 = world.x688 ?? 0;
  let angle = catzShortestAngle(swat.side === 0 ? x688 + off : x688 - off);

  if (shelved) {
    angle = -angle;
  }

  if (world.x35a4 !== 0x17 && !(shelved && swat.shelfClosed)) {
    tick.strike = { kind: world.x35a4 ?? 0, v: catzStrikeSpeed(angle) };
  }

  if (world.x35a4 !== 0x17 && open) {
    /* `ShelfToPen` answers the cat's slot `0x14c` where the toy's `+0x1d0` is 0: not reimplemented. */
    if (swat.x1d0 === 0) {
      return { tick: { ...tick, unread: true } };
    }

    if (world.x35a4 === 0xc || world.x35a4 === 0xd || world.x35a4 === 0xf) {
      tick.global = 3;
      return { tick };
    }
  }

  if (world.x35a4 === 5 && percent() < 90 && !shelved) {
    return { ...swing([]), strike: tick.strike };
  }

  return leave();
}

/**
 * A pounce (3; `DoCatPouncing`, seg14:0c60). Entered: not readied to pounce
 * (`+0x1500` 0x14) it stalks again (2); else it aims at what it plays with
 * (`+0x35a4`, its target point to `+0x34cc`, led by 50 along the mouse's way
 * for the mouse), one time in two pushes 0xdf, and leaps (its words 0x7534,
 * 0x42 and where it aims, through its slot `0xa4`): under 200 away, 0x20f
 * one time in two or without an age, else 0x21b; farther, 0x2c5 where it
 * faces 33 to 95 either way (`+0x688`) and so lies the prey from it, with an
 * age, else 0x35. Cued to catch (2), with an age: food (8, 0xb) it eats
 * (global 3, `+0x35ce` 2); the mouse it may catch, by draws by its age; the
 * others it catches where it can. Its script done: having caught it
 * (`+0xee0`) with an age, the cursor (0x17) has it ready its moment
 * (watching), else it has its victim (5); else, three times in four without
 * an age, or under its energy with one, it walks to it (22); else idles (6).
 */
function catzPouncing(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.enter) {
    if (world.x1500 !== 0x14) {
      tick.state = 2;
      return tick;
    }

    const pushes = percent() < 50 ? [0xdf] : [];
    const at = world.point!;
    const prey = world.prey!;
    const distance = catzDist(at, prey);
    const angle = catzPtToPtAngle(at, prey);
    const x688 = world.x688 ?? 0;
    const aimed =
      Math.abs(x688) >= 33 &&
      Math.abs(x688) <= 95 &&
      Math.abs(angle) >= 33 &&
      Math.abs(angle) <= 95 &&
      age !== 0;
    const leap =
      distance < 200 ? (percent() < 50 || age === 0 ? 0x20f : 0x21b) : aimed ? 0x2c5 : 0x35;
    pushes.push(leap);
    tick.pushes = pushes;
    tick.pushed = pushes[0];
    tick.leap = { ball: 0x42, to: 'prey' };
    return tick;
  }

  if (world.cues?.includes(2) && age !== 0) {
    if (world.x35a4 === 8 || world.x35a4 === 0xb) {
      tick.global = 3;
      return tick;
    }

    /* The mouse: caught at or over what its age leaves of 100, halved; else, with an age, over 69 of another draw. */
    if (world.x35a4 === 0x1b && percent() < 100 - Math.trunc(age / 2)) {
      percent();
    }
  }

  if (age !== 0 && world.caught) {
    if (world.x35a4 === 0x17) {
      tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
      tick.global = 8;
    } else {
      tick.state = 5;
    }

    return tick;
  }

  if ((age === 0 && percent() <= 74) || (age !== 0 && percent() < brain(CATZ_BRAIN.energy))) {
    tick.x35a6 = world.x35a4;
    tick.state = 0x16;
    return tick;
  }

  tick.global = 6;
  return tick;
}

/**
 * Its victim caught (5; `DoCatVictimCaptured`, seg19:06af) or wrestled
 * (6; `DoCatVictimWrestle`, seg19:0ab8). Entering, it holds it (its slots
 * `0xf0`, `0xf8`), has done nothing with it (`+0x34ca`) nor let it go
 * (`+0x35be`), and the mouse is stilled; leaving, unless let go, it throws
 * it (`StrikeToy`, a draw of the angle). Each tick, its script cued so (cue
 * 7), three times in four it makes the victim's sound
 * (`PlaySpriteContactSound`: the mouse's and 9's one of two) and one time in
 * five its own (`MapAndPlayCatSound`, 10 or 3 by a draw).
 *
 * Its script done, caught (5): let go, it walks off from the mouse (kin
 * 0x1b's `+0x26ca` 0x1d), puts it down (its slot `0xf0`, 7) and pushes
 * 0x269, and idles (global 2); having done something, under a third of its
 * liveliness, it lets go (`PushTransitionToNeutralPos` 0x20, by its script's
 * code); else nine times in ten it does something: the mouse, inclined to
 * behaviour 28 one time in two, it wrestles (6), else 0x232; 6 one time in
 * four or where `+0x1500` is 0x44 it wrestles, else 0x236; the others one
 * time in four it wrestles, else 0x233; the tenth time, it readies its moment
 * (`PreMoment`, after it idling, 0x93 meanwhile) and has it (global 8).
 *
 * Wrestled (6): nine times in ten, one time in four having done something
 * (which wrestling never sets) it is caught again (5); else 0x295 the mouse
 * or where inclined to behaviour 15 one time in four, 0x268 the others; the
 * tenth time its moment, as caught.
 */
function catzVictim(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const kind = world.x35a4;
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
    return tick;
  };
  const push = (action: number) => {
    tick.pushed = action;
    tick.pushes = [action];
    return tick;
  };

  if (world.cues?.includes(7)) {
    if (percent() < 75 && (kind === 9 || kind === 0x1b)) {
      random(2);
    }

    if (percent() < 20) {
      tick.sound = catzSound(mind, percent() < 50 ? 10 : 3, random);
    }
  }

  if (state === CATZ_STATE.victimWrestle) {
    if (percent() >= 90) {
      return moment();
    }

    if (percent() < 25 && world.passed !== 0) {
      tick.state = CATZ_STATE.victimCaptured;
      return tick;
    }

    return push(
      (catzBehavior(mind, 15, random) !== 0 && percent() < 25) || kind === 0x1b ? 0x295 : 0x268
    );
  }

  if (world.released) {
    tick.global = 2;
    return push(0x269);
  }

  /* Its way back to a neutral pose is pushed by its script's code, not held. */
  if (world.passed !== 0 && percent() < Math.trunc(brain(CATZ_BRAIN.liveliness) / 3)) {
    return tick;
  }

  if (percent() >= 90) {
    return moment();
  }

  tick.passed = 1;
  const wrestles =
    kind === 0x1b
      ? catzBehavior(mind, 28, random) !== 0 && percent() < 50
      : kind === 6
        ? percent() < 25 || world.x1500 === 0x44
        : percent() < 25;

  if (wrestles) {
    tick.state = CATZ_STATE.victimWrestle;
    return tick;
  }

  return push(kind === 0x1b ? 0x232 : kind === 6 ? 0x236 : 0x233);
}

/**
 * Turning to face the user where it faces more than 96 from them
 * (`MakeCatFaceForwardIfNeeded`, seg16:35e0, the cat's slot `0x16c`): without
 * an age 0x80; else by its energy and which half of the stage its target
 * point is in, 50 or more 0x11b on the left and 0x80 on the right, under
 * 0x87 and 0x86; then 0x150. The actions pushed, or none where it need not
 * turn.
 */
export function catzFaceForward(mind: CatzMind, world: CatzStateWorld): number[] | undefined {
  const facing = world.x688 ?? 0;

  if (facing >= -0x60 && facing <= 0x60) {
    return undefined;
  }

  const stage = world.stage!;
  const left = Math.trunc((stage.right - stage.left) / 2) + stage.left > world.point!.x;
  const turn =
    mind.brains[CATZ_BRAIN.age] === 0
      ? 0x80
      : mind.brains[CATZ_BRAIN.energy] >= 50
        ? left
          ? 0x11b
          : 0x80
        : left
          ? 0x87
          : 0x86;
  return [turn, 0x150];
}

/**
 * After dangling from the cursor (34; `DoPostDangling`, seg23:4a7e), its
 * script done: it turns to face the user where it must; else, afraid
 * (behaviour 17) four times in five, it attacks the cursor (global 17, `+0x35a4`
 * 0x17); else one time in four, not so placed (3), not inclined to behaviour
 * 26 and with an age, it pushes 0x275 and idles (6); else, under half its
 * liveliness and half its energy, 0x254 and idles; else it readies its
 * moment (`PreMoment`, after it idling, 0x93 meanwhile) and has it (8).
 * Entering, it lands as it was thrown, by how the cursor moved: not
 * reimplemented.
 */
function catzPostDangling(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const turns = catzFaceForward(mind, world);

  if (turns) {
    tick.pushes = turns;
    tick.pushed = turns[0];
    return tick;
  }

  if (catzBehavior(mind, 17, random) !== 0 && percent() < 80) {
    tick.x35a4 = 0x17;
    tick.global = 17;
    return tick;
  }

  if (
    percent() < 25 &&
    !world.area3 &&
    catzBehavior(mind, 26, random) === 0 &&
    brain(CATZ_BRAIN.age) !== 0
  ) {
    tick.pushed = 0x275;
    tick.global = 6;
    return tick;
  }

  if (
    percent() < Math.trunc(brain(CATZ_BRAIN.liveliness) / 2) &&
    percent() < Math.trunc(brain(CATZ_BRAIN.energy) / 2)
  ) {
    tick.pushed = 0x254;
    tick.global = 6;
    return tick;
  }

  tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
  tick.global = 8;
  return tick;
}

/**
 * Eating a piece of food (39; `DoCatEatPieceOfFood`, seg22:15bb). Entering,
 * it chews (0x1f4 a treat, else 0x178, and one to four more, 0x1f5 or
 * 0x203), one time in four with an age 0x2e9, and, not inclined to behaviour
 * 23, eats (its slots `0x2b4` 1, `0x33c`). Each tick, cued so (cue 0), it
 * puts its food back on the shelf (`PenToShelf`) and, one time in five each in
 * turn, looks at the cursor, at the user, or away. Its script done: the bowl
 * (0xd) off the shelf, one time in four with an age, it walks to it (22,
 * `+0x35a6` and `+0x35a4` 0xd, `+0x35a2` 0); else it readies its moment
 * (`PreMoment`, after it idling, 0x93 meanwhile), with an age, full past 95,
 * one time in four a layered 0x324, and 0x2a5, and has it (8).
 */
function catzEatPiece(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.cues?.includes(0)) {
    const look = (['track', 'user', 'off'] as const).find(() => percent() < 20);

    if (look) {
      tick.head = [look];
      tick.headTrack = { kind: 0x17, speed: 2500 };
    }
  }

  if (!world.inShelf!(0xd) && percent() < 25 && age !== 0) {
    tick.x35a6 = 0xd;
    tick.x35a4 = 0xd;
    tick.state = CATZ_STATE.locomote;
    return tick;
  }

  tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);

  if (age !== 0) {
    if (brain(CATZ_BRAIN.fullness) > 95 && percent() < 25) {
      tick.layered = 0x324;
    }

    tick.pushes = [0x2a5];
    tick.pushed = 0x2a5;
  }

  tick.global = 8;
  return tick;
}

/**
 * Eating from a bowl (40; `DoCatEatFromBowl`, seg22:19e5), the food bowl
 * (0xc, `+0x35d2` what is left in it) or the water bowl (0xd). Entering, its
 * goal not the bowl's point, or the bowl held, it eats on (global 3); else it
 * has it (its slot `0xf0` 7) and, the food bowl with more than 1 and not
 * inclined to behaviour 23, eats (`0x2b4` 1). Each tick, cued to (cue 5), it
 * eats 5 of what is left (to 0) and shows the bowl so; cued 1 or 0, the water
 * bowl so. Its script done: the food bowl with 1 or less, empty (-1), 0x1ce
 * and eating (3). Else by its temperament, inclined to behaviour 24, 25, 26,
 * 27 or none, it goes on chewing -- 0x202, 0x201, 0x208, 0x20c or 0x1cb, the
 * water bowl 0x1d3, having eaten (`+0x34ca` 1) -- or stops: going to the water
 * bowl where it is off the shelf (22, after 0x2a5), else letting go and walking
 * on (24, 27: its slot `0x238`, `+0x35a6` 0, `+0x35a2` 1, 0x2a5, 22) or
 * readying its moment (25, 26, none: 0x2a5, 8). The food bowl, having eaten,
 * it stops where full past 75 or by chance (one in ten, or in twenty), and so
 * where it is empty; inclined to 24 it may first push 0x205 and 0x206 and idle
 * (6), and to 26, full past 75, push 0x258 and idle or rest (9). The water
 * bowl, having drunk, it stops -- by chance for 25, 26 and none.
 */
function catzEatBowl(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const food = world.x35a6;
  const eaten = world.passed !== 0;
  const full = brain(CATZ_BRAIN.fullness) > 0x4b;
  let left = world.x35d2 ?? 0;

  if (world.cues?.includes(5)) {
    left = Math.max(0, left - 5);
  }

  const go = (fields: Partial<CatzStateTick>) => {
    Object.assign(tick, fields);
    return tick;
  };
  const toWater = () => go({ x35a6: 0xd, x35a4: 0xd, pushed: 0x2a5, state: CATZ_STATE.locomote });
  const letGo = () => go({ x35a6: 0, pushed: 0x2a5, state: CATZ_STATE.locomote });
  const moment = () =>
    go({
      moment: catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random),
      pushed: 0x2a5,
      global: 8,
    });
  const chew = (action: number) => go({ pushed: food === 0xd ? 0x1d3 : action, passed: 1 });
  /* The food bowl empty, or as it chose: the water bowl, where off the shelf; else it stops. */
  const emptied = (stop: () => CatzStateTick) => (!world.inShelf!(0xd) ? toWater() : stop());
  /* Having eaten: by chance under `odds`, or full; else where it is empty. */
  const sated = (odds: number, stop: () => CatzStateTick, action: number) =>
    (eaten && (percent() < odds || full)) || left === 0 ? emptied(stop) : chew(action);

  if (food === 0xc && left <= 1) {
    return go({ pushed: 0x1ce, global: 3 });
  }

  if (behave(24)) {
    if (food === 0xc) {
      if (percent() < 20) {
        if (percent() < 50) {
          return go({ pushed: 0x205, global: 6 });
        }

        /* 0x205 pushed first, it goes on. */
        sated(10, letGo, 0x202);
        tick.pushed = 0x205;
        return tick;
      }

      return sated(10, letGo, 0x202);
    }

    return food === 0xd && eaten ? letGo() : chew(0x202);
  }

  if (behave(25)) {
    if (food === 0xc) {
      return left === 0 ? emptied(moment) : chew(0x201);
    }

    return food === 0xd && eaten && percent() < 30 ? moment() : chew(0x201);
  }

  if (behave(26)) {
    if (food === 0xc) {
      if (eaten && full) {
        return percent() < 50 ? go({ pushed: 0x258, global: 6 }) : go({ global: 9 });
      }

      return left === 0 ? emptied(moment) : chew(0x208);
    }

    return food === 0xd && eaten && percent() < 50 ? moment() : chew(0x208);
  }

  if (behave(27)) {
    if (food === 0xc) {
      if (eaten && percent() < 10) {
        return letGo();
      }

      return sated(5, moment, 0x20c);
    }

    return food === 0xd && eaten ? moment() : chew(0x20c);
  }

  if (food === 0xc) {
    return sated(5, moment, 0x1cb);
  }

  return food === 0xd && eaten && percent() < 75 ? moment() : chew(0x1cb);
}

/**
 * A dive (4; `DoCatDiving`, seg19:0190), where walking in global state 0x10
 * arrives. Entering, it aims at what it plays with (`+0x35a4`), the mouse led
 * by 50 along its way where it is not after the cursor; one time in two it
 * pushes 0xdf; and it leaps -- its words 0x7534, 0x42 and where it aims --
 * at or over what `MapValue(0, 90, age)` leaves of 100, not at the cursor and
 * with an age, 0x85 one time in two, else 0x6e or 0x106; else, with an age
 * one time in two, 0x2bd, else 0x238; then its slot `0x170` with 5. Cued to
 * catch (2), with an age: 5, 6, 7 and 9 it catches where `IsSpriteCaught`;
 * the mouse so at or over what half its age leaves of 100. Its script done:
 * having caught it (`+0xee0`) with an age, the cursor (0x17) it lets go and
 * readies its moment, watching, and has it (8); else wrestles it (6) where
 * `+0x1500` is 0x78, else has its victim (5); else, without an age three
 * times in four, or under its energy, it walks to it (22); else it idles (6).
 * Leaving, inclined to behaviour 7, 0xdf, else its slot `0x1fc`.
 */
function catzDiving(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };

  if (world.enter) {
    const pushes = percent() < 50 ? [0xdf] : [];

    if (percent() >= 100 - mapCatzValue(0, 90, age) && world.x35a4 !== 0x17 && age !== 0) {
      pushes.push(percent() < 50 ? 0x85 : percent() < 50 ? 0x6e : 0x106);
    } else {
      pushes.push(age !== 0 && percent() < 50 ? 0x2bd : 0x238);
    }

    tick.pushes = pushes;
    tick.pushed = pushes[0];
    tick.leap = { ball: 0x42, to: 'prey' };
    return tick;
  }

  if (world.cues?.includes(2) && age !== 0 && world.x35a4 === 0x1b) {
    percent();
  }

  if (world.caught && age !== 0) {
    if (world.x35a4 === 0x17) {
      tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, true, random);
      tick.global = 8;
    } else {
      tick.state = world.x1500 === 0x78 ? CATZ_STATE.victimWrestle : CATZ_STATE.victimCaptured;
    }

    return tick;
  }

  if ((age === 0 && percent() < 75) || percent() < brain(CATZ_BRAIN.energy)) {
    tick.x35a6 = world.x35a4;
    tick.state = CATZ_STATE.locomote;
    return tick;
  }

  tick.global = 6;
  return tick;
}

/**
 * The scared cat's own states (`DoGSScared`'s, seg31). Staying away (58;
 * `DoCatStayAway`, seg31:022b): entering, it tracks what scared it with its
 * head (3000), pushes 0xdc, makes a sound (2) and, three times in ten,
 * 0x296 (0x2ab without an age), then 0x254; its script done, it lets go (its
 * slot `0x238`) and walks on to nothing (22, `+0x35a2` 1). Watching scared
 * (59; `DoCatScaredWatch`, seg31:039c): entering, its count cleared, head
 * (2000), 0xdc and a sound (2); each tick, within twice its width of what
 * scared it, it stays away (0x3a, its slot `0x9c` 1); its script done, past
 * three times one time in five it readies its moment (`PreMoment`, after it
 * idling, 0x93 meanwhile) and has it (8), else 0xc. Hiding (60;
 * `DoCatHide`, seg31:05a4): entering, head (2000), 0x93 three times and
 * 0x254; its script done, its moment. Its special fear (61;
 * `DoCatSpecialFearModes`, seg31:06f1): entering, it runs off the stage, 200
 * past its left (its way 1, facing 0x40) or its right (facing -0x40), at its
 * own height (its target point), `+0x35a6` 0 and `+0x35ac` 1, walking on
 * (22) at once. Jumping to the ceiling (62; `DoCatJumpToCeiling`,
 * seg31:07fb): entering, 0xdc, a sound (8), a neutral pose and 0x216 up to
 * the stage's top; its script done, past three times one time in five its
 * moment; else three times in ten a sound (2), and 0x218 without an age, else,
 * facing 0x40 one time in five, 0x2fb, else 0x320.
 */
function catzFear(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const pushes = (actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
    return tick;
  };

  switch (state) {
    case CATZ_STATE.stayAway:
      if (world.enter) {
        tick.sound = catzSound(mind, 2, random);
        return pushes([0xdc, ...(percent() < 30 ? [age === 0 ? 0x2ab : 0x296] : []), 0x254]);
      }

      tick.x35a6 = 0;
      tick.state = CATZ_STATE.locomote;
      return tick;
    case CATZ_STATE.scaredWatch:
      if (world.enter) {
        tick.sound = catzSound(mind, 2, random);
        return pushes([0xdc]);
      }

      if (world.prey && catzDist(world.prey, world.point!) < world.size!.width * 2) {
        tick.state = CATZ_STATE.stayAway;
        return tick;
      }

      tick.count = world.count + 1;
      return tick.count > 3 && percent() < 20 ? moment() : pushes([0xc]);
    case CATZ_STATE.hide:
      return world.enter ? pushes([0x93, 0x93, 0x93, 0x254]) : moment();
    case CATZ_STATE.specialFearModes: {
      if (!world.enter) {
        return tick;
      }

      const stage = world.stage!;
      const left = world.x35a8 === 1;
      tick.goal = { x: left ? stage.left - 200 : stage.right + 200, y: world.point!.y };
      tick.x688 = left ? 0x40 : -0x40;
      tick.x35a6 = 0;
      tick.x35ac = 1;
      tick.state = CATZ_STATE.locomote;
      return tick;
    }
    default: {
      tick.count = world.count + 1;

      if (tick.count > 3 && percent() < 20) {
        return moment();
      }

      if (percent() < 30) {
        tick.sound = catzSound(mind, 2, random);
      }

      if (age === 0) {
        return pushes([0x218]);
      }

      return pushes([world.x688 === 0x40 && percent() < 20 ? 0x2fb : 0x320]);
    }
  }
}

/**
 * How the cat reacts (`GetCatReaction`, seg15:10ef, its slot `0x2a4`) to 1:
 * afraid (fear 50 or more), 2; independent and serious (50 or more), 3; else
 * 3 one time in ten, else 4; then, one time in ten, 2 to 4 by a draw instead.
 */
export function catzReaction(mind: CatzMind, random: (n: number) => number) {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  let reaction: number;

  if (brain(CATZ_BRAIN.fear) >= 50) {
    reaction = 2;
  } else if (brain(CATZ_BRAIN.independence) >= 50 && brain(CATZ_BRAIN.seriousness) >= 50) {
    reaction = 3;
  } else {
    reaction = percent() < 10 ? 3 : 4;
  }

  return percent() < 10 ? random(3) + 2 : reaction;
}

/** The region a ball of the cat is in, as it is petted (`WhichRegionBeingPet`, seg28:1a19, a table at seg28:1a97); 0 for none. */
export function catzPetRegion(ball: number) {
  const regions: [number, number[]][] = [
    [3, [7, 8, 9, 10, 11, 14, 15, 24, 27, 28, 29, 37, 40, 55, 56, 57, 58, 59, 60, 61, 62]],
    [4, [4, 5, 30, 31, 36]],
    [5, [16, 17, 18, 19, 20, 21, 22, 23, 34, 35, 63, 64]],
    [6, [0, 1, 41, 42, 49, 50, 51, 52, 53, 54]],
    [7, [43, 44, 45, 46, 47, 48]],
    [8, [2, 6, 12, 13, 32, 33, 38, 39]],
    [9, [3, 25, 26]],
  ];
  return regions.find(([, balls]) => balls.includes(ball))?.[0] ?? 0;
}

/**
 * How the cat takes being petted in a region (`PetRegionSwitch`, seg28:1b9f,
 * a table at seg28:1f00), without an age as 8: 1, 2, 5 and 6 upset it --
 * mode 1, its slot `0x9c` 1, 0xd6, 0xf0, 0x2ad or 0x137 -- as does 7, by its
 * reaction: 2, 0xdc and 8 or 0xb9; 3, 0x6d; 4, a sound (2) and 0xd7; upset
 * (0x35). The others, beginning to be petted (0x31), go on to petting (0x32),
 * in mode 3 where `+0x3576`, else mode 2 and, its pose 0x6b, 0x76 or 0x74,
 * 0xf2. Undefined where it does not go on.
 */
function catzPetRegionSwitch(
  state: number,
  region: number,
  mind: CatzMind,
  world: CatzStateWorld,
  tick: CatzStateTick,
  random: (n: number) => number
): CatzStateTick | undefined {
  const upset = (pushes: number[]) => {
    tick.pushes = pushes;
    tick.pushed = pushes[0];
    tick.state = CATZ_STATE.upsetPetting;
    return tick;
  };

  switch (mind.brains[CATZ_BRAIN.age] === 0 ? 8 : region) {
    case 1:
      return upset([0xd6]);
    case 2:
      return upset([0xf0]);
    case 5:
      return upset([0x2ad]);
    case 6:
      return upset([0x137]);
    case 7:
      switch (catzReaction(mind, random)) {
        case 2:
          return upset([0xdc, random(2) === 0 ? 8 : 0xb9]);
        case 3:
          return upset([0x6d]);
        case 4:
          tick.sound = catzSound(mind, 2, random);
          return upset([0xd7]);
        default:
          return upset([]);
      }
    default:
      if (state !== CATZ_STATE.beginPetting) {
        return undefined;
      }

      if (!world.petting!.x3576 && [0x6b, 0x76, 0x74].includes(world.x1500 ?? 0)) {
        tick.pushes = [0xf2];
        tick.pushed = 0xf2;
      }

      tick.state = CATZ_STATE.petting;
      return tick;
  }
}

/**
 * The smaller petting states, their scripts done (seg28): beginning (49;
 * `DoCatBeginPetting`) -- petted in a region, as `PetRegionSwitch` takes it,
 * else its moment (`PreMoment`, after it idling, 0x93 meanwhile; 8); may it
 * end (51; `DoCatMayEndPetting`) -- still petted, the cursor moved, as
 * `PetRegionSwitch` takes it, else back to petting (0x32); else its mode over
 * 1, one less and, by the mode it came with, 2 0xd7, 3 0x70, 4 to 6 0xe9; else
 * its moment; after (52; `DoCatAfterPetting`) -- entering, one time in two
 * resting (9), else 0xd8; its script done, one time in two affectionate (14),
 * else idling (6); upset (53; `DoCatUpsetPetting`) -- its mode over 2, back to
 * petting (0x32), else idling (6).
 */
function catzPettingTick(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const petting = world.petting!;
  const mode = petting.modes[0];
  const moment = () => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
    tick.global = 8;
    return tick;
  };

  switch (state) {
    case CATZ_STATE.beginPetting: {
      const region = catzPetRegion(petting.ball);
      return region
        ? (catzPetRegionSwitch(state, region, mind, world, tick, random) ?? tick)
        : moment();
    }
    case CATZ_STATE.mayEndPetting: {
      const moved =
        petting.cursorWas.x !== -1 && petting.cursorWas.y !== -1 ? (petting.movement ?? 0) : 0;
      const region = catzPetRegion(petting.ball);

      if (region && moved) {
        if (catzPetRegionSwitch(state, region, mind, world, tick, random)) {
          return tick;
        }

        tick.state = CATZ_STATE.petting;
        return tick;
      }

      if (mode > 1) {
        const action = petting.x356c === 2 ? 0xd7 : petting.x356c === 3 ? 0x70 : 0xe9;

        if (petting.x356c >= 2 && petting.x356c <= 6) {
          tick.pushes = [action];
          tick.pushed = action;
        }

        return tick;
      }

      return moment();
    }
    case CATZ_STATE.afterPetting:
      if (world.enter) {
        if (percent() < 50) {
          tick.global = 9;
        } else {
          tick.pushes = [0xd8];
          tick.pushed = 0xd8;
        }

        return tick;
      }

      tick.global = percent() < 50 ? 14 : 6;
      return tick;
    default:
      if (mode > 2) {
        tick.state = CATZ_STATE.petting;
      } else {
        tick.global = 6;
      }

      return tick;
  }
}

/**
 * Being petted (50; `DoCatPetting`, seg28:0294), not entered. Each tick, its
 * script popped, it fidgets by its rate (`+0x356e`), a draw each: under twice
 * it, its eyelids; else under it, not in mode 2, again; else under it, again;
 * else under it and its mode settled (`IsCatGettingMoreIntimate`: its last
 * behaviour-5 modes all one), its head let go, looking at the user or
 * tracking the cursor, by draws under twice its rate; else under it, its mode
 * as far back as half behaviour 5 not 0, looking at a random point (two
 * draws); else under it twice more, its fudgers. Its script done: in mode 2,
 * three times in ten, a region that upsets it (5 to 7) upsets it; the user
 * stopped, under its seriousness (at least 25) it may end (0x33); else, with
 * no sound of its own (`+0x3570` -1), one time in ten nothing, else, inclined
 * to behaviour 26 one time in two or three times in ten, a sound (5 or 3);
 * with one, a draw. Its mode settled, with an age, it moves on -- in mode 2 one
 * time in ten by 0 to 2; else one time in two by 0 or 1, else by -1 to 1. Then
 * by its mode, its odds five times its rate: see the knowledge base.
 */
function catzPetting(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const age = brain(CATZ_BRAIN.age);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const petting = world.petting!;
  const rate = petting.rate;
  const modes = petting.modes;
  const settled = () => {
    const last = catzBehavior(mind, 5, random);
    return modes.slice(0, Math.max(1, last)).every((mode) => mode === modes[0]);
  };
  const push = (action: number) => {
    tick.pushes = [action];
    tick.pushed = action;
    return tick;
  };

  /* Its fidgeting, a draw a step. */
  if (percent() >= rate * 2) {
    if (percent() >= rate || modes[0] === 2) {
      if (percent() >= rate) {
        if (percent() < rate && settled()) {
          tick.head = [percent() < rate * 2 ? 'off' : percent() < rate * 2 ? 'user' : 'track'];
          tick.headTrack = { kind: 0x17, speed: 2000 };
        } else if (percent() < rate && modes[Math.trunc(catzBehavior(mind, 5, random) / 2)] !== 0) {
          random(1);
          random(1);
        } else if (percent() >= rate) {
          percent();
        }
      }
    }
  }

  const region = catzPetRegion(petting.ball);
  const moved = petting.movement ?? 0;
  const stopped = petting.stopped ?? false;

  if (
    modes[0] === 2 &&
    percent() < 30 &&
    [1, 2, 5, 6, 7].includes(region) &&
    catzPetRegionSwitch(CATZ_STATE.petting, region, mind, world, tick, random)
  ) {
    return tick;
  }

  if (stopped && percent() < Math.max(25, brain(CATZ_BRAIN.seriousness))) {
    tick.state = CATZ_STATE.mayEndPetting;
    return tick;
  }

  if (petting.x3570 === -1) {
    if (percent() >= 10) {
      if ((catzBehavior(mind, 26, random) !== 0 && percent() < 50) || percent() < 30) {
        tick.sound = catzSound(mind, percent() < 50 ? 5 : 3, random);
      }
    }
  } else {
    percent();
  }

  let mode = modes[0];

  if (settled() && age !== 0) {
    mode +=
      mode === 2 ? (percent() < 10 ? random(3) : 0) : percent() < 50 ? random(2) : random(3) - 1;
  }

  const odds = rate * 5;
  const near = moved < 10;

  switch (mode) {
    case 2: {
      const early = world.count < 5 && age !== 0;
      const pose = petting.pose ?? world.x1500;

      if (region === 0) {
        return push(0xd7);
      }

      if (early && pose === 0x61) {
        return push(near ? 0xbd : 0xbb);
      }

      if (early && pose === 0x31) {
        return push(near ? 0xc8 : 0xc7);
      }

      if (early && pose === 0x5f) {
        return push(near ? 0xc0 : 0xbf);
      }

      if (early && pose === 0x14) {
        return push(0xee);
      }

      if (region === 3 && percent() < odds && age !== 0) {
        return push(near ? 0x10d : 0x10c);
      }

      if (region === 4 && percent() < odds) {
        return push(near ? 0xd3 : 0xd2);
      }

      if (region === 9 && age !== 0 && percent() < odds) {
        return push(near ? 0x2de : 0xe6);
      }

      if (percent() < 10) {
        return push(age === 0 ? 0x322 : 0x2ae);
      }

      if (moved > 30 && age !== 0) {
        if (percent() < catzBehavior(mind, 6, random)) {
          switch (catzReaction(mind, random)) {
            case 2:
              tick.x35a4 = 0x17;
              tick.global = 17;
              return tick;
            case 3:
              tick.pushes = [0xdf, random(2) === 0 ? 0x6d : 0x2bc];
              tick.pushed = 0xdf;
              tick.head = ['track'];
              tick.headTrack = { kind: 0x17, speed: 2500 };
              return tick;
            case 4:
              tick.sound = catzSound(mind, 4, random);
              return push(0xce);
            default:
              return tick;
          }
        }

        return push(percent() < 50 ? 0x33 : 0x32);
      }

      return push(moved > 10 && percent() < odds ? 0xca : 0xcb);
    }
    case 3:
      return stopped ? push(0x70) : near ? push(0xc8) : moved < 30 ? push(0xc7) : tick;
    case 4:
      return stopped ? push(0xe9) : near ? push(0xe2) : moved < 30 ? push(0xe3) : tick;
    case 5:
      if (percent() < 10) {
        tick.state = CATZ_STATE.afterPetting;
        return tick;
      }

      return push(stopped ? 0x70 : 0x9b);
    case 6:
      tick.state = CATZ_STATE.afterPetting;
      return tick;
    default:
      return tick;
  }
}

/**
 * Affectionate's own states. Aligning to a target (24;
 * `DoCatAlignToTarget`, seg25:3d3a): entering, it asks how its target lies
 * (its slot `0x304`, by ball 0x16 eating, else 7), an offset of 5 or less
 * none, and, facing 1, 0 or 2, steps toward it by the greater offset's sign
 * (0x26, 0x27, 0x23 or 0xf2, a table at seg25:40f1); facing 3, its moment.
 * Its script done, grooming (13) its state 0x20, affectionate (14) licking
 * the cursor (0x36), else its moment. Licking the cursor (54;
 * `DoCatCursorLick`, seg30:1012): see the knowledge base. Lacking affection
 * (55; `DoCatLackingAffection`, seg30:1358): each tick, the cursor within the
 * stage it kept, three times in four it goes after it (0x5, walking to 0x17),
 * else idles (6); its script done, under what its independence leaves of 100
 * one time in two 0xdb, else idling (6).
 */
function catzFond(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };
  const moment = (after = 6) => {
    tick.moment = catzPreMoment(mind, world.area3 ?? false, after, 0x93, false, random);
    tick.global = 8;
    return tick;
  };

  switch (state) {
    case CATZ_STATE.alignToTarget: {
      if (world.enter) {
        const swat = world.swat!;
        const dx = Math.abs(swat.dx!) <= 5 ? 0 : swat.dx!;
        const dy = Math.abs(swat.dy!) <= 5 ? 0 : swat.dy!;

        /* There already, and facing as it would (`+0x34d0` 0x81, as affectionate's walk leaves it). */
        if (dx === 0 && dy === 0 && world.global === 14) {
          return tick;
        }

        const wide = Math.abs(dx) > Math.abs(dy);

        switch (swat.facing) {
          case 1:
            return push(wide ? (dx > 0 ? 0x27 : 0x26) : dy > 0 ? 0xf2 : 0x23);
          case 0:
            return push(wide ? (dx > 0 ? 0x23 : 0xf2) : dy > 0 ? 0x27 : 0x26);
          case 2:
            return push(wide ? (dx > 0 ? 0xf2 : 0x23) : dy > 0 ? 0x26 : 0x27);
          case 3:
            return moment();
          default:
            return tick;
        }
      }

      if (world.global === 13) {
        tick.state = 0x20;
        return tick;
      }

      if (world.global === 14) {
        tick.state = CATZ_STATE.cursorLick;
        return tick;
      }

      return moment();
    }
    case CATZ_STATE.cursorLick: {
      if (world.enter) {
        return brain(CATZ_BRAIN.fear) >= 50 || percent() < 50 ? push(0x130, 0xda) : push(0xda);
      }

      const cursor = world.cursorAt!;
      const kept = world.x35c2!;
      const moved = Math.abs(kept.x - cursor.x) > 5 || Math.abs(kept.y - cursor.y) > 5;
      percent();

      if (percent() < 80 && !moved) {
        if (world.passed === 0 && percent() < 80) {
          return push(0xda);
        }

        tick.passed = 1;
        return push(0x248, 0x248, 0x248, 0x248);
      }

      moment(8);

      if (world.x688! >= -0x20 && world.x688! <= 0x20 && percent() < 50) {
        tick.pushes = [0x139];
        tick.pushed = 0x139;
      }

      return tick;
    }
    default: {
      if (world.enter) {
        tick.head = ['track'];
        tick.headTrack = { kind: 0x17, speed: 3000 };
        return push(0xdc, 0xdb);
      }

      const cursor = world.cursorAt!;
      const kept = world.kept!;

      if (
        cursor.x > kept.left &&
        cursor.x < kept.right &&
        cursor.y > kept.top &&
        cursor.y < kept.bottom
      ) {
        if (percent() < 75) {
          tick.x35a6 = 0x17;
          tick.state = CATZ_STATE.locomote;
          return push(5);
        }

        tick.global = 6;
        return tick;
      }

      if (percent() < 100 - brain(CATZ_BRAIN.independence) && percent() < 50) {
        return push(0xdb);
      }

      tick.global = 6;
      return tick;
    }
  }
}

/**
 * Suckling its bottle (kin 0xf; global 5, `DoGSSuckling`, seg33:0000, which
 * makes it what it plays with and walks to and goes after it, 0x2e). Going
 * after it (46; `DoChasingSuckling`): its script done, farther from it than
 * its width it walks on (22); else 0x3 and, near it, it begs for it (0x23).
 * Its attempt (47) does nothing. Grabbing it (48; `DoSucklingGrab`): entering,
 * its nose to the teat (0x123, 0x1cf, 0x125); its script done, suckling it
 * (0x2d). Suckling it (45; `DoSucklingSelf`): entering, the bottle's `+0x1da`
 * not 1, idling (6); else it latches on and pushes 0x7b 20 to 59 times, then
 * 0x7f; each tick, the user holding it, suckling the user's (0x2c); its
 * script done, idling (6).
 */
function catzSuckling(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const bottle = world.bottle;
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };

  if (!bottle) {
    tick.unread = true;
    return tick;
  }

  switch (state) {
    case CATZ_STATE.chasingSuckling:
      /* Entering, its words to steer by; then, its script popped at once, as any tick. */
      if (catzDist(bottle.at, world.point!) > world.size!.width) {
        tick.state = CATZ_STATE.locomote;
        return tick;
      }

      push(3);

      if (bottle.near) {
        tick.x35a6 = 0xf;
        tick.x35a4 = 0xf;
        tick.state = CATZ_STATE.begging;
      }

      return tick;
    case CATZ_STATE.sucklingUser: {
      /* `DoSucklingUser`, seg33:0805: entering, it latches on, nothing nursed (`+0x34ca` 0), and 0x74 so many times; each tick, its mouth farther from the teat than the bottle allows (`+0x2520`), it lets go and begs again (0x23, 0x7c in pose 0x71); else, having nursed, one time in 200 or farther than half that, 0xaf and nursing again (0x74 so many times); the user no longer holding the bottle, suckling it (0x2d); else, its script done, idling (6). */
      if (world.enter) {
        return push(0x74);
      }

      if (bottle.reach < bottle.mouth) {
        tick.x35a6 = 0xf;
        tick.x35a4 = 0xf;
        tick.state = CATZ_STATE.begging;
        return tick;
      }

      if ((random(200) === 0 || Math.trunc(bottle.reach / 2) < bottle.mouth) && world.passed) {
        tick.passed = 0;
        push(0xaf);
      }

      if (!bottle.held) {
        tick.state = CATZ_STATE.sucklingSelf;
        return tick;
      }

      if (tick.pushed === undefined) {
        tick.global = 6;
      }

      return tick;
    }
    case CATZ_STATE.sucklingGrab:
      if (world.enter) {
        return push(0x123, 0x1cf, 0x125);
      }

      tick.state = CATZ_STATE.sucklingSelf;
      return tick;
    case CATZ_STATE.sucklingSelf:
      if (world.enter) {
        if (bottle.x1da !== 1) {
          tick.global = 6;
          return tick;
        }

        return push(...Array<number>(random(40) + 20).fill(0x7b), 0x7f);
      }

      if (bottle.held) {
        tick.state = CATZ_STATE.sucklingUser;
        return tick;
      }

      tick.global = 6;
      return tick;
    default:
      return tick;
  }
}

/**
 * A treat (kin 0xb) held out to it. Waiting for it (36; `DoCatWaitForTreat`,
 * seg22:0a59): each tick, in pose 0x40, its ball 7 within 10 of the treat,
 * it keeps where the treat is (`+0x35c2`) and nibbles it (0x25); the treat
 * not held, it walks to it (22, `+0x35a2` 0); else every so many ticks
 * (`+0x3504`, 9 to 58) it looks at the user or, one time in two, the treat
 * or the cursor (3000), seven times in ten turns its head by a fudger, and
 * makes a sound, under what its fullness leaves of 100 one time in two (6),
 * else under a quarter of what its seriousness leaves (7). Its script done:
 * not yet begged, 0xd7; placed so (3), walking to it; its first 15 times,
 * under what its independence leaves of 100 or in pose 0x40, its head on the
 * treat (2500) and, six times in ten, 0x28c, else 0xd7; inclined to
 * behaviour 28, under a third of its energy, one time in ten playing (15),
 * else 0x243; to 16 one time in two begging (0x23); to 7 one time in two
 * attacking (1); not to 8, one time in four snubbing (11); afraid, one time
 * in five scared (17); else 0xd7. Nibbling it (37; `DoCatNibbleTreat`,
 * seg22:107d): its script done, having nibbled, it puts the treat back on the
 * shelf and eats it (0x27); else the treat more than 10 either way from where
 * it kept it, it waits for it again (0x24); else 0x189.
 */
function catzTreat(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const brain = (n: number) => mind.brains[n];
  const percent = () => random(101);
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const tick: CatzStateTick = { energy: brain(CATZ_BRAIN.energy), count: world.count };
  /* Waiting, each push ends with its script popped again and its count on
   * one (seg22:104d); nibbling counts its own. */
  const push = (action: number) => {
    tick.pushes = [action];
    tick.pushed = action;
    tick.count = world.count + 1;
    return tick;
  };
  const treat = world.prey!;

  if (state === CATZ_STATE.nibbleTreat) {
    const kept = world.x35c2!;
    const moved = Math.abs(kept.x - treat.x) > 10 || Math.abs(kept.y - treat.y) > 10;

    if (world.count > 0) {
      tick.state = CATZ_STATE.eatPieceOfFood;
      return tick;
    }

    if (moved) {
      tick.state = CATZ_STATE.waitForTreat;
      return tick;
    }

    tick.count = world.count + 1;
    return push(0x189);
  }

  const ball = world.ball7;

  if (
    world.x1500 === 0x40 &&
    ball &&
    Math.abs(ball.x - treat.x) < 10 &&
    Math.abs(ball.y - treat.y) < 10
  ) {
    tick.state = CATZ_STATE.nibbleTreat;
    return tick;
  }

  const walk = () => {
    tick.x35a6 = world.x35a4;
    tick.state = CATZ_STATE.locomote;
    return tick;
  };

  if (!world.preyHeld) {
    return walk();
  }

  if (world.ticks === 0) {
    random(50);

    /* At the user, or tracking -- one time in two the treat, else the cursor -- at 3000 (seg22:0c46 on). */
    if (percent() < 50) {
      tick.head = ['user'];
    } else {
      tick.head = ['track'];
      tick.headTrack = { kind: percent() < 50 ? (world.x35a4 ?? 0) : 0x17, speed: 3000 };
    }

    if (percent() < 70) {
      random(20);
    }

    if (percent() < 100 - brain(CATZ_BRAIN.fullness) && percent() < 50) {
      tick.sound = catzSound(mind, 6, random);
    } else if (percent() < Math.trunc((100 - brain(CATZ_BRAIN.seriousness)) / 4)) {
      tick.sound = catzSound(mind, 7, random);
    }
  }

  tick.passed = 1;

  if (world.passed === 0) {
    return push(0xd7);
  }

  if (world.area3) {
    return walk();
  }

  tick.count = world.count + 1;

  if (
    world.count < 15 &&
    (percent() < 100 - brain(CATZ_BRAIN.independence) || world.x1500 === 0x40)
  ) {
    tick.head = ['track'];
    tick.headTrack = { kind: world.x35a4 ?? 0, speed: 2500 };
    return push(percent() < 60 ? 0x28c : 0xd7);
  }

  if (behave(28) && percent() < Math.trunc(brain(CATZ_BRAIN.energy) / 3)) {
    if (percent() < 10) {
      tick.global = 15;
      return tick;
    }

    return push(0x243);
  }

  if (behave(16) && percent() < 50) {
    tick.state = CATZ_STATE.begging;
    return tick;
  }

  if (behave(7) && percent() < 50) {
    tick.global = 1;
    return tick;
  }

  if (!behave(8) && percent() < 25) {
    tick.global = 11;
    return tick;
  }

  if (brain(CATZ_BRAIN.fear) >= 50 && percent() < 20) {
    tick.global = 17;
    return tick;
  }

  return push(0xd7);
}

/**
 * The Adoption Kit (global 22; `DoGSAdoptionKit`, seg13:0000). Beginning
 * it (72; `DoCatInitKit`): entering, it is put above the stage's corner,
 * pushes 0x1c4 and is in a basket (its slot `0xf0`, 0x18); its script done,
 * in the baskets (0x49). In them (73; `DoCatInBaskets`): entering, with no
 * basket it takes one (its slots `0x3d0`, `0x3d4`), else it climbs out
 * (0x4c); each tick, waited longer than its wait (`+0x3502` over `+0x360e`),
 * it peeks out (0x4a), else waits on; its script done, 0x1c4. Peeking (74;
 * `DoCatPeekFromBasket`): entering, three times in four or never yet, it
 * peeks plainly (`+0x3610` 0: 0x1c4, then by temperament, 24 0x1c5, 27
 * 0x2ce, 25 0x2d0, 26 0x2d1, else 0x2cf), else boldly (1: 0x1ca, 0x1c8),
 * counting peeks where `PetParams` `+0xca`; each tick, the cursor about and
 * the apt's root holding fewer than ten, it climbs out (0x4c); cued (6), it
 * watches the mouse unless still and one time in two makes a sound (7); its
 * script done, by a draw of 2 to 7 over its peeks (unless its basket is 3 and
 * the mouse not still), `+0xca` 0, or ten or more, it ends its peek (0x4b,
 * its basket none); else, every basket been in, none, and its basket been in
 * (unless 3 and the mouse not still), it ends its peek; else it climbs out
 * (0x4c, its peeks none). Ending it (75; `DoCatEndPeekFromBasket`): entering,
 * boldly 0x1ca, then 0x1c4; its script done, in the baskets (0x49).
 */
function catzKit(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const kit = world.kit;
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };

  if (!kit) {
    tick.unread = true;
    return tick;
  }

  switch (state) {
    case CATZ_STATE.initKit:
      if (world.enter) {
        return push(0x1c4);
      }

      tick.state = CATZ_STATE.inBaskets;
      return tick;
    case CATZ_STATE.inBaskets:
      if (world.count > kit.wait) {
        tick.state = CATZ_STATE.peekFromBasket;
        return tick;
      }

      tick.count = world.count + 1;
      return push(0x1c4);
    case CATZ_STATE.peekFromBasket: {
      if (world.enter) {
        if (percent() < 75 || kit.peeks === 0) {
          const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
          const after = behave(24)
            ? 0x1c5
            : behave(27)
              ? 0x2ce
              : behave(25)
                ? 0x2d0
                : behave(26)
                  ? 0x2d1
                  : 0x2cf;
          return push(0x1c4, after);
        }

        return push(0x1ca, 0x1c8);
      }

      if (world.cursorAbout && kit.rootCount < 10) {
        tick.state = 0x4c;
        return tick;
      }

      if (world.cues?.includes(6) && percent() < 50) {
        tick.sound = catzSound(mind, 7, random);
      }

      const moving = kit.basket === 3 && kit.mouseState !== 1;

      if ((random(6) + 2 > kit.peeks && !moving) || kit.ca === 0 || kit.rootCount >= 10) {
        tick.state = CATZ_STATE.endPeekFromBasket;
        return tick;
      }

      const baskets = kit.baskets.every((been) => been !== 0)
        ? kit.baskets.map(() => 0)
        : kit.baskets;

      if (baskets[kit.basket] !== 0 && !moving) {
        tick.state = CATZ_STATE.endPeekFromBasket;
        return tick;
      }

      tick.state = 0x4c;
      return tick;
    }
    case CATZ_STATE.exitBasket: {
      /* `DoCatExitBasket`, seg13:09d3: entering, out (`+0x35fa` 1, its slot `0x3d8`), 0x171; cued (0), it lets the basket go and has been in it; its script done, by temperament: 24 grooming (13); 27, after the cursor (`+0x35a4` 0x17), one time in two the mouse roused, one time in five scared (17), else playing (15); 25 the same, attacking (1); 26, its energy 50, one time in two eating (3), else affectionate (14); else one time in two affectionate, else playing with one of 6, 7 and 5. */
      if (world.enter) {
        return push(0x171);
      }

      const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
      const go = (global: number) => {
        tick.global = global;
        return tick;
      };

      if (behave(24)) {
        return go(13);
      }

      if (behave(27)) {
        tick.x35a4 = 0x17;
        percent();
        return go(percent() < 20 ? 17 : 15);
      }

      if (behave(25)) {
        tick.x35a4 = 0x17;
        percent();
        return go(1);
      }

      if (behave(26)) {
        return go(percent() < 50 ? 3 : 14);
      }

      if (percent() < 50) {
        return go(14);
      }

      tick.x35a4 = [6, 7, 5][random(3)];
      return go(15);
    }
    case CATZ_STATE.jumpInBasket:
    case CATZ_STATE.dropIntoBasket:
      /* `DoCatJumpInBasket`, seg13:0d29, and `DoCatDropIntoBasket`, seg13:0e9a: entering, its basket's place its goal (its slot `0x3cc`), its words to it, and 0x1c4 jumping, 0x297 dropping; cued (0), in the basket; its script done, in the baskets (0x49, `+0x35f6` -1). */
      if (world.enter) {
        return push(state === CATZ_STATE.jumpInBasket ? 0x1c4 : 0x297);
      }

      tick.state = CATZ_STATE.inBaskets;
      return tick;
    default:
      if (world.enter) {
        return kit.peekMode === 1 ? push(0x1ca, 0x1c4) : push(0x1c4);
      }

      tick.state = CATZ_STATE.inBaskets;
      return tick;
  }
}

/** `ds:031a`: how far round, at most, the dream's float turns the cat a tick, in radians (a quarter of a degree). */
const DREAM_SPIN = 0.0043633231299858265;

/**
 * A dream in CatNapz (CATZDLL.DLL seg18; kb/topics/catz-behaviour.md,
 * "CatNapz"):
 *
 * - starting a dream (65; `DoCatStartDream`, seg18:0202): entering, it turns
 *   to face the user where it must, pushes 0xb3 and 0xd5, steers (0x7538, 6,
 *   0x756f) and pushes 0xd5 again, its phase (`+0x35da`) 0. Each tick, in
 *   phase 0, cued (6), it puts its cloud (kin 0x10) up by a corner of the
 *   stage (`+0x35ae`), sets it going there, and its phase is 1; the cloud
 *   cued that it has come (4), its count (`+0x3502`) is 0 and its phase 2;
 *   in phase 2 it counts 28 ticks, then keeps how far the cloud is from it
 *   (`+0x35f0`, `+0x35f2`) and floats from its target point (`+0x35dc`,
 *   `+0x35e4`, doubles), phase 3. In phase 3, within 50 of the stage's
 *   middle across and down, it lets go (its slot `0x9c` 1) and dreams, three
 *   times in four well (66), else badly (67); else it floats round the
 *   middle, a little further round each tick for 100 ticks, its distance
 *   from it cut to a whole number three times in four or within 10, its
 *   goal (`+0x34cc`) and its cloud moved with it. Its script done, 0xd5;
 * - a good dream (66; `DoCatGoodDream`, seg18:090c): entering, not yet
 *   dreamed (`+0x34ca` 0). Its script done, about four times in ten (60 or
 *   more of 101), having dreamed, its dream ends (69, `+0x35d8` 1); else it dreams by
 *   its temperament what its dream sprite (kin 0x13) shows (`+0x35ec`) --
 *   behaviour 28 three times in four, 1, 2 or 4, 0x29a; 25 so, 10, 0x29e; 27
 *   so, 10 or 7, 0x2a7; 26 nine times in ten, 0, 3, 6 or 5, 0x29d; 24 three
 *   times in four, 8, 0x323; else any of 0 to 8, and one time in five 10,
 *   0x29e, else 0x323 -- and has dreamed. Cued (7), the dream mouse (kin
 *   0x1b, for 10) or the dream is shown; cued (6), both are put away;
 * - a bad dream (67; `DoCatBadDream`, seg18:0ed0): entering, its count 0,
 *   `+0x35d8` 1 to 5, 0x15e. Cued (7), it loads a breed at random into
 *   `+0x35ee` (`LoadRandomLinezFile`) and morphs toward it (`MorphCat`).
 *   Its script done, with `+0x35ee` 2 one time in two, the dream's mouse
 *   (68), else its dream ends (69, not dreamed);
 * - the dream's mouse (68; `DoCatBadDreamMouse`, seg18:10f7): entering, the
 *   mouse is put left of the stage, its head on it (3000). Each tick, the
 *   mouse past the stage's right, its dream ends (69, not dreamed); else,
 *   its script done, 0x2a0;
 * - the dream's end (69; `DoCatDreamEnd`, seg18:13d5): entering, it and the
 *   cloud let go (slot `0x9c` 2), 0x2a1 having dreamed, else 0x299, and the
 *   cloud pushes 1. Its script done, it readies its moment (`PreMoment`,
 *   after it idling, 0x93 meanwhile) and has it (8).
 *
 * The float's own sums are the C library's (`atan2`, `sqrt`, `cos`, `sin`,
 * seg1), not JavaScript's, so where it has the cat is near, not bit for bit.
 */
function catzDream(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const dream = world.dream;
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };

  if (!dream) {
    tick.unread = true;
    return tick;
  }

  switch (state) {
    case CATZ_STATE.startDream: {
      if (world.enter) {
        tick.dream = { phase: 0 };
        return push(...(catzFaceForward(mind, world) ?? []), 0xb3, 0xd5, 0xd5);
      }

      let phase = dream.phase;
      let at = dream.at;

      if (phase === 0 && world.cued) {
        phase = 1;
        tick.count = 0;
      }

      if (dream.cloudCome) {
        phase = 2;
        tick.count = 0;
      }

      if (phase === 2) {
        if (tick.count < 0x1c) {
          tick.count++;
        } else {
          tick.count = 0;
          phase = 3;
          at = { ...world.point! };
        }
      }

      tick.dream = { phase };

      if (phase === 3) {
        const stage = dream.stage;
        const middle = {
          x: Math.trunc((stage.right - stage.left) / 2) + stage.left,
          y: Math.trunc((stage.bottom - stage.top) / 2) + stage.top,
        };
        const dx = at.x - middle.x;
        const dy = at.y - middle.y;

        if (Math.abs(Math.trunc(dx)) <= 50 && Math.abs(Math.trunc(dy)) <= 50) {
          tick.state = percent() < 75 ? CATZ_STATE.goodDream : CATZ_STATE.badDream;
          return tick;
        }

        let spin = DREAM_SPIN;

        if (tick.count < 100) {
          spin = (tick.count / 100) * spin;
          tick.count++;
        }

        const angle = Math.atan2(dy, dx) + spin;
        let distance = Math.sqrt(dy * dy + dx * dx);

        if (percent() < 75 || distance < 10) {
          distance = Math.trunc(distance);
        }

        at = {
          x: Math.cos(angle) * distance + middle.x,
          y: Math.sin(angle) * distance + middle.y,
        };
        tick.dream.at = at;
        tick.goal = { x: Math.trunc(at.x), y: Math.trunc(at.y) };
      }

      return push(0xd5);
    }
    case CATZ_STATE.goodDream: {
      const passed = world.enter ? 0 : (world.passed ?? 0);

      if (percent() >= 60 && passed !== 0) {
        tick.dream = { x35d8: 1 };
        tick.passed = 1;
        tick.state = CATZ_STATE.dreamEnd;
        return tick;
      }

      const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
      let kind: number;
      let action: number;

      if (behave(28) && percent() < 75) {
        kind = [1, 2, 4][random(3)];
        action = 0x29a;
      } else if (behave(25) && percent() < 75) {
        kind = 10;
        action = 0x29e;
      } else if (behave(27) && percent() < 75) {
        kind = random(2) === 0 ? 10 : 7;
        action = 0x2a7;
      } else if (behave(26) && percent() < 90) {
        kind = [0, 3, 6, 5][random(4)];
        action = 0x29d;
      } else if (behave(24) && percent() < 75) {
        kind = 8;
        action = 0x323;
      } else {
        kind = random(9);
        action = 0x323;

        if (percent() < 20) {
          kind = 10;
          action = 0x29e;
        }
      }

      tick.dream = { kind };
      tick.passed = 1;
      return push(action);
    }
    case CATZ_STATE.badDream:
      if (world.enter) {
        tick.count = 0;
        tick.dream = { x35d8: random(5) + 1 };
        return push(0x15e);
      }

      if (world.x35ee === 2 && percent() < 50) {
        tick.state = CATZ_STATE.badDreamMouse;
        return tick;
      }

      tick.passed = 0;
      tick.state = CATZ_STATE.dreamEnd;
      return tick;
    case CATZ_STATE.badDreamMouse:
      if (dream.mouseX > dream.stage.right) {
        tick.passed = 0;
        tick.state = CATZ_STATE.dreamEnd;
        return tick;
      }

      return push(0x2a0);
    default:
      if (world.enter) {
        return push(world.passed ? 0x2a1 : 0x299);
      }

      tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
      tick.global = 8;
      return tick;
  }
}

/**
 * The dog's chase in CatNapz (CATZDLL.DLL seg18; kb/topics/catz-behaviour.md,
 * "CatNapz"), the way it runs (`+0x35a8`) 1 to the left, 2 to the right:
 *
 * - its start (70; `DoCatStartDogChase`, seg18:15fb): entering, the dog (kin
 *   0x1a) is put 200 left of the stage at its middle, facing right, its head
 *   on it (3000), and 0x296. Its script done, it runs to 200 right of the
 *   stage (`+0x35a6` 0, `+0x35ac` 1, `+0x35ee` 10, way 2) and walks (22);
 * - the chase (71; `DoCatDogChase`, seg18:1853): entering where `+0x35ee` is
 *   not 10, the dog put away and 0x2a3. Each tick, chasing (`+0x35ee` 10),
 *   the dog's script done and it not yet 100 past the stage on the side the
 *   cat runs to, within 200 of the middle across three times in ten it
 *   pushes 7, else the cat makes a sound (2), and the dog pushes 1. Its
 *   script done: the dog past the stage, it and the dog are put 200 past
 *   that side of it and it runs back -- way 1, to 200 left of the stage,
 *   `+0x688` 0x40 (its and the dog's); else to 200 right of it, -0x40 --
 *   and walks (22); not chasing, it idles (6).
 */
function catzDogChase(state: number, mind: CatzMind, world: CatzStateWorld): CatzStateTick {
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const dream = world.dream;

  if (!dream || dream.dogX === undefined) {
    tick.unread = true;
    return tick;
  }

  const stage = dream.stage;
  const middle = Math.trunc((stage.bottom - stage.top) / 2) + stage.top;
  const run = () => {
    tick.x35a6 = 0;
    tick.x35ac = 1;
    tick.x35ee = 10;
    tick.state = CATZ_STATE.locomote;
    return tick;
  };

  if (state === CATZ_STATE.startDogChase) {
    if (world.enter) {
      tick.pushes = [0x296];
      tick.pushed = 0x296;
      tick.head = ['track'];
      tick.headTrack = { kind: 0x1a, speed: 3000 };
      return tick;
    }

    tick.goal = { x: stage.right + 200, y: middle };
    tick.explore = 2;
    return run();
  }

  const chasing = world.x35ee === 10;

  if (world.enter && !chasing) {
    tick.pushes = [0x2a3];
    tick.pushed = 0x2a3;
    return tick;
  }

  if (!chasing) {
    tick.global = 6;
    return tick;
  }

  const left = world.x35a8 === 1;
  tick.goal = { x: left ? stage.left - 200 : stage.right + 200, y: middle };
  tick.x688 = left ? 0x40 : -0x40;
  return run();
}

/**
 * Sprayed (CATZDLL.DLL seg31; kb/topics/catz-behaviour.md, "Sprayed"):
 *
 * - with water (63; `DoCatSprayReaction`, seg31:0af1; global 18): entering,
 *   it lets go (its slot `0x9c` 2), its count (`+0x3502`) 0, the spray
 *   (kin 2) what it plays with, its head on it (3000), a sound (8), and,
 *   one time in two or without an age (brain 11), 0x122, else 0x107. Its
 *   first nine ticks it is coloured so, and on its ninth set back (its slot
 *   `0x160`). Its script done: without an age, scared (17); inclined to
 *   behaviour 28, its moment readied (after it idling, 0x93 meanwhile),
 *   0x237 and the moment (8); to 25, 0x2c1 and attacking (1); else 0x2c3
 *   to 26, 0x2c2 to 24, or 0x2c4, and scared (17) -- the cursor (kin 0x17)
 *   what it plays with each way but the moment;
 * - with flea spray or colour (64; `DoCatFleaSprayOrColorReaction`,
 *   seg31:0e51; global 19): entering, sick (brain 8 at 50 or over) and
 *   having fleas (brain 6 so; `+0x34ca`) as it was, its fleas put to 0 and
 *   their centre too (`XBrain`'s slots `0x28`, `0x10`), it lets go (2), a
 *   sound (4) -- of its fleas' centre so put -- 0x97, its head on what it
 *   plays with (3000), and its sickness up 25 (slot `0x14`, to 100). Then:
 *   sick as it was, with an age 0x28e, else 0x103; else without an age 0xdc
 *   and 0x103; sick now, 0x26c; else 0x15d and, one time in two, playing
 *   with the user (kin 1), 0x15c. Its script done: sick, scared (17); one
 *   time in two, playing with the user, grooming (13); not having had fleas
 *   and with an age, inclined to behaviour 25 attacking (1), else snubbing
 *   (11), the cursor what it plays with; else its moment (8).
 */
function catzSprayed(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };
  const behave = (n: number) => catzBehavior(mind, n, random) !== 0;
  const age = mind.brains[CATZ_BRAIN.age];

  if (state === CATZ_STATE.sprayReaction) {
    /* Entering runs on into the tick: its first nine ticks, the count (0
     * entering) tints it and counts on one; at nine, set back. */
    tick.count = Math.min((world.enter ? 0 : world.count) + 1, 9);

    if (world.enter) {
      tick.x35a4 = 2;
      tick.head = ['track'];
      tick.sound = catzSound(mind, 8, random);
      return push(percent() < 50 || age === 0 ? 0x122 : 0x107);
    }

    if (age === 0) {
      return { ...tick, x35a4: 0x17, global: 17 };
    }

    if (behave(28)) {
      tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
      tick.global = 8;
      return push(0x237);
    }

    if (behave(25)) {
      return { ...push(0x2c1), x35a4: 0x17, global: 1 };
    }

    const action = behave(26) ? 0x2c3 : behave(24) ? 0x2c2 : 0x2c4;
    return { ...push(action), x35a4: 0x17, global: 17 };
  }

  const sickness = mind.brains[CATZ_BRAIN.sickness];

  if (world.enter) {
    const fleas = CATZ_BRAIN.fleas;
    const sprayed: CatzMind = {
      ...mind,
      brains: mind.brains.map((v, k) => (k === fleas ? 0 : v)),
      centres: (mind.centres ?? mind.brains).map((v, k) => (k === fleas ? 0 : v)),
    };
    const sick = sickness >= 50;

    tick.passed = mind.brains[fleas] >= 50 ? 1 : 0;
    tick.head = ['track'];
    tick.sound = catzSound(sprayed, 4, random);

    const now = Math.min(sickness + 25, 100);

    if (sick) {
      return push(0x97, age !== 0 ? 0x28e : 0x103);
    }

    if (age === 0) {
      return push(0x97, 0xdc, 0x103);
    }

    if (now >= 50) {
      return push(0x97, 0x26c);
    }

    return push(0x97, 0x15d, ...(percent() < 50 && world.x35a4 === 1 ? [0x15c] : []));
  }

  if (sickness >= 50) {
    tick.global = 17;
    return tick;
  }

  if (percent() < 50 && world.x35a4 === 1) {
    tick.global = 13;
    return tick;
  }

  if (world.passed === 0 && age !== 0) {
    return { ...tick, x35a4: 0x17, global: behave(25) ? 1 : 11 };
  }

  tick.moment = catzPreMoment(mind, world.area3 ?? false, 6, 0x93, false, random);
  tick.global = 8;
  return tick;
}

/**
 * Dangling (33; `DoDangling`, seg23:4129), picked up by the scruff. Entering,
 * it lets go (its slot `0x9c` 2), the cursor jumps to it and turns neutral,
 * a sound (9), 0x2a, its words (0x753d, 0x17, 0x756f), its fudger
 * (`+0x1516`) a speed of 1 or 2 one time in two, else -3 or -2, its head let
 * go, its count (`+0x3502`) 0 and `+0x9e` 5000. Each tick, the button neither
 * pressed nor held (`PetParams` `+0xa`, `+0xc`): no longer held (`+0xfc` 0), it lets go, and
 * -- in the Adoption Kit (`+0xc4`), over its basket (within 20 across, 0 to
 * 150 above, by its slot `0x3cc`) in pose 0x5c, it drops in (global 22,
 * `+0x33be` 4, `+0x35fc` 1) -- falls (34). Else its script done: afraid
 * (behaviour 17) nine times in ten; independent (brain 2, 50 or more) nine
 * times in ten; inclined to behaviour 26 under half what its energy leaves
 * of 100, 0x2a6; then afraid, independent past 10 counted, or the mouse in
 * its state 6, one time in two a sound (11), 0xdc and 0x89; else independent
 * or past 10, three times in ten a sound (11), 0xdf and 0x88; else 0x2b --
 * its count up one each way. And each tick, it is drawn hung from the
 * cursor, ball 0x24 under it.
 */
function catzDangling(
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number
): CatzStateTick {
  const percent = () => random(101);
  const tick: CatzStateTick = { energy: mind.brains[CATZ_BRAIN.energy], count: world.count };
  const push = (...actions: number[]) => {
    tick.pushes = actions;
    tick.pushed = actions[0];
    return tick;
  };

  if (world.enter) {
    tick.sound = catzSound(mind, 9, random);
    percent();
    random(2);
    tick.count = 0;
    return push(0x2a);
  }

  if (!world.buttons) {
    tick.unread = true;
    return tick;
  }

  if (!world.buttons.left && !world.buttons.right) {
    if (world.c4) {
      const basket = CATZ_BASKETS[world.kit?.basket ?? -1];
      const origin = world.kit?.origin;

      if (!basket || !origin || !world.point) {
        tick.unread = true;
        return tick;
      }

      const dx = basket.x + origin.x - world.point.x;
      const dy = basket.y + origin.y - world.point.y;

      if (Math.abs(dx) < 20 && dy > 0 && dy < 150 && world.x1500 === 0x5c) {
        tick.global = 22;
        return tick;
      }
    }

    tick.state = CATZ_STATE.postDangling;
    return tick;
  }

  const afraid = catzBehavior(mind, 17, random) !== 0 && percent() < 90;
  const independent = mind.brains[CATZ_BRAIN.independence] >= 50 && percent() < 90;
  const pushes: number[] = [];

  if (
    catzBehavior(mind, 26, random) !== 0 &&
    percent() < Math.trunc((100 - mind.brains[CATZ_BRAIN.energy]) / 2)
  ) {
    pushes.push(0x2a6);
  }

  const count = world.count ?? 0;
  tick.count = count + 1;

  if (afraid || (independent && count > 10) || world.mouseState === 6) {
    if (percent() < 50) {
      tick.sound = catzSound(mind, 11, random);
    }

    return push(...pushes, 0xdc, 0x89);
  }

  if (independent || count > 10) {
    if (percent() < 30) {
      tick.sound = catzSound(mind, 11, random);
    }

    return push(...pushes, 0xdf, 0x88);
  }

  return push(...pushes, 0x2b);
}

/**
 * What a tick of the cat's own state writes whether or not its script is
 * done, from what the tick before left (its count, `+0x34ca` and the rest
 * as `catzStateTick` has them): carried through the ticks it does not act
 * in.
 *
 * - asleep (28; `DoCatSleep`, seg30:0426): after its script is popped, past
 *   100 its count (`+0x3502`) is 0 again and its energy one more, else
 *   counts on;
 * - sprayed (63): its tint counts on to 9;
 * - dreaming badly (67; seg18:0fd9 on): cued 7, its words loaded and its
 *   count 1; its count over 0 and under 100, it morphs (`MorphCat`: up by
 *   the count over `+0x35d8`, and one, to 100);
 * - suckling the user (44; seg33:0e94): cued 0, it has nursed (`+0x34ca` 1);
 * - looking at things (12; seg24:0465): turning its head to look, its count
 *   on one.
 *
 * - walking on (23; seg25:0a81 on): its script done (as `PopScript` first
 *   answered, which the trace keeps), it has gone a stride (`+0x34ca` 1)
 *   and counts it.
 */
export function catzStateBetween(
  state: number,
  tick: CatzStateTick,
  seen: { cues: number[]; looked: number; x35d8?: number; popped?: number }
): Partial<CatzStateTick> {
  switch (state) {
    case CATZ_STATE.sleep:
      return tick.count > 100
        ? { count: 0, energy: Math.min(100, tick.energy + 1) }
        : { count: tick.count + 1 };
    case CATZ_STATE.sprayReaction:
      return { count: Math.min(tick.count + 1, 9) };
    case CATZ_STATE.badDream: {
      let count = seen.cues.includes(7) ? 1 : tick.count;

      if (count > 0 && count < 100 && seen.x35d8) {
        count = Math.min(100, count + Math.trunc(count / seen.x35d8) + 1);
      }

      return { count };
    }
    case CATZ_STATE.sucklingUser:
      return seen.cues.includes(0) ? { passed: 1 } : {};
    case CATZ_STATE.lookAtObjects:
      return seen.looked > 0 ? { count: tick.count + 1 } : {};
    case CATZ_STATE.performLocomote:
      return seen.popped !== undefined && seen.popped & 1
        ? { passed: 1, count: tick.count + 1 }
        : {};
    default:
      return {};
  }
}

/**
 * What to face to jump, by the cat's way (`+0x35a8`), and the state to
 * jump in (`SetupForJump`, seg24:2197): from and to, the way to face
 * (`+0x34d0`), and the jump -- to the edge (15) or the shelf (18).
 */
const CATZ_JUMPS: Record<number, [number, number, number, number]> = {
  1: [0xe, 0x72, 0x40, 15],
  2: [-0x72, -0xe, -0x40, 15],
  3: [-25, 25, 0, 15],
  4: [-0x72, -0xe, -0x40, 18],
  5: [0xe, 0x72, 0x40, 18],
  8: [-0x72, -0xe, -0x40, 18],
  9: [0xe, 0x72, 0x40, 18],
};

/**
 * Exploring up the stage's edges and onto the shelf (seg24:0a18 to 1896):
 *
 * - might it jump (14; `DoCatMightJump`): entering, its head on its marker
 *   (0x16, 2500); facing (`+0x688`) outside what its way jumps within, it
 *   turns -- 0x148 for ways 1, 5 and 9, 0x149 for 2, 4 and 8 -- else 0x93;
 *   then 0x93, and a transition to its neutral position (0x6b, not
 *   reimplemented). Its script done, facing within, what it walks to is put
 *   at its goal, its head let go, and it jumps; else it readies its moment,
 *   not watching, and has it (8).
 * - jumping to the edge (15; `DoCatJumpToEdge`): entering, its leap to its
 *   marker at its goal (but way 3) and its rotation aligned (words, not
 *   kept), 0x22f under what its energy leaves of 100, else 0x132. Its
 *   script done, it crawls up the edge (16).
 * - crawling up the edge (16; `DoCatCrawlUpEdge`): entering, not yet
 *   climbed (`+0x34ca` 0), its climb (`+0x35ba`) 0x215 under its energy,
 *   else 0x132. Its script done, having climbed, its moment, watching;
 *   else, its point more than its height but less than three times it
 *   below the stage's top, not way 3, it makes for the ceiling: its goal
 *   the stage's top, 1.5 of its widths (`ds:0x36e`) in from the side away
 *   from it (the right where it is past the middle), and crawls along it
 *   (17); else one time in five 0x1c7, else its head let go; and, four
 *   times in five, still below the stage's top, 0x22f under half of what
 *   its energy leaves of 100, else, one time in four inclined to behaviour
 *   9, 0x230, else its climb; otherwise it has climbed and pushes 0xd7.
 * - crawling along the ceiling (17; `DoCatCrawlAlongCeiling`): entering,
 *   not yet crossed, its leap to its goal (words). Its script done, having
 *   crossed, its moment, watching; else one time in five 0x1c7, else its
 *   head let go; four times in five, between the stage's sides, 0x1fe
 *   under its energy, else, one time in ten on way 1, 0x2fb, else 0x218;
 *   otherwise it has crossed and pushes 0xd7.
 * - jumping to the shelf (18; `DoCatJumpToShelf`): entering, its leap and
 *   rotation (words), 0x120, then 0x273 for as long as `rand() % 10 + 3`
 *   is over how many it pushed, then 0x14f; what it is on kept (`+0x35c6`,
 *   its slot `0x244`), not yet on it. Each tick, cued 4 it is on it, and
 *   cued 4 or 1, what it is on moved, it has its moment; on it, that moved,
 *   on the cursor (ways 8 and 9) its moment, else it goes with it -- not
 *   reimplemented; its script done or cued 0, its moment, not watching.
 */
function catzJumping(
  state: number,
  mind: CatzMind,
  world: CatzStateWorld,
  random: (n: number) => number,
  done: (rest: Partial<CatzStateTick>) => CatzStateTick
): CatzStateTick {
  const percent = () => random(101);
  const brain = (n: number) => mind.brains[n];
  const energy = brain(CATZ_BRAIN.energy);
  const way = world.x35a8 ?? 0;
  const x688 = world.x688 ?? 0;
  const moment = (watching: boolean) =>
    done({
      moment: catzPreMoment(mind, world.area3 ?? false, 6, 0x93, watching, random),
      global: 8,
    });
  const jump = CATZ_JUMPS[way];
  /* Tired and hungry by the jump (`CatGetsTiredAndHungry` 2, 1, its slot `0x170`): under what its liveliness leaves of 100, energy down 2; one time in ten, fullness down 1. */
  const tires: Partial<CatzStateTick> = {};
  const tire = () => {
    if (percent() < 100 - brain(CATZ_BRAIN.liveliness)) {
      tires.energy = Math.max(0, energy - 2);
    }

    if (percent() < 10) {
      tires.fullness = Math.max(0, brain(CATZ_BRAIN.fullness) - 1);
    }
  };
  const tired = (rest: Partial<CatzStateTick>) => done({ ...rest, ...tires });
  /* Its energy as it now is, tired or not. */
  const now = () => tires.energy ?? energy;

  switch (state) {
    case CATZ_STATE.mightJump: {
      const within = !!jump && x688 >= jump[0] && x688 <= jump[1];

      if (world.enter) {
        const pushes: number[] = [];

        if (!within) {
          if (way === 1 || way === 5 || way === 9) {
            pushes.push(0x148);
          } else if (way === 2 || way === 4 || way === 8) {
            pushes.push(0x149);
          }
        } else {
          pushes.push(0x93);
        }

        pushes.push(0x93);
        return done({
          pushed: pushes[0],
          pushes,
          head: ['track'],
          headTrack: { kind: 0x16, speed: 2500 },
        });
      }

      if (within) {
        return done({ state: jump[3], head: ['off'], x35a6: world.x35a6 });
      }

      return moment(false);
    }
    case CATZ_STATE.jumpToEdge: {
      if (!world.enter) {
        return done({ state: CATZ_STATE.crawlUpEdge });
      }

      const action = percent() < 100 - energy ? 0x22f : 0x132;
      tire();
      return tired({
        pushed: action,
        pushes: [action],
        ...(way !== 3 ? { leap: { ball: 0x16, to: 'walked' as const } } : {}),
      });
    }
    case CATZ_STATE.crawlUpEdge: {
      /* Entering, pushing nothing, its tick goes on at once. */
      let passed = world.passed;
      let x35ba = world.x35ba;

      if (world.enter) {
        tire();
        x35ba = percent() < now() ? 0x215 : 0x132;
        passed = 0;
      }

      if (passed) {
        return moment(true);
      }

      const { stage, size, point } = world;
      const below = point!.y - stage!.top;

      if (size!.height < below && size!.height * 3 > below && way !== 3) {
        const middle = Math.trunc((stage!.right - stage!.left) / 2) + stage!.left;
        const inset = size!.width * 1.5;
        return tired({
          passed,
          x35ba,
          state: CATZ_STATE.crawlAlongCeiling,
          explore: way,
          goal: {
            x: Math.trunc(point!.x > middle ? stage!.right - inset : stage!.left + inset),
            y: stage!.top,
          },
        });
      }

      return crawl(
        () => {
          if (percent() < Math.trunc((100 - now()) / 2)) {
            return 0x22f;
          }

          return percent() < 25 && catzBehavior(mind, 9, random) !== 0 ? 0x230 : (x35ba ?? 0x132);
        },
        point!.y > stage!.top,
        { x35ba }
      );
    }
    case CATZ_STATE.crawlAlongCeiling: {
      /* Entering, pushing nothing (but its leap's words), its tick goes on at once. */
      let passed = world.passed;

      if (world.enter) {
        passed = 0;
        tire();
      }

      if (passed) {
        return moment(true);
      }

      const { stage, point } = world;
      return crawl(
        () => (percent() < now() ? 0x1fe : percent() < 10 && way === 1 ? 0x2fb : 0x218),
        point!.x > stage!.left && point!.x < stage!.right,
        { passed, ...(world.enter ? { leap: { ball: 0x16, to: 'goal' as const } } : {}) }
      );
    }
    default: {
      if (!world.enter) {
        return moment(false);
      }

      const pushes = [0x120];
      tire();

      while (random(10) + 3 > pushes.length - 1) {
        pushes.push(0x273);
      }

      pushes.push(0x14f);
      return tired({ pushed: 0x120, pushes, passed: 0, leap: { ball: 0x31, to: 'walked' } });
    }
  }

  /** A stride along an edge: one time in five 0x1c7, else its head let go; four times in five, still on its way, the stride; else there, 0xd7. */
  function crawl(
    stride: () => number,
    going: boolean,
    rest: Partial<CatzStateTick> = {}
  ): CatzStateTick {
    const pushes: number[] = [];
    const head: CatzStateTick['head'] = [];

    if (percent() < 20) {
      pushes.push(0x1c7);
    } else {
      head.push('off');
    }

    if (percent() < 80 && going) {
      pushes.push(stride());
      return tired({ passed: 0, ...rest, pushed: pushes[0], pushes, head });
    }

    pushes.push(0xd7);
    return tired({ ...rest, pushed: pushes[0], pushes, head, passed: 1 });
  }
}
