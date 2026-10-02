/**
 * The front matter every knowledge base page starts with, and the one reader
 * of it.
 *
 * It is a strict subset of YAML: `key: value` and `key: [a, b]` (or that list
 * wrapped one item a line, as Prettier writes a long one). Nothing else is
 * accepted, and anything the schema does not name is an error rather than
 * something ignored, so a typo in a field cannot quietly drop a claim from
 * the site. See `kb/README.md`.
 *
 * After winbox.js's knowledge base, whose shape this follows.
 */

export const KINDS = ['file', 'format', 'topic', 'guide'] as const;

/**
 * How far a file or format is understood: nothing yet, some of it, all of
 * what it holds, or reimplemented in `src/` and tested.
 */
export const STATUSES = ['unexplored', 'partial', 'understood', 'implemented'] as const;

export type Kind = (typeof KINDS)[number];
export type Status = (typeof STATUSES)[number];

export interface FrontMatter {
  kind: Kind;
  name: string;
  summary?: string;
  status?: Status;

  /** Installed files the page is about, as `oracle/installation.json` names them. */
  files: string[];

  /** Our code that implements what the page describes. */
  source: string[];
  topics: string[];
}

const FIELDS = ['kind', 'name', 'summary', 'status', 'files', 'source', 'topics'];
const LISTS = ['files', 'source', 'topics'];

/** A value as written: a quoted string or a bare word. */
function scalar(text: string): string {
  const trimmed = text.trim();

  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    return JSON.parse(trimmed);
  }

  /* Single quotes, as Prettier writes them: a doubled quote is one quote. */
  if (/^'(?:[^']|'')*'$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  return trimmed;
}

/**
 * Splits a page into its front matter and its body, and reads the front
 * matter. Throws with the file and line on anything outside the subset.
 */
export function parsePage(file: string, text: string): { front: FrontMatter; body: string } {
  const lines = text.split(/\r?\n/);

  if (lines[0] !== '---') {
    throw new Error(`${file}: a page starts with a front matter block opened by ---`);
  }

  const end = lines.indexOf('---', 1);

  if (end === -1) {
    throw new Error(`${file}: the front matter is never closed by ---`);
  }

  const raw: Record<string, string | string[]> = {};

  for (let index = 1; index < end; index++) {
    const line = lines[index];
    const where = `${file}:${index + 1}`;

    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const field = line.match(/^(\w+):\s*(.*)$/);

    if (!field) {
      throw new Error(`${where}: not a front matter line: ${line}`);
    }

    const [, key, value] = field;

    if (!FIELDS.includes(key)) {
      throw new Error(`${where}: no field "${key}" in the schema; see kb/README.md`);
    }

    /* A list too long for one line is the way Prettier wraps it: the key on
     * its own, then the brackets and one item a line, indented. */
    let list = value;

    if (value === '' && lines[index + 1]?.trim().startsWith('[')) {
      list = '';

      while (index + 1 < end && !list.endsWith(']')) {
        list += lines[++index].trim();
      }
    }

    if (list.startsWith('[')) {
      if (!list.endsWith(']')) {
        throw new Error(`${where}: a list is not closed with ]`);
      }

      raw[key] = list
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map(scalar);
    } else {
      raw[key] = scalar(value);
    }
  }

  return { front: validate(file, raw), body: lines.slice(end + 1).join('\n') };
}

/** The schema's own rules, apart from anything that needs the installation. */
function validate(file: string, raw: Record<string, string | string[]>): FrontMatter {
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`);
  };

  if (!KINDS.includes(raw.kind as Kind)) {
    fail(`kind must be one of ${KINDS.join(', ')}`);
  }

  if (typeof raw.name !== 'string' || raw.name === '') {
    fail('name is required');
  }

  if (raw.status !== undefined && !STATUSES.includes(raw.status as Status)) {
    fail(`status must be one of ${STATUSES.join(', ')}`);
  }

  if ((raw.kind === 'file' || raw.kind === 'format') && raw.status === undefined) {
    fail(`a ${raw.kind} page says how far it is understood, with status`);
  }

  if (raw.kind === 'file' && !raw.files?.length) {
    fail('a file page names the installed files it is about');
  }

  for (const list of LISTS) {
    if (raw[list] !== undefined && !Array.isArray(raw[list])) {
      fail(`${list} is a list, [a, b]`);
    }
  }

  for (const scalarField of ['name', 'summary', 'status']) {
    if (Array.isArray(raw[scalarField])) {
      fail(`${scalarField} is a single value, not a list`);
    }
  }

  return {
    kind: raw.kind as Kind,
    name: raw.name as string,
    summary: raw.summary as string | undefined,
    status: raw.status as Status | undefined,
    files: (raw.files as string[]) ?? [],
    source: (raw.source as string[]) ?? [],
    topics: (raw.topics as string[]) ?? [],
  };
}
