---
kind: topic
name: Drawing a dog
summary: How a dog is put together from a breed file and the shared animations, what the viewer draws so far, and what is not yet known of how Dogz draws one — its scales, its shading, its colours.
source: [src/render/ballz.ts, src/viewer/main.ts]
topics: [installation]
---

Dogz draws its pets in real time, out of balls: filled circles in three dimensions, drawn nearest last, joined by thick lines. Every breed shares one skeleton of 65 balls and its 36 animations ([[format:bhd]], [[format:bdt]]). A breed file ([[format:lnz]]) says how each ball looks. [[file:WINDOWS/DOGZDLL.DLL]]'s class `Ballz` and `XDrawPort`'s `XFillCircle` are where the game does it.

```mermaid
flowchart LR
  BHD["ALL_PTZ.BHD<br/>ball sizes,<br/>where frames start"] --> F["a frame:<br/>65 ball centres"]
  BDT["n.BDT<br/>frames"] --> F
  LNZ["BREED.LNZ<br/>colours, size differences,<br/>lines, outlines"] --> D["the dog, drawn"]
  F --> D
```

## What the viewer does

`pnpm dev`, then `/viewer.html`, draws any breed in any frame of any animation from the game's own files: the oracle's, in development, or a `DOGZ.DOG` directory chosen in the page, which never leaves the browser.

- [[read out]] Positions: x across, y down, a larger z farther ([[format:bdt]]). Every ball and line is drawn in order of depth, farthest first; a line's depth is its two ends' average.
- Sizes: the skeleton's diameter plus the breed's `Ball Size Diffs`, at one pixel and a half to the unit. Not yet measured against the game.
- Lines: from the `Linez` section, round-ended, as thick as half the smaller end's diameter, in the first ball's colour. Not yet measured.
- Outlines: from `Outline Type` and `Outline Color`; a half outline is drawn round the lower half of the ball. Not yet measured.
- Colours: the `16 Ball Color` section, in the 16 colours as the oracle's 16-colour display draws them (below).

## The 16-colour display

`node scripts/oracle/variant.mjs terrier16 --display vga --breed terrier`, then `node scripts/oracle/shoot.mjs terrier16`, runs the oracle's Dogz on Windows' VGA driver with the dog made a terrier, and keeps pictures of it; the same for any breed.

- [[measured]] On the VGA driver the oracle's screen has exactly 16 colours, and the dog is drawn in them solid, without dithering: (0, 0, 0), (170, 0, 85), (0, 170, 85), (170, 170, 85), (0, 0, 170), (170, 85, 170), (85, 170, 170), (134, 138, 142), (195, 199, 203), and full red, green, yellow, blue, magenta, cyan and white. Windows' own colours are among them, by their use: its title bars are (0, 0, 170), its button faces (195, 199, 203).
- [[measured]] Each breed is drawn in the colours its `[16 Ball Color]` numbers name, in the order of the files' comment: the big dog red with its legs in colour 1, the terrier in colours 6 and 4 (a teal and a dark blue), the Scottie black, the bulldog in 3 and 1, the chihuahua in 3, 2 and 10 — a green dog. The irises are colour 2 or 3, as `[16 Iris Color]` says.
- [[measured]] Colour 7 is the dark grey, as the comment says ("7dkGry") and Windows' own order does not: the bulldog's 24 balls of colour 7 are drawn in the playpen's own grey, (134, 138, 142), and vanish into it but for their outlines.
- [[inferred]] The dark colours are mixes of 170 and 85 where Windows' are 128s because of how DOSBox's ET4000 shows the VGA driver's palette; on other hardware they may be Windows' own. Not yet known.

## The 256-colour display

- [[measured]] On the oracle's 256-colour display every pixel of the dog is one of the palette's colours: all 12,000 pixels of a box round Bootz match the palette of [[file:DOGZ.DOG/PLAYPENZ/256GRASS.BMP]], `256BONE.BMP` and `256PFM.BMP` (which share one), once DOSBox's six bits a channel are taken into account. Bootz, with the red ball beside it, is drawn in about a dozen dark reds and browns, at indices between 94 and 158.
- [[measured]] That palette is laid out as Windows' identity palette: the twenty static colours at 0 to 9 and 246 to 255, and between them colours sorted by red, not grouped in ramps of shades. `256NEWS.BMP` and `256WOOD.BMP` carry palettes of their own.
- [[measured]] So the `256 Ball Color` numbers are not palette indices. The big dog's coat is numbers 130 to 135, and those entries of the palette are a purple, an olive, a pale cyan, a brown, a grey-cyan and a tan: not one coat's shades.
- [[refused]] The palettes of [[file:WINDOWS/DOGZDLL.DLL]]'s own 256-colour bitmaps (resources 2000, 10102, and 10120 and 10121, which share the playpens' palette) as what the numbers index: in none of them are the big dog's 130 to 135, or the terrier's 28 to 33, one coat's colours.
- [[read out]] Where to look: `DOGZDLL.DLL` exports `XDrawPort::MakeColorRamp` (seg8:1a71), which takes a bitmap header, two shorts, a colour and a colour array; `XDrawPort::LoadExtraColors` (seg8:1d37) and `XRemapColor` (seg8:5aac); and data named `theirIdealBitmap`, `theirPalette` and `theirNumExtraColors`. [[inferred]] Dogz builds a logical palette of its own, colour ramps among it, and the numbers index that, which Windows then maps onto the screen's.
- [[measured]] Of the colours Bootz is drawn in, only one, (144, 107, 28), is anywhere in [[file:WINDOWS/DOGZDLL.DLL]], and that in its bitmaps' palettes. [[inferred]] The game shades each colour number into a ramp of its own at run time and finds each shade's nearest palette entry. Not yet known: the colour each number stands for, and how the ramp is made.

## Still to find

The scales (`Default Scales`, `Puppy Balls`, the extensions); fuzz and speckles; the extras each frame lists; which animation is which; how fast frames are shown; and what the 16-colour display really shows, by running the oracle at 16 colours and comparing.
