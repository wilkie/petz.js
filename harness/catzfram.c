/*
 * CATZDLL.DLL's own XBallz for the cat, made as `InitScriptSprite` makes
 * one, its drawing set up as Catz sets it up (catzdraw.h): the Hunter's
 * adult and kitten files averaged all the way to the kitten
 * (`Linez::Average`, ordinal 931), the cat's animations from beside the
 * program (`XBallz::InitBallz`, 1179; `ReloadLinezFile`, 1181), and the
 * sine tables `InitGlobalPetzData` makes (seg48:1410, not exported). Then
 * for each case -- a frame, turned, tilted and rolled, its head turned, its
 * eyelids set and its eyes looking -- on a bottom-up port and then a
 * top-down one (`down 0`, `down 1`):
 *
 * * `case` and its numbers, as `cases` has them;
 * * `bounds left top right bottom minz extent`, and `ball i x y z radius`
 *   for every ball: `XBallz::GetCartesianCoordinates` (seg47:419c, 1204);
 * * the frame drawn by `XBallz::DisplayBallzFrame` (seg47:5e0b, 1184) into
 *   the port, its square's corner at `origin x y`, and the patch after;
 * * `order` and `shades`: the draw order and depth shades `ZOrder` left
 *   (XBallz `+0x82f` and `+0xa0f`).
 */
#include "catzdraw.h"

typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef void(__cdecl __far *LOAD)(void __far *linez, const char __far *path, void __far *params);
typedef void(__cdecl __far *AVERAGE)(void __far *into, void __far *adult, void __far *young,
                                     long percent, void __far *params);
typedef void(__cdecl __far *INITBALLZ)(void __far *ballz, const char __far *directory,
                                       void __far *linez, const char __far *name,
                                       void __far *params);
typedef void(__cdecl __far *RELOAD)(void __far *ballz, void __far *linez, void __far *params);
typedef unsigned char __far *(__cdecl __far *CARTESIAN)(void __far *ballz, void __far *state);
typedef void(__cdecl __far *DISPLAY)(void __far *ballz, void __far *port, int __far *rect,
                                     void __far *state, void __far *other, void __far *otherState);
typedef void(__cdecl __far *PLAIN)(void);

#define DIRECTORY "C:\\CORPUS\\CATZFRAM\\"
#define BALLS 67

static unsigned char state[0x432];

/*
 * The cases: a frame; its rotation, tilt and roll, in 256ths of a turn;
 * each eyelid's height (`BallState` `+0x2a`, `+0x2c`); the head's rotation,
 * tilt and cock (`+0x1c`, `+0x1e`, `+0x20`); the eyelids' tilts (`+0x22`,
 * `+0x24`) and how far they may open (`+0x26`, `+0x28`); and where the eyes
 * look, from where the frame has them (`+0x2e`, `+0x30`).
 */
#define FIELDS 15

