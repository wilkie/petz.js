/**
 * The brain: DOGZDLL.DLL's `XBrain` (segments 12 and 13), which chooses the
 * tricks a begging dog does and learns from the treats it is given. It came
 * from a Visual Basic tool, the "Petz Brain Tool", and keeps its shape: list
 * boxes for verbs, objects and desires, and "click" handlers for what it
 * does. See kb/topics/brain.md.
 *
 * Desires are numbers, kept within bounds. What the user does (an input
 * verb, on an object) moves them by the in-effects; the strongest desire of
 * the plain kind is the situation. To think, the brain weighs every output
 * verb and present object by its synapse in that situation and picks one at
 * random by weight. A choice is made real a little later: remembered, with
 * its situation, and its synapse worn down by the entropy. An input verb
 * ending `!` is a lesson: the fall in the situation's desire it brings is
 * the score, and each remembered output of that situation has its synapse
 * raised by the score times the weight for how long ago it was done.
 */

import { type BrainFile } from '../formats/brain.ts';
import { type Rand } from './random.ts';

/** The instinct types a synapse may be, by the letter `PrintBrain` writes: none, low, medium, high, fixed. */
export const INSTINCTS = ':LMH=';

/** How many outputs the brain remembers (`MemOutSize`). */
const MEMORY = 10;

/** Frames from a choice made real to its being let go of (`NullOutVerb`, DS:0x1d6c). */
const NULL_OUT_DELAY = 150;

/** One brain output the engine maps to one of its states (DS:0x1f2c). */
export interface BrainMapping {
  verb: string;
  object: string;
  state: number;

  /** Not 0: the mapping names no state. */
  flag: number;

  /** Frames before the choice is made real (`SetMakeThinkRealDelay`). */
  delay: number;
}

interface Memory {
  situation: number;
  verb: number;
  object: number;
  score: number;
  age: number;
}

/** The plain desires and verbs, as against the moods and their kind, which start `~` (`tokentype`). */
const kind = (name: string) => (name.startsWith('~') ? 1 : 0);

export class Brain {
  readonly file: BrainFile;

  /** Each desire's value (`DesireValue`) and how often it has been moved. */
  readonly desire: number[];
  readonly moved: number[];
  readonly proclivity: number[];

  /** Which objects are present to the brain (`0x1052`). */
  readonly present: boolean[];

  /** Synapses: instinct type and weight, by desire, output verb and object. */
  readonly instinct: number[][][];
  readonly weight: number[][][];

  /** Effects: type and amount, by verb, object and desire. */
  readonly inType: number[][][];
  readonly inAmount: number[][][];
  readonly outType: number[][][];
  readonly outAmount: number[][][];

  /** From 0 to 119, which of the six moods it is in (`HappinessMood`). */
  mood = 0x41;

  memory: Memory[] = [];
  pending: { verb: number; object: number; situation: number } | null = null;

  /** Did the last input teach? Learning after input is on, after output off (`Defaults_Click`). */
  learnAfterInput = true;
  learnAfterOutput = false;

  private currentInVerb = 0;
  private currentObject = 0;
  private currentOutVerb = 0;
  private makeRealIn = -1;
  private nullOutIn = NULL_OUT_DELAY;

  private readonly rand: Rand;
  private readonly map: BrainMapping[];

  constructor(file: BrainFile, map: BrainMapping[], rand: Rand) {
    this.file = file;
    this.map = map;
    this.rand = rand;

    const desires = file.desires.length;
    const grid = (a: number, b: number, c: number) =>
      Array.from({ length: a }, () =>
        Array.from({ length: b }, () => new Array<number>(c).fill(0))
      );

    this.desire = file.desires.map((_, n) => file.desireValues[n] ?? 0);
    this.moved = new Array(desires).fill(0);
    this.proclivity = new Array(desires).fill(0);
    this.present = file.objects.map((name) => name === 'Null');

    this.instinct = grid(desires, file.outputVerbs.length, file.objects.length);
    this.weight = grid(desires, file.outputVerbs.length, file.objects.length);
    this.inType = grid(file.inputVerbs.length, file.objects.length, desires);
    this.inAmount = grid(file.inputVerbs.length, file.objects.length, desires);
    this.outType = grid(file.outputVerbs.length, file.objects.length, desires);
    this.outAmount = grid(file.outputVerbs.length, file.objects.length, desires);

    for (const [d, v, o, type, value] of file.synapses) {
      this.instinct[d][v][o] = type;
      this.weight[d][v][o] = value;
    }

    for (const [d, v, o, type, value] of file.inEffects) {
      this.inType[v][o][d] = type;
      this.inAmount[v][o][d] = value;
    }

    for (const [d, v, o, type, value] of file.outEffects) {
      this.outType[v][o][d] = type;
      this.outAmount[v][o][d] = value;
    }

    this.initBrain();
  }

