# Hermes Mission Control - Release Note

Hermes Mission Control is a premium cockpit-style Hermes Dashboard plugin and theme built for agent operations, observability, and fast operator workflows.

## What It Includes

- A new `Mission Control` dashboard tab for live Hermes oversight
- System status, recent sessions, config snapshot, and plugin health visibility
- Operator notes and checklist saved locally in the browser
- A rescan action for refreshing installed plugins from the dashboard
- A cockpit theme with a dark navy HUD look, cyan highlights, and amber alerts

## Key Demo Points

1. Open `Mission Control` to see the cockpit-style overview.
2. Inspect recent sessions and open session details from the list.
3. Review the health radar, config diff view, and activity timeline.
4. Update operator notes or checklist items and refresh the dashboard.
5. Rescan plugins to prove the backend integration works end to end.

## Install

```bash
mkdir -p ~/.hermes/plugins/
cp -R plugin/mission-control ~/.hermes/plugins/

mkdir -p ~/.hermes/dashboard-themes/
cp theme/mission-control.yaml ~/.hermes/dashboard-themes/

hermes dashboard
```

Then rescan plugins:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

## Notes

- No build step required.
- Plain JavaScript IIFE only.
- Uses `window.__HERMES_PLUGIN_SDK__`, `SDK.React`, and `SDK.components`.
- Backend routes are safe and redact sensitive config values.

## Submission Summary

Hermes Mission Control turns the dashboard into a polished command center for agent operations, combining visual clarity, operational utility, and graceful degradation into a submission that is ready for hackathon judging.