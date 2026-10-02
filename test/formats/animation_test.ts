import { parseAnimation, parseBhd, parseFrame } from '../../src/formats/animation.js';

/**
 * A small BHD and BDT built byte by byte to the layout kb/formats/bhd.md and
 * bdt.md describe: two balls, two animations of one and two frames.
 */
function bhd(ballSizes: number[], ends: number[], offsets: number[]) {
  const headerSize = 0x1fe + 2 * ends.length;
  const data = new Uint8Array(headerSize + 4 * offsets.length);
  const view = new DataView(data.buffer);

  view.setInt16(0, headerSize, true);
  view.setInt16(2, 14, true);
  view.setInt16(4, 10, true);
  view.setInt16(6, ballSizes.length, true);
  view.setInt16(8, offsets.length, true);
  [-1, -2, -3, 4, 5, 6].forEach((value, index) => view.setInt16(10 + 2 * index, value, true));
  ballSizes.forEach((size, ball) => view.setInt16(0x1c + 2 * ball, size, true));
  view.setInt16(0x1fc, ends.length, true);
  ends.forEach((end, index) => view.setInt16(0x1fe + 2 * index, end, true));
  offsets.forEach((offset, frame) => view.setUint32(headerSize + 4 * frame, offset, true));

  return data;
}

function frame(balls: [number, number, number][], extras: [number, number][] = [], tag = 0) {
  const data = new Uint8Array(14 + 6 * balls.length + 1 + 2 * extras.length);
  const view = new DataView(data.buffer);

  [-10, -20, -30, 10, 20, 30].forEach((value, index) => view.setInt16(2 * index, value, true));
  view.setInt16(12, tag, true);
  balls.forEach(([x, y, z], ball) => {
    view.setInt16(14 + 6 * ball, x, true);
    view.setInt16(16 + 6 * ball, y, true);
    view.setInt16(18 + 6 * ball, z, true);
  });
  data[14 + 6 * balls.length] = extras.length;
  extras.forEach(([ball, value], index) => {
    data[15 + 6 * balls.length + 2 * index] = ball;
    view.setInt8(16 + 6 * balls.length + 2 * index, value);
  });

  return data;
}

describe('ALL_PTZ.BHD', () => {
  it('reads the ball sizes, the animations and every frame offset', () => {
    const header = parseBhd(bhd([12, 40], [1, 3], [0, 0, 27]));

    expect(header.ballCount).toBe(2);
    expect(header.frameCount).toBe(3);
    expect(header.ballSizes).toEqual([12, 40]);
    expect(header.bounds).toEqual([-1, -2, -3, 4, 5, 6]);
    expect(header.animations).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
    expect(header.frameOffsets).toEqual([0, 0, 27]);
  });

  it('refuses a file whose size does not fit its frame count', () => {
    const data = bhd([12], [1], [0]);
    expect(() => parseBhd(data.subarray(0, data.length - 1))).toThrow(/cannot hold/);
  });

  it('refuses animations that do not end at the frame count', () => {
    expect(() => parseBhd(bhd([12], [1], [0, 0]))).toThrow(/end at frame 1/);
  });
});

describe('a BDT frame', () => {
  it('is bounds, a word, each ball, then a count and that many pairs', () => {
    const data = frame(
      [
        [1, -2, 3],
        [-400, 500, -600],
      ],
      [[1, -10]],
      3
    );
    const parsed = parseFrame(data, 0, 2);

    expect(parsed.bounds).toEqual([-10, -20, -30, 10, 20, 30]);
    expect(parsed.tag).toBe(3);
    expect(parsed.balls).toEqual([
      { x: 1, y: -2, z: 3 },
      { x: -400, y: 500, z: -600 },
    ]);
    expect(parsed.extras).toEqual([{ ball: 1, value: -10 }]);
    expect(parsed.length).toBe(data.length);
  });

  it('refuses a frame that runs past its file', () => {
    const data = frame([[0, 0, 0]], [[0, 1]]);
    expect(() => parseFrame(data.subarray(0, data.length - 1), 0, 1)).toThrow(/past the end/);
  });

  it('is read for each of an animation’s frames, at the offsets the header gives', () => {
    const first = frame([[1, 1, 1]]);
    const second = frame([[2, 2, 2]], [[0, 5]]);
    const data = new Uint8Array([...first, ...second]);
    const header = parseBhd(bhd([12], [1, 3], [0, 0, first.length]));

    expect(parseAnimation(header, 1, data).map((parsed) => parsed.balls[0].x)).toEqual([1, 2]);
  });
});
