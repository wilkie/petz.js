/**
 * Dogz's playpen in the harness (harness/dogzpen.c): DOGZDLL.DLL's own pet
 * module set up as DOGZ.WAD sets it up, around the oracle's dog, and run a
 * frame at a time on winbox.js's Rust engine, so a run is the same every
 * time.
 *
 * The game's parameters (`PetParams`) are what DOGZ.WAD itself filled in:
 * where they are not kept already (`oracle/build/harness/dogz-params.bin`),
 * the first test runs DOGZ.WAD from harness/dogzcap.c and keeps them.
 *
 * Each run is staged from a fresh copy of the oracle's install
 * (`oracle/build/drive-c/DOGZ.DOG`): Dogz writes its files back as it ends
 * (its trick table, `TRICKS.TDT`, among them), and a run that failed on an
 * older engine wrote it empty, which hangs the next in `DoIdle`.
 *
 * Needs winbox.js beside this repository with its `trace` example built
 * `--release` (from develop at or after d2e1c610), the drivers built, and the
 * oracle's install; skipped otherwise.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { idleEnd, idlePlan, Pet } from '../../src/behaviour/pet.ts';
import type { Rand } from '../../src/behaviour/random.ts';
import { parseNe } from '../../src/formats/ne.ts';
import type { Trick } from '../../src/formats/tricks.ts';

const ROOT = process.cwd();
const TRACE =
  process.env.WINBOX_TRACE ??
  join(ROOT, '..', 'winbox.js', 'target', 'release', 'examples', 'trace');
const WINDOWS_256 = join(ROOT, '..', 'winbox.js', 'oracle', 'build', 'drive-c-vga256');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const DRIVE = join(ROOT, 'oracle', 'build', 'drive-c');
const PARAMS = join(HARNESS, 'dogz-params.bin');

/** The libraries Dogz loads from Windows' own directory, put beside the program. */
const LIBRARIES = [
  ['WINDOWS', 'DOGZDLL.DLL'],
  ['WINDOWS', 'GUARDDOG.DLL'],
  ['WINDOWS', 'SYSTEM', 'WING.DLL'],
  ['WINDOWS', 'SYSTEM', 'WINGDE.DLL'],
  ['WINDOWS', 'SYSTEM', 'WINGDIB.DRV'],
  ['WINDOWS', 'SYSTEM', 'WINGPAL.WND'],
];

/** CTL3DV2 must be in the system directory, or it says so and stops. */
const EXTRAS = [['WINDOWS', 'SYSTEM', 'CTL3DV2.DLL']];

const ready =
  existsSync(TRACE) &&
  existsSync(WINDOWS_256) &&
  existsSync(join(DRIVE, 'DOGZ.DOG', 'DOGZ.WAD')) &&
  existsSync(join(HARNESS, 'DOGZPEN.EXE')) &&
  existsSync(join(HARNESS, 'DOGZCAP.EXE'));

/** A drive with Dogz's folder fresh from the oracle at `C:\CORPUS\<folder>`, its libraries beside it, and a program of the harness's there. */
function stage(name: string, folder: string, program: string) {
  const drive = join(HARNESS, `drive-${name}`);
  rmSync(drive, { recursive: true, force: true });
  const at = join(drive, 'CORPUS', folder);
  mkdirSync(at, { recursive: true });
  cpSync(join(DRIVE, 'DOGZ.DOG'), at, { recursive: true });

  for (const parts of LIBRARIES) {
    cpSync(join(DRIVE, ...parts), join(at, parts[parts.length - 1]));
  }

  for (const parts of EXTRAS) {
    mkdirSync(join(drive, ...parts.slice(0, -1)), { recursive: true });
    cpSync(join(DRIVE, ...parts), join(drive, ...parts));
  }

  cpSync(join(HARNESS, program), join(at, program));
  return { drive, at };
}

/** A program of the harness's run on the Rust engine, until it ends Windows (`ExitWindows`). */
function run(drive: string, folder: string, program: string, seconds: number) {
  const result = spawnSync(
    TRACE,
    [
      join(drive, 'CORPUS', folder, program),
      '--drive',
      drive,
      '--path',
      `C:\\CORPUS\\${folder}\\${program}`,
      '--windows',
      WINDOWS_256,
      '--display',
      'vga256',
      '--seconds',
      String(seconds),
      '--budget',
      '1000000000000',
      '--summary',
    ],
    { encoding: 'latin1', maxBuffer: 1 << 26 }
  );
  const stopped = /stopped: (.*)/.exec(result.stdout ?? '')?.[1] ?? result.error?.message;

  expect(stopped).toMatch(/^Ended/);
}

const describeHarness = ready ? describe : describe.skip;

/** How many frames of the dog's day are followed: 300, or as `DOGZ_FRAMES` says. */
const FRAMES = Number(process.env.DOGZ_FRAMES ?? 300);

