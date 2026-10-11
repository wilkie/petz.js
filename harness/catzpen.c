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
 * * for each case in `CASES.TXT` (`seed`, 12 brains' values and their 12
 *   centres, `+0x42`), `case seed
 *   state global target 35d6` -- its state, global state and two fields
 *   (`+0x35a4`, `+0x35d6`) -- and `behave p value seed` for each of its 29
 *   behaviours (`MapCatBehavior`, 481), and `sound p value seed` for each of
 *   its 13 sounds (`MapCatSound`, 483), C's `rand` seeded for each;
 * * for each case in `MOMENT.TXT` (`seed`, 12 brains' values and
 *   `+0x35d2`), `moment seed global target 35d6 35d2 shelf saver c4 35a6`
 *   -- what the moment reads -- and after a tick of it, `chose state
 *   global` and the global machine's last ten states (`+0x3e` on), then
 *   `+0x35a4`, `+0x35a6`, `+0x35ce`, `+0x3516`, `+0x33be` and `+0x3508`;
 * * for each case in `ENTER.TXT`, `enter seed` and the stage (`ds:2ba6` on),
 *   and once the moment has begun `entered` and its box, mode, looks, ticks
 *   to the next, what it does meanwhile, mind, look, sound owed and layered
 *   frames begun;
 * * `shelf` and whether the shelf holds each kind of sprite to 35, and for
 *   each case in `CURIOUS.TXT`, `curiosities seed`, and `curious` and the 50
 *   curiosities `GetCuriosities` lists;
 * * for each case in `LOCAL.TXT`, `local seed area` (`GetSpriteScreenArea`,
 *   606, of 0x1d), `stage` and what exploring reads, and after a tick of
 *   the cat's state, `localed` and its
 *   own machine's history, the global machine's, its energy, `+0x3502`, the
 *   action playing (`+0x1502`) and the last ten actions pushed (`+0x14a8`
 *   on, newest first), how many global states were asked for through the
 *   global machine's slot `0x1c` (none entered) and the first, the same of
 *   its own states through its machine's slot `0x14`, how many
 *   actions were pushed through the cat's
 *   slot `0xb8` and the first 8 in turn, and the fields `PreMoment` and
 *   passing the time set;
 * * for each case in `GLOBAL.TXT`, `global seed area` (`GetSpriteScreenArea`,
 *   606, of 0x1d), and once put in the global state, `globaled` and the
 *   cat's own machine's history (`+0x2556` on), the global machine's, its
 *   mode and its brains' effects;
 * * for each case in `CURSOR.TXT`, `cursor seed`, and after a tick of the
 *   moment with the cursor about, `cursored` and the cat's state, the global
 *   machine's history, `+0x35a2`, `+0x35a4`, `+0x35a6` and mode, then as
 *   `lingered`;
 * * for each case in `LINGER.TXT`, `linger seed`, and after a tick of the
 *   moment `lingered` and its looks, ticks to the next, what it does
 *   meanwhile, whether its mind is made up, where it looks (`+0x34cc`,
 *   `+0x34ce`), the sound owed, the layered frames begun, the action
 *   playing (`+0x1502`) and its state;
 * * `frame n state global action shown rotation left top right bottom seed`
 *   then its 12 brains' values, after each frame: its state (`+0x2552`),
 *   its global state (`+0x3a` of the machine `+0x2fba` points to), the
 *   action playing (`+0x1502`), the frame shown (`+0x692`), its rotation
 *   (`+0x688`), its rectangle (`+0x124`) and C's `rand` seed (`ds:28ba`).
 */
#include <dos.h>
#include <string.h>

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
typedef void(__cdecl __far *HANDLER)(void __far *cat, void __far *params, int enter, int leave);
typedef void(__cdecl __far *RESETSTACK)(void __far *sprite, int type);
typedef int(__cdecl __far *INSHELF)(void __far *apt, int type);
typedef int(__cdecl __far *SCREENSAVER)(void __far *params);
typedef int(__cdecl __far *REMAINING)(void __far *sprite);
typedef void(__cdecl __far *PLAIN_SPRITE)(void __far *sprite);
typedef void(__cdecl __far *GLOBALSTATE)(void __far *machine, int state, void __far *params);
typedef int(__cdecl __far *AREA)(void __far *cat, int kind);
typedef void(__cdecl __far *DISPATCH)(void __far *machine, void __far *params, int enter, int leave);

