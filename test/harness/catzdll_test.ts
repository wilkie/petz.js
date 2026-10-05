/**
 * The harness: CATZDLL.DLL's own functions, run on winbox.js's emulated
 * processor, held to the reimplementation case by case. Each driver in
 * harness/ (built by scripts/harness/build.mjs) loads the library, calls a
 * function of it on cases of its own and writes what it answers; this runs
 * it as winbox.js runs a probe, beside the library and what it needs, and
 * reads the answers back.
 *
 * Needs winbox.js beside this repository, the drivers built, and the Catz
 * CD-ROM installed (install-catz.mjs --cd); skipped otherwise.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Frame, parseAnimation, parseBhd } from '../../src/formats/animation.ts';
import { type CatzFudger, makeCatzFudgers } from '../../src/behaviour/catz-fudger.ts';
import { catzFrameAngle, catzTimeline } from '../../src/behaviour/catz-timeline.ts';
import { averageBreed, type Breed, parseLnz } from '../../src/formats/lnz.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { catzArity, parseScripts, readCatzOpcodes, SCRIPTS } from '../../src/formats/script.ts';
import {
  CATZ_PALETTE_TYPE,
  type Colour,
  catzTranslation,
  PALETTE_256,
  readPalette,
} from '../../src/formats/palette.ts';
import { catzShade, depthShades, drawOrder, drawPet } from '../../src/render/ballz.ts';
import { extendCatzFrame, extendFrames } from '../../src/render/extend.ts';
import { FIDELITY, setFidelity } from '../../src/render/fidelity.ts';
import { project, scalesForAge } from '../../src/render/project.ts';
import { skeletonOf } from '../../src/render/skeleton.ts';
import {
  CATZ_TURN,
  circleTables,
  drawLine,
  drawWhisker,
  fillBall,
  fillLid,
  IndexedBitmap,
} from '../../src/render/raster.ts';

const ROOT = process.cwd();
const WINBOX = join(ROOT, '..', 'winbox.js', 'test', 'win16', 'run-probe.ts');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const SYSTEM = join(ROOT, 'oracle', 'build', 'catz-retail-drive-c', 'WINDOWS', 'SYSTEM');
const RESOURCE = join(
  ROOT,
  'oracle',
  'build',
  'catz-retail-drive-c',
  'CATZ.DOG',
  'PTZFILES',
  'CAT',
  'RESOURCE'
);
const ready = [WINBOX, join(HARNESS, 'CATZMAG.EXE'), join(SYSTEM, 'CATZDLL.DLL')].every(existsSync);
const describeHarness = ready ? describe : describe.skip;

/** Runs a driver in winbox.js beside CATZDLL.DLL, SOSLIB03.DLL and any of the cat's files; its output's lines. */
async function run(
  program: string,
  output: string,
  files: string[] = [],
  {
    display = 'vga',
    frames = 40000,
    seconds = 120,
    written = {},
  }: {
    display?: string;
    frames?: number;
    seconds?: number;
    /** Files made for the run, by name: written beside the driver. */
    written?: Record<string, string>;
  } = {}
) {
  const stage = join(HARNESS, `stage-${program}`);
  mkdirSync(stage, { recursive: true });
  cpSync(join(HARNESS, `${program}.EXE`), join(stage, `${program}.EXE`));

  for (const library of ['CATZDLL.DLL', 'SOSLIB03.DLL']) {
    cpSync(join(SYSTEM, library), join(stage, library));
  }

  for (const file of files) {
    cpSync(join(RESOURCE, file), join(stage, file));
  }

  for (const [name, text] of Object.entries(written)) {
    writeFileSync(join(stage, name), text);
  }

  const { runProbe } = await import(WINBOX);
  const result = await runProbe(program.toLowerCase(), frames, false, false, seconds, {
    display,
    program: { directory: stage, file: `${program}.EXE`, folder: program },
  });

  expect(result.failure ?? null).toBeNull();
  const file = await result.fileSystem.open([output]);
  const text = new TextDecoder().decode(new Uint8Array(await file.read(0, file.info.size)));

  /* Kept beside the drivers, to look at where a case differs. */
  writeFileSync(join(HARNESS, output), text);
  return text.trim().split(/\r?\n/);
}

