from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


FAKE_SYSTEM = {
    "disks": [{"mount": "/", "total_bytes": 120_000_000_000, "used_bytes": 60_000_000_000, "percent": 50.0}],
    "cpu_percent": 10.0,
    "temperature": 42.0,
    "load_average": [0.5, 0.3, 0.2],
    "memory": {"total_bytes": 16_000_000_000, "used_bytes": 8_000_000_000, "percent": 50.0},
    "uptime_seconds": 86400,
}
FAKE_SERVICES = [
    {
        "name": "caddy",
        "status": "running",
        "image": "caddy:2",
        "started_at": "2026-03-19T10:00:00Z",
        "healthcheck": {"status_code": 200, "latency_ms": 30.0, "error": None},
    },
    {
        "name": "ghost",
        "status": "running",
        "image": "ghost:5",
        "started_at": "2026-03-18T08:00:00Z",
        "healthcheck": None,
    },
]
FAKE_SCHEDULER = {
    "health": "healthy",
    "runs": [
        {
            "id": 1,
            "repo": "owner/repo",
            "issue_number": 10,
            "session_type": "planning",
            "started_at": "2026-03-20T10:00:00Z",
            "ended_at": "2026-03-20T10:30:00Z",
            "outcome": "completed",
            "pr_number": None,
            "notes": None,
        }
    ],
}
FAKE_GITHUB = [
    {
        "repo": "org/my-app",
        "workflow_name": "CI",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2026-03-20T10:00:00Z",
    },
]


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset cache state before each test."""
    import app.cache as cache_mod
    cache_mod._cache = {}
    cache_mod._last_updated = None
    yield
    cache_mod._cache = {}
    cache_mod._last_updated = None


@pytest.mark.asyncio
async def test_health_returns_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_status_returns_system_metrics():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=[]),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value={"health": "unknown", "runs": []}),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=[]),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "system" in data
    assert data["system"]["cpu_percent"] == 10.0
    assert "last_updated" in data


@pytest.mark.asyncio
async def test_status_returns_services():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=FAKE_SERVICES),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value={"health": "unknown", "runs": []}),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=[]),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "services" in data
    assert len(data["services"]) == 2
    assert data["services"][0]["name"] == "caddy"
    assert data["services"][0]["healthcheck"]["status_code"] == 200
    assert data["services"][1]["healthcheck"] is None


@pytest.mark.asyncio
async def test_status_returns_scheduler():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=[]),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value=FAKE_SCHEDULER),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=[]),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "scheduler" in data
    assert data["scheduler"]["health"] == "healthy"
    assert len(data["scheduler"]["runs"]) == 1
    assert data["scheduler"]["runs"][0]["repo"] == "owner/repo"


@pytest.mark.asyncio
async def test_status_returns_github_actions():
    with (
        patch("app.cache.system_collector.collect", new_callable=AsyncMock, return_value=FAKE_SYSTEM),
        patch("app.cache.docker_collector.collect", new_callable=AsyncMock, return_value=[]),
        patch("app.cache.scheduler_collector.collect", new_callable=AsyncMock, return_value={"health": "unknown", "runs": []}),
        patch("app.cache.github_collector.collect", new_callable=AsyncMock, return_value=FAKE_GITHUB),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "github_actions" in data
    assert len(data["github_actions"]) == 1
    assert data["github_actions"][0]["repo"] == "org/my-app"
    assert data["github_actions"][0]["conclusion"] == "success"


@pytest.mark.asyncio
async def test_status_returns_cached_data_on_second_call():
    """When cache is populated, /api/status returns cached data without calling collectors."""
    from app.cache import update_cache

    cached_data = {
        "system": FAKE_SYSTEM,
        "services": FAKE_SERVICES,
        "scheduler": FAKE_SCHEDULER,
        "github_actions": FAKE_GITHUB,
    }
    update_cache(cached_data)

    # No patches needed - collectors should NOT be called
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert data["system"]["cpu_percent"] == 10.0
    assert "last_updated" in data
