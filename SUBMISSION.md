# Hermes Mission Control

## Title

Hermes Mission Control

## Description

A cockpit-style operations dashboard for monitoring Hermes agent status, sessions, plugin health, and runtime configuration.

## Value Proposition

Hermes Mission Control makes Hermes feel like a serious control surface instead of a generic admin page. It answers the fastest operator questions in one place: health, recent sessions, safe config visibility, plugin reload state, and handoff notes.

## Why It Wins

- Visually distinctive: deep navy panels, cyan telemetry, amber warnings, scanlines, and notched cockpit chrome
- Practical: live status, recent sessions, session detail drawer, health radar, config diff, plugin rescan, and operator notes
- Flexible: includes five extra pastel-minimal themes for judges who want a lighter, more readable look
- Resilient: missing SDK methods, empty sessions, backend failures, and unsupported internals all fall back safely
- Easy to judge: install in a couple of commands, open one tab, and the value is immediately obvious
- True to the platform: plain JavaScript IIFE, Hermes SDK only, no JSX, no build pipeline, no bundled React
- Custom theme previews in the picker can show a dashed tile; the theme still applies normally

## Install Steps

1. Copy the plugin folder:

```bash
mkdir -p ~/.hermes/plugins/
cp -R plugin/mission-control ~/.hermes/plugins/
```

2. Copy the theme files:

```bash
mkdir -p ~/.hermes/dashboard-themes/
cp theme/*.yaml ~/.hermes/dashboard-themes/
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
2. Point out the cockpit styling, sidebar telemetry, and notes/checklist
3. Show live status, recent sessions, and the safe config snapshot
4. Click `Refresh` and mention it pulls fresh Hermes data
5. Add a note, toggle a checklist item, then trigger `Rescan Plugins`
6. End by highlighting that theme and plugin ship together as a polished drop-in submission

## Final Pitch

Hermes Mission Control is the kind of submission judges remember: a complete visual reskin, a genuinely useful ops tab, safe backend diagnostics, and a clean install path that makes Hermes Dashboard feel like a premium command center.