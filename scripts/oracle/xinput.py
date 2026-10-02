#!/usr/bin/env python3
"""
Presses keys, types text and clicks on an X display, through the XTest
extension: for driving DOSBox, running on a virtual display, through
installers and dialogs that no program of Windows' own can answer.

    xinput.py :94 Return
    xinput.py :94 Alt_L+F4 Tab space
    xinput.py :94 'type:Dogz oracle' Tab
    xinput.py :94 click:320,240
    xinput.py :94 point:320,240

Each argument is a key, or keys held together joined by `+`, by X keysym
name; `type:` followed by text to type a character at a time; `point:`
followed by x,y to put Windows' pointer there; or `click:` to put it there
and press the left button. Keys first put the pointer inside DOSBox's
window, so that they go to it.

From winbox.js's xkeys.py, with typing and the pointer added.
"""

import ctypes
import subprocess
import sys
import time

x11 = ctypes.cdll.LoadLibrary('libX11.so.6')
xtst = ctypes.cdll.LoadLibrary('libXtst.so.6')

x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong] + [ctypes.c_void_p] * 7
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int,
                                      ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                      ctypes.c_ulong]

# Characters typed with Shift held, by the key that makes them.
SHIFTED = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9',
    ')': '0', '_': 'minus', '+': 'equal', '{': 'bracketleft', '}': 'bracketright',
    ':': 'semicolon', '"': 'apostrophe', '<': 'comma', '>': 'period', '?': 'slash',
    '|': 'backslash', '~': 'grave',
}

NAMED = {
    ' ': 'space', '-': 'minus', '=': 'equal', '[': 'bracketleft', ']': 'bracketright',
    ';': 'semicolon', "'": 'apostrophe', ',': 'comma', '.': 'period', '/': 'slash',
    '\\': 'backslash', '`': 'grave',
}

DEBUG = __import__('os').environ.get('XINPUT_DEBUG')

# Windows' screen, and DOSBox's window at the display's top left.
WIDTH, HEIGHT = 640, 480

# How far Windows' pointer moves for a pixel of the host's, to start with.
# DOSBox, with its mouse not locked, works out an absolute position from
# where the host's pointer is in its window, scaled to the range it assumes
# for the video mode -- 0..199 down the window for a mode it does not know,
# such as the 256-colour driver's, and 0..479 for the VGA's own 640x480 --
# and hands Windows' PS/2 driver the differences. So the scales depend on
# the display, and `point` measures them as it goes.
SCALE_X = 1
SCALE_Y = 199 / 479


# Windows 3.1's arrow, as it is drawn on the screen: where its hot spot is
# (the top left here) the pixel is white, and so on. Only these pixels are
# compared, so it is found over any background.
ARROW = [
    '.W..........',
    'BWW.........',
    'BWWWB.......',
    'BWWWWB......',
    'BWWWWWB.....',
    'BWWWWWWB....',
    'BWWWWWWWB...',
    '.WWWWWWWWB..',
    '.WWWWWWWWWB.',
    '.WWWWWWBBBBB',
]
ARROW_PIXELS = [(dx, dy, (0, 0, 0) if c == 'B' else (255, 255, 255))
                for dy, row in enumerate(ARROW) for dx, c in enumerate(row) if c != '.']


def code(display, name):
    keysym = x11.XStringToKeysym(name.encode())

    if not keysym:
        sys.exit(f'no key {name}')

    return x11.XKeysymToKeycode(display, keysym)


def chord(display, names):
    codes = [code(display, name) for name in names]

    for each in codes:
        xtst.XTestFakeKeyEvent(display, each, 1, 0)
        x11.XFlush(display)
        time.sleep(0.05)

    for each in reversed(codes):
        xtst.XTestFakeKeyEvent(display, each, 0, 0)
        x11.XFlush(display)
        time.sleep(0.05)


def keys_for(character):
    if character in SHIFTED:
        return ['Shift_L', SHIFTED[character]]

    if character.isupper():
        return ['Shift_L', character.lower()]

    return [NAMED.get(character, character)]


