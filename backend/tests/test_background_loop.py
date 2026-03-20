"""Tests for the background refresh loop."""

import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from app.cache import get_cached


FAKE_SYSTEM = {
    "disks": [],
    "cpu_percent": 5.0,
    "temperature": None,
    "load_average": [0.1, 0.1, 0.1],
    "memory": {"total_bytes": 16_000_000_000, "used_bytes": 4_000_000_000, "percent": 25.0},
    "uptime_seconds": 3600,
}


@pytest.fixture(autouse=True)
def reset_cache():
    import app.cache as cache_mod
    cache_mod._cache = {}
    cache_mod._last_updated = None
    yield
    cache_mod._cache = {}
    cache_mod._last_updated = None


@pytest.mark.asyncio
async def test_background_loop_calls_collectors():
    """The background loop should call run_all_collectors periodically."""
    from app.main import _background_refresh_loop

    call_count = 0

    async def mock_run_all():
        nonlocal call_count
        call_count += 1
        # After first call, raise to break the loop
        if call_count >= 2:
            raise asyncio.CancelledError()
        return {}

    with patch("app.main.run_all_collectors", side_effect=mock_run_all):
        with patch("app.main.REFRESH_INTERVAL", 0.01):  # 10ms for testing
            with pytest.raises(asyncio.CancelledError):
                await _background_refresh_loop()

    assert call_count >= 2


@pytest.mark.asyncio
async def test_background_loop_continues_on_error():
    """The background loop should continue even if run_all_collectors raises."""
    from app.main import _background_refresh_loop

    call_count = 0

    async def mock_run_all():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("transient error")
        if call_count >= 3:
            raise asyncio.CancelledError()
        return {}

    with patch("app.main.run_all_collectors", side_effect=mock_run_all):
        with patch("app.main.REFRESH_INTERVAL", 0.01):
            with pytest.raises(asyncio.CancelledError):
                await _background_refresh_loop()

    assert call_count >= 3  # Continued past the error


@pytest.mark.asyncio
async def test_startup_triggers_initial_collection():
    """On app startup, an initial collection should run and populate the cache."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=[]),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value={"health": "unknown", "runs": []}),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=[]),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # The lifespan startup should have populated cache
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert data["system"]["cpu_percent"] == 5.0
