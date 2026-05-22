---
title: Building Clipman — a clipboard manager for Wayland that respects you
description: 'How and why I built a clipboard history manager for Ubuntu/GNOME on Wayland, with the protocol stack explained for newcomers and the CI/CD security harness laid out for engineers. Pain points, real bugs, and what shipping to five distribution channels actually takes.'
pubDate: May 22 2026
tags: 'linux, opensource, python, gnome, wayland, dbus, ci-cd'
published: true
canonical_url: 'https://mammar.pages.dev/blog/clipman-clipboard-manager-wayland-gnome/'
id: ''
date: '2026-05-22T20:06:01Z'
---

I copy things all day. A line from a terminal into a doc, a token from a doc into a terminal, an OTP from an authenticator into a browser, a URL from chat into a code comment. On Windows the muscle memory is `Win+V`: a small panel pops up with the last few things I copied and I pick one. On Linux there isn't a built-in equivalent. There are tools, but the ones I tried either flicker the screen, miss copies, leak passwords into a long-lived history file, or stop working the moment a Wayland session starts.

So I built one. It's called Clipman, it's on PyPI as `clipman-clipboard`, on the Snap Store, on the AUR, and on the GNOME Extensions website. It works on Ubuntu 22.04 and up with GNOME 46–48 on Wayland. The source is at [MohammedEl-sayedAhmed/clipman](https://github.com/MohammedEl-sayedAhmed/clipman).

This writeup is the story of the parts that took the longest to get right: how a clipboard manager can even *work* under Wayland's security model, the GNOME Shell extension that does the actual listening, the privacy choices, the five-channel distribution sprawl, and the CI/CD harness underneath it. It's also the writeup I want to read a year from now when I've forgotten why each piece is there.

## TL;DR

- Wayland deliberately does not let one app spy on another app's clipboard. Building a clipboard *manager* on top of that takes a privileged listener that the user has explicitly enabled — in our case, a small GNOME Shell extension that subscribes to `Meta.Selection`'s `owner-changed` signal and forwards new entries to a Python daemon over D-Bus.
- The daemon stores history in `~/.local/share/clipman/clipman.db` (SQLite, WAL), deduplicates by SHA256, and exposes a tiny D-Bus surface so the keybinding (`Super+V`) and the extension can both talk to it.
- Privacy: incognito mode, regex-based sensitive-content detection with 30-second auto-clear, `0o700` data dir and `0o600` image files, parameterised SQL, no `shell=True`, no telemetry. The only network egress is one anonymous `GET` per day to the GitHub Releases API to check for a newer version, and it is opt-out.
- The project ships through five channels (PyPI, Snap, AUR, `.deb`, `.rpm`) plus a Flathub submission pending review and the GNOME Extensions website, with a CI/CD harness that SHA-pins every third-party action, publishes to PyPI via OIDC trusted publishing instead of a long-lived token, and ratchets CodeQL findings so pre-existing noise can't drown out a new regression.
- All of which is more work than the surface implies — and every paragraph below was a thing I had to actually figure out, not a thing I read about and copied.

## The pain point

Linux does not ship with a clipboard manager out of the box. There's the *clipboard* — the thing the kernel and your compositor implement so `Ctrl+C` in one window and `Ctrl+V` in another do the right thing — but there is no *history*, no panel, no pinned entries, no search. If you copy something and then copy something else, the first thing is gone. The Windows `Win+V` panel that does keep history is a desktop-environment feature, not a kernel one, and Linux desktop environments historically delegated it to third-party utilities like Clipit, copyq, gpaste, or `clipman` (an older tool that this project is unrelated to).

Three things broke that historical answer:

1. **Wayland's security model.** Under X11, any client could read any other client's clipboard at will — the protocol exposed selections globally and the trust model assumed every connected client was friendly. Under Wayland, the compositor mediates clipboard access, and the protocol only hands clipboard contents to the application that is currently focused. That is a deliberate, named improvement: keylogging, screen scraping, and clipboard snooping by random apps are all blocked at the protocol level rather than by social convention ([wayland-devel: passive and active attacks via X11](https://wayland-devel.freedesktop.narkive.com/SSrj4U4S/passive-and-active-attacks-via-x11-is-wayland-any-better)).

2. **GNOME's default keybinding for `Super+V`** opens the notification message tray, not a clipboard. Most users have never heard of `Super+V` because nothing useful happens when they press it.

3. **Older clipboard managers' implementation strategies don't survive Wayland.** Polling `wl-paste` in a tight loop wastes power, flickers focus on some compositors, and races against legitimate paste targets. Subscribing to X11 selection events via `xclip` or XFixes is a non-starter; there is no equivalent X11 selection bus under Wayland for a non-privileged client to observe.

Existing Wayland-aware tools (`wl-clipboard`'s `wl-paste --watch`, `clipman-wayland`, copyq's Wayland mode) are a real improvement, but each compromises somewhere — extra processes, focus stealing, flicker, missed copies in XWayland apps, or none of the privacy posture I wanted (auto-clear of sensitive content, restrictive permissions, no telemetry of any kind).

I wanted a tool that was Wayland-first, didn't flicker, didn't poll, didn't ship its own browser-class runtime (no Electron), and treated the data on disk like it might be sensitive — because if you copy passwords twice a day for a year, your history file *is* sensitive.

## Background, in seven short sections

Before the architecture: a short tour of the protocols and concepts the rest of this post leans on. If you already know D-Bus, Wayland, GNOME Shell extensions, and SemVer, **skip ahead to *The architecture*.**

### 1. Wayland vs X11, in one paragraph

X11 is a 1984 client/server protocol where applications connect to a long-running display server, and the server forwards both input events and clipboard data globally. Wayland is a 2008-onward replacement where the *compositor* (the program that draws your desktop) is also the server, and applications communicate with it directly via a small, capability-oriented protocol. Two practical consequences: under Wayland, one app cannot read another app's input, window contents, or clipboard without a compositor-mediated grant; and any "global" feature a clipboard manager needs has to go through the compositor or a compositor extension instead of being a plain client of the display server ([Wayland vs X11 comparison](https://theserverhost.com/blog/post/x11-vs-wayland)).

### 2. What D-Bus is and why every Linux desktop tool uses it

D-Bus is a local-machine message bus standardised by freedesktop.org ([dbus-specification](https://dbus.freedesktop.org/doc/dbus-specification.html)). It's how desktop programs talk to each other without inventing a private socket protocol per pair. Two flavors: a *system bus* for OS-level services (NetworkManager, systemd-logind, udisks) and a *session bus* per logged-in user for desktop apps (GNOME Shell, the screenshot tool, the notifications service). Every bus exposes named objects with typed methods, and any program on the bus can call them — the bus *is* the trust boundary. Clipman uses the session bus for everything; nothing it does requires root, and nothing reaches the system bus.

### 3. What a GNOME Shell extension is

A GNOME Shell extension is a small ES module loaded *into* GNOME Shell itself ([GJS extension guide](https://gjs.guide/extensions/)). It runs in the same process and the same JavaScript runtime (gjs, a SpiderMonkey-based runtime with bindings for GNOME platform libraries) that draws your top bar and overview. It is **not** a Firefox extension or a browser extension — it has full access to compositor APIs, can listen for window-manager events, can synthesize keystrokes, and can own a D-Bus name. That's why GNOME Shell asks you to log out and back in when you install or update one; you are loading code into a process you can't restart in place.

### 4. SemVer in practice for an app that talks to other processes

[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) defines MAJOR as "incompatible API changes", MINOR as "backward-compatible additions", PATCH as "backward-compatible bug fixes". For a *library*, "API" means "the functions you call". For an *application* like Clipman, there is no Python API for callers — but there *are* contracts: the D-Bus methods other processes call, the SQLite schema on disk, the supported Python and GNOME Shell versions. So a MAJOR bump means "something on those contracts changed in a way that requires a downstream rebuild or a user-visible migration". I wrote that out as [ADR 0010](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0010-versioning-policy.md) so packagers can predict from a tag alone whether they need to do anything.

### 5. PyPI, Snap, AUR, Flathub, `.deb`/`.rpm` — five distinct mental models

PyPI is a *language* package index: `pip` puts Python code into a virtualenv. Snap and Flathub are *application* distribution: a single confined bundle with its own runtime, that the store auto-refreshes. AUR is *recipe* distribution: PKGBUILDs (build scripts) that compile from source on the user's machine ([Arch wiki: AUR](https://wiki.archlinux.org/title/Arch_User_Repository)). `.deb` and `.rpm` are *system* packages: native to Debian and Fedora families, installed by the distro's package manager into system paths. The same release of Clipman has to land in all five with appropriate caveats, because no single channel reaches everyone — and the audience for each channel doesn't think about the other four.

### 6. OIDC trusted publishing for PyPI

The traditional way to publish a Python package from CI is to put a long-lived PyPI API token into a GitHub repository secret. That secret is then reachable from any workflow that requests `secrets:` access, lives until manually rotated, and would leak in any compromise of the repo's secrets store. PyPI's *trusted publishing* swaps that for a per-job OpenID Connect exchange: PyPI is told "GitHub's OIDC issuer is allowed to publish project X when workflow Y runs on repo Z in environment E", and the workflow asks GitHub to mint a short-lived OIDC token at publish time. No long-lived token exists ([PyPI Trusted Publishers docs](https://docs.pypi.org/trusted-publishers/)). Clipman publishes this way, which is recorded in [ADR 0004](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0004-pypi-trusted-publishing-oidc.md).

### 7. SHA-pinning GitHub Actions

When a workflow says `uses: actions/checkout@v4`, GitHub resolves `v4` to whatever commit the upstream maintainer has the `v4` tag pointing at *right now*. If that maintainer's account is compromised and someone force-pushes the tag, your next workflow run executes the attacker's code with all your workflow's secrets. That has happened ([changed-files supply-chain incident](https://www.stepsecurity.io/blog/pinning-github-actions-for-enhanced-security-a-complete-guide)). The mitigation is to pin every third-party action to a full 40-character commit SHA, so the reference is immutable. Dependabot then keeps the pins current. Clipman pins every action this way per [ADR 0003](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0003-sha-pin-github-actions.md).

End of background. From here on I assume those concepts.

## The architecture

Clipman is two cooperating processes plus a database. There is a daemon (`clipman.py` plus the `clipman/` Python package) that runs as a `systemd --user` service and owns the popup window, the storage, the settings, and the D-Bus surface. There is a GNOME Shell extension (`extension/extension.js`) that lives inside the running Shell process and watches the clipboard. They talk over D-Bus on the session bus.

<p align="center">
  <img src="https://raw.githubusercontent.com/MohammedEl-sayedAhmed/clipman/main/docs/architecture.svg"
       alt="Clipman architecture diagram"
       width="100%">
</p>
<p align="center"><sub>
  Source: <a href="https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/ARCHITECTURE.md">ARCHITECTURE.md</a>
</sub></p>

### Why our own extension instead of `wl-paste --watch`

The first answer I tried was `wl-paste --watch` from the [wl-clipboard](https://github.com/bugaevc/wl-clipboard) project. It's a small CLI that exits when the clipboard changes and lets you run a script per change. That works, until it doesn't:

- It's a subprocess. On every clipboard change, it has to be re-invoked or kept resident; either way, the daemon process tree grows.
- On some GNOME versions it briefly steals focus from the foreground app, producing a visible flicker.
- It cannot observe clipboard changes inside XWayland-hosted apps (VSCode, Electron) reliably.
- It is the answer for compositors that *don't* have a clipboard extension; it shouldn't be the primary path on GNOME.

The better answer is to listen *inside* the compositor. Mutter (the GNOME compositor) exposes a `Meta.Selection` object with an `owner-changed` signal that fires every time the clipboard owner changes — that is, every time something is copied ([Meta.Selection reference](https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Selection.html)). A GNOME Shell extension can subscribe to that signal directly:

```javascript
// extension/extension.js — enable()
this._selection = global.display.get_selection();
this._ownerChangedId = this._selection.connect(
    'owner-changed',
    this._onOwnerChanged.bind(this)
);
```

When the signal fires the extension reads the new content with a MIME-type fallback chain (`text/plain;charset=utf-8` → `UTF8_STRING` → `text/plain` → `STRING`, because different apps name the same UTF-8 text differently — XWayland apps are especially fond of `UTF8_STRING`) and forwards the result to the daemon over D-Bus. Full file: [extension/extension.js](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/extension/extension.js).

There is also a 150 ms debounce on the read. Some apps update the clipboard several times in rapid succession during a single `Ctrl+C` (Electron apps are repeat offenders), and reading too eagerly returns an empty or stale buffer. Waiting 150 ms before reading lets the new owner settle.

For compositors that don't run this extension — KDE, Sway, Hyprland — the daemon still works: on startup it checks for the extension's D-Bus name (`org.gnome.Shell.Extensions.clipman`) and, if it isn't present, spawns `wl-paste --watch echo CLIP_CHANGED` as a fallback. The fallback is in [`clipman/clipboard_monitor.py`](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/clipman/clipboard_monitor.py); it parses sentinel lines off the subprocess's stdout via `GLib.io_add_watch`, restarts up to five times on crash, and otherwise stays out of the way. The extension is preferred where it's available; the fallback is the consolation prize.

### The D-Bus contract

The daemon's interface lives at bus name `com.clipman.Daemon`, object path `/com/clipman/Daemon`, interface `com.clipman.Daemon`. The full surface is six methods:

| Method | Signature | Who calls it |
|---|---|---|
| `Toggle()` | `() → ()` | The `Super+V` keybinding, via `launcher.sh` |
| `Show()` | `() → ()` | (Manual `gdbus call` users) |
| `Hide()` | `() → ()` | (Manual `gdbus call` users) |
| `Quit()` | `() → ()` | The uninstaller |
| `NewEntry(s content_type, s content)` | `(ss) → ()` | The extension (or `wl-paste --watch` fallback) every time the clipboard changes |

The implementation is forty-odd lines in [`clipman/dbus_service.py`](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/clipman/dbus_service.py); it does nothing except marshal between D-Bus and the GTK window / monitor.

The extension exposes a complementary interface at `org.gnome.Shell.Extensions.clipman`. The daemon calls into it to ask the Shell — which has the privileged Clutter virtual-keyboard device, and the daemon does not — to synthesise the paste keystroke after the user clicks a history entry:

```dbus
SimulatePaste(s mode) → ()    /* mode ∈ {auto, ctrl-v, ctrl-shift-v, shift-insert} */
MoveWindowToCursor(s title) → ()
```

The `s mode` argument is new. The earlier shape was `SimulatePaste()` with no argument and Ctrl+V hard-coded; users wanted to choose between Ctrl+V, Ctrl+Shift+V, and Shift+Insert (the X11 terminal convention). Rather than add a method per mode, I added one string argument and made the daemon retry against the old no-arg signature on `DBusException`, so a freshly upgraded daemon paired with an unupgraded extension still pastes correctly. The full reasoning is in [ADR 0005](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0005-paste-mode-as-dbus-arg.md), and the extension's `metadata.json` bumped from `version: 4` to `version: 5` to mark the D-Bus contract change for downstream consumers.

Both interfaces are unauthenticated. Access is gated by the user's session bus, which is the same trust boundary as GNOME Shell itself — any process running as the same UID can already call into the Shell, and adding our own authentication layer would be theatre. The full reference, with worked `gdbus call` examples per method, is in [docs/dbus-api.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/dbus-api.md).

### What lives on disk

Everything is under `~/.local/share/clipman/`:

- `clipman.db` — SQLite with WAL journaling on. WAL is chosen so the popup window can read history rows while the daemon writes new entries arriving from D-Bus callbacks.
- `images/` — image clipboard payloads written one file per content hash. The schema is `<hash>.<ext>`; the daemon validates magic bytes (PNG, JPEG, GIF, BMP, WebP) before saving.

The schema is plain: an `entries` table (`id`, `content_type`, `content_text`, `image_path`, `content_hash UNIQUE`, `pinned`, `created_at`, `accessed_at`, `sensitive`), a `snippets` table for user-defined named snippets, and a `settings` table of typed key/value pairs.

Deduplication is content-addressed via SHA256. If you copy the same string twice, the second insert collides on the unique hash and bumps `accessed_at` instead of duplicating. The query that builds the history view orders by `accessed_at DESC`, so re-copying an entry brings it to the top without bloating the table — small thing, but it means a user who reflexively re-copies the same lines all day doesn't watch their history get drowned.

## Privacy & security choices

The premise — *this app stores a record of everything you copy* — makes its privacy choices the most consequential thing about it. I want to be able to tell a friend "yes, install this, it's fine" without crossing my fingers.

**The data directory is `0o700`. Image files are `0o600`.** The daemon `chmod`s both on every startup, even if the directory pre-existed, so a relaxed `umask` cannot quietly widen them. Files are created with `os.open(..., O_CREAT, 0o600)` rather than the default `open()` — the mode flag on `open()` is silently ignored by Python in cases that matter, and `os.open` is the only way to set the mode atomically.

**Sensitive entries auto-clear from the system clipboard 30 seconds after copy.** Detection lives in [`clipman/clipboard_monitor.py`](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/clipman/clipboard_monitor.py) and is a deliberately blunt regex-style match — it errs on the side of flagging *more* things as sensitive, not fewer. The triggers include:

- Known token prefixes: `ghp_`, `gho_`, `ghs_`, `github_pat_`, `sk-`, `sk_live_`, `pk_live_`, `Bearer `, `eyJ` (JWT), `xox` (Slack), `AKIA` (AWS access keys), `AIza` (Google API keys), `npm_`, `-----BEGIN ` (PEM blocks).
- Database connection strings: `postgresql://`, `mysql://`, `mongodb://`, `redis://`.
- SSH public-key prefixes: `ssh-rsa `, `ssh-ed25519 `.
- A heuristic for "looks like a password": single-line, 8–128 chars, no whitespace, contains three of {lowercase, uppercase, digit, punctuation}.

A flagged entry gets stored with `sensitive = 1`, hidden from the searchable history, and the daemon's `delete_expired_sensitive` job removes it from the database 30 seconds after capture. Incognito mode disables capture entirely with a toggle in the status bar.

**There is no `shell=True` anywhere.** Every subprocess invocation in the codebase uses an argument list, so a path with quotes or a string with newlines or anything else weird can't reshape the command. **All SQL is parameterised.** Backup imports — a feature most apps don't think to harden — reject SQLite URIs that try `file:` injection tricks, reject databases that contain triggers or views (which can execute on read), and validate image magic bytes on every imported attachment.

**The update check** is the one network thing the daemon does. With the setting enabled, once every 24 hours the daemon's update-check thread issues *one* anonymous `GET https://api.github.com/repos/MohammedEl-sayedAhmed/clipman/releases/latest` with `User-Agent: clipman/<version>` and a 5-second timeout. No body, no query parameters, no cookies, no identifiers, no referer. It reads `tag_name` out of the JSON, compares it to `clipman.__version__`, and stores the result in the same SQLite `settings` table that holds the rest of your preferences. The full posture from [ADR 0007](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0007-in-app-update-notifications.md):

> *No telemetry.* The check must not send any user data, identifiers, cookies, or anything beyond what an anonymous web visitor would fetch.
> *No auto-update.* We notify and link; we don't download or install.
> *Opt-out friendly.* Snap and Flathub users in particular don't need this — their package manager already refreshes — so it should default off there.

That is the only egress. There is no analytics, no crash reporter, no telemetry pixel. The full assets/adversaries breakdown — what Clipman defends against, and what is intentionally out of scope (cold-boot forensics, kernel keyloggers as the same UID) — is in [docs/threat-model.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/threat-model.md).

## Distribution as a problem in itself

Linux package distribution does not have a single answer. It has at least five.

**PyPI** (`pip install clipman-clipboard`) is the most direct: the daemon is a Python application, so a wheel is the most natural artifact. It needs four system packages that pip cannot install (`python3-gi`, `python3-dbus`, `gir1.2-gtk-3.0`, `wl-clipboard`), so the README has a copy-pasteable apt line above it. PyPI installs default to update-checking ON; the user installed by name and is responsible for upgrades.

**Snap** (`sudo snap install clipman`) is the most user-friendly: one command, the snap is signed, and the Snap Store auto-refreshes installed snaps four times a day by default ([Snapcraft: Manage updates](https://snapcraft.io/docs/how-to-guides/manage-snaps/manage-updates/)). The catch is confinement: strict confinement blocks the snap's processes from talking to anything outside the sandbox, including the GNOME Shell extension running in the host session. Solution: the snap ships *only* the daemon; the user installs the extension separately from the GNOME Extensions website. The two halves still meet on the host session bus, which is allowed across the snap boundary by the `desktop` plug. Snap installs default the update check OFF — the store is already pushing updates, no need to double up.

**AUR** (`yay -S clipman-clipboard`) is for Arch users. The AUR is a community-driven recipe repository — the published artifact is a PKGBUILD that builds the package from source on the user's machine, not a binary ([ArchWiki: Arch User Repository](https://wiki.archlinux.org/title/Arch_User_Repository)). Updating an AUR package means pushing a new commit to the AUR-side git repo, which the release workflow does automatically via SSH after every tagged release.

**`.deb` and `.rpm`** are produced by the release workflow using [`fpm`](https://github.com/jordansissel/fpm) and attached to the GitHub Release page. They install the Python module, `/usr/bin/clipman`, the `.desktop` file and the icon system-wide, but they do *not* install the per-user GNOME Shell extension or the `Super+V` keybinding — those are user-scoped and stay out of system packages. A `.deb` user runs `./install.sh` once after install to finish the per-user setup. This is documented in the README.

**Flathub** is pending. The manifest is in the repo at `flathub/io.github.MohammedEl_sayedAhmed.Clipman.json`, the submission PR is open against [flathub/flathub](https://github.com/flathub/flathub), and Flathub maintainers will manually review it before merge ([Flathub submission docs](https://docs.flathub.org/docs/for-app-authors/submission)).

**The GNOME Extensions website** ([extensions.gnome.org](https://extensions.gnome.org/extension/9407/clipman-clipboard-monitor/)) hosts the extension zip. EGO has its own review pipeline: an automated linter called Shexli flags patterns that need human attention before the extension is published. The first time I uploaded the extension, Shexli flagged it with `EGO-A-005 (manual_review): direct clipboard access via St.Clipboard.get_default() requires reviewer scrutiny` — which is *correct*, that is exactly what the extension does, and the human reviewer waved it through after reading the source. Every clipboard-related extension on EGO triggers the same finding; it's a "make sure a reviewer looks at this" gate, not a rejection.

No single channel is sufficient. PyPI users don't install snaps; Arch users don't `pip install`; Snap users want a one-click install; Fedora users want an `rpm -i`; everyone-else-on-Flatpak wants Flathub. The build matrix is the cost of being installable.

## CI/CD as a security surface, not just plumbing

The other place a clipboard manager can fail its users is supply chain. If my GitHub credentials are compromised and an attacker pushes a release, every PyPI/Snap/AUR auto-refreshing install runs whatever they shipped. The CI/CD harness is the thing that has to make that hard, and the full per-workflow inventory and DAG is at [docs/ci-cd.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/ci-cd.md). The decisions worth talking about here:

**SHA-pinning every action.** Every `uses:` line in `.github/workflows/` points to a 40-character commit SHA, with a trailing `# v1.2.3` comment so a human can read it. Dependabot opens weekly PRs to bump the pins, and reviewing one means checking that the new SHA actually corresponds to the version in the comment. The reasoning is recorded in [ADR 0003](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0003-sha-pin-github-actions.md); the recent industry context is in StepSecurity's writeup of the [`tj-actions/changed-files` compromise](https://www.stepsecurity.io/blog/pinning-github-actions-for-enhanced-security-a-complete-guide), where workflows that used `@v44` instead of a SHA executed an attacker's code and printed all their secrets to the build log.

**Annotated-tag SHA vs commit SHA.** This one bit me. Git tags can be either *lightweight* (a pointer directly to a commit) or *annotated* (a tag *object* with metadata that points to a commit). `git rev-parse v1.2.3` on an annotated tag returns the SHA of the tag object, not the SHA of the commit. Most actions are happy to be referenced by either, but Docker-based actions — including `pypa/gh-action-pypi-publish` — resolve the SHA through their container registry, which only knows about commit SHAs. In v1.0.5 the PyPI publish job had been pinned to the tag-object SHA and failed with `Unable to find image`. The fix was to switch the pin to the commit SHA returned by `git rev-parse v1.14.0^{commit}`. The same error mode bit OpenSSF's Scorecard action in PR #22. The lesson: pin to commits, verify with `^{commit}`, and Docker-based actions are the trip wire that surfaces the mistake.

**CodeQL baseline ratchet.** [CodeQL](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/codeql-query-suites)'s `security-and-quality` query suite surfaces roughly eighteen pre-existing informational findings on `main` (best-effort `except: pass` blocks, cyclic imports, module-level prints) that are intentional and not defects. Out of the box those findings appear as annotations on *every* PR's *Files changed* tab, including PRs that don't touch the affected files, which trains reviewers to ignore the annotations entirely. The mitigation is a *baseline ratchet*: keep a fingerprint list of findings that exist on `main` on a dedicated orphan branch `security-baseline`, and fail a PR only if it introduces a fingerprint not in that list. New regressions block; pre-existing noise doesn't. The `security-baseline` branch is auto-refreshed on push to `main` and protected against manual tampering by a `baseline-guard` workflow that auto-reverts unauthorised pushes and opens a labelled security issue. Recorded in [ADR 0002](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0002-baseline-ratchet-for-codeql.md) and refined by [ADR 0008](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0008-ratchet-fingerprint-strategy.md) (which switched the fingerprint format from `rule:file:line` to SARIF `partialFingerprints.primaryLocationLineHash`, so unrelated line-shifts above an existing finding don't read as new findings).

**Step-Security `harden-runner`** is the first step on every job, with `egress-policy: audit`. In audit mode the action installs eBPF hooks at the kernel level that log every outbound network connection from the runner ([StepSecurity docs](https://docs.stepsecurity.io/harden-runner)) without blocking anything. The audit log is the forensic trail if something does slip through. "Block" mode would refuse unknown egress entirely, which is the eventual goal, but enabling block requires an allow-list and the allow-list for a Python+GTK+Snap+Flatpak build is large enough that I haven't audited it yet.

**OIDC trusted publishing for PyPI** ([ADR 0004](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0004-pypi-trusted-publishing-oidc.md)). There is no long-lived PyPI API token in this repo or in GitHub Secrets; PyPI accepts a per-job OIDC token minted by GitHub at publish time, scoped to the specific repository, workflow, environment, and job. A repo-wide secrets leak cannot push to PyPI; an attacker would have to compromise the GitHub OIDC infrastructure itself, or rename the workflow file to match the trusted-publisher configuration. The trade-off is one manual setup step at <https://pypi.org/manage/account/publishing/> per project, which is unavoidable but only happens once.

The full release pipeline DAG, the secrets matrix, the `harden-runner` audit semantics, the SHA-pinning policy, and the debug playbook live in [docs/ci-cd.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/ci-cd.md).

## Real bugs that shipped (and what they taught me)

A list, in order of how surprised I was.

**libfuse2 → libfuse2t64 (PR #33).** The release pipeline includes an AppImage build, which depends on `libfuse2` at run time and at build time. Ubuntu 24.04 — the runner image we use — renamed `libfuse2` to `libfuse2t64` as part of the [64-bit time_t transition](https://docs.appimage.org/user-guide/troubleshooting/fuse.html), so the workflow's `apt install libfuse2` started failing with "no installation candidate" on the runner roll-forward. The fix is `apt install libfuse2t64 || apt install libfuse2`, fallback chain on the rename. Lesson: even a fully SHA-pinned action stack is not insulated from the *runner image* changing under it; the runner image has its own roll-forward calendar.

**Metadata-Version 2.4 vs older twine (PR #36).** [Twine](https://twine.readthedocs.io/en/stable/changelog.html) is the canonical tool for uploading Python packages to PyPI. The wheel we build for 1.0.5 declared `Metadata-Version: 2.4` because the modern build backend supports the new license fields, but the version of `pypa/gh-action-pypi-publish` we had pinned (v1.12.2) shipped a twine old enough that it rejected the wheel on upload. Bumping the action to v1.14.0 fixed it, but the pin had to be the *commit* SHA, which is the gotcha from the previous section. Lesson: action pins go stale; packaging metadata standards keep moving. Read the action's release notes when Dependabot bumps it.

**Settings-panel "clicks do nothing" on Wayland (1.0.6).** Several settings widgets — the Switch for incognito mode, the combo box for paste mode, the shortcut-capture dialog — used to silently swallow clicks on some Wayland compositors. The popup is a borderless GTK window that hides itself on `focus-out-event` (so clicking outside it closes it, like a real popover). But on some compositors, clicking the Switch widget briefly transfers keyboard focus to a transient surface for the click-handling, which fires `focus-out` on the parent window, which hides the popup, which means the click event never reaches the Switch at all. The fix is in [`clipman/window.py`](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/clipman/window.py): treat "focus moved to a descendant of the popup itself" as not-really-a-focus-out and ignore it:

```python
def _on_focus_out(self, widget, event):
    if self._ignore_focus_out:
        return False
    # On some Wayland compositors, clicking certain interactive
    # widgets inside the popup (notably Gtk.Switch and combo-box
    # popovers) briefly transfers keyboard focus to a transient
    # surface, which sends a focus-out to the parent window. If
    # we treat that as "the popup lost focus to another window"
    # and hide ourselves, the original click event never reaches
    # the widget — the user perceives the entire settings panel
    # as unresponsive. Guard: only hide when the new focus owner
    # is genuinely outside the popup tree.
    try:
        new_focus = self.get_focus()
    except Exception:
        new_focus = None
    if new_focus is not None and new_focus.is_ancestor(self):
        return False
    self.hide()
    return False
```

Lesson: when a click "does nothing", suspect the focus model before suspecting the click handler.

**The SSH key compromise.** Not a bug in Clipman's code — a bug in my workflow. The release pipeline has to push commits to the AUR over SSH, which means an SSH private key lives in a GitHub repository secret (`AUR_SSH_PRIVATE_KEY`). At one point I had that key file open in an editor with an AI assistant integration enabled; the assistant's "file picker" piped the file contents into a chat session, which logged them. I rotated immediately: generated a new dedicated ed25519 key (`id_ed25519_aur`, separated from my main identity so it can be revoked without affecting other access), registered the new public key on the AUR maintainer account, removed the compromised key from GitHub Actions secrets and from `~/.ssh/authorized_keys` on AUR, and `shred`'d the local files. No release had been pushed using the compromised key — the rotation was precautionary — but the incident is the reason I now treat "open a private key in an editor with assistant access" as the same kind of mistake as "paste a secret into a chat window". Same outcome, different surface.

## Versioning and deprecation

SemVer is straightforward for libraries: the public API is the surface that matters. For an end-user application with no public Python API, what is the "public API"?

For Clipman it's three things, written down in [ADR 0010](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0010-versioning-policy.md):

1. **The two D-Bus interfaces** — `com.clipman.Daemon` and `org.gnome.Shell.Extensions.clipman` — and their method signatures.
2. **The SQLite schema** at `~/.local/share/clipman/clipman.db`, including the `settings` table key names.
3. **The supported-versions matrix** — Python 3.10–3.12, GNOME Shell 45–48, Ubuntu 22.04+ — and the GTK3 toolkit choice.

A MAJOR bump (e.g. `2.0.0`) means removing a D-Bus method, renaming a settings key without a backward-compatible shim, dropping a supported Python version, dropping a GNOME Shell version, relocating the data directory, or moving from GTK3 to GTK4. A MINOR means an additive change behind a try-with-arg / retry-without-arg fallback like the `SimulatePaste(s mode)` one (the precedent that established the pattern, [ADR 0005](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0005-paste-mode-as-dbus-arg.md)). A PATCH means anything else.

Internal Python modules like `clipman.database` or `clipman.window` are *not* a public API. They will change in any release, including patch releases, with no deprecation cycle. If you import clipman as a library, you're doing it at your own risk.

The extension's `metadata.json` `version` integer is a separate concept from the product tag and exists for downstream consumers of the extension's D-Bus interface. It bumps only on D-Bus contract changes; that's why the extension is at version 5 while the product is at 1.0.6.

## Documentation as a first-class artifact

The repo has [ten ADRs](https://github.com/MohammedEl-sayedAhmed/clipman/tree/main/docs/adr) covering every notable architecture decision; a top-level [ARCHITECTURE.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/ARCHITECTURE.md); a [GOVERNANCE.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/GOVERNANCE.md) that names the maintainer and the decision-making process; a [maintaining.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/maintaining.md) with the release flow, branch hygiene, Dependabot triage and packaging notes; a [ci-cd.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/ci-cd.md) with the workflow inventory, release DAG and secrets matrix; a [dbus-api.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/dbus-api.md) with worked `gdbus call` examples per method; a [threat-model.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/threat-model.md); a [translating.md](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/translating.md) for the gettext workflow; a [Keep-a-Changelog](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/CHANGELOG.md) CHANGELOG; plus CONTRIBUTING, SECURITY and a Contributor Covenant code of conduct.

That is a lot of words for a one-person project. The honest reasons:

- I will forget. A year from now I will not remember why `metadata.json` is at `version: 5` while the product is at `1.0.6`. The ADRs are the only way to find out without re-litigating the decision.
- Downstream packagers and translators need a place that isn't "open an issue and ask". `docs/translating.md` is the difference between a translator submitting a PR and a translator giving up; `docs/maintaining.md` is what lets someone else cut a release without me on a call.
- The CI harness is genuinely complex. If I am the only person who knows what `baseline-guard.yml` is for, the harness only works as long as my memory does, which is short.
- Writing decisions down forces me to reread them. Half the time, writing the ADR is when I notice the decision was wrong.

The cost is proportional. Most of the docs were written *alongside* the change they describe, in the same PR. The ones that came later (ARCHITECTURE, GOVERNANCE, the threat model) were each one focused afternoon.

<p align="center">
  <img src="https://raw.githubusercontent.com/MohammedEl-sayedAhmed/clipman/main/docs/dark-theme.png" alt="Dark theme" width="320">&nbsp;&nbsp;<img src="https://raw.githubusercontent.com/MohammedEl-sayedAhmed/clipman/main/docs/light-theme.png" alt="Light theme" width="320">
</p>
<p align="center"><sub>
  Dark and light themes (Catppuccin Mocha / Latte). Source: <a href="https://github.com/MohammedEl-sayedAhmed/clipman">repository README</a>.
</sub></p>

## What's next

**Flathub.** The submission PR is open against `flathub/flathub`. Once a Flathub volunteer reviewer signs off, Clipman becomes installable as `flatpak install flathub io.github.MohammedEl_sayedAhmed.Clipman` on any Linux desktop with Flatpak. The manifest already exists in the repo.

**KDE support.** KDE Plasma's clipboard is implemented by Klipper, which is conceptually similar to our extension/daemon split but uses a different KWayland protocol surface. The fallback path (`wl-paste --watch`) works on KDE today but loses some XWayland-app coverage that the GNOME extension provides natively. A small KWayland equivalent of the GNOME extension is the right answer; it's on the long-tail roadmap.

**Themes beyond Catppuccin.** The current dark/light pair is Catppuccin Mocha / Latte. The CSS is a template with `$variable` placeholders so a third-party theme is a 30-line file, but I haven't documented how to write one yet.

**Image annotation.** The clipboard already stores images; the popup lets you preview them; adding crop/annotate would let Clipman replace a screenshot-and-annotate workflow on the same keystroke.

**Privacy-preserving sync across machines.** This is the hardest one. The whole privacy posture above relies on the data never leaving the machine. Adding sync without giving that up means end-to-end encryption with a key the user controls, which means key management, which means a UX I haven't designed yet. It is on the long list, not the short list.

## Reflection / lessons

A few things stuck with me building this.

**The choice of where to listen is the whole architecture.** Everything downstream of "subscribe to `Meta.Selection`'s `owner-changed` inside the Shell process" is mechanical. Everything downstream of "poll `wl-paste` in a loop" is a permanent rearguard action against flicker and missed copies and battery drain. The five hours I spent reading Mutter's source to find `Meta.Selection` are responsible for half the apparent quality of this app. When something feels like it should be impossible on a given platform, the question "what's the privileged thing that *can* do this, and how do I become its client?" is worth a long time at the whiteboard.

**SemVer for an end-user app is a contract with downstreams, not users.** Users mostly don't read your version number. AUR maintainers, Flathub reviewers, snap rebuilders, distro packagers, translators — they read it constantly. Writing the policy down ([ADR 0010](https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/adr/0010-versioning-policy.md)) is a kindness to the people whose job it is to ship your code.

**SHA pins protect a future me that doesn't exist yet.** It would have been faster to use `@v4` everywhere and let GitHub re-resolve on every run. The cost of SHA-pinning is real (uglier diffs, more Dependabot PRs, the annotated-tag-SHA gotcha I hit in v1.0.5). The value is paid out in a single moment, *if and only if* an upstream maintainer's account gets compromised — and even one prevented incident pays for the entire cost. This is the canonical shape of a security investment, and it's a hard one to feel good about while you're doing it.

**The release pipeline is more of the product than I expected.** Half the work of shipping 1.0.5 wasn't the new features — it was making the release reproducible across PyPI, Snap, AUR, `.deb`, `.rpm`, AppImage, and the extension bundle, in one tag push, without long-lived secrets, with a CHANGELOG section that's both human-readable and machine-extractable. None of that is visible to a user. All of it is the difference between "I can ship a security fix today" and "I can ship a security fix in a week if I clear my evening". The 1.0.5 / 1.0.6 split is exactly an instance of this: the user-visible change set is identical, but the *pipeline* was wrong, and a separate patch had to ship to fix the pipeline before the features could actually reach PyPI.

**The privacy posture matters more than the feature list.** When I show this to a friend, the thing they remember a week later isn't the search, or the pinning, or the snippets. It's "oh, the one that doesn't send my passwords anywhere". That is the brand of the project, and it is the brand because of choices like `0o700` on the data dir, the sensitive-content auto-clear, the *one* documented network egress, and the audit trail of decisions in `docs/adr/`. The features get you tried; the posture gets you kept.

## Links

- Repository: <https://github.com/MohammedEl-sayedAhmed/clipman>
- PyPI: <https://pypi.org/project/clipman-clipboard/>
- GNOME Extensions: <https://extensions.gnome.org/extension/9407/clipman-clipboard-monitor/>
- AUR: <https://aur.archlinux.org/packages/clipman-clipboard>
- Snap Store: <https://snapcraft.io/clipman>
- Architecture decisions: <https://github.com/MohammedEl-sayedAhmed/clipman/tree/main/docs/adr>
- D-Bus reference: <https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/dbus-api.md>
- Threat model: <https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/threat-model.md>
- CI/CD inventory: <https://github.com/MohammedEl-sayedAhmed/clipman/blob/main/docs/ci-cd.md>
