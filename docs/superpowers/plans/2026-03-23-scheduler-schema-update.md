# Scheduler Schema Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the dashboard to display validation_reason, run_events timeline, and agent messages from the ai-scheduler schema changes.

**Architecture:** Extend the scheduler collector with validation_reason + nested events per run (2 SQL queries, served via existing cache). Add a separate `/api/runs/{id}/messages` endpoint for on-demand message loading. Frontend gets a vertical event timeline component, a messages modal, and validation_reason subtitle on run cards.

**Tech Stack:** Python/FastAPI/aiosqlite (backend), React 19/TypeScript/TailwindCSS (frontend), Vitest/Playwright (tests)

**Spec:** `docs/superpowers/specs/2026-03-23-scheduler-schema-update-design.md`

---

### Task 1: Backend — Add validation_reason to collector

**Files:**
- Modify: `backend/app/collectors/scheduler_collector.py:27-29` (SQL query)
- Modify: `backend/tests/test_scheduler_collector.py:10-34` (test helper + new test)

- [ ] **Step 1: Update test helper to include new columns**

In `test_scheduler_collector.py`, update `_create_db` to add `validation_reason TEXT` and `messages TEXT` columns to the schema, and update the INSERT to include them:

```python
def _create_db(tmp_path: Path, rows: list[tuple] | None = None) -> Path:
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
    if rows:
        conn.executemany(
            "INSERT INTO runs (id, repo, issue_number, session_type, started_at, ended_at, outcome, pr_number, notes, validation_reason) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    conn.commit()
    conn.close()
    return db_path
```

Update all existing row tuples to append `None` as the 10th element (validation_reason).

- [ ] **Step 2: Write failing test for validation_reason**

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py::test_collect_includes_validation_reason tests/test_scheduler_collector.py::test_collect_validation_reason_null -v`
Expected: FAIL — `validation_reason` not in run dict

- [ ] **Step 4: Update the SQL query in collector**

In `scheduler_collector.py`, update the query on line 28:

```python
cursor = await db.execute(
    "SELECT id, repo, issue_number, session_type, started_at, ended_at, outcome, pr_number, notes, validation_reason "
    "FROM runs ORDER BY started_at DESC LIMIT 20"
)
```

- [ ] **Step 5: Run all scheduler collector tests**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd ~/projects/server-dashboard
git add backend/app/collectors/scheduler_collector.py backend/tests/test_scheduler_collector.py
git commit -m "feat: add validation_reason to scheduler collector query"
```

---

### Task 2: Backend — Add run_events nested in collector

**Files:**
- Modify: `backend/app/collectors/scheduler_collector.py` (add events query + grouping)
- Modify: `backend/tests/test_scheduler_collector.py` (add run_events table to helper + tests)

- [ ] **Step 1: Update test helper to create run_events table**

Add `run_events` table creation to `_create_db` and add optional `events` parameter:

```python
def _create_db(tmp_path: Path, rows: list[tuple] | None = None, events: list[tuple] | None = None) -> Path:
    # ... existing code ...
    conn.execute("""
        CREATE TABLE run_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL REFERENCES runs(id),
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT
        )
    """)
    if events:
        conn.executemany(
            "INSERT INTO run_events (run_id, timestamp, event_type, detail) VALUES (?, ?, ?, ?)",
            events,
        )
    conn.commit()
    conn.close()
    return db_path
```

- [ ] **Step 2: Write failing tests for events**

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py::test_collect_includes_events_per_run tests/test_scheduler_collector.py::test_collect_run_with_no_events_gets_empty_array -v`
Expected: FAIL — `events` key not in run dict

- [ ] **Step 4: Implement events query in collector**

In `scheduler_collector.py`, after building `runs` list, add events query:

```python
async def collect(db_path: str = DEFAULT_DB_PATH) -> dict[str, Any]:
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

                # Group events by run_id
                events_by_run: dict[int, list[dict]] = {r["id"]: [] for r in runs}
                for evt in event_rows:
                    evt_dict = dict(evt)
                    rid = evt_dict.pop("run_id")
                    if rid in events_by_run:
                        events_by_run[rid].append(evt_dict)

                for run in runs:
                    run["events"] = events_by_run[run["id"]]
            else:
                pass  # No runs, no events needed
    except Exception:
        return {"health": "unknown", "runs": []}

    if runs:
        latest_outcome = runs[0]["outcome"]
        health = HEALTH_MAP.get(latest_outcome, "unknown")
    else:
        health = "unknown"

    return {"health": health, "runs": runs}
