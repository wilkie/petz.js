/**
 * Matching the reimplementation's drawing of a held dog against a picture of
 * the oracle's screen: finding the dog in the picture, drawing it as the
 * reimplementation would from the same files, lining the two up, and
 * counting the pixels that differ. What `probe.mjs` measures with; pure, so
 * the tests can run it on pictures they make.
 */

import {
  parseAnimation,
  parseBhd,
  type AnimationHeader,
  type Frame,
} from '../../src/formats/animation.ts';
import { averageBreed, type Breed, parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import {
  catzIdealPalette,
  catzTranslation,
  CATZ_PALETTE_TYPE,
  PALETTE_16,
  PALETTE_256,
  readPalette,
  screenPalette,
  screenPalette16,
} from '../../src/formats/palette.ts';
import { catzShade, drawPet } from '../../src/render/ballz.ts';
import { extendFrames } from '../../src/render/extend.ts';
import { FIDELITY, setFidelity } from '../../src/render/fidelity.ts';
import { IndexedBitmap } from '../../src/render/raster.ts';

export const WIDTH = 640;
export const HEIGHT = 480;

/** The playpen's ground in a `--plain` variant. */
const MAGENTA = 0xff00ff;

/** Windows' light grey, as the oracle's displays show it — 256 colours, then 16: a window's face. */
const WINDOW_GREYS = new Set([0xc3c3c3, 0xc3c7cb]);

type Box = { left: number; top: number; right: number; bottom: number };

/** Dogz's hand cursor, where Windows leaves the pointer every session: nothing is compared under it. */
export const HAND: Box = { left: 311, top: 224, right: 341, bottom: 251 };

const under = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/** A screen's pixels, three bytes each, 640 by 480. */
export type Rgb = Uint8Array;

/** A colour as the VGA shows it: six bits a channel, widened again (`v << 2 | v >> 4`). */
export function shown(value: number) {
  const six = value >> 2;
  return (six << 2) | (six >> 4);
}

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** The oracle's dog in a picture: each of its pixels' colour, packed, or -1. */
export interface Dog {
  pixels: Int32Array;
  box: { left: number; top: number; right: number; bottom: number };
  count: number;

  /** The playpen's inside: a drawing is only compared within it. */
  inside: Box;

  /** Windows over the playpen: nothing is compared under them. */
  hidden: Box[];

  /** Which of the dog's sides the playpen's edge cuts off. */
  cut: { left: boolean; top: boolean; right: boolean; bottom: boolean };

  /** Pixels the picture cannot say anything of, 1 each: for a cat, what its basket hides. */
  masked?: Uint8Array;
}

/**
 * Finds the dog: the largest patch of pixels other than the magenta ground,
 * within the ground's own box — the playpen's inside — joined side to side.
 * The hand and anything else apart from it are left out. Null when there is
 * hardly any ground: Windows busy, or WinG timing the display.
 */
export function findDog(rgb: Rgb, hand: Box | null = HAND): Dog | null {
  const at = (index: number) => pack(rgb[3 * index], rgb[3 * index + 1], rgb[3 * index + 2]);
  const neighbours = (index: number) => {
    const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
    return [
      x + 1 < WIDTH ? index + 1 : -1,
      x > 0 ? index - 1 : -1,
      y + 1 < HEIGHT ? index + WIDTH : -1,
      y > 0 ? index - WIDTH : -1,
    ].filter((next) => next >= 0);
  };

  /* The dog's own pixels are joined corner to corner too: a thin line, as a
   * tail's, may touch the rest of the dog only so. */
  const around = (index: number) => {
    const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
    const near: number[] = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [nx, ny] = [x + dx, y + dy];

        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < WIDTH && ny < HEIGHT) {
          near.push(ny * WIDTH + nx);
        }
      }
    }

    return near;
  };

  /* The ground: the largest stretch of magenta, side to side (icons have some too). */
  const seen = new Uint8Array(WIDTH * HEIGHT);
  let ground = { size: 0, left: 0, top: 0, right: -1, bottom: -1 };

  for (let start = 0; start < WIDTH * HEIGHT; start++) {
    if (seen[start] || at(start) !== MAGENTA) {
      continue;
    }

    const stack = [start];
    seen[start] = 1;
    const box = { size: 0, left: WIDTH, top: HEIGHT, right: -1, bottom: -1 };

    while (stack.length) {
      const index = stack.pop()!;
      const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
      box.size++;
      [box.left, box.top, box.right, box.bottom] = [
        Math.min(box.left, x),
        Math.min(box.top, y),
        Math.max(box.right, x),
        Math.max(box.bottom, y),
      ];

      for (const next of neighbours(index)) {
        if (!seen[next] && at(next) === MAGENTA) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    if (box.size > ground.size) {
      ground = box;
    }
  }

  if (ground.size < 20000) {
    return null;
  }

  const { left, top, right, bottom } = ground;

  /* Patches of what is not ground, by a flood fill: the dog, the hand, and
   * windows over the playpen (the tool panel), told by their grey. */
  const patch = new Int32Array(WIDTH * HEIGHT).fill(-1);
  const hidden: Box[] = hand ? [hand] : [];
  const covered = (index: number) =>
    hand !== null && under(hand, index % WIDTH, Math.trunc(index / WIDTH));
  let best = { id: -1, size: 0 };

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const start = y * WIDTH + x;

      if (patch[start] !== -1 || at(start) === MAGENTA || covered(start)) {
        continue;
      }

      const stack = [start];
      patch[start] = start;
      const box = { left: x, top: y, right: x, bottom: y };
      let [size, grey] = [0, 0];

      while (stack.length) {
        const index = stack.pop()!;
        const [px, py] = [index % WIDTH, Math.trunc(index / WIDTH)];
        size++;
        grey += WINDOW_GREYS.has(at(index)) ? 1 : 0;
        [box.left, box.top, box.right, box.bottom] = [
          Math.min(box.left, px),
          Math.min(box.top, py),
          Math.max(box.right, px),
          Math.max(box.bottom, py),
        ];

        for (const next of around(index)) {
          const [nx, ny] = [next % WIDTH, Math.trunc(next / WIDTH)];

          if (nx >= left && nx <= right && ny >= top && ny <= bottom && patch[next] === -1) {
            if (at(next) !== MAGENTA && !covered(next)) {
              patch[next] = start;
              stack.push(next);
            }
          }
        }
      }

      if (grey >= 20) {
        hidden.push(box);
      } else if (size > best.size) {
        best = { id: start, size };
      }
    }
  }

  if (best.id === -1) {
    return null;
  }

  const pixels = new Int32Array(WIDTH * HEIGHT).fill(-1);
  const box = { left: WIDTH, top: HEIGHT, right: -1, bottom: -1 };

  for (let index = 0; index < WIDTH * HEIGHT; index++) {
    if (patch[index] === best.id) {
      pixels[index] = at(index);
      const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
      box.left = Math.min(box.left, x);
      box.top = Math.min(box.top, y);
      box.right = Math.max(box.right, x);
      box.bottom = Math.max(box.bottom, y);
    }
  }

  /* Cut off by the playpen's edge, or by a window or the hand beside the
   * dog or over part of it, reaching past that side of it. */
  const across = (w: Box) => w.top <= box.bottom && w.bottom >= box.top;
  const along = (w: Box) => w.left <= box.right && w.right >= box.left;
  const cut = {
    left:
      box.left <= left ||
      hidden.some((w) => across(w) && w.left < box.left && w.right + 1 >= box.left),
    top:
      box.top <= top || hidden.some((w) => along(w) && w.top < box.top && w.bottom + 1 >= box.top),
    right:
      box.right >= right ||
      hidden.some((w) => across(w) && w.right > box.right && w.left - 1 <= box.right),
    bottom:
      box.bottom >= bottom ||
      hidden.some((w) => along(w) && w.bottom > box.bottom && w.top - 1 <= box.bottom),
  };
  return { pixels, box, count: best.size, inside: { left, top, right, bottom }, hidden, cut };
}

