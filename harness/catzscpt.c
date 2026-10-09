/*
 * CATZDLL.DLL's script player: a bare `ScriptSprite` (ordinal 944) made as
 * `InitScriptSprite` (946) makes one, for the Hunter's kitten (see
 * catzfram.c), its scripts read from the cat's file (`LoadScripts`, 949).
 * Its table of 150 random numbers (`ScriptRand`'s, at `+0x146e`) first:
 * `table` and the numbers. Then for each case in `CASES.TXT` beside it, a
 * line `action variant from` a case --
 * the stack is emptied (`ResetStack`, 951, hard), the action pushed
 * (`PushStoredAction`, 956) and played a tick at a time (`PopScript`, 992)
 * until nothing is left of it:
 *
 * * `case action variant from index seed`: where `ScriptRand` is in its
 *   table (`+0x146c`) and the C library's `rand` seed (`ds:28ba`);
 * * `start` and each fudger's value as the case begins, its fudgers stopped
 *   (`ResetParams`, 952), and `fudger i value previous rising before state
 *   target drift velocity` for each, all of it `ResetParams` leaves as it
 *   was (`Fudger` `+0xc8`, `+0xc4`, `+0xcc`, `+0xce`, `+0xe2`, `+0xc0`,
 *   `+0xda`, and the double at `+0xb8` in hex); `blink wait shut kept`, the
 *   cat's blinking as it starts (`CatSprite` `+0x3584` to `+0x3588`, which
 *   the sprite has room for), `CatSprite::HandleBlinking` (578) called
 *   before every `PopScript`; `pushed planned actual` after the push, then
 * * `tick frame rotation planned remaining actual` a tick: the frame shown
 *   (`BallState` `+0x1a`, at sprite `+0x692`), the cat's rotation
 *   (`+0x688`), the position it will be in once what is pushed has played
 *   (`+0x14fe`), how much is left on the stack (`GetStackRemaining`, 968)
 *   and the position it is in (`+0x1500`); then each of its 14 fudgers'
 *   values (`+0x1516` on, 0x120 bytes apart, `+200` in each); then a
 *   layered action's first frame and frame now (`+0x6c2`, `+0x6c4`); then
 *   where it is put, its rectangle (`+0x124` to `+0x12a`), and its tilt,
 *   roll and head's rotation, tilt and cock (`+0x68a`, `+0x68c`, `+0x694`
 *   to `+0x698`), and its eyelids and eyes (`+0x69a` to `+0x6aa`);
 * * where the case names a target (`action variant from x y width height
 *   share`, x -1 for none), `target`, before `case`: the point and box it
 *   is given, and the point `GetTargetPt` answers; and after each tick's
 *   fields, what `PopScript` answered (2: the target is in the box) and the
 *   rotation's fudger's target (`Fudger` `+0xc0`);
 * * before its first tick, `place`: its rectangle, and the state it was
 *   last placed in (`+0x246`), its frame, rotation, tilt, roll, head,
 *   layered frames and scale; and `eyes`, that state's eyelids and eyes.
 */
#include "catzdraw.h"

typedef void __far *(__cdecl __far *MAKE)(void __far *object);
typedef void(__cdecl __far *LOAD)(void __far *linez, const char __far *path, void __far *params);
typedef void(__cdecl __far *AVERAGE)(void __far *into, void __far *adult, void __far *young,
                                     long percent, void __far *params);
typedef void(__cdecl __far *INITSPRITE)(void __far *sprite, const char __far *directory,
                                        void __far *linez, const char __far *name, int what,
                                        void __far *apt, void __far *params);
typedef void(__cdecl __far *LOADSCRIPTS)(void __far *sprite, const char __far *path,
                                         void __far *linez, void __far *params);
typedef void(__cdecl __far *RESET)(void __far *sprite, int type);
typedef void(__cdecl __far *PUSH)(void __far *sprite, int action, int variant);
typedef void(__cdecl __far *POP)(void __far *sprite, void __far *params);
typedef unsigned(__cdecl __far *POPSCRIPT)(void __far *sprite, void __far *params);
typedef unsigned long(__cdecl __far *TARGETPT)(void __far *apt, int space);
typedef int(__cdecl __far *REMAINING)(void __far *sprite);
typedef void(__cdecl __far *PLAIN)(void);
typedef void(__cdecl __far *PLAIN_SPRITE)(void __far *sprite);

