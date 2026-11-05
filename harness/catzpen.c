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
 * * following its day (`TRACE.TXT`, the number of frames, and no cases),
 *   `tick` and `ticked` for each tick of a state of its own;
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
typedef void(__cdecl __far *CATSTATE)(void __far *cat, int state, void __far *params);
typedef int(__cdecl __far *BOTTLED)(void __far *cat);
typedef int(__cdecl __far *GETSTATE)(void __far *machine);
typedef void(__cdecl __far *BOTTLEDO)(void __far *bottle);
typedef void(__cdecl __far *TOPEN)(void __far *apt, void __far *params);
typedef void(__cdecl __far *MOVEPT)(void __far *apt, int space, int __far *point);
typedef void(__cdecl __far *BALLPOINT)(void __far *ballz, int __far *point, void __far *state,
                                       int __far *rect, int ball);

typedef void(__cdecl __far *PUSH)(void __far *sprite, int action, int variant);
typedef long(__cdecl __far *TARGETPT)(void __far *apt, int space);
typedef void __far *(__cdecl __far *GETKIN)(void __far *apt, int type);
typedef void(__cdecl __far *DRAWRECT)(int __far *rect, void __far *apt, int space);
typedef void(__cdecl __far *MOVETO)(void __far *apt, int space, int __far *point);
typedef void(__cdecl __far *ORIENT)(void __far *cat, int ball, int __far *at, int kind, int __far *toy,
                                    int __far *facing, int __far *delta);
typedef int(__cdecl __far *MISS)(void __far *cat);
typedef int(__cdecl __far *CURSTATE)(void __far *machine);
typedef int(__cdecl __far *HELD)(void __far *cat, int kind);
typedef void(__cdecl __far *LETGO)(void __far *cat, int how);
typedef int(__cdecl __far *NOTICE)(void __far *cat, int kind, void __far *params);

#define DIRECTORY "C:\\CORPUS\\CATZPEN"
#define FRAMES 400

static unsigned char params[0x722];

/* A copy of the cat's class's table (0x600 bytes, more than its slots: a
 * slot past a shorter copy is called in a cat's day), its slot `0xb8`
 * (`PushStoredAction`)
 * the recorder's; and the actions pushed through it, in turn. */
static unsigned char table[0x600];
static PUSH push;
static int pushed[8], pushes;

/* And a copy of the global machine's table, its slot `0x1c` (`NewState`)
 * the keeper's, which notes the global states asked for and enters none,
 * so a tick is held to its own step. */
static unsigned char globalTable[0x40];
static int globals[4], globalled;

/* Following a cat's day, each keeper passes the state on to be entered. */
static GLOBALSTATE passGlobal, passLocal;

/* How deep the cat's machine's slot 4 is called, its tick at 1. */
static int depth;

/* Where the global state is changed outside the cat's tick, the same. */
static int outsideGlobal, outsideGlobalState, outsideGlobalWords[24];

/* A reflex watched (`keeping` 1): the seed as it first asks a new global
 * state, and that state, before its entering draws or moves on. */
static unsigned traceData;
static int keeping, keptGlobal;
static unsigned long keptSeed;

static void __cdecl __far __loadds keep(void __far *machine, int state, void __far *params)
{
    if (keeping == 1) {
        keptSeed = *(unsigned long __far *)MK_FP(traceData, 0x28ba);
        keptGlobal = state;
        keeping = 2;
    }

    if (!depth && !outsideGlobal++) {
        unsigned __far *from = (unsigned __far *)&machine - 2;
        int w;

        outsideGlobalState = state;

        for (w = 0; w < 24; w++) {
            outsideGlobalWords[w] = from[w];
        }
    }

    if (globalled < 4) {
        globals[globalled] = state;
    }

    globalled++;

    if (passGlobal) {
        passGlobal(machine, state, params);
    }
}

/* The same for the cat's own machine (`+0x2518`), its slot `0x14`. */
static unsigned char localTable[0x40];
static int locals[4], localled;

/* And where the cat's own state is changed outside its tick: the first 24
 * words of the stack from the keeper's return address up -- return
 * addresses among them, to be named by the segments' selectors, which the
 * trace writes as it begins -- for the next tick to write. */
static int outside, outsideState, outsideWords[24];


