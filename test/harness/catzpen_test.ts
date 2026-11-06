/**
 * Catz's playpen in the harness (harness/catzpen.c): CATZDLL.DLL's own pet
 * module set up as CATZ.EXE sets it up, around a cat adopted on the oracle,
 * and run a frame at a time on winbox.js's virtual clock, so a run is the
 * same every time. See kb/topics/catz-behaviour.md, "The playpen harness".
 *
 * The game's parameters (`PetParams`) are what CATZ.EXE itself filled in:
 * the first test runs the game on winbox.js to its playpen, and keeps them
 * as it begins its playpen (`oracle/build/harness/catz-params.bin`), where
 * they are not kept already.
 *
 * Needs winbox.js beside this repository, the drivers built, and the
 * oracle's registered CD-ROM install with a cat adopted
 * (`oracle/build/variants/catz-cd-registered`); skipped otherwise.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type CatzMind, catzBehavior, catzSound } from '../../src/behaviour/catz-behavior.ts';
import { catzGlobalBegin } from '../../src/behaviour/catz-global.ts';
import {
  catzCuriosities,
  catzStateTick,
  type CatzStateTick,
} from '../../src/behaviour/catz-states.ts';
import {
  catzMomentBegin,
  catzMomentChoice,
  catzMomentCursor,
  catzMomentLinger,
  type CatzMomentState,
  catzMomentTick,
} from '../../src/behaviour/catz-moment.ts';
import {
  catzBehaviorChange,
  catzBlinking,
  catzCursorWiggling,
  catzExtremeSituations,
  catzKitMessage,
  catzLayering,
  catzMessage,
  catzPurring,
  catzScruff,
  catzSeesMouse,
} from '../../src/behaviour/catz-reflexes.ts';

const ROOT = process.cwd();
const WINBOX = join(ROOT, '..', 'winbox.js', 'test', 'win16', 'run-probe.ts');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const DRIVE = join(ROOT, 'oracle', 'build', 'variants', 'catz-cd-registered');
const PARAMS = join(HARNESS, 'catz-params.bin');

/** The libraries Catz loads from Windows' own directory, put beside the program. */
const LIBRARIES = [
  'CATZDLL.DLL',
  'CATZREZX.DLL',
  'CATNAPZ.DLL',
  'CATNEURN.DLL',
  'SOSLIB03.DLL',
  'WING.DLL',
  'WINGDE.DLL',
  'WINGDIB.DRV',
  'WINGPAL.WND',
];

/** What Catz wants in Windows' own directories: CTL3DV2.DLL, and what registering it left. */
const EXTRAS = [
  ['WINDOWS', 'SYSTEM', 'CTL3DV2.DLL'],
  ['WINDOWS', 'CATZ.INI'],
  ['WINDOWS', 'PFFOO.VAL'],
].map((parts) => ({ parts, file: join(DRIVE, ...parts) }));

/** How many frames of a cat's day are followed: 2,000, or as `TRACE_FRAMES` says. */
const TRACE_FRAMES = Number(process.env.TRACE_FRAMES ?? 2000);

/** `TRACE_CUES=1`: on every other tick of swatting and begging, the cat cued as though by its script (to strike, to look), a day of its own. */
const TRACE_CUES = process.env.TRACE_CUES === '1';

/** `TRACE_POUNCE=1`: on every fourth tick of stalking or swatting at a toy, the cat put to pounce, a day of its own. */
const TRACE_POUNCE = process.env.TRACE_POUNCE === '1';

/** `TRACE_EAT=1`: on every tenth tick of prestalking, looking at things, its moment, walking or grooming, the cat put in turn to sniff a mouse hole, to align to eat the fish, from the water bowl, from the food bowl or the catnip, or to sniff the catnip, a day of its own. */
const TRACE_EAT = process.env.TRACE_EAT === '1';

/** `TRACE_FEAR=1`: on every tenth tick of looking at things, passing the time, its moment, walking or grooming, the cat put in global state 17, scared, a day of its own. */
const TRACE_FEAR = process.env.TRACE_FEAR === '1';

/** `TRACE_PET=1`: the user petting the cat all day, 300 frames of each 360 the cursor wiggled on it with the hand down, the rest still with it up, a day of its own. */
const TRACE_PET = process.env.TRACE_PET === '1';

/** `TRACE_FOND=1`: on every tenth tick of looking at things, passing the time, its moment, walking or grooming, the cat put in global state 14, affectionate, the cursor still at the stage's lower middle, a day of its own. */
const TRACE_FOND = process.env.TRACE_FOND === '1';

/** `TRACE_BOTTLE=1`: the user offering the cat its bottle, taken off the shelf, held beside it and let go there, each 600 frames, and the cat put to suckle (global 5) on every tenth tick of looking at things, passing the time, its moment, walking or grooming, a day of its own. */
const TRACE_BOTTLE = process.env.TRACE_BOTTLE === '1';

/** `TRACE_TREAT=1`: the user holding out a treat at the cat's mouth, each 600 frames 400 of them, and the cat put to wait for it on every tenth tick of looking at things, passing the time, its moment, walking or grooming, a day of its own. */
const TRACE_TREAT = process.env.TRACE_TREAT === '1';

/** `TRACE_KIT=1`: the Adoption Kit, set up at frame 10 as the module's command 5 asks, the cursor about 20 frames of each 400, and at the 350th, in turn, the cat sent back to its basket, dropped into it and put in its fail-safe, a day of its own. */
const TRACE_KIT = process.env.TRACE_KIT === '1';

/** `TRACE_NAP=1`: on every tenth tick of looking at things, passing the time, its moment, walking or grooming, the cat put in global state 21, CatNapz, a day of its own; starting a dream, cued to dream (6) once, and its cloud, which runs no script in the pen, cued that it has come (4) after 20 ticks; the second time, the dog's chase; 20 ticks into each dream's float, a bad dream, its breed kept at 2, and every other one the dream's mouse 300 ticks in. */
const TRACE_NAP = process.env.TRACE_NAP === '1';

/** `TRACE_GROOM=1`: on every tenth tick of looking at things, passing the time, its moment or walking on, the cat put to grooming (13), a day of its own. */
const TRACE_GROOM = process.env.TRACE_GROOM === '1';
/** `TRACE_IGNORE=1`: on every tenth tick of looking at things, passing the time, its moment or walking on, the cat shown the bottle or the cursor, in turn, to ignore it (12) where it may (`ShouldNoticeAndIgnore`). */
const TRACE_IGNORE = process.env.TRACE_IGNORE === '1';
/** `TRACE_SPRAY=1`: on every tenth tick of looking at things, passing the time, its moment, walking on or grooming, the cat sprayed (18) or, in turn, flea-sprayed (19), every other time so the user what it plays with. */
const TRACE_SPRAY = process.env.TRACE_SPRAY === '1';
/** `TRACE_PET_DEEP=1`, with `TRACE_PET`: on every 40th tick of being petted, its petting modes all made 5 or, in turn, 6. */
const TRACE_PET_DEEP = process.env.TRACE_PET_DEEP === '1';
/** `TRACE_FOND_LACKING=1`, with `TRACE_FOND`: on the 5th tick of every other walk on to the cursor, affectionate, the cat put to lack affection (55), as walking on's arrival puts it. */
const TRACE_FOND_LACKING = process.env.TRACE_FOND_LACKING === '1';
/** `TRACE_DIET=1`: the cat's proper diet held at 5 its first 1,000 frames, then at 90 and its fullness at 80, its reflexes' extreme situations met. */
const TRACE_DIET = process.env.TRACE_DIET === '1';
/** `TRACE_WIGGLE=1`: the cursor wiggled beside the cat, the hand up, 300 frames of each 600, for its reflex. */
const TRACE_WIGGLE = process.env.TRACE_WIGGLE === '1';
/** `TRACE_MOUSE=1`: every 30 frames `+0x33bc` cleared, that the cat may see the mouse again. */
const TRACE_MOUSE = process.env.TRACE_MOUSE === '1';
/** `TRACE_SCRUFF=1`: each 400 frames the cat picked up by the scruff -- the button down on its target point, the cursor lifted 80 frames, and let go. */
const TRACE_SCRUFF = process.env.TRACE_SCRUFF === '1';
/** `TRACE_MESSAGES=1`: every 50 frames a message left for the cat (`+0x33c0`), as the playpen leaves one: food, water, a treat, catnip, a toy, the milk bottle, the spray bottle, the spray and flea spray on it, 18, the window resized and the camera, in turn. */
const TRACE_MESSAGES = process.env.TRACE_MESSAGES === '1';
/** `TRACE_FEARFUL=1`: the cat's fear held at 70. */
const TRACE_FEARFUL = process.env.TRACE_FEARFUL === '1';
/** `TRACE_AGELESS=1`: the cat's age held at 0, as an Adoption Kit cat's. */
const TRACE_AGELESS = process.env.TRACE_AGELESS === '1';
/** `TRACE_KIT_PARAMS=1`: `PetParams` `+0xc4` set, as the Adoption Kit's program has it. */
const TRACE_KIT_PARAMS = process.env.TRACE_KIT_PARAMS === '1';

/** `TRACE_FOND_MOVING=1`, with `TRACE_FOND=1`: every other 200 frames the cursor just left of the stage, off it, where the cat lacks affection. */
const TRACE_FOND_MOVING = process.env.TRACE_FOND_MOVING === '1';

const ready = [WINBOX, join(HARNESS, 'CATZPEN.EXE'), join(DRIVE, 'CATZ.DOG')].every(existsSync);
const describeHarness = ready ? describe : describe.skip;

/** A stage: the game's directory, and its libraries beside it. */
function stage(name: string) {
  const at = join(HARNESS, `stage-${name}`);
  rmSync(at, { recursive: true, force: true });
  mkdirSync(at, { recursive: true });
  cpSync(join(DRIVE, 'CATZ.DOG'), at, { recursive: true });

  for (const library of LIBRARIES) {
    cpSync(join(DRIVE, 'WINDOWS', 'SYSTEM', library), join(at, library));
  }

  return at;
}

/** What of winbox.js's run the parameters are read through. */
interface WatchedCall {
  name: string;
  args?: unknown[];
}

interface Win16 {
  _modules: {
    _modules: Record<
      string,
      {
        name: string;
        _segmentMap?: Record<number, number>;
        loader?: { _segmentMap?: Record<number, number> };
        _loader?: { _segmentMap?: Record<number, number> };
      }
    >;
  };
  machine: { cpu: { core: { read8(selector: number, offset: number): number } } };
}

/** Brain values about the thresholds the engine draws its lines at. */
const LEVELS = [0, 9, 10, 25, 31, 32, 49, 50, 51, 74, 75, 76, 90, 100];

