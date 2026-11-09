/**
 * The playpen's sprites' definitions (`XApt::Read`): text resources of
 * CATZDLL.DLL of type 32513 (1000 the shelf and its things). Each thing is
 * a name, a label and eleven numbers -- its rectangle first -- then its
 * conditions: each a header (the condition, how many sets, its grab
 * rectangle); each set a header (its index, whether it loops, how many
 * frames); each frame a header (its index, how many pictures); each picture
 * `3` and a rectangle and a bitmap's id. Set 0 is the thing at rest; the
 * others its states' animations (`XApt::SetState`). See
 * kb/topics/catz-behaviour.md ("The pen's things").
 *
 * Only the things are read: the shelf's own art has other kinds of
 * pictures, and a definition that does not read as a thing is skipped.
 */

export interface AptPicture {
  rect: [number, number, number, number];
  bitmap: number;
}

export interface AptThing {
  name: string;
  label: string;
  numbers: number[];
  /** By condition, its sets; by set, its frames; by frame, its pictures, in order. */
  conds: Map<number, AptPicture[][][]>;
}

/** Each line's numbers, where the line is wholly numbers. */
function numbersOf(line: string) {
  const words = line.trim().split(/\s+/);
  return words.length && words.every((word) => /^-?\d+$/.test(word))
    ? words.map(Number)
    : undefined;
}

/** Reads one thing's conditions from its lines, from `at`; undefined where they do not read so. */
function readThing(lines: string[], at: number): { thing: AptThing; next: number } | undefined {
  const name = lines[at]?.trim();
  const label = lines[at + 1]?.trim();
  const numbers = numbersOf(lines[at + 2] ?? '');
  const count = numbersOf(lines[at + 3] ?? '');

  if (!name || !label || numbersOf(name) || numbers?.length !== 11 || count?.length !== 1) {
    return undefined;
  }

  let n = at + 4;
  const take = (length: number) => {
    const got = numbersOf(lines[n] ?? '');

    if (got?.length !== length) {
      throw new Error('not a thing');
    }

    n++;
    return got;
  };
  const conds = new Map<number, AptPicture[][][]>();

  try {
    for (let c = 0; c < count[0]; c++) {
      const [cond, setCount] = take(6);
      const sets: AptPicture[][][] = [];

      for (let s = 0; s < setCount; s++) {
        const [set, , frameCount] = take(3);
        const frames: AptPicture[][] = [];

        for (let f = 0; f < frameCount; f++) {
          const [, pictureCount] = take(2);
          const pictures: AptPicture[] = [];

          for (let p = 0; p < pictureCount; p++) {
            if (take(1)[0] !== 3) {
              throw new Error('not a bitmap');
            }

            const [left, top, right, bottom, bitmap] = take(5);
            pictures.push({ rect: [left, top, right, bottom], bitmap });
          }

          frames.push(pictures);
        }

        sets[set] = frames;
      }

      conds.set(cond, sets);
    }
  } catch {
    return undefined;
  }

  return { thing: { name, label, numbers, conds }, next: n };
}

/** The things a definition holds, in order, each read whole. */
export function parseAptThings(text: string): AptThing[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const things: AptThing[] = [];

  for (let at = 0; at < lines.length; at++) {
    const read = readThing(lines, at);

    if (read) {
      things.push(read.thing);
      at = read.next - 1;
    }
  }

  return things;
}

/**
 * The shelf's things by kind: the last fifteen things of its definition,
 * kinds 1 to 15 in order, as `XApt::ReadNormal` makes them (the mouse
 * hole's bitmaps are 17000 on and the bottle's 14000, so not by their ids).
 */
export function aptShelfKinds(things: AptThing[]) {
  return new Map(things.slice(-15).map((thing, n) => [n + 1, thing]));
}

/** The pictures a thing shows at rest in a condition: its set 0's first frame. */
export function aptRestingPictures(thing: AptThing, cond: number) {
  return thing.conds.get(cond)?.[0]?.[0] ?? [];
}
