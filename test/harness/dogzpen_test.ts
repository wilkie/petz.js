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

import {
  begWaitLoops,
  bowlPlan,
  fillBowl,
  idleEnd,
  idlePlan,
  keepsWalking,
  Pet,
  pickGait,
  pettingEyes,
  pickPetSpot,
  pickPlayTrick,
  rollsOver,
  pickTarget,
  sleepPlan,
  stepHand,
  trickRepeats,
  waitLook,
} from '../../src/behaviour/pet.ts';
import type { Rand } from '../../src/behaviour/random.ts';
import { ballRect, ballsBox, rollBall, Stage } from '../../src/behaviour/stage.ts';
import type { Step } from '../../src/behaviour/timeline.ts';
import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { parseLnz } from '../../src/formats/lnz.ts';
import { extendFrames } from '../../src/render/extend.ts';
import { project, scalesForAge } from '../../src/render/project.ts';
import { readEngineScripts, readTrickScripts } from '../../src/formats/engine.ts';
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

/** `DOGZ_PLAN_DONE=1`: while the dog is idle, its plan taken to its end, so each end of its queue decides between sleep and walking. */
const PLAN_DONE = process.env.DOGZ_PLAN_DONE === '1';

/** `DOGZ_CALM=1`: the dog's excitement put at 20 as its day begins (`SetExcitement`). */
const CALM = process.env.DOGZ_CALM === '1';

/** `DOGZ_WAKE=1`: while the dog sleeps, its plan of sleep taken to its end, so it wakes as its script ends. */
const WAKE = process.env.DOGZ_WAKE === '1';

/** `DOGZ_PET=1`: from the 100th frame to the 700th, the button held and the cursor moved back and forth over the middle of the dog. */
const PET = process.env.DOGZ_PET === '1';

/** `DOGZ_TREAT=1`: the blue treat taken out of the toy box at frame 100, held over the pen to frame 400, and let go lower down. */
const TREAT = process.env.DOGZ_TREAT === '1';

/** `DOGZ_FOOD=1`: the bowl of food taken out of the toy box at frame 100 and put down at once. */
const FOOD = process.env.DOGZ_FOOD === '1';

/** `DOGZ_BALL=1`: the ball taken out of the toy box at frame 100, held over the pen, and thrown at frame 300. */
const BALL = process.env.DOGZ_BALL === '1';

/** The switches asked, as `FRAMES.TXT`'s second number, and the trace's name. */
const FORCING =
  (PLAN_DONE ? 1 : 0) |
  (CALM ? 2 : 0) |
  (WAKE ? 4 : 0) |
  (PET ? 8 : 0) |
  (TREAT ? 16 : 0) |
  (FOOD ? 32 : 0) |
  (BALL ? 64 : 0);
const NAME = `DOGZPEN${PLAN_DONE ? '-PLAN' : ''}${CALM ? '-CALM' : ''}${WAKE ? '-WAKE' : ''}${PET ? '-PET' : ''}${TREAT ? '-TREAT' : ''}${FOOD ? '-FOOD' : ''}${BALL ? '-BALL' : ''}-${FRAMES}`;

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
  stored: { sprite: number; script: number; draws: number }[];
  spots: { was: number; draws: number; spot?: number; strokes?: number; after?: number }[];
  gaits: { pace: number; overrides: number; draws: number; answer?: number; after?: number }[];
  targets: {
    distance: number;
    x: number;
    y: number;
    draws: number;
    to?: { x: number; y: number };
    after?: number;
  }[];
  drawn: { seed: number; segment: number | undefined; offset: number }[];
  frame: number[];
  /** The dog's sprite and state as the frame left it (`state`). */
  state?: number[];
  /** How its rectangle was moved in the frame (`moved`: how, the glue ball). */
  moved: number[][];
  /** Whether the dog held anything at any time in the frame (`grab` to `release`). */
  holding?: boolean;
  /** What it held all through the frame, by its slot (0 the mouth, 1 a paw), if it held one thing throughout. */
  heldSlot?: number;
  /** The ball as the frame began (`ball`): held, in the box, its rectangle. */
  ball?: number[];
  /** Whether the ball was stopped in the frame (`BallSprite::Stop`). */
  stopped?: boolean;
  /** What `IsBallGrabbable` answered in the frame, and the draws before each. */
  grabbable: { answer: number; draws: number }[];
}

