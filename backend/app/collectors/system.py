import time
from typing import Any

import psutil

MONITORED_MOUNTS = [
    {"path": "/host-root", "label": "/", "fallback": "/"},
    {"path": "/data", "label": "/data"},
]


async def collect() -> dict[str, Any]:
    disks = []
    for mount in MONITORED_MOUNTS:
        path = mount["path"]
        try:
            usage = psutil.disk_usage(path)
        except (FileNotFoundError, OSError):
            fallback = mount.get("fallback")
            if fallback:
                try:
                    usage = psutil.disk_usage(fallback)
                except (FileNotFoundError, OSError):
                    continue
            else:
                continue
        disks.append({
            "mount": mount["label"],
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "percent": usage.percent,
        })

    cpu_percent = psutil.cpu_percent(interval=1)

    temp = None
    temps = psutil.sensors_temperatures()
    if temps:
        for entries in temps.values():
            if entries:
                temp = entries[0].current
                break

    load_average = list(psutil.getloadavg())

    mem = psutil.virtual_memory()
    memory = {
        "total_bytes": mem.total,
        "used_bytes": mem.used,
        "percent": mem.percent,
    }

    uptime_seconds = int(time.time() - psutil.boot_time())

    return {
        "disks": disks,
        "cpu_percent": cpu_percent,
        "temperature": temp,
        "load_average": load_average,
        "memory": memory,
        "uptime_seconds": uptime_seconds,
    }
