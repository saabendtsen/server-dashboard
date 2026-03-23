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

### New Endpoint (`main.py`)

```
GET /api/runs/{run_id}/messages
```

- Queries `SELECT messages FROM runs WHERE id = ?`
- Returns 200 with raw JSON body
- Returns 404 if run ID not found
- Returns 204 if `messages` is NULL

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

## Frontend Components

### Run Card Updates (`SchedulerTab.tsx`)

- **Validation reason:** Muted subtitle text below the `OutcomeBadge`, always visible when present.
- **Events toggle:** Expand/collapse button on the card. When expanded, renders `RunEventTimeline` below the card content.
- **Messages button:** "View messages" button that opens `MessagesModal`.

### New: `RunEventTimeline.tsx` (`shared/`)

- Receives `events: RunEvent[]`
- Vertical timeline with thin left border connecting events
- Each event: formatted timestamp, event type label/icon, parsed `detail` JSON as readable text
- Event type → icon/color mapping (similar to `OutcomeBadge` pattern)
- Event type examples: `session_started`, `label_added`, `label_removed`, `validation_checked`, `pr_found`, `recheck_resolved`

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
