from typing import Any

import httpx

TIMEOUT_SECONDS = 5.0


async def check(url: str) -> dict[str, Any]:
    """Perform HTTP GET healthcheck against a URL. Returns status_code, latency_ms, error."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(url)
        return {
            "status_code": response.status_code,
            "latency_ms": round(response.elapsed.total_seconds() * 1000, 1),
            "error": None,
        }
    except httpx.TimeoutException:
        return {"status_code": None, "latency_ms": None, "error": "timeout"}
    except httpx.ConnectError:
        return {"status_code": None, "latency_ms": None, "error": "connection_error"}
