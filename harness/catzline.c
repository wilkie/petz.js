/*
 * CATZDLL.DLL's colour translation and lines, its drawing set up as Catz
 * sets it up (catzdraw.h):
 *
 * * `translate c t`: `XDrawPort::ColorIndexTranslate` (seg44:0000, 1070)
 *   for every colour;
 * * `line x1 y1 x2 y2 wS wE colour edge`: `XDrawPort::XDrawLine`
 *   (seg44:704e, 1064) on a patch of the port, and the patch after.
 */
#include "catzdraw.h"

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    int block[13];
    int down;
    TRANSLATE translate;
    DRAWLINE drawLine;
    int n;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZLINE.OUT", 1234)) {
        return 1;
    }

    translate = (TRANSLATE)ordinal(1070);

    for (n = 0; n < 256; n++) {
        say("translate %d %d\r\n", n, translate(n) & 0xff);
    }

    drawLine = (DRAWLINE)ordinal(1064);

    /* Every line drawn twice: on a bottom-up port, then a top-down one. */
    for (down = 0; down < 2; down++) {
    newPort(down, 1234);
    seed = 99;

    for (n = 0; n < 100; n++) {
        int x1 = 100 + next(440), y1 = 100 + next(440);
        int x2 = x1 + next(121) - 60, y2 = y1 + next(121) - 60;
        int wS = 1 + next(12), wE = 1 + next(12);
        int colour = 28 + next(100);
        int edge = next(2) ? -1 : 28 + next(100);
        int left = min(x1, x2) - 16, top = min(y1, y2) - 16;
        int width = abs(x2 - x1) + 33, height = abs(y2 - y1) + 33;
        int i;

        for (i = 0; i < 13; i++) {
            block[i] = 0;
        }

        block[0] = x1, block[1] = y1, block[2] = x2, block[3] = y2;
        block[4] = wS, block[5] = wE, block[6] = colour, block[7] = edge, block[8] = -1;
        patch(left, top, width, height, 1);
        drawLine(mix, block);
        say("line %d %d %d %d %d %d %d %d\r\n", x1, y1, x2, y2, wS, wE, colour, edge);
        patch(left, top, width, height, 0);
    }
    }

    end();
    return 0;
}