def move(display, x, y):
    xtst.XTestFakeMotionEvent(display, -1, x, y, 0)
    x11.XFlush(display)
    time.sleep(0.01)


def host_pointer(display):
    """Where the host's pointer is on the X display."""
    values = [ctypes.c_ulong(), ctypes.c_ulong()] + [ctypes.c_int() for _ in range(4)] + \
        [ctypes.c_uint()]
    x11.XQueryPointer(display, x11.XDefaultRootWindow(display),
                      *[ctypes.byref(value) for value in values])
    return values[2].value, values[3].value


def screen(name):
    """Windows' screen, as rows of RGB tuples, through ImageMagick."""
    raw = subprocess.run(['import', '-display', name, '-window', 'root', '-crop',
                          f'{WIDTH}x{HEIGHT}+0+0', '-depth', '8', 'rgb:-'],
                         capture_output=True, check=True).stdout
    return raw


def find_arrow(raw):
    """Where the arrow's hot spot is on the screen, or None if it is not drawn."""
    def pixel(x, y):
        at = (y * WIDTH + x) * 3
        return raw[at], raw[at + 1], raw[at + 2]

    for y in range(HEIGHT - 1):
        for x in range(WIDTH - 1):
            # Two pixels of the arrow's left edge rule out nearly everywhere.
            if pixel(x, y + 1) != (0, 0, 0) or pixel(x + 1, y + 1) != (255, 255, 255):
                continue

            # By an edge, the arrow is drawn clipped: compare what is drawn.
            if all(pixel(x + dx, y + dy) == colour for dx, dy, colour in ARROW_PIXELS
                   if x + dx < WIDTH and y + dy < HEIGHT):
                return x, y

    return None


