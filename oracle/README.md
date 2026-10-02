# The oracle

A real Windows 3.1 with a real, registered Dogz on it, running under DOSBox:
what every measurement in the knowledge base is made against. The scripts that
build it are in `scripts/oracle/`; `pnpm oracle` runs them in order.

| File                | Committed | What it is                                                                                               |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `manifest.json`     | yes       | Every input, where it comes from and its SHA-256; the answers given to Setup and to the adoption screens |
| `installation.json` | yes       | Every file of the finished drive: size, SHA-256, and the stage that wrote it                             |
| `.cache/`           | no        | The fetched media                                                                                        |
| `build/drive-c/`    | no        | The installed drive, mounted by DOSBox as C:                                                             |
| `build/screens/`    | no        | A picture of every screen the scripted installers passed through                                         |
| `build/stages/`     | no        | The drive's hashes as each stage left it                                                                 |
| `build/variants/`   | no        | Copies of the drive with one thing changed, to measure on                                                |
| `build/ghidra/`     | no        | Ghidra's projects: each module imported and analysed once                                                |
| `.cache/tools/`     | no        | Ghidra and its Java runtime                                                                              |
| `build/play/`       | no        | The copy of the drive `pnpm oracle:run` plays on                                                         |

## The scripts

| Script                | Does                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `fetch.mjs`           | Fetches the media and checks it against the manifest; `--pin` records new hashes instead |
| `install-windows.mjs` | Runs Windows' Setup unattended from an answer file, with the 256-colour driver           |
| `install-dogz.mjs`    | Runs Dogz's InstallShield Setup from Program Manager and answers its screens             |
| `register-dogz.mjs`   | Adopts a puppy through the adoption screens, with the unlock code worked out for DOSBox  |
| `fingerprint.mjs`     | Records the drive in `installation.json`; `--check` compares it                          |
| `variant.mjs`         | Copies the drive with one thing changed: the display driver, or the dog's breed          |
| `shoot.mjs`           | Runs Dogz on a variant and keeps pictures of the screen                                  |
| `run.mjs`             | Plays Dogz on your display, on a copy of the drive                                       |
| `session.mjs`         | Runs Windows on a virtual X display for the scripts to drive                             |
| `xinput.py`           | Presses keys, types, and puts Windows' pointer where it is wanted                        |

## Driving Windows

Dogz's Setup and its adoption screens answer only to a person, so the scripts
drive them: Windows runs under DOSBox on a virtual X display (`Xvfb :94`), and
`xinput.py` sends keys and clicks through the XTest extension.

Clicking is the hard part. DOSBox gives Windows only relative mouse motion,
which Windows' mouse driver scales and accelerates, so where a motion takes the
pointer is never quite certain. With its mouse not captured, DOSBox computes
the motion from where the host's pointer is in its window, with the window's
height mapped to only 200 of Windows' 480 rows. So `xinput.py` finds Windows'
arrow on the screen, moves the host's pointer by what the scales predict a
pixel at a time, too slowly to be accelerated, and looks again until the arrow
is there. Where the host's pointer would have to leave the window, it ratchets:
a fast leap one way, which the driver doubles, and a slow walk back, which it
does not, leaves Windows' pointer moved and the host's where it was. Over an
edit box the pointer is an I-beam, which it cannot find, so the scripts type
into a box that already has the focus rather than clicking it.

Every step waits by the clock rather than by what is on the screen, and keeps
a picture of the screen in `build/screens/`. A step that stops working shows up
there first.

## What is not the same twice

A few files are written from the clock or from timing the machine, and differ
between two installations however faithfully each was made. They are listed in
the manifest's `fingerprint.volatile`, each with the reason; `fingerprint.mjs
--check` records their hashes but does not hold to them.
