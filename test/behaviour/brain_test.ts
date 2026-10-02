import { Brain, type BrainMapping } from '../../src/behaviour/brain.ts';
import { borlandRand } from '../../src/behaviour/random.ts';
import { type BrainFile, parseBrain, writeBrain } from '../../src/formats/brain.ts';

/** A brain of two tricks, one desire of each of two treats, and a mood. */
function file(): BrainFile {
  return {
    version: 'v2.0b',
    inputVerbs: ['[w]Throw!', '[+]BringOut*'],
    outputVerbs: ['eTrickA', 'eTrickB'],
    objects: ['Null', '[u]Red', '[w]Red'],
    desires: ['TrickRed', 'TrickBlue', '~Content'],
    synapses: [
      [0, 0, 0, 0, 5],
      [0, 1, 0, 0, 5],
    ],
    inEffects: [
      [0, 1, 1, 1, 500],
      [0, 0, 1, 0, -20],
    ],
    outEffects: [],
    gestalt: 0,
    globalControls: [15, 100, 200, 500, 0, 1, 0],
    moreGlobalControls: [32000, 60],
    decayDesires: [1, 0.05],
    memOutLearnWeights: [100, 20, 5, 5, 1, 1, 1, 1, 1, 1],
    desireValues: [0, 0, 100],
    desireThresholds: [0, 0, 0],
    desireBounds: [
      [-100, 1000],
      [-100, 1000],
      [-100, 1000],
    ],
  };
}

const map: BrainMapping[] = [
  { verb: 'eTrickA', object: 'Null', state: 0x2b, flag: 0, delay: 25 },
  { verb: 'eTrickB', object: 'Null', state: 0x2c, flag: 0, delay: 25 },
];

const pulse = (brain: Brain, frames: number) => {
  for (let n = 0; n < frames; n++) {
    brain.pulse();
  }
};

describe('brain files', () => {
  it('write back as they were read', () => {
    const written = writeBrain(file());
    expect(writeBrain(parseBrain(written))).toEqual(written);
    expect(parseBrain(written).synapses).toEqual(file().synapses);
  });
});

describe('Brain', () => {
  it('sets the desire of the treat brought out, which is then the situation', () => {
    const brain = new Brain(file(), map, borlandRand(1));
    brain.tell('[+]BringOut*', '[u]Red');

    expect(brain.desire[0]).toBe(500);
    expect(brain.situation()).toBe(0);
    expect(brain.present).toEqual([true, true, false]);
  });

  it('chooses a trick, by the map, and wears its synapse down when it is made real', () => {
    const brain = new Brain(file(), map, borlandRand(1));
    const state = brain.tell('[+]BringOut*', '[u]Red');
    const verb = state - 0x2b;

    expect([0x2b, 0x2c]).toContain(state);
    pulse(brain, 26);

    expect(brain.weight[0][verb][0]).toBe(4);
    expect(brain.memory[0]).toMatchObject({ situation: 0, verb, age: 0 });
  });

  it('learns from a treat given: the trick done just before gains the fall in desire', () => {
    const brain = new Brain(file(), map, borlandRand(1));
    const verb = brain.tell('[+]BringOut*', '[u]Red') - 0x2b;
    pulse(brain, 26);

    brain.tell('[w]Throw!', '[u]Red');

    expect(brain.desire[0]).toBe(480);
    expect(brain.weight[0][verb][0]).toBe(4 + 20);
    expect(brain.present).toEqual([true, false, true]);
  });

  it('has no opinion with nothing to weigh', () => {
    const empty = { ...file(), synapses: [] };
    const brain = new Brain(empty, map, borlandRand(1));
    expect(brain.tell('[+]BringOut*', '[u]Red')).toBe(0);
  });
});
