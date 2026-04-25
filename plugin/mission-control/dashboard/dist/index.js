(function () {
  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !SDK.React || !window.__HERMES_PLUGINS__) {
    return;
  }

  var React = SDK.React;
  var hooks = SDK.hooks || {};
  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useMemo = hooks.useMemo;
  var useRef = hooks.useRef;

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
      return { notes: "", checklist: DEFAULT_CHECKLIST.slice() };
    }

    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { notes: "", checklist: DEFAULT_CHECKLIST.slice() };
      }
      var parsed = JSON.parse(raw);
      var checklist = hydrateChecklist(parsed && parsed.checklist);
      return {
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        checklist: checklist
      };
    } catch (err) {
      return { notes: "", checklist: DEFAULT_CHECKLIST.slice() };
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
          checklist: state.checklist
        })
      );
    } catch (err) {
      return;
    }
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
      excerpt: String(excerpt)
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

  function computeMetrics(state) {
    var sessionCount = state.sessions.length;
    var running = state.status ? state.status.running : false;
    var configHealth = state.snapshot && state.snapshot.available ? 100 : state.config ? 80 : 42;
    var activity = clamp(sessionCount * 11 + (running ? 28 : 0), 8, 100);
    var heartbeat = running ? 92 : 36;
    var load = clamp((sessionCount / 10) * 100, 10, 100);
    var config = clamp(configHealth, 10, 100);
    return [
      { label: "Agent health", value: heartbeat, tone: running ? "ok" : "warn" },
      { label: "Session load", value: load, tone: sessionCount > 8 ? "warn" : "ok" },
      { label: "Live activity", value: activity, tone: sessionCount ? "ok" : "muted" },
      { label: "Config confidence", value: config, tone: state.snapshot && state.snapshot.available ? "ok" : "warn" }
    ];
  }

  function summaryTone(value) {
    if (value >= 75) {
      return "var(--mc-success)";
    }
    if (value >= 45) {
      return "var(--mc-warning)";
    }
    return "var(--mc-danger)";
  }

  function smallBadge(text, tone) {
    return h(
      Badge,
      {
        className: joinClassNames("mc-pill", tone === "warn" ? "mc-pill--warn" : ""),
        style: tone
          ? {
              borderColor: tone === "warn" ? "rgba(255, 191, 90, 0.35)" : "rgba(127, 232, 255, 0.28)"
            }
          : null
      },
      h("span", { className: "mc-pill__dot", style: tone === "warn" ? { background: "var(--mc-warning)" } : null }),
      text
    );
  }

  function renderMeter(metric) {
    return h(
      "div",
      { className: "mc-meter", key: metric.label },
      h(
        "div",
        { className: "mc-meter__row" },
        h("span", null, metric.label),
        h("span", { style: { color: summaryTone(metric.value) } }, formatNumber(metric.value) + "%")
      ),
      h(
        "div",
        { className: "mc-meter__track" },
        h("div", {
          className: "mc-meter__fill",
          style: {
            width: clamp(metric.value, 0, 100) + "%",
            background:
              metric.tone === "warn"
                ? "linear-gradient(90deg, var(--mc-warning), #ffdc8f)"
                : metric.tone === "muted"
                ? "linear-gradient(90deg, rgba(127, 232, 255, 0.36), rgba(127, 232, 255, 0.12))"
                : "linear-gradient(90deg, var(--mc-accent), var(--mc-success))"
          }
        })
      )
    );
  }

  function statCard(title, subtitle, value, detail, meta, meters) {
    return h(
      Card,
      { className: "mc-card-shell mc-stat" },
      h(
        CardHeader,
        { className: "mc-card-shell__header" },
        h(
          "div",
          null,
          h(CardTitle, { className: "mc-card-shell__title" }, title),
          h("p", { className: "mc-card-shell__subtitle" }, subtitle)
        ),
        meta || null
      ),
      h(
        CardContent,
        { className: "mc-card-shell__content" },
        h("div", { className: "mc-stat__top" }, h("div", { className: "mc-stat__value" }, value)),
        h("div", { className: "mc-stat__detail" }, detail),
        meters && meters.length
          ? h("div", { className: "mc-meter-list" }, meters.map(renderMeter))
          : null
      )
    );
  }

  function emptyState(message) {
    return h(
      "div",
      { className: "mc-alert" },
      message
    );
  }

  function sessionCard(session) {
    return h(
      "article",
      { className: "mc-session", key: session.id },
      h(
        "div",
        { className: "mc-session__head" },
        h("div", null, h("div", { className: "mc-session__title" }, session.title), h("div", { className: "mc-session__meta" }, session.id)),
        h(Badge, { className: "mc-session__badge" }, session.status)
      ),
      h(
        "div",
        { className: "mc-session__meta" },
        h("span", null, "Model: " + session.model),
        h("span", null, "Messages: " + formatNumber(session.messages)),
        h("span", null, "Tokens: " + formatNumber(session.tokens)),
        h("span", null, relativeTime(session.timestamp))
      ),
      session.excerpt ? h("div", { className: "mc-session__excerpt" }, session.excerpt) : null
    );
  }

  function checklistItem(item, onToggle, onRemove) {
    return h(
      "div",
      { className: "mc-checklist__item", key: item.id },
      h("input", {
        type: "checkbox",
        checked: Boolean(item.done),
        onChange: function () {
          onToggle(item.id);
        }
      }),
      h(
        "div",
        { className: "mc-checklist__body" },
        h("div", { className: joinClassNames("mc-checklist__label", item.done ? "mc-checklist__label--done" : "") }, item.label)
      ),
      h(
        Button,
        {
          type: "button",
          className: "mc-checklist__remove",
          onClick: function () {
            onRemove(item.id);
          }
        },
        "Remove"
      )
    );
  }

  function renderSummaryGrid(summary) {
    var rows = flattenSummary(summary);
    if (!rows.length) {
      return emptyState("No safe config summary is available yet.");
    }

    return h(
      "div",
      { className: "mc-config__grid" },
      rows.map(function (row) {
        var isChecklist = row.key === "checklist" && Array.isArray(row.value);
        return h(
          "div",
          { className: "mc-config__item", key: row.key },
          h("div", { className: "mc-config__key" }, row.key),
          isChecklist
            ? h(
                "div",
                { className: "mc-list", style: { gap: "0.45rem" } },
                row.value.map(function (item, index) {
                  var label = item && typeof item === "object" ? item.label || ("Check " + (index + 1)) : String(item);
                  var ok = item && typeof item === "object" ? Boolean(item.ok) : Boolean(item);
                  var detail = item && typeof item === "object" ? item.detail : "";
                  return h(
                    "div",
                    {
                      className: "mc-session",
                      key: row.key + "-" + index,
                      style: { padding: "0.6rem 0.7rem" }
                    },
                    h(
                      "div",
                      { className: "mc-session__head" },
                      h("div", { className: "mc-session__title", style: { fontSize: "0.88rem" } }, label),
                      h(Badge, { className: "mc-session__badge" }, ok ? "OK" : "CHECK")
                    ),
                    detail ? h("div", { className: "mc-session__excerpt" }, detail) : null
                  );
                })
              )
            : h("div", { className: "mc-config__value" }, formatJsonValue(row.value))
        );
      })
    );
  }

  function SidebarSlot() {
    var state = useSharedState();
    var status = state.status ? normalizeStatus(state.status) : null;
    var sessionCount = state.sessions.length;
    var metrics = computeMetrics(state);

    return h(
      "div",
      { className: "mc-stack", style: { padding: "0.85rem" } },
      h(
        "div",
        { className: "mc-card-shell" },
        h(
          "div",
          { className: "mc-card-shell__header" },
          h(
            "div",
            null,
            h("div", { className: "mc-card-shell__title" }, "Mission Control"),
            h("p", { className: "mc-card-shell__subtitle" }, "Cockpit sidebar telemetry")
          ),
          smallBadge(state.loading ? "Syncing" : status && status.running ? "Online" : "Watch", state.loading ? "warn" : status && status.running ? "ok" : "warn")
        ),
        h(
          "div",
          { className: "mc-card-shell__content" },
          h("div", { className: "mc-stat__detail" }, status ? status.detail : "Waiting for the first refresh."),
          h("div", { style: { display: "grid", gap: "0.65rem", marginTop: "0.85rem" } }, [
            h("div", { key: "status", className: "mc-config__item" }, h("div", { className: "mc-config__key" }, "System status"), h("div", { className: "mc-config__value" }, status ? status.label : "unknown")),
            h("div", { key: "sessions", className: "mc-config__item" }, h("div", { className: "mc-config__key" }, "Session count"), h("div", { className: "mc-config__value" }, formatNumber(sessionCount))),
            h("div", { key: "refresh", className: "mc-config__item" }, h("div", { className: "mc-config__key" }, "Last refresh"), h("div", { className: "mc-config__value" }, formatClock(state.lastRefresh)))
          ]),
          h("div", { className: "mc-meter-list", style: { marginTop: "0.9rem" } }, metrics.slice(0, 3).map(renderMeter))
        )
      )
    );
  }

  function HeaderRightSlot() {
    return h(
      "div",
      { className: "mc-control-row", style: { alignItems: "center", paddingRight: "0.25rem" } },
      h(
        Badge,
        {
          className: "mc-pill"
        },
        h("span", { className: "mc-pill__dot" }),
        "Mission Control Online"
      )
    );
  }

  function FooterRightSlot() {
    return h(
      "div",
      { className: "mc-control-row", style: { justifyContent: "flex-end", padding: "0.25rem 0.35rem" } },
      h(
        Badge,
        {
          className: "mc-pill",
          title: "Hermes Mission Control plugin version"
        },
        "v" + VERSION
      )
    );
  }

  function MissionControlPage() {
    var state = useSharedState();
    var current = useState(readStorage());
    var workbench = current[0];
    var setWorkbench = current[1];
    var noteDraft = useState("");
    var newNote = noteDraft[0];
    var setNewNote = noteDraft[1];
    var refreshToken = useRef(0);
    var mountedRef = useRef(true);

    useEffect(function () {
      return function () {
        mountedRef.current = false;
      };
    }, []);

    function updateWorkbench(patch) {
      var next = Object.assign({}, workbench, patch);
      setWorkbench(next);
      writeStorage(next);
    }

    function toggleChecklist(id) {
      var nextChecklist = workbench.checklist.map(function (item) {
        if (item.id === id) {
          return Object.assign({}, item, { done: !item.done });
        }
        return item;
      });
      updateWorkbench({ checklist: nextChecklist });
    }

    function removeChecklistItem(id) {
      updateWorkbench({
        checklist: workbench.checklist.filter(function (item) {
          return item.id !== id;
        })
      });
    }

    function addChecklistItem() {
      var trimmed = String(newNote || "").trim();
      if (!trimmed) {
        return;
      }
      var id = "custom-" + Date.now().toString(36);
      updateWorkbench({
        checklist: workbench.checklist.concat([
          {
            id: id,
            label: trimmed,
            done: false
          }
        ])
      });
      setNewNote("");
    }

    function refreshData(reason) {
      var requestId = refreshToken.current + 1;
      refreshToken.current = requestId;
      patchSharedState({
        loading: sharedState.lastRefresh ? false : true,
        refreshing: true,
        error: "",
        rescanMessage: reason === "rescan" ? "Plugin registry refresh requested." : ""
      });

      var statusPromise = safeCall(function () {
        return callApi("getStatus");
      });
      var sessionsPromise = safeCall(function () {
        return callApi("getSessions", [10]);
      });
      var configPromise = safeCall(function () {
        return callApi("getConfig");
      });
      var summaryPromise = safeCall(function () {
        return requestJSON("/api/plugins/" + PLUGIN_NAME + "/summary");
      });
      var snapshotPromise = safeCall(function () {
        return requestJSON("/api/plugins/" + PLUGIN_NAME + "/config-snapshot");
      });

      Promise.all([statusPromise, sessionsPromise, configPromise, summaryPromise, snapshotPromise]).then(function (results) {
        if (refreshToken.current !== requestId || !mountedRef.current) {
          return;
        }

        var statusResult = results[0];
        var sessionsResult = results[1];
        var configResult = results[2];
        var summaryResult = results[3];
        var snapshotResult = results[4];
        var errors = [];

        if (!statusResult.ok) {
          errors.push("status: " + statusResult.error);
        }
        if (!sessionsResult.ok) {
          errors.push("sessions: " + sessionsResult.error);
        }
        if (!configResult.ok) {
          errors.push("config: " + configResult.error);
        }
        if (!summaryResult.ok) {
          errors.push("summary: " + summaryResult.error);
        }
        if (!snapshotResult.ok) {
          errors.push("snapshot: " + snapshotResult.error);
        }

        patchSharedState({
          loading: false,
          refreshing: false,
          error: errors.length ? errors.join(" • ") : "",
          lastRefresh: new Date().toISOString(),
          status: statusResult.ok ? statusResult.value : null,
          sessions: sessionsResult.ok ? normalizeSessions(sessionsResult.value) : [],
          config: configResult.ok ? configResult.value : null,
          summary: summaryResult.ok ? summaryResult.value : null,
          snapshot: snapshotResult.ok ? snapshotResult.value : null,
          rescanMessage: reason === "rescan" && !errors.length ? "Plugin registry refresh requested." : ""
        });
      });
    }

    useEffect(function () {
      refreshData("initial");
    }, []);

    var normalizedStatus = state.status ? normalizeStatus(state.status) : null;
    var sdkWarnings = getSdkReadiness();
    var metrics = useMemo(function () {
      return computeMetrics(state);
    }, [state.status, state.sessions.length, state.snapshot, state.config]);
    var liveSessionCount = state.sessions.length;
    var statusTone = normalizedStatus && normalizedStatus.running ? "ok" : "warn";
    var snapshotAvailable = state.snapshot && state.snapshot.available;

    return h(
      "div",
      { className: "mc-page" },
      h(
        "section",
        { className: "mc-hero" },
        h(
          "div",
          { className: "mc-hero__top" },
          h(
            "div",
            null,
            h("p", { className: "mc-hero__eyebrow" }, "Hermes Agent Operations"),
            h("h1", { className: "mc-hero__title" }, "Mission Control"),
            h(
              "p",
              { className: "mc-hero__subtitle" },
              "A premium cockpit for operators who need immediate visibility into Hermes status, session activity, plugin health, and runtime configuration."
            ),
            h(
              "div",
              { className: "mc-control-row", style: { marginTop: "0.9rem" } },
              smallBadge(state.refreshing ? "Refreshing" : normalizedStatus && normalizedStatus.running ? "System Nominal" : "Attention", statusTone),
              state.summary && state.summary.status ? smallBadge("Backend " + state.summary.status, state.summary.status === "fallback" ? "warn" : "ok") : null,
              snapshotAvailable ? smallBadge("Config snapshot ready", "ok") : smallBadge("Config fallback", "warn")
            )
          ),
          h(
            "div",
            { className: "mc-actions" },
            h(
              Button,
              {
                type: "button",
                onClick: function () {
                  refreshData("manual");
                }
              },
              state.refreshing ? "Refreshing..." : "Refresh"
            ),
            h(
              Button,
              {
                type: "button",
                onClick: function () {
                  patchSharedState({
                    rescanMessage: "Rescanning plugin registry..."
                  });
                  requestRescan("/api/dashboard/plugins/rescan")
                    .then(function () {
                      refreshData("rescan");
                    })
                    .catch(function (error) {
                      patchSharedState({
                        refreshing: false,
                        rescanMessage: "",
                        error: "Rescan failed: " + normalizeError(error)
                      });
                    });
                }
              },
              "Rescan Plugins"
            )
          )
        )
      ),
      state.error ? h("div", { className: "mc-alert" }, state.error) : null,
      state.rescanMessage ? h("div", { className: "mc-alert", style: { borderColor: "rgba(127, 232, 255, 0.18)", background: "rgba(127, 232, 255, 0.06)", color: "#daf8ff" } }, state.rescanMessage) : null,
      sdkWarnings.length ? h("div", { className: "mc-alert", style: { borderColor: "rgba(255, 191, 90, 0.24)", background: "rgba(255, 191, 90, 0.08)", color: "#ffeec6" } }, "SDK fallback mode: " + sdkWarnings.join(", ")) : null,
      h(
        "div",
        { className: "mc-grid mc-grid--metrics" },
        statCard(
          "System Status",
          "Live Hermes status and health",
          normalizedStatus ? normalizedStatus.label.toUpperCase() : state.loading ? "SYNCING" : "UNKNOWN",
          normalizedStatus ? normalizedStatus.detail : "Waiting for a status response.",
          h("div", { className: "mc-pill", style: { marginLeft: "auto" } }, normalizedStatus ? normalizedStatus.version : "n/a"),
          [
            { label: "Active sessions", value: clamp(liveSessionCount * 11, 4, 100), tone: statusTone },
            { label: "Agent reachability", value: normalizedStatus && normalizedStatus.running ? 92 : 31, tone: statusTone },
            { label: "Platform links", value: normalizedStatus ? clamp((normalizedStatus.platforms.length || 0) * 24, 8, 100) : 18, tone: statusTone }
          ]
        ),
        statCard(
          "Recent Sessions",
          "The last ten Hermes sessions",
          formatNumber(liveSessionCount),
          liveSessionCount ? "Session activity is being sampled from Hermes API responses." : "No sessions were returned yet.",
          h("div", { className: "mc-pill", style: { marginLeft: "auto" } }, "10 limit"),
          [
            { label: "Recent activity", value: clamp(liveSessionCount * 12, 8, 100), tone: liveSessionCount > 7 ? "warn" : "ok" },
            { label: "Volume", value: clamp((liveSessionCount / 10) * 100, 10, 100), tone: liveSessionCount > 7 ? "warn" : "ok" },
            { label: "Latency feel", value: normalizedStatus && normalizedStatus.running ? 88 : 44, tone: normalizedStatus && normalizedStatus.running ? "ok" : "warn" }
          ]
        ),
        statCard(
          "Config Snapshot",
          "Safe runtime configuration summary",
          snapshotAvailable ? "AVAILABLE" : "FALLBACK",
          snapshotAvailable ? "Hermes config summary is available without leaking secrets." : "Config data is unavailable, so the plugin is using fallback state.",
          h("div", { className: "mc-pill", style: { marginLeft: "auto" } }, state.config ? "getConfig" : "fallback"),
          [
            { label: "Snapshot health", value: snapshotAvailable ? 92 : 28, tone: snapshotAvailable ? "ok" : "warn" },
            { label: "Redaction", value: 100, tone: "ok" },
            { label: "Visibility", value: state.config ? 84 : 36, tone: snapshotAvailable ? "ok" : "warn" }
          ]
        ),
        statCard(
          "Plugin Backend",
          "Mission Control summary API",
          state.summary && state.summary.status ? String(state.summary.status).toUpperCase() : state.loading ? "SYNCING" : "READY",
          state.summary && state.summary.checklist ? "Backend checklist returned " + state.summary.checklist.length + " checks." : "Backend summary is waiting for a response.",
          h("div", { className: "mc-pill", style: { marginLeft: "auto" } }, "API"),
          [
            { label: "Backend health", value: state.summary && state.summary.status === "operational" ? 96 : 58, tone: state.summary && state.summary.status === "operational" ? "ok" : "warn" },
            { label: "Checklist size", value: clamp((state.summary && state.summary.checklist ? state.summary.checklist.length : 0) * 24, 10, 100), tone: "ok" },
            { label: "Refresh cadence", value: state.lastRefresh ? 88 : 26, tone: state.lastRefresh ? "ok" : "warn" }
          ]
        )
      ),
      h(
        "div",
        { className: "mc-grid mc-grid--main" },
        h(
          "div",
          { className: "mc-stack" },
          h(
            Card,
            { className: "mc-card-shell" },
            h(
              CardHeader,
              { className: "mc-card-shell__header" },
              h(
                "div",
                null,
                h(CardTitle, { className: "mc-card-shell__title" }, "Recent Sessions"),
                h("p", { className: "mc-card-shell__subtitle" }, "High-signal session feed from Hermes API")
              ),
              h("div", { className: "mc-pill" }, "last 10")
            ),
            h(
              CardContent,
              { className: "mc-card-shell__content" },
              state.sessions.length
                ? h("div", { className: "mc-list" }, state.sessions.map(sessionCard))
                : state.loading
                ? h("div", { className: "mc-list" }, [
                    h("div", { className: "mc-session mc-skeleton", style: { height: "5rem" } }, null),
                    h("div", { className: "mc-session mc-skeleton", style: { height: "5rem" } }, null)
                  ])
                : emptyState("No recent sessions were returned by the API.")
            )
          ),
          h(
            Card,
            { className: "mc-card-shell" },
            h(
              CardHeader,
              { className: "mc-card-shell__header" },
              h(
                "div",
                null,
                h(CardTitle, { className: "mc-card-shell__title" }, "Operational Notes"),
                h("p", { className: "mc-card-shell__subtitle" }, "LocalStorage-backed notes and checklist")
              ),
              h("div", { className: "mc-pill" }, "private")
            ),
            h(
              CardContent,
              { className: "mc-card-shell__content mc-operator" },
              h(
                "div",
                null,
                h(Label, { className: "mc-label", htmlFor: "mc-notes" }, "Operator notes"),
                h("textarea", {
                  id: "mc-notes",
                  className: "mc-textarea",
                  value: workbench.notes,
                  onChange: function (event) {
                    updateWorkbench({ notes: event.target.value });
                  },
                  placeholder: "Capture runbook reminders, handoff notes, or diagnostics here..."
                })
              ),
              h(
                "div",
                null,
                h(Label, { className: "mc-label", htmlFor: "mc-checklist-input" }, "Add checklist item"),
                h(
                  "div",
                  { className: "mc-control-row" },
                  h(Input, {
                    id: "mc-checklist-input",
                    className: "mc-input",
                    value: newNote,
                    onChange: function (event) {
                      setNewNote(event.target.value);
                    },
                    placeholder: "New operational check..."
                  }),
                  h(
                    Button,
                    {
                      type: "button",
                      onClick: addChecklistItem
                    },
                    "Add"
                  )
                )
              ),
              h(
                "div",
                { className: "mc-checklist" },
                workbench.checklist.map(function (item) {
                  return checklistItem(item, toggleChecklist, removeChecklistItem);
                })
              ),
              h(
                "div",
                { className: "mc-control-row" },
                h(
                  Button,
                  {
                    type: "button",
                    onClick: function () {
                      updateWorkbench({ checklist: workbench.checklist.map(function (item) { return Object.assign({}, item, { done: false }); }) });
                    }
                  },
                  "Reset checklist"
                ),
                h(
                  Button,
                  {
                    type: "button",
                    onClick: function () {
                      updateWorkbench({ notes: "" });
                    }
                  },
                  "Clear notes"
                )
              )
            )
          )
        ),
        h(
          "div",
          { className: "mc-stack" },
          h(
            Card,
            { className: "mc-card-shell" },
            h(
              CardHeader,
              { className: "mc-card-shell__header" },
              h(
                "div",
                null,
                h(CardTitle, { className: "mc-card-shell__title" }, "Telemetry & Config"),
                h("p", { className: "mc-card-shell__subtitle" }, "Status data, backend summary, and redacted config snapshot")
              ),
              h("div", { className: "mc-pill" }, "secure")
            ),
            h(
              CardContent,
              { className: "mc-card-shell__content mc-config" },
              h("div", { className: "mc-config__group" }, metrics.map(renderMeter)),
              h(Separator, { className: "mc-divider", style: { height: "1px", background: "rgba(127, 232, 255, 0.12)", margin: "0.25rem 0" } }),
              h("div", { className: "mc-config__group" }, [
                h("div", { className: "mc-card-shell__title", key: "backend-title" }, "Backend Summary"),
                state.summary ? renderSummaryGrid(state.summary) : state.loading ? h("div", { className: "mc-session mc-skeleton", style: { height: "8rem" } }, null) : emptyState("Mission Control backend summary unavailable.")
              ]),
              h(Separator, { className: "mc-divider", style: { height: "1px", background: "rgba(127, 232, 255, 0.12)", margin: "0.25rem 0" } }),
              h("div", { className: "mc-config__group" }, [
                h("div", { className: "mc-card-shell__title", key: "snapshot-title" }, "Config Snapshot"),
                state.snapshot && state.snapshot.summary ? renderSummaryGrid(state.snapshot.summary) : state.loading ? h("div", { className: "mc-session mc-skeleton", style: { height: "8rem" } }, null) : emptyState("Safe config snapshot unavailable.")
              ])
            )
          ),
          h(
            Card,
            { className: "mc-card-shell" },
            h(
              CardHeader,
              { className: "mc-card-shell__header" },
              h(
                "div",
                null,
                h(CardTitle, { className: "mc-card-shell__title" }, "Fast Diagnostics"),
                h("p", { className: "mc-card-shell__subtitle" }, "A compact readout for operators")
              ),
              h("div", { className: "mc-pill" }, "live")
            ),
            h(
              CardContent,
              { className: "mc-card-shell__content mc-config" },
              h(
                "div",
                { className: "mc-config__grid" },
                [
                  { key: "session-count", label: "Session count", value: formatNumber(liveSessionCount) },
                  { key: "status", label: "System status", value: normalizedStatus ? normalizedStatus.label : "unknown" },
                  { key: "refresh", label: "Last refresh", value: formatClock(state.lastRefresh) },
                  { key: "plugin", label: "Plugin version", value: VERSION }
                ].map(function (item) {
                  return h(
                    "div",
                    { className: "mc-config__item", key: item.key },
                    h("div", { className: "mc-config__key" }, item.label),
                    h("div", { className: "mc-config__value" }, item.value)
                  );
                })
              )
            )
          )
        )
      )
    );
  }

  window.__HERMES_PLUGINS__.register(PLUGIN_NAME, MissionControlPage);
  window.__HERMES_PLUGINS__.registerSlot(PLUGIN_NAME, "sidebar", SidebarSlot);
  window.__HERMES_PLUGINS__.registerSlot(PLUGIN_NAME, "header-right", HeaderRightSlot);
  window.__HERMES_PLUGINS__.registerSlot(PLUGIN_NAME, "footer-right", FooterRightSlot);
})();