import {
  fillBall,
  IndexedBitmap,
  random,
  rowWidth,
  speckleColour,
} from '../../src/render/raster.js';

/** A ball's pixels, as rows of characters: `.` nothing, then the colour's own digit. */
function picture(bitmap: IndexedBitmap) {
  const rows: string[] = [];

  for (let y = 0; y < bitmap.height; y++) {
    let row = '';

    for (let x = 0; x < bitmap.width; x++) {
      const index = bitmap.get(x, y);
      row += index === IndexedBitmap.TRANSPARENT ? '.' : String(index);
    }

    rows.push(row);
  }

  return rows;
}

const ball = {
  x: 4,
  y: 4,
  diameter: 6,
  colour: 1,
  outlineColour: 0,
  speckleColour: -1,
  outline: -1,
  fuzz: 0,
};

describe('a circle’s rows', () => {
  it('are as wide as the circle is there', () => {
    // sqrt(d² - (d - 2r)²) for rows 1 to d: the last is empty, as in Dogz's table.
    expect(Array.from({ length: 6 }, (_, row) => rowWidth(6, row + 1))).toEqual([4, 5, 6, 5, 4, 0]);
  });
});

describe('a ball', () => {
  /* Rows of the upper half each have a speckle, which, where a ball has no
   * speckle colour of its own, is its own colour, and may fall one pixel
   * past the row's end: the lower half shows the fill alone. */
  it('is filled flat in its colour, without an outline', () => {
    const bitmap = new IndexedBitmap(9, 9);
    fillBall(bitmap, ball, random(1));

    expect(picture(bitmap).slice(3, 7)).toEqual([
      '.111111..',
      '..11111..',
      '..1111...',
      '.........',
    ]);
  });

  it('with a half outline, has its rows’ leftmost pixels in the outline colour', () => {
    const bitmap = new IndexedBitmap(9, 9);
    fillBall(bitmap, { ...ball, outline: 0 }, random(1));

    expect(picture(bitmap).slice(3, 6)).toEqual(['.011111..', '..01111..', '..0111...']);
  });

  it('with an outline 1 thick, has a whole row at the top and a pixel each side, and no speckles', () => {
    const bitmap = new IndexedBitmap(9, 9);
    fillBall(bitmap, { ...ball, outline: 1, speckleColour: 7 }, random(1));

    expect(picture(bitmap).slice(1, 7)).toEqual([
      '..0000...',
      '..01110..',
      '.011110..',
      '..01110..',
      '..0110...',
      '.........',
    ]);
  });

  it('has a speckle in each row of its upper half, and none below', () => {
    const bitmap = new IndexedBitmap(9, 9);
    fillBall(bitmap, { ...ball, speckleColour: 7 }, random(3));
    const rows = picture(bitmap);
    const speckled = rows.map((row) => row.includes('7'));

    expect(speckled.slice(1, 3)).toEqual([true, true]);
    expect(speckled.slice(4)).not.toContain(true);
  });

  it('shifts each row right by no more than its fuzz', () => {
    for (let seed = 1; seed < 50; seed++) {
      const bitmap = new IndexedBitmap(12, 9);
      fillBall(bitmap, { ...ball, fuzz: 2 }, random(seed));
      const steady = new IndexedBitmap(12, 9);
      fillBall(steady, ball, random(seed));

      picture(bitmap).forEach((row, y) => {
        const shift = row.indexOf('1') - picture(steady)[y].indexOf('1');
        expect(row.indexOf('1') === -1 || (shift >= 0 && shift <= 2)).toBe(true);
      });
    }
  });
});

describe('a speckle colour', () => {
  it('is the ball’s colour reflected within its ramp', () => {
    // Ramps of 6 from 16: the big dog's coat, 130 to 135.
    expect(speckleColour(131, 1, 16, 6)).toBe(134);
    expect(speckleColour(130, 1, 16, 6)).toBe(135);
    expect(speckleColour(135, 1, 16, 6)).toBe(130);
  });

  it('is none for a ball without speckles, and as it was below the ramps', () => {
    expect(speckleColour(131, -1, 16, 6)).toBe(-1);
    expect(speckleColour(15, 0, 16, 6)).toBe(0);
  });

  it('on the 16-colour display, is the colour itself', () => {
    expect(speckleColour(9, 0, 0, 1)).toBe(9);
  });
});
