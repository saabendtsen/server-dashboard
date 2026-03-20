"""Tests for collector error isolation."""

from unittest.mock import AsyncMock, patch

import pytest

from app.cache import run_all_collectors, get_cached, update_cache


FAKE_SYSTEM = {
    "disks": [],
    "cpu_percent": 5.0,
    "temperature": None,
    "load_average": [0.1, 0.1, 0.1],
    "memory": {"total_bytes": 16_000_000_000, "used_bytes": 4_000_000_000, "percent": 25.0},
    "uptime_seconds": 3600,
}
FAKE_SERVICES = [{"name": "caddy", "status": "running", "image": "caddy:2", "started_at": "2026-03-19T10:00:00Z", "healthcheck": None}]
FAKE_SCHEDULER = {"health": "healthy", "runs": []}
FAKE_GITHUB = []


@pytest.fixture(autouse=True)
def reset_cache():
    import app.cache as cache_mod
    cache_mod._cache = {}
    cache_mod._last_updated = None
    yield
    cache_mod._cache = {}
    cache_mod._last_updated = None


@pytest.mark.asyncio
async def test_system_collector_failure_does_not_block_others():
    """If system collector fails, others still run."""
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("disk read error")),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        result = await run_all_collectors()

    assert result["services"] == FAKE_SERVICES
    assert result["scheduler"] == FAKE_SCHEDULER
    assert result["github_actions"] == FAKE_GITHUB
    # system should have error flag
    assert "error" in result["system"]
    assert "disk read error" in result["system"]["error"]


@pytest.mark.asyncio
async def test_docker_collector_failure_does_not_block_others():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("docker not running")),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        result = await run_all_collectors()

    assert result["system"] == FAKE_SYSTEM
    assert "error" in result["services"]
    assert "docker not running" in result["services"]["error"]


@pytest.mark.asyncio
async def test_failed_collector_returns_last_known_data():
    """If a collector fails and we have prior cached data, return last known + error flag."""
    # First, populate cache with good data
    update_cache({
        "system": FAKE_SYSTEM,
        "services": FAKE_SERVICES,
        "scheduler": FAKE_SCHEDULER,
        "github_actions": FAKE_GITHUB,
    })

    # Now system collector fails
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("oops")),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        result = await run_all_collectors()

    # Should have last known system data + error flag
    assert result["system"]["error"] == "oops"
    assert result["system"]["cpu_percent"] == 5.0  # last known data preserved


@pytest.mark.asyncio
async def test_multiple_collectors_can_fail_simultaneously():
    """Multiple collectors failing simultaneously still returns partial data."""
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("sys fail")),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("docker fail")),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        result = await run_all_collectors()

    assert "error" in result["system"]
    assert "error" in result["services"]
    assert result["scheduler"] == FAKE_SCHEDULER
    assert result["github_actions"] == FAKE_GITHUB
