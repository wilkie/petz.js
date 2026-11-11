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
 * clock lets the dog move on.
 *
 * * `made`: the library and the module;
 * * `segments`: each code segment's selector, by an export of it;
 * * `trick n` and its 12 words, for each of the library's 59, and
 *   `weights`, the sum of their idle weights;
 * * for each frame, `tick n state global seed`, the dog's 11 factors and
 *   the weights' sum as it begins; `newstate from to draws` for each
 *   change of state within it; and after it `frame n state global seed
 *   draws` -- the dog's state (`PetModule` `+0xc0`, newest of the ten
 *   `NewState` keeps), its global state (`+0xd4`), C's `rand` seed
 *   (DOGZDLL ds:0x2d28) and how many times it was drawn -- and `drawn k
 *   seed selector offset` for each draw, the seed before it and where it
 *   returned to.
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

/* `PetModule::NewState` (496, seg21:5bb8), which may be called again within
 * itself, as a state entered asks for another: a far jump over its first
 * five bytes -- its prologue, `mov ax,DGROUP`, `inc bp`, `push bp` -- to
 * this, which writes each change (`newstate from to draws`, the draws of the
 * frame before it) and goes on through a copy of them that jumps back. */
typedef int(__cdecl __far *NEWSTATE)(void __far *module, int state);
static NEWSTATE newStateOn;

static int __cdecl __far __loadds changing(unsigned char __far *module, int state)
{
    say("newstate %d %d %d\r\n", *(int __far *)(module + 0xc0), state, draws);
    return newStateOn(module, state);
}

static void hookNewState(void)
{
    void __far *at = (void __far *)ordinal(496);
    UINT writable = alias(170, FP_SEG(at));
    unsigned char __far *code = (unsigned char __far *)MK_FP(writable, FP_OFF(at));
    HGLOBAL memory = GlobalAlloc(GMEM_FIXED, 16);
    unsigned char __far *copy = (unsigned char __far *)GlobalLock(memory);
    int k;

    for (k = 0; k < 5; k++) {
        copy[k] = code[k];
    }

    jumpTo(copy + 5, (unsigned char __far *)at + 5);
    newStateOn = (NEWSTATE)MK_FP(alias(171, FP_SEG(copy)), FP_OFF(copy));
    jumpTo(code, (void __far *)changing);
    FreeSelector(writable);
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
    hookNewState();

    for (n = 0; n < frames; n++) {
        /* A frame moves the dog on only once the clock reaches the time its
         * sprite (`+0x58`) keeps (`+0xb2`, 45 ms after its last; with
         * `PetParams` `+0x16` -1, as the game has it): waited for. */
        unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

        while (sprite && GetTickCount() < *(unsigned long __far *)(sprite + 0xb2)) {
        }

        /* `tick n state global seed`, its 11 factors (`+0x11de` on) and the
         * idle weights' sum, as the frame begins. */
        say("tick %d %d %d %lu", n, *(int __far *)(module + 0xc0), *(int __far *)(module + 0xd4),
            *(unsigned long __far *)MK_FP(dgroup, 0x2d28));

        for (answer = 0; answer < 11; answer++) {
            say(" %d", *(int __far *)(module + 0x11de + 2 * answer));
        }

        say(" %ld\r\n", *(long __far *)MK_FP(dgroup, 0x3d94));
        draws = 0;

        /* (What opening the port answers the program does not ask.) */
        ((WITHPARAMS)ordinal(118))(params);
        ((DRAWFRAME)ordinal(485))(module, params);
        ((WITHPARAMS)ordinal(119))(params);
        sprite = *(unsigned char __far *__far *)(module + 0x58);

        say("frame %d %d %d %lu %d\r\n", n, *(int __far *)(module + 0xc0),
            *(int __far *)(module + 0xd4), *(unsigned long __far *)MK_FP(dgroup, 0x2d28), draws);

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