static void __cdecl __far __loadds keepLocal(void __far *machine, int state, void __far *params)
{
    if (!depth && !outside++) {
        unsigned __far *from = (unsigned __far *)&machine - 2;
        int w;

        outsideState = state;

        for (w = 0; w < 24; w++) {
            outsideWords[w] = from[w];
        }
    }

    if (localled < 4) {
        locals[localled] = state;
    }

    localled++;

    if (passLocal) {
        passLocal(machine, state, params);
    }
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

/* And its slots `0x304` (`GetOrientationInfo`) and `0x308`
 * (`GetSwatMissDistance`), which a swat calls after its script is popped and
 * the toy has moved: the first two calls' facing and the toy less the paw,
 * and the first two distances, each passed on. */
static ORIENT orient;
static MISS missing;
static int oriented, orientation[6], missed, misses[2];

/* And its slot `0x234` (`GetSpriteScreenArea`), which the moment asks of the
 * cat (0x1d) after its script is popped and has moved it: the first answer
 * for the cat, passed on. */
static AREA area;
static int placed, place;

/* And its slots `0x2e8` (`WhichBallBeingPet`), `0x2f8`
 * (`HasUserStoppedPetting`) and `0x2f0` (`GetCursorMovement`), which a
 * petted cat asks of the cursor over it: each call counted and its first
 * answer kept, passed on. */
typedef int(__cdecl __far *PETTED)(void __far *cat, void __far *params);
typedef int(__cdecl __far *MOVED)(void __far *cat);
static PETTED whichBall, stoppedPetting;
static MOVED cursorMoved, mouthToTeat;
static int balled, ball, stopped, stop, moved, movement, posed, mouthed, mouth;

static int __cdecl __far __loadds mouthing(void __far *cat)
{
    int at = mouthToTeat(cat);

    if (!mouthed++) {
        mouth = at;
    }

    return at;
}

static int __cdecl __far __loadds balling(void __far *cat, void __far *params)
{
    int at = whichBall(cat, params);

    if (!balled++) {
        ball = at;
    }

    return at;
}

static int __cdecl __far __loadds stopping(void __far *cat, void __far *params)
{
    int at = stoppedPetting(cat, params);

    if (!stopped++) {
        stop = at;
    }

    return at;
}

static int __cdecl __far __loadds moving(void __far *cat)
{
    int at = cursorMoved(cat);

    /* And its pose (`+0x1500`) then, its script popped. */
    if (!moved++) {
        movement = at;
        posed = *(int __far *)((unsigned char __far *)cat + 0x1500);
    }

    return at;
}

static int __cdecl __far __loadds placing(void __far *cat, int kind)
{
    int at = area(cat, kind);

    if (kind == 0x1d && !placed++) {
        place = at;
    }

    return at;
}

static void __cdecl __far __loadds orienting(void __far *cat, int ball, int __far *at, int kind,
                                              int __far *toy, int __far *facing, int __far *delta)
{
    orient(cat, ball, at, kind, toy, facing, delta);

    if (oriented < 2) {
        orientation[3 * oriented] = *facing;
        orientation[3 * oriented + 1] = delta[0];
        orientation[3 * oriented + 2] = delta[1];
    }

    oriented++;
}

static int __cdecl __far __loadds measuring(void __far *cat)
{
    int miss = missing(cat);

    if (missed < 2) {
        misses[missed] = miss;
    }

    missed++;
    return miss;
}

/* And its slot `0xa4`, which pushes words to its script up to 0x756f: the
 * first 6 words of the first call that steers it (`targetSprite4`, 0x756d),
 * and 16 words passed on, more than any call gives it. */
typedef void(__cdecl __far *WORDS)(void __far *sprite, int a, int b, int c, int d, int e, int f,
                                   int g, int h, int i, int j, int k, int l, int m, int n, int o,
                                   int p);
static WORDS words;
static int worded[6], wordings;

static void __cdecl __far __loadds wording(void __far *sprite, int a, int b, int c, int d, int e,
                                           int f, int g, int h, int i, int j, int k, int l, int m,
                                           int n, int o, int p)
{
    if (a == 0x756d && wordings++ == 0) {
        worded[0] = a, worded[1] = b, worded[2] = c, worded[3] = d, worded[4] = e, worded[5] = f;
    }

    words(sprite, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p);
}

static unsigned pushedBy[8];

/* And, following a day, C's `rand` seed after each push, and the order the
 * pushes finished in: a push may draw a script at random, and a script
 * popped pushes before its handler draws. */
static unsigned traceData;
static unsigned long pushedSeed[8];
static int pushedDone[8], finished;

static void __cdecl __far __loadds record(void __far *sprite, int action, int variant)
{
    int k;

    /* Who pushed it: the code segment it was called from, its return
     * address's, just below its first argument on the stack. */
    if (pushes < 8) {
        pushed[pushes] = action;
        pushedBy[pushes] = ((unsigned __far *)&sprite)[-1];
    }

    /* (A push pushes its transition through this slot too, so it is
     * counted before it is passed on.) */
    k = pushes++;
    push(sprite, action, variant);

    if (k < 8 && traceData) {
        pushedSeed[k] = *(unsigned long __far *)MK_FP(traceData, 0x28ba);
        pushedDone[k] = finished++;
    }
}

/* And C's `rand` itself (seg1:4b21), following a day: a far jump over its
 * start to this, which draws as it does -- the seed (`ds:28ba`) times
 * 0x15a4e35, plus 1, its high word less its top bit -- and keeps, for the
 * first 16 draws of a tick, the seed before each and whether script code
 * (seg40, seg41) drew it: called from it, its return address's code segment
 * just below its first argument, or, deeper, a return address into it on the
 * stack between here and the tick (`tickTop`), as a script's action may call
 * on the cat's code to draw. */
static int draws;
static unsigned long drawnSeed[48];
static unsigned drawnBy[48];
static unsigned __far *tickTop;

static int scripted(unsigned __far *from)
{
    unsigned pop = FP_SEG(ordinal(992)), reset = FP_SEG(ordinal(951));

    if (from[-1] == pop || from[-1] == reset) {
        return 1;
    }

    if (!tickTop || FP_SEG(from) != FP_SEG(tickTop)) {
        return 0;
    }

    for (; from + 1 < tickTop; from++) {
        if (from[1] == pop || from[1] == reset) {
            return 1;
        }
    }

    return 0;
}

static int __cdecl __far __loadds drawing(int unused)
{
    unsigned long __far *seed = (unsigned long __far *)MK_FP(traceData, 0x28ba);

    if (draws < 48) {
        drawnSeed[draws] = *seed;
        drawnBy[draws] = scripted((unsigned __far *)&unused);
    }

    draws++;
    *seed = *seed * 0x15a4e35ul + 1;
    return (int)(*seed >> 16) & 0x7fff;
}

typedef UINT(FAR PASCAL *CSTODS)(UINT selector);

static void hookRand(void)
{
    /* KERNEL's `AllocCSToDSAlias` (170): a selector to write the code by. */
    CSTODS alias16 = (CSTODS)GetProcAddress(GetModuleHandle("KERNEL"), MAKEINTRESOURCE(170));
    UINT alias = alias16(FP_SEG(ordinal(1)));
    unsigned char __far *code = (unsigned char __far *)MK_FP(alias, 0x4b21);
    int (__cdecl __far *to)(int) = drawing;

    code[0] = 0xea;
    *(unsigned __far *)(code + 1) = FP_OFF(to);
    *(unsigned __far *)(code + 3) = FP_SEG(to);
    FreeSelector(alias);
}

/* And `CatSprite::IsCatProximateToBottle` (848), which begging and
 * chasing the bottle call directly after popping their scripts: a far jump
 * over its start to this, which works it out as it does -- the bottle's
 * target point within a box twice the cat's width and height
 * (`MakeFocusRect`, its slot `0xd0`, by 8) about its ball 0x25 -- and keeps,
 * for the cat's tick, how many times it was asked and the first answer. */
typedef void(__cdecl __far *FOCUS)(void __far *cat, int __far *rect, int __far *point, int width,
                                   int height, int by);
typedef int(__cdecl __far *INRECT)(int __far *rect, int __far *point);
static int proximated, proximate;

static int __cdecl __far __loadds proximity(unsigned char __far *cat)
{
    unsigned char __far *ballz = *(unsigned char __far *__far *)(cat + 0x242);
    void __far *bottle = ((GETKIN)ordinal(18))(cat, 0xf);
    int rect[4], ball[2], focus[4], point[2];
    long at;
    int answer;

    ((DRAWRECT)ordinal(15))(rect, cat, 0);
    (*(BALLPOINT __far *)(*(unsigned char __far *__far *)ballz + 0x38))(ballz, ball, cat + 0x678,
                                                                       rect, 0x25);
    (*(FOCUS __far *)(*(unsigned char __far *__far *)cat + 0xd0))(
        cat, focus, ball, 2 * *(int __far *)(cat + 0x33c4), 2 * *(int __far *)(cat + 0x33c6), 8);
    at = ((TARGETPT)ordinal(10))(bottle, 0);
    point[0] = (int)at;
    point[1] = (int)(at >> 16);
    answer = ((INRECT)ordinal(1253))(focus, point);

    if (!proximated++) {
        proximate = answer;
    }

    return answer;
}

static void hookProximity(void)
{
    CSTODS alias16 = (CSTODS)GetProcAddress(GetModuleHandle("KERNEL"), MAKEINTRESOURCE(170));
    void __far *at = ordinal(848);
    UINT alias = alias16(FP_SEG(at));
    unsigned char __far *code = (unsigned char __far *)MK_FP(alias, FP_OFF(at));
    int (__cdecl __far *to)(unsigned char __far *) = proximity;

    code[0] = 0xea;
    *(unsigned __far *)(code + 1) = FP_OFF(to);
    *(unsigned __far *)(code + 3) = FP_SEG(to);
    FreeSelector(alias);
}

/* And `ScriptSprite::IsCued` (966), which answers as it does -- the cues of
 * the sprite (`+0x2514`, a bit each) -- and keeps, for the cat, the first 4
 * cues asked in a tick and their answers; and, where `TRACE.TXT` asks, on
 * every other tick of swatting (56) and begging (35) cues the cat as though
 * its script had -- to strike (5), to look (6) -- so the engine runs what it
 * does then; and, where it is put to pounce, of pouncing (3), to catch (2),
 * and with its victim (5, 6), to make its sounds (7). */
static unsigned char __far *traced;
/* The treat's own copy of its table (`TRACE.TXT`'s 128), its slot `0x24`
 * answering whether the user holds it out. */
static unsigned char treatTable[0x200];
static int treatHeld;

static int __cdecl __far __loadds treatHolding(void __far *treat)
{
    return treatHeld;
}

static long forcing;
static int forcedTicks, pouncedTicks, pounces, wrestledTicks, eatTicks, eats, fearTicks,
    fondTicks, suckTicks, treatTicks, napTicks, naps, badTicks, badDreams, groomTicks,
    ignoreTicks, sprayTicks, watchTicks, watches,
    deepTicks, lackTicks, lacks;
static unsigned long forced, forcedNow;
static int cloudCued, cloudTicks;

/* Napping (512), starting a dream (65) in its phase 1 (`+0x35da`) for 20
 * ticks: the cloud's cue that it has come (4), answered for it. */
static int cloudComing(unsigned char __far *cat)
{
    return forcing & 512 && *(int __far *)(cat + 0x2552) == 65 &&
           *(int __far *)(cat + 0x35da) == 1 && cloudTicks + 1 >= 20;
}

static int asked, askedCue[4], askedAnswer[4];

static int __cdecl __far __loadds cueing(unsigned char __far *sprite, int cue)
{
    unsigned long cues = *(unsigned long __far *)(sprite + 0x2514);
    int answer;

    if (sprite != traced) {
        return (int)((cues | (cloudCued && cue == 4 ? 1ul << 4 : 0)) >> cue) & 1;
    }

    answer = (int)((cues | forced) >> cue) & 1;

    if (asked < 4) {
        askedCue[asked] = cue, askedAnswer[asked] = answer;
    }

    asked++;
    return answer;
}

static void hookCued(void)
{
    CSTODS alias16 = (CSTODS)GetProcAddress(GetModuleHandle("KERNEL"), MAKEINTRESOURCE(170));
    void __far *at = ordinal(966);
    UINT alias = alias16(FP_SEG(at));
    unsigned char __far *code = (unsigned char __far *)MK_FP(alias, FP_OFF(at));
    int (__cdecl __far *to)(unsigned char __far *, int) = cueing;

    code[0] = 0xea;
    *(unsigned __far *)(code + 1) = FP_OFF(to);
    *(unsigned __far *)(code + 3) = FP_SEG(to);
    FreeSelector(alias);
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

/* Following a cat's day (`TRACE.TXT`): its machine's slot 4 wrapped, so that
 * each tick of a state of its own -- not those its entering calls -- is
 * written `tick` with C's `rand` seed, whether entered and left, and the
 * fields its handlers read, and then `ticked` with what it did. */
static DISPATCH handle;
static unsigned char __far *traced;
static unsigned traceData;

static void traceFields(unsigned char __far *cat)
{
    static const unsigned at[] = {0x2552, 0x3502, 0x34ca, 0x3504, 0x1500, 0x3508, 0x35fc, 0x35a6,
                                  0x35a2, 0x35ac, 0x34cc, 0x34ce, 0x688,  0x35aa, 0x35a8, 0x35f4,
                                  0x35ee, 0x35a4, 0x3516, 0x350a, 0x3506, 0x33be};
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    int b;

    say(" %d", *(int __far *)(global + 0x3a));

    for (b = 0; b < sizeof at / sizeof at[0]; b++) {
        say(" %d", *(int __far *)(cat + at[b]));
    }

    for (b = 0; b < 12; b++) {
        say(" %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a));
    }
}

static void __cdecl __far __loadds tracing(void __far *machine, void __far *p, int enter, int leave)
{
    unsigned char __far *cat = traced;
    int b;

    if (depth++) {
        handle(machine, p, enter, leave);
        depth--;
        return;
    }

    /* Where `TRACE.TXT` asks (2), on every fourth tick of stalking (2) or
     * swatting (56, 57) at something it plays with, the cat is put to pounce
     * (3), or in turn to snag (8) or dive (4), for its handler, as stalking
     * does (`CatSprite::NewState`, 497),
     * and on every fourth tick with its victim (5), to wrestle it (6), as
     * that does: the tick it leaves and the one it enters in are followed. */
    if (forcing & 2 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);

        if ((state == 2 || state == 56 || state == 57) &&
            ((GETKIN)ordinal(18))(cat, *(int __far *)(cat + 0x35a4)) && pouncedTicks++ % 4 == 3) {
            int pounce = pounces++ % 3;

            depth--;
            ((CATSTATE)ordinal(497))(cat, pounce == 0 ? 3 : pounce == 1 ? 8 : 4, p);
            return;
        }

        if (state == 5 && wrestledTicks++ % 4 == 3) {
            depth--;
            ((CATSTATE)ordinal(497))(cat, 6, p);
            return;
        }
    }

    /* And where it asks (4), on every tenth tick of prestalking (1),
     * looking at things (12), its moment (21), walking (23) or grooming
     * (31), the cat is put in turn to sniff a mouse hole (11), or to align
     * to eat (38) a piece of food (8), from the water bowl (0xd), from the
     * food bowl (0xc) or catnip (4), or to sniff the catnip (42), what it
     * plays with and walked to (`+0x35a4`, `+0x35a6`) the food. */
    if (forcing & 4 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);

        if ((state == 1 || state == 12 || state == 21 || state == 23 || state == 31) &&
            eatTicks++ % 10 == 9) {
            static const int foods[] = {0, 8, 0xd, 0xc, 4, 4};
            int which = eats++ % 6;

            if (which) {
                *(int __far *)(cat + 0x35a4) = *(int __far *)(cat + 0x35a6) = foods[which];
            }

            /* The food bowl and the catnip, filled where all but gone. */
            if (which == 3 && *(int __far *)(cat + 0x35d2) <= 1) {
                *(int __far *)(cat + 0x35d2) = 100;
            }

            if (which >= 4 && *(int __far *)(cat + 0x35d4) <= 0) {
                *(int __far *)(cat + 0x35d4) = 100;
            }

            depth--;
            ((CATSTATE)ordinal(497))(cat, which == 0 ? 11 : which == 5 ? 42 : 38, p);
            return;
        }
    }

    /* And where it asks (8), on every tenth tick of looking at things (12),
     * passing the time (19), its moment (21), walking (23) or grooming (31),
     * the cat is put in global state 17, scared, as the global machine's
     * `NewState` would (its slot `0x1c`) -- not scared already, so that it
     * may flee to its end. */
    if (forcing & 8 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            *(int __far *)(global + 0x3a) != 0x11 && fearTicks++ % 10 == 9) {
            depth--;
            passGlobal(global, 0x11, p);
            return;
        }
    }

    /* And so, on the 20th tick of every other watch scared (59), its flight
     * of 1 ended as its moment ends it (`DoGSMoment`, seg25:1c00): its way
     * (`+0x35a8`) turned, 1 and 2, and its special fear (61). */
    if (forcing & 8 && !enter && !leave && *(int __far *)(cat + 0x2552) == 59) {
        if (++watchTicks == 20 && watches++ & 1) {
            int __far *way = (int __far *)(cat + 0x35a8);

            *way = *way == 1 ? 2 : 1;
            depth--;
            ((CATSTATE)ordinal(497))(cat, 0x3d, p);
            return;
        }
    } else if (forcing & 8 && enter) {
        watchTicks = 0;
    }

    /* And where it asks (128), on every tenth tick of the same, the treat
     * held out, the cat waits for it (36), it what the cat plays with and
     * walks to. */

    if (forcing & 128 && !enter && !leave && treatHeld) {
        int state = *(int __far *)(cat + 0x2552);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            treatTicks++ % 10 == 9) {
            *(int __far *)(cat + 0x35a4) = *(int __far *)(cat + 0x35a6) = 0xb;
            depth--;
            ((CATSTATE)ordinal(497))(cat, 0x24, p);
            return;
        }
    }

    /* And where it asks (1024), on every tenth tick of looking at things,
     * passing the time, its moment or walking on, not grooming already,
     * grooming (13), to be let run to its end. */
    if (forcing & 1024 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23) &&
            *(int __far *)(global + 0x3a) != 13 && groomTicks++ % 10 == 9) {
            depth--;
            passGlobal(global, 13, p);
            return;
        }
    }

    /* And where it asks (4096), on every tenth tick of looking at things,
     * passing the time, its moment or walking on, not ignoring already, the
     * cat is shown the bottle (kin 0xf) or, in turn, the cursor (0x17), as
     * its messages show it what it will not play with: its
     * `ShouldNoticeAndIgnore` (slot `0x274`), which ignores it (12) where it
     * may, to go back after to the global state it was in. */
    if (forcing & 4096 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23) &&
            *(int __far *)(global + 0x3a) != 12 && ignoreTicks++ % 10 == 9) {
            depth--;

            if ((*(NOTICE __far *)(*(unsigned char __far *__far *)cat + 0x274))(
                    cat, ignoreTicks / 10 & 1 ? 0xf : 0x17, p)) {
                return;
            }

            depth++;
        }
    }

    /* And where it asks (8192), on every tenth tick of looking at things,
     * passing the time, its moment, walking on or grooming, not sprayed
     * already, the cat is sprayed (global 18) or, in turn, flea-sprayed or
     * coloured (19) -- every other time so, the user (kin 1) what it plays
     * with (`+0x35a4`), which its reaction asks. */
    if (forcing & 8192 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
        int now = *(int __far *)(global + 0x3a);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            now != 0x12 && now != 0x13 && sprayTicks++ % 10 == 9) {
            int turn = sprayTicks / 10 % 4;

            if (turn == 3) {
                *(int __far *)(cat + 0x35a4) = 1;
            }

            depth--;
            passGlobal(global, turn & 1 ? 0x13 : 0x12, p);
            return;
        }
    }

    /* And where it asks (16384) with petting (16), on every 40th tick of
     * being petted (50), its petting modes (`+0x351c`, 40, newest first)
     * all made 5 or, in turn, 6, as though it had settled so, deeper than
     * its behaviour 5 lets it go itself. */
    if (forcing & 16384 && !enter && !leave && *(int __far *)(cat + 0x2552) == 50 &&
        deepTicks++ % 40 == 39) {
        int mode = deepTicks / 40 & 1 ? 5 : 6;

        for (b = 0; b < 40; b++) {
            *(int __far *)(cat + 0x351c + 2 * b) = mode;
        }
    }

    /* And where it asks (512), on every tenth tick of the same, not napping
     * already, CatNapz (21), its dreams and the dog's chase. */
    if (forcing & 512 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            *(int __far *)(global + 0x3a) != 0x15 && napTicks++ % 10 == 9) {
            depth--;
            passGlobal(global, 0x15, p);

            /* The second time, the dog's chase (70), as one time in ten it
             * would be. */
            if (naps++ == 1 && *(int __far *)(cat + 0x2552) != 0x46) {
                ((CATSTATE)ordinal(497))(cat, 0x46, p);
            }
            return;
        }
    }

    /* And, napping (512), 20 ticks into a dream's float (65, phase 3), a
     * bad dream (67), as one time in four it would be; and in it, the breed
     * it dreams of (`+0x35ee`, which `LoadRandomLinezFile` draws, 0 to 8)
     * kept at 2 each tick, so that one time in two it goes on to the dream's
     * mouse (68). */
    if (forcing & 512 && !enter && !leave && *(int __far *)(cat + 0x2552) == 65 &&
        *(int __far *)(cat + 0x35da) == 3 && *(int __far *)(cat + 0x3502) == 20) {
        badTicks = 0;
        depth--;
        ((CATSTATE)ordinal(497))(cat, 67, p);
        return;
    }

    /* (And, every other bad dream, 300 ticks in, the dream's mouse (68), as
     * the coin it tosses at its end does not always give.) */
    if (forcing & 512 && !enter && !leave && *(int __far *)(cat + 0x2552) == 67) {
        *(int __far *)(cat + 0x35ee) = 2;

        if (++badTicks == 300 && badDreams++ & 1) {
            depth--;
            ((CATSTATE)ordinal(497))(cat, 68, p);
            return;
        }
    }

    /* And where it asks (64), on every tenth tick of the same, not suckling
     * already, suckling (5), so that it goes for the bottle. */
    if (forcing & 64 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            *(int __far *)(global + 0x3a) != 5 && suckTicks++ % 10 == 9) {
            depth--;
            passGlobal(global, 5, p);
            return;
        }
    }

    /* And where it asks (32), on every tenth tick of the same, not
     * affectionate already, affectionate (14), so that it walks to the
     * cursor. */
    if (forcing & 32 && !enter && !leave) {
        int state = *(int __far *)(cat + 0x2552);
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);

        if ((state == 12 || state == 19 || state == 21 || state == 23 || state == 31) &&
            *(int __far *)(global + 0x3a) != 0xe && fondTicks++ % 10 == 9) {
            depth--;
            passGlobal(*(void __far *__far *)(cat + 0x2fba), 0xe, p);
            return;
        }
    }

    /* And where it asks (32768) too, on the 5th tick of every other walk
     * on to the cursor, affectionate, the cat lacks affection (55), as
     * walking on's arrival puts it where its marker was pulled back onto
     * the stage (seg25:185e): it lets go (its slot `0x9c` 1) and 0x37. */
    if (forcing & 32768 && (enter || leave || *(int __far *)(cat + 0x2552) != 23 ||
                            *(int __far *)(*(unsigned char __far *__far *)(cat + 0x2fba) + 0x3a) != 0xe)) {
        lackTicks = 0;
    } else if (forcing & 32768) {
        if (++lackTicks == 5 && lacks++ & 1) {
            (*(LETGO __far *)(*(unsigned char __far *__far *)cat + 0x9c))(cat, 1);
            depth--;
            ((CATSTATE)ordinal(497))(cat, 0x37, p);
            return;
        }
    }

    say("tick %lu %d %d %d", *(unsigned long __far *)MK_FP(traceData, 0x28ba), enter, leave,
        ((AREA)ordinal(606))(cat, 0x1d));
    traceFields(cat);

    for (b = 0; b < 12; b++) {
        say(" %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42));
    }

    for (b = 0; b < 8; b++) {
        say(" %d", *(int __far *)(cat + 0x362c + 2 * b));
    }

    for (b = 0; b < 4; b++) {
        say(" %d", *(int *)(params + 0x104 + 2 * b));
    }

    {
        long point = ((TARGETPT)ordinal(10))(cat, 0);
        void __far *kin = ((GETKIN)ordinal(18))(cat, 0x22);
        void __far *marker = ((GETKIN)ordinal(18))(cat, 0x16);
        long mark = marker ? ((TARGETPT)ordinal(10))(marker, 0) : 0;
        int rect[4] = {0, 0, 0, 0}, own[4];

        if (kin) {
            ((DRAWRECT)ordinal(15))(rect, kin, 0);
        }

        ((DRAWRECT)ordinal(15))(own, cat, 0);
        say(" %d %d %d %d %d %d %d %d", *(int __far *)MK_FP(traceData, 0x2ba6),
            *(int __far *)MK_FP(traceData, 0x2ba8), *(int __far *)MK_FP(traceData, 0x2baa),
            *(int __far *)MK_FP(traceData, 0x2bac), *(int __far *)(cat + 0x33c4),
            *(int __far *)(cat + 0x33c6), (int)point, (int)(point >> 16));
        say(" %d %d %d %d %d %d %d %d %d %d %d %d", rect[0], rect[1], rect[2], rect[3], own[0],
            own[1], own[2], own[3], (int)mark, (int)(mark >> 16),
            ((REMAINING)ordinal(954))(cat), *(int *)(params + 0xc4));
    }

    /* And the moment's box (`+0x350c` to `+0x3512`), whether its mind is
     * made up (`+0x3514`), the sound owed (`+0x35a0`), `+0x35d2`, and
     * whether the cursor is about (`PetParams` `+0x46`). */
    say(" %d %d %d %d %d %d %d %d", *(int __far *)(cat + 0x350c), *(int __far *)(cat + 0x350e),
        *(int __far *)(cat + 0x3510), *(int __far *)(cat + 0x3512), *(int __far *)(cat + 0x3514),
        *(int __far *)(cat + 0x35a0), *(int __far *)(cat + 0x35d2), *(int *)(params + 0x46));

    /* And, where what it plays with (`+0x35a4`) is about, how it lies to its
     * paw, ball 0x31 (`GetOrientationInfo`, its slot `0x304`: which way it
     * faces, the toy less the paw, the paw, the toy), how far the paw misses
     * it (`GetSwatMissDistance`, `0x308`); the mouse's state (kin 0x1b, its
     * machine's slot 8), -1 for none; and the swat's fields (`+0x358e` to
     * `+0x3596`). */
    {
        unsigned char __far *table = *(unsigned char __far *__far *)cat;
        int at[2] = {0, 0}, toy[2] = {0, 0}, delta[2] = {0, 0}, facing = -1, miss = -1, mouse = -1;
        unsigned char __far *kin = ((GETKIN)ordinal(18))(cat, *(int __far *)(cat + 0x35a4));

        if (kin) {
            (*(ORIENT __far *)(table + 0x304))(cat, 0x31, at, *(int __far *)(cat + 0x35a4), toy,
                                               &facing, delta);
            miss = (*(MISS __far *)(table + 0x308))(cat);
        }

        kin = ((GETKIN)ordinal(18))(cat, 0x1b);

        if (kin) {
            unsigned char __far *machine = kin + 0x2518;

            mouse = (*(CURSTATE __far *)(*(unsigned char __far *__far *)machine + 8))(machine);
        }

        say(" %d %d %d %d %d %d %d %d %d", facing, delta[0], delta[1], at[0], at[1], toy[0], toy[1],
            miss, mouse);
        say(" %d %d %d %d %d", *(int __far *)(cat + 0x358e), *(int __far *)(cat + 0x3590),
            *(int __far *)(cat + 0x3592), *(int __far *)(cat + 0x3594), *(int __far *)(cat + 0x3596));

        /* And whether the user holds what it plays with
         * (`IsThisSpriteBeingHeld`, 521), the stalk's action (`+0x35b8`), and
         * where what it plays with is on the stage (`GetSpriteScreenArea`);
         * and whether the user holds what it walks to (`+0x35a6`), and
         * whether that is on the shelf (`isSpriteInShelf`), and whether it
         * is about and its target point. */
        say(" %d %d %d", ((HELD)ordinal(521))(cat, *(int __far *)(cat + 0x35a4)),
            *(int __far *)(cat + 0x35b8), ((AREA)ordinal(606))(cat, *(int __far *)(cat + 0x35a4)));
        say(" %d %d", ((HELD)ordinal(521))(cat, *(int __far *)(cat + 0x35a6)),
            ((INSHELF)ordinal(38))(cat, *(int __far *)(cat + 0x35a6)));

        /* And where what it walks to is (its target point), which a walk
         * keeps on the stage. */
        kin = ((GETKIN)ordinal(18))(cat, *(int __far *)(cat + 0x35a6));

        {
            long point = kin ? ((TARGETPT)ordinal(10))(kin, 0) : 0;

            say(" %d %d %d", kin != 0, (int)point, (int)(point >> 16));
        }

        /* And, for a strike, whether what it plays with is on the shelf, the
         * shelf closed (`XApt::m_nShelfClosed`, 119), and its `+0x1d0`,
         * which `ShelfToPen` asks. */
        kin = ((GETKIN)ordinal(18))(cat, *(int __far *)(cat + 0x35a4));
        say(" %d %d %d", ((INSHELF)ordinal(38))(cat, *(int __far *)(cat + 0x35a4)),
            *(int __far *)ordinal(119), kin ? *(int __far *)(kin + 0x1d0) : -1);

        /* And `+0xee0`, which a pounce asks of its catch, `+0x35be`,
         * whether it has let its victim go, `+0x35b6`, how it watches
         * lazily, and the cursor's (kin 0x17) target point, which a snag
         * pounce aims at. */
        say(" %d %d %d", *(int __far *)(cat + 0xee0), *(int __far *)(cat + 0x35be),
            *(int __far *)(cat + 0x35b6));
        kin = ((GETKIN)ordinal(18))(cat, 0x17);

        {
            long point = kin ? ((TARGETPT)ordinal(10))(kin, 0) : 0;

            say(" %d %d", (int)point, (int)(point >> 16));
        }

        /* And `+0x35d4`, the catnip left; and, petted, its rate
         * (`+0x356e`), `+0x3570`, `+0x3572`, `+0x3576`, where the cursor was
         * (`+0x3518`, `+0x351a`), the cursor's action (`+0x362a`), the mode
         * it came to may-end with (`+0x356c`), and the first 30 of its
         * petting modes (`+0x351c` on), newest first. */
        say(" %d %d %d %d %d %d %d %d", *(int __far *)(cat + 0x35d4),
            *(int __far *)(cat + 0x356e), *(int __far *)(cat + 0x3570),
            *(int __far *)(cat + 0x3572), *(int __far *)(cat + 0x3576),
            *(int __far *)(cat + 0x3518), *(int __far *)(cat + 0x351a),
            *(int __far *)(cat + 0x362a));
        say(" %d", *(int __far *)(cat + 0x356c));

        for (b = 0; b < 30; b++) {
            say(" %d", *(int __far *)(cat + 0x351c + 2 * b));
        }

        /* And, affectionate, where its ball 7 is (its ballz' slot `0x38`,
         * by its draw rectangle and frame), the cursor's point it keeps
         * (`+0x35c2`, `+0x35c4`) and the stage it keeps lacking affection
         * (`+0x3598` to `+0x359e`). */
        {
            unsigned char __far *ballz = *(unsigned char __far *__far *)(cat + 0x242);
            int rect[4], point[2] = {0, 0};

            ((DRAWRECT)ordinal(15))(rect, cat, 0);
            (*(BALLPOINT __far *)(*(unsigned char __far *__far *)ballz + 0x38))(
                ballz, point, cat + 0x678, rect, 7);
            say(" %d %d %d %d %d %d %d %d", point[0], point[1], *(int __far *)(cat + 0x35c2),
                *(int __far *)(cat + 0x35c4), *(int __far *)(cat + 0x3598),
                *(int __far *)(cat + 0x359a), *(int __far *)(cat + 0x359c),
                *(int __far *)(cat + 0x359e));
        }

        /* And its bottle (kin 0xf): whether the user holds it (`+0xfc`), its
         * `+0x1da`, whether it is on the shelf, its target point, and, as
         * the tick begins, whether the cat is near it
         * (`IsCatProximateToBottle`, 848) and its mouth's distance from the
         * teat (`MouthToNippleDist`, 844), `+0x1d8`, 3 where held as a toy
         * is (`XApt::IsThisBeingHeld`), and `+0x2520`, how far from the
         * teat its mouth may be suckling. */
        kin = ((GETKIN)ordinal(18))(cat, 0xf);

        if (kin) {
            long point = ((TARGETPT)ordinal(10))(kin, 0);

            say(" %d %d %d %d %d %d %d %d %d", *(int __far *)(kin + 0xfc),
                *(int __far *)(kin + 0x1da), ((INSHELF)ordinal(38))(cat, 0xf), (int)point,
                (int)(point >> 16), ((BOTTLED)ordinal(848))(cat), ((BOTTLED)ordinal(844))(cat),
                *(int __far *)(kin + 0x1d8), *(int __far *)(kin + 0x2520));
        } else {
            say(" -1 -1 -1 0 0 0 0 0 0");
        }

        /* And the first change of its own state and of its global state
         * since, made outside a tick, each with the stack then. */
        say(" %d %d", outside, outside ? outsideState : -1);

        for (b = 0; b < 24; b++) {
            say(" %u", outside ? (unsigned)outsideWords[b] : 0u);
        }

        say(" %d %d", outsideGlobal, outsideGlobal ? outsideGlobalState : -1);

        for (b = 0; b < 24; b++) {
            say(" %u", outsideGlobal ? (unsigned)outsideGlobalWords[b] : 0u);
        }

        /* And, in the Adoption Kit, its basket's fields (`+0x3610`, `+0x3612`,
         * `+0x360e`, `+0x35f6`, `+0x3614` on, 5), `PetParams` `+0xca`, how many
         * the apt's root has (`+0x1e0`), and the mouse's (kin 0x1b) state (its
         * machine's slot 8). */
        {
            unsigned char __far *root = *(unsigned char __far *__far *)ordinal(70);
            unsigned char __far *mouse = ((GETKIN)ordinal(18))(cat, 0x1b);

            say(" %d %d %d %d", *(int __far *)(cat + 0x3610), *(int __far *)(cat + 0x3612),
                *(int __far *)(cat + 0x360e), *(int __far *)(cat + 0x35f6));

            for (b = 0; b < 5; b++) {
                say(" %d", *(int __far *)(cat + 0x3614 + 2 * b));
            }

            say(" %d %d %d", *(int *)(params + 0xca), root ? *(int __far *)(root + 0x1e0) : -1,
                mouse ? (*(GETSTATE __far *)(*(unsigned char __far *__far *)(mouse + 0x2518) +
                                            8))(mouse + 0x2518)
                      : -1);
        }

        /* And, dreaming, the dream's phase (`+0x35da`), what it dreams of
         * (`+0x35ec`) and `+0x35d8`; whether the cloud (kin 0x10) is cued
         * to have come (4) and to be done (0), as it answers the dream; where
         * the dream's float has it (`+0x35dc`, `+0x35e4`, doubles, by their
         * words); the stage the dream keeps to (`ds:2ba6` to `ds:2bac`); and
         * where the dream's mouse (kin 0x1b) and the dog (kin 0x1a) are across. */
        {
            unsigned char __far *cloud = ((GETKIN)ordinal(18))(cat, 0x10);
            unsigned char __far *mouse = ((GETKIN)ordinal(18))(cat, 0x1b);
            unsigned char __far *dog = ((GETKIN)ordinal(18))(cat, 0x1a);
            unsigned long cues = cloud ? *(unsigned long __far *)(cloud + 0x2514) : 0;

            say(" %d %d %d %d %d", *(int __far *)(cat + 0x35da), *(int __far *)(cat + 0x35ec),
                *(int __far *)(cat + 0x35d8), (int)(cues >> 4 & 1) | cloudComing(cat),
                (int)(cues & 1));

            for (b = 0; b < 8; b++) {
                say(" %u", *(unsigned __far *)(cat + 0x35dc + 2 * b));
            }

            for (b = 0; b < 4; b++) {
                say(" %d", *(int __far *)MK_FP(traceData, 0x2ba6 + 2 * b));
            }

            say(" %d", mouse ? (int)((TARGETPT)ordinal(10))(mouse, 0) : 0);
            say(" %d", dog ? (int)((TARGETPT)ordinal(10))(dog, 0) : 0);
        }

        /* And the global state ignoring goes back to (`+0x35b4`); and,
         * for its reflexes, how many ticks before it looks for extreme
         * situations (`+0x358c`) and `+0x3574`, which they clear. */
        say(" %d %d %d", *(int __far *)(cat + 0x35b4), *(int __far *)(cat + 0x358c),
            *(int __far *)(cat + 0x3574));

        /* And the buttons (`PetParams` `+0xa`, `+0xc`), which dangling asks. */
        say(" %d %d", *(int *)(params + 0xa), *(int *)(params + 0xc));

        say("\r\n");
        outside = outsideGlobal = 0;
    }

    pushes = globalled = localled = looked = wordings = oriented = missed = finished = draws =
        asked = placed = balled = stopped = moved = proximated = mouthed = 0;
    {
        int state = *(int __far *)(cat + 0x2552);

        forced = forcing & 1 && (state == 56 || state == 35) && forcedTicks++ & 1
                     ? 1ul << (state == 56 ? 5 : 6)
                     : 0;

        /* And, put to pounce, on every other tick of pouncing (3), to catch
         * (2), and with its victim (5, 6), to make its sounds (7). */
        if (forcing & 2 && (state == 3 || state == 5 || state == 6) && forcedTicks++ & 1) {
            forced = 1ul << (state == 3 ? 2 : 7);
        }

        /* And, napping (512), starting a dream (65): its script's cue to
         * dream (6) on the second tick, once (`+0x35da`, the dream's phase,
         * nought till then), and the cloud's that it has come (4) on the
         * twentieth after: the cloud runs no script in the pen. */
        cloudCued = 0;
        if (forcing & 512 && state == 65) {
            int phase = *(int __far *)(cat + 0x35da);

            if (phase == 0 && forcedTicks++ & 1) {
                forced = 1ul << 6;
            }
            cloudCued = cloudComing(cat);
            cloudTicks = phase == 1 ? cloudTicks + 1 : 0;
        }
        forcedNow = forced;
    }
    tickTop = (unsigned __far *)&cat;
    handle(machine, p, enter, leave);
    tickTop = 0;
    forced = 0;

    say("ticked %d %d %d %d %d", globalled, globalled ? globals[0] : -1, localled,
        localled ? locals[0] : -1, pushes);

    for (b = 0; b < 4; b++) {
        say(" %d", b < pushes ? pushed[b] : -1);
    }

    /* And whether each was pushed by its script going on: from
     * `ScriptSprite`'s code (seg40, as `ResetStack`, 951; seg41, as
     * `PopScript`, 992), not the handler's. */
    for (b = 0; b < 4; b++) {
        say(" %d", b < pushes ? pushedBy[b] == FP_SEG(ordinal(992)) ||
                                    pushedBy[b] == FP_SEG(ordinal(951))
                              : -1);
    }

    say(" %d", looked);

    for (b = 0; b < 4; b++) {
        say(" %d", b < 2 * looked ? looks[b] : -1);
    }

    say(" %d", wordings);

    for (b = 0; b < 6; b++) {
        say(" %d", wordings ? worded[b] : -1);
    }

    traceFields(cat);
    say(" %d", ((REMAINING)ordinal(954))(cat));
    say(" %d %d %d %d %d %d %d", oriented, oriented ? orientation[0] : -1,
        oriented ? orientation[1] : 0, oriented ? orientation[2] : 0, missed,
        missed ? misses[0] : -1, missed > 1 ? misses[1] : -1);

    for (b = 0; b < 4; b++) {
        say(" %lu %d", b < pushes ? pushedSeed[b] : 0ul, b < pushes ? pushedDone[b] : -1);
    }

    /* And the draws of C's `rand`: how many, and the seed before each and
     * whether script code (seg40, seg41) drew it. */
    say(" %d", draws);

    for (b = 0; b < 16; b++) {
        say(" %lu %d", b < draws ? drawnSeed[b] : 0ul, b < draws ? drawnBy[b] : -1);
    }


    /* And the second call to its slot `0x304`: a swat that pushes as it is
     * cued to strike asks again. */
    say(" %d %d %d", oriented > 1 ? orientation[3] : -1, oriented > 1 ? orientation[4] : 0,
        oriented > 1 ? orientation[5] : 0);

    /* And the cues it was given as though its script had cued them. */
    say(" %d", (int)forcedNow);

    /* And the cues the cat's handler asked about, and the answers. */
    say(" %d", asked);

    for (b = 0; b < 4; b++) {
        say(" %d %d", b < asked ? askedCue[b] : -1, b < asked ? askedAnswer[b] : -1);
    }

    /* And where it was on the stage as its handler first asked, and, petted,
     * the ball under the cursor, whether the user stopped and how far the
     * cursor moved, as it first asked each, and its pose as it asked the
     * last. */
    say(" %d %d %d %d %d %d %d %d %d", placed, placed ? place : -1, balled,
        balled ? ball : -1, stopped, stopped ? stop : -1, moved, moved ? movement : -1,
        moved ? posed : -1);

    /* And whether it was near its bottle as it first asked, its mouth's
     * distance from the teat as it first asked (its slot `0x358`), and the
     * 17th to 48th draws, as the first 16. */
    say(" %d %d %d %d", proximated, proximated ? proximate : -1, mouthed, mouthed ? mouth : -1);

    for (b = 16; b < 48; b++) {
        say(" %lu %d", b < draws ? drawnSeed[b] : 0ul, b < draws ? drawnBy[b] : -1);
    }

    say("\r\n");
    depth--;
}

