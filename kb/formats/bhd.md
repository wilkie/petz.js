---
kind: format
name: .BHD animation header
summary: ALL_PTZ.BHD — the skeleton's ball count and sizes, the bounds of every frame together, which frames make each of the 36 animations, and where each frame starts in its .BDT file.
status: partial
files: [DOGZ.DOG/DATA/ALL_PTZ.BHD]
source: [src/formats/animation.ts]
topics: [drawing-a-dog]
---

One file, `ALL_PTZ.BHD`, describes the animations every breed shares: their frames are in the [[format:bdt]] files, and this says where. All little-endian.

| Offset  | Size         | What                                                                                     |
| ------- | ------------ | ---------------------------------------------------------------------------------------- |
| `0x00`  | word         | The header's length, 750: where the frame table starts                                   |
| `0x02`  | 2 words      | 14 and 10; not yet known                                                                 |
| `0x06`  | word         | The number of balls in the skeleton, 65                                                  |
| `0x08`  | word         | The number of frames in all the animations, 3,852                                        |
| `0x0a`  | 6 words      | The bounds of every frame together: the least x, y, z, then the greatest                 |
| `0x16`  | 3 words      | 323, 78 and 197; not yet known                                                           |
| `0x1c`  | a word each  | Each ball's size in the skeleton, in ball order                                          |
| `0x1fc` | word         | The number of animations, 36                                                             |
| `0x1fe` | a word each  | Where each animation ends: one past its last frame, counting frames over all of them     |
| 750     | 4 bytes each | Each frame's offset in its animation's `.BDT` file, which starts again at 0 in each file |

- [[measured]] The header's length plus four bytes for each frame is the file's length, 16,158 bytes, and the last animation ends at frame 3,852, the header's count. Animation _n_ is `n.BDT`, and its first frame is at offset 0 there.
- [[measured]] The ball sizes are diameters: each [[format:bdt]] frame's box is its balls' centres widened by half these sizes, rounded down, exactly. They come in a left half and a right half the same, 24 balls each (`Lankle` to `Lwrist`, `Rankle` to `Rwrist`), then 17 balls of the body from the belly (51) to the tongue.
- [[measured]] The six bounds are the least and greatest of all 3,852 frames' boxes, exactly.
- [[measured]] Between the ball sizes and the animation count, and between the animation table and the frame table, the header holds bytes that look like whatever was in memory when it was written: no structure in them has been found. One run, at `0x110` to `0x18e`, is small numbers (0, 4, 6, 9, 15) and may be one a ball. Not yet known.