/** A trace's lines read: its trick table, its frames, and each draw's segment by its selector. */
function readTrace(lines: string[]) {
  const dll = parseNe(new Uint8Array(readFileSync(join(DRIVE, 'WINDOWS', 'DOGZDLL.DLL'))));
  const segments = new Map<number, number>();
  const tricks: Trick[] = [];
  const frames: Frame[] = [];
  let open: Frame | undefined;

  let holds = 0;
  let slot: number | undefined;

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
      open = {
        holding: holds > 0,
        heldSlot: holds === 1 ? slot : undefined,
        tick: values,
        changes: [],
        stored: [],
        spots: [],
        moved: [],
        grabbable: [],
        gaits: [],
        targets: [],
        drawn: [],
        frame: [],
      };
      frames.push(open);
    } else if (kind === 'newstate' && open) {
      open.changes.push({ from: values[0], to: values[1], draws: values[2] });
    } else if (kind === 'spot' && open) {
      open.spots.push({ was: values[0], draws: values[1] });
    } else if (kind === 'spotted' && open) {
      const asked = open.spots[open.spots.length - 1];
      [asked.spot, asked.strokes, asked.after] = values;
    } else if (kind === 'gait' && open) {
      open.gaits.push({ pace: values[0], overrides: values[1], draws: values[2] });
    } else if (kind === 'gaited' && open) {
      const asked = open.gaits[open.gaits.length - 1];
      asked.answer = values[0];
      asked.after = values[1];
    } else if (kind === 'target' && open) {
      const [distance, x, y, draws] = values;
      open.targets.push({ distance, x, y, draws });
    } else if (kind === 'targeted' && open) {
      const asked = open.targets[open.targets.length - 1];
      asked.to = { x: values[0], y: values[1] };
      asked.after = values[2];
    } else if (kind === 'stored' && open) {
      open.stored.push({ sprite: values[0], script: values[1], draws: values[3] });
    } else if (kind === 'grab' && open) {
      holds++;
      slot = values[0];
      open.holding = true;
      open.heldSlot = undefined;
    } else if (kind === 'release' && open) {
      holds = Math.max(0, holds - 1);
      open.holding = true;
      open.heldSlot = undefined;
    } else if (kind === 'moved' && open) {
      open.moved.push(values);
    } else if (kind === 'state' && open) {
      open.state = values;
    } else if (kind === 'ballstop' && open) {
      open.stopped = true;
    } else if (kind === 'grabbable' && open) {
      open.grabbable.push({ answer: values[0], draws: values[1] });
    } else if (kind === 'ball' && open) {
      open.ball = values;
    } else if (kind === 'frame' && open) {
      open.frame = values;
    } else if (kind === 'drawn' && open) {
      open.drawn.push({ seed: values[1], segment: segments.get(values[2]), offset: values[3] });
    }
  }

  return { tricks, frames, dll };
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

/**
 * Each trick's script played again and again (`PushTrick`, the draw
 * returning to seg21:7849, for the tricks without a case of their own)
 * against `trickRepeats`, with the engine's table of the tricks' scripts
 * (`ds:0x216e`): as many pushes of it to the dog after the draw, in the
 * frame (the moves between, `PushTransitionToNeutralPos`, may draw).
 */
function followTrickRepeats(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const scripts = readTrickScripts(dll);
  const result = { tricks: 0, held: 0, wrong: [] as string[] };

  for (const { tick, changes, stored, drawn, frame } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 21 || offset !== 0x7849) {
        return;
      }

      /* The trick it is: the state last gone to, a trick; or, begging, where
       * the trick is pushed before the dog is put in it, the next. */
      const isTrick = (state: number) => state >= FIRST_TRICK && !!scripts[state - FIRST_TRICK];
      const before = [...changes].reverse().find((change) => change.draws <= k)?.to ?? tick[1];
      /* Or, anticipating the ball, where tricks are played without their
       * states, the trick whose script is pushed after the draw. */
      const pushed = stored.find((push) => push.sprite === frame[5] && push.draws > k)?.script;
      const byScript = scripts.findIndex((each) => each.script === pushed);
      const state = isTrick(before)
        ? before
        : (changes.find((change) => change.draws > k && isTrick(change.to))?.to ??
          (byScript < 0 ? undefined : byScript + FIRST_TRICK));

      if (state === undefined) {
        result.wrong.push(`frame ${tick[0]}: a trick's repeats drawn in state ${before}`);
        return;
      }

      const trick = scripts[state - FIRST_TRICK];
      const { rand } = randFrom(seed);
      const ours = trickRepeats(trick, rand);
      const theirs = stored.filter(
        (push) => push.sprite === frame[5] && push.draws > k && push.script === trick.script
      ).length;
      result.tricks++;

      if (ours === theirs) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: trick ${state} played ${ours} times, not ${theirs}`);
      }
    });
  }

  return result;
}

/**
 * Each point the dog was sent to walk to (`GetNewTarget`) against
 * `pickTarget`, from the first draw it made, with the stage (its left and
 * top 0, as the playpen's are) and where the dog was: the same point, and
 * as many draws.
 */
function followTargets(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { targets: 0, held: 0, wrong: [] as string[] };

  for (const { tick, targets, drawn, frame } of frames) {
    for (const { distance, x, y, draws, to, after } of targets) {
      if (!to || after === undefined || after > drawn.length) {
        continue;
      }

      result.targets++;
      const stage = { width: frame[8] - frame[6], height: frame[9] - frame[7] };
      const { rand } = randFrom(drawn[draws]?.seed ?? frame[3]);
      let used = 0;
      const ours = pickTarget(stage, { x, y }, distance, () => (used++, rand()));

      if (ours.x === to.x && ours.y === to.y && used === after - draws) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: (${ours.x}, ${ours.y}) in ${used} draws, not (${to.x}, ${to.y}) in ${after - draws}`
        );
      }
    }
  }

  return result;
}

