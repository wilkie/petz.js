/**
 * The viewer: any breed playing any animation, or any of the scripts that
 * chain animations into what the dog does, drawn from the game's own files
 * as the game draws it. A first look at the dog, and the place to compare a
 * drawing with the oracle's.
 */

import { DEFAULT_GLUE, type Step, timeline } from '../behaviour/timeline.ts';
import { chosenFiles, type GameFiles, oracleFiles } from '../files.ts';
import {
  type AnimationHeader,
  type Frame,
  parseAnimation,
  parseBhd,
} from '../formats/animation.ts';
import { type Breed, parseLnz } from '../formats/lnz.ts';
import { parseNe } from '../formats/ne.ts';
import { type Colour, PALETTE_16, PALETTE_256, readPalette } from '../formats/palette.ts';
import { parseScripts, readOpcodes, readStateNames, type Script } from '../formats/script.ts';
import { ballAt, drawPet } from '../render/ballz.ts';
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
const canvas = element<HTMLCanvasElement>('stage');
const context = canvas.getContext('2d')!;

/** Dogz plays its frames at about this many a second. Not yet measured. */
const FRAMES_PER_SECOND = 12;

/** Dogz's own pixels, drawn this many times larger to be seen. */
const ZOOM = 2;

let header: AnimationHeader;
const breeds = new Map<string, Breed>();
const palettes = new Map<256 | 16, Colour[]>();

/** Every frame of every animation, numbered over them all, as the scripts number them. */
let allFrames: Frame[] = [];
let scripts: Script[] = [];

/** What is being shown: frames by their numbers over every animation, and what happens with each. */
let sequence: Step[] = [];
let timer: number | undefined;

/** Where the dog has walked to, from the stage's middle, and how far it has turned. */
let offset = { x: 0, y: 0 };
let turned = 0;

let gameFiles: GameFiles;

function draw() {
  const breed = breeds.get(breedSelect.value)!;
  const index = Math.min(Number(frameInput.value), sequence.length - 1);
  const frame = allFrames[sequence[index].frame];
  const colours = Number(coloursSelect.value) as 256 | 16;
  const bitmap = new IndexedBitmap(canvas.width / ZOOM, canvas.height / ZOOM);

  frameInput.max = String(sequence.length - 1);
  frameNumber.value = `${index + 1} of ${sequence.length}, frame ${sequence[index].frame}`;

  /* Off one side of the stage, the dog comes back on at the other. */
  const wrap = (value: number, size: number) =>
    ((((value + size / 2) % size) + size) % size) - size / 2;
  offset = { x: wrap(offset.x, bitmap.width), y: wrap(offset.y, bitmap.height) };

  drawPet(bitmap, breed, header, frame, {
    colours,
    originX: bitmap.width / 2 + offset.x,
    originY: (bitmap.height * 5) / 8 + offset.y,
    age: Number(ageInput.value),
    yaw: Number(yawInput.value) + turned,
    seed: sequence[index].frame + 1,
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
    const { start, end } = header.animations[Number(animationSelect.value)];
    sequence = Array.from({ length: end - start }, (_, n) => ({ frame: start + n }));
  } else {
    const index = Number(scriptSelect.value);
    const next = random(Date.now());
    const variant = next(scripts[index].variants.length);

    sequence = timeline(scripts, index, variant, {
      flags: (frame) => allFrames[frame]?.tag ?? 3,
      random: next,
      limit: 600,
    });
  }

  draw();
}

/**
 * Moves on a step, as the game does between frames: turns the dog, keeps a
 * glued ball where it was, and plays the step's sounds. Round from the last
 * step to the first, the belly is glued, as one script is to the next.
 */
function advance() {
  const breed = breeds.get(breedSelect.value)!;
  const from = Number(frameInput.value);
  const to = (from + 1) % sequence.length;
  const step = to === 0 ? { ...sequence[0], glue: sequence[0].glue ?? DEFAULT_GLUE } : sequence[to];
  const options = { age: Number(ageInput.value), yaw: Number(yawInput.value) + turned };

  if (step.glue !== undefined && scriptSelect.value !== '') {
    const before = ballAt(breed, header, allFrames[sequence[from].frame], step.glue, options);
    turned += step.turn ?? 0;
    const after = ballAt(breed, header, allFrames[step.frame], step.glue, {
      ...options,
      yaw: Number(yawInput.value) + turned,
    });

    offset = { x: offset.x + before.x - after.x, y: offset.y + before.y - after.y };
  } else {
    turned += step.turn ?? 0;
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

play.addEventListener('click', () => {
  if (timer !== undefined) {
    stop();
    return;
  }

  play.textContent = 'Stop';
  timer = window.setInterval(advance, 1000 / FRAMES_PER_SECOND);
});

for (const control of [breedSelect, coloursSelect]) {
  control.addEventListener('change', draw);
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