  /** `initbrain` (seg13:1e8a): content, and only the null object present. */
  private initBrain() {
    this.mood = 0x41;

    for (const name of this.moodNames()) {
      this.setDesireByName(name, 0);
    }

    this.setDesireByName('~Content', 100);
  }

  private moodNames() {
    return ['~Angry', '~Irritated', '~Bored', '~Content', '~Happy', '~Ecstatic'];
  }

  private setDesireByName(name: string, value: number) {
    const d = this.file.desires.indexOf(name);

    if (d >= 0) {
      this.desire[d] = this.peg(d, value);
    }
  }

  /** `PegDesireValue`: within the desire's bounds. */
  private peg(d: number, value: number) {
    const [low, high] = this.file.desireBounds[d] ?? [-100, 1000];
    return Math.min(high, Math.max(low, value));
  }

  /** The instinct weights of `:LMH=`: the last three controls' L, M and H, and nothing for the others. */
  private instinctWeight(type: number) {
    return type >= 1 && type <= 3 ? this.file.globalControls[type] : 0;
  }

  /** The share of its weight a synapse keeps each time it is chosen (`Entropyval`). */
  private entropy() {
    return (100 - this.file.globalControls[0]) / 100;
  }

  /** `situation`: the strongest desire of a kind, the first where they are equal. */
  situation(type = 0) {
    let best = 0;

    this.file.desires.forEach((name, d) => {
      if (kind(name) === type && this.desire[best] < this.desire[d]) {
        best = d;
      }
    });

    return best;
  }

  /**
   * `AffectDesire` (seg13:0000): a desire moved by an effect — added to,
   * or, of type `!`, set — in full where it is the situation or none is
   * given, and otherwise scaled; damped by its proclivity if asked.
   * Returns how far it moved.
   */
  private affect(
    d: number,
    situation: number,
    amount: number,
    type: number,
    scale: number,
    damp: boolean
  ) {
    const now = this.desire[d];
    const full = d === situation || situation === -1;
    let target: number;

    if (type === 1) {
      target = full ? amount : Math.trunc(now + ((amount - now) * scale) / 100);
    } else {
      target = full ? now + amount : Math.trunc(now + (amount * scale) / 100);
    }

    let change = target - now;

    if (damp) {
      change *= 1 - this.proclivity[d];
    }

    const value = this.peg(d, Math.trunc(now + change));
    this.desire[d] = value;
    this.moved[d]++;
    return value - now;
  }

  /** `SetHappinessMood` (seg13:3d76): from 0 to 119, and its mood desire raised as it moves band. */
  private setMood(value: number) {
    const mood = Math.min(0x77, Math.max(0, value));
    const [was, now] = [Math.trunc((this.mood * 6) / 0x78), Math.trunc((mood * 6) / 0x78)];
    this.mood = mood;

    if (was !== now) {
      this.setDesireByName(this.moodNames()[was], 0);
      this.setDesireByName(this.moodNames()[now], 100);
    }
  }

  /**
   * `HowDoYouFeelAboutThis` (seg13:1c6f), the three uses the brain makes of
   * it: the mood moved against an effect on the situation; drawn back
   * towards the middle; and proclivities undecayed.
   */
  private feelEffect(situation: number, amount: number) {
    const threshold = this.file.desireThresholds[situation] || 120;
    this.setMood(this.mood + Math.trunc(-amount / threshold));
  }

  private feelSettle() {
    if (this.mood > 10 + 60) {
      this.setMood(this.mood - 1);
    } else if (this.mood < 60 - 10) {
      this.setMood(this.mood + 1);
    }

    const undecay = this.file.decayDesires[1];
    this.proclivity.forEach((p, d) => (this.proclivity[d] = Math.max(0, p - undecay)));
  }

