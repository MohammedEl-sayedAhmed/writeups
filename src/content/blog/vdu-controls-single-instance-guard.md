---
title: Why vdu_controls launched three times on KDE (a Qt single-instance guard)
description: 'Three copies of the same tray app were running on my KDE desktop. Tracing it through the process tree, KDE''s parallel launch channels, a missing single-instance check, and a generic .desktop file — then adding a QLocalServer guard and getting it merged upstream.'
pubDate: Jun 2 2026
tags: 'linux, opensource, python, qt'
published: true
canonical_url: 'https://mammar.pages.dev/blog/vdu-controls-single-instance-guard/'
---

A few weeks ago I [sent my first PR](/blog/vdu-controls-philips-evnia-brightness-slider-fix/) to `vdu_controls`, a small Qt tray app for controlling external monitors over DDC/CI. That one was a parser bug. This is the second, and it started the same way every good bug does: I noticed something on my own machine that shouldn't be possible.

I opened a terminal one morning, ran `ps`, and found **three** copies of `vdu_controls` running at once.

Not three windows. Three independent processes, each holding the same I2C bus, each ready to fight the others over my monitor's brightness register. The app was perfectly happy to be started any number of times — and on KDE, it turned out, the desktop was starting it any number of times.

This is a writeup of how a missing six-line check becomes a triplicate process, how a Linux desktop actually launches your apps at login, and the difference between a guard that exits silently and one that does the polite thing.

## TL;DR

`vdu_controls` had no single-instance guard. On KDE, *two* independent channels start it at every login — the XDG autostart entry and the session-restore manager — and clicking the app menu while it's hiding in the tray starts a third. Nothing deduplicated them, at either the app layer or the desktop layer.

