/**
 * Builds the Dogz knowledge base: the list of every file Dogz installs, a
 * page for each file, format, topic and guide written in `kb/`, and an index.
 *
 * Every page's claims are checked before anything is written -- the files it
 * names are installed, its references resolve, its source exists -- and the
 * build fails on any that are not. See `kb/README.md`.
 *
 * Run with `pnpm kb`; the site lands in `dist/kb/`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { type Kind } from './frontmatter.ts';
import { render, type Targets } from './markup.ts';
import {
  check,
  DIRECTORY,
  escape,
  fileAnchor,
  gameFiles,
  type InstalledFile,
  type Page,
  pageFor,
  readInstallation,
  readPages,
  STATUS_LABEL,
  STATUS_MEANING,
  targetsOf,
  urlOf,
} from './pages.ts';
import { STYLE } from './style.ts';

const ROOT = process.cwd();
const OUT = join(ROOT, process.env.KB_OUT ?? 'dist/kb');
const TITLE = 'Dogz Knowledge Base';

/**
 * Where a page links for a file's source: the repository's own `origin` on
 * GitHub or GitLab, at `KB_SOURCE_BRANCH` (by default `main`).
 * `KB_SOURCE_URL` overrides it.
 */
function sourceUrl() {
  if (process.env.KB_SOURCE_URL) {
    return process.env.KB_SOURCE_URL;
  }

  const branch = process.env.KB_SOURCE_BRANCH ?? 'main';

  try {
    const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = origin.match(/^(?:https?:\/\/|git@)([^/:]+)[/:](.+?)(?:\.git)?$/);

    if (match) {
      const [, host, path] = match;
      return host.includes('gitlab')
        ? `https://${host}/${path}/-/blob/${branch}`
        : `https://${host}/${path}/blob/${branch}`;
    }
  } catch {
    // No git, or no origin: links are left relative to the repository.
  }

  return '.';
}

const SOURCE_URL = sourceUrl();

const KIND_TITLE: Record<Kind, string> = {
  file: 'Files',
  format: 'Formats',
  topic: 'Topics',
  guide: 'Guides',
};

const STAGE_LABEL: Record<string, string> = {
  windows: 'Windows Setup',
  setup: 'Dogz Setup',
  adoption: 'Adoption',
  after: 'After adoption',
};

interface Site {
  pages: Page[];
  installed: InstalledFile[];
  targets: Targets;
  errors: string[];

  /** Who links to each page, by its URL. */
  referrers: Map<string, Page[]>;
}

const badge = (page: Page) =>
  page.front.status
    ? `<span class="badge ${page.front.status}" title="${escape(STATUS_MEANING[page.front.status])}">${STATUS_LABEL[page.front.status]}</span>`
    : '';

