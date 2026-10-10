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

/**
 * Cases of a tick of the cat's own state: a seed, the brains' values and
 * centres, the state, the global state, `+0x3502`, `+0x34ca`, `+0x3504`,
 * `+0x1500` and 8 curiosities. Of the first 342, the last 192 pass the time,
 * doze and sleep (with little energy, to stay so) and lie tired with each
 * temperament: liveliness, independence, seriousness and fear each low or
 * high. The 160 after look at things, with lists of curiosities of each
 * kind and none.
 */
const LOCAL_CASES = Array.from({ length: 502 }, (_, n) => {
  const looking = n >= 342;
  const tempered = n >= 150 && !looking;
  const state = looking
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

  const kinds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 0x17, 0x1b, 14, 20];
  const curiosities = Array.from({ length: 8 }, (_, k) =>
    looking && k < (n % 7) + 1 ? kinds[(n * 5 + k * 7) % kinds.length] : 0
  );

  return [
    (n * 1103515245 + 12345) % 2147483648,
    ...brains,
    ...Array.from({ length: 12 }, (_, b) => LEVELS[(n * 9 + b * 7) % LEVELS.length]),
    state,
    looking ? 6 : state === 26 && Math.floor(n / 20) % 2 ? 21 : 9,
    looking
      ? Math.floor(n / 7) % 4
      : tempered && state === 28
        ? 0
        : [0, 10, 25, 26, 40, 100, 101][n % 7],
    Math.floor(n / 10) % 2 && !tempered && !looking ? 1 : 0,
    looking && n % 5 === 0 ? 3 : 0,
    looking && n % 3 === 0 ? 0x5f : 0,
    ...curiosities,
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
    let localSeed = 0;
    let localArea = 0;
    let ticked = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);

      if (kind === 'local') {
        [localSeed, localArea] = values;
      } else if (kind === 'localed') {
        const c = LOCAL_CASES.find(([s]) => s === localSeed)!;
        const [state, global, count, passed, ticks, x1500] = c.slice(25);
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
            area3: localArea === 3,
            curiosities: c.slice(31),
            ticks,
            x1500,
          },
          random
        );
        const first = (history: number[]) => {
          const marked = history.indexOf(-2) < 0 ? 10 : history.indexOf(-2);
          return marked ? history[marked - 1] : undefined;
        };
        const [energy, theirCount] = values.slice(20);
        /* The actions pushed through the cat's slot `0xb8`, in turn: the
         * handler's first, then any its scripts went on to. (The engine's
         * own record of the last ten, `+0x14a8`, can be overrun in a tick.) */
        const pushes = values[35];
        /* And the global state asked for (the global machine's slot `0x1c`),
         * the first, none entered: the tick held to its own step. */
        const theirGlobal = values[33] ? values[34] : undefined;
        const [theirTicks, , layered] = values.slice(44);
        const [theirPassed, after, idle, looks, , x35a6, x35a4] = values.slice(47);
        const looking = state === 12;
        const changed = ours.state !== undefined || ours.global !== undefined;
        const said = [
          ours.state,
          ours.global,
          ours.energy,
          changed ? '' : ours.count,
          ours.pushed,
          ours.passed ?? passed,
          ours.moment && [
            ours.moment.after,
            ours.moment.idle,
            ours.moment.looksBeforeGoing,
            ours.moment.pushed,
          ],
          ours.x35a6 && [ours.x35a6, ours.x35a4],
          looking && [ours.ticks, ours.x35a4, Boolean(ours.sound)],
        ].join(' ');
        const theirs = [
          first(values.slice(0, 10)),
          /* A state entered may go on at once, as sleeping where it may not
           * sleep goes to idling: only this tick's own step is held. */
          ours.state === undefined ? theirGlobal : undefined,
          energy,
          changed ? '' : theirCount,
          changed ? undefined : pushes ? values[36] : undefined,
          state === 19 ? theirPassed : passed,
          ours.moment && [after, idle, looks, pushes ? values[36] : undefined],
          ours.x35a6 && [x35a6, x35a4],
          /* `+0x35a4` as the tick set it, where it did; else as the case before left it. */
          looking && [theirTicks, ours.x35a4 === undefined ? undefined : x35a4, layered > 0],
        ].join(' ');

        if (said !== theirs) {
          wrong.push(`local seed ${localSeed} state ${state}: ${said} not ${theirs}`);
        }

        ticked++;
      }
    }

    expect(ticked).toBe(LOCAL_CASES.length);

    /* And what the cat is curious about, given what the shelf holds. */
    const shelf = lines
      .find((line) => line.startsWith('shelf '))!
      .split(' ')
      .slice(1)
      .map(Number);
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
});
