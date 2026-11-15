/*
 * Dogz's playpen, made as DOGZ.WAD makes it (seg4:05c5 on): the game's
 * parameters as the program had filled them in once its first dog's module
 * was made (`PARAMS.BIN` beside the driver, `PetParams`, ds:0x27c6, 0x680
 * bytes; harness/dogzcap.c keeps them), with this driver's own window,
 * instance, library and directory in them; then the library's own setup as
 * the program does it (`InitStaticIni`, 2; `LoadSliderVals`, 3;
 * `XDrawPort::InitStaticDraw`, 117), a `PetModule` (0x1280 bytes, 482) made
 * the first of the program's modules (`PetParams` `+0x550`, `+0x54e` its
 * index) and set up (`InitPetModule`, 484), and a frame drawn at a time
 * (`OpenScreenDrawPort`, 118; `DoDrawFrame`, 485; `CloseScreenDrawPort`,
 * 119), as many as `FRAMES.TXT` says (300 without it), each when the
 * clock lets the dog move on; and, as `FRAMES.TXT`'s second number asks,
 * the dog's idle plans cut short (1), its excitement put low (2), its
 * sleep cut short (4), the dog petted (8), a treat held out to it and
 * put down (16), a bowl of food put down (32), the ball thrown (64), the
 * shoe waved (128), the spray held over the dog (256), or the dog painted
 * (512).
 *
 * * `made`: the library and the module;
 * * `segments`: each code segment's selector, by an export of it;
 * * at the fifth frame, `sprite k`, each of the stage's sprites (its first
 *   far word, and its rectangle; the toy box's things, not out, empty);
 * * `trick n` and its 12 words, for each of the library's 59, and
 *   `weights`, the sum of their idle weights;
 * * for each frame, `tick n state global seed`, the dog's 11 factors, the
 *   weights' sum and its petting (`hand`, below) as it begins; `newstate from to draws` for each
 *   change of state within it; and after it `frame n state global seed
 *   draws` -- the dog's state (`PetModule` `+0xc0`, newest of the ten
 *   `NewState` keeps), its global state (`+0xd4`), C's `rand` seed
 *   (DOGZDLL ds:0x2d28), how many times it was drawn, its sprite's
 *   segment, the stage it is kept to, its rectangle and its petting --
 *   whether it is petted and its petting hand's frame, count and step --
 *   and `drawn k
 *   seed selector offset` for each draw, the seed before it and where it
 *   returned to; and within it, `stored`, `neutral` and `script` for each
 *   script pushed to a sprite, `target` and `targeted` for each point the
 *   dog is to walk to, `gait` and `gaited` for each way it goes, `spot`
 *   and `spotted` for each spot it wants petting on, `grabbable` for
 *   each time it is asked whether it can grab the ball, `ballstop` as the
 *   ball is stopped, `moved` for each way the dog's rectangle is moved,
 *   `grab` and `release` as it is asked to take up and let go of things,
 *   and `head`
 *   for each placing of a head turned.
 */
#include <dos.h>
#include <string.h>
#include <windows.h>

#define DIRECTORY "C:\\CORPUS\\DOGZPEN"
#define PARAMS_SIZE 0x680
#define FRAMES 300

typedef int(__cdecl __far *INITINI)(void __far *params, int how);
typedef int(__cdecl __far *WITHPARAMS)(void __far *params);
typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef int(__cdecl __far *INITMODULE)(void __far *module, void __far *params);
typedef int(__cdecl __far *INITDDE)(int a, int b, int c, int d, int e);
typedef int(__cdecl __far *NEUTRALTYPE)(int position);
typedef int(__cdecl __far *DRAWFRAME)(void __far *module, void __far *params);
typedef void(__cdecl __far *SETEXCITEMENT)(void __far *module, int excitement);

static HINSTANCE dogz;
static HFILE output;
static unsigned char params[PARAMS_SIZE];

static FARPROC ordinal(int number)
{
    return GetProcAddress(dogz, MAKEINTRESOURCE(number));
}

static void say(LPCSTR format, ...)
{
    char text[128];

    _lwrite(output, text, wvsprintf(text, format, (LPSTR)(&format + 1)));
}

/* The next number of a file, or -1 at its end. */
static long number(HFILE file)
{
    char c;
    long n = 0;
    int digits = 0;

    while (_lread(file, &c, 1) == 1) {
        if (c >= '0' && c <= '9') {
            n = n * 10 + (c - '0');
            digits++;
        } else if (digits) {
            return n;
        }
    }

    return digits ? n : -1;
}

/* The library's data segment, its instance: C's `rand` keeps its seed there (ds:0x2d28). */
static unsigned dgroup;

/* The dog's sprite, as the frame begins (the module's `+0x58`). */
static unsigned char __far *dogSprite;

typedef UINT(FAR PASCAL *ALIAS)(UINT selector);

/* KERNEL's `AllocCSToDSAlias` (170) or `AllocDSToCSAlias` (171). */
static UINT alias(int which, UINT selector)
{
    return ((ALIAS)GetProcAddress(GetModuleHandle("KERNEL"), MAKEINTRESOURCE(which)))(selector);
}

/* C's `rand` (seg1:4f11): a far jump over its start to this, which draws as
 * it does -- the seed times 0x15a4e35, plus 1, its high word less its top
 * bit -- and keeps, for the frame, the seed before each draw and where it was
 * called from (its return address, below its first argument). */
#define KEPT 2048
static int draws;
static unsigned long drawnSeed[KEPT];
static unsigned drawnSeg[KEPT], drawnOff[KEPT];

static int __cdecl __far __loadds drawing(int unused)
{
    unsigned long __far *seed = (unsigned long __far *)MK_FP(dgroup, 0x2d28);
    unsigned __far *from = (unsigned __far *)&unused;

    if (draws < KEPT) {
        drawnSeed[draws] = *seed;
        drawnOff[draws] = from[-2];
        drawnSeg[draws] = from[-1];
    }

    draws++;
    *seed = *seed * 0x15a4e35ul + 1;
    return (int)(*seed >> 16) & 0x7fff;
}

static void jumpTo(unsigned char __far *code, void __far *to)
{
    code[0] = 0xea;
    *(unsigned __far *)(code + 1) = FP_OFF(to);
    *(unsigned __far *)(code + 3) = FP_SEG(to);
}

static void hookRand(void)
{
    UINT writable = alias(170, FP_SEG(ordinal(1)));

    jumpTo((unsigned char __far *)MK_FP(writable, 0x4f11), (void __far *)drawing);
    FreeSelector(writable);
}

/* A function of the library's that begins, as most do, with five bytes
 * of prologue -- `mov ax,DGROUP`, `inc bp`, `push bp` -- hooked: a far jump
 * over them to `hook`, and a copy of them, jumping back past them, through
 * which the hook goes on. So a call within it, to it, is hooked as well. */
static void __far *hookPrologue(int number, void __far *hook)
{
    void __far *at = (void __far *)ordinal(number);
    UINT writable = alias(170, FP_SEG(at));
    unsigned char __far *code = (unsigned char __far *)MK_FP(writable, FP_OFF(at));
    unsigned char __far *copy = (unsigned char __far *)GlobalLock(GlobalAlloc(GMEM_FIXED, 16));
    int k;

    for (k = 0; k < 5; k++) {
        copy[k] = code[k];
    }

    jumpTo(copy + 5, (unsigned char __far *)at + 5);
    jumpTo(code, hook);
    FreeSelector(writable);
    return MK_FP(alias(171, FP_SEG(copy)), FP_OFF(copy));
}

