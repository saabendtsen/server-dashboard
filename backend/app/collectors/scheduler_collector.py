import os
from pathlib import Path
from typing import Any

import aiosqlite

DEFAULT_DB_PATH = os.environ.get(
    "SCHEDULER_DB_PATH",
    str(Path.home() / "apps" / "ai-scheduler" / "history.db"),
)

HEALTH_MAP = {
    "completed": "healthy",
    "failed": "unhealthy",
    "clarification": "warning",
    "timeout": "warning",
    "running": "warning",
}


async def collect(db_path: str = DEFAULT_DB_PATH) -> dict[str, Any]:
    """Read recent AI Scheduler runs from SQLite DB in read-only mode."""
    uri = f"file:{db_path}?mode=ro"
    try:
        async with aiosqlite.connect(uri, uri=True) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT id, repo, issue_number, session_type, started_at, ended_at, outcome, pr_number, notes "
                "FROM runs ORDER BY started_at DESC LIMIT 20"
            )
            rows = await cursor.fetchall()
    except Exception:
        return {"health": "unknown", "runs": []}

    runs = [dict(row) for row in rows]

    if runs:
        latest_outcome = runs[0]["outcome"]
        health = HEALTH_MAP.get(latest_outcome, "unknown")
    else:
        health = "unknown"

    return {"health": health, "runs": runs}