/** Cases of the cat's brains, each a seed for C's `rand`, the 12 brains' values and their 12 centres. */
const BEHAVIOUR_CASES = [
  ...Array.from({ length: 60 }, (_, n) => [
    (n * 2654435761) % 2147483648,
    ...Array.from(
      { length: 12 },
      (_, b) => LEVELS[(n * 7 + b * 5 + ((n * b) % 3)) % LEVELS.length]
    ),
    ...Array.from(
      { length: 12 },
      (_, b) => LEVELS[(n * 11 + b * 3 + ((n + b) % 5)) % LEVELS.length]
    ),
  ]),
  /* And each temperament -- liveliness, independence, seriousness and fear
   * above or below 50 -- with its brains placid now and not, young and old. */
  ...[
    [20, 20, 20, 20],
    [80, 20, 20, 20],
    [20, 80, 80, 20],
    [80, 80, 80, 20],
    [50, 50, 50, 80],
  ].flatMap(([l, i, s, f], t) =>
    [0, 1, 2, 3].map((v) => {
      const now = v % 2 ? [l, i, s, f] : [10, 10, 10, 10];
      const [age, full] = v < 2 ? [20, 90] : [90, 40];
      return [
        1000003 * (t * 4 + v + 1),
        now[0],
        50,
        now[1],
        now[2],
        full,
        50,
        30,
        now[3],
        0,
        50,
        0,
        age,
        l,
        50,
        i,
        s,
        50,
        50,
        30,
        f,
        0,
        50,
        0,
        age,
      ];
    })
  ),
];

/** Cases of the moment: a seed, the 12 brains' values, and `+0x35d2`. */
const MOMENT_CASES = Array.from({ length: 120 }, (_, n) => [
  (n * 40503 * 65537 + 12345) % 2147483648,
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 5 + b * 3 + ((n * b) % 4)) % LEVELS.length]),
  n % 3 === 0 ? 1 : 0,
]);

/**
 * Cases of the moment's lingering: a seed, the 12 brains' values and
 * centres, and its looks, ticks to the next look, looks before it may go,
 * mode, idle action, sound owed and box.
 */
const LINGER_CASES = Array.from({ length: 80 }, (_, n) => [
  (n * 69069 * 1013 + 7) % 2147483648,
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 3 + b * 7 + ((n * b) % 5)) % LEVELS.length]),
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 13 + b * 5 + ((n + b) % 3)) % LEVELS.length]),
  n % 9,
  n % 4 === 3 ? (n % 7) + 1 : 0,
  n % 7,
  [0, 0, 2, 3][n % 4],
  n % 2 ? 0x93 : 0xc,
  n % 5 === 0 ? 1 : 0,
  100 + (n % 3) * 20,
  80,
  500 - (n % 4) * 50,
  400,
]);

/** Cases of the moment begun: a seed, the brains' values and centres, its mode, looks before it may go, idle action and sound owed. */
const ENTER_CASES = Array.from({ length: 60 }, (_, n) => [
  (n * 1664525 + 1013904223) % 2147483648,
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 5 + b * 11 + ((n * b) % 7)) % LEVELS.length]),
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 3 + b * 13 + ((n + b) % 4)) % LEVELS.length]),
  [0, 1, 1, 2, 3][n % 5],
  n % 3 === 0 ? -1 : 3,
  n % 2 ? 0x93 : 0xc,
  n % 4 === 0 ? 1 : 0,
]);

/** Cases of the cursor about the cat in its moment: a seed, the brains' values and centres, its looks before it may go, idle action and sound owed. */
const CURSOR_CASES = Array.from({ length: 80 }, (_, n) => [
  (n * 22695477 + 99991) % 2147483648,
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 9 + b * 5 + ((n * b) % 5)) % LEVELS.length]),
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 7 + b * 3 + ((n + b) % 6)) % LEVELS.length]),
  n % 4,
  n % 2 ? 0x93 : 0xc,
  n % 3 === 0 ? 1 : 0,
]);

/** Cases of a global state begun: a seed, the brains' values and centres, the state, whether the cursor moved, and `+0x3574`. */
const GLOBAL_CASES = Array.from({ length: 90 }, (_, n) => [
  (n * 134775813 + 1) % 2147483648,
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 7 + b * 9 + ((n * b) % 4)) % LEVELS.length]),
  ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 5 + b * 3) % LEVELS.length]),
  [6, 8, 9][n % 3],
  Math.floor(n / 3) % 2,
  Math.floor(n / 6) % 2,
]);

/** The global states a walk's end is reimplemented for: all but 1, 4, 13, 17 and 14 with an age, and 3 only at the marker, the playpen's food being on its shelf. */
const ARRIVALS = [2, 5, 6, 8, 9, 7, 10, 11, 16, 20, 21, 22, 14, 12, 18, 19, 3];

/**
 * Cases of a tick of the cat's own state: a seed, the brains' values and
 * centres, the state, the global state, `+0x3502`, `+0x34ca`, `+0x3504`,
 * `+0x1500`, 8 curiosities, the cursor's rectangle (`PetParams` `+0x104`
 * on), and whether it is entering, `+0x3508`, `+0x35fc`, `+0x35a6`,
 * `+0x35a2`, `+0x35ac` and where it walks to. Of the first 342, the last 192 pass the time,
 * doze and sleep (with little energy, to stay so) and lie tired with each
 * temperament: liveliness, independence, seriousness and fear each low or
 * high. The 160 after look at things, with lists of curiosities of each
 * kind and none; 120 explore, the cursor still or about; 120 ready a walk,
 * entering or not, to points on and off the stage; and the last 120 walk on
 * to their marker, by each global state but 1 and 17; and the last 153 are
 * there, `PopScript` finding the marker, by each global state `ARRIVALS`
 * names; 64 beg, for 4, 0xb, 0xc, the cursor's and nothing,
 * having begged or not, about to eat or idle; and the last 16 are about to
 * stalk, entering or not.
 */
const LOCAL_CASES = Array.from({ length: 1095 }, (_, n) => {
  const preStalking = n >= 1079;
  const begging = n >= 1015 && !preStalking;
  const arriving = n >= 862 && n < 1015;
  const walkingOn = n >= 742 && n < 1015;
  const walking = n >= 622 && n < 742;
  const exploring = n >= 502 && n < 622;
  const looking = n >= 342 && n < 502;
  const tempered = n >= 150 && n < 342;
  const state = preStalking
    ? 1
    : begging
      ? 35
      : walkingOn
        ? 23
        : walking
          ? 22
          : exploring
            ? 13
            : looking
              ? 12
              : tempered
                ? [19, 19, 19, 19, 27, 27, 26, 28, 28, 28, 28, 28][Math.floor((n - 150) / 16)]
                : [26, 28, 28, 28, 29, 27, 27, 19, 19, 19][n % 10];
  const brains = Array.from(
    { length: 12 },
    (_, b) => LEVELS[(n * 3 + b * 11 + ((n * b) % 6)) % LEVELS.length]
  );

  if (tempered || looking) {
    [0, 2, 3, 7].forEach((b, bit) => (brains[b] = (n >> bit) & 1 ? 75 : 25));
    brains[11] ||= looking && n % 9 === 0 ? 0 : 50;
    brains[1] = state === 27 || state === 28 ? 10 : brains[1];
  }

  /* Begging, some without an age and some with little energy. */
  if (begging) {
    brains[11] = n % 5 === 0 ? 0 : brains[11];
    brains[1] = n % 7 === 0 ? 10 : brains[1];
  }

  /* There, in global state 14, without an age. */
  if (arriving && ARRIVALS[n % ARRIVALS.length] === 14) {
    brains[11] = 0;
  }

  /* Walking on, half without catnip, which would take a stride of its own one time in two, and with few fleas or many. */
  if (walkingOn && !arriving) {
    brains[10] = n % 2 ? 0 : brains[10];
    brains[6] = [0, 60, 90][n % 3];
  }

  const kinds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 0x17, 0x1b, 14, 20];
  const left = [0, 50, 230, 400, 560][n % 5];
  const top = [0, 10, 30, 100, 300][(n >> 1) % 5];
  const cursor =
    exploring && n % 3 !== 0
      ? [left, top, left + 10, top + 10]
      : arriving
        ? [230, 100, 240, 110]
        : [0, 0, 0, 0];
  /* Walking: whether entering, the mode, `+0x35fc`, what it walks to, `+0x35a2`, `+0x35ac`, the point, `+0x688`, `+0x35aa`, `+0x35a8`, `+0x35f4`, `+0x35ee`, `+0x35a4`, and whether `PopScript` finds its target. */
  const walk = walking
    ? [
        n % 6 !== 5 ? 1 : 0,
        n % 4 === 0 ? 3 : 1,
        n % 7 === 0 ? 1 : 0,
        [0, 0, 0x22, 0x17, 0xc][n % 5],
        (n >> 2) % 3 === 0 ? 1 : 0,
        n % 8 === 0 ? 1 : 0,
        [-50, 100, 300, 500, 700][(n >> 1) % 5],
        [-20, 50, 200, 360, 500][(n >> 2) % 5],
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]
    : walkingOn
      ? [
          0,
          1,
          0,
          0x16,
          arriving ? (n >> 2) % 2 : 0,
          0,
          arriving ? [60, 235, 400, 520][n % 4] : [-30, 60, 235, 400, 520][n % 5],
          arriving ? [40, 185, 300][n % 3] : [-30, 40, 185, 300, 420][(n >> 1) % 5],
          arriving ? 0 : [-100, -64, -20, 0, 30, 64, 96, 127][n % 8],
          arriving ? 1 : 0,
          arriving ? (n % 9) + 1 : n % 3 === 0 ? 3 : 1,
          0,
          arriving ? [0, 10, 11][n % 3] : 0,
          arriving ? [0, 14][(n >> 1) % 2] : n % 2 ? 12 : 0,
          arriving ? 1 : 0,
        ]
      : begging || preStalking
        ? [
            preStalking ? n % 2 : 0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            [4, 0xb, 0xc, 4, 0x17, 0][n % 6],
            0,
          ]
        : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const curiosities = Array.from({ length: 8 }, (_, k) =>
    looking && k < (n % 7) + 1 ? kinds[(n * 5 + k * 7) % kinds.length] : 0
  );

  return [
    (n * 1103515245 + 12345) % 2147483648,
    ...brains,
    ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 9 + b * 7) % LEVELS.length]),
    state,
    preStalking
      ? 15
      : begging
        ? [3, 6][n % 2]
        : arriving
          ? ARRIVALS[n % ARRIVALS.length]
          : walkingOn
            ? [6, 3, 8, 13, 14, 15, 16, 20, 21, 22, 9, 4][n % 12]
            : walking
              ? [6, 14, 21, 1, 9, 16][n % 6]
              : looking || exploring
                ? 6
                : state === 26 && Math.floor(n / 20) % 2
                  ? 21
                  : 9,
    arriving
      ? 3
      : walkingOn
        ? [0, 5, 20, 21, 30][Math.floor(n / 12) % 5]
        : looking
          ? Math.floor(n / 7) % 4
          : tempered && state === 28
            ? 0
            : [0, 10, 25, 26, 40, 100, 101][n % 7],
    Math.floor(n / 10) % 2 && !tempered && !looking ? 1 : 0,
    looking && n % 5 === 0 ? 3 : 0,
    looking && n % 3 === 0 ? 0x5f : walkingOn ? [0, 0x74, 0x76, 5][n % 4] : 0,
    ...curiosities,
    ...cursor,
    ...walk,
  ];
});

