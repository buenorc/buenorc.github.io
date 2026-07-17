"""
forecast/fetch_meteo.py
-----------------------
Fetch meteorological forcing for the reservoir from a global forecast product.

Default source: Open-Meteo (https://open-meteo.com) — free, no API key, serves
GFS/ICON/ECMWF-blended hourly forecasts. Returns wind speed/direction/gusts,
shortwave radiation, air temperature, humidity and precipitation.

The output dict matches the JSON the website reads from `forecast_inputs.payload`
(same shape as Demo.forecastForcing in assets/demo-data.js), so the front-end
needs no changes when this replaces the demo data.

Run standalone:  python -m forecast.fetch_meteo
"""
from __future__ import annotations
import datetime as dt
import requests

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

HOURLY_VARS = [
    "temperature_2m", "relative_humidity_2m", "precipitation",
    "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
    "shortwave_radiation",
]


def _ms(iso: str) -> int:
    return int(dt.datetime.fromisoformat(iso).timestamp() * 1000)


def fetch_meteo(lat: float, lon: float, forecast_days: int = 5, timezone: str = "auto") -> dict:
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": ",".join(HOURLY_VARS),
        "forecast_days": forecast_days,
        "timezone": timezone,
        "windspeed_unit": "ms",
    }
    r = requests.get(OPEN_METEO, params=params, timeout=30)
    r.raise_for_status()
    h = r.json()["hourly"]
    t = h["time"]

    def pair(var):
        return [[_ms(t[i]), h[var][i]] for i in range(len(t)) if h[var][i] is not None]

    issued = dt.datetime.utcnow()
    return {
        "issued": int(issued.timestamp() * 1000),
        "model": "Open-Meteo (GFS/ICON blend)",
        "cycle": issued.strftime("%Y-%m-%d %HZ"),
        "wind":     pair("wind_speed_10m"),
        "gust":     pair("wind_gusts_10m"),
        "wdir":     pair("wind_direction_10m"),
        "solar":    pair("shortwave_radiation"),
        "air_temp": pair("temperature_2m"),
        "humidity": pair("relative_humidity_2m"),
        "rain":     pair("precipitation"),
    }


def to_glm_meteo_csv(meteo: dict, path: str):
    """Write a GLM-compatible meteorology CSV (time, ShortWave, AirTemp, RelHum,
    WindSpeed, Rain). Rain converted from mm/h to m/day for GLM."""
    import csv
    idx = {p[0]: p[1] for p in meteo["air_temp"]}
    times = sorted(idx.keys())
    lut = {k: {kk[0]: kk[1] for kk in meteo[k]} for k in
           ("solar", "air_temp", "humidity", "wind", "rain")}
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["time", "ShortWave", "AirTemp", "RelHum", "WindSpeed", "Rain"])
        for ms in times:
            iso = dt.datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M:%S")
            rain_mm_h = lut["rain"].get(ms, 0.0)
            w.writerow([iso,
                        round(lut["solar"].get(ms, 0.0), 1),
                        round(lut["air_temp"].get(ms, 0.0), 2),
                        round(lut["humidity"].get(ms, 0.0), 1),
                        round(lut["wind"].get(ms, 0.0), 2),
                        round(rain_mm_h * 24 / 1000.0, 6)])
    return path


if __name__ == "__main__":
    m = fetch_meteo(-25.487, -49.378, forecast_days=5)
    print("cycle:", m["cycle"], "| wind points:", len(m["wind"]))
    print("first wind sample:", m["wind"][0])
