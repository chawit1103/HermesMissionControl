# Hermes Mission Control

Hermes Mission Control is a cockpit-style Hermes Dashboard plugin and matching theme for live agent operations.

It turns Hermes into a polished command center with live status, recent sessions, safe config visibility, plugin health controls, and operator notes.

## Preview

![Mission Control tab](screenshots/mission-control-tab.jpg)

![Session detail drawer](screenshots/mission-control-session-detail.jpg)

![Config snapshot](screenshots/mission-control-config-snapshot.jpg)

![Activity timeline](screenshots/mission-control-activity-timeline.jpg)

## Quick Start

Install the plugin and theme:

```bash
mkdir -p ~/.hermes/plugins/
cp -R plugin/mission-control ~/.hermes/plugins/

mkdir -p ~/.hermes/dashboard-themes/
cp theme/mission-control.yaml ~/.hermes/dashboard-themes/

hermes dashboard
```

Then open `Mission Control`. If it does not appear immediately, rescan plugins:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

## What It Does

- A dedicated `Mission Control` tab in Hermes Dashboard
- Sidebar telemetry with system status, session count, refresh time, and signal bars
- Recent sessions from `SDK.api.getSessions(10)`
- Live agent status from `SDK.api.getStatus()`
- Session detail drawer for inspecting one session at a time
- Health radar for a quick system readout
- Config diff view against the previous safe snapshot
- Activity timeline for refreshes, rescans, and operator actions
- LocalStorage-backed operator notes and checklist
- Safe config snapshot handling with redaction
- A rescan button that hits `/api/dashboard/plugins/rescan`
- A premium dark theme with scanlines, glow, and notched panels

## Installation Notes

- Plugin structure: `plugin/mission-control/dashboard/manifest.json`, `dist/index.js`, `dist/style.css`, `plugin_api.py`
- Theme file: `theme/mission-control.yaml`
- UI runtime: plain JavaScript IIFE, no JSX, no bundler, no React bundle
- SDK usage: `window.__HERMES_PLUGIN_SDK__`, `SDK.React`, `SDK.components`, `SDK.api`, `SDK.fetchJSON`
- Custom theme previews in the picker can show a dashed placeholder; the theme still applies normally

## Troubleshooting

- If the tab is missing, confirm the path is `~/.hermes/plugins/mission-control/dashboard/`
- If the theme is missing, confirm the path is `~/.hermes/dashboard-themes/mission-control.yaml`
- If you changed backend code, restart `hermes dashboard`
- If Hermes has no sessions yet, Mission Control will show an empty state instead of failing
- If Hermes internals are unavailable, the plugin falls back safely rather than crashing

## Screenshot Guidance

- Capture the `Mission Control` tab with the cockpit theme active
- Show the sidebar telemetry rail, session list, and notes/checklist panel
- Show the session detail drawer, health radar, config diff, and activity timeline if possible
- Include one shot of the refresh action and one of the plugin rescan action
- If possible, show the safe config snapshot panel to highlight redaction and reliability

## Submission Blurb

Hermes Mission Control turns Hermes Dashboard into an operator-grade cockpit. It combines a premium theme, live agent and session telemetry, secure config visibility, plugin health controls, and a practical notes/checklist surface into one polished drop-in experience.