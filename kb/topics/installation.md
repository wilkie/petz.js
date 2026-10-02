---
kind: topic
name: What Dogz's Setup does
summary: The adoption kit's InstallShield Setup — what it asks, where it puts the game, what it adds to Windows, and what it writes.
files: [DOGZ.DOG/DOGZ.INI, DOGZ.DOG/PUPPY.AGE, WINDOWS/DOGZDLL.DLL]
topics: [copy-protection]
---

The adoption kit came on two 1.44 MB floppies. Disk 1 holds `SETUP.EXE` with its compiled script `SETUP.INS`, the protection library [[file:DOGZ.DOG/THINK.DLL]] uncompressed, and the start of the game's files in `DOGZ1.LIB`. Disk 2 holds the rest: `DOGZ2.LIB`, the screen saver, WinG, and the 16-bit and 32-bit variants of a few files. Setup is InstallShield's, version `2.00.068` by the string at the end of its script. The oracle runs it with both disks unpacked into one directory, from Program Manager, as [[guide:reproducing]] describes.

## What it asks

- [[measured]] "Enter Your Name": a first and a last name. Setup's own text says the first name "will be used to identify your copy of Dogz". The two are written to [[file:DOGZ.DOG/DOGZ.INI]] as `Name=`. The first name also makes the default program group, `<First>'s Dogz`.
- [[measured]] "Dogz Default Destination": `C:\DOGZ.DOG`, with Setup's estimate of 6200 KB. Exit, not Install, is the default button on this screen.
- [[measured]] The program group's name. Setup makes the group over DDE with Program Manager, with three items: Dogz, Register Here (`EREG\REGISTR1.EXE`) and Dogz Read Me. [[measured]] When Program Manager is not running, Setup makes no group and does not say so.
- [[measured]] "Please insert Disk 2" comes up even when disk 2's files are already in the directory being read, and Enter goes on.
- [[measured]] "Installation Complete" offers Register Now, which registers by modem with `REGISTR1.EXE`; View README; and Return to Windows.

## What it puts down

The list of [[guide:reproducing|the oracle's]] files on this site names every one, with its size and which stage wrote it.

- [[measured]] `C:\DOGZ.DOG`: the game. That is [[file:DOGZ.DOG/DOGZ.EXE]], [[file:DOGZ.DOG/DOGZ.WAD]], [[file:DOGZ.DOG/THINK.DLL]], [[file:DOGZ.DOG/NEURON.DLL]], the brain ([[file:DOGZ.DOG/BRAIN.PBT]] and [[file:DOGZ.DOG/THINK.MFG]]), and the help file. It also holds `ART` (Daphne's faces, buttons, the photo frame), `DATA` (the five breeds' `.LNZ` files, 36 `.BDT` files, `ALL_PTZ.BHD` and `ALL_PTZ.SCP`), `PLAYPENZ` (the playpen backgrounds, in 16- and 256-colour sets) and `SOUNDS` (WAV files with a list for each breed). `EREG` holds the modem registration, and `ADOPT` holds a full copy of both disks, for Create Adoption Kit to write out again.
- [[measured]] `C:\WINDOWS`: [[file:WINDOWS/DOGZDLL.DLL]], the game's engine, 742,725 bytes, and the Guard Dogz screen saver (`GUARDDOG.SCR`, `GUARDDOG.DLL`, `GUARDDOG.INI`).
- [[measured]] `C:\WINDOWS\SYSTEM`: WinG (`WING.DLL`, `WINGDE.DLL`, `WINGDIB.DRV`, `WINGPAL.WND`, and `WING32.DLL` for Windows 95), the CTL3D libraries, and `DVA.386`.
- [[measured]] Setup rewrites three strings inside [[file:DOGZ.DOG/NEURON.DLL]], differently on each installation: the encoded validation code of [[topic:adoption-unlock]].
- [[measured]] [[file:DOGZ.DOG/PUPPY.AGE]], `ART\PHOTO.ART` and `SOUNDS\SOUND.DAT`, 50 digits each: three of the protection's six [[format:marker|marker files]]. [[inferred]] Setup writes them through `THINK.DLL`'s `_ThinkProc` with the command `spawn`: the string `spawn` is in `SETUP.INS` beside the `THINK.DLL` name, and `_ThinkProc` takes `spawn` as one of its three commands ([[topic:adoption-unlock]]).

## What it writes

- [[measured]] [[file:DOGZ.DOG/DOGZ.INI]]: the brain file names, three `Control Val` numbers, `Root=C:\DOGZ.DOG`, the owner's `Name`, and `UserCode=z77F112C0003`, which is a constant of `SETUP.INS`, the same for every installation.
- [[measured]] `GUARDDOG.INI` in the Windows directory: `[Dogz] Root=C:\DOGZ.DOG`.
- [[measured]] Nothing in `WIN.INI` or `SYSTEM.INI`. WinG writes its `[WinG]` section later, the first time Dogz runs, when it times the display.
- [[measured]] A leftover `~INS0363.~MP` in the Windows directory and `EREGREG1.~DL` beside `EREGREG1.DLL`, from Setup's own working.
