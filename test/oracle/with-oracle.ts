/**
 * Suites that read the oracle's files, run only where it is built (`pnpm
 * oracle`). Jest runs a skipped suite's body all the same, to collect its
 * tests, and these bodies read the files; so without them the body is not
 * run at all, and a skipped test says what is missing.
 */

import { existsSync } from 'node:fs';

export function describeWithOracle(path: string) {
  return (name: string, body: () => void) => {
    if (existsSync(path)) {
      describe(name, body);
    } else {
      describe.skip(name, () => {
        it(`needs the oracle (${path}): pnpm oracle`, () => {});
      });
    }
  };
}
