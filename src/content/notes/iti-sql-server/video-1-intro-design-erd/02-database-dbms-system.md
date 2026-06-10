---
title: Database vs DBMS vs Database System
description: The three terms, data vs metadata, primary/foreign keys, and what a DB system adds over files.
course: ITI SQL Server
section: Video 1 — Intro, Design & ERD
order: 2
---

**Core idea:** *Database* = the data; *DBMS* = the tool you build it on; *Database System* = DB + DBMS + the application on top.

## The three terms
- **Database** — the concept: related tables stored persistently (a file on disk, e.g. SQL Server `.mdf` / `.ldf`).
- **DBMS (RDBMS)** — the tool that manages the DB (SQL Server, Oracle, MySQL, Access). A Windows service (e.g. MSSQL) holds the file; you reach it only through the DBMS.
- **Database System** — the DB (with its DBMS) **plus** the application / interface / reports on top. A DB alone is useless to an end user; it needs software over it.

## Data vs metadata
- **Metadata** = data about data: table names, column names, data types, relationships, primary/foreign keys. This is what the **ERD** captures.
- **Data** = the actual values (Ahmed, Cairo, 20…).
- You can only reach data *through* metadata (you must know table `Student`, column `Age`).

## What a DB system adds (vs files)
- **Standard** — every DB = related tables + constraints.
- **Data types** per column → enforced **data quality**.
- **Primary key** on every table — **unique + NOT NULL**; blocks duplicate rows; used to relate & search. (NULL = an *undefined* value, not 0 — can't be compared.)
- **Foreign key** — links tables; a value must exist in the referenced table (dept 70 rejected) → **referential integrity**. (Comes in *mapping*, not the ERD.)
- **Centralized & shared** — one DB on one server; every insert/update/delete is seen by all apps & developers.
- Built-in **security, constraints/rules, automatic backup**.

## Key terms
- **Redundancy** = data duplication.
- **Inconsistency** = two different versions of the data at once.
- **Integrity** = the DB is coherent, related, and consistent.
- **Constraints / rules** = conditions the data must satisfy (come from the business).

## Disadvantages of a DB engine
- **Cost** — licenses (SQL Server, Oracle) are expensive.
- **Expertise** — needs developers who know SQL, keys, joins, views… (paid). Budget for it.
