#!/usr/bin/env python3
"""Swap `tags` <-> `devto_tags` in markdown frontmatter around the dev.to crosspost.

dev.to's article API only accepts up to 4 lowercase-alphanumeric tags, while
the site happily takes a richer comma-separated set with hyphens. When a post
sets `devto_tags:` in frontmatter, this script rewrites the file in place so
that `publish-devto` sees the lean set on `tags:`, and then restores the
original after the action has run.

Modes:
    to-devto <files...>
        For each file whose frontmatter contains a `devto_tags:` line,
        record the original `tags:` value (and the `devto_tags:` value
        itself) into a sidecar JSON file at the repository root, then
        overwrite `tags:` with the `devto_tags:` value and delete the
        `devto_tags:` line. Files without `devto_tags:` are left alone.

    restore <files...>
        For each file recorded in the sidecar, put the original `tags:`
        value back and re-insert the `devto_tags:` line directly below
        the `tags:` line. Removes the sidecar at the end.

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
        # Idempotent: do not overwrite an existing backup with the already-swapped state.
        if str(path) not in backups:
            backups[str(path)] = {
                "tags": original_tags,
                "devto_tags": devto_tags,
            }
        if original_tags is None:
            fm = fm.rstrip() + f"\ntags: {devto_tags}"
        else:
            fm = replace_value(fm, "tags", devto_tags)
        fm = remove_line(fm, "devto_tags")
        path.write_text(opener + fm + closer + body)
        print(f"to-devto: {path}: tags <- {devto_tags!r}")
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
        path.write_text(opener + fm + closer + body)
        print(f"restore: {path}: tags <- {original_tags!r}, devto_tags <- {devto_tags!r}")
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
