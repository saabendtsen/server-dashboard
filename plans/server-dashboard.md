# Plan: Server Monitoring Dashboard

> Source PRD: https://github.com/saabendtsen/server-dashboard/issues/1

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: `GET /api/status` (all cached data), `POST /api/refresh` (on-demand fresh poll), `GET /health` (service healthcheck). Frontend served as static files from FastAPI at `/server-dashboard`.
- **Schema**: No own database. Reads AI Scheduler SQLite (`~/apps/ai-scheduler/history.db`) in read-only mode. All other data is ephemeral (Docker API, GitHub CLI, psutil).
- **API response shape**: `/api/status` returns a single JSON object with keys: `system`, `scheduler`, `github_actions`, `services`, `last_updated`. Each key maps to the output of one collector module.
- **Collector pattern**: Each data source has its own collector module with an async `collect()` function returning a typed dict. Collectors are independent — one failing doesn't block others.
- **Caching**: In-memory cache of latest collection results. Background asyncio task refreshes every 15 minutes. `POST /api/refresh` triggers immediate re-collection and returns fresh data.
- **Frontend**: Vite + React + TailwindCSS SPA. Four tabs: Server Overview, AI Scheduler, GitHub Actions, Services. Mobile-first with responsive scaling.
- **Deployment**: Docker multi-stage build (Node.js build stage for frontend → Python production stage for backend). Caddy reverse proxy at `handle_path /server-dashboard*`. CI/CD via GitHub Actions on self-hosted runner, deploy via `~/scripts/deploy.sh server-dashboard`.
- **Docker labels**: Services opt into HTTP healthchecks via `dashboard.healthcheck.url` label on their container. Containers without the label show Docker-level status only.
- **GitHub data**: `gh` CLI (authenticated via `GITHUB_TOKEN` env var) used to discover repos and fetch workflow runs. Only repos with at least one workflow are shown.

---

## Phase 1: Project Skeleton + System Metrics

**User stories**: 11, 12, 13, 14, 15, 19

### What to build

The tracer bullet: a complete vertical slice proving the entire stack works end-to-end.

**Backend**: FastAPI app with a `system_collector` module that uses `psutil` to gather disk usage (root `/` and NVMe `/data`), CPU usage, CPU temperature, load average, memory usage, and uptime. The collector exposes an async `collect()` function returning a typed dict. A `/api/status` endpoint returns the system data. A `/health` endpoint returns OK.

**Frontend**: React SPA with TailwindCSS. Tab navigation component with four tabs (Server Overview active, other three showing "Coming soon" placeholders). Server Overview tab renders the system metrics: disk usage gauges for both drives, CPU/temp/load display, memory bar, and uptime.

**Infrastructure**: Dockerfile (multi-stage: Node build → Python runtime), docker-compose.yml in `~/apps/server-dashboard/`, GitHub Actions CI/CD workflow (test → build → deploy), Caddy `handle_path /server-dashboard*` block. The app is reachable at `wibholmsolutions.com/server-dashboard`.

**Tests**: Backend unit tests for `system_collector` (mock psutil). Integration tests for `/api/status` and `/health` endpoints. Playwright E2E test verifying tab navigation renders and Server Overview tab shows data.

### Acceptance criteria

- [ ] FastAPI app starts and serves React frontend at `/server-dashboard`
- [ ] `GET /api/status` returns system metrics (disk, CPU, temp, load, memory, uptime)
- [ ] `GET /health` returns 200 OK
- [ ] React SPA renders with four tabs, Server Overview tab active by default
- [ ] Server Overview tab displays disk usage for both `/` and `/data`, CPU %, temperature, load average, memory usage, and uptime
- [ ] Temperature gracefully shows "N/A" if sensors are unavailable
- [ ] Mobile-first layout: usable on 375px viewport, scales to desktop
- [ ] Docker multi-stage build produces a working image
- [ ] CI/CD pipeline runs tests, builds image, deploys on push to main
- [ ] Dashboard is accessible at `wibholmsolutions.com/server-dashboard`
- [ ] Backend unit tests pass for `system_collector` with mocked psutil
- [ ] API integration tests pass for `/api/status` and `/health`
- [ ] Playwright E2E test verifies tab navigation and system data rendering

---

## Phase 2: Docker Services

**User stories**: 1, 8, 9, 10

### What to build

