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
import { type Dib, parseDib } from '../formats/dib.ts';
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
import { drawPicture, mapColours } from '../render/picture.ts';
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
import { CATZ_BRAIN, initCatzBrains, updateCatzBrain } from '../behaviour/catz-brain.ts';
import { CatzBody } from '../behaviour/catz-body.ts';
import { CatzPet } from '../behaviour/catz-pet.ts';
import {
  type AptThing,
  aptRestingPictures,
  aptShelfKinds,
  aptTargetOffset,
  parseAptThings,
} from '../formats/apt.ts';
import { catzKitLocked } from '../behaviour/catz-reflexes.ts';
import { catzBasketHit } from '../behaviour/catz-states.ts';
import { CatzMouseLive, readMouseFactors } from '../behaviour/catz-mouse-live.ts';
import {
  type CatzJingleBall,
  catzJingleTick,
  type CatzToy,
  catzToyTick,
} from '../behaviour/catz-toys.ts';
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
const thingSelect = element<HTMLSelectElement>('thing');
const kitInput = element<HTMLInputElement>('kit');
const kitText = element<HTMLParagraphElement>('kit-text');
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

/** The things in the pen the demo has no picture of: each a marker where it is, and its name. */
function drawPen() {
  const scale = canvas.width / LIVE_STAGE.right;
  context.save();
  context.font = `${12 * scale}px sans-serif`;
  context.textAlign = 'center';

  for (const [kind, { x, y }] of livePen) {
    if (penPictures.has(kind)) {
      continue;
    }

    context.fillStyle = '#c84';
    context.beginPath();
    context.arc(x * scale, y * scale, 8 * scale, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#333';
    context.fillText(
      thingSelect.querySelector(`option[value="${kind}"]`)?.textContent ?? `kind ${kind}`,
      x * scale,
      (y + 22) * scale
    );
  }

  context.restore();
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

/** Where the Adoption Kit is on the stage (`PetParams` `+0xdc`, `+0xde`), from which its baskets lie. */
const KIT_ORIGIN = { x: 0, y: 40 };

/** Each basket's breed (`SetupNewBasket`'s files, seg13:1653): ASIAMESE, ACLOWN, APERSIAN, AHUNTER, ASCAREDY. */
const KIT_BREEDS = ['SIAMESE', 'CLOWN', 'PERSIAN', 'HUNTER', 'SCAREDY'];

/** Each basket's rectangle's corner from the Kit's origin (`GetBasketLocation`, seg13:113b), 118 by 145. */
const KIT_BASKETS = [
  { x: 0xa5, y: 0xaa },
  { x: 0xfd, y: 0xb9 },
  { x: 0x156, y: 0xbe },
  { x: 0x1ae, y: 0xb4 },
  { x: 0x207, y: 0xaf },
];

/** The basket's pictures (CATZDLL type 2): its back and handle (16500) and its front (16501), and lit (16510, 16511). */
let basketPictures: { dib: Dib; colours: number[]; green: number }[] = [];

/** CATZDLL's strings (`RT_STRING`: in blocks of 16, each a length and its text), by id; '' where none. */
let catzString: (id: number) => string = () => '';

/**
 * The five baskets, their backs (0) or fronts (1), each at its rectangle;
 * those lit drawn so: the cat's (kin 0x18, `SetCond` 2) and the highlight
 * (kin 0x19, `baskhi.apt`, its pictures the lit ones).
 */
function drawBaskets(bitmap: IndexedBitmap, part: 0 | 1, lit: number[] = []) {
  for (const [n, corner] of KIT_BASKETS.entries()) {
    const picture = basketPictures[lit.includes(n) ? part + 2 : part] ?? basketPictures[part];

    if (!picture) {
      continue;
    }

    drawPicture(
      bitmap,
      picture.dib,
      picture.colours,
      corner.x + KIT_ORIGIN.x,
      corner.y + KIT_ORIGIN.y,
      false,
      picture.green
    );
  }
}

/** The stage the cat lives on, in the engine's pixels, drawn whole on the canvas. */
const LIVE_STAGE = { left: 0, top: 0, right: 640, bottom: 480 };

/** The brains and centres of the playpen's cat as the harness found it: where a breed has no factors. */
const LIVE_BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const LIVE_CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];

let live = 0;
let liveCursor = { x: 235, y: 300 };

/**
 * The right button: pressed since the last tick (`PetParams` `+0xa`), and
 * held (`+0xc`), as `CATZ.WAD` reads it each frame (`GetAsyncKeyState` of
 * the secondary button, this frame's and the last's).
 */
let livePressed = false;
let liveHeld = false;
/** Where the button last went down and up (`XApt::m_ptDown`, `m_ptUp`); and whether pressing the cat's own basket lit it. */
let liveDownAt = { x: 0, y: 0 };
let liveUpAt = { x: 0, y: 0 };
let liveBasketLit = false;

/**
 * What the playpen tells the cat of the pen's things, a notice a tick (`XApt::ParentNotify`):
 * kind, condition, state, and whether the user just took it off the shelf.
 */
const liveNotices: [number, number, number, boolean][] = [];

/** Messages the playpen's commands leave the cat (`XApt::DoCommand`), read in turn: 19 its window resized, 21 the camera. */
const liveCommands: number[] = [];

/** The left button held (`PetParams` `+0x1e`: `CATZ.WAD` sets it on `WM_LBUTTONDOWN` and clears it on its release): the hand that pets, and the baskets' press. */
let liveHand = false;

/**
 * Whether the left button was double-clicked since the last tick
 * (`PetParams` `+0x46`: `CATZ.WAD`'s window procedure sets it on
 * `WM_LBUTTONDBLCLK`, and each frame takes it and clears it).
 */
let liveDoubleClicked = false;

/** Whether the live mouse is out as the cat's dream's (10). */
let liveDreamMouse = false;

/** Put the live cat to nap (CatNapz). */
let liveNap: () => void = () => {};

/** Whether a point on the stage is on one of the live cat's balls. */
let liveOverCat: (at: { x: number; y: number }) => boolean = () => false;

/** The mouse's hole, where the harness's pen has it scaled to the stage: its target point. */
const MOUSE_HOLE = { x: 206, y: 403 };

/** The mouse's own files, where the game has them: its frames, its file, its scripts. */
let mouseFiles:
  | {
      header: AnimationHeader;
      frames: Frame[];
      lnz: Breed;
      shaped: Frame[];
      scripts: Script[];
      positions: CatzPositions;
      factors: [number, number, number][];
      order: number[];
    }
  | undefined;

/** The pen's things put off the shelf into the pen, by kind, and where each is. */
const livePen = new Map<number, { x: number; y: number }>();

/**
 * Each kind's picture in the pen, where the engine has one: its bitmap
 * `kind × 1000 + 200` of CATZDLL.DLL (the shelf's own at `kind × 1000`), as
 * the shelf's sprites' definitions name them (resource type 32513, 1000),
 * its colours into the palette drawn with. The demo has the paint bucket's,
 * the spray bottle's, the Cat Dancer's, the yarn ball's, the jingle ball's,
 * the cheese's and the squeaky toy's.
 */
const penPictures = new Map<number, { dib: Dib; colours: number[]; green: number }>();

/**
 * The pen's things' animations playing, by kind: its condition's set for
 * the state it was put in (`XApt::SetState`: 1 let go, 3 held and dragged),
 * a frame a tick, round again where the set loops, else back at rest.
 */
const liveAnimations = new Map<number, { set: number; frame: number }>();

/** A thing put in a state: its set for it played, where its condition has one past rest. */
function thingState(kind: number, state: number) {
  const frames = shelfThings.get(kind)?.conds.get(liveConds.get(kind) ?? 1)?.[state];

  if (state > 0 && frames?.length) {
    liveAnimations.set(kind, { set: state, frame: 0 });
  } else {
    liveAnimations.delete(kind);
  }
}

/** Each animation on a frame; done, at rest, or round again. */
function animateThings() {
  for (const [kind, playing] of liveAnimations) {
    const cond = liveConds.get(kind) ?? 1;
    const thing = shelfThings.get(kind);
    const frames = thing?.conds.get(cond)?.[playing.set] ?? [];

    if (playing.frame + 1 < frames.length) {
      playing.frame++;
    } else if (thing?.loops.get(cond)?.[playing.set]) {
      playing.frame = 0;
    } else {
      liveAnimations.delete(kind);
    }
  }
}

/** The shelf's things' bitmaps by id (CATZDLL.DLL's, and the retail CATZREZX.DLL's), and their definitions by kind. */
const thingBitmaps = new Map<number, { dib: Dib; colours: number[]; green: number }>();
let shelfThings = new Map<number, AptThing>();

/** CatNapz's dream sprite's definition (CATZDLL type 32513, 4000): by what it dreams of (0 to 8), one of the pen's things. */
let dreamThing: AptThing | undefined;

/** A thing's pictures in the pen in its condition, at rest (its set 0's first frame), where the condition has its own and all are here; else none. */
function condPictures(kind: number) {
  const cond = liveConds.get(kind) ?? 1;
  const thing = shelfThings.get(kind);
  const playing = liveAnimations.get(kind);
  const pictures = !thing
    ? []
    : playing
      ? (thing.conds.get(cond)?.[playing.set]?.[playing.frame] ?? [])
      : cond >= 2
        ? aptRestingPictures(thing, cond)
        : [];
  const found = pictures.map((picture) => ({
    ...picture,
    image: thingBitmaps.get(picture.bitmap),
  }));
  return found.length && found.every((picture) => picture.image) ? found : [];
}

/**
 * The pen's things moving, struck: each by the playpen's physics
 * (`catzToyTick`), its friction and rebound the engine's -- the cheese 50,
 * the squeaky toy 70, the yarn ball 100 and 100 (its own `Init`), the rest
 * their definitions' -- the jingle ball by its own (`catzJingleTick`), the
 * Cat Dancer not at all; kept from the stage's edges by half their
 * pictures; their sounds drawing the cat's own `rand`.
 */
const liveToys = new Map<number, CatzToy | CatzJingleBall>();
const FRICTION: Record<number, [number, number]> = { 6: [100, 100], 9: [70, -1] };

/** The jingle ball's own physics' parameters, as the playpen's (`PetParams` `+0x138`, `+0x140`, as the harness found them). */
const JINGLE = { x138: 13, x140: 64 };

/** A toy the cat struck, set moving from where it is. */
function strikeToy({ kind, v }: { kind: number; v: { x: number; y: number } }) {
  const at = livePen.get(kind);

  /* Struck, the thing let go (`StrikeToy`'s `SetState` 1): the playpen tells the cat so. */
  if (at) {
    liveNotices.push([kind, 1, 1, false]);
  }

  /* The Cat Dancer is not sent rolling: its speed only kept (`CatDancerSprite::SetSpeed`), its spring its own (`Update`). */
  if (!at || kind === 5) {
    return;
  }

  const picture = penPictures.get(kind)?.dib;
  const [friction, rebound] = FRICTION[kind] ?? [50, -1];
  const half = {
    x: Math.trunc((picture?.width ?? 32) / 2),
    y: Math.trunc((picture?.height ?? 32) / 2),
  };
  liveToys.set(
    kind,
    kind === 7
      ? { at: { ...at }, v: { ...v }, half }
      : { at: { ...at }, v: { ...v }, friction, rebound, half }
  );
}

/** A tick of the moving toys: each moved, and put where it now is; still, it stops. */
function moveToys(random: (n: number) => number) {
  for (const [kind, toy] of liveToys) {
    if (!livePen.has(kind)) {
      liveToys.delete(kind);
      continue;
    }

    if ('friction' in toy) {
      catzToyTick(toy, LIVE_STAGE, random);
    } else {
      catzJingleTick(toy, LIVE_STAGE, JINGLE, random);
    }

    livePen.set(kind, { ...toy.at });

    if (!toy.v.x && !toy.v.y) {
      liveToys.delete(kind);
    }
  }
}

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
  /* Its breed, frames and placer: in the Adoption Kit made again as each basket's kitten. */
  let cat = breed();
  let shaped = extendFrames(frames, cat);
  let { neck, butt } = skeletonOf(cat);
  let placer = new CatzPlacer(cat, header, shaped, { age: 100 });
  const kitMode = kitInput.checked;
  /* Where it is to be seated once its first frame is placed, made again in a basket. */
  let seat: { x: number; y: number } | undefined;
  const fudgers = makeCatzFudgers();
  resetCatzEyelids(fudgers);
  [fudgers[6].value, fudgers[7].value] = [20, 20];
  let ticks = 0;
  /* Its body: each action played out by its script and placed as
   * `PopScript` places it, a walk steered each tick and what it walks to
   * looked for in its focus box. */
  /* The pet, made after its body: where what its head tracks is, once there is one. */
  const made: { pet?: CatzPet; mouse?: CatzMouseLive } = {};
  const body = new CatzBody({
    scripts,
    positions,
    flags: (frame) => frames[frame]?.tag ?? 3,
    shaped,
    placer,
    angle: (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
    stage: LIVE_STAGE,
    ...(kitMode ? { start: { x: LIVE_STAGE.left - 100, y: LIVE_STAGE.top - 100 } } : {}),
    fudgers,
    random,
    trackAt: (kind) => made.pet?.kinAt(kind),
  });
  /* Its brains as the engine makes them for its breed (`InitBrain`), its age by the slider. */
  let brains = cat.catz?.factors
    ? initCatzBrains(cat.catz.factors, random, { age: Number(kittenInput.value) })
    : undefined;
  let clock = 0;
  const pet = new CatzPet({
    brains: brains?.map((brain) => brain.value) ?? LIVE_BRAINS,
    centres: brains?.map((brain) => brain.centre) ?? LIVE_CENTRES,
    stage: LIVE_STAGE,
    cursor: () => liveCursor,
    doubleClicked: () => liveDoubleClicked,
    /* The pen's things, and the mouse hole (0xe) where the mouse lives, at its hole. */
    pen: () => (mouseFiles ? new Map([...livePen, [0xe, MOUSE_HOLE]]) : livePen),
    random,
    /* Placed by its frames, as `PopScript` places it: the pet's straight walk off. */
    moves: false,
    play: (action, steer) => body.play(action, steer),
    dropped: () => body.drop(),
    entered: (state) => body.entered(state),
    layer: (action) => body.layer(action),
    layering: () => body.layering,
    head: (look) => body.look(look),
    strike: strikeToy,
    found: () => !!body.shown?.there,
    moveTo: (at) => body.moveTo(at),
    /* The pen's mouse, out of its hole or in it. */
    mouse: () =>
      made.mouse
        ? {
            /* Hidden, in its hole (1), whatever its machine has yet. */
            state: made.mouse.hidden ? 1 : made.mouse.mouse.fields.state,
            at: made.mouse.at,
          }
        : undefined,
    /* Its paws' reach (`IsSpriteCaught`): the box of balls 0x16 and 0x17, 70 wider and 40 taller each way, meeting the mouse's rectangle. */
    inReach: () => {
      const shown = body.shown;
      const prey = made.mouse?.rect;

      if (!shown || !prey) {
        return false;
      }

      const [a, b] = [0x16, 0x17].map((ball) => placer.ballOnStage(shown.rect, shown.pose, ball));
      const reach = {
        left: Math.min(a.x, b.x) - 70,
        top: Math.min(a.y, b.y) - 40,
        right: Math.max(a.x, b.x) + 70,
        bottom: Math.max(a.y, b.y) + 40,
      };
      return (
        Math.max(reach.left, prey.left) < Math.min(reach.right, prey.right) &&
        Math.max(reach.top, prey.top) < Math.min(reach.bottom, prey.bottom)
      );
    },
    mouseHeld: (how) => made.mouse?.catHolds(how),
    /* The Adoption Kit: its kitten in the baskets, from the Kit's origin, coming out of itself (`PetParams` `+0xca` 1). */
    ...(kitMode
      ? {
          /* `PetParams` `+0xea` is the host's; set here, so its baskets' hints show. */
          kit: { origin: KIT_ORIGIN, ca: 1, xea: 1 },
          /* The Kit's text bar. */
          words: (id?: number) => (kitText.textContent = id === undefined ? '' : catzString(id)),
          /* Put in a basket, made again as its breed (`SetupNewBasket`), its brains the Kit's. */
          remade: (basket: number) => {
            const files_ = files.get(KIT_BREEDS[basket]);

            if (!files_) {
              return undefined;
            }

            cat = averageBreed(files_.adult, files_.kitten, Number(kittenInput.value), {
              loseUp: FIDELITY.averageLosesUp,
            });
            shaped = extendFrames(frames, cat);
            ({ neck, butt } = skeletonOf(cat));
            placer = new CatzPlacer(cat, header, shaped, { age: 100 });
            const at = made.pet?.basketAt(basket) ?? { x: 0, y: 0 };
            body.rebreed(
              shaped,
              placer,
              (frame) => (shaped[frame] ? catzFrameAngle(shaped[frame], neck, butt) : null),
              at
            );
            seat = at;
            brains = cat.catz?.factors
              ? initCatzBrains(cat.catz.factors, random, {
                  age: Number(kittenInput.value),
                  kit: true,
                })
              : brains;
            return brains
              ? { brains: brains.map((b) => b.value), centres: brains.map((b) => b.centre) }
              : undefined;
          },
        }
      : {}),
    /* The button as the engine has it: pressed the tick it went down, held after. */
    buttons: () => ({ pressed: livePressed, held: liveHeld && !livePressed }),
    ballAt: (ball) =>
      body.shown ? placer.ballOnStage(body.shown.rect, body.shown.pose, ball) : undefined,
    /* Petted: the hand, the ball under the cursor, the rectangle grown by 10 holding it, and the frames left. */
    hand: () => liveHand,
    holding: () => liveDragging,
    /* The mouse's fear moved by the cat (falling asleep, 50 less), kept within 0 to 100 as `SetVal` keeps it. */
    mouseFear: (by: number) => {
      if (made.mouse) {
        const brains = made.mouse.mouse.fields.brains;
        brains[1] = Math.max(0, Math.min(100, brains[1] + by));
      }
    },
    /* The cat's conditions for its things, kept; and a thing it takes from the user let go where it is, its state 1 (`ForceRelease`). */
    setCond: (kind: number, cond: number) => liveConds.set(kind, cond),
    forceRelease: (kind: number) => {
      if (liveDragging === kind) {
        liveNotices.push([kind, liveConds.get(kind) ?? 1, 1, false]);
        liveDragging = undefined;
        liveHand = false;
        livePressed = false;
      }
    },
    ballUnder: () =>
      body.shown ? placer.ballAt(body.shown.rect, body.shown.pose, liveCursor) : -1,
    cursorOver: () => {
      const rect = body.shown?.rect;
      return (
        !!rect &&
        rect.left - 10 < liveCursor.x &&
        liveCursor.x < rect.right + 10 &&
        rect.top - 10 < liveCursor.y &&
        liveCursor.y < rect.bottom + 10
      );
    },
    scriptLeft: () => body.queue.length,
    cues: () => body.shown?.step.cues ?? [],
  });
  made.pet = pet;
  liveNap = () => pet.nap();
  liveOverCat = (at) => !!body.shown && placer.ballAt(body.shown.rect, body.shown.pose, at) >= 0;

  /* The mouse in its hole, its body its own, at scales of 200 (`InitMouseSprite`). */
  const mouseScales = { pet: 200, ball: 200 };
  const mouse = mouseFiles
    ? new CatzMouseLive({
        scripts: mouseFiles.scripts,
        positions: mouseFiles.positions,
        flags: (frame) => mouseFiles!.frames[frame]?.tag ?? 3,
        shaped: mouseFiles.shaped,
        placer: new CatzPlacer(mouseFiles.lnz, mouseFiles.header, mouseFiles.shaped, {
          scales: mouseScales,
        }),
        stage: LIVE_STAGE,
        hole: MOUSE_HOLE,
        factors: mouseFiles.factors,
        random,
        clearCatSaw: () => {
          pet.x33bc = 0;
        },
      })
    : undefined;
  made.mouse = mouse;

  /* `?mouse=bold`: the mouse unafraid (20) and restless (100) to begin with,
   * as the pen harness makes it, that it comes out soon; else its fear, made
   * 50 to 99, keeps it in its hole till it draws back under 50. */
  if (mouse && new URLSearchParams(location.search).get('mouse') === 'bold') {
    mouse.mouse.fields.brains[0] = 100;
    mouse.mouse.fields.brains[1] = 20;
  }

  /* `?full=N`: the cat's fullness (brain 4) to begin with; low, it is hungry and eats what is put out. */
  const full = new URLSearchParams(location.search).get('full');

  if (full !== null && !Number.isNaN(Number(full))) {
    pet.mind.brains[CATZ_BRAIN.fullness] = Number(full);
  }

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

    /* The pen's things struck moving on. */
    moveToys(random);

    /* The frame this tick shows, as `PopScript` pops it before the state's own tick. */
    let shown = body.next();

    /* Made again in a basket: seated on its place once placed (`MoveDrawPt`). */
    if (seat && shown) {
      body.moveTo(seat);
      shown = body.shown;
      seat = undefined;
    }

    /* Where it is, for its states: its rectangle, its target point the
     * middle of it, and which way it faces (`+0x688`). */
    if (shown) {
      const { rect } = shown;
      pet.rect = rect;
      pet.point = {
        x: Math.trunc((rect.left + rect.right) / 2),
        y: Math.trunc((rect.top + rect.bottom) / 2),
      };
      pet.fields.x688 = body.facing;
      /* Its basket lit (`SetCond` 2) from climbing out of it till it is back in the baskets. */
      const kitPet = made.pet?.kit ? made.pet : undefined;
      const out = kitPet && (kitPet.global !== 22 || [76, 77, 78].includes(kitPet.state));
      const lit = kitPet
        ? [out || liveBasketLit ? kitPet.kit!.basket : -1, kitPet.kitHighlight]
        : [];
      drawLive(cat, shaped, placer, shown, mouse, kitMode, lit, made.pet?.dream.shown);
    }

    /* A command's message this tick. */
    const command = liveCommands.shift();

    if (command !== undefined) {
      pet.leave(command);
    }

    /* The playpen's notice this tick, leaving the cat its message. */
    const notice = liveNotices.shift();

    animateThings();

    if (notice) {
      pet.notify(...notice);
      thingState(notice[0], notice[2]);
    }

    const { state, global } = pet.tick();
    livePressed = false;

    /* Dreaming, floating about the stage's middle: the cat put where the float has it (its goal and target point, `DoCatStartDream`'s phase 3). */
    if (global === 21 && state === 65 && pet.dream.phase === 3 && pet.fields.goal) {
      body.moveTo(pet.fields.goal);
    }
    liveDoubleClicked = false;

    /* The Kit's baskets pressed, as the playpen's root has them after its sprites: none where the press took the cat or a thing. */
    if (pet.kit) {
      liveBasketLit =
        pet.basketHitTest({
          down: liveHand && !liveGrabbed,
          downAt: liveDownAt,
          upAt: liveUpAt,
        }) ||
        (liveBasketLit && liveHand);
    }

    /* Dangling, hung from the cursor by its ball 0x24 (`DoDangling`). */
    if (state === 33) {
      body.hang(0x24, liveCursor);
    }

    /* Dreamt of (10): the pen's own mouse is the dream's -- put above the cat, playing 0x22 and shown (`DoCatGoodDream`, seg18:0a6e on) -- its own machine paused the while; put away again (cued 6), back in its hole. */
    const dreamt = pet.dream.shown?.kind === 10 ? pet.dream.shown : undefined;

    if (mouse && dreamt && !liveDreamMouse) {
      liveDreamMouse = true;
      mouse.hidden = false;
      mouse.body.drop();
      mouse.body.moveTo(dreamt.at);
      mouse.body.play(0x22);
    } else if (mouse && !dreamt && liveDreamMouse) {
      liveDreamMouse = false;
      mouse.hidden = true;
      mouse.body.drop();
      mouse.body.moveTo(MOUSE_HOLE);
    }

    if (mouse && liveDreamMouse) {
      mouse.body.next();
    } else {
      /* The mouse's tick, the cat where it is. */
      mouse?.tick({
        cat: pet.point,
        catGlobal: global,
        catAge: pet.mind.brains[11],
        x33b8: pet.x33b8,
        cursor: liveCursor,
        cheeseHeld: liveDragging === 8,
        things: livePen,
        shelfAt: (kind) => ({
          x: LIVE_STAGE.left + Math.trunc(((LIVE_STAGE.right - LIVE_STAGE.left) * (kind + 1)) / 17),
          y: LIVE_STAGE.top + 30,
        }),
        clock: Math.trunc(clock),
      });
    }
    ticks++;
    status.textContent = `On its own, tick ${ticks}: state ${state}, global state ${global}, at ${pet.point.x}, ${pet.point.y}${body.queue.length ? `, ${body.queue.length} frames to play` : ''}${pet.kit ? `; in the Adoption Kit, basket ${pet.kit.basket}` : ''}${mouse ? `; the mouse ${mouse.hidden ? 'in its hole' : 'out'} (${mouse.mouse.fields.global}/${mouse.mouse.fields.state}) at ${mouse.at.x}, ${mouse.at.y}` : ''}.`;
  }, 100);
}

