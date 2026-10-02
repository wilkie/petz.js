/**
 * Windows 3.1, running under DOSBox on a virtual X display, for a script to
 * drive: screens taken, keys pressed, text typed and buttons clicked.
 *
 * Installers and the adoption screens answer only to a person, so this is how
 * the oracle gets through them unattended. A screen is kept of every step
 * under oracle/build/screens/, named for the step, to look at when a step
 * stops working: everything here waits by the clock rather than by what is
 * on the screen, and a step that is not where it was expected to be shows up
 * there first.
 *
 * Needs `Xvfb`, ImageMagick's `import`, `dosbox` and Python 3 with libXtst
 * (`xinput.py`).
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MACHINE } from './install-windows.mjs';
import { BUILD, DRIVE, ROOT, SCREENS, log, pause, run } from './lib.mjs';

/** The virtual display. One session at a time uses it. */
const DISPLAY = ':94';

/**
 * The DOSBox configuration every session runs with.
 *
 * `autolock=false` matters to `xinput.py`'s pointer: with the mouse not
 * captured, DOSBox computes Windows' pointer motion from where the host's
 * pointer is in its window, which is what lets a script put it anywhere.
 */
function configuration(drive, command) {
  return [
    '[dosbox]',
    `machine=${MACHINE}`,
    'memsize=16',
    '[cpu]',
    'core=auto',
    'cycles=max',
    '[sdl]',
    'autolock=false',
    'output=surface',
    '[render]',
    'scaler=none',
    'aspect=false',
    '[autoexec]',
    `mount c ${drive}`,
    'c:',
    'cd \\WINDOWS',
    command,
    'exit',
    '',
  ].join('\n');
}

/**
 * Starts Windows with `win /s <program>` -- standard mode, Program Manager as
 * the shell, and `program` run once it is up -- and hands `steps` a session
 * to drive it with. Windows is waited for to end, as the steps should make
 * it, for `limit` seconds; then everything is stopped.
 *
 * @param {string} name - What the session is, for its screens' names.
 * @param {string} program - A DOS path to run, or '' for Windows alone.
 * @param {(session: Session) => Promise<void>} steps
 */
export async function withWindows(name, program, steps, { limit = 60, drive = DRIVE } = {}) {
  const config = join(BUILD, `${name}.conf`);
  await writeFile(config, configuration(drive, `win /s ${program}`.trim()));
  await mkdir(SCREENS, { recursive: true });

  /* `-extension GLX` turns GLX off: with it on, DOSBox draws nothing at all
   * on Xvfb. */
  const xvfb = spawn(
    'Xvfb',
    [DISPLAY, '-screen', '0', '800x600x24', '-nolisten', 'tcp', '-extension', 'GLX'],
    { stdio: 'ignore' }
  );

  await pause(1);

  if (xvfb.exitCode !== null) {
    throw new Error(`Xvfb could not start on ${DISPLAY}; is another session using it?`);
  }

  const dosbox = spawn('dosbox', ['-conf', config, '-exit'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      DISPLAY,
      SDL_VIDEODRIVER: 'x11',
      SDL_AUDIODRIVER: 'dummy',
      SDL_VIDEO_WINDOW_POS: '0,0',
    },
  });

  let shot = 0;

  /** @typedef {ReturnType<typeof session>} Session */
  const session = () => ({
    /** Keeps the screen as oracle/build/screens/<name>-<n>-<label>.png. */
    screen: async (label) => {
      shot += 1;
      const file = join(SCREENS, `${name}-${String(shot).padStart(2, '0')}-${label}.png`);
      await run('import', ['-display', DISPLAY, '-window', 'root', '-crop', '640x480+0+0', file]);
      return file;
    },

    /** Keys by X keysym name, chords joined by `+`: `Return`, `Alt_L+i`. */
    keys: (...keys) => input(keys),

    /** Text, a character at a time. */
    type: (text) => input([`type:${text}`]),

    /** A left click at a point of Windows' 640x480 screen. */
    click: (x, y) => input([`click:${x},${y}`]),

    pause,

    /** Whether Windows has ended. */
    ended: () => dosbox.exitCode !== null,
  });

  const input = (args) =>
    run('python3', [join(ROOT, 'scripts', 'oracle', 'xinput.py'), DISPLAY, ...args]);

  try {
    await steps(session());

    const ending = Date.now();

    while (dosbox.exitCode === null && Date.now() - ending < limit * 1000) {
      await pause(1);
    }

    if (dosbox.exitCode === null) {
      await session().screen('stuck');
      throw new Error(`Windows did not end; see oracle/build/screens/${name}-*.png`);
    }
  } finally {
    dosbox.kill('SIGKILL');
    xvfb.kill('SIGKILL');
  }
}

/**
 * Ends Windows from Program Manager: Alt+F4, then Enter on "This will end
 * your Windows session". Program Manager has to be the active window.
 */
export async function exitWindows(session) {
  await session.keys('Alt_L+F4');
  await session.pause(2);
  await session.screen('exit-windows');
  await session.keys('Return');
  log('  ending Windows');
}