/** Cases of what the cat is curious about: a seed, and the brains' values and centres, the last 64 of each temperament. */
const CURIOUS_CASES = Array.from({ length: 128 }, (_, n) => {
  const brains = Array.from(
    { length: 12 },
    (_, b) => LEVELS[(n * 5 + b * 13 + ((n * b) % 7)) % LEVELS.length]
  );

  if (n >= 64) {
    [0, 2, 3, 7].forEach((b, bit) => (brains[b] = (n >> bit) & 1 ? 75 : 25));
  }

  return [
    (n * 69069 + 1013904223) % 2147483648,
    ...brains,
    ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 11 + b * 5) % LEVELS.length]),
  ];
});

describeHarness('Catz’s playpen, held to CATZDLL.DLL', () => {
  it('keeps the parameters CATZ.EXE gives its playpen', async () => {
    if (existsSync(PARAMS)) {
      return;
    }

    const directory = stage('CATZ');
    const { runProbe } = await import(WINBOX);
    let kept: Uint8Array | null = null;

    /* CATZ.WAD's PetParams (its ds:13f0, segment 7) as InitPetModule looks
     * for its first apts. Its Welcome box answered with Return. */
    const watch = (call: WatchedCall, _count: number, win16: Win16) => {
      if (kept || call.name !== 'FindResource' || String(call.args?.[2]) !== 'APTF') {
        return;
      }

      const catz = Object.values(win16._modules._modules).find((module) => module.name === 'CATZ')!;
      const map = catz._segmentMap ?? catz.loader?._segmentMap ?? catz._loader?._segmentMap ?? {};
      const ds = (map[7] << 3) | 7;
      const core = win16.machine.cpu.core;
      kept = Uint8Array.from({ length: 0x722 }, (_, n) => core.read8(ds, 0x13f0 + n));
    };

    await runProbe('catz', 1, false, true, 120, {
      display: 'vga256',
      virtual: true,
      program: { directory, file: 'CATZ.EXE', folder: 'CATZ.DOG' },
      extras: EXTRAS,
      watch,
    });

    expect(kept).not.toBeNull();
    writeFileSync(PARAMS, kept!);
  }, 1800000);

  it('runs a cat in its playpen, the same every time', async () => {
    let text: string;

    /* `HARNESS_REUSE=1`: the driver's last output read again, to work on the
     * reimplementation without running the engine. */
    if (process.env.HARNESS_REUSE && existsSync(join(HARNESS, 'CATZPEN.OUT'))) {
      text = readFileSync(join(HARNESS, 'CATZPEN.OUT'), 'latin1');
    } else {
      const directory = stage('CATZPEN');
      cpSync(join(HARNESS, 'CATZPEN.EXE'), join(directory, 'CATZPEN.EXE'));
      cpSync(PARAMS, join(directory, 'PARAMS.BIN'));
      writeFileSync(
        join(directory, 'CURIOUS.TXT'),
        CURIOUS_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'LOCAL.TXT'),
        LOCAL_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'GLOBAL.TXT'),
        GLOBAL_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'CURSOR.TXT'),
        CURSOR_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'ENTER.TXT'),
        ENTER_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'LINGER.TXT'),
        LINGER_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'MOMENT.TXT'),
        MOMENT_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );
      writeFileSync(
        join(directory, 'CASES.TXT'),
        BEHAVIOUR_CASES.map((line) => line.join(' ')).join('\r\n') + '\r\n'
      );

      const { runProbe } = await import(WINBOX);
      const result = await runProbe('catzpen', 1, false, true, 240, {
        display: 'vga256',
        virtual: true,
        program: { directory, file: 'CATZPEN.EXE', folder: 'CATZPEN' },
        extras: EXTRAS,
      });

      expect(result.failure ?? null).toBeNull();
      const file = await result.fileSystem.open(['CATZPEN.OUT']);
      text = new TextDecoder().decode(new Uint8Array(await file.read(0, file.info.size)));
      writeFileSync(join(HARNESS, 'CATZPEN.OUT'), text);
    }

    const lines = text.trim().split(/\r?\n/);

    expect(lines.slice(0, 3)).toEqual(['made global 0', 'made module 0', 'made tree']);
    expect(lines[3]).not.toBe('cat 0 0');
    expect(lines.filter((line) => line.startsWith('frame '))).toHaveLength(400);
    expect(readFileSync(PARAMS)).toHaveLength(0x722);

    /* Each behaviour as MapCatBehavior answers it, and C's `rand` where it
     * left it: drawn from each case's seed as Borland's runtime draws it. */
    const wrong: string[] = [];
    let mind: CatzMind | null = null;
    let seed = 0n;
    let answered = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'case') {
        const [caseSeed, state, global, target, count] = values;
        const line = BEHAVIOUR_CASES.find(([s]) => s === caseSeed)!;
        mind = {
          brains: line.slice(1, 13),
          centres: line.slice(13, 25),
          state,
          global,
          target,
          count,
        };
        seed = BigInt(caseSeed);
      } else if ((kind === 'behave' || kind === 'sound') && mind) {
        const [behaviour, theirs, after] = values;
        let state = seed;
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };
        const ours =
          kind === 'sound'
            ? catzSound(mind, behaviour, random)
            : catzBehavior(mind, behaviour, random);

        if (ours !== theirs || state !== BigInt(after)) {
          wrong.push(
            `seed ${seed} brains ${mind.brains} centres ${mind.centres} ${kind} ${behaviour}: ${ours} not ${theirs}${state !== BigInt(after) ? ', drew otherwise' : ''}`
          );
        }

        answered++;
      }
    }

    expect(answered).toBe(BEHAVIOUR_CASES.length * (29 + 13));

    /* And what each moment chose: no new global state, walking off; else
     * the first it was put in (the history's last before the marks). */
    let moment: number[] = [];
    let chosen = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'moment') {
        moment = values;
      } else if (kind === 'chose') {
        const [caseSeed, global, target, count, x35d2, shelf, saver, c4] = moment;
        const brains = MOMENT_CASES.find(([s]) => s === caseSeed)!.slice(1, 13);
        let state = BigInt(caseSeed);
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };
        const ours = catzMomentChoice(
          { brains, state: 21, global, target, count },
          { shelf: shelf !== 0, screenSaver: saver !== 0, c4, x35d2, x3516: 0 },
          random
        );
        const history = values.slice(2, 12);
        const added = history.indexOf(-2) < 0 ? 10 : history.indexOf(-2);
        const theirs = added === 0 ? 'locomote' : `global ${history[added - 1]}`;
        const said = ours.locomote ? 'locomote' : `global ${ours.global}`;

        if (said !== theirs) {
          wrong.push(`moment seed ${caseSeed} brains ${brains}: ${said} not ${theirs}`);
        }

        chosen++;
      }
    }

    expect(chosen).toBe(MOMENT_CASES.length);

    /* And each tick of lingering: the moment's fields after, where it
     * looked, and whether a sound began (a layered action's frames). */
    let lingerSeed = 0;
    let lingered = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'linger') {
        lingerSeed = values[0];
      } else if (kind === 'lingered') {
        const c = LINGER_CASES.find(([s]) => s === lingerSeed)!;
        const [looks, ticks, looksBeforeGoing, mode, idle, soundOwed, left, top, right, bottom] =
          c.slice(25);
        const moment: CatzMomentState = {
          looks,
          ticks,
          looksBeforeGoing,
          mode,
          idle,
          soundOwed,
          box: { left, top, right, bottom },
          going: false,
        };
        let state = BigInt(lingerSeed);
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };
        const done = catzMomentLinger(
          {
            brains: c.slice(1, 13),
            centres: c.slice(13, 25),
            state: 21,
            global: 0,
            target: 0,
            count: 0,
          },
          moment,
          false,
          random
        );
        const [theirLooks, theirTicks, theirIdle, theirGoing, x, y, owed, layered] = values;
        const ours = [
          moment.looks,
          moment.ticks,
          moment.idle,
          Number(moment.going),
          moment.look?.x ?? x,
          moment.look?.y ?? y,
          moment.soundOwed,
          Number((done.sound?.action ?? -1) >= 0),
        ];
        const theirs = [
          theirLooks,
          theirTicks,
          theirIdle,
          theirGoing,
          x,
          y,
          owed,
          Number(layered > 0),
        ];

        if (ours.join(' ') !== theirs.join(' ')) {
          wrong.push(`linger seed ${lingerSeed}: ${ours.join(' ')} not ${theirs.join(' ')}`);
        }

        lingered++;
      }
    }

    expect(lingered).toBe(LINGER_CASES.length);

    /* And each moment begun: its box and mode, and the tick of lingering it
     * goes on to. */
    let entering: number[] = [];
    let entered = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'enter') {
        entering = values;
      } else if (kind === 'entered') {
        const [enterSeed, left, top, right, bottom] = entering;
        const c = ENTER_CASES.find(([s]) => s === enterSeed)!;
        const [mode, looksBeforeGoing, idle, soundOwed] = c.slice(25);
        const mind = {
          brains: c.slice(1, 13),
          centres: c.slice(13, 25),
          state: 21,
          global: 0,
          target: 0,
          count: 0,
        };
        const moment: CatzMomentState = {
          looks: 0,
          ticks: 0,
          looksBeforeGoing,
          mode,
          idle,
          soundOwed,
          box: { left: 0, top: 0, right: 0, bottom: 0 },
          going: false,
        };
        let state = BigInt(enterSeed);
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };

        catzMomentBegin(mind, moment, { left, top, right, bottom }, random);
        const done = catzMomentLinger(mind, moment, false, random);
        const [bl, bt, br, bb, theirMode, ...after] = values;
        const ours = [
          moment.box.left,
          moment.box.top,
          moment.box.right,
          moment.box.bottom,
          moment.mode,
          moment.looks,
          moment.ticks,
          moment.idle,
          Number(moment.going),
          moment.look?.x ?? after[4],
          moment.look?.y ?? after[5],
          moment.soundOwed,
          Number((done.sound?.action ?? -1) >= 0),
        ];
        const theirs = [bl, bt, br, bb, theirMode, ...after.slice(0, 7), Number(after[7] > 0)];

        if (ours.join(' ') !== theirs.join(' ')) {
          wrong.push(`enter seed ${enterSeed}: ${ours.join(' ')} not ${theirs.join(' ')}`);
        }

        entered++;
      }
    }

    expect(entered).toBe(ENTER_CASES.length);

    /* And the cursor about: how the cat reacted, by what it left -- the
     * first global state it was put in, attacking or affectionate; what it
     * is after (`+0x35a6` 0x17, chasing; `+0x35a2` 1, running) -- or, none,
     * the tick it lingered on. */
    let cursorSeed = 0;
    const reactions: Record<string, number> = {};

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'cursor') {
        cursorSeed = values[0];
      } else if (kind === 'cursored') {
        const c = CURSOR_CASES.find(([s]) => s === cursorSeed)!;
        const [looksBeforeGoing, idle, soundOwed] = c.slice(25);
        const mind = {
          brains: c.slice(1, 13),
          centres: c.slice(13, 25),
          state: 21,
          global: 0,
          target: 0,
          count: 0,
        };
        const moment: CatzMomentState = {
          looks: 0,
          ticks: 4,
          looksBeforeGoing,
          mode: 0,
          idle,
          soundOwed,
          box: { left: 0, top: 0, right: 0, bottom: 0 },
          going: false,
        };
        let state = BigInt(cursorSeed);
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };
        const reaction = catzMomentCursor(mind, moment, random);
        const [theirState, ...rest2] = values;
        const history = rest2.slice(0, 10);
        const [x35a2, , x35a6, theirMode, ...after] = rest2.slice(10);
        const marked = history.indexOf(-2) < 0 ? 10 : history.indexOf(-2);
        const first = marked > 0 ? history[marked - 1] : null;
        const theirs =
          first === 1
            ? 'attack'
            : first === 14
              ? 'affectionate'
              : x35a6 === 0x17
                ? 'chase'
                : x35a2 === 1
                  ? 'run'
                  : theirState === 21
                    ? 'linger'
                    : `state ${theirState} global ${first}`;
        let ours: string = reaction ?? 'linger';

        if (!reaction) {
          const done = catzMomentLinger(mind, moment, false, random);
          const lingered = [
            moment.mode,
            moment.looks,
            moment.ticks,
            moment.idle,
            Number(moment.going),
            moment.look?.x ?? after[4],
            moment.look?.y ?? after[5],
            moment.soundOwed,
            Number((done.sound?.action ?? -1) >= 0),
          ].join(' ');
          const theirLingered = [theirMode, ...after.slice(0, 7), Number(after[7] > 0)].join(' ');
          ours = lingered === theirLingered ? 'linger' : `linger ${lingered} not ${theirLingered}`;
        }

        if (ours !== theirs) {
          wrong.push(`cursor seed ${cursorSeed}: ${ours} not ${theirs}`);
        }

        reactions[theirs] = (reactions[theirs] ?? 0) + 1;
      }
    }

    expect(Object.values(reactions).reduce((a, b) => a + b, 0)).toBe(CURSOR_CASES.length);

    /* And each global state begun: the global states it was put in, in
     * turn, the first state of its own, its mode and its brains' effects. */
    let globalCase: number[] = [];
    let begun = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'global') {
        globalCase = values;
      } else if (kind === 'globaled') {
        const [globalSeed, area] = globalCase;
        const c = GLOBAL_CASES.find(([s]) => s === globalSeed)!;
        const [global, moved, sleepy] = c.slice(25);
        let state = BigInt(globalSeed);
        const random = (n: number) => {
          state = (state * 22695477n + 1n) & 0xffffffffn;
          return Number((state >> 16n) & 0x7fffn) % n;
        };
        const ours = catzGlobalBegin(
          global,
          {
            brains: c.slice(1, 13),
            centres: c.slice(13, 25),
            state: 0,
            global: 0,
            target: 0,
            count: 0,
          },
          { cursorMoved: moved !== 0, area3: area === 3, screenSaver: false, sleepy: sleepy !== 0 },
          random
        );
        const added = (history: number[]) =>
          history.slice(0, history.indexOf(-2) < 0 ? 10 : history.indexOf(-2)).reverse();
        const locals = added(values.slice(0, 10));
        const globals = added(values.slice(10, 20));
        const [mode, ...effects] = values.slice(20);
        const said = [ours.globals.join(','), ours.state, ours.mode ?? mode, ours.effects].join(
          ' '
        );
        /* As far as the model goes: a state of its own begun may put it in
         * another global state again, as exploring does idling. */
        const theirs = [
          globals.slice(0, ours.globals.length).join(','),
          locals[0],
          mode,
          effects,
        ].join(' ');

        if (said !== theirs) {
          wrong.push(`global seed ${globalSeed} state ${global}: ${said} not ${theirs}`);
        }

        begun++;
      }
    }

    expect(begun).toBe(GLOBAL_CASES.length);

    /* And each tick of a state of its own: the state it went to, the global
     * state it was put in, its energy, its count, and, where it stayed, the
     * action it pushed and began. */
    /* What the shelf holds, by kind of sprite. */
    const shelf = lines
      .find((line) => line.startsWith('shelf '))!
      .split(' ')
      .slice(1)
      .map(Number);
    let localSeed = 0;
    let localArea = 0;
    let room: number[] = [];
    let ticked = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'local') {
        [localSeed, localArea] = values;
      } else if (kind === 'stage') {
        room = values;
      } else if (kind === 'localed') {
        const c = LOCAL_CASES.find(([s]) => s === localSeed)!;
        const [state, global, count, passed, ticks, x1500] = c.slice(25);
        const [enter, mode, x35fc, x35a6In, x35a2, x35acIn, wantX, wantY] = c.slice(43, 51);
        const [x688In, x35aaIn, x35a8In, x35f4, x35ee, x35a4In, found] = c.slice(51, 58);
        let seed = BigInt(localSeed);
        const random = (n: number) => {
          seed = (seed * 22695477n + 1n) & 0xffffffffn;
          return Number((seed >> 16n) & 0x7fffn) % n;
        };
        const ours = catzStateTick(
          state,
          { brains: c.slice(1, 13), centres: c.slice(13, 25), state, global, target: 0, count: 0 },
          {
            global,
            count,
            passed,
            curiosities: c.slice(31, 39),
            ticks,
            x1500,
            stage: { left: room[0], top: room[1], right: room[2], bottom: room[3] },
            size: { width: room[4], height: room[5] },
            point: { x: room[6], y: room[7] },
            kin: { left: room[9], top: room[10], right: room[11], bottom: room[12] },
            cursor: { left: c[39], top: c[40], right: c[41], bottom: c[42] },
            enter: enter === 1,
            mode,
            x35fc,
            x35a6: x35a6In,
            x35a2,
            x35ac: x35acIn,
            goal: { x: wantX, y: wantY },
            area1: localArea === 1,
            area3: localArea === 3,
            rect: { left: room[13], top: room[14], right: room[15], bottom: room[16] },
            x688: x688In,
            x35a8: x35a8In,
            x35f4,
            x35ee,
            x35a4: x35a4In,
            inShelf: (kind) => shelf[kind] !== 0,
            x35aa: x35aaIn,
            found: found === 1,
            cued: values[52] > 0,
          },
          random
        );
        const [energy, theirCount] = values.slice(20);
        /* The actions pushed through the cat's slot `0xb8`, in turn: the
         * handler's first, then any its scripts went on to. (The engine's
         * own record of the last ten, `+0x14a8`, can be overrun in a tick.) */
        const pushes = values[37];
        /* And the global state asked for (the global machine's slot `0x1c`),
         * the first, none entered: the tick held to its own step. */
        const theirGlobal = values[33] ? values[34] : undefined;
        /* Prestalking entered: its pushes held, not whether its script, popped at once, is done and it goes on to stalk (2). */
        const theirState = values[35] && !(state === 1 && enter) ? values[36] : undefined;
        const [theirTicks, , layered, goalX, goalY, explore] = values.slice(46);
        const looked = values[52];
        const heads = Array.from({ length: Math.min(looked, 4) }, (_, k) =>
          values[53 + 2 * k] === 0xe0 ? (values[54 + 2 * k] ? 'track' : 'off') : 'user'
        );
        const [marked, markX, markY, x35ac] = values.slice(61, 65);
        const [wordings, ...worded] = values.slice(65, 72);
        const [fullness, , x35aa, x33be] = values.slice(72, 76);
        const [theirPassed, after, idle, looks, theirMode, x35a6, x35a4] = values.slice(76);
        const walkingOn = state === 23;
        const walking = state === 22;
        /* The handler's own pushes: its scripts may go on to more in the tick. */
        const pushedAll = values.slice(38, 38 + Math.min(pushes, 8, ours.pushes?.length || 8));
        const looking = state === 12;
        const changed = ours.state !== undefined || ours.global !== undefined;
        const said = [
          ours.state,
          ours.global,
          ours.energy,
          changed ? '' : ours.count,
          /* Changing state, its pushes are held below, not its first. */
          changed ? undefined : ours.pushed,
          ours.passed ?? passed,
          ours.moment && [
            ours.moment.after,
            ours.moment.idle,
            ours.moment.looksBeforeGoing,
            ours.moment.pushed,
          ],
          ours.x35a6 !== undefined && [ours.x35a6, ours.x35a4],
          looking && [ours.ticks, ours.x35a4, Boolean(ours.sound)],
          !walking && ours.goal && [ours.goal.x, ours.goal.y, ours.explore],
          walkingOn && [
            ours.steer,
            ours.layered !== undefined || Boolean(ours.sound),
            ours.x35aa ?? x35aaIn,
            ours.fullness,
            ours.marker ? [ours.marker.x, ours.marker.y] : '',
            ours.head,
            ours.pushes,
            ours.mode ?? mode,
            ours.x35a6 ?? x35a6In,
            ours.x33be,
          ],
          walking && [
            ours.mode ?? mode,
            ours.goal ? [ours.goal.x, ours.goal.y] : [wantX, wantY],
            ours.marker ? [ours.marker.x, ours.marker.y] : '',
            ours.head,
            ours.pushes,
            ours.x35a6 ?? x35a6In,
            enter && ours.global === undefined ? 0 : x35acIn,
          ],
        ].join(' ');
        const theirs = [
          theirState,
          /* A state entered may go on at once, as sleeping where it may not
           * sleep goes to idling: only this tick's own step is held. */
          ours.state === undefined ? theirGlobal : undefined,
          energy,
          changed ? '' : theirCount,
          changed || (walkingOn && !ours.pushes) ? undefined : pushes ? values[38] : undefined,
          state === 19 || state === 35 ? theirPassed : passed,
          ours.moment && [after, idle, looks, pushes ? values[38] : undefined],
          ours.x35a6 !== undefined && [x35a6, ours.x35a4 === undefined ? undefined : x35a4],
          /* `+0x35a4` as the tick set it, where it did; else as the case before left it. */
          looking && [theirTicks, ours.x35a4 === undefined ? undefined : x35a4, layered > 0],
          !walking && ours.goal && [goalX, goalY, explore],
          walkingOn && [
            wordings ? worded : undefined,
            layered > 0,
            /* (`+0x688` the steering moves on as the script is popped.) */
            x35aa,
            fullness,
            ours.marker && marked ? [markX, markY] : '',
            heads,
            ours.pushes && pushedAll,
            theirMode,
            x35a6,
            ours.x33be === undefined ? undefined : x33be,
          ],
          walking && [
            theirMode,
            [goalX, goalY],
            ours.marker && marked ? [markX, markY] : '',
            heads,
            pushedAll,
            x35a6,
            x35ac,
          ],
        ].join(' ');

        if (said !== theirs) {
          wrong.push(`local seed ${localSeed} state ${state}: ${said} not ${theirs}`);
        }

        ticked++;
      }
    }

    expect(ticked).toBe(LOCAL_CASES.length);

    /* And what the cat is curious about, given what the shelf holds. */
    let curiousSeed = 0;
    let curious = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'curiosities') {
        curiousSeed = values[0];
      } else if (kind === 'curious') {
        const c = CURIOUS_CASES.find(([s]) => s === curiousSeed)!;
        let seed = BigInt(curiousSeed);
        const random = (n: number) => {
          seed = (seed * 22695477n + 1n) & 0xffffffffn;
          return Number((seed >> 16n) & 0x7fffn) % n;
        };
        const ours = catzCuriosities(
          {
            brains: c.slice(1, 13),
            centres: c.slice(13, 25),
            state: 12,
            global: 6,
            target: 0,
            count: 0,
          },
          (kind) => shelf[kind] !== 0,
          random
        );
        const theirs = values.slice(0, values.indexOf(0) < 0 ? 50 : values.indexOf(0));

        if (ours.join(' ') !== theirs.join(' ')) {
          wrong.push(`curious seed ${curiousSeed}: ${ours.join(' ')} not ${theirs.join(' ')}`);
        }

        curious++;
      }
    }

    expect(curious).toBe(CURIOUS_CASES.length);
    expect(wrong).toEqual([]);
  }, 1800000);

  it('follows a cat through its day, each tick of its own states as the engine', async () => {
    const out = join(
      HARNESS,
      `CATZTRACE${TRACE_CUES ? '-CUES' : ''}${TRACE_POUNCE ? '-POUNCE' : ''}${TRACE_EAT ? '-EAT' : ''}${TRACE_FEAR ? '-FEAR' : ''}${TRACE_PET ? '-PET' : ''}${TRACE_PET_DEEP ? '-DEEP' : ''}${TRACE_FOND ? '-FOND' : ''}${TRACE_FOND_MOVING ? '-MOVING' : ''}${TRACE_FOND_LACKING ? '-LACKING' : ''}${TRACE_BOTTLE ? '-BOTTLE' : ''}${TRACE_TREAT ? '-TREAT' : ''}${TRACE_KIT ? '-KIT' : ''}${TRACE_NAP ? '-NAP' : ''}${TRACE_GROOM ? '-GROOM' : ''}${TRACE_IGNORE ? '-IGNORE' : ''}${TRACE_SPRAY ? '-SPRAY' : ''}${TRACE_DIET ? '-DIET' : ''}${TRACE_WIGGLE ? '-WIGGLE' : ''}${TRACE_MOUSE ? '-MOUSE' : ''}${TRACE_SCRUFF ? '-SCRUFF' : ''}${TRACE_MESSAGES ? '-MESSAGES' : ''}${TRACE_FEARFUL ? '-FEARFUL' : ''}${TRACE_AGELESS ? '-AGELESS' : ''}${TRACE_KIT_PARAMS ? '-C4' : ''}${TRACE_FRAMES === 2000 ? '' : `-${TRACE_FRAMES}`}.OUT`
    );
    let text: string;

    if (process.env.HARNESS_REUSE && existsSync(out)) {
      text = readFileSync(out, 'latin1');
    } else {
      const directory = stage('CATZTRACE');
      cpSync(join(HARNESS, 'CATZPEN.EXE'), join(directory, 'CATZPEN.EXE'));
      cpSync(PARAMS, join(directory, 'PARAMS.BIN'));
      writeFileSync(
        join(directory, 'TRACE.TXT'),
        `${TRACE_FRAMES}\r\n${
          (TRACE_CUES ? 1 : 0) |
          (TRACE_POUNCE ? 2 : 0) |
          (TRACE_EAT ? 4 : 0) |
          (TRACE_FEAR ? 8 : 0) |
          (TRACE_PET ? 16 : 0) |
          (TRACE_FOND ? 32 : 0) |
          (TRACE_BOTTLE ? 64 : 0) |
          (TRACE_TREAT ? 128 : 0) |
          (TRACE_KIT ? 256 : 0) |
          (TRACE_NAP ? 512 : 0) |
          (TRACE_GROOM ? 1024 : 0) |
          (TRACE_FOND_MOVING ? 2048 : 0) |
          (TRACE_IGNORE ? 4096 : 0) |
          (TRACE_SPRAY ? 8192 : 0) |
          (TRACE_PET_DEEP ? 16384 : 0) |
          (TRACE_FOND_LACKING ? 32768 : 0) |
          (TRACE_DIET ? 65536 : 0) |
          (TRACE_WIGGLE ? 131072 : 0) |
          (TRACE_MOUSE ? 262144 : 0) |
          (TRACE_SCRUFF ? 524288 : 0) |
          (TRACE_MESSAGES ? 1048576 : 0) |
          (TRACE_FEARFUL ? 2097152 : 0) |
          (TRACE_AGELESS ? 4194304 : 0) |
          (TRACE_KIT_PARAMS ? 8388608 : 0)
        }\r\n`
      );
      const { runProbe } = await import(WINBOX);
      const result = await runProbe(
        'catztrace',
        1,
        false,
        true,
        7200 * Math.ceil(TRACE_FRAMES / 2000),
        {
          display: 'vga256',
          virtual: true,
          program: { directory, file: 'CATZPEN.EXE', folder: 'CATZPEN' },
          extras: EXTRAS,
        }
      );

      expect(result.failure ?? null).toBeNull();
      const file = await result.fileSystem.open(['CATZPEN.OUT']);
      text = new TextDecoder().decode(new Uint8Array(await file.read(0, file.info.size)));
      writeFileSync(out, text);
    }

    const lines = text.trim().split(/\r?\n/);
    expect(lines.filter((line) => line.startsWith('frame '))).toHaveLength(TRACE_FRAMES);
    const shelf = lines
      .find((line) => line.startsWith('shelf '))
      ?.split(' ')
      .slice(1)
      .map(Number);
    const { held, unread, unknown, wrong, tally, books } = followTrace(lines, (kind) =>
      shelf ? shelf[kind] !== 0 : false
    );

    console.log(
      Object.entries(tally)
        .map(
          ([state, [ticks, acted, compared]]) =>
            `state ${state}: ${ticks} ticks, ${acted} acted, ${compared} held`
        )
        .join('\n') + `\n${held} held, ${unread} unread, ${unknown} unseeded`
    );
    expect(held).toBeGreaterThan(0);
    expect(wrong).toEqual([]);

    console.log(
      `bookkeeping:\n${Object.entries(books)
        .filter(([, k]) => k.other)
        .map(([key, k]) => `  ${key}: ${k.same} same, ${k.other} not (${k.examples.join('; ')})`)
        .join('\n')}\n  ${Object.values(books).reduce((n, k) => n + k.same, 0)} same in all`
    );
    expect(
      Object.entries(books)
        .filter(([, k]) => k.other)
        .map(([key, k]) => `${key}: ${k.examples.join('; ')}`)
    ).toEqual([]);

    /* And its reflexes, between one tick and the next. */
    const reflexes = followReflexes(lines);
    console.log(
      `reflexes: ${reflexes.counted} counted down, ${reflexes.fired} extreme situations, ${reflexes.changed} changing its behaviour`
    );
    expect(reflexes.wrong).toEqual([]);

    const wiggles = followWiggles(lines);
    console.log(
      `wiggling: ${wiggles.kept} kept, ${wiggles.looked} looked at, ${wiggles.reacted} reacted to (${wiggles.how.join(' ')})`
    );
    expect(wiggles.wrong).toEqual([]);

    const mice = followMice(lines);
    console.log(
      `seeing the mouse: ${mice.calls} calls, ${mice.out} with it out on the stage, ${mice.reacted} reacted to (${mice.how.join(' ')})`
    );
    expect(mice.wrong).toEqual([]);

    const scruffs = followScruffs(lines);
    console.log(
      `scruffed: ${scruffs.calls} calls with a button down, ${scruffs.dangled} picked up`
    );
    expect(scruffs.wrong).toEqual([]);

    const purrs = lines.filter((line) => line.startsWith('purr '));
    const purrsWrong = purrs.flatMap((line) => {
      const [was, asked, now, after] = line.split(' ').slice(1).map(Number);
      const ours = catzPurring(was, asked);
      return ours.x3570 === now && ours.x3572 === after
        ? []
        : [`purr ${was} ${asked}: ${ours.x3570} ${ours.x3572} not ${now} ${after}`];
    });
    console.log(
      `purring: ${purrs.length} asked (${[1, 2, 3, 4].map((k) => purrs.filter((line) => line.split(' ')[2] === String(k)).length).join(' ')} of 1 to 4)`
    );
    expect(purrsWrong).toEqual([]);

    const blinks = lines.filter((line) => line.startsWith('blink '));
    const blinksWrong = blinks.flatMap((line) => {
      const [seed, due, shut, kept, lid, lid2, ...after] = line.split(' ').slice(1).map(Number);
      let at = BigInt(seed);
      const random = (n: number) => {
        at = (at * 22695477n + 1n) & 0xffffffffn;
        return Number((at >> 16n) & 0x7fffn) % n;
      };
      const ours = catzBlinking({ due, shut, kept, lids: [lid, lid2] }, random);
      const said = [ours.due, ours.shut, ours.kept, ...ours.lids, Number(at)].join(' ');
      return said === after.join(' ') ? [] : [`blink seed ${seed}: ${said} not ${after.join(' ')}`];
    });
    console.log(`blinking: ${blinks.length} blinks`);
    expect(blinksWrong).toEqual([]);

    /* Layering, each look (`catzLayering`): the seed, whether a layer plays,
     * its state, global state, `+0x696` and brains; then `+0x358a` and the
     * seed after. */
    const layers = lines.filter((line) => line.startsWith('layer '));
    const layersWrong = layers.flatMap((line) => {
      const v = line.split(' ').slice(1).map(Number);
      const [seed, playing, state, global] = v;
      let at = BigInt(seed);
      const random = (n: number) => {
        at = (at * 22695477n + 1n) & 0xffffffffn;
        return Number((at >> 16n) & 0x7fffn) % n;
      };
      const ours = catzLayering(
        { brains: v.slice(5, 17), state, global, target: 0, count: 0 },
        0,
        playing !== 0,
        random
      );
      const said = `${ours.x358a} ${at}`;
      const theirs = `${v[17]} ${v[18]}`;
      return said === theirs ? [] : [`layer seed ${seed}: ${said} not ${theirs}`];
    });
    console.log(`layering: ${layers.length} looks`);
    expect(layersWrong).toEqual([]);

    const messages = followMessages(lines);
    console.log(
      `messages: ${messages.calls} left, ${messages.held} held (${Object.entries(messages.how)
        .map(([how, n]) => `${how} ${n}`)
        .join(', ')})`
    );
    expect(messages.wrong).toEqual([]);
  }, 28800000);
});