/* The recorders put in the cat's, its machine's and the global machine's
 * tables for good, each passing on what it is given. */
/* And its reflex `HandleCursorWiggling` (slot `0x128`), each call kept
 * whole: the seed before; its state, global state, `+0x35a4` and `+0x35d6`;
 * the ring of where the cursor went (`+0x34d2` its index, `+0x34fc`,
 * `+0x34fe` where it was, the 20 at `+0x34d4`) and `+0x33b8`; the cursor's
 * (kin 0x17) target point; its brains and their centres; and after, on a
 * line of its own (`wiggled`), the index, where the cursor was, the ring's word at the index before,
 * `+0x33b8`, its global state, `+0x35a4` and the seed -- the global state it
 * asked and the seed as it did, where it did, before that state's entering
 * drew or moved on. */
typedef void(__cdecl __far *REFLEX)(void __far *cat, void __far *params);
static REFLEX wiggle;

static void __cdecl __far __loadds wiggling(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    unsigned char __far *cursor = ((GETKIN)ordinal(18))(cat, 0x17);
    long point = cursor ? ((TARGETPT)ordinal(10))(cursor, 0) : 0;
    int index = *(int __far *)(cat + 0x34d2);
    int b;

    say("wiggle %lu %d %d %d %d %d %d %d", *(unsigned long __far *)MK_FP(traceData, 0x28ba),
        *(int __far *)(cat + 0x2552), *(int __far *)(global + 0x3a),
        *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35d6), index,
        *(int __far *)(cat + 0x34fc), *(int __far *)(cat + 0x34fe));

    for (b = 0; b < 20; b++) {
        say(" %d", *(int __far *)(cat + 0x34d4 + 2 * b));
    }

    say(" %d %d %d", *(int __far *)(cat + 0x33b8), (int)point, (int)(point >> 16));

    for (b = 0; b < 12; b++) {
        say(" %d %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a),
            *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42));
    }

    /* Reacting, it may leave its state, whose tick is written between:
     * what came after is a line of its own. */
    say("\r\n");
    keeping = 1;
    wiggle(sprite, params);
    global = *(unsigned char __far *__far *)(cat + 0x2fba);
    say("wiggled %d %d %d %d %d %d %d %lu\r\n", *(int __far *)(cat + 0x34d2),
        *(int __far *)(cat + 0x34fc), *(int __far *)(cat + 0x34fe),
        index >= 0 && index < 20 ? *(int __far *)(cat + 0x34d4 + 2 * index) : -1,
        *(int __far *)(cat + 0x33b8), keeping == 2 ? keptGlobal : *(int __far *)(global + 0x3a),
        *(int __far *)(cat + 0x35a4),
        keeping == 2 ? keptSeed : *(unsigned long __far *)MK_FP(traceData, 0x28ba));
    keeping = 0;
}

