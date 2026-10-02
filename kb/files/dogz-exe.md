---
kind: file
name: DOGZ.EXE
summary: The program Windows runs, which only loads the game: DOGZ.WAD, after WinG.
status: partial
files: [DOGZ.DOG/DOGZ.EXE]
---

[[documented]] Its module name is `DOGZLOAD` and its description, in its own non-resident name table, is "Loads DOGZ.WAD, making sure WinG already loaded. (c) 1995 PF. Magic, Inc."

- [[read out]] A 16-bit Windows NE program of 54,802 bytes: five segments, no exports, importing only from KERNEL and USER. Its strings name `DOGZ.WAD` and `WING.DLL`.
- [[read out]] It refuses to run twice, with "Sorry, you can only run one copy of DOGZ at a time."
- [[inferred]] Everything else the game does is in [[file:DOGZ.DOG/DOGZ.WAD]], which it loads, and the libraries that loads. Not yet known: how it hands over to `DOGZ.WAD`.
