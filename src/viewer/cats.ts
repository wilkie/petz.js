/**
 * The Catz viewer: the Catz demo's cats drawn by the same renderer as the
 * dogs, parameterized by the demo's own files -- each breed's adult file
 * averaged with its kitten's (`averageBreed`), the cat's skeleton and
 * animations, and CATZDLL.DLL's palette and colour translation. See
 * kb/topics/drawing-a-dog.md, "In Catz".
 */

import {
  type AnimationHeader,
  type Frame,
  parseAnimation,
  parseBhd,
} from '../formats/animation.ts';
import { averageBreed, type Breed, parseLnz } from '../formats/lnz.ts';
import { parseNe } from '../formats/ne.ts';
import {
  CATZ_PALETTE_TYPE,
  type Colour,
  catzIdealPalette,
  catzTranslation,
  PALETTE_256,
  readPalette,
} from '../formats/palette.ts';
import { ballAt, drawPet } from '../render/ballz.ts';
import { extendFrames, layeredCatzFrame } from '../render/extend.ts';
import { FIDELITY } from '../render/fidelity.ts';
import { IndexedBitmap } from '../render/raster.ts';
import { skeletonOf } from '../render/skeleton.ts';
import { chosenFiles, type GameFiles, oracleFiles } from '../files.ts';
import { makeCatzFudgers, resetCatzEyelids } from '../behaviour/catz-fudger.ts';
import {
  type CatzPlaced,
  type CatzPose,
  CatzPlacer,
  placeCatzTick,
} from '../behaviour/catz-stage.ts';
import {
  catzFrameAngle,
  type CatzPositions,
  type CatzStep,
  catzTimeline,
} from '../behaviour/catz-timeline.ts';
import {
  catzArity,
  parseScripts,
  readCatzOpcodes,
  type Script,
  SCRIPTS,
} from '../formats/script.ts';
import { initCatzBrains, updateCatzBrain } from '../behaviour/catz-brain.ts';
import { CatzPet } from '../behaviour/catz-pet.ts';
import { borlandRand } from '../behaviour/random.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element<HTMLParagraphElement>('status');
const choose = element<HTMLParagraphElement>('choose');
const picker = element<HTMLInputElement>('picker');
const breedSelect = element<HTMLSelectElement>('breed');
const kittenInput = element<HTMLInputElement>('kitten');
const kittenValue = element<HTMLOutputElement>('kitten-value');
const animationSelect = element<HTMLSelectElement>('animation');
const scriptSelect = element<HTMLSelectElement>('script');
const timesInput = element<HTMLInputElement>('times');
const frameInput = element<HTMLInputElement>('frame');
const frameNumber = element<HTMLOutputElement>('frame-number');
const yawInput = element<HTMLInputElement>('yaw');
const playButton = element<HTMLButtonElement>('play');
const liveButton = element<HTMLButtonElement>('live');
const canvas = element<HTMLCanvasElement>('stage');
const context = canvas.getContext('2d')!;

const RESOURCE = 'CATZ.DOG/PTZFILES/CAT/RESOURCE';

let header: AnimationHeader;
let frames: Frame[] = [];
let palette: Colour[] = [];
let translate: (colour: number) => number = (colour) => colour;
const files = new Map<string, { adult: Breed; kitten: Breed }>();
let order: number[] = [];
let playing = 0;
let scripts: Script[] = [];
let positions: CatzPositions = { count: 0, neutral: 0 };

/**
 * The frames shown, numbered over every animation -- an animation's, or a
 * script's played out -- and how far the cat has moved by each.
 */
let sequence: {
  frame: number;
  x: number;
  y: number;
  pose?: number[];
  layer?: { first: number; frame: number };
}[] = [];

/** The breed chosen, averaged toward its kitten's file by the slider: made once for each choice, so its reshaped frames are kept. */
let chosen: { key: string; breed: Breed } | null = null;

function breed() {
  const key = `${breedSelect.value}/${kittenInput.value}`;

  if (chosen?.key !== key) {
    const { adult, kitten } = files.get(breedSelect.value)!;
    chosen = {
      key,
      breed: averageBreed(adult, kitten, Number(kittenInput.value), {
        loseUp: FIDELITY.averageLosesUp,
      }),
    };
  }

  return chosen.breed;
}

