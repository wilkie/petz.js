---
kind: format
name: .BDT animation frames
summary: One file for each of the 36 animations every breed shares, holding each frame's ball positions in three dimensions, the box they reach, and a short list of balls the frame says more of.
status: partial
files:
  [
    DOGZ.DOG/DATA/0.BDT,
    DOGZ.DOG/DATA/1.BDT,
    DOGZ.DOG/DATA/2.BDT,
    DOGZ.DOG/DATA/3.BDT,
    DOGZ.DOG/DATA/4.BDT,
    DOGZ.DOG/DATA/5.BDT,
    DOGZ.DOG/DATA/6.BDT,
    DOGZ.DOG/DATA/7.BDT,
    DOGZ.DOG/DATA/8.BDT,
    DOGZ.DOG/DATA/9.BDT,
    DOGZ.DOG/DATA/10.BDT,
    DOGZ.DOG/DATA/11.BDT,
    DOGZ.DOG/DATA/12.BDT,
    DOGZ.DOG/DATA/13.BDT,
    DOGZ.DOG/DATA/14.BDT,
    DOGZ.DOG/DATA/15.BDT,
    DOGZ.DOG/DATA/16.BDT,
    DOGZ.DOG/DATA/17.BDT,
    DOGZ.DOG/DATA/18.BDT,
    DOGZ.DOG/DATA/19.BDT,
    DOGZ.DOG/DATA/20.BDT,
    DOGZ.DOG/DATA/21.BDT,
    DOGZ.DOG/DATA/22.BDT,
    DOGZ.DOG/DATA/23.BDT,
    DOGZ.DOG/DATA/24.BDT,
    DOGZ.DOG/DATA/25.BDT,
    DOGZ.DOG/DATA/26.BDT,
    DOGZ.DOG/DATA/27.BDT,
    DOGZ.DOG/DATA/28.BDT,
    DOGZ.DOG/DATA/29.BDT,
    DOGZ.DOG/DATA/30.BDT,
    DOGZ.DOG/DATA/31.BDT,
    DOGZ.DOG/DATA/32.BDT,
    DOGZ.DOG/DATA/33.BDT,
    DOGZ.DOG/DATA/34.BDT,
    DOGZ.DOG/DATA/35.BDT,
  ]
source: [src/formats/animation.ts]
topics: [drawing-a-dog]
---

A `.BDT` file is one animation's frames, end to end, with nothing before the first and nothing after the last. Where each frame starts is not in the file but in [[format:bhd]]. A frame says where the skeleton's balls are and nothing of how they look; that is the breed's ([[format:lnz]]).

## A frame

All little-endian. With the skeleton's 65 balls, a frame is 405 bytes and two more for each extra.

| Offset | Size         | What                                                                                                                                  |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0`    | 6 words      | The box the balls reach: the least x, y, z, then the greatest                                                                         |
| `12`   | 1 word       | The frame's sequence flags: 1 the start of a sequence, 2 the end ([[format:scp]]): 0 in 3,613 frames, 1 in 119, 2 in 119 and 3 in one |
| `14`   | 6 bytes each | Each ball's centre, x, y and z, signed words, in ball order                                                                           |
| `404`  | 1 byte       | How many extras follow                                                                                                                |
| `405`  | 2 bytes each | An extra: a ball's number, then a signed byte                                                                                         |

- [[measured]] Read this way, every one of the 3,852 frames in the 36 files starts at the offset [[format:bhd]] gives it, ends where the next starts, and the last of each file ends at the file's end. `test/oracle/game_files_test.ts` checks it against the oracle's files.
- [[measured]] The box is each ball's centre less, or plus, half its size in the skeleton rounded down ([[format:bhd]]), the least and greatest over all the balls: exactly, on all six values of all 3,852 frames. [[refused]] Half the size unrounded matches only 806 to 3,192 of the frames on each value; a quarter or an eighth of it, none; a fixed margin of 5 or 6, at most 2,957.
- [[inferred]] x runs across the screen and y down it, and a larger z is farther away: drawn with y down and the larger z first, frame 0 of animation 0 is a dog sitting and facing out, its face in front.

## The extras

- [[measured]] Up to six a frame. The balls they name are mostly the tongue's, 63 and 64 (2,765 and 2,821 times), then the chest (50), the neck (54), the belly (48), the eyes (8 and 32) and the irises (14 and 38). Their values run from -13 to 14 and are never 0.
- Not yet known: what the value does to its ball. [[inferred]] Something about the ball's look rather than its place, since the place is already given.

## What is not yet known

Which animation is which, beyond what the scripts that play it are named for ([[format:scp]]); and how fast frames are shown.