/* The brain (`XBrain`): each command it is given (`DoCommand_Change`, 293,
 * seg12:0642; `brain command verb object draws`: 5 told the verb and
 * object, 4 think), and the state its choice maps to after (`brained
 * state draws`, DS:0x1e1e, seg15:1483); its desires cleared
 * (`ZeroOutDesires`, 304; `brainzero draws`); and a choice made real
 * (`MakeLastThinkReal`, 291; `brainreal draws`). */
typedef int(__cdecl __far *BRAINCALL)(unsigned char __far *brain);
static BRAINCALL commandOn, zeroOn, realOn;

static int __cdecl __far __loadds commanding(unsigned char __far *brain)
{
    int answer;

    say("brain %d %s %s %d\r\n", *(int __far *)(brain + 0x11c2), (char __far *)(brain + 0x11c6),
        (char __far *)(brain + 0x11de), draws);
    answer = commandOn(brain);
    say("brained %d %d\r\n", *(int __far *)MK_FP(dgroup, 0x1e1e), draws);
    return answer;
}

static int __cdecl __far __loadds zeroing(unsigned char __far *brain)
{
    say("brainzero %d\r\n", draws);
    return zeroOn(brain);
}

/* And each pulse the module gives it (`PetModule::Pulse`, 498, seg21:8ac4;
 * `pulse draws`): not always one a frame. */
typedef int(__cdecl __far *PULSE)(void __far *module);
static PULSE pulseOn;

static int __cdecl __far __loadds pulsing(void __far *module)
{
    say("pulse %d\r\n", draws);

    /* (And the blink as it is pulsed: `pulsing phase wait`.) */
    if (dogSprite) {
        say("pulsing %d %d\r\n", *(int __far *)(dogSprite + (unsigned)-0x720e),
            *(int __far *)(dogSprite + (unsigned)-0x7218));
    }
    return pulseOn(module);
}

/* And the engine's clock as `PulseTrickData` (346, seg14:1783) reads it
 * afresh (`pulsed n ms`, `timeGetTime`): the factors' drift is timed by it,
 * a little after the frame's own clock. */
typedef void(__cdecl __far *PULSETRICKS)(void __far *module);
static PULSETRICKS tricksOn;

static void __cdecl __far __loadds pulsingTricks(void __far *module)
{
    typedef DWORD(FAR PASCAL * TIMEGET)(void);
    static TIMEGET timeGet;

    if (!timeGet) {
        timeGet = (TIMEGET)GetProcAddress(GetModuleHandle("MMSYSTEM"), "TIMEGETTIME");
    }

    say("pulsed %lu\r\n", timeGet ? timeGet() : 0ul);
    tricksOn(module);
}

static int __cdecl __far __loadds realising(unsigned char __far *brain)
{
    say("brainreal %d\r\n", draws);
    return realOn(brain);
}

/* Each tick of the swing (`ScriptSprite::Fizziks`, 99, seg7:4f08), as it is
 * called -- more than once a frame at times: `fizz on rotation cx cy cx' cy'
 * vx vy vz x y z draws`, the sprite's `+0x210e` and rotation (`+0x526`)
 * and the cursor sprite's middle now and before (`ds:0x3bd8`) as it
 * begins, its velocity and place (`ds:0x1318`, `0x1324`) after. */
typedef int(__cdecl __far *FIZZIKS)(unsigned char __far *sprite, unsigned long point);
static FIZZIKS fizzOn;

static int __cdecl __far __loadds fizzing(unsigned char __far *sprite, unsigned long point)
{
    int on = *(int __far *)(sprite + 0x210e), rotation = *(int __far *)(sprite + 0x526), answer;
    unsigned char __far *pointer = *(unsigned char __far *__far *)MK_FP(dgroup, 0x3bd8);
    int __far *swing = (int __far *)MK_FP(dgroup, 0x1318);

    say("fizz %d %d %d %d %d %d", on, rotation, *(int __far *)(pointer + 0x86), *(int __far *)(pointer + 0x88),
        *(int __far *)(pointer + 0x8a), *(int __far *)(pointer + 0x8c));
    answer = fizzOn(sprite, point);
    say(" %d %d %d %d %d %d %d\r\n", swing[0], swing[1], swing[2], swing[6], swing[7], swing[8], draws);
    return answer;
}

/* `PetModule::LoadFactors` (499, seg21:1ec5), as the module is made: the
 * seed and the draws so far as it begins and ends (`factors in`, `out`). */
typedef int(__cdecl __far *LOADFACTORS)(void __far *module, int a, int b);
static LOADFACTORS factorsOn;

static int __cdecl __far __loadds loadingFactors(void __far *module, int a, int b)
{
    int answer;

    say("factors in %lu %d %d %d\r\n", *(unsigned long __far *)MK_FP(dgroup, 0x2d28), draws, a, b);
    answer = factorsOn(module, a, b);
    say("factors out %lu %d\r\n", *(unsigned long __far *)MK_FP(dgroup, 0x2d28), draws);
    /* (The draws from here to the first frame kept, `initdraw`: the game's
     * `rand` hooked only now, the 66,307 before too many to keep.) */
    draws = 0;
    hookRand();
    return answer;
}

/* `PetModule::FindStartingLocation`, as the module is made: the dog's
 * sprite after (`started` its rectangle and middle). */
typedef int(__cdecl __far *FINDSTART)(unsigned char __far *module);
static FINDSTART findOn;

static int __cdecl __far __loadds finding(unsigned char __far *module)
{
    int answer = findOn(module);
    unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

    say("started %d %d %d %d %d %d %d\r\n", *(int __far *)(sprite + 0x60), *(int __far *)(sprite + 0x62),
        *(int __far *)(sprite + 0x64), *(int __far *)(sprite + 0x66), *(int __far *)(sprite + 0x86),
        *(int __far *)(sprite + 0x88), *(int __far *)(sprite + 0x51a + 0x18));
    return answer;
}

/* `PetModule::SetExcitement` (352): each call (`excite value draws`), from the module's making on. */
typedef int(__cdecl __far *SETEXCITE)(void __far *module, int value);
static SETEXCITE exciteOn;

static int __cdecl __far __loadds exciting(void __far *module, int value)
{
    say("excite %d %d\r\n", value, draws);
    return exciteOn(module, value);
}

/* `PetModule::NewState` (496, seg21:5bb8): each change (`newstate from to
 * draws`, the draws of the frame before it). */
typedef int(__cdecl __far *NEWSTATE)(void __far *module, int state);
static NEWSTATE newStateOn;

static int __cdecl __far __loadds changing(unsigned char __far *module, int state)
{
    say("newstate %d %d %d\r\n", *(int __far *)(module + 0xc0), state, draws);
    return newStateOn(module, state);
}

/* And what a script sprite is given to play, by whom (its segment):
 * `ScriptSprite::PushStoredScript` (75, seg7:4367; `stored sprite script
 * how draws`), `PushTransitionToNeutralPos` (78, seg7:3d2f; `neutral sprite
 * position glue draws`) and `PushScript` (81, seg7:47e8; `script sprite
 * count how draws`, after its elements' far pointer). */
typedef int(__cdecl __far *PUSHTWO)(void __far *sprite, int a, int b);
typedef int(__cdecl __far *PUSHELEMENTS)(void __far *sprite, void __far *elements, int a, int b);
static PUSHTWO storedOn, neutralOn;
static PUSHELEMENTS scriptOn;

