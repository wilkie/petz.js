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

import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { averageBreed, type Breed, parseLnz } from '../../src/formats/lnz.ts';
import { catzShade } from '../../src/render/ballz.ts';

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
async function run(program: string, output: string, files: string[] = []) {
  const stage = join(HARNESS, `stage-${program}`);
  mkdirSync(stage, { recursive: true });
  cpSync(join(HARNESS, `${program}.EXE`), join(stage, `${program}.EXE`));

  for (const library of ['CATZDLL.DLL', 'SOSLIB03.DLL']) {
    cpSync(join(SYSTEM, library), join(stage, library));
  }

  for (const file of files) {
    cpSync(join(RESOURCE, file), join(stage, file));
  }

  const { runProbe } = await import(WINBOX);
  const result = await runProbe(program.toLowerCase(), 20000, false, false, 60, {
    program: { directory: stage, file: `${program}.EXE`, folder: program },
  });

  expect(result.failure ?? null).toBeNull();
  const file = await result.fileSystem.open([output]);
  const text = new TextDecoder().decode(new Uint8Array(await file.read(0, file.info.size)));
  return text.trim().split(/\r?\n/);
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
});
