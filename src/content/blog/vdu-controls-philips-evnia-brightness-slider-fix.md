---
title: How I fixed a 0..1 brightness slider in vdu_controls (Philips Evnia DDC/CI bug)
description: 'A Philips Evnia 27M2N5500Q on Linux gave me a brightness slider stuck at 0..1 in vdu_controls. Tracing it through DDC/CI, capability strings, and a parser bug — and submitting my first open-source fix.'
pubDate: May 16 2026
tags: 'linux, opensource, python, debugging'
published: true
canonical_url: 'https://mammar.pages.dev/blog/vdu-controls-philips-evnia-brightness-slider-fix/'
id: 3685159
---

I plugged a new monitor into my Kubuntu laptop last week. The brightness slider in the tray utility I use only had two settings: black, and almost-black. Not 0 to 100. Not a continuous gradient. Just two positions.

The monitor itself was fine. The cable was fine. Every other monitor on the same machine worked normally. So I started pulling on the thread.

A few hours later I had: a one-line cause, a 21-line patch, a test fixture, and my first open-source PR merged upstream.

This is a writeup of what the bug actually was, how a monitor talks to a computer at all, and what I learned chasing it.

## TL;DR

A Philips Evnia 27M2N5500Q reports the same VCP code (the standardized "brightness" control) twice in its **capability string** — once correctly, then again inside a manufacturer-specific section with garbage values. Combined with an unescaped `.` in a regex inside `vdu_controls` (a KDE GUI for controlling external monitors), this made the GUI think brightness was a 0..1 control instead of 0..100.

