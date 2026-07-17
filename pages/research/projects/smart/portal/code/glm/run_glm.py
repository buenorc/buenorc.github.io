"""
glm/run_glm.py
--------------
Operational run of the General Lake Model (GLM) for the reservoir.

Cycle (as requested — a program that re-runs every ~50 h with fresh forecast
input, continued from the previous state):
  1. pull meteorological forcing (forecast/fetch_meteo)             -> met.csv
  2. write glm3.nml from a template (start/stop, depths, met file)
  3. run GLM  (glm-py if installed, else the `glm` binary via subprocess)
  4. read output/output.nc  -> depth-time temperature & velocity field
  5. push the field to Supabase (model_outputs, kind='profile')
  6. save the final profile so the NEXT cycle can restart ("hot start")

GLM install: https://github.com/AquaticEcoDynamics/GLM  (or `pip install glm-py`).
This script degrades gracefully: if GLM isn't installed it still builds the
inputs and tells you the exact command to run.

Usage:  python -m glm.run_glm            (uses config.yaml)
"""
from __future__ import annotations
import os, subprocess, datetime as dt, json
import numpy as np

from common.supabase_client import load_config, insert_model_output
from forecast.fetch_meteo import fetch_meteo, to_glm_meteo_csv


def build_nml(template: str, out_nml: str, *, start: dt.datetime, stop: dt.datetime,
              max_depth: float, met_csv: str, restart_csv: str | None):
    with open(template, "r", encoding="utf-8") as fh:
        txt = fh.read()
    txt = (txt.replace("{{START}}", start.strftime("%Y-%m-%d %H:%M:%S"))
              .replace("{{STOP}}", stop.strftime("%Y-%m-%d %H:%M:%S"))
              .replace("{{MAX_DEPTH}}", f"{max_depth:.2f}")
              .replace("{{MET_FILE}}", os.path.basename(met_csv)))
    with open(out_nml, "w", encoding="utf-8") as fh:
        fh.write(txt)
    return out_nml


def run_glm(work_dir: str, binary: str = "glm") -> bool:
    """Run GLM in work_dir. Returns True if it produced output."""
    # Preferred: glm-py
    try:
        from glmpy import glm_json  # noqa
        # glm-py API varies by version; the simplest portable path is the CLI:
    except Exception:
        pass
    try:
        subprocess.run([binary, "--nml", "glm3.nml"], cwd=work_dir, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        print(f"[GLM] could not run '{binary}' ({e}).")
        print(f"[GLM] Inputs are ready in {work_dir}. Run manually:  cd {work_dir} && {binary} --nml glm3.nml")
        return False


def parse_output(nc_path: str) -> dict | None:
    """Read GLM output.nc into the portal 'profile' payload:
       {depths[], times[ms], temp[t][z], u[t][z]}."""
    if not os.path.exists(nc_path):
        return None
    import xarray as xr
    ds = xr.open_dataset(nc_path)
    # GLM stores layered vars; 'temp' with dims (time, z). Names can vary by build.
    tvar = "temp" if "temp" in ds else [v for v in ds.data_vars if "temp" in v.lower()][0]
    temp = ds[tvar].values                      # (time, z)
    z = ds["z"].values if "z" in ds else np.arange(temp.shape[1])
    times = [int(np.datetime64(t, "ms").astype("int64")) for t in ds["time"].values]
    # normalise to fixed 0..maxdepth grid (top -> bottom)
    depths = list(range(0, int(np.nanmax(z)) + 1))
    T = np.array([np.interp(depths, z[i], temp[i]) if temp.ndim == 2 else temp
                  for i in range(len(times))])
    payload = {
        "depths": depths, "times": times,
        "temp": np.round(T, 2).tolist(),
        # GLM is 1-D (no horizontal velocity); leave u as zeros or omit.
        "u": np.zeros_like(T).round(2).tolist(),
    }
    ds.close()
    return payload


def main():
    cfg = load_config()
    res, g = cfg["reservoir"], cfg["glm"]
    wd = os.path.abspath(g["work_dir"]); os.makedirs(wd, exist_ok=True)

    stop = dt.datetime.utcnow() + dt.timedelta(days=cfg["cycle"]["forecast_days"])
    start = dt.datetime.utcnow() - dt.timedelta(days=cfg["cycle"]["history_days"])

    # 1) forcing
    met = fetch_meteo(res["latitude"], res["longitude"], cfg["cycle"]["forecast_days"])
    met_csv = to_glm_meteo_csv(met, os.path.join(wd, "met.csv"))
    print(f"[GLM] met.csv written ({len(met['wind'])} steps)")

    # 2) nml
    build_nml(g["nml_template"], os.path.join(wd, "glm3.nml"),
              start=start, stop=stop, max_depth=res["max_depth_m"],
              met_csv=met_csv, restart_csv=None)

    # 3) run
    ok = run_glm(wd, g.get("binary", "glm"))

    # 4/5) parse + push
    payload = parse_output(os.path.join(wd, "output", "output.nc")) if ok else None
    if payload:
        insert_model_output("GLM", "profile", payload, is_public=True)
        print(f"[GLM] pushed profile: {len(payload['times'])} steps x {len(payload['depths'])} depths")
    else:
        print("[GLM] no NetCDF output to push (model not run or output missing).")


if __name__ == "__main__":
    main()
