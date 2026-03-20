"""Tests for POST /api/refresh endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


FAKE_SYSTEM = {
    "disks": [],
    "cpu_percent": 15.0,
    "temperature": 40.0,
    "load_average": [0.3, 0.2, 0.1],
    "memory": {"total_bytes": 16_000_000_000, "used_bytes": 6_000_000_000, "percent": 37.5},
    "uptime_seconds": 7200,
}
FAKE_SERVICES = []
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
async def test_refresh_returns_fresh_data():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/refresh")

    assert response.status_code == 200
    data = response.json()
    assert data["system"]["cpu_percent"] == 15.0
    assert "last_updated" in data


@pytest.mark.asyncio
async def test_refresh_updates_cache():
    """After refresh, GET /api/status returns the refreshed data."""
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/refresh")
            # Now GET should return cached data without calling collectors again
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert data["system"]["cpu_percent"] == 15.0


@pytest.mark.asyncio
async def test_refresh_with_collector_failure():
    """POST /api/refresh handles collector failures gracefully."""
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, side_effect=RuntimeError("boom")),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/refresh")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data["system"]
    assert data["scheduler"] == FAKE_SCHEDULER