function layout(
  depth: number,
  title: string,
  crumbs: [string, string | null][],
  content: string,
  options: { mermaid?: boolean; kind?: string; head?: string } = {}
) {
  const { mermaid = false, kind, head = '' } = options;
  const up = '../'.repeat(depth);
  const trail = crumbs
    .map(([label, href]) =>
      href ? `<a href="${up}${href}">${escape(label)}</a>` : `<span>${escape(label)}</span>`
    )
    .join(' <span aria-hidden="true">/</span> ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — ${TITLE}</title>
<link rel="stylesheet" href="${up}style.css">${head.replaceAll('{up}', up)}${
    mermaid
      ? `
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
</script>`
      : ''
  }
</head>
<body>
<header class="site">
<a class="home" href="${up}index.html">${TITLE}</a>
<nav aria-label="Sections" class="sections">${(Object.keys(KIND_TITLE) as Kind[])
    .map((kind) => `<a href="${up}${DIRECTORY[kind]}/index.html">${KIND_TITLE[kind]}</a>`)
    .join(' ')} <a href="${up}search/index.html">Search</a></nav>
<nav aria-label="Breadcrumb">${trail}</nav>
</header>
<main${kind ? ' data-pagefind-body' : ''}>
${
  kind
    ? `<span hidden data-pagefind-meta="title">${escape(title)}</span><span hidden data-pagefind-filter="kind">${escape(kind)}</span>\n`
    : ''
}${content}
</main>
<footer class="site">
<p>Built from the pages in <code>kb/</code> and the record of the oracle's installation. Content is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Dogz is PF.Magic's; none of its files are published here.</p>
</footer>
</body>
</html>
`;
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** A page's body as HTML, its references resolved from `depth` levels down. */
function body(site: Site, page: Page, depth: number, linked?: (url: string) => void) {
  return render(page.body, {
    up: '../'.repeat(depth),
    targets: site.targets,
    file: page.file,
    errors: linked ? [] : site.errors,
    linked,
  });
}

/** Who links to whom, gathered before any page is written. */
function referrersOf(site: Site) {
  const found = new Map<string, Page[]>();

  for (const page of site.pages) {
    const add = (url: string) => {
      const list = found.get(url) ?? [];

      if (url !== urlOf(page) && !list.includes(page)) {
        list.push(page);
        found.set(url, list);
      }
    };

    body(site, page, 0, (url) => add(url.replace(/#.*$/, '')));

    for (const topic of page.front.topics) {
      const target = site.targets.topics.get(topic);

      if (target) {
        add(target.url);
      }
    }
  }

  return found;
}

function linkedFrom(site: Site, url: string, depth: number) {
  const list = (site.referrers.get(url) ?? [])
    .slice()
    .sort((a, b) => a.front.name.localeCompare(b.front.name));

  if (!list.length) {
    return '';
  }

  const up = '../'.repeat(depth);
  return `<h2>Linked from</h2><ul>${list
    .map((from) => `<li><a href="${up}${urlOf(from)}">${escape(from.front.name)}</a></li>`)
    .join('')}</ul>`;
}

function renderArticle(site: Site, page: Page) {
  const { front } = page;
  const { html, mermaid } = body(site, page, 2);
  const files = front.files.length
    ? `<dl class="facts"><dt>Files</dt><dd>${front.files
        .map((path) => {
          const entry = site.installed.find((file) => file.path === path);
          return `<code>${escape(path)}</code>${
            entry ? ` — ${entry.bytes.toLocaleString('en')} bytes, ${STAGE_LABEL[entry.stage]}` : ''
          }`;
        })
        .join('<br>')}</dd>${
        front.source.length
          ? `<dt>Implementation</dt><dd>${front.source
              .map(
                (source) => `<a href="${SOURCE_URL}/${source}"><code>${escape(source)}</code></a>`
              )
              .join('<br>')}</dd>`
          : ''
      }</dl>`
    : front.source.length
      ? `<dl class="facts"><dt>Implementation</dt><dd>${front.source
          .map((source) => `<a href="${SOURCE_URL}/${source}"><code>${escape(source)}</code></a>`)
          .join('<br>')}</dd></dl>`
      : '';
  const topics = front.topics.length
    ? `<p class="note">Topics: ${front.topics
        .map((topic) => {
          const target = site.targets.topics.get(topic)!;
          return `<a href="../../${target.url}">${escape(target.title)}</a>`;
        })
        .join(', ')}</p>`
    : '';

  return layout(
    2,
    front.name,
    [
      [KIND_TITLE[front.kind], `${DIRECTORY[front.kind]}/index.html`],
      [front.name, null],
    ],
    `<h1>${escape(front.name)} ${badge(page)}</h1>
${front.summary ? `<p class="lead">${escape(front.summary)}</p>` : ''}
${files}${topics}
${html}
<p class="note"><a href="${SOURCE_URL}/${page.file}">Edit this page</a></p>
${linkedFrom(site, urlOf(page), 2)}`,
    { mermaid, kind: KIND_TITLE[front.kind].replace(/s$/, '') }
  );
}

function renderArticleIndex(site: Site, kind: Exclude<Kind, 'file'>) {
  const list = site.pages.filter((page) => page.front.kind === kind);

  return layout(
    1,
    KIND_TITLE[kind],
    [[KIND_TITLE[kind], null]],
    `<h1>${KIND_TITLE[kind]}</h1>
${
  list.length
    ? `<ul class="articles">${list
        .map(
          (page) =>
            `<li><a href="${page.slug}/index.html">${escape(page.front.name)}</a> ${badge(page)}${
              page.front.summary
                ? `<br><span class="note">${escape(page.front.summary)}</span>`
                : ''
            }</li>`
        )
        .join('\n')}</ul>`
    : '<p>None yet.</p>'
}`,
    { kind: 'Index' }
  );
}

/**
 * Every file Dogz put on the drive, with what is known of each: the
 * completion signal of the whole effort, as winbox.js's stub pages are of
 * its.
 */
function renderFiles(site: Site) {
  const listed = gameFiles(site.installed, site.pages);
  const known = listed.filter((file) => pageFor(site.pages, file.path));
  const rows = listed
    .map((file) => {
      const page = pageFor(site.pages, file.path);

      return `<tr id="${fileAnchor(file.path)}">
<th scope="row">${
        page
          ? `<a href="../${urlOf(page)}"><code>${escape(file.path)}</code></a>`
          : `<code>${escape(file.path)}</code>`
      }</th>
<td class="num">${file.bytes.toLocaleString('en')}</td>
<td>${STAGE_LABEL[file.stage] ?? file.stage}</td>
<td>${page ? badge(page) : '<span class="badge unexplored">Unexplored</span>'}</td>
</tr>`;
    })
    .join('\n');

  return layout(
    1,
    'Files',
    [['Files', null]],
    `<h1>Files</h1>
<p class="lead">Every file Dogz's Setup and its adoption put on the oracle's drive: ${listed.length} files, ${known.length} with a page. A file with no page is one nothing is known of yet beyond its name and size.</p>
<table>
<caption>The installation, from <code>oracle/installation.json</code></caption>
<thead><tr><th scope="col">Path</th><th scope="col" class="num">Bytes</th><th scope="col">Written by</th><th scope="col">Understood</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`,
    { kind: 'Index' }
  );
}

function renderIndex(site: Site) {
  const listed = gameFiles(site.installed, site.pages);
  const count = (kind: Kind) => site.pages.filter((page) => page.front.kind === kind).length;

  return layout(
    0,
    'Home',
    [['Home', null]],
    `<h1>${TITLE}</h1>
<p class="lead">What reverse engineering PF.Magic's <cite>Dogz, Your Computer Pet</cite> (1995) has found, for rebuilding it in TypeScript: every file it installs, the formats they are in, and how the game behaves — each claim labelled with how it is known.</p>
<ul>
<li><a href="files/index.html">Files</a>: the ${listed.length} files Dogz puts on a Windows 3.1 drive, ${count('file')} explained so far.</li>
<li><a href="formats/index.html">Formats</a>: ${count('format')} file formats.</li>
<li><a href="topics/index.html">Topics</a>: ${count('topic')} pages on how the game behaves.</li>
<li><a href="guides/index.html">Guides</a>: how to build the oracle — a real, registered Dogz on a real Windows 3.1 — and check any claim here against it.</li>
</ul>
<h2>Evidence</h2>
<p>Every claim carries a label: <span class="label documented">Documented</span> (PF.Magic or Microsoft said so), <span class="label measured">Measured</span> (the oracle was seen doing it), <span class="label read-out">Read out</span> (found in the game's code, at a segment and offset), <span class="label inferred">Inferred</span> (fits what was seen, not yet read in the code) or <span class="label refused">Refused</span> (a reading that was tried and lost).</p>`,
    { kind: 'Overview' }
  );
}

function renderSearch() {
  return layout(
    1,
    'Search',
    [['Search', null]],
    `<h1>Search</h1>
<pagefind-config bundle-path="../pagefind/"></pagefind-config>
<pagefind-input autofocus placeholder="Files, formats, topics"></pagefind-input>
<pagefind-filter-dropdown filter="kind" label="Kind"></pagefind-filter-dropdown>
<pagefind-summary></pagefind-summary>
<pagefind-results show-sub-results></pagefind-results>
<script src="../pagefind/pagefind-component-ui.js"></script>`,
    { head: '\n<link rel="stylesheet" href="{up}pagefind/pagefind-component-ui.css">' }
  );
}

/** Reads and checks everything, without writing; what the tests run. */
export function assemble(): Site {
  const pages = readPages();
  const installed = readInstallation();
  const errors = check(pages, installed);
  const site: Site = {
    pages,
    installed,
    targets: targetsOf(pages, installed),
    errors,
    referrers: new Map(),
  };

  site.referrers = referrersOf(site);

  // Render every body once for its references alone, so a broken one fails.
  for (const page of pages) {
    body(site, page, 0);
  }

  return site;
}

export function build() {
  const site = assemble();

  if (site.errors.length) {
    throw new Error(`the knowledge base does not check:\n  ${site.errors.join('\n  ')}`);
  }

  rmSync(OUT, { recursive: true, force: true });
  write(join(OUT, 'style.css'), STYLE);
  write(join(OUT, 'index.html'), renderIndex(site));
  write(join(OUT, 'files', 'index.html'), renderFiles(site));
  write(join(OUT, 'search', 'index.html'), renderSearch());

  for (const kind of ['format', 'topic', 'guide'] as const) {
    write(join(OUT, DIRECTORY[kind], 'index.html'), renderArticleIndex(site, kind));
  }

  for (const page of site.pages) {
    write(join(OUT, urlOf(page)), renderArticle(site, page));
  }

  console.log(`${site.pages.length} pages and ${site.installed.length} files into ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    build();
  } catch (error) {
    console.error(`kb: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
