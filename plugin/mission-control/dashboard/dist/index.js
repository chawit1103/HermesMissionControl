(function () {
  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !SDK.React || !window.__HERMES_PLUGINS__) {
    return;
  }

  var React = SDK.React;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  var components = SDK.components || {};
  var Card = components.Card || "div";
  var CardHeader = components.CardHeader || "div";
  var CardTitle = components.CardTitle || "div";
  var CardContent = components.CardContent || "div";
  var Badge = components.Badge || "span";
  var Button = components.Button || "button";
  var Input = components.Input || "input";
  var Label = components.Label || "label";
  var Separator = components.Separator || "div";

  var PLUGIN_NAME = "mission-control";
  var VERSION = "1.0.0";
  var STORAGE_KEY = "hermes.mission-control.workbench.v1";
  var DEFAULT_CHECKLIST = [
    { id: "traffic", label: "Review active sessions for anomalies", done: false },
    { id: "status", label: "Confirm Hermes status is healthy", done: true },
    { id: "config", label: "Validate runtime config snapshot", done: false },
    { id: "rescan", label: "Rescan plugin registry after updates", done: false }
  ];

  var sharedState = {
    loading: true,
    refreshing: false,
    error: "",
    lastRefresh: null,
    status: null,
    sessions: [],
    config: null,
    summary: null,
    snapshot: null,
    rescanMessage: ""
  };

  var listeners = [];

  function h(type, props) {
    var children = Array.prototype.slice.call(arguments, 2);
    return React.createElement.apply(React, [type, props].concat(children));
  }

  function joinClassNames() {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === "string" && value) {
        parts.push(value);
      }
    }
    return parts.join(" ");
  }

  function readStorage() {
    if (typeof window === "undefined" || !window.localStorage) {
      return {
        notes: "",
        checklist: cloneChecklist(DEFAULT_CHECKLIST),
        selectedSessionId: "",
        timeline: [],
        snapshotHistory: []
      };
    }

    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {
          notes: "",
          checklist: cloneChecklist(DEFAULT_CHECKLIST),
          selectedSessionId: "",
          timeline: [],
          snapshotHistory: []
        };
      }
      var parsed = JSON.parse(raw);
      var checklist = hydrateChecklist(parsed && parsed.checklist);
      var timeline = hydrateTimeline(parsed && parsed.timeline);
      var snapshotHistory = hydrateSnapshotHistory(parsed && parsed.snapshotHistory);
      return {
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        checklist: checklist,
        selectedSessionId: typeof parsed.selectedSessionId === "string" ? parsed.selectedSessionId : "",
        timeline: timeline,
        snapshotHistory: snapshotHistory
      };
    } catch (err) {
      return {
        notes: "",
        checklist: cloneChecklist(DEFAULT_CHECKLIST),
        selectedSessionId: "",
        timeline: [],
        snapshotHistory: []
      };
    }
  }

  function writeStorage(state) {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          notes: state.notes,
          checklist: state.checklist,
          selectedSessionId: state.selectedSessionId || "",
          timeline: state.timeline || [],
          snapshotHistory: state.snapshotHistory || []
        })
      );
    } catch (err) {
      return;
    }
  }

  function cloneChecklist(items) {
    return (items || []).map(function (item) {
      return {
        id: item.id,
        label: item.label,
        done: Boolean(item.done)
      };
    });
  }

  function hydrateChecklist(saved) {
    var byId = {};
    var items = Array.isArray(saved) ? saved : [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      if (item.id) {
        byId[item.id] = {
          id: String(item.id),
          label: typeof item.label === "string" ? item.label : "",
          done: Boolean(item.done)
        };
      }
    }

    var merged = DEFAULT_CHECKLIST.map(function (item) {
      var existing = byId[item.id];
      if (existing) {
        return {
          id: item.id,
          label: existing.label || item.label,
          done: Boolean(existing.done)
        };
      }
      return {
        id: item.id,
        label: item.label,
        done: item.done
      };
    });

    Object.keys(byId).forEach(function (id) {
      var found = false;
      for (var j = 0; j < DEFAULT_CHECKLIST.length; j += 1) {
        if (DEFAULT_CHECKLIST[j].id === id) {
          found = true;
          break;
        }
      }
      if (!found) {
        merged.push(byId[id]);
      }
    });

    return merged;
  }

  function hydrateTimeline(saved) {
    var items = Array.isArray(saved) ? saved : [];
    return items
      .map(function (item) {
        var entry = item && typeof item === "object" ? item : {};
        var timestamp = entry.timestamp || entry.at || entry.time || null;
        return {
          id: String(entry.id || "timeline-" + Math.random().toString(36).slice(2, 10)),
          kind: typeof entry.kind === "string" ? entry.kind : "event",
          title: typeof entry.title === "string" ? entry.title : "Activity",
          detail: typeof entry.detail === "string" ? entry.detail : "",
          tone: typeof entry.tone === "string" ? entry.tone : "muted",
          timestamp: typeof timestamp === "string" ? timestamp : nowIso()
        };
      })
      .slice(0, 16);
  }

  function hydrateSnapshotHistory(saved) {
    var items = Array.isArray(saved) ? saved : [];
    return items
      .map(function (item) {
        var entry = item && typeof item === "object" ? item : {};
        return {
          capturedAt: typeof entry.capturedAt === "string" ? entry.capturedAt : nowIso(),
          summary: entry.summary && typeof entry.summary === "object" ? entry.summary : {}
        };
      })
      .slice(0, 6);
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (item) {
        return item !== listener;
      });
    };
  }

  function emit() {
    for (var i = 0; i < listeners.length; i += 1) {
      try {
        listeners[i](sharedState);
      } catch (err) {
        continue;
      }
    }
  }

  function setSharedState(patch) {
    sharedState = Object.assign({}, sharedState, patch);
    emit();
  }

  function patchSharedState(patch) {
    setSharedState(patch);
  }

  function useSharedState() {
    var current = useState(sharedState);
    var state = current[0];
    var setState = current[1];

    useEffect(function () {
      return subscribe(setState);
    }, []);

    return state;
  }

  function requestJSON(path) {
    if (typeof SDK.fetchJSON === "function") {
      return SDK.fetchJSON(path);
    }
    return fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("Request failed with status " + response.status);
      }
      return response.json();
    });
  }

  function requestRescan(path) {
    return fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*"
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("Rescan failed with status " + response.status);
      }
      var contentType = response.headers.get("content-type") || "";
      if (contentType.indexOf("application/json") >= 0) {
        return response.json().catch(function () {
          return {};
        });
      }
      return response.text().then(function (text) {
        return text || {};
      });
    });
  }

  function callApi(methodName, args) {
    var api = SDK && SDK.api ? SDK.api : null;
    if (!api || typeof api[methodName] !== "function") {
      return Promise.reject(new Error("SDK.api." + methodName + " is unavailable"));
    }
    return Promise.resolve(api[methodName].apply(api, Array.isArray(args) ? args : []));
  }

  function safeCall(factory) {
    return Promise.resolve()
      .then(factory)
      .then(
        function (value) {
          return { ok: true, value: value };
        },
        function (error) {
          return { ok: false, error: normalizeError(error) };
        }
      );
  }

  function normalizeError(error) {
    if (!error) {
      return "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    if (error.message) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch (err) {
      return "Unknown error";
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return "0";
    }
    return value.toLocaleString();
  }

  function formatClock(isoValue) {
    if (!isoValue) {
      return "Not refreshed yet";
    }
    try {
      return new Date(isoValue).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (err) {
      return String(isoValue);
    }
  }

  function relativeTime(value) {
    if (!value) {
      return "unknown";
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    var diff = Date.now() - date.getTime();
    var seconds = Math.round(Math.abs(diff) / 1000);
    var direction = diff >= 0 ? "ago" : "from now";

    if (seconds < 45) {
      return seconds + "s " + direction;
    }
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return minutes + "m " + direction;
    }
    var hours = Math.round(minutes / 60);
    if (hours < 24) {
      return hours + "h " + direction;
    }
    var days = Math.round(hours / 24);
    return days + "d " + direction;
  }

  function firstValue(source, keys) {
    if (!source || typeof source !== "object") {
      return undefined;
    }

    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null) {
        return source[key];
      }
    }

    return undefined;
  }

  function normalizeStatus(raw) {
    var status = raw && typeof raw === "object" ? raw : {};
    var gateway = status.gateway && typeof status.gateway === "object" ? status.gateway : {};
    var version = firstValue(status, ["version", "agent_version", "app_version"]);
    var runningValue = firstValue(status, ["running", "healthy"]);
    var gatewayValue = firstValue(gateway, ["running", "healthy"]);
    var stateValue = String(firstValue(status, ["state", "status"]) || firstValue(gateway, ["status"]) || "").trim().toLowerCase();
    var running = false;
    if (typeof runningValue === "boolean") {
      running = runningValue;
    } else if (typeof gatewayValue === "boolean") {
      running = gatewayValue;
    } else if (typeof runningValue === "number") {
      running = runningValue !== 0;
    } else if (typeof gatewayValue === "number") {
      running = gatewayValue !== 0;
    } else if (typeof runningValue === "string") {
      running = ["true", "running", "online", "ok", "healthy", "active", "ready", "connected"].indexOf(runningValue.trim().toLowerCase()) >= 0;
    } else if (typeof gatewayValue === "string") {
      running = ["true", "running", "online", "ok", "healthy", "active", "ready", "connected"].indexOf(gatewayValue.trim().toLowerCase()) >= 0;
    } else {
      running = ["running", "online", "ok", "healthy", "active", "ready", "connected"].indexOf(stateValue) >= 0;
    }
    var platforms = firstValue(status, ["platforms", "connected_platforms", "connections"]) || [];
    if (!Array.isArray(platforms)) {
      platforms = [];
    }

    var activeSessions = toNumber(
      firstValue(status, ["active_sessions", "session_count", "sessions_active", "recent_sessions"]),
      0
    );

    return {
      raw: status,
      version: version || "unknown",
      running: running,
      label: running ? "online" : "degraded",
      detail:
        firstValue(status, ["message", "summary", "detail", "description"]) ||
        (running ? "Hermes dashboard and agent telemetry are connected." : "Hermes status is limited or unavailable."),
      activeSessions: activeSessions,
      platforms: platforms,
      gateway: gateway
    };
  }

  function getSdkReadiness() {
    var api = SDK && SDK.api ? SDK.api : null;
    var missing = [];
    if (!api || typeof api.getStatus !== "function") {
      missing.push("getStatus");
    }
    if (!api || typeof api.getSessions !== "function") {
      missing.push("getSessions");
    }
    if (!api || typeof api.getConfig !== "function") {
      missing.push("getConfig");
    }
    return missing;
  }

  function normalizeSession(item, index) {
    var session = item && typeof item === "object" ? item : {};
    var meta = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
    var id = firstValue(session, ["session_id", "id", "thread_id", "uuid"]) || "session-" + index;
    var title = firstValue(session, ["title", "name", "summary", "label", "topic"]) || "Session " + (index + 1);
    var model = firstValue(session, ["model", "model_name", "model_id", "llm"]) || firstValue(meta, ["model", "name"]) || "unknown model";
    var status = firstValue(session, ["status", "state", "phase"]) || "active";
    var messages = toNumber(firstValue(session, ["message_count", "messages", "turns", "message_total"]), 0);
    var tokens = toNumber(firstValue(session, ["token_usage", "tokens", "total_tokens", "usage"]), 0);
    var timestamp =
      firstValue(session, ["updated_at", "last_activity_at", "created_at", "timestamp", "started_at"]) ||
      firstValue(meta, ["updated_at", "created_at"]) ||
      null;
    var excerpt = firstValue(session, ["preview", "last_message", "excerpt", "summary_text"]) || "";

    return {
      id: String(id),
      title: String(title),
      model: String(model),
      status: String(status),
      messages: messages,
      tokens: tokens,
      timestamp: timestamp,
      excerpt: String(excerpt),
      raw: session
    };
  }

  function normalizeSessions(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === "object") {
      list = firstValue(raw, ["sessions", "items", "data", "results"]) || [];
      if (!Array.isArray(list)) {
        list = [];
      }
    }

    return list.slice(0, 10).map(function (item, index) {
      return normalizeSession(item, index);
    });
  }

  function formatJsonValue(value) {
    if (value === null || value === undefined) {
      return "n/a";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }

  function flattenSummary(summary) {
    var rows = [];
    if (!summary || typeof summary !== "object") {
      return rows;
    }

    Object.keys(summary).forEach(function (key) {
      rows.push({
        key: key,
        value: summary[key]
      });
    });

    return rows;
  }

  function flattenForDiff(value, prefix, out, depth) {
    var key = prefix || "root";
    var currentDepth = depth || 0;
    if (value === null || value === undefined) {
      out[key] = value;
      return;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      return;
    }
    if (currentDepth >= 3) {
      out[key] = formatJsonValue(value);
      return;
    }
    if (Array.isArray(value)) {
      if (!value.length) {
        out[key] = [];
        return;
      }
      if (value.every(function (item) {
        return item === null || item === undefined || typeof item === "string" || typeof item === "number" || typeof item === "boolean";
      })) {
        out[key] = value.slice();
        return;
      }
      value.slice(0, 5).forEach(function (item, index) {
        flattenForDiff(item, key + "[" + index + "]", out, currentDepth + 1);
      });
      return;
    }
    if (typeof value === "object") {
      var keys = Object.keys(value).sort();
      if (!keys.length) {
        out[key] = {};
        return;
      }
      keys.forEach(function (itemKey) {
        var nextPrefix = prefix ? prefix + "." + itemKey : itemKey;
        flattenForDiff(value[itemKey], nextPrefix, out, currentDepth + 1);
      });
      return;
    }
    out[key] = formatJsonValue(value);
  }

  function diffSnapshots(previous, current) {
    var prevFlat = {};
    var currFlat = {};
    flattenForDiff(previous || {}, "", prevFlat, 0);
    flattenForDiff(current || {}, "", currFlat, 0);

    var keys = {};
    Object.keys(prevFlat).forEach(function (key) {
      keys[key] = true;
    });
    Object.keys(currFlat).forEach(function (key) {
      keys[key] = true;
    });

    var added = [];
    var removed = [];
    var changed = [];
    Object.keys(keys)
      .sort()
      .foreach(function (key) {
        var hasPrev = Object.prototype.hasOwnProperty.call(prevFlat, key);
        var hasCurr = Object.prototype.hasOwnProperty.call(currFlat, key);
        if (!hasPrev && hasCurr) {
          added.push({ key: key, value: currFlat[key] });
          return;
        }
        if (hasPrev && !hasCurr) {
          removed.push({ key: key, value: prevFlat[key] });
          return;
        }
        if (hasPrev && hasCurr && formatJsonValue(prevFlat[key]) !== formatJsonValue(currFlat[key])) {
          changed.push({ key: key, before: prevFlat[key], after: currFlat[key] });
        }
      });

    return {
      added: added,
      removed: removed,
      changed: changed
    };
  }

  function createTimelineEntry(kind, title, detail, tone) {
    return {
      id: kind + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      kind: kind,
      title: title,
      detail: detail || "",
      ton: ton || "muted",
      timestamp: new Date().itoJ⁄Óù∆≠y