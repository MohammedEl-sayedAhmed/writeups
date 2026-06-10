---
title: DB Design Lifecycle, Roles & Architecture
description: Requirements → ERD → mapping → implementation, the people involved, and the client → app-server → DB-server path.
course: ITI SQL Server
section: Video 1 — Intro, Design & ERD
order: 3
---

**Core idea:** Design on paper first (requirements → ERD → mapping) *before* touching any tool. Many roles collaborate, and the end user never touches the DB directly.

## Database lifecycle (steps to build a DB)
1. **Requirements** — System Analyst meets the client and writes the **Requirements Document** (the project scope), bridging business language ↔ developer code.
2. **ERD** — Database Designer turns requirements into an **Entity-Relationship Diagram** (conceptual model). "A picture beats reading a book."
3. **Mapping** — apply fixed **rules** to the ERD → the **schema** (the actual tables). Same requirements can yield different ERDs → verify back with the analyst.
4. **Implementation** — install an RDBMS, create the DB with SQL → logical design becomes a physical, shared, running DB.
- Steps 1–3 are **on paper, tool-independent**. Jumping straight into the tool (skipping design) causes missing structure / relationships / keys.

## Roles
- **System Analyst** — gathers requirements, writes the doc (domain-specific: banking, financial…).
- **Database Designer** — builds the ERD + mapping. ← *we play this today.*
- **Database Developer** — knows SQL; creates the DB + writes queries. ← *we play this too.*
- **DBA (Administrator)** — setup, sizing (RAM/CPU), security, backup/restore, performance.
- **Application Programmer** — builds the web/desktop/mobile app on the DB. The DB's real **"user" is this programmer**, not the end user.
- **Data Scientist / BI** — data mining, prediction, hidden relationships (out of scope).
- **End user** — only uses the app (browser/URL); **never touches the DB directly**.

## RDBMS & SQL
- **RDBMS** = the tool (SQL Server, Oracle, MySQL, Access). The design steps don't depend on which you pick.
- Microsoft's official engine = **SQL Server** (course uses SQL Server 2019).
- **SQL (Structured Query Language)** = the language to talk to any engine (create / insert / update / delete / query). The tool ≠ the language. Engines' SQL is ~the same → learn one, mostly know the rest.

## Architecture
*(Analogy: the DB is the car engine — you use the interface, not the engine directly.)*
- **End user → Application Server** (hosts the app) **→ Database Server** (holds the DB).
- The app sends **SQL queries** to the DB server; results come back, fill the app, and render in the browser.
- Engine and app language are **independent** — any DB with any language (SQL Server + C#/Java/PHP, Oracle + Java…); same-vendor pairs just have easier connectors.
- A DB must be **centralized**; two diverging copies on different servers = an **inconsistent database** (untrusted).
