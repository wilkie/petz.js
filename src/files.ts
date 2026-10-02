/**
 * Where the game's own files come from. None are part of this project: in
 * development they are read from the oracle's drive, which the dev server
 * serves under `/oracle/` (see `vite.config.ts`); anywhere else, from a
 * `DOGZ.DOG` directory the person chooses, which never leaves their browser.
 *
 * Paths are as Dogz names them, relative to its directory and in any case:
 * `DATA/ALL_PTZ.BHD`.
 */

export interface GameFiles {
  /** What the files are, for showing. */
  source: string;
  read(path: string): Promise<Uint8Array>;
  list(): string[];
}

/** The oracle's installation, through the dev server. */
export async function oracleFiles(): Promise<GameFiles | null> {
  const response = await fetch('/oracle/index.json').catch(() => null);

  if (!response?.ok) {
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
        throw new Error(`no ${path} in the oracle's Dogz`);
      }

      const file = await fetch(`/oracle/${actual}`);
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}

/** A `DOGZ.DOG` directory chosen with `<input type="file" webkitdirectory>`. */
export function chosenFiles(files: FileList): GameFiles {
  const byName = new Map<string, File>();

  for (const file of Array.from(files)) {
    /* `DOGZ.DOG/DATA/0.BDT`: drop the chosen directory's own name. */
    const path = file.webkitRelativePath.split('/').slice(1).join('/');
    byName.set(path.toUpperCase(), file);
  }

  return {
    source: 'the chosen directory',
    list: () => [...byName.keys()],
    async read(path) {
      const file = byName.get(path.toUpperCase());

      if (!file) {
        throw new Error(`no ${path} in the chosen directory`);
      }

      return new Uint8Array(await file.arrayBuffer());
    },
  };
}
