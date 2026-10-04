import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/**
 * The oracle's drives (see oracle/README.md), where the dev server serves
 * them, and what of each the viewers read: a game's directory, and its
 * engine in Windows'.
 */
const DRIVES = [
  {
    at: '/oracle',
    drive: resolve('oracle/build/drive-c'),
    served: [/^DOGZ\.DOG\//i, /^WINDOWS\/DOGZDLL\.DLL$/i],
  },
  {
    at: '/oracle-catz',
    /* The CD-ROM's Catz where it is installed, with all the cat's animations; else the demo's. */
    drive: existsSync(resolve('oracle/build/catz-retail-drive-c/CATZ.DOG'))
      ? resolve('oracle/build/catz-retail-drive-c')
      : resolve('oracle/build/catz-drive-c'),
    served: [/^CATZ\.DOG\//i, /^WINDOWS\/SYSTEM\/CATZDLL\.DLL$/i],
  },
];

/**
 * Serves the oracle's Dogz under `/oracle/`, and its Catz under
 * `/oracle-catz/`, to the dev server only, so the viewers can read the
 * games' files without anyone choosing them: each game's directory and
 * engine, by their paths on the drive, and nothing else of it. Nothing of
 * them is ever part of a build: `pnpm build` makes pages that ask for the
 * files. `index.json` under each lists them.
 */
function oracle({ at, drive: DRIVE, served: SERVED }: (typeof DRIVES)[number]): Plugin {
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const path = join(at, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(DRIVE, path)];
    });

  return {
    name: `oracle${at.replace('/oracle', '')}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(at, (request, response, next) => {
        if (!existsSync(DRIVE)) {
          return next();
        }

        const served = () => walk(DRIVE).filter((path) => SERVED.some((rule) => rule.test(path)));

        const path = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/+/, '');

        if (path === 'index.json') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(served()));
          return;
        }

        if (!served().includes(path)) {
          return next();
        }

        const file = resolve(DRIVE, path);

        response.setHeader('content-type', 'application/octet-stream');
        createReadStream(file).pipe(response);
      });
    },
  };
}

/* The repository's root is the dev server's: `pnpm dev`, then /viewer.html. */
export default defineConfig({
  plugins: DRIVES.map(oracle),
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: { input: { viewer: 'viewer.html', cats: 'cats.html' } },
  },
  server: { port: 5791 },
});
