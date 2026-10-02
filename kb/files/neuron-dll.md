---
kind: file
name: NEURON.DLL
summary: Three exported functions that each copy out one string — the installation's encoded validation code, which Setup writes into the DLL itself.
status: partial
files: [DOGZ.DOG/NEURON.DLL]
source: [src/protection/unlock.ts]
topics: [copy-protection, adoption-unlock]
---

[[read out]] A 16-bit Windows NE library of 13,456 bytes: one code segment and one data segment, Borland C++, importing only from KERNEL and USER.

| Ordinal | Name           | Where     | What it copies into the caller's buffer, with `wsprintf("%s", …)` |
| ------- | -------------- | --------- | ----------------------------------------------------------------- |
| 2       | `_GetPlayPen`  | seg1:1615 | the 22 digits at `ds:0070`                                        |
| 3       | `_GetFillData` | seg1:1639 | the 22 digits at `ds:0087`                                        |
| 4       | `_GetPetSize`  | seg1:165d | the 22 digits at `ds:009e`                                        |

[[read out]] That is all three do. [[measured]] The digits are different on every installation: Setup rewrites them in the file, in the data segment at file offset `0x1c70`, so `NEURON.DLL` is one of the files no two installations share byte for byte. Decoded by `THINK.DLL`'s `_LookAtBrain`, each with its own branch's keys, all three give the same 19 digits: the validation code the adoption screen shows ([[topic:adoption-unlock]]). `src/protection/unlock.ts` decodes them, and its test holds two installations' strings to what their screens showed.