static int cases[][FIELDS] = {
    {300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 64, 0, 0, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, -64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 32, 0, 0, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {900, 0, 0, 0, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {900, 96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {2308, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {2308, 64, 0, 0, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {1867, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {441, -40, 0, 0, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 20, 12, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {900, -20, 0, 10, 20, 20, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, -100, -8, 6, 50, 50, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 0, 0, 0, 20, 20, 30, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 0, 0, 0, 20, 20, 0, 20, 0, 0, 0, 100, 100, 0, 0},
    {300, 0, 0, 0, 20, 20, 0, 0, 25, 0, 0, 100, 100, 0, 0},
    {900, 64, 0, 0, 20, 20, -40, 15, 10, 0, 0, 100, 100, 0, 0},
    {300, 0, 0, 0, 60, 10, 0, 0, 0, 0, 0, 100, 100, 0, 0},
    {300, 0, 0, 0, 40, 40, 0, 0, 0, 30, -20, 100, 100, 0, 0},
    {300, 0, 0, 0, 30, 30, 0, 0, 0, 0, 0, 60, 90, 0, 0},
    {300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 20, -15},
    {2308, -30, 0, 0, 50, 20, 20, -10, 5, 15, 10, 100, 80, -10, 10},
};

static unsigned char __far *linezOf(MAKE make, LOAD load, LPCSTR file)
{
    unsigned char __far *linez = make(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
    char path[80];

    lstrcpy(path, DIRECTORY);
    lstrcat(path, file);
    load(linez, path, params);
    return linez;
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    MAKE makeLinez, makeBallz;
    LOAD load;
    unsigned char __far *adult;
    unsigned char __far *young;
    unsigned char __far *linez;
    unsigned char __far *ballz;
    CARTESIAN cartesian;
    DISPLAY display;
    int n, i, down;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZFRAM.OUT", 1234)) {
        return 1;
    }

    /* The sine and cosine tables, by segment 48's own selector. */
    ((PLAIN)MK_FP(FP_SEG(ordinal(1240)), 0x1410))();

    makeLinez = (MAKE)ordinal(927);
    load = (LOAD)ordinal(929);
    adult = linezOf(makeLinez, load, "AHUNTER.LNZ");
    young = linezOf(makeLinez, load, "KHUNTER.LNZ");
    linez = makeLinez(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
    ((AVERAGE)ordinal(931))(linez, adult, young, 100L, params);

    makeBallz = (MAKE)ordinal(1177);
    ballz = makeBallz(GlobalLock(GlobalAlloc(GPTR, 0xbfd)));
    ((INITBALLZ)ordinal(1179))(ballz, DIRECTORY, linez, "CAT", params);
    ((RELOAD)ordinal(1181))(ballz, linez, params);

    cartesian = (CARTESIAN)ordinal(1204);
    display = (DISPLAY)ordinal(1184);
    /* Every case drawn twice: on a bottom-up port, then a top-down one. */
    for (down = 0; down < 2; down++) {
    newPort(down, 1234);

    for (n = 0; n < sizeof cases / sizeof cases[0]; n++) {
        unsigned char __far *frame;
        int left, top, right, bottom, x, y, rect[4];

        /* As `ResetParams` and `ResetHeadEyes` leave a cat, but for what the case sets. */
        _fmemset(state, 0, sizeof state);
        *(long __far *)(state + 0x0c) = *(int __far *)(linez + 0x2cc6);
        *(int __far *)(state + 0x10) = cases[n][1];
        *(int __far *)(state + 0x12) = cases[n][2];
        *(int __far *)(state + 0x14) = cases[n][3];
        *(long __far *)(state + 0x16) = *(int __far *)(linez + 0x2cc8);
        *(int __far *)(state + 0x1a) = cases[n][0];
        *(int __far *)(state + 0x1c) = cases[n][6];
        *(int __far *)(state + 0x1e) = cases[n][7];
        *(int __far *)(state + 0x20) = cases[n][8];
        *(int __far *)(state + 0x22) = cases[n][9];
        *(int __far *)(state + 0x24) = cases[n][10];
        *(int __far *)(state + 0x26) = cases[n][11];
        *(int __far *)(state + 0x28) = cases[n][12];
        *(int __far *)(state + 0x2a) = cases[n][4];
        *(int __far *)(state + 0x2c) = cases[n][5];
        *(int __far *)(state + 0x2e) = cases[n][13];
        *(int __far *)(state + 0x30) = cases[n][14];
        *(int __far *)(state + 0x32) = 1;
        *(int __far *)(state + 0x44) = -1;
        *(int __far *)(state + 0x4a) = -1;
        *(int __far *)(state + 0x4c) = -1;

        /* Each case from scratch: the order in turn, no shades, no depths before. */
        for (i = 0; i < 120; i++) {
            *(int __far *)(ballz + 0x82f + 2 * i) = i;
            *(int __far *)(ballz + 0xa0f + 2 * i) = 0;
            *(int __far *)(ballz + 0xaff + 2 * i) = 9999;
        }

        *(unsigned __far *)MK_FP(dgroup, 0x19ee) = 0;
        *(double __far *)MK_FP(dgroup, 0x1e5c) = -1.0;
        *(double __far *)MK_FP(dgroup, 0x1e64) = -1.0;
        *(int __far *)MK_FP(dgroup, 0x1e6c) = 0;

        frame = cartesian(ballz, state);
        left = *(int __far *)frame, top = *(int __far *)(frame + 2);
        right = *(int __far *)(frame + 6), bottom = *(int __far *)(frame + 8);
        say("case");

        for (i = 0; i < FIELDS; i++) {
            say(" %d", cases[n][i]);
        }

        say("\r\n");
        say("bounds %d %d %d %d %d %d\r\n", left, top, right, bottom,
            *(int __far *)(frame + 0x4c), *(int __far *)(frame + 0x4e));

        for (i = 0; i < BALLS; i++) {
            say("ball %d %d %d %d %d\r\n", i, *(int __far *)(frame + 0x530 + 6 * i),
                *(int __far *)(frame + 0x532 + 6 * i), *(int __far *)(frame + 0x534 + 6 * i),
                *(int __far *)(frame + 0x440 + 2 * i));
        }

        /* Drawn with its square's corner in the port's middle. */
        x = SIZE / 2 - (right - left) / 2;
        y = SIZE / 2 - (bottom - top) / 2;
        rect[0] = x, rect[1] = y, rect[2] = x + right - left, rect[3] = y + bottom - top;
        say("origin %d %d\r\n", x, y);
        patch(x - 8, y - 8, right - left + 16, bottom - top + 16, 1);

        display(ballz, mix, rect, state, 0, 0);
        patch(x - 8, y - 8, right - left + 16, bottom - top + 16, 0);

        {
            char text[700];
            int length = wsprintf(text, "order");

            for (i = 0; i < BALLS; i++) {
                length += wsprintf(text + length, " %d", *(int __far *)(ballz + 0x82f + 2 * i));
            }

            _lwrite(output, text, length);
            length = wsprintf(text, "\r\nshades");

            for (i = 0; i < BALLS; i++) {
                length += wsprintf(text + length, " %d", *(int __far *)(ballz + 0xa0f + 2 * i));
            }

            _lwrite(output, text, length);
            _lwrite(output, "\r\n", 2);
        }
    }
    }

    end();
    return 0;
}
