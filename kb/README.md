# The Dogz knowledge base

The pages the knowledge base site is built from. Build the site with `pnpm kb`,
which writes it to `dist/kb/`; `.github/workflows/kb.yml` publishes it to GitHub
Pages from `main`.

The site's skeleton is the installation itself. `oracle/installation.json`
records every file on the oracle's drive, and the stage of building it that put
the file there: Windows Setup, Dogz Setup, or adopting a puppy. Every file Dogz
put down is listed on the site whether a page explains it or not, so the list
of files is also the measure of how much is understood. The record is
committed, so the site builds without the media.

A page here adds what the installation record cannot know, and the build checks
it before using it.

## Where a page goes

| Kind          | File                                                  | Built at                   |
| ------------- | ----------------------------------------------------- | -------------------------- |
| A file        | `kb/files/<slug>.md`: `kb/files/think-dll.md`         | `/files/think-dll/`        |
| A file format | `kb/formats/<slug>.md`: `kb/formats/marker.md`        | `/formats/marker/`         |
| A topic       | `kb/topics/<slug>.md`: `kb/topics/adoption-unlock.md` | `/topics/adoption-unlock/` |
| A guide       | `kb/guides/<slug>.md`: `kb/guides/reproducing.md`     | `/guides/reproducing/`     |

## Front matter

Every page starts with a front matter block. It is a strict subset of YAML --
`key: value` and `key: [a, b]` (or that list wrapped one item a line, as
Prettier writes a long one) -- and a field the schema does not name is an
error, not something ignored.

```yaml
---
kind: file
name: THINK.DLL
summary: One sentence on what the file is for.
status: understood
files: [DOGZ.DOG/THINK.DLL]
source: [src/protection/unlock.ts]
topics: [adoption-unlock]
---
```

| Field     | Required                | Meaning                                                                     |
| --------- | ----------------------- | --------------------------------------------------------------------------- |
| `kind`    | yes                     | `file`, `format`, `topic` or `guide`                                        |
| `name`    | yes                     | The page's title                                                            |
| `summary` | no                      | One or two sentences, shown under the title                                 |
| `status`  | for `file` and `format` | How far it is understood; below                                             |
| `files`   | for `file`              | Installed files the page is about, as `oracle/installation.json` names them |
| `source`  | no                      | Our code that implements what the page describes                            |
| `topics`  | no                      | Topic pages the page belongs to                                             |

A status is one of:

| Status        | Meaning                                               |
| ------------- | ----------------------------------------------------- |
| `unexplored`  | Nothing is known of it yet beyond its name and size   |
| `partial`     | Some of what it holds or does is known                |
| `understood`  | What it holds or does is known, and written down here |
| `implemented` | Understood, and reimplemented in `src/` with tests    |

## The body

After the front matter, a page is Markdown, with raw HTML refused. Two
additions, both checked by the build:

- **References**, `[[kind:target]]` or `[[kind:target|text]]`:
  `[[file:DOGZ.DOG/THINK.DLL]]`, `[[topic:adoption-unlock]]`,
  `[[format:marker]]`, `[[guide:reproducing]]`. A file reference goes to the
  file's page, or to its row in the list of files if it has none. One that
  does not resolve fails the build.
- **Evidence labels** before a claim: `[[documented]]`, `[[measured]]`,
  `[[read out]]`, `[[inferred]]` and `[[refused]]`.

| Label      | Meaning                                            | What it cites                           |
| ---------- | -------------------------------------------------- | --------------------------------------- |
| Documented | PF.Magic's or Microsoft's own material says so     | Where it says so                        |
| Measured   | The oracle was seen doing it                       | How to see it again, and what was seen  |
| Read out   | Found in the game's code                           | The module, segment and offset          |
| Inferred   | Fits what was seen, but the code has not been read | What was seen, and what would settle it |
| Refused    | A reading that was tried and lost                  | What it was tested against              |

A claim nothing has settled says so in words: "Not yet known". A ` ```mermaid `
fence is drawn as a diagram.

## What the build refuses

- A page naming a file that is not in `oracle/installation.json`, or two file
  pages claiming the same file.
- A `source` that does not exist, or an `implemented` status with no source.
- A topic in `topics` with no page, or a reference that does not resolve.

## What is never published

Dogz is PF.Magic's, and its files are never part of this repository or the
site: no executables, art, sounds or data, and no disassembly listings. A page
may quote a few instructions or a constant where they are the evidence for a
claim, and cites the module, segment and offset otherwise.

## Licence

The content of this directory is licensed CC BY-SA 4.0; see `LICENSE.md`. The
code keeps its own licence.
