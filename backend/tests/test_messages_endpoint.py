from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


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
async def test_messages_endpoint_returns_json():
    messages = [{"role": "user", "content": "hello"}]
    with patch("app.main.get_run_messages", new_callable=AsyncMock, return_value=messages):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/runs/1/messages")
    assert response.status_code == 200
    assert response.json() == messages


@pytest.mark.asyncio
async def test_messages_endpoint_returns_204_when_null():
    with patch("app.main.get_run_messages", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/runs/1/messages")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_messages_endpoint_returns_404_when_not_found():
    with patch("app.main.get_run_messages", new_callable=AsyncMock, side_effect=ValueError("Run 999 not found")):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/runs/999/messages")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_messages_endpoint_returns_503_on_db_error():
    with patch("app.main.get_run_messages", new_callable=AsyncMock, side_effect=Exception("DB connection failed")):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/runs/1/messages")
    assert response.status_code == 503
