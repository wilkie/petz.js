/**
 * Dogz's playpen in the harness (harness/dogzpen.c): DOGZDLL.DLL's own pet
 * module set up as DOGZ.WAD sets it up, around the oracle's dog, and run a
 * frame at a time on winbox.js's Rust engine, so a run is the same every
 * time.
 *
 * The game's parameters (`PetParams`) are what DOGZ.WAD itself filled in:
 * where they are not kept already (`oracle/build/harness/dogz-params.bin`),
 * the first test runs DOGZ.WAD from harness/dogzcap.c and keeps them.
 *
 * Each run is staged from a fresh copy of the oracle's install
 * (`oracle/build/drive-c/DOGZ.DOG`): Dogz writes its files back as it ends
 * (its trick table, `TRICKS.TDT`, among them), and a run that failed on an
 * older engine wrote it empty, which hangs the next in `DoIdle`.
 *
 * Needs winbox.js beside this repository with its `trace` example built
 * `--release` (from develop at or after d2e1c610), the drivers built, and the
 * oracle's install; skipped otherwise.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TRACE =
  process.env.WINBOX_TRACE ??
  join(ROOT, '..', 'winbox.js', 'target', 'release', 'examples', 'trace');
const WINDOWS_256 = join(ROOT, '..', 'winbox.js', 'oracle', 'build', 'drive-c-vga256');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const DRIVE = join(ROOT, 'oracle', 'build', 'drive-c');
const PARAMS = join(HARNESS, 'dogz-params.bin');

/** The libraries Dogz loads from Windows' own directory, put beside the program. */
const LIBRARIES = [
  ['WINDOWS', 'DOGZDLL.DLL'],
  ['WINDOWS', 'GUARDDOG.DLL'],
  ['WINDOWS', 'SYSTEM', 'WING.DLL'],
  ['WINDOWS', 'SYSTEM', 'WINGDE.DLL'],
  ['WINDOWS', 'SYSTEM', 'WINGDIB.DRV'],
  ['WINDOWS', 'SYSTEM', 'WINGPAL.WND'],
];

/** CTL3DV2 must be in the system directory, or it says so and stops. */
const EXTRAS = [['WINDOWS', 'SYSTEM', 'CTL3DV2.DLL']];

const ready =
  existsSync(TRACE) &&
  existsSync(WINDOWS_256) &&
  existsSync(join(DRIVE, 'DOGZ.DOG', 'DOGZ.WAD')) &&
  existsSync(join(HARNESS, 'DOGZPEN.EXE')) &&
  existsSync(join(HARNESS, 'DOGZCAP.EXE'));

/** A drive with Dogz's folder fresh from the oracle at `C:\CORPUS\<folder>`, its libraries beside it, and a program of the harness's there. */
function stage(name: string, folder: string, program: string) {
  const drive = join(HARNESS, `drive-${name}`);
  rmSync(drive, { recursive: true, force: true });
  const at = join(drive, 'CORPUS', folder);
  mkdirSync(at, { recursive: true });
  cpSync(join(DRIVE, 'DOGZ.DOG'), at, { recursive: true });

  for (const parts of LIBRARIES) {
    cpSync(join(DRIVE, ...parts), join(at, parts[parts.length - 1]));
  }

  for (const parts of EXTRAS) {
    mkdirSync(join(drive, ...parts.slice(0, -1)), { recursive: true });
    cpSync(join(DRIVE, ...parts), join(drive, ...parts));
  }

  cpSync(join(HARNESS, program), join(at, program));
  return { drive, at };
}

/** A program of the harness's run on the Rust engine, until it ends Windows (`ExitWindows`). */
function run(drive: string, folder: string, program: string, seconds: number) {
  const result = spawnSync(
    TRACE,
    [
      join(drive, 'CORPUS', folder, program),
      '--drive',
      drive,
      '--path',
      `C:\\CORPUS\\${folder}\\${program}`,
      '--windows',
      WINDOWS_256,
      '--display',
      'vga256',
      '--seconds',
      String(seconds),
      '--budget',
      '1000000000000',
      '--summary',
    ],
    { encoding: 'latin1', maxBuffer: 1 << 26 }
  );
  const stopped = /stopped: (.*)/.exec(result.stdout ?? '')?.[1] ?? result.error?.message;

  expect(stopped).toMatch(/^Ended/);
}

const describeHarness = ready ? describe : describe.skip;

describeHarness('Dogz’s playpen, held to DOGZDLL.DLL', () => {
  it('keeps the parameters DOGZ.WAD fills in, where they are not kept', () => {
    if (existsSync(PARAMS)) {
      return;
    }

    /* (Beside DOGZ.WAD, which it runs by its name.) */
    const { drive, at } = stage('dogzcap', 'DOGZ', 'DOGZCAP.EXE');
    run(drive, 'DOGZ', 'DOGZCAP.EXE', 600);
    expect(readFileSync(join(at, 'DOGZCAP.OUT'), 'latin1')).toMatch(/^made /m);

    const params = readFileSync(join(at, 'PARAMS.BIN'));
    expect(params.length).toBe(0x680);
    writeFileSync(PARAMS, params);
  }, 1800000);

  it('runs a dog in its playpen: it moves on from walking, its states and draws its own', () => {
    const { drive, at } = stage('dogzpen', 'DOGZPEN', 'DOGZPEN.EXE');
    cpSync(PARAMS, join(at, 'PARAMS.BIN'));
    writeFileSync(join(at, 'FRAMES.TXT'), '300\r\n');
    run(drive, 'DOGZPEN', 'DOGZPEN.EXE', 900);

    const lines = readFileSync(join(drive, 'DOGZPEN.OUT'), 'latin1').split('\r\n');
    /* `InitPetModule` answered 0. */
    expect(lines.some((line) => line.startsWith('made module 0 '))).toBe(true);

    const frames = lines
      .filter((line) => line.startsWith('frame '))
      .map((line) => line.split(' ').slice(1).map(Number));
    expect(frames).toHaveLength(300);

    const states = new Set(frames.map(([, state]) => state));
    const seeds = new Set(frames.map(([, , , seed]) => seed));
    console.log(`states met: ${[...states].join(', ')}; ${seeds.size} seeds`);

    /* Out of its kennel it walks (7, `eLocomote`), and goes on to others. */
    expect(frames[0][1]).toBe(7);
    expect(states.size).toBeGreaterThan(1);
    expect(seeds.size).toBeGreaterThan(1);
  }, 1800000);
});
