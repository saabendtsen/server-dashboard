from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import pytest

from app.collectors.docker_collector import collect


def _make_container(name, status, image, started_at, labels=None):
    c = MagicMock()
    c.name = name
    c.status = status
    c.image.tags = [image]
    c.attrs = {
        "State": {"StartedAt": started_at},
    }
    c.labels = labels or {}
    return c


@pytest.mark.asyncio
async def test_collect_returns_running_containers():
    containers = [
        _make_container(
            "caddy",
            "running",
            "caddy:2",
            "2026-03-19T10:00:00Z",
        ),
        _make_container(
            "ghost",
            "running",
            "ghost:5",
            "2026-03-18T08:00:00Z",
        ),
    ]

    mock_client = MagicMock()
    mock_client.containers.list.return_value = containers

    with patch("app.collectors.docker_collector.docker") as mock_docker:
        mock_docker.from_env.return_value = mock_client
        result = await collect()

    assert len(result) == 2
    assert result[0]["name"] == "caddy"
    assert result[0]["status"] == "running"
    assert result[0]["image"] == "caddy:2"
    assert result[0]["started_at"] == "2026-03-19T10:00:00Z"

    assert result[1]["name"] == "ghost"
    assert result[1]["image"] == "ghost:5"


@pytest.mark.asyncio
async def test_collect_returns_empty_list_when_no_containers():
    mock_client = MagicMock()
    mock_client.containers.list.return_value = []

    with patch("app.collectors.docker_collector.docker") as mock_docker:
        mock_docker.from_env.return_value = mock_client
        result = await collect()

    assert result == []


@pytest.mark.asyncio
async def test_collect_includes_stopped_containers():
    containers = [
        _make_container("stopped-app", "exited", "myapp:1", "2026-03-17T12:00:00Z"),
    ]

    mock_client = MagicMock()
    mock_client.containers.list.return_value = containers

    with patch("app.collectors.docker_collector.docker") as mock_docker:
        mock_docker.from_env.return_value = mock_client
        result = await collect()

    assert len(result) == 1
    assert result[0]["status"] == "exited"


@pytest.mark.asyncio
async def test_collect_includes_healthcheck_for_labeled_container():
    containers = [
        _make_container(
            "caddy",
            "running",
            "caddy:2",
            "2026-03-19T10:00:00Z",
            labels={"dashboard.healthcheck.url": "http://localhost:8080/health"},
        ),
        _make_container(
            "ghost",
            "running",
            "ghost:5",
            "2026-03-18T08:00:00Z",
        ),
    ]

    mock_client = MagicMock()
    mock_client.containers.list.return_value = containers

    healthcheck_result = {"status_code": 200, "latency_ms": 45.0, "error": None}

    with (
        patch("app.collectors.docker_collector.docker") as mock_docker,
        patch("app.collectors.docker_collector.health_checker") as mock_hc,
    ):
        mock_docker.from_env.return_value = mock_client
        mock_hc.check = AsyncMock(return_value=healthcheck_result)
        result = await collect()

    # Labeled container gets healthcheck
    assert result[0]["healthcheck"] == healthcheck_result
    mock_hc.check.assert_awaited_once_with("http://localhost:8080/health")

    # Unlabeled container gets no healthcheck
    assert result[1]["healthcheck"] is None


@pytest.mark.asyncio
async def test_collect_healthcheck_timeout_handled_gracefully():
    containers = [
        _make_container(
            "slow-app",
            "running",
            "myapp:1",
            "2026-03-19T10:00:00Z",
            labels={"dashboard.healthcheck.url": "http://localhost:9999/health"},
        ),
    ]

    mock_client = MagicMock()
    mock_client.containers.list.return_value = containers

    timeout_result = {"status_code": None, "latency_ms": None, "error": "timeout"}

    with (
        patch("app.collectors.docker_collector.docker") as mock_docker,
        patch("app.collectors.docker_collector.health_checker") as mock_hc,
    ):
        mock_docker.from_env.return_value = mock_client
        mock_hc.check = AsyncMock(return_value=timeout_result)
        result = await collect()

    assert result[0]["healthcheck"]["error"] == "timeout"
    assert result[0]["healthcheck"]["status_code"] is None
