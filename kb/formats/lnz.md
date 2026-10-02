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

| Section              | Lines    | What                                                                                                                                                |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skeleton Type`      | 1        | 0 to 4, different for each breed; not yet known what it does, since every breed shares the animations                                               |
| `Eyes`               | 2        | The eye balls, then the iris balls, right then left: 32, 8 and 38, 14 in every breed                                                                |
| `256 Eyelid Color` … | 1 each   | The eyelids' and irises' colours on the 256- and the 16-colour display; the bulldog and chihuahua give no iris colours                              |
| `Key Balls`          | 2        | 52 "head" and 50 "chest"                                                                                                                            |
| `Tongue Balls`       | 2        | 63 and 64                                                                                                                                           |
| `Default Scales`     | 4        | The adult's pet and ball scales, then the puppy's, in 256ths; the dog's are between by its age ([[topic:drawing-a-dog]])                            |
| `Leg Extension` …    | 1 or 2   | `Leg`, `Body` and `Face Extension`; not yet known                                                                                                   |
| `Head Balls`         | 28       | The balls of the head                                                                                                                               |
| `Omissions`          | 0        | Balls not drawn; empty in every breed                                                                                                               |
| `Linez`              | 29 to 34 | "start ball, end ball, fuzz amount": thick lines between balls, such as `snout, head` and the tail's                                                |
| `256 Ball Color`     | 65       | An index into Dogz's 256-colour palette for each ball: a coat is a ramp of them ([[topic:drawing-a-dog]])                                           |
| `16 Ball Color`      | 65       | On the 16-colour display: "0blk, 1dkRed, 2dkGrn, 3dkYel, 4dkBlu, 5dkMag, 6dkCyan, 7dkGry, 8ltGry, 9Rd, 10Grn, 11Yel, 12Blu, 13Mag, 14Cyan, 15White" |
| `Speckle Color`      | 65       | -1, or a colour for speckles on the ball                                                                                                            |
| `Ball Size Diffs`    | 65       | How much larger or smaller the breed draws each ball than the skeleton's size                                                                       |
| `Puppy Balls`        | 65       | "how much balls are enlarged when in puppy mode"                                                                                                    |
| `Outline Type`       | 65       | "-1 = no outline, 0 = half outline, > 0 = outline thickness"                                                                                        |
| `Outline Color`      | 65       | The outline's colour, from the 16                                                                                                                   |
| `Fuzz`               | 65       | "how fuzzy is ball 0 = no fuzz, 1 = some fuzz, 2 = more fuzz, 3 = boocoo fuzz"                                                                      |
| `Default Factors`    | 11       | Pairs for "excitement", "naughty", "grab object", "clumsy", "groom", "ham", "bark", "sickness", "spray fear", "frustaiton" and "age"                |
| `Sound List`         | 3        | The adult's and the puppy's sound lists, and "% of maturity for playing adult sounds"                                                               |

- [[measured]] The ball names come from the per-ball sections' comments, `eBall_Lankle, // 0` to `eBall_tongue2, // 64`, in the order of the skeleton. They are C enumerators, so the game's source called its balls this.
- [[measured]] The bulldog has 29 lines where the others have 34.
- [[read out]] `Ballz::LoadSpecialBallInfo` (DOGZDLL.DLL seg10:1421) reads the per-ball sections into tables of the engine, each with a default for a ball the section does not reach and a limit: `[Puppy Balls]` (-10, then halved), `[Outline Type]` (-1), `[Outline Color]`, `[Fuzz]` (0, up to 8), both `Ball Color` sections, `[Ball Size Diffs]` (halved and added to the skeleton's sizes), `[Speckle Color]` (-1), and the three extensions, halved. It reads `[Eyes]`, the eyelid and iris colours, a `[Pupil Color]` no breed has, and `[Key Balls]` ([[topic:drawing-a-dog]]).
- [[read out]] `Default Factors` line 11 is "age": `PetModule::SetBallScaleFromAge` asks for factor 10, counting from 0.
- Not yet known: how the extensions and `Puppy Balls` are applied, and the other behaviour factors.
