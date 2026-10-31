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
import { catzCuriosities, catzStateTick } from '../../src/behaviour/catz-states.ts';
import {
  catzMomentBegin,
  catzMomentChoice,
  catzMomentCursor,
  catzMomentLinger,
  type CatzMomentState,
  catzMomentTick,
} from '../../src/behaviour/catz-moment.ts';

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

/** `TRACE_EAT=1`: on every tenth tick of prestalking, looking at things, its moment, walking or grooming, the cat put in turn to sniff a mouse hole or to align to eat the fish, from the water bowl or from the food bowl, a day of its own. */
const TRACE_EAT = process.env.TRACE_EAT === '1';

/** `TRACE_FEAR=1`: on every tenth tick of looking at things, passing the time, its moment, walking or grooming, the cat put in global state 17, scared, a day of its own. */
const TRACE_FEAR = process.env.TRACE_FEAR === '1';

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
      `CATZTRACE${TRACE_CUES ? '-CUES' : ''}${TRACE_POUNCE ? '-POUNCE' : ''}${TRACE_EAT ? '-EAT' : ''}${TRACE_FEAR ? '-FEAR' : ''}${TRACE_FRAMES === 2000 ? '' : `-${TRACE_FRAMES}`}.OUT`
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
        `${TRACE_FRAMES}\r\n${(TRACE_CUES ? 1 : 0) | (TRACE_POUNCE ? 2 : 0) | (TRACE_EAT ? 4 : 0) | (TRACE_FEAR ? 8 : 0)}\r\n`
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
    const { held, unread, unknown, wrong, tally } = followTrace(lines, (kind) =>
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
  }, 28800000);
});

/** The states of its own `catzStateTick` reimplements, a tick of each held where the engine acted in it. */
const FOLLOWED = new Set([
  1, 2, 3, 5, 6, 7, 12, 13, 19, 21, 22, 23, 26, 27, 28, 29, 30, 32, 34, 35, 56, 57, 8, 9, 10, 11,
  38, 39, 40, 41, 31, 80, 4, 58, 59, 60, 61, 62,
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

  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');
    const values = rest.map(Number);

    if (kind === 'tick') {
      before = values;
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
    const drawn = [...Array(Math.min(draws ?? 0, 16)).keys()];
    const lastScripted = scripted.length
      ? values[68 + 2 * scripted[scripted.length - 1]]
      : undefined;
    const from =
      lastScripted === undefined
        ? 0
        : (drawn.find((k) => values[77 + 2 * k] === lastScripted) ?? drawn.length);
    const own = drawn.find((k) => k >= from && values[78 + 2 * k] === 0);
    const unseeded =
      draws === undefined
        ? values.length > 69 && scripted.some((k) => values[68 + 2 * k] !== seedValue)
        : own === undefined && draws > 16;
    const startSeed = own === undefined ? seedValue : values[77 + 2 * own];
    const acted =
      asked.global !== undefined || asked.state !== undefined || pushedFirst !== undefined;

    if (!acted || leave) {
      continue;
    }

    /* Entered: only pouncing (3), readying a walk (22) and sharpening its
     * claws (32) are reimplemented so. */
    if (enter && ![3, 4, 8, 22, 31, 32, 58, 59, 60, 80].includes(state)) {
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
          point: { x: b[69], y: b[70] },
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
          cursorAt: b[119] === undefined ? undefined : { x: b[119], y: b[120] },
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
      const pushesOnly = enter && [3, 4, 8, 31, 58, 59, 60, 80].includes(state) && !changed;
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
      ];
    };
    const ways = (state === 23 ? [said(false), said(true)] : [said(false)]).filter(
      (way): way is string[] => way !== null
    );

    if (!ways.length) {
      unread++;
      continue;
    }

    counts[2]++;
    held++;

    if (!ways.some(([ours, engine]) => ours === engine)) {
      wrong.push(
        `seed ${seedValue} state ${state} global ${global}: ${ways.map(([ours, engine]) => `${ours} not ${engine}`).join(' or ')}`
      );
    }
  }

  return { held, unread, unknown, wrong, tally };
}
