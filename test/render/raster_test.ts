import { FIDELITY } from '../../src/render/fidelity.ts';
import {
  drawLine,
  fillBall,
  fillLid,
  fillShaded,
  IndexedBitmap,
  circleTables,
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

/** A ball of radius 5, drawn as a circle of diameter 9 in a square 10 across. */
const ball = {
  x: 8,
  y: 8,
  diameter: 10,
  colour: 1,
  outlineColour: 0,
  speckleColour: 7,
  outline: -1,
  fuzz: 0,
};

/** Seed 1's tables with every speckle at its row's start and nothing carried: for a ball's shape alone. */
const steadyTables = () => {
  const tables = circleTables(1);
  return {
    ...tables,
    speckle: new Int8Array(tables.speckle.length),
    carry: tables.carry.map((level) => new Int8Array(level.length)),
  };
};

/** Each row's pixels other than speckles, from its first. */
const rowsOf = (bitmap: IndexedBitmap) =>
  picture(bitmap)
    .map((row) => row.replace(/7/g, '1').replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

describe('a circle’s rows', () => {
  it('are as wide as the circle is there', () => {
    // sqrt(d² - (d - 2r)²) for rows 1 to d: the last is empty, as in Dogz's table.
    expect(Array.from({ length: 6 }, (_, row) => rowWidth(6, row + 1))).toEqual([4, 5, 6, 5, 4, 0]);
  });
});

describe('a ball', () => {
  it('is a circle one less across than its square, its rows from the square’s top', () => {
    const bitmap = new IndexedBitmap(16, 16);
    fillBall(bitmap, ball, steadyTables());
    const rows = picture(bitmap);

    /* Rows 1 to 8 of a circle of 9, from y 4: the square's top, 8 less its
     * radius, and a row lower on a bottom-up bitmap. */
    expect(rows.slice(0, 4).every((row) => !row.includes('1'))).toBe(true);
    expect(rowsOf(bitmap).map((row) => row.length)).toEqual([5, 7, 8, 8, 8, 8, 7, 5]);
    expect(rows[4].search(/[17]/)).toBe(8 - 2);
  });

  it('with a half outline, has a pixel of it before each row, which is one shorter', () => {
    const bitmap = new IndexedBitmap(16, 16);
    fillBall(bitmap, { ...ball, outline: 0 }, steadyTables());

    expect(rowsOf(bitmap)).toEqual([
      '01111',
      '0111111',
      '01111111',
      '01111111',
      '01111111',
      '01111111',
      '0111111',
      '01111',
    ]);
  });

  it('with an outline 1 thick, has whole rows of it top and bottom, and a pixel each end', () => {
    const bitmap = new IndexedBitmap(16, 16);
    fillBall(bitmap, { ...ball, outline: 1 }, steadyTables());

    expect(rowsOf(bitmap)).toEqual([
      '00000',
      '011110',
      '0111110',
      '0111110',
      '0111110',
      '0111110',
      '011110',
      '00000',
    ]);
  });

  it('has a speckle in each row of its upper half, and none below', () => {
    const bitmap = new IndexedBitmap(16, 16);
    fillBall(bitmap, ball, steadyTables());
    const speckled = picture(bitmap).map((row) => row.includes('7'));

    /* On a bottom-up bitmap, the rows counted from the bottom past 9 / 2: rows 1 to 4 of 8. */
    expect(speckled.slice(4, 8)).toEqual([true, true, true, true]);
    expect(speckled.slice(8)).not.toContain(true);
  });

  it('moves a whole ball left by the move carried into its diameter', () => {
    const tables = steadyTables();
    tables.carry[3][9] = 2;
    const draw = (fuzz: number) => {
      const bitmap = new IndexedBitmap(20, 16);
      fillBall(
        bitmap,
        { ...ball, fuzz, speckleColour: -1 },
        { ...tables, fuzz: tables.fuzz.map((level) => new Int8Array(level.length)) }
      );
      return picture(bitmap);
    };
    const steady = draw(0);

    draw(3).forEach((row, y) => {
      expect(row.indexOf('1') === -1 || row.indexOf('1') === steady[y].indexOf('1') - 2).toBe(true);
    });
  });

  it('takes the table’s rows from the bottom up', () => {
    const tables = steadyTables();
    const fuzz = tables.fuzz.map((level) => new Int8Array(level.length));
    /* Diameter 9's first row in the table. */
    fuzz[1][(9 * 8) / 2] = 1;
    const draw = (level: number) => {
      const bitmap = new IndexedBitmap(20, 16);
      fillBall(bitmap, { ...ball, fuzz: level, speckleColour: -1 }, { ...tables, fuzz });
      return picture(bitmap).map((row) => row.indexOf('1'));
    };

    const moved = draw(1);
    const steady = draw(0);
    /* Rows 1 to 8 from y 4: only the bottom one, y 11, moves. */
    expect(moved.map((x, y) => x - steady[y])).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it('moves each row by no more than its fuzz, the same each time it is drawn', () => {
    const tables = circleTables(5);
    const draw = (fuzz: number) => {
      const bitmap = new IndexedBitmap(20, 16);
      fillBall(bitmap, { ...ball, fuzz, speckleColour: -1 }, tables);
      return picture(bitmap);
    };
    const steady = draw(0);
    const fuzzy = draw(3);

    fuzzy.forEach((row, y) => {
      const shift = row.indexOf('1') - steady[y].indexOf('1');
      expect(row.indexOf('1') === -1 || (shift >= -3 && shift <= 3)).toBe(true);
    });
    expect(draw(3)).toEqual(fuzzy);
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
  /* An eye 12 across at (20, 20), covered 4 rows' worth, by the angle given. */
  const lid = (angle: number) => {
    const bitmap = new IndexedBitmap(40, 40);
    fillLid(bitmap, { x: 20, y: 20, d: 12, colour: 4, cover: 4, angle });
    const rows: string[] = [];

    for (let y = 14; y < 26; y++) {
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
      expect(row.indexOf('#')).toBeGreaterThanOrEqual(6);
    }

    for (const row of lid(-64).filter((row) => row.includes('#'))) {
      expect(row.lastIndexOf('#')).toBeLessThan(6);
    }
  });
});

describe('a shining ball', () => {
  it('is shaded from the ramp’s eighth colour at the top to its first, which fills the rest', () => {
    const bitmap = new IndexedBitmap(40, 40);
    fillShaded(bitmap, { x: 20, y: 20, diameter: 20, fuzz: 0 }, 164);
    const rows = Array.from({ length: 20 }, (_, r) => bitmap.get(20, 11 + r));

    /* A circle of 19, from y 11: the top 0.3 of its rows, 5, step down a quarter turn by 64 / 5 = 12. */
    expect(rows.slice(0, 7)).toEqual([171, 171, 170, 169, 167, 164, 164]);
    expect(rows.slice(7, 18).every((colour) => colour === 164)).toBe(true);
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

    /* Corners at y 3 and 7, turned over, scanned from the bitmap's bottom
     * and landing a row higher: rows 3 to 6 again, the corner's row left
     * out now the top one. */
    expect(rows(bitmap, 2, 8)).toEqual([
      '................',
      '...0777777770...',
      '...0777777770...',
      '...0777777770...',
      '...0777777770...',
      '................',
    ]);
  });

  it('on a top-down bitmap, is scanned from the top, the last corner’s row not drawn', () => {
    const bitmap = new IndexedBitmap(16, 12);
    FIDELITY.bottomUp = false;

    try {
      drawLine(bitmap, { x: 3, y: 5 }, { x: 12, y: 5 }, 2, 2, 7);
    } finally {
      FIDELITY.bottomUp = true;
    }

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
