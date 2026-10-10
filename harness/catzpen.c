/*
 * Catz's playpen, made as CATZ.EXE makes it (CATZ.WAD seg4:12eb on): the
 * game's parameters as the program had filled them in when it began its
 * playpen (`PARAMS.BIN` beside the driver, `PetParams`, 0x722 bytes), with
 * this driver's own window and instance in them and its own directory for
 * the game's; then `InitGlobalPetzData` (853), a `PetModule` (855) made the
 * game's module (`XApex::theirApexObject`, 1236; `XApt::m_pPetModule`, 112)
 * and set up (`InitPetModule`, 858), its apts' tree begun (`XApt::InitTree`,
 * 217), and a frame drawn at a time (`OpenScreenDrawPort`, 1052;
 * `DoDrawFrame`, 859; `CloseScreenDrawPort`, 1053), each with the cursor
 * nowhere near the cat.
 *
 * * `made`: what each step answered;
 * * `cat segment offset`: the cat, the root apt's 0x1d (`XApt::GetApt`, 9),
 *   its class's table `CatSprite`'s (seg16:499a);
 * * for each case in `CASES.TXT` (`seed` and 12 brains' values), `case seed
 *   state global target 35d6` -- its state, global state and two fields
 *   (`+0x35a4`, `+0x35d6`) -- and `behave p value seed` for each of its 29
 *   behaviours (`MapCatBehavior`, 481), C's `rand` seeded for each;
 * * `frame n state global action shown rotation left top right bottom seed`
 *   then its 12 brains' values, after each frame: its state (`+0x2552`),
 *   its global state (`+0x3a` of the machine `+0x2fba` points to), the
 *   action playing (`+0x1502`), the frame shown (`+0x692`), its rotation
 *   (`+0x688`), its rectangle (`+0x124`) and C's `rand` seed (`ds:28ba`).
 */
#include <dos.h>

#include "catzdll.h"

typedef int(__cdecl __far *INITGLOBAL)(void __far *params);
typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef int(__cdecl __far *INITMODULE)(void __far *module, void __far *params);
typedef void(__cdecl __far *INITTREE)(void __far *apt, int how);
typedef int(__cdecl __far *PORT)(void __far *params);
typedef int(__cdecl __far *DRAWFRAME)(void __far *module, void __far *params);
typedef void __far *(__cdecl __far *GETPARAMS)(void);
typedef unsigned char __far *(__cdecl __far *GETAPT)(void __far *apt, int id);
typedef int(__cdecl __far *MAPBEHAVIOR)(void __far *cat, int parameter);

#define DIRECTORY "C:\\CORPUS\\CATZPEN"
#define FRAMES 400

static unsigned char params[0x722];

/* The next number of a file, or -1 at its end. */
static long number(HFILE file)
{
    char c;
    long n = 0;
    int digits = 0, negative = 0;

    while (_lread(file, &c, 1) == 1) {
        if (c == '-') {
            negative = 1;
        } else if (c >= '0' && c <= '9') {
            n = 10 * n + c - '0', digits++;
        } else if (digits) {
            break;
        }
    }

    return digits ? (negative ? -n : n) : -1;
}

long FAR PASCAL WindowProc(HWND window, UINT message, WPARAM w, LPARAM l)
{
    return DefWindowProc(window, message, w, l);
}

