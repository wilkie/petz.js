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
import { drawPet } from '../render/ballz.ts';
import { extendFrames } from '../render/extend.ts';
import { IndexedBitmap } from '../render/raster.ts';
import { chosenFiles, type GameFiles, oracleFiles } from '../files.ts';
import { type CatzPositions, catzTimeline } from '../behaviour/catz-timeline.ts';
import {
  catzArity,
  parseScripts,
  readCatzOpcodes,
  type Script,
  SCRIPTS,
} from '../formats/script.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element<HTMLParagraphElement>('status');
const choose = element<HTMLParagraphElement>('choose');
const picker = element<HTMLInputElement>('picker');
const breedSelect = element<HTMLSelectElement>('breed');
const kittenInput = element<HTMLInputElement>('kitten');
const kittenValue = element<HTMLOutputElement>('kitten-value');
const animationSelect = element<HTMLSelectElement>('animation');
const scriptSelect = element<HTMLSelectElement>('script');
const frameInput = element<HTMLInputElement>('frame');
const frameNumber = element<HTMLOutputElement>('frame-number');
const yawInput = element<HTMLInputElement>('yaw');
const playButton = element<HTMLButtonElement>('play');
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

/** The frames shown, numbered over every animation: an animation's, or a script's played out. */
let sequence: number[] = [];

/** The breed chosen, averaged toward its kitten's file by the slider. */
function breed() {
  const { adult, kitten } = files.get(breedSelect.value)!;
  return averageBreed(adult, kitten, Number(kittenInput.value));
}

function draw() {
  const cat = breed();
  const at = sequence[Number(frameInput.value)] ?? 0;
  const bitmap = new IndexedBitmap(320, 240);

  drawPet(bitmap, cat, header, extendFrames(frames, cat)[at], {
    colours: 256,
    originX: 160,
    originY: 150,
    age: 100,
    yaw: Number(yawInput.value),
    order,
    translate,
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

/** The steps a script plays out as, a variant at random each time, its reference frames not shown. */
function playOut(index: number) {
  const random = (n: number) => Math.floor(Math.random() * n);
  return catzTimeline(scripts, positions, index, {
    flags: (frame) => frames[frame]?.tag ?? 3,
    random,
    limit: 600,
  })
    .filter((step) => !step.reference)
    .map((step) => step.frame);
}

function chooseAnimation() {
  if (scriptSelect.value === '') {
    const { start, end } = header.animations[Number(animationSelect.value)];
    sequence = Array.from({ length: end - start }, (_, n) => start + n);
  } else {
    sequence = playOut(Number(scriptSelect.value));
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
    .filter((path) => /[\\/]CAT[\\/]RESOURCE[\\/]A\w+\.LNZ$/i.test(path))
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
      .replace(/^A|\.LNZ$/gi, '');
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
    const played = playOut(index);

    if (played.length && played.every((frame) => frame < frames.length)) {
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
playButton.addEventListener('click', play);

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
