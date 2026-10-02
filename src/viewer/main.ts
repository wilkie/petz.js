/**
 * The viewer: any breed playing any animation, or any of the scripts that
 * chain animations into what the dog does, drawn from the game's own files
 * as the game draws it. A first look at the dog, and the place to compare a
 * drawing with the oracle's.
 */

import { Brain, type BrainMapping } from '../behaviour/brain.ts';
import { Pet, type PetData } from '../behaviour/pet.ts';
import { borlandRand } from '../behaviour/random.ts';
import {
  BALL_SIZE,
  ballRect,
  bowlPicture,
  FOOD,
  type Food,
  foodSize,
  isTreat,
  keepOnStage,
  Stage,
} from '../behaviour/stage.ts';
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
  BALL_PICTURE,
  readBodyAreas,
  BOWL_PICTURE,
  TREAT_PICTURE,
  readBrainMap,
  readEngineScripts,
  readEngineStateNames,
  readPicture,
  readPositionKinds,
  readTrickScripts,
} from '../formats/engine.ts';
import type { Dib } from '../formats/dib.ts';
import { type Breed, parseLnz, readFactors } from '../formats/lnz.ts';
import { parseNe } from '../formats/ne.ts';
import { type Colour, PALETTE_16, PALETTE_256, readPalette } from '../formats/palette.ts';
import { parseScripts, readOpcodes, readStateNames, type Script } from '../formats/script.ts';
import { type BrainFile, parseBrain } from '../formats/brain.ts';
import { parseTricks } from '../formats/tricks.ts';
import { drawPet } from '../render/ballz.ts';
import { drawPicture, mapColours } from '../render/picture.ts';
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

/**
 * Dogz's own pixels, drawn this many times larger to be seen; live, the
 * stage is Dogz's own 640 by 480 screen, drawn at its size, as the dog
 * walks and throws as far as it does in the game.
 */
let zoom = 2;

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
let ballPicture: Dib;
let treatPictures: Dib[] = [];

/** The food and water bowls' pictures: full, half, empty, and the rim. */
let bowlPictures: Dib[][] = [];

/** The brain, as the game's file has it, then as the live dog has learned; and how the engine maps it. */
let brainFile: BrainFile | null = null;
let brainMap: BrainMapping[] = [];
let live: { pet: Pet; stage: Stage; started: number } | null = null;

/** The stage, in Dogz's own pixels. */
const STAGE = { width: canvas.width / zoom, height: canvas.height / zoom };

function setZoom(to: number) {
  zoom = to;
  STAGE.width = canvas.width / zoom;
  STAGE.height = canvas.height / zoom;
}

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

/**
 * Draws a frame at a place on the stage, turned so far, and shows it; live,
 * with the ball and the treat, in front of the dog or behind it, or held
 * or eaten by it, as the engine draws them.
 */
function drawDog(
  frameNumber: number,
  originX: number,
  originY: number,
  yaw: number,
  stage?: Stage
) {
  const breed = breeds.get(breedSelect.value)!;
  const colours = Number(coloursSelect.value) as 256 | 16;
  const palette = palettes.get(colours)!;
  const bitmap = new IndexedBitmap(STAGE.width, STAGE.height);
  const ball = stage?.ball;
  const foods = stage?.foods ?? [];
  const draw = (picture: Dib, at: { x: number; y: number }) => {
    const { left, top } = ballRect({ x: Math.trunc(at.x), y: Math.trunc(at.y) }, picture);
    drawPicture(bitmap, picture, mapColours(picture, palette), left, top);
  };

  /* What is on the stage, by itself, and what is drawn with the dog. */
  const loose: [Dib, { x: number; y: number }][] = [];
  let inMouth: (chin: { x: number; y: number }) => void = () => {};
  let underHead: (() => void) | undefined;

  if (ball?.slot === null) {
    loose.push([ballPicture, ball]);
  } else if (ball) {
    /* At the chin, or under a paw at the toe (`BallSprite::StaticDrawMouth`, `StaticDrawFoot`). */
    inMouth = (chin) => draw(ballPicture, ball.slot === 0 ? chin : stage!.ballOnStage(45));
  }

  let overHead: (() => void) | undefined;

  for (const food of foods) {
    /* A bowl shows how much is left; its fourth picture is its rim (`0x180`). */
    const picture = isTreat(food)
      ? treatPictures[food.kind - FOOD.blueTreat]
      : bowlPictures[food.kind][bowlPicture(food)];

    if (food.inMouth) {
      /* At the chin (`FoodSprite::StaticDrawGrab`). */
      inMouth = (chin) => draw(picture, chin);
    } else if (food.beingEaten) {
      /* Where it lies, under the head, and a bowl's rim over it (`StaticDraw`, `StaticDrawFront`). */
      underHead = () => draw(picture, food);

      if (!isTreat(food)) {
        overHead = () => draw(bowlPictures[food.kind][3], food);
      }
    } else {
      loose.push([picture, food]);
    }
  }

  /*
   * Facing the user, within 0x41 of it, the dog is drawn under what is
   * loose on the stage; otherwise over it (`GrabSprite::Update`, seg20:018c).
   */
  const front = Math.abs(yaw) < 0x41;

  if (!front) {
    loose.forEach(([picture, at]) => draw(picture, at));
  }

  drawPet(bitmap, breed, header, allFrames[frameNumber], {
    colours,
    originX,
    originY,
    age: Number(ageInput.value),
    yaw,
    seed: frameNumber + 1,
    bonus: { ball: 51, draw: inMouth },
    underHead,
    overHead,
  });

  if (front) {
    loose.forEach(([picture, at]) => draw(picture, at));
  }

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

  /* One stream of random numbers, as the engine has, for the dog and its brain. */
  const rand = borlandRand(Date.now());

  /* A dog started again keeps what its brain has learned, as the game keeps it in the file. */
  if (live?.pet.brain) {
    brainFile = live.pet.brain.toFile();
  }

  const brain = brainFile ? new Brain(brainFile, brainMap, rand) : undefined;
  const pet = new Pet(
    {
      ...petData,
      tricks: structuredClone(petData.tricks),
      flags: (frame) => allFrames[frame]?.tag ?? 3,
      brain,
    },
    stage,
    rand,
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
  drawDog(step.frame, stage.x, stage.y, step.rotation, stage);

  if (soundInput.checked) {
    for (const sound of step.sounds ?? []) {
      void playSound(breed, sound);
    }
  }

  const brain = pet.brain;
  const wants = brain && pet.brainActive ? `, wants ${brain.file.desires[brain.situation()]}` : '';
  mood.value = `${engineStateNames[step.state] ?? step.state}, excitement ${pet.factor(0)}${
    pet.global === 0x3f3 ? `, petted ${pet.pettingLevel}` : ''
  }${wants}`;
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

  for (const food of live.stage.foods) {
    if (food.held) {
      Object.assign(food, keepOnStage(point, foodSize(food), STAGE.width, STAGE.height));
    }
  }
});

