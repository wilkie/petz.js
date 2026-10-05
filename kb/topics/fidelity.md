---
kind: topic
name: Drawing as Dogz drew
summary: The engine's accidents that show in a dog's drawing, each by the name the reimplementation keeps it under, what it does, where it was read out, and what the oracle's pictures lose without it; and what is drawn either way.
source: [src/render/fidelity.ts, scripts/oracle/probe.mjs, scripts/oracle/probes.json]
topics: [drawing-a-dog]
---

The reimplementation draws a dog as Dogz drew it on the oracle, to the pixel ([[topic:drawing-a-dog]]). Some of what that takes is not Dogz's design but its accidents — a short π, a table that forgets to reset, a size taken from the wrong ball — or the machine's: which way up WinG made the screen's bitmap, what colours the display driver shows. `src/render/fidelity.ts` keeps each under a name, all on as Dogz drew (`DOGZ`) and all off as evidently meant (`MODERN`); the viewer offers both ("Drawn: as Dogz drew / as meant").

Each is measured by the probes ([[guide:reproducing]], probe the drawing): `node scripts/oracle/probe.mjs <probes> --without <name>` draws without it and counts the pixels that then differ from the oracle's picture. The counts below are of two pictures of the big dog held side-on, `side35` (no fuzz, 4,319 pixels) and `fur35` (its fuzz and speckles, 3,411), each 1 pixel off with every quirk on; both happen to be of top-down sessions, so `bottomUp` is counted on `hind35`, a bottom-up one, 0 pixels off with every quirk on.

| Name             | As Dogz drew                                                                                                                                                           | Read out                                     | Without it                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `shortPi`        | Sines made with π as 3.1415, so a quarter turn's is 255: a side-on dog's far side a pixel in. Dogz's alone: Catz makes them with the true π                            | `ds:1d50`, seg11:1c3e; `ds:1d60`, 11:1e8a    | 318 and 186 pixels                                  |
| `bottomUp`       | The screen's bitmap bottom-up: balls' rows and fuzz walked from the bottom, lines scanned from the bottom, a ball a row lower, a line a row higher                     | seg8:3637, seg8:505e; WinG's choice          | 166 of 4,307 pixels (`hind35`, a bottom-up picture) |
| `carriedFuzz`    | Each diameter's rows moved by the last move of the diameter before                                                                                                     | seg8:200f                                    | none without fuzz; 312 with                         |
| `irisAsDrawn`    | The iris kept within the eye's radius less 0.8 of the eye's, set a pixel left, sized as the first iris                                                                 | seg10:5537, 565d, 5626                       | 25 and 25                                           |
| `partialSort`    | `ZOrder`'s sort, one partial pass a frame, balls within 4 of each other left be, kept from frame to frame                                                              | seg10:48ad, 4dee                             | 1,366 and 1,117                                     |
| `driverColours`  | Windows' dark static colours at 192, as the oracle's display driver shows them: the big dog's green irises; on 16 colours, the VGA driver's own dark colours and greys | the oracle's `SVGA256.DRV`                   | 40 and 41 pixels: the irises                        |
| `averageLosesUp` | Catz: an averaged breed without its Move Up list, as `AverageBallMoveList` clears its count every time it is called                                                    | CATZDLL.DLL seg39:3245, found by the harness | 57 and 15 pixels (`pouncer300`, `sophisto900`)      |

- [[measured]] All of it by the probes above, on pictures of the oracle's screen kept in `oracle/build/probes/` (never committed): `--without` each in turn, the rest as Dogz drew.
- [[measured]] `bottomUp` is the machine's, not Dogz's: after another WinG timing of the same display, Dogz drew top-down ([[topic:drawing-a-dog]]). [[inferred]] So is `driverColours`: Windows' own table has the dark colours at 128, and a display driver that shows them so would draw the irises a darker green; not yet seen on another driver. Drawn as meant, the reimplementation takes Windows' table and a top-down bitmap.

## Drawn either way

What is Dogz's design, however odd it looks, is drawn the same either way: the toe the dog holds things by, never drawn (ball 45, [[topic:drawing-a-dog]]); the eye drawn over the head and the mouth in its own order; the frames' extras, which put the tongue away; the fuzz and speckles, from the session's seed; the lines' widths and black edges.