/** A frame of the live cat, drawn at its placed rectangle on the whole stage. */
function drawLive(
  cat: Breed,
  shaped: Frame[],
  placer: CatzPlacer,
  { step, rect, pose }: { step: CatzStep; rect: CatzPlaced['rect']; pose: CatzPose },
  mouse?: CatzMouseLive,
  kitMode = false,
  litBaskets: number[] = [],
  dream?: { kind: number; at: { x: number; y: number } }
) {
  const frame =
    step.layer && shaped[step.layer.first] && shaped[step.layer.frame]
      ? layeredCatzFrame(
          shaped[step.frame],
          shaped[step.layer.first],
          shaped[step.layer.frame],
          cat
        )
      : shaped[step.frame];
  const bounds = placer.bounds(pose);
  const bitmap = new IndexedBitmap(LIVE_STAGE.right, LIVE_STAGE.bottom);

  /* The pen's things with pictures first, the cat in front: each with its target point (its condition's rectangle's middle, `GetTargetPt`) on its point; else centred there. */
  for (const [kind, { x, y }] of livePen) {
    const picture = penPictures.get(kind);
    const layers = condPictures(kind);
    const thing = shelfThings.get(kind);
    const target =
      (thing && aptTargetOffset(thing, liveConds.get(kind) ?? 1)) ??
      (picture
        ? { x: Math.trunc(picture.dib.width / 2), y: Math.trunc(picture.dib.height / 2) }
        : undefined);

    /* In a condition of its own (a bowl part eaten, the catnip nibbled), its pictures for it, each by its rectangle, about the same point. */
    if (picture && layers.length) {
      for (const { rect, image } of layers) {
        const { dib, colours, green } = image!;
        drawPicture(
          bitmap,
          dib,
          colours,
          x - target!.x + rect[0],
          y - target!.y + rect[1],
          false,
          green
        );
      }
    } else if (picture) {
      const { dib, colours, green } = picture;
      drawPicture(bitmap, dib, colours, x - target!.x, y - target!.y, false, green);
    }
  }

  /* The mouse's hole, where the mouse has its files: a dark mouth at the floor, under it. */
  if (mouseFiles) {
    for (let dy = -9; dy <= 9; dy++) {
      const half = Math.trunc(16 * Math.sqrt(1 - (dy / 9) ** 2));
      bitmap.span(MOUSE_HOLE.x - half, MOUSE_HOLE.y + 6 + dy, 2 * half + 1, 0);
    }
  }

  /* The Adoption Kit's baskets: their backs and handles behind the kitten (16500). */
  if (kitMode) {
    drawBaskets(bitmap, 0, litBaskets);
  }

  /* The mouse, out of its hole, behind the cat. */
  const shownMouse = mouse?.body.shown;

  if (mouse && mouseFiles && shownMouse && !mouse.hidden) {
    const mouseBounds = new CatzPlacer(mouseFiles.lnz, mouseFiles.header, mouseFiles.shaped, {
      scales: { pet: 200, ball: 200 },
    }).bounds(shownMouse.pose);
    drawPet(bitmap, mouseFiles.lnz, mouseFiles.header, mouseFiles.shaped[shownMouse.step.frame], {
      colours: 256,
      originX: shownMouse.rect.left - mouseBounds.left,
      originY: shownMouse.rect.top - mouseBounds.top,
      scales: { pet: 200, ball: 200 },
      order: mouseFiles.order,
      translate,
      ...poseOf(shownMouse.step.fudged),
    });
  }

  drawPet(bitmap, cat, header, frame, {
    colours: 256,
    originX: rect.left - bounds.left,
    originY: rect.top - bounds.top,
    age: 100,
    order,
    translate,
    ...poseOf(step.fudged),
  });

  /* And their fronts over it, so it sits in its basket (16501). */
  if (kitMode) {
    drawBaskets(bitmap, 1, litBaskets);
  }

  /* Napping, its dream sprite over all (kin 0x13): what it dreams of, its target point above the cat. (Its mouse, for 10, not drawn yet.) */
  const offset = dream && dreamThing ? aptTargetOffset(dreamThing, dream.kind) : undefined;

  if (dream && dreamThing && offset) {
    for (const { rect, bitmap: id } of aptRestingPictures(dreamThing, dream.kind)) {
      const picture = thingBitmaps.get(id);

      if (picture) {
        drawPicture(
          bitmap,
          picture.dib,
          picture.colours,
          dream.at.x - offset.x + rect[0],
          dream.at.y - offset.y + rect[1],
          false,
          picture.green
        );
      }
    }
  }

  const pixels = new ImageData(bitmap.toRgba(palette), bitmap.width, bitmap.height);
  const small = new OffscreenCanvas(bitmap.width, bitmap.height);
  small.getContext('2d')!.putImageData(pixels, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(small, 0, 0, canvas.width, canvas.height);
  /* (Over it: the stage's bitmap is drawn whole, its ground and all.) */
  drawPen();
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
  /* The retail game keeps most of its things' bitmaps in CATZREZX.DLL. */
  const rezx = await game
    .read('WINDOWS/SYSTEM/CATZREZX.DLL')
    .then(parseNe)
    .catch(() => undefined);
  penPictures.clear();
  thingBitmaps.clear();

  for (const { type, id, data } of [...engine.resources(), ...(rezx?.resources() ?? [])]) {
    if (type === 2 && typeof id === 'number' && id >= 1000 && id < 18000 && !thingBitmaps.has(id)) {
      const dib = parseDib(data);
      /* Transparent where bright green, as the engine's pictures are made. */
      const green = dib.colours.findIndex(([r, g, b]) => r === 0 && g === 255 && b === 0);
      const picture = { dib, colours: mapColours(dib, palette), green };
      thingBitmaps.set(id, picture);

      if (id % 1000 === 200 && id < 16000) {
        penPictures.set((id - 200) / 1000, picture);
      }
    }
  }

  const shelf = engine.resources().find(({ type, id }) => type === 32513 && id === 1000);
  const dreamText = engine.resources().find(({ type, id }) => type === 32513 && id === 4000);
  dreamThing = dreamText
    ? parseAptThings(new TextDecoder('latin1').decode(dreamText.data))[0]
    : undefined;
  shelfThings = shelf
    ? aptShelfKinds(parseAptThings(new TextDecoder('latin1').decode(shelf.data)))
    : new Map();

  const strings = engine.resources().filter((r) => r.type === 6);
  catzString = (id) => {
    const block = strings.find((r) => r.id === (id >> 4) + 1);

    if (!block) {
      return '';
    }

    let at = 0;

    for (let k = 0; k < (id & 15); k++) {
      at += 1 + block.data[at];
    }

    return new TextDecoder('latin1').decode(block.data.slice(at + 1, at + 1 + block.data[at]));
  };

  /* The Adoption Kit's basket: its back and its front. */
  basketPictures = [16500, 16501, 16510, 16511].flatMap((want) => {
    const found = engine.resources().find(({ type, id }) => type === 2 && id === want);

    if (!found) {
      return [];
    }

    const dib = parseDib(found.data);
    const green = dib.colours.findIndex(([r, g, b]) => r === 0 && g === 255 && b === 0);
    return [{ dib, colours: mapColours(dib, palette), green }];
  });

  const data = await game.read(`${RESOURCE}/CAT.SCP`);
  scripts = parseScripts(data, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz);
  const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
  positions = { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) };

  /* And the mouse's, where they are. */
  mouseFiles = undefined;

  try {
    const MOUSE = 'CATZ.DOG/PTZFILES/MOUSE/RESOURCE';
    const mouseHeader = parseBhd(await game.read(`${MOUSE}/MOUSE.BHD`));
    const mouseFrames: Frame[] = [];

    for (let n = 0; n < mouseHeader.animations.length; n++) {
      mouseFrames.push(
        ...parseAnimation(mouseHeader, n, await game.read(`${MOUSE}/MOUSE${n}.BDT`))
      );
    }

    const lnzText = await text(`${MOUSE}/MOUSE.LNZ`);
    const lnz = parseLnz(lnzText, mouseHeader.ballCount);
    const mouseData = await game.read(`${MOUSE}/MOUSE.SCP`);
    const mousePreamble = new DataView(
      mouseData.buffer,
      mouseData.byteOffset + mouseData.indexOf(0) + 1
    );
    mouseFiles = {
      header: mouseHeader,
      frames: mouseFrames,
      lnz,
      shaped: extendFrames(mouseFrames, lnz),
      scripts: parseScripts(mouseData, catzArity(readCatzOpcodes(engine)), SCRIPTS.catz),
      positions: {
        count: mousePreamble.getUint16(0, true),
        neutral: mousePreamble.getUint16(2, true),
      },
      factors: readMouseFactors(lnzText),
      order: [],
    };
  } catch {
    /* No mouse: the cat alone. */
  }

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
/* The window resized, living: the playpen's command 0x7f1 (message 19). */
window.addEventListener('resize', () => {
  if (live && liveCommands.at(-1) !== 19) {
    liveCommands.push(19);
  }
});
/* The camera: the playpen's command 0x7f2 (message 21; its sound not played). */
element<HTMLButtonElement>('nap').addEventListener('click', () => {
  if (live) {
    liveNap();
  }
});
element<HTMLButtonElement>('camera').addEventListener('click', () => {
  if (live) {
    liveCommands.push(21);
  }
});
/* Living, a click puts the thing chosen in the pen there -- or, on one there, back on the shelf. */
/** Where on the stage a pointer event is, in the engine's pixels. */
function stageAt(event: MouseEvent) {
  const box = canvas.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - box.left) / box.width) * LIVE_STAGE.right),
    y: Math.round(((event.clientY - box.top) / box.height) * LIVE_STAGE.bottom),
  };
}

