/**
 * The playpen's mouse (`MouseSprite`, CATZDLL.DLL seg26 and 27): its two
 * state machines -- global, in its hole (1), exploring (2) or fleeing (3);
 * its own, waiting in its hole (1), might it come out (2), walking (3),
 * sniffing what it came for (4), looking around (5), dangling (6), after
 * dangling (7) and playing dead (8) -- each tick the global one's handler
 * and then its own (`MouseSprite::Update`, seg27:0f21). Its four brains
 * (`+0x257e` on, 0x52 apart): restless (0, its wish to come out), fear (1),
 * fullness (2) and curiosity (3), by how they are used. See
 * kb/topics/catz-behaviour.md ("The mouse").
 *
 * What it does to the world -- its script pushed and popped, put at its
 * hole, hidden and shown, its rotation aimed -- goes through `CatzMouseWorld`,
 * which answers what it asks: where things are, what is on the shelf,
 * whether it touches something (`CollisionDetect`).
 */
import { cosine, sine } from '../render/project.ts';
import { catzDist } from './catz-states.ts';

export const CATZ_MOUSE_STATE = {
  waitInHole: 1,
  mightComeOut: 2,
  locomote: 3,
  sniffingInterest: 4,
  lookAround: 5,
  dangling: 6,
  postDangling: 7,
  playDead: 8,
} as const;

export const CATZ_MOUSE_GLOBAL = { inMouseHole: 1, explore: 2, flee: 3 } as const;

/** The kinds it may be curious about (`GetNextCuriosity`, seg26:1b28, its table at 1be7), by `rand() % 15`: 13 and 14 the cat. */
const CURIOSITIES = [1, 2, 3, 4, 5, 6, 7, 0xa, 0xb, 9, 0xc, 0xd, 0xf, 0x1d, 0x1d];

/** The mouse's fields its handlers read and write. */
export interface CatzMouseFields {
  /** Its own state (`+0x2552`) and its global one (the machine at `+0x257a`, its `+0x3a`). */
  state: number;
  global: number;
  /** Its count (`+0x26d4`). */
  count: number;
  /** The kind it goes for (`+0x26d8`). */
  target: number;
  /** Who holds it (`+0x26ca`): 0, the cursor (0x17) or the cat (0x1d). */
  holder: number;
  /** Its script done once since it began waiting or coming out (`+0x26d2`). */
  done: number;
  /** How long it waits before it decides again, coming out (`+0x26d6`). */
  wait: number;
  /** Which way it faces (`+0x688`). */
  heading: number;
  /** `+0x9e`: -1000 coming out, 5000 dangling, else 0. */
  x9e: number;
  /** Its four brains' values: restless, fear, fullness, curiosity. */
  brains: number[];
  /** Held by the user (`+0xfc`). */
  held?: number;
}

export interface CatzMousePoint {
  x: number;
  y: number;
}