/** What the reimplementation draws a held dog from: a variant's own files. */
export interface Scene {
  breed: Breed;
  header: AnimationHeader;
  frame: Frame;

  /** The screen's palette as the VGA shows it, packed. */
  colours: Int32Array;
  age: number;

  /** How many levels the fur bristles, a session's state: added to every ball's fuzz. */
  bristle: number;

  /** Whether the screen's bitmap is bottom-up, as WinG recommended it on the variant's display. */
  bottomUp: boolean;

  /** The display's colours: 16 with Windows' own VGA driver, else 256. */
  depth: 256 | 16;

  /** Catz's translation of colours into the screen's (`catzTranslation`). */
  translate?: (colour: number) => number;

  /** Every colour a Catz cat could be drawn in, as the screen shows it, packed. */
  possible?: Set<number>;
}

/**
 * Whether WinG made the screen's bitmap bottom-up, by the newest of its
 * timings of the display in WIN.INI (keyed by the DOS date it timed it on):
 * the next to last character of the timing, 0 for bottom-up, 1 for top-down.
 */
export function bottomUpFromWinIni(winIni: string) {
  const timings = [...winIni.matchAll(/^.*-([0-9A-F]{4})-[\d.]+=\w*([01])F\s*$/gim)];

  if (!timings.length) {
    return true;
  }

  const newest = timings.reduce((a, b) => (parseInt(b[1], 16) > parseInt(a[1], 16) ? b : a));
  return newest[2] === '0';
}