/**
 * Each sleeping dog's plan (`PushSleepScripts`, seg16:1f61 to 20b6: its
 * draws, one after another) against `sleepPlan`, with the engine's own
 * kinds of sleep and breaks: as many draws, to the same seed.
 */
function followSleepPlans(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const { sleep, sleepBreaks } = readEngineScripts(dll);
  const result = { plans: 0, held: 0, wrong: [] as string[] };

  for (const { tick, drawn, frame } of frames) {
    const inPlan = (k: number) =>
      drawn[k]?.segment === 16 && drawn[k].offset >= 0x1f61 && drawn[k].offset < 0x20b6;

    for (let k = 0; k < drawn.length; k++) {
      if (!inPlan(k) || inPlan(k - 1)) {
        continue;
      }

      let end = k;

      while (inPlan(end)) {
        end++;
      }

      result.plans++;
      const { rand, state } = randFrom(drawn[k].seed);
      let used = 0;
      sleepPlan(sleep, sleepBreaks, () => (used++, rand()));
      const seedThen = end < drawn.length ? drawn[end].seed : frame[3];

      if (state.seed === seedThen && used === end - k) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: sleep plan of ${used} draws, not ${end - k}`);
      }
    }
  }

  return result;
}

/**
 * How the dog went (`PickLocomotionAction`) against `pickGait`, with the
 * engine's own walk, trot and run and the dog's excitement and ham as the
 * frame began: the same action in as many draws. And each arrival walking
 * (`DoLocomote`, the draw returning to seg16:1418) against `keepsWalking`:
 * on to a new target, or stopping (7 to 8).
 */
function followWalking(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const { locomotion } = readEngineScripts(dll);
  const result = { gaits: 0, arrivals: 0, held: 0, wrong: [] as string[] };
  const factor = (tick: number[], n: number) => Math.min(100, Math.max(1, tick[4 + n]));

  for (const { tick, changes, gaits, targets, drawn, frame } of frames) {
    for (const { pace, overrides, draws, answer, after } of gaits) {
      if (answer === undefined || after === undefined || after > drawn.length) {
        continue;
      }

      result.gaits++;
      const { rand } = randFrom(drawn[draws]?.seed ?? frame[3]);
      let used = 0;
      const ours = pickGait(
        factor(tick, 0),
        factor(tick, 5),
        locomotion,
        pace,
        overrides !== 0,
        () => (used++, rand())
      );

      if (ours === answer && used === after - draws) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: gait ${ours} in ${used} draws, not ${answer} in ${after - draws}`
        );
      }
    }

    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 16 || offset !== 0x1418) {
        return;
      }

      result.arrivals++;
      const ours = keepsWalking(factor(tick, 0), randFrom(seed).rand);
      const onward = targets.some((target) => target.draws === k + 1);
      const stopped = changes.some(
        (change) => change.draws === k + 1 && change.from === 7 && change.to === 8
      );

      if (onward !== stopped && ours === onward) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: walks on ${ours}, not ${onward} (stopped ${stopped})`);
      }
    });
  }

  return result;
}

/**
 * The petting hand (`DoPettingHandler`) against `stepHand`: each frame the
 * dog is petted from start to end, its state unchanged, the hand's frame,
 * count and step as the frame began stepped on -- from the draw returning
 * to seg17:025b, where it drew -- to what they are as it ends.
 */
function followHand(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { frames: 0, steps: 0, held: 0, wrong: [] as string[] };

  for (const { tick, changes, drawn, frame } of frames) {
    const before = tick.slice(16, 20);
    const after = frame.slice(14, 18);

    if (before[0] !== 1 || after[0] !== 1 || changes.length || before.length < 4) {
      continue;
    }

    result.frames++;
    const k = drawn.findIndex(({ segment, offset }) => segment === 17 && offset === 0x25b);
    let used = 0;
    const { rand } = randFrom(k < 0 ? 0 : drawn[k].seed);
    const ours = stepHand(
      { frame: before[1], countdown: before[2], step: before[3] },
      () => (used++, rand())
    );
    result.steps += used;

    if (
      ours.frame === after[1] &&
      ours.countdown === after[2] &&
      ours.step === after[3] &&
      used === (k < 0 ? 0 : 1)
    ) {
      result.held++;
    } else {
      result.wrong.push(
        `frame ${tick[0]}: ${ours.frame} ${ours.countdown} ${ours.step} not ${after.slice(1).join(' ')}`
      );
    }
  }

  return result;
}

/**
 * Each spot the dog wanted petting on (`PickNewPetSpot`) against
 * `pickPetSpot`, with the engine's table of spots (`ds:0x20d0`): the same
 * spot and strokes in as many draws.
 */
function followPetSpots(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const { petSpots } = readEngineScripts(dll);
  const result = { spots: 0, held: 0, wrong: [] as string[] };

  for (const { tick, spots, drawn, frame } of frames) {
    for (const { was, draws, spot, strokes, after } of spots) {
      if (spot === undefined || after === undefined || after > drawn.length) {
        continue;
      }

      result.spots++;
      const { rand } = randFrom(drawn[draws]?.seed ?? frame[3]);
      let used = 0;
      const ours = pickPetSpot(was, petSpots, () => (used++, rand()));

      if (ours.spot === spot && ours.strokes === strokes && used === after - draws) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: spot ${ours.spot} for ${ours.strokes} in ${used}, not ${spot} for ${strokes} in ${after - draws}`
        );
      }
    }
  }

  return result;
}