The fix is in two small parts. The PR was merged into [digitaltrails/vdu_controls#128](https://github.com/digitaltrails/vdu_controls/pull/128). Read on for the actually-interesting part.

## The setup

- **Laptop:** Kubuntu 24.04, KDE Plasma 5.27 on X11, Intel iGPU
- **The new monitor:** Philips Evnia 27M2N5500Q, 27" 2560x1440, connected over HDMI
- **The tool:** `vdu_controls` — a small Qt tray app that lets you adjust brightness/contrast/etc. on external monitors. It's the closest thing Linux has to Windows' Twinkle Tray.

After plugging the monitor in, the tray UI showed two sliders — one per external monitor. The Lenovo on DisplayPort had a normal 0..100 brightness slider. The Philips on HDMI did not. Its slider had two positions, the value field showed `1`, and dragging it from one end to the other produced exactly two states: full off (0) and almost-off (1).

## First-pass diagnosis: where exactly is it broken?

Before debugging *any* GUI bug, the first question is: **is the underlying mechanism broken, or just the UI?**

I dropped to the shell:

```sh
$ ddcutil --display 1 getvcp 10
VCP code 0x10 (Brightness): current value = 83, max value = 100
```

`ddcutil` is the canonical command-line tool for talking to monitors over DDC/CI. It reported the brightness correctly — current 83, maximum 100. The monitor itself was reporting a continuous 0..100 range to the OS. The bug had to be somewhere between that response and what the GUI rendered.

That narrows things down enormously. Whatever was wrong, it was in user-space, in Python, in the parts I could read.

## Background, in four short sections

Before I show what was actually broken, here's the protocol stack involved. If you already know DDC/CI, MCCS, and VCP codes, skip ahead.

### 1. A monitor is a tiny embedded computer

A modern monitor isn't just a glass panel and a backlight. It runs firmware. That firmware controls:

- The backlight intensity
- Contrast, color balance, gamma curves
- Which physical input is active (HDMI-1 / HDMI-2 / DisplayPort)
- The on-screen menu (OSD) you see when you press the button on the back
- Sometimes audio, USB hub switching, HDR mode, KVM

You normally interact with all this through the OSD menu. The problem with OSD menus is that you have to physically reach around to a button on the back of every monitor you own. So manufacturers and standards bodies agreed on a way for *the computer* to control these things over the video cable.

### 2. DDC and DDC/CI

VESA — the same standards body behind DisplayPort and EDID — defined a protocol called **DDC** (Display Data Channel). It uses spare wires in the video cable to carry a tiny side-channel for the monitor and the computer to talk to each other.

Originally DDC was one-way: the monitor told the computer about itself (its name, supported resolutions, refresh rates). That packet of self-description is called **EDID**. It's how your OS knows your monitor is a "Philips 27M2N5500Q" without you typing it in.

Then VESA extended DDC to be two-way and called the extension **DDC/CI** — Display Data Channel **Command Interface**. Now the computer could also *send commands*: "set brightness to 50", "switch input to HDMI-2", "what's your current contrast?". That's the protocol everything in this story rides on.

### 3. VCP codes and MCCS

To make DDC/CI useful across manufacturers, VESA also standardized which commands exist, in a document called **MCCS** (Monitor Control Command Set). Each control gets a numeric code called a **VCP code** (Virtual Control Panel). A handful of examples:

| Code | Meaning |
|---|---|
| `0x10` | Brightness |
| `0x12` | Contrast |
| `0x14` | Color preset (sRGB, 6500K, 9300K…) |
| `0x60` | Input source |
| `0x62` | Audio speaker volume |
| `0xD6` | Power mode |

Crucially, each VCP code has a **type**:

- **Continuous (C):** a number on a range. Brightness `0x10` is C — pick any value between 0 and a maximum the monitor reports (usually 100). Like a slider.
- **Non-Continuous (NC):** pick from a fixed list. Input source `0x60` is NC — only specific values like `0x11 = HDMI-1`, `0x12 = HDMI-2`, `0x0F = DisplayPort-1` mean anything. Like a dropdown.

This distinction determines whether a UI should render the control as a slider or as a dropdown. Hold onto it — it matters later.

### 4. The capability string

When the computer first talks to a monitor over DDC/CI, it asks: **"which VCP codes do you support?"**

The monitor replies with a text blob called the **capability string**. Mine looks like this (trimmed):

```
Model: 27M2N5500Q
MCCS version: 2.2
VCP Features:
   Feature: 10 (Brightness)
   Feature: 12 (Contrast)
   Feature: 14 (Select color preset)
      Values: 02 04 05 06 08 0B
   Feature: 60 (Input Source)
      Values: 11 12 0F
   ...
```

Read that as: "I support brightness (continuous, no value list needed), contrast (continuous), color preset (these specific options), input source (these specific options)…"

Continuous features have no `Values:` line. Non-continuous features have a `Values:` line listing the allowed discrete values. The presence or absence of that sub-block is how a parser decides which type each feature is.

### 5. The two tools in this story

- **`ddcutil`** — the command-line client. Opens `/dev/i2c-N` (the kernel's interface to the tiny serial bus inside your video cable) and speaks DDC/CI directly. Lets you do `ddcutil --display 1 setvcp 10 50`.
- **`vdu_controls`** — a Qt tray GUI built on top of `ddcutil`. It calls `ddcutil capabilities` once per monitor at startup, parses the capability string, and renders sliders or dropdowns based on what each feature's type turns out to be. When you drag a slider, it shells out to `ddcutil setvcp` to push the new value.

## So where was the bug?

I ran `ddcutil capabilities` on the Philips and the output was 217 lines long. Most of it was unremarkable. But:

```
Line  18:   Feature: 10 (Brightness)
Line  19:   Feature: 12 (Contrast)
...
Line 178:   Feature: E2 (Manufacturer specific feature)
Line 179:   Feature: A0 (6 axis hue control: Magenta)
Line 180:   Feature: 10 (Brightness)
Line 181:      Values: 00 01 02 03 04 (interpretation unavailable)
Line 182:   Feature: E2 (Manufacturer specific feature)
```

`Feature: 10 (Brightness)` appears **twice**. The first time, correctly, with no `Values:` block — meaning standard continuous brightness, 0..100. The second time, 160 lines later, deep inside what looks like a manufacturer-specific section (between `Feature: A0` and another `Feature: E2`), it shows up again *with* a `Values:` line full of garbage: `00 01 02 03 04`. Those aren't real values for anything — they're noise from a section of the firmware that should have stayed private.

That's bug #1: the firmware is leaking manufacturer-internal data into the standardized VCP section of the capability string.

But buggy firmware on its own doesn't break a GUI. The next question was: how did `vdu_controls` react to this?

## Reading the parser

`vdu_controls`' capability parser lives in `_parse_capabilities`. Stripped down, it looks like this:

```python
feature_map = {}
for feature_text in capabilities_text.split(' Feature: '):
    if feature_match := _FEATURE_PATTERN.match(feature_text):
        vcp_code = feature_match.group(1)
        # ... figure out vcp_type and values ...
        feature_map[vcp_code] = VcpCapability(vcp_code, ...)
return feature_map
```

Two things to notice:

1. `feature_map` is a dict keyed by VCP code. If the same code is parsed twice, **the second assignment silently overwrites the first.**
2. The type-classification logic (Continuous vs Non-Continuous) is based on whether a `Values:` block was found *for that occurrence*.

So when the Philips' cap string was fed in, here's what happened:

- First pass through `Feature: 10`: no `Values:` block → classified as Continuous → stored as "brightness, 0..(max from getvcp)" → good.
- Second pass through `Feature: 10`: has a `Values:` block → classified as Non-Continuous → stored as "brightness, discrete options 00/01/02/03/04" → **overwrites the first entry.**

By the time the GUI built its widget, the brightness feature in `feature_map` was the corrupted second copy.

## The second bug, hiding in plain sight

That alone would have rendered brightness as a discrete dropdown (with weird options 00–04). But I was seeing a *slider* — just stuck at 0..1. Why a slider at all if it was classified as Non-Continuous?

Because there was a second, completely separate bug.

`vdu_controls` has a special case for monitors that report a *restricted* continuous range. Some panels physically can't go below 20% brightness without flickering, and they signal this by reporting their `Values:` like this:

```
Feature: 10 (Brightness)
   Values: 20..90
```

That's a range, not a list. The parser tries to match it with a regex:

```python
_RANGE_PATTERN = re.compile(r'Values:\s+([0-9]+)..([0-9]+)')
```

If you don't see the bug, look harder. The `..` in the middle of the pattern was meant to be two literal dots. But in regex syntax, `.` is a metacharacter meaning *any character whatsoever*. So `..` actually matches **any two characters**, not two dots.

When that regex was applied to the Philips' garbage `Values: 00 01 02 03 04 (interpretation unavailable)`, it matched:

- `00` → first capture group
- ` 0` (space + the next `0`, both matched by the unescaped `..`)
- `1` → second capture group

The parser then thought: "ah, this is a restricted-range continuous feature, from 0 to 1." That's where the 0..1 slider came from. The monitor was reporting `Values: 00 01 02 03 04`, and a regex bug turned that into "range 0..1".

So the full causal chain is:

1. The Philips firmware double-lists `Feature: 10` and dumps garbage values on the second copy.
2. A regex bug interprets that garbage as a *restricted range* of 0..1.
3. The dict-overwrite means the corrupted range definition wins over the correct one.
4. The widget renders a 0..1 slider.

Three layers of bug stacked on top of each other to produce one terrible UX.

## The fix

The PR I sent adds two defensive guards in `_parse_capabilities`:

**Guard A — trust the standard for known-continuous codes.**

`vdu_controls` already has an internal table that maps VCP codes to their MCCS-defined types. It knows `0x10` is brightness and that brightness is Continuous. So: if the cap string shows up with a stray `Values:` block *for a code we already know is continuous*, ignore the values list, trust the standard. Don't let firmware noise reclassify brightness as a dropdown.

**Guard B — keep the first occurrence of any duplicate Feature line.**

If the same `Feature: XX` appears twice, keep the first parse and log a warning instead of silently overwriting. For known-supported codes (the user-visible ones), log a `WARNING`. For unknown manufacturer codes, log an `INFO` so the noise stays out of the warning stream.

The two guards are complementary: A handles the case where there's only one occurrence but it has bad values; B handles the case where there are duplicates regardless of values.

Both together, total diff: 21 insertions, 1 deletion. About half of those lines are comments explaining *why*, because the next person to look at this code in five years deserves to know what the Philips firmware is doing.

## What the maintainer caught

When I submitted the PR, the maintainer (Michael Hamilton) reviewed it within hours. While reading my test fixture's log output, he spotted *another* bug — the `_RANGE_PATTERN` regex from above. He fixed it independently in a follow-up commit:

```diff
- _RANGE_PATTERN = re.compile(r'Values:\s+([0-9]+)..([0-9]+)')
+ _RANGE_PATTERN = re.compile(r'Values:\s+([0-9]+)[.][.]([0-9]+)')
```

`[.][.]` is a regex idiom for "literal dot followed by literal dot" — a character class containing only one character (the dot) is the same as escaping the dot. Now the pattern only matches actual range syntax (`20..90`) and leaves discrete values alone.

His fix is a one-character change in spirit. Mine is structurally larger. The two are orthogonal — neither is sufficient on its own to handle every variant of this class of firmware quirk, but together they cover the space.

Open source at its best, honestly: a contributor's test fixture surfaces an unrelated latent bug, and the maintainer catches it in review.

## What I took away

A few things stuck with me after this.

**Reading code you didn't write is the most underrated programming skill.** This whole patch is ~10 lines of actual logic. The hours went into reading `vdu_controls`' 12,000 lines of Python until I understood the dataflow well enough to know *where* the bug had to live.

**Always check the boundary between the working layer and the broken one.** The fact that `ddcutil getvcp 10` returned the right answer while the GUI didn't was the most important diagnostic in the whole session. It collapsed the search space from "the entire stack from monitor to pixels" to "Python code I can grep".

**Firmware lies.** This isn't a `vdu_controls` bug at root — it's a `vdu_controls` *vulnerability* to a Philips firmware bug. Defensive parsing isn't optional when you're reading data you didn't generate. Half the diff is comments because the right comment in the right place is the difference between "this code is weirdly defensive" and "this code is defensive *for a reason and here is the reason*".

**Real OSS maintainers are gracious.** Michael's review was thoughtful, asked good questions, considered alternatives out loud, credited the contributor, and merged. That's a model worth copying when I'm ever on the other side of a PR.

## Links

- PR: <https://github.com/digitaltrails/vdu_controls/pull/128>
- Bug report: <https://github.com/digitaltrails/vdu_controls/issues/127>
- Maintainer's follow-up regex fix: [`6d72a377`](https://github.com/digitaltrails/vdu_controls/commit/6d72a377)
- `vdu_controls`: <https://github.com/digitaltrails/vdu_controls>
- `ddcutil`: <https://www.ddcutil.com/>
- VESA MCCS 2.2 spec (paywalled, but described in the ddcutil docs)
