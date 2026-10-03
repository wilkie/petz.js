---
kind: guide
name: Building the oracle
summary: How to build the oracle this site's measurements come from — Windows 3.1 and a registered Dogz, installed by their own installers under DOSBox from media fetched from where it is published — and check that yours is the same installation, file for file.
---

Every **Measured** claim on this site was seen on the oracle: a real Windows 3.1 with a real Dogz installed on it and a puppy adopted, running under DOSBox. Anyone can build the same oracle. Nothing of Windows or Dogz is in the repository. What is in it pins every input and every output, so a build anywhere either matches the one this site was written against or says where it does not.

## What you need

- Node 22 and pnpm, and `pnpm install` in a clone of the repository.
- `dosbox` (0.74), which runs both installers and the game.
- `mtools`, which reads the floppy images.
- `Xvfb`, ImageMagick (`import`) and Python 3, which drive the installers on a virtual display: they read the screen, find the pointer, and press keys and buttons.

On Debian or Ubuntu: `apt install dosbox mtools xvfb imagemagick python3`.

## Build it

```shell
pnpm oracle
```

That runs five steps, each also a script of its own in `scripts/oracle/`:

1. **Fetch.** `fetch.mjs` downloads Windows 3.1 from WinWorld's library, Microsoft's Super VGA 256-colour driver and the two Dogz disks from archive.org. It checks every file against its SHA-256 in `oracle/manifest.json`, which is committed, and stops if any differs. Everything lands in `oracle/.cache/`, which is not committed.
2. **Install Windows.** `install-windows.mjs` runs Windows' own `SETUP.EXE` unattended, from an answer file, onto `oracle/build/drive-c/`, with the 256-colour driver for DOSBox's ET4000. It takes a few seconds.
3. **Install Dogz.** `install-dogz.mjs` starts Windows with Dogz's InstallShield Setup and answers its screens: the owner's name from the manifest, the default directory `C:\DOGZ.DOG`, the default program group. The answers are covered in [[topic:installation]].
4. **Adopt a puppy.** `register-dogz.mjs` starts Dogz, waits out WinG's one-time timing of the display, and goes through the adoption screens. It picks the puppy named in the manifest, enters the unlock code its copy protection expects, and names the dog. How that code was found is [[topic:adoption-unlock]].
5. **Check.** `fingerprint.mjs --check` compares every file on the drive with `oracle/installation.json`.

Steps 3 and 4 run Windows on a virtual X display. A picture of every screen they pass through is kept in `oracle/build/screens/`, and that is the first place to look when a step stops.

## Is it the same installation?

`oracle/installation.json` lists every file of the finished drive by path, size and SHA-256. It also says which stage left each file as it is: `windows`, `setup` or `adoption`. The list of files on this site is built from it. The check reports every file that is missing, added or different. A few files are written from the clock or from timing the machine, and are named in the manifest's `fingerprint.volatile` with the reason. Their hashes are recorded but not held to.

After changing an input on purpose, record the new output, and commit both with the change:

```shell
node scripts/oracle/fetch.mjs --pin              # new hashes into the manifest
node scripts/oracle/fingerprint.mjs              # a new installation.json
```

## Play with it

```shell
pnpm oracle:run
```

This runs the oracle's Dogz in a DOSBox window on your own display, on a copy of the drive in `oracle/build/play/`. The dog keeps its state on the drive and ages with the clock, so playing on the oracle's own drive would leave it no longer the installation the record describes. `--fresh` starts the copy again from the installation, and `--windows` starts Windows without Dogz. Click into the window to give it the mouse; Ctrl+F10 takes the mouse back.

## See it on another display, or another breed

```shell
node scripts/oracle/variant.mjs terrier16 --display vga --breed terrier
node scripts/oracle/shoot.mjs terrier16
```

The first copies the installation to `oracle/build/variants/terrier16/` with one thing changed: Windows' 16-colour VGA driver, or the adopted dog made another breed (`bigdog`, `bulldog`, `chiua`, `scotty` or `terrier`). The second runs Dogz on it and keeps pictures of the screen in `oracle/build/screens/`. The installation itself is never changed.

```shell
node scripts/oracle/variant.mjs held35 --hold 35
node scripts/oracle/shoot.mjs held35 --wait 12 --count 8 --every 3
```

`--hold <frame>` holds the dog still in one frame, to compare with a drawing: it rewrites every script in `ALL_PTZ.SCP` to show that frame for ever, the eyelids open and the head looking at nothing (cue 7), so whatever the dog plays first it stays in; `--turn <n>` turns it first. [[measured]] Held so, seven of eight pictures three seconds apart are identical to the byte; the eighth differs by a blink, 168 pixels of one eyelid. Rewriting only the kennel scripts (92 and 93) holds nothing: the dog does not play them as Dogz starts, but idles at the playpen's left edge, looking about.

