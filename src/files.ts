/**
 * Where the game's own files come from. None are part of this project: in
 * development they are read from the oracle's drive, which the dev server
 * serves under `/oracle/` (see `vite.config.ts`); anywhere else, from files
 * the person chooses, which never leave their browser.
 *
 * Paths are as they are on the drive, in any case: `DOGZ.DOG/DATA/0.BDT`,
 * `WINDOWS/DOGZDLL.DLL`. Chosen files are found by the end of their path, so
 * a choice of the whole drive, of `DOGZ.DOG` and `DOGZDLL.DLL` together, or
 * of anything holding them, all serve.
 */

export interface GameFiles {
  /** What the files are, for showing. */
  source: string;
  read(path: string): Promise<Uint8Array>;

  /** Every file's path, as `read` takes it. */
  list(): string[];
}

/** The oracle's installation, through the dev server. */
export async function oracleFiles(): Promise<GameFiles | null> {
  const response = await fetch('/oracle/index.json').catch(() => null);

  if (!response?.ok || !response.headers.get('content-type')?.includes('json')) {
    return null;
  }

  const paths: string[] = await response.json();
  const byName = new Map(paths.map((path) => [path.toUpperCase(), path]));

  return {
    source: "the oracle's drive",
    list: () => paths,
    async read(path) {
      const actual = byName.get(path.toUpperCase());

      if (!actual) {
        throw new Error(`no ${path} on the oracle's drive`);
      }

      const file = await fetch(`/oracle/${actual}`);
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}

/** Files chosen with `<input type="file" webkitdirectory>` or a plain multiple choice. */
export function chosenFiles(files: FileList): GameFiles {
  const all = Array.from(files).map((file) => ({
    file,
    path: (file.webkitRelativePath || file.name).toUpperCase(),
  }));

  /* `DOGZ.DOG/DATA/0.BDT` is found as any chosen path ending in it, or in
   * its tail: `DATA/0.BDT` where DOGZ.DOG itself was chosen. */
  const find = (path: string) => {
    const parts = path.toUpperCase().split('/');

    for (let from = 0; from < parts.length; from++) {
      const tail = parts.slice(from).join('/');
      const found = all.find((each) => each.path === tail || each.path.endsWith(`/${tail}`));

      if (found) {
        return found.file;
      }
    }

    return undefined;
  };

  return {
    source: 'the chosen files',
    list: () => all.map((each) => each.path),
    async read(path) {
      const file = find(path);

      if (!file) {
        throw new Error(`no ${path} among the chosen files`);
      }

      return new Uint8Array(await file.arrayBuffer());
    },
  };
}
