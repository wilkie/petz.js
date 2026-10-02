---
kind: file
name: THINK.DLL
summary: The copy protection, named to pass for part of the dog's brain — checks the unlock code, writes the marker files, and decodes the validation code.
status: partial
files: [DOGZ.DOG/THINK.DLL]
source: [src/protection/unlock.ts]
topics: [copy-protection, adoption-unlock]
---

[[read out]] A 16-bit Windows NE library of 53,589 bytes: two code segments and one data segment, Borland C++ (1994), importing only from KERNEL and USER. The whole of what it does is [[topic:copy-protection]]; the unlock code's check is [[topic:adoption-unlock]].

| Ordinal | Name                   | Where     | What                                                                           |
| ------- | ---------------------- | --------- | ------------------------------------------------------------------------------ |
| 1       | `WEP`                  | seg1:00b4 | The library's exit procedure                                                   |
| 2       | `_ThinkProc`           | seg2:1609 | The commands `spawn`, `skulk` and `finish`; `finish` checks the unlock code    |
| 3       | `_RetrieveThought`     | seg2:077f | Reads a stretch of a file; the game checks the [[format:marker]] files with it |
| 4       | `_ConvertThoughtToIds` | seg2:07fa | Not yet known                                                                  |
| 5       | `_GetTimeId`           | seg2:150f | The last four digits of `time()`                                               |
| 6       | `_LookAtBrain`         | seg2:003e | Adds (`0xED`) or subtracts (`0x541`) one of three 18-digit keys, modulo 10     |

## Inside

- [[read out]] seg2:0538 finds the first hard disk from C: to F:, and seg2:0415 reads its volume serial number with INT 21h `AX=6900h` through DPMI's INT 31h `AX=0300h` ([[topic:adoption-unlock]]).
- [[read out]] seg2:01e7 is the table that scrambles a hex digit, and seg2:031a makes four digits of a serial number with it.
- [[read out]] The data segment holds the [[format:marker]] template at `ds:0870`, the six marker files' names, the three commands, and `think.mfg`, which `_ThinkProc` reads ten bytes of from the directory it is given (seg2:1780 to 17c5).
- [[read out]] The C runtime is Borland's: `ltoa` at seg1:2146, which writes hex digits in lower case, and `strupr` at seg1:1f08.