function draw() {
  const cat = breed();
  const step = sequence[Number(frameInput.value)] ?? { frame: 0, x: 0, y: 0 };
  const at = step.frame;
  const all = extendFrames(frames, cat);
  /* A layered action's frame played over it, where one is. */
  const shaped =
    step.layer && all[step.layer.first] && all[step.layer.frame]
      ? layeredCatzFrame(all[at], all[step.layer.first], all[step.layer.frame], cat)
      : all[at];
  /* The cat kept on the canvas, wrapping round it where it walks off, by
   * where its glue ball is: the frames of a walk move on themselves. */
  const wrap = (value: number, size: number) => ((value % size) + size) % size;
  const glue = Number(cat.sections.get('Default Glue Ball')?.[0]?.values[0] ?? 6);
  const posed = poseOf(step.pose);
  const g = ballAt(cat, header, shaped, glue, { age: 100, yaw: posed.yaw });
  const bitmap = new IndexedBitmap(320, 240);

  drawPet(bitmap, cat, header, shaped, {
    colours: 256,
    originX: wrap(160 + step.x + g.x, 320) - g.x,
    originY: wrap(150 + step.y + g.y, 240) - g.y,
    age: 100,
    order,
    translate,
    ...posed,
  });

  frameNumber.textContent = String(at);
  kittenValue.textContent = `${kittenInput.value}%`;
  const pixels = new ImageData(bitmap.toRgba(palette), bitmap.width, bitmap.height);
  const small = new OffscreenCanvas(bitmap.width, bitmap.height);
  small.getContext('2d')!.putImageData(pixels, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(small, 0, 0, canvas.width, canvas.height);
}

/**
 * How the cat is drawn by its 14 fudgers' values (`BallState`): turned,
 * rolled and tilted, its head turned, each eyelid shut and tilted, its eyes
 * looking; without them, turned by the yaw slider, its lids at rest.
 */
function poseOf(pose?: number[]) {
  if (!pose) {
    return { yaw: Number(yawInput.value) };
  }

  const [yaw, roll, tilt, rotation, up, cock, right, left, rightTilt, leftTilt, x, y] = pose;
  return {
    yaw,
    angles: { tilt, roll, spin: 0 },
    catzHead: { rotation, tilt: up, cock },
    catzLids: { right, left },
    eyelids: { right: { height: 100, tilt: rightTilt }, left: { height: 100, tilt: leftTilt } },
    eyes: { mode: 1 as const, x, y },
  };
}

/** The steps a script plays out as, a variant at random each time, the cat's fudgers played along. */
function playOut(index: number, times = 1) {
  const random = (n: number) => Math.floor(Math.random() * n);
  const cat = breed();
  const shaped = extendFrames(frames, cat);
  const { neck, butt } = skeletonOf(cat);
  /* A cat as its states leave it: still, its lids a fifth shut, turned as the slider says. */
  const fudgers = makeCatzFudgers();
  resetCatzEyelids(fudgers);
  fudgers[0].value = Number(yawInput.value);
  [fudgers[6].value, fudgers[7].value] = [20, 20];

  return catzTimeline(scripts, positions, index, {
    flags: (frame) => frames[frame]?.tag ?? 3,
    random,
    limit: 600,
    times,
    angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
    fudgers,
    blink: { wait: random(100) + 30, shut: false, kept: 20 },
  });
}

/**
 * A script's frames placed as `PopScript` places them (CATZDLL.DLL
 * seg41:0052; `placeCatzTick`): frame after frame moved by their own
 * rectangles, a reference frame -- after every action -- glued by the
 * breed's `[Default Glue Ball]` and turned to align, and each turn of a
 * loop that ends `endLoopAlign0`, a walk's, glued too. The cat's origin is
 * where its rectangle puts it.
 */
function placed(index: number) {
  const cat = breed();
  const shaped = extendFrames(frames, cat);
  const placer = new CatzPlacer(cat, header, shaped, { age: 100 });
  const steps: typeof sequence = [];
  const poseAt = ({ frame, fudged, layer }: CatzStep): CatzPose => {
    const [rotation = Number(yawInput.value), roll = 0, tilt = 0, turn = 0, up = 0, cock = 0] =
      fudged ?? [];
    return { frame, rotation, tilt, roll, head: { rotation: turn, tilt: up, cock }, layer };
  };
  let at: CatzPlaced | null = null;
  let held: { frame: number; turn?: number } | undefined;

  for (const step of playOut(index, Math.max(1, Number(timesInput.value) || 1))) {
    if (!shaped[step.frame]) {
      continue;
    }

    if (step.reference) {
      held = step;
      continue;
    }

    const pose = poseAt(step);
    const { left, top } = placer.bounds(pose);
    at = at
      ? placeCatzTick(placer, at, pose, { reference: held, glued: !!step.glue })
      : { rect: placer.bounds(pose), before: pose, current: pose };
    held = undefined;

    steps.push({
      frame: step.frame,
      x: at.rect.left - left,
      y: at.rect.top - top,
      pose: step.fudged,
      layer: step.layer,
    });
  }

  return steps;
}

/** The stage the cat lives on, and how it maps onto the canvas (320 by 240, drawn from 160, 150). */
const LIVE_STAGE = { left: 0, top: 0, right: 470, bottom: 370 };

/** The brains and centres of the playpen's cat as the harness found it: where a breed has no factors. */
const LIVE_BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const LIVE_CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];

