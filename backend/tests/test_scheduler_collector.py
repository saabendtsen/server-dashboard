import sqlite3
import tempfile
from pathlib import Path

import pytest

from app.collectors.scheduler_collector import collect


def _create_db(tmp_path: Path, rows: list[tuple] | None = None, events: list[tuple] | None = None) -> Path:
    """Create a temporary SQLite DB with the runs table schema."""
    db_path = tmp_path / "history.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE runs (
            id INTEGER PRIMARY KEY,
            repo TEXT,
            issue_number INTEGER,
            session_type TEXT,
            started_at TEXT,
            ended_at TEXT,
            outcome TEXT,
            pr_number INTEGER,
            notes TEXT,
            validation_reason TEXT,
            messages TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE run_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL REFERENCES runs(id),
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT
        )
    """)
    if rows:
        conn.executemany(
            "INSERT INTO runs (id, repo, issue_number, session_type, started_at, ended_at, outcome, pr_number, notes, validation_reason) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    if events:
        conn.executemany(
            "INSERT INTO run_events (run_id, timestamp, event_type, detail) VALUES (?, ?, ?, ?)",
            events,
        )
    conn.commit()
    conn.close()
    return db_path


@pytest.mark.asyncio
async def test_collect_returns_runs_sorted_newest_first(tmp_path):
    rows = [
        (1, "owner/repo-a", 10, "planning", "2026-03-18T08:00:00Z", "2026-03-18T08:30:00Z", "completed", None, None, None),
        (2, "owner/repo-b", 20, "implementation", "2026-03-19T10:00:00Z", "2026-03-19T11:00:00Z", "completed", 5, None, None),
        (3, "owner/repo-a", 15, "planning", "2026-03-20T12:00:00Z", "2026-03-20T12:20:00Z", "failed", None, "error", None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))

    assert len(result["runs"]) == 3
    # Newest first
    assert result["runs"][0]["id"] == 3
    assert result["runs"][1]["id"] == 2
    assert result["runs"][2]["id"] == 1


@pytest.mark.asyncio
async def test_collect_limits_to_20_runs(tmp_path):
    rows = [
        (i, "owner/repo", i, "planning", f"2026-03-{i:02d}T10:00:00Z", f"2026-03-{i:02d}T10:30:00Z", "completed", None, None, None)
        for i in range(1, 26)
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))

    assert len(result["runs"]) == 20
    # Should be newest first (id 25 first)
    assert result["runs"][0]["id"] == 25


@pytest.mark.asyncio
async def test_collect_run_fields(tmp_path):
    rows = [
        (1, "saabendtsen/ai-scheduler", 42, "implementation", "2026-03-19T10:00:00Z", "2026-03-19T11:00:00Z", "completed", 7, "some notes", None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))

    run = result["runs"][0]
    assert run["id"] == 1
    assert run["repo"] == "saabendtsen/ai-scheduler"
    assert run["issue_number"] == 42
    assert run["session_type"] == "implementation"
    assert run["started_at"] == "2026-03-19T10:00:00Z"
    assert run["ended_at"] == "2026-03-19T11:00:00Z"
    assert run["outcome"] == "completed"
    assert run["pr_number"] == 7
    assert run["notes"] == "some notes"


# --- Slice 2: Health derivation ---


@pytest.mark.asyncio
async def test_health_completed_is_healthy(tmp_path):
    rows = [
        (1, "owner/repo", 1, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["health"] == "healthy"


@pytest.mark.asyncio
async def test_health_failed_is_unhealthy(tmp_path):
    rows = [
        (1, "owner/repo", 1, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "failed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["health"] == "unhealthy"


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["clarification", "timeout", "running"])
async def test_health_warning_outcomes(tmp_path, outcome):
    rows = [
        (1, "owner/repo", 1, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", outcome, None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["health"] == "warning"


@pytest.mark.asyncio
async def test_health_empty_db_is_unknown(tmp_path):
    db_path = _create_db(tmp_path, rows=None)
    result = await collect(db_path=str(db_path))
    assert result["health"] == "unknown"
    assert result["runs"] == []


@pytest.mark.asyncio
async def test_health_uses_latest_run_only(tmp_path):
    """Health should be based on the most recent run, not older ones."""
    rows = [
        (1, "owner/repo", 1, "planning", "2026-03-18T10:00:00Z", "2026-03-18T10:30:00Z", "completed", None, None, None),
        (2, "owner/repo", 2, "implementation", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "failed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["health"] == "unhealthy"


# --- Slice 3: Read-only mode ---


@pytest.mark.asyncio
async def test_db_file_not_modified(tmp_path):
    """Collector must not modify the DB file (read-only mode)."""
    rows = [
        (1, "owner/repo", 1, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)

    import os
    stat_before = os.stat(db_path)
    mtime_before = stat_before.st_mtime

    await collect(db_path=str(db_path))

    stat_after = os.stat(db_path)
    assert stat_after.st_mtime == mtime_before
    # Also check no WAL/journal files were created
    assert not (tmp_path / "history.db-wal").exists()
    assert not (tmp_path / "history.db-journal").exists()


@pytest.mark.asyncio
async def test_missing_db_returns_unknown(tmp_path):
    """If the DB file does not exist, return unknown health gracefully."""
    db_path = str(tmp_path / "nonexistent.db")
    result = await collect(db_path=db_path)
    assert result["health"] == "unknown"
    assert result["runs"] == []


# --- validation_reason ---


@pytest.mark.asyncio
async def test_collect_includes_validation_reason(tmp_path):
    rows = [
        (1, "owner/repo", 10, "implementation", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", 5, None, "PR #5 open, checks passed"),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["runs"][0]["validation_reason"] == "PR #5 open, checks passed"


@pytest.mark.asyncio
async def test_collect_validation_reason_null(tmp_path):
    rows = [
        (1, "owner/repo", 10, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)
    result = await collect(db_path=str(db_path))
    assert result["runs"][0]["validation_reason"] is None


# --- run_events ---


@pytest.mark.asyncio
async def test_collect_includes_events_per_run(tmp_path):
    rows = [
        (1, "owner/repo", 10, "implementation", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", 5, None, None),
        (2, "owner/repo", 11, "planning", "2026-03-21T10:00:00Z", "2026-03-21T10:30:00Z", "completed", None, None, None),
    ]
    events = [
        (1, "2026-03-20T10:00:00Z", "session_started", '{"session_id": "abc"}'),
        (1, "2026-03-20T10:15:00Z", "pr_found", '{"pr_number": 5}'),
        (2, "2026-03-21T10:00:00Z", "session_started", None),
    ]
    db_path = _create_db(tmp_path, rows, events)
    result = await collect(db_path=str(db_path))

    # Run 2 (newest) should have 1 event
    assert len(result["runs"][0]["events"]) == 1
    assert result["runs"][0]["events"][0]["event_type"] == "session_started"

    # Run 1 should have 2 events, ordered by timestamp
    assert len(result["runs"][1]["events"]) == 2
    assert result["runs"][1]["events"][0]["event_type"] == "session_started"
    assert result["runs"][1]["events"][1]["event_type"] == "pr_found"


@pytest.mark.asyncio
async def test_collect_run_with_no_events_gets_empty_array(tmp_path):
    rows = [
        (1, "owner/repo", 10, "planning", "2026-03-20T10:00:00Z", "2026-03-20T10:30:00Z", "completed", None, None, None),
    ]
    db_path = _create_db(tmp_path, rows)  # no events
    result = await collect(db_path=str(db_path))
    assert result["runs"][0]["events"] == []
