---
kind: topic
name: How a cat behaves
summary: How a Catz cat decides what to do — a tick of reflexes and two state machines over the script player, its states named in CATZDLL.DLL, and a brain of 12 numbers drawn back toward centres its breed sets.
source:
  [
    src/behaviour/catz-behavior.ts,
    src/behaviour/catz-brain.ts,
    src/behaviour/catz-moment.ts,
    src/behaviour/catz-stage.ts,
    src/render/project.ts,
    src/formats/engine.ts,
    harness/catzbran.c,
    harness/catzpen.c,
    test/harness/catzdll_test.ts,
  ]
topics: [behaviour, drawing-a-dog]
---

A Catz cat plays its actions as [[format:scp]] says ("How Catz plays them"): that part, the script player, is reimplemented tick for tick. This page is the layer above it, which chooses the actions. Its addresses are CATZDLL.DLL's, `seg:offset`, segments in decimal.

## A tick

[[read out]] `CatSprite::Update` (seg16:23da), once a tick:

1. each of the cat's 12 brains moves on (`XBrain::Update`; below);
2. where its age has changed, its lines are averaged anew with its kitten's (`UpdateLinezFileStuff`);
3. its reflexes, each a method of its own: blinking first (`HandleBlinking`, slot `+0x12c`; [[topic:drawing-a-dog]]), then the others — automatic breed switching, messages from the playpen, the Adoption Kit's text, scruffing, seeing the mouse, the cursor wiggled, petting, purring, extreme situations, and layering;
4. the cat's global state's handler (the machine at `+0x2fba`), then its own state's (the machine at `+0x2518`), which plays its script (`ScriptSprite::PopScript`).

## Two state machines

- [[read out]] A `StateMachine` (seg42) keeps its state at `+0x3a`, the next at `+0x3c`, the last ten before it, and when the state began. Changing state (`BaseNewState`, seg42:15cc) calls the old state's handler leaving, then the new one's entering; a handler is `DoX(params, enter, leave)`, and one entering may change state again at once.
- [[read out]] The cat has two: a global state (a `GlobalCatStateMachine`, which `+0x2fba` points to) of 24 — attacking, eating, idling, petting, moment, resting, grooming, playing, scared and the rest — and its own state (at `+0x2518`, its number at `+0x2552`) of 82 — stalking, pouncing, locomote, groom, sleep, petting, the basket states of the Adoption Kit (0x49 to 0x4e). Each machine's handler is a switch with one function a state.
- [[measured]] Their names are in CATZDLL.DLL, resources of type 32516: 1000 the cat's states (`eKatState_NOTASTATE` …), 3000 its global states (`eKatGS_…`), 2000 and 4000 the mouse's. `readCatzStateNames` in `src/formats/engine.ts` reads them.
- [[read out]] Most of a cat's activities end in its own state `moment` (21), whose handler (`DoCatMoment`, seg25:2ce9) chooses the next global state from the brain's numbers, by C's `rand` (below, "The moment").

## The brain

- [[read out]] A brain (`XBrain`, seg45; 0x52 bytes) is one number, 0 to 100 (`+0x3a`), what it was before it last moved of itself (`+0x3c`), a centre (`+0x42`) and a rate (`+0x44`). Set, it is kept within 0 to 100 (`SetVal`, seg45:1787). Of its kinds (`+0x46`), a centring one (2), each tick, once the clock is past when it is due (`+0x4a`), moves 1 toward its centre and is due again rate × 60 later (`Update`, seg45:1995). The clock is milliseconds over 17, from `timeGetTime` or `GetTickCount` (seg45:004b): wall-clock time, not ticks.
- [[read out]] A cat has 12, at `+0x2fda`, 0x52 bytes apart, named in the debugging dump of `HandleAutoBreedSwitch` (seg23:3ab5 on): Liveliness, Energy, Independence, Seriousness, Fullness, Groom, Fleas, Fear, Sickness, Proper Diet, Catnipped and Age. All but Age centre; Age is fixed.
- [[read out]] `CatSprite::InitBrain` (seg16:1c30) makes them from the cat's lines' `[Default Factors]` — eleven lines of `centre, spread, rate`, which Catz reads whole (Linez `+0x1de8`, seg39:12c2) and averages with the kitten's ([[format:lnz]]): each brain's rate, then its centre, `centre + spread − 2 × (rand() % spread)` — so drawn about the breed's, a different cat each time — and its value there. An Adoption Kit kitten has no fleas, a diet half proper and all its energy.
- [[measured]] The harness ([[guide:reproducing]]) makes a cat's brains in CATZDLL on winbox.js for five breeds at five ages, and `initCatzBrains` and `updateCatzBrain` (`src/behaviour/catz-brain.ts`), given C's `rand` from where the engine's was, make every value, centre and rate the same, and move them the same.