/* And its reflex `HandleCatExtremeSituations` (slot `0x130`), each call
 * kept whole: the seed, `+0x358c`, `PetParams` `+0xc4`, its state, global
 * state, `+0x35a4` and `+0x35d6`, and its brains and their centres, by
 * pairs; and after, `+0x358c`, `+0x3574`, its brains and the seed. */
static REFLEX extreme;

static void __cdecl __far __loadds extremes(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    int b;

    say("extreme %lu %d %d %d %d %d %d", *(unsigned long __far *)MK_FP(traceData, 0x28ba),
        *(int __far *)(cat + 0x358c), *(int __far *)((unsigned char __far *)params + 0xc4),
        *(int __far *)(cat + 0x2552), *(int __far *)(global + 0x3a),
        *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35d6));

    for (b = 0; b < 12; b++) {
        say(" %d %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a),
            *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42));
    }

    extreme(sprite, params);
    say(" %d %d", *(int __far *)(cat + 0x358c), *(int __far *)(cat + 0x3574));

    for (b = 0; b < 12; b++) {
        say(" %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a));
    }

    say(" %lu\r\n", *(unsigned long __far *)MK_FP(traceData, 0x28ba));
}

/* And its reflex `HandleCatSeesMouse` (slot `0x134`), each call kept
 * whole: the seed; the mouse's (kin 0x1b) state, or -1 without one, and its
 * target point; the cat's; the stage (`ds:2ba6` on); `+0x33bc`; its state,
 * global state, `+0x35a4`, `+0x35d6` and `+0x35b6`; and its brains and
 * centres, by pairs. After, on a line of its own (`saw`), the global state
 * it asked and the seed as it did, where it did (else its global state and
 * the seed after), `+0x35a4`, `+0x35b6`, `+0x33bc`, and how many times it
 * turned its head (`SetHeadTracking`, slot `0xe0`). */
