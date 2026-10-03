import {
  drawLine,
  fillBall,
  fillLid,
  fillShaded,
  IndexedBitmap,
  random,
  rowWidth,
  speckleColour,
} from '../../src/render/raster.ts';

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

describe('an eyelid', () => {
  /* A ball of 11 at (20, 20), covered 4 rows' worth, by the angle given. */
  const lid = (angle: number) => {
    const bitmap = new IndexedBitmap(40, 40);
    fillLid(bitmap, { x: 20, y: 20, d: 11, colour: 4, cover: 4, angle });
    const rows: string[] = [];

    for (let y = 15; y < 27; y++) {
      let row = '';

      for (let x = 14; x < 27; x++) {
        row += bitmap.get(x, y) === 4 ? '#' : '.';
      }

      rows.push(row);
    }

    return rows;
  };
  const covered = (rows: string[]) => rows.map((row) => row.includes('#'));

  it('covers the top rows, less one, when level', () => {
    expect(covered(lid(0))).toEqual([...Array(3).fill(true), ...Array(9).fill(false)]);
    expect(lid(2)).toEqual(lid(0));
  });

  it('covers the bottom rows, less two, upside down', () => {
    const rows = covered(lid(128));
    expect(rows.filter(Boolean)).toHaveLength(2);
    expect(rows.slice(0, 6).some(Boolean)).toBe(false);
  });

  it('covers one side when turned a quarter, by the angle’s sign', () => {
    const right = lid(64).join('');
    const left = lid(-64).join('');

    expect(right).toContain('#');
    expect(left).toContain('#');

    /* Each row's covered pixels are at its right end, or its left. */
    for (const row of lid(64).filter((row) => row.includes('#'))) {
      expect(row.lastIndexOf('#')).toBeGreaterThan(row.indexOf('#') - 1);
      expect(row.indexOf('#')).toBeGreaterThan(6);
    }

    for (const row of lid(-64).filter((row) => row.includes('#'))) {
      expect(row.lastIndexOf('#')).toBeLessThan(6);
    }
  });
});

describe('a shining ball', () => {
  it('is shaded from the ramp’s eighth colour at the top to its first, which fills the rest', () => {
    const bitmap = new IndexedBitmap(40, 40);
    fillShaded(bitmap, { x: 20, y: 20, diameter: 20, fuzz: 0 }, 164, () => 0);
    const rows = Array.from({ length: 20 }, (_, r) => bitmap.get(20, 10 + r));

    /* The top 0.3 of 20 rows, 6, step down a quarter turn by 64 / 6 = 10. */
    expect(rows.slice(0, 7)).toEqual([171, 171, 171, 169, 168, 166, 164]);
    expect(rows.slice(7, 19).every((colour) => colour === 164)).toBe(true);
  });
});

describe('a line', () => {
  const rows = (bitmap: IndexedBitmap, top: number, bottom: number) =>
    Array.from({ length: bottom - top }, (_, r) =>
      Array.from({ length: bitmap.width }, (_, x) => {
        const pixel = bitmap.get(x, top + r);
        return pixel === IndexedBitmap.TRANSPARENT ? '.' : String(pixel);
      }).join('')
    );

  it('is filled between edges its width out either side, black at each end of a row', () => {
    const bitmap = new IndexedBitmap(16, 12);
    drawLine(bitmap, { x: 3, y: 5 }, { x: 12, y: 5 }, 2, 2, 7);

    /* Corners at y 3 and 7: rows 3 to 6, the last corner's row not drawn. */
    expect(rows(bitmap, 2, 8)).toEqual([
      '................',
      '...0777777770...',
      '...0777777770...',
      '...0777777770...',
      '...0777777770...',
      '................',
    ]);
  });

  it('tapers from one end’s width to the other’s', () => {
    const bitmap = new IndexedBitmap(12, 24);
    drawLine(bitmap, { x: 6, y: 2 }, { x: 6, y: 20 }, 4, 1, 3);
    const widths = rows(bitmap, 2, 20).map((row) => row.replace(/\./g, '').length);

    expect(widths[0]).toBeGreaterThan(widths.at(-1)!);
    expect(rows(bitmap, 10, 11)[0]).toMatch(/^\.*0[3]+0\.*$/);
  });
});
