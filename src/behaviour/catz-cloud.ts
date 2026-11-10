/**
 * CatNapz's cloud (kin 0x10, `CloudSprite`, CATZDLL.DLL seg32; its files in
 * `PTZFILES/CLOUD`), as starting a dream and the dream's end have it: a
 * script sprite of its own, behind all (`+0x9e` -5000). Made
 * (`InitCloudSprite`, seg32:2d9f), its first three fudgers (rotation, and
 * the two after, `+0x1516` on) are set to aim at 50 a tick in 3 steps,
 * damped 90 (their slot `0x24`); it is off (`+0x2518` 0); and its width
 * and height (`+0x251e`, `+0x2520`) are its first frame's. On, each tick
 * (`Update`, seg32:31c4) its script is popped; one time in five each of
 * the three is aimed at 69 less `rand() % 11` (slot `0xc`); and its script
 * done, it pushes 0. See kb/topics/catz-catnapz.md ("CatNapz").
 */

import type { Frame } from '../formats/animation.ts';
import type { Script } from '../formats/script.ts';
import { CatzBody } from './catz-body.ts';
import {
  aimCatzFudger,
  defaultCatzFudgerRate,
  makeCatzFudgers,
  resetCatzFudger,
} from './catz-fudger.ts';
import type { CatzPlacer, CatzRect } from './catz-stage.ts';
import type { CatzPositions } from './catz-timeline.ts';

export interface CatzCloudOptions {
  scripts: Script[];
  positions: CatzPositions;
  flags: (frame: number) => number;
  shaped: Frame[];
  placer: CatzPlacer;
  stage: CatzRect;
  random: (n: number) => number;
}

export class CatzCloudLive {
  readonly body: CatzBody;
  /** Put away (`0x7c`), or shown (`0x78`). */
  hidden = true;
  /** Its script played on each tick (`+0x2518`). */
  on = false;
  /** Its width and height (`+0x251e`, `+0x2520`). */
  readonly size: { width: number; height: number };
  private readonly fudgers = makeCatzFudgers();
  private readonly random: (n: number) => number;

  constructor(options: CatzCloudOptions) {
    this.random = options.random;

    for (const fudger of this.fudgers.slice(0, 3)) {
      defaultCatzFudgerRate(fudger, 50, 3, 90, 0);
      resetCatzFudger(fudger);
    }

    this.body = new CatzBody({ ...options, angle: () => null, fudgers: this.fudgers });

    /* Its first frame, which its size is of. */
    this.body.play(0);
    this.body.next();
    this.body.drop();
    const rect = this.body.shown?.rect;
    this.size = rect
      ? { width: rect.right - rect.left, height: rect.bottom - rect.top }
      : { width: 0, height: 0 };
  }

  /** Put with its target point at a point (`0x44`). */
  moveTo(at: { x: number; y: number }) {
    this.body.moveTo(at);
  }

  /** Shown (`0x78`). */
  show() {
    this.hidden = false;
  }

  /** Sent to a point, its middle carried there over what it plays (its words 0x7534, -11, there; 0x756f), playing 2. */
  fly(to: { x: number; y: number }) {
    this.body.play(2, { leap: { ball: -11, x: to.x, y: to.y } });
  }

  /** Whether the frame it shows is cued so. */
  cued(cue: number) {
    return !!this.body.shown?.step.cues?.includes(cue);
  }

  /** Its draw point (`GetDrawPt`): its rectangle's top left. */
  drawPoint() {
    const rect = this.body.shown?.rect;
    return rect && { x: rect.left, y: rect.top };
  }

  /** Let go (`0x9c` 2) and playing 1, which cues 0 at its end. */
  end() {
    this.body.drop();
    this.body.play(1);
  }

  /** Put away (`0x7c`). */
  away() {
    this.hidden = true;
  }

  /** Its tick (`Update`), on: its frame, its fudgers aimed one time in five, and 0 pushed where its script is done. */
  tick() {
    if (!this.on) {
      return;
    }

    this.body.next();

    if (this.random(5) === 0) {
      for (const n of [0, 2, 1]) {
        aimCatzFudger(this.fudgers[n], 0x45 - this.random(11));
      }
    }

    if (!this.body.queue.length) {
      this.body.play(0);
    }
  }
}
