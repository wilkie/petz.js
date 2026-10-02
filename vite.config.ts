import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/** The oracle's installed Dogz: see oracle/README.md. */
const DOGZ = resolve('oracle/build/drive-c/DOGZ.DOG');

/**
 * Serves the oracle's Dogz under `/oracle/` to the dev server only, so the
 * viewer can read the game's files without anyone choosing them. Nothing of
 * it is ever part of a build: `pnpm build` makes pages that ask for the files.
 * `/oracle/index.json` lists them.
 */
function oracle(): Plugin {
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const path = join(at, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(DOGZ, path)];
    });

  return {
    name: 'oracle',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/oracle', (request, response, next) => {
        if (!existsSync(DOGZ)) {
          return next();
        }

        const path = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/+/, '');

        if (path === 'index.json') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(walk(DOGZ)));
          return;
        }

        const file = resolve(DOGZ, path);

        if (!file.startsWith(DOGZ) || !existsSync(file) || statSync(file).isDirectory()) {
          return next();
        }

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