```

- [ ] **Step 5: Run all scheduler collector tests**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd ~/projects/server-dashboard
git add backend/app/collectors/scheduler_collector.py backend/tests/test_scheduler_collector.py
git commit -m "feat: nest run_events per run in scheduler collector"
```

---

### Task 3: Backend — Add /api/runs/{id}/messages endpoint

**Files:**
- Modify: `backend/app/collectors/scheduler_collector.py` (add `get_run_messages` function)
- Modify: `backend/app/main.py` (add endpoint)
- Create: `backend/tests/test_messages_endpoint.py`

- [ ] **Step 1: Write failing tests for get_run_messages**

Add to `test_scheduler_collector.py`:

```python
from app.collectors.scheduler_collector import get_run_messages

@pytest.mark.asyncio
async def test_get_run_messages_returns_json(tmp_path):
    messages_json = '[{"role": "user", "content": "hello"}]'
    conn = sqlite3.connect(str(tmp_path / "history.db"))
    conn.execute("""
        CREATE TABLE runs (
            id INTEGER PRIMARY KEY, repo TEXT, issue_number INTEGER,
            session_type TEXT, started_at TEXT, ended_at TEXT,
            outcome TEXT, pr_number INTEGER, notes TEXT,
            validation_reason TEXT, messages TEXT
        )
    """)
    conn.execute(
        "INSERT INTO runs (id, repo, issue_number, session_type, started_at, ended_at, outcome, messages) "
        "VALUES (1, 'o/r', 1, 'planning', '2026-01-01', '2026-01-01', 'completed', ?)",
        (messages_json,),
    )
    conn.commit()
    conn.close()
    result = await get_run_messages(1, str(tmp_path / "history.db"))
    assert result == [{"role": "user", "content": "hello"}]


@pytest.mark.asyncio
async def test_get_run_messages_null_returns_none(tmp_path):
    conn = sqlite3.connect(str(tmp_path / "history.db"))
    conn.execute("""
        CREATE TABLE runs (
            id INTEGER PRIMARY KEY, repo TEXT, issue_number INTEGER,
            session_type TEXT, started_at TEXT, ended_at TEXT,
            outcome TEXT, pr_number INTEGER, notes TEXT,
            validation_reason TEXT, messages TEXT
        )
    """)
    conn.execute(
        "INSERT INTO runs (id, repo, issue_number, session_type, started_at, ended_at, outcome) "
        "VALUES (1, 'o/r', 1, 'planning', '2026-01-01', '2026-01-01', 'completed')",
    )
    conn.commit()
    conn.close()
    result = await get_run_messages(1, str(tmp_path / "history.db"))
    assert result is None


@pytest.mark.asyncio
async def test_get_run_messages_not_found_raises(tmp_path):
    conn = sqlite3.connect(str(tmp_path / "history.db"))
    conn.execute("""
        CREATE TABLE runs (
            id INTEGER PRIMARY KEY, repo TEXT, issue_number INTEGER,
            session_type TEXT, started_at TEXT, ended_at TEXT,
            outcome TEXT, pr_number INTEGER, notes TEXT,
            validation_reason TEXT, messages TEXT
        )
    """)
    conn.commit()
    conn.close()
    with pytest.raises(ValueError):
        await get_run_messages(999, str(tmp_path / "history.db"))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py::test_get_run_messages_returns_json tests/test_scheduler_collector.py::test_get_run_messages_null_returns_none tests/test_scheduler_collector.py::test_get_run_messages_not_found_raises -v`
Expected: FAIL — `get_run_messages` not defined

- [ ] **Step 3: Implement get_run_messages in collector**

Add to `scheduler_collector.py`:

```python
import json

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
```

