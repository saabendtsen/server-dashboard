"""Tests for the cache module."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.cache import get_cached, update_cache, run_all_collectors


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset cache state before each test."""
    import app.cache as cache_mod
    cache_mod._cache = {}
    cache_mod._last_updated = None
    yield
    cache_mod._cache = {}
    cache_mod._last_updated = None


FAKE_SYSTEM = {
    "disks": [{"mount": "/", "total_bytes": 120_000_000_000, "used_bytes": 60_000_000_000, "percent": 50.0}],
    "cpu_percent": 10.0,
    "temperature": 42.0,
    "load_average": [0.5, 0.3, 0.2],
    "memory": {"total_bytes": 16_000_000_000, "used_bytes": 8_000_000_000, "percent": 50.0},
    "uptime_seconds": 86400,
}
FAKE_SERVICES = [{"name": "caddy", "status": "running", "image": "caddy:2", "started_at": "2026-03-19T10:00:00Z", "healthcheck": None}]
FAKE_SCHEDULER = {"health": "healthy", "runs": []}
FAKE_GITHUB = [{"repo": "org/app", "workflow_name": "CI", "status": "completed", "conclusion": "success", "created_at": "2026-03-20T10:00:00Z"}]


def test_get_cached_returns_none_when_empty():
    result = get_cached()
    assert result is None


def test_update_cache_stores_data_and_timestamp():
    data = {
        "system": FAKE_SYSTEM,
        "services": FAKE_SERVICES,
        "scheduler": FAKE_SCHEDULER,
        "github_actions": FAKE_GITHUB,
    }
    update_cache(data)
    result = get_cached()
    assert result is not None
    assert result["system"] == FAKE_SYSTEM
    assert result["services"] == FAKE_SERVICES
    assert "last_updated" in result
    # Verify last_updated is a valid ISO timestamp
    datetime.fromisoformat(result["last_updated"])


@pytest.mark.asyncio
async def test_run_all_collectors_returns_data():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        result = await run_all_collectors()

    assert result["system"] == FAKE_SYSTEM
    assert result["services"] == FAKE_SERVICES
    assert result["scheduler"] == FAKE_SCHEDULER
    assert result["github_actions"] == FAKE_GITHUB
    assert "last_updated" in result


@pytest.mark.asyncio
async def test_run_all_collectors_updates_cache():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        await run_all_collectors()

    cached = get_cached()
    assert cached is not None
    assert cached["system"] == FAKE_SYSTEM