static REFLEX seeMouse;

static void __cdecl __far __loadds seeing(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    unsigned char __far *mouse = ((GETKIN)ordinal(18))(cat, 0x1b);
    long point = mouse ? ((TARGETPT)ordinal(10))(mouse, 0) : 0;
    long at = ((TARGETPT)ordinal(10))(cat, 0);
    int state = -1;
    int was = looked;
    int b;

    if (mouse) {
        unsigned char __far *machine = mouse + 0x2518;

        state = (*(CURSTATE __far *)(*(unsigned char __far *__far *)machine + 8))(machine);
    }

    say("mouse %lu %d %d %d %d %d", *(unsigned long __far *)MK_FP(traceData, 0x28ba), state,
        (int)point, (int)(point >> 16), (int)at, (int)(at >> 16));

    for (b = 0; b < 4; b++) {
        say(" %d", *(int __far *)MK_FP(traceData, 0x2ba6 + 2 * b));
    }

    say(" %d %d %d %d %d %d", *(int __far *)(cat + 0x33bc), *(int __far *)(cat + 0x2552),
        *(int __far *)(global + 0x3a), *(int __far *)(cat + 0x35a4),
        *(int __far *)(cat + 0x35d6), *(int __far *)(cat + 0x35b6));

    for (b = 0; b < 12; b++) {
        say(" %d %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a),
            *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42));
    }

    say("\r\n");
    keeping = 1;
    seeMouse(sprite, params);
    global = *(unsigned char __far *__far *)(cat + 0x2fba);
    say("saw %d %lu %d %d %d %d\r\n", keeping == 2 ? keptGlobal : *(int __far *)(global + 0x3a),
        keeping == 2 ? keptSeed : *(unsigned long __far *)MK_FP(traceData, 0x28ba),
        *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35b6), *(int __far *)(cat + 0x33bc),
        looked - was);
    keeping = 0;
}

