/**
 * The viewer: any breed playing any animation, or any of the scripts that
 * chain animations into what the dog does, drawn from the game's own files
 * as the game draws it. A first look at the dog, and the place to compare a
 * drawing with the oracle's.
 */

import { Pet, type PetData } from '../behaviour/pet.ts';
import { borlandRand } from '../behaviour/random.ts';
import { Stage } from '../behaviour/stage.ts';
import { DEFAULT_GLUE, type Step, timeline } from '../behaviour/timeline.ts';
import { transitionTable } from '../behaviour/transitions.ts';
import { chosenFiles, type GameFiles, oracleFiles } from '../files.ts';
import {
  type AnimationHeader,
  type Frame,
  parseAnimation,
  parseBhd,
} from '../formats/animation.ts';
import {
  readBodyAreas,
  readEngineScripts,
  readEngineStateNames,
  readPositionKinds,
  readTrickScripts,
} from '../formats/engine.ts';
import { type Breed, parseLnz, readFactors } from '../formats/lnz.ts';
import { parseNe } from '../formats/ne.ts';
import { type Colour, PALETTE_16, PALETTE_256, readPalette } from '../formats/palette.ts';
import { parseScripts, readOpcodes, readStateNames, type Script } from '../formats/script.ts';
import { parseTricks } from '../formats/tricks.ts';
import { drawPet } from '../render/ballz.ts';
import { IndexedBitmap, random } from '../render/raster.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = element<HTMLParagraphElement>('status');
const choose = element<HTMLParagraphElement>('choose');
const picker = element<HTMLInputElement>('picker');
const breedSelect = element<HTMLSelectElement>('breed');
const coloursSelect = element<HTMLSelectElement>('colours');
const ageInput = element<HTMLInputElement>('age');
const yawInput = element<HTMLInputElement>('yaw');
const animationSelect = element<HTMLSelectElement>('animation');
const scriptSelect = element<HTMLSelectElement>('script');
const frameInput = element<HTMLInputElement>('frame');
const frameNumber = element<HTMLOutputElement>('frame-number');
const play = element<HTMLButtonElement>('play');
const soundInput = element<HTMLInputElement>('sound');
const liveInput = element<HTMLInputElement>('live');
const mood = element<HTMLOutputElement>('mood');
const canvas = element<HTMLCanvasElement>('stage');
const context = canvas.getContext('2d')!;

/** Dogz draws a frame every 45 milliseconds at most (`ReallyDoDrawFrame`, seg21:3dee). */
const FRAMES_PER_SECOND = 1000 / 45;

/** Dogz's own pixels, drawn this many times larger to be seen. */
const ZOOM = 2;

let header: AnimationHeader;
const breeds = new Map<string, Breed>();
const palettes = new Map<256 | 16, Colour[]>();

/** Every frame of every animation, numbered over them all, as the scripts number them. */
let allFrames: Frame[] = [];
let scripts: Script[] = [];

/** What is being shown: frames by their numbers over every animation, and what happens with each. */
let sequence: (Step & { placedBy?: number })[] = [];

/** The reference frame a script ends with, which its first frame is placed by when it loops. */
let endsWith: number | undefined;

/** Where a script's frames put the dog. */
let scriptStage: Stage | null = null;
let timer: number | undefined;

/** Where the dog has walked to, from the stage's middle, and how far it has turned. */
let offset = { x: 0, y: 0 };
let turned = 0;

let gameFiles: GameFiles;

/** What the dog left to itself needs of the game's files, and the dog itself when live. */
let petData: Omit<PetData, 'flags'>;
let engineStateNames: string[] = [];
let bodyAreas: number[] = [];
let live: { pet: Pet; stage: Stage; started: number } | null = null;

/** The stage, in Dogz's own pixels. */
const STAGE = { width: canvas.width / ZOOM, height: canvas.height / ZOOM };

