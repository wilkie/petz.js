/*
 * `XBallz::GenerateZDepthColor` (CATZDLL.DLL seg47:5d04, ordinal 1215): a
 * colour shifted along its ramp by a depth's shift. It reads only the
 * parameters `GetParamsPtr` answers -- `+0xd6` bits a pixel, `+0xe0` the
 * ramps' first colour, `+0xe2` their length -- which are set here, by
 * `SetParamsPtr` (ordinal 1241), as `XDrawPort::InitStaticDraw` sets them
 * (seg44:0ebe): 8 bits, 28 and 10; and 4 bits, 0 and 1. A line a case: the
 * bits, the colour, the shift, and the colour it answers.
 */
#include "catzdll.h"

typedef int(__cdecl __far *SHADE)(void __far *ballz, int colour, int shift);
typedef void(__cdecl __far *SETPARAMS)(void __far *params);

static unsigned char params[0x400];
static unsigned char ballz[0x100];

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    SHADE shade;
    SETPARAMS setParams;
    int bits, colour, shift;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!begin("C:\\CATZSHAD.OUT")) {
        return 1;
    }

    shade = (SHADE)ordinal(1215);
    setParams = (SETPARAMS)ordinal(1241);
    setParams(params);

    for (bits = 4; bits <= 8; bits += 4) {
        *(int *)(params + 0xd6) = bits;
        *(int *)(params + 0xe0) = bits == 4 ? 0 : 28;
        *(int *)(params + 0xe2) = bits == 4 ? 1 : 10;

        for (colour = 0; colour < 256; colour++) {
            for (shift = -8; shift <= 8; shift++) {
                say("%d %d %d %d\r\n", bits, colour, shift, shade(ballz, colour, shift));
            }
        }
    }

    end();
    return 0;
}
