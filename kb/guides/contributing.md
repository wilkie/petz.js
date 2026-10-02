---
kind: guide
name: Adding to the knowledge base
summary: How a finding becomes a page — which kind of page, what goes in its front matter, how to label each claim, and what the build will refuse.
---

A finding goes on the site when it can be checked: by looking at the oracle, by reading the code at an offset, or by running a test. `kb/README.md` in the repository is the reference for the page format; this is the order of work.

## Choose the page

- **One file of the game**, such as [[file:DOGZ.DOG/THINK.DLL]]: a page in `kb/files/`. It names the file's path on the drive in `files`, exactly as the list of [[guide:reproducing|the oracle's]] files gives it. A file has one page at most.
- **A format several files share**, such as [[format:marker]]: a page in `kb/formats/`, naming every file in it.
- **Behaviour that crosses files**, such as [[topic:adoption-unlock]]: a page in `kb/topics/`.

A file or format page says how far it is understood with `status`: `unexplored`, `partial`, `understood`, or `implemented` once `src/` reimplements it with tests. An implemented page names that code in `source`.

## Label every claim

Each claim starts with how it is known:

- `[[measured]]` when the oracle was seen doing it. Say what to do to see it again.
- `[[read out]]` when it is in the code. Give the file, segment and offset, such as `THINK.DLL` seg2:031a, and quote an instruction or a constant only where it is the evidence.
- `[[inferred]]` when it fits what was seen but the code has not been read. Say what would settle it.
- `[[refused]]` for a reading that was tried and lost, so nobody tries it again.
- `[[documented]]` for what PF.Magic's or Microsoft's own material says.

When a claim turns out wrong, correct the page rather than adding beside it. When a question stays open, say "Not yet known" and what about.

## Check it

```shell
pnpm test
pnpm kb
```

Both refuse a page that names a file the installation does not have, a reference that does not resolve, a topic with no page, or a source that does not exist. The pre-commit hook runs the same build. When a finding changes the oracle itself, such as a new input or a new step, rebuild it with `pnpm oracle` and commit the new `oracle/installation.json` with the change.