/* And its reflex `HandleScruff` (slot `0x120`), each call kept whole --
 * only where the button is down (`PetParams` `+0xa` or `+0xc`), to keep the
 * trace short: `+0xa`, `+0xc`; ball 2 where it is drawn (its ballz' slot
 * `0x38` on its draw rectangle and frame, `+0x678`, as the reflex asks);
 * the cursor's point (`+0x5a`); `+0x9e`; its target point; kin 0x22's draw
 * rectangle; its state, global state, `+0x35fc`, `+0x35fa`, `+0x35f6`,
 * `+0x35f8` and `+0xfc`. After (`scruffed`): its state, `+0xfc` and
 * `+0x35f6`. */
typedef void(__cdecl __far *BALLAT)(void __far *ballz, int __far *at, void __far *frame,
                                    int __far *rect, int ball);
static REFLEX scruff;

static void __cdecl __far __loadds scruffing(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    unsigned char __far *p = params;

    if (*(int __far *)(p + 0xa) || *(int __far *)(p + 0xc)) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
        unsigned char __far *ballz = *(unsigned char __far *__far *)(cat + 0x242);
        unsigned char __far *hide = ((GETKIN)ordinal(18))(cat, 0x22);
        long point = ((TARGETPT)ordinal(10))(cat, 0);
        int rect[4], hidden[4] = {0, 0, 0, 0}, at[2] = {0, 0};

        ((DRAWRECT)ordinal(15))(rect, cat, 0);
        (*(BALLAT __far *)(*(unsigned char __far *__far *)ballz + 0x38))(ballz, at, cat + 0x678,
                                                                          rect, 2);

        if (hide) {
            ((DRAWRECT)ordinal(15))(hidden, hide, 0);
        }

        say("scruff %d %d %d %d %d %d %d %d %d", *(int __far *)(p + 0xa), *(int __far *)(p + 0xc),
            at[0], at[1], *(int __far *)(p + 0x5a), *(int __far *)(p + 0x5c),
            *(unsigned __far *)(cat + 0x9e), (int)point, (int)(point >> 16));
        say(" %d %d %d %d %d %d %d %d %d %d %d\r\n", hidden[0], hidden[1], hidden[2], hidden[3],
            *(int __far *)(cat + 0x2552), *(int __far *)(global + 0x3a),
            *(int __far *)(cat + 0x35fc), *(int __far *)(cat + 0x35fa),
            *(int __far *)(cat + 0x35f6), *(int __far *)(cat + 0x35f8), *(int __far *)(cat + 0xfc));
        scruff(sprite, params);
        say("scruffed %d %d %d\r\n", *(int __far *)(cat + 0x2552), *(int __far *)(cat + 0xfc),
            *(int __far *)(cat + 0x35f6));
        return;
    }

    scruff(sprite, params);
}

/* And its reflex `HandlePurring` (slot `0x140`), each call kept where
 * something is asked of it (`+0x3572` not 0): `+0x3570` and `+0x3572`,
 * before and after (`purr`). */
static REFLEX purr;

static void __cdecl __far __loadds purring(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    int was = *(int __far *)(cat + 0x3570), asked = *(int __far *)(cat + 0x3572);

    purr(sprite, params);

    if (asked) {
        say("purr %d %d %d %d\r\n", was, asked, *(int __far *)(cat + 0x3570),
            *(int __far *)(cat + 0x3572));
    }
}

/* And its reflex `HandleCatAptMessages` (slot `0x138`), each call kept
 * where a message waits (`+0x33c0`): the seed, the message, `PetParams`
 * `+0xc4`, its state, global state, `+0x35a4`, `+0x35a6`, `+0x35d6`,
 * `+0x35fc`, `+0x35b2`, where it is placed (its slot `0x234` of 0x1d, asked
 * of the slot itself, not the tick's recorder), the mouse's state (-1
 * without one), its brains and centres by pairs, whether the treat (kin
 * 0xb) is on the shelf, its draw rectangle, and the spray's and flea spray's
 * target points. After (`messaged`):
 * the global state it asked and the seed as it did, where it did (else its
 * global state and the seed after), its state, `+0x35a4`, `+0x35d6`,
 * `+0x35b0`, `+0x35b2`, `+0x35b4`, and the head turns and pushes made. */
static REFLEX messages;

static void __cdecl __far __loadds messaging(void __far *sprite, void __far *params)
{
    unsigned char __far *cat = sprite;
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    unsigned char __far *mouse = ((GETKIN)ordinal(18))(cat, 0x1b);
    int message = *(int __far *)(cat + 0x33c0);
    int heads = looked, pushed = pushes;
    int mouseState = -1;
    int b;

    if (!message) {
        messages(sprite, params);
        return;
    }

    if (mouse) {
        unsigned char __far *machine = mouse + 0x2518;

        mouseState = (*(CURSTATE __far *)(*(unsigned char __far *__far *)machine + 8))(machine);
    }

    say("message %lu %d %d %d %d %d %d %d %d %d %d %d", *(unsigned long __far *)MK_FP(traceData, 0x28ba),
        message, *(int __far *)((unsigned char __far *)params + 0xc4),
        *(int __far *)(cat + 0x2552), *(int __far *)(global + 0x3a),
        *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35a6),
        *(int __far *)(cat + 0x35d6), *(int __far *)(cat + 0x35fc),
        *(int __far *)(cat + 0x35b2), area(cat, 0x1d), mouseState);

    for (b = 0; b < 12; b++) {
        say(" %d %d", *(int __far *)(cat + 0x2fda + 0x52 * b + 0x3a),
            *(int __far *)(cat + 0x2fda + 0x52 * b + 0x42));
    }

    say(" %d", ((INSHELF)ordinal(38))(cat, 0xb));

    /* And its draw rectangle, and the spray's (kin 2) and the flea spray's
     * (kin 3) target points (0 without one), which 16 and 17 ask. */
    {
        int rect[4];
        unsigned char __far *spray = ((GETKIN)ordinal(18))(cat, 2);
        unsigned char __far *flea = ((GETKIN)ordinal(18))(cat, 3);
        long sprayAt = spray ? ((TARGETPT)ordinal(10))(spray, 0) : 0;
        long fleaAt = flea ? ((TARGETPT)ordinal(10))(flea, 0) : 0;

        ((DRAWRECT)ordinal(15))(rect, cat, 0);
        say(" %d %d %d %d %d %d %d %d\r\n", rect[0], rect[1], rect[2], rect[3], (int)sprayAt,
            (int)(sprayAt >> 16), (int)fleaAt, (int)(fleaAt >> 16));
    }

    keeping = 1;
    messages(sprite, params);
    global = *(unsigned char __far *__far *)(cat + 0x2fba);
    say("messaged %d %lu %d %d %d %d %d %d %d %d\r\n",
        keeping == 2 ? keptGlobal : *(int __far *)(global + 0x3a),
        keeping == 2 ? keptSeed : *(unsigned long __far *)MK_FP(traceData, 0x28ba),
        *(int __far *)(cat + 0x2552), *(int __far *)(cat + 0x35a4), *(int __far *)(cat + 0x35d6),
        *(int __far *)(cat + 0x35b0), *(int __far *)(cat + 0x35b2), *(int __far *)(cat + 0x35b4),
        looked - heads, pushes - pushed);
    keeping = 0;
}

