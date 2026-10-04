/**
 * The `.LNZ` breed file: everything that makes one breed of dog look unlike
 * another -- which balls it draws, in what colours and sizes, which balls
 * lines join, its scales -- over a skeleton every breed shares. Where its
 * balls are in each frame is not here but in the animations
 * (`bhd.ts`, `bdt.ts`). See kb/formats/lnz.md.
 *
 * The file is text, in sections headed `[Name]` as a Windows profile file
 * is, but a section is a list of lines rather than of keys. A line's values
 * come before its first tab, separated by commas; what follows the tab is a
 * comment, which may or may not start with `//`. A line starting with `;` is a
 * comment, and so is anything after a section's name on its heading.
 */

/** One line of a section: its values, and the comment after them. */
export interface LnzLine {
  values: (number | string)[];
  comment: string;
}

/** Every section, by its name as written, in the order of the file. */
export type LnzSections = Map<string, LnzLine[]>;

/** One line joining two balls. */
export interface Line {
  from: number;
  to: number;
  fuzz: number;
}

/**
 * How a Catz breed reshapes its creature's frames beyond Dogz's extensions,
 * as `Linez::ReallyLoadLinezFile` (CATZDLL.DLL seg39:1077) reads it and
 * `XBallz::ModifyBallzData` (seg36:0000) applies it: see render/extend.ts.
 * Percentages are of the skeleton's own, 100 leaving it be.
 */
export interface CatzShape {
  /** `[Head Enlargement]`: the head balls' places from the head, and an extra for their sizes. */
  head: { percent: number; extra: number };

  /** `[Feet Enlargement]`: the toes' and fingers' from the soles and hands, and an extra for sizes. */
  feet: { percent: number; extra: number };

  /** `[Ear Extension]`: the ears' tips from the head. */
  ears: number;

  /** `[Move Up]`, `[Move Foward]`, `[Move Sideways]`: a ball moved so far, each in order. */
  up: [ball: number, by: number][];
  forward: [ball: number, by: number][];
  sideways: [ball: number, by: number][];

  /** `[Project Ball]`: a ball moved to a percentage of its distance from another, in order. */
  project: [from: number, ball: number, percent: number][];

  /** `[Little one]`: the young one's breed file, which the engine averages this with by age. */
  littleOne: string | null;
}

/** What a breed file says, named. */
export interface Breed {
  sections: LnzSections;
  skeletonType: number;

  /**
   * How much longer the front and hind legs, the body and the face are than
   * the shared skeleton's, in its units (`[Leg Extension]`, front then hind;
   * `[Body Extension]`; `[Face Extension]`), as `Ballz::ModifyBallzData`
   * reshapes every frame. 0 where a breed leaves them out.
   */
  extensions: { frontLeg: number; hindLeg: number; body: number; face: number };

  /** The balls' names, as the per-ball sections' comments give them: `eBall_head`. */
  ballNames: string[];

  /** The balls that are the eyes, and the irises, right then left. */
  eyes: [number, number];
  irises: [number, number];

  /**
   * The eyelids', irises' and pupils' colours, on the 256- and the
   * 16-colour display: null where the breed gives none, and the game its
   * default (`Ballz::LoadSpecialBallInfo`: 3 for an iris, 0 for a pupil).
   */
  eyelidColor256: number | null;
  eyelidColor16: number | null;
  irisColor256: number | null;
  irisColor16: number | null;
  pupilColor: number | null;

  /** The head and the chest, by the file's comments. */
  keyBalls: number[];

  /** The tongue's balls, hidden while the dog has something in its mouth (`[Tongue Balls]`). */
  tongueBalls: number[];
  headBalls: number[];
  omissions: number[];
  lines: Line[];

  /** A colour number for each ball, for the 256-colour display and for the 16-colour one. */
  ballColor256: number[];
  ballColor16: number[];
  speckleColor: number[];

  /** How much larger or smaller than the skeleton each ball is drawn. */
  ballSizeDiffs: number[];
  puppyBalls: number[];

  /** -1 no outline, 0 a half outline, more than 0 an outline that many pixels thick. */
  outlineType: number[];
  outlineColor: number[];