/**
 * Extreme situations, held call by call (`catzExtremeSituations`): each
 * `extreme` line the driver wrote around the cat's reflex -- the seed,
 * `+0x358c`, `PetParams` `+0xc4`, its state, global state, `+0x35a4` and
 * `+0x35d6`, its brains and centres by pairs; then `+0x358c`, `+0x3574`, its
 * brains and the seed after.
 */
function followReflexes(lines: string[]) {
  const wrong: string[] = [];
  let counted = 0;
  let fired = 0;
  let changed = 0;

  for (const line of lines) {
    if (!line.startsWith('extreme ')) {
      continue;
    }

    const v = line.split(' ').slice(1).map(Number);
    const [seed, x358c, c4, state, global, x35a4, x35d6] = v;
    const pairs = v.slice(7, 31);
    const mind: CatzMind = {
      brains: pairs.filter((_, k) => k % 2 === 0),
      centres: pairs.filter((_, k) => k % 2 === 1),
      state,
      global,
      target: x35a4,
      count: x35d6,
    };
    const [after358c, after3574] = v.slice(31, 33);
    const brains = v.slice(33, 45);
    const afterSeed = v[45];
    const was3574 = after3574;
    let at = BigInt(seed);
    const random = (n: number) => {
      at = (at * 22695477n + 1n) & 0xffffffffn;
      return Number((at >> 16n) & 0x7fffn) % n;
    };
    const ours = catzExtremeSituations(mind, x358c, c4 !== 0, random);

    if (ours.change !== undefined) {
      changed++;
      catzBehaviorChange(mind, ours.change, [0, 0, 0, 0]);
    }

    const said = [ours.x358c, ours.x3574 ?? was3574, ...mind.brains, Number(at)];
    const theirs = [after358c, after3574, ...brains, afterSeed];

    if (said.join(' ') !== theirs.join(' ')) {
      wrong.push(`extreme seed ${seed}: ${said.join(' ')} not ${theirs.join(' ')}`);
    }

    if (ours.x3574 === undefined) {
      counted++;
    } else {
      fired++;
    }
  }

  return { wrong, counted, fired, changed };
}

