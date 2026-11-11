/*
 * Dogz's parameters as the program fills them in (DOGZ.WAD's `PetParams`,
 * ds:0x27c6, 0x680 bytes, zeroed and filled from 4:05c5 on): DOGZ.WAD run
 * from beside this program (`WinExec`, whose answer is its instance, its
 * data segment), and its parameters kept (`PARAMS.BIN`) at this program's
 * first turn after its first dog's module is made (its pointer, ds:0x2d16,
 * set: made and set up, `InitPetModule`, in one go, before the program
 * yields; it yields seldom after, playing in a loop of its own), then
 * Windows ended. `DOGZCAP.OUT` says what was done: `exec` and the instance,
 * `made` and the tick it was seen in, `kept`.
 */
#include <dos.h>
#include <string.h>
#include <windows.h>

#define PARAMS 0x27c6
#define PARAMS_SIZE 0x680
#define MODULES 0x2d16

static HFILE output;
static HINSTANCE dogz;
static int ticks;

static void say(LPCSTR format, ...)
{
    char text[120];

    _lwrite(output, text, wvsprintf(text, format, (LPSTR)(&format + 1)));
}

static void keep(LPCSTR name)
{
    HFILE file = _lcreat(name, 0);

    _lwrite(file, (LPCSTR)MK_FP((unsigned)dogz, PARAMS), PARAMS_SIZE);
    _lclose(file);
    say("kept %s %d\r\n", name, ticks);
}

void CALLBACK __export tick(HWND window, UINT message, UINT id, DWORD time)
{
    ticks++;

    if (*(void __far *__far *)MK_FP((unsigned)dogz, MODULES)) {
        say("made %d\r\n", ticks);
        keep("PARAMS.BIN");
    } else if (ticks < 3000) {
        return;
    } else {
        say("never made\r\n");
    }

    _lclose(output);
    ExitWindows(0, 0);
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR line, int show)
{
    MSG message;

    output = _lcreat("DOGZCAP.OUT", 0);
    dogz = (HINSTANCE)WinExec("DOGZ.WAD", SW_SHOWNORMAL);
    say("exec %u\r\n", (unsigned)dogz);

    if ((unsigned)dogz < 32) {
        _lclose(output);
        ExitWindows(0, 0);
        return 0;
    }

    SetTimer(NULL, 1, 100, (TIMERPROC)MakeProcInstance((FARPROC)tick, instance));

    while (GetMessage(&message, NULL, 0, 0)) {
        TranslateMessage(&message);
        DispatchMessage(&message);
    }

    return 0;
}
