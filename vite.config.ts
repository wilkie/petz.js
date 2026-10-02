import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/** The oracle's drive: see oracle/README.md. */
const DRIVE = resolve('oracle/build/drive-c');

/** What of it the viewer reads: Dogz's directory, and its engine in Windows'. */
const SERVED = [/^DOGZ\.DOG\//i, /^WINDOWS\/DOGZDLL\.DLL$/i];

/**
 * Serves the oracle's Dogz under `/oracle/` to the dev server only, so the
 * viewer can read the game's files without anyone choosing them: Dogz's
 * directory and DOGZDLL.DLL, by their paths on the drive, and nothing else of
 * it. Nothing of it is ever part of a build: `pnpm build` makes pages that
 * ask for the files. `/oracle/index.json` lists them.
 */
function oracle(): Plugin {
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const path = join(at, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(DRIVE, path)];
    });

  return {
    name: 'oracle',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/oracle', (request, response, next) => {
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
  plugins: [oracle()],
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: { input: { viewer: 'viewer.html' } },
  },
  server: { port: 5791 },
});