/** The system palette a drawing driver ran against, by its `system` lines. */
function systemOf(lines: string[]) {
  const system: Colour[] = [];

  for (const line of lines) {
    const [kind, n, ...rgb] = line.split(' ');

    if (kind === 'system') {
      system[Number(n)] = rgb.map(Number) as Colour;
    }
  }

  return system;
}

/**
 * Each case a drawing driver drew, by its line (`kind values...`), and the
 * pixels it drew, by the patch after it: how many differ from what `draw`
 * draws on a fresh 640-square port, a case a line, those that differ at all.
 */
function compareCases(
  lines: string[],
  kind: string,
  draw: (bitmap: IndexedBitmap, values: number[]) => void
) {
  const wrong: string[] = [];
  const bottomUp = FIDELITY.bottomUp;
  let count = 0;
  let down = 0;

  for (let n = 0; n < lines.length; n++) {
    /* Each pass's port, bottom-up or top-down (`down 0`, `down 1`). */
    if (lines[n].startsWith('down ')) {
      down = Number(lines[n].split(' ')[1]);
    }

    if (!lines[n].startsWith(`${kind} `)) {
      continue;
    }

    const values = lines[n].split(' ').slice(1).map(Number);
    const [top, left, width, height] = lines[n + 1].split(' ').slice(1).map(Number);
    const bitmap = new IndexedBitmap(640, 640);
    let differ = 0;

    setFidelity({ bottomUp: down === 0 });
    draw(bitmap, values);
    setFidelity({ bottomUp });
    lines.slice(n + 2, n + 2 + height).forEach((row, r) => {
      for (let x = 0; x < width; x++) {
        const pixel = bitmap.get(left + x, top + r);
        const ours = pixel === IndexedBitmap.TRANSPARENT ? 0xfe : pixel;

        if (parseInt(row.slice(2 * x, 2 * x + 2), 16) !== ours) {
          differ++;
        }
      }
    });

    if (differ) {
      wrong.push(
        `${kind} ${count}${down ? ' top-down' : ''}: ${values.join(' ')}: ${differ} pixels`
      );
    }

    count++;
  }

  return { count, wrong };
}