/**
 * Each look before a pant, waiting to be petted (`DoWaitPetting`, the draw
 * returning to seg17:07f1), against `waitLook`: the next draw is its second
 * (returning to seg17:0825) just where it draws again.
 */
function followWaitLooks(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { looks: 0, held: 0, wrong: [] as string[] };

  for (const { tick, drawn } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 17 || offset !== 0x7f1) {
        return;
      }

      result.looks++;
      const { rand } = randFrom(seed);
      let used = 0;
      waitLook(() => (used++, rand()));
      const again = drawn[k + 1]?.segment === 17 && drawn[k + 1].offset === 0x825;

      if (again === (used === 2)) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: ${used} draws, the engine ${again ? 2 : 1}`);
      }
    });
  }

  return result;
}

/**
 * Each stroke on the head, body or hindquarters (`DoPettingGood`, the draw
 * returning to seg17:105b or 1124) against `rollsOver`, with how much the
 * dog had enjoyed the petting as the frame began: the wriggle on its back
 * drawn after it in the frame (returning to seg17:0fa9) just where it rolls
 * over.
 */
function followStrokes(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { strokes: 0, rolled: 0, held: 0, wrong: [] as string[] };

  for (const { tick, drawn } of frames) {
    const level = tick[20];

    if (level === undefined) {
      continue;
    }

    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 17 || (offset !== 0x105b && offset !== 0x1124)) {
        return;
      }

      result.strokes++;
      const ours = rollsOver(level, randFrom(seed).rand);
      /* (Its eyes put first, `PushPettingEyePos`, which may draw.) */
      const theirs = drawn
        .slice(k + 1)
        .some((draw) => draw.segment === 17 && draw.offset === 0xfa9);
      result.rolled += theirs ? 1 : 0;

      if (ours === theirs) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: rolls over ${ours}, not ${theirs}, at ${level}`);
      }
    });
  }

  return result;
}

/**
 * Where a petted dog's eyes went (`PushPettingEyePos`, its draws from the
 * one returning to seg17:1306) against `pettingEyes`: the draws where its
 * branch makes them -- 1318 for the blink alone; 134a for a look, and 13a1
 * and 13b3 for the random look's blink -- and the seed after.
 */
