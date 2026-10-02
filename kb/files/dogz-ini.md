---
kind: file
name: DOGZ.INI
summary: The game's settings — the install directory, the owner, and after adoption the pet's breed, name and registration.
status: partial
files: [DOGZ.DOG/DOGZ.INI]
topics: [installation, adoption-unlock]
---

An ordinary Windows profile file, with one section, `[Dogz]`.

| Key                        | Written by    | On the oracle                   | Meaning                                                                    |
| -------------------------- | ------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `Brain File`               | Setup         | `brain.pbt`                     | [[inferred]] The dog's behaviour, [[file:DOGZ.DOG/BRAIN.PBT]]              |
| `Debug Brain Output File`  | Setup         | `cpp.pbt`                       | [[inferred]] Where a debugging build wrote the brain; no such file is made |
| `Debugging Info`           | Setup         | `0`                             | Not yet known                                                              |
| `Control Val0` to `2`      | Setup         | `10`, `30`, `100`               | Not yet known                                                              |
| `Root`                     | Setup         | `C:\DOGZ.DOG`                   | The install directory                                                      |
| `Name`                     | Setup         | the owner's first and last name | From Setup's first screen ([[topic:installation]])                         |
| `UserCode`                 | Setup         | `z77F112C0003`                  | A constant of Setup's script                                               |
| `Your Pet`                 | Adoption      | `.\data\bigdog.lnz`             | [[inferred]] The adopted puppy's breed file, in `DATA`                     |
| `Serial Number`            | Adoption      | 19 digits                       | The installation's validation code ([[topic:adoption-unlock]])             |
| `Serialized`               | Adoption      | `1`                             | [[inferred]] Adopted: the adoption kit is a trial without it               |
| `Hiccup Proclivity`        | Adoption      | `11`, then `10`                 | Not yet known; it differs from one adoption to the next                    |
| `Pet Name`                 | Adoption      | `Bootz`                         | The name given on "Name your Dogz"                                         |
| `age`                      | Adoption      | `0`                             | Not yet known                                                              |
| `Compound Window Location` | Dogz, closing | `300, 180, 600, 480`            | [[inferred]] The playpen window's left, top, right and bottom              |
| `Panel Window Location`    | Dogz, closing | `0, 40, 155, 308`               | [[inferred]] The tool panel's, likewise                                    |
| `Is Compound Iconized`     | Dogz, closing | `0`                             | [[inferred]] Whether the playpen was minimised                             |
| `Always on top`            | Dogz, closing | `0`                             | Not yet known                                                              |
| `Brush Color`              | Dogz, closing | `1`                             | Not yet known; the Options menu has a Brush Color submenu                  |

[[measured]] All of the above, on the oracle, after `pnpm oracle`, which closes Dogz from its Options menu after the adoption. Closing it also saves the dog, in `SAVED.LNZ`, `TRICKS.TDT` and `BRAIN.BAK`.
