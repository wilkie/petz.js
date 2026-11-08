/**
 * The playpen's mouse alive: its machines (`CatzMouse`) played by a body of
 * its own (`CatzBody`, its scripts and frames at scales of 200, as
 * `InitMouseSprite` makes it) in a pen given by whoever runs it -- the cat,
 * the cursor, the pen's things, its hole. Its brains made as `InitBrain`
 * makes them from MOUSE.LNZ's `[Default Factors]` and drawn back toward
 * their centres by the clock. See kb/topics/catz-behaviour.md ("The mouse").
 *
 * Its script popped as the engine pops it, within its handlers: a frame on,
 * and done where nothing is left of what was pushed. What layers over it
 * (`PushLayeredAction`) is not played.
 */
import { type Frame } from '../formats/animation.ts';
import { type Script } from '../formats/script.ts';
import {
  BRAIN_KIND,
  type CatzBrain,
  makeCatzBrain,
  setCatzBrain,
  updateCatzBrain,
} from './catz-brain.ts';
import { CatzBody } from './catz-body.ts';
import { makeCatzFudgers, rateCatzFudger } from './catz-fudger.ts';
import {
  CATZ_MOUSE_GLOBAL,
  CatzMouse,
  type CatzMouseFields,
  type CatzMousePoint,
  type CatzMouseWorld,
} from './catz-mouse.ts';
import { catzFocusRect, type CatzPlacer, type CatzRect } from './catz-stage.ts';
import { type CatzPositions } from './catz-timeline.ts';

