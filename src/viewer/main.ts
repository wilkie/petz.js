/**
 * The viewer: any breed in any frame of any animation, drawn from the game's
 * own files. A first look at the dog, and the place to compare a drawing
 * with the oracle's.
 */

import { chosenFiles, type GameFiles, oracleFiles } from '../files.js';
import {
  type AnimationHeader,
  type Frame,
  parseAnimation,
  parseBhd,
} from '../formats/animation.js';
import { type Breed, parseLnz } from '../formats/lnz.js';
import { drawPet } from '../render/ballz.js';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = element<HTMLParagraphElement>('status');
const choose = element<HTMLParagraphElement>('choose');
const picker = element<HTMLInputElement>('picker');
const breedSelect = element<HTMLSelectElement>('breed');
const animationSelect = element<HTMLSelectElement>('animation');
const frameInput = element<HTMLInputElement>('frame');
const frameNumber = element<HTMLOutputElement>('frame-number');
const play = element<HTMLButtonElement>('play');
const canvas = element<HTMLCanvasElement>('stage');
const context = canvas.getContext('2d')!;

/** Dogz plays its animations at about this many frames a second. Not yet measured. */
const FRAMES_PER_SECOND = 12;

let files: GameFiles;
let header: AnimationHeader;
const breeds = new Map<string, Breed>();
const animations = new Map<number, Frame[]>();
let timer: number | undefined;

async function frames(index: number) {
  let list = animations.get(index);

  if (!list) {
    list = parseAnimation(header, index, await files.read(`DATA/${index}.BDT`));
    animations.set(index, list);
  }

  return list;
}

async function draw() {
  const breed = breeds.get(breedSelect.value)!;
  const list = await frames(Number(animationSelect.value));
  const index = Math.min(Number(frameInput.value), list.length - 1);

  frameInput.max = String(list.length - 1);
  frameNumber.value = `${index} of ${list.length}`;

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawPet(context, breed, header, list[index], { scale: 1.5, originX: 320, originY: 300 });
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
  timer = window.setInterval(() => {
    frameInput.value = String((Number(frameInput.value) + 1) % (Number(frameInput.max) + 1));
    void draw();
  }, 1000 / FRAMES_PER_SECOND);
});

breedSelect.addEventListener('change', () => void draw());
frameInput.addEventListener('input', () => void draw());
animationSelect.addEventListener('change', () => {
  frameInput.value = '0';
  void draw();
});

async function start(found: GameFiles) {
  files = found;
  header = parseBhd(await files.read('DATA/ALL_PTZ.BHD'));

  const lnz = files
    .list()
    .filter((path) => /^DATA[\\/][^\\/]+\.LNZ$/i.test(path))
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

  status.textContent = `${breeds.size} breeds and ${header.animations.length} animations, from ${files.source}.`;
  choose.hidden = true;
  await draw();
}

picker.addEventListener('change', () => {
  if (picker.files?.length) {
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
