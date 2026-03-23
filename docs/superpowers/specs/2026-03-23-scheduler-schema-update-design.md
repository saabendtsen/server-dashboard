# Design: Update Dashboard for AI-Scheduler Schema Changes

**Issue:** [server-dashboard#4](https://github.com/saabendtsen/server-dashboard/issues/4)
**Date:** 2026-03-23

## Summary

Update the server-dashboard to display new data from the ai-scheduler schema: `validation_reason`, `run_events` timeline, `pr_number` (already rendered — now populated), and agent `messages` for debugging.

## Approach

Extend the existing `/api/status` flow for lightweight data (validation_reason + events nested per run). Add a single new endpoint for on-demand messages loading.

- **Runs + events:** One query for runs (now includes `validation_reason`), one query for all events matching those run IDs (`WHERE run_id IN (...)`), grouped by `run_id` in Python. Two SQL queries total per collection cycle, served via the existing 15-minute cache.
- **Messages:** New `GET /api/runs/{run_id}/messages` endpoint, no caching (large, rarely accessed). Returns 200 with JSON, 404 if run not found, 204 if messages are NULL (expired by retention).

## Backend

### Scheduler Collector (`scheduler_collector.py`)

Update the runs query to include `validation_reason`:

```sql
SELECT id, repo, issue_number, session_type, started_at, ended_at,
       outcome, pr_number, notes, validation_reason
FROM runs ORDER BY started_at DESC LIMIT 20
```

Add a second query for events:

```sql
SELECT id, run_id, timestamp, event_type, detail
FROM run_events
WHERE run_id IN (...)
ORDER BY timestamp ASC
```

Group events by `run_id` in Python and attach as `events` array on each run dict. Runs with no events get an empty array.

### Messages Query (`scheduler_collector.py`)

Add a `get_run_messages(run_id: int, db_path: str = DEFAULT_DB_PATH)` function that reuses the existing read-only `?mode=ro` URI pattern and error handling. Returns the parsed JSON array, `None` if messages is NULL, or raises `ValueError` if run not found.

### New Endpoint (`main.py`)

```
GET /api/runs/{run_id}/messages
```

- Calls `get_run_messages()` from `scheduler_collector.py`
- Returns 200 with the messages JSON array directly (no envelope)
- Returns 404 if run ID not found
- Returns 204 if `messages` is NULL (expired by retention)
- DB connection errors return 503

No caching — direct DB read on each request.

## TypeScript Types

### Updated `SchedulerRun`

```typescript
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
  validation_reason: string | null  // NEW
  events: RunEvent[]                // NEW
}
```

### New `RunEvent`

```typescript
export interface RunEvent {
  id: number
  timestamp: string
  event_type: string
  detail: string | null
}
```

### New `AgentMessage` (for messages modal)

```typescript
export interface AgentMessage {
  role: string       // "user", "assistant", "system"
  content: string    // message text (may contain markdown)
}
```

The messages endpoint returns a JSON array of these objects directly (no envelope). The array may contain additional fields — the modal should render `role` and `content` and ignore the rest.

**Note:** `SchedulerData` (`{ health, runs }`) does not change — the nested `SchedulerRun` type update propagates automatically.

## Frontend Components

### Run Card Updates (`SchedulerTab.tsx`)

- **Validation reason:** Muted subtitle text below the `OutcomeBadge`, always visible when present.
- **Events toggle:** Expand/collapse button on the card. When expanded, renders `RunEventTimeline` below the card content.
- **Messages button:** "View messages" button that opens `MessagesModal`.

### New: `RunEventTimeline.tsx` (`shared/`)

- Receives `events: RunEvent[]`
- Vertical timeline with thin left border connecting events
- Each event: formatted timestamp, event type label/icon, detail rendered as readable text
- Event type → icon/color mapping (similar to `OutcomeBadge` pattern)
- Event type examples and their `detail` JSON shapes:
  - `session_started`: `{"session_id": "abc123"}` → "Session started"
  - `label_added`: `{"label": "ai-implementing"}` → "Label added: ai-implementing"
  - `label_removed`: `{"label": "ai-planning"}` → "Label removed: ai-planning"
  - `pr_found`: `{"pr_number": 44}` → "PR found: #44"
  - `validation_checked`: `{"passed": true, "reason": "..."}` → "Validation passed" / "Validation failed"
  - `recheck_resolved`: `{"resolution": "merged"}` → "Recheck resolved: merged"
  - `session_completed`: `{"outcome": "completed"}` → "Session completed"
- Unknown event types: render event_type as-is with raw detail string as fallback

### New: `MessagesModal.tsx` (`shared/`)

- Triggered by "View messages" button on run card
- On open: fetches `GET /api/runs/{id}/messages`
- Loading spinner while fetching
- 204 response: "Messages expired" notice
- Renders agent message history as conversation log (alternating user/assistant bubbles based on `role` field)
- Scrollable content, close button

## Testing

### Backend

**`test_scheduler_collector.py` (extend):**
- `validation_reason` included in run dicts
- Events nested correctly per run (including runs with zero events)
- Event grouping logic (multiple runs, events assigned to correct run)

**`test_messages_endpoint.py` (new):**
- 200 with valid messages JSON
- 404 for nonexistent run ID
- 204 when messages is NULL

### Frontend

**`SchedulerTab.test.tsx` (extend):**
- Validation reason renders below outcome badge
- Validation reason absent when null

**`RunEventTimeline.test.tsx` (new):**
- Renders events in correct order
- Formats timestamps
- Handles empty events array

**`MessagesModal.test.tsx` (new):**
- Loading state
- Conversation rendering (user/assistant bubbles)
- Expired messages state
- Close behavior

### E2E (Playwright)

- Extend scheduler tab E2E to verify new elements render with mock data
