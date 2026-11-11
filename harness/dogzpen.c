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
 * * `frame n state global seed` after each frame: the dog's state
 *   (`PetModule` `+0xc0`, newest of the ten `NewState` keeps), its global
 *   state (`+0xd4`) and C's `rand` seed (DOGZDLL ds:0x2d28).
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

long FAR PASCAL WindowProc(HWND window, UINT message, WPARAM w, LPARAM l)
{
    return DefWindowProc(window, message, w, l);
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    WNDCLASS kind;
    HWND window;
    HFILE file;
    unsigned dgroup;
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

    /* The library's data segment, its instance: C's `rand` keeps its seed there. */
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

    for (n = 0; n < frames; n++) {
        /* A frame moves the dog on only once the clock reaches the time its
         * sprite (`+0x58`) keeps (`+0xb2`, 45 ms after its last; with
         * `PetParams` `+0x16` -1, as the game has it): waited for. */
        unsigned char __far *sprite = *(unsigned char __far *__far *)(module + 0x58);

        while (sprite && GetTickCount() < *(unsigned long __far *)(sprite + 0xb2)) {
        }

        /* (What opening the port answers the program does not ask.) */
        ((WITHPARAMS)ordinal(118))(params);
        ((DRAWFRAME)ordinal(485))(module, params);
        ((WITHPARAMS)ordinal(119))(params);
        sprite = *(unsigned char __far *__far *)(module + 0x58);

        say("frame %d %d %d %lu %d %lu %lu\r\n", n, *(int __far *)(module + 0xc0),
            *(int __far *)(module + 0xd4), *(unsigned long __far *)MK_FP(dgroup, 0x2d28),
            *(int __far *)(module + 0x11c8), sprite ? *(unsigned long __far *)(sprite + 0xb2) : 0ul,
            GetTickCount());
    }

    _lclose(output);
    ExitWindows(0, 0);
    return 0;
}