function followPettingEyes(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { eyes: 0, held: 0, wrong: [] as string[] };

  for (const { tick, drawn, frame } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 17 || offset !== 0x1306) {
        return;
      }

      result.eyes++;
      const { rand, state } = randFrom(seed);
      const ours = pettingEyes(rand);
      const sites =
        ours[0].blink !== undefined
          ? [0x1306, 0x1318]
          : ours[0].look === 'user'
            ? [0x1306, 0x134a]
            : ours.length === 2
              ? [0x1306, 0x134a, 0x13a1, 0x13b3]
              : [0x1306, 0x134a, 0x13a1];
      const theirs = drawn.slice(k, k + sites.length);
      const seedThen = k + sites.length < drawn.length ? drawn[k + sites.length].seed : frame[3];

      if (
        theirs.every((draw, n) => draw.segment === 17 && draw.offset === sites[n]) &&
        state.seed === seedThen
      ) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: ${JSON.stringify(ours)}, the engine ${theirs.map((draw) => draw.offset.toString(16)).join(' ')}`
        );
      }
    });
  }

  return result;
}

/**
 * Each wait after a trick (`PushBegWaitLoops`, its draws from the first --
 * returning to seg18:26a1 for a treat, 266b for the ball -- on, one after
 * another) against `begWaitLoops`, with the dog's excitement and whether
 * the ball was held as the frame began, given the engine's own values for
 * its draws (a move pushed between may draw, and is passed over): as many
 * draws.
 */
function followBegWaits(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { waits: 0, held: 0, wrong: [] as string[] };
  const inWait = (draw: { segment: number | undefined; offset: number } | undefined) =>
    draw?.segment === 18 && draw.offset >= 0x25e0 && draw.offset < 0x28f8;
  /* A move pushed between, which may draw (`PushTransitionToNeutralPos`). */
  const moving = (draw: { segment: number | undefined; offset: number } | undefined) =>
    draw?.segment === 7 && draw.offset === 0x40f1;

  for (const { tick, drawn, ball } of frames) {
    drawn.forEach(({ segment, offset }, k) => {
      /* The treat's way (seg18:26a1), or the ball's (seg18:266b): keener by 30 for a ball held. */
      const fetch = offset === 0x266b;

      if (segment !== 18 || (offset !== 0x26a1 && !fetch)) {
        return;
      }

      /* Its own draws, the engine's values, moves' draws between skipped. */
      const values: number[] = [];

      for (let n = k; inWait(drawn[n]) || moving(drawn[n]); n++) {
        if (inWait(drawn[n])) {
          values.push(randFrom(drawn[n].seed).rand());
        }
      }

      result.waits++;
      const excitement = Math.min(100, Math.max(1, tick[4]));
      let used = 0;
      [
        ...begWaitLoops(
          excitement,
          fetch ? excitement + (ball?.[0] ? 30 : 0) : undefined,
          false,
          () => (used < values.length ? values[used++] : (used++, -1))
        ),
      ];

      if (used === values.length) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: ${used} draws, not ${values.length}`);
      }
    });
  }

  return result;
}

/**
 * Each bowl of food filled as it is taken out (`FoodSprite::Update`, the
 * draw returning to seg20:0e3a) against `fillBowl`, and the dog's
 * mouthfuls from it (`DoEating`, its draws from the one returning to
 * seg18:18bf, one after another) against `bowlPlan`, for the servings the
 * last bowl filled was given: as many draws, to the same seed.
 */
function followBowls(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { filled: 0, eaten: 0, held: 0, wrong: [] as string[] };
  const inPlan = (draw: { segment: number | undefined; offset: number } | undefined) =>
    draw?.segment === 18 && draw.offset >= 0x18ba && draw.offset < 0x19d0;
  let servings: number | undefined;

  for (const { tick, drawn, frame } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment === 20 && offset === 0xe3a) {
        result.filled++;
        result.held++;
        servings = fillBowl(randFrom(seed).rand);
        return;
      }

      if (segment !== 18 || offset !== 0x18bf || servings === undefined) {
        return;
      }

      let end = k;

      while (inPlan(drawn[end])) {
        end++;
      }

      result.eaten++;
      const { rand, state } = randFrom(seed);
      let used = 0;
      [...bowlPlan(servings, () => (used++, rand()))];
      const seedThen = end < drawn.length ? drawn[end].seed : frame[3];

      if (used === end - k && state.seed === seedThen) {
        result.held++;
      } else {
        result.wrong.push(`frame ${tick[0]}: ${servings} servings, ${used} draws, not ${end - k}`);
      }
    });
  }

  return result;
}

/**
 * Each trick done for the ball (`PickTrickState`, its pairs of draws
 * returning to seg21:69b5 and 6a11) against `pickPlayTrick`, with the
 * engine's tricks and their play weights' sum as the day began, the ball
 * held or in the box as the frame began, and what `IsBallGrabbable`
 * answered: as many draws, to the same seed, and the same trick -- the
 * state the dog is put in next, or the trick whose script is pushed.
 */
