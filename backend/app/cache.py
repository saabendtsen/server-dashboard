"""In-memory cache for collector results."""

import logging
from datetime import datetime, timezone
from typing import Any

from app.collectors import system as system_collector
from app.collectors import docker_collector
from app.collectors import scheduler_collector
from app.collectors import github_collector

logger = logging.getLogger(__name__)

_cache: dict[str, Any] = {}
_last_updated: str | None = None


def get_cached() -> dict[str, Any] | None:
    """Return cached data with last_updated timestamp, or None if empty."""
    if not _cache:
        return None
    return {**_cache, "last_updated": _last_updated}


def update_cache(data: dict[str, Any]) -> None:
    """Store collector results and update timestamp."""
    global _cache, _last_updated
    _cache = {k: v for k, v in data.items() if k != "last_updated"}
    _last_updated = datetime.now(timezone.utc).isoformat()


async def _safe_collect(name: str, collector_fn, cache_key: str) -> Any:
    """Run a collector with error isolation.

    If the collector fails, return last known cached data (if any) with an error flag.
    If no cached data exists, return a dict with just the error.
    """
    try:
        return await collector_fn()
    except Exception as e:
        logger.error("Collector %s failed: %s", name, e)
        last_known = _cache.get(cache_key)
        if last_known is not None and isinstance(last_known, dict):
            return {**last_known, "error": str(e)}
        return {"error": str(e)}


async def run_all_collectors() -> dict[str, Any]:
    """Run all collectors with error isolation, update cache, and return the result."""
    system_data = await _safe_collect("system", system_collector.collect, "system")
    services_data = await _safe_collect("docker", docker_collector.collect, "services")
    scheduler_data = await _safe_collect("scheduler", scheduler_collector.collect, "scheduler")
    github_data = await _safe_collect("github", github_collector.collect, "github_actions")

    data = {
        "system": system_data,
        "services": services_data,
        "scheduler": scheduler_data,
        "github_actions": github_data,
    }
    update_cache(data)
    return get_cached()