function draw() {
  if (live) {
    return;
  }

  const index = Math.min(Number(frameInput.value), sequence.length - 1);

  frameInput.max = String(sequence.length - 1);
  frameNumber.value = `${index + 1} of ${sequence.length}, frame ${sequence[index].frame}`;

  /* Off one side of the stage, the dog comes back on at the other. */
  const wrap = (value: number, size: number) =>
    ((((value + size / 2) % size) + size) % size) - size / 2;
  offset = { x: wrap(offset.x, STAGE.width), y: wrap(offset.y, STAGE.height) };

  if (scriptStage) {
    scriptStage.x = STAGE.width / 2 + offset.x;
    scriptStage.y = (STAGE.height * 5) / 8 + offset.y;
  }

  drawDog(
    sequence[index].frame,
    STAGE.width / 2 + offset.x,
    (STAGE.height * 5) / 8 + offset.y,
    Number(yawInput.value) + turned
  );
}

/** Draws a frame at a place on the stage, turned so far, and shows it. */
function drawDog(frameNumber: number, originX: number, originY: number, yaw: number) {
  const breed = breeds.get(breedSelect.value)!;
  const colours = Number(coloursSelect.value) as 256 | 16;
  const bitmap = new IndexedBitmap(STAGE.width, STAGE.height);

  drawPet(bitmap, breed, header, allFrames[frameNumber], {
    colours,
    originX,
    originY,
    age: Number(ageInput.value),
    yaw,
    seed: frameNumber + 1,
  });

  const pixels = new ImageData(bitmap.toRgba(palettes.get(colours)!), bitmap.width, bitmap.height);
  const small = new OffscreenCanvas(bitmap.width, bitmap.height);
  small.getContext('2d')!.putImageData(pixels, 0, 0);

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(small, 0, 0, canvas.width, canvas.height);
}

/** Shows an animation's frames, or a script's, played out with a variant at random. */
function chooseSequence() {
  frameInput.value = '0';
  offset = { x: 0, y: 0 };
  turned = 0;

  if (scriptSelect.value === '') {
    scriptStage = null;
    const { start, end } = header.animations[Number(animationSelect.value)];
    sequence = Array.from({ length: end - start }, (_, n) => ({ frame: start + n }));
  } else {
    const index = Number(scriptSelect.value);
    const next = random(Date.now());
    const variant = next(scripts[index].variants.length);

    const steps = timeline(scripts, index, variant, {
      flags: (frame) => allFrames[frame]?.tag ?? 3,
      random: next,
      limit: 600,
    });

    /* A reference frame is not shown: the frame after it is placed by it. */
    sequence = [];
    endsWith = undefined;

    for (const step of steps) {
      if (step.reference) {
        endsWith = step.frame;
      } else {
        sequence.push({ ...step, placedBy: endsWith });
        endsWith = undefined;
      }
    }

    const breed = breeds.get(breedSelect.value)!;
    scriptStage = new Stage(
      STAGE.width,
      STAGE.height,
      breed,
      header,
      allFrames,
      Number(ageInput.value)
    );
    scriptStage.show({ frame: sequence[0].frame }, Number(yawInput.value));
  }

  draw();
}

/**
 * Moves on a step, as the game does between frames: turns the dog, places
 * the frame -- glued, or by a reference frame (`Stage.show`) -- and plays
 * the step's sounds. Round from the last step to the first, the script
 * follows itself as the engine plays a script twice: placed by the frame
 * it ends with, or, where it ends with none, glued by the belly.
 */
function advance() {
  const breed = breeds.get(breedSelect.value)!;
  const from = Number(frameInput.value);
  const to = (from + 1) % sequence.length;
  let step = sequence[to];

  if (to === 0) {
    step =
      endsWith === undefined
        ? { ...step, glue: step.glue ?? DEFAULT_GLUE }
        : { ...step, placedBy: endsWith };
  }

  turned += step.turn ?? 0;

  if (scriptStage) {
    scriptStage.show(step, Number(yawInput.value) + turned, step.placedBy);
    offset = { x: scriptStage.x - STAGE.width / 2, y: scriptStage.y - (STAGE.height * 5) / 8 };
  }

  if (soundInput.checked) {
    for (const sound of step.sounds ?? []) {
      void playSound(breed, sound);
    }
  }

  frameInput.value = String(to);
  draw();
}

/**
 * Plays a sound by its number in the breed's sound list: the adult's list or
 * the puppy's, by whether the dog's age is past the breed's maturity for
 * adult sounds (`ScriptSprite::LoadSoundList`, PlaySound).
 */