  /** 0 no fuzz, up to 3, "boocoo fuzz". */
  fuzz: number[];
  defaultScales: number[];

  /** A Catz breed's further shaping, where the file has any of its sections. */
  catz?: CatzShape;
}

function value(token: string): number | string {
  return /^-?\d+$/.test(token) ? Number(token) : token;
}

/** Reads a breed file's text into its sections. */
export function parseLnzSections(text: string): LnzSections {
  const sections: LnzSections = new Map();
  let current: LnzLine[] | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');

    if (line.trim() === '' || line.trimStart().startsWith(';')) {
      continue;
    }

    const heading = /^\[([^\]]+)\]/.exec(line);

    if (heading) {
      current = [];

      /* The engine finds a section from the top of the file, so a section
       * given twice — Catz's cats give three twice — is its first. */
      if (!sections.has(heading[1])) {
        sections.set(heading[1], current);
      }

      continue;
    }

    if (!current) {
      throw new Error(`a line before any section: ${line}`);
    }

    /* A run of numbers, a comma between each and any space around it — Dogz
     * puts tabs only before a line's comment, Catz between its numbers too —
     * and the comment after; otherwise, up to the first tab, as written. */
    const run = /^\s*-?\d+(?:\s*,\s*-?\d+)*/.exec(line);

    if (run) {
      current.push({
        values: run[0].split(',').map((token) => value(token.trim())),
        comment: line
          .slice(run[0].length)
          .replace(/^\s*,?/, '')
          .trim(),
      });
      continue;
    }

    const tab = line.indexOf('\t');
    const before = tab === -1 ? line : line.slice(0, tab);
    const comment = tab === -1 ? '' : line.slice(tab).trim();

    current.push({
      values: before
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .map(value),
      comment,
    });
  }

  return sections;
}

