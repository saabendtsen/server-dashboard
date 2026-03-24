import json
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
                "SELECT id, repo, issue_number, session_type, started_at, ended_at, outcome, pr_number, notes, validation_reason "
                "FROM runs ORDER BY started_at DESC LIMIT 20"
            )
            rows = await cursor.fetchall()
            runs = [dict(row) for row in rows]

            # Fetch events for these runs
            if runs:
                run_ids = [r["id"] for r in runs]
                placeholders = ",".join("?" * len(run_ids))
                event_cursor = await db.execute(
                    f"SELECT id, run_id, timestamp, event_type, detail "
                    f"FROM run_events WHERE run_id IN ({placeholders}) "
                    f"ORDER BY timestamp ASC",
                    run_ids,
                )
                event_rows = await event_cursor.fetchall()

                events_by_run: dict[int, list[dict]] = {r["id"]: [] for r in runs}
                for evt in event_rows:
                    evt_dict = dict(evt)
                    rid = evt_dict.pop("run_id")
                    if rid in events_by_run:
                        events_by_run[rid].append(evt_dict)

                for run in runs:
                    run["events"] = events_by_run[run["id"]]
    except Exception:
        return {"health": "unknown", "runs": []}

    if runs:
        latest_outcome = runs[0]["outcome"]
        health = HEALTH_MAP.get(latest_outcome, "unknown")
    else:
        health = "unknown"

    return {"health": health, "runs": runs}


async def get_run_messages(run_id: int, db_path: str = DEFAULT_DB_PATH) -> list[dict] | None:
    """Fetch agent messages for a specific run. Returns None if NULL, raises ValueError if not found."""
    uri = f"file:{db_path}?mode=ro"
    async with aiosqlite.connect(uri, uri=True) as db:
        cursor = await db.execute("SELECT messages FROM runs WHERE id = ?", (run_id,))
        row = await cursor.fetchone()
        if row is None:
            raise ValueError(f"Run {run_id} not found")
        if row[0] is None:
            return None
        return json.loads(row[0])