function followPlayTricks(lines: string[]) {
  const { tricks, frames, dll } = readTrace(lines);
  const scripts = readTrickScripts(dll);
  const sum = tricks.reduce((total, trick) => total + trick.playWeight, 0);
  const result = { tricks: 0, held: 0, seen: 0, wrong: [] as string[] };
  const at = (draw: { segment: number | undefined; offset: number } | undefined, offset: number) =>
    draw?.segment === 21 && draw.offset === offset;

  for (const { tick, changes, stored, drawn, frame, ball, grabbable } of frames) {
    drawn.forEach(({ seed }, k) => {
      if (!at(drawn[k], 0x69b5) || at(drawn[k - 1], 0x6a11)) {
        return;
      }

      let end = k;

      while (at(drawn[end], 0x69b5) && at(drawn[end + 1], 0x6a11)) {
        end += 2;
      }

      result.tricks++;
      const { rand, state } = randFrom(seed);
      let used = 0;
      const answer = grabbable.find((each) => each.draws > k)?.answer ?? 0;
      const ours =
        FIRST_TRICK +
        pickPlayTrick(
          tricks,
          sum,
          { held: !!ball?.[0], out: !ball?.[1] },
          () => answer !== 0,
          () => (used++, rand())
        );
      const seedThen = end < drawn.length ? drawn[end].seed : frame[3];
      const pushed = stored.find((push) => push.sprite === frame[5] && push.draws >= end)?.script;
      /* (Not always shown within the frame: then only the draws are held.) */
      const byScript = scripts.findIndex((each) => each.script === pushed);
      const theirs =
        changes.find((change) => change.draws >= end && change.to >= FIRST_TRICK)?.to ??
        (byScript < 0 ? undefined : FIRST_TRICK + byScript);

      if (
        used === end - k &&
        state.seed === seedThen &&
        (theirs === undefined || ours === theirs)
      ) {
        result.held++;
        result.seen += theirs === undefined ? 0 : 1;
      } else {
        result.wrong.push(
          `frame ${tick[0]}: trick ${ours} in ${used} draws, not ${theirs} in ${end - k}`
        );
      }
    });
  }

  return result;
}

/** A float's bits, as the trace writes them, as a number. */
function floatOf(bits: number) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits >>> 0, true);
  return view.getFloat32(0, true);
}

/**
 * The ball rolling (`BallSprite::UpdateLocation`, seg20:2634) against
 * `rollBall`: each frame it begins out, not held and moving, its place
 * (its rectangle's top left, 15 and 14 in) and speed rolled a frame on the
 * stage, to what they are as the next frame begins -- the speed to the bit
 * -- unless it was stopped in the frame (`BallSprite::Stop`), caught.
 */
function followRoll(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { frames: 0, bounced: 0, held: 0, wrong: [] as string[] };

  frames.forEach(({ tick, ball, frame, stopped }, n) => {
    const next = frames[n + 1]?.ball;

    /* (Not where it was stopped in the frame: caught.) */
    if (!ball || !next || ball.length < 8 || ball[0] || ball[1] || next[0] || stopped) {
      return;
    }

    const ours = {
      x: ball[2] + 15,
      y: ball[3] + 14,
      vx: floatOf(ball[6]),
      vy: floatOf(ball[7]),
      held: false,
      slot: null,
      recorded: null,
    };

    if (ours.vx === 0 && ours.vy === 0) {
      return;
    }

    result.frames++;
    result.bounced += rollBall(ours, frame[8] - frame[6], frame[9] - frame[7]) ? 1 : 0;

    if (
      ours.x - 15 === next[2] &&
      ours.y - 14 === next[3] &&
      ours.vx === floatOf(next[6]) &&
      ours.vy === floatOf(next[7])
    ) {
      result.held++;
    } else if (result.wrong.length < 10) {
      result.wrong.push(
        `frame ${tick[0]}: (${ours.x - 15}, ${ours.y - 14}) at ${ours.vx}, ${ours.vy}; not (${next[2]}, ${next[3]}) at ${floatOf(next[6])}, ${floatOf(next[7])}`
      );
    }
  });

  return result;
}

/**
 * The rectangle each frame's balls take (`BallState` `+0x38` to `+0x3e`,
 * `Ballz::GetFrame`) against the model's: the frame, the breed's own
 * (`DATA\BIGDOG.LNZ`, its extensions), its age (its factor 10), and the
 * dog's rotation and angles as the frame left them, projected and boxed
 * (`ballsBox`) -- where the head is not turned nor the frame blended, whose
 * wobbles the trace does not keep.
 */
