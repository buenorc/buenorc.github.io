"""
forecast/fetch_inflow.py
------------------------
Forecast river inflow (tributary discharge) for the reservoir.

Default source: Open-Meteo Flood API (https://open-meteo.com/en/docs/flood-api),
which serves GloFAS river-discharge forecasts — free, no key. For a specific
gauge you can instead apply a rainfall-runoff or rating-curve model; a simple
rating-curve helper is included.

Output: [[ms, discharge_m3s], ...]  plus metadata, matching the website shape.

Run standalone:  python -m forecast.fetch_inflow
"""
from __future__ import annotations
import datetime as dt
import requests

FLOOD_API = "https://flood-api.open-meteo.com/v1/flood"


def _ms(iso: str) -> int:
    # flood API returns daily dates 'YYYY-MM-DD'
    return int(dt.datetime.fromisoformat(iso).timestamp() * 1000)


def fetch_inflow_glofas(lat: float, lon: float, forecast_days: int = 5) -> dict:
    params = {
        "latitude": lat, "longitude": lon,
        "daily": "river_discharge",
        "forecast_days": min(forecast_days, 30),
    }
    r = requests.get(FLOOD_API, params=params, timeout=30)
    r.raise_for_status()
    d = r.json()["daily"]
    series = [[_ms(d["time"][i]), d["river_discharge"][i]]
              for i in range(len(d["time"])) if d["river_discharge"][i] is not None]
    return {
        "source": "GloFAS via Open-Meteo Flood API",
        "issued": int(dt.datetime.utcnow().timestamp() * 1000),
        "inflow": series,
    }


def rating_curve_inflow(level_series_m, a: float = 12.0, b: float = 2.1, h0: float = 0.2) -> list:
    """Convert a measured stage (water level) series to discharge with a
    power-law rating curve  Q = a * (h - h0)^b .  Calibrate a, b, h0 to your
    gauge. `level_series_m` = [[ms, stage_m], ...]."""
    out = []
    for ms, h in level_series_m:
        head = max(0.0, h - h0)
        out.append([ms, round(a * head ** b, 3)])
    return out


if __name__ == "__main__":
    q = fetch_inflow_glofas(-25.444, -49.367, forecast_days=5)
    print("inflow points:", len(q["inflow"]))
    if q["inflow"]:
        print("first:", q["inflow"][0])