/** The shelf: a strip along the stage's top, where a thing dropped goes back (`PlaypenToShelf`). */
const SHELF_DEPTH = 40;

/** The pen's things' conditions as the cat set them (`CatSetCond`), by kind; 1, in the pen, where it has not. */
const liveConds = new Map<number, number>();

/** A thing of the pen the user is dragging, by kind; and whether this press grabbed one. */
let liveDragging: number | undefined;
let liveGrabbed = false;

canvas.addEventListener('mousedown', (event) => {
  /* The right button picks up the cat by the scruff; the left is the hand, and picks up a thing. */
  if (event.button === 2) {
    livePressed = true;
    liveHeld = true;
    return;
  }

  liveGrabbed = false;
  const at = stageAt(event);
  liveDownAt = at;
  const near = live
    ? [...livePen].find(([, p]) => Math.hypot(p.x - at.x, p.y - at.y) < 16)
    : undefined;

  /* A thing in the pen pressed: pressed (4) and dragged (3), as the engine's mouse sets them; not the cat. */
  if (near) {
    liveDragging = near[0];
    liveGrabbed = true;
    /* Held, a toy rolling stops. */
    liveToys.delete(near[0]);
    liveNotices.push([near[0], 1, 4, false], [near[0], 1, 3, false]);
    return;
  }

  liveHand = true;
});
canvas.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    liveHeld = false;
    return;
  }

  liveHand = false;
  liveUpAt = stageAt(event);

  /* A thing let go: on the shelf, back on it (condition 0, which nothing answers); else let go (1) in the pen. */
  if (liveDragging !== undefined) {
    const at = stageAt(event);

    if (at.y < LIVE_STAGE.top + SHELF_DEPTH) {
      livePen.delete(liveDragging);
    } else {
      livePen.set(liveDragging, at);
      liveNotices.push([liveDragging, 1, 1, false]);
    }

    liveDragging = undefined;
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('click', (event) => {
  /* (A press that picked up a thing, or on the cat, petting it, puts nothing in the pen.) */
  if (!live || liveGrabbed || liveOverCat(stageAt(event))) {
    return;
  }

  /* In the Adoption Kit, a basket clicked is the pet's (`basketHitTest`). */
  if (kitInput.checked && catzBasketHit(stageAt(event), KIT_ORIGIN) >= 0) {
    return;
  }

  const kind = Number(thingSelect.value);

  /* In the Kit, a locked thing only pressed on its shelf: it stays there and tells the cat so (kind, 1, 3, 1). */
  if (kitInput.checked && catzKitLocked(kind)) {
    liveNotices.push([kind, 1, 3, true]);
    return;
  }

  /* Taken off the shelf and dragged (3, the user's), then let go (1) in the pen; its condition 1 again (`ShelfToPlaypen`). */
  livePen.set(kind, stageAt(event));
  liveConds.delete(kind);
  liveNotices.push([kind, 1, 3, true], [kind, 1, 1, false]);
});
canvas.addEventListener('dblclick', (event) => {
  if (event.button === 0) {
    liveDoubleClicked = true;
  }
});
canvas.addEventListener('mouseleave', () => {
  liveHeld = false;
  liveHand = false;

  /* A thing dragged off the stage stays where it was last. */
  if (liveDragging !== undefined) {
    liveNotices.push([liveDragging, 1, 1, false]);
    liveDragging = undefined;
  }
});
canvas.addEventListener('mousemove', (event) => {
  liveCursor = stageAt(event);

  /* A thing dragged goes with the cursor. */
  if (liveDragging !== undefined) {
    livePen.set(liveDragging, liveCursor);
  }
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