/** Its brains' factors, from MOUSE.LNZ's `[Default Factors]`: each its centre, spread and rate. */
export function readMouseFactors(lnz: string): [number, number, number][] {
  const section = lnz.split(/^\[/m).find((part) => part.startsWith('Default Factors]'));
  return (section ?? '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) =>
      line
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
    )
    .filter((values) => values.length >= 3 && values.every((n) => !Number.isNaN(n)))
    .slice(0, 4) as [number, number, number][];
}

/**
 * Its four brains as `InitBrain` (seg27:0bc0) makes them: each centring,
 * its rate and its centre its factors', the centre `rand() %` its spread
 * (1 where none) off from its spread more; its value the centre (no saved
 * profile here); and then its fear made 50 to 99, another draw.
 */
export function initMouseBrains(
  factors: [number, number, number][],
  random: (n: number) => number
): CatzBrain[] {
  const brains = Array.from({ length: 4 }, makeCatzBrain);

  brains.forEach((brain, n) => {
    const [base, spread, rate] = factors[n] ?? [50, 0, 0];
    brain.kind = BRAIN_KIND.centring;
    brain.rate = rate;
    const drawn = random(spread || 1);
    brain.centre = Math.max(0, Math.min(100, base + spread - 2 * drawn));
    setCatzBrain(brain, brain.centre);
  });

  setCatzBrain(brains[1], random(50) + 50);
  return brains;
}

/** What it is told of the pen each tick. */
export interface CatzMousePen {
  /** The cat's target point, global state, age (brain 11) and `+0x33b8`. */
  cat: CatzMousePoint;
  catGlobal: number;
  catAge: number;
  x33b8?: number;
  /** The cursor, and whether its button is down. */
  cursor: CatzMousePoint;
  pressed?: boolean;
  /** Where each kind of the pen's things is that is off the shelf; the shelf's places for the rest. */
  things: Map<number, CatzMousePoint>;
  shelfAt: (kind: number) => CatzMousePoint;
  /** The engine's clock: milliseconds over 17. */
  clock: number;
}

export interface CatzMouseLiveOptions {
  scripts: Script[];
  positions: CatzPositions;
  flags: (frame: number) => number;
  shaped: Frame[];
  placer: CatzPlacer;
  stage: CatzRect;
  /** Its mouse hole's target point. */
  hole: CatzMousePoint;
  factors: [number, number, number][];
  random: (n: number) => number;
  /** The cat's `+0x33bc` cleared, as the mouse coming out clears it. */
  clearCatSaw?: () => void;
}

export class CatzMouseLive {
  readonly body: CatzBody;
  readonly mouse: CatzMouse;
  readonly brains: CatzBrain[];
  /** Hidden in its hole (`Hide`), or shown (`Show`). */
  hidden = true;
  private readonly options: CatzMouseLiveOptions;
  private heading = 0;
  private pen?: CatzMousePen;

  constructor(options: CatzMouseLiveOptions) {
    this.options = options;
    const { scripts, positions, flags, shaped, placer, stage, random, factors, hole } = options;
    const fudgers = makeCatzFudgers();
    /* Its rotation aimed fast (`SetAimRate` 5000, `InitMouseSprite`). */
    rateCatzFudger(fudgers[0], 5000);
    this.body = new CatzBody({
      scripts,
      positions,
      flags,
      shaped,
      placer,
      angle: () => null,
      stage,
      fudgers,
      random,
      start: hole,
    });
    this.brains = initMouseBrains(factors, random);
    const fields: CatzMouseFields = {
      state: 0,
      global: CATZ_MOUSE_GLOBAL.inMouseHole,
      count: 0,
      target: 0,
      holder: 0,
      done: 0,
      wait: 0,
      heading: 0,
      x9e: 0,
      brains: this.brains.map(({ value }) => value),
    };
    this.mouse = new CatzMouse(fields);
  }

  /**
   * Held by the cat, as the cat's handlers have it: caught, in its mouth
   * (`held`); stilled, its fear 100; thrown, out of its mouth; put down,
   * its holder the cat (0x1d), which its fleeing finds; free, its holder none.
   */
  catHolds(how: 'caught' | 'stilled' | 'putDown' | 'thrown' | 'free') {
    const { fields } = this.mouse;

    if (how === 'caught') {
      this.inMouth = true;
    } else if (how === 'stilled') {
      fields.brains[1] = 100;
    } else if (how === 'thrown') {
      this.inMouth = false;
    } else if (how === 'putDown') {
      this.inMouth = false;
      fields.holder = 0x1d;
    } else {
      this.inMouth = false;
      fields.holder = 0;
    }
  }

  /** In the cat's mouth: carried where the cat is, each tick. */
  inMouth = false;

  /** Its rectangle, where it is shown. */
  get rect() {
    return this.body.shown?.rect;
  }

  /** Where it is: the middle of its rectangle (its target point). */
  get at(): CatzMousePoint {
    const rect = this.body.shown?.rect;
    return rect
      ? { x: Math.trunc((rect.left + rect.right) / 2), y: Math.trunc((rect.top + rect.bottom) / 2) }
      : this.options.hole;
  }

  /** A tick: its brains drawn back by the clock, then its machines; begun, in its hole (`InitPetModule`). */
  tick(pen: CatzMousePen) {
    this.pen = pen;
    const { fields } = this.mouse;

    this.brains.forEach((brain, n) => {
      brain.value = fields.brains[n];
      updateCatzBrain(brain, pen.clock);
      fields.brains[n] = brain.value;
    });

    /* In the cat's mouth, carried with it. */
    if (this.inMouth) {
      this.body.moveTo(pen.cat);
    }

    if (fields.state === 0) {
      this.mouse.dispatch('global', true, false, this.world(), this.options.random);
      return;
    }

    this.mouse.tick(this.world(), this.options.random);
  }

  /** Where a kind of sprite is, as the mouse asks. */
  private kinAt(kind: number): CatzMousePoint | undefined {
    const pen = this.pen!;

    switch (kind) {
      case 0x1d:
        return pen.cat;
      case 0x17:
        return pen.cursor;
      case 0xe:
        return this.options.hole;
      case 0x1b:
        return this.at;
      default:
        return kind > 0 && kind < 0x10 ? (pen.things.get(kind) ?? pen.shelfAt(kind)) : undefined;
    }
  }

  /**
   * Whether it touches a kind (`CollisionDetect`, seg26:1995): the box 40
   * square about its ball 9, moved a quarter of its diagonal ahead
   * (`MakeFocusRect`), against the cursor's point within 15, its hole's
   * within 5, or another sprite's point within 20 (standing in for its
   * rectangle).
   */
  private collide(kind: number) {
    const shown = this.body.shown;
    const at = this.kinAt(kind);

    if (!shown || !at) {
      return false;
    }

    const focus = catzFocusRect(
      this.options.placer,
      shown.rect,
      shown.pose,
      { width: 0x28, height: 0x28, share: 4 },
      9
    );
    const r = kind === 0x17 ? 15 : kind === 0xe ? 5 : 20;
    return (
      Math.max(focus.left, at.x - r) < Math.min(focus.right, at.x + r) &&
      Math.max(focus.top, at.y - r) < Math.min(focus.bottom, at.y + r)
    );
  }

  private world(): CatzMouseWorld {
    const pen = this.pen!;
    const { body } = this;

    return {
      at: this.at,
      kinAt: (kind) => this.kinAt(kind),
      catGlobal: pen.catGlobal,
      catAge: pen.catAge,
      x33b8: pen.x33b8 ?? 0,
      holeCovered: false,
      shelved: (kind) => kind < 0x10 && !pen.things.has(kind),
      cheeseHeld: false,
      layered: () => 0,
      collide: (kind) => this.collide(kind),
      /* A frame on; done where nothing is left of what was pushed. */
      pop: () => {
        body.next();
        return body.queue.length ? 0 : 1;
      },
      push: (action) => {
        body.play(action, { heading: this.heading });
      },
      layer: () => {},
      reset: () => body.drop(),
      words: () => {},
      toHole: (at) => body.moveTo(at),
      clearCatSaw: () => this.options.clearCatSaw?.(),
      hide: () => (this.hidden = true),
      show: () => (this.hidden = false),
      aim: (heading) => {
        this.heading = heading;
      },
      pressed: pen.pressed,
    };
  }
}