/* The cat: the root apt's 0x1d (`InitPetModule`, seg34:1353), where its class's table is `CatSprite`'s. */
static unsigned char __far *findCat(void)
{
    unsigned char __far *cat = ((GETAPT)ordinal(9))(*(void __far *__far *)ordinal(70), 0x1d);

    return cat && *(unsigned __far *)cat == 0x499a && *(unsigned __far *)(cat + 2) == FP_SEG(ordinal(492))
               ? cat
               : 0;
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    WNDCLASS kind;
    HWND window;
    HFILE file;
    unsigned dgroup;
    unsigned char __far *module;
    unsigned char __far *cat;
    int answer, n, b;

    (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZPEN.OUT")) {
        return 1;
    }

    /* The library's data segment, where `GetParamsPtr` points before any
     * parameters are set: C's `rand` keeps its seed there (`ds:28ba`). */
    dgroup = FP_SEG(((GETPARAMS)ordinal(1240))());

    file = _lopen(DIRECTORY "\\PARAMS.BIN", OF_READ);
    _lread(file, params, sizeof params);
    _lclose(file);

    /* A window for the playpen, the size the game's was. */
    kind.style = 0;
    kind.lpfnWndProc = WindowProc;
    kind.cbClsExtra = 0;
    kind.cbWndExtra = 0;
    kind.hInstance = instance;
    kind.hIcon = 0;
    kind.hCursor = LoadCursor(0, IDC_ARROW);
    kind.hbrBackground = GetStockObject(BLACK_BRUSH);
    kind.lpszMenuName = 0;
    kind.lpszClassName = "CatzPen";
    RegisterClass(&kind);
    window = CreateWindow("CatzPen", "Catz", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 0, 640, 480, 0,
                          0, instance, 0);

    /* The game's windows, instance and library this driver's own (`+0x394` on). */
    *(unsigned *)(params + 0x396) = (unsigned)window;
    *(unsigned *)(params + 0x398) = (unsigned)window;
    *(unsigned *)(params + 0x39a) = (unsigned)window;
    *(unsigned *)(params + 0x39c) = (unsigned)catz;
    *(unsigned *)(params + 0x39e) = (unsigned)instance;
    *(unsigned *)(params + 0x3a0) = 0;
    lstrcpy((LPSTR)(params + 0x3a4), DIRECTORY);
    lstrcpy((LPSTR)(params + 0x4a4), DIRECTORY "\\CATZ0.CAT");

    answer = ((INITGLOBAL)ordinal(853))(params);
    say("made global %d\r\n", answer);

    module = ((MAKE)ordinal(855))(GlobalLock(GlobalAlloc(GPTR, 0x46)));
    *(void __far *__far *)ordinal(1236) = module;
    *(void __far *__far *)ordinal(112) = module;
    answer = ((INITMODULE)ordinal(858))(module, params);
    say("made module %d\r\n", answer);

    ((INITTREE)ordinal(217))(*(void __far *__far *)ordinal(70), 0);
    say("made tree\r\n");

    cat = findCat();
    say("cat %u %u\r\n", FP_SEG(cat), FP_OFF(cat));

    /* Each case in `CASES.TXT`, a line `seed` and the 12 brains' values: the
     * brains set so (`+0x3a` of each), and then for each of its 29
     * behaviours, C's `rand` seeded so, what `MapCatBehavior` answers (481)
     * and where `rand` got to. */
    file = _lopen(DIRECTORY "\\CASES.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        for (;;) {
            long seed = number(file);
            int p;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            say("case %ld %d %d %d %d\r\n", seed, *(int __far *)(cat + 0x2552),
                *(int __far *)(*(unsigned char __far *__far *)(cat + 0x2fba) + 0x3a),
                *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35d6));

            for (p = 0; p < 29; p++) {
                int value;

                /* Answered first: the arguments of a call are worked out last to first. */
                *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
                value = ((MAPBEHAVIOR)ordinal(481))(cat, p);
                say("behave %d %d %lu\r\n", p, value,
                    *(unsigned long __far *)MK_FP(dgroup, 0x28ba));
            }
        }

        _lclose(file);
    }

    for (n = 0; n < FRAMES; n++) {
        /* The cursor at the stage's corner, away from the cat (`+0x108`, `+0x10a`). */
        *(int *)(params + 0x108) = 0;
        *(int *)(params + 0x10a) = 0;

        if (((PORT)ordinal(1052))(params) == 0) {
            ((DRAWFRAME)ordinal(859))(module, params);
            ((PORT)ordinal(1053))(params);
        }

        if (!cat) {
            cat = findCat();
            continue;
        }

        {
            unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

            say("frame %d %d %d %d %d %d %d %d %d %d %lu", n, *(int __far *)(cat + 0x2552),
                global ? *(int __far *)(global + 0x3a) : -1, *(int __far *)(cat + 0x1502),
                *(int __far *)(cat + 0x692), *(int __far *)(cat + 0x688),
                *(int __far *)(cat + 0x124), *(int __far *)(cat + 0x126),
                *(int __far *)(cat + 0x128), *(int __far *)(cat + 0x12a),
                *(unsigned long __far *)MK_FP(dgroup, 0x28ba));

            for (b = 0; b < 12; b++) {
                say(" %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a));
            }

            say("\r\n");
        }
    }

    end();
    return 0;
}
