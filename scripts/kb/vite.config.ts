import { defineConfig } from 'vite';

/**
 * Bundles the knowledge base build for Node: it is TypeScript, and runs
 * through the same transpiler the rest of the project does. `pnpm kb` builds
 * this and then runs it.
 */
export default defineConfig({
  build: {
    ssr: 'scripts/kb/build.ts',
    outDir: 'dist/kb-build',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
  },
});
