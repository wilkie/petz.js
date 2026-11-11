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
 * put down (16), a bowl of food put down (32), or the ball thrown (64).
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
 *   and `spotted` for each spot it wants petting on, and `grabbable` for
 *   each time it is asked whether it can grab the ball.
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
    say("stored %u %d %d %d\r\n", FP_SEG(sprite), a, b, draws);
    return storedOn(sprite, a, b);
}

static int __cdecl __far __loadds neutral(void __far *sprite, int a, int b)
{
    say("neutral %u %d %d %d\r\n", FP_SEG(sprite), a, b, draws);
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

static void hookPushes(void)
{
    grabbableOn = (GRABBABLE)hookPrologue(406, (void __far *)grabbing);
    spotOn = (PICKSPOT)hookPrologue(390, (void __far *)spotting);
    gaitOn = (PICKGAIT)hookPrologue(512, (void __far *)gaiting);
    targetOn = (NEWTARGET)hookPrologue(368, (void __far *)targeting);
    newStateOn = (NEWSTATE)hookPrologue(496, (void __far *)changing);
    storedOn = (PUSHTWO)hookPrologue(75, (void __far *)storing);
    neutralOn = (PUSHTWO)hookPrologue(78, (void __far *)neutral);
    scriptOn = (PUSHELEMENTS)hookPrologue(81, (void __far *)scripting);
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
    answer = ((INITMODULE)ordinal(484))(module, params);
    say("made module %d %u %u\r\n", answer, FP_SEG(module), FP_OFF(module));

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

    hookRand();
    hookPushes();

    for (n = 0; n < frames; n++) {
        /* A frame moves the dog on only once the clock reaches the time its
         * sprite (`+0x58`) keeps (`+0xb2`, 45 ms after its last; with
         * `PetParams` `+0x16` -1, as the game has it): waited for. */
        unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

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

        if (forcing & 48) {
            int slot = forcing & 16 ? 9 : 6, until = forcing & 16 ? 400 : 110;

            *(int *)(params + 0x16) = n == 100 ? slot : -1;
            *(int *)(params + 0x18) = n == 100;
            *(int *)(params + 0xe) = n >= 100 && n < until ? 0x8000 : 0;

            if (n >= 100 && n <= until) {
                *(int *)(params + 0x12) = 146;
                *(int *)(params + 0x14) = n < until - 20 ? 80 : 200;
            }
        }

        /* `tick n state global seed`, its 11 factors (`+0x11de` on) and the
         * idle weights' sum, as the frame begins. */
        say("tick %d %d %d %lu", n, *(int __far *)(module + 0xc0), *(int __far *)(module + 0xd4),
            *(unsigned long __far *)MK_FP(dgroup, 0x2d28));

        for (answer = 0; answer < 11; answer++) {
            say(" %d", *(int __far *)(module + 0x11de + 2 * answer));
        }

        say(" %ld", *(long __far *)MK_FP(dgroup, 0x3d94));
        hand(module);

        /* With the ball (64): `ball held in-box left top right bottom` --
         * the ball's sprite (`PetModule` `+0x78`), as the frame begins. */
        if (forcing & 64) {
            unsigned char __far *ball = *(unsigned char __far *__far *)(module + 0x78);

            say("ball %d %d %d %d %d %d\r\n", *(int __far *)(ball + 0x16a),
                *(int __far *)(ball + 0x16c), *(int __far *)(ball + 0x58),
                *(int __far *)(ball + 0x5a), *(int __far *)(ball + 0x5c),
                *(int __far *)(ball + 0x5e));
        }

        draws = 0;

        /* (What opening the port answers the program does not ask.) */
        ((WITHPARAMS)ordinal(118))(params);
        ((DRAWFRAME)ordinal(485))(module, params);
        ((WITHPARAMS)ordinal(119))(params);
        sprite = *(unsigned char __far *__far *)(module + 0x58);

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
