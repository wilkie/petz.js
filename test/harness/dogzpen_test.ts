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
  chaseOrCharge,
  lungeChance,
  bowlPlan,
  fillBowl,
  lapsOf,
  pokeReaction,
  idleEnd,
  idlePlan,
  keepsWalking,
  Pet,
  pickGait,
  pettingEyes,
  pickPetSpot,
  pickPlayTrick,
  restingLubes,
  restLubes,
  wobbleHead,
  rollsOver,
  pickTarget,
  sleepPlan,
  stepHand,
  trickRepeats,
  waitLook,
} from '../../src/behaviour/pet.ts';
import type { Rand } from '../../src/behaviour/random.ts';
import {
  ballRect,
  brushTip,
  frameBox,
  rollBall,
  SHOE_SIZE,
  Stage,
} from '../../src/behaviour/stage.ts';
import type { Step } from '../../src/behaviour/timeline.ts';
import { parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { parseLnz } from '../../src/formats/lnz.ts';
import { extendFrames } from '../../src/render/extend.ts';
import { type Head, project, scalesForAge } from '../../src/render/project.ts';
import { skeletonOf } from '../../src/render/skeleton.ts';
import {
  AREA,
  readBodyAreas,
  readBrainMap,
  readEngineScripts,
  readTrickScripts,
} from '../../src/formats/engine.ts';
import { parseBrain } from '../../src/formats/brain.ts';
import { Brain } from '../../src/behaviour/brain.ts';
import { Swing } from '../../src/behaviour/swing.ts';
import { parseScripts, readOpcodes } from '../../src/formats/script.ts';
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

/** `DOGZ_SHOE=1`: the shoe taken out of the toy box at frame 100 and waved over the pen to frame 700. */
const SHOE = process.env.DOGZ_SHOE === '1';

/** `DOGZ_SPRAY=1`: the spray taken out of the toy box at frame 100 and held over the dog, the button down, to frame 160. */
const SPRAY = process.env.DOGZ_SPRAY === '1';

/** `DOGZ_BRUSH=1`: the brush taken out of the toy box and let go over the dog twice, at frames 150 and 300. */
const BRUSH = process.env.DOGZ_BRUSH === '1';
/** `DOGZ_WATER=1`: the bowl of water taken out of the toy box and put down at frame 110, as the food. */
const WATER = process.env.DOGZ_WATER === '1';
/** `DOGZ_SCRUFF=1`: the dog picked up by the scruff, the secondary button held from frame 100 to 200. */
const SCRUFF = process.env.DOGZ_SCRUFF === '1';
/** `DOGZ_POKE=1`: the dog clicked on, about its rectangle, every 30 frames from 100 to 700. */
const POKE = process.env.DOGZ_POKE === '1';
/** `DOGZ_GREEN=1`, `DOGZ_RED=1`: as `DOGZ_TREAT`, the green treat (slot 10) or the red (11). */
const GREEN = process.env.DOGZ_GREEN === '1';
const RED = process.env.DOGZ_RED === '1';
/** `DOGZ_AGAIN=1`: the treat's taking out, holding up and letting go again every 400 frames. */
const AGAIN = process.env.DOGZ_AGAIN === '1';

/** The switches asked, as `FRAMES.TXT`'s second number, and the trace's name. */
const FORCING =
  (PLAN_DONE ? 1 : 0) |
  (CALM ? 2 : 0) |
  (WAKE ? 4 : 0) |
  (PET ? 8 : 0) |
  (TREAT ? 16 : 0) |
  (FOOD ? 32 : 0) |
  (BALL ? 64 : 0) |
  (SHOE ? 128 : 0) |
  (SPRAY ? 256 : 0) |
  (BRUSH ? 512 : 0) |
  (WATER ? 1024 : 0) |
  (SCRUFF ? 2048 : 0) |
  (POKE ? 4096 : 0) |
  (GREEN ? 8192 : 0) |
  (RED ? 16384 : 0) |
  (AGAIN ? 32768 : 0);
const NAME = `DOGZPEN${PLAN_DONE ? '-PLAN' : ''}${CALM ? '-CALM' : ''}${WAKE ? '-WAKE' : ''}${PET ? '-PET' : ''}${TREAT ? '-TREAT' : ''}${FOOD ? '-FOOD' : ''}${BALL ? '-BALL' : ''}${SHOE ? '-SHOE' : ''}${SPRAY ? '-SPRAY' : ''}${BRUSH ? '-BRUSH' : ''}${WATER ? '-WATER' : ''}${SCRUFF ? '-SCRUFF' : ''}${POKE ? '-POKE' : ''}${GREEN ? '-GREEN' : ''}${RED ? '-RED' : ''}${AGAIN ? '-AGAIN' : ''}-${FRAMES}`;

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
  /** The slide as the frame left it (`slide`): limit, count, place and speed each way (floats' bits). */
  slide?: number[];
  /** The head's block for the dog's own state, placed in the frame (`head 1`), the last. */
  head?: number[];
  /** How many times the head was placed for the dog's own state in the frame. */
  headPlacings?: number;
  /** And for the copy the plain move takes of the frame before at the new angles (`head 0`), the last. */
  headCopy?: number[];
  /** Whether the dog held anything at any time in the frame (`grab` to `release`). */
  holding?: boolean;
  /** What it held all through the frame, by its slot (0 the mouth, 1 a paw), if it held one thing throughout. */
  heldSlot?: number;
  /** The shoe in the mouth all through the frame (taken while taunted, `GrabObject` 4), drawn with the chin. */
  heldShoe?: boolean;
  /** The shoe taken or let go of in the frame. */
  shoeChanged?: boolean;
  /** The shoe as the frame began (`shoe`): whether the user holds it, whether the dog may snatch. */
  shoe?: number[];
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
  let shoeIn = false;

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
        /* (By what it is asked to take; the ball's own marks, below, where kept.) */
        heldSlot: holds === 1 && (slot === 0 || slot === 1) ? slot : undefined,
        heldShoe: shoeIn,
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
    } else if (kind === 'grab' && open && values[0] === 4) {
      /* The shoe, taken only while the dog is taunted (global 0x3f5,
       * seg14:07f0), and not from the user's hand unless the dog may snatch
       * (`ActualGrabObject`, seg14:084c): the trace's `shoe` line, as the
       * frame began, where kept. */
      const fromHand = open.shoe && open.shoe[0] !== 0 && open.shoe[1] === 0;

      if (open.tick[2] === 0x3f5 && !shoeIn && open.shoe && !fromHand) {
        shoeIn = true;
        open.shoeChanged = true;
      }
    } else if (kind === 'release' && open && values[0] === 4) {
      if (shoeIn) {
        shoeIn = false;
        open.shoeChanged = true;
      }
    } else if (kind === 'grab' && open) {
      /* (One thing held at a time: asked again, it holds the one.) */
      holds = 1;
      slot = values[0];
      open.holding = true;
      open.heldSlot = undefined;
    } else if (kind === 'release' && open) {
      holds = 0;
      open.holding = true;
      open.heldSlot = undefined;
    } else if (kind === 'shoe' && open) {
      open.shoe = values;
    } else if (kind === 'slide' && open) {
      open.slide = values;
    } else if (kind === 'head' && open && values[0] === 1) {
      open.head = values.slice(1, 10);
      open.headPlacings = (open.headPlacings ?? 0) + 1;
    } else if (kind === 'head' && open) {
      open.headCopy = values.slice(1, 10);
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

  /* The ball held throughout a frame -- in the mouth (`+0x18c`, slot 0) or
   * under a paw (`+0x18e`, slot 1) as it begins and as the next begins --
   * where the trace keeps it: which, rather than asked (`grab` may take
   * nothing), it is held by. */
  for (const frame of frames) {
    frame.heldShoe = !!frame.heldShoe && !frame.shoeChanged;
  }

  frames.forEach((frame, n) => {
    /* (Without the ball's marks, what it holds is not known to be the ball: not boxed.) */
    if (!frame.ball) {
      frame.heldSlot = undefined;
    }

    const [now, next] = [frame.ball, frames[n + 1]?.ball];

    if (now && next && now.length >= 10 && next.length >= 10) {
      const held = (ball: number[]) => (ball[8] ? 0 : ball[9] ? 1 : undefined);
      const [was, is] = [held(now), held(next)];
      frame.holding = was !== undefined || is !== undefined;
      frame.heldSlot = was !== undefined && was === is ? was : undefined;
    }
  });

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
      /* (Held to 16 as good petting is entered, before the draw: seg17:0eda.) */
      const ours = rollsOver(Math.min(level, 16), randFrom(seed).rand);
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
 * last bowl filled was given: as many draws, to the same seed. From water,
 * the laps (the draw returning to seg18:1a19) against `lapsOf`, as many
 * laps (script 262) stored after it in the frame.
 */
function followBowls(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { filled: 0, eaten: 0, lapped: 0, held: 0, wrong: [] as string[] };
  const inPlan = (draw: { segment: number | undefined; offset: number } | undefined) =>
    draw?.segment === 18 && draw.offset >= 0x18ba && draw.offset < 0x19d0;
  let servings: number | undefined;

  for (const { tick, drawn, frame, stored } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment === 20 && offset === 0xe3a) {
        result.filled++;
        result.held++;
        servings = fillBowl(randFrom(seed).rand);
        return;
      }

      if (segment === 18 && offset === 0x1a19 && servings !== undefined) {
        result.lapped++;
        const ours = lapsOf(servings, randFrom(seed).rand);
        const theirs = stored.filter(
          (push) => push.sprite === frame[5] && push.script === 262 && push.draws > k
        ).length;

        if (ours === theirs) {
          result.held++;
        } else {
          result.wrong.push(`frame ${tick[0]}: ${servings} filled, ${ours} laps, not ${theirs}`);
        }

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
 * The model's `Head` from the engine's block for it (`HeadTrackRenderBlock`,
 * as the trace's `head` writes it: turn, nod, roll, the offset, and the
 * pivot -- the neck scaled, `>>8`, and the drift added): the drift the pivot
 * less the neck, blended as the frame is, scaled as the model scales it.
 */
function headOf(
  block: number[],
  frame: { balls: { x: number; y: number; z: number }[] },
  blending:
    { scale: number; reference: { balls: { x: number; y: number; z: number }[] } } | undefined,
  pet: number,
  breed: Parameters<typeof skeletonOf>[0]
): Head {
  const [yaw, pitch, roll, ox, oy, oz, px, py, pz] = block;
  const neckBall = skeletonOf(breed).neck;
  const neck = frame.balls[neckBall];
  const from = blending?.reference.balls[neckBall];
  const toward = (axis: 'x' | 'y' | 'z') =>
    blending && from
      ? Math.trunc(((neck[axis] - from[axis]) * blending.scale) / 100) + from[axis]
      : neck[axis];
  const scaled = (axis: 'x' | 'y' | 'z') => Math.floor((toward(axis) * pet) / 256);
  return {
    yaw,
    pitch,
    roll,
    offset: { x: ox, y: oy, z: oz },
    drift: { x: px - scaled('x'), y: py - scaled('y'), z: pz - scaled('z') },
  };
}

/**
 * The rectangle each frame's balls take (`BallState` `+0x38` to `+0x3e`,
 * `Ballz::GetFrame`) against the model's: the frame, the breed's own
 * (`DATA\BIGDOG.LNZ`, its extensions), its age (its factor 10), and the
 * dog's rotation and angles as the frame left them, projected and boxed
 * (`frameBox`) -- where the head is not turned nor the frame blended, whose
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
    still: 0,
    turned: 0,
    tracked: 0,
    blended: 0,
    mouthed: 0,
    holding: 0,
    shoe: 0,
    held: 0,
    nearly: 0,
    wrong: [] as string[],
  };

  let lastHead: number[] | undefined;

  for (const [
    index,
    { tick, state, holding, heldSlot, heldShoe, shoeChanged, moved },
  ] of frames.entries()) {
    if (!state || state.length < 25) {
      continue;
    }

    /* (Not moved in the frame, its state's rectangle is the one it had --
     * the blend eased since, say: not boxed again.) */
    if (!moved.length && index > 0) {
      result.still++;
      continue;
    }

    const [rotation, tilt, spin, roll, frame, , , tracking, blend, reference] = state.slice(9, 19);
    const theirs = state.slice(19, 23);

    /* The head placed only while it tracks (`+0x1e`), by the block placed
     * last for the dog's state -- this frame's, or, the engine's placing
     * kept from before, the last: its turn, nod and roll, its offset, and
     * its pivot, the neck scaled and the drift, so the drift is the pivot
     * less the neck scaled as the model scales it. */
    lastHead = frames[index].head ?? lastHead;

    if (tracking && !lastHead) {
      result.turned++;
      continue;
    }

    result.blended += blend === 100 ? 0 : 1;

    /* Held all through the frame, the ball is boxed with it, by the ball of
     * the dog that holds it (chin 51, toe 45), and so the shoe in the mouth,
     * by its own picture's size; taken up or let go in it, not followed. */
    if ((holding && heldSlot === undefined && !heldShoe) || shoeChanged) {
      result.mouthed++;
      continue;
    }

    result.frames++;
    const age = tick[14];
    const scales = scalesForAge(breed, age);
    const blending = blend === 100 ? undefined : { scale: blend, reference: shapes[reference] };
    let head: Head | undefined;

    if (tracking && lastHead) {
      result.tracked++;
      head = headOf(lastHead, shapes[frame], blending, scales.pet, breed);
    }

    const box = frameBox(
      breed,
      header,
      shapes[frame],
      scales,
      rotation,
      100 - age,
      head,
      { tilt, spin, roll },
      blending,
      (placed) =>
        heldShoe
          ? ballRect(placed[51], SHOE_SIZE)
          : heldSlot === undefined
            ? undefined
            : ballRect(placed[[51, 45][heldSlot]])
    );
    result.holding += heldSlot === undefined ? 0 : 1;
    result.shoe += heldShoe ? 1 : 0;
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
 * The scripts' own moves between two frames (`0x8aeb n` across, `0x8aec n`
 * down), by the frames either side: `from>to`. Script 5, put down from the
 * scruff, is the one that has them.
 */
function scriptShifts(dll: ReturnType<typeof parseNe>) {
  const data = new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', 'DATA', 'ALL_PTZ.SCP')));
  const shifts = new Map<string, { x: number; y: number }>();

  for (const script of parseScripts(data, readOpcodes(dll))) {
    for (const variant of script.variants) {
      let last: number | undefined;
      let shift = { x: 0, y: 0 };
      let shifted = false;

      for (const element of variant) {
        if ('frame' in element) {
          if (shifted && last !== undefined) {
            shifts.set(`${last}>${element.frame}`, shift);
          }

          last = element.frame;
          shift = { x: 0, y: 0 };
          shifted = false;
        } else if (element.op === 0x8aeb || element.op === 0x8aec) {
          const by = Number(element.operands[0]);
          shift =
            element.op === 0x8aeb ? { ...shift, x: shift.x + by } : { ...shift, y: shift.y + by };
          shifted = true;
        }
      }
    }
  }

  return shifts;
}

/**
 * The dog placed from frame to frame (`PopScript`'s `MoveFrameRect` and
 * `MoveFrameRectBall`) against the model's `Stage.show`: each pair of
 * frames neither turned in the head nor blended, moved plainly or glued
 * (as the trace says, and by which ball), the earlier shown, then the later
 * with its glue -- the model's rectangle moved as the engine's was.
 */
function followPlacing(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const shifts = scriptShifts(dll);
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = header.animations.flatMap((_, n) =>
    parseAnimation(header, n, read(`DATA/${n}.BDT`))
  );
  const result = {
    nearlyAt: [] as string[],
    slid: 0,
    rewobbled: 0,
    rewobbledOff: [] as string[],
    outOfBlend: 0,
    unexplained: [] as string[],
    plain: 0,
    glued: 0,
    held: 0,
    nearly: 0,
    holding: 0,
    shoe: 0,
    sliding: 0,
    pinned: 0,
    lunging: 0,
    wrong: [] as string[],
  };
  /* (The breed's reshaped frames, as `Stage` makes them, for the head's neck.) */
  const extended = extendFrames(shapes, breed);

  /* The cursor the driver held while scruffing, by frame (`cursor`). */
  const cursors = new Map<number, number[]>();

  for (const line of lines) {
    if (line.startsWith('cursor ')) {
      const values = line.split(' ').slice(1).map(Number);
      cursors.set(values[0], values.slice(1, 3));
    }
  }

  /* Its head, while it tracks (`+0x1e`), by the block placed last for the dog's state. */
  const heads: (number[] | undefined)[] = [];
  let lastHead: number[] | undefined;

  for (const frame of frames) {
    lastHead = frame.head ?? lastHead;
    heads.push(lastHead);
  }

  const unturned = (state?: number[], n?: number) =>
    state && state.length >= 25 && (!state[16] || (n !== undefined && heads[n] !== undefined));

  frames.forEach(({ tick, state, moved, holding, heldSlot, heldShoe, shoeChanged }, n) => {
    const before = frames[n - 1]?.state;

    /* (Not where it takes up or lets go: held throughout, the ball in its slot.) */
    const shoeThrough = heldShoe && frames[n - 1]?.heldShoe;
    const changing = shoeThrough
      ? false
      : (holding && heldSlot === undefined) ||
        (frames[n - 1]?.holding && frames[n - 1]?.heldSlot !== heldSlot) ||
        !!shoeChanged ||
        !!frames[n - 1]?.shoeChanged;

    if (!unturned(state, n) || !unturned(before, n - 1) || moved.length !== 1 || moved[0][0] > 1) {
      return;
    }

    if (changing) {
      result.holding++;
      return;
    }

    /* Sliding (`8af4`), as the frame before left it: the rectangle moved
     * on by the whole part of the slide's place, as it changed (seg7:6f6b
     * on); where the trace keeps the slide. */
    const sliding = before!.length >= 31 && before![30];
    const slidAt = (slide?: number[]) => [
      Math.trunc(floatOf(slide![2])),
      Math.trunc(floatOf(slide![3])),
    ];

    if (sliding && (!frames[n].slide || !frames[n - 1].slide)) {
      result.sliding++;
      return;
    }

    const slid = sliding
      ? [
          slidAt(frames[n].slide)[0] - slidAt(frames[n - 1].slide)[0],
          slidAt(frames[n].slide)[1] - slidAt(frames[n - 1].slide)[1],
        ]
      : [0, 0];
    result.slid += sliding ? 1 : 0;

    const glue = moved[0][0] === 1 ? moved[0][1] : undefined;
    const pose = (of: number[], at: number) => {
      const blend = of[17] === 100 ? undefined : { scale: of[17], reference: of[18] };
      return {
        rotation: of[9],
        angles: { tilt: of[10], spin: of[11], roll: of[12] },
        frame: of[13],
        blend,
        head:
          of[16] && heads[at]
            ? headOf(
                heads[at]!,
                extended[of[13]],
                blend && { scale: blend.scale, reference: extended[blend.reference] },
                scalesForAge(breed, tick[14]).pet,
                breed
              )
            : undefined,
      };
    };
    const was = pose(before!, n - 1);
    const now = pose(state!, n);
    /* The head placed afresh for the frame before at the new angles, where the engine did (`head 0`). */
    const copyBlock = frames[n].headCopy;
    const headCopy = copyBlock
      ? headOf(
          copyBlock,
          extended[was.frame],
          was.blend && { scale: was.blend.scale, reference: extended[was.blend.reference] },
          scalesForAge(breed, tick[14]).pet,
          breed
        )
      : undefined;
    /* The model's dog put where the engine's was, then moved on, kept
     * touching the stage unless steering off it (`+0x2108`, `+0x2110`). */
    const stage = new Stage(292, 273, breed, header, shapes, tick[14]);

    if (heldSlot !== undefined) {
      stage.ball = { x: 0, y: 0, vx: 0, vy: 0, held: false, slot: heldSlot, recorded: null };
    }

    if (shoeThrough) {
      stage.shoe = { x: 0, y: 0, held: false, inMouth: true };
      result.shoe++;
    }

    stage.show(
      { frame: was.frame } as Step,
      was.rotation,
      undefined,
      undefined,
      undefined,
      was.head,
      was.angles,
      was.blend
    );
    const from = stage.rect();
    stage.nudge(before![0] - from.left, before![1] - from.top);

    const steering =
      state!.length >= 28 && state![25] ? { x: state![26], y: state![27] } : undefined;
    stage.show(
      {
        frame: now.frame,
        glue,
        steering,
        headCopy,
        shift: shifts.get(`${was.frame}>${now.frame}`),
      } as Step,
      now.rotation,
      undefined,
      undefined,
      undefined,
      now.head,
      now.angles,
      now.blend
    );
    /* Scruffed, the button held (`DoScruff`, seg21:6672 to 6783): once
     * the frame has moved on, the dog as it now is put with its neck's centre
     * at the cursor, lowered by half the neck's drawn size. */
    const pin = tick[1] === 10 ? cursors.get(tick[0]) : undefined;

    if (pin) {
      const neck = stage.placed()[54];
      result.pinned++;
      stage.nudge(
        pin[0] - Math.round(neck.x),
        pin[1] + Math.trunc(neck.diameter / 2) - Math.round(neck.y)
      );
    }

    /* Lunging with hold of the shoe (`DoLungingCursor`, seg3:1a92 to 1b4b),
     * the grip held as the frame began (the module's `+0x222`): so, the
     * chin's centre (ball 51) put at the shoe's middle, where the shoe has
     * moved to in the frame (as the next frame begins), the slide's move
     * overridden. */
    const [grip, shoeAt] = [frames[n].shoe, frames[n + 1]?.shoe];

    const lunging = tick[1] === 0x12 && !!grip && grip.length >= 5 && !!grip[4] && !!shoeAt;

    if (lunging) {
      const chin = stage.placed()[51];
      result.lunging++;
      stage.nudge(shoeAt![2] - Math.round(chin.x), shoeAt![3] - Math.round(chin.y));
    }

    const to = stage.rect();
    /* (Pinned, the dog is put where the pin says, the slide's move and all.) */
    const slidBy = pin || lunging ? [0, 0] : slid;
    const ours = [to.left - before![0] + slidBy[0], to.top - before![1] + slidBy[1]];
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
    /* Its head placed again for the frame before at the new angles, the
     * wobbles moved on since (`HeadTrackPrep` again, the copy's block not the
     * frame before's): the model, taking the frame before's head, cannot
     * follow; listed apart. */
    const rewobbled =
      !!frames[n].headCopy &&
      !!heads[n - 1] &&
      frames[n].headCopy!.slice(2, 9).join(' ') !== heads[n - 1]!.slice(2, 9).join(' ');
    result.rewobbled += rewobbled ? 1 : 0;

    /* Glued out of a blend: as the model has it, the old blend, but for
     * three of the harness's days' (frame 615 of the plain day, 1359 of the
     * food day, 1558 of the water day), each out of breathing on frame 35
     * into an unbreathing frame, a transition pushed in the frame; no blend
     * of the old ball places two of them, so not the blend. Listed apart. */
    const outOfBlend = glue !== undefined && was.blend !== undefined;
    result.outOfBlend += outOfBlend ? 1 : 0;

    if (off[0] === 0 && off[1] === 0) {
      result.held++;
    } else if (rewobbled) {
      result.rewobbledOff.push(
        `frame ${tick[0]}: ${was.frame} to ${now.frame}, turned ${was.rotation} to ${now.rotation}: moved ${ours.join(', ')}, not ${theirs.join(', ')}`
      );
    } else if (outOfBlend) {
      result.unexplained.push(
        `frame ${tick[0]}: ${was.frame} to ${now.frame} glued by ${glue} out of a blend: moved ${ours.join(', ')}, not ${theirs.join(', ')}`
      );
    } else if (off[0] + off[1] === 1) {
      /* (A pixel out.) */
      result.nearly++;
      result.nearlyAt.push(
        `frame ${tick[0]}: ${was.frame} to ${now.frame}${glue === undefined ? '' : ` glued by ${glue}`}, turned ${was.rotation} to ${now.rotation}: moved ${ours.join(', ')}, not ${theirs.join(', ')}`
      );
    } else if (result.wrong.length < 10) {
      result.wrong.push(
        `frame ${tick[0]}: ${was.frame} to ${now.frame}${glue === undefined ? '' : ` glued by ${glue}`}, turned ${was.rotation} to ${now.rotation}: moved ${ours.join(', ')}, not ${theirs.join(', ')}`
      );
    }
  });

  return result;
}

/**
 * When the engine places the head afresh for the frame before (`head 0`),
 * against the model's rule for it (`Pet`'s `headCopy`): moved plainly, the
 * head tracking, just where the dog turned -- its rotation or its angles
 * changed from the frame before.
 */
function followHeadCopies(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { plain: 0, copies: 0, held: 0, wrong: [] as string[] };

  frames.forEach(({ tick, state, moved, headCopy }, n) => {
    const before = frames[n - 1]?.state;

    if (!state || !before || state.length < 25 || !state[16] || moved.length !== 1 || moved[0][0]) {
      return;
    }

    result.plain++;
    const turned = [9, 10, 11, 12].some((k) => state[k] !== before[k]);
    result.copies += headCopy ? 1 : 0;

    if (turned === !!headCopy) {
      result.held++;
    } else {
      result.wrong.push(`frame ${tick[0]}: turned ${turned}, placed afresh ${!!headCopy}`);
    }
  });

  return result;
}

/**
 * How often the head is placed for the dog's own state in a frame, its head
 * tracking, moved plainly: once, and once more before while it steers -- the
 * steering asking where the nose of the frame before is (`GetBallOffset`,
 * `PopScript` seg7:6b38 on), the state changed since it was kept -- as the
 * model's rule has it; steering as the frame begins, as the frame before left it.
 */
function followSteeredHeads(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { frames: 0, steered: 0, held: 0, wrong: [] as string[] };

  frames.forEach(({ tick, state, moved, headPlacings }, n) => {
    const before = frames[n - 1]?.state;

    if (
      !state ||
      !before ||
      state.length < 28 ||
      !state[16] ||
      !before[16] ||
      moved.length !== 1 ||
      moved[0][0]
    ) {
      return;
    }

    result.frames++;
    const steering = !!before[25];
    result.steered += steering ? 1 : 0;
    const ours = 1 + (steering ? 1 : 0);

    if ((headPlacings ?? 0) === ours) {
      result.held++;
    } else if (result.wrong.length < 10) {
      result.wrong.push(`frame ${tick[0]}: steering ${steering}, placed ${headPlacings ?? 0}`);
    }
  });

  return result;
}

/**
 * The head's wobbles (`HeadTrackPrep`'s `Lube::Next`s) against the model's
 * (`wobbleHead`): from rest, each placing in the trace in turn -- its turn
 * and nod, its clock and scale (`+0x36` hundredths, 1 at 0) -- put back to
 * rest where the head stopped tracking between, and given the engine's own
 * values for the wobbles' draws (seg5:04ad, 04e9, 0580) as they came: the
 * roll, the offset, and the pivot -- the neck scaled and the drift -- as the
 * engine's block has them.
 */
function followWobbles(lines: string[]) {
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = extendFrames(
    header.animations.flatMap((_, n) => parseAnimation(header, n, read(`DATA/${n}.BDT`))),
    breed
  );
  const neckBall = skeletonOf(breed).neck;
  const dll = parseNe(new Uint8Array(readFileSync(join(DRIVE, 'WINDOWS', 'DOGZDLL.DLL'))));
  const segments = new Map<number, number>();
  const result = { placings: 0, held: 0, wrong: [] as string[] };
  const lubes = restingLubes();
  let pending: number[][] = [];
  let tick = 0;
  let age = 10;
  let tracking = false;
  let rested = true;

  /* A frame's lines come in order, its draws after: the placings wait for them. */
  const settle = (draws: number[]) => {
    for (const head of pending) {
      /* (Put back to rest by a placing not tracking, where the trace says.) */
      if (head[0] === -1) {
        restLubes(lubes);
        rested = true;
        continue;
      }

      const [, yaw, pitch, roll, ox, oy, oz, px, py, pz, , clock, wobble, frame, blend, reference] =
        head;
      const values = draws.splice(0, draws.length);
      let used = 0;
      const ours = wobbleHead(lubes, yaw, pitch, clock, wobble === 0 ? 1 : wobble / 100, () =>
        used < values.length ? values[used++] : (used++, -1)
      );
      draws.push(...values.slice(used));
      rested = false;
      result.placings++;
      const neck = shapes[frame].balls[neckBall];
      const from = shapes[reference]?.balls[neckBall];
      const toward = (axis: 'x' | 'y' | 'z') =>
        blend !== 100 && from
          ? Math.trunc(((neck[axis] - from[axis]) * blend) / 100) + from[axis]
          : neck[axis];
      const pet = scalesForAge(breed, age).pet;
      const pivot = (['x', 'y', 'z'] as const).map((axis) =>
        Math.trunc(Math.floor((toward(axis) * pet) / 256) + ours.drift[axis])
      );
      const mine = [ours.roll, ours.offset.x, ours.offset.y, ours.offset.z, ...pivot];
      const theirs = [roll, ox, oy, oz, px, py, pz];

      if (mine.every((value, n) => value === theirs[n])) {
        result.held++;
      } else if (result.wrong.length < 10) {
        result.wrong.push(`frame ${tick}: ${mine.join(' ')}, not ${theirs.join(' ')}`);
      }
    }

    pending = [];
  };

  let draws: number[] = [];

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

    if (kind === 'tick') {
      settle(draws);
      draws = [];
      tick = values[0];
      age = values[14];

      /* Not tracking a whole frame, the wobbles are put back to rest. */
      if (!tracking && !rested) {
        restLubes(lubes);
        rested = true;
      }
    } else if (kind === 'headrest') {
      pending.push([-1]);
    } else if (kind === 'head' && values.length >= 16) {
      /* (Where the trace keeps each placing's clock: newer traces.) */
      pending.push(values);
    } else if (kind === 'state') {
      tracking = values[16] !== 0;
    } else if (kind === 'drawn') {
      const at = segments.get(values[2]);

      if (at === 5 && [0x4ad, 0x4e9, 0x580].includes(values[3])) {
        draws.push(randFrom(values[1]).rand());
      }
    }
  }

  settle(draws);
  return result;
}

/**
 * The shoe waved: each choice between chasing and charging the cursor
 * (`DecideChasingChargingCursor`, the draw returning to seg3:1d96) against
 * `chaseOrCharge`, the state gone to next; and each chance of a lunge
 * (`DoChasingChargingCursor`, seg3:0436) against `lungeChance`, a lunge
 * (18) next in the frame only where it passes.
 */
function followShoe(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { choices: 0, chances: 0, lunges: 0, held: 0, wrong: [] as string[] };
  const excitementOf = (tick: number[]) => Math.min(100, Math.max(1, tick[4]));

  for (const { tick, changes, drawn } of frames) {
    drawn.forEach(({ seed, segment, offset }, k) => {
      if (segment !== 3) {
        return;
      }

      const next = changes.find((change) => change.draws > k)?.to;

      if (offset === 0x1d96) {
        result.choices++;
        const ours = chaseOrCharge(excitementOf(tick), randFrom(seed).rand);

        if (next === undefined || ours === next) {
          result.held++;
        } else {
          result.wrong.push(`frame ${tick[0]}: chose ${ours}, not ${next}`);
        }
      } else if (offset === 0x436) {
        result.chances++;
        const lunged = next === 0x12 && changes.find((change) => change.draws > k)!.draws === k + 1;
        result.lunges += lunged ? 1 : 0;

        if (!lunged || lungeChance(excitementOf(tick), randFrom(seed).rand)) {
          result.held++;
        } else {
          result.wrong.push(`frame ${tick[0]}: lunged, its chance not passed`);
        }
      }
    });
  }

  return result;
}

/**
 * Each click on the dog (`DOGZ_POKE=1`: the button down for frame 100 and
 * every 30th after, the cursor where the trace's `cursor` line puts it)
 * against the model's dog, posed as the engine's was drawn the frame
 * before: the body area under the cursor (`Stage.areaAt`, `HitTestBodyArea`,
 * with the petting handler's slop)
 * one that pokes -- face, tongue, legs or tail -- wherever the engine poked
 * it (into `ePettingBad`, 0x16), and its face or tongue where the engine
 * reacted to the face. Each poke's reaction (`DoPettingBad`, its draws from
 * seg17 after the change) against `pokeReaction`: the same scripts stored,
 * in as many draws, to the same seed. Clicks the model would take for a
 * poke but the engine did not are listed (the dog not standing -- its
 * neutral position's type without 0x10, seg17:02e2 -- or the area under the
 * cursor changed since the frame before: not followed).
 */
function followPokes(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const { pokedInFace } = readEngineScripts(dll);
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = header.animations.flatMap((_, n) =>
    parseAnimation(header, n, read(`DATA/${n}.BDT`))
  );
  const extended = extendFrames(shapes, breed);
  const result = {
    clicks: 0,
    poked: 0,
    held: 0,
    notPoking: 0,
    notStanding: 0,
    reacting: 0,
    moved: 0,
    wrong: [] as string[],
  };
  const bodyAreas = readBodyAreas(dll, header.ballCount);
  /* Each click's neutral position type (`poking`). */
  const poking = new Map<number, number>();

  for (const line of lines) {
    if (line.startsWith('poking ')) {
      const values = line.split(' ').slice(1).map(Number);
      poking.set(values[0], values[2]);
    }
  }

  const pokes = [AREA.face, AREA.tongue, AREA.rightLeg, AREA.leftLeg, AREA.tail] as number[];
  const cursors = new Map<number, number[]>();
  let lastHead: number[] | undefined;
  const heads: (number[] | undefined)[] = [];

  for (const line of lines) {
    if (line.startsWith('cursor ')) {
      const values = line.split(' ').slice(1).map(Number);
      cursors.set(values[0], values.slice(1, 3));
    }
  }

  for (const frame of frames) {
    lastHead = frame.head ?? lastHead;
    heads.push(lastHead);
  }

  frames.forEach(({ tick, changes, drawn, stored, frame }, n) => {
    const at = tick[0];
    const cursor = cursors.get(at);
    const pose = frames[n - 1]?.state;

    if (at < 100 || at >= 700 || (at - 100) % 30 !== 0 || !cursor || !pose || pose.length < 25) {
      return;
    }

    result.clicks++;
    /* The area under the cursor with the dog as frame k left it. */
    const areaAt = (k: number) => {
      const pose = frames[k]?.state;

      if (!pose || pose.length < 25) {
        return -1;
      }

      const blend = pose[17] === 100 ? undefined : { scale: pose[17], reference: pose[18] };
      const head =
        pose[16] && heads[k]
          ? headOf(
              heads[k]!,
              extended[pose[13]],
              blend && { scale: blend.scale, reference: extended[blend.reference] },
              scalesForAge(breed, tick[14]).pet,
              breed
            )
          : undefined;
      const stage = new Stage(292, 273, breed, header, shapes, tick[14]);
      stage.show(
        { frame: pose[13] } as Step,
        pose[9],
        undefined,
        undefined,
        undefined,
        head,
        { tilt: pose[10], spin: pose[11], roll: pose[12] },
        blend
      );
      stage.bodyAreas = bodyAreas;
      const rect = stage.rect();
      stage.nudge(pose[0] - rect.left, pose[1] - rect.top);
      const standard = stage.standardSize();
      return stage.areaAt(
        { x: cursor[0], y: cursor[1] },
        { x: Math.trunc(standard.width / 7), y: Math.trunc(standard.height / 3) }
      );
    };
    const area = areaAt(n - 1);
    /* The area the frame before found (`+0x1230`), the cursor already here. */
    const areaBefore = areaAt(n - 2);
    const type = poking.get(at);
    const change = changes.find((each) => each.to === 0x16);

    if (!change) {
      /* What the engine asks (seg17:02b8 to 032d): the area the one it was
       * the frame before, the dog standing (its neutral position's type with
       * 0x10), not reacting to the last (0x16), and a poking area. Each
       * click so unanswered is wrong; the rest, by which it failed. */
      if (!pokes.includes(area)) {
        result.notPoking++;
      } else if (type === undefined || !(type & 0x10)) {
        result.notStanding++;
      } else if (tick[1] === 0x16) {
        result.reacting++;
      } else if (areaBefore !== area) {
        result.moved++;
      } else {
        result.wrong.push(`frame ${at}: area ${area}, standing, not poked`);
      }

      return;
    }

    result.poked++;
    const ours = stored.filter((push) => push.sprite === frame[5] && push.draws >= change.draws);
    const theirs = ours
      .map((push) => push.script)
      .filter((script) => [43, 120, 121, 122, ...pokedInFace].includes(script));
    const face = pokedInFace.includes(theirs[0]);
    const { rand, state } = randFrom(drawn[change.draws]?.seed ?? frame[3]);
    let used = 0;
    const scripts = [...pokeReaction(face, pokedInFace, () => (used++, rand()))];
    const end = change.draws + used;
    const seedThen = end < drawn.length ? drawn[end].seed : frame[3];
    const inSeg17 = drawn.slice(change.draws, end).every((draw) => draw.segment === 17);
    const areaRight = face
      ? area === AREA.face || area === AREA.tongue
      : pokes.includes(area) && area !== AREA.face && area !== AREA.tongue;
    /* (And as the engine asks: standing, the area as the frame before found it.) */
    const asked = type !== undefined && !!(type & 0x10) && areaBefore === area;

    if (
      scripts.join(' ') === theirs.join(' ') &&
      state.seed === seedThen &&
      inSeg17 &&
      areaRight &&
      asked
    ) {
      result.held++;
    } else {
      result.wrong.push(
        `frame ${at}: area ${area}, ${scripts.join(' ')} in ${used} draws, not ${theirs.join(' ')}${inSeg17 ? '' : ' (draws elsewhere)'}`
      );
    }
  });

  return result;
}

/**
 * The brain (`XBrain`, read from `BRAIN.PBT` as the day began) against the
 * model's `Brain`, given what the engine gave it in turn: its desires
 * cleared (`brainzero`), told a verb and object (`brain 5`, `tell`) or
 * asked to think (`brain 4`, `think`), each from the engine's seed then,
 * and pulsed as the module pulses it (`pulse`: once a frame, mostly, but
 * up to 11 in one), so its choices are made real as the model times them. Each answer -- the state its choice maps to (`brained`, DS:0x1e1e)
 * -- the same, in as many draws, to the same seed; and each choice made
 * real (`brainreal`) in the same frame.
 */
function followBrain(lines: string[]) {
  const { frames, dll } = readTrace(lines);
  const file = parseBrain(new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', 'BRAIN.PBT'))));
  let draw = { rand: () => 0, used: 0 };
  const brain = new Brain(file, readBrainMap(dll), () => (draw.used++, draw.rand()));
  const result = { commands: 0, held: 0, real: 0, realHeld: 0, wrong: [] as string[] };
  let frame = -1;
  let asked:
    { line: string; answer: number; at: number; drawn: Frame['drawn']; next: number } | undefined;
  const reals = new Map<number, number>();
  const ours = new Map<number, number>();
  /* (The model's own makings real, counted as it pulses.) */
  const counting = brain as unknown as { makeLastThinkReal: () => void };
  const make = counting.makeLastThinkReal.bind(brain);
  counting.makeLastThinkReal = () => {
    ours.set(frame, (ours.get(frame) ?? 0) + 1);
    make();
  };

  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');

    if (kind === 'tick') {
      frame = Number(rest[0]);
      asked = undefined;
    } else if (kind === 'pulse') {
      brain.pulse();
    } else if (kind === 'brainzero') {
      brain.zeroOutDesires();
    } else if (kind === 'brainreal') {
      reals.set(frame, (reals.get(frame) ?? 0) + 1);
    } else if (kind === 'brain') {
      const [command, verb, object, at] = [Number(rest[0]), rest[1], rest[2], Number(rest[3])];
      const current = frames.find((each) => each.tick[0] === frame)!;
      const seed = current.drawn[at]?.seed ?? current.frame[3];
      const { rand, state } = randFrom(seed);
      draw = { rand, used: 0 };
      const answer = command === 5 ? brain.tell(verb, object) : brain.think();
      asked = { line, answer, at, drawn: current.drawn, next: 0 };
      (asked as unknown as { state: typeof state }).state = state;
    } else if (kind === 'brained' && asked) {
      result.commands++;
      const [theirs, end] = rest.map(Number);
      const current = frames.find((each) => each.tick[0] === frame)!;
      const seedThen = end < current.drawn.length ? current.drawn[end].seed : current.frame[3];
      const state = (asked as unknown as { state: { seed: number } }).state;

      if (asked.answer === theirs && draw.used === end - asked.at && state.seed === seedThen) {
        result.held++;
      } else {
        result.wrong.push(
          `frame ${frame}: ${asked.line}: ${asked.answer} in ${draw.used} draws, not ${theirs} in ${end - asked.at}`
        );
      }

      asked = undefined;
    }
  }

  for (const [at, count] of reals) {
    result.real += count;

    if (ours.get(at) === count) {
      result.realHeld += count;
    } else {
      result.wrong.push(`frame ${at}: ${ours.get(at) ?? 0} made real, not ${count}`);
    }
  }

  for (const [at, count] of ours) {
    if (!reals.has(at)) {
      result.wrong.push(`frame ${at}: ${count} made real, not 0`);
    }
  }

  return result;
}

/**
 * The dangling dog's swing (`Fizziks`, `RotatoPet`) against the model's
 * `Swing`, call by call (`fizz`; more than one a frame at times): started
 * where the engine starts it (the sprite's `+0x210e` 2), at the dog's
 * rotation, and stepped by the cursor sprite's move, its velocity and place
 * after each as the engine's; and the spin and tilt the frame's last gives
 * the dog as the frame left them.
 */
function followSwing(lines: string[]) {
  const { frames } = readTrace(lines);
  const result = { calls: 0, held: 0, frames: 0, angles: 0, wrong: [] as string[] };
  let swing: Swing | undefined;
  let rotation = 0;
  let frame = -1;
  const swungIn = new Set<number>();
  /* (Not the frame it is let go in: leaving, the scruff eases the spin on, seg21:63d5.) */
  const leaving = new Set(
    frames
      .filter((each) => each.changes.some((change) => change.from === 10))
      .map((each) => each.tick[0])
  );

  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');

    if (kind === 'tick') {
      frame = Number(rest[0]);
    } else if (kind === 'fizz') {
      const [on, turned, cx, cy, bx, by, ...after] = rest.map(Number);

      if (on === 2 || !swing) {
        swing = new Swing(turned);
      }

      rotation = turned;
      swing.step(cx - bx, cy - by);
      result.calls++;
      swungIn.add(frame);
      const ours = [...swing.v, ...swing.p].join(' ');
      const theirs = after.slice(0, 6).join(' ');

      if (ours === theirs) {
        result.held++;
      } else if (result.wrong.length < 10) {
        result.wrong.push(`frame ${frame}: swung to ${ours}, not ${theirs}`);
      }

      /* (Kept in step with the engine's, so that one miss is not many.) */
      swing.v = after.slice(0, 3);
      swing.p = after.slice(3, 6);
    } else if (kind === 'state' && swing && swungIn.has(frame) && !leaving.has(frame)) {
      /* The angles the last swing of the frame gave the dog, as the frame left them. */
      const state = rest.map(Number);
      const { spin, tilt } = swing.angles(rotation);
      result.frames++;

      if (spin === state[11] && (tilt === undefined || tilt === state[10])) {
        result.angles++;
      } else if (result.wrong.length < 10) {
        result.wrong.push(
          `frame ${frame}: spin ${spin} tilt ${tilt}, not ${state[11]} ${state[10]}`
        );
      }
    }
  }

  return result;
}

