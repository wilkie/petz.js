---
kind: format
name: .SCP animation scripts
summary: ALL_PTZ.SCP — 330 scripts that take the dog from one of 59 states to another by playing frames of the shared animations in an order, with sounds, turns, repeats, random choices and calls to other scripts between, glued so the dog moves on.
status: partial
files: [DOGZ.DOG/DATA/ALL_PTZ.SCP]
source: [src/formats/script.ts, src/behaviour/timeline.ts]
topics: [drawing-a-dog]
---

The animations ([[format:bdt]]) are only frames; what the dog does is a script's choice of them. `ALL_PTZ.SCP` holds every script, the same for every breed. `ScriptSprite::LoadScripts` reads it, `PushScript` expands a script into a list of what to show, and `PopScript` steps through that list a frame a tick (DOGZDLL.DLL seg7:2180, 47e8 and 57ce).

## The file

All little-endian.

| What                     | Size          |                                                                                                                                    |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A copyright line         | to a 0 byte   | "(c) 1995 PF Magic, Inc. You know, the Eskimos ..."                                                                                |
| The number of scripts    | word          | 330                                                                                                                                |
| A record for each script | 12 bytes each | its number of variants, the state it is from, the state it is to, a word of 0 or 1, and a long: where its variants start, in words |
| The scripts' length      | long          | in words, 8,740                                                                                                                    |
| The scripts              | words         | each variant a word of its length, counting itself, then its elements                                                              |

- [[measured]] Read this way, the 330 scripts follow each other without a gap, and the last ends exactly at the file's end; every variant's elements end exactly where its length says. `test/oracle/game_files_test.ts` checks it.
- [[read out]] The states are named in DOGZDLL.DLL's data segment, 15 bytes a name from `0xece`: 0 `NONE`, 1 `AUTO`, 2 `sleeping`, 6 `sitting`, 9 `standing`, 21 `running`, 29 `rollover`, 35 `playDead`, 42 `wave`, to 58 `talk`; 59 in all. Script 50, for one, is from `standing` to `rollover`.
- [[read out]] `ScriptSprite::CountFrames` (seg7:382c) chooses a variant: the number it is asked for, modulo the number of variants, or one at random from a table of the game's for -1.

## Elements

- [[read out]] A word that is not negative is a frame, numbered over every animation together, as [[format:bhd]]'s frame table numbers them: one tick of the dog shown in it.
- [[read out]] A word from `0x8ad0` to `0x8b0c` is an opcode. How many operands each takes is DOGZDLL.DLL's table at `opcode × 0x23 + 0xc22` in its data segment, 35 bytes an opcode, its first word the count. An operand may itself be `0x8b05 lo hi`, a random number from lo to hi, worked out when the script is pushed. [[measured]] Read so, every variant of every script parses exactly; `0x8b05` is the only opcode that appears as an operand, 208 times.
- [[read out]] `PushScript` expands six opcodes, by a table at seg7:4d0d:
  - `0x8ad4 a b`: frames a to b, counting down where b is less than a.
  - `0x8ad5 f`: frames from f forward until one whose sequence flags mark an end.
  - `0x8ad6 f`: frames from f back until one whose flags mark a start.
  - `0x8b05 lo hi`: `lo + r % (hi - lo + 1)` for a number r from the game's table.
  - `0x8b09 s n ball`: script s, n times, a variant at random each time; then, if `ball` is one of the dog's balls, `0x8ad8 ball`. Every script here passes 65, which is none.
  - `0x8b0c`: the end of a variant.
- [[read out]] `PopScript` runs the rest as it reaches them, before showing the next frame. Those the viewer plays:
  - `0x8ada a` to `0x8ade a b c d e`: a sound, one of the one to five numbers at random, by `ScriptSprite::PlaySound` (seg7:75f1).
  - `0x8ad7`: glue by the chest, ball 50; `0x8ad8 n`: glue by ball n. The next frame shown is placed so that ball is where it was; then the glue is done with (seg7:6e33 to 6e81). Without one, the ball is the belly, 48 (`GetDefaultGlueBall`, seg7:4663).
  - `0x8ae5 1 turn x`: the dog turned by `turn`, in 256ths of a turn, added to its heading (seg7:5c74).
- [[read out]] A frame followed by `0x8ad3` is held as the one the dog is placed by (seg7:597b, then 6e8e to 6f32). [[inferred]] Each script is glued to the next by the belly: a walking cycle's frames carry the dog about 90 units forward and the next cycle starts back where the first began, and only gluing the one to the other moves the dog on. In the viewer, so glued, a terrier walks across the stage. Not yet read: the `PetModule` methods that do the placing.
- [[read out]] `PopScript` runs the rest as it reaches them: `0x8ad0` begins every variant; `0x8ad1 n` repeats what follows up to `0x8ad2` n times, 999 for ever; `0x8adf` sets one of the dog's factors (`PetModule::SetFactor`), `0x8ae1` blinks it (`ScriptSprite::DoBlink`), and `0x8ae3 n` sets bit n of a mask of the script's. `0x8af7` to `0x8af9`, `0x8afd` and `0x8b02` set where the dog is going; `0x8b00` and `0x8b01` start and stop something that moves it. Not yet known: how, and most of the rest.
- [[read out]] A frame's sequence flags are the word after its bounds in [[format:bdt]] (`Ballz::GetBallFrameFlags`, seg10:2612): 1 the start of a sequence, 2 the end, 3 both.

`src/behaviour/timeline.ts` plays a variant out as the frames it shows, and the viewer plays any script.

## Sounds

- [[read out]] `ScriptSprite::LoadSoundList` (seg7:02f1) reads the breed's `[Sound List]` ([[format:lnz]]): an adult's list, a puppy's, and how mature, in hundredths, the dog must be for the adult's. A list is a file in `SOUNDS`, a WAV's name a line, numbered from 0, up to 81, each in 25 bytes. `PlaySound` plays one with Windows' `sndPlaySound`.
- [[measured]] Every breed's two lists have 81 names, every one a file in `SOUNDS` — the voices in a folder of the breed's, `mas\PANT2.WAV` — and every sound a script plays, 0 to 79, is in them.