function followFrameBoxes(lines: string[]) {
  const { frames } = readTrace(lines);
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = extendFrames(
    header.animations.flatMap((_, n) => parseAnimation(header, n, read(`DATA/${n}.BDT`))),
    breed
  );
  const result = {
    frames: 0,
    turned: 0,
    mouthed: 0,
    holding: 0,
    held: 0,
    nearly: 0,
    wrong: [] as string[],
  };

  for (const { tick, state, holding, heldSlot } of frames) {
    if (!state || state.length < 25) {
      continue;
    }

    const [rotation, tilt, spin, roll, frame, turn, nod, , blend] = state.slice(9, 18);
    const theirs = state.slice(19, 23);

    if (turn || nod || blend !== 100) {
      result.turned++;
      continue;
    }

    /* Held all through the frame, the ball is boxed with it, by the ball of
     * the dog that holds it (chin 51, toe 45); taken up or let go in it, not
     * followed. Only the ball is so held in the harness's days. */
    if (holding && heldSlot === undefined) {
      result.mouthed++;
      continue;
    }

    result.frames++;
    const age = tick[14];
    const placed = project(
      breed,
      header,
      shapes[frame],
      scalesForAge(breed, age),
      rotation,
      100 - age,
      undefined,
      { tilt, spin, roll }
    );
    const box = ballsBox(
      placed,
      heldSlot === undefined ? undefined : ballRect(placed[[51, 45][heldSlot]])
    );
    result.holding += heldSlot === undefined ? 0 : 1;
    const ours = [box.left, box.top, box.right, box.bottom];

    const off = ours.map((edge, n) => Math.abs(edge - theirs[n]));

    if (off.every((by) => by === 0)) {
      result.held++;
    } else if (off.filter((by) => by > 0).length === 1 && Math.max(...off) === 1) {
      /* (One edge a pixel out: a far ball projected a pixel apart.) */
      result.nearly++;
    } else if (result.wrong.length < 10) {
      result.wrong.push(
        `frame ${tick[0]} (${frame}, turned ${rotation}): ${ours.join(' ')}, not ${theirs.join(' ')}`
      );
    }
  }

  return result;
}

/**
 * The dog placed from frame to frame (`PopScript`'s `MoveFrameRect` and
 * `MoveFrameRectBall`) against the model's `Stage.show`: each pair of
 * frames neither turned in the head nor blended, moved plainly or glued
 * (as the trace says, and by which ball), the earlier shown, then the later
 * with its glue -- the model's rectangle moved as the engine's was.
 */
