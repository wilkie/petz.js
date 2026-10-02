---
kind: format
name: NE executables and libraries
summary: Windows 3.1's 16-bit program format, which every one of Dogz's programs and libraries is — what the project's reader takes from it, and what Dogz's own files hold.
status: implemented
files:
  [
    DOGZ.DOG/DOGZ.EXE,
    DOGZ.DOG/DOGZ.WAD,
    DOGZ.DOG/THINK.DLL,
    DOGZ.DOG/NEURON.DLL,
    WINDOWS/DOGZDLL.DLL,
  ]
source: [src/formats/ne.ts, scripts/re/disasm.ts]
---

[[documented]] An NE file is an MS-DOS stub, then at the offset its word at `0x3c` gives, a header starting `NE` whose tables say where everything else is. Microsoft documented the format; this is what the project reads of it, in `src/formats/ne.ts`, and what reading Dogz's files showed. [[guide:reproducing]] has how to disassemble any of them.

## What is read

| From the NE header     | What                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `0x04`, `0x06`         | The entry table and its length: each export's segment and offset, by ordinal       |
| `0x1c`, `0x22`         | How many segments, and the segment table: each one's place, length and flags       |
| `0x1e`, `0x28`, `0x2a` | How many modules are imported from, their references, and the imported names table |
| `0x24`                 | The resource table                                                                 |
| `0x26`                 | The resident names: the module's name, then exports by name and ordinal            |
| `0x20`, `0x2c`         | The non-resident names' length and file offset: the description, then more exports |
| `0x32`                 | The shift that segment offsets are counted in                                      |

- [[documented]] A segment with flag `0x100` is followed in the file by its relocations: a count, then eight bytes each. A relocation patches a selector (2), a far pointer (3) or an offset (5) with an address in the module, an import by ordinal or by name, or a fixup of the operating system's. One that is not additive is the head of a chain: the bytes at each place it patches give the next place, until `0xffff`.
- [[documented]] A resource's type and id are numbers when their high bit is set, and otherwise offsets of names in the resource table; its offset and length are counted in the table's own shift.
- [[measured]] The entries of a movable segment are reached through the entry table: a relocation to segment `0xff` names an entry's ordinal, not an offset.

## What Dogz's files hold

- [[measured]] [[file:WINDOWS/DOGZDLL.DLL]] has 32 segments and 525 exports, every one named, with Borland C++'s mangled names: `@XDrawPort@0MakeColorRamp$qn15BIGBITMAPHEADERssn9XRGBColort4ds` is `XDrawPort::MakeColorRamp`, of a `BIGBITMAPHEADER *`, two shorts, an `XRGBColor *` twice, a `double` and a short.
- [[measured]] The floating-point code of `DOGZDLL.DLL` and the others is patched for Windows' emulator, `WIN87EM`: every x87 instruction carries an operating-system fixup: types 5 and 6 in the code read so far.
- [[read out]] Borland's class tables sit in the code segments: after `XDrawPort::XShowPal` in seg8 come the class's name, `XDrawPort`, and its table of virtual methods from seg8:994a, a far pointer each, `LoadExtraColors` in slot 1 and `MakeColorRamp` in slot 17.
