import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import { borlandRand } from '../../src/behaviour/random.ts';

/** The brains and centres of the playpen's cat as the 2,000 frames' day began (CATZTRACE.OUT). */
const BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];

describe('a Catz cat on its own', () => {
  it('lives 5,000 ticks in an empty pen, idling, having its moments, playing and climbing, without fault', () => {
    const states: Record<number, number> = {};
    const globals: Record<number, number> = {};

    /* Four days, by C's `rand` from a seed: each without fault, and across them all it does. */
    for (const seed of [1, 2, 3, 4]) {
      const rand = borlandRand(seed);
      const pet = new CatzPet({
        brains: BRAINS,
        centres: CENTRES,
        stage: { left: 0, top: 0, right: 470, bottom: 370 },
        /* The user moving the cursor somewhere else every 300 ticks. */
        cursor: (tick) => ({
          x: 60 + ((Math.trunc(tick / 300) * 137) % 350),
          y: 100 + ((Math.trunc(tick / 300) * 89) % 250),
        }),
        /* Each action played some ten ticks, standing in for the script player. */
        play: () => 10,
        random: (n) => rand() % n,
      });

      for (let n = 0; n < 5000; n++) {
        const { state, global } = pet.tick();
        states[state] = (states[state] ?? 0) + 1;
        globals[global] = (globals[global] ?? 0) + 1;
      }

      console.log(`day ${seed}: stood in ${JSON.stringify(pet.stoodIn)}`);
      expect(pet.stoodIn.errors).toBe(0);
      expect(pet.stoodIn.deep).toBe(0);
    }

    console.log(`states ${JSON.stringify(states)}\nglobals ${JSON.stringify(globals)}`);
    /* Idling -- looking at things and passing the time -- and its moments. */
    expect(states[12]).toBeGreaterThan(0);
    expect(states[21]).toBeGreaterThan(0);
    /* And plays, as the engine begins it; and explores up the stage's
     * edges, might it jump (14), jumping to the edge (15) and crawling up
     * it (16). */
    expect(globals[15]).toBeGreaterThan(0);
    expect(states[14]).toBeGreaterThan(0);
    expect(states[16]).toBeGreaterThan(0);
  });
});