## What it is inclined to do

- [[read out]] The state handlers ask the cat's brains what it is inclined to do through `MapCatBehavior` (seg15:0000; `CatSprite`'s slot `0x2a0`), by one of 29 behaviours, its answer a number, a yes (1) or no (0), or -1. Most are drawn from its liveliness, independence, seriousness and fear, each above or below 50 -- a temperament of sorts -- and some from its energy, fullness, fear, proper diet, catnip or age (`MapValue`, seg48:1cb2: `low + value × (high − low) / 100`, rounded toward 0); some by chance too, by C's `rand`; some by its state, its global state and what it is after. It works its answers out in pairs and blocks, and answers the one asked: behaviour 11 is asked again by 19.
- [[measured]] `catzBehavior` (`src/behaviour/catz-behavior.ts`) answers every behaviour as the engine does, drawing C's `rand` the same number of times: 60 cats' brains about the engine's thresholds, asked of the cat in the playpen harness (below).

- [[read out]] Its sounds go by its temperament instead -- its brains' centres (`+0x42`, `XBrain`'s slot `0x30`), not where they are now: `MapCatSound` (seg15:1259) answers the action a sound of 12 is made with, by whether the cat is frightened (fear 50 or more), independent (liveliness under 50, independence and seriousness 50 or more), lively (liveliness 50 or more, the rest under), placid (all under 50) or serious (all but fear 50 or more), the first that fits, lively where none does. Some are a choice of two by C's `rand` (odd or even), and three are a kitten's sound, where a draw under `100 − age` comes with an age under 50. Its 13th answers whether the cat is placid now. `MapAndPlayCatSound` (seg15:11ae) plays the action as a layered action, unless one is playing.
- [[measured]] `catzSound` (`src/behaviour/catz-behavior.ts`) answers every sound as the engine does, drawing as many times, for 80 cats in the playpen harness, every temperament among them; all its actions but one, 0x1b7, came up.

## The moment

- [[read out]] Begun (seg25:2cf5 on), the moment chooses a box to look about in: a corner anywhere on the stage, each side up to `behaviour 3 × 2 + 50` more; where it was watching something (mode 1), one time in five it watches it hard (2). It turns to face the user where it faces more than 96 from them (`MakeCatFaceForwardIfNeeded`, seg16:35e0: by its energy and which half of the stage it is in, actions 0x86, 0x87, 0x80 or 0x11b, or 0x80 as a kitten without an age, then 0x150), and goes on to a tick of lingering.
- [[measured]] `catzMomentBegin` (`src/behaviour/catz-moment.ts`) begins the moment as the engine does for 60 cats in the playpen harness, and lingers on from it alike; they faced the user, so its turning is read, not measured.
- [[read out]] Until it makes up its mind to go, it lingers (seg25:314f on): every so many ticks it looks about -- three times in four at a point drawn in a box it chose as it began, else at the user (`LookAtUser`), or, watching something (mode 2 or 3, `+0x3508`), at that -- may swing a fudger by up to 10 either way, after five looks may change what it does meanwhile (action 0x93 or 0xc, `+0x350a`), and may make a sound (`MapAndPlayCatSound`): one owed (5), or 6 where a draw comes under `100 − fullness` and another under 50, or else 7 under a quarter of `100 − seriousness`, none as a kitten without an age. The ticks to its next look are 9 and up to `(100 − behaviour 3) / 2` more, or 9 to 13 in mode 3. Each time its script is done it pushes what it does meanwhile, unless it has looked about more than `+0x3506` times and a draw comes under behaviour 1 (always in mode 3): then its mind is made up, and it pushes 0x98.
- [[measured]] `catzMomentLinger` (`src/behaviour/catz-moment.ts`) lingers as the engine does for 80 cats in the playpen harness: where it looks, its ticks to the next look, what it does meanwhile, the sound it makes and whether its mind is made up.
- [[read out]] The cat's own state `moment` (21; `DoCatMoment`, seg25:2ce9) is how most activities end. Once its script is done and it has made up its mind to go (`+0x3514`), its fear decides first: unafraid (under 50), it walks off (`locomote`, 22) one time in two; afraid, only where a draw under `100 − fear` comes to 1, almost never.
- [[read out]] Otherwise it chooses its next global state, `list[rand() % count]`, from a list of up to 31 it fills (`ResetStuffToDo`, `SetStuffToDo`, seg25:44dd and 4503; seg25:3576 to 3c1d):
  - on the screen saver, resting twice, grooming, idling and the moment, and catnapping one time in two; or the moment alone, where it is so placed (`GetSpriteScreenArea`, 0x1d, is 3);
  - where `PetParams` `+0xc4` is set, the Adoption Kit's state alone;
  - eating alone, where it is less full than behaviour 11 says it would be, or, behaviour 18 willing, one time in four where nothing of kind 0xc is on the shelf and `+0x35d2` is set or one time in ten; resting alone, where it has less energy than behaviour 12;
  - eating alone, one time in twenty, where it has an age;
  - and otherwise: attacking, where three draws come under its seriousness, its liveliness and its energy, or else playing, under `100 − seriousness` and its energy; grooming; eating, under `100 − fullness`; grooming again, under its groom; resting, twice, each under `100 − energy`; being affectionate, three times over, under `100 − independence`; the global state it last chose to play (`+0x3516`, 8 the first time), under `100 − energy`; and idling, twice.
