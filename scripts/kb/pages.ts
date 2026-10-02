/**
 * The pages of the knowledge base, joined to the installation they describe,
 * with the checks that keep the two in agreement. Kept apart from `build.ts`
 * so that the test suite runs the same checks without building the site.
 *
 * Which files exist comes from `oracle/installation.json`, the record of the
 * oracle's drive that `scripts/oracle/fingerprint.mjs` makes. It is committed,
 * so the site builds without the media. Every installed file the game put
 * down is listed on the site whether a page explains it yet or not: a file
 * with no page is a record of what is not yet known.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type FrontMatter, type Kind, parsePage, type Status } from './frontmatter.ts';
import { type Targets } from './markup.ts';

const ROOT = process.cwd();
const PAGES = join(ROOT, 'kb');

export interface Page {
  /** The page's source, from the repository's root. */
  file: string;
  slug: string;
  front: FrontMatter;
  body: string;
}

/** One file of the oracle's drive, as `installation.json` records it. */
export interface InstalledFile {
  path: string;
  bytes: number;
  sha256: string;

  /** The stage of building the oracle that left it as it is. */
  stage: string;
}

/** Article kinds, and the directory of `kb/` each lives in. */
export const DIRECTORY: Record<Kind, string> = {
  file: 'files',
  format: 'formats',
  topic: 'topics',
  guide: 'guides',
};

export function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Every file on the oracle's drive, in path order. */
export function readInstallation(): InstalledFile[] {
  const path = join(ROOT, 'oracle', 'installation.json');

  if (!existsSync(path)) {
    return [];
  }

  const { files } = JSON.parse(readFileSync(path, 'utf8'));

  return Object.entries(files as Record<string, Omit<InstalledFile, 'path'>>)
    .map(([file, entry]) => ({ path: file, ...entry }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The installed files the site lists: everything Dogz put down or changed.
 * Windows' own files are the oracle's ground, not the game, and are listed
 * only where a page is about one.
 */
export function gameFiles(installed: InstalledFile[], pages: Page[]) {
  const named = new Set(pages.flatMap((page) => page.front.files.map((f) => f.toUpperCase())));

  return installed.filter((file) => file.stage !== 'windows' || named.has(file.path.toUpperCase()));
}

/** Every page in `kb/`, read and checked against the schema. */
export function readPages(): Page[] {
  const pages: Page[] = [];

  for (const [kind, directory] of Object.entries(DIRECTORY) as [Kind, string][]) {
    const at = join(PAGES, directory);

    if (!existsSync(at)) {
      continue;
    }

    for (const name of readdirSync(at).sort()) {
      if (!name.endsWith('.md')) {
        continue;
      }

      const file = `kb/${directory}/${name}`;
      const { front, body } = parsePage(file, readFileSync(join(ROOT, file), 'utf8'));

      if (front.kind !== kind) {
        throw new Error(`${file}: a page in kb/${directory}/ is a ${kind}, not a ${front.kind}`);
      }

      pages.push({ file, slug: name.replace(/\.md$/, ''), front, body });
    }
  }

  return pages;
}

/** Where an article is built, from the site's root. */
export function urlOf(page: Page) {
  return `${DIRECTORY[page.front.kind]}/${page.slug}/index.html`;
}

/** The anchor of an installed file's row in the list of files. */
export function fileAnchor(path: string) {
  return `file-${path.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** What `[[kind:target]]` references resolve to. */
export function targetsOf(pages: Page[], installed: InstalledFile[]): Targets {
  const targets: Targets = {
    files: new Map(),
    topics: new Map(),
    formats: new Map(),
    guides: new Map(),
  };

  for (const file of installed) {
    targets.files.set(file.path.toUpperCase(), {
      url: `files/index.html#${fileAnchor(file.path)}`,
      title: file.path.split('/').pop()!,
    });
  }

  for (const page of pages) {
    const target = { url: urlOf(page), title: page.front.name };

    switch (page.front.kind) {
      case 'file':
        for (const file of page.front.files) {
          targets.files.set(file.toUpperCase(), {
            url: target.url,
            title: file.split('/').pop()!,
          });
        }
        break;
      case 'format':
        targets.formats.set(page.slug, target);
        break;
      case 'topic':
        targets.topics.set(page.slug, target);
        break;
      case 'guide':
        targets.guides.set(page.slug, target);
        break;
    }
  }

  return targets;
}

/** The page about an installed file, if one is. */
export function pageFor(pages: Page[], path: string) {
  return pages.find((page) =>
    page.front.files.some((file) => file.toUpperCase() === path.toUpperCase())
  );
}

/**
 * Everything a page claims that the repository can check: that the files it
 * is about are installed, that its source exists, that the topics it names
 * have pages, and that no two file pages claim the same file. Returns every
 * problem, so they are reported together.
 */
export function check(pages: Page[], installed: InstalledFile[]) {
  const errors: string[] = [];
  const paths = new Set(installed.map((file) => file.path.toUpperCase()));
  const topics = new Set(pages.filter((p) => p.front.kind === 'topic').map((p) => p.slug));
  const claimed = new Map<string, string>();

  for (const page of pages) {
    const { file, front } = page;

    for (const path of front.files) {
      if (!paths.has(path.toUpperCase())) {
        errors.push(`${file}: ${path} is not in oracle/installation.json`);
      }

      if (front.kind === 'file') {
        const other = claimed.get(path.toUpperCase());

        if (other) {
          errors.push(`${file}: ${path} already has a page, ${other}`);
        }

        claimed.set(path.toUpperCase(), file);
      }
    }

    for (const source of front.source) {
      if (!existsSync(join(ROOT, source))) {
        errors.push(`${file}: source ${source} does not exist`);
      }
    }

    for (const topic of front.topics) {
      if (!topics.has(topic)) {
        errors.push(`${file}: no topic page ${topic}`);
      }
    }

    if (front.status === 'implemented' && !front.source.length) {
      errors.push(`${file}: implemented, but names no source`);
    }
  }

  return errors;
}

export const STATUS_LABEL: Record<Status, string> = {
  unexplored: 'Unexplored',
  partial: 'Partial',
  understood: 'Understood',
  implemented: 'Implemented',
};

export const STATUS_MEANING: Record<Status, string> = {
  unexplored: 'nothing is known of it yet beyond its name and size',
  partial: 'some of what it holds or does is known',
  understood: 'what it holds or does is known, and written down here',
  implemented: 'understood, and reimplemented in TypeScript with tests',
};
