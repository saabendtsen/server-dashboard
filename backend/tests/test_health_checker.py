from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import pytest

from app.collectors.health_checker import check


@pytest.mark.asyncio
async def test_check_returns_status_and_latency():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.elapsed.total_seconds.return_value = 0.045

    mock_client_instance = AsyncMock()
    mock_client_instance.get.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.collectors.health_checker.httpx.AsyncClient", return_value=mock_client_instance):
        result = await check("http://localhost:8080/health")

    assert result["status_code"] == 200
    assert result["latency_ms"] == 45.0
    assert result["error"] is None


@pytest.mark.asyncio
async def test_check_returns_error_on_timeout():
    mock_client_instance = AsyncMock()
    mock_client_instance.get.side_effect = httpx.TimeoutException("timed out")
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.collectors.health_checker.httpx.AsyncClient", return_value=mock_client_instance):
        result = await check("http://localhost:9999/health")

    assert result["status_code"] is None
    assert result["latency_ms"] is None
    assert result["error"] == "timeout"


@pytest.mark.asyncio
async def test_check_returns_error_on_connection_failure():
    mock_client_instance = AsyncMock()
    mock_client_instance.get.side_effect = httpx.ConnectError("connection refused")
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.collectors.health_checker.httpx.AsyncClient", return_value=mock_client_instance):
        result = await check("http://localhost:9999/health")

    assert result["status_code"] is None
    assert result["error"] == "connection_error"


@pytest.mark.asyncio
async def test_check_returns_non_200_status():
    mock_response = MagicMock()
    mock_response.status_code = 503
    mock_response.elapsed.total_seconds.return_value = 0.12

    mock_client_instance = AsyncMock()
    mock_client_instance.get.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.collectors.health_checker.httpx.AsyncClient", return_value=mock_client_instance):
        result = await check("http://localhost:8080/health")

    assert result["status_code"] == 503
    assert result["latency_ms"] == 120.0
    assert result["error"] is None
