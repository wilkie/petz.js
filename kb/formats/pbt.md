---
kind: format
name: .PBT brain
summary: BRAIN.PBT — the "Petz Brain File" the engine's XBrain reads, in sections of the verbs the user can do, the tricks the dog can do, objects and desires, with the links between them as binary records. What it decides is which trick a begging dog does; how it learns is not yet read.
status: partial
files: [DOGZ.DOG/BRAIN.PBT, DOGZ.DOG/DATA/BRAIN.PBT, DOGZ.DOG/BRAIN.BAK]
topics: [behaviour]
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
- [[inferred]] A synapse record is a desire, an output verb, a long and a weight: its first word runs 0 to 2, the three trick desires, and its second up to 34, an output verb. An in-effect record is a desire, an input verb, an object, a flag and an amount: the largest, 500 with the flag set, is for bringing out (`[+]BringOut*`) the treat of the desire's colour. None of it is read from the code yet.

## What it decides

- [[read out]] When the dog is begging for a treat, `PetModule::PickTrickState` (seg21:6907) asks the brain for a trick, logging "brain says go to $$%s$$"; only when "brain has no opinions" does it pick one at random ([[topic:behaviour]]).
- [[read out]] The engine names the brain's output verbs in a table at DS:0x1e9c, the trick states by name, and the objects at DS:0x1e6c, `Null`, then each treat as `[a]`, `[u]` and `[w]`, and `SprayBottle`.
- Not yet known: how `XBrain` thinks (`thinkbutton_click`, `HowDoYouFeelAboutThis`) and learns (`LearnKernel`, `jolt`), and what the controls are.