static int __cdecl __far __loadds storing(void __far *sprite, int a, int b)
{
    /* (And the game's table's place as it is called, the last number.) */
    say("stored %u %d %d %d %d\r\n", FP_SEG(sprite), a, b, draws,
        *(int __far *)((unsigned char __far *)ordinal(101) + 0x6e));
    return storedOn(sprite, a, b);
}

static int __cdecl __far __loadds neutral(void __far *sprite, int a, int b)
{
    say("neutral %u %d %d %d %d\r\n", FP_SEG(sprite), a, b, draws,
        *(int __far *)((unsigned char __far *)ordinal(101) + 0x6e));
    return neutralOn(sprite, a, b);
}

static int __cdecl __far __loadds scripting(void __far *sprite, void __far *elements, int a, int b)
{
    say("script %u %d %d %d\r\n", FP_SEG(sprite), a, b, draws);
    return scriptOn(sprite, elements, a, b);
}

/* And `PetModule::GetNewTarget` (368, seg16:177b), where the dog walks to
 * next: `target distance x y draws` as it is asked -- how far it should be
 * at least, and where the dog is (its sprite's `+0x86`, `+0x88`) -- and
 * `targeted x y draws` with what it answered. */
typedef void(__cdecl __far *NEWTARGET)(unsigned char __far *module, int __far *point, int distance);
static NEWTARGET targetOn;

static void __cdecl __far __loadds targeting(unsigned char __far *module, int __far *point,
                                             int distance)
{
    unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

    say("target %d %d %d %d\r\n", distance, *(int __far *)(sprite + 0x86),
        *(int __far *)(sprite + 0x88), draws);
    targetOn(module, point, distance);
    say("targeted %d %d %d\r\n", point[0], point[1], draws);
}

/* And `PetModule::PickLocomotionAction` (512, seg21:837c), how the dog
 * goes: `gait pace overrides draws` as it is asked, and `gaited action
 * draws` with what it answered. */
typedef int(__cdecl __far *PICKGAIT)(void __far *module, int pace, int overrides);
static PICKGAIT gaitOn;

static int __cdecl __far __loadds gaiting(void __far *module, int pace, int overrides)
{
    int answer;

    say("gait %d %d %d\r\n", pace, overrides, draws);
    answer = gaitOn(module, pace, overrides);
    say("gaited %d %d\r\n", answer, draws);
    return answer;
}

/* And `PetModule::PickNewPetSpot` (390, seg17:192b), where the dog wants
 * petting next: `spot was draws` with the spot it had (`+0x1224`), and
 * `spotted spot strokes draws` with the one it picked and its strokes
 * (`+0x1226`). */
typedef void(__cdecl __far *PICKSPOT)(unsigned char __far *module);
static PICKSPOT spotOn;

static void __cdecl __far __loadds spotting(unsigned char __far *module)
{
    say("spot %d %d\r\n", *(int __far *)(module + 0x1224), draws);
    spotOn(module);
    say("spotted %d %d %d\r\n", *(int __far *)(module + 0x1224), *(int __far *)(module + 0x1226),
        draws);
}

/* And `PetModule::IsBallGrabbable` (406): `grabbable answer draws`. */
typedef int(__cdecl __far *GRABBABLE)(void __far *module);
static GRABBABLE grabbableOn;

static int __cdecl __far __loadds grabbing(void __far *module)
{
    int answer = grabbableOn(module);

    say("grabbable %d %d\r\n", answer, draws);
    return answer;
}

/* And `BallSprite::Stop` (453), the ball stopped (by the dog's grabbing it,
 * say): `ballstop draws`. */
typedef void(__cdecl __far *STOPBALL)(void __far *ball);
static STOPBALL stopOn;

static void __cdecl __far __loadds stopping(void __far *ball)
{
    say("ballstop %d\r\n", draws);
    stopOn(ball);
}

/* And how the dog's rectangle is moved each frame (`Ballz`, 198 to 201):
 * `moved how word draws` -- 0 plainly (`MoveFrameRect`), 1 glued
 * (`MoveFrameRectBall`, the word its ball), 2 by a reference frame
 * (`GetCenterOffset`), 3 about its middle (`MoveFrameRectCenter`). Each
 * passed on as it came, whatever it takes (cdecl: its caller clears). */
typedef int(__cdecl __far *PLACING)(void __far *ballz, void __far *a, void __far *b,
                                     void __far *c, int d, int e, int f);
static PLACING placingOn[4];

static int placed(int how, void __far *ballz, void __far *a, void __far *b, void __far *c, int d,
                  int e, int f)
{
    say("moved %d %d %d\r\n", how, how == 1 ? d : -1, draws);
    return placingOn[how](ballz, a, b, c, d, e, f);
}

static int __cdecl __far __loadds plainly(void __far *z, void __far *a, void __far *b,
                                          void __far *c, int d, int e, int f)
{
    return placed(0, z, a, b, c, d, e, f);
}

static int __cdecl __far __loadds glued(void __far *z, void __far *a, void __far *b,
                                        void __far *c, int d, int e, int f)
{
    /* And each glue's states (`glue` the rectangle's top left before, then
     * the old state's frame, blend scale and frame, rotation, tilt, spin and
     * roll, and the new's; `glued` its top left after). */
    int __far *rect = (int __far *)a;
    unsigned char __far *now = (unsigned char __far *)b, __far *was = (unsigned char __far *)c;
    int answer;

    say("glue %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d\r\n", rect[0], rect[1],
        *(int __far *)(was + 0x18), *(int __far *)(was + 0x32), *(int __far *)(was + 0x34),
        *(int __far *)(was + 0xc), *(int __far *)(was + 0xe), *(int __far *)(was + 0x10),
        *(int __far *)(was + 0x12), *(int __far *)(now + 0x18), *(int __far *)(now + 0x32),
        *(int __far *)(now + 0x34), *(int __far *)(now + 0xc), *(int __far *)(now + 0xe),
        *(int __far *)(now + 0x10), *(int __far *)(now + 0x12));
    answer = placed(1, z, a, b, c, d, e, f);
    say("glued %d %d\r\n", rect[0], rect[1]);
    return answer;
}

static int __cdecl __far __loadds referred(void __far *z, void __far *a, void __far *b,
                                           void __far *c, int d, int e, int f)
{
    return placed(2, z, a, b, c, d, e, f);
}

static int __cdecl __far __loadds centred(void __far *z, void __far *a, void __far *b,
                                          void __far *c, int d, int e, int f)
{
    return placed(3, z, a, b, c, d, e, f);
}

/* And what the dog takes up and lets go of (`PetModule::GrabObject`,
 * `ReleaseObject`, 340, 341): `grab slot draws`, `release slot draws`. */
typedef void(__cdecl __far *HOLDING)(void __far *module, int slot);
static HOLDING grabOn, releaseOn;

/* A frame something is taken up or let go in (for `balls`, below). */
static int heldChanged;

static void __cdecl __far __loadds grabbed(void __far *module, int slot)
{
    heldChanged = 1;
    say("grab %d %d\r\n", slot, draws);
    grabOn(module, slot);
}

static void __cdecl __far __loadds released(void __far *module, int slot)
{
    heldChanged = 1;
    say("release %d %d\r\n", slot, draws);
    releaseOn(module, slot);
}

/* And the head's place for drawing (`Ballz::HeadTrackPrep`, 45): after it,
 * where the state it is given has its head tracking (`+0x1e`), `head dog
 * turn nod roll offset-x offset-y offset-z pivot-x pivot-y pivot-z draws
 * clock scale frame blend reference` --
 * the block it fills (`HeadTrackRenderBlock`, six words and three longs),
 * and whether the state is the dog's own (its sprite's `+0x51a`). */
