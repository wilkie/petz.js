/**
 * One share of a seed search for probe.mjs: draws the held dog from each of
 * a range of seeds and keeps the few that match the oracle's picture best.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { setFidelity } from '../../src/render/fidelity.ts';
import { draw, loadScene, score } from './match.ts';

const { drive, frame, age, bristle, yaw, dx, dy, order, dog, from, to, fidelity, cat } = workerData;
setFidelity(fidelity);
const scene = loadScene(
  (path) => new Uint8Array(readFileSync(join(drive, path))),
  frame,
  age,
  bristle,
  cat
);
const best = [];

for (let seed = from; seed < to; seed++) {
  const { wrong } = score(dog, draw(scene, yaw, [...order], seed), dx, dy);
  best.push({ seed, wrong });

  if (best.length > 8) {
    best.sort((a, b) => a.wrong - b.wrong);
    best.length = 8;
  }
}

parentPort.postMessage(best.sort((a, b) => a.wrong - b.wrong));
