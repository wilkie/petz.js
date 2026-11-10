import type { Dib } from '../../src/formats/dib.ts';
import type { Colour } from '../../src/formats/palette.ts';
import { mapColoursCatz } from '../../src/render/picture.ts';

describe("a Catz picture's colours, mapped as the engine loads it", () => {
  /* A screen with the stage's grey (117) and a nearer one of its own (114), black and white. */
  const screen: Colour[] = [
    [0, 0, 0],
    [114, 114, 114],
    [117, 117, 117],
    [255, 255, 255],
  ];
  const picture = {
    colours: [
      [114, 114, 114],
      [0, 0, 0],
      [250, 250, 250],
    ],
  } as unknown as Dib;

  it('cuts each channel to four bits and takes the screen colour nearest that, not the nearest of all', () => {
    /* (114 to four bits is 7, × 17 is 119: nearer 117 than 114.) */
    expect(mapColoursCatz(picture, screen)).toEqual([2, 0, 3]);
  });
});