async function playSound(breed: Breed, sound: number) {
  const [adult, puppy, maturity] = (breed.sections.get('Sound List') ?? []).map(
    (line) => line.values[0]
  );
  const list = Number(ageInput.value) > Number(maturity ?? 40) ? adult : puppy;

  if (typeof list !== 'string') {
    return;
  }

  const names = new TextDecoder('latin1')
    .decode(await gameFiles.read(`DOGZ.DOG/${list.replace(/\\/g, '/')}`))
    .split(/\r?\n/)
    .map((line) => line.trim());
  const name = names[sound];

  if (name) {
    const data = await gameFiles.read(`DOGZ.DOG/SOUNDS/${name.replace(/\\/g, '/')}`);
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    await audio.play().catch(() => {});
  }
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  play.textContent = 'Play';
}

/** The dog left to itself: a pet of the breed shown, on a stage the size of the canvas. */
function startLive() {
  const breed = breeds.get(breedSelect.value)!;
  const age = Number(ageInput.value);
  const stage = new Stage(STAGE.width, STAGE.height, breed, header, allFrames, age);
  stage.bodyAreas = bodyAreas;
  const pet = new Pet(
    {
      ...petData,
      tricks: structuredClone(petData.tricks),
      flags: (frame) => allFrames[frame]?.tag ?? 3,
    },
    stage,
    borlandRand(Date.now()),
    readFactors(breed.sections),
    Math.trunc(age / 10)
  );

  pet.start(0);
  live = { pet, stage, started: performance.now() };
}

/** A tick of the live dog: the engine's clock is milliseconds over 17. */
function tickLive() {
  const { pet, stage, started } = live!;
  const breed = breeds.get(breedSelect.value)!;
  const step = pet.tick((performance.now() - started) / 17);

  stage.show(step, step.rotation, step.placedBy);
  drawDog(step.frame, stage.x, stage.y, step.rotation);
  drawTreat(stage);

  if (soundInput.checked) {
    for (const sound of step.sounds ?? []) {
      void playSound(breed, sound);
    }
  }

  mood.value = `${engineStateNames[step.state] ?? step.state}, excitement ${pet.factor(0)}${
    pet.global === 0x3f3 ? `, petted ${pet.pettingLevel}` : ''
  }`;
}

/** The treats' colours, not yet the game's own pictures of them. */
const TREAT_COLOURS = ['#2a5bd7', '#2a9d3a', '#d23a2a'];

function drawTreat(stage: Stage) {
  const treat = stage.treat;

  if (!treat) {
    return;
  }

  context.fillStyle = TREAT_COLOURS[treat.colour];
  context.beginPath();
  context.arc(treat.x * ZOOM, treat.y * ZOOM, 4 * ZOOM, 0, 2 * Math.PI);
  context.fill();
}

/** Where the cursor is over the stage, in Dogz's pixels. */
function stagePoint(event: MouseEvent) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * STAGE.width) / box.width,
    y: ((event.clientY - box.top) * STAGE.height) / box.height,
  };
}

canvas.addEventListener('mousemove', (event) => {
  if (!live) {
    return;
  }

  const point = stagePoint(event);
  live.stage.pointer = { ...point, button: (event.buttons & 1) !== 0 };

  if (live.stage.treat?.held) {
    Object.assign(live.stage.treat, point);
  }
});

canvas.addEventListener('mouseleave', () => {
  if (live) {
    live.stage.pointer = { x: -1000, y: -1000, button: false };
  }
});

/**
 * A click puts down the treat held, or picks up the one put down, as
 * `GrabSprite::Update` lets the user; otherwise the button is held to pet.
 */
canvas.addEventListener('mousedown', (event) => {
  if (!live) {
    return;
  }

  const point = stagePoint(event);
  const { stage, pet } = live;
  const treat = stage.treat;
  stage.pointer = { ...point, button: true };

  if (treat?.held) {
    treat.held = false;
    pet.treatPutDown();
  } else if (treat && Math.hypot(treat.x - point.x, treat.y - point.y) < 8) {
    treat.held = true;
    pet.treatPickedUp();
  }
});

window.addEventListener('mouseup', () => {
  if (live) {
    live.stage.pointer = { ...live.stage.pointer, button: false };
  }
});