`--plain` takes the chance out of the drawing and the clutter from behind it: the adopted breed's balls without fuzz or speckles, the saved dog removed so its own colours are drawn, the playpen's paw tile solid magenta, and the playpen window 480 pixels square at the screen's right. [[measured]] `--plain --hold 35` shows the big dog side-on, wholly in view, the same in every picture.

`--plain --keep-fur` leaves the breed's fuzz and speckles, for the drawing's random part; which seed a session drew with is found by searching (the seed is the clock's at start, not the same twice).

`--set "<section>=<n>"` gives every line of a section of the adopted breed's file one value, and `--set "<section>[<ball>]=<n>"` one ball's line, as many as wanted: `--set "Body Extension=100"` makes the dog long, `--set "256 Ball Color[45]=80"` one ball red, to find it on the screen.

[[measured]] WinG profiles the display the first time a variant runs on a new day: its key in `WIN.INI`'s `[WinG]` section changes with the date (`...-5D42-...` one day, `...-5D43-...` the next), and the profiling covers the screen for minutes. Shoot a fresh variant a second time; the first run has written the key.

## Probe the drawing

```shell
node scripts/oracle/probe.mjs
node scripts/oracle/probe.mjs fur35 --reuse
```

A probe holds the dog still in a variant, takes a picture of the oracle's screen, and measures the reimplementation's drawing against it. The probes are in `scripts/oracle/probes.json`: each is a variant's options, the frame it is held in, and how many pixels differed when it was last measured. For each, `probe.mjs` makes the variant, shoots it, and finds the dog in the picture: the largest patch on the magenta ground that is not a window, the tool panel told by its grey. Where the playpen's edge or a window cuts the dog off, it compares only what shows, and lines the two up by the sides that are whole; a dog cut off both ways, or a screen without the playpen (WinG timing the display), is shot again. Then it searches all 65,536 seeds for the session's (`scripts/oracle/seed-worker.mjs`, a share of them in each thread, half a minute in all), lines the drawing up with the dog, and counts the pixels that differ, colours compared as the VGA shows them, six bits a channel.

It prints each probe's count, the seed it found and the next best seed's count, and fails if a probe differs by more than 12 pixels beyond what was recorded. `--reuse` measures the pictures already taken, `--record` keeps what is measured as expected. Pictures of the oracle's dog, the drawing and where they differ, side by side, are kept in `oracle/build/probes/`, never committed; only the counts are. A claim measured so names its probe.

[[measured]] Beyond its seed, a session's picture depends on the eyelids, which a blink may catch half or wholly closed, and on which way up WinG made the screen's bitmap, which `probe.mjs` reads from the variant's WIN.INI (its newest timing of the display: 0 bottom-up, 1 top-down; see [[topic:drawing-a-dog]]). It tries the eyelids at 0, 33, 66 and 100 closed, and reports what it found. Measured so, the probes differ from the oracle's pictures by 0 to 9 pixels.

## Check a Read out claim

A **Read out** claim gives a file, a segment and an offset: `THINK.DLL` seg2:031a. The files are 16-bit Windows NE executables ([[format:ne]]), and segments are numbered from 1, as Windows numbers them. With the oracle built:

```shell
node scripts/re/disasm.ts THINK.DLL 2:031a
node scripts/re/disasm.ts DOGZDLL.DLL XDrawPort::MakeColorRamp
node scripts/re/disasm.ts DOGZDLL.DLL --exports
node scripts/re/disasm.ts DOGZDLL.DLL --callers Ballz::SetBallColor
```

It disassembles with `ndisasm` (from NASM) and names what each far call and fixup reaches: an import by the name its own module gives the ordinal, read from that module on the oracle's drive, and a call within the module by the module's exports, `Class::Method` for the engine's C++. A function runs to the next export, or to `--to` or `--bytes`. `--callers` finds the far calls to an export, and the near ones within its segment; a virtual method, such as `MakeColorRamp`, is called through its class's table and has none.

## Decompile it

```shell
node scripts/re/fetch-tools.mjs
node scripts/re/decompile.mjs DOGZDLL.DLL 8:347d
```

The first command fetches Ghidra and a Java runtime for it, pinned in `oracle/manifest.json` like every other input, into `oracle/.cache/tools/`. The second decompiles a function into C with Ghidra, headless: the first time a module is asked for, Ghidra imports and analyses it into `oracle/build/ghidra/`, which takes about half a minute. Ghidra puts segment _N_ of an NE module at selector `0x1000 + 8(N - 1)`, so seg8:347d is its `1038:347d`. The C is for reading: it is Ghidra's guess at 16-bit segmented code, and the claims on this site cite the instructions, not it.
