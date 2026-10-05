/*
 * CATZDLL.DLL's reshaping of the cat's frames for each breed: for each of
 * the cat's breed files and its little one's, averaged by `Linez::Average`
 * (ordinal 931) some way from the one to the other, an XBallz made as
 * `InitScriptSprite` makes one (see catzfram.c), whose `ReloadLinezFile`
 * (1181) reshapes every frame by the breed (`ModifyBallzData`, seg36:0000,
 * 873: `ExtendLegLength`, `ExtendBody`, `ExtendFace`, `EnlargeHead`,
 * `ExtendEars`, `EnlargeFeet`). Each frame is read back through
 * `GetCartesianCoordinates` (1204) unturned, unpitched (XBallz `+0x720` 0),
 * its pet scale 256 and ball scale 512, so as the frame holds it:
 *
 * * `breed adult young percent`, then
 * * `frame n` and every ball's `x y z radius` after it on the same line.
 */
#include "catzdraw.h"

typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef void(__cdecl __far *UNMAKE)(void __far *object, int flags);
typedef void(__cdecl __far *LOAD)(void __far *linez, const char __far *path, void __far *params);
typedef void(__cdecl __far *AVERAGE)(void __far *into, void __far *adult, void __far *young,
                                     long percent, void __far *params);
typedef void(__cdecl __far *INITBALLZ)(void __far *ballz, const char __far *directory,
                                       void __far *linez, const char __far *name,
                                       void __far *params);
typedef void(__cdecl __far *RELOAD)(void __far *ballz, void __far *linez, void __far *params);
typedef unsigned char __far *(__cdecl __far *CARTESIAN)(void __far *ballz, void __far *state);
typedef void(__cdecl __far *PLAIN)(void);

#define DIRECTORY "C:\\CORPUS\\CATZSHAP\\"
#define BALLS 67

static unsigned char state[0x432];

/* The breeds: each adult's file and its little one's, and how far between. */
static const char *breeds[][2] = {
    {"AHUNTER.LNZ", "KHUNTER.LNZ"},   {"APERSIAN.LNZ", "KPERSIAN.LNZ"},
    {"ASCAREDY.LNZ", "KSCAREDY.LNZ"}, {"ASIAMESE.LNZ", "KSIAMESE.LNZ"},
    {"ACLOWN.LNZ", "KCLOWN.LNZ"},     {"W1ACLOWN.LNZ", "W1KCLOWN.LNZ"},
    {"W2ACLOWN.LNZ", "W2KCLOWN.LNZ"}, {"W3ACLOWN.LNZ", "W3KCLOWN.LNZ"},
    {"W4ACLOWN.LNZ", "W4KCLOWN.LNZ"}, {"W5ACLOWN.LNZ", "W5KCLOWN.LNZ"},
    {"W6ACLOWN.LNZ", "W6KCLOWN.LNZ"}, {"W7ACLOWN.LNZ", "W7KCLOWN.LNZ"},
    {"W8ACLOWN.LNZ", "W8KCLOWN.LNZ"}, {"W9ACLOWN.LNZ", "W9KCLOWN.LNZ"},
};
static long percents[] = {0, 40, 100};

/* The frames: one in every 311 of the cat's 9,246, and a few drawn elsewhere. */
#define EVERY 311
static int also[] = {300, 441, 900, 1867, 2308};

static unsigned char __far *linezOf(MAKE make, LOAD load, LPCSTR file)
{
    unsigned char __far *linez = make(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
    char path[80];

    lstrcpy(path, DIRECTORY);
    lstrcat(path, file);
    load(linez, path, params);
    return linez;
}

static void release(UNMAKE unmake, void __far *object)
{
    HGLOBAL handle = (HGLOBAL)LOWORD(GlobalHandle(FP_SEG(object)));

    unmake(object, 0);
    GlobalUnlock(handle);
    GlobalFree(handle);
}

static void frameOf(CARTESIAN cartesian, void __far *ballz, int n)
{
    static char text[1800];
    unsigned char __far *frame;
    int length, i;

    _fmemset(state, 0, sizeof state);
    *(long __far *)(state + 0x0c) = 256;
    *(long __far *)(state + 0x16) = 512;
    *(int __far *)(state + 0x1a) = n;
    *(int __far *)(state + 0x26) = 100;
    *(int __far *)(state + 0x28) = 100;
    *(int __far *)(state + 0x32) = 1;
    *(int __far *)(state + 0x44) = -1;
    *(int __far *)(state + 0x4a) = -1;
    *(int __far *)(state + 0x4c) = -1;

    frame = cartesian(ballz, state);
    length = wsprintf(text, "frame %d", n);

    for (i = 0; i < BALLS; i++) {
        length += wsprintf(text + length, " %d %d %d %d", *(int __far *)(frame + 0x530 + 6 * i),
                           *(int __far *)(frame + 0x532 + 6 * i),
                           *(int __far *)(frame + 0x534 + 6 * i),
                           *(int __far *)(frame + 0x440 + 2 * i));
    }

    text[length++] = '\r', text[length++] = '\n';
    _lwrite(output, text, length);
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    MAKE makeLinez, makeBallz;
    UNMAKE unmakeLinez, unmakeBallz;
    LOAD load;
    CARTESIAN cartesian;
    int b, p, n;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZSHAP.OUT", 1234)) {
        return 1;
    }

    /* The sine and cosine tables, by segment 48's own selector. */
    ((PLAIN)MK_FP(FP_SEG(ordinal(1240)), 0x1410))();

    makeLinez = (MAKE)ordinal(927);
    unmakeLinez = (UNMAKE)ordinal(928);
    load = (LOAD)ordinal(929);
    makeBallz = (MAKE)ordinal(1177);
    unmakeBallz = (UNMAKE)ordinal(1178);
    cartesian = (CARTESIAN)ordinal(1204);

    for (b = 0; b < sizeof breeds / sizeof breeds[0]; b++) {
        for (p = 0; p < sizeof percents / sizeof percents[0]; p++) {
            unsigned char __far *adult = linezOf(makeLinez, load, breeds[b][0]);
            unsigned char __far *young = linezOf(makeLinez, load, breeds[b][1]);
            unsigned char __far *linez = makeLinez(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
            unsigned char __far *ballz;

            ((AVERAGE)ordinal(931))(linez, adult, young, percents[p], params);
            ballz = makeBallz(GlobalLock(GlobalAlloc(GPTR, 0xbfd)));
            ((INITBALLZ)ordinal(1179))(ballz, DIRECTORY, linez, "CAT", params);
            ((RELOAD)ordinal(1181))(ballz, linez, params);

            /* No pitch: the frame as it is held. */
            *(int __far *)(ballz + 0x720) = 0;
            say("breed %s %s %ld\r\n", (LPSTR)breeds[b][0], (LPSTR)breeds[b][1], percents[p]);

            for (n = 0; n < 9246; n += EVERY) {
                frameOf(cartesian, ballz, n);
            }

            for (n = 0; n < sizeof also / sizeof also[0]; n++) {
                frameOf(cartesian, ballz, also[n]);
            }

            release(unmakeBallz, ballz);
            release(unmakeLinez, linez);
            release(unmakeLinez, young);
            release(unmakeLinez, adult);
        }
    }

    end();
    return 0;
}