/**
 * The cursor wiggled, held call by call (`catzCursorWiggling`): each `wiggle`
 * line the driver wrote before the cat's reflex -- the seed, its state,
 * global state, `+0x35a4` and `+0x35d6`, the ring and `+0x33b8`, the
 * cursor's point and its brains and centres, by pairs -- and the `wiggled`
 * line after it, for its leaving may write a tick between: the ring's index,
 * where the cursor was, the way kept, `+0x33b8`, its global state,
 * `+0x35a4` and the seed after -- or the global state it asked and the seed
 * as it did, before that state's entering drew or moved on. What the user holds is taken from what it
 * reacted to; where it readies its moment, `PreMoment` draws before it asks
 * one, and its draws there are not held.
 */
function followWiggles(lines: string[]) {
  const wrong: string[] = [];
  const how: number[] = [];
  let kept = 0;
  let looked = 0;
  let reacted = 0;

  let v: number[] = [];

  for (const line of lines) {
    if (line.startsWith('wiggle ')) {
      v = line.split(' ').slice(1).map(Number);
      continue;
    }

    if (!line.startsWith('wiggled ')) {
      continue;
    }

    v = [...v.slice(0, 55), ...line.split(' ').slice(1).map(Number)];
    const [seed, state, global, x35a4, x35d6, index, lastX, lastY] = v;
    const pairs = v.slice(31, 55);
    const mind: CatzMind = {
      brains: pairs.filter((_, k) => k % 2 === 0),
      centres: pairs.filter((_, k) => k % 2 === 1),
      state,
      global,
      target: x35a4,
      count: x35d6,
    };
    const wiggle = { index, last: { x: lastX, y: lastY }, ways: v.slice(8, 28), still: v[28] };
    const [afterIndex, afterX, afterY, way, still, afterGlobal, afterTarget, afterSeed] =
      v.slice(55);
    let at = BigInt(seed);
    const random = (n: number) => {
      at = (at * 22695477n + 1n) & 0xffffffffn;
      return Number((at >> 16n) & 0x7fffn) % n;
    };
    const ours = catzCursorWiggling(
      mind,
      wiggle,
      { x: v[29], y: v[30] },
      x35a4,
      afterGlobal !== global ? afterTarget : 0x17,
      random
    );
    const said = [
      wiggle.index,
      wiggle.last.x,
      wiggle.last.y,
      index < 20 ? wiggle.ways[index] : way,
      index < 20 ? v[28] : wiggle.still,
      ours.global ?? global,
      ours.x35a4 ?? x35a4,
      ours.moment ? afterSeed : Number(at),
    ];
    const theirs = [afterIndex, afterX, afterY, way, still, afterGlobal, afterTarget, afterSeed];

    if (said.join(' ') !== theirs.join(' ')) {
      wrong.push(`wiggle seed ${seed} index ${index}: ${said.join(' ')} not ${theirs.join(' ')}`);
    }

    if (index < 20) {
      kept++;
    } else {
      looked++;
    }

    if (ours.global !== undefined) {
      reacted++;
      how.push(ours.global);
    }
  }

  return { wrong, kept, looked, reacted, how };
}