typedef void(__cdecl __far *PUSH)(void __far *sprite, int action, int variant);
typedef long(__cdecl __far *TARGETPT)(void __far *apt, int space);
typedef void __far *(__cdecl __far *GETKIN)(void __far *apt, int type);
typedef void(__cdecl __far *DRAWRECT)(int __far *rect, void __far *apt, int space);

#define DIRECTORY "C:\\CORPUS\\CATZPEN"
#define FRAMES 400

static unsigned char params[0x722];

/* A copy of the cat's class's table, its slot `0xb8` (`PushStoredAction`)
 * the recorder's; and the actions pushed through it, in turn. */
static unsigned char table[0x300];
static PUSH push;
static int pushed[8], pushes;

/* And a copy of the global machine's table, its slot `0x1c` (`NewState`)
 * the keeper's, which notes the global states asked for and enters none,
 * so a tick is held to its own step. */
static unsigned char globalTable[0x40];
static int globals[4], globalled;

static void __cdecl __far __loadds keep(void __far *machine, int state, void __far *params)
{
    (void)machine, (void)params;

    if (globalled < 4) {
        globals[globalled] = state;
    }

    globalled++;
}

/* The same for the cat's own machine (`+0x2518`), its slot `0x14`. */
static unsigned char localTable[0x40];
static int locals[4], localled;

static void __cdecl __far __loadds keepLocal(void __far *machine, int state, void __far *params)
{
    (void)machine, (void)params;

    if (localled < 4) {
        locals[localled] = state;
    }

    localled++;
}

/* And its slots `0xe0` (`SetHeadTracking`) and `0x2e0` (`LookAtUser`):
 * the first 4 calls, each its slot's and its first argument, passed on with
 * what else they were given. */
typedef void(__cdecl __far *LOOK)(void __far *sprite, int a, int b, int c, int d);
static LOOK track, lookAtUser;
static int looks[8], looked;

static void __cdecl __far __loadds tracking(void __far *sprite, int a, int b, int c, int d)
{
    if (looked < 4) {
        looks[2 * looked] = 0xe0, looks[2 * looked + 1] = a;
    }

    looked++;
    track(sprite, a, b, c, d);
}

static void __cdecl __far __loadds userward(void __far *sprite, int a, int b, int c, int d)
{
    if (looked < 4) {
        looks[2 * looked] = 0x2e0, looks[2 * looked + 1] = a;
    }

    looked++;
    lookAtUser(sprite, a, b, c, d);
}

