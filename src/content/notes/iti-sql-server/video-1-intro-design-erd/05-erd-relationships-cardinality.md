---
title: ERD — Relationships, Cardinality & Participation
description: Relationship degree, cardinality (1:1/1:M/M:N), total vs partial participation, and key types.
course: ITI SQL Server
section: Video 1 — Intro, Design & ERD
order: 5
---

**Core idea:** Relationships (diamonds, named by verbs) have a degree, a cardinality (1:1 / 1:M / M:N), and a participation (total/partial). Keys finalize each entity.

## Relationship (diamond = a verb)
- Pick the verb carefully — it drives the cardinality.
- Two entities can have **several relationships** if the verbs differ in meaning (works vs manages). If the meaning is the same, pick the closest verb.

## Degree
- **Unary / self** — an entity related to itself; both diamond ends on the same entity. e.g. Employee *manages* Employee; merge male/female into one `Person` *married to* `Person`.
- **Binary** — two entities (the common case).
- **Ternary** — three entities, usually forced by a **shared attribute** across all three. e.g. Product–Vendor–Warehouse with `shipping_mode`, `unit_price`. (4+ ⇒ data-warehouse territory.)
- Rule of thumb: a shared attribute that appears when **2** combine → binary; when **3** combine → ternary.

## Cardinality (degree of linkage)
- Read the verb **both directions**, then combine:
  - Employee works in **one** dept; a dept has **many** employees → **1:M**.
  - Instructor teaches **many** courses; a course has **many** instructors → **M:N**.
  - Person owns **many** cars; a car is owned by **one** person → **1:M** (business-dependent — could be M:N).
- Any "many" side → **M**. Each relationship has its own cardinality.

## Participation (single line = partial, double line = total)
- **Total** — *every* row participates. Signal words: **must, all**. e.g. every employee *must* be in a dept → double line on the employee side.
- **Partial** — *some* rows don't. Signal words: **may, optional, zero-or-more**. e.g. a dept *may* have no employees → single line on the dept side.
- A **weak entity** always has **total** participation (otherwise it isn't weak).
- ≠ cascade delete: total participation just means you can't create the row without the related one.

## Keys (finalizing the entity)
- **Candidate key** — any column that *could* be PK (unique + NOT NULL). A table may have several.
- **Primary key** — the chosen candidate (pick the smallest / best type, e.g. `int ID` over national-ID). Underlined in the ERD.
- **Composite key** — when no single column is unique, combine columns (e.g. name+address); if nothing works, invent a surrogate `ID`. Still **one** (composite) PK — underline all its columns.
- **Partial key** — a weak entity's key.
- **Foreign key** — *not* in the ERD; appears in mapping.
- Worth looking up: alternate, super, natural, artificial keys.

## Watch out
- **Never assume** cardinality/participation — ask the system analyst / requirements doc.