/** Which cat, for a Catz variant: its adult breed file, and how far toward its kitten's (`averageBreed`). */
export interface CatChoice {
  breed: string;
  percent: number;
}

/** The scene for a frame of a variant, its files read by `read` (paths under its drive). */
export function loadScene(
  read: (path: string) => Uint8Array,
  frame: number,
  age: number,
  bristle = 0,
  cat?: CatChoice
): Scene {
  if (cat) {
    return loadCatScene(read, frame, age, bristle, cat);
  }

  const bottomUp = bottomUpFromWinIni(new TextDecoder('latin1').decode(read('WINDOWS/WIN.INI')));
  const ini = new TextDecoder('latin1').decode(read('DOGZ.DOG/DOGZ.INI'));
  const pet = /^Your Pet=\.\\data\\(\w+)\.lnz/im.exec(ini)?.[1] ?? 'bigdog';
  const header = parseBhd(read('DOGZ.DOG/DATA/ALL_PTZ.BHD'));
  const frames = header.animations.flatMap((_, n) =>
    parseAnimation(header, n, read(`DOGZ.DOG/DATA/${n}.BDT`))
  );
  const breed = parseLnz(
    new TextDecoder('latin1').decode(read(`DOGZ.DOG/DATA/${pet.toUpperCase()}.LNZ`)),
    header.ballCount
  );
  const system = new TextDecoder('latin1').decode(read('WINDOWS/SYSTEM.INI'));
  const depth = /^display\.drv=vga\.drv/im.test(system) ? 16 : 256;
  const engine = parseNe(read('WINDOWS/DOGZDLL.DLL'));
  const palette =
    depth === 16
      ? screenPalette16(readPalette(engine, PALETTE_16, 16), {
          driverColours: FIDELITY.driverColours,
        })
      : screenPalette(readPalette(engine, PALETTE_256, 256), {
          driverColours: FIDELITY.driverColours,
        });
  const colours = Int32Array.from(palette, ([r, g, b]) => pack(shown(r), shown(g), shown(b)));
  return {
    breed,
    header,
    frame: extendFrames(frames, breed)[frame],
    colours,
    age,
    bristle,
    depth,
    bottomUp,
  };
}

/**
 * A Catz variant's scene: the cat's breed averaged with its kitten's, the
 * animations the demo ships (the first 98, numbered from the first), and
 * CATZDLL.DLL's palette, on 256 colours.
 */
/** What every frame's scene of a cat shares, read once for each drive's reader and cat. */
const catShared = new WeakMap<
  object,
  Map<string, Omit<Scene, 'frame' | 'age' | 'bristle'> & { frames: Frame[] }>
>();

function loadCatScene(
  read: (path: string) => Uint8Array,
  frame: number,
  age: number,
  bristle: number,
  cat: CatChoice
): Scene {
  const forDrive = catShared.get(read) ?? new Map();
  catShared.set(read, forDrive);
  const key = `${cat.breed}/${cat.percent}`;
  const shared = forDrive.get(key) ?? readCat(read, cat);
  forDrive.set(key, shared);
  const { frames, ...rest } = shared;

  return { ...rest, frame: frames[frame], age, bristle };
}

