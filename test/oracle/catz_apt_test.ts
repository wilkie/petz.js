import { readFileSync } from 'node:fs';

import {
  aptRestingPictures,
  aptRectOf,
  aptShelfKinds,
  aptTargetOffset,
  parseAptThings,
} from '../../src/formats/apt.ts';
import { parseNe } from '../../src/formats/ne.ts';
import { describeWithOracle } from './with-oracle.ts';

const ENGINE = 'oracle/build/catz-drive-c/WINDOWS/SYSTEM/CATZDLL.DLL';
const describe = describeWithOracle(ENGINE);

/** The shelf's definition (CATZDLL type 32513, 1000): its things read whole, and their pictures by condition. */
describe('the Catz shelf’s things', () => {
  const engine = parseNe(readFileSync(ENGINE));
  const shelf = engine.resources().find(({ type, id }) => type === 32513 && id === 1000)!;
  const things = aptShelfKinds(parseAptThings(new TextDecoder('latin1').decode(shelf.data)));
  const resting = (kind: number, cond: number) =>
    aptRestingPictures(things.get(kind)!, cond).map(({ bitmap }) => bitmap);

  it("reads the shelf's own rectangle (kin 0x22), as the playpen's trace has it", () => {
    expect(aptRectOf(new TextDecoder('latin1').decode(shelf.data), 'shelf')).toEqual({
      left: 34,
      top: 24,
      right: 201,
      bottom: 357,
    });
  });

  it('reads the fifteen things, kinds 1 to 15 in order', () => {
    expect([...things.values()].map(({ name }) => name)).toEqual([
      'Paint Bucket',
      'Spray Bottle',
      'Flea Spray',
      'Catnip',
      'Cat Dancer',
      'Yarn Ball',
      'Jingle Ball',
      'Cheese',
      'Squeaky Toy',
      'Hair Brush',
      'Fish Treat',
      'Food Bowl',
      'Water Bowl',
      'Mouse Hole',
      'Bottle',
    ]);
  });

  it('has the food bowl full to empty (2 to 8), each two pictures; the catnip nibbled (2 to 7)', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map((cond) => resting(12, cond))).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((n) => [12400 + n, 12410 + n])
    );
    expect([2, 3, 4, 5, 6, 7].map((cond) => resting(4, cond))).toEqual(
      [0, 1, 2, 3, 4, 5].map((n) => [4400 + n])
    );
    expect(resting(13, 2)).toEqual([13600, 13601]);
    expect(resting(12, 1)).toEqual([12200]);
  });

  it("puts the food bowl's target point at (40, 65) of its picture in the pen, the middle of (7, 48) to (74, 83)", () => {
    expect(things.get(12)!.rects.get(1)).toEqual([7, 48, 74, 83]);
    expect(aptTargetOffset(things.get(12)!, 1)).toEqual({ x: 40, y: 65 });
  });

  it('has the catnip land once as it is let go (set 1, 14 frames) and loop while it is held (set 3, 12 frames)', () => {
    const catnip = things.get(4)!;
    expect(catnip.conds.get(1)![1].map((frame) => frame[0].bitmap)).toEqual(
      [...Array(14).keys()].map((n) => 4220 + n)
    );
    expect(catnip.conds.get(1)![3]).toHaveLength(12);
    expect([catnip.loops.get(1)![1], catnip.loops.get(1)![3]]).toEqual([false, true]);
  });
});
