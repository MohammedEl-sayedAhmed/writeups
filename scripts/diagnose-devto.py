#!/usr/bin/env python3
"""Surface dev.to's actual response body for a single article publish.

This is the manual diagnostic for the HTTP 422 we cannot see through
sinedied/publish-devto (the action discards Forem's response body). It
reproduces the same POST devto-cli would make, then prints exactly what
Forem returns. Use it once to identify why the article was rejected, then
delete the script (or commit it deliberately — your call).

Token handling:
- DEVTO_TOKEN is read once from the process environment into a local
  variable. The token never appears in argv to any subprocess, is sent
  only as an `api-key` header, and is redacted from any printed output
  in the unlikely case Forem ever echoes it back.

Tag handling:
- The post's `tags:` frontmatter line is swapped to `devto_tags:`'s value
  for the duration of the call via the existing .github/scripts/swap-tags.py.
- Tags are restored on exit, including on Ctrl-C / SIGTERM.

The article is sent with `published: false` so a successful body is created
as a *draft*, not a live post. If you want to publish after a green run,
either flip the draft on dev.to's UI or merge a follow-up to re-enable
the workflow.

Usage:
    DEVTO_TOKEN=... python3 scripts/diagnose-devto.py [path/to/post.md]

Default path: src/content/blog/clipman-clipboard-manager-wayland-gnome.md
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_FILE = "src/content/blog/clipman-clipboard-manager-wayland-gnome.md"
DEVTO_ENDPOINT = "https://dev.to/api/articles"
SWAP_SCRIPT = ".github/scripts/swap-tags.py"


def redact(text: str, *secrets: str) -> str:
    """Replace any secret occurrence in text with <REDACTED>."""
    out = text
    for s in secrets:
        if s:
            out = out.replace(s, "<REDACTED>")
    return out


def restore_tags(file_path: str) -> None:
    """Best-effort restore of the rich tags after the call."""
    try:
        subprocess.run(
            ["python3", SWAP_SCRIPT, "restore", file_path],
            check=False,
        )
    except FileNotFoundError:
        pass


def _parse_args(argv: list[str]) -> tuple[str, int | None]:
    """Return (file_path, article_id_or_None) parsed from argv.

    Two invocations:
        diagnose-devto.py [path]                 -> POST (create as draft)
        diagnose-devto.py [path] --update <id>   -> PUT  (update existing)
    """
    path = DEFAULT_FILE
    article_id: int | None = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--update":
            i += 1
            if i >= len(argv):
                print("error: --update requires an article id", file=sys.stderr)
                sys.exit(2)
            try:
                article_id = int(argv[i])
            except ValueError:
                print(f"error: --update expects an integer id, got {argv[i]!r}",
                      file=sys.stderr)
                sys.exit(2)
        elif a.startswith("-"):
            print(f"error: unknown flag {a!r}", file=sys.stderr)
            sys.exit(2)
        else:
            path = a
        i += 1
    return path, article_id


def main() -> int:
    token = os.environ.get("DEVTO_TOKEN", "").strip()
    if not token:
        print(
            "error: DEVTO_TOKEN env var is required.\n"
            "       Run as:  DEVTO_TOKEN=... python3 scripts/diagnose-devto.py",
            file=sys.stderr,
        )
        return 2

    file_path, article_id = _parse_args(sys.argv[1:])
    if not Path(file_path).exists():
        print(f"error: file not found: {file_path}", file=sys.stderr)
        return 2
    if not Path(SWAP_SCRIPT).exists():
        print(f"error: missing swap-tags helper at {SWAP_SCRIPT}", file=sys.stderr)
        return 2

    print(f"-> swapping tags lean via {SWAP_SCRIPT}")
    swap = subprocess.run(
        ["python3", SWAP_SCRIPT, "to-devto", file_path],
        check=False,
    )
    if swap.returncode != 0:
        print("error: swap-tags to-devto failed", file=sys.stderr)
        return swap.returncode

    # Always restore — including on Ctrl-C / SIGTERM.
    def _restore_then_exit(signum, _frame):
        restore_tags(file_path)
        sys.exit(130 if signum == signal.SIGINT else 1)

    signal.signal(signal.SIGINT, _restore_then_exit)
    signal.signal(signal.SIGTERM, _restore_then_exit)

    try:
        body_markdown = Path(file_path).read_text(encoding="utf-8")
        if article_id is None:
            # POST = create as draft. Forem validates the body the same
            # way for draft and published articles, so we still see the
            # same 422 if the body is the problem.
            endpoint = DEVTO_ENDPOINT
            method = "POST"
            payload_obj = {"article": {
                "body_markdown": body_markdown,
                "published": False,
            }}
        else:
            # PUT = update an existing article in place. The keep_current
            # state of `published` is whatever the article is already set
            # to on dev.to; we do not flip it here.
            endpoint = f"{DEVTO_ENDPOINT}/{article_id}"
            method = "PUT"
            payload_obj = {"article": {"body_markdown": body_markdown}}
        payload = json.dumps(payload_obj).encode("utf-8")
        print(
            f"-> {method} {endpoint}  "
            f"(body_markdown length: {len(body_markdown):,} bytes)"
        )
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "api-key": token,
                "Content-Type": "application/json",
                "User-Agent": "diagnose-devto/1.0 (manual repro)",
                "Accept": "application/vnd.forem.api-v1+json",
            },
            method=method,
        )

        status: int
        raw_body: bytes
        resp_headers: dict[str, str] = {}
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                status = resp.status
                raw_body = resp.read()
                resp_headers = {k: v for k, v in resp.getheaders()}
        except urllib.error.HTTPError as e:
            status = e.code
            raw_body = e.read()
            resp_headers = {k: v for k, v in e.headers.items()} if e.headers else {}

        body_text = raw_body.decode("utf-8", errors="replace")
        # Guard: redact the token from anything we are about to print, in
        # case Forem echoes the header (unlikely, but cheap insurance).
        body_text = redact(body_text, token)

        print(f"<- HTTP {status}")

        # Print only the headers that help triage; never headers that might
        # contain identifying info we did not ask for.
        for h in ("Content-Type", "X-RateLimit-Remaining", "X-Request-Id"):
            if h in resp_headers:
                print(f"   {h}: {resp_headers[h]}")

        print("---response body---")
        try:
            parsed = json.loads(body_text)
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
        except (json.JSONDecodeError, ValueError):
            print(body_text)
        print("---end response body---")

        if 200 <= status < 300:
            print(
                "\nnote: the article was created as a DRAFT on dev.to. "
                "Find it on https://dev.to/dashboard and publish "
                "manually if you want it live."
            )
            return 0
        else:
            print(
                "\nnote: the article was NOT created. The JSON above is "
                "Forem's exact validation error — paste it back to Claude."
            )
            return 1
    finally:
        # Reset signal handlers before the finally restore so a second
        # Ctrl-C does not interrupt the restore itself.
        signal.signal(signal.SIGINT, signal.SIG_DFL)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        restore_tags(file_path)


if __name__ == "__main__":
    sys.exit(main())
