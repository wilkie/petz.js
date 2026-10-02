---
kind: file
name: DOGZDLL.DLL
summary: The game's engine, in the Windows directory — the dog's body of balls, its brain, sprites and the stage they are drawn on — with its C++ class and method names in its export table.
status: partial
files: [WINDOWS/DOGZDLL.DLL]
source: [src/formats/palette.ts]
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

[[read out]] Besides 87 bitmaps and its icons, cursors and dialogs, it holds Dogz's two palettes as resources of type 32513: 10256, 256 colours, and 10016, 16, each RGB triples ([[topic:drawing-a-dog]]). A resource of type 123, id 454, is 1,536 bytes of records of eleven words each; not yet known what.

## Classes

[[inferred]] `Ballz` is the dog's body: PF.Magic drew its pets as spheres (balls) rendered in real time, and `XDrawPort` has `XFillCircle`, `XFillPartialCircle` and `XFillPartialCircleRotate`. `XBrain` is its behaviour (`RegisterDesire`, `RegisterDecisionPoint`, `CurrentTimeState`). The sprites are the toys and tools of the playpen, and `XStage` is what they are drawn on. Not yet known: almost everything inside them.