let live = 0;
let liveCursor = { x: 235, y: 300 };

/**
 * The cat on its own (`CatzPet`): ten ticks a second, as the engine runs,
 * each action it pushes played out by its script from the pose it is in, a
 * frame a tick, the cat drawn where it stands -- its walk moved straight, as
 * the pet stands in for its steering, not yet by its frames -- and the
 * mouse over the stage its cursor. Its brains are its breed's, made as the
 * engine makes them (`initCatzBrains`, its age the slider's) and drawn back
 * toward their centres by the engine's clock.
 */
function goLive() {
  if (live) {
    clearInterval(live);
    live = 0;
    liveButton.textContent = 'Live';
    return;
  }

  const rand = borlandRand(Date.now() >>> 0);
  const random = (n: number) => rand() % n;
  const cat = breed();
  const shaped = extendFrames(frames, cat);
  const { neck, butt } = skeletonOf(cat);
  const fudgers = makeCatzFudgers();
  resetCatzEyelids(fudgers);
  [fudgers[6].value, fudgers[7].value] = [20, 20];
  const queue: CatzStep[] = [];
  let pose = positions.neutral;
  let shown: CatzStep | undefined;
  let ticks = 0;
  /* Its brains as the engine makes them for its breed (`InitBrain`), its age by the slider. */
  const brains = cat.catz?.factors
    ? initCatzBrains(cat.catz.factors, random, { age: Number(kittenInput.value) })
    : undefined;
  let clock = 0;
  const pet = new CatzPet({
    brains: brains?.map((brain) => brain.value) ?? LIVE_BRAINS,
    centres: brains?.map((brain) => brain.centre) ?? LIVE_CENTRES,
    stage: LIVE_STAGE,
    cursor: () => liveCursor,
    random,
    play: (action) => {
      const steps = scripts[action]
        ? catzTimeline(scripts, positions, action, {
            flags: (frame) => frames[frame]?.tag ?? 3,
            random,
            limit: 600,
            from: pose,
            fudgers,
            angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
            blink: { wait: random(100) + 30, shut: false, kept: 20 },
          }).filter((step) => !step.reference && step.frame < frames.length)
        : [];
      queue.push(...steps);
      pose = scripts[action]?.to || pose;
      return { ticks: steps.length, pose };
    },
  });

  liveButton.textContent = 'Stop';
  live = window.setInterval(() => {
    /* Its brains drawn back toward their centres by the engine's clock
     * (milliseconds over 17), as the pet left them. */
    clock += 100 / 17;
    brains?.forEach((brain, n) => {
      brain.value = pet.mind.brains[n];
      updateCatzBrain(brain, Math.trunc(clock));
      pet.mind.brains[n] = brain.value;
    });

    const { state, global } = pet.tick();
    shown = queue.shift() ?? shown;

    /* A new state drops what was left of the old: as many frames kept as it has left to play. */
    if (queue.length > pet.playing) {
      queue.splice(0, queue.length - pet.playing);
    }
    const scale = { x: 320 / LIVE_STAGE.right, y: 240 / LIVE_STAGE.bottom };
    sequence = [
      {
        frame: shown?.frame ?? 0,
        x: Math.round(pet.point.x * scale.x) - 160,
        y: Math.round(pet.point.y * scale.y) - 150,
        pose: shown?.fudged,
        layer: shown?.layer,
      },
    ];
    frameInput.value = '0';
    draw();
    ticks++;
    status.textContent = `On its own, tick ${ticks}: state ${state}, global state ${global}${queue.length ? `, ${queue.length} frames to play` : ''}.`;
  }, 100);
}

function chooseAnimation() {
  if (scriptSelect.value === '') {
    const { start, end } = header.animations[Number(animationSelect.value)];
    sequence = Array.from({ length: end - start }, (_, n) => ({ frame: start + n, x: 0, y: 0 }));
  } else {
    sequence = placed(Number(scriptSelect.value));
  }

  frameInput.max = String(Math.max(0, sequence.length - 1));
  frameInput.value = '0';
  order = [];
  draw();
}