/** What the mouse reads of the world, and how it acts on it. */
export interface CatzMouseWorld {
  /** Its own target point, and where a kind of sprite's is (none where there is none). */
  at: CatzMousePoint;
  kinAt: (kind: number) => CatzMousePoint | undefined;
  /** The cat's global state, its age (brain 11) and `+0x33b8` (the cursor no worry where set). */
  catGlobal: number;
  catAge: number;
  x33b8: number;
  /** The mouse hole covered (`isMouseHoleCovered`: `PetParams` `+0xfe`, or the shelf closed). */
  holeCovered: boolean;
  /** Whether a kind is on the shelf (`XApt::isSpriteInShelf`). */
  shelved: (kind: number) => boolean;
  /** Whether the cheese is held (`CatSprite::IsThisSpriteBeingHeld`, 8). */
  cheeseHeld?: boolean;
  /** A screen saver's, its hole the marker (0x16) at the stage's left, not the mouse hole (0xe). */
  screenSaver?: boolean;
  /** Its layered frames left (`GetLayeredFramesRemaining`). */
  layered: () => number;
  /** Whether it touches a kind (`CollisionDetect`, slot `0x158`). */
  collide: (kind: number) => boolean;
  /** Its script popped (`PopScript`): what it answers, 1 done. */
  pop: () => number;
  /** An action pushed (`PushStoredAction`), layered (`PushLayeredAction`), its script reset (`ResetStack`). */
  push: (action: number) => void;
  layer: (action: number) => void;
  reset: (kind: number) => void;
  /** Words pushed to its script (`PushScriptElements`, slot `0xa4`). */
  words?: (...words: number[]) => void;
  /** Put at its hole's target point (`MoveDrawPt`), hidden, shown. */
  toHole?: (at: CatzMousePoint) => void;
  hide?: () => void;
  show?: () => void;
  /** Its rotation's fudger aimed (`SetAimTarget`). */
  aim?: (heading: number) => void;
  /** The cat's `+0x33bc` cleared, that it may see the mouse again. */
  clearCatSaw?: () => void;
  /** Hung under the cursor, dangling. */
  hang?: () => void;
  /** Dangling: the button down (`PetParams` `+0xa`). */
  pressed?: boolean;
}

/** An angle in 256ths of a turn from `atan2` (seg48:17a2), by the true 2π, rounded toward 0. */
const angle256 = (y: number, x: number) => Math.trunc((Math.atan2(y, x) * 256) / (2 * Math.PI));

