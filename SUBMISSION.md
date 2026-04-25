# Hermes Mission Control

## Title

Hermes Mission Control

## Description

A cockpit-style operations dashboard for monitoring Hermes agent status, sessions, plugin health, and runtime configuration.

## Value Proposition

Hermes Mission Control makes Hermes feel like a serious control surface instead of a generic admin page.

It helps operators answer the questions that matter fastest:

- Is Hermes healthy right now?
- What are the last sessions doing?
- What does the runtime config look like without leaking secrets?
- Did my plugin changes load?
- What should I note before the next handoff?

## Why It Wins

- It is visually distinctive: deep navy panels, cyan telemetry, amber warnings, scanlines, and notched cockpit chrome
- It is practical: the tab shows live status, recent sessions, plugin rescan, config snapshot, and operator notes
- It is resilient: missing SDK methods, empty sessions, backend failures, and unsupported internals all fall back safely
- It is easy to judge: install it in a couple of commands, open one tab, and the value is immediately obvious
- It stays true to the platform: plain JavaScript IIFE, Hermes SDK only, no JSX, no build pipeline, no bundled React

## Install Steps

1. Copy the plugin folder:

```bash
mkdir -p ~/.hermes/plugins/
cp -R plugin/mission-control ~/.hermes/plugins/
```

2. Copy the theme file:

```bash
mkdir -p ~/.hermes/dashboard-themes/
cp theme/mission-control.yaml ~/.hermes/dashboard-themes/
```

3. Launch Hermes Dashboard:

```bash
hermes dashboard
```

4. If the tab does not appear instantly, rescan plugins:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

## Suggested Screenshots

- Full `Mission Control` tab with the cockpit theme active
- Sidebar slot showing system status, session count, and live telemetry bars
- Recent sessions panel with multiple sessions visible
- Operator notes and checklist in use
- Safe config snapshot panel showing redacted summary data
- Refresh and rescan actions visible in one frame if possible

## Suggested Demo Video Script

1. Open Hermes Dashboard and switch to `Mission Control`
2. Pause on the hero header and point out the cockpit styling
3. Show live status, recent sessions, and the plugin backend summary
4. Click `Refresh` and explain that the tab pulls fresh status, sessions, and config data
5. Add a note and toggle a checklist item to show local persistence
6. Trigger `Rescan Plugins` and mention that it uses the dashboard rescan endpoint
7. End by highlighting that the theme and plugin ship together as a polished drop-in submission

## Final Pitch

Hermes Mission Control is the kind of submission judges remember: a complete visual reskin, a genuinely useful ops tab, safe backend diagnostics, and a clean install path that makes Hermes Dashboard feel like a premium command center.