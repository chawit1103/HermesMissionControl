# Hermes Mission Control

Hermes Mission Control is a cockpit-style Hermes Dashboard plugin plus matching theme for live agent operations.

It gives judges a polished tab, cockpit sidebar telemetry, operator notes, a safe backend config snapshot, and a no-build drop-in install.

## Fast Install

If you only do one thing, do this:

```bash
mkdir -p ~/.hermes/plugins/
cp -R plugin/mission-control ~/.hermes/plugins/

mkdir -p ~/.hermes/dashboard-themes/
cp theme/mission-control.yaml ~/.hermes/dashboard-themes/

hermes dashboard
```

Then click the `Mission Control` tab and, if the plugin does not appear immediately, run:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

## What You Get

- A dedicated `Mission Control` tab in Hermes Dashboard
- A cockpit sidebar with system status, session count, refresh time, and telemetry bars
- Recent sessions from `SDK.api.getSessions(10)`
- Live agent status from `SDK.api.getStatus()`
- Clickable session detail drawer for inspecting one session at a time
- A health score radar that rolls up Hermes health into a single cockpit signal
- Config diff view against the previous safe snapshot
- Activity timeline for refreshes, rescans, and operator actions
- Safe config snapshot handling with redaction
- LocalStorage-backed operator notes and checklist
- A rescan button that hits `/api/dashboard/plugins/rescan`
- A premium dark theme with scanlines, glow, and notched panels

## Judge Notes

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

## Screenshot and Demo Guidance

- Capture the `Mission Control` tab with the cockpit theme active
- Show the sidebar telemetry rail, session list, and notes/checklist panel
- Show the session detail drawer, health radar, config diff, and activity timeline if possible
- Include one shot of the refresh action and one of the plugin rescan action
- If possible, show the safe config snapshot panel to highlight redaction and reliability

## Submission Blurb

Hermes Mission Control turns Hermes Dashboard into an operator-grade cockpit. It combines a premium theme, live agent and session telemetry, secure config visibility, plugin health controls, and a practical notes/checklist surface into one polished drop-in experience.