/**
 * The cat seeing the mouse, held call by call (`catzSeesMouse`): each `mouse`
 * line the driver wrote before the cat's reflex -- the seed, the mouse's
 * state and point, the cat's point, the stage, `+0x33bc`, its state, global
 * state, `+0x35a4`, `+0x35d6` and `+0x35b6`, its brains and centres by
 * pairs -- and the `saw` line after it: the global state it asked and the
 * seed as it did (else its global state and the seed after), `+0x35a4`,
 * `+0x35b6`, `+0x33bc` and how often it turned its head. Its head, and
 * what it plays with, are held only where it did not react, for its new
 * global state's entering may turn it and set what it plays with (scared,
 * kin 0x22 to hide by).
 */
function followMice(lines: string[]) {
  const wrong: string[] = [];
  const how: number[] = [];
  let calls = 0;
  let out = 0;
  let reacted = 0;
  let v: number[] = [];

  for (const line of lines) {
    if (line.startsWith('mouse ')) {
      v = line.split(' ').slice(1).map(Number);
      continue;
    }

    if (!line.startsWith('saw ')) {
      continue;
    }

    const after = line.split(' ').slice(1).map(Number);
    const [seed, mouseState, mx, my, cx, cy, left, top, right, bottom, x33bc] = v;
    const [state, global, x35a4, x35d6, x35b6] = v.slice(11, 16);
    const pairs = v.slice(16, 40);
    const mind: CatzMind = {
      brains: pairs.filter((_, k) => k % 2 === 0),
      centres: pairs.filter((_, k) => k % 2 === 1),
      state,
      global,
      target: x35a4,
      count: x35d6,
    };
    let at = BigInt(seed);
    const random = (n: number) => {
      at = (at * 22695477n + 1n) & 0xffffffffn;
      return Number((at >> 16n) & 0x7fffn) % n;
    };
    const ours = catzSeesMouse(
      mind,
      {
        state: mouseState,
        at: { x: mx, y: my },
        point: { x: cx, y: cy },
        stage: { left, top, right, bottom },
        x33bc,
      },
      random
    );
    const reacting = ours.global !== undefined;
    const said = [
      ours.global ?? global,
      Number(at),
      reacting ? after[2] : x35a4,
      ours.x35b6 ?? x35b6,
      reacting ? 1 : x33bc,
      reacting ? after[5] : Number(ours.head ?? false),
    ];

    if (said.join(' ') !== after.join(' ')) {
      wrong.push(`mouse seed ${seed}: ${said.join(' ')} not ${after.join(' ')}`);
    }

    calls++;

    if (
      mouseState !== 1 &&
      mouseState !== -1 &&
      mx >= left &&
      mx <= right &&
      my >= top &&
      my <= bottom
    ) {
      out++;
    }

    if (reacting) {
      reacted++;
      how.push(ours.global!);
    }
  }

  return { wrong, calls, out, reacted, how };
}

/**
 * Picked up by the scruff, held call by call (`catzScruff`): each `scruff`
 * line the driver wrote before the cat's reflex, a button down -- the
 * buttons, ball 2 where it is drawn, the cursor's point, `+0x9e`, its target
 * point, kin 0x22's draw rectangle, its state, global state, `+0x35fc`,
 * `+0x35fa`, `+0x35f6`, `+0x35f8` and `+0xfc` -- and the `scruffed` line
 * after it: its state, `+0xfc` and `+0x35f6`; and whether the user holds
 * anything (older traces: nothing held).
 */
function followScruffs(lines: string[]) {
  const wrong: string[] = [];
  let calls = 0;
  let dangled = 0;
  let v: number[] = [];

  for (const line of lines) {
    if (line.startsWith('scruff ')) {
      v = line.split(' ').slice(1).map(Number);
      continue;
    }

    if (!line.startsWith('scruffed ')) {
      continue;
    }

    const after = line.split(' ').slice(1).map(Number);
    const [left, right, bx, by, cx, cy, x9e, px, py, hl, ht, hr, hb] = v;
    const [state, global, x35fc, x35fa, x35f6, x35f8, xfc] = v.slice(13);
    const ours = catzScruff(
      { brains: [], state, global, target: 0, count: 0 },
      {
        left: left !== 0,
        right: right !== 0,
        holding: v[20] !== undefined && v[20] !== 0,
        ball: { x: bx, y: by },
        cursor: { x: cx, y: cy },
        point: { x: px, y: py },
        x9e,
        hidden: { left: hl, top: ht, right: hr, bottom: hb },
        x35fc,
        x35fa,
        x35f6,
        x35f8,
      }
    );
    const said = [ours.dangles ? 33 : state, ours.dangles ? 1 : xfc, ours.x35f6 ?? x35f6];

    if (said.join(' ') !== after.join(' ')) {
      wrong.push(`scruff ${v.join(' ')}: ${said.join(' ')} not ${after.join(' ')}`);
    }

    calls++;
    dangled += Number(ours.dangles);
  }

  return { wrong, calls, dangled };
}

/**
 * The playpen's messages, held call by call (`catzMessage`): each `message`
 * line the driver wrote before the cat's reflex -- the seed, the message,
 * `PetParams` `+0xc4`, its state, global state, `+0x35a4`, `+0x35a6`,
 * `+0x35d6`, `+0x35fc`, `+0x35b2`, where it is placed, the mouse's state,
 * its brains and centres by pairs, whether the treat is shelved, its draw
 * rectangle and the spray's and flea spray's points, and, for the Adoption
 * Kit, the shelf by bits, `+0x35fa`, `+0x35f6` and `+0x35f8` -- and the `messaged` line after: the
 * global state it asked and the seed as it did (else its global state and
 * the seed after), its state, `+0x35a4`, `+0x35d6`, `+0x35b0`, `+0x35b2`,
 * `+0x35b4`, and its head's turns and pushes. A new global state's entering,
 * or a new state of its own's, may set what it plays with, push and turn its
 * head too: those are held only as the message itself sets them, or where it
 * asks neither.
 */