- [[measured]] `catzMomentChoice` (`src/behaviour/catz-moment.ts`) makes the same choice as the engine for 120 cats' brains in the playpen harness, the cat walking off 21 times and choosing eating, resting, idling, grooming, being affectionate, playing and the moment. The screen saver, `+0xc4`, an empty shelf and attacking did not come up, and are read, not measured.

## Where the cat is

- [[read out]] A cat is where its rectangle is: the sprite's own (`+0x124` to `+0x12a`), which it is drawn by. `PopScript` (seg41:0052) moves it by two of the cat's `XBallz` methods, each from the state the cat was last placed in (a copy at `+0x246`) to the state it is in (`+0x678`), and neither moving it at all where the two are the same:
  - `MoveFrameRect` (seg47:1e64): the state before worked out again with the new one's angles (its rotation, tilt and roll, `+0x10` to `+0x14`), and the rectangle moved by how far its frame's own rectangle's top left moved from that to the new one's, and sized as the new one. So a frame carries the cat as its own coordinates do, and a turn turns it about where it stands.
  - `MoveFrameRectBall` (seg47:212d): so that a ball stays where it was on the stage, the rectangle sized as the new frame's.
- [[read out]] A reference frame is placed as it is popped, before the frame it is the reference for: made from the cat's state as it is, turned to align with the frame before where that is more than 6 either way (`CheckAlignment`), glued by the lines' glue ball (`XBallz` `+0x236`, the `[Default Glue Ball]`), and taken as the state the cat was last placed in (seg41:114d to 1257). The last frame of a script, where it is a reference, is placed so and shown.
- [[read out]] Then each tick, once the fudgers have moved the cat's angles, the rectangle is moved from that state to the tick's: by the glue ball where the tick is glued (`endLoopAlign0`, `0x7540`, or `0x7541 n` for the ball `GetGlueBall` names), and otherwise by `MoveFrameRect`; and it is kept touching the stage, its right edge no further left than the stage's left, its bottom no higher than its top, its left no further right than its right and its top no lower than its bottom (`PetParams` `+0xac` to `+0xb2`; seg41:1784 to 1922). Not yet reimplemented: a shift by two fudgers' values (12 and 13, seg41:1817 to 1856) before that, nor the five states `GetCartesianCoordinates` remembers, each by all of its state but its layered action.
- [[measured]] A frame's own rectangle is the extent of every ball the breed does not omit (`[Omissions]`), each to its radius, and 4 more each way, as `GetCartesianCoordinates` (seg47:419c) keeps it in the cat's state (`+0x36` to `+0x3c`). Each ball counts at its own size and, where the frame's extras size it otherwise, at that size too, so a frame that shrinks balls keeps the rectangle they had. `catzFrameBounds` (`src/render/project.ts`) makes the engine's own for every frame the harness draws ([[guide:reproducing]]).
- [[measured]] `placeCatzTick` (`src/behaviour/catz-stage.ts`) puts the cat where the engine does at every tick of the 761 actions the script player is held to, given the state the engine leaves it in each tick: walks, turns, actions one after another, the cat kept on a 640 by 480 stage.

