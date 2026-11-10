import { type Colour, catzTranslation, vgaShown } from '../../src/formats/palette.ts';
import { catzShade } from '../../src/render/ballz.ts';

describe('Catz’s depth shading', () => {
  it('moves a colour along its ramp of ten from 28, and no further than its ends', () => {
    expect(catzShade(32, 3)).toBe(35);
    expect(catzShade(32, 6)).toBe(37);
    expect(catzShade(32, -6)).toBe(28);
    expect(catzShade(45, 4)).toBe(47);
  });

  it('leaves the colours below the ramps as they are', () => {
    expect(catzShade(15, 6)).toBe(15);
  });
});

describe('Catz’s colour translation', () => {
  /* A palette of greys, so each colour's nearest is plain. */
  const palette: Colour[] = Array.from({ length: 256 }, (_, n) => [n, n, n]);
  const translate = catzTranslation(palette);

  it('turns a colour to the screen’s nearest to it in four bits a channel', () => {
    /* 0x35 cut to 0x30, and 0x33 is nearest it: colour 51. */
    expect(translate(0x35)).toBe(0x33);
  });

  it('collapses the shades four bits cannot tell apart', () => {
    expect(translate(0x41)).toBe(translate(0x4e));
  });
});

describe("the VGA's six bits a channel, as the oracle's screens show Catz's colours", () => {
  it('shows each channel as its top six bits, d, made (d << 2) | (d >> 4)', () => {
    const greys = [118, 114, 110, 103, 83, 128, 64, 192, 255, 0];
    expect(vgaShown(greys.map((v): Colour => [v, v, v])).map(([v]) => v)).toEqual([
      117, 113, 109, 101, 81, 130, 65, 195, 255, 0,
    ]);
  });
});
