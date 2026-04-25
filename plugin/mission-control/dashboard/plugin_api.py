from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from fastapi import APIRouter

router = APIRouter()

PLUGIN_NAME = "mission-control"

try:
    from hermes_cli.config import load_config  # type: ignore
except Exception:  # pragma: no cover - runtime fallback
    load_config = None  # type: ignore

try:
    from hermes_state import SessionDB  # type: ignore
except Exception:  # pragma: no cover - runtime fallback
    SessionDB = None  # type: ignore


SENSITIVE_MARKERS = (
    "api_key",
    "access_token",
    "refresh_token",
    "auth",
    "authorization",
    "bearer",
    "client_secret",
    "password",
    "passwd",
    "private_key",
    "secret",
    "session_token",
    "token",
)

SAFE_PREVIEW_KEYS = {
    "backend",
    "enabled",
    "id",
    "label",
    "layout",
    "layoutvariant",
    "mode",
    "name",
    "path",
    "provider",
    "theme",
    "type",
    "version",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_sensitive_key(key: Any) -> bool:
    lowered = str(key).lower()
    if lowered in {"key"}:
        return True
    if lowered.endswith("_key") or lowered.endswith("_token"):
        return True
    return any(marker in lowered for marker in SENSITIVE_MARKERS)


def close_db(db: Any) -> None:
    try:
        close = getattr(db, "close", None)
        if callable(close):
            close()
    except Exception:
        return


def to_mapping(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    for attr in ("model_dump", "dict"):
        method = getattr(value, attr, None)
        if callable(method):
            try:
                candidate = method()
                if isinstance(candidate, dict):
                    return candidate
            except Exception:
                pass
    if hasattr(value, "__dict__"):
        try:
            data = dict(vars(value))
            return {k: v for k, v in data.items() if not str(k).startswith("_")}
        except Exception:
            return {}
    return {}


def preview_value(value: Any, depth: int = 0) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if depth >= 3:
        return None

    if isinstance(value, (list, tuple)):
        items = []
        for item in list(value)[:5]:
            preview = preview_value(item, depth + 1)
            if preview is not None:
                items.append(preview)
        return items

    data = to_mapping(value)
    if not data:
        return None

    preview: Dict[str, Any] = {}
    for key, item in data.items():
        key_str = str(key)
        key_lower = key_str.lower()
        if is_sensitive_key(key_lower):
            preview[key_str] = "[redacted]"
            continue
        if key_lower in SAFE_PREVIEW_KEYS:
            item_preview = preview_value(item, depth + 1)
            if item_preview is not None:
                preview[key_str] = item_preview

    return preview or None


def find_first(value: Any, candidates: Iterable[str], depth: int = 0) -> Any:
    if value is None or depth > 4:
        return None

    candidate_set = {str(candidate).lower() for candidate in candidates}

    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if key_lower in candidate_set:
                return item
        for item in value.values():
            result = find_first(item, candidate_set, depth + 1)
            if result is not None:
                return result
        return None

    data = to_mapping(value)
    if data:
        return find_first(data, candidate_set, depth)

    return None


def summarize_config(config: Any) -> Dict[str, Any]:
    if config is None:
        return {}

    summary: Dict[str, Any] = {}
    mapping = to_mapping(config)
    if not mapping:
        mapping = {"config": config}

    sections = {
        "model": ("model", "model_name", "model_config"),
        "provider": ("provider", "model_provider", "llm_provider"),
        "dashboard": ("dashboard",),
        "runtime": ("terminal", "gateway", "display", "runtime"),
        "memory": ("memory",),
        "skills": ("skills",),
        "voice": ("voice",),
    }

    for key, candidates in sections.items():
        found = find_first(mapping, candidates)
        preview = preview_value(found)
        if preview is not None:
            summary[key] = preview

    return summary


def safe_session_count() -> Optional[int]:
    if SessionDB is None:
        return None

    db = None
    try:
        db = SessionDB()
        sessions = db.list_sessions(limit=9999)
        if sessions is None:
            return None
        try:
            return len(sessions)
        except Exception:
            return len(list(sessions))
    except Exception:
        return None
    finally:
        if db is not None:
            close_db(db)


def build_checklist(session_count: Optional[int], config_available: bool) -> list[Dict[str, Any]]:
    return [
        {
            "label": "Plugin routes mounted",
            "ok": True,
            "detail": "Mission Control backend router is active.",
        },
        {
            "label": "Session database reachable",
            "ok": session_count is not None,
            "detail": (
                "Session count detected: {0}".format(session_count)
                if session_count is not None
                else "Hermes state DB import or query was not available."
            ),
        },
        {
            "label": "Config loader available",
            "ok": config_available,
            "detail": (
                "Hermes config snapshot could be read."
                if config_available
                else "Load fallback: safe summary only."
            ),
        },
        {
            "label": "Secrets redacted",
            "ok": True,
            "detail": "Sensitive keys are filtered from any returned config data.",
        },
    ]


def build_health_score(session_count: Optional[int], config_available: bool) -> int:
    score = 100
    if session_count is None:
        score -= 28
    elif session_count == 0:
        score -= 12
    elif session_count > 8:
        score -= 6

    if not config_available:
        score -= 18

    return max(0, min(100, score))


def build_signals(session_count: Optional[int], config_available: bool, health_score: int) -> list[Dict[str, Any]]:
    return [
        {
            "label": "Sessions",
            "ok": session_count is not None,
            "value": session_count,
            "detail": (
                f"{session_count} sessions visible"
                if session_count is not None
                else "Session DB import or query unavailable."
            ),
        },
        {
            "label": "Config",
            "ok": config_available,
            "value": "available" if config_available else "fallback",
            "detail": (
                "Runtime config summary can be loaded safely."
                if config_available
                else "Using fallback config snapshot."
            ),
        },
        {
            "label": "Health",
            "ok": health_score >= 75,
            "value": health_score,
            "detail": "Overall Mission Control health score.",
        },
    ]


@router.get("/summary")
async def summary() -> Dict[str, Any]:
    config_available = False
    if load_config is not None:
        try:
            config_available = load_config() is not None
        except Exception:
            config_available = False

    session_count = safe_session_count()
    checklist = build_checklist(session_count, config_available)
    health_score = build_health_score(session_count, config_available)
    status = "operational" if config_available or session_count is not None else "fallback"

    return {
        "plugin_name": PLUGIN_NAME,
        "status": status,
        "timestamp": now_iso(),
        "session_count": session_count,
        "health_score": health_score,
        "signals": build_signals(session_count, config_available, health_score),
        "checklist": checklist,
    }


@router.get("/config-snapshot")
async def config_snapshot() -> Dict[str, Any]:
    if load_config is None:
        return {
            "plugin_name": PLUGIN_NAME,
            "status": "fallback",
            "timestamp": now_iso(),
            "available": False,
            "summary": {},
            "redactions": {
                "applied": True,
                "note": "Hermes config loader was not available in this environment.",
            },
        }

    try:
        config = load_config()
    except Exception:
        return {
            "plugin_name": PLUGIN_NAME,
            "status": "fallback",
            "timestamp": now_iso(),
            "available": False,
            "summary": {},
            "redactions": {
                "applied": True,
                "note": "Config loader raised an exception.",
            },
        }

    summary = summarize_config(config)
    return {
        "plugin_name": PLUGIN_NAME,
        "status": "operational",
        "timestamp": now_iso(),
        "available": True,
        "summary": summary,
        "redactions": {
            "applied": True,
            "policy": "Sensitive keys are omitted or replaced with [redacted].",
        },
    }