  /**
   * `ChangeWorldModel` (seg13:02c9): what a verb does to the objects present.
   * Of objects named `[x]Thing`, a verb `[c]...` makes present the one whose
   * x is c and absent the others of the thing, and `[+]` makes its own
   * object present; a plain object is made absent by `[-]`, else present.
   * The engine's learning on objects marked `[a]` is not played: there are
   * none among Dogz's.
   */
  private changeWorldModel(verb: string, object: number) {
    if (!verb.startsWith('[')) {
      return;
    }

    const c = verb[1];
    const name = this.file.objects[object];

    if (name.startsWith('[')) {
      this.file.objects.forEach((other, k) => {
        if (other.startsWith('[') && other.slice(3) === name.slice(3)) {
          this.present[k] = other[1] === c;
        }
      });

      if (c === '+') {
        this.present[object] = true;
      }
    } else {
      this.present[object] = c !== '-';
    }
  }

  /**
   * `inverblist_dblclick` (seg12:079e): what the user did. Every plain
   * desire moves by its in-effect; the world model changes; and a verb
   * ending `!` teaches, by how far the situation's desire fell.
   */
  private input() {
    const v = this.currentInVerb;
    const o = this.currentObject;
    const situation = this.situation();
    let fell = 0;

    this.file.desires.forEach((name, d) => {
      if (kind(name) === 0) {
        const change = this.affect(d, -1, this.inAmount[v][o][d], this.inType[v][o][d], 0, true);

        if (d === situation) {
          fell = change;
        }
      }
    });

    const verb = this.file.inputVerbs[v];
    const learn = verb.endsWith('!') && this.learnAfterInput;

    this.changeWorldModel(verb, o);

    if (learn) {
      this.learnKernel(this.memory[0]?.situation ?? 0, -fell);
    }

    this.feelEffect(situation, this.inAmount[v][o][situation]);
    this.feelSettle();
  }

  /**
   * `LearnKernel` (seg13:234e): each remembered output of the situation has
   * its synapse moved by the score times the weight for its age, over 100,
   * at most the step either way, and kept between 1 and the most a synapse
   * may weigh -- if, as the engine tests it, the synapse for the object
   * `object ? 1 : 0` is not 0. Then any choice not yet made real is
   * forgotten.
   */
  learnKernel(situation: number, score: number) {
    const [most, step] = this.file.moreGlobalControls;
    const weights = this.file.memOutLearnWeights;

    for (const memory of this.memory) {
      if (memory.situation !== situation || memory.age >= weights.length) {
        continue;
      }

      let by = Math.trunc((score * weights[memory.age]) / 100);

      if (by === 0) {
        continue;
      }

      by = Math.max(-step, Math.min(step, by));

      const synapses = this.weight[situation][memory.verb];
      const fixed = INSTINCTS[this.instinct[situation][memory.verb][memory.object]] === '=';
      let value = fixed ? synapses[memory.object] : synapses[memory.object] + by;

      if (synapses[memory.object !== 0 ? 1 : 0] !== 0) {
        value = Math.max(1, Math.min(most, value));
        synapses[memory.object] = value;
      }
    }

    this.pending = null;
  }

  /**
   * `thinkbutton_click` (seg12:1147): a choice of output verb and object,
   * at random by weight: each plain verb with each object present weighs
   * its synapse's weight, plus its instinct weight times the out-effect
   * against the situation, over 100. Returns the engine state the choice
   * maps to, or 0, which is "no opinions".
   */
  think(): number {
    const situation = this.situation();
    const choices: { verb: number; object: number; weight: number }[] = [];
    let total = 0;

    this.file.outputVerbs.forEach((name, v) => {
      if (kind(name) !== 0) {
        return;
      }

      this.file.objects.forEach((_, o) => {
        if (!this.present[o]) {
          return;
        }

        const weight = Math.trunc(
          this.weight[situation][v][o] +
            (this.instinctWeight(this.instinct[situation][v][o]) *
              -this.outAmount[v][o][situation]) /
              100
        );

        if (weight > 0) {
          choices.push({ verb: v, object: o, weight });
          total += weight;
        }
      });
    });

    let pick = this.rand();

    if (total > 0) {
      pick %= total;
    }

    for (const choice of choices) {
      pick -= choice.weight;

      if (pick < 0) {
        if (this.pending) {
          this.makeLastThinkReal();
        }

        this.pending = { verb: choice.verb, object: choice.object, situation };
        return this.output(this.file.outputVerbs[choice.verb], this.file.objects[choice.object]);
      }
    }

    return this.output('NOTHING', 'NOTHING');
  }

