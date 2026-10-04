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

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { catzShade } from '../../src/render/ballz.ts';

const ROOT = process.cwd();
const WINBOX = join(ROOT, '..', 'winbox.js', 'test', 'win16', 'run-probe.ts');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const SYSTEM = join(ROOT, 'oracle', 'build', 'catz-retail-drive-c', 'WINDOWS', 'SYSTEM');
const ready = [WINBOX, join(HARNESS, 'CATZMAG.EXE'), join(SYSTEM, 'CATZDLL.DLL')].every(existsSync);
const describeHarness = ready ? describe : describe.skip;

/** Runs a driver in winbox.js beside CATZDLL.DLL and SOSLIB03.DLL; its output's lines. */
async function run(program: string, output: string) {
  const stage = join(HARNESS, `stage-${program}`);
  mkdirSync(stage, { recursive: true });
  cpSync(join(HARNESS, `${program}.EXE`), join(stage, `${program}.EXE`));

  for (const library of ['CATZDLL.DLL', 'SOSLIB03.DLL']) {
    cpSync(join(SYSTEM, library), join(stage, library));
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
});
