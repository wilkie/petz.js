/*
 * CATZDLL.DLL's drawing, set up as Catz sets it up (`InitGlobalPetzData`,
 * seg34:014e): the parameters, a seed for its random numbers, the screen
 * port (`XDrawPort::XInitScreenPort`, seg44:1556, ordinal 1051) and a
 * 640 by 640 port with its circle tables, as Catz's mix buffer is
 * (`XDrawPort::XInitPort`, seg44:0ba0, ordinal 1050). Then:
 *
 * * `system n r g b`: the system palette it ran against, for every entry;
 * * `translate c t`: `XDrawPort::ColorIndexTranslate` (seg44:0000, 1070)
 *   for every colour;
 * * `line x1 y1 x2 y2 wS wE colour edge`: `XDrawPort::XDrawLine`
 *   (seg44:704e, 1064) on a patch of the port filled with a colour it does
 *   not draw, and the patch after: `rows top left width height`, then a
 *   line of hex a row, from the top of the picture down.
 */
#include <dos.h>
#include <stdlib.h>

#include "catzdll.h"

typedef void __far *(__cdecl __far *CONSTRUCT)(void __far *port);
typedef void(__cdecl __far *SCREENPORT)(void __far *port, void __far *params);
typedef void(__cdecl __far *INITPORT)(void __far *port, int __far *rect, int bits, int circles);
typedef int(__cdecl __far *TRANSLATE)(int colour);
typedef void(__cdecl __far *DRAWLINE)(void __far *port, int __far *block);
typedef void(__cdecl __far *SETPARAMS)(void __far *params);
typedef void __far *(__cdecl __far *GETPARAMS)(void);

#define SIZE 640
#define BLANK 0xfe

static unsigned char params[0x722];
static unsigned char __huge *bits;
static long stride;
static unsigned long seed = 99;

static int next(int below)
{
    seed = seed * 1103515245UL + 12345UL;
    return (int)((seed >> 16) % below);
}

/* A pixel of the picture, by its row from the top: the bitmap is bottom-up. */
static unsigned char __huge *at(int x, int y)
{
    return bits + (long)(SIZE - 1 - y) * stride + x;
}

static void patch(int left, int top, int width, int height, int fill)
{
    char text[40];
    char row[2 * SIZE + 3];
    static const char hex[] = "0123456789abcdef";
    int x, y;

    if (fill) {
        for (y = top; y < top + height; y++) {
            for (x = left; x < left + width; x++) {
                *at(x, y) = BLANK;
            }
        }

        return;
    }

    _lwrite(output, text, wsprintf(text, "rows %d %d %d %d\r\n", top, left, width, height));

    for (y = top; y < top + height; y++) {
        for (x = 0; x < width; x++) {
            row[2 * x] = hex[*at(left + x, y) >> 4];
            row[2 * x + 1] = hex[*at(left + x, y) & 15];
        }

        row[2 * width] = '\r';
        row[2 * width + 1] = '\n';
        _lwrite(output, row, 2 * width + 2);
    }
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    CONSTRUCT construct;
    unsigned char __far *screen;
    unsigned char __far *mix;
    int rect[4] = {0, 0, SIZE, SIZE};
    int block[13];
    unsigned __far *dgroup;
    TRANSLATE translate;
    DRAWLINE drawLine;
    int n;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZLINE.OUT")) {
        return 1;
    }

    /* The library's data segment, by where it keeps the parameters; its
     * random numbers' seed at 0x28ba, as `srand` keeps it, and the whiskers'
     * counter at 0x19ee. */
    dgroup = (unsigned __far *)((GETPARAMS)ordinal(1240))();
    *(unsigned __far *)MK_FP(FP_SEG(dgroup), 0x28ba) = 1234;
    *(unsigned __far *)MK_FP(FP_SEG(dgroup), 0x28bc) = 0;
    *(unsigned __far *)MK_FP(FP_SEG(dgroup), 0x19ee) = 0;

    /* Its resources are the library's own; the profile is none, so its defaults. */
    *(unsigned *)(params + 0x39c) = (unsigned)catz;
    *(unsigned *)(params + 0x396) = 0;
    lstrcpy((LPSTR)(params + 0x5d0), "Catz");
    lstrcpy((LPSTR)(params + 0x6fc), "NONE.INI");
    ((SETPARAMS)ordinal(1241))(params);

    construct = (CONSTRUCT)ordinal(1048);
    screen = construct(0);
    ((SCREENPORT)ordinal(1051))(screen, params);
    mix = construct(0);
    ((INITPORT)ordinal(1050))(mix, rect, *(int __far *)(screen + 0x48), 1);
    bits = *(unsigned char __huge * __far *)(mix + 0x76);
    stride = *(long __far *)(mix + 0x44);
    say("port %d %ld\r\n", *(int __far *)(screen + 0x48), stride);

    /* The system palette it ran against: the translation depends on the
     * system's own entries, 0 to 15 and 246 to 255. */
    {
        static PALETTEENTRY system[256];
        HDC dc = GetDC(0);

        GetSystemPaletteEntries(dc, 0, 256, system);
        ReleaseDC(0, dc);

        for (n = 0; n < 256; n++) {
            say("system %d %d %d %d\r\n", n, system[n].peRed, system[n].peGreen, system[n].peBlue);
        }
    }

    translate = (TRANSLATE)ordinal(1070);

    for (n = 0; n < 256; n++) {
        say("translate %d %d\r\n", n, translate(n) & 0xff);
    }

    drawLine = (DRAWLINE)ordinal(1064);

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

    end();
    return 0;
}
