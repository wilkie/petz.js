import {
  bottomUpFromWinIni,
  findDog,
  HAND,
  HEIGHT,
  score,
  shown,
  WIDTH,
} from '../../scripts/oracle/match.ts';

/** A screen of magenta ground in the playpen's place, grey elsewhere, with rectangles painted on. */
function screen(
  ...paint: { left: number; top: number; right: number; bottom: number; rgb: number[] }[]
) {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const inPlaypen = x >= 160 && x < 636 && y >= 20 && y < 476;
      rgb.set(inPlaypen ? [255, 0, 255] : [195, 195, 195], 3 * (y * WIDTH + x));
    }
  }

  for (const { left, top, right, bottom, rgb: colour } of paint) {
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        rgb.set(colour, 3 * (y * WIDTH + x));
      }
    }
  }

  return rgb;
}

const BROWN = [130, 40, 4];
const dog = { left: 400, top: 300, right: 469, bottom: 349, rgb: BROWN };
const hand = { left: 310, top: 225, right: 330, bottom: 245, rgb: [255, 255, 255] };
const panel = { left: 108, top: 38, right: 263, bottom: 306, rgb: [195, 195, 195] };

describe('matching a drawing against the oracle', () => {
  it('shows colours as the VGA does, six bits a channel', () => {
    expect([0, 128, 192, 198, 255].map(shown)).toEqual([0, 130, 195, 199, 255]);
  });

  it('finds the dog: the largest patch on the ground that is not a window, not the hand', () => {
    const found = findDog(screen(dog, hand, panel))!;

    expect(found.box).toEqual({ left: 400, top: 300, right: 469, bottom: 349 });
    expect(found.count).toBe(70 * 50);
    expect(found.hidden).toEqual([HAND, { left: 160, top: 38, right: 263, bottom: 306 }]);
    expect(found.cut).toEqual({ left: false, top: false, right: false, bottom: false });
  });

  it('leaves out what is under the hand, so a dog touching it is still the dog', () => {
    const found = findDog(screen(hand, { ...dog, left: 342, right: 420, top: 230, bottom: 280 }))!;

    expect(found.box).toEqual({ left: 342, top: 230, right: 420, bottom: 280 });
  });

  it('knows a dog cut off by the playpen’s edge', () => {
    expect(findDog(screen({ ...dog, left: 560, right: 635 }))!.cut).toEqual({
      left: false,
      top: false,
      right: true,
      bottom: false,
    });
  });

  it('finds nothing on a screen without the playpen', () => {
    expect(findDog(new Uint8Array(WIDTH * HEIGHT * 3))).toBeNull();
  });

  it('counts the pixels drawn otherwise, drawn where the dog is not, and the dog’s not drawn', () => {
    const found = findDog(screen(dog))!;
    const brown = (BROWN[0] << 16) | (BROWN[1] << 8) | BROWN[2];
    /* The dog's top row, drawn 100 to the left and up, and one pixel in another colour. */
    const at = Int32Array.from({ length: 70 }, (_, n) => 200 * WIDTH + 300 + n);
    const colour = Int32Array.from({ length: 70 }, (_, n) => (n === 0 ? 0 : brown));

    expect(score(found, { at, colour }, 100, 100)).toEqual({
      same: 69,
      differ: 1,
      extra: 0,
      missing: 70 * 49,
      wrong: 1 + 70 * 49,
    });
    expect(score(found, { at, colour }, 100, 99).extra).toBe(70);
  });
});

describe('the screen bitmap’s orientation', () => {
  const timing = (date: string, flag: string) =>
    `svga256.drv640x480x8(0,12)v4.0.0.52490-${date}-1.0.0.37=ECHGECHGZZZZFFFFDDFF${flag}F`;

  it('is as WinG’s newest timing of the display says: 0 bottom-up, 1 top-down', () => {
    expect(
      bottomUpFromWinIni(`[WinG]\r\n${timing('5D42', '0')}\r\n${timing('5D43', '1')}\r\n`)
    ).toBe(false);
    expect(
      bottomUpFromWinIni(`[WinG]\r\n${timing('5D43', '0')}\r\n${timing('5D42', '1')}\r\n`)
    ).toBe(true);
  });

  it('is bottom-up where WinG has not timed the display', () => {
    expect(bottomUpFromWinIni('[windows]\r\n')).toBe(true);
  });
});