def ratchet(display, host_x, host_y, columns, rows, scale):
    """
    Moves Windows' pointer about `columns` and `rows` and leaves the host's
    where it was: a leap one way, which the mouse driver doubles, and a walk
    back a pixel at a time, which it does not. A leap is kept short enough
    that its difference fits the PS/2 packet's nine bits, and inside the
    window, where DOSBox sees it.
    """
    def span(amount, scale, at, size):
        if not amount:
            return 0

        # As far as wanted, within the packet's reach and the window's room.
        room = size - 1 - at if amount > 0 else at
        leap = min(240, round(abs(amount) / scale / 2), room)

        if leap < 10:
            return 0

        return leap if amount > 0 else -leap

    lx = span(columns, scale[0], host_x, WIDTH)
    ly = span(rows, scale[1], host_y, HEIGHT)

    if not lx and not ly:
        return False

    move(display, host_x + lx, host_y + ly)

    for step in range(max(abs(lx), abs(ly)) - 1, -1, -1):
        move(display, host_x + (lx * step) // max(abs(lx), abs(ly)),
             host_y + (ly * step) // max(abs(lx), abs(ly)))

    return True


def point(display, name, x, y):
    """
    Puts Windows' pointer at x,y of the screen it draws.

    DOSBox hands Windows relative motion only, scaled and, for a large
    motion, accelerated by the mouse driver, so where a motion takes the
    pointer is never quite certain. So the pointer is moved by what the
    scales predict, a pixel of the host's at a time, and then found on the
    screen and moved again by what is left, until it is there. Where the
    host's pointer would have to leave DOSBox's window to get there -- the
    window's height spans only 200 of Windows' rows -- a ratchet moves
    Windows' pointer without moving the host's. Where the arrow is not drawn,
    because what is under it shows another pointer, its place is reckoned
    from the last walk.
    """
    hx, hy = host_pointer(display)

    if not (0 <= hx < WIDTH and 0 <= hy < HEIGHT):
        hx, hy = WIDTH // 2, HEIGHT // 2
        move(display, hx, hy)

    scale = [SCALE_X, SCALE_Y]

    # The last walk, to measure the scales by: where the host's pointer and
    # Windows' were before it.
    walked = None

    for _ in range(24):
        found = find_arrow(screen(name))

        reckoned = False

        if found is None and walked:
            # Over something that takes a pointer of its own -- a hand over
            # a button -- the arrow is not drawn. Where the last walk should
            # have put it, by the scales measured so far, is the best there
            # is.
            (from_hx, from_hy), (from_x, from_y) = walked
            found = (round(from_x + (hx - from_hx) * scale[0]),
                     round(from_y + (hy - from_hy) * scale[1]))
            reckoned = True

        if found is None:
            # Off an edge, where it is only partly drawn: bring it in, and
            # look again.
            ratchet(display, hx, hy, 0, -60, scale)
            walked = None

            for _ in range(40):
                hx = max(0, hx - 1)
                move(display, hx, hy)

            time.sleep(0.3)
            continue

        if walked and not reckoned:
            (from_hx, from_hy), (from_x, from_y) = walked

            # A walk long enough to measure, which cannot have been clamped
            # at the screen's edge, says how far a host pixel goes.
            for axis, host, seen in ((0, hx - from_hx, found[0] - from_x),
                                     (1, hy - from_hy, found[1] - from_y)):
                if abs(host) >= 8 and seen * host > 0:
                    scale[axis] = seen / host

        walked = None
        dx, dy = x - found[0], y - found[1]

        if DEBUG:
            print(f'host {hx},{hy} pointer {found} off by {dx},{dy} scale {scale}', file=sys.stderr)

        if abs(dx) <= 1 and abs(dy) <= 1 or (reckoned and abs(dx) <= 3 and abs(dy) <= 3):
            return

        target_x = hx + round(dx / scale[0])
        target_y = hy + round(dy / scale[1])

        if not (0 <= target_x < WIDTH and 0 <= target_y < HEIGHT):
            # Out of the window's reach: ratchet toward it.
            if not ratchet(display, hx, hy,
                           dx if not 0 <= target_x < WIDTH else 0,
                           dy if not 0 <= target_y < HEIGHT else 0, scale):
                # Against the window's edge, with no room to leap: walk back
                # toward its middle first, which moves Windows' pointer the
                # wrong way, but leaves room.
                middle_x, middle_y = WIDTH // 2, HEIGHT // 2

                while (hx, hy) != (middle_x, middle_y):
                    hx += max(-1, min(1, middle_x - hx))
                    hy += max(-1, min(1, middle_y - hy))
                    move(display, hx, hy)

            time.sleep(0.3)
            continue

        walked = ((hx, hy), found)

        while (hx, hy) != (target_x, target_y):
            hx += max(-1, min(1, target_x - hx))
            hy += max(-1, min(1, target_y - hy))
            move(display, hx, hy)

        time.sleep(0.3)

    sys.exit(f'point: could not get the pointer to {x},{y}')


def press(display):
    xtst.XTestFakeButtonEvent(display, 1, 1, 0)
    x11.XFlush(display)
    time.sleep(0.15)
    xtst.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)


def main():
    name = sys.argv[1]
    display = x11.XOpenDisplay(name.encode())

    if not display:
        sys.exit(f'cannot open display {name}')

    inside = False

    for argument in sys.argv[2:]:
        if argument.startswith(('point:', 'click:')):
            x, y = (int(part) for part in argument[6:].split(','))
            point(display, name, x, y)

            if argument.startswith('click:'):
                time.sleep(0.2)
                press(display)

            inside = True
        else:
            if not inside:
                hx, hy = host_pointer(display)

                if not (0 <= hx < WIDTH and 0 <= hy < HEIGHT):
                    move(display, 4, 4)
                    time.sleep(0.2)

                inside = True

            if argument.startswith('type:'):
                for character in argument[5:]:
                    chord(display, keys_for(character))
            else:
                chord(display, argument.split('+'))

        time.sleep(0.3)

    x11.XCloseDisplay(display)


main()
