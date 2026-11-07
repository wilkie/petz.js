import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import { borlandRand } from '../../src/behaviour/random.ts';

/** The brains and centres of the playpen's cat as the 2,000 frames' day began (CATZTRACE.OUT). */
const BRAINS = [12, 49, 96, 86, 69, 88, 1, 30, 0, 49, 0, 7];
const CENTRES = [12, 7, 96, 86, 13, 88, 16, 30, 0, 0, 0, 0];

describe('a Catz cat on its own', () => {
  it('lives 5,000 ticks in an empty pen, idling, having its moments and playing with the cursor, without fault', () => {
    const rand = borlandRand(1);
    const pet = new CatzPet({
      brains: BRAINS,
      centres: CENTRES,
      stage: { left: 0, top: 0, right: 470, bottom: 370 },
      /* Each action played some ten ticks, standing in for the script player. */
      play: () => 10,
      random: (n) => rand() % n,
    });
    const states: Record<number, number> = {};
    const globals: Record<number, number> = {};

    for (let n = 0; n < 5000; n++) {
      const { state, global } = pet.tick();
      states[state] = (states[state] ?? 0) + 1;
      globals[global] = (globals[global] ?? 0) + 1;
    }

    console.log(
      `states ${JSON.stringify(states)}\nglobals ${JSON.stringify(globals)}\nstood in ${JSON.stringify(pet.stoodIn)}`
    );
    /* It runs without fault, idling -- looking at things and passing the
     * time -- and has its moments; the global states it asks whose
     * beginning is not reimplemented (playing, eating, grooming ...) it idles
     * instead, counted. */
    expect(pet.stoodIn.errors).toBe(0);
    expect(pet.stoodIn.deep).toBe(0);
    expect(states[12]).toBeGreaterThan(0);
    expect(states[21]).toBeGreaterThan(0);
    /* And plays with the cursor, stalking and pouncing on it. */
    expect(states[2]).toBeGreaterThan(0);
    expect(states[3]).toBeGreaterThan(0);
  });
});