static void install(unsigned char __far *cat)
{
    unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
    unsigned char __far *machine = cat + 0x2518;

    _fmemcpy(table, *(void __far *__far *)cat, sizeof table);
    push = *(PUSH *)(table + 0xb8);
    track = *(LOOK *)(table + 0xe0);
    lookAtUser = *(LOOK *)(table + 0x2e0);
    words = *(WORDS *)(table + 0xa4);
    *(PUSH *)(table + 0xb8) = record;
    *(LOOK *)(table + 0xe0) = tracking;
    *(LOOK *)(table + 0x2e0) = userward;
    *(WORDS *)(table + 0xa4) = wording;
    orient = *(ORIENT *)(table + 0x304);
    missing = *(MISS *)(table + 0x308);
    *(ORIENT *)(table + 0x304) = orienting;
    area = *(AREA *)(table + 0x234);
    *(AREA *)(table + 0x234) = placing;
    whichBall = *(PETTED *)(table + 0x2e8);
    *(PETTED *)(table + 0x2e8) = balling;
    stoppedPetting = *(PETTED *)(table + 0x2f8);
    *(PETTED *)(table + 0x2f8) = stopping;
    cursorMoved = *(MOVED *)(table + 0x2f0);
    *(MOVED *)(table + 0x2f0) = moving;
    mouthToTeat = *(MOVED *)(table + 0x358);
    *(MOVED *)(table + 0x358) = mouthing;
    *(MISS *)(table + 0x308) = measuring;
    wiggle = *(REFLEX *)(table + 0x128);
    *(REFLEX *)(table + 0x128) = wiggling;
    extreme = *(REFLEX *)(table + 0x130);
    *(REFLEX *)(table + 0x130) = extremes;
    seeMouse = *(REFLEX *)(table + 0x134);
    *(REFLEX *)(table + 0x134) = seeing;
    scruff = *(REFLEX *)(table + 0x120);
    *(REFLEX *)(table + 0x120) = scruffing;
    purr = *(REFLEX *)(table + 0x140);
    *(REFLEX *)(table + 0x140) = purring;
    messages = *(REFLEX *)(table + 0x138);
    *(REFLEX *)(table + 0x138) = messaging;
    *(void __far *__far *)cat = table;

    _fmemcpy(globalTable, *(void __far *__far *)global, sizeof globalTable);
    passGlobal = *(GLOBALSTATE *)(globalTable + 0x1c);
    *(GLOBALSTATE *)(globalTable + 0x1c) = keep;
    *(void __far *__far *)global = globalTable;

    _fmemcpy(localTable, *(void __far *__far *)machine, sizeof localTable);
    passLocal = *(GLOBALSTATE *)(localTable + 0x14);
    *(GLOBALSTATE *)(localTable + 0x14) = keepLocal;
    handle = *(DISPATCH *)(localTable + 4);
    *(DISPATCH *)(localTable + 4) = tracing;
    *(void __far *__far *)machine = localTable;
    traced = cat;
    hookRand();

    hookCued();
    hookProximity();

    /* And the DLL's code segments' selectors, by number, to name return
     * addresses by. */
    {
        static const int firsts[][2] = {
            {1, 1}, {2, 2}, {3, 68}, {4, 168}, {5, 200}, {6, 208}, {7, 222}, {8, 248},
            {9, 364}, {10, 399}, {11, 405}, {12, 446}, {13, 454}, {14, 469}, {15, 480},
            {16, 488}, {17, 528}, {18, 529}, {19, 539}, {20, 543}, {21, 553}, {22, 559},
            {23, 575}, {24, 595}, {25, 611}, {26, 622}, {27, 640}, {28, 657}, {29, 674},
            {30, 686}, {31, 704}, {32, 722}, {33, 838}, {34, 852}, {35, 864}, {36, 873},
            {37, 886}, {38, 899}, {39, 927}, {40, 944}, {41, 990}, {42, 994}, {43, 1020},
            {44, 1048}, {45, 1124}, {46, 1161}, {47, 1177}, {48, 1216}};
        int f;

        say("segments");

        for (f = 0; f < sizeof firsts / sizeof firsts[0]; f++) {
            say(" %d:%u", firsts[f][0], FP_SEG(ordinal(firsts[f][1])));
        }

        say("\r\n");
    }

    /* And what the shelf holds, by kind, to 35. */
    {
        int b;

        say("shelf");

        for (b = 0; b < 35; b++) {
            say(" %d", ((INSHELF)ordinal(38))(cat, b));
        }

        say("\r\n");
    }
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    WNDCLASS kind;
    HWND window;
    HFILE file;
    unsigned dgroup;
    unsigned char __far *module;
    unsigned char __far *cat;
    int answer, n, b, frames = FRAMES;

    (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZPEN.OUT")) {
        return 1;
    }

    /* The library's data segment, where `GetParamsPtr` points before any
     * parameters are set: C's `rand` keeps its seed there (`ds:28ba`). */
    dgroup = FP_SEG(((GETPARAMS)ordinal(1240))());
    traceData = dgroup;

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
     * `+0x35a6`, `+0x35a2`, `+0x35ac`, where it walks to (`+0x34cc`,
     * `+0x34ce`; walking on, its marker put there), `+0x688`, `+0x35aa`,
     * `+0x35a8`, `+0x35f4`, `+0x35ee`, `+0x35a4` and whether `PopScript` is
     * to find its target: the cat in them as it is (`+0x2552`; `+0x3a` of the global
     * machine), entering or not, its script done, no layered action playing,
     * both machines' histories and the actions pushed marked; a tick of its
     * state (its machine's slot 4, as `BaseNewState` calls it); and
     * `localed` and the two histories, its energy, `+0x3502`, the action
     * playing, the actions pushed, `+0x3504`, `+0x1500`, the layered
     * frames begun, where it walks to (`+0x34cc`, `+0x34ce`) and how
     * (`+0x35a8`), the calls to its head, the target point of its kin 0x16
     * and `+0x35ac`, the first words pushed to its script (its slot `0xa4`),
     * its fullness, `+0x688`, `+0x35aa` and `+0x33be`, `+0x34ca`, the
     * moment's `+0x3516`, `+0x350a`,
     * `+0x3506` and `+0x3508`, and `+0x35a6` and `+0x35a4`. */
    file = _lopen(DIRECTORY "\\LOCAL.TXT", OF_READ);

    if (cat && file != HFILE_ERROR) {
        unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
        unsigned char __far *machine = cat + 0x2518;
        void __far *original, __far *globalOriginal, __far *localOriginal;
        int done, enter, x35fc, x35a2, x35ac, x688, found, place[4];
        DISPATCH dispatch = *(DISPATCH __far *)(*(unsigned char __far *__far *)machine + 4);

        for (b = 0; b < 4; b++) {
            place[b] = *(int __far *)(cat + 0x124 + 2 * b);
        }

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
            x688 = (int)number(file);
            *(int __far *)(cat + 0x35aa) = (int)number(file);
            *(int __far *)(cat + 0x35a8) = (int)number(file);
            *(int __far *)(cat + 0x35f4) = (int)number(file);
            *(int __far *)(cat + 0x35ee) = (int)number(file);
            *(int __far *)(cat + 0x35a4) = (int)number(file);
            found = (int)number(file);

            /* Walking on (23), its marker (kin 0x16) put where it walks to
             * (its method `0x44`, as `DoCatLocomote` puts it). */
            if (*(int __far *)(cat + 0x2552) == 23) {
                void __far *marker = ((GETKIN)ordinal(18))(cat, 0x16);

                if (marker) {
                    MOVETO move = *(MOVETO __far *)(*(unsigned char __far *__far *)marker + 0x44);

                    move(marker, 0, (int __far *)(cat + 0x34cc));
                }
            }

            ((RESETSTACK)ordinal(951))(cat, 2);
            ((PLAIN_SPRITE)ordinal(957))(cat);
            *(int __far *)(cat + 0x1502) = -1;
            *(int __far *)(cat + 0x1500) = done;
            *(int __far *)(cat + 0x35fc) = x35fc;
            *(int __far *)(cat + 0x35a2) = x35a2;
            *(int __far *)(cat + 0x35ac) = x35ac;
            *(int __far *)(cat + 0x688) = x688;

            /* No box to find a target in (`+0x250e`, `+0x2510`; its share,
             * `+0x2512`, 1, which `MakeFocusRect` divides by), so that
             * `PopScript` never finds one there from a case before; or,
             * where it is to be found, the marker (kin 0x16) the target
             * (`+0x1504`) and a box about the head so big, and moved ahead of
             * it so little, that it holds the stage. */
            *(int __far *)(cat + 0x250e) = found ? 2000 : 0;
            *(int __far *)(cat + 0x2510) = found ? 2000 : 0;
            *(int __far *)(cat + 0x2512) = found ? 2000 : 1;

            if (found) {
                *(void __far *__far *)(cat + 0x1504) = ((GETKIN)ordinal(18))(cat, 0x16);
            }

            /* Where it was at the first case (its rectangle, `+0x124` to
             * `+0x12a`), as a target found moves it as it is popped. */
            for (b = 0; b < 4; b++) {
                *(int __far *)(cat + 0x124 + 2 * b) = place[b];
            }

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
                int rect[4] = {0, 0, 0, 0}, own[4];

                if (kin) {
                    ((DRAWRECT)ordinal(15))(rect, kin, 0);
                }

                ((DRAWRECT)ordinal(15))(own, cat, 0);
                say("stage %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d\r\n",
                    *(int __far *)MK_FP(dgroup, 0x2ba6), *(int __far *)MK_FP(dgroup, 0x2ba8),
                    *(int __far *)MK_FP(dgroup, 0x2baa), *(int __far *)MK_FP(dgroup, 0x2bac),
                    *(int __far *)(cat + 0x33c4), *(int __far *)(cat + 0x33c6), (int)point,
                    (int)(point >> 16), kin != 0, rect[0], rect[1], rect[2], rect[3], own[0], own[1],
                    own[2], own[3]);
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
            words = *(WORDS *)(table + 0xa4);
            *(WORDS *)(table + 0xa4) = wording;
            wordings = 0;
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

            /* The words that first steered it through slot `0xa4`, its
             * fullness, `+0x688` and `+0x35aa`. */
            say(" %d", wordings);

            for (b = 0; b < 6; b++) {
                say(" %d", wordings ? worded[b] : -1);
            }

            say(" %d %d %d %d", *(int __far *)(cat + 0x2fda + 4 * 0x52 + 0x3a),
                *(int __far *)(cat + 0x688), *(int __far *)(cat + 0x35aa), *(int __far *)(cat + 0x33be));
            say(" %d %d %d %d %d %d %d\r\n", *(int __far *)(cat + 0x34ca),
                *(int __far *)(cat + 0x3516),
                *(int __far *)(cat + 0x350a), *(int __far *)(cat + 0x3506),
                *(int __far *)(cat + 0x3508), *(int __far *)(cat + 0x35a6),
                *(int __far *)(cat + 0x35a4));
        }

        _lclose(file);
    }

    /* Following its day: as many frames as `TRACE.TXT` says. */
    file = _lopen(DIRECTORY "\\TRACE.TXT", OF_READ);

    if (file != HFILE_ERROR) {
        frames = (int)number(file);
        forcing = number(file);
        _lclose(file);

        if (cat) {
            install(cat);
        }
    }

    for (n = 0; n < frames; n++) {
        /* The cursor at the stage's corner, away from the cat (`+0x108`, `+0x10a`). */
        *(int *)(params + 0x108) = 0;
        *(int *)(params + 0x10a) = 0;

        /* Or, where `TRACE.TXT` asks (256), the Adoption Kit: at frame 10,
         * its command to the module (`PetParams` `+0`, which
         * `PetModule::DoDrawFrame` takes) 5 -- its shelf, buttons and
         * baskets set up, and the cat put in them -- for that frame. */
        if (forcing & 256) {
            *(int *)(params + 0) = n == 10 ? 5 : 0;

            /* And the cursor about (`+0x46`) 20 frames of each 400, which
             * has the cat climb out as it peeks; and at the 350th, out of
             * the Kit's state, in turn: the cat sent back to its basket
             * (`MakeCatReturnToBasket`, its slot `0x15c`), as its button
             * does; dropped into it (`+0x33be` 4, `+0x35fc` 1 and the Kit,
             * 22), as `DoDangling` has it let go of above its basket; and
             * its fail-safe (23), as `PetModule::DoDrawFrame` has it after
             * an error (`XApex::theirError`). */
            *(int *)(params + 0x46) = n % 400 >= 200 && n % 400 < 220;

            if (cat && n % 400 == 350) {
                unsigned char __far *global = *(unsigned char __far *__far *)(cat + 0x2fba);
                GLOBALSTATE begin = *(GLOBALSTATE __far *)(*(unsigned char __far *__far *)global + 0x1c);

                if (*(int __far *)(global + 0x3a) != 0x16) {
                    if (n / 400 % 3 == 0) {
                        (*(TOPEN __far *)(*(unsigned char __far *__far *)cat + 0x15c))(cat, params);
                    } else if (n / 400 % 3 == 1) {
                        *(int __far *)(cat + 0x33be) = 4;
                        *(int __far *)(cat + 0x35fc) = 1;
                        begin(global, 0x16, params);
                    } else {
                        begin(global, 0x17, params);
                    }
                }
            }
        }

        /* Or, where `TRACE.TXT` asks (64), the user with the bottle (kin
         * 0xf), each 600 frames: taken off the shelf into the pen where it
         * is there (`XApt::ShelfToPlaypen`, 151); held (`ForceSelect`, 791)
         * beside the cat, a little more than half its width to its right
         * (`MoveDrawPt`, 793), the cursor on it with the hand down; and let
         * go there at 400 (`ForceRelease`, 790), on the floor. */
        if (forcing & 64 && cat) {
            int cycle = n % 600;
            void __far *bottle = ((GETKIN)ordinal(18))(cat, 0xf);

            *(int *)(params + 0x46) = 0;

            if (bottle && cycle == 0 && ((INSHELF)ordinal(38))(cat, 0xf)) {
                ((TOPEN)ordinal(151))(bottle, params);
            }

            if (bottle && cycle < 400) {
                long point = ((TARGETPT)ordinal(10))(cat, 0);
                int at[2];

                at[0] = (int)point + *(int __far *)((unsigned char __far *)cat + 0x33c4) * 3 / 5;
                at[1] = (int)(point >> 16);
                ((BOTTLEDO)ordinal(791))(bottle);
                ((MOVEPT)ordinal(793))(bottle, 0, at);
                *(int *)(params + 0x1e) = 1;
                *(int *)(params + 0x5a) = *(int *)(params + 0x104) = *(int *)(params + 0x108) = at[0];
                *(int *)(params + 0x5c) = *(int *)(params + 0x106) = *(int *)(params + 0x10a) = at[1];
            } else if (bottle && cycle == 400) {
                ((BOTTLEDO)ordinal(790))(bottle);
                *(int *)(params + 0x1e) = 0;
            }
        }

        /* Or, where `TRACE.TXT` asks (128), the user with a treat (kin 0xb),
         * each 600 frames: taken off the shelf into the pen where it is
         * there; held -- its table's `IsThisBeingHeld` answering so -- still
         * at the stage's lower middle (`XApt::MoveDrawPt`, 17), and, while
         * the cat waits for it (36), at its ball 7, where it would take it;
         * and let go at 400. */
        if (forcing & 128 && cat) {
            int cycle = n % 600;
            unsigned char __far *treat = ((GETKIN)ordinal(18))(cat, 0xb);

            treatHeld = treat && cycle < 400;

            if (treat && cycle == 0) {
                if (((INSHELF)ordinal(38))(cat, 0xb)) {
                    ((TOPEN)ordinal(151))(treat, params);
                }

                /* Its own copy of its table, whose slot `0x24`
                 * (`IsThisBeingHeld`) answers as the user holds it. */
                if (*(void __far *__far *)treat != treatTable) {
                    _fmemcpy(treatTable, *(void __far *__far *)treat, sizeof treatTable);
                    *(int(__cdecl __far **)(void __far *))(treatTable + 0x24) = treatHolding;
                    *(void __far *__far *)treat = treatTable;
                }
            }

            if (treatHeld) {
                unsigned char __far *ballz = *(unsigned char __far *__far *)(cat + 0x242);
                int rect[4], at[2] = {235, 250};

                /* Moved only where it must be. */
                if (*(int __far *)(cat + 0x2552) == 36) {
                    ((DRAWRECT)ordinal(15))(rect, cat, 0);
                    (*(BALLPOINT __far *)(*(unsigned char __far *__far *)ballz + 0x38))(
                        ballz, at, cat + 0x678, rect, 7);
                    ((MOVEPT)ordinal(17))(treat, 0, at);
                } else if (cycle == 0) {
                    ((MOVEPT)ordinal(17))(treat, 0, at);
                }

            }
        }

        /* Or, where `TRACE.TXT` asks (32), the cursor still at the stage's
         * lower middle (`+0x5a`, `+0x104` on), the hand up, for the cat to
         * walk to it affectionate; `+0x46`, which ends that, clear. And
         * where it asks 2048 too, every other 200 frames the cursor just
         * left of the stage, off it, where the cat lacks affection. */
        if (forcing & 32) {
            *(int *)(params + 0x46) = 0;
            *(int *)(params + 0x1e) = 0;
            *(int *)(params + 0x5a) = *(int *)(params + 0x104) = *(int *)(params + 0x108) =
                forcing & 2048 && n / 200 % 2 ? -5 : 235;
            *(int *)(params + 0x5c) = *(int *)(params + 0x106) = *(int *)(params + 0x10a) = 250;
        }

        /* And where it asks (65536), its diet extreme, for its reflexes:
         * its first 1,000 frames its proper diet (brain 9) held at 5, after
         * at 90 and its fullness (brain 4) at 80. */
        if (forcing & 65536L && cat) {
            int late = n >= 1000;

            *(int __far *)(cat + 0x2fda + 0x52 * 9 + 0x3a) = late ? 90 : 5;

            if (late) {
                *(int __far *)(cat + 0x2fda + 0x52 * 4 + 0x3a) = 80;
            }
        }

        /* Or, where it asks (131072), the cursor wiggled by the cat, the
         * hand up, 300 frames of each 600: 20 to its one side and then its
         * other, frame by frame, and up and down every other frame, for its
         * reflex (`HandleCursorWiggling`); the rest still beside it. */
        if (forcing & 131072L && cat) {
            long point = ((TARGETPT)ordinal(10))(cat, 0);
            int wiggling = n % 600 < 300;
            int x = (int)point + 60 + (wiggling ? (n & 1 ? 20 : -20) : 0);
            int y = (int)(point >> 16) - 20 + (wiggling ? (n & 2 ? 15 : -15) : 0);

            *(int *)(params + 0x46) = 0;
            *(int *)(params + 0x1e) = 0;
            *(int *)(params + 0x5a) = *(int *)(params + 0x104) = *(int *)(params + 0x108) = x;
            *(int *)(params + 0x5c) = *(int *)(params + 0x106) = *(int *)(params + 0x10a) = y;
        }

        /* And where it asks (262144), every 30 frames, `+0x33bc` cleared, as
         * a new global state clears it, that it may see the mouse again
         * (`HandleCatSeesMouse`). */
        if (forcing & 262144L && cat && n % 30 == 0) {
            *(int __far *)(cat + 0x33bc) = 0;
        }

        /* Or, where it asks (524288), the user picking it up by the
         * scruff, each 400 frames: its first the cursor put on the cat's
         * target point and the button pressed (`+0xa`, the press); held
         * (`+0xc`) 80 frames, the cursor lifted 2 a frame from where it was;
         * then let go. */
        if (forcing & 524288L && cat) {
            static int grabX, grabY;
            int t = n % 400;

            if (t == 0) {
                long point = ((TARGETPT)ordinal(10))(cat, 0);

                grabX = (int)point;
                grabY = (int)(point >> 16);
            }

            *(int *)(params + 0x46) = 0;
            *(int *)(params + 0x1e) = 0;
            *(int *)(params + 0xa) = t == 0;
            *(int *)(params + 0xc) = t > 0 && t < 80;
            *(int *)(params + 0x5a) = *(int *)(params + 0x104) = *(int *)(params + 0x108) = grabX;
            *(int *)(params + 0x5c) = *(int *)(params + 0x106) = *(int *)(params + 0x10a) =
                grabY - (t < 80 ? 2 * t : 160);
        }

        /* And where it asks (1048576), every 50 frames a message left for
         * it (`+0x33c0`), as the playpen leaves one where the user puts
         * something by it: food (1, 2), water (3, 4), a treat (5, 6), catnip
         * (7, 8), a toy (9 to 12), the milk bottle (13), the spray bottle
         * (15), the spray and flea spray on it (16, 17), 18, the window
         * resized (19) and the camera (21), in turn. */
        if (forcing & 1048576L && cat && n % 50 == 25) {
            static const int sent[] = {1,  2,  3,  4,  5,  6,  7,  8,  9, 10,
                                       11, 12, 13, 15, 16, 17, 18, 19, 21};
            int message = sent[n / 50 % (sizeof sent / sizeof sent[0])];

            /* The spray (16, kin 2) and flea spray (17, kin 3), where there
             * is one, first taken into the pen and put just to the cat's
             * right, as the user would spray it. */
            if (message == 16 || message == 17) {
                void __far *spray = ((GETKIN)ordinal(18))(cat, message == 16 ? 2 : 3);

                if (spray) {
                    long point = ((TARGETPT)ordinal(10))(cat, 0);
                    int at[2];

                    if (((INSHELF)ordinal(38))(cat, message == 16 ? 2 : 3)) {
                        ((TOPEN)ordinal(151))(spray, params);
                    }

                    at[0] = (int)point + *(int __far *)((unsigned char __far *)cat + 0x33c4) * 3 / 5;
                    at[1] = (int)(point >> 16);
                    ((MOVEPT)ordinal(17))(spray, 0, at);
                } else {
                    message = 0;
                }
            }

            *(int __far *)(cat + 0x33c0) = message;
        }

        /* Or, where `TRACE.TXT` asks (16), the user petting it, 300 frames
         * of each 360: the hand down (`+0x1e`), and the cursor's point
         * (`+0x5a`) and rectangle (`+0x104` on) on the cat's target point,
         * wiggled; `+0x46`, which ends petting where set (`DoGSPetting`),
         * clear. The other 60, the hand up, still. */
        if (forcing & 16 && cat) {
            long point = ((TARGETPT)ordinal(10))(cat, 0);
            int stroking = n % 360 < 300;
            int x = (int)point + (stroking ? 6 * (n % 8) - 21 : 0);
            int y = (int)(point >> 16) + (stroking ? 3 * (n % 4) - 12 : 0);

            *(int *)(params + 0x46) = 0;
            *(int *)(params + 0x1e) = stroking;
            *(int *)(params + 0x5a) = x;
            *(int *)(params + 0x5c) = y;
            *(int *)(params + 0x104) = x;
            *(int *)(params + 0x106) = y;
            *(int *)(params + 0x108) = x;
            *(int *)(params + 0x10a) = y;
        }

        if (((PORT)ordinal(1052))(params) == 0) {
            ((DRAWFRAME)ordinal(859))(module, params);
            ((PORT)ordinal(1053))(params);
        }

        if (!cat) {
            cat = findCat();

            if (cat && frames != FRAMES) {
                install(cat);
            }

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