/** The first trick state (`eTrickBegging`, 0x2b), and idle (`eIdle`). */
const FIRST_TRICK = 0x2b;
const IDLE = 4;

/** A trick's record from its 12 words, as `TRICKS.TDT` lays it out (src/formats/tricks.ts). */
function trickOf(words: number[]): Trick {
  const [excitement, excitementRange, idleWeight, playWeight, facing, withBall, grabAfter] = words;
  const [sickness, ham, groom, bark, unknown] = words.slice(7);
  return {
    excitement,
    excitementRange,
    idleWeight,
    playWeight,
    facing,
    withBall,
    grabAfter,
    sickness,
    ham,
    groom,
    bark,
    unknown,
  };
}

/** One frame of a trace: as it began, its changes of state, and its draws. */
interface Frame {
  tick: number[];
  changes: { from: number; to: number; draws: number }[];
  drawn: { seed: number; segment: number | undefined; offset: number }[];
  frame: number[];
}

/** A trace's lines read: its trick table, its frames, and each draw's segment by its selector. */
function readTrace(lines: string[]) {
  const dll = parseNe(new Uint8Array(readFileSync(join(DRIVE, 'WINDOWS', 'DOGZDLL.DLL'))));
  const segments = new Map<number, number>();
  const tricks: Trick[] = [];
  const frames: Frame[] = [];
  let open: Frame | undefined;

  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');

    if (kind === 'segments') {
      for (const pair of rest) {
        const [ordinal, selector] = pair.split(':').map(Number);
        const entry = dll.entries.find((each) => each.ordinal === ordinal);

        if (entry) {
          segments.set(selector, entry.segment);
        }
      }
    }

    const values = rest.map(Number);

    if (kind === 'trick') {
      tricks[values[0]] = trickOf(values.slice(1));
    } else if (kind === 'tick') {
      open = { tick: values, changes: [], drawn: [], frame: [] };
      frames.push(open);
    } else if (kind === 'newstate' && open) {
      open.changes.push({ from: values[0], to: values[1], draws: values[2] });
    } else if (kind === 'frame' && open) {
      open.frame = values;
    } else if (kind === 'drawn' && open) {
      open.drawn.push({ seed: values[1], segment: segments.get(values[2]), offset: values[3] });
    }
  }

  return { tricks, frames };
}

/** C's `rand` from a seed, and the seed it has reached. */
function randFrom(seed: number) {
  const state = { seed };
  const rand: Rand = () => {
    state.seed = (Math.imul(state.seed, 0x15a4e35) + 1) >>> 0;
    return (state.seed >>> 16) & 0x7fff;
  };
  return { rand, state };
}

/**
 * Each trick an idle dog chose (`DoIdle`, seg16:0724: idle, 4, to a trick)
 * against `Pet.pickIdleTrick`, from the draw its loop began with -- the
 * frame's first returning to seg16:0729 -- with the engine's trick table
 * and the dog's factors as the frame began: the trick, and C's `rand` seed
 * as `NewState` is called (before the frame's next draw, or at its end).
 */
/**
 * Each idle plan the dog made (`SetupIdle`, seg16:0104 to 02ce: its draws,
 * one after another) against `idlePlan`, from the first of them with its
 * excitement as the frame began: as many draws, to the same seed. And each
 * end of a plan (`DoIdle`, the draw returning to seg16:05f0) against
 * `idleEnd`: the state it goes to next.
 */
function followIdlePlans(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { plans: 0, ends: 0, held: 0, wrong: [] as string[] };
  const excitementOf = (tick: number[]) => Math.min(100, Math.max(1, tick[4]));

  for (const { tick, changes, drawn, frame } of frames) {
    const inPlan = (k: number) =>
      drawn[k]?.segment === 16 && drawn[k].offset >= 0x104 && drawn[k].offset < 0x2ce;

    for (let k = 0; k < drawn.length; k++) {
      if (inPlan(k) && !inPlan(k - 1)) {
        let end = k;

        while (inPlan(end)) {
          end++;
        }

        result.plans++;
        const { rand, state } = randFrom(drawn[k].seed);
        let used = 0;
        idlePlan(excitementOf(tick), () => (used++, rand()));
        const seedThen = end < drawn.length ? drawn[end].seed : frame[3];

        if (state.seed === seedThen && used === end - k) {
          result.held++;
        } else {
          result.wrong.push(`frame ${tick[0]}: plan of ${used} draws, not ${end - k}`);
        }
      }

      if (drawn[k].segment === 16 && drawn[k].offset === 0x5f0) {
        result.ends++;
        const { rand } = randFrom(drawn[k].seed);
        const ours = idleEnd(excitementOf(tick), rand);
        const theirs = changes.find((change) => change.draws > k && change.from === IDLE)?.to;

        if (ours === theirs) {
          result.held++;
        } else {
          result.wrong.push(`frame ${tick[0]}: plan done, ${ours} not ${theirs}`);
        }
      }
    }
  }

  return result;
}

