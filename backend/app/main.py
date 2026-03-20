from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.collectors import system as system_collector

app = FastAPI(title="Server Dashboard")

STATIC_DIR = Path(__file__).parent.parent / "static"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    system_data = await system_collector.collect()
    return {
        "system": system_data,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
