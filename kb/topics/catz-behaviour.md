---
kind: topic
name: How a cat behaves
summary: How a Catz cat decides what to do — a tick of reflexes and two state machines over the script player, its states named in CATZDLL.DLL, and a brain of 12 numbers drawn back toward centres its breed sets.
source:
  [
    src/behaviour/catz-brain.ts,
    src/render/project.ts,
    src/formats/engine.ts,
    harness/catzbran.c,
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
- [[read out]] Most of a cat's activities end by entering the global state `moment` (8), whose handler (`DoCatMoment`, seg25:2ce9) chooses the next activity from the brain's numbers, by C's `rand`.

## The brain

- [[read out]] A brain (`XBrain`, seg45; 0x52 bytes) is one number, 0 to 100 (`+0x3a`), what it was before it last moved of itself (`+0x3c`), a centre (`+0x42`) and a rate (`+0x44`). Set, it is kept within 0 to 100 (`SetVal`, seg45:1787). Of its kinds (`+0x46`), a centring one (2), each tick, once the clock is past when it is due (`+0x4a`), moves 1 toward its centre and is due again rate × 60 later (`Update`, seg45:1995). The clock is milliseconds over 17, from `timeGetTime` or `GetTickCount` (seg45:004b): wall-clock time, not ticks.
- [[read out]] A cat has 12, at `+0x2fda`, 0x52 bytes apart, named in the debugging dump of `HandleAutoBreedSwitch` (seg23:3ab5 on): Liveliness, Energy, Independence, Seriousness, Fullness, Groom, Fleas, Fear, Sickness, Proper Diet, Catnipped and Age. All but Age centre; Age is fixed.
- [[read out]] `CatSprite::InitBrain` (seg16:1c30) makes them from the cat's lines' `[Default Factors]` — eleven lines of `centre, spread, rate`, which Catz reads whole (Linez `+0x1de8`, seg39:12c2) and averages with the kitten's ([[format:lnz]]): each brain's rate, then its centre, `centre + spread − 2 × (rand() % spread)` — so drawn about the breed's, a different cat each time — and its value there. An Adoption Kit kitten has no fleas, a diet half proper and all its energy.
- [[measured]] The harness ([[guide:reproducing]]) makes a cat's brains in CATZDLL on winbox.js for five breeds at five ages, and `initCatzBrains` and `updateCatzBrain` (`src/behaviour/catz-brain.ts`), given C's `rand` from where the engine's was, make every value, centre and rate the same, and move them the same.

## Where the cat is

- [[read out]] A cat is where its rectangle is: the sprite's own (`+0x124` to `+0x12a`), which is drawn by. Each tick, as `PopScript` (seg41:0052) shows the next frame, it moves the rectangle from the frame before to the new one, by one of the cat's `XBallz` methods:
  - `MoveFrameRect` (seg47:1e64): the frame before worked out again with the new one's angles (its rotation, tilt and roll, `+0x10` to `+0x14` of the state), and the rectangle moved by how far the frame's own rectangle's top left moved from that one to the new one, and sized as the new one. So a frame carries the cat as its own coordinates do, and a turn turns it about where it stands.
  - `MoveFrameRectBall` (seg47:212d): so that a ball stays where it was on the stage. A frame after `0x7540` keeps the lines' glue ball (`XBallz` `+0x236`), after `0x7541 n` the ball `GetGlueBall` names; and the frame after a reference frame keeps the glue ball, once the reference has been placed as above and the turn to align with it taken (more than 6 either way).
- [[measured]] A frame's own rectangle is the extent of every ball the breed does not omit (`[Omissions]`), each to its radius, and 4 more each way, as `GetCartesianCoordinates` (seg47:419c) keeps it in the cat's state (`+0x36` to `+0x3c`). `catzFrameBounds` (`src/render/project.ts`) makes the engine's own for every frame the harness draws ([[guide:reproducing]]).

## In the Adoption Kit

- [[measured]] CATZ.EXE runs on winbox.js to its playpen, and the cat can be read there a frame at a time: its `CatSprite` is found by its class's table (seg16:499a), and each frame drawn its states, action, frame, rectangle, fudgers and brains are kept. A kitten of the Adoption Kit starts in `initKit` (0x48), then sits in its basket (`inBaskets`, 0x49), peeks out of it and back (`peekFromBasket`, `endPeekFromBasket`, 0x4a and 0x4b) six times or so, then climbs out (`exitBasket`, 0x4c), walks (`locomote` and `performLocomote`, 22 and 23) and stalks (2). Walking, its rotation fudger turns it 5 a tick.

## Not yet

The state handlers themselves, the moment's choice, the reflexes, and how a cat walks to a point (the `targetSprite4` opcode, which the script player does not yet play). Where a frame after a reference frame is put is read but not yet reimplemented.