describeHarness('CATZDLL.DLL on winbox.js, against the reimplementation', () => {
  it('measures a vector as Mag does: its root, after a 32-bit sum, truncated', async () => {
    const lines = await run('CATZMAG', 'CATZMAG.OUT');
    const wrong = lines.filter((line) => {
      const [x, y, answer] = line.split(' ').map(Number);
      return answer !== Math.trunc(Math.sqrt(x * x + y * y));
    });

    /* x from -3000 to 3000 by 250, y by 175. */
    expect(lines).toHaveLength(25 * 35);
    expect(wrong).toEqual([]);
  }, 120000);

  it('shades every colour by every depth as GenerateZDepthColor does', async () => {
    const lines = await run('CATZSHAD', 'CATZSHAD.OUT');
    const wrong = lines.filter((line) => {
      const [bits, colour, shift, answer] = line.split(' ').map(Number);
      /* On 4 bits a pixel the engine leaves a colour as it is. */
      return answer !== (bits === 4 ? colour : catzShade(colour, shift));
    });

    expect(lines).toHaveLength(2 * 256 * 17);
    expect(wrong).toEqual([]);
  }, 300000);

  it('reads and averages the Hunter’s breed files as Linez does', async () => {
    const lines = await run('CATZLNZ', 'CATZLNZ.OUT', ['AHUNTER.LNZ', 'KHUNTER.LNZ']);
    const text = (name: string) => readFileSync(join(RESOURCE, name), 'latin1');
    const adult = parseLnz(text('AHUNTER.LNZ'), 67);
    const young = parseLnz(text('KHUNTER.LNZ'), 67);
    const ours = new Map<string, Breed>([
      ['adult', adult],
      ['young', young],
      ...[0, 40, 100].map(
        (p) => [`average ${p}`, averageBreed(adult, young, p)] as [string, Breed]
      ),
    ]);

    /* The engine's dumps, breed by breed: each field's words. */
    const engine = new Map<string, Map<string, number[][]>>();
    let current: Map<string, number[][]> | null = null;

    for (const line of lines) {
      const breed = /^breed (.*)$/.exec(line);

      if (breed) {
        current = new Map();
        engine.set(breed[1], current);
        continue;
      }

      const [field, ...values] = line.split(' ');
      current!.set(field, [...(current!.get(field) ?? []), values.map(Number)]);
    }

    const pairs = (list: number[][]) => list.flat();
    const differences: string[] = [];

    for (const [name, breed] of ours) {
      const theirs = engine.get(name)!;
      const shape = breed.catz!;
      const expected: Record<string, number[][]> = {
        extensions: [
          [
            breed.extensions.frontLeg,
            breed.extensions.hindLeg,
            breed.extensions.body,
            breed.extensions.face,
          ],
        ],
        head: [[shape.head.percent, shape.head.extra]],
        ears: [[shape.ears]],
        feet: [[shape.feet.percent, shape.feet.extra]],
        scales: [breed.defaultScales.slice(0, 2)],
        /* Halved as the engine reads them; averageBreed keeps them doubled. */
        sizes: [breed.ballSizeDiffs.map((diff) => Math.trunc(diff / 2))],
        fuzz: [breed.fuzz],
        colours: [breed.ballColor256],
        up: [pairs(shape.up)],
        forward: [pairs(shape.forward)],
        sideways: [pairs(shape.sideways)],
        project: [pairs(shape.project)],
        whiskers: [(breed.whiskers ?? []).flatMap(({ from, to, colour }) => [from, to, colour])],
        line: breed.lines.map((line) => [
          line.from,
          line.to,
          line.fuzz,
          ...(line.thickness ?? [90, 90]),
          line.leftColour ?? -1,
          line.rightColour ?? -1,
          line.colour ?? -1,
        ]),
      };

      for (const [field, value] of Object.entries(expected)) {
        const got = theirs.get(field) ?? [];

        if (JSON.stringify(got) !== JSON.stringify(value)) {
          differences.push(
            `${name} ${field}: engine ${JSON.stringify(got)}, ours ${JSON.stringify(value)}`
          );
        }
      }
    }

    expect(differences).toEqual([]);
  }, 300000);

  it('translates colours, and draws lines, as XDrawPort does on 256 colours', async () => {
    const lines = await run('CATZLINE', 'CATZLINE.OUT', [], { display: 'vga256' });
    const system: Colour[] = [];
    const theirs: number[] = [];

    for (const line of lines) {
      const [kind, ...values] = line.split(' ');

      if (kind === 'system') {
        system[Number(values[0])] = values.slice(1).map(Number) as Colour;
      } else if (kind === 'translate') {
        theirs[Number(values[0])] = Number(values[1]);
      }
    }

    /* The translation, from the palette of the system it ran on. */
    const engine = parseNe(new Uint8Array(readFileSync(join(SYSTEM, 'CATZDLL.DLL'))));
    const translate = catzTranslation(
      readPalette(engine, PALETTE_256, 256, CATZ_PALETTE_TYPE),
      system
    );
    const translated = Array.from({ length: 256 }, (_, n) => translate(n));

    expect(translated).toEqual(theirs);

    /* Each line, on a 640-square port either way up, in the engine's own colours;
     * the driver gives no right colour, so the right edge is the line's own. */
    const drawn = compareCases(lines, 'line', (bitmap, [x1, y1, x2, y2, wS, wE, colour, edge]) =>
      drawLine(bitmap, { x: x1, y: y1 }, { x: x2, y: y2 }, wS, wE, theirs[colour], {
        left: theirs[edge >= 0 ? edge : colour],
        right: theirs[colour],
      })
    );

    expect(drawn.count).toBe(200);
    expect(drawn.wrong).toEqual([]);
  }, 600000);

  it('draws whiskers, balls and eyelids as XDrawWhiskerLine and XFillCircleEx do', async () => {
    const lines = await run('CATZBALL', 'CATZBALL.OUT', [], { display: 'vga256' });
    const engine = parseNe(new Uint8Array(readFileSync(join(SYSTEM, 'CATZDLL.DLL'))));
    const translate = catzTranslation(
      readPalette(engine, PALETTE_256, 256, CATZ_PALETTE_TYPE),
      systemOf(lines)
    );
    /* The circle tables as the engine made them, from the driver's seed, 1234. */
    const tables = circleTables(1234);

    /* A whisker in its own colour, untranslated; its counter at 0, untwitched. */
    const whiskers = compareCases(lines, 'whisker', (bitmap, [x1, y1, x2, y2, colour, radius]) =>
      drawWhisker(bitmap, { x: x1, y: y1 }, { x: x2, y: y2 }, colour, radius)
    );
    const balls = compareCases(
      lines,
      'ball',
      (bitmap, [x, y, diameter, colour, outline, speckle, mode, fuzz]) =>
        fillBall(
          bitmap,
          {
            x,
            y,
            diameter,
            colour: translate(colour),
            outlineColour: translate(outline),
            speckleColour: speckle < 0 ? -1 : translate(speckle),
            outline: mode,
            fuzz,
            catz: true,
          },
          tables
        )
    );

    /* An eyelid, its rows walked from the bottom on a bottom-up port; none
     * that covers nothing, as `drawLid` draws none. */
    const lids = compareCases(lines, 'lid', (bitmap, [x, y, d, colour, cover, angle]) => {
      if (cover >= 1) {
        fillLid(bitmap, {
          x,
          y,
          d,
          colour: translate(colour),
          cover,
          angle,
          turn: CATZ_TURN,
          flip: FIDELITY.bottomUp,
        });
      }
    });

    /* Where a lid's edge falls within a hair of a pixel's edge -- the
     * engine's sines and tangents are the x87's, to 64 bits -- a pixel may
     * go the other way: 3 of these 240, each a single pixel. */
    const ties = lids.wrong.filter((line) => line.endsWith(': 1 pixels'));

    expect([whiskers.count, balls.count, lids.count]).toEqual([120, 240, 240]);
    expect([...whiskers.wrong, ...balls.wrong]).toEqual([]);
    expect(lids.wrong.filter((line) => !ties.includes(line))).toEqual([]);
    expect(ties.length).toBeLessThanOrEqual(3);
  }, 600000);

  it('places, orders, shades and draws whole frames of a cat as XBallz does', async () => {
    const files = readdirSync(RESOURCE).filter((name) =>
      /^(CAT\d*\.(BHD|BDT)|[AK]HUNTER\.LNZ)$/.test(name)
    );
    const lines = await run('CATZFRAM', 'CATZFRAM.OUT', files, {
      display: 'vga256',
      frames: 200000,
    });
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const text = (name: string) => readFileSync(join(RESOURCE, name), 'latin1');
    const header = parseBhd(read('CAT.BHD'));
    const frames: Frame[] = [];

    for (let n = 0; files.includes(`CAT${n}.BDT`); n++) {
      frames.push(...parseAnimation(header, n, read(`CAT${n}.BDT`)));
    }

    /* The kitten, averaged all the way from the adult, as the driver has it. */
    const breed = averageBreed(
      parseLnz(text('AHUNTER.LNZ'), 67),
      parseLnz(text('KHUNTER.LNZ'), 67),
      100
    );
    const shaped = extendFrames(frames, breed);
    const engine = parseNe(new Uint8Array(readFileSync(join(SYSTEM, 'CATZDLL.DLL'))));
    const translate = catzTranslation(
      readPalette(engine, PALETTE_256, 256, CATZ_PALETTE_TYPE),
      systemOf(lines)
    );

    /* Each case as the driver gave it, and what the engine made of it. */
    const cases: {
      values: number[];
      bounds: number[];
      balls: number[][];
      order?: number[];
      shades?: number[];
    }[] = [];

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);
      const last = cases[cases.length - 1];

      if (kind === 'case') {
        cases.push({ values, bounds: [], balls: [] });
      } else if (kind === 'bounds') {
        last.bounds = values;
      } else if (kind === 'ball') {
        last.balls.push(values.slice(1));
      } else if (kind === 'order') {
        last.order = values;
      } else if (kind === 'shades') {
        last.shades = values;
      }
    }

    const placedOf = ([frame, rotation, tilt, roll]: number[]) =>
      project(breed, header, shaped[frame], scalesForAge(breed, 0), rotation, 100, undefined, {
        tilt,
        roll,
      });
    const wrong: string[] = [];

    for (const { values, balls, order, shades } of cases) {
      const placed = placedOf(values);
      const ours = placed.map(({ x, y, depth, diameter }) => [x, y, depth, diameter / 2]);

      if (JSON.stringify(ours) !== JSON.stringify(balls)) {
        wrong.push(`case ${values.join(' ')}: placed`);
      }

      if (order?.join(' ') !== drawOrder(breed, placed).join(' ')) {
        wrong.push(`case ${values.join(' ')}: order`);
      }

      if (shades?.join(' ') !== depthShades(breed, placed).join(' ')) {
        wrong.push(`case ${values.join(' ')}: shades`);
      }
    }

    /* Each frame drawn with the pet's origin where the engine puts it: the
     * square's corner less its bounds' (`origin x y`, the patch after). */
    let next = 0;
    const drawn = compareCases(lines, 'origin', (bitmap, [x, y]) => {
      const { values, bounds } = cases[next++ % cases.length];
      const [frame, rotation, tilt, roll, lids] = values;
      drawPet(bitmap, breed, header, shaped[frame], {
        colours: 256,
        originX: x - bounds[0],
        originY: y - bounds[1],
        yaw: rotation,
        angles: { tilt, roll, spin: 0 },
        seed: 1234,
        translate,
        catzLids: lids,
      });
    });

    expect(cases).toHaveLength(26);
    expect(drawn.count).toBe(26);
    expect([...wrong, ...drawn.wrong]).toEqual([]);
  }, 1800000);

  it('reshapes the cat’s frames for every breed as ModifyBallzData does', async () => {
    const files = readdirSync(RESOURCE).filter((name) =>
      /^(CAT\d*\.(BHD|BDT)|.*\.LNZ)$/.test(name)
    );
    const lines = await run('CATZSHAP', 'CATZSHAP.OUT', files, { frames: 400000 });
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const text = (name: string) => readFileSync(join(RESOURCE, name), 'latin1');
    const header = parseBhd(read('CAT.BHD'));
    const frames: Frame[] = [];

    for (let n = 0; files.includes(`CAT${n}.BDT`); n++) {
      frames.push(...parseAnimation(header, n, read(`CAT${n}.BDT`)));
    }

    /* Each frame as the engine held it, against the frame reshaped for the breed. */
    const wrong: string[] = [];
    let breed: Breed | null = null;
    let name = '';
    let count = 0;

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');

      if (kind === 'breed') {
        const [adult, young, percent] = rest;
        breed = averageBreed(parseLnz(text(adult), 67), parseLnz(text(young), 67), Number(percent));
        name = `${adult} ${young} ${percent}`;
      } else if (kind === 'frame' && breed) {
        const [n, ...values] = rest.map(Number);
        /* Unturned and unpitched, at a pet scale of 256 and a ball scale of
         * 512: the frame as it is held, each ball's radius its size. */
        const placed = project(
          breed,
          header,
          extendCatzFrame(frames[n], breed),
          {
            pet: 256,
            ball: 512,
          },
          0,
          100,
          undefined,
          {},
          undefined,
          { pitch: 0 }
        );
        const ours = placed.flatMap(({ x, y, depth, diameter }) => [x, y, depth, diameter / 2]);
        const differ = ours.flatMap((value, at) =>
          value === values[at]
            ? []
            : [`ball ${Math.trunc(at / 4)} ${'xyzr'[at % 4]} ${values[at]}/${value}`]
        );

        if (differ.length) {
          wrong.push(`${name} frame ${n}: ${differ.slice(0, 4).join(', ')} (${differ.length})`);
        }

        count++;
      }
    }

    expect(count).toBe(14 * 3 * 35);
    expect(wrong).toEqual([]);
  }, 1800000);

  it('plays every action as ScriptSprite does, tick by tick: its frames, turns and fudgers', async () => {
    const files = readdirSync(RESOURCE).filter((name) =>
      /^(CAT\d*\.(BHD|BDT)|CAT\.SCP|[AK]HUNTER\.LNZ)$/.test(name)
    );
    const read = (name: string) => new Uint8Array(readFileSync(join(RESOURCE, name)));
    const engine = parseNe(new Uint8Array(readFileSync(join(SYSTEM, 'CATZDLL.DLL'))));
    const opcodes = readCatzOpcodes(engine);
    const data = read('CAT.SCP');
    const scripts = parseScripts(data, catzArity(opcodes), SCRIPTS.catz);
    const preamble = new DataView(data.buffer, data.byteOffset + data.indexOf(0) + 1);
    const positions = { count: preamble.getUint16(0, true), neutral: preamble.getUint16(2, true) };
    const header = parseBhd(read('CAT.BHD'));
    const frames: Frame[] = [];

    for (let n = 0; files.includes(`CAT${n}.BDT`); n++) {
      frames.push(...parseAnimation(header, n, read(`CAT${n}.BDT`)));
    }

    /* The kitten the driver makes, to measure how its frames lie by. */
    const text = (name: string) => readFileSync(join(RESOURCE, name), 'latin1');
    const breed = averageBreed(
      parseLnz(text('AHUNTER.LNZ'), 67),
      parseLnz(text('KHUNTER.LNZ'), 67),
      100
    );
    const shaped = extendFrames(frames, breed);
    const { neck, butt } = skeletonOf(breed);

    /* Not an action that may look at another sprite, which a bare sprite has
     * none of (`lookAtSprite1`): 44 of the 805. */
    const looks = (action: number, seen = new Set<number>()): boolean => {
      if (seen.has(action) || !scripts[action]) {
        return false;
      }

      seen.add(action);
      return scripts[action].variants.some((variant) =>
        variant.some((element) => {
          const name = 'op' in element ? opcodes.get(element.op)?.name : undefined;
          const [nested] = 'op' in element ? element.operands : [];
          return (
            name === 'lookAtSprite1' ||
            (name === 'playAction2' && typeof nested === 'number' && looks(nested, seen))
          );
        })
      );
    };

    /* Nor, for the head's and eyes' fudgers, one that may look at a point:
     * where the head turns to depends on where the cat is drawn, which a
     * bare sprite has nowhere (`SetHeadTarget`, seg40:5a47). */
    const points = (action: number, seen = new Set<number>()): boolean => {
      if (seen.has(action) || !scripts[action]) {
        return false;
      }

      seen.add(action);
      return scripts[action].variants.some((variant) =>
        variant.some((element) => {
          const name = 'op' in element ? opcodes.get(element.op)?.name : undefined;
          const [nested] = 'op' in element ? element.operands : [];
          return (
            name === 'lookAtLocation2' ||
            name === 'lookAtRandomPt0' ||
            (/^play(Layered)?Action/.test(name ?? '') &&
              typeof nested === 'number' &&
              points(nested, seen))
          );
        })
      );
    };

    /* Every other action, its variants in turn, from the neutral position
     * one time in three and from the end of some other action otherwise. */
    const ends = [...new Set(scripts.map(({ to }) => to).filter(Boolean))];
    const cases = scripts.flatMap((script, action) =>
      looks(action)
        ? []
        : [
            [
              action,
              action % script.variants.length,
              action % 3 ? ends[(action * 37) % ends.length] : positions.neutral,
            ],
          ]
    );
    const lines = await run('CATZSCPT', 'CATZSCPT.OUT', files, {
      display: 'vga256',
      frames: 1e9,
      seconds: 2400,
      written: { 'CASES.TXT': cases.map((line) => line.join(' ')).join('\r\n') + '\r\n' },
    });

    let table: number[] = [];
    const played: {
      values: number[];
      ticks: number[][];
      fudgers: CatzFudger[];
    }[] = [];

    for (const line of lines) {
      const [kind, ...rest] = line.split(' ');
      const values = rest.map(Number);
      const last = played[played.length - 1];

      if (kind === 'table') {
        table = values;
      } else if (kind === 'case') {
        played.push({ values, ticks: [], fudgers: makeCatzFudgers() });
      } else if (kind === 'fudger') {
        /* As the case found it: what `ResetParams` left of the last. */
        const [n, value, previous, rising, before, state, target, drift] = values;
        const bits = new DataView(new ArrayBuffer(8));
        bits.setBigUint64(0, BigInt(`0x${rest[8]}`));
        Object.assign(last.fudgers[n], {
          value,
          previous,
          rising: rising === 1,
          risingBefore: before === 1,
          state,
          target,
          drift,
          velocity: bits.getFloat64(0),
        });
      } else if (kind === 'tick') {
        last.ticks.push(values);
      }
    }

    /* Each played with the engine's own random numbers: its table where it
     * had got to, and C's `rand` from its seed, as Borland's runtime makes
     * them (`seed × 22695477 + 1`, the high word's low 15 bits). */
    const wrong: string[] = [];

    let earlier: number | undefined;

    for (const { values, ticks, fudgers } of played) {
      const [action, variant, from, index, seed] = values;
      let [at, state] = [index, BigInt(seed)];
      const random = (n: number, source: 'table' | 'rand') => {
        if (source === 'table') {
          at = at > 149 ? 0 : at;
          return table[at++] % n;
        }

        state = (state * 22695477n + 1n) & 0xffffffffn;
        return Number((state >> 16n) & 0x7fffn) % n;
      };
      const steps = catzTimeline(scripts, positions, action, {
        flags: (frame) => frames[frame]?.tag ?? 3,
        random,
        from,
        variant,
        limit: 400,
        angle: (frame) => catzFrameAngle(shaped[frame], neck, butt),
        fudgers,
        shown: earlier,
      });
      earlier = ticks.at(-1)?.[0];

      /* The last tick, when it shows nothing new, is only the action's end
       * run. A reference frame takes no tick of its own, but for the last,
       * which nothing follows: the tick ends on it. */
      const last = ticks.at(-1);
      const shown =
        last && last[3] <= 1 && (ticks.length === 1 || last[0] === ticks.at(-2)![0])
          ? ticks.slice(0, -1)
          : ticks;
      const theirs = shown.map(([frame]) => frame);
      const ticked = steps
        .filter(({ reference }, n) => !reference || n === steps.length - 1)
        .slice(0, theirs.length);
      const ours = ticked.map(({ frame }) => frame);

      if (ours.join() !== theirs.join()) {
        const first = theirs.findIndex((frame, n) => frame !== ours[n]);
        wrong.push(`action ${action} variant ${variant} from ${from}: tick ${first}`);
      }

      /* Each tick's rotation and fudgers (the tick's fields from the sixth). */
      const compared = (n: number) => !points(action) || ![3, 4, 10, 11].includes(n);
      const off = ticked.findIndex(
        ({ fudged }, tick) =>
          fudged?.some((value, n) => compared(n) && value !== shown[tick][5 + n]) ||
          fudged?.[0] !== shown[tick][1]
      );

      if (off >= 0) {
        wrong.push(`action ${action} variant ${variant} from ${from}: fudgers at tick ${off}`);
      }
    }

    expect(played).toHaveLength(cases.length);
    expect(wrong).toEqual([]);
  }, 2700000);
});