function play() {
  if (playing) {
    clearInterval(playing);
    playing = 0;
    playButton.textContent = 'Play';
    return;
  }

  playButton.textContent = 'Stop';
  /* A frame a tick, as the engine shows them: about ten a second. */
  playing = window.setInterval(() => {
    frameInput.value = String((Number(frameInput.value) + 1) % (Number(frameInput.max) + 1));
    draw();
  }, 100);
}

async function start(game: GameFiles) {
  header = parseBhd(await game.read(`${RESOURCE}/CAT.BHD`));
  frames = [];
  let shipped = 0;

  /* The demo ships the first animations only, numbered from the first. */
  for (; shipped < header.animations.length; shipped++) {
    let data: Uint8Array;

    try {
      data = await game.read(`${RESOURCE}/CAT${shipped}.BDT`);
    } catch {
      break;
    }

    frames.push(...parseAnimation(header, shipped, data));
  }

  const own = readPalette(
    parseNe(await game.read('WINDOWS/SYSTEM/CATZDLL.DLL')),
    PALETTE_256,
    256,
    CATZ_PALETTE_TYPE
  );
  palette = catzIdealPalette(own);
  translate = catzTranslation(own);

  const text = async (path: string) => new TextDecoder('latin1').decode(await game.read(path));
  const adults = game
    .list()
    .filter((path) => /[\\/]CAT[\\/]RESOURCE[\\/](W\d)?A\w+\.LNZ$/i.test(path))
    .sort();

  for (const path of adults) {
    const adult = parseLnz(await text(path), header.ballCount);
    const little = adult.catz?.littleOne;

    if (!little) {
      continue;
    }

    const kitten = parseLnz(await text(`${RESOURCE}/${little}`), header.ballCount);
    const name = path
      .split(/[\\/]/)
      .pop()!
      .replace(/^((W\d)?)A/i, '$1')
      .replace(/\.LNZ$/i, '');
    files.set(name, { adult, kitten });
    breedSelect.add(new Option(name.toLowerCase(), name));
  }

  const engine = parseNe(await game.read('WINDOWS/SYSTEM/CATZDLL.DLL'));
  const data = await game.read(`${RESOURCE}/CAT.SCP`);
  scripts = parseScripts(data, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz);
  const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
  positions = { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) };

  /* Only the scripts the demo's frames will play, as far as a few tries tell. */
  scripts.forEach((script, index) => {
    const played = playOut(index).filter((step) => !step.reference);

    if (played.length && played.every(({ frame }) => frame < frames.length)) {
      scriptSelect.add(new Option(`${index}: ${script.from} to ${script.to}`, String(index)));
    }
  });

  for (let index = 0; index < shipped; index++) {
    const { start: first, end } = header.animations[index];
    animationSelect.add(new Option(`${index} (${end - first} frames)`, String(index)));
  }

  status.textContent = `${files.size} breeds, ${shipped} animations and ${scriptSelect.options.length - 1} of ${scripts.length} scripts, from ${game.source}.`;
  choose.hidden = true;
  chooseAnimation();
}

for (const control of [breedSelect, kittenInput, frameInput, yawInput]) {
  control.addEventListener('input', () => {
    if (control === breedSelect) {
      order = [];
    }

    draw();
  });
}

animationSelect.addEventListener('change', () => {
  scriptSelect.value = '';
  chooseAnimation();
});
scriptSelect.addEventListener('change', chooseAnimation);
timesInput.addEventListener('change', () => {
  if (scriptSelect.value !== '') {
    chooseAnimation();
  }
});
playButton.addEventListener('click', play);
liveButton.addEventListener('click', goLive);
canvas.addEventListener('mousemove', (event) => {
  const box = canvas.getBoundingClientRect();
  liveCursor = {
    x: Math.round(((event.clientX - box.left) / box.width) * LIVE_STAGE.right),
    y: Math.round(((event.clientY - box.top) / box.height) * LIVE_STAGE.bottom),
  };
});

picker.addEventListener('change', () => {
  if (picker.files?.length) {
    start(chosenFiles(picker.files)).catch((error) => (status.textContent = error.message));
  }
});

oracleFiles('/oracle-catz')
  .then((found) => {
    if (found) {
      return start(found);
    }

    status.textContent = "The game's files are not here.";
    choose.hidden = false;
  })
  .catch((error) => (status.textContent = error.message));
