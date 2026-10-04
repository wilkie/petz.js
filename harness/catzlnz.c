/*
 * CATZDLL.DLL's own reading of a breed's files, and its averaging of an
 * adult's with its kitten's: `Linez::Linez` (seg39:0000, ordinal 927),
 * `Linez::LoadLinezFile` (seg39:085c, 929) and `Linez::Average`
 * (seg39:2b00, 931), on the Hunter's two files, beside the program. Each
 * object is dumped by the fields the reimplementation models, a line a
 * field: what it is, then its words (offsets from kb/formats/lnz.md).
 */
#include "catzdll.h"

typedef void __far *(__cdecl __far *CONSTRUCT)(void __far *linez);
typedef void(__cdecl __far *LOAD)(void __far *linez, const char __far *path, void __far *params);
typedef void(__cdecl __far *AVERAGE)(void __far *into, void __far *adult, void __far *young,
                                     long percent, void __far *params);
typedef void(__cdecl __far *SETPARAMS)(void __far *params);

#define SIZE 0x2ccb

static unsigned char params[0x400];

static int word(unsigned char __far *linez, unsigned at)
{
    return *(short __far *)(linez + at);
}

/* So many words from an offset, `step` bytes apart, on one line. */
static void words(LPCSTR label, unsigned char __far *linez, unsigned at, int count, int step)
{
    char text[1400];
    int length = wsprintf(text, "%s", label);
    int n;

    for (n = 0; n < count; n++) {
        length += wsprintf(text + length, " %d", word(linez, at + n * step));
    }

    _lwrite(output, text, length);
    _lwrite(output, "\r\n", 2);
}

static void dump(LPCSTR name, unsigned char __far *linez)
{
    int n;

    say("breed %s\r\n", name);
    words("extensions", linez, 0x2a90, 4, 2);
    words("head", linez, 0x2a98, 2, 2);
    words("ears", linez, 0x2a9c, 1, 2);
    words("feet", linez, 0x2a9e, 2, 2);
    words("scales", linez, 0x2cc6, 2, 2);
    words("sizes", linez, 0x28b0, 67, 2);
    words("fuzz", linez, 0x29a0, 67, 2);
    words("colours", linez, 0x147b, 67, 2);
    words("up", linez, 0x2aa4, word(linez, 0x2aa2) * 2, 2);
    words("forward", linez, 0x2b1e, word(linez, 0x2b1c) * 2, 2);
    words("sideways", linez, 0x2b98, word(linez, 0x2b96) * 2, 2);
    words("project", linez, 0x2c12, word(linez, 0x2c10) * 3, 2);
    words("whiskers", linez, 0xde9, word(linez, 0xde7) * 3, 2);

    for (n = 1; n <= word(linez, 0xda9); n++) {
        words("line", linez, 0x2040 + n * 16, 8, 2);
    }
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    static long percents[] = {0, 40, 100};
    CONSTRUCT construct;
    LOAD load;
    AVERAGE average;
    unsigned char __far *adult;
    unsigned char __far *young;
    unsigned char __far *mixed;
    int n;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZLNZ.OUT")) {
        return 1;
    }

    construct = (CONSTRUCT)ordinal(927);
    load = (LOAD)ordinal(929);
    average = (AVERAGE)ordinal(931);
    ((SETPARAMS)ordinal(1241))(params);
    *(int *)(params + 0xd6) = 8;

    adult = GlobalLock(GlobalAlloc(GPTR, SIZE));
    young = GlobalLock(GlobalAlloc(GPTR, SIZE));
    mixed = GlobalLock(GlobalAlloc(GPTR, SIZE));
    construct(adult);
    construct(young);
    construct(mixed);

    /* By the whole path: `Petzfopen` puts a name starting with a backslash
     * after a base directory of the parameters', here none. */
    load(adult, "C:\\CORPUS\\CATZLNZ\\AHUNTER.LNZ", params);
    load(young, "C:\\CORPUS\\CATZLNZ\\KHUNTER.LNZ", params);
    dump("adult", adult);
    dump("young", young);

    for (n = 0; n < 3; n++) {
        char name[16];
        wsprintf(name, "average %ld", percents[n]);
        average(mixed, adult, young, percents[n], params);
        dump(name, mixed);
    }

    end();
    return 0;
}