for (const [colour, button] of ['blue', 'green', 'red'].entries()) {
  element<HTMLButtonElement>(`treat-${button}`).addEventListener('click', () => {
    if (!live) {
      return;
    }

    const { x, y } = live.stage.pointer;
    live.stage.treat = { colour, held: true, x, y };
    live.pet.treatPickedUp();
  });
}

element<HTMLButtonElement>('treat-away').addEventListener('click', () => {
  if (live?.stage.treat) {
    live.stage.treat = null;
    live.pet.treatPutAway();
  }
});

liveInput.addEventListener('change', () => {
  stop();

  if (liveInput.checked) {
    startLive();
    play.disabled = true;
    timer = window.setInterval(tickLive, 1000 / FRAMES_PER_SECOND);
  } else {
    live = null;
    play.disabled = false;
    mood.value = '';
    draw();
  }
});

play.addEventListener('click', () => {
  if (timer !== undefined) {
    stop();
    return;
  }

  play.textContent = 'Stop';
  timer = window.setInterval(advance, 1000 / FRAMES_PER_SECOND);
});

for (const control of [breedSelect, coloursSelect]) {
  control.addEventListener('change', () => {
    if (live) {
      startLive();
    }

    draw();
  });
}

for (const control of [ageInput, yawInput, frameInput]) {
  control.addEventListener('input', draw);
}

animationSelect.addEventListener('change', () => {
  scriptSelect.value = '';
  chooseSequence();
});
scriptSelect.addEventListener('change', chooseSequence);

async function start(files: GameFiles) {
  gameFiles = files;
  header = parseBhd(await files.read('DOGZ.DOG/DATA/ALL_PTZ.BHD'));

  for (let index = 0; index < header.animations.length; index++) {
    allFrames.push(
      ...parseAnimation(header, index, await files.read(`DOGZ.DOG/DATA/${index}.BDT`))
    );
  }

  const engine = parseNe(await files.read('WINDOWS/DOGZDLL.DLL'));
  palettes.set(256, readPalette(engine, PALETTE_256, 256));
  palettes.set(16, readPalette(engine, PALETTE_16, 16));

  const states = readStateNames(engine);
  scripts = parseScripts(await files.read('DOGZ.DOG/DATA/ALL_PTZ.SCP'), readOpcodes(engine));

  const tricks = parseTricks(await files.read('DOGZ.DOG/TRICKS.TDT'));
  engineStateNames = readEngineStateNames(engine);
  bodyAreas = readBodyAreas(engine, header.ballCount);
  petData = {
    scripts,
    table: transitionTable(scripts),
    positionKinds: readPositionKinds(engine, states.length),
    tricks: tricks.current,
    trickDefaults: tricks.defaults,
    trickScripts: readTrickScripts(engine),
    engineScripts: readEngineScripts(engine),
  };
  scripts.forEach((script, index) =>
    scriptSelect.add(
      new Option(
        `${index}: ${states[script.from] ?? script.from} to ${states[script.to] ?? script.to}`,
        String(index)
      )
    )
  );

  const lnz = files
    .list()
    .filter((path) => /(^|[\\/])DATA[\\/][^\\/]+\.LNZ$/i.test(path))
    .sort();

  for (const path of lnz) {
    const name = path
      .split(/[\\/]/)
      .pop()!
      .replace(/\.LNZ$/i, '');
    const text = new TextDecoder('latin1').decode(await files.read(path));
    breeds.set(name, parseLnz(text, header.ballCount));
    breedSelect.add(new Option(name, name));
  }

  header.animations.forEach(({ start: first, end }, index) =>
    animationSelect.add(new Option(`${index} (${end - first} frames)`, String(index)))
  );

  status.textContent = `${breeds.size} breeds, ${header.animations.length} animations and ${scripts.length} scripts, from ${files.source}.`;
  choose.hidden = true;
  chooseSequence();
}

picker.addEventListener('change', () => {
  if (picker.files?.length) {
    allFrames = [];
    start(chosenFiles(picker.files)).catch((error) => (status.textContent = error.message));
  }
});

oracleFiles()
  .then((found) => {
    if (found) {
      return start(found);
    }

    status.textContent = "The game's files are not here.";
    choose.hidden = false;
  })
  .catch((error) => (status.textContent = error.message));