function followPlacing(lines: string[]) {
  const { frames } = readTrace(lines);
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = header.animations.flatMap((_, n) =>
    parseAnimation(header, n, read(`DATA/${n}.BDT`))
  );
  const result = {
    plain: 0,
    glued: 0,
    held: 0,
    nearly: 0,
    holding: 0,
    sliding: 0,
    wrong: [] as string[],
  };
  const unturned = (state?: number[]) =>
    state && state.length >= 25 && !state[14] && !state[15] && state[17] === 100;

  frames.forEach(({ tick, state, moved, holding, heldSlot }, n) => {
    const before = frames[n - 1]?.state;

    /* (Not where it takes up or lets go: held throughout, the ball in its slot.) */
    const changing =
      (holding && heldSlot === undefined) ||
      (frames[n - 1]?.holding && frames[n - 1]?.heldSlot !== heldSlot);

    if (!unturned(state) || !unturned(before) || moved.length !== 1 || moved[0][0] > 1) {
      return;
    }

    if (changing) {
      result.holding++;
      return;
    }

    /* (Nor sliding, `8af4`: the slide is not yet followed.) */
    if (state!.length >= 31 && state![30]) {
      result.sliding++;
      return;
    }

    const glue = moved[0][0] === 1 ? moved[0][1] : undefined;
    const pose = (of: number[]) => ({
      rotation: of[9],
      angles: { tilt: of[10], spin: of[11], roll: of[12] },
      frame: of[13],
    });
    const was = pose(before!);
    const now = pose(state!);
    /* The model's dog put where the engine's was, then moved on, kept
     * touching the stage unless steering off it (`+0x2108`, `+0x2110`). */
    const stage = new Stage(292, 273, breed, header, shapes, tick[14]);

    if (heldSlot !== undefined) {
      stage.ball = { x: 0, y: 0, vx: 0, vy: 0, held: false, slot: heldSlot, recorded: null };
    }

    stage.show(
      { frame: was.frame } as Step,
      was.rotation,
      undefined,
      undefined,
      undefined,
      undefined,
      was.angles
    );
    const from = stage.rect();
    stage.nudge(before![0] - from.left, before![1] - from.top);
    const steering =
      state!.length >= 28 && state![25] ? { x: state![26], y: state![27] } : undefined;
    stage.show(
      { frame: now.frame, glue, steering } as Step,
      now.rotation,
      undefined,
      undefined,
      undefined,
      undefined,
      now.angles
    );
    const to = stage.rect();
    const ours = [to.left - before![0], to.top - before![1]];
    const theirs = [state![0] - before![0], state![1] - before![1]];

    if (glue === undefined) {
      result.plain++;
    } else {
      result.glued++;
    }

    const off = [
      Math.abs(Math.round(ours[0]) - theirs[0]),
      Math.abs(Math.round(ours[1]) - theirs[1]),
    ];

    if (off[0] === 0 && off[1] === 0) {
      result.held++;
    } else if (off[0] + off[1] === 1) {
      /* (A pixel out: where a far ball's projection is, as the boxes.) */
      result.nearly++;
    } else if (result.wrong.length < 10) {
      result.wrong.push(
        `frame ${tick[0]}: ${was.frame} to ${now.frame}${glue === undefined ? '' : ` glued by ${glue}`}, turned ${was.rotation} to ${now.rotation}: moved ${ours.join(', ')}, not ${theirs.join(', ')}`
      );
    }
  });

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
    const kept = join(HARNESS, `${NAME}.OUT`);

    /* `HARNESS_REUSE=1`: the run kept last, without the engine. */
    if (!(process.env.HARNESS_REUSE === '1' && existsSync(kept))) {
      const { drive, at } = stage('dogzpen', 'DOGZPEN', 'DOGZPEN.EXE');
      cpSync(PARAMS, join(at, 'PARAMS.BIN'));
      writeFileSync(join(at, 'FRAMES.TXT'), `${FRAMES} ${FORCING}\r\n`);
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

    const repeats = followTrickRepeats(lines);
    console.log(`trick repeats: ${repeats.tricks} drawn, ${repeats.held} held`);
    expect(repeats.wrong).toEqual([]);

    const targets = followTargets(lines);
    console.log(`targets: ${targets.targets} picked, ${targets.held} held`);
    expect(targets.wrong).toEqual([]);

    const sleeps = followSleepPlans(lines);
    console.log(`sleep plans: ${sleeps.plans} made, ${sleeps.held} held`);
    expect(sleeps.wrong).toEqual([]);

    const walking = followWalking(lines);
    console.log(
      `walking: ${walking.gaits} gaits, ${walking.arrivals} arrivals, ${walking.held} held`
    );
    expect(walking.wrong).toEqual([]);

    const hand = followHand(lines);
    console.log(`petting hand: ${hand.frames} frames, ${hand.steps} steps, ${hand.held} held`);
    expect(hand.wrong).toEqual([]);

    const spotted = followPetSpots(lines);
    console.log(`petting spots: ${spotted.spots} picked, ${spotted.held} held`);
    expect(spotted.wrong).toEqual([]);

    const looks = followWaitLooks(lines);
    console.log(`waiting looks: ${looks.looks} drawn, ${looks.held} held`);
    expect(looks.wrong).toEqual([]);

    const strokes = followStrokes(lines);
    console.log(
      `strokes: ${strokes.strokes} drawn, ${strokes.rolled} rolled over, ${strokes.held} held`
    );
    expect(strokes.wrong).toEqual([]);

    const eyes = followPettingEyes(lines);
    console.log(`petting eyes: ${eyes.eyes} put, ${eyes.held} held`);
    expect(eyes.wrong).toEqual([]);

    const waits = followBegWaits(lines);
    console.log(`begging waits: ${waits.waits} made, ${waits.held} held`);
    expect(waits.wrong).toEqual([]);

    const bowls = followBowls(lines);
    console.log(`bowls: ${bowls.filled} filled, ${bowls.eaten} eaten from, ${bowls.held} held`);
    expect(bowls.wrong).toEqual([]);

    const play = followPlayTricks(lines);
    console.log(
      `play tricks: ${play.tricks} chosen, ${play.held} held (${play.seen} of them seen done)`
    );
    expect(play.wrong).toEqual([]);

    const roll = followRoll(lines);
    console.log(`ball rolling: ${roll.frames} frames, ${roll.bounced} bounces, ${roll.held} held`);
    expect(roll.wrong).toEqual([]);

    const boxes = followFrameBoxes(lines);
    console.log(
      `frame boxes: ${boxes.frames} frames, ${boxes.held} held, ${boxes.nearly} a pixel out on one edge (${boxes.turned} with the head turned, ${boxes.mouthed} taking up or letting go, not followed; ${boxes.holding} with the ball held)`
    );
    expect(boxes.wrong).toEqual([]);

    const placing = followPlacing(lines);
    console.log(
      `placing: ${placing.plain} moved plainly, ${placing.glued} glued, ${placing.held} held, ${placing.nearly} a pixel out (${placing.holding} taking up or letting go, ${placing.sliding} sliding, not followed)`
    );
    expect(placing.wrong).toEqual([]);

    const plans = followIdlePlans(lines);
    console.log(`idle plans: ${plans.plans} made, ${plans.ends} done, ${plans.held} held`);
    expect(plans.wrong).toEqual([]);
  }, 1800000);
});
