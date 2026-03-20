from typing import Any

import docker

from app.collectors import health_checker

HEALTHCHECK_LABEL = "dashboard.healthcheck.url"


async def collect() -> list[dict[str, Any]]:
    """Discover all Docker containers and return their metadata with optional healthchecks."""
    client = docker.from_env()
    containers = client.containers.list(all=True)

    results = []
    for container in containers:
        image_tags = container.image.tags
        image_name = image_tags[0] if image_tags else "unknown"
        started_at = container.attrs.get("State", {}).get("StartedAt", "")

        healthcheck_url = container.labels.get(HEALTHCHECK_LABEL)
        if healthcheck_url:
            hc_result = await health_checker.check(healthcheck_url)
        else:
            hc_result = None

        results.append({
            "name": container.name,
            "status": container.status,
            "image": image_name,
            "started_at": started_at,
            "healthcheck": hc_result,
        })

    return results
