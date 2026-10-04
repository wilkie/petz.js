---
kind: format
name: .LNZ breed files
summary: One text file for each of the five breeds — which balls it draws, in which colours and sizes, which balls lines join, its eyes, scales and sounds — over the skeleton every breed shares.
status: partial
files:
  [
    DOGZ.DOG/DATA/BIGDOG.LNZ,
    DOGZ.DOG/DATA/BULLDOG.LNZ,
    DOGZ.DOG/DATA/CHIUA.LNZ,
    DOGZ.DOG/DATA/SCOTTY.LNZ,
    DOGZ.DOG/DATA/TERRIER.LNZ,
  ]
source: [src/formats/lnz.ts]
topics: [drawing-a-dog]
---

A breed is a skeleton every breed shares — the same 65 balls in the same animations ([[format:bhd]], [[format:bdt]]) — dressed differently. The `.LNZ` is the dressing. Which breed a dog is is the `Your Pet` key of [[file:DOGZ.DOG/DOGZ.INI]]: the oracle's Bootz is `.\data\bigdog.lnz`.

## The syntax

- [[measured]] Text, with CRLF line ends, in sections headed `[Name]` as a Windows profile file is. A section is a list of lines, not of keys.
- [[measured]] A line's values come before its first tab, separated by commas: `56, 52, 1`. Everything after the tab is a comment, with or without `//`: `snout, head`. A line that starts with `;` is a comment, and so is anything after a section's name on its heading.
- [[measured]] The files' own comments explain much of them, and that is where the descriptions below come from, quoted. All five parse, with one line for each of the 65 balls in each per-ball section; `test/oracle/game_files_test.ts` checks it. They have the same sections, not always in the same order, except that the bulldog and the chihuahua have no `256 Iris Color` or `16 Iris Color`.

## The sections