/** Within half a turn either way (seg48:1889). */
const wrap128 = (a: number) => {
  while (a < -0x80) a += 0x100;
  while (a > 0x80) a -= 0x100;
  return a;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** The mouse, its fields and its machines. */
export class CatzMouse {
  readonly fields: CatzMouseFields;
  private world!: CatzMouseWorld;
  private random!: (n: number) => number;

  constructor(fields: CatzMouseFields) {
    this.fields = fields;
  }

  /**
   * A tick (`MouseSprite::Update`): its global state's handler and then its
   * own (the brains' drift toward their centres by the clock, and its
   * scruff and size, are not here).
   */
  tick(world: CatzMouseWorld, random: (n: number) => number) {
    this.world = world;
    this.random = random;
    this.dispatchGlobal(false, false);
    this.dispatchOwn(false, false);
  }

  /** One dispatch of a machine, as the trace has it: `own` or `global`, entering and leaving. */
  dispatch(
    machine: 'own' | 'global',
    enter: boolean,
    leave: boolean,
    world: CatzMouseWorld,
    random: (n: number) => number
  ) {
    this.world = world;
    this.random = random;

    if (machine === 'own') {
      this.dispatchOwn(enter, leave);
    } else {
      this.dispatchGlobal(enter, leave);
    }
  }

  private get b() {
    return this.fields.brains;
  }

  private pct() {
    return this.random(101);
  }

  /** `BaseNewState` (seg42:15cc): the old state's leaving, then the new one's entering. */
  private own(state: number) {
    this.dispatchOwn(false, true);
    this.fields.state = state;
    this.dispatchOwn(true, false);
  }

  private globalState(state: number) {
    this.dispatchGlobal(false, true);
    this.fields.global = state;
    this.dispatchGlobal(true, false);
  }

  private dispatchGlobal(enter: boolean, leave: boolean) {
    switch (this.fields.global) {
      case CATZ_MOUSE_GLOBAL.inMouseHole:
        /* `DoGSInMouseHole`, seg26:0000: entered, it waits in its hole. */
        if (enter) {
          this.own(CATZ_MOUSE_STATE.waitInHole);
        }
        return;
      case CATZ_MOUSE_GLOBAL.explore:
        return this.explore(enter, leave);
      case CATZ_MOUSE_GLOBAL.flee:
        return this.flee(leave);
    }
  }

  private dispatchOwn(enter: boolean, leave: boolean) {
    switch (this.fields.state) {
      case CATZ_MOUSE_STATE.waitInHole:
        return this.waitInHole(enter, leave);
      case CATZ_MOUSE_STATE.mightComeOut:
        return this.mightComeOut(enter, leave);
      case CATZ_MOUSE_STATE.locomote:
        return this.locomote(enter, leave);
      case CATZ_MOUSE_STATE.sniffingInterest:
        return this.sniffing(enter, leave);
      case CATZ_MOUSE_STATE.lookAround:
        return this.lookAround(enter, leave);
      case CATZ_MOUSE_STATE.dangling:
        return this.dangling(enter, leave);
      case CATZ_MOUSE_STATE.postDangling:
        return this.postDangling(enter, leave);
      case CATZ_MOUSE_STATE.playDead:
        return this.playDead(leave);
    }
  }

  /** Its hole (`GetMouseHole`, seg26:1d91): the mouse hole (0xe), or a screen saver's marker (0x16). */
  private hole() {
    return this.world.screenSaver ? 0x16 : 0xe;
  }

  private toHole() {
    const at = this.world.kinAt(this.hole());

    if (at) {
      this.world.toHole?.(at);
    }
  }

  /** How far a kind's target point is from its own (`Dist`); none where there is none of it. */
  private distTo(kind: number) {
    const at = this.world.kinAt(kind);
    return at ? catzDist(at, this.world.at) : Infinity;
  }

  /** `IsSpriteTooCloseForComfort` (seg26:15f3): within 100 and half its fear (`MapValue` 100, 150); the cursor never where the cat's `+0x33b8` is set. */
  private tooClose(kind: number) {
    if (kind === 0x17 && this.world.x33b8) {
      return false;
    }

    return this.distTo(kind) < 100 + Math.trunc((this.b[1] * 50) / 100);
  }

  /**
   * `IsMouseInDanger` (seg26:16d5): afraid (fear 50 or more), always; else
   * the cat within 200, with an age of 30 or more, and not in global state
   * 10 or 9 -- and then its fear made 50 to 99, a draw.
   */
  private inDanger() {
    const { world } = this;

    if (this.b[1] < 50) {
      if (catzDist(world.kinAt(0x1d) ?? { x: Infinity, y: 0 }, world.at) > 200) {
        return false;
      }

      if (world.catAge < 30 || world.catGlobal === 0xa || world.catGlobal === 9) {
        return false;
      }

      this.b[1] = clamp(this.random(50) + 50);
    }

    return true;
  }

  /** `TechnicalConstraintsOkay` (seg26:1c01): its hole not covered, the cat not in global state 0x15. */
  private constraintsOk() {
    return !this.world.holeCovered && this.world.catGlobal !== 0x15;
  }

  /** `GetNextCuriosity` (seg26:1b28): up to ten draws for a kind off the shelf; the cursor where none was. */
  private nextCuriosity() {
    let result = 0x17;

    for (let tries = 0, shelved = true; tries < 10 && shelved; tries++) {
      const kind = CURIOSITIES[this.random(15)];
      shelved = kind !== 0x1d && this.world.shelved(kind);

      if (!shelved) {
        result = kind;
      }
    }

    return result;
  }

  /**
   * `ModifyVector` (seg26:1860): the way to a kind's target point (`dir`
   * 1) or away from it, at a length (`SetLength`, seg48:1990: its angle
   * by `atan2`, the engine's cosine and sine times the length over 256,
   * rounded toward 0), added.
   */
  private modify(v: CatzMousePoint, kind: number, dir: number, length: number) {
    const at = this.world.kinAt(kind);

    if (!at) {
      return;
    }

    let [dx, dy] = [at.x - this.world.at.x, at.y - this.world.at.y];

    if (dir !== 1) {
      [dx, dy] = [-dx, -dy];
    }

    if (!dx && !dy) {
      return;
    }

    const a = angle256(dy, dx);
    v.x += Math.trunc((cosine(a, true) * length) / 256);
    v.y += Math.trunc((sine(a, true) * length) / 256);
  }

  /** Waiting in its hole (1; `DoMouseWaitInHole`, seg26:00b0). */
  private waitInHole(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;

    if (enter) {
      f.heading = 0;
      f.done = 0;
      f.count = 0;
      world.push(0x1c);
    }

    if (leave) {
      return;
    }

    if (f.count > 100) {
      f.count = 0;

      if (world.catGlobal === 0x15) {
        return;
      }

      this.toHole();
      b[0] = clamp(b[0] + 5);

      /* The cheese near, off the shelf: less afraid, hungrier. */
      if (this.distTo(8) < 100 && !world.shelved(8)) {
        b[1] = clamp(b[1] - 10);
        b[2] = clamp(b[2] - 5);
      }

      if (this.pct() < 100 - b[2]) {
        f.target = 8;
      } else if (this.pct() < b[3]) {
        f.target = this.nextCuriosity();
      } else {
        f.target = 0;
      }

      if (
        this.pct() < b[0] &&
        this.constraintsOk() &&
        f.target !== 0 &&
        this.pct() < 100 - b[1] &&
        !this.inDanger() &&
        !this.tooClose(0x1d) &&
        !this.tooClose(0x17)
      ) {
        world.reset(2);
        f.heading = 0;
        this.own(CATZ_MOUSE_STATE.mightComeOut);
        return;
      }
    } else {
      f.count++;
    }

    if (world.pop() & 1) {
      if (!f.done) {
        f.done = 1;
        world.hide?.();
      }
    } else if (world.catGlobal !== 0x15) {
      this.toHole();
    }
  }

  /** Might it come out (2; `DoMouseMightComeOut`, seg26:0594). */
  private mightComeOut(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;

    if (enter) {
      f.count = 0;
      f.wait = 0x14;
      f.done = 0;
      f.x9e = -1000;
      this.toHole();
      world.show?.();
      world.push(0x16);
      f.holder = 0;
      world.clearCatSaw?.();
    }

    if (leave) {
      f.x9e = 0;
      return;
    }

    const popped = world.pop();
    this.toHole();

    if (world.holeCovered) {
      world.hide?.();
      world.reset(2);
      this.own(CATZ_MOUSE_STATE.waitInHole);
      return;
    }

    if (f.count >= f.wait) {
      if (this.inDanger() || this.tooClose(0x1d) || (this.tooClose(0x17) && !world.cheeseHeld)) {
        world.reset(1);
        this.own(CATZ_MOUSE_STATE.waitInHole);
        return;
      }

      if (this.pct() < 80 && f.done) {
        world.reset(1);
        this.globalState(CATZ_MOUSE_GLOBAL.explore);
        return;
      }

      f.count = 0;
      f.wait = this.random(b[1] + 10);

      if (this.pct() < b[3] && world.layered() === 0) {
        world.layer(0x15);
      }
    } else {
      f.count++;
    }

    if (popped & 1) {
      f.done = 1;
      world.push(0x16);
      world.pop();
    }
  }

  /**
   * Walking (3; `DoMouseLocomote`, seg26:0cc9): each tick its rotation aimed
   * along the way to what it goes for, at a length by why -- hunger for the
   * cheese, fear for its hole, else curiosity -- and away from the cat and
   * the cursor where they are too close, twice its fear each (and then
   * toward what it goes for only one time in what its fear leaves of 100).
   * Its script done: on a while (30 strides), not making for its hole, it
   * looks around for something else (curious) or goes home; touching its
   * hole, it is in it; touching something else, unthreatened and off the
   * shelf, it sniffs it; else one time in five, the cheese far off, it looks
   * around; else another stride (1, or 0x1e for its hole), restless the less.
   */
  private locomote(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;
    let heading = f.heading;

    if (enter) {
      f.count = 0;
    }

    if (leave) {
      return;
    }

    const popped = world.pop();
    const [length, stride] =
      f.target === 8
        ? [100 - b[2], 1]
        : f.target === 0xe || f.target === 0x16
          ? [b[1], 0x1e]
          : [b[3], 1];
    const away = b[1] * 2;
    const v = { x: 0, y: 0 };
    let threatened = false;

    if (this.tooClose(0x1d)) {
      threatened = true;
      this.modify(v, 0x1d, 2, away);
    }

    if (this.tooClose(0x17)) {
      threatened = true;
      this.modify(v, 0x17, 2, away);
    }

    if (!threatened || this.pct() < 100 - b[1]) {
      this.modify(v, f.target, 1, length);
    }

    if (v.x || v.y) {
      heading = wrap128(angle256(v.y, v.x) - 0x40);
    }

    world.aim?.(heading);

    if (!(popped & 1)) {
      return;
    }

    if (f.count > 30 && stride !== 0x1e) {
      if (b[3] >= 50) {
        f.target = this.nextCuriosity();
        this.own(CATZ_MOUSE_STATE.lookAround);
      } else {
        f.target = this.hole();
        this.own(CATZ_MOUSE_STATE.locomote);
      }

      return;
    }

    if (this.pct() < 50 && world.layered() === 0) {
      world.layer(0x15);
    }

    if (world.collide(f.target)) {
      if (f.target === 0xe || f.target === 0x16) {
        if (world.catAge === 0) {
          b[1] = 100;
        }

        world.reset(1);
        this.globalState(CATZ_MOUSE_GLOBAL.inMouseHole);
        return;
      }

      if (!threatened && !world.shelved(f.target)) {
        this.own(CATZ_MOUSE_STATE.sniffingInterest);
        return;
      }
    } else if (this.hole() !== f.target && this.distTo(8) > 100 && this.pct() < 20) {
      this.own(CATZ_MOUSE_STATE.lookAround);
      return;
    }

    world.push(stride);
    f.count++;
    b[0] = clamp(b[0] - 1);
    world.pop();
  }

  /** Sniffing what it came for (4; `DoMouseSniffingInterest`, seg26:11be). */
  private sniffing(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;

    if (enter) {
      world.push(7);
    }

    if (leave) {
      return;
    }

    const popped = world.pop();

    if (this.tooClose(0x1d) || this.tooClose(0x17) || !world.collide(f.target)) {
      world.reset(1);
      this.own(CATZ_MOUSE_STATE.locomote);
      return;
    }

    if (!(popped & 1)) {
      return;
    }

    if (f.target === 8) {
      /* Eating the cheese, one time in two where nothing layered plays. */
      if (this.pct() < 50 && world.layered() === 0) {
        world.layer(0x1f);
        b[2] = clamp(b[2] + 10);
      }

      if (b[2] >= this.random(30) + 70) {
        f.target = this.nextCuriosity();
        this.own(CATZ_MOUSE_STATE.lookAround);
        return;
      }
    } else {
      b[0] = clamp(b[0] - 5);

      if (this.pct() < 20 && world.layered() === 0) {
        world.layer(0x15);
      }

      if (this.pct() < b[3]) {
        f.target = this.nextCuriosity();
      }

      if (this.pct() < 20) {
        this.own(CATZ_MOUSE_STATE.lookAround);
        return;
      }
    }

    world.push(7);
    world.pop();
  }

  /** Looking around (5; `DoMouseLookAround`, seg26:1441). */
  private lookAround(enter: boolean, leave: boolean) {
    const { world } = this;

    if (enter) {
      world.push(0x1d);
    }

    if (leave) {
      return;
    }

    const popped = world.pop();

    if (this.tooClose(0x1d) || this.tooClose(0x17)) {
      world.reset(1);
      this.own(CATZ_MOUSE_STATE.locomote);
      return;
    }

    if (popped & 1) {
      if (this.pct() < 30) {
        world.push(0x20);
        world.pop();
      } else {
        this.own(CATZ_MOUSE_STATE.locomote);
      }
    }
  }

  /** Dangling (6; `DoMouseDangling`, seg27:131d), held by the cursor or the cat. */
  private dangling(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;

    if (enter) {
      world.words?.(0x753d, f.holder);

      if (f.holder === 0x1d) {
        f.count = 0;
      } else {
        b[1] = clamp(b[1] + 0x2d);
      }

      /* Its rotation's fudger aiming, drifting -4 to -2 (not modelled). */
      this.random(3);
      f.x9e = 5000;
    }

    if (leave) {
      f.x9e = 0;
      return;
    }

    if (f.holder === 0 || (f.holder === 0x17 && (!world.pressed || !f.held))) {
      f.held = 0;
      world.reset(2);
      this.own(CATZ_MOUSE_STATE.postDangling);
      return;
    }

    if (world.pop() & 1) {
      let dead: boolean;

      if (f.holder === 0x17) {
        b[1] = clamp(b[1] + 5);
        dead = false;
      } else if (f.holder === 0x1d) {
        dead = this.random(3) + 2 <= f.count;

        if (!dead) {
          f.count++;
        }
      } else {
        dead = enter;
      }

      if (dead) {
        this.own(CATZ_MOUSE_STATE.playDead);
        return;
      }

      world.push(4);

      if (this.pct() < 50) {
        world.layer(0x15);
      }

      world.pop();
    }

    world.hang?.();
  }

  /** After dangling (7; `DoMousePostDangling`, seg27:15e8): let go, it explores once its script is done. */
  private postDangling(enter: boolean, leave: boolean) {
    const { fields: f, world } = this;

    if (enter) {
      f.holder = 0;
      world.words?.(0x756e);
      world.pop();
    }

    if (leave) {
      return;
    }

    if (world.pop() & 1) {
      this.globalState(CATZ_MOUSE_GLOBAL.explore);
    }
  }

  /** Playing dead (8; `DoMousePlayDead`, seg26:155d), till it is let go. */
  private playDead(leave: boolean) {
    const { fields: f, world } = this;

    if (leave) {
      return;
    }

    const popped = world.pop();

    if (f.holder === 0) {
      this.own(CATZ_MOUSE_STATE.postDangling);
      return;
    }

    if (popped & 1) {
      world.push(0x21);
      world.pop();
    }
  }

  /** Exploring (global 2; `DoGSMouseExplore`, seg26:0bcd). */
  private explore(enter: boolean, leave: boolean) {
    const { fields: f, world, b } = this;

    if (enter) {
      this.own(CATZ_MOUSE_STATE.locomote);
      return;
    }

    if (leave) {
      return;
    }

    if (this.inDanger()) {
      world.reset(2);
      this.globalState(CATZ_MOUSE_GLOBAL.flee);
      return;
    }

    if (b[0] < 10 && this.hole() !== f.target) {
      f.target = this.hole();
      this.own(CATZ_MOUSE_STATE.locomote);
    }
  }

  /** Fleeing (global 3; `DoGSMouseFlee`, seg26:09fb): entering runs as a tick. */
  private flee(leave: boolean) {
    const { fields: f, world } = this;

    if (leave) {
      return;
    }

    const s = f.state;

    if (s === 8 || s === 6 || s === 7) {
      return;
    }

    if (f.holder === 0x1d) {
      world.reset(2);
      world.layer(0xa);
      this.own(CATZ_MOUSE_STATE.dangling);
      return;
    }

    if (this.hole() !== f.target) {
      world.reset(2);
      world.push(0xa);
      f.target = this.hole();
      this.own(CATZ_MOUSE_STATE.locomote);
    }
  }
}
