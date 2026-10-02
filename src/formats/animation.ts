/**
 * The animations every breed shares: `ALL_PTZ.BHD`, which says how many
 * balls the skeleton has, how large each is, and where every frame of every
 * animation starts; and one `.BDT` file for each animation, `0.BDT` to
 * `35.BDT`, holding its frames. See kb/formats/bhd.md and kb/formats/bdt.md.
 *
 * All little-endian. A frame is where each ball is, in three dimensions, and
 * nothing of how it looks: that is the breed's (`lnz.ts`).
 */

/** What `ALL_PTZ.BHD` says. */
export interface AnimationHeader {
  /** The header's length in bytes: where the frame table starts. */
  headerSize: number;
  ballCount: number;
  frameCount: number;

  /** Two words before the ball count whose meaning is not yet known. */
  unknown: [number, number];

  /**
   * Six words after the frame count: the least x, y, z of every frame's
   * bounds, then the greatest -- all the frames' bounds together.
   */
  bounds: [number, number, number, number, number, number];

  /** Each ball's diameter in the skeleton, before a breed's differences. */
  ballSizes: number[];

  /** Each animation, as the first frame and one past the last, numbered over all of them. */
  animations: { start: number; end: number }[];

  /** Each frame's byte offset in its animation's `.BDT` file. */
  frameOffsets: number[];
}

/** One ball's place in a frame. */
export interface BallPosition {
  x: number;
  y: number;
  z: number;
}

/** One frame of an animation. */
export interface Frame {
  /**
   * The least x, y, z the frame's balls reach, then the greatest: each ball's
   * centre less, or plus, half its skeleton size rounded down.
   */
  bounds: [number, number, number, number, number, number];

  /** A word after the bounds whose meaning is not yet known. */
  tag: number;
  balls: BallPosition[];

  /** A few balls a frame says something more of, each with a signed byte; not yet known what. */
  extras: { ball: number; value: number }[];

  /** The frame's length in its file. */
  length: number;
}

const BALL_SIZES = 0x1c;
const ANIMATION_COUNT = 0x1fc;

/** Reads `ALL_PTZ.BHD`. */
export function parseBhd(data: Uint8Array): AnimationHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const word = (offset: number) => view.getInt16(offset, true);

  const headerSize = word(0);
  const ballCount = word(6);
  const frameCount = word(8);

  if (headerSize + frameCount * 4 !== data.byteLength) {
    throw new Error(
      `a ${data.byteLength}-byte BHD with a ${headerSize}-byte header cannot hold ${frameCount} frames`
    );
  }

  const ballSizes = Array.from({ length: ballCount }, (_, ball) => word(BALL_SIZES + 2 * ball));
  const count = word(ANIMATION_COUNT);
  const animations: { start: number; end: number }[] = [];
  let start = 0;

  for (let index = 0; index < count; index++) {
    const end = word(ANIMATION_COUNT + 2 + 2 * index);
    animations.push({ start, end });
    start = end;
  }

  if (start !== frameCount) {
    throw new Error(`the animations end at frame ${start}, but the header counts ${frameCount}`);
  }

  return {
    headerSize,
    ballCount,
    frameCount,
    unknown: [word(2), word(4)],
    bounds: [word(10), word(12), word(14), word(16), word(18), word(20)],
    ballSizes,
    animations,
    frameOffsets: Array.from({ length: frameCount }, (_, frame) =>
      view.getUint32(headerSize + 4 * frame, true)
    ),
  };
}

/** The fixed part of a frame: twelve bytes of bounds, a word, and then the balls. */
const FRAME_BALLS = 14;

/** Reads the frame at `offset` of a `.BDT` file. */
export function parseFrame(data: Uint8Array, offset: number, ballCount: number): Frame {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const word = (at: number) => view.getInt16(offset + at, true);
  const count = data[offset + FRAME_BALLS + 6 * ballCount];
  const length = FRAME_BALLS + 6 * ballCount + 1 + 2 * count;

  if (offset + length > data.byteLength) {
    throw new Error(`the frame at ${offset} runs past the end of its file`);
  }

  return {
    bounds: [word(0), word(2), word(4), word(6), word(8), word(10)],
    tag: word(12),
    balls: Array.from({ length: ballCount }, (_, ball) => ({
      x: word(FRAME_BALLS + 6 * ball),
      y: word(FRAME_BALLS + 6 * ball + 2),
      z: word(FRAME_BALLS + 6 * ball + 4),
    })),
    extras: Array.from({ length: count }, (_, index) => {
      const at = offset + FRAME_BALLS + 6 * ballCount + 1 + 2 * index;
      return { ball: data[at], value: view.getInt8(at + 1) };
    }),
    length,
  };
}

/** Every frame of one animation, from its `.BDT` file. */
export function parseAnimation(header: AnimationHeader, index: number, data: Uint8Array): Frame[] {
  const { start, end } = header.animations[index];

  return header.frameOffsets
    .slice(start, end)
    .map((offset) => parseFrame(data, offset, header.ballCount));
}