Add the Services tab with Docker container autodiscovery and HTTP healthchecks.

**Backend**: `docker_collector` module using Docker SDK to list all running containers. Reads `dashboard.healthcheck.url` label from each container. `health_checker` module performs HTTP GET against annotated containers and reports status code + latency. Extend `/api/status` to include a `services` key with container data.

**Frontend**: Services tab renders a list of Docker containers showing: container name, status (running/stopped/restarting), image name, uptime, and healthcheck result (green/red/grey for pass/fail/no-check) with response latency.

**Infrastructure**: Docker socket must be mounted as read-only volume in the dashboard container (`/var/run/docker.sock:/var/run/docker.sock:ro`).

**Tests**: Unit tests for `docker_collector` (mock Docker SDK client) and `health_checker` (mock HTTP responses). E2E test verifying Services tab populates with container data.

### Acceptance criteria

- [ ] `docker_collector` discovers all running Docker containers
- [ ] Containers with `dashboard.healthcheck.url` label get HTTP healthcheck results
- [ ] Containers without the label show Docker-level status only (no healthcheck)
- [ ] `/api/status` includes `services` key with container list
- [ ] Services tab renders container name, status, image, uptime, and healthcheck result
- [ ] Healthcheck failures show red indicator with status code
- [ ] Healthcheck timeouts (>5s) are handled gracefully
- [ ] Unit tests pass for both `docker_collector` and `health_checker`
- [ ] E2E test verifies Services tab rendering

---

## Phase 3: AI Scheduler

**User stories**: 6, 7

### What to build

Add the AI Scheduler tab showing run history and health status.

**Backend**: `scheduler_collector` module that opens AI Scheduler SQLite DB at a configurable path in read-only mode (`?mode=ro`). Queries the `runs` table for the most recent runs (limit 20). Derives health status from the latest run's outcome: `completed` → healthy, `failed` → unhealthy, `clarification`/`timeout`/`running` → warning, no runs → unknown. Extend `/api/status` to include a `scheduler` key.

**Frontend**: AI Scheduler tab renders: health indicator (colored badge), and a list of recent runs showing outcome (with color coding), repo name, issue number (as link), session type, start/end timestamps, and PR number (as link, if present).

**Tests**: Unit tests for `scheduler_collector` using a temporary SQLite DB with test fixtures. Verify health derivation logic, run ordering, and read-only mode (DB file is not modified). E2E test verifying AI Scheduler tab rendering.

### Acceptance criteria

- [ ] `scheduler_collector` reads AI Scheduler DB in read-only mode
- [ ] Recent runs are returned sorted by start time (newest first), limited to 20
- [ ] Health status is correctly derived from latest run outcome
- [ ] `/api/status` includes `scheduler` key with runs and health
- [ ] AI Scheduler tab renders health indicator badge
- [ ] Run list shows outcome, repo, issue number, session type, timestamps, and PR number
- [ ] Issue and PR numbers render as clickable GitHub links
- [ ] Handles empty database gracefully (no runs → unknown health)
- [ ] Unit tests pass with temporary SQLite fixtures
- [ ] DB file is not modified by the collector (verified in tests)
- [ ] E2E test verifies AI Scheduler tab rendering

---

## Phase 4: GitHub Actions

**User stories**: 2, 3, 4, 5

### What to build

Add the GitHub Actions tab showing a unified list of recent workflow runs across all repos.

**Backend**: `github_collector` module that runs `gh repo list` to discover accessible repos, filters to repos with workflows (`gh api repos/OWNER/REPO/actions/workflows`), then fetches recent runs for each (`gh run list -R REPO --json`). Returns a unified list sorted by creation date (newest first). New repos are automatically included on next poll. Extend `/api/status` to include a `github_actions` key.

**Frontend**: GitHub Actions tab renders a unified list of workflow runs (newest first). Each entry shows: repo name (as badge/tag), workflow name, status/conclusion (with color: green=success, red=failure, yellow=in_progress), and relative timestamp. No grouping by repo — it's one flat, chronological list.

**Infrastructure**: `GITHUB_TOKEN` env var must be available in the container (or `~/.config/gh/` mounted).

**Tests**: Unit tests for `github_collector` mocking subprocess calls to `gh`. Verify: repos without workflows are excluded, runs are merged and sorted correctly, new repos appear automatically. E2E test verifying GitHub Actions tab rendering.

