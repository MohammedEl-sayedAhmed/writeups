#!/usr/bin/env python3
"""Rewrite markdown frontmatter so it's safe for dev.to, then restore it.

Two independent dev.to API constraints are handled:

1. `tags`: dev.to caps at 4 lowercase-alphanumeric tags, but the site
   happily takes a richer set. When a post sets `devto_tags:` in
   frontmatter, the swap moves that lean value onto `tags:` for the
   duration of the publish, then restores.

2. `date`: dev.to (Forem) reads the `date:` frontmatter as
   `published_at`, and on article *create* it rejects any timestamp
   older than "now" with HTTP 422 "Published at only future or
   current published_at allowed". The swap strips `date:` so Forem
   defaults `published_at` to the moment of publish; the line is
   restored after. Astro reads `pubDate`, not `date`, so removing
   `date:` does not affect the rendered blog.

Modes:
    to-devto <files...>
        For each file whose frontmatter contains a `devto_tags:` line,
        record the original `tags:` and `date:` values (and the
        `devto_tags:` value itself) into a sidecar JSON file at the
        repository root, overwrite `tags:` with the lean value, and
        delete the `devto_tags:` and `date:` lines. Files without
        `devto_tags:` are left alone.

    restore <files...>
        For each file recorded in the sidecar, put the original `tags:`
        and `date:` values back and re-insert the `devto_tags:` line.
        Removes the sidecar at the end.

The sidecar lives at `.tags-backup.json` relative to the working directory.
Idempotent: running `to-devto` twice merges into the existing sidecar without
clobbering original values.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SIDECAR = Path(".tags-backup.json")
FM_RE = re.compile(r"(?s)^(---\r?\n)(.*?)(\r?\n---\r?\n)(.*)$")


def split_frontmatter(text: str):
    m = FM_RE.match(text)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3), m.group(4)


def get_line_value(fm: str, field: str) -> str | None:
    m = re.search(rf"(?m)^{re.escape(field)}:\s*(.+?)\s*$", fm)
    return m.group(1) if m else None


def remove_line(fm: str, field: str) -> str:
    return re.sub(rf"(?m)^{re.escape(field)}:.*\n?", "", fm)


def replace_value(fm: str, field: str, new_value: str) -> str:
    pattern = rf"(?m)^({re.escape(field)}:\s*).+$"
    return re.sub(pattern, lambda m: m.group(1) + new_value, fm)


def load_sidecar() -> dict:
    return json.loads(SIDECAR.read_text()) if SIDECAR.exists() else {}


def save_sidecar(data: dict) -> None:
    SIDECAR.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def to_devto(file_paths: list[str]) -> None:
    backups = load_sidecar()
    touched = False
    for raw_path in file_paths:
        path = Path(raw_path)
        if not path.exists():
            continue
        text = path.read_text()
        parts = split_frontmatter(text)
        if not parts:
            continue
        opener, fm, closer, body = parts
        devto_tags = get_line_value(fm, "devto_tags")
        if devto_tags is None:
            continue
        original_tags = get_line_value(fm, "tags")
        original_date = get_line_value(fm, "date")
        # Idempotent: do not overwrite an existing backup with the already-swapped state.
        if str(path) not in backups:
            backups[str(path)] = {
                "tags": original_tags,
                "devto_tags": devto_tags,
                "date": original_date,
            }
        if original_tags is None:
            fm = fm.rstrip() + f"\ntags: {devto_tags}"
        else:
            fm = replace_value(fm, "tags", devto_tags)
        fm = remove_line(fm, "devto_tags")
        # Forem reads `date:` as published_at and rejects past timestamps
        # on create. Strip it so Forem defaults published_at to "now".
        if original_date is not None:
            fm = remove_line(fm, "date")
        path.write_text(opener + fm + closer + body)
        print(f"to-devto: {path}: tags <- {devto_tags!r}, date stripped")
        touched = True
    if touched:
        save_sidecar(backups)


def restore(file_paths: list[str]) -> None:
    if not SIDECAR.exists():
        print("restore: no sidecar present, nothing to do")
        return
    backups = load_sidecar()
    for raw_path in file_paths:
        path = Path(raw_path)
        record = backups.get(str(path))
        if not record:
            continue
        if not path.exists():
            continue
        text = path.read_text()
        parts = split_frontmatter(text)
        if not parts:
            continue
        opener, fm, closer, body = parts
        original_tags = record.get("tags")
        devto_tags = record.get("devto_tags")
        original_date = record.get("date")
        if original_tags is not None:
            if get_line_value(fm, "tags") is None:
                fm = fm.rstrip() + f"\ntags: {original_tags}"
            else:
                fm = replace_value(fm, "tags", original_tags)
        if devto_tags is not None and get_line_value(fm, "devto_tags") is None:
            # Re-insert immediately below the tags: line so the field stays grouped.
            fm = re.sub(
                r"(?m)^(tags:\s*.+\n)",
                lambda m: m.group(0) + f"devto_tags: {devto_tags}\n",
                fm,
                count=1,
            )
        if original_date is not None and get_line_value(fm, "date") is None:
            # Re-insert at the end of the frontmatter so we don't disturb
            # the order of other fields. Astro doesn't read `date:`; the
            # restored line is purely so a future re-run of to-devto sees
            # what to back up next time.
            fm = fm.rstrip() + f"\ndate: {original_date}"
        path.write_text(opener + fm + closer + body)
        print(
            f"restore: {path}: tags <- {original_tags!r}, "
            f"devto_tags <- {devto_tags!r}, date <- {original_date!r}"
        )
    SIDECAR.unlink()


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    mode = sys.argv[1]
    files = sys.argv[2:]
    if mode == "to-devto":
        to_devto(files)
    elif mode == "restore":
        restore(files)
    else:
        print(f"unknown mode: {mode!r}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
