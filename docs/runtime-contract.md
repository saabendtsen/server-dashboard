# server-dashboard runtime contract

Version: `1.0.0`

This application-owned contract defines the interface a deployment authority
may rely on. Server-specific ports, paths, image digests, and secret references
belong in the infrastructure repository.

## Image and process

- Image package: `ghcr.io/saabendtsen/server-dashboard`
- Container process: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Architecture: Linux `amd64`
- Listen port: TCP `8000`, fixed in the command rather than configurable
- Health endpoint: `GET /health`, expected HTTP `200`

The health response is `{"status": "ok"}`. Deployment verification must require
both HTTP `200` and the JSON field `status` equal to `ok`.

The application is served at the root of its own port; it has no base path. The
bundled frontend is mounted at `/`, so a request to `/` returns the single-page
application rather than an API response.

## Configuration

| Variable | Required | Contract |
| --- | --- | --- |
| `GITHUB_TOKEN` | no | Protected value. Injected by external secret reference; never in an image, repository or log. Without it the GitHub panel is empty and the application still starts and stays healthy. |
| `SCHEDULER_DB_PATH` | no | Path to another application's SQLite history, opened **read-only**. Defaults to `~/apps/ai-scheduler/history.db`. |

No other variable is read by runtime code.

`SCHEDULER_DB_PATH` names a file this application does not own and never
writes. Nothing mounts it into the container in the deployed configuration, so
that panel is empty in production; the application is healthy regardless. A
deployment that wants the panel populated must mount the file read-only and set
this variable, and must accept that the path is owned by something else.

## Docker socket

The application requires `/var/run/docker.sock` mounted **read-only**.

That is the whole security posture, not a detail. The code calls only
`containers.list(all=True)` and reads image tags, attributes, labels, status and
name. It contains no call that starts, stops, removes, kills, restarts, pauses
or unpauses anything. A release that needs write access to the daemon is a
different application in the security sense and must increment this contract
version and be reviewed before promotion.

## Persistent state and rollback

The application owns no persistent state. Collector results are held in an
in-memory dictionary that is rebuilt after a restart, and no code path writes to
the filesystem. It creates no database and runs no schema migration.

A deployment therefore requires no volume, and rolling back to an earlier
compatible image cannot alter application data, because there is none to alter.

Version `1.0.0` permits automatic rollback between images that preserve this
contract. A release that changes the port, endpoint, required configuration, the
read-only posture toward the Docker socket, or introduces persistent state must
increment the contract version and be reviewed before promotion.
