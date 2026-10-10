/**
 * Catz's playpen in the harness (harness/catzpen.c): CATZDLL.DLL's own pet
 * module set up as CATZ.EXE sets it up, around a cat adopted on the oracle,
 * and run a frame at a time on winbox.js's virtual clock, so a run is the
 * same every time. See kb/topics/catz-behaviour.md, "The playpen harness".
 *
 * The game's parameters (`PetParams`) are what CATZ.EXE itself filled in:
 * the first test runs the game on winbox.js to its playpen, and keeps them
 * as it begins its playpen (`oracle/build/harness/catz-params.bin`), where
 * they are not kept already.
 *
 * Needs winbox.js beside this repository, the drivers built, and the
 * oracle's registered CD-ROM install with a cat adopted
 * (`oracle/build/variants/catz-cd-registered`); skipped otherwise.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WINBOX = join(ROOT, '..', 'winbox.js', 'test', 'win16', 'run-probe.ts');
const HARNESS = join(ROOT, 'oracle', 'build', 'harness');
const DRIVE = join(ROOT, 'oracle', 'build', 'variants', 'catz-cd-registered');
const PARAMS = join(HARNESS, 'catz-params.bin');

/** The libraries Catz loads from Windows' own directory, put beside the program. */
const LIBRARIES = [
  'CATZDLL.DLL',
  'CATZREZX.DLL',
  'CATNAPZ.DLL',
  'CATNEURN.DLL',
  'SOSLIB03.DLL',
  'WING.DLL',
  'WINGDE.DLL',
  'WINGDIB.DRV',
  'WINGPAL.WND',
];

/** What Catz wants in Windows' own directories: CTL3DV2.DLL, and what registering it left. */
const EXTRAS = [
  ['WINDOWS', 'SYSTEM', 'CTL3DV2.DLL'],
  ['WINDOWS', 'CATZ.INI'],
  ['WINDOWS', 'PFFOO.VAL'],
].map((parts) => ({ parts, file: join(DRIVE, ...parts) }));

const ready = [WINBOX, join(HARNESS, 'CATZPEN.EXE'), join(DRIVE, 'CATZ.DOG')].every(existsSync);
const describeHarness = ready ? describe : describe.skip;

/** A stage: the game's directory, and its libraries beside it. */
function stage(name: string) {
  const at = join(HARNESS, `stage-${name}`);
  rmSync(at, { recursive: true, force: true });
  mkdirSync(at, { recursive: true });
  cpSync(join(DRIVE, 'CATZ.DOG'), at, { recursive: true });

  for (const library of LIBRARIES) {
    cpSync(join(DRIVE, 'WINDOWS', 'SYSTEM', library), join(at, library));
  }

  return at;
}

/** What of winbox.js's run the parameters are read through. */
interface WatchedCall {
  name: string;
  args?: unknown[];
}

interface Win16 {
  _modules: {
    _modules: Record<
      string,
      {
        name: string;
        _segmentMap?: Record<number, number>;
        loader?: { _segmentMap?: Record<number, number> };
        _loader?: { _segmentMap?: Record<number, number> };
      }
    >;
  };
  machine: { cpu: { core: { read8(selector: number, offset: number): number } } };
}

describeHarness('Catz’s playpen, held to CATZDLL.DLL', () => {
  it('keeps the parameters CATZ.EXE gives its playpen', async () => {
    if (existsSync(PARAMS)) {
      return;
    }

    const directory = stage('CATZ');
    const { runProbe } = await import(WINBOX);
    let kept: Uint8Array | null = null;

    /* CATZ.WAD's PetParams (its ds:13f0, segment 7) as InitPetModule looks
     * for its first apts. Its Welcome box answered with Return. */
    const watch = (call: WatchedCall, _count: number, win16: Win16) => {
      if (kept || call.name !== 'FindResource' || String(call.args?.[2]) !== 'APTF') {
        return;
      }

      const catz = Object.values(win16._modules._modules).find((module) => module.name === 'CATZ')!;
      const map = catz._segmentMap ?? catz.loader?._segmentMap ?? catz._loader?._segmentMap ?? {};
      const ds = (map[7] << 3) | 7;
      const core = win16.machine.cpu.core;
      kept = Uint8Array.from({ length: 0x722 }, (_, n) => core.read8(ds, 0x13f0 + n));
    };

    await runProbe('catz', 1, false, true, 120, {
      display: 'vga256',
      virtual: true,
      program: { directory, file: 'CATZ.EXE', folder: 'CATZ.DOG' },
      extras: EXTRAS,
      watch,
    });

    expect(kept).not.toBeNull();
    writeFileSync(PARAMS, kept!);
  }, 1800000);

  it('runs a cat in its playpen, the same every time', async () => {
    const directory = stage('CATZPEN');
    cpSync(join(HARNESS, 'CATZPEN.EXE'), join(directory, 'CATZPEN.EXE'));
    cpSync(PARAMS, join(directory, 'PARAMS.BIN'));

    const { runProbe } = await import(WINBOX);
    const result = await runProbe('catzpen', 1, false, true, 240, {
      display: 'vga256',
      virtual: true,
      program: { directory, file: 'CATZPEN.EXE', folder: 'CATZPEN' },
      extras: EXTRAS,
    });

    expect(result.failure ?? null).toBeNull();
    const file = await result.fileSystem.open(['CATZPEN.OUT']);
    const text = new TextDecoder().decode(new Uint8Array(await file.read(0, file.info.size)));
    writeFileSync(join(HARNESS, 'CATZPEN.OUT'), text);
    const lines = text.trim().split(/\r?\n/);

    expect(lines.slice(0, 3)).toEqual(['made global 0', 'made module 0', 'made tree']);
    expect(lines[3]).not.toBe('cat 0 0');
    expect(lines.filter((line) => line.startsWith('frame '))).toHaveLength(400);
    expect(readFileSync(PARAMS)).toHaveLength(0x722);
  }, 1800000);
});