function followMessages(lines: string[]) {
  const wrong: string[] = [];
  const how: Record<string, number> = {};
  let calls = 0;
  let held = 0;
  let v: number[] = [];

  for (const line of lines) {
    if (line.startsWith('message ')) {
      v = line.split(' ').slice(1).map(Number);
      continue;
    }

    if (!line.startsWith('messaged ')) {
      continue;
    }

    calls++;
    const after = line.split(' ').slice(1).map(Number);
    const [seed, message, c4, state, global, x35a4, x35a6, x35d6, x35fc, x35b2, area, mouseState] =
      v;
    const pairs = v.slice(12, 36);
    const mind: CatzMind = {
      brains: pairs.filter((_, k) => k % 2 === 0),
      centres: pairs.filter((_, k) => k % 2 === 1),
      state,
      global,
      target: x35a4,
      count: x35d6,
    };
    let at = BigInt(seed);
    const random = (n: number) => {
      at = (at * 22695477n + 1n) & 0xffffffffn;
      return Number((at >> 16n) & 0x7fffn) % n;
    };

    if (x35fc !== 0) {
      continue;
    }

    const ours = (c4 !== 0 ? catzKitMessage : catzMessage)(
      mind,
      message,
      {
        x35a4,
        x35a6,
        x35d6,
        x35b2,
        area,
        mouseState,
        treatShelved: v[36] === undefined ? undefined : v[36] !== 0,
        ...(v[44] === undefined
          ? {}
          : {
              rect: { left: v[37], top: v[38], right: v[39], bottom: v[40] },
              spray: v[41] || v[42] ? { x: v[41], y: v[42] } : undefined,
              flea: v[43] || v[44] ? { x: v[43], y: v[44] } : undefined,
            }),
        ...(v[48] === undefined
          ? {}
          : {
              shelved: [...Array(16).keys()].map((k) => ((v[45] >> k) & 1) !== 0),
              x35fa: v[46],
              x35f6: v[47],
              x35f8: v[48],
            }),
        ...(v[53] === undefined
          ? {}
          : {
              x361e: v[49],
              stage: { left: v[50], top: v[51], right: v[52], bottom: v[53] },
            }),
      },
      random
    );

    if (!ours) {
      continue;
    }

    const [aGlobal, aSeed, aState, aX35a4, aX35d6, aX35b0, aX35b2, aX35b4, heads, pushes] = after;
    const quiet = ours.global === undefined && ours.state === undefined;
    const said = [
      ours.global ?? global,
      Number(at),
      ours.state ?? aState,
      ours.x35a4 ?? (quiet ? x35a4 : aX35a4),
      ours.x35d6 ?? x35d6,
      ours.ignored ? ours.ignored.kin : aX35b0,
      ours.ignored ? ours.ignored.kin : x35b2,
      ours.ignored?.x35b4 ?? aX35b4,
      quiet ? Number(ours.head ?? false) : heads,
      quiet ? (ours.pushes ?? []).length : pushes,
    ];
    const theirs = [aGlobal, aSeed, aState, aX35a4, aX35d6, aX35b0, aX35b2, aX35b4, heads, pushes];

    if (said.join(' ') !== theirs.join(' ')) {
      wrong.push(`message ${message} seed ${seed}: ${said.join(' ')} not ${theirs.join(' ')}`);
    }

    held++;
    const key = `${message}:${ours.ignored ? 'ignored' : (ours.global ?? 'none')}`;
    how[key] = (how[key] ?? 0) + 1;
  }

  return { wrong, calls, held, how };
}

/** A double, from its four words, low first, as the trace writes them. */
function double(words: number[]): number {
  const view = new DataView(new ArrayBuffer(8));
  words.forEach((word, k) => view.setUint16(2 * k, word, true));
  return view.getFloat64(0, true);
}

/** The states of its own `catzStateTick` reimplements, a tick of each held where the engine acted in it. */
const FOLLOWED = new Set([
  1, 2, 3, 5, 6, 7, 12, 13, 19, 21, 22, 23, 26, 27, 28, 29, 30, 32, 34, 35, 56, 57, 8, 9, 10, 11,
  38, 39, 40, 41, 31, 80, 4, 58, 59, 60, 61, 62, 42, 43, 49, 50, 51, 52, 53, 24, 54, 55, 44, 45, 46,
  47, 48, 36, 37, 72, 73, 74, 75, 76, 77, 78, 79, 65, 66, 67, 68, 69, 70, 71, 81, 63, 64, 33, 20,
]);

/** The states whose entering is reimplemented, and those of them whose entered ticks are held only by what they push, their scripts popped at once. */
const ENTERED = new Set([
  3, 4, 8, 22, 24, 31, 32, 42, 44, 45, 46, 48, 49, 52, 54, 58, 59, 60, 72, 76, 80, 77, 78, 79, 65,
  67, 69, 70, 71, 81, 63, 64, 61, 55, 26, 33,
]);
const ENTERED_PUSHES = new Set([
  3, 4, 8, 24, 31, 42, 44, 45, 48, 52, 54, 58, 59, 60, 72, 76, 80, 77, 78, 79, 65, 67, 69, 70, 71,
  81, 55, 26, 33,
]);

/**
 * A cat's day held to the reimplementation: each `tick` the driver wrote
 * before a tick of a state of its own (C's `rand` seed, entered and left, its
 * place on the stage, its global state, its fields, brains and their
 * centres, its curiosities, the cursor, the stage, its size and point, its
 * kin 0x22's and its own rectangles, its marker, the layered frames left,
 * `PetParams` `+0xc4`, the moment's fields, how what it plays with lies to
 * its paw and the swat's fields) and `ticked` after (the global and own states asked
 * for, the actions pushed, its head's calls, its steering's words, and its
 * fields and brains again). Where the engine acted -- pushed an action or
 * asked for a state, not as `PopScript` pushes the next action as its script
 * goes on -- its script was done, and the reimplementation, given the same,
 * should act the same: the first state asked for, the first global
 * state, and, where neither, the first action pushed. Where nothing was done,
 * its script went on, which `catzStateTick` does not model, and the tick is
 * only counted. Walking on, whether `PopScript` found what it walks to is
 * not known, and either will do.
 */
