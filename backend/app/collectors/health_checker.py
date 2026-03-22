from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

TIMEOUT_SECONDS = 5.0


def _resolve_url(url: str) -> str:
    """Rewrite localhost URLs to host.docker.internal when running in Docker."""
    parsed = urlparse(url)
    if parsed.hostname in ("localhost", "127.0.0.1"):
        resolved = parsed._replace(
            netloc=parsed.netloc.replace(parsed.hostname, "host.docker.internal")
        )
        return urlunparse(resolved)
    return url


async def check(url: str) -> dict[str, Any]:
    """Perform HTTP GET healthcheck against a URL. Returns status_code, latency_ms, error."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(_resolve_url(url))
        return {
            "status_code": response.status_code,
            "latency_ms": round(response.elapsed.total_seconds() * 1000, 1),
            "error": None,
        }
    except httpx.TimeoutException:
        return {"status_code": None, "latency_ms": None, "error": "timeout"}
    except httpx.ConnectError:
        return {"status_code": None, "latency_ms": None, "error": "connection_error"}
