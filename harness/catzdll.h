/*
 * What every driver of CATZDLL.DLL shares: the library loaded from beside
 * the program, a function of it by its ordinal, and an output file the test
 * reads back, a line a case. See test/harness/catzdll_test.ts.
 */
#include <windows.h>

static HINSTANCE catz;
static HFILE output;

/* Opens the output file and loads the library; FALSE, with a line saying
 * why, if it would not load. */
static BOOL begin(LPCSTR name)
{
    char text[40];

    output = _lcreat(name, 0);
    catz = LoadLibrary("CATZDLL.DLL");

    if ((UINT)catz < 32) {
        _lwrite(output, text, wsprintf(text, "load %u\r\n", (UINT)catz));
        _lclose(output);
        return FALSE;
    }

    return TRUE;
}

/* A function of the library, by its ordinal: the names it exports are kept
 * as its linker wrote them. */
static FARPROC ordinal(int number)
{
    return GetProcAddress(catz, MAKEINTRESOURCE(number));
}

/* A line of the output, as wsprintf makes it. */
static void say(LPCSTR format, ...)
{
    char text[128];
    int length = wvsprintf(text, format, (LPSTR)(&format + 1));

    _lwrite(output, text, length);
}

static void end(void)
{
    _lclose(output);
    FreeLibrary(catz);
}