static void __cdecl __far __loadds record(void __far *sprite, int action, int variant)
{
    if (pushes < 8) {
        pushed[pushes] = action;
    }

    pushes++;
    push(sprite, action, variant);
}

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

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
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

            /* And each of its 13 sounds' actions (`MapCatSound`, 483). */
            for (p = 0; p < 13; p++) {
                int value;

                *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
                value = ((MAPBEHAVIOR)ordinal(483))(cat, p);
                say("sound %d %d %lu\r\n", p, value,
                    *(unsigned long __far *)MK_FP(dgroup, 0x28ba));
            }
        }

        _lclose(file);
    }

    /* Each case in `MOMENT.TXT`, a line `seed`, the 12 brains' values and
     * `+0x35d2`: the cat in its moment (21, `+0x2552`) with its script done
     * (`ResetStack`, 951), its mind made up to go (`+0x3514`), its count
     * before looking about again not yet run down (`+0x3504`), the cursor
     * not minded (`+0x34ca`); then a tick of the moment (`DoCatMoment`,
     * 612), and what it chose. */
    file = _lopen(DIRECTORY "\\MOMENT.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        for (;;) {
            long seed = number(file);
            int shelf, saver;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            *(int __far *)(cat + 0x35d2) = (int)number(file);
            ((RESETSTACK)ordinal(951))(cat, 2);
            *(int __far *)(cat + 0x2552) = 21;
            *(int __far *)(cat + 0x3504) = 5;
            *(int __far *)(cat + 0x3502) = 0;
            *(int __far *)(cat + 0x3514) = 1;
            *(int __far *)(cat + 0x34ca) = 0;
            *(int __far *)(cat + 0x3508) = 0;
            *(int __far *)(cat + 0x3516) = 0;
            shelf = ((INSHELF)ordinal(38))(cat, 0xc);
            saver = ((SCREENSAVER)ordinal(1242))(params);

            say("moment %ld %d %d %d %d %d %d %d %d\r\n", seed, *(int __far *)(global + 0x3a),
                *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35d6),
                *(int __far *)(cat + 0x35d2), shelf, saver, *(int *)(params + 0xc4),
                *(int __far *)(cat + 0x35a6));

            /* The global machine's history marked, so each state it is put in
             * after shows: the first is what the moment chose. */
            for (b = 0; b < 10; b++) {
                *(int __far *)(global + 0x3e + 2 * b) = -2;
            }

            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            ((HANDLER)ordinal(612))(cat, params, 0, 0);

            say("chose %d %d", *(int __far *)(cat + 0x2552), *(int __far *)(global + 0x3a));

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(global + 0x3e + 2 * b));
            }

            say(" %d %d %d %d %d %d\r\n", *(int __far *)(cat + 0x35a4),
                *(int __far *)(cat + 0x35a6), *(int __far *)(cat + 0x35ce),
                *(int __far *)(cat + 0x3516), *(int __far *)(cat + 0x33be),
                *(int __far *)(cat + 0x3508));
        }

        _lclose(file);
    }

    /* Each case in `LINGER.TXT`: a line `seed`, the 12 brains' values and
     * their centres, then the moment's own `+0x3502` (looks), `+0x3504`
     * (ticks to the next), `+0x3506` (looks before it may go), `+0x3508`
     * (mode), `+0x350a` (what it does meanwhile), `+0x35a0` (a sound
     * owed) and the box it looks about in (`+0x350c` to `+0x3512`): the
     * cat so, in its moment (21), its script done and no layered action
     * playing (`ResetLayeredAction`, 957), its mind not made up
     * (`+0x3514`), the cursor not minded; a tick of the moment (612); and
     * the moment's fields after, and what layered action has begun
     * (`GetLayeredFramesRemaining`, 954). */
    file = _lopen(DIRECTORY "\\LINGER.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        static const int fields[] = {0x3502, 0x3504, 0x3506, 0x3508, 0x350a, 0x35a0,
                                     0x350c, 0x350e, 0x3510, 0x3512};

        for (;;) {
            long seed = number(file);
            int f, layered;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            for (f = 0; f < 10; f++) {
                *(int __far *)(cat + fields[f]) = (int)number(file);
            }

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(cat + 0x2552) = 21;
            *(int __far *)(cat + 0x3514) = 0;
            *(int __far *)(cat + 0x34ca) = 0;
            say("linger %ld\r\n", seed);

            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            ((HANDLER)ordinal(612))(cat, params, 0, 0);
            layered = ((REMAINING)ordinal(954))(cat);

            say("lingered %d %d %d %d %d %d %d %d", *(int __far *)(cat + 0x3502),
                *(int __far *)(cat + 0x3504), *(int __far *)(cat + 0x350a),
                *(int __far *)(cat + 0x3514), *(int __far *)(cat + 0x34cc),
                *(int __far *)(cat + 0x34ce), *(int __far *)(cat + 0x35a0), layered);
            say(" %d %d\r\n", *(int __far *)(cat + 0x1502), *(int __far *)(cat + 0x2552));
        }

        _lclose(file);
    }

    /* Each case in `ENTER.TXT`: a line `seed`, the 12 brains' values and
     * their centres, then the moment's mode (`+0x3508`), looks before it may
     * go (`+0x3506`), what it does meanwhile (`+0x350a`) and a sound owed
     * (`+0x35a0`): the cat so, facing the user (`+0x688`), its script done
     * and no layered action playing, in its moment (21); the moment begun
     * (612, entering), which goes on to a tick of it; and the stage, the box
     * it chose (`+0x350c` to `+0x3512`), its mode, and as `lingered`. */
    file = _lopen(DIRECTORY "\\ENTER.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        static const int fields[] = {0x3508, 0x3506, 0x350a, 0x35a0};

        for (;;) {
            long seed = number(file);
            int f, layered;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            for (f = 0; f < 4; f++) {
                *(int __far *)(cat + fields[f]) = (int)number(file);
            }

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(cat + 0x688) = 0;
            *(int __far *)(cat + 0x2552) = 21;
            say("enter %ld %d %d %d %d\r\n", seed, *(int __far *)MK_FP(dgroup, 0x2ba6),
                *(int __far *)MK_FP(dgroup, 0x2ba8), *(int __far *)MK_FP(dgroup, 0x2baa),
                *(int __far *)MK_FP(dgroup, 0x2bac));

            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            ((HANDLER)ordinal(612))(cat, params, 1, 0);
            layered = ((REMAINING)ordinal(954))(cat);

            say("entered %d %d %d %d %d", *(int __far *)(cat + 0x350c),
                *(int __far *)(cat + 0x350e), *(int __far *)(cat + 0x3510),
                *(int __far *)(cat + 0x3512), *(int __far *)(cat + 0x3508));
            say(" %d %d %d %d %d %d %d %d\r\n", *(int __far *)(cat + 0x3502),
                *(int __far *)(cat + 0x3504), *(int __far *)(cat + 0x350a),
                *(int __far *)(cat + 0x3514), *(int __far *)(cat + 0x34cc),
                *(int __far *)(cat + 0x34ce), *(int __far *)(cat + 0x35a0), layered);
        }

        _lclose(file);
    }

    /* Each case in `CURSOR.TXT`: a line `seed`, the 12 brains' values and
     * their centres, then the moment's looks before it may go (`+0x3506`),
     * what it does meanwhile and a sound owed: the cat in its moment (21),
     * minding the cursor (`+0x34ca`), the cursor about (`PetParams` `+0x46`),
     * its script done and no layered action playing, nothing it is after
     * (`+0x35a2`, `+0x35a4`, `+0x35a6`), the global machine's history marked;
     * a tick of the moment (612); and `cursored` and its state, the global
     * machine's history, `+0x35a2`, `+0x35a4`, `+0x35a6`, then as `lingered`
     * with its mode. */
    file = _lopen(DIRECTORY "\\CURSOR.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
        static const int fields[] = {0x3506, 0x350a, 0x35a0};

        for (;;) {
            long seed = number(file);
            int f, layered;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            for (f = 0; f < 3; f++) {
                *(int __far *)(cat + fields[f]) = (int)number(file);
            }

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(cat + 0x2552) = 21;
            *(int __far *)(cat + 0x34ca) = 1;
            *(int __far *)(params + 0x46) = 1;
            *(int __far *)(cat + 0x3508) = 0;
            *(int __far *)(cat + 0x3504) = 4;
            *(int __far *)(cat + 0x3514) = 0;
            *(int __far *)(cat + 0x35a2) = 0;
            *(int __far *)(cat + 0x35a4) = 0;
            *(int __far *)(cat + 0x35a6) = 0;

            for (b = 0; b < 10; b++) {
                *(int __far *)(global + 0x3e + 2 * b) = -2;
            }

            say("cursor %ld\r\n", seed);
            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            ((HANDLER)ordinal(612))(cat, params, 0, 0);
            layered = ((REMAINING)ordinal(954))(cat);
            *(int __far *)(params + 0x46) = 0;

            say("cursored %d", *(int __far *)(cat + 0x2552));

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(global + 0x3e + 2 * b));
            }

            say(" %d %d %d %d", *(int __far *)(cat + 0x35a2), *(int __far *)(cat + 0x35a4),
                *(int __far *)(cat + 0x35a6), *(int __far *)(cat + 0x3508));
            say(" %d %d %d %d %d %d %d %d\r\n", *(int __far *)(cat + 0x3502),
                *(int __far *)(cat + 0x3504), *(int __far *)(cat + 0x350a),
                *(int __far *)(cat + 0x3514), *(int __far *)(cat + 0x34cc),
                *(int __far *)(cat + 0x34ce), *(int __far *)(cat + 0x35a0), layered);
        }

        _lclose(file);
    }

    /* Each case in `GLOBAL.TXT`: a line `seed`, the 12 brains' values and
     * their centres, a global state to put the cat in, whether the cursor
     * has moved (`PetParams` `+0x104` on) and `+0x3574`: the cat with no
     * global state (`+0x3a` of its machine), both its machines' histories
     * marked, put in it (`GlobalCatStateMachine::NewState`, 488); and
     * `globaled` and the two histories, its mode and the effects set on its
     * brains (`+0x3622` to `+0x3628`). */
    file = _lopen(DIRECTORY "\\GLOBAL.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        for (;;) {
            long seed = number(file);
            int state, moved, area;

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            state = (int)number(file);
            moved = (int)number(file);
            *(int __far *)(cat + 0x3574) = (int)number(file);

            for (b = 0; b < 4; b++) {
                *(int *)(params + 0x104 + 2 * b) = b == 0 ? moved : 0;
            }

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(global + 0x3a) = 0;

            for (b = 0; b < 10; b++) {
                *(int __far *)(global + 0x3e + 2 * b) = -2;
                *(int __far *)(cat + 0x2556 + 2 * b) = -2;
            }

            for (b = 0; b < 4; b++) {
                *(int __far *)(cat + 0x3622 + 2 * b) = -1;
            }

            area = ((AREA)ordinal(606))(cat, 0x1d);
            say("global %ld %d\r\n", seed, area);
            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            ((GLOBALSTATE)ordinal(488))(global, state, params);

            say("globaled");

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(cat + 0x2556 + 2 * b));
            }

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(global + 0x3e + 2 * b));
            }

            say(" %d", *(int __far *)(cat + 0x3508));

            for (b = 0; b < 4; b++) {
                say(" %d", *(int __far *)(cat + 0x3622 + 2 * b));
            }

            say("\r\n");

            for (b = 0; b < 4; b++) {
                *(int *)(params + 0x104 + 2 * b) = 0;
            }
        }

        _lclose(file);
    }

    /* Each case in `CURIOUS.TXT`, a line `seed`, the 12 brains' values and
     * their centres: the cat looking at things (12) and idling (6), what it
     * is curious about (`GetCuriosities`, its
     * slot `0x240`), and `curious` and the 50 curiosities (`+0x362c` on).
     * First `shelf` and whether the shelf holds each kind of sprite to 35
     * (`isSpriteInShelf`, 38). */
    file = _lopen(DIRECTORY "\\CURIOUS.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        PLAIN_SPRITE curiosities = *(PLAIN_SPRITE __far *)(*(unsigned char __far *__far *)cat + 0x240);

        say("shelf");

        for (b = 0; b < 35; b++) {
            say(" %d", ((INSHELF)ordinal(38))(cat, b));
        }

        say("\r\n");

        for (;;) {
            long seed = number(file);

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            *(int __far *)(cat + 0x2552) = 12;
            *(int __far *)(*(unsigned char __far *__far *)(cat + 0x2fba) + 0x3a) = 6;
            say("curiosities %ld\r\n", seed);
            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            curiosities(cat);
            say("curious");

            for (b = 0; b < 50; b++) {
                say(" %d", *(int __far *)(cat + 0x362c + 2 * b));
            }

            say("\r\n");
        }

        _lclose(file);
    }

    /* Each case in `LOCAL.TXT`: a line `seed`, the 12 brains' values and
     * their centres, a state of the cat's own, a global state, `+0x3502`,
     * `+0x34ca`, `+0x3504`, `+0x1500`, the first 8 curiosities
     * (`+0x362c` on, the rest 0) and the cursor's rectangle (`PetParams`
     * `+0x104` on), whether it is entering, `+0x3508`, `+0x35fc`,
     * `+0x35a6`, `+0x35a2`, `+0x35ac`, and where it walks to (`+0x34cc`,
     * `+0x34ce`): the cat in them as it is (`+0x2552`; `+0x3a` of the global
     * machine), entering or not, its script done, no layered action playing,
     * both machines' histories and the actions pushed marked; a tick of its
     * state (its machine's slot 4, as `BaseNewState` calls it); and
     * `localed` and the two histories, its energy, `+0x3502`, the action
     * playing, the actions pushed, `+0x3504`, `+0x1500`, the layered
     * frames begun, where it walks to (`+0x34cc`, `+0x34ce`) and how
     * (`+0x35a8`), the calls to its head, the target point of its kin 0x16
     * and `+0x35ac`, `+0x34ca`, the moment's `+0x3516`, `+0x350a`,
     * `+0x3506` and `+0x3508`, and `+0x35a6` and `+0x35a4`. */
    file = _lopen(DIRECTORY "\\LOCAL.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
        unsigned char __far *machine = cat + 0x2518;
        void __far *original, __far *globalOriginal, __far *localOriginal;
        int done, enter, x35fc, x35a2, x35ac;
        DISPATCH dispatch = *(DISPATCH __far *)(*(unsigned char __far *__far *)machine + 4);

        for (;;) {
            long seed = number(file);

            if (seed < 0) {
                break;
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a) = (int)number(file);
            }

            for (b = 0; b < 12; b++) {
                *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42) = (int)number(file);
            }

            *(int __far *)(cat + 0x2552) = (int)number(file);
            *(int __far *)(global + 0x3a) = (int)number(file);
            *(int __far *)(cat + 0x3502) = (int)number(file);
            *(int __far *)(cat + 0x34ca) = (int)number(file);
            *(int __far *)(cat + 0x3504) = (int)number(file);
            done = (int)number(file);

            for (b = 0; b < 50; b++) {
                *(int __far *)(cat + 0x362c + 2 * b) = b < 8 ? (int)number(file) : 0;
            }

            for (b = 0; b < 4; b++) {
                *(int *)(params + 0x104 + 2 * b) = (int)number(file);
            }

            enter = (int)number(file);
            *(int __far *)(cat + 0x3508) = (int)number(file);
            x35fc = (int)number(file);
            *(int __far *)(cat + 0x35a6) = (int)number(file);
            x35a2 = (int)number(file);
            x35ac = (int)number(file);
            *(int __far *)(cat + 0x34cc) = (int)number(file);
            *(int __far *)(cat + 0x34ce) = (int)number(file);

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(cat + 0x1502) = -1;
            *(int __far *)(cat + 0x1500) = done;
            *(int __far *)(cat + 0x35fc) = x35fc;
            *(int __far *)(cat + 0x35a2) = x35a2;
            *(int __far *)(cat + 0x35ac) = x35ac;

            for (b = 0; b < 10; b++) {
                *(int __far *)(cat + 0x14a8 + 2 * b) = -1;
                *(int __far *)(global + 0x3e + 2 * b) = -2;
                *(int __far *)(cat + 0x2556 + 2 * b) = -2;
            }

            say("local %ld %d\r\n", seed, ((AREA)ordinal(606))(cat, 0x1d));

            /* What exploring reads: the stage (CATZDLL's `ds:2ba6` to
             * `2bac`), the cat's width and height (`+0x33c4`, `+0x33c6`),
             * its target point (`GetTargetPt`, 10, space 0) and the draw
             * rectangle of its kin 0x22 (`GetKin`, 18; `GetDrawRect`, 15). */
            {
                long point = ((TARGETPT)ordinal(10))(cat, 0);
                void __far *kin = ((GETKIN)ordinal(18))(cat, 0x22);
                int rect[4] = {0, 0, 0, 0};

                if (kin) {
                    ((DRAWRECT)ordinal(15))(rect, kin, 0);
                }

                say("stage %d %d %d %d %d %d %d %d %d %d %d %d %d\r\n",
                    *(int __far *)MK_FP(dgroup, 0x2ba6), *(int __far *)MK_FP(dgroup, 0x2ba8),
                    *(int __far *)MK_FP(dgroup, 0x2baa), *(int __far *)MK_FP(dgroup, 0x2bac),
                    *(int __far *)(cat + 0x33c4), *(int __far *)(cat + 0x33c6), (int)point,
                    (int)(point >> 16), kin != 0, rect[0], rect[1], rect[2], rect[3]);
            }
            original = *(void __far *__far *)cat;
            _fmemcpy(table, original, sizeof table);
            push = *(PUSH *)(table + 0xb8);
            *(PUSH *)(table + 0xb8) = record;
            track = *(LOOK *)(table + 0xe0);
            *(LOOK *)(table + 0xe0) = tracking;
            lookAtUser = *(LOOK *)(table + 0x2e0);
            *(LOOK *)(table + 0x2e0) = userward;
            looked = 0;
            *(void __far *__far *)cat = table;
            pushes = 0;
            globalOriginal = *(void __far *__far *)global;
            _fmemcpy(globalTable, globalOriginal, sizeof globalTable);
            *(GLOBALSTATE *)(globalTable + 0x1c) = keep;
            *(void __far *__far *)global = globalTable;
            globalled = 0;
            localOriginal = *(void __far *__far *)machine;
            _fmemcpy(localTable, localOriginal, sizeof localTable);
            *(GLOBALSTATE *)(localTable + 0x14) = keepLocal;
            *(void __far *__far *)machine = localTable;
            localled = 0;

            *(unsigned long __far *)MK_FP(dgroup, 0x28ba) = seed;
            dispatch(machine, params, enter, 0);
            *(void __far *__far *)cat = original;
            *(void __far *__far *)global = globalOriginal;
            *(void __far *__far *)machine = localOriginal;

            say("localed");

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(cat + 0x2556 + 2 * b));
            }

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(global + 0x3e + 2 * b));
            }

            say(" %d %d %d", *(int __far *)(cat + 0x2fda + 0x52 + 0x3a),
                *(int __far *)(cat + 0x3502), *(int __far *)(cat + 0x1502));

            for (b = 0; b < 10; b++) {
                say(" %d", *(int __far *)(cat + 0x14a8 + 2 * b));
            }

            say(" %d %d", globalled, globalled ? globals[0] : -1);
            say(" %d %d", localled, localled ? locals[0] : -1);
            say(" %d", pushes);

            for (b = 0; b < 8; b++) {
                say(" %d", b < pushes ? pushed[b] : -1);
            }

            say(" %d %d %d", *(int __far *)(cat + 0x3504), *(int __far *)(cat + 0x1500),
                ((REMAINING)ordinal(954))(cat));
            say(" %d %d %d", *(int __far *)(cat + 0x34cc), *(int __far *)(cat + 0x34ce),
                *(int __far *)(cat + 0x35a8));

            /* The calls to its head (`SetHeadTracking`, `LookAtUser`), the
             * target point of its kin 0x16 (`GetTargetPt`), and `+0x35ac`. */
            say(" %d", looked);

            for (b = 0; b < 8; b++) {
                say(" %d", b < 2 * looked ? looks[b] : -1);
            }

            {
                void __far *marker = ((GETKIN)ordinal(18))(cat, 0x16);
                long point = marker ? ((TARGETPT)ordinal(10))(marker, 0) : 0;

                say(" %d %d %d %d", marker != 0, (int)point, (int)(point >> 16),
                    *(int __far *)(cat + 0x35ac));
            }
            say(" %d %d %d %d %d %d %d\r\n", *(int __far *)(cat + 0x34ca),
                *(int __far *)(cat + 0x3516),
                *(int __far *)(cat + 0x350a), *(int __far *)(cat + 0x3506),
                *(int __far *)(cat + 0x3508), *(int __far *)(cat + 0x35a6),
                *(int __far *)(cat + 0x35a4));
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
