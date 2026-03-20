from unittest.mock import MagicMock, patch

import pytest

from app.collectors.system import collect


def _mock_disk_usage(path):
    if path == "/host-root":
        return MagicMock(total=120_000_000_000, used=60_000_000_000, percent=50.0)
    elif path == "/data":
        return MagicMock(total=256_000_000_000, used=100_000_000_000, percent=39.1)
    raise FileNotFoundError(path)


@pytest.mark.asyncio
async def test_collect_returns_all_metric_keys():
    with (
        patch("app.collectors.system.psutil") as mock_psutil,
    ):
        mock_psutil.disk_usage.side_effect = _mock_disk_usage
        mock_psutil.cpu_percent.return_value = 23.5
        mock_psutil.sensors_temperatures.return_value = {
            "coretemp": [MagicMock(current=45.0)]
        }
        mock_psutil.getloadavg.return_value = (1.2, 0.8, 0.5)
        mock_psutil.virtual_memory.return_value = MagicMock(
            total=16_000_000_000, used=8_000_000_000, percent=50.0
        )
        mock_psutil.boot_time.return_value = 1710000000.0

        result = await collect()

    assert "disks" in result
    assert len(result["disks"]) == 2
    assert result["disks"][0]["mount"] == "/"
    assert result["disks"][1]["mount"] == "/data"

    assert result["cpu_percent"] == 23.5
    assert result["temperature"] == 45.0
    assert result["load_average"] == [1.2, 0.8, 0.5]
    assert result["memory"]["percent"] == 50.0
    assert "uptime_seconds" in result


@pytest.mark.asyncio
async def test_collect_returns_null_temperature_when_sensors_unavailable():
    with patch("app.collectors.system.psutil") as mock_psutil:
        mock_psutil.disk_usage.side_effect = _mock_disk_usage
        mock_psutil.cpu_percent.return_value = 10.0
        mock_psutil.sensors_temperatures.return_value = {}
        mock_psutil.getloadavg.return_value = (0.1, 0.1, 0.1)
        mock_psutil.virtual_memory.return_value = MagicMock(
            total=16_000_000_000, used=4_000_000_000, percent=25.0
        )
        mock_psutil.boot_time.return_value = 1710000000.0

        result = await collect()

    assert result["temperature"] is None