/** Reads a breed file. Throws if a section a breed has to have is missing or short. */
export function parseLnz(text: string, balls = 65): Breed {
  const sections = parseLnzSections(text);

  const section = (name: string) => {
    const found = sections.get(name);

    if (!found) {
      throw new Error(`no [${name}] section`);
    }

    return found;
  };

  const numbers = (name: string) =>
    section(name).map((line) => {
      const [first] = line.values;

      if (typeof first !== 'number') {
        throw new Error(`[${name}] has a line that is not a number: ${line.values.join(', ')}`);
      }

      return first;
    });

  /**
   * A section with one line for each ball, in ball order; or, where a breed
   * has none of it, what the engine starts each ball at before reading the
   * file (`LoadSpecialBallInfo`, seg10:146a on): a Catz cloud has no sizes.
   */
  const perBall = (name: string, otherwise?: number) => {
    if (otherwise !== undefined && !sections.get(name)?.length) {
      return Array.from({ length: balls }, () => otherwise);
    }

    const list = numbers(name);

    if (list.length !== balls) {
      throw new Error(`[${name}] has ${list.length} lines, not one for each of ${balls} balls`);
    }

    return list;
  };

  const pair = (line: LnzLine | undefined, name: string): [number, number] => {
    const [a, b] = line?.values ?? [];

    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error(`[${name}] needs two numbers on a line`);
    }

    return [a, b];
  };

  /**
   * A section's lines of numbers, each its first `count`, until a line of
   * fewer -- the engine stops a list at a blank line, at most 30 to one.
   */
  const list = (name: string, count: number) => {
    const found: number[][] = [];

    for (const line of sections.get(name) ?? []) {
      const values = line.values.slice(0, count);

      if (
        values.length < count ||
        values.some((v) => typeof v !== 'number') ||
        found.length === 30
      ) {
        break;
      }

      found.push(values as number[]);
    }

    return found;
  };

  /** The first and second number of a section's first and second lines, as many as there are. */
  const firstTwo = (name: string, otherwise: [number, number]) => {
    const lines = sections.get(name) ?? [];
    const at = (n: number) =>
      typeof lines[n]?.values[0] === 'number' ? (lines[n].values[0] as number) : otherwise[n];
    return { percent: at(0), extra: at(1) };
  };

  const catzSections = [
    'Head Enlargement',
    'Feet Enlargement',
    'Ear Extension',
    'Move Up',
    'Project Ball',
    'Little one',
  ];
  const catz: CatzShape | undefined = catzSections.some((name) => sections.has(name))
    ? {
        head: firstTwo('Head Enlargement', [100, 0]),
        feet: firstTwo('Feet Enlargement', [100, 0]),
        ears: firstTwo('Ear Extension', [100, 0]).percent,
        up: list('Move Up', 2) as [number, number][],
        forward: list('Move Foward', 2) as [number, number][],
        sideways: list('Move Sideways', 2) as [number, number][],
        project: list('Project Ball', 3) as [number, number, number][],
        littleOne: (sections.get('Little one')?.[0]?.values[0] as string | undefined) ?? null,
      }
    : undefined;

  const eyes = section('Eyes');
  const optional = (name: string) => (sections.has(name) ? (numbers(name)[0] ?? null) : null);

  return {
    sections,
    skeletonType: numbers('Skeleton Type')[0],
    extensions: {
      frontLeg: (sections.has('Leg Extension') ? numbers('Leg Extension')[0] : 0) ?? 0,
      hindLeg: (sections.has('Leg Extension') ? numbers('Leg Extension')[1] : 0) ?? 0,
      body: (sections.has('Body Extension') ? numbers('Body Extension')[0] : 0) ?? 0,
      face: (sections.has('Face Extension') ? numbers('Face Extension')[0] : 0) ?? 0,
    },
    ballNames: section('Ball Size Diffs').map((line) => /eBall_\w+/.exec(line.comment)?.[0] ?? ''),
    eyes: pair(eyes[0], 'Eyes'),
    irises: pair(eyes[1], 'Eyes'),
    eyelidColor256: optional('256 Eyelid Color'),
    eyelidColor16: optional('16 Eyelid Color'),
    irisColor256: optional('256 Iris Color'),
    irisColor16: optional('16 Iris Color'),
    pupilColor: optional('Pupil Color'),
    keyBalls: sections.has('Key Balls') ? numbers('Key Balls') : [],
    tongueBalls: sections.has('Tongue Balls') ? numbers('Tongue Balls') : [],
    headBalls: numbers('Head Balls'),
    omissions: sections.has('Omissions') ? numbers('Omissions') : [],
    lines: section('Linez').map((line) => {
      const [from, to, fuzz] = line.values;

      if (typeof from !== 'number' || typeof to !== 'number') {
        throw new Error(`[Linez] needs a start and an end ball: ${line.values.join(', ')}`);
      }

      return { from, to, fuzz: typeof fuzz === 'number' ? fuzz : 0 };
    }),
    ballColor256: perBall('256 Ball Color'),
    ballColor16: perBall('16 Ball Color'),
    speckleColor: perBall('Speckle Color', -1),
    ballSizeDiffs: perBall('Ball Size Diffs', 0),
    puppyBalls: perBall('Puppy Balls', 3),
    outlineType: perBall('Outline Type', 0),
    outlineColor: perBall('Outline Color', 0),
    fuzz: perBall('Fuzz', 1),
    defaultScales: numbers('Default Scales'),
    ...(catz ? { catz } : {}),
  };
}

/** The factors of a dog's nature, in the order of `[Default Factors]` and of the engine's. */
export const FACTORS = [
  'excitement',
  'naughty',
  'grab object',
  'clumsy',
  'groom',
  'ham',
  'bark',
  'sickness',
  'spray fear',
  'frustration',
  'age',
] as const;

/**
 * A breed's factors: for each, the value at its centre and how far either
 * side of it a dog of the breed may be born (`[Default Factors]`, read by
 * `PetModule::LoadFactors`). Where a line is missing, the engine's own
 * centre stands, and a spread of 15.
 */
export function readFactors(sections: LnzSections): { centre: number; spread: number }[] {
  const lines = sections.get('Default Factors') ?? [];
  const engine = [70, 35, 35, 30, 50, 50, 50, 50, 20, 20, 0];

  return FACTORS.map((_, n) => {
    const [centre, spread] = lines[n]?.values ?? [];
    return {
      centre: typeof centre === 'number' ? centre : engine[n],
      spread: typeof spread === 'number' ? spread : 15,
    };
  });
}