#define DIRECTORY "C:\\CORPUS\\CATZSCPT\\"
#define TICKS 200
#define FUDGERS 14

/* What a case writes, kept until it is done: one write a case, not a tick. */
static char kept[8192];
static int keptLength;

static void keep(LPCSTR format, ...)
{
    keptLength += wvsprintf(kept + keptLength, format, (LPSTR)(&format + 1));

    if (keptLength > sizeof kept - 200) {
        _lwrite(output, kept, keptLength);
        keptLength = 0;
    }
}

/* The next number of the cases file, or -1 at its end. */
static int number(HFILE file)
{
    char c;
    int n = 0, digits = 0, negative = 0;

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

/*
 * A sound player that plays nothing, in place of the one Catz gives a
 * sprite (`+0x1f6`): `PopScript` and `HandleSoundVerb` call it through its
 * table (`+4` to `+0x10`) and read its fields.
 */
static void __cdecl __far silent(void)
{
}

static void(__cdecl __far *silentTable[8])(void) = {silent, silent, silent, silent,
                                                     silent, silent, silent, silent};
static unsigned char player[0x60];

static unsigned char __far *linezOf(MAKE make, LOAD load, LPCSTR file)
{
    unsigned char __far *linez = make(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
    char path[80];

    lstrcpy(path, DIRECTORY);
    lstrcat(path, file);
    load(linez, path, params);
    return linez;
}

int PASCAL WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR command, int show)
{
    MAKE makeLinez;
    LOAD load;
    unsigned char __far *adult;
    unsigned char __far *young;
    unsigned char __far *linez;
    unsigned char __far *sprite;
    unsigned char __far *target;
    RESET reset;
    PUSH push;
    POPSCRIPT pop;
    POP blink;
    REMAINING remaining;
    HFILE cases;
    int n, t;

    (void)instance, (void)previous, (void)command, (void)show;

    if (!setUp("C:\\CATZSCPT.OUT", 1234)) {
        return 1;
    }

    /* The sine and cosine tables, by segment 48's own selector. */
    ((PLAIN)MK_FP(FP_SEG(ordinal(1240)), 0x1410))();

    makeLinez = (MAKE)ordinal(927);
    load = (LOAD)ordinal(929);
    adult = linezOf(makeLinez, load, "AHUNTER.LNZ");
    young = linezOf(makeLinez, load, "KHUNTER.LNZ");
    linez = makeLinez(GlobalLock(GlobalAlloc(GPTR, 0x2ccb)));
    ((AVERAGE)ordinal(931))(linez, adult, young, 100L, params);

    sprite = ((MAKE)ordinal(944))(GlobalLock(GlobalAlloc(GPTR, 0x4000)));
    ((INITSPRITE)ordinal(946))(sprite, DIRECTORY, linez, "CAT", 0, 0, params);
    ((LOADSCRIPTS)ordinal(949))(sprite, DIRECTORY "CAT.SCP", linez, params);

    /* A second sprite, for a case's target: a point, its rectangle there and
     * its target rectangle the same (`+0x1c4` to `+0x1ca` from it). */
    target = ((MAKE)ordinal(944))(GlobalLock(GlobalAlloc(GPTR, 0x4000)));
    ((INITSPRITE)ordinal(946))(target, DIRECTORY, linez, "CAT", 0, 0, params);

    /* A 640 by 480 stage, for a point on it at random (`PetParams` `+0xac` to `+0xb2`). */
    *(int __far *)(params + 0xac) = 0;
    *(int __far *)(params + 0xae) = 0;
    *(int __far *)(params + 0xb0) = 640;
    *(int __far *)(params + 0xb2) = 480;

    /* Sounds played by nothing, panned across a 640-wide stage (`ds:2ba6`, `2baa`). */
    *(void __far *__far *)player = (void __far *)silentTable;
    *(void __far *__far *)(sprite + 0x1f6) = (void __far *)player;
    *(int __far *)MK_FP(dgroup, 0x2ba6) = 0;
    *(int __far *)MK_FP(dgroup, 0x2baa) = 640;

    reset = (RESET)ordinal(951);
    push = (PUSH)ordinal(956);
    pop = (POPSCRIPT)ordinal(992);
    remaining = (REMAINING)ordinal(968);
    blink = (POP)ordinal(578);

    {
        static char text[1200];
        int length = wsprintf(text, "table");
        int __far *table = *(int __far *__far *)(sprite + 0x146e);

        for (n = 0; n < 150; n++) {
            length += wsprintf(text + length, " %d", table[n]);
        }

        text[length++] = '\r', text[length++] = '\n';
        _lwrite(output, text, length);
    }

    cases = _lopen(DIRECTORY "CASES.TXT", OF_READ);

    for (;;) {
        int action = number(cases), variant = number(cases), from = number(cases);
        int x = number(cases), y = number(cases), width = number(cases), height = number(cases);
        int share = number(cases);

        if (from < 0) {
            break;
        }

        /* Each from scratch: no frame left to align to (`+0x1462`), as the
         * last action's `alignScripts0` leaves one. */
        reset(sprite, 2);
        *(int __far *)(sprite + 0x1462) = 0;

        /* Nor anything a case cut short left on its stacks to come back to:
         * each stack's saved position and action (`+0x3a`, `+0x3c`, which
         * `PopStackList` restores), and the action being played (`+0x1502`). */
        for (n = 0; n < 6; n++) {
            unsigned char __far *stack = *(unsigned char __far *__far *)(sprite + 0x1446 + 4 * n);

            *(int __far *)(stack + 0x3a) = from;
            *(int __far *)(stack + 0x3c) = -1;
        }

        *(int __far *)(sprite + 0x1502) = -1;

        /* And its fudgers stopped, as a cat's are between states (`ResetParams`, 952). */
        ((PLAIN_SPRITE)ordinal(952))(sprite);

        /* And no layered action left playing (`ResetLayeredAction`, 957), its frame none. */
        ((PLAIN_SPRITE)ordinal(957))(sprite);
        *(int __far *)(sprite + 0x6c4) = -1;
        *(int __far *)(sprite + 0x14fe) = from;
        *(int __far *)(sprite + 0x1500) = from;
        /* A target to walk to, where the case gives one at a point on the stage
         * (`targetSprite4`, seg41:0e8d): the sprite (`+0x1504`), and how wide,
         * how high and how far ahead the box it is looked for in is
         * (`+0x250e`, `+0x2510`, `+0x2512`); the cat put at (270, 190). The
         * point it is steered to is the target's target rectangle's middle
         * (`GetTargetPt`, 10, printed after `target`): its rectangle, which is
         * also its grab rectangle, offset by that, so twice the point given
         * (`SetLocalTarget`, seg2:16af). */
        if (x >= 0) {
            *(int __far *)(target + 0x124) = x;
            *(int __far *)(target + 0x126) = y;
            *(int __far *)(target + 0x128) = x;
            *(int __far *)(target + 0x12a) = y;

            for (n = 0; n < 4; n++) {
                *(int __far *)(target + 0x1c4 + 2 * n) = 0;
            }

            *(void __far *__far *)(sprite + 0x1504) = (void __far *)target;
            *(int __far *)(sprite + 0x250e) = width;
            *(int __far *)(sprite + 0x2510) = height;
            *(int __far *)(sprite + 0x2512) = share;
            *(int __far *)(sprite + 0x124) = 270;
            *(int __far *)(sprite + 0x126) = 190;
            *(int __far *)(sprite + 0x128) = 370;
            *(int __far *)(sprite + 0x12a) = 290;
            keep("target %d %d %d %d %d %lu\r\n", x, y, width, height, share,
                 ((TARGETPT)ordinal(10))(target, 0));
        } else {
            *(void __far *__far *)(sprite + 0x1504) = 0;
        }

        keep("case %d %d %d %d %lu\r\n", action, variant, from, *(int __far *)(sprite + 0x146c),
             *(unsigned long __far *)MK_FP(dgroup, 0x28ba));
        keep("start");

        for (n = 0; n < FUDGERS; n++) {
            keep(" %ld", *(long __far *)(sprite + 0x1516 + 0x120 * n + 200));
        }

        keep("\r\n");

        /* All of each that `ResetParams` leaves as it was, to go on from. */
        for (n = 0; n < FUDGERS; n++) {
            unsigned char __far *fudger = sprite + 0x1516 + 0x120 * n;

            keep("fudger %d %ld %ld %d %d %d %ld %ld %08lx%08lx\r\n", n,
                 *(long __far *)(fudger + 0xc8), *(long __far *)(fudger + 0xc4),
                 *(int __far *)(fudger + 0xcc), *(int __far *)(fudger + 0xce),
                 *(int __far *)(fudger + 0xe2), *(long __far *)(fudger + 0xc0),
                 *(long __far *)(fudger + 0xda), *(unsigned long __far *)(fudger + 0xbc),
                 *(unsigned long __far *)(fudger + 0xb8));
        }
        push(sprite, action, variant);
        keep("pushed %d %d\r\n", *(int __far *)(sprite + 0x14fe), *(int __far *)(sprite + 0x1500));

        /* Its blinking from where the action's number says, the eyes open. */
        *(int __far *)(sprite + 0x3584) = action % 50;
        *(int __far *)(sprite + 0x3586) = 0;
        *(int __far *)(sprite + 0x3588) = 0;
        keep("blink %d %d %d\r\n", *(int __far *)(sprite + 0x3584),
             *(int __far *)(sprite + 0x3586), *(int __far *)(sprite + 0x3588));

        /* Where it is: its rectangle (`+0x124`), and the state it was last
         * placed in, which the first tick moves it from (`+0x246`): its
         * frame, rotation, tilt, roll, head, layered frames and scale. */
        keep("place %d %d %d %d %d %d %d %d %d %d %d %d %d %ld\r\n", *(int __far *)(sprite + 0x124),
             *(int __far *)(sprite + 0x126), *(int __far *)(sprite + 0x128),
             *(int __far *)(sprite + 0x12a), *(int __far *)(sprite + 0x260),
             *(int __far *)(sprite + 0x256), *(int __far *)(sprite + 0x258),
             *(int __far *)(sprite + 0x25a), *(int __far *)(sprite + 0x262),
             *(int __far *)(sprite + 0x264), *(int __far *)(sprite + 0x266),
             *(int __far *)(sprite + 0x290), *(int __far *)(sprite + 0x292),
             *(long __far *)(sprite + 0x25c));

        /* And its eyelids and eyes there (`+0x22` to `+0x32` of the state),
         * part of what the engine tells one state from another by. */
        keep("eyes");

        for (n = 0; n < 9; n++) {
            keep(" %d", *(int __far *)(sprite + 0x268 + 2 * n));
        }

        keep("\r\n");

        /* Played until all that is left is the action's end, shown again;
         * each tick blinking first, as `CatSprite::Update` does. */
        for (t = 0; t < TICKS; t++) {
            int left;
            unsigned flags;

            blink(sprite, params);
            flags = pop(sprite, params);
            left = remaining(sprite);
            keep("tick %d %d %d %d %d", *(int __far *)(sprite + 0x692),
                 *(int __far *)(sprite + 0x688), *(int __far *)(sprite + 0x14fe), left,
                 *(int __far *)(sprite + 0x1500));

            /* And each fudger's value (`Fudger` `+200`, as `GetCurVal` reads it). */
            for (n = 0; n < FUDGERS; n++) {
                keep(" %ld", *(long __far *)(sprite + 0x1516 + 0x120 * n + 200));
            }

            /* And a layered action's first frame and frame now (`BallState` `+0x4a`, `+0x4c`). */
            keep(" %d %d", *(int __far *)(sprite + 0x6c2), *(int __far *)(sprite + 0x6c4));

            /* And where it is put: its rectangle, and the tilt, roll and
             * head it is drawn with (`+0x68a`, `+0x68c`, `+0x694` on). */
            keep(" %d %d %d %d %d %d %d %d %d", *(int __far *)(sprite + 0x124),
                 *(int __far *)(sprite + 0x126), *(int __far *)(sprite + 0x128),
                 *(int __far *)(sprite + 0x12a), *(int __far *)(sprite + 0x68a),
                 *(int __far *)(sprite + 0x68c), *(int __far *)(sprite + 0x694),
                 *(int __far *)(sprite + 0x696), *(int __far *)(sprite + 0x698));

            /* And its eyelids and eyes (`+0x69a` to `+0x6aa`). */
            for (n = 0; n < 9; n++) {
                keep(" %d", *(int __far *)(sprite + 0x69a + 2 * n));
            }

            /* And what `PopScript` answered: 2 where the target is in the box ahead. */
            keep(" %u", flags);

            /* And the rotation's fudger's target (`Fudger` `+0xc0`), where a target aims it. */
            keep(" %ld\r\n", *(long __far *)(sprite + 0x1516 + 0xc0));

            if (left <= 1) {
                break;
            }
        }

        _lwrite(output, kept, keptLength);
        keptLength = 0;
    }

    _lclose(cases);
    end();
    return 0;
}