- [ ] **Step 4: Run collector tests**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_scheduler_collector.py -v`
Expected: ALL PASS

- [ ] **Step 5: Write failing test for API endpoint**

Create `backend/tests/test_messages_endpoint.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest tests/test_messages_endpoint.py -v`
Expected: FAIL — endpoint not defined

- [ ] **Step 7: Add endpoint to main.py**

```python
from fastapi import Response
from fastapi.responses import JSONResponse
from app.collectors.scheduler_collector import get_run_messages

@app.get("/api/runs/{run_id}/messages")
async def run_messages(run_id: int):
    try:
        messages = await get_run_messages(run_id)
    except ValueError:
        return JSONResponse(status_code=404, content={"detail": "Run not found"})
    except Exception:
        return JSONResponse(status_code=503, content={"detail": "Database unavailable"})
    if messages is None:
        return Response(status_code=204)
    return messages
```

**Important:** This route must be defined BEFORE the static files mount (`app.mount("/", ...)`) in `main.py`, otherwise it will be shadowed.

- [ ] **Step 8: Run all backend tests**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest -v`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd ~/projects/server-dashboard
git add backend/app/collectors/scheduler_collector.py backend/app/main.py backend/tests/test_scheduler_collector.py backend/tests/test_messages_endpoint.py
git commit -m "feat: add /api/runs/{id}/messages endpoint"
```

---

### Task 4: Frontend — Update types and add validation_reason to run cards

**Files:**
- Modify: `frontend/src/types.ts` (add RunEvent, AgentMessage, update SchedulerRun)
- Modify: `frontend/src/components/tabs/SchedulerTab.tsx` (add validation_reason display)
- Modify: `frontend/src/components/tabs/SchedulerTab.test.tsx` (add tests)

- [ ] **Step 1: Update TypeScript types**

In `frontend/src/types.ts`, update `SchedulerRun` and add new interfaces:

```typescript
export interface RunEvent {
  id: number
  timestamp: string
  event_type: string
  detail: string | null
}

export interface AgentMessage {
  role: string
  content: string
}

export interface SchedulerRun {
  id: number
  repo: string
  issue_number: number
  session_type: string
  started_at: string
  ended_at: string
  outcome: string
  pr_number: number | null
  notes: string | null
  validation_reason: string | null
  events: RunEvent[]
}
```

- [ ] **Step 2: Write failing test for validation_reason**

In `SchedulerTab.test.tsx`, update the fixture and add tests:

```typescript
const fixture: SchedulerData = {
  health: 'healthy',
  runs: [
    {
      id: 1,
      repo: 'saabendtsen/my-app',
      issue_number: 42,
      session_type: 'implement',
      started_at: '2026-03-20T10:00:00Z',
      ended_at: '2026-03-20T10:30:00Z',
      outcome: 'completed',
      pr_number: 15,
      notes: null,
      validation_reason: 'PR #15 open, checks passed',
      events: [],
    },
  ],
}

it('renders validation reason when present', () => {
  render(<SchedulerTab scheduler={fixture} />)
  expect(screen.getByText('PR #15 open, checks passed')).toBeInTheDocument()
})

