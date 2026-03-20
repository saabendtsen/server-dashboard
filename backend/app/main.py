import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.cache import get_cached, run_all_collectors

logger = logging.getLogger(__name__)

REFRESH_INTERVAL = 900  # 15 minutes in seconds
STATIC_DIR = Path(__file__).parent.parent / "static"


async def _background_refresh_loop():
    """Periodically refresh all collectors. Runs until cancelled."""
    while True:
        try:
            await run_all_collectors()
            logger.info("Background refresh completed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Background refresh failed")
        await asyncio.sleep(REFRESH_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initial collection + background task. Shutdown: cancel task."""
    # Initial collection
    try:
        await run_all_collectors()
        logger.info("Initial collection completed")
    except Exception:
        logger.exception("Initial collection failed")

    # Start background loop
    task = asyncio.create_task(_background_refresh_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Server Dashboard", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    cached = get_cached()
    if cached is None:
        # Fallback if lifespan hasn't run yet
        return await run_all_collectors()
    return cached


@app.post("/api/refresh")
async def refresh():
    """Trigger immediate re-collection of all data sources."""
    return await run_all_collectors()


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
