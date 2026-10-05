/*
 * CATZDLL.DLL's whiskers and balls, its drawing set up as Catz sets it up
 * (catzdraw.h), each on a patch of the port, and the patch after:
 *
 * * `whisker x1 y1 x2 y2 colour radius`: `XDrawPort::XDrawWhiskerLine`
 *   (seg44:6d3d, ordinal 1065), its twitch's counter at 0, so it does not;
 * * `ball x y diameter colour outline speckle mode fuzz`:
 *   `XDrawPort::XFillCircleEx` (seg44:5671, ordinal 1058) on a block as
 *   `DisplayBallzFrame` fills one (seg47:5e39 on): the ball's square, its
 *   colour and outline's, its speckles', its kernel by the mode -- -1
 *   plain, 0 emboss, more an outline -- its rows and its fuzz.
 */
#include "catzdraw.h"

typedef void(__cdecl __far *WHISKER)(void __far *port, int __far *from, int __far *to,
                                     int colour, int radius);
typedef void(__cdecl __far *CIRCLE)(void __far *port, unsigned char __far *block);

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    WHISKER whisker;
    CIRCLE circle;
    static unsigned char block[0x34];
    int n, down;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZBALL.OUT", 1234)) {
        return 1;
    }

    whisker = (WHISKER)ordinal(1065);
    circle = (CIRCLE)ordinal(1058);

    /* Every case drawn twice: on a bottom-up port, then a top-down one. */
    for (down = 0; down < 2; down++) {
    newPort(down, 1234);
    seed = 99;

    for (n = 0; n < 60; n++) {
        int from[2], to[2];
        int colour = 8 + next(2) * 20;
        int radius = next(20);
        int left, top, width, height;

        from[0] = 100 + next(440), from[1] = 100 + next(440);
        to[0] = from[0] + next(81) - 40, to[1] = from[1] + next(41) - 20;
        left = min(from[0], to[0]) - 8, top = min(from[1], to[1]) - 8;
        width = abs(to[0] - from[0]) + 17, height = abs(to[1] - from[1]) + 17;

        *(unsigned __far *)MK_FP(dgroup, 0x19ee) = 0;
        patch(left, top, width, height, 1);
        whisker(mix, from, to, colour, radius);
        say("whisker %d %d %d %d %d %d\r\n", from[0], from[1], to[0], to[1], colour, radius);
        patch(left, top, width, height, 0);
    }

    for (n = 0; n < 120; n++) {
        int x = 80 + next(480), y = 80 + next(480);
        int r = 2 + next(28);
        int colour = 28 + next(100), outline = next(2) ? 0 : 28 + next(100);
        int speckle = next(3) ? -1 : 28 + next(100);
        int mode = next(3) - 1 + (next(4) == 0 ? next(3) : 0);
        int fuzz = next(8);
        int i;

        for (i = 0; i < 0x34; i++) {
            block[i] = 0;
        }

        ((int __far *)block)[0] = x - r, ((int __far *)block)[1] = y - r;
        ((int __far *)block)[2] = x + r, ((int __far *)block)[3] = y + r;
        block[8] = (unsigned char)colour, block[9] = (unsigned char)outline;
        *(int __far *)(block + 0xa) = speckle;
        *(int __far *)(block + 0xc) = mode;
        *(int __far *)(block + 0xe) = 2 * r;
        *(int __far *)(block + 0x10) = fuzz;
        *(int __far *)(block + 0x2c) = -1;

        patch(x - r - 10, y - r - 10, 2 * r + 21, 2 * r + 21, 1);
        circle(mix, block);
        say("ball %d %d %d %d %d %d %d %d\r\n", x, y, 2 * r, colour, outline, speckle, mode, fuzz);
        patch(x - r - 10, y - r - 10, 2 * r + 21, 2 * r + 21, 0);
    }
    }

    end();
    return 0;
}
