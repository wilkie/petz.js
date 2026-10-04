/*
 * `Mag` (CATZDLL.DLL seg48:1a95, ordinal 1257): a vector's length, its two
 * shorts squared and summed in 32 bits, the root taken in floating point
 * and truncated. A line a vector: x, y, and its answer.
 */
#include "catzdll.h"

typedef int(__cdecl __far *MAG)(short __far *vector);

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    MAG mag;
    short vector[2];
    int x, y;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZMAG.OUT")) {
        return 1;
    }

    mag = (MAG)ordinal(1257);

    /* A grid over the range a frame's balls span, and its corners. */
    for (x = -3000; x <= 3000; x += 250) {
        for (y = -3000; y <= 3000; y += 175) {
            vector[0] = (short)x;
            vector[1] = (short)y;
            say("%d %d %d\r\n", x, y, mag(vector));
        }
    }

    end();
    return 0;
}