/** A cat's files read: its frames, shaped by its breed, and the palette and colours to draw it in. */
function readCat(read: (path: string) => Uint8Array, cat: CatChoice) {
  const text = (path: string) => new TextDecoder('latin1').decode(read(path));
  const resource = 'CATZ.DOG/PTZFILES/CAT/RESOURCE';
  const header = parseBhd(read(`${resource}/CAT.BHD`));
  const frames: Frame[] = [];

  for (let n = 0; n < header.animations.length; n++) {
    let data: Uint8Array;

    try {
      data = read(`${resource}/CAT${n}.BDT`);
    } catch {
      break;
    }

    frames.push(...parseAnimation(header, n, data));
  }

  const adult = parseLnz(text(`${resource}/A${cat.breed.toUpperCase()}.LNZ`), header.ballCount);
  const little = adult.catz?.littleOne ?? `K${cat.breed}.LNZ`;
  const young = parseLnz(text(`${resource}/${little.toUpperCase()}`), header.ballCount);
  const breed = averageBreed(adult, young, cat.percent);
  const engine = parseNe(read('WINDOWS/SYSTEM/CATZDLL.DLL'));
  const own = readPalette(engine, PALETTE_256, 256, CATZ_PALETTE_TYPE);
  const palette = catzIdealPalette(own, { driverColours: FIDELITY.driverColours });
  const colours = Int32Array.from(palette, ([r, g, b]) => pack(shown(r), shown(g), shown(b)));
  const translate = catzTranslation(own);
  const screen = (n: number) => colours[n];
  const numbers = [
    ...breed.ballColor256,
    ...breed.lines.flatMap((line) => [line.colour ?? -1, line.leftColour ?? -1]),
  ].filter((n) => n >= 0);
  const possible = new Set([
    ...numbers.flatMap((n) =>
      Array.from({ length: 13 }, (_, s) => screen(translate(catzShade(n, s - 6))))
    ),
    ...[...breed.outlineColor, breed.pupilColor ?? 0]
      .filter((n) => n >= 0)
      .map((n) => screen(translate(n))),
    ...(breed.whiskers ?? []).map(({ colour }) => screen(colour)),
    screen(translate(0)),
  ]);

  return {
    breed,
    header,
    frames: extendFrames(frames, breed),
    colours,
    depth: 256 as const,
    bottomUp: bottomUpFromWinIni(text('WINDOWS/WIN.INI')),
    translate,
    possible,
  };
}

/**
 * Finds a cat: within `region`, the pixels of `rgb` that differ from
 * `background` -- a picture of the same playpen without it -- and are not
 * bright yellow, and, given `possible`, are in a colour the cat could be,
 * joined into patches and the largest kept. A basket with
 * its kitten out has its rim and handle drawn a brighter yellow than
 * without, so they differ too, and are told by that. Where the background is not the floor and
 * the picture shows no cat -- a basket's front, a label -- nothing can be
 * said, as the cat may be behind it, and it is masked.
 */
export function findCat(
  rgb: Rgb,
  background: Rgb,
  region: Box,
  possible?: Set<number>
): Dog | null {
  const at = (image: Rgb, index: number) =>
    pack(image[3 * index], image[3 * index + 1], image[3 * index + 2]);
  const inRegion = (x: number, y: number) =>
    x >= region.left && x <= region.right && y >= region.top && y <= region.bottom;
  /* The kitten's basket's rim and handle, redrawn brighter while it is out. */
  const wicker = (index: number) => {
    const [r, g, b] = [rgb[3 * index], rgb[3 * index + 1], rgb[3 * index + 2]];
    return r >= 200 && g >= 180 && b <= 64;
  };
  const counts = new Map<number, number>();

  for (let y = region.top; y <= region.bottom; y++) {
    for (let x = region.left; x <= region.right; x++) {
      const colour = at(background, y * WIDTH + x);
      counts.set(colour, (counts.get(colour) ?? 0) + 1);
    }
  }

  const floor = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const changed = new Uint8Array(WIDTH * HEIGHT);
  const masked = new Uint8Array(WIDTH * HEIGHT).fill(1);

  for (let y = region.top; y <= region.bottom; y++) {
    for (let x = region.left; x <= region.right; x++) {
      const index = y * WIDTH + x;
      const cat =
        at(rgb, index) !== at(background, index) &&
        !wicker(index) &&
        (!possible || possible.has(at(rgb, index)));
      changed[index] = cat ? 1 : 0;
      masked[index] = !cat && at(background, index) !== floor ? 1 : 0;
    }
  }

  /* The largest patch of changed pixels, joined corner to corner. */
  const patch = new Int32Array(WIDTH * HEIGHT).fill(-1);
  let best = { id: -1, size: 0 };

  for (let start = 0; start < WIDTH * HEIGHT; start++) {
    if (!changed[start] || patch[start] !== -1) {
      continue;
    }

    const stack = [start];
    patch[start] = start;
    let size = 0;

    while (stack.length) {
      const index = stack.pop()!;
      const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
      size++;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          const next = ny * WIDTH + nx;

          if (inRegion(nx, ny) && changed[next] && patch[next] === -1) {
            patch[next] = start;
            stack.push(next);
          }
        }
      }
    }

    if (size > best.size) {
      best = { id: start, size };
    }
  }

  if (best.id === -1) {
    return null;
  }

  const pixels = new Int32Array(WIDTH * HEIGHT).fill(-1);
  const box = { left: WIDTH, top: HEIGHT, right: -1, bottom: -1 };

  for (let index = 0; index < WIDTH * HEIGHT; index++) {
    if (patch[index] === best.id) {
      pixels[index] = at(rgb, index);
      const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
      [box.left, box.top, box.right, box.bottom] = [
        Math.min(box.left, x),
        Math.min(box.top, y),
        Math.max(box.right, x),
        Math.max(box.bottom, y),
      ];
    } else if (changed[index]) {
      /* A change apart from the cat, as the caption's: not compared. */
      masked[index] = 1;
    }
  }

  return {
    pixels,
    box,
    count: best.size,
    inside: region,
    hidden: [],
    masked,
    cut: {
      left: box.left <= region.left,
      top: box.top <= region.top,
      right: box.right >= region.right,
      bottom: box.bottom >= region.bottom,
    },
  };
}