canvas.addEventListener('mouseleave', () => {
  if (live) {
    /* The cursor off the stage is still where it left it, to the engine. */
    live.stage.pointer = { ...live.stage.pointer, button: false };
  }
});

/**
 * A click puts down the food held, or picks up the ball or a food put down,
 * as `GrabSprite::Update` lets the user; otherwise the button is held to pet.
 */
canvas.addEventListener('mousedown', (event) => {
  if (!live) {
    return;
  }

  const point = stagePoint(event);
  const { stage, pet } = live;

  /* Anywhere on its picture's rectangle (`GrabSprite::Update`, `XPointInXRect`). */
  const on = (at: { x: number; y: number }, size: { width: number; height: number }) => {
    const rect = ballRect(at, size);
    return (
      point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
    );
  };

  const held = stage.foods.find((food) => food.held);
  const under = [...stage.foods]
    .reverse()
    .find((food) => !food.inMouth && !food.held && on(food, foodSize(food)));
  stage.pointer = { ...point, button: true };

  const ball = stage.ball;

  if (ball && !ball.held && on(ball, BALL_SIZE)) {
    /* Picked up, even out of the dog's mouth. */
    ball.held = true;
    ball.slot = null;
    ball.x = point.x;
    ball.y = point.y;
    pet.ballPickedUp();
  } else if (held) {
    held.held = false;
    pet.foodPutDown(held);
  } else if (under) {
    under.held = true;
    pet.foodPickedUp(under);
  }
});

/** Letting go of the button throws the ball held, at the speed the cursor last moved. */
window.addEventListener('mouseup', () => {
  if (live) {
    live.stage.pointer = { ...live.stage.pointer, button: false };

    if (live.stage.ball?.held) {
      live.stage.ball.held = false;
      live.pet.ballThrown();
    }
  }
});

/** Each food comes out of the box held, where the cursor is; the one held before goes back. */
for (const [kind, button] of ['food', 'water', 'blue', 'green', 'red'].entries()) {
  element<HTMLButtonElement>(`food-${button}`).addEventListener('click', () => {
    if (!live) {
      return;
    }

    if (live.stage.ball?.held) {
      putBallAway();
    }

    putFoodAway((food) => food.held || food.kind === kind);
    const { x, y } = live.stage.pointer;
    const food: Food = { kind, held: true, x, y, servings: 0, full: 0, touched: 0 };
    live.stage.foods.push(food);
    live.pet.foodTakenOut(food);
  });
}

element<HTMLButtonElement>('food-away').addEventListener('click', () =>
  putFoodAway((food) => food === live?.stage.foods.at(-1))
);

function putFoodAway(which: (food: Food) => boolean) {
  for (const food of live?.stage.foods.filter(which) ?? []) {
    live!.stage.putAwayFood(food);
    live!.pet.foodPutAway();
  }
}

function putBallAway() {
  if (live?.stage.ball) {
    live.stage.ball = null;
    live.pet.ballPutAway();
  }
}

/** The ball comes out held, at rest where the cursor is; a treat out is put away first. */
element<HTMLButtonElement>('ball-out').addEventListener('click', () => {
  if (!live) {
    return;
  }

  putFoodAway((food) => food.held);
  const { x, y } = live.stage.pointer;
  live.stage.ball = { x, y, vx: 0, vy: 0, held: true, slot: null, recorded: null };
  live.pet.ballPickedUp();
});

element<HTMLButtonElement>('ball-away').addEventListener('click', putBallAway);

liveInput.addEventListener('change', () => {
  stop();

  if (liveInput.checked) {
    setZoom(1);
    startLive();
    play.disabled = true;
    timer = window.setInterval(tickLive, 1000 / FRAMES_PER_SECOND);
  } else {
    live = null;
    setZoom(2);
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
  ballPicture = readPicture(engine, BALL_PICTURE);
  treatPictures = [0, 1, 2].map((colour) => readPicture(engine, TREAT_PICTURE + colour));
  bowlPictures = [0, 1].map((kind) =>
    [0, 1, 2, 3].map((n) => readPicture(engine, BOWL_PICTURE + 10 * kind + n))
  );
  brainMap = readBrainMap(engine);

  try {
    brainFile = parseBrain(await files.read('DOGZ.DOG/BRAIN.PBT'));
  } catch {
    brainFile = null;
  }
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
