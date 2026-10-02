---
kind: format
name: .TDT trick data
summary: TRICKS.TDT — what the dog has learned. For each of 59 tricks, the mood it suits and how likely the dog is to do it idle or at play, with the defaults it drifts back to. Treats raise a trick's weight and the spray bottle lowers it.
status: implemented
files: [DOGZ.DOG/TRICKS.TDT]
source: [src/formats/tricks.ts]
topics: [behaviour]
---

`TRICKS.TDT` holds the weights by which the dog chooses its tricks ([[topic:behaviour]]). `PetModule::LoadTrickData` reads it and `SaveTrickData` writes it (DOGZDLL.DLL seg14:12e1 and 16e4). [[measured]] The game first writes it when a puppy is adopted: the oracle's adoption stage leaves it.

## The file

All little-endian.

| What               | Size                   |                                                     |
| ------------------ | ---------------------- | --------------------------------------------------- |
| A title            | 48 bytes               | "DOGZ Trick Data (c)1995 PF Magic, Inc. Vers 20", 0 |
| The current table  | 59 records of 24 bytes | what the dog does now                               |
| The defaults table | 59 records of 24 bytes | what the current table drifts back to               |

- [[read out]] `LoadTrickData` reads the two tables, 0x18 bytes by 0x3b each. Without the file, both are the engine's own resource of type 123, id 454: the defaults table, then the word `0xd45`, which it checks.
- [[measured]] The oracle's file is its two tables the same, and both are byte for byte resource 454: a dog that has learned nothing yet.
- [[read out]] The 59 records are the engine's tricks in order, its states 0x2b `eTrickBegging` to 0x65 `eTrickBalanceBall` ([[topic:behaviour]]).

## A record

Twelve signed words.

| Word | Field                      | What it does                                                                                                                                            |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | excitement                 | [[read out]] The excitement the trick suits: an idle dog does it only if its excitement is within word 1 of this (`DoIdle`, seg16:0777).                |
| 1    | excitement range           | As above.                                                                                                                                               |
| 2    | idle weight                | [[read out]] Kept against `rand() % ` the sum of every trick's idle weight; changed by treats and spraying.                                             |
| 3    | play weight                | [[read out]] The same while playing ball, against the sum of every trick's (`PickTrickState`, seg21:6907); -1 for tricks never done at play.            |
| 4    | facing                     | [[read out]] How far, in 256ths of a turn, the dog may face away from the user and still do it; further, it turns first (`DoBeggingTrick`, seg18:07e6). |
| 5    | with the ball              | [[read out]] Not 0 for the five tricks with the ball, which an idle dog never does.                                                                     |
| 6    | grab after                 | [[read out]] Not 0 where the dog may grab the ball after the trick, at play (`PushTrick`).                                                              |
| 7–10 | sickness, ham, groom, bark | [[read out]] How much of each of those factors the trick tolerates: an idle dog does it only if `rand() %` the factor is at most this.                  |
| 11   | —                          | Not yet known.                                                                                                                                          |

## Learning

- [[read out]] A treat given just after a trick adds 5 to its idle weight and then raises it to 200 if it is less (`PositiveReinforcement`, seg14:2026 to 2049): one treat makes a trick of weight 20 ten times as likely. The spray bottle takes 5 off, down to 1 (`NegativeReinforcement`, seg14:1bc5).
- [[read out]] Now and then — every 1,300 − 4 × excitement ticks of the engine's clock, 3,600 more while asleep, a tick being 17 milliseconds — every current weight steps 1 towards its default (`PulseTrickData`, seg14:1783). So a lesson fades: a weight raised to 200 takes about an hour to fall back to 20.
