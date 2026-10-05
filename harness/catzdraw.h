/*
 * What every drawing driver of CATZDLL.DLL shares: its drawing set up as
 * Catz sets it up (`InitGlobalPetzData`, seg34:014e) -- the parameters, a
 * seed for its random numbers, the screen port (`XDrawPort::XInitScreenPort`,
 * seg44:1556, ordinal 1051) and a 640 by 640 port with its circle tables, as
 * Catz's mix buffer is (`XDrawPort::XInitPort`, seg44:0ba0, ordinal 1050) --
 * -- with the system palette it ran against, `system n r g b` an entry;
 * and patches of that port filled with a colour nothing draws, and dumped:
 * `rows top left width height`, then a line of hex a row, from the top of
 * the picture down.
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
static unsigned dgroup;
static unsigned char __far *mix;
static unsigned char __far *screen;
static int topDown;

static int next(int below)
{
    seed = seed * 1103515245UL + 12345UL;
    return (int)((seed >> 16) % below);
}

/* A pixel of the picture, by its row from the top, whichever way up the bitmap is. */
static unsigned char __huge *at(int x, int y)
{
    return bits + (long)(topDown ? y : SIZE - 1 - y) * stride + x;
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

/* The drawing set up as Catz sets it up, its random numbers seeded with
 * `random`; FALSE if the library would not load. */
static BOOL setUp(LPCSTR name, unsigned random)
{
    CONSTRUCT construct;
    int rect[4] = {0, 0, SIZE, SIZE};

    if (!begin(name)) {
        return FALSE;
    }

    /* The library's data segment, by where it keeps the parameters; its
     * random numbers' seed at 0x28ba, as `srand` keeps it, and the whiskers'
     * counter at 0x19ee. */
    dgroup = FP_SEG(((GETPARAMS)ordinal(1240))());
    *(unsigned __far *)MK_FP(dgroup, 0x28ba) = random;
    *(unsigned __far *)MK_FP(dgroup, 0x28bc) = 0;
    *(unsigned __far *)MK_FP(dgroup, 0x19ee) = 0;

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

    /* The system palette it ran against: the translation of colours hangs
     * on the system's own entries, 0 to 15 and 246 to 255. */
    {
        static PALETTEENTRY system[256];
        HDC dc = GetDC(0);
        int n;

        GetSystemPaletteEntries(dc, 0, 256, system);
        ReleaseDC(0, dc);

        for (n = 0; n < 256; n++) {
            say("system %d %d %d %d\r\n", n, system[n].peRed, system[n].peGreen, system[n].peBlue);
        }
    }

    return TRUE;
}

/*
 * A fresh port, bottom-up or top-down: `XDrawPort::theirTopDown`
 * (seg56:0858, ordinal 1098, which WinG's recommendation sets) set before
 * the port is made, as `XInitPort` takes it (seg44:0ba0), its circle
 * tables made again from the same random numbers. Its line says so:
 * `down 0` or `down 1`.
 */
static void newPort(int down, unsigned random)
{
    int rect[4] = {0, 0, SIZE, SIZE};
    unsigned long state = random;
    int n;

    /* The random numbers where the first port's circle tables began: the
     * seed, past the screen port's 2048 draws (Borland's rand), so the
     * tables come out the same. */
    for (n = 0; n < 2048; n++) {
        state = state * 0x015a4e35UL + 1;
    }

    *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = state;
    *(int __far *)ordinal(1098) = down;
    topDown = down;
    mix = ((CONSTRUCT)ordinal(1048))(0);
    ((INITPORT)ordinal(1050))(mix, rect, *(int __far *)(screen + 0x48), 1);
    bits = *(unsigned char __huge * __far *)(mix + 0x76);
    stride = *(long __far *)(mix + 0x44);
    say("down %d\r\n", down);
}