typedef void(__cdecl __far *HEADPREP)(void __far *ballz, int __far *block, unsigned char __far *state);
static HEADPREP headOn;

static unsigned char __far *dogBallz;

/* And every working out of a state's balls (`Ballz::GetCartesianCoordinates`,
 * 210), which keeps the last five states it worked out and works one out
 * afresh only if it matches none (seg10:3770 to 39a8): `cart whose missed
 * slot draws` -- whose 1 the dog's own state (`+0x51a`), 2 its old (`+0xec`),
 * 0 another; missed if the ring's index (`+0x52`) moved on -- then the
 * fields it compares not yet named: `+0x14` (long), `+0x42`, `+0x44`,
 * `+0x48` (long), `+0x40c` (long), `+0x414` (long), and the 80-bit `+0x41c`
 * as five words. */
/* And each pop of the dog's script (`ScriptSprite::PopScript`, 69), which
 * stamps its state with the time as it starts (`+0x48`, seg7:5822):
 * `popped stamp flags draws` as it returns -- played ahead too. */
typedef int(__cdecl __far *POPSCRIPT)(void __far *sprite);
static POPSCRIPT popOn;

static int __cdecl __far __loadds popping(void __far *sprite)
{
    int flags = popOn(sprite);

    if (sprite == (void __far *)dogSprite) {
        say("popped %ld %d %d\r\n", *(long __far *)(dogSprite + 0x562), flags, draws);
    }

    return flags;
}

typedef void __far *(__cdecl __far *CARTESIAN)(void __far *ballz, unsigned char __far *state);
static CARTESIAN cartOn;

static void __far *__cdecl __far __loadds carting(void __far *ballz, unsigned char __far *state)
{
    int before;
    void __far *answer;
    int whose;

    if (dogBallz && ballz != (void __far *)dogBallz) {
        return cartOn(ballz, state);
    }

    before = *(int __far *)((unsigned char __far *)ballz + 0x52);
    answer = cartOn(ballz, state);
    whose = !dogSprite ? 0 : state == dogSprite + 0x51a ? 1 : state == dogSprite + 0xec ? 2 : 0;
    say("cart %d %d %d %d %ld %d %d %ld %ld %ld %u %u %u %u %u\r\n", whose,
        *(int __far *)((unsigned char __far *)ballz + 0x52) != before,
        *(int __far *)((unsigned char __far *)ballz + 0x50), draws, *(long __far *)(state + 0x14),
        *(int __far *)(state + 0x42), *(int __far *)(state + 0x44), *(long __far *)(state + 0x48),
        *(long __far *)(state + 0x40c), *(long __far *)(state + 0x414),
        *(unsigned __far *)(state + 0x41c), *(unsigned __far *)(state + 0x41e),
        *(unsigned __far *)(state + 0x420), *(unsigned __far *)(state + 0x422),
        *(unsigned __far *)(state + 0x424));
    return answer;
}

static void __cdecl __far __loadds heading(void __far *ballz, int __far *block,
                                           unsigned char __far *state)
{
    /* (The dog's balls, kept: their colours are written as it is painted.) */
    if (dogSprite && state == dogSprite + 0x51a) {
        dogBallz = (unsigned char __far *)ballz;
    }

    /* Not tracking, with the wobbles not yet put back (`Lube::curtime`
     * `+0xc`), they are put back now: `headrest draws`. */
    if (!*(int __far *)(state + 0x1e) && *(int __far *)((char __far *)ordinal(49) + 0xc)) {
        say("headrest %d\r\n", draws);
    }

    headOn(ballz, block, state);

    if (*(int __far *)(state + 0x1e)) {
        long __far *pivot = (long __far *)(block + 6);

        say("head %d %d %d %d %d %d %d %ld %ld %ld %d", dogSprite && state == dogSprite + 0x51a,
            block[0], block[1], block[2], block[3], block[4], block[5], pivot[0], pivot[1],
            pivot[2], draws);

        /* And the wobbles' clock (`Lube::curtime`, 49, the tick count it
         * read) and their scale's hundredths (`+0x36`), and the state's frame
         * and blend (`+0x18`, `+0x32`, `+0x34`), its neck's. */
        say(" %ld %d %d %d %d\r\n", *(long __far *)ordinal(49), *(int __far *)(state + 0x36),
            *(int __far *)(state + 0x18), *(int __far *)(state + 0x32), *(int __far *)(state + 0x34));
    }
}

/* And `PetModule::IsCursorOverPetSpot` (389), which works out where the pet
 * spot's ball is: `spotcheck` as it is asked, `spotchecked answer left top right bottom x y`
 * after, the box it made and where the ball is.
 * Passed on as it came, whatever it takes. */
typedef int(__cdecl __far *SPOTCHECK)(void __far *m, void __far *a, void __far *b, void __far *c,
                                      void __far *d, void __far *e, void __far *f, void __far *g);
static SPOTCHECK spotCheckOn;

/* And each step of the fudgers (`Fudger::ForAll`, 39, seg4:1257), as
 * `PopScript` calls it: `forall heading old-heading`, the dog's heading
 * (`+0x51a` `+0xc`) and the old state's (`+0xec` `+0xc`) as it is called.
 * Passed on as it came, whatever it takes (cdecl: its caller clears). */
typedef int(__cdecl __far *FORALL)(void __far *a, void __far *b, void __far *c, void __far *d,
                                   void __far *e, void __far *f, void __far *g, void __far *h);
static FORALL forAllOn;

static int __cdecl __far __loadds forAll(void __far *a, void __far *b, void __far *c, void __far *d,
                                         void __far *e, void __far *f, void __far *g, void __far *h)
{
    if (dogSprite) {
        say("forall %d %d\r\n", *(int __far *)(dogSprite + 0x526), *(int __far *)(dogSprite + 0xf8));
    }

    return forAllOn(a, b, c, d, e, f, g, h);
}

static int __cdecl __far __loadds spotChecking(void __far *m, void __far *a, void __far *b,
                                               void __far *c, void __far *d, void __far *e,
                                               void __far *f, void __far *g)
{
    int answer;

    say("spotcheck %d\r\n", draws);
    answer = spotCheckOn(m, a, b, c, d, e, f, g);
    /* And the box it made and the spot's ball (its second and third arguments). */
    say("spotchecked %d %d %d %d %d %d %d\r\n", answer, ((int __far *)b)[0], ((int __far *)b)[1],
        ((int __far *)b)[2], ((int __far *)b)[3], ((int __far *)c)[0], ((int __far *)c)[1]);
    return answer;
}

