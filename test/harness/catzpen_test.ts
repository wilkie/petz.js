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
import {
  catzMomentChoice,
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
    expect(wrong).toEqual([]);
  }, 1800000);
});