I added a `QLocalServer`-based guard: the first instance listens on a per-user socket; a second launch connects, asks the first to surface its window, and exits. ~40 lines plus a headless test suite. [digitaltrails/vdu_controls#130](https://github.com/digitaltrails/vdu_controls/pull/130), merged. The interesting part isn't the patch — it's that the bug didn't live in any one file. It lived in the gaps between four systems that each behaved correctly on their own.

## The setup

- **Desktop:** KDE Plasma on X11
- **The tool:** `vdu_controls` — a Qt tray app (the closest thing Linux has to Windows' Twinkle Tray) that reads/writes monitor controls via `ddcutil`. Runs from a tray icon, usually started at login.
- **The symptom:** three live processes after a normal login + one menu click.

## The symptom, in detail

Here's the actual `ps` output that started it (trimmed to the columns that matter):

```
mohammed    4608    3718  python3 .../vdu_controls
mohammed    4780    4199  python3 .../vdu_controls -session 1013a135... -name vdu_controls
mohammed  353933    4336  python3 .../vdu_controls
```

Three processes. The middle one is the tell — it was launched with `-session <id> -name vdu_controls`, which is the Qt session-management handshake. The other two have no such argument. So these weren't forks of one launcher; they came from *different* launchers.

The next column to look at is the parent PID, and that's where it got interesting. Walking each PPID up the tree:

- `4608` → parented to `systemd --user` (the XDG autostart channel)
- `4780` → parented to `ksmserver` (KDE's session-restore manager)
- `353933` → parented to `plasmashell` (I'd clicked the app in the menu)

Three processes, three *different* parents. This is the most important diagnostic in the whole story, and it's the same move as last time: **find the boundary between what's working and what isn't.** Last time it was "the CLI tool reads brightness fine, so the bug is in the GUI's parser." This time the process tree said it plainly — the app wasn't spawning duplicates of itself. Three separate, legitimate launchers were each starting it cleanly, and none of them knew about the others.

So the question stopped being "what's wrong with `vdu_controls`?" and became two questions:

1. Why does KDE start the same app from more than one place at login?
2. Why doesn't anything — the app, or the desktop — notice it's already running?

## Background: how a Linux desktop launches your apps

If you've never looked at desktop autostart, the short version is that "start this app once when I log in" is not a single mechanism. It's several, and they don't coordinate. Skip ahead if this is familiar.

### 1. The XDG autostart spec

The cross-desktop standard. Drop a `.desktop` file in `~/.config/autostart/` and your session's autostart launcher runs it at login. On a modern systemd-based session that launcher is `systemd --user`, which wraps each entry in a transient unit (mine showed up as `app-vdu_controls@autostart.service`). This is channel one. `vdu_controls` installs exactly such an entry when you tick "Start at login."

### 2. Session restore

Separately, KDE's session manager (`ksmserver`) can save the set of running apps when you log out and restore them when you log back in. An app that speaks the X Session Management Protocol gets relaunched with `-session <id>` so it can recover its prior state. Qt apps support this **automatically** — you get it for free just by being a `QApplication`. This is channel two, and it fires *independently* of channel one.

That's the crux: if you enabled autostart **and** logged out with the app running, KDE faithfully restores it from saved session **and** the autostart entry fires — because from each subsystem's point of view, it's doing exactly the one job it was asked to do. Neither is wrong. They're just both right at the same time.

### 3. D-Bus activation — the dedupe most apps rely on

Here's the layer that's *supposed* to prevent this, and the reason most apps don't have the problem. A `.desktop` file can declare:

```ini
DBusActivatable=true
```

When it does, the launcher doesn't `exec` the binary directly — it asks D-Bus to activate the app's well-known bus name. D-Bus name ownership is exclusive: if the app already owns the name, activation routes to the running instance (typically raising its window) instead of starting a new process. GNOME's `GApplication` leans on exactly this. It's single-instance behaviour handed to you by the desktop, for free, *if you opt in*.

### 4. The manual launch

And none of the above touches the case where you just click the icon in the application menu. That's `plasmashell` doing a plain `exec`. No session protocol, no D-Bus activation — a brand new process, every click.

So a desktop gives you at least three ways to start "the same" app, and the only one that deduplicates is D-Bus activation, which you have to explicitly opt into.

## Where the guard wasn't

Two places could have stopped this. I checked both.

**The app.** I grepped for any single-instance mechanism:

```sh
$ git grep -E "QLocalServer|QLockFile|QSharedMemory|single.?instance|already.?running|fcntl\.(flock|lockf)"
```

One hit, in an unrelated log filter. Nothing else. `vdu_controls_application.main()` unconditionally constructs `QApplication(sys.argv)` and proceeds to build the controller and window. There's no lock, no socket, no bus-name check. Start it twice, get two of everything.

**The desktop file.** I read the shipped `vdu_controls.desktop`. Generic — no `DBusActivatable=true`, no `X-GNOME-SingleApplication=true`, nothing. So the desktop layer couldn't dedupe either, because the app never told it to.

That closed the loop. The app can't guard itself, the desktop isn't asked to, and KDE's autostart and session-restore channels are independent by design. Every login, the duplicates pile up. Nothing here is malfunctioning — the bug is the *absence* of a mechanism, sitting in the space between four systems that each work fine alone.

## Design choice: lock file vs. socket

Two clean ways to make a Qt app single-instance:

- **`QLockFile`** — acquire a per-user lock at startup; if it's already held, exit. Smaller diff, dead simple. But the second launch can only *die quietly*.
- **`QLocalServer` / `QLocalSocket`** — the first instance listens on a named socket; the second connects, optionally sends a message, and exits. A few more lines, but the second launch can *talk* to the first.

The deciding factor was the tray. This is a tray app — its normal resting state is "running, no window visible." With a lock file, here's the failure mode: the one instance is alive but minimised to the tray, you click the menu entry to bring it up, the new process grabs-the-lock-fails-exits-silently… and nothing appears. You clicked, and the desktop did nothing. That's exactly the behaviour users hate, and it's what well-behaved tray apps (Slack, KeePassXC, Telegram) deliberately avoid: a second launch *raises the existing window*.

`QLocalServer` buys that for the cost of a small message protocol, so I picked it. No new dependencies either — `QLocalServer`/`QLocalSocket` live in `QtNetwork`, which the app already imports.

## The fix

About 40 lines in `src/vdu_controls/vdu_controls_application.py`. Three pieces.

**A server that listens and emits a signal.** The running instance owns a `SingleInstanceServer`; when a peer connects, it drains the connection and emits a Qt signal:

```python
class SingleInstanceServer(QObject):
    activate_requested = pyqtSignal()

    def __init__(self, server_name: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._server = QtNetwork.QLocalServer(self)
        self._server.newConnection.connect(self._on_new_connection)
        if not self._server.listen(server_name):
            # listen() failed - typically a stale socket from a crashed prior run. Remove and retry.
            QtNetwork.QLocalServer.removeServer(server_name)
            if not self._server.listen(server_name):
                log.warning(f"Single-instance guard could not bind {server_name}: {self._server.errorString()}")

    def _on_new_connection(self) -> None:
        while self._server.hasPendingConnections():
            sock = self._server.nextPendingConnection()
            if sock is not None:
                sock.readAll()
                sock.disconnectFromServer()
        self.activate_requested.emit()
```

**A probe the second instance runs before doing any real work:**

```python
def _activate_running_instance(server_name: str, timeout_ms: int = 500) -> bool:
    # Returns True if a peer accepted the request (caller should exit), False if none was reachable.
    sock = QtNetwork.QLocalSocket()
    sock.connectToServer(server_name)
    if not sock.waitForConnected(timeout_ms):
        return False
    sock.write(b"activate\n")
    sock.flush()
    sock.waitForBytesWritten(timeout_ms)
    sock.disconnectFromServer()
    return True
```

**Wiring it into `main()`, in the right spot.** Placement matters: the guard goes *after* the one-shot CLI operations (`--install`, `--uninstall`, `--detailed-help`) — those should always run regardless of whether an instance is up — but *before* the expensive controller/window construction, so a duplicate exits before touching any hardware:

```python
single_instance_name = f"vdu_controls-{os.geteuid()}"
if _activate_running_instance(single_instance_name):
    log.info(f"Another {APPNAME} instance is already running; activated it and exiting.")
    sys.exit(0)
single_instance_server = SingleInstanceServer(single_instance_name, parent=app)
```

and once the window exists, the signal is hooked straight to the method that already knew how to surface it:

```python
main_window = VduAppWindow(main_config, main_controller)
single_instance_server.activate_requested.connect(partial(main_window.show_main_window, False))
```

`show_main_window()` already did the full `show()` → `raise_()` → `activateWindow()` dance, including un-hiding from the tray. I didn't have to write any of the "bring it to front" logic — it was already there, just never reachable from a second process. (A small bonus: that line had carried a `# may need to assign this to a variable to prevent garbage collection?` note for ages because the window object was never bound to a name. Wiring the signal forced me to bind it as `main_window`, quietly settling the question.)

A few deliberate details:

- **Per-user socket.** The name is keyed on the effective UID (`f"vdu_controls-{os.geteuid()}"`), so two users on the same machine each get their own guard and never collide. On Linux, Qt places the named socket under the user's runtime directory (`$XDG_RUNTIME_DIR`).
- **Stale-socket recovery.** If the previous instance was `SIGKILL`ed (or the box lost power), the socket file can outlive it and `listen()` fails with "address in use." The `removeServer` + retry handles that, so a crash never permanently wedges the guard.

## Honest trade-offs

This is a small fix to a hobby project, and it has edges worth naming.

- **There's a race window.** Between the `_activate_running_instance` probe (which finds no peer) and the `listen()` call that claims the socket, two launches fired in the same microsecond could both decide they're first. The window is microsecond-scale; the channels it's defending against — autostart vs. session-restore — fire hundreds of milliseconds apart at login. So in practice it's well covered, but I'm not going to pretend it's a true atomic compare-and-swap. A `QLockFile` would close it completely, at the cost of the tray UX above. I chose the UX.
- **It's fix-vs-fix only.** The guard detects other *guarded* instances. The very first time you upgrade into this version while old, unguarded copies are still running, those copies are invisible to it — they aren't listening on the socket. The duplicates clear on the next clean login. There's no way around this without the old code having shipped the fix, which is just the nature of additive guards.

## Testing

I wrote a headless IPC test suite — `tests/test_single_instance.py`, 4 tests, ~140 lines, runs in under a second with `QT_QPA_PLATFORM=offscreen` so it needs no display:

1. **No existing instance** → `_activate_running_instance` returns `False`.
2. **Activation fires the signal** → connecting to a live `SingleInstanceServer` emits `activate_requested`.
3. **Two sequential activations** → the signal fires both times (the server keeps serving).
4. **Stale-socket recovery** → spawn a subprocess that binds a `QLocalServer` on the name, `SIGKILL` it so it can't clean up, then assert a fresh `SingleInstanceServer` still binds via the `removeServer` + retry path.

That fourth one is the test I'm happiest with, because it reproduces the exact crash-recovery scenario in CI instead of trusting that the fallback "probably works." `SIGKILL` (not `SIGTERM`) specifically, so no atexit cleanup runs and the socket file is guaranteed orphaned.

And then the part no automated test replaces — I drove it by hand on KDE Plasma X11: cold start (window appears, guard binds), second launch (the running window pops to the front, the duplicate exits), and kill-then-relaunch (recovery via the stale-socket path). All three behaved.

## The maintainer

I filed [issue #129](https://github.com/digitaltrails/vdu_controls/issues/129) first — `ps` output, the parent-process breakdown, the `git grep` showing no existing guard — then [PR #130](https://github.com/digitaltrails/vdu_controls/pull/130) referencing it, in two commits: one for the fix, one for the test.

Michael Hamilton (`digitaltrails`) merged within hours, and his reply was the kind of thing that makes you want to keep contributing:

> Thanks again for these changes, good contributions are few and far between, so they're much appreciated when they appear.

He thought out loud about the test suite, too — candid about the fact that this is a retirement hobby ("an alternative to indoor/bad-weather hobbies such as crossword-puzzles and gaming") and that he's genuinely undecided about committing to maintain a test suite long-term, since the usual failure mode of tests is that they rot. Fair. I'd rather a maintainer be honest about that than merge tests he'll resent in a year.

Two nice follow-ups came straight out of the merge:

- He added a config option to **disable** the guard — because he sometimes runs more than one version side-by-side while developing. Obvious in hindsight, and exactly the right instinct: a single-instance guard should have an escape hatch for the person who *wants* multiple instances.
- He floated extending the socket beyond a bare `"activate"` message into a small command channel — e.g. `restore-preset 'my preset name'` — since `vdu_controls` already activates presets via UNIX signals and a socket is a richer pipe. I'd built a doorbell; he immediately saw it could be an intercom. If I take a swing at it, that's a third PR.

## What I took away

**Some bugs don't live in a file.** Last time the bug was a literal character in a regex. This time there was nothing wrong to *point at* — every component did its job. The defect was the missing contract between them, and you only see those by stepping back from the code to the system: the process tree, the launch channels, the desktop spec. Grep finds bugs that exist; it can't find the guard that was never written.

**The process tree is a debugging tool.** `ps` with parent PIDs told me, in one screen, that this wasn't a fork bug — it was three legitimate launchers with no referee. I'd have wasted an hour in the Python if I'd started there instead.

**Pick the failure mode your users will actually hit.** `QLockFile` is objectively simpler and closes a race this socket approach technically leaves open. I shipped the socket anyway, because the real-world event isn't a microsecond-perfect double-launch — it's someone clicking a tray app's menu and expecting a window. Optimise for the failure that happens, not the one that's elegant to prevent.

**Write the test for the scary path.** The stale-socket recovery is the one branch that only runs after something already went wrong (a crash). That's precisely the code you can't afford to leave unexercised, so it got the most deliberate test in the suite.

## Links

- PR: <https://github.com/digitaltrails/vdu_controls/pull/130>
- Issue: <https://github.com/digitaltrails/vdu_controls/issues/129>
- My first PR to this project: [the 0..1 brightness slider bug](/blog/vdu-controls-philips-evnia-brightness-slider-fix/)
- `vdu_controls`: <https://github.com/digitaltrails/vdu_controls>
- XDG autostart spec: <https://specifications.freedesktop.org/autostart-spec/latest/>
- D-Bus activation in `.desktop` files: <https://specifications.freedesktop.org/desktop-entry-spec/latest/dbus.html>
