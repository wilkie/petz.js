---
kind: file
name: DOGZ.WAD
summary: Not a data archive but a library: the game's windows and dialogs — the adoption kit's screens, the playpen, options, photos — and the checks that keep it a trial.
status: partial
files: [DOGZ.DOG/DOGZ.WAD]
topics: [copy-protection, adoption-unlock, behaviour]
---

[[read out]] Despite its name, `DOGZ.WAD` is a 16-bit Windows NE library of 187,788 bytes: six code segments and one data segment, built with Borland C++ (1994, by the string in its data segment). [[file:DOGZ.DOG/DOGZ.EXE]] loads it. It imports from [[file:DOGZ.DOG/THINK.DLL]], [[file:WINDOWS/DOGZDLL.DLL]], [[file:DOGZ.DOG/NEURON.DLL]], CTL3DV2, COMMDLG, GDI, KERNEL, TOOLHELP, USER and WIN87EM.

## Exports

| Ordinal | Name                           | Where          | What                                                  |
| ------- | ------------------------------ | -------------- | ----------------------------------------------------- |
| 1–5     | `NeuronOne` … `SetFillPattern` | seg2:0a6b–0dbb | Tamper latches ([[topic:copy-protection]])            |
| 6       | `ADOPTCONTEXTWNDPROC`          | seg3:5406      | The adoption kit's window ([[topic:adoption-unlock]]) |
| 7       | `SPLASHDLGPROC`                | seg3:319b      | A dialog procedure                                    |
| 8       | `SETTINGSDLGPROC`              | seg3:66f4      | A dialog procedure                                    |
| 9       | `ACTIONDLGPROC`                | seg3:379a      | A dialog procedure                                    |
| 10      | `BASKETDLGPROC`                | seg3:22c8      | A dialog procedure                                    |
| 11      | `PETZDLGPROC`                  | seg4:1ee3      | A dialog procedure                                    |
| 12      | `CONTROLDLGPROC`               | seg4:6615      | A dialog procedure                                    |
| 13      | `PREFSDLGPROC`                 | seg4:60a5      | A dialog procedure                                    |
| 14      | `ABOUTDLGPROC`                 | seg4:5ac4      | A dialog procedure                                    |
| 15      | `PHOTODLGPROC`                 | seg4:5f45      | A dialog procedure                                    |
| 16      | `COMPOUNDWNDPROC`              | seg4:18be      | A window procedure                                    |
| 17      | `CURTAINWNDPROC`               | seg4:1792      | A window procedure                                    |

[[read out]] The procedures' names are upper-cased Borland mangled names (`@ADOPTCONTEXTWNDPROC$QUIUIUIL`, a function of `unsigned, unsigned, unsigned, long`), as a Pascal-convention export is. The adoption screens' window class is `AdoptContext`, and their edit boxes are `AdoptEditBox`.

Not yet known: which dialog is which screen, beyond the adoption kit's.

## The pet's frame

[[read out]] Every frame, seg4:42a4 fills the engine's `PetParams` and calls `PetModule::DoDrawFrame` in [[file:WINDOWS/DOGZDLL.DLL]] for each pet: the cursor from `GetCursorPos`, moved into the playpen's coordinates, and the primary and secondary mouse buttons, each read with `GetAsyncKeyState` after asking `SwapMouseButton` which is which (seg4:014d and 0187). See [[topic:behaviour]].

## The paint colours

[[read out]] The brush's colour is chosen from a popup menu the WAD builds itself, one owner-drawn item for each paint colour, as many as `PetParams` +0x232 says — 20 on 256 colours, 16 on 16 (seg4:23ad on): commands 1900 on, each drawn as a swatch of its ramp's first colour (seg4:26ac on). Choosing one sets `PetParams` +0x234, the brush's colour, to `n × ramp length + first` (seg4:2db9), and remaps the cursor's paint; it is kept in the profile, key 0x13 (`WritePetzProfileInt`, seg4:151e). See [[topic:behaviour]]. `PetParams` is DS:0x27c6 here: the cursor at +0x12, the buttons at +0x0e and +0x10.
