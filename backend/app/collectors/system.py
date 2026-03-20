import time
from typing import Any

import psutil

MONITORED_MOUNTS = ["/", "/data"]


async def collect() -> dict[str, Any]:
    disks = []
    for mount in MONITORED_MOUNTS:
        usage = psutil.disk_usage(mount)
        disks.append({
            "mount": mount,
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "percent": usage.percent,
        })

    cpu_percent = psutil.cpu_percent(interval=None)

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