## Walking to a target

- [[read out]] No script plays `targetSprite4`; the states push it themselves. Walking, `DoCatPerformLocomote` (seg25:07c6) pushes it (through slot `0xa4`) with a sprite to walk to -- a kin of the cat's, by its type, its target point the point chosen to walk to -- and a box to look for it in: the cat's width and height (`+0x33c4`, `+0x33c6`) and 3, or twice them and 4. `PopScript` keeps them (seg41:0e8d): the sprite at `+0x1504`, the box at `+0x250e` to `+0x2512`.
- [[read out]] Then every tick, once its frame is popped and before its layered action and fudgers move on (seg41:12b6 on), the cat is steered and looked about:
  - `SetTargetLocation` (seg40:596d) aims the rotation's fudger (`SetAimTarget`) at the angle from the target point to the cat's nose -- the lines' key ball 7 (`+0xd9d`) -- `atan2` in 256ths of a turn by the true 2π, rounded toward 0, and a quarter turn more; not at all where the nose is on the point. The fudger turns the cat there at its own speed, where the script has aiming on (`enableFudgeAim1 0`, as the walks do).
  - `MakeFocusRectBall` (seg40:3850) makes a box the width and height given about the cat's head -- key ball 0 (`+0xd8f`) -- moved toward where it faces by its diagonal over the third number (`MakeFocusRect`, seg40:36f5): by the sine of its rotation sideways, by its tilt up and down. Where the target point is inside it, edges not counted (`XPointInXRect`), `PopScript` answers 2, and the state knows the cat is there.
- [[measured]] `catzAimAt`, `catzFocusRect` and `catzInside` (`src/behaviour/catz-stage.ts`), with `catzTimeline`'s `aim`, turn the cat and find it there as the engine does at every tick of 40 walks to points all round it and close by, in boxes of two sizes. The cat was never tilted in them, so how the box moves with the tilt is read, not measured.

## In the Adoption Kit

- [[measured]] CATZ.EXE runs on winbox.js to its playpen, and the cat can be read there a frame at a time: its `CatSprite` is found by its class's table (seg16:499a), and each frame drawn its states, action, frame, rectangle, fudgers and brains are kept. A kitten of the Adoption Kit starts in `initKit` (0x48), then sits in its basket (`inBaskets`, 0x49), peeks out of it and back (`peekFromBasket`, `endPeekFromBasket`, 0x4a and 0x4b) six times or so, then climbs out (`exitBasket`, 0x4c), walks (`locomote` and `performLocomote`, 22 and 23) and stalks (2). Walking, its rotation fudger turns it 5 a tick.

## The playpen harness

- [[measured]] CATZDLL.DLL's playpen runs in the harness ([[guide:reproducing]]) as CATZ.EXE runs it (CATZ.WAD seg4:12eb on), around a cat adopted on the oracle: the parameters the game filled in (`PetParams`, its `ds:13f0`), taken from CATZ.EXE running on winbox.js as `InitPetModule` begins, with the driver's own window and instance; `InitGlobalPetzData`, a `PetModule` and `InitPetModule`, `XApt::InitTree`, and then a frame at a time `OpenScreenDrawPort`, `DoDrawFrame` and `CloseScreenDrawPort` (`harness/catzpen.c`). The cat is the root apt's 0x1d (`InitPetModule`, seg34:1353). On winbox.js's virtual clock a run is the same every time, the cat's states, actions, brains and C's `rand` all.

The state handlers themselves -- among them how `locomote` and `performLocomote` choose the point and the walk, run or turn to get there -- the moment's choice, and the reflexes.

## Not yet

The state handlers themselves -- among them how `locomote` and `performLocomote` choose the point and the walk, run or turn to get there -- and the reflexes. Of the moment, its turning to face the user, and what the cursor does to it.
