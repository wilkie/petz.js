/*
 * CATZDLL.DLL's cat brains: 12 `XBrain`s (constructor, ordinal 1148) made
 * where a `CatSprite` keeps them (`+0x2fda` on, 0x52 bytes apart), in a
 * sprite's room that is otherwise not one, given a breed's lines averaged
 * toward its kitten's (`Linez::Average`, 931; its `[Default Factors]` at
 * Linez `+0x1de8`, which `+0x2fbe` points to), and set up as a new cat's
 * are (`CatSprite::InitBrain`, 517) -- its slider window taken as made
 * (`+0x33b2`), so none is. For each breed:
 *
 * * `breed adult young percent seed`: the C library's `rand` seed before
 *   (`ds:28ba`);
 * * `brain i value centre rate kind` for each: `+0x3a`, `+0x42`, `+0x44`,
 *   `+0x46`;
 * * then `update i value previous` for each, its value set to 0 and due at
 *   once (`+0x4a`), after one `XBrain::Update` (1151).
 */
#include "catzdraw.h"

typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef void(__cdecl __far *LOAD)(void __far *linez, const char __far *path, void __far *params);
typedef void(__cdecl __far *AVERAGE)(void __far *into, void __far *adult, void __far *young,
                                     long percent, void __far *params);
typedef void(__cdecl __far *INITBRAIN)(void __far *cat, void __far *params, int profile);
typedef void(__cdecl __far *UPDATE)(void __far *brain);

#define DIRECTORY "C:\\CORPUS\\CATZBRAN\\"

static const char *breeds[][2] = {
    {"AHUNTER.LNZ", "KHUNTER.LNZ"},   {"ASIAMESE.LNZ", "KSIAMESE.LNZ"},
    {"APERSIAN.LNZ", "KPERSIAN.LNZ"}, {"ACLOWN.LNZ", "KCLOWN.LNZ"},
    {"ASCAREDY.LNZ", "KSCAREDY.LNZ"},
};
static long percents[] = {0, 40, 100, 70, 0};

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
    MAKE makeLinez, makeBrain;
    LOAD load;
    UPDATE update;
    int b, i;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZBRAN.OUT", 1234)) {
        return 1;
    }

    makeLinez = (MAKE)ordinal(927);
    load = (LOAD)ordinal(929);
    makeBrain = (MAKE)ordinal(1148);
    update = (UPDATE)ordinal(1151);

    for (b = 0; b < sizeof breeds / sizeof breeds[0]; b++) {
        unsigned char __far *adult = linezOf(makeLinez, load, breeds[b][0]);
        unsigned char __far *young = linezOf(makeLinez, load, breeds[b][1]);
        unsigned char __far *linez = makeLinez(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
        unsigned char __far *cat = GlobalLock(GlobalAlloc(GPTR, 0x4000));

        ((AVERAGE)ordinal(931))(linez, adult, young, percents[b], params);

        for (i = 0; i < 12; i++) {
            makeBrain(cat + 0x2fda + 0x52 * i);
        }

        *(void __far *__far *)(cat + 0x2fbe) = linez;
        *(long __far *)(cat + 0x33b2) = 1;
        say("breed %s %s %ld %lu\r\n", (LPSTR)breeds[b][0], (LPSTR)breeds[b][1], percents[b],
            *(unsigned long __far *)MK_FP(dgroup, 0x28ba));
        ((INITBRAIN)ordinal(517))(cat, params, 0);

        for (i = 0; i < 12; i++) {
            unsigned char __far *brain = cat + 0x2fda + 0x52 * i;

            say("brain %d %d %d %d %d\r\n", i, *(int __far *)(brain + 0x3a),
                *(int __far *)(brain + 0x42), *(int __far *)(brain + 0x44),
                *(int __far *)(brain + 0x46));
        }

        for (i = 0; i < 12; i++) {
            unsigned char __far *brain = cat + 0x2fda + 0x52 * i;

            *(int __far *)(brain + 0x3a) = 0;
            *(long __far *)(brain + 0x4a) = 0;
            update(brain);
            say("update %d %d %d\r\n", i, *(int __far *)(brain + 0x3a),
                *(int __far *)(brain + 0x3c));
        }
    }

    end();
    return 0;
}
