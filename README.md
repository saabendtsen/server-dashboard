# server-dashboard

A single-page monitoring dashboard for one small home server. A FastAPI backend
polls a handful of local data sources every 15 minutes and serves a React SPA
with four tabs: **Server Overview** (disk, CPU, temperature, load, memory,
uptime), **AI Scheduler** (runs, events and agent messages read from the
scheduler's SQLite history), **GitHub Actions** (recent workflow runs of the
maintainer's repositories) and **Services** (Docker containers with optional
HTTP health checks).

## Status

Personal, experimental homelab tool. It is tailored to the maintainer's own
server layout and is published as-is for reference; it is not a general-purpose
product, has no releases and is maintained occasionally. Breaking changes can
land on `main` at any time.

## How it works

- `backend/app/main.py` exposes `GET /health`, `GET /api/status` (all cached
  collector output), `POST /api/refresh` (immediate re-poll) and
  `GET /api/runs/{run_id}/messages`, and serves the built frontend from
  `backend/static/`.
- `backend/app/collectors/` holds one independent collector per data source
  (`system.py` via psutil, `docker_collector.py` via the Docker socket,
  `github_collector.py` via the `gh` CLI, `scheduler_collector.py` via
  aiosqlite, `health_checker.py` for labelled containers). A failing collector
  never blocks the others; `cache.py` holds the latest results in memory.
- `frontend/` is a Vite + React 19 + Tailwind CSS 4 SPA with Playwright E2E tests.
- `plans/` and `docs/superpowers/` are the design documents the code was built
  from; they describe intent and may lag the implementation.

## Setup

Backend (Python 3.12):

```sh
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest
uvicorn app.main:app --reload --port 8000
```

Frontend (Node.js 20+):

```sh
cd frontend
npm ci
npm run dev          # Vite dev server
npm run lint
npm run build        # output in frontend/dist, copied to backend/static by the Dockerfile
npx playwright test  # E2E tests against a running backend
```

Container:

```sh
docker compose up --build   # http://localhost:8070
```

Configuration is by environment variable:

| Variable | Purpose | Default |
| --- | --- | --- |
| `GITHUB_TOKEN` | token the `gh` CLI uses to list repositories and workflow runs | unset → GitHub tab is empty |
| `SCHEDULER_DB_PATH` | path to the AI Scheduler SQLite history, opened read-only | `~/apps/ai-scheduler/history.db` |

Containers opt into HTTP health checks with the Docker label
`dashboard.healthcheck.url`. The compose file mounts `/var/run/docker.sock`
read-only so the Services tab can list containers.

## Data and privacy

The dashboard reads host metrics, container metadata, the scheduler database and
GitHub workflow metadata and shows them unauthenticated on whatever network it
is exposed to. It stores nothing of its own and has no user accounts, but
**everything it displays about the host is visible to anyone who can reach it**,
so put it behind a reverse proxy with access control or keep it on a private
network. The `GITHUB_TOKEN` is read from the environment and never logged or
returned by the API.

The repository itself contains no credentials or personal data; the design
documents mention the maintainer's own hostnames and paths only generically.

## Third-party material

Dependencies are published under permissive licences: FastAPI, aiosqlite, React
and the Vite/Tailwind toolchain (MIT), uvicorn, psutil and httpx (BSD-3-Clause),
docker-py (Apache-2.0). No fonts, images or data sets are vendored.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Søren Aabendtsen.
