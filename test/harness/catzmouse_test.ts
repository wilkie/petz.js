/**
 * The playpen's mouse held to the engine: the pen harness's mouse day
 * (`TRACE_MICE=1 TRACE_FRAMES=1500`, `CATZTRACE-MICE-1500.OUT`, written by
 * test/harness/catzpen_test.ts) replayed through `CatzMouse` -- each
 * dispatch of either of its machines the engine made, not within another,
 * from its fields as the engine had them, C's `rand` from its seed, each
 * pop of its script answering as the engine's did and leaving `rand` where
 * it left it (its scripts' draws are the timeline's), and each collision it
 * tests answered as the engine's. Then its fields and `rand` after.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CatzMouse,
  type CatzMouseFields,
  type CatzMouseWorld,
} from '../../src/behaviour/catz-mouse.ts';

/* `TRACE_MICE=2`: the day with the cheese out and the mouse picked up (`CATZTRACE-MICE-HELD-1500.OUT`). */
const TRACE = join(
  'oracle/build/harness',
  process.env.TRACE_MICE === '2' ? 'CATZTRACE-MICE-HELD-1500.OUT' : 'CATZTRACE-MICE-1500.OUT'
);
const run = existsSync(TRACE) ? describe : describe.skip;

/** A mouse line's fields, from where its seed is. */
function fieldsOf(values: number[]) {
  const [seed, global, state, count, target, holder, done, wait, heading, x9e, ...rest] = values;
  const brains = rest.slice(0, 4);
  const [
    mx,
    my,
    cx,
    cy,
    catGlobal,
    catAge,
    x33b8,
    xfe,
    ux,
    uy,
    hx,
    hy,
    shelved,
    layered,
    xfc,
    button,
  ] = rest.slice(4);
  return {
    seed: BigInt(seed),
    fields: { state, global, count, target, holder, done, wait, heading, x9e, brains },
    at: { x: mx, y: my },
    cat: { x: cx, y: cy },
    cursor: { x: ux, y: uy },
    cheese: { x: hx, y: hy },
    catGlobal,
    catAge,
    x33b8,
    xfe,
    shelved,
    layered,
    /* Held by the user (`+0xfc`) and the button down, where the trace has them; else taken as held while the cursor holds it. */
    held: xfc ?? (holder === 0x17 ? 1 : 0),
    pressed: button === undefined ? holder === 0x17 : button !== 0,
  };
}

run('the playpen’s mouse, held to CATZDLL.DLL', () => {
  it('ticks each of its machines as the engine does', () => {
    const lines = readFileSync(TRACE, 'latin1').split(/\r?\n/);
    /* Its hole: where it is put waiting in it. */
    const first = lines.find((line) => line.startsWith('mtick o'))!.split(' ');
    const hole = { x: Number(first[18]), y: Number(first[19]) };
    const wrong: string[] = [];
    const held: Record<string, number> = {};

    for (let n = 0; n < lines.length; n++) {
      const line = lines[n].split(' ');

      if (line[0] !== 'mtick') {
        continue;
      }

      /* The dispatch's span: to its own `mticked`, others within. */
      const [, machine, enter, leave] = line;
      const before = fieldsOf(line.slice(4).map(Number));
      const pops: {
        before: bigint;
        answer: number;
        after: bigint;
        at?: { x: number; y: number };
      }[] = [];
      const collisions: { kind: number; answer: number }[] = [];
      let depth = 1;
      let end = n + 1;

      for (; end < lines.length && depth; end++) {
        const each = lines[end].split(' ');

        if (each[0] === 'mtick') {
          depth++;
        } else if (each[0] === 'mticked') {
          depth--;
        } else if (each[0] === 'mpop') {
          pops.push({
            before: BigInt(each[1]),
            answer: Number(each[2]),
            after: BigInt(each[3]),
            at: each[4] === undefined ? undefined : { x: Number(each[4]), y: Number(each[5]) },
          });
        } else if (each[0] === 'mcollide') {
          collisions.push({ kind: Number(each[1]), answer: Number(each[2]) });
        }
      }

      const after = lines[end - 1].split(' ');

      if (after[0] !== 'mticked') {
        break;
      }

      const expected = fieldsOf(after.slice(2).map(Number));
      let state = before.seed;
      const off: string[] = [];
      const random = (m: number) => {
        state = (state * 22695477n + 1n) & 0xffffffffn;
        return Number((state >> 16n) & 0x7fffn) % m;
      };
      const kinds: Record<number, { x: number; y: number }> = {
        0x1d: before.cat,
        0x17: before.cursor,
        8: before.cheese,
        0xe: hole,
      };
      const world: CatzMouseWorld = {
        at: before.at,
        kinAt: (kind) => kinds[kind],
        catGlobal: before.catGlobal,
        catAge: before.catAge,
        x33b8: before.x33b8,
        holeCovered: before.xfe !== 0,
        pressed: before.pressed,
        shelved: (kind) => kind < 16 && (before.shelved & (1 << kind)) !== 0,
        layered: () => before.layered,
        collide: (kind) => {
          const next = collisions.shift();

          if (!next || next.kind !== kind) {
            off.push(`collide ${kind}, engine ${next?.kind}`);
          }

          return !!next?.answer;
        },
        pop: () => {
          const next = pops.shift();

          if (!next) {
            off.push('popped once more');
            return 0;
          }

          if (next.before !== state) {
            off.push(`rand at a pop ${state}, engine ${next.before}`);
          }

          state = next.after;

          /* Popped, it is placed by its new frame: where the pop left it, or, the last, where the dispatch ends. */
          world.at = next.at ?? (pops.length ? world.at : expected.at);
          return next.answer;
        },
        push: () => {},
        layer: () => {},
        reset: () => {},
      };
      const fields: CatzMouseFields = { ...structuredClone(before.fields), held: before.held };
      const mouse = new CatzMouse(fields);
      mouse.dispatch(
        machine === 'o' ? 'own' : 'global',
        enter === '1',
        leave === '1',
        world,
        random
      );

      if (pops.length) {
        off.push(`${pops.length} pops fewer`);
      }

      if (collisions.length) {
        off.push(`${collisions.length} collisions fewer`);
      }

      if (state !== expected.seed) {
        off.push(`rand ${state}, engine ${expected.seed}`);
      }

      for (const key of [
        'state',
        'global',
        'count',
        'target',
        'holder',
        'done',
        'wait',
        'x9e',
      ] as const) {
        if (fields[key] !== expected.fields[key]) {
          off.push(`${key} ${fields[key]}, engine ${expected.fields[key]}`);
        }
      }

      if (fields.brains.join() !== expected.fields.brains.join()) {
        off.push(`brains ${fields.brains}, engine ${expected.fields.brains}`);
      }

      const key = `${machine} ${before.fields.global}/${before.fields.state}`;
      held[key] = (held[key] ?? 0) + 1;

      if (off.length) {
        wrong.push(
          `line ${n + 1} ${machine} ${before.fields.global}/${before.fields.state} enter ${enter} leave ${leave}: ${off.join('; ')}`
        );
      }

      n = end - 1;
    }

    console.log(
      `held ${JSON.stringify(held)}\n${wrong.length} wrong\n${wrong.slice(0, 30).join('\n')}`
    );
    expect(Object.keys(held).length).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});