const ORIGIN = { x: 320, y: 240 };

/** The draw order a held dog settles into, sorted again frame after frame as the engine does. */
export function settledOrder(scene: Scene, yaw: number) {
  const order: number[] = [];

  for (let n = 0; n < 20; n++) {
    draw(scene, yaw, order, 1);
  }

  return order;
}

/** A drawing: where each pixel drawn is, and its colour as the VGA shows it, packed. */
export interface Drawing {
  at: Int32Array;
  colour: Int32Array;
}

/** The reimplementation's drawing of the scene. */
export function draw(
  scene: Scene,
  yaw: number,
  order: number[],
  seed: number,
  { lids = 0 }: { lids?: number } = {}
): Drawing {
  const bitmap = new IndexedBitmap(WIDTH, HEIGHT);
  setFidelity({ bottomUp: scene.bottomUp });
  drawPet(bitmap, scene.breed, scene.header, scene.frame, {
    colours: scene.depth,
    originX: ORIGIN.x,
    originY: ORIGIN.y,
    yaw,
    age: scene.age,
    order,
    seed,
    bristle: scene.bristle,
    lids,
    translate: scene.translate,
  });
  const { pixels } = bitmap;
  let count = 0;

  for (let index = 0; index < pixels.length; index++) {
    count += pixels[index] < 0 ? 0 : 1;
  }

  const drawing = { at: new Int32Array(count), colour: new Int32Array(count) };
  let next = 0;

  for (let index = 0; index < pixels.length; index++) {
    if (pixels[index] >= 0) {
      drawing.at[next] = index;
      drawing.colour[next++] = scene.colours[pixels[index]];
    }
  }

  return drawing;
}

export interface Score {
  same: number;
  differ: number;

  /** Drawn where the oracle has none of the dog. */
  extra: number;

  /** The oracle's, where nothing is drawn. */
  missing: number;
  wrong: number;
}

/** How a drawing, moved by `dx`, `dy`, differs from the oracle's dog. */
export function score(dog: Dog, drawing: Drawing, dx: number, dy: number): Score {
  let [same, differ, extra] = [0, 0, 0];
  const { inside, hidden } = dog;

  for (let n = 0; n < drawing.at.length; n++) {
    const index = drawing.at[n];
    const colour = drawing.colour[n];
    const [x, y] = [(index % WIDTH) + dx, Math.trunc(index / WIDTH) + dy];

    /* Past the playpen's edge, or under a window, the oracle shows nothing to compare with. */
    if (
      x < inside.left ||
      y < inside.top ||
      x > inside.right ||
      y > inside.bottom ||
      hidden.some((w) => under(w, x, y)) ||
      dog.masked?.[y * WIDTH + x]
    ) {
      continue;
    }

    const oracle = dog.pixels[y * WIDTH + x];

    if (oracle < 0) {
      extra++;
    } else if (oracle === colour) {
      same++;
    } else {
      differ++;
    }
  }

  const missing = dog.count - same - differ;
  return { same, differ, extra, missing, wrong: differ + extra + missing };
}

export interface Alignment {
  yaw: number;
  dx: number;
  dy: number;
  score: Score;
}