### Acceptance criteria

- [ ] `github_collector` discovers all accessible repos via `gh repo list`
- [ ] Only repos with at least one workflow are included
- [ ] Recent runs from all repos are merged into a single list, sorted newest first
- [ ] New repos with workflows automatically appear without config changes
- [ ] `/api/status` includes `github_actions` key with unified run list
- [ ] GitHub Actions tab renders flat chronological list with repo badge, workflow name, status, and timestamp
- [ ] Status colors: green (success), red (failure), yellow (in_progress), grey (other)
- [ ] Unit tests pass with mocked `gh` subprocess calls
- [ ] E2E test verifies GitHub Actions tab rendering

---

## Phase 5: Background Loop + Refresh

**User stories**: 16, 17

### What to build

Add the background data collection loop and on-demand refresh capability.

**Backend**: An asyncio background task that runs all collectors every 15 minutes and updates the in-memory cache. `POST /api/refresh` endpoint triggers immediate re-collection of all data sources and returns the fresh results. Error handling: if one collector fails, others still run and the failed section returns its last known data with an error flag. Add `last_updated` timestamp to the `/api/status` response.

**Frontend**: Refresh button in the header/toolbar. Pressing it calls `POST /api/refresh`, shows a loading spinner during the request, and updates all tabs with fresh data. "Last updated" timestamp displayed near the refresh button, showing relative time (e.g., "2 min ago").

**Tests**: Unit test verifying the background loop schedules correctly. Integration test verifying `POST /api/refresh` returns fresh data. Test that a failing collector doesn't block others. E2E test verifying refresh button triggers update and loading state.

### Acceptance criteria

- [ ] Background task runs all collectors every 15 minutes
- [ ] `POST /api/refresh` triggers immediate re-collection and returns updated data
- [ ] If one collector fails, others still complete and return data
- [ ] Failed collector section includes error flag and last known data (if any)
- [ ] `/api/status` includes `last_updated` ISO timestamp
- [ ] Refresh button in header triggers `POST /api/refresh`
- [ ] Loading spinner shown during refresh
- [ ] "Last updated" timestamp displays relative time, updates after refresh
- [ ] Unit tests verify background loop scheduling
- [ ] Integration test verifies refresh returns fresh data
- [ ] E2E test verifies refresh button UX

---

## Phase 6: Feedback Widget + Decommission

**User stories**: 18, 20

### What to build

Integrate the feedback widget and decommission the old ai-scheduler-dashboard.

**Feedback**: Copy `FeedbackButton.tsx` from `~/templates/feedback-widget/` into the React app. Configure with `repo="saabendtsen/server-dashboard"` and `apiUrl="https://wibholmsolutions.com/api/feedback"`. Position bottom-right.

**Decommission**: Remove old ai-scheduler-dashboard infrastructure:
1. Disable and remove systemd units: `ai-scheduler-dashboard-export.timer` and `.service`
2. Remove `handle_path /ai-scheduler*` block from Caddy config and reload
3. Remove `dashboard-deploy.yml` workflow from ai-scheduler repo
4. Delete `~/apps/ai-scheduler-dashboard/` directory
5. Delete `~/projects/ai-scheduler/dashboard/` source directory

**Post-launch**: Create GitHub issues on each running project (taskflow, family-budget, feedback-api, dilemma, samtalen, etc.) to add `dashboard.healthcheck.url` Docker labels.

**Tests**: E2E test verifying feedback widget opens, form renders, and submits (mock API). Verify old dashboard URL returns 404.

### Acceptance criteria

- [ ] FeedbackButton renders in bottom-right corner
- [ ] Clicking opens modal with type/title/description form
- [ ] Form submits to feedback API and shows success message
- [ ] `ai-scheduler-dashboard-export.timer` is disabled and removed
- [ ] `handle_path /ai-scheduler*` block removed from Caddyfile
- [ ] `dashboard-deploy.yml` workflow removed from ai-scheduler repo
- [ ] `~/apps/ai-scheduler-dashboard/` directory deleted
- [ ] `~/projects/ai-scheduler/dashboard/` directory deleted
- [ ] `wibholmsolutions.com/ai-scheduler` returns 404
- [ ] GitHub issues created for adding `dashboard.healthcheck.url` labels to running projects
- [ ] E2E test verifies feedback widget interaction