it('does not render validation reason when null', () => {
  const noReason = {
    ...fixture,
    runs: [{ ...fixture.runs[0], validation_reason: null }],
  }
  render(<SchedulerTab scheduler={noReason} />)
  expect(screen.queryByTestId('validation-reason')).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: FAIL — type errors + validation_reason text not found

- [ ] **Step 4: Add validation_reason to SchedulerTab.tsx**

Below the `<OutcomeBadge>` line, add:

```tsx
<OutcomeBadge outcome={run.outcome} />
{run.validation_reason && (
  <p data-testid="validation-reason" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
    {run.validation_reason}
  </p>
)}
```

Restructure so the outcome badge and validation_reason are in a flex-col container:

```tsx
<div className="flex flex-col items-end gap-1">
  <OutcomeBadge outcome={run.outcome} />
  {run.validation_reason && (
    <span data-testid="validation-reason" className="text-xs text-gray-500 dark:text-gray-400">
      {run.validation_reason}
    </span>
  )}
</div>
```

- [ ] **Step 5: Run tests**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/src/types.ts frontend/src/components/tabs/SchedulerTab.tsx frontend/src/components/tabs/SchedulerTab.test.tsx
git commit -m "feat: display validation_reason on scheduler run cards"
```

---

### Task 5: Frontend — RunEventTimeline component

**Files:**
- Create: `frontend/src/components/shared/RunEventTimeline.tsx`
- Create: `frontend/src/components/shared/RunEventTimeline.test.tsx`

- [ ] **Step 1: Write failing test**

Create `RunEventTimeline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunEventTimeline } from './RunEventTimeline'
import type { RunEvent } from '../../types'

const events: RunEvent[] = [
  { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'session_started', detail: '{"session_id": "abc"}' },
  { id: 2, timestamp: '2026-03-20T10:05:00Z', event_type: 'label_added', detail: '{"label": "ai-implementing"}' },
  { id: 3, timestamp: '2026-03-20T10:15:00Z', event_type: 'pr_found', detail: '{"pr_number": 44}' },
  { id: 4, timestamp: '2026-03-20T10:20:00Z', event_type: 'validation_checked', detail: '{"passed": true, "reason": "checks ok"}' },
  { id: 5, timestamp: '2026-03-20T10:30:00Z', event_type: 'session_completed', detail: '{"outcome": "completed"}' },
]

describe('RunEventTimeline', () => {
  it('renders all events', () => {
    render(<RunEventTimeline events={events} />)
    const items = screen.getAllByTestId('timeline-event')
    expect(items).toHaveLength(5)
  })

  it('renders human-readable event descriptions', () => {
    render(<RunEventTimeline events={events} />)
    expect(screen.getByText('Session started')).toBeInTheDocument()
    expect(screen.getByText(/ai-implementing/)).toBeInTheDocument()
    expect(screen.getByText(/PR.*#44/)).toBeInTheDocument()
    expect(screen.getByText(/Validation passed/)).toBeInTheDocument()
    expect(screen.getByText(/Session completed/)).toBeInTheDocument()
  })

  it('renders empty state', () => {
    const { container } = render(<RunEventTimeline events={[]} />)
    expect(container.querySelector('[data-testid="timeline-event"]')).toBeNull()
  })

  it('handles unknown event types gracefully', () => {
    const unknown: RunEvent[] = [
      { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'new_future_event', detail: '{"key": "val"}' },
    ]
    render(<RunEventTimeline events={unknown} />)
    expect(screen.getByText('new_future_event')).toBeInTheDocument()
  })

  it('handles null detail', () => {
    const nullDetail: RunEvent[] = [
      { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'session_started', detail: null },
    ]
    render(<RunEventTimeline events={nullDetail} />)
    expect(screen.getByText('Session started')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/shared/RunEventTimeline.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RunEventTimeline**

Create `frontend/src/components/shared/RunEventTimeline.tsx`:

```tsx
import type { RunEvent } from '../../types'
import { formatTimestamp } from '../../utils/formatters'

function formatEventDetail(event: RunEvent): string {
  const { event_type, detail } = event
  let parsed: Record<string, unknown> = {}
  if (detail) {
    try {
      parsed = JSON.parse(detail)
    } catch {
      return `${event_type}: ${detail}`
    }
  }

  switch (event_type) {
    case 'session_started':
      return 'Session started'
    case 'session_completed':
      return `Session completed${parsed.outcome ? `: ${parsed.outcome}` : ''}`
    case 'label_added':
      return `Label added: ${parsed.label ?? '?'}`
    case 'label_removed':
      return `Label removed: ${parsed.label ?? '?'}`
    case 'pr_found':
      return `PR found: #${parsed.pr_number ?? '?'}`
    case 'validation_checked':
      return parsed.passed ? 'Validation passed' : 'Validation failed'
    case 'recheck_resolved':
      return `Recheck resolved: ${parsed.resolution ?? '?'}`
    default:
      return detail ? `${event_type}: ${detail}` : event_type
  }
}

const EVENT_COLORS: Record<string, string> = {
  session_started: 'bg-blue-400',
  session_completed: 'bg-green-400',
  label_added: 'bg-purple-400',
  label_removed: 'bg-gray-400',
  pr_found: 'bg-blue-400',
  validation_checked: 'bg-yellow-400',
  recheck_resolved: 'bg-green-400',
}

export function RunEventTimeline({ events }: { events: RunEvent[] }) {
  if (events.length === 0) return null

  return (
    <div className="relative ml-2 border-l-2 border-gray-200 dark:border-gray-600 pl-4 space-y-3 mt-3">
      {events.map((event) => (
        <div key={event.id} data-testid="timeline-event" className="relative">
          <div className={`absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full ${EVENT_COLORS[event.event_type] || 'bg-gray-400'}`} />
          <p className="text-xs text-gray-900 dark:text-gray-100">{formatEventDetail(event)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(event.timestamp)}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/shared/RunEventTimeline.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/src/components/shared/RunEventTimeline.tsx frontend/src/components/shared/RunEventTimeline.test.tsx
git commit -m "feat: add RunEventTimeline component"
```

---

### Task 6: Frontend — Wire event timeline into SchedulerTab

**Files:**
- Modify: `frontend/src/components/tabs/SchedulerTab.tsx` (add expand/collapse + timeline)
- Modify: `frontend/src/components/tabs/SchedulerTab.test.tsx` (add interaction tests)

- [ ] **Step 1: Write failing test**

```tsx
import { fireEvent } from '@testing-library/react'

// Update fixture to include events
const fixtureWithEvents: SchedulerData = {
  health: 'healthy',
  runs: [
    {
      id: 1,
      repo: 'saabendtsen/my-app',
      issue_number: 42,
      session_type: 'implement',
      started_at: '2026-03-20T10:00:00Z',
      ended_at: '2026-03-20T10:30:00Z',
      outcome: 'completed',
      pr_number: 15,
      notes: null,
      validation_reason: null,
      events: [
        { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'session_started', detail: null },
        { id: 2, timestamp: '2026-03-20T10:30:00Z', event_type: 'session_completed', detail: '{"outcome": "completed"}' },
      ],
    },
  ],
}

it('shows event timeline when events button is clicked', () => {
  render(<SchedulerTab scheduler={fixtureWithEvents} />)
  expect(screen.queryByTestId('timeline-event')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('toggle-events'))
  expect(screen.getAllByTestId('timeline-event')).toHaveLength(2)
})

it('hides events button when run has no events', () => {
  render(<SchedulerTab scheduler={fixture} />) // fixture has events: []
  expect(screen.queryByTestId('toggle-events')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement expand/collapse in SchedulerTab**

Add `useState` import and expand state. Add an "Events" toggle button and conditionally render `RunEventTimeline`:

```tsx
import { useState } from 'react'
import { RunEventTimeline } from '../shared/RunEventTimeline'

export function SchedulerTab({ scheduler }: { scheduler: SchedulerData }) {
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set())

  const toggleExpand = (runId: number) => {
    setExpandedRuns(prev => {
      const next = new Set(prev)
      if (next.has(runId)) next.delete(runId)
      else next.add(runId)
      return next
    })
  }

  // ... inside the run card, after the footer row:
  {run.events.length > 0 && (
    <>
      <button
        data-testid="toggle-events"
        onClick={() => toggleExpand(run.id)}
        className="text-xs text-primary hover:underline mt-2"
      >
        {expandedRuns.has(run.id) ? 'Hide events' : `Events (${run.events.length})`}
      </button>
      {expandedRuns.has(run.id) && <RunEventTimeline events={run.events} />}
    </>
  )}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/src/components/tabs/SchedulerTab.tsx frontend/src/components/tabs/SchedulerTab.test.tsx
git commit -m "feat: add expandable event timeline to scheduler run cards"
```

---

### Task 7: Frontend — MessagesModal component

**Files:**
- Create: `frontend/src/components/shared/MessagesModal.tsx`
- Create: `frontend/src/components/shared/MessagesModal.test.tsx`

- [ ] **Step 1: Write failing test**

Create `MessagesModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MessagesModal } from './MessagesModal'

describe('MessagesModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state while fetching', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {})) // never resolves
    render(<MessagesModal runId={1} onClose={() => {}} />)
    expect(screen.getByTestId('messages-loading')).toBeInTheDocument()
  })

  it('renders conversation messages', async () => {
    const messages = [
      { role: 'user', content: 'Fix the bug' },
      { role: 'assistant', content: 'I will fix it now' },
    ]
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(messages),
    } as Response)

    render(<MessagesModal runId={1} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Fix the bug')).toBeInTheDocument()
      expect(screen.getByText('I will fix it now')).toBeInTheDocument()
    })
  })

  it('shows expired notice on 204', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(),
    } as Response)

    render(<MessagesModal runId={1} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/expired/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when close button clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as Response)

    const onClose = vi.fn()
    render(<MessagesModal runId={1} onClose={onClose} />)
    await waitFor(() => screen.getByTestId('close-modal'))
    fireEvent.click(screen.getByTestId('close-modal'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/shared/MessagesModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MessagesModal**

Create `frontend/src/components/shared/MessagesModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { AgentMessage } from '../../types'

interface Props {
  runId: number
  onClose: () => void
}

export function MessagesModal({ runId, onClose }: Props) {
  const [messages, setMessages] = useState<AgentMessage[] | null>(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/server-dashboard/api/runs/${runId}/messages`)
      .then(res => {
        if (res.status === 204) {
          setExpired(true)
          return null
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data !== null) setMessages(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [runId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Messages — Run #{runId}</h3>
          <button data-testid="close-modal" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div data-testid="messages-loading" className="text-center text-gray-400 py-8">Loading messages...</div>
          )}

          {expired && (
            <div className="text-center text-gray-400 py-8">Messages expired (retention cleanup)</div>
          )}

          {error && (
            <div className="text-center text-red-400 py-8">Failed to load messages: {error}</div>
          )}

          {messages && messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                msg.role === 'assistant'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100'
                  : msg.role === 'user'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 text-gray-700 dark:text-gray-300 text-xs'
              }`}
            >
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{msg.role}</span>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/shared/MessagesModal.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/src/components/shared/MessagesModal.tsx frontend/src/components/shared/MessagesModal.test.tsx
git commit -m "feat: add MessagesModal component for viewing agent messages"
```

---

### Task 8: Frontend — Wire MessagesModal into SchedulerTab

**Files:**
- Modify: `frontend/src/components/tabs/SchedulerTab.tsx`
- Modify: `frontend/src/components/tabs/SchedulerTab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it('opens messages modal when view messages button is clicked', () => {
  vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
  render(<SchedulerTab scheduler={fixture} />)
  fireEvent.click(screen.getByTestId('view-messages'))
  expect(screen.getByTestId('messages-loading')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: FAIL

- [ ] **Step 3: Add messages button and modal to SchedulerTab**

Add state for which run's messages are showing, a "View messages" button per card, and render `MessagesModal` when active:

```tsx
import { MessagesModal } from '../shared/MessagesModal'

// Inside component:
const [messagesRunId, setMessagesRunId] = useState<number | null>(null)

// Inside run card, after the events toggle:
<button
  data-testid="view-messages"
  onClick={() => setMessagesRunId(run.id)}
  className="text-xs text-primary hover:underline mt-2 ml-2"
>
  View messages
</button>

// At the end, before closing </div>:
{messagesRunId !== null && (
  <MessagesModal runId={messagesRunId} onClose={() => setMessagesRunId(null)} />
)}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/projects/server-dashboard/frontend && npx vitest run src/components/tabs/SchedulerTab.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/src/components/tabs/SchedulerTab.tsx frontend/src/components/tabs/SchedulerTab.test.tsx
git commit -m "feat: wire MessagesModal into scheduler run cards"
```

---

### Task 9: E2E — Update Playwright tests

**Files:**
- Modify: `frontend/e2e/dashboard.spec.ts`

- [ ] **Step 1: Update E2E mock data**

Update `MOCK_STATUS.scheduler` to include `validation_reason` and `events`:

```typescript
scheduler: {
  health: 'healthy',
  runs: [
    {
      id: 89,
      repo: 'Wibholm-solutions/dilemma',
      issue_number: 13,
      session_type: 'planning',
      started_at: '2026-03-20T10:20:03Z',
      ended_at: '2026-03-20T10:22:31Z',
      outcome: 'completed',
      pr_number: null,
      notes: null,
      validation_reason: 'Plan file found in comments',
      events: [
        { id: 1, timestamp: '2026-03-20T10:20:03Z', event_type: 'session_started', detail: null },
        { id: 2, timestamp: '2026-03-20T10:22:31Z', event_type: 'session_completed', detail: '{"outcome": "completed"}' },
      ],
    },
    {
      id: 88,
      repo: 'saabendtsen/ai-scheduler',
      issue_number: 5,
      session_type: 'implementation',
      started_at: '2026-03-19T09:48:06Z',
      ended_at: '2026-03-19T09:49:43Z',
      outcome: 'failed',
      pr_number: 12,
      notes: null,
      validation_reason: 'No PR found for issue',
      events: [],
    },
  ],
},
```

- [ ] **Step 2: Add E2E test for new features**

```typescript
test('AI Scheduler tab shows validation reason and expandable events', async ({ page }) => {
  await page.goto('/server-dashboard/')
  await page.getByRole('tab', { name: 'AI Scheduler' }).click()

  // Validation reason visible
  await expect(page.getByText('Plan file found in comments')).toBeVisible()
  await expect(page.getByText('No PR found for issue')).toBeVisible()

  // Events toggle on first run (has events)
  const firstRun = page.getByTestId('scheduler-run').nth(0)
  const eventsToggle = firstRun.getByTestId('toggle-events')
  await expect(eventsToggle).toBeVisible()
  await expect(eventsToggle).toHaveText('Events (2)')

  // Expand events
  await eventsToggle.click()
  await expect(firstRun.getByText('Session started')).toBeVisible()
  await expect(firstRun.getByText(/Session completed/)).toBeVisible()

  // Collapse events
  await eventsToggle.click()
  await expect(firstRun.getByText('Session started')).not.toBeVisible()

  // Second run has no events — no toggle
  const secondRun = page.getByTestId('scheduler-run').nth(1)
  await expect(secondRun.locator('[data-testid="toggle-events"]')).toHaveCount(0)
})

test('AI Scheduler tab view messages button opens modal', async ({ page }) => {
  // Mock the messages endpoint
  await page.route('**/api/runs/89/messages', (route) =>
    route.fulfill({
      json: [
        { role: 'user', content: 'Plan this feature' },
        { role: 'assistant', content: 'I will create a plan' },
      ],
    })
  )

  await page.goto('/server-dashboard/')
  await page.getByRole('tab', { name: 'AI Scheduler' }).click()

  // Click view messages on first run
  const firstRun = page.getByTestId('scheduler-run').nth(0)
  await firstRun.getByTestId('view-messages').click()

  // Modal should open with messages
  await expect(page.getByText('Plan this feature')).toBeVisible()
  await expect(page.getByText('I will create a plan')).toBeVisible()

  // Close modal
  await page.getByTestId('close-modal').click()
  await expect(page.getByText('Plan this feature')).not.toBeVisible()
})
```

- [ ] **Step 3: Run E2E tests**

Run: `cd ~/projects/server-dashboard/frontend && DISPLAY=:99 npx playwright test e2e/dashboard.spec.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
cd ~/projects/server-dashboard
git add frontend/e2e/dashboard.spec.ts
git commit -m "test: update E2E tests for scheduler schema changes"
```

---

### Task 10: Update backend API test fixtures

**Files:**
- Modify: `backend/tests/test_api.py` (update FAKE_SCHEDULER to include new fields)

- [ ] **Step 1: Update FAKE_SCHEDULER fixture**

```python
FAKE_SCHEDULER = {
    "health": "healthy",
    "runs": [
        {
            "id": 1,
            "repo": "owner/repo",
            "issue_number": 10,
            "session_type": "planning",
            "started_at": "2026-03-20T10:00:00Z",
            "ended_at": "2026-03-20T10:30:00Z",
            "outcome": "completed",
            "pr_number": None,
            "notes": None,
            "validation_reason": "Plan found in comments",
            "events": [],
        }
    ],
}
```

- [ ] **Step 2: Run all backend tests**

Run: `cd ~/projects/server-dashboard/backend && .venv/bin/pytest -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
cd ~/projects/server-dashboard
git add backend/tests/test_api.py
git commit -m "test: update API test fixtures for new scheduler fields"
```
