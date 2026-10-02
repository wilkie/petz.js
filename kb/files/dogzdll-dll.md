---
kind: file
name: DOGZDLL.DLL
summary: The game's engine, in the Windows directory — the dog's body of balls, its brain, sprites and the stage they are drawn on — with its C++ class and method names in its export table.
status: partial
files: [WINDOWS/DOGZDLL.DLL]
source: [src/formats/palette.ts, src/formats/script.ts, src/formats/engine.ts]
---

[[read out]] A 16-bit Windows NE library of 742,725 bytes: 32 segments and 525 exports, every one of them named, importing from WING, GDI, KERNEL, MMSYSTEM, TOOLHELP, USER and WIN87EM. It draws through WinG.

[[read out]] It was built with Borland C++, and its exports keep their mangled C++ names: `@XStage@0XAddSprite$qn7XSpritet1` is `XStage::XAddSprite(XSprite *, XSprite *)`. So its classes, and what each can do, can be read off the export table. By the number of exported members:

| Class          | Exports | Class         | Exports |
| -------------- | ------- | ------------- | ------- |
| `PetModule`    | 134     | `FoodSprite`  | 9       |
| `XBrain`       | 81      | `XPicture`    | 7       |
| `ScriptSprite` | 55      | `GrabSprite`  | 6       |
| `XDrawPort`    | 53      | `SpraySprite` | 6       |
| `Ballz`        | 35      | `ShoeSprite`  | 6       |
| `BallSprite`   | 17      | `MoonSprite`  | 6       |
| `XStage`       | 13      | `PaintSprite` | 5       |
| `Fudger`       | 12      | `PetSprite`   | 4       |
| `XMemory`      | 11      | `XBMPPicture` | 4       |
| `XSprite`      | 10      | `Lube`        | 4       |

## Resources

[[read out]] Besides 87 bitmaps and its icons, cursors and dialogs, it holds Dogz's two palettes as resources of type 32513: 10256, 256 colours, and 10016, 16, each RGB triples ([[topic:drawing-a-dog]]). A resource of type 123, id 454, is the trick weights' defaults: 59 records of twelve words, then the word `0xd45`, which `PetModule::LoadTrickData` checks, used where there is no [[format:tdt]] file. [[measured]] It is byte for byte the defaults in the oracle's `TRICKS.TDT`.

## Behaviour tables

[[read out]] Compiled into its data segment, and read by `src/formats/engine.ts` ([[topic:behaviour]]):

| Where                    | What                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| DS:0x0ece, 15 bytes each | the 59 script positions' names, each followed by its kind ([[format:scp]])             |
| DS:0x216e, 6 bytes each  | for each trick, its script, how many times it is played, and the cues around it        |
| DS:0x22d0                | the four roll-and-wiggle scripts                                                       |
| DS:0x22d8                | walking, trotting and running                                                          |
| DS:0x20a4, DS:0x20b8     | the five sleeping scripts with how often each repeats, and the two that break sleep up |
| string table from 10000  | the names of its 109 states, `eNOTASTATE` to `eIconBeg`                                |

## Classes

[[inferred]] `Ballz` is the dog's body: PF.Magic drew its pets as spheres (balls) rendered in real time, and `XDrawPort` has `XFillCircle`, `XFillPartialCircle` and `XFillPartialCircleRotate`. `XBrain` is the trick-learning brain ([[format:pbt]]), and `PetModule` the dog's behaviour, a state machine ([[topic:behaviour]]). The sprites are the toys and tools of the playpen, and `XStage` is what they are drawn on. Not yet known: almost everything inside them.