function followTrace(lines: string[], inShelf: (kind: number) => boolean) {
  const wrong: string[] = [];
  const tally: Record<number, [number, number, number]> = {};
  let held = 0;
  let unread = 0;
  let unknown = 0;
  let before: number[] | null = null;
  let pending: { state: number; global: number; tick: CatzStateTick } | null = null;
  const books: Record<string, { same: number; other: number; examples: string[] }> = {};

  let frames = 0;

  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');
    const values = rest.map(Number);

    /* A frame without a tick of its own (the driver forcing one, which
     * writes none) breaks what is carried. */
    if (kind === 'frame' && ++frames > 1) {
      pending = null;
    }

    if (kind === 'tick') {
      before = values;

      /* The bookkeeping: what the model said the tick before wrote, against
       * what the engine holds as this one begins, its state and global
       * state the same (a reflex may begin another in its `Update`), neither
       * entered anew nor left (what puts it in another may have written
       * first). */
      if (
        pending &&
        values[5] === pending.state &&
        values[4] === pending.global &&
        values[1] === 0 &&
        values[2] === 0
      ) {
        const field = (n: number) => values[5 + n];
        const t = pending.tick;
        const pairs: [string, number | undefined, number][] = [
          ['count', t.count, field(1)],
          ['passed', t.passed, field(2)],
          ['mode', t.mode, field(5)],
          ['x35a6', t.x35a6, field(7)],
          ['x35ac', t.x35ac, field(9)],
          ['x35ee', t.x35ee, field(16)],
          ['x35a4', t.x35a4, field(17)],
          ['x33be', t.x33be, field(21)],
        ];

        for (const [name, ours, theirs] of pairs) {
          if (ours === undefined) {
            continue;
          }

          const key = `${pending.state}:${name}`;
          const k = (books[key] ??= { same: 0, other: 0, examples: [] });

          if (ours === theirs) {
            k.same++;
          } else {
            k.other++;

            if (k.examples.length < 3) {
              k.examples.push(`seed ${values[0]}: ${ours} not ${theirs}`);
            }
          }
        }
      }

      pending = null;
      continue;
    }

    if (kind !== 'ticked' || !before) {
      continue;
    }

    const b = before;
    before = null;
    const [seedValue, enter, leave, , global] = b;
    /* Where it was on the stage as its handler first asked, after its script
     * was popped and moved it, where the trace has it; else as the tick began. */
    const area = values[122] > 0 ? values[123] : b[3];
    const field = (n: number) => b[5 + n];
    const state = field(0);
    const counts = (tally[state] ??= [0, 0, 0]);
    counts[0]++;
    const asked = {
      global: values[0] ? values[1] : undefined,
      state: values[2] ? values[3] : undefined,
    };
    /* The handler's own first push: not one its script made as it went on. */
    const handlers = [0, 1, 2, 3].filter((k) => k < values[4] && values[9 + k] === 0);
    const pushedFirst = handlers.length ? values[5 + handlers[0]] : undefined;
    /* Its script, popped, may push and draw before the handler does: the
     * trace keeps each draw of C's `rand` in the tick, the seed before it and
     * whether script code (seg40, seg41) drew it, so its draws begin at the
     * first the script did not draw -- and after the script's last push, as a
     * push may draw for itself, not called from script code, and the seed
     * after each push is kept. Older traces keep only the seed after each
     * push, and where the script's pushes before its own drew, where its
     * draws begin is not known. */
    /* The cues its handler asked of `IsCued` that it was given. */
    const cues =
      values.length > 121
        ? [0, 1, 2, 3]
            .filter((k) => k < values[113] && values[115 + 2 * k] === 1)
            .map((k) => values[114 + 2 * k])
        : undefined;
    const draws = values.length > 77 ? values[76] : undefined;
    const scripted = [0, 1, 2, 3].filter(
      (k) => k < Math.min(values[4], handlers.length ? handlers[0] : 4)
    );
    /* The draws kept: the first 16 in place, and in newer traces the 17th to
     * 48th at the line's end. */
    const kept = values.length >= 135 + 64 ? 48 : 16;
    const drawn = [...Array(Math.min(draws ?? 0, kept)).keys()];
    const drawnSeed = (k: number) => (k < 16 ? values[77 + 2 * k] : values[135 + 2 * (k - 16)]);
    const drawnByScript = (k: number) => (k < 16 ? values[78 + 2 * k] : values[136 + 2 * (k - 16)]);
    const lastScripted = scripted.length
      ? values[68 + 2 * scripted[scripted.length - 1]]
      : undefined;
    const from =
      lastScripted === undefined
        ? 0
        : (drawn.find((k) => drawnSeed(k) === lastScripted) ?? drawn.length);
    const own = drawn.find((k) => k >= from && drawnByScript(k) === 0);
    const unseeded =
      draws === undefined
        ? values.length > 69 && scripted.some((k) => values[68 + 2 * k] !== seedValue)
        : own === undefined && draws > kept;
    const startSeed = own === undefined ? seedValue : drawnSeed(own);
    const acted =
      asked.global !== undefined || asked.state !== undefined || pushedFirst !== undefined;

    if (!acted || leave) {
      continue;
    }

    /* Entered: only these are reimplemented so -- leaping (3, 4, 8),
     * readying a walk (22), grooming (31), sharpening its claws (32),
     * aligning to a target (24), sniffing catnip (42), beginning to be petted
     * (49) and going after the bottle (46), which do their work at once,
     * suckling (45), grabbing the bottle (48), after petting (52), licking the
     * cursor (54), fear's first actions (58, 59, 60) and snubbing (80). */
    if (enter && !ENTERED.has(state)) {
      counts[1]++;
      continue;
    }

    counts[1]++;

    if (unseeded) {
      unknown++;
      continue;
    }

    /* Swatting or stalking, nothing it plays with about: not held. */
    if ((state === 2 || state === 56 || state === 57) && b[91] === -1) {
      continue;
    }

    if (!FOLLOWED.has(state)) {
      continue;
    }

    const brains = b.slice(27, 39);
    const centres = b.slice(39, 51);

    /* The moment (21): its own fields, and `catzMomentTick`. */
    if (state === 21) {
      let seed = BigInt(startSeed);
      const random = (n: number) => {
        seed = (seed * 22695477n + 1n) & 0xffffffffn;
        return Number((seed >> 16n) & 0x7fffn) % n;
      };
      const ours = catzMomentTick(
        { brains, centres, state, global, target: 0, count: 0 },
        {
          looks: field(1),
          ticks: field(3),
          looksBeforeGoing: field(20),
          mode: field(5),
          idle: field(19),
          soundOwed: b[88],
          box: { left: b[83], top: b[84], right: b[85], bottom: b[86] },
          going: b[87] !== 0,
        },
        {
          shelf: inShelf(0xc),
          screenSaver: false,
          c4: b[82],
          x35d2: b[89],
          x3516: field(18),
          area3: area === 3,
          cursorAbout: b[90] !== 0,
          minded: field(2) !== 0,
          soundPlaying: b[81] > 0,
        },
        random
      );
      const changed = ours.state !== undefined || ours.global !== undefined;
      const stateHeld = ours.global === undefined;
      const globalHeld = ours.state === undefined;
      const said = [
        stateHeld ? ours.state : '',
        globalHeld ? ours.global : '',
        changed ? '' : ours.pushed,
      ].join(' ');
      const engine = [
        stateHeld ? asked.state : '',
        globalHeld ? asked.global : '',
        changed ? '' : pushedFirst,
      ].join(' ');
      counts[2]++;
      held++;

      if (said !== engine) {
        wrong.push(`seed ${seedValue} state 21 global ${global}: ${said} not ${engine}`);
      }

      continue;
    }
    const box = (at: number) => ({
      left: b[at],
      top: b[at + 1],
      right: b[at + 2],
      bottom: b[at + 3],
    });
    const said = (found: boolean) => {
      let seed = BigInt(startSeed);
      const random = (n: number) => {
        seed = (seed * 22695477n + 1n) & 0xffffffffn;
        return Number((seed >> 16n) & 0x7fffn) % n;
      };
      const ours = catzStateTick(
        state,
        { brains, centres, state, global, target: 0, count: 0 },
        {
          global,
          count: field(1),
          passed: field(2),
          ticks: field(3),
          x1500: field(4),
          mode: field(5),
          x35fc: field(6),
          x35a6: field(7),
          x35a2: field(8),
          x35ac: field(9),
          goal: { x: field(10), y: field(11) },
          x688: field(12),
          x35aa: field(13),
          x35a8: field(14),
          x35f4: field(15),
          x35ee: field(16),
          x35a4: field(17),
          curiosities: b.slice(51, 59),
          cursor: box(59),
          stage: box(63),
          size: { width: b[67], height: b[68] },
          /* Going after the bottle measures from where it is after its script
           * was popped, which may move it: where the trace has that, after its
           * handler, else as the tick began. */
          point:
            state === 46 && values[200] !== undefined
              ? { x: values[199], y: values[200] }
              : { x: b[69], y: b[70] },
          kin: box(71),
          rect: box(75),
          area1: area === 1,
          area3: area === 3,
          enter: enter === 1,
          inShelf: (kind) => (kind === field(7) ? b[109] !== 0 : inShelf(kind)),
          c4: b[82],
          found,
          swat: {
            /* As the handler had them, after its script was popped, where the trace has them. */
            facing: values[61] > 0 ? values[62] : b[91],
            dx: values[61] > 0 ? values[63] : b[92],
            dy: values[61] > 0 ? values[64] : b[93],
            miss: values[65] > 0 ? values[66] : b[98],
            missAgain: values[65] > 1 ? values[67] : undefined,
            /* Cued to strike, as it asked again where it swung after all, and what the strike asks. */
            again:
              values.length > 111 && values[61] > 1
                ? { facing: values[109], dx: values[110], dy: values[111] }
                : undefined,
            x3592: b[102],
            shelved: b[113] !== 0,
            shelfClosed: b[114] !== 0,
            x1d0: b[115],
            mouseRunning: b[99] === 1,
            side: b[100],
            zone: b[103],
            x3596: b[104],
          },
          layeredPlaying: b[81] > 0,
          prey: { x: b[96], y: b[97] },
          preyHeld: b[105] !== 0,
          x35b8: b[106],
          preyArea3: b[107] === 3,
          walkedToHeld: b[108] !== 0,
          walkedToAt: b[110] ? { x: b[111], y: b[112] } : undefined,
          /* Cued: as the trace has `IsCued` answer, or, in older traces, as
           * it turned its head, which only a cued swat or beg does. */
          cued:
            cues === undefined
              ? values[13] > 0
              : state === 56
                ? cues.includes(5) && b[101] === 1
                : cues.includes(6),
          cues,
          caught: b[116] !== 0,
          released: b[117] === undefined ? undefined : b[117] !== 0,
          x35b6: b[118],
          x35b4: b[260],
          buttons: b[263] === undefined ? undefined : { left: b[263], right: b[264] },
          mouseState: b[240],
          cursorAt: b[119] === undefined ? undefined : { x: b[119], y: b[120] },
          x35d4: b[121],
          ball7: b[160] === undefined ? undefined : { x: b[160], y: b[161] },
          x35c2: b[162] === undefined ? undefined : { x: b[162], y: b[163] },
          kept: b[164] === undefined ? undefined : box(164),
          kit:
            b[240] === undefined
              ? undefined
              : {
                  peekMode: b[229],
                  peeks: b[230],
                  wait: b[231],
                  basket: b[232],
                  baskets: b.slice(233, 238),
                  ca: b[238],
                  rootCount: b[239],
                  mouseState: b[240],
                  origin: b[266] === undefined ? undefined : { x: b[265], y: b[266] },
                },
          cursorAbout: b[90] !== 0,
          dream:
            b[258] === undefined
              ? undefined
              : {
                  phase: b[241],
                  kind: b[242],
                  x35d8: b[243],
                  cloudCome: b[244] !== 0,
                  at: { x: double(b.slice(246, 250)), y: double(b.slice(250, 254)) },
                  stage: box(254),
                  mouseX: b[258],
                  dogX: b[259],
                },
          bottle:
            b[168] === undefined || b[168] === -1
              ? undefined
              : {
                  held: b[168] !== 0,
                  x1da: b[169],
                  shelved: b[170] !== 0,
                  at: { x: b[171], y: b[172] },
                  /* As begging or chasing first asked, where the trace has it; else as the tick began. */
                  near: values[131] > 0 ? values[132] !== 0 : b[173] !== 0,
                  mouth: values[133] > 0 ? values[134] : b[174],
                  reach: b[176] ?? 0,
                },
          petting:
            b[122] === undefined
              ? undefined
              : {
                  rate: b[122],
                  x3570: b[123],
                  x3572: b[124],
                  x3576: b[125],
                  cursorWas: { x: b[126], y: b[127] },
                  x362a: b[128],
                  x356c: b[129],
                  modes: b.slice(130, 160),
                  ball: values[124] > 0 ? values[125] : -1,
                  stopped: values[126] > 0 ? values[127] !== 0 : undefined,
                  movement: values[128] > 0 ? values[129] : undefined,
                  pose: values[128] > 0 && values.length > 130 ? values[130] : undefined,
                },
          x35d2: b[89],
        },
        random
      );
      const changed = ours.state !== undefined || ours.global !== undefined;

      /* Where the engine's way reads what it never set, nothing is held. */
      if (ours.unread) {
        return null;
      }

      /* A state the cat is put in is entered at once, and its entering may
       * ask for another -- a global state's for one of the cat's own, the
       * cat's own for a global state: that is not this tick's. Nor is an
       * action pushed where the state changed, nor a first arrival's
       * transition to a neutral pose, which is by the cat's pose. */
      /* Entered, a pounce pops its script at once: its pushes are held, not
       * whether that script is done and it goes on. */
      const pushesOnly = enter && ENTERED_PUSHES.has(state) && !changed;
      const stateHeld = ours.global === undefined && !pushesOnly;
      const globalHeld = ours.state === undefined && !pushesOnly;
      const pushHeld = !changed && !(state === 23 && ours.pushes === undefined);
      return [
        [
          stateHeld ? ours.state : '',
          globalHeld ? ours.global : '',
          pushHeld ? ours.pushed : '',
        ].join(' '),
        [
          stateHeld ? asked.state : '',
          globalHeld ? asked.global : '',
          pushHeld ? pushedFirst : '',
        ].join(' '),
        ours,
      ] as const;
    };
    const ways = (state === 23 ? [said(false), said(true)] : [said(false)]).filter(
      (way) => way !== null
    );

    if (!ways.length) {
      unread++;
      continue;
    }

    counts[2]++;
    held++;

    const matched = ways.find(([ours, engine]) => ours === engine);

    if (!matched) {
      wrong.push(
        `seed ${seedValue} state ${state} global ${global}: ${ways.map(([ours, engine]) => `${ours} not ${engine}`).join(' or ')}`
      );
    }

    /* What it said it wrote, kept for the next tick of the same state. */
    const tick = matched?.[2];
    pending =
      tick && tick.state === undefined && tick.global === undefined && !leave
        ? { state, global, tick }
        : null;
    frames = 0;
  }

  return { held, unread, unknown, wrong, tally, books };
}
