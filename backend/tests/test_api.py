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
    with patch("app.main.system_collector.collect", return_value=fake_system):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "system" in data
    assert data["system"]["cpu_percent"] == 10.0
    assert "last_updated" in data