static void hookPushes(void)
{
    spotCheckOn = (SPOTCHECK)hookPrologue(389, (void __far *)spotChecking);
    forAllOn = (FORALL)hookPrologue(39, (void __far *)forAll);
    headOn = (HEADPREP)hookPrologue(45, (void __far *)heading);
    cartOn = (CARTESIAN)hookPrologue(210, (void __far *)carting);
    popOn = (POPSCRIPT)hookPrologue(69, (void __far *)popping);
    grabOn = (HOLDING)hookPrologue(340, (void __far *)grabbed);
    releaseOn = (HOLDING)hookPrologue(341, (void __far *)released);
    placingOn[0] = (PLACING)hookPrologue(199, (void __far *)plainly);
    placingOn[1] = (PLACING)hookPrologue(200, (void __far *)glued);
    placingOn[2] = (PLACING)hookPrologue(198, (void __far *)referred);
    placingOn[3] = (PLACING)hookPrologue(201, (void __far *)centred);
    stopOn = (STOPBALL)hookPrologue(453, (void __far *)stopping);
    grabbableOn = (GRABBABLE)hookPrologue(406, (void __far *)grabbing);
    spotOn = (PICKSPOT)hookPrologue(390, (void __far *)spotting);
    gaitOn = (PICKGAIT)hookPrologue(512, (void __far *)gaiting);
    targetOn = (NEWTARGET)hookPrologue(368, (void __far *)targeting);
    newStateOn = (NEWSTATE)hookPrologue(496, (void __far *)changing);
    storedOn = (PUSHTWO)hookPrologue(75, (void __far *)storing);
    neutralOn = (PUSHTWO)hookPrologue(78, (void __far *)neutral);
    scriptOn = (PUSHELEMENTS)hookPrologue(81, (void __far *)scripting);
    commandOn = (BRAINCALL)hookPrologue(293, (void __far *)commanding);
    zeroOn = (BRAINCALL)hookPrologue(304, (void __far *)zeroing);
    realOn = (BRAINCALL)hookPrologue(291, (void __far *)realising);
    fizzOn = (FIZZIKS)hookPrologue(99, (void __far *)fizzing);
}

/* The end of a frame's line: whether the dog is being petted (`+0x123a`),
 * its petting hand -- its frame, its count to the next and its step
 * (`+0x1232`, `+0x1234`, `+0x1236`) -- and how much it has enjoyed the
 * petting (`+0x122a`). */
static void hand(unsigned char __far *module)
{
    say(" %d %d %d %d %d\r\n", *(int __far *)(module + 0x123a), *(int __far *)(module + 0x1232),
        *(int __far *)(module + 0x1234), *(int __far *)(module + 0x1236),
        *(int __far *)(module + 0x122a));
}