/**
 * Lines a drawing up with the dog, by their boxes' left and bottom edges —
 * or right and top, where the playpen cuts the dog off — and then a couple
 * of pixels either way, at each of the yaws tried.
 */
export function align(
  scene: Scene,
  dog: Dog,
  yaws: number[],
  seed = 1,
  { settle = true }: { settle?: boolean } = {}
): Alignment & { order: number[] } {
  let best: (Alignment & { order: number[] }) | null = null;

  for (const yaw of yaws) {
    /* Unsettled, a search's first pass: the balls sorted from scratch, one drawing. */
    const order = settle ? settledOrder(scene, yaw) : [];
    const drawing = draw(scene, yaw, [...order], seed);
    let [left, top, right, bottom] = [WIDTH, HEIGHT, -1, -1];

    drawing.at.forEach((index) => {
      const [x, y] = [index % WIDTH, Math.trunc(index / WIDTH)];
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    });

    const bx = dog.cut.left ? dog.box.right - right : dog.box.left - left;
    const by = dog.cut.bottom ? dog.box.top - top : dog.box.bottom - bottom;

    for (let dx = bx - 2; dx <= bx + 2; dx++) {
      for (let dy = by - 2; dy <= by + 2; dy++) {
        const result = score(dog, drawing, dx, dy);

        if (!best || result.wrong < best.score.wrong) {
          best = { yaw, dx, dy, score: result, order };
        }
      }
    }
  }

  return best!;
}

/** Each pixel of a picture of the two and where they differ, side by side: the oracle's, the drawing, grey same, orange differ, blue extra, red missing. */
export function differences(dog: Dog, compact: Drawing, { dx, dy }: Alignment) {
  const drawing = new Int32Array(WIDTH * HEIGHT).fill(-1);
  compact.at.forEach((index, n) => (drawing[index] = compact.colour[n]));
  const margin = 6;
  const [left, top] = [dog.box.left - margin, dog.box.top - margin];
  const [width, height] = [dog.box.right - left + margin + 1, dog.box.bottom - top + margin + 1];
  const out = new Uint8Array(width * 3 * height * 3).fill(255);
  const put = (panel: number, x: number, y: number, colour: number) => {
    const at = (y * width * 3 + panel * width + x) * 3;
    out.set([(colour >> 16) & 255, (colour >> 8) & 255, colour & 255], at);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [ox, oy] = [left + x, top + y];
      const oracle = dog.pixels[oy * WIDTH + ox] ?? -1;
      const [px, py] = [ox - dx, oy - dy];
      const ours = px >= 0 && py >= 0 && px < WIDTH && py < HEIGHT ? drawing[py * WIDTH + px] : -1;

      if (oracle >= 0) {
        put(0, x, y, oracle);
      }

      if (ours >= 0) {
        put(1, x, y, ours);
      }

      if (oracle >= 0 || ours >= 0) {
        put(
          2,
          x,
          y,
          oracle === ours ? 0xc8c8c8 : oracle < 0 ? 0x0000ff : ours < 0 ? 0xff0000 : 0xffa000
        );
      }
    }
  }

  return { width: width * 3, height, rgb: out };
}

/**
 * The draw order the session's dog has settled into. The engine's sort is
 * partial and kept from frame to frame (`ZOrder`), so balls within its
 * tolerance of each other stay in whatever order the dog's earlier frames
 * left them: a session's own. Searched for here by swapping neighbours the
 * sort would leave be, keeping each swap that matches the picture better,
 * until none does.
 */
export function settleToPicture(
  scene: Scene,
  dog: Dog,
  { yaw, dx, dy }: Alignment,
  order: number[],
  seed: number
) {
  let best = [...order];
  let wrong = score(dog, draw(scene, yaw, [...best], seed), dx, dy).wrong;
  let improved = true;

  for (let pass = 0; improved && pass < 8; pass++) {
    improved = false;

    for (let i = 0; i + 1 < best.length; i++) {
      const tried = [...best];
      [tried[i], tried[i + 1]] = [tried[i + 1], tried[i]];
      const settled = [...tried];
      const result = score(dog, draw(scene, yaw, settled, seed), dx, dy).wrong;

      /* Kept only if the engine's sort leaves it so: the order after drawing is the order tried. */
      if (result < wrong && settled.every((ball, n) => ball === tried[n])) {
        [best, wrong, improved] = [tried, result, true];
      }
    }
  }

  return { order: best, wrong };
}
