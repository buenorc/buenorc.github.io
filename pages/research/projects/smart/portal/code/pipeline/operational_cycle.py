"""
pipeline/operational_cycle.py
-----------------------------
Run ONE full operational cycle of the digital twin:

    forcing (meteo + inflow)  ->  push forecast_inputs
                              ->  run GLM  -> push profile
                              ->  run Delft3D -> push surface (if enabled)
                              ->  compute limnological indicators -> push

Call this from a scheduler (see pipeline/scheduler.py) or from cron/systemd.

Usage:  python -m pipeline.operational_cycle
"""
from __future__ import annotations
import datetime as dt
import numpy as np

from common.supabase_client import (load_config, insert_forecast_inputs,
                                     insert_indicators)
from forecast.fetch_meteo import fetch_meteo
from forecast.fetch_inflow import fetch_inflow_glofas


def compute_indicators(profile_payload: dict) -> list[dict]:
    """Interwave-Analyzer-style indicators from a depth-time temperature field.
    Replace with the real Interwave Analyzer module for full physics."""
    depths = np.array(profile_payload["depths"], dtype=float)
    times = profile_payload["times"]
    T = np.array(profile_payload["temp"], dtype=float)   # (t, z)
    rows = []
    for i, ms in enumerate(times):
        prof = T[i]
        # thermocline depth = depth of max |dT/dz|
        grad = np.abs(np.diff(prof))
        zt = float(depths[1:][np.argmax(grad)]) if len(grad) else float(depths[-1] / 2)
        strat = float(prof[0] - prof[-1])
        # Schmidt stability proxy (J/m^2) — replace with proper integral
        schmidt = round(60 + strat * 22 + float(grad.max() if len(grad) else 0) * 40, 1)
        rows.append({
            "time": dt.datetime.utcfromtimestamp(ms / 1000).isoformat(),
            "thermocline_depth": round(zt, 2),
            "schmidt_stability": schmidt,
            "lake_number": round((strat * 3 + 4) / 1.2, 2),
            "surface_flux": None,
        })
    return rows


def run_once():
    cfg = load_config()
    res = cfg["reservoir"]
    fdays = cfg["cycle"]["forecast_days"]
    stamp = dt.datetime.utcnow().strftime("%Y-%m-%d %HZ")
    print(f"=== operational cycle {stamp} ===")

    # 1) forcing --------------------------------------------------------------
    meteo = fetch_meteo(res["latitude"], res["longitude"], fdays)
    try:
        infl = cfg.get("inflows", [{}])[0]
        inflow = fetch_inflow_glofas(infl.get("latitude", res["latitude"]),
                                     infl.get("longitude", res["longitude"]), fdays)
        meteo["inflow"] = inflow["inflow"]
    except Exception as e:
        print("[cycle] inflow fetch failed:", e)
    insert_forecast_inputs(source=meteo["model"], cycle=meteo["cycle"], payload=meteo)
    print("[cycle] forecast_inputs pushed")

    # 2) GLM ------------------------------------------------------------------
    profile_payload = None
    if cfg["glm"].get("enabled"):
        try:
            from glm.run_glm import main as glm_main
            glm_main()   # pushes model_outputs itself
        except Exception as e:
            print("[cycle] GLM step skipped/failed:", e)

    # 3) Delft3D --------------------------------------------------------------
    if cfg["delft3d"].get("enabled"):
        try:
            from delft3d.run_delft3d import main as d3d_main
            d3d_main()
        except Exception as e:
            print("[cycle] Delft3D step skipped/failed:", e)

    # 4) indicators (from most-recent profile, if we have one) ----------------
    #    Here you would re-read the profile you just pushed; for brevity we
    #    only compute when a payload is available in-process.
    if profile_payload:
        insert_indicators(compute_indicators(profile_payload))
        print("[cycle] indicators pushed")

    print("=== cycle complete ===")


if __name__ == "__main__":
    run_once()
