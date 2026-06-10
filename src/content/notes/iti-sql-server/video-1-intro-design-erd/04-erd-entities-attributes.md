---
title: ERD — Entities & Attributes
description: ERD building blocks; strong vs weak entities; the five attribute types.
course: ITI SQL Server
section: Video 1 — Intro, Design & ERD
order: 4
---

**Core idea:** An ERD is metadata drawn from the requirements. Building blocks: entities (rectangles), attributes (ellipses), relationships (diamonds).

## Reading the requirements
- **Nouns** → entities or attributes.
- **Verbs** (has, owns, works, teaches, assigns) → relationships.

## Entity (rectangle)
- The important **object/component** you must store data about (Student, Course, Doctor, Patient).
- An entity isn't necessarily a table — it's *what you store data about*.
- **Strong entity** — exists on its own (~99% of entities). Has a **Primary Key**.
- **Weak entity** — its existence depends on a parent; delete the parent → delete the child (cascade). Has a **Partial Key** (needs the parent's PK to mean anything).
  - e.g. Account→Transaction, Course→Lab, Employee→Family.
  - **Business-dependent**: a bank may keep transactions after an account closes → then it's strong. Don't generalize across systems.

## Attribute (ellipse; key attribute underlined)
Five types:
- **Simple** — not divisible, not computed, not repeated. e.g. City.
- **Composite** — splits into parts that reassemble to the original. e.g. Name → First+Last; Address → street/city/country.
- **Derived** — computable at runtime from a clear formula; drawn **dashed**. e.g. Age = today − birthdate; NetSalary = salary − deduction.
- **Multivalued** — repeats for the same entity; drawn as a **double ellipse**. e.g. multiple phones, skills, addresses.
- **Complex** — multivalued **and** composite at once (rare). e.g. several phones, each = countryCode + number.

## Watch out
- An attribute belongs on a **relationship** (diamond) when it is *shared* between entities — e.g. `grade` (student × course), `hours` (employee × project), `access_date` (customer × account). It fits neither entity alone.
- **Never assume** a type — ask the requirements/analyst (is `name` simple, or first+last?).
