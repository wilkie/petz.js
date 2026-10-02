---
kind: format
name: .PBT brain
summary: BRAIN.PBT — the "Petz Brain File" the engine's XBrain reads, in sections of the verbs the user can do, the tricks the dog can do, objects and desires, with the links between them as binary records: what a begging dog's tricks are chosen by, and what it learns.
status: implemented
source: [src/formats/brain.ts]
files: [DOGZ.DOG/BRAIN.PBT, DOGZ.DOG/DATA/BRAIN.PBT, DOGZ.DOG/BRAIN.BAK]
topics: [behaviour, brain]
---

[[read out]] DOGZDLL.DLL's class `XBrain` (segments 12 and 13) reads and writes the brain: `ReadFile` and `WriteFile`, each section handled by `DispatchRecord` (seg13:0835). [[file:DOGZ.DOG/DOGZ.INI]] names the file, `Brain File=brain.pbt`. [[measured]] Setup installs the same 1,879 bytes as `BRAIN.PBT` and `DATA\BRAIN.PBT`, and adopting a puppy copies it to `BRAIN.BAK`; the engine's "Failed to open %s for brain backup" is that copy.

## The file

[[measured]] Text, its first line `#!Petz Brain File v2.0b`. [[read out]] The engine accepts versions `v2.0` and `v2.0b` ("Unsupported brain file version"). Then sections, each a line `!NAME`, and in the oracle's file, in order:

| Section               | What the oracle's file holds                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `!INPUTVERBS`         | 5, then a name a line: `[w]Throw!`, `[-]Putaway`, `[a]Wave`, `[+]BringOut*`, `Use` — what the user can do  |
| `!OUTPUTVERBS`        | 37: `eTrickBegging` to `eTrickPawGround`, then `Nothing1`, `Nothing2` — the engine's trick states, by name |
| `!OBJECTS`            | 8: `Null`, the blue, green and red treats each as `[u]` and `[w]`, `SprayBottle`                           |
| `!DESIRES`            | 9: `TrickBlue`, `TrickGreen`, `TrickRed`, then the moods `~Angry` to `~Ecstatic`                           |
| `!SYNAPSESBINARY`     | 43 records of 10 bytes                                                                                     |
| `!INEFFECTSBINARY`    | 16 records of 10 bytes                                                                                     |
| `!OUTEFFECTSBINARY`   | 1 record of 10 bytes                                                                                       |
| `!GESTALT`            | 0                                                                                                          |
| `!GLOBALCONTROLS`     | 15, 100, 200, 500, 0, 1, 0                                                                                 |
| `!MOREGLOBALCONTROLS` | 32000, 60                                                                                                  |
| `!DECAYDESIRES`       | 1.000000, 0.050000                                                                                         |
| `!MEMOUTLEARNWEIGHTS` | 100, 20, 5, 5, 1, 1, 1, 1, 1, 1                                                                            |
| `!DESIREVALUES`       | 9, then a value for each desire: all 0 but `~Content`, 100                                                 |
| `!DESIRETHRESHHOLDS`  | 9, then 0 for each                                                                                         |
| `!DESIREBOUNDS`       | 9, then `-100 1000 end` for each                                                                           |

- [[read out]] The engine knows nineteen section names (DS:0x1d72): these, `!WINDOWPOSITIONS`, and text forms of the three binary ones, `!SYNAPSES`, `!INEFFECTS` and `!OUTEFFECTS`, which `PrintBrain` heads with comments such as "synapse tables, listed in order by desire".
- [[measured]] Each binary section's last record starts with the word -1.
- [[read out]] Every record is five words (`DispatchRecord`, seg13:0835, its cases 16 to 18). A synapse is a desire, an output verb, an object, its instinct type — an index into `:LMH=`, none, low, medium, high, fixed — and its weight. An in-effect is a desire, an input verb, an object, its type — an index into `:!`, added or set — and its amount; an out-effect the same, for an output verb.
- [[measured]] Each binary section ends with the last record written, anywhere, its first word made -1: the engine writes the end from the buffer it wrote with. The out-effects, which are none, end with the in-effects' last record. Written so, `src/formats/brain.ts` writes the file back byte for byte.
- [[read out]] In Dogz's file, bringing out a treat (`[+]BringOut*` on `[u]BlueTreat`, say) sets its colour's desire to 500; putting it down (`[w]Throw!`) takes 20 off; putting it away adds 5; using the spray bottle adds 50 to each. Each colour has eleven to seventeen tricks, weighted 1 or 5, and no out-effects.
- [[read out]] `!GLOBALCONTROLS` are the entropy, 15; the weights of the instincts L, M and H, 100, 200 and 500; and three switches, learning by situation, the jolt mode and the situation bleed. `!MOREGLOBALCONTROLS` are the most a synapse may weigh, 32,000, and the most a lesson may change it, 60. `!MEMOUTLEARNWEIGHTS` are how much a lesson teaches the output done so many outputs ago. See [[topic:brain]].

## What it decides

[[read out]] Which trick a begging dog does, and what it learns from the treats it is given: [[topic:brain]].
