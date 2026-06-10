---
title: Database Fundamentals & File-Based Systems
description: What a database is, why not every app needs one, and the problems of the old file-based approach.
course: ITI SQL Server
section: Video 1 — Intro, Design & ERD
order: 1
---

**Core idea:** A database = related data stored persistently behind an app. The old "file-based" alternative has serious problems (redundancy, no integrity, no security…) that a DB system fixes.

## What is a database?
- A set of **related tables/data** living in an application's back-end.
- Not every app needs one — a calculator, MS Office, a static HTML/JS site have no DB.
- Tiny data can live in files (XML/text); but ~95% of enterprise apps need a DB.

## File-based system (the old way)
- Store data in **text files** with a fixed format:
  - **Delimited file** — values split by a delimiter: `1,Ahmed,22`.
  - **Fixed-width file** — each field a fixed number of bytes.

## Problems of file-based systems → why we need a DB
- **Slow access / search** — must scan the whole file → poor performance.
- **Redundancy (duplication)** — nothing stops repeating data.
- **Inconsistency** — separate files/copies drift out of sync.
- **No relationships / referential integrity** — can store a student in dept 70 that doesn't exist.
- **No constraints / rules** — can't enforce "age 20–30" or "every employee has a dept".
- **No data quality / data types** — everything is text; a name is accepted in an age field.
- **No security** — plain text readable by all; no per-user / per-column permissions.
- **No standard** — delimited vs fixed-width vs Excel → integration nightmare.
- **Manual backup/recovery** — one bad sector loses the data.
- All the above must be **re-coded inside every app** (web + mobile + desktop) → bloated code, slow development.

> **Q:** Foreign keys (referential integrity) — resolved later: they appear in *mapping*, not in the ERD.
