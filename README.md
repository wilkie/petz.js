# dogz-reverse

A clean-room reimplementation of PF.Magic's _Dogz, Your Computer Pet_ (1995)
in TypeScript, and a knowledge base of what reverse engineering it finds.

Nothing of Dogz is in this repository. The game is studied on an **oracle**: a
real Windows 3.1 with a real, registered Dogz installed on it, running under
DOSBox, built by scripts from media fetched from where it is published. What
the repository holds is how to build that oracle reproducibly, what was learned
from it, and our own code.

## Development

The project is written in TypeScript and managed with
[pnpm](https://pnpm.io/). You will need **Node 22.12 or newer**; the version is
pinned in `.nvmrc`:

```shell
nvm use
corepack enable pnpm
pnpm install
```

| Command           | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `pnpm dev`        | The dev server; `/viewer.html` draws the dog from the oracle's files |
| `pnpm build`      | The viewer as static pages, into `dist/app/`, asking for the files   |
| `pnpm test:e2e`   | Playwright tests of the viewer, in Chromium                          |
| `pnpm test`       | Jest unit tests, including the knowledge base's checks               |
| `pnpm typecheck`  | `tsc --noEmit`                                                       |
| `pnpm lint`       | ESLint                                                               |
| `pnpm format`     | Prettier over the repository                                         |
| `pnpm run ci`     | Lint, typecheck and test, through Turbo, which caches each           |
| `pnpm kb`         | The knowledge base site, into `dist/kb/`                             |
| `pnpm oracle`     | Fetch, install and register the oracle, and check it                 |
| `pnpm oracle:run` | Play the oracle's Dogz in a DOSBox window                            |

## The oracle

```shell
pnpm oracle
```

This needs `dosbox`, `mtools`, `Xvfb`, ImageMagick and Python 3 on the system
(`apt install dosbox mtools xvfb imagemagick python3`). It:

1. fetches Windows 3.1, a 256-colour display driver and the two Dogz disks,
   and checks each against the SHA-256 pinned in `oracle/manifest.json`;
2. installs Windows with its own Setup, unattended;
3. installs Dogz with its own Setup, answering its screens on a virtual display;
4. adopts a puppy, with the unlock code the game's copy protection expects;
5. compares every file on the drive with `oracle/installation.json`.

The media and the installation stay in `oracle/.cache/` and `oracle/build/`,
which are not committed. The manifest and the installation record are, so a
clone anywhere either builds the same installation, file for file, or is told
where it differs. [`oracle/README.md`](oracle/README.md) and the knowledge
base's guide to building the oracle say more.

## The viewer

`pnpm dev` serves `/viewer.html` (on port 5791), which draws any of the five
breeds in any frame of the 36 animations, from the game's own files. In
development it reads the oracle's drive, which the dev server serves under
`/oracle/` and never puts in a build; built with `pnpm build`, it asks for a
`DOGZ.DOG` directory instead, which never leaves the browser. The parsers are
in `src/formats/` and the drawing in `src/render/`.

## The knowledge base

`kb/` holds the knowledge base: a page for each of the game's files and
formats, and for how it behaves, every claim labelled with how it is known.
`pnpm kb` builds it into a static site with search, and
`.github/workflows/kb.yml` publishes it to GitHub Pages from `main`.
[`kb/README.md`](kb/README.md) says how a page is written; the build checks
every page against the installation record before anything is published, and
so does the pre-commit hook.

## Licence

The code is AGPL-3.0-or-later. The knowledge base's content is CC BY-SA 4.0
(`kb/LICENSE.md`). Dogz is PF.Magic's, and none of it is part of this project.
