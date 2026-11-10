/**
 * CatNapz's dog (kin 0x1a, `DogSprite`, CATZDLL.DLL seg21; its files in
 * `PTZFILES/DOG`), as the cat's chase has it: a script sprite of its own
 * that plays only what it is pushed -- the chase's bark (7) and run (1) --
 * put where the chase puts it, facing so (`+0x688`), and put away. See
 * kb/topics/catz-catnapz.md ("CatNapz").
 */

import type { Frame } from '../formats/animation.ts';
import type { Script } from '../formats/script.ts';
import { CatzBody } from './catz-body.ts';
import { makeCatzFudgers } from './catz-fudger.ts';
import type { CatzPlacer, CatzRect } from './catz-stage.ts';
import type { CatzPositions } from './catz-timeline.ts';

export interface CatzDogOptions {
  scripts: Script[];
  positions: CatzPositions;
  flags: (frame: number) => number;
  shaped: Frame[];
  placer: CatzPlacer;
  stage: CatzRect;
  random: (n: number) => number;
}

export class CatzDogLive {
  readonly body: CatzBody;
  /** Put away (`0x7c`), or shown (`0x78`). */
  hidden = true;
  private readonly fudgers = makeCatzFudgers();

  constructor(options: CatzDogOptions) {
    this.body = new CatzBody({ ...options, angle: () => null, fudgers: this.fudgers });
  }

  /** Where its target point is across, as its frame this tick leaves it; none put away. */
  at() {
    const rect = this.body.shown?.rect;
    return this.hidden || !rect ? undefined : Math.trunc((rect.left + rect.right) / 2);
  }

  /** Whether its script is done: nothing left to play. */
  done() {
    return !this.body.queue.length;
  }

  /** An action pushed for it, after what it plays. */
  push(action: number) {
    this.body.play(action);
  }

  /** Put with its target point at a point (`0x44`), facing so (`+0x688`), let go and shown: what it played dropped. */
  put(at: { x: number; y: number }, facing: number) {
    this.body.drop();
    const rotation = this.fudgers[0];
    rotation.value = rotation.previous = rotation.target = facing;

    /* Never shown yet: its first frame, from which to put it. */
    if (!this.body.shown) {
      this.body.play(1);
      this.body.next();
      this.body.drop();
    }

    this.body.moveTo(at);
    this.hidden = false;
  }

  /** Put away (`0x7c`). */
  away() {
    this.hidden = true;
  }

  /** Its frame this tick, shown. */
  next() {
    return this.hidden ? undefined : this.body.next();
  }
}
