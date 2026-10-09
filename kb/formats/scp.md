---
kind: format
name: .SCP animation scripts
summary: ALL_PTZ.SCP — 330 scripts that take the dog from one of 59 states to another by playing frames of the shared animations in an order, with sounds, turns, repeats, random choices and calls to other scripts between, glued so the dog moves on.
status: partial
files: [DOGZ.DOG/DATA/ALL_PTZ.SCP]
source: [src/formats/script.ts, src/behaviour/timeline.ts]
topics: [drawing-a-dog, behaviour]
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
- [[read out]] A frame followed by `0x8ad3` is not shown but held as the one the next frame is placed by (seg7:597b). Unless that frame is glued, `PopScript` moves the dog by the difference between the centres of the held frame's rectangle and the new one's (`Ballz::GetCenterOffset`, seg7:6e8e to 6efc), then places the new frame as its own coordinates say (`Ballz::MoveFrameRect`, which moves the dog's rectangle as the frame's own moves). Every walk, trot and run ends with its cycle's first pose one stride on, then `0x8ad3`; so each cycle carries the dog on from where the last left off, and nothing needs gluing. `src/behaviour/stage.ts` places frames so.
- [[read out]] `PopScript` runs the rest as it reaches them: `0x8ad0` begins every variant; `0x8ad1 n` repeats what follows up to `0x8ad2` n times, 999 for ever; `0x8adf` sets one of the dog's factors (`PetModule::SetFactor`), `0x8ae0 n` sets how far the eyelids rest closed, in hundredths, and `0x8ae1 n` blinks for n frames (`ScriptSprite::DoBlink`) ([[topic:behaviour]], blinking). `0x8af2 x y rate width height` and `0x8af3` set a target to steer to, as `SetTargetLocation` does ([[topic:behaviour]]), `0x8af3` also setting a second of its angles from the bearing (seg7:6c79 to 6d1c), not yet played; `0x8af4 ball x y` slides the dog so its ball meets a point, and `0x8b03 slot`, `0x8b04 slot` grab and let go of the ball ([[topic:behaviour]], fetch); `0x8af7 x y`, `0x8af8 x y` and `0x8af9 x y` set where the head, the eyes or both look, `0x8afa` has the dog look at a random point, `0x8afb` at the user and `0x8afc` ahead, `0x8afd dx dy` at a point from its own place, and `0x8afe 6` at the cursor, `0x8afe 7` at what is held or else the cursor ([[topic:behaviour]], where the dog looks) — of these the scripts use only `0x8afa` to `0x8afc`, each about fifty times; `0x8aff frame` and `0x8b00` start and stop the dog breathing from a frame, and `0x8b01 n` bristles its fur ([[topic:behaviour]], breathing and bristling). What follows a script's last frame is done as the next frame is reached. Not yet known: most of the rest.
- [[read out]] `0x8ae3 n` raises cue n: it calls `ProcessCue` and sets bit n of a mask the states read (seg7:5e72 to 5ebe). Cue 4 starts every walk; cue 12, an idle pant looking about, has the dog look at a random point.
- [[read out]] `0x8ae6 axis to`, `0x8ae7 axis by speed`, `0x8ae8 axis to speed` and `0x8ae9 axis by` set the `Fudger`s, which ease the dog's angles, its eyelids and its head's reach from frame to frame (seg7:5cfd to 5e6f; [[topic:behaviour]], the dog's angles). `0x8ae6` eases to `to` over the rest of the script, as `Fudger::SetTargetFudge` counts the frames to the script's end; `0x8ae9` sets one's drift, a turn every frame until set to 0: run-in-circles drifts 8 to 11.
- [[read out]] The engine pushes some opcodes of its own between scripts: `0x8b0a s` and `0x8b0b` around script s, `0x8b06 state` to remember the trick being done, for the treat or spray that follows, `0x8b07 state` and `0x8b08 global` for the state to go to next when the queue reaches them ([[topic:behaviour]]).
- [[read out]] A frame's sequence flags are the word after its bounds in [[format:bdt]] (`Ballz::GetBallFrameFlags`, seg10:2612): 1 the start of a sequence, 2 the end, 3 both.

`src/behaviour/timeline.ts` plays a variant out as the frames it shows, and the viewer plays any script.

## Sounds

- [[read out]] `ScriptSprite::LoadSoundList` (seg7:02f1) reads the breed's `[Sound List]` ([[format:lnz]]): an adult's list, a puppy's, and how mature, in hundredths, the dog must be for the adult's. A list is a file in `SOUNDS`, a WAV's name a line, numbered from 0, up to 81, each in 25 bytes. `PlaySound` plays one with Windows' `sndPlaySound`.
- [[measured]] Every breed's two lists have 81 names, every one a file in `SOUNDS` — the voices in a folder of the breed's, `mas\PANT2.WAV` — and every sound a script plays, 0 to 79, is in them.

## In Catz

The Catz demo has a script file a creature, `CAT.SCP`, `MOUSE.SCP` and the rest, beside its [[format:bhd]]. They are laid out as Dogz's, but for three things:

- [[measured]] After the title (`(c) 1996 PF. Magic, Inc.  Lets not talk about me.`) come three words before the count of records: the number of the creature's positions, the scripts' states — 123 for the cat, every record's from and to below it — then a word not yet known (66 for the cat), then 0.
- [[measured]] A record is 16 bytes: the number of variants, the positions from and to, two words not yet known, the flag, and where the variants start. The first unknown word is 67 or 68 for the cat, 16 for the mouse, 12 for the cloud, 6 for the bottle and 65535 for the dog; the cat's, mouse's and cloud's ball counts are among them. The second is always 0.
- [[read out]] Opcodes run from 30000 to 30063, not from `0x8ad0`. CATZDLL.DLL names them in a table, 44 bytes an opcode from `0x524` in its data segment: how many operands it takes, a letter for each, and its name (`ScriptSprite::PushScriptElements`, seg40:6069, indexes it). Its names end with their operands' count: 30000 `startPos` begins a variant and 30063 `endPos` ends it; 30031 `sequence2 s s` shows frames s to s, as Dogz's `0x8ad4` does; 30028 `rand2 # #` is a random operand, as `0x8b05` is; 30025 `playAction2 a #` plays a script, numbered by its record; and on, through `cueCode1`, `lookAtUser0`, `soundPlay1` to `soundPlay5`, `setFudgerTarget2`, `startLoop1` and `endLoop0`. The letters say what an operand is: `#` a number, `a` an action (a script), `b` a ball, `c` a cue, `d` a sound, `f` a fudger, `o` a sprite, `s` a frame. Two of the entries disagree with themselves: `setFudgeAimDefaults5` counts five operands but has six letters, and `targetSprite4` counts three. The engine goes by the count.
- [[measured]] Read so, all five creatures' files parse exactly and are written back byte for byte (`test/oracle/catz_files_test.ts`). The cat has 805 scripts, 658 of them with one variant and one with 25. `playAction2` is the commonest opcode (1,475 times), then `sequence2` (914); 1,098 operands are random. Every action played is one of the file's scripts.

`src/formats/script.ts` reads either game's (`SCRIPTS.dogz`, `SCRIPTS.catz`; `readCatzOpcodes`).

### How Catz plays them

All [[read out]] from CATZDLL.DLL, `ScriptSprite` in segments 40 and 41:

- **The preamble.** The first word, 123 for the cat, is the number of positions. The second, 66, is the neutral position, where a cat starts and where layered actions go from and to. The third, 0, means any position: an action from or to it leaves the cat's position as it is.
- **Playing an action** (a script, by its record; `PushStoredAction`, seg40:57bb) works as follows:
  1. It picks a variant, as it is told or at random: the next of a table of 150 numbers the engine fills from C's `rand` as the sprite is made (`ScriptRand`, seg40:1a28), modulo the number of variants.
  2. It pushes the transitions from where the cat will be to the action's from-position (`PushTransitionToNeutralPos`, seg40:5384), each itself an action pushed so, with a variant at random. A chain of up to five is found from a table of, for each pair of positions, the first record whose flag is 1 and which goes somewhere, record 0 counting as none (`LoadScripts`, seg40:1ea2; `BuildTransition`, seg40:3a75). The shortest is taken; of chains as short, the first the search reaches, trying positions in turn: through one middle position; through two, the first then the second; through three or four, the first, then the last, then those between. There is none to or from position 0, "any"; to or from the neutral position, the cat is taken to be there already.
  3. It queues the variant between `actionStart1` and `alignScripts0 actionDone0`, and the cat will be at its to-position, unless that is 0.
- **The record's first unknown word**, 67 or 68 for the cat, is whether the action may be interrupted once begun. It is also the ball to glue by on a hard reset; 67, the ball count, means the default.
- **Expanded as queued** (`PushScript`, seg40:5ece): `sequence2 a b` (inclusive, counting down where b < a), `sequenceToEnd1` and `sequenceToStart1`. Their `rand2`s are drawn once, from the table, `lo + table % (hi − lo + 1)`. Everything else is queued as it is, and its `rand2`s are drawn with C's `rand` each time they are popped, the same way (`Stack::Pop`, seg42:1097) — whatever the opcode, played or not.
- **Two positions.** Where the cat will be once all that is pushed has played (`+0x14fe`), which pushing moves on, and where it is (`+0x1500`), which `actionStart1` and `actionDone0` set to the action's from and to as they are reached (seg41:0052).
- **One frame a tick** (`PopScript`, seg41:0052): opcodes run until a frame. What follows a script's last frame runs the next tick, as in Dogz.
  - `alignScripts0` makes the next frame a reference, not shown. The frame after it is placed by it: the default glue ball is kept where it was, and the cat is turned by how the reference frame lies against the frame shown before it, where that is more than 6 256ths either way (`XBallz::CheckAlignment`, seg47:29c9). How a frame lies is the angle of the line from the neck to the butt (the key balls at `+0xd93` and `+0xda3`) across the ground, x and z, in 256ths of a turn rounded toward 0; none where that line is shorter than 50 (`ds:1e6e`). Each action's first frame is the last one's last.
  - `playAction2 a n` plays action a n times as a subroutine, on a stack of its own (at most six deep; `PushStackList`, seg40:393c): all n pushed at once, each with its transitions and a variant at random, from where the cat is, not where it will be; and where it will be put back when they are done (`PopStackList`, 38d7). n = 0 plays nothing.
  - `startLoop1 n` … `endLoop0` repeats n times, 999 for ever, on one list of open loops for the whole sprite, ten deep. n = 0 skips to the first `endLoop0` or `endLoopAlign0`, whatever its nesting, so a loop within leaves its outer end unmatched; an end with no loop open does nothing.
  - `cueCode1 c` raises cue c for that tick only.
  - `soundPlay1`–`5` play one of their sounds at random, by `rand`, and draw another `rand` for its loudness (`HandleSoundVerb`, seg41:1ca3; `XApt::XPlayStereoSound`, seg2:0c79); `soundQueue1`–`5` choose one so, and no more.
  - `lookAtRandomPt0` draws a point on the stage with two `rand`s, across and down.
  - A reference frame takes no tick of its own: the tick goes on to the frame after it. With nothing after it, the tick ends on it, and it is shown.
- **Fudgers.** Each tick, once the tick's frame is reached, each of the cat's 14 `Fudger`s (segment 38) is updated from the `BallState` number it drives and sets it (seg41:154a on):
  - 0 rotation (`+0x10`), 1 roll (`+0x14`), 2 tilt (`+0x12`);
  - 3 head rotation, 4 head tilt, 5 head cock (`+0x1c` to `+0x20`);
  - 6 and 7 the right and left eyelids' heights (`+0x2a`, `+0x2c`), 8 and 9 their tilts (`+0x24`, `+0x22`);
  - 10 and 11 where the eyes look (`+0x2e`, `+0x30`);
  - 12 and 13, the cat moved across and up, made by no one: the constructor makes "XTrans" and "YTrans" over fudger 9 again.

  A fudger is off, passing the number through; aiming at a target under its own speed, with a step, a top speed, damping and braking; drifting by a step a tick; aligning, spreading a change over some ticks; decaying an offset; swinging; or suspended. Each is a number, or an angle wrapped to −128..128. Its value (`+0xc8`) is its own: the number it drives may be set otherwise between ticks — by a turn at a reference frame, by a blink — and the fudger works from that, but measures its step from its own last value. It is kept within limits (roll and tilt ±70, head ±80, ±75, ±70), and where it has turned back by less than 2 it is held. `ResetParams` (seg40:312b) aims each at its default target — the eyelids 30, the rest 0, the rotation none — leaving its speed and value as they were. The scripts set them: `setFudgerTarget2 f t` aims, `setFudgerDrift2` drifts, `setFudgerRate2` and `setFudgeAimDefaults5` set speeds, `resetFudger1`, `stopFudging1`, `suspendFudging1`, `resumeFudging1`, `disableFudgeAim1` and `enableFudgeAim1`, each on fudger f, or for 14 both eyelids' heights, 15 both tilts, 16 all (`UpdateRequestedFudgerList`, seg40:6141). No fudger draws a random number.

- **Looking.** `lookAtUser0`, `lookFoward0`, `lookAtRandomPt0` and `lookAtSprite1 o` aim the head and eyes, by its fudgers. `lookFoward0` aims the head's rotation and tilt and the eyes at 0 (`SetHeadTarget` with no point, seg40:5a47); `lookAtUser0` aims the head's rotation at the cat's own less, so it faces out, and its tilt at 0. A point to look at — `lookAtLocation2`, `lookAtRandomPt0` — is aimed at from where the cat is drawn.
- **Layered actions.** `playLayeredAction1 a` plays action a alongside: each tick, every ball of the shown frame is moved by how far the layer's frame has moved it from the layer's first frame. Pushed (`PushLayeredAction`, seg40:561f), it draws its variant and its sequences from the table, and queues after any layer still playing. Each tick, as it ends, takes its next frame, and plays the sounds before it, drawing as any sound does; its other opcodes are passed over (seg41:143e on). The tick's frame and the layer's first (`+0x146a`, the first frame queued as it was pushed — an earlier layer's, if one is still playing) go into the `BallState` (`+0x4c`, `+0x4a`) for drawing; where the layer runs out before a frame, it is done.
- **Tweens.** `GenerateTweenFrame` blends a tick's frame with the one before when drawing; the script's frames are as queued.

`src/behaviour/catz-timeline.ts` plays an action out as its frames, with:

- the transitions into it;
- the actions it plays, nested;
- its loops and sequences;
- its random operands, each from where the engine draws it, given a source of each (`random(n, 'table' | 'rand')`);
- the reference frames between actions.

[[measured]] The harness ([[guide:reproducing]]) holds it to the engine: a bare `ScriptSprite` made in CATZDLL on winbox.js plays every action but the 44 that may look at another sprite, 761, each a variant and from a position, tick by tick, and `catzTimeline`, given the engine's table and C's `rand` from its seed, shows the same frame every tick, the same layered frame over it, turns the cat as the engine does, and leaves every fudger as it does, every tick — but for the head's and eyes' in the 9 cases that may look at a point. Getting there took the two positions, the nested actions pushed all at once from where the cat is, the one list of loops, the layer's sounds, every opcode's random operands drawn, played or not, and the order the transitions are searched in.

`/cats.html` plays the scripts the demo's frames will play: [[measured]] 315 of the cat's 805, the demo shipping the first 98 of its 275 animations. It places them as `PopScript` does ([[topic:catz-behaviour]], "Where the cat is"): frame follows frame as its own coordinates say; each reference frame is placed so that the `[Default Glue Ball]` is where it was, the cat turned to align with it, and each turn after the first of a loop ending `endLoopAlign0` is glued so too. The viewer can play an action again and again, as the engine plays a walk for as long as the cat goes on, each time a variant at random, aligned to the last.

- [[measured]] So played, the cat's walks and crawls carry it on, the way it faces. Played once, no action moves the cat: each action's first frame is its last's.
- [[inferred]] So a cat's travel is the engine's repeating an action, as a dog's is.
- Not yet played: the head turned to look at a point or another sprite. `src/behaviour/catz-fudger.ts` plays the fudgers, and `/cats.html` draws a played script by them: the cat turned, rolled and tilted, its head turned, its eyelids shut and tilted, its eyes looking, from a cat as its states leave it — still, its lids a fifth shut (`CatSprite::ResetEyelids`, seg14:1d10, aims both at 20 where the sprite's own default is 30).
