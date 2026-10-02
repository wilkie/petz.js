---
kind: topic
name: The brain
summary: How Dogz learns tricks — XBrain, a small learner ported from a Visual Basic tool, whose desires a treat brought out sets, which chooses a begging dog's tricks at random by the weight of its synapses, wears a choice down each time it is made, and raises the tricks done just before a treat is given.
source: [src/behaviour/brain.ts, src/formats/brain.ts, src/formats/engine.ts]
topics: [behaviour]
---

Whatever trick a begging dog does is the brain's choice: DOGZDLL.DLL's class `XBrain` (segments 12 and 13), with its data in [[format:pbt]]. `src/behaviour/brain.ts` reimplements it, and the viewer's live dog has it: hold up a treat, and the dog does what its brain chooses; give the treat after a trick, and the brain learns.

## Where it came from

- [[read out]] `XBrain` keeps the shape of a Visual Basic program: its lists are `XVBListBoxS` list boxes, its actions are the handlers of a form's buttons and lists — `thinkbutton_click`, `inverblist_dblclick`, `OutVerbList_DblClick`, `LearnButton_Click`, `Defaults_Click` — and it takes its arguments by reference. The engine can also talk to an outside "Petz Brain Tool" by DDE ("Cannot connect with Petz Brain Tool!"); with the brain in-process, as in Dogz, that is unused.
- [[read out]] The engine tells the brain only three things, as a verb and an object (seg15:0d1d): when the dog first begs for a treat, `[+]BringOut*` the treat, `[u]RedTreat` say (`ActivateBrain`, seg18:290d); when the treat is put down, `[w]Throw!` (`FoodSprite::Update`, seg20:0f5c); and when it is picked up again while the dog eats, `[+]BringOut*` (seg20:10cf). Each is followed by a think. And when the dog picks its next trick, it asks the brain to think (`PickTrickState`, seg21:6b3c).

## Desires and the situation

- [[read out]] Desires are numbers kept within their bounds (`PegDesireValue`). An input verb on an object moves every desire not named `~...` by its in-effect: added to, or, for an effect of type `!`, set (`AffectDesire`, seg13:0000). In Dogz's file, bringing out a treat sets its colour's desire — `TrickBlue`, `TrickGreen`, `TrickRed` — to 500, and putting it down takes 20 off.
- [[read out]] The situation is the strongest desire not named `~...`, the first where they are equal (`situation`, seg13:3e73). So which treat was brought out is what the brain is thinking about.
- [[read out]] The six `~` desires are moods. A mood number from 0 to 119 (`HappinessMood`, 65 to start) sets one of them to 100 by which sixth it is in (`SetHappinessMood`, seg13:3d76); inputs move it by their amount over the desire's threshold, or 120, and it drifts back towards 60. Moods play no part in choosing a trick.
- [[read out]] Every `ActivateBrain` clears the desires (`ZeroOutDesires`).

## Thinking

- [[read out]] To think (`thinkbutton_click`, seg12:1147), the brain weighs every output verb not named `~...` with every object present: the synapse's weight, plus its instinct's weight times the out-effect against the situation's desire, over 100. It takes `rand()` modulo the total, Borland's `rand` as the engine's, and walks the choices until it falls below 0. With nothing to weigh it says `NOTHING`.
- [[read out]] The engine maps a choice to one of its states by a table at DS:0x1f2c: 35 rows, each a trick verb with the object `Null`, its state of the same name, and a delay of 25 frames. What maps to no state is "no opinions", and the dog picks a trick at random.
- [[read out]] 25 frames later the choice is made real (`MakeLastThinkReal`, seg12:15ed): remembered, newest first, ten at most, each with the situation it was made in, the others a step older; and its synapse keeps 85 in 100 of its weight, never less than 1 — the entropy, `GLOBALCONTROLS`' first number, 15. A new think before then makes the old one real first. 150 frames after, everything remembered grows older again (`NullOutVerb`).

## Learning

- [[read out]] An input verb ending `!` is a lesson (`inverblist_dblclick`, seg12:079e). Its score is how far the situation's desire fell: `[w]Throw!`, the treat given, takes 20 off, a score of 20.
- [[read out]] `LearnKernel` (seg13:234e) raises the synapse of each remembered output of the situation by the score times a weight for its age, over 100 — 100, 20, 5, 5, then 1 (`MEMOUTLEARNWEIGHTS`) — at most 60 a lesson, and keeps it between 1 and 32,000 (`MOREGLOBALCONTROLS`). It learns only for a synapse that exists: the engine tests the synapse for object `object ≠ 0 ? 1 : 0`, which for the null object is its own. A choice not yet made real is forgotten.
- [[read out]] Each colour of treat has its own innate tricks, weighted 1 or 5: blue rolls and wiggles, green walks on its hind legs, red howls. So a red treat trains the tricks red likes, and a trick rewarded with red treats becomes red's.
- [[measured]] Brought out and given ten times, a red treat raises a trick it rewarded by more than 20 (`test/oracle/behaviour_test.ts`). Played through the dog, twelve red treats each given after the trick it did took howling from 5 to 65 and rolling over from 5 to 43, and it howled in seven of them.
- [[read out]] Once the brain has been asked, the treat's own reward to the trick weights ([[format:tdt]]) is skipped: what the dog learns from begging is the brain's.

## Not yet

- [[read out]] The engine writes the brain back to its file as it closes (`WriteBrain`), and so keeps what it learned; the viewer keeps it only while the page is open.
- [[read out]] Its learning on objects marked `[a]`, its `jolt` and its situation bleed are in the code but unused by Dogz's file, and not played.
