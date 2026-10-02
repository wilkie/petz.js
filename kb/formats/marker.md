---
kind: format
name: The protection's marker files
summary: Six 50-digit files — PUPPY.AGE, NEURON.DAT, PICTURE.ART, PHOTO.ART, SOUND.DAT and SOUND.INF — that THINK.DLL writes and the game checks, named to pass for game data.
status: partial
files:
  [
    DOGZ.DOG/PUPPY.AGE,
    DOGZ.DOG/NEURON.DAT,
    DOGZ.DOG/ART/PICTURE.ART,
    DOGZ.DOG/ART/PHOTO.ART,
    DOGZ.DOG/SOUNDS/SOUND.DAT,
    DOGZ.DOG/SOUNDS/SOUND.INF,
  ]
topics: [copy-protection]
---

Six files in `C:\DOGZ.DOG` hold nothing but 50 ASCII digits each. They are named to pass for the game's data (an age, art, sounds), but they belong to the copy protection described in [[topic:copy-protection]]. Their names are in [[file:DOGZ.DOG/THINK.DLL]]'s data segment, each after a `%s` for the install directory (`%spuppy.age`, `%sart\picture.art`, and so on, at `ds:0a70` to `0acc`), and again in [[file:DOGZ.DOG/DOGZ.WAD]]'s seg2, which checks them.

## The bytes

- [[measured]] Each is 50 bytes, the digits `0` to `9` with no line ending.
- [[measured]] On an installation all six are identical. They differ between installations: one of the oracle's held `23489023490876354183288458736689904850239472550951`, the next `23489023490876354142333582636689904850239472550951`.
- [[read out]] `THINK.DLL`'s data segment holds a template at `ds:0870`, `23489023490876354155342543536689904850239472550951`. The files differ from it only in the nine digits from offset 18 to 26, where the template has `553425435`.
- [[read out]] `DOGZ.WAD` seg2:01c4 to 0336 checks the files by passing each one's path to `THINK.DLL` ordinal 3, `_RetrieveThought`, with the arguments 18 and 9. Those are the offset and length of the digits that differ. A file that fails puts the game into the state the tamper checks use ([[topic:copy-protection]]).
- Not yet known: what the nine digits encode, and how `_RetrieveThought` judges them. [[inferred]] They come from the clock, since two installations on the same emulated machine differ.

## When they are written

- [[measured]] Dogz's Setup writes three: `PUPPY.AGE`, `ART\PHOTO.ART` and `SOUNDS\SOUND.DAT`.
- [[measured]] Adopting a puppy writes the other three, `NEURON.DAT`, `ART\PICTURE.ART` and `SOUNDS\SOUND.INF`, with the same digits as Setup's. The list of files says which stage wrote each.
- [[inferred]] `THINK.DLL`'s `_ThinkProc` writes them: with `spawn` at Setup, and with `finish` once an unlock code is accepted. It takes each command's directory and reads ten bytes of `THINK.MFG` from it before it writes (seg2:1780 to 17c5); see [[topic:adoption-unlock]].