function followIdleTricks(lines: string[]) {
  const { tricks, frames } = readTrace(lines);
  const result = { chosen: 0, held: 0, wrong: [] as string[] };

  for (const { tick, changes, drawn, frame } of frames) {
    for (const change of changes) {
      if (change.from !== IDLE || change.to < FIRST_TRICK) {
        continue;
      }

      result.chosen++;
      const start = drawn.findIndex(({ segment, offset }) => segment === 16 && offset === 0x729);
      const { rand, state } = randFrom(start < 0 ? 0 : drawn[start].seed);
      const pet = new Pet(
        {
          scripts: [],
          table: [],
          positionKinds: [],
          tricks,
          trickDefaults: tricks,
          trickScripts: [],
          engineScripts: {} as never,
          flags: () => 3,
        },
        {} as never,
        rand,
        Array.from({ length: 10 }, () => ({ centre: 50, spread: 0 })),
        5
      );
      (pet as unknown as { factors: number[] }).factors = tick.slice(4, 15);
      state.seed = drawn[start]?.seed ?? 0;

      const ours = pet.pickIdleTrick() + FIRST_TRICK;
      /* (Past the draws kept, only the trick is known.) */
      const kept = frame[4] <= drawn.length;
      const seedThen = change.draws < drawn.length ? drawn[change.draws].seed : frame[3];

      if (start >= 0 && ours === change.to && (state.seed === seedThen || !kept)) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: ${ours} not ${change.to}, seed ${state.seed} not ${seedThen} (from draw ${start} of ${drawn.length})`
        );
      }
    }
  }

  return result;
}

describeHarness('Dogz’s playpen, held to DOGZDLL.DLL', () => {
  it('keeps the parameters DOGZ.WAD fills in, where they are not kept', () => {
    if (existsSync(PARAMS)) {
      return;
    }

    /* (Beside DOGZ.WAD, which it runs by its name.) */
    const { drive, at } = stage('dogzcap', 'DOGZ', 'DOGZCAP.EXE');
    run(drive, 'DOGZ', 'DOGZCAP.EXE', 600);
    expect(readFileSync(join(at, 'DOGZCAP.OUT'), 'latin1')).toMatch(/^made /m);

    const params = readFileSync(join(at, 'PARAMS.BIN'));
    expect(params.length).toBe(0x680);
    writeFileSync(PARAMS, params);
  }, 1800000);

  it('runs a dog in its playpen: it moves on from walking, its states and draws its own', () => {
    const kept = join(HARNESS, `DOGZPEN-${FRAMES}.OUT`);

    /* `HARNESS_REUSE=1`: the run kept last, without the engine. */
    if (!(process.env.HARNESS_REUSE === '1' && existsSync(kept))) {
      const { drive, at } = stage('dogzpen', 'DOGZPEN', 'DOGZPEN.EXE');
      cpSync(PARAMS, join(at, 'PARAMS.BIN'));
      writeFileSync(join(at, 'FRAMES.TXT'), `${FRAMES}\r\n`);
      run(drive, 'DOGZPEN', 'DOGZPEN.EXE', 900 * Math.ceil(FRAMES / 300));
      cpSync(join(drive, 'DOGZPEN.OUT'), kept);
    }

    const lines = readFileSync(kept, 'latin1').split('\r\n');
    /* `InitPetModule` answered 0. */
    expect(lines.some((line) => line.startsWith('made module 0 '))).toBe(true);

    const frames = lines
      .filter((line) => line.startsWith('frame '))
      .map((line) => line.split(' ').slice(1).map(Number));
    expect(frames).toHaveLength(FRAMES);

    const states = new Set(frames.map(([, state]) => state));
    const seeds = new Set(frames.map(([, , , seed]) => seed));
    console.log(`states met: ${[...states].join(', ')}; ${seeds.size} seeds`);

    /* Out of its kennel it walks (7, `eLocomote`), and goes on to others. */
    expect(frames[0][1]).toBe(7);
    expect(states.size).toBeGreaterThan(1);
    expect(seeds.size).toBeGreaterThan(1);

    /* Each idle trick it chose, as the reimplementation chooses it. */
    const idle = followIdleTricks(lines);
    console.log(`idle tricks: ${idle.chosen} chosen, ${idle.held} held`);
    expect(idle.wrong).toEqual([]);
    expect(idle.held).toBeGreaterThan(0);

    const plans = followIdlePlans(lines);
    console.log(`idle plans: ${plans.plans} made, ${plans.ends} done, ${plans.held} held`);
    expect(plans.wrong).toEqual([]);
  }, 1800000);
});