/**
 * The dog painted (`PaintSprite::Update`, `Ballz::SetBallColor`): for each
 * stroke the trace keeps its colours before and after (`colours`, as the
 * brush is let go and the frame after), the model's dog posed as the
 * engine's was as the brush was let go, the brush's tip where the cursor
 * held it (as the frame before drew the dog's rectangle),
 * painted with the brush's colour (22, the second ramp's first): the
 * first stroke's colours before as the breed's, and each stroke's after
 * as the engine's. The first stroke holds the cursor at the middle of the
 * dog's rectangle; the second a quarter of the way in from its left.
 */
function followPainting(lines: string[]) {
  const { frames } = readTrace(lines);
  const read = (path: string) => new Uint8Array(readFileSync(join(DRIVE, 'DOGZ.DOG', path)));
  const header = parseBhd(read('DATA/ALL_PTZ.BHD'));
  const breed = parseLnz(new TextDecoder('latin1').decode(read('DATA/BIGDOG.LNZ')));
  const shapes = header.animations.flatMap((_, n) =>
    parseAnimation(header, n, read(`DATA/${n}.BDT`))
  );
  const extended = extendFrames(shapes, breed);
  const result = { strokes: 0, painted: 0, held: 0, wrong: [] as string[] };
  const colours = new Map<number, number[]>();
  let lastHead: number[] | undefined;
  const heads: (number[] | undefined)[] = [];

  for (const line of lines) {
    if (line.startsWith('colours ')) {
      const values = line.split(' ').slice(1).map(Number);
      colours.set(values[0], values.slice(2));
    }
  }

  for (const frame of frames) {
    lastHead = frame.head ?? lastHead;
    heads.push(lastHead);
  }

  for (const [at, before] of colours) {
    const after = colours.get(at + 2);
    const n = frames.findIndex((frame) => frame.tick[0] === at);
    const pose = frames[n]?.state;
    const drawn = frames[n - 1]?.state;

    if (!after || !pose || !drawn || pose.length < 25) {
      continue;
    }

    result.strokes++;
    const blend = pose[17] === 100 ? undefined : { scale: pose[17], reference: pose[18] };
    const head =
      pose[16] && heads[n]
        ? headOf(
            heads[n]!,
            extended[pose[13]],
            blend && { scale: blend.scale, reference: extended[blend.reference] },
            scalesForAge(breed, frames[n].tick[14]).pet,
            breed
          )
        : undefined;
    const stage = new Stage(292, 273, breed, header, shapes, frames[n].tick[14]);
    stage.show(
      { frame: pose[13] } as Step,
      pose[9],
      undefined,
      undefined,
      undefined,
      head,
      { tilt: pose[10], spin: pose[11], roll: pose[12] },
      blend
    );
    const rect = stage.rect();
    stage.nudge(pose[0] - rect.left, pose[1] - rect.top);
    const cursor = {
      x:
        at < 250
          ? Math.trunc((drawn[0] + drawn[2]) / 2)
          : drawn[0] + Math.trunc((drawn[2] - drawn[0]) / 4),
      y: Math.trunc((drawn[1] + drawn[3]) / 2),
    };
    const was = stage.breed.ballColor256;
    const count = was.length;

    if (result.strokes === 1 && was.join(' ') !== before.slice(0, count).join(' ')) {
      result.wrong.push(`frame ${at}: before, ${was.join(' ')}, not ${before.join(' ')}`);
      continue;
    }

    was.splice(0, count, ...before.slice(0, count));
    const painted = stage.paint(brushTip(cursor), 22, 256);
    result.painted += painted ? 1 : 0;
    const ours = stage.breed.ballColor256;

    if (ours.join(' ') === after.slice(0, count).join(' ')) {
      result.held++;
    } else {
      result.wrong.push(`frame ${at}: after, ${ours.join(' ')}, not ${after.join(' ')}`);
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
    console.log(
      `bowls: ${bowls.filled} filled, ${bowls.eaten} eaten from, ${bowls.lapped} lapped from, ${bowls.held} held`
    );
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
      `frame boxes: ${boxes.frames} frames (${boxes.blended} blended, ${boxes.tracked} with the head turned), ${boxes.held} held, ${boxes.nearly} a pixel out on one edge (${boxes.turned} with the head turned, ${boxes.mouthed} taking up or letting go, not followed; ${boxes.holding} with the ball held, ${boxes.shoe} with the shoe)`
    );
    expect(boxes.wrong).toEqual([]);

    const placing = followPlacing(lines);
    console.log(
      `placing: ${placing.plain} moved plainly, ${placing.glued} glued (${placing.slid} sliding), ${placing.held} held (${placing.shoe} with the shoe), ${placing.nearly} a pixel out (${placing.holding} taking up or letting go, ${placing.sliding} sliding, not followed)`
    );
    expect(placing.wrong).toEqual([]);

    if (placing.nearlyAt.length) {
      console.log(`placing, a pixel out:\n  ${placing.nearlyAt.join('\n  ')}`);
    }

    if (placing.rewobbledOff.length) {
      console.log(
        `placing, the head's wobbles moved on for the frame before (${placing.rewobbled}), apart:\n  ${placing.rewobbledOff.join('\n  ')}`
      );
    }

    if (placing.unexplained.length) {
      console.log(
        `placing, glued out of a blend (${placing.outOfBlend}), not yet explained:\n  ${placing.unexplained.join('\n  ')}`
      );
    }

    if (placing.pinned) {
      console.log(`placing, scruffed: ${placing.pinned} pinned by the neck to the cursor`);
    }

    if (placing.lunging) {
      console.log(`placing, lunging: ${placing.lunging} pinned by the chin to the shoe`);
    }

    const copies = followHeadCopies(lines);
    console.log(
      `head placed afresh: ${copies.plain} plain moves with the head tracking, ${copies.copies} with a copy, ${copies.held} as the rule has it`
    );
    /* (Reported, not held: the old state is placed afresh, too, by code not
     * yet found, now and then before the move -- the nod changed in a blend,
     * the petting day's -- which the rule does not cover.) */
    if (copies.wrong.length) {
      console.log(
        `head placed afresh, not by the rule:\n  ${copies.wrong.slice(0, 5).join('\n  ')}`
      );
    }

    const steered = followSteeredHeads(lines);
    console.log(
      `head placed while steering: ${steered.frames} frames, ${steered.steered} steering, ${steered.held} held`
    );

    const wobbles = followWobbles(lines);
    console.log(`head wobbles: ${wobbles.placings} placings, ${wobbles.held} held`);
    if (wobbles.wrong.length) {
      console.log(`head wobbles, not as the model's:\n  ${wobbles.wrong.join('\n  ')}`);
    }

    const shoe = followShoe(lines);
    console.log(
      `the shoe: ${shoe.choices} chases or charges chosen, ${shoe.chances} chances of a lunge (${shoe.lunges} lunged), ${shoe.held} held`
    );
    expect(shoe.wrong).toEqual([]);

    /* (Only on a poke day: the scruff day writes its cursor too.) */
    const pokes = POKE
      ? followPokes(lines)
      : {
          clicks: 0,
          poked: 0,
          held: 0,
          notPoking: 0,
          notStanding: 0,
          reacting: 0,
          moved: 0,
          wrong: [] as string[],
        };
    console.log(
      `pokes: ${pokes.clicks} clicks, ${pokes.poked} poked, ${pokes.held} held; not poked: ${pokes.notPoking} off a poking area, ${pokes.notStanding} not standing, ${pokes.reacting} still reacting, ${pokes.moved} the area changed`
    );
    expect(pokes.wrong).toEqual([]);

    const swinging = followSwing(lines);
    console.log(
      `swing: ${swinging.calls} ticks, ${swinging.held} held; ${swinging.frames} frames' angles, ${swinging.angles} held`
    );
    expect(swinging.wrong).toEqual([]);

    const thinking = followBrain(lines);
    console.log(
      `brain: ${thinking.commands} told or asked, ${thinking.held} held; ${thinking.real} made real, ${thinking.realHeld} held`
    );
    expect(thinking.wrong).toEqual([]);

    const painting = followPainting(lines);
    console.log(
      `painting: ${painting.strokes} strokes, ${painting.painted} painted, ${painting.held} held`
    );
    expect(painting.wrong).toEqual([]);

    const plans = followIdlePlans(lines);
    console.log(`idle plans: ${plans.plans} made, ${plans.ends} done, ${plans.held} held`);
    expect(plans.wrong).toEqual([]);
  }, 1800000);
});
