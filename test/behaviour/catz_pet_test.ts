import { CatzPet } from '../../src/behaviour/catz-pet.ts';
import { CATZ_BASKET_HITS } from '../../src/behaviour/catz-states.ts';
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

describe('a Catz cat told of the pen’s things', () => {
  /* The food bowl put in the pen, the playpen telling it so: taken out (1), then let go (2). Over ten days, it reads each, and answers some. */
  it('reads the playpen’s messages and answers them', () => {
    const answers: Record<string, number> = {};

    for (let seed = 1; seed <= 10; seed++) {
      const rand = borlandRand(seed);
      const pet = new CatzPet({
        brains: BRAINS,
        centres: CENTRES,
        stage: { left: 0, top: 0, right: 470, bottom: 370 },
        pen: () => new Map([[0xc, { x: 300, y: 300 }]]),
        play: () => 10,
        random: (n) => rand() % n,
      });

      for (let n = 0; n < 100; n++) {
        pet.tick();
      }

      pet.notify(0xc, 1, 3, true);
      expect(pet.x33c0).toBe(1);
      pet.tick();
      expect(pet.x33c0).toBe(0);
      pet.notify(0xc, 1, 1, false);
      expect(pet.x33c0).toBe(2);
      const { state, global } = pet.tick();
      expect(pet.x33c0).toBe(0);
      answers[`${global}/${state}`] = (answers[`${global}/${state}`] ?? 0) + 1;
      expect(pet.stoodIn.errors).toBe(0);
    }

    console.log(`after the food bowl: ${JSON.stringify(answers)}`);
    /* Some go to eat it (3), play with it (15) or ignore it (12). */
    expect(Object.keys(answers).some((key) => /^(3|15|12)\//.test(key))).toBe(true);
  });
});

describe('a Catz kitten in the Adoption Kit', () => {
  /* Its baskets, each a breed: it begins, sits in one, peeks, and with the cursor about now and then, comes out; clicked, its own basket sends it back. */
  it('begins, peeks from its baskets, comes out and goes back', () => {
    const states: Record<number, number> = {};
    const remade: number[] = [];

    for (const seed of [1, 2, 3]) {
      const rand = borlandRand(seed);
      let tick = 0;
      const pet = new CatzPet({
        brains: BRAINS,
        centres: CENTRES,
        stage: { left: 0, top: 0, right: 640, bottom: 480 },
        kit: { origin: { x: 0, y: 0 }, ca: 1 },
        cursorAbout: () => tick % 400 < 20,
        remade: (basket) => {
          remade.push(basket);
          return undefined;
        },
        play: () => 10,
        random: (n) => rand() % n,
      });

      for (; tick < 3000; tick++) {
        /* Out, its own basket clicked now and then. */
        if (tick % 700 === 600 && pet.kit && pet.global !== 22) {
          pet.leave(0x16 + pet.kit.basket);
        }

        const { state } = pet.tick();
        states[state] = (states[state] ?? 0) + 1;
      }

      expect(pet.stoodIn.errors).toBe(0);
      expect(pet.stoodIn.deep).toBe(0);
    }

    console.log(`in the Kit: ${JSON.stringify(states)}; made as baskets ${remade}`);
    /* Begun (72), in its baskets (73), peeking (74), out of one (76), jumping back in (77). */
    for (const state of [72, 73, 74, 76, 77]) {
      expect(states[state]).toBeGreaterThan(0);
    }
    expect(remade.length).toBeGreaterThan(0);
  });
  /* `BasketHitTest`: a basket pressed is held and highlighted; let go in it, its message; elsewhere, nothing. */
  it('has its baskets pressed and let go, as the playpen hits them', () => {
    const rand = borlandRand(5);
    const pet = new CatzPet({
      brains: BRAINS,
      centres: CENTRES,
      stage: { left: 0, top: 0, right: 640, bottom: 480 },
      kit: { origin: { x: 0, y: 40 }, ca: 1 },
      play: () => 10,
      random: (n) => rand() % n,
    });
    const middle = (n: number) => {
      const box = CATZ_BASKET_HITS[n];
      return { x: (box.left + box.right) >> 1, y: ((box.top + box.bottom) >> 1) + 40 };
    };
    const none = { x: 5, y: 5 };

    for (let tick = 0; tick < 50 && ![73, 74, 75].includes(pet.state); tick++) {
      pet.tick();
    }
    const own = pet.kit!.basket;
    const other = (own + 2) % 5;

    /* Another basket pressed: held (0xb + n), highlighted. */
    expect(pet.basketHitTest({ down: true, downAt: middle(other), upAt: none })).toBe(false);
    expect(pet.kit!.rootCount).toBe(0xb + other);
    expect(pet.kitHighlight).toBe(other);

    /* Let go elsewhere: none held, hidden, no message. */
    pet.basketHitTest({ down: false, downAt: middle(other), upAt: none });
    expect(pet.kit!.rootCount).toBe(0);
    expect(pet.kitHighlight).toBe(-1);

    /* Pressed and let go in it: its message, and the kitten changes to it and climbs out of it. */
    pet.basketHitTest({ down: true, downAt: middle(other), upAt: none });
    pet.basketHitTest({ down: false, downAt: middle(other), upAt: middle(other) });
    expect(pet.kit!.rootCount).toBe(0);
    expect(pet.kitHighlight).toBe(other);
    const seen: number[] = [];

    for (let tick = 0; tick < 200 && pet.state !== 76; tick++) {
      seen.push(pet.tick().state);
    }
    expect(pet.state).toBe(76);
    expect(pet.kit!.basket).toBe(other);
    expect(pet.kitHighlight).toBe(-1);

    /* Its own basket pressed climbing out: lit, and let go, only words (0x2a). */
    expect(pet.basketHitTest({ down: true, downAt: middle(other), upAt: none })).toBe(true);
    pet.basketHitTest({ down: false, downAt: middle(other), upAt: middle(other) });
    expect((pet as unknown as { x33c0: number }).x33c0).toBe(0x2a);
  });
});