long FAR PASCAL WindowProc(HWND window, UINT message, WPARAM w, LPARAM l)
{
    return DefWindowProc(window, message, w, l);
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    WNDCLASS kind;
    HWND window;
    HFILE file;
    unsigned char __far *module;
    int answer, n, frames = FRAMES;
    long forcing = 0;

    (void)previous, (void)command, (void)show;

    output = _lcreat("C:\\DOGZPEN.OUT", 0);
    dogz = LoadLibrary("DOGZDLL.DLL");

    if ((UINT)dogz < 32) {
        say("load %u\r\n", (UINT)dogz);
        _lclose(output);
        ExitWindows(0, 0);
        return 1;
    }

    dgroup = (unsigned)dogz;

    file = _lopen(DIRECTORY "\\PARAMS.BIN", OF_READ);
    _lread(file, params, sizeof params);
    _lclose(file);

    file = _lopen(DIRECTORY "\\FRAMES.TXT", OF_READ);

    if (file != HFILE_ERROR) {
        frames = (int)number(file);
        forcing = number(file);
        forcing = forcing < 0 ? 0 : forcing;
        _lclose(file);
    }

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
    kind.lpszClassName = "DogzPen";
    RegisterClass(&kind);
    window = CreateWindow("DogzPen", "Dogz", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 0, 640, 480, 0,
                          0, instance, 0);

    /* The game's window, library, instance and directory this driver's
     * own (`+0x238`, `+0x242`, `+0x244`, `+0x24e`). */
    *(unsigned *)(params + 0x238) = (unsigned)window;
    *(unsigned *)(params + 0x242) = (unsigned)dogz;
    *(unsigned *)(params + 0x244) = (unsigned)instance;
    lstrcpy((LPSTR)(params + 0x24e), DIRECTORY);

    answer = ((INITINI)ordinal(2))(params, 0);
    say("made ini %d\r\n", answer);
    ((WITHPARAMS)ordinal(3))(params);
    ((WITHPARAMS)ordinal(117))(params);
    say("made draw\r\n");

    module = ((MAKE)ordinal(482))(GlobalLock(GlobalAlloc(GPTR, 0x1280)));
    *(int *)(params + 0x54e) = 0;
    *(void __far **)(params + 0x550) = module;
    factorsOn = (LOADFACTORS)hookPrologue(499, (void __far *)loadingFactors);
    exciteOn = (SETEXCITE)hookPrologue(352, (void __far *)exciting);
    pulseOn = (PULSE)hookPrologue(498, (void __far *)pulsing);
    tricksOn = (PULSETRICKS)hookPrologue(346, (void __far *)pulsingTricks);
    findOn = (FINDSTART)hookPrologue(505, (void __far *)finding);

    /* The seed as the module is made (`seed`): the model's dog starts from it. */
    say("seed %lu\r\n", *(unsigned long __far *)MK_FP(dgroup, 0x2d28));
    answer = ((INITMODULE)ordinal(484))(module, params);
    say("made module %d %u %u\r\n", answer, FP_SEG(module), FP_OFF(module));
    {
        int k;

        for (k = 0; k < draws && k < KEPT; k++) {
            say("initdraw %d %lu %u %u\r\n", k, drawnSeed[k], drawnSeg[k], drawnOff[k]);
        }

        {
            unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

            say("inited %d %d %d %d %d %d %d\r\n", *(int __far *)(sprite + 0x60), *(int __far *)(sprite + 0x62),
                *(int __far *)(sprite + 0x64), *(int __far *)(sprite + 0x66), *(int __far *)(sprite + 0x86),
                *(int __far *)(sprite + 0x88), *(int __far *)(sprite + 0x51a + 0x18));
        }
        say("initstate %d %d %d\r\n", *(int __far *)(module + 0xc0), *(int __far *)(module + 0xd4), draws);
        /* The stage as the module keeps it (`ds:0x3bc2` on: left, top, right,
         * bottom, its height and width), and the dog's standard width and
         * height (`ds:0x3bd0`, `0x3bd2`). */
        {
            int __far *stage = (int __far *)MK_FP(dgroup, 0x3bc2);

            say("stage %d %d %d %d %d %d %d %d\r\n", stage[0], stage[1], stage[2], stage[3], stage[4], stage[5],
                stage[7], stage[8]);
        }
    }

    /* The brain, as DOGZ.WAD makes it just after (`InitPetzDDE`, 363,
     * seg15:0084; seg4:10de of DOGZ.WAD): an `XBrain` read from the INI's
     * brain file (`Main2`), its DDE mode 1, its five words unused. */
    answer = ((INITDDE)ordinal(363))(0, 0, 0, 0, 0);
    say("made brain %d %lu\r\n", answer, *(unsigned long __far *)MK_FP(dgroup, 0x1dfa));

    /* Each code segment's selector, by an export in it (`segments`, the
     * ordinal and its selector, each selector once). */
    say("segments");

    for (n = 1; n < 526; n++) {
        unsigned selector = FP_SEG(ordinal(n));
        int k;

        for (k = 1; k < n && FP_SEG(ordinal(k)) != selector; k++) {
        }

        if (selector && k == n) {
            say(" %d:%u", n, selector);
        }
    }

    say("\r\n");

    /* The library's trick table (ds:0x3b74, 59 records of 12 words) and the
     * sum of their idle weights (ds:0x3d94): `trick n` and its words. */
    {
        int __far *tricks = *(int __far *__far *)MK_FP(dgroup, 0x3b74);
        int t, w;

        for (t = 0; t < 59; t++) {
            say("trick %d", t);

            for (w = 0; w < 12; w++) {
                say(" %d", tricks[12 * t + w]);
            }

            say("\r\n");
        }

        say("weights %ld\r\n", *(long __far *)MK_FP(dgroup, 0x3d94));
    }

    hookPushes();

    for (n = 0; n < frames; n++) {
        /* A frame moves the dog on only once the clock reaches the time its
         * sprite (`+0x58`) keeps (`+0xb2`, 45 ms after its last; with
         * `PetParams` `+0x16` -1, as the game has it): waited for. */
        unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

        dogSprite = sprite;

        while (sprite && GetTickCount() < *(unsigned long __far *)(sprite + 0xb2)) {
        }

        /* Where `FRAMES.TXT` asks (its second number): 1, while the dog is
         * idle (4), its plan (`+0x11c4`, the next item, of `+0x11c6`) taken
         * to its end, so the next end of its queue decides where it goes;
         * 2, at the first frame, its excitement put at 20 (`SetExcitement`,
         * 352), its cycle there. */
        if (forcing & 1 && *(int __far *)(module + 0xc0) == 4) {
            *(int __far *)(module + 0x11c4) = *(int __far *)(module + 0x11c6);
        }

        /* 4, while the dog sleeps (5), its plan of sleep (the same two
         * fields) taken to its end too, so it wakes as its script ends. */
        if (forcing & 4 && *(int __far *)(module + 0xc0) == 5) {
            *(int __far *)(module + 0x11c4) = *(int __far *)(module + 0x11c6);
        }

        if (forcing & 2 && n == 0) {
            ((SETEXCITEMENT)ordinal(352))(module, 20);
        }

        /* 8, from the 100th frame to the 700th, the dog petted: the main
         * button held (`PetParams` `+0xe`, as `GetAsyncKeyState` has it) and
         * the cursor (`+0x12`, `+0x14`) moved 6 either side of the middle of
         * the dog's rectangle, a frame each; else let go. */
        if (forcing & 8) {
            int petting = n >= 100 && n < 700 && sprite;

            *(int *)(params + 0xe) = petting ? 0x8000 : 0;

            if (petting) {
                *(int *)(params + 0x12) = (*(int __far *)(sprite + 0x58) +
                                           *(int __far *)(sprite + 0x5c)) / 2 + (n & 1 ? 6 : -6);
                *(int *)(params + 0x14) =
                    (*(int __far *)(sprite + 0x5a) + *(int __far *)(sprite + 0x5e)) / 2;
            }
        }

        /* At frame 5, the stage's sprites (ds:0x3144; their count `+0x3c`,
         * their far pointers `+0x34` of what `+0x3e` points to): `sprite k
         * table-segment table-offset left top right bottom` (`+0x58` on). */
        if (n == 5) {
            unsigned char __far *stage = *(unsigned char __far *__far *)MK_FP(dgroup, 0x3144);
            unsigned char __far *list = *(unsigned char __far *__far *)(stage + 0x3e);
            unsigned char __far *__far *all = *(unsigned char __far *__far *__far *)(list + 0x34);
            int k, count = *(int __far *)(stage + 0x3c);

            for (k = 0; k < count; k++) {
                unsigned char __far *one = all[k];

                say("sprite %d %u %u %d %d %d %d\r\n", k, FP_SEG(*(void __far *__far *)one),
                    FP_OFF(*(void __far *__far *)one), *(int __far *)(one + 0x58),
                    *(int __far *)(one + 0x5a), *(int __far *)(one + 0x5c),
                    *(int __far *)(one + 0x5e));
            }
        }

        /* 16, the blue treat (the toy box's slot 9, as DOGZ.WAD's button
         * 1090 sends it) taken out at the 100th frame -- command 0 (`+0x2`)
         * with the slot (`+0x16`), dragged (`+0x18` 1) and the main button
         * down (`+0xe`) -- held at (146, 80) in the pen to frame 380, moved
         * to (146, 200) and let go at the 400th; or 32, the food bowl (slot
         * 6) taken out the same way and put down at (146, 200) at the
         * 110th; else no slot (-1) and not dragged, as DOGZ.WAD leaves them
         * after each frame. */
        /* 512, the brush (slot 4) taken out the same way at the 100th frame,
         * held, the button down, over the middle of the dog and let go at
         * the 150th, which paints; and again from the 250th, over the left
         * quarter of the dog, let go at the 300th. As each is let go, and
         * the frame after, `colours`, whether the dog is painted (`Ballz`
         * `+0xbe7`) and its 67 balls' colours (the words `+0xdc9` points to,
         * as `SetBallColor` writes them), where the dog's balls are known. */
        if (forcing & 512) {
            int stroke = n >= 100 && n < 150 ? 1 : n >= 250 && n < 300 ? 2 : 0;

            *(int *)(params + 0x16) = n == 100 || n == 250 ? 4 : -1;
            *(int *)(params + 0x18) = n == 100 || n == 250;
            *(int *)(params + 0xe) = stroke ? 0x8000 : 0;

            if (stroke && sprite) {
                int left = *(int __far *)(sprite + 0x58), right = *(int __far *)(sprite + 0x5c);

                *(int *)(params + 0x12) = stroke == 1 ? (left + right) / 2 : left + (right - left) / 4;
                *(int *)(params + 0x14) =
                    (*(int __far *)(sprite + 0x5a) + *(int __far *)(sprite + 0x5e)) / 2;
            }

            if (dogBallz && (n == 149 || n == 151 || n == 299 || n == 301)) {
                int __far *colours = *(int __far *__far *)(dogBallz + 0xdc9);
                int b;

                say("colours %d %d", n, *(int __far *)(dogBallz + 0xbe7));

                for (b = 0; b < 67; b++) {
                    say(" %d", colours[b]);
                }

                say("\r\n");
            }
        }

        /* 256, the spray (slot 3) taken out the same way at the 100th frame
         * and held, the button down, over the middle of the dog, to the
         * 160th, then let go. */
        if (forcing & 256) {
            *(int *)(params + 0x16) = n == 100 ? 3 : -1;
            *(int *)(params + 0x18) = n == 100;
            *(int *)(params + 0xe) = n >= 100 && n < 160 ? 0x8000 : 0;

            if (n >= 100 && n <= 160 && sprite) {
                *(int *)(params + 0x12) =
                    (*(int __far *)(sprite + 0x58) + *(int __far *)(sprite + 0x5c)) / 2;
                *(int *)(params + 0x14) =
                    (*(int __far *)(sprite + 0x5a) + *(int __far *)(sprite + 0x5e)) / 2;
            }
        }

        /* 128, the shoe (slot 5) taken out the same way at the 100th frame
         * and held, waved 40 either side of (146, 120) every 20 frames, to
         * the 700th, then let go. */
        if (forcing & 128) {
            *(int *)(params + 0x16) = n == 100 ? 5 : -1;
            *(int *)(params + 0x18) = n == 100;
            *(int *)(params + 0xe) = n >= 100 && n < 700 ? 0x8000 : 0;

            if (n >= 100 && n <= 700) {
                *(int *)(params + 0x12) = 146 + (n / 20 & 1 ? 40 : -40);
                *(int *)(params + 0x14) = 120;
            }
        }

        /* 64, the ball (slot 8) taken out the same way at the 100th frame,
         * held at (146, 80), swept from x 60 to 240 over frames 280 to 300,
         * 9 a frame, and let go at the 300th: thrown. */
        if (forcing & 64) {
            *(int *)(params + 0x16) = n == 100 ? 8 : -1;
            *(int *)(params + 0x18) = n == 100;
            *(int *)(params + 0xe) = n >= 100 && n < 300 ? 0x8000 : 0;

            if (n >= 100 && n <= 300) {
                *(int *)(params + 0x12) = n < 280 ? 146 : 60 + 9 * (n - 280);
                *(int *)(params + 0x14) = 80;
            }
        }

        /* Scruffed: the secondary button down from frame 100 to 200, a third
         * of the way down the dog's rectangle as it was at 100, the cursor
         * drifting 1 a frame right to 150, then back. */
        /* Poked: from frame 100, every 30 frames, the cursor put two frames
         * ahead at one of five points about the dog's rectangle in turn --
         * its top corners, a quarter of the way down; a quarter in from each
         * side and the middle, 5 above its bottom -- and the button down for
         * the one frame. */
        if (forcing & 4096) {
            static int pokeX, pokeY;
            int k = (n - 98) / 30, at = (n - 98) % 30;

            if (n >= 98 && n < 700 && at == 0 && sprite) {
                int left = *(int __far *)(sprite + 0x58), top = *(int __far *)(sprite + 0x5a);
                int right = *(int __far *)(sprite + 0x5c), bottom = *(int __far *)(sprite + 0x5e);
                int w = right - left, h = bottom - top;

                switch (k % 5) {
                case 0: pokeX = left + w / 10; pokeY = top + h / 4; break;
                case 1: pokeX = right - w / 10; pokeY = top + h / 4; break;
                case 2: pokeX = left + w / 4; pokeY = bottom - 5; break;
                case 3: pokeX = right - w / 4; pokeY = bottom - 5; break;
                default: pokeX = (left + right) / 2; pokeY = bottom - 5; break;
                }
            }

            if (n >= 98 && n < 700 && at <= 3) {
                *(int *)(params + 0x12) = pokeX;
                *(int *)(params + 0x14) = pokeY;
            }

            *(int *)(params + 0xe) = n >= 98 && n < 700 && at == 2 ? 0x8000 : 0;

            if (n >= 98 && n < 700 && at <= 3) {
                say("cursor %d %d %d %d %d\r\n", n, *(int *)(params + 0x12), *(int *)(params + 0x14),
                    *(int __far *)(module + 0x86), *(int __far *)(module + 0x88));
            }

            /* At the click, the dog's neutral position (the sprite's `+0x94a`)
             * and its type (`GetNeutralType`, 67): standing with 0x10. */
            if (n >= 98 && n < 700 && at == 2 && sprite) {
                int position = *(int __far *)(sprite + 0x94a);

                say("poking %d %d %d\r\n", n, position, ((NEUTRALTYPE)ordinal(67))(position));
            }
        }

        if (forcing & 2048) {
            static int scruffX, scruffY;

            if (n == 100 && sprite) {
                scruffX = (*(int __far *)(sprite + 0x58) + *(int __far *)(sprite + 0x5c)) / 2;
                scruffY = *(int __far *)(sprite + 0x5a) + (*(int __far *)(sprite + 0x5e) - *(int __far *)(sprite + 0x5a)) / 3;
            }

            *(int *)(params + 0xc) = n >= 100 && n < 200 ? 0x8000 : 0;

            if (n >= 100 && n <= 200) {
                *(int *)(params + 0x12) = scruffX + (n < 150 ? n - 100 : 200 - n);
                *(int *)(params + 0x14) = scruffY;
                say("cursor %d %d %d %d %d\r\n", n, *(int *)(params + 0x12), *(int *)(params + 0x14),
                    *(int __far *)(module + 0x86), *(int __far *)(module + 0x88));
            }
        }

        if (forcing & (1072 | 8192 | 16384)) {
            int treat = (forcing & (16 | 8192 | 16384)) != 0;
            int slot = forcing & 16384 ? 11 : forcing & 8192 ? 10 : forcing & 16 ? 9 : forcing & 1024 ? 7 : 6;
            int until = treat ? 400 : 110;
            /* With 32768 (`DOGZ_AGAIN`), a treat so every 400 frames: frame
             * 100 + 400k is taken as 100. */
            int m = forcing & 32768 && treat && n >= 100 ? 100 + (n - 100) % 400 : n;

            *(int *)(params + 0x16) = m == 100 ? slot : -1;
            *(int *)(params + 0x18) = m == 100;
            *(int *)(params + 0xe) = m >= 100 && m < until ? 0x8000 : 0;

            if (m >= 100 && m <= until) {
                *(int *)(params + 0x12) = 146;
                *(int *)(params + 0x14) = m < until - 20 ? 80 : 200;
            }
        }

        /* `tick n state global seed`, its 11 factors (`+0x11de` on) and the
         * idle weights' sum, as the frame begins. */
        /* The engine's clock as the frame begins (`clock n ms`): `timeGetTime`, as seg9:0668 asks it. */
        {
            typedef DWORD(FAR PASCAL * TIMEGET)(void);
            static TIMEGET timeGet;

            if (!timeGet) {
                timeGet = (TIMEGET)GetProcAddress(GetModuleHandle("MMSYSTEM"), "TIMEGETTIME");
            }

            say("clock %d %lu\r\n", n, timeGet ? timeGet() : 0ul);
        }

        /* The place in the game's table of 50 numbers as the frame begins
         * (`table n`): `ScriptSprite::theirSavedThis` (101, seg26) `+0x6e`,
         * moved on before each is taken (seg7:44df, 4b99, 416d). */
        say("table %d\r\n", *(int __far *)((unsigned char __far *)ordinal(101) + 0x6e));

        /* And the dog's queue as the frame begins (`queue read write depth at
         * count: words`): its array (`+0x209c`), read from `+0x20a8` to
         * `+0x20a4`, and the repeat on top of its stack (`+0x20ac`, its place
         * `+0x20ae` and count `+0x20d6`), then up to 1500 words from the read. */
        if (dogSprite) {
            int __far *words = *(int __far *__far *)(dogSprite + 0x209c);
            int read = *(int __far *)(dogSprite + 0x20a8);
            int write = *(int __far *)(dogSprite + 0x20a4);
            int depth = *(int __far *)(dogSprite + 0x20ac);
            int at;

            /* (And, before the words, the blink: its phase `-0x720e` and wait `-0x7218`.) */
            say("blinking %d %d\r\n", *(int __far *)(dogSprite + (unsigned)-0x720e),
                *(int __far *)(dogSprite + (unsigned)-0x7218));
            say("queue %d %d %d %d %d:", read, write, depth, *(int __far *)(dogSprite + 0x20ae + 2 * depth),
                *(int __far *)(dogSprite + 0x20d6 + 2 * depth));

            for (at = read; at < write && at < read + 1500; at++) {
                say(" %x", (unsigned)words[at]);
            }

            say("\r\n");
        }

        /* And what the frame is handed (`params x y buttons slot taken`):
         * the cursor (`PetParams` `+0x12`, `+0x14`), the buttons (`+0xe`),
         * the toy box's slot taken out (`+0x16`) and whether just now (`+0x18`). */
        say("params %d %d %d %d %d\r\n", *(int *)(params + 0x12), *(int *)(params + 0x14),
            *(int *)(params + 0xe), *(int *)(params + 0x16), *(int *)(params + 0x18));

        say("tick %d %d %d %lu", n, *(int __far *)(module + 0xc0), *(int __far *)(module + 0xd4),
            *(unsigned long __far *)MK_FP(dgroup, 0x2d28));

        for (answer = 0; answer < 11; answer++) {
            say(" %d", *(int __far *)(module + 0x11de + 2 * answer));
        }

        say(" %ld", *(long __far *)MK_FP(dgroup, 0x3d94));
        hand(module);

        /* With the ball (64): `ball held in-box left top right bottom vx vy`
         * -- the ball's sprite (`PetModule` `+0x78`), as the frame begins,
         * its speed (`+0x174`, `+0x178`) each a float's bits, and whether the
         * dog holds it in its mouth or under a paw (`+0x18c`, `+0x18e`, as
         * `GrabObject` marks them). */
        if (forcing & 64) {
            unsigned char __far *ball = *(unsigned char __far *__far *)(module + 0x78);

            say("ball %d %d %d %d %d %d %lu %lu %d %d\r\n", *(int __far *)(ball + 0x16a),
                *(int __far *)(ball + 0x16c), *(int __far *)(ball + 0x58),
                *(int __far *)(ball + 0x5a), *(int __far *)(ball + 0x5c),
                *(int __far *)(ball + 0x5e), *(unsigned long __far *)(ball + 0x174),
                *(unsigned long __far *)(ball + 0x178), *(int __far *)(ball + 0x18c),
                *(int __far *)(ball + 0x18e));
        }

        /* With the shoe out, whether the user holds it (`+0x16a`) and whether
         * the dog may take a thing from the hand (the module's `+0x96`):
         * `GrabObject` takes it only if not, or if so (`ActualGrabObject`,
         * seg14:084c); its middle (`+0x86`, `+0x88`), and whether the dog
         * has hold of it, lunging (the module's `+0x222`, seg3:1a92). */
        if (forcing & 128) {
            unsigned char __far *shoe = *(unsigned char __far *__far *)(module + 0x74);

            say("shoe %d %d %d %d %d\r\n", *(int __far *)(shoe + 0x16a), *(int __far *)(module + 0x96),
                *(int __far *)(shoe + 0x86), *(int __far *)(shoe + 0x88), *(int __far *)(module + 0x222));
        }

        draws = 0;

        /* (What opening the port answers the program does not ask.) */
        ((WITHPARAMS)ordinal(118))(params);
        heldChanged = 0;
        ((DRAWFRAME)ordinal(485))(module, params);
        ((WITHPARAMS)ordinal(119))(params);
        sprite = *(unsigned char __far *__far *)(module + 0x58);

        /* Something taken up or let go, its head not tracking (else the asking
         * would wobble it, and draw): each of the dog's balls as `Ballz::
         * GetBallOffset` (203, seg10:3213) has it after the frame, `balls x y
         * ...` -- (ballz, &point, state +0x51a, rect +0x60, ball). */
        if (heldChanged && sprite && !*(int __far *)(sprite + 0x51a + 0x1e)) {
            typedef void(__cdecl __far * BALLAT)(void __far *ballz, int __far *point,
                                                 unsigned char __far *state,
                                                 unsigned char __far *rect, int ball);
            void __far *ballz = *(void __far *__far *)MK_FP(dgroup, 0x3bbe);
            int count = *(int __far *)((unsigned char __far *)ballz + 0x58);
            int ball, point[2];

            say("balls %d", n);

            for (ball = 0; ball < count; ball++) {
                ((BALLAT)ordinal(203))(ballz, (int __far *)point, sprite + 0x51a, sprite + 0x60, ball);
                say(" %d %d", point[0], point[1]);
            }

            say("\r\n");
        }

        say("frame %d %d %d %lu %d %u", n, *(int __far *)(module + 0xc0),
            *(int __far *)(module + 0xd4), *(unsigned long __far *)MK_FP(dgroup, 0x2d28), draws,
            FP_SEG(sprite));

        /* And the stage the dog is kept to (ds:0x3bc2 to 0x3bc8) and the
         * dog's rectangle (its sprite's `+0x58` to `+0x5e`). */
        for (answer = 0; answer < 4; answer++) {
            say(" %d", *(int __far *)MK_FP(dgroup, 0x3bc2 + 2 * answer));
        }

        for (answer = 0; answer < 4; answer++) {
            say(" %d", sprite ? *(int __far *)(sprite + 0x58 + 2 * answer) : 0);
        }

        hand(module);

        /* `state` and the dog's placing as the frame left it: its sprite's
         * rectangle (`+0x60` to `+0x66`) and its middle (`+0x86`, `+0x88`);
         * then its state (`BallState`, `+0x51a`): its three scales (longs),
         * rotation, tilt, spin and roll (`+0xc` to `+0x12`), frame (`+0x18`),
         * head turn and nod and `+0x1e`, blend scale and reference frame
         * (`+0x32`, `+0x34`), the frame's rectangle in its own terms (`+0x38`
         * to `+0x3e`) and `+0x42`, `+0x44`. */
        if (sprite) {
            unsigned char __far *at = sprite + 0x51a;
            static const int words[] = {0xc, 0xe, 0x10, 0x12, 0x18, 0x1a, 0x1c, 0x1e,
                                        0x32, 0x34, 0x38, 0x3a, 0x3c, 0x3e, 0x42, 0x44};

            say("state");

            for (answer = 0; answer < 4; answer++) {
                say(" %d", *(int __far *)(sprite + 0x60 + 2 * answer));
            }

            say(" %d %d %ld %ld %ld", *(int __far *)(sprite + 0x86), *(int __far *)(sprite + 0x88),
                *(long __far *)at, *(long __far *)(at + 4), *(long __far *)(at + 8));

            for (answer = 0; answer < 16; answer++) {
                say(" %d", *(int __far *)(at + words[answer]));
            }

            /* And whether it steers to a target, and where (`+0x2108`, `+0x2110`);
             * and whether its state has something of its own to draw -- what
             * it holds, in its mouth or under a paw (`+0x40c`, `+0x414`);
             * and whether it slides (`8af4`, `-0x71f2`). */
            say(" %d %d %d %d %d %d", *(int __far *)(sprite + 0x2108),
                *(int __far *)(sprite + 0x2110), *(int __far *)(sprite + 0x2112),
                *(void __far *__far *)(at + 0x40c) != 0, *(void __far *__far *)(at + 0x414) != 0,
                *(int __far *)(sprite + (unsigned)-0x71f2));
            /* (Then the steering's box: its width and height, `-0x71f6`, `-0x71f4`, and distance, `+0x2114`.) */
            say(" %d %d %d\r\n", *(int __far *)(sprite + (unsigned)-0x71f6),
                *(int __far *)(sprite + (unsigned)-0x71f4), *(int __far *)(sprite + 0x2114));

            /* And the slide: its limit and count (`-0x71f0`, `-0x71ee`), and its
             * place and speed each way (`-0x71ec` on), floats' bits. */
            say("slide %d %d %lu %lu %lu %lu\r\n", *(int __far *)(sprite + (unsigned)-0x71f0),
                *(int __far *)(sprite + (unsigned)-0x71ee),
                *(unsigned long __far *)(sprite + (unsigned)-0x71ec),
                *(unsigned long __far *)(sprite + (unsigned)-0x71e8),
                *(unsigned long __far *)(sprite + (unsigned)-0x71e4),
                *(unsigned long __far *)(sprite + (unsigned)-0x71e0));
        }

        /* Each draw kept: `drawn k seed selector offset`, where it returns to. */
        for (answer = 0; answer < draws && answer < KEPT; answer++) {
            say("drawn %d %lu %u %u\r\n", answer, drawnSeed[answer], drawnSeg[answer],
                drawnOff[answer]);
        }
    }

    _lclose(output);
    ExitWindows(0, 0);
    return 0;
}