| Section              | Lines    | What                                                                                                                                                      |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skeleton Type`      | 1        | 0 to 4, different for each breed: picks how far one toe is lowered in a few frames ([[topic:drawing-a-dog]], a breed's own shape)                         |
| `Eyes`               | 2        | The eye balls, then the iris balls, right then left: 32, 8 and 38, 14 in every breed                                                                      |
| `256 Eyelid Color` … | 1 each   | The eyelids' and irises' colours on the 256- and the 16-colour display; the bulldog and chihuahua give no iris colours                                    |
| `Key Balls`          | 2        | 52 "head" and 50 "chest"                                                                                                                                  |
| `Tongue Balls`       | 2        | 63 and 64                                                                                                                                                 |
| `Default Scales`     | 4        | The adult's pet and ball scales, then the puppy's, in 256ths; the dog's are between by its age ([[topic:drawing-a-dog]])                                  |
| `Leg Extension` …    | 1 or 2   | `Leg` (front, then hind), `Body` and `Face Extension`: how much longer than the skeleton's, halved as read ([[topic:drawing-a-dog]], a breed's own shape) |
| `Head Balls`         | 28       | The balls of the head                                                                                                                                     |
| `Omissions`          | 0        | Balls not drawn; empty in every breed                                                                                                                     |
| `Linez`              | 29 to 34 | "start ball, end ball, fuzz amount": thick lines between balls, such as `snout, head` and the tail's                                                      |
| `256 Ball Color`     | 65       | An index into Dogz's 256-colour palette for each ball: a coat is a ramp of them ([[topic:drawing-a-dog]])                                                 |
| `16 Ball Color`      | 65       | On the 16-colour display: "0blk, 1dkRed, 2dkGrn, 3dkYel, 4dkBlu, 5dkMag, 6dkCyan, 7dkGry, 8ltGry, 9Rd, 10Grn, 11Yel, 12Blu, 13Mag, 14Cyan, 15White"       |
| `Speckle Color`      | 65       | -1, or a colour for speckles on the ball                                                                                                                  |
| `Ball Size Diffs`    | 65       | How much larger or smaller the breed draws each ball than the skeleton's size                                                                             |
| `Puppy Balls`        | 65       | "how much balls are enlarged when in puppy mode"                                                                                                          |
| `Outline Type`       | 65       | "-1 = no outline, 0 = half outline, > 0 = outline thickness"                                                                                              |
| `Outline Color`      | 65       | The outline's colour, from the 16                                                                                                                         |
| `Fuzz`               | 65       | "how fuzzy is ball 0 = no fuzz, 1 = some fuzz, 2 = more fuzz, 3 = boocoo fuzz"                                                                            |
| `Default Factors`    | 11       | Pairs for "excitement", "naughty", "grab object", "clumsy", "groom", "ham", "bark", "sickness", "spray fear", "frustaiton" and "age"                      |
| `Sound List`         | 3        | The adult's and the puppy's sound lists, and "% of maturity for playing adult sounds"                                                                     |

- [[measured]] The ball names come from the per-ball sections' comments, `eBall_Lankle, // 0` to `eBall_tongue2, // 64`, in the order of the skeleton. They are C enumerators, so the game's source called its balls this.
- [[measured]] The bulldog has 29 lines where the others have 34.
- [[read out]] `Ballz::LoadSpecialBallInfo` (DOGZDLL.DLL seg10:1421) reads the per-ball sections into tables of the engine, each with a default for a ball the section does not reach and a limit: `[Puppy Balls]` (-10, then halved), `[Outline Type]` (-1), `[Outline Color]`, `[Fuzz]` (0, up to 8), both `Ball Color` sections, `[Ball Size Diffs]` (halved and added to the skeleton's sizes), `[Speckle Color]` (-1), and the three extensions, halved. It reads `[Eyes]`, the eyelid and iris colours, a `[Pupil Color]` no breed has, and `[Key Balls]` ([[topic:drawing-a-dog]]).
- [[read out]] `Default Factors` line 11 is "age": `PetModule::SetBallScaleFromAge` asks for factor 10, counting from 0.
- [[read out]] `LoadSpecialBallInfo` reads `[Leg Extension]`, `[Body Extension]` and `[Face Extension]` into `Ballz` +0x1641 to +0x1647, each halved, rounding toward 0, and `[Skeleton Type]` into +0x38 (seg10:1595 to 1a14). `ModifyBallzData` reshapes the frames by them ([[topic:drawing-a-dog]]).
- Not yet known: the other behaviour factors.

## In Catz

- [[measured]] The Catz demo ([[guide:reproducing]], Catz beside it) keeps a breed file for each of its creatures, in `PTZFILES\<creature>\RESOURCE\`: five adult cats and five kittens (`APERSIAN.LNZ`, `KPERSIAN.LNZ`, Clown, Hunter, Scaredy and Siamese), a dog, a mouse, two bottles and a cloud. The cat's are 67 balls a section, the dog's 65, the mouse's 16, the bottle's 5, the cloud's 12.
- [[measured]] Its lines are numbers with a comma and tabs between, where Dogz has tabs only before a line's comment: `src/formats/lnz.ts` reads a line as its run of numbers, commas between, and the rest as its comment, which reads both.
- [[measured]] A cat's file has sections Dogz's do not: `[Default Glue Ball]`, `[Glue Ball]`, `[Head Enlargement]`, `[Feet Enlargement]`, `[Ear Extension]`, `[Move Up]`, `[Move Foward]` (so spelt), `[Move Sideways]`, `[Project Ball]`, `[Whiskers]`, `[Default Linez Thickness]`, `[Body Area]`, `[Speckle Map]`, `[Sounds]` and `[Little one]`; and its `[Linez]` lines have eight numbers, `start, end, fuzz, -1, -1, -1, 95, 95`. Not yet known what the five after the fuzz are; [[inferred]] the last two, 95 or 100, the line's thickness at each end, in hundredths.
- [[measured]] Its comments say what its new numbers are: a line's eight are `srt end fuzz col lfCol rtCol sThck eThick`, a colour -1 for its ball's own, only the first three needed, `[Default Linez Thickness]` 90; `[Whiskers]` are lines, `start, end, color`; `[Omissions]` leaves out two balls that are not the cat's, `zorient` and `ztrans`; `[Little one]` names the kitten's own file, `ksiamese.lnz` for the Siamese. Its `[Key Balls]` name every part the engine draws by, in order — head, chest, neck, jaw, the two tongue balls, chin, nose, the two nostrils, butt — -1 for a part the cat has not; Dogz's breeds name only the first two, its engine knowing the rest by number. Its `[Skeleton Type]` is -1, where Dogz's are 0 to 4. `src/render/skeleton.ts` takes a creature's parts so (`skeletonOf`).
- [[measured]] A cat's file gives `[Leg Extension]`, `[Body Extension]` and `[Face Extension]` twice, the second all 0; Dogz's give none twice. [[read out]] Dogz's engine finds a section from the top of the file (seg11:15e5, `LoadSpecialBallInfo`), so the first counts: `src/formats/lnz.ts` keeps the first.
- [[measured]] Its palettes are in `CATZDLL.DLL` as Dogz's are in its engine, ids 10016 and 10256, but under resource type 32515 (`0x7f03`), where Dogz's are 32513.
- [[measured]] The cloud's `[Ball Size Diffs]` is there but empty. [[read out]] Dogz's engine starts every ball's tables before reading a breed (`LoadSpecialBallInfo`, seg10:146a): sizes 0, puppy sizes 3, speckles −1, outline 0, fuzz 1; the reimplementation takes those for a section a breed leaves empty or out.

### How a cat is shaped

- [[read out]] `Linez::ReallyLoadLinezFile` (CATZDLL.DLL seg39:1077) reads the shaping sections without halving them, as Dogz's engine does. `[Leg Extension]` is two lines, front then hind; `[Head Enlargement]` and `[Feet Enlargement]` are each a percentage, then an extra (default 100 and 0); `[Ear Extension]` is a percentage (default 100). `[Move Up]`, `[Move Foward]` and `[Move Sideways]` are lists of `ball, amount`, and `[Project Ball]` a list of `from, ball, percent`. Each list stops at a blank line, or at 30 entries. A blank value line keeps the default: four of the cats give `[Feet Enlargement]` one line.
- [[read out]] `XBallz::ModifyBallzData` (seg36:0000) reshapes each animation as it loads, in this order, each only where its value is not the default:
  1. the body lengthened back from the chest, as in Dogz;
  2. the legs, rebuilt from the soles up;
  3. the face, out along the jaw-to-nose line;
  4. the head balls (`[Head Balls]`) drawn toward the head by the percentage less its extra;
  5. the ear tips (`earL2`, `earR2`) toward the head;
  6. the toes and fingers toward their soles and hands;
  7. each Move Up ball along the line from the belly to the middle of the feet, each Move Foward ball along the nose-to-head line, and each Move Sideways ball along a vector made like a cross product of the two but with every sign a plus (seg36:3e14);
  8. each Project Ball entry, in order, so the tail's chain moves each ball from the one before it, already moved.
- [[read out]] The arithmetic is the engine's own: a vector is scaled to a length in 32 bits and truncated; a percentage is a 16-bit product with its high word lost, then divided by 100 toward 0. Ball positions wrap at 16 bits.
- [[read out]] The first reshape after a breed file is loaded also sizes the head balls by the head percentage plus its extra, and the hands, soles, fingers and toes by the feet's (`EnlargeHead` seg36:2954, `EnlargeFeet` seg36:2d61). `src/render/extend.ts` (`extendCatzFrame`) and `ballSize` in `src/render/project.ts` do both; `test/render/extend_test.ts` checks them.
- [[read out]] What a cat is drawn by is not one file. `CatSprite::UpdateLinezFileStuff` (seg16:1b05) averages the adult's file with its `[Little one]`'s by a percentage, 100 less a value read through an object of the cat's at `+0x3360` (`Linez::Average`, seg39:2b00).
  - **Averaged**, each as `A + (B − A) × pct / 100` in long arithmetic: the extensions, the enlargements, `[Fuzz]`, `[Ball Size Diffs]` (already halved), `[Default Factors]`, and the first two `[Default Scales]` (Catz reads only those two, the pet's and the ball's).
  - **Move lists:** made tables by ball, so averaged lists come out in ball order, each ball once (`AverageBallMoveList`, seg39:3245).
  - **Taken from the adult as they are:** the colours, outlines, speckles, eyes, head balls and `[Linez]`.
  - **The `[Speckle Map]` file:** one or the other's, at random, weighted by the percentage.
  - `averageBreed` in `src/formats/lnz.ts` does this.
  - Not yet known: what the value is. [[measured]] A kitten in the Adoption Kit is drawn from its kitten file alone: the probes `pouncer300` and `sophisto900` match best at 100, and worse by hundreds of pixels at 90 ([[topic:drawing-a-dog]]).
- [[read out]] CATZDLL.DLL names each basket's breed: Sophisto `Asiamese.lnz`, Jester `Aclown.lnz`, Homebody `Apersian.lnz`, Pouncer `Ahunter.lnz`, Scaredy `Ascaredy.lnz`.