  /**
   * What the engine makes of an output: the state its table maps it to
   * (`NativeDDECommandOut`, seg13:057c, and seg15:160b), with when the
   * choice is made real.
   */
  private output(verb: string, object: string) {
    const mapping = this.map.find((entry) => entry.verb === verb && entry.object === object);

    if (!mapping) {
      return 0;
    }

    this.setMakeThinkRealDelay(mapping.delay);
    return mapping.flag === 0 ? mapping.state : 0;
  }

  private setMakeThinkRealDelay(frames: number) {
    if (frames === 0) {
      this.makeLastThinkReal();
      this.makeRealIn = -1;
    } else {
      this.makeRealIn = frames;
    }
  }

  /**
   * `MakeLastThinkReal` (seg12:15ed): the choice is done, so remembered,
   * and, unless fixed, its synapse keeps only the entropy's share of its
   * weight, never less than 1.
   */
  private makeLastThinkReal() {
    const pending = this.pending;

    if (!pending) {
      return;
    }

    this.currentOutVerb = pending.verb;
    this.currentObject = pending.object;
    this.outputMade();

    const { situation, verb, object } = pending;

    if (
      INSTINCTS[this.instinct[situation][verb][object]] !== '=' &&
      this.weight[situation][verb][object] !== 0
    ) {
      const kept = this.weight[situation][verb][object] * this.entropy();
      this.weight[situation][verb][object] = Math.trunc(kept > 1 ? kept : 1);
    }

    this.pending = null;
    this.nullOutIn = NULL_OUT_DELAY;
  }

  /**
   * `OutVerbList_DblClick` (seg12:0b39): an output remembered, newest
   * first, the older a step older; and the desires moved by its out-effects.
   */
  private outputMade() {
    const situation = this.situation();
    const v = this.currentOutVerb;
    const o = this.currentObject;
    let fell = 0;

    this.memory = [
      { situation, verb: v, object: o, score: 0, age: 0 },
      ...this.memory.slice(0, MEMORY - 1).map((memory) => ({ ...memory, age: memory.age + 1 })),
    ];

    this.file.desires.forEach((name, d) => {
      if (kind(name) === 0) {
        const change = this.affect(
          d,
          situation,
          this.outAmount[v][o][d],
          this.outType[v][o][d],
          0,
          false
        );

        if (d === situation) {
          fell = change;
        }
      }
    });

    this.memory[0].score = fell;
    this.changeWorldModel(this.file.outputVerbs[v], o);

    if (this.learnAfterOutput) {
      this.learnKernel(situation, -fell);
    }

    this.feelEffect(situation, this.outAmount[v][o][situation]);
    this.feelSettle();
  }

  /** `NullOutVerb` (seg12:195e): a while after a choice, everything remembered grows older. */
  private nullOutVerb() {
    this.memory = this.memory.map((memory) => ({ ...memory, age: memory.age + 1 }));
    this.feelSettle();
  }

  /**
   * What the engine tells the brain, as `DoCommand_Change` takes it
   * (seg12:0642): an input verb on an object, and then a think. Returns the
   * state the think maps to.
   */
  tell(verb: string, object: string): number {
    const o = this.file.objects.indexOf(object || 'Null');
    const v = this.file.inputVerbs.indexOf(verb);

    if (o !== -1) {
      this.currentObject = o;
    }

    if (v === -1) {
      return 0;
    }

    this.currentInVerb = v;
    this.input();
    return this.think();
  }

  /** `ZeroOutDesires` (seg13:01f0): every desire 0, and a choice not yet made real forgotten. */
  zeroOutDesires() {
    this.desire.fill(0);
    this.pending = null;
  }

  /** `XBrain::Pulse` (seg12:186e), every frame: choices made real, and later let go of, in time. */
  pulse() {
    if (this.makeRealIn === 0) {
      this.makeLastThinkReal();
      this.makeRealIn = -1;
    } else if (this.makeRealIn > 0) {
      this.makeRealIn--;
    }

    if (this.nullOutIn === 0) {
      this.nullOutVerb();
      this.nullOutIn = -1;
    } else if (this.nullOutIn > 0) {
      this.nullOutIn--;
    }
  }

  /** The brain as a file again, with what it has learned (`WriteFile`). */
  toFile(): BrainFile {
    const synapses: BrainFile['synapses'] = [];

    this.weight.forEach((verbs, d) =>
      verbs.forEach((objects, v) =>
        objects.forEach((value, o) => {
          if (value !== 0 || this.instinct[d][v][o] !== 0) {
            synapses.push([d, v, o, this.instinct[d][v][o], value]);
          }
        })
      )
    );

    return { ...this.file, synapses, desireValues: [...this.desire] };
  }
}
