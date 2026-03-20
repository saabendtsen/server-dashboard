from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_returns_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_status_returns_system_metrics():
    fake_system = {
        "disks": [{"mount": "/", "total_bytes": 120_000_000_000, "used_bytes": 60_000_000_000, "percent": 50.0}],
        "cpu_percent": 10.0,
        "temperature": 42.0,
        "load_average": [0.5, 0.3, 0.2],
        "memory": {"total_bytes": 16_000_000_000, "used_bytes": 8_000_000_000, "percent": 50.0},
        "uptime_seconds": 86400,
    }
    with (
        patch("app.main.system_collector.collect", return_value=fake_system),
        patch("app.main.docker_collector.collect", return_value=[]),
        patch("app.main.scheduler_collector.collect", return_value={"health": "unknown", "runs": []}),
        patch("app.main.github_collector.collect", return_value=[]),
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
    fake_system = {
        "disks": [],
        "cpu_percent": 5.0,
        "temperature": None,
        "load_average": [0.1, 0.1, 0.1],
        "memory": {"total_bytes": 16_000_000_000, "used_bytes": 4_000_000_000, "percent": 25.0},
        "uptime_seconds": 3600,
    }
    fake_services = [
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
    with (
        patch("app.main.system_collector.collect", return_value=fake_system),
        patch("app.main.docker_collector.collect", return_value=fake_services),
        patch("app.main.scheduler_collector.collect", return_value={"health": "unknown", "runs": []}),
        patch("app.main.github_collector.collect", return_value=[]),
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
    fake_system = {
        "disks": [],
        "cpu_percent": 5.0,
        "temperature": None,
        "load_average": [0.1, 0.1, 0.1],
        "memory": {"total_bytes": 16_000_000_000, "used_bytes": 4_000_000_000, "percent": 25.0},
        "uptime_seconds": 3600,
    }
    fake_scheduler = {
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
    with (
        patch("app.main.system_collector.collect", return_value=fake_system),
        patch("app.main.docker_collector.collect", return_value=[]),
        patch("app.main.scheduler_collector.collect", return_value=fake_scheduler),
        patch("app.main.github_collector.collect", return_value=[]),
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
    fake_system = {
        "disks": [],
        "cpu_percent": 5.0,
        "temperature": None,
        "load_average": [0.1, 0.1, 0.1],
        "memory": {"total_bytes": 16_000_000_000, "used_bytes": 4_000_000_000, "percent": 25.0},
        "uptime_seconds": 3600,
    }
    fake_github = [
        {
            "repo": "org/my-app",
            "workflow_name": "CI",
            "status": "completed",
            "conclusion": "success",
            "created_at": "2026-03-20T10:00:00Z",
        },
    ]
    with (
        patch("app.main.system_collector.collect", return_value=fake_system),
        patch("app.main.docker_collector.collect", return_value=[]),
        patch("app.main.scheduler_collector.collect", return_value={"health": "unknown", "runs": []}),
        patch("app.main.github_collector.collect", return_value=fake_github),
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
