"""
delft3d/run_delft3d.py
----------------------
Operational Delft3D-FLOW run for the reservoir surface fields.

Cycle:
  1. copy the template model into a fresh run dir
  2. update the .mdf time window (Itdate / Tstart / Tstop) to the new forecast
  3. write meteo forcing (space-varying or uniform) from the forecast
  4. run Delft3D-FLOW (subprocess -> d_hydro / dimr)
  5. read trim-*.nc  -> surface temperature / level grid
  6. push to Supabase (model_outputs, kind='surface')

Delft3D is NOT a pip package — install Delft3D-FLOW (Deltares, open source) and
set `delft3d.run_command` + paths in config.yaml. This script builds all inputs
and, if the executable is missing, prints the exact command to run by hand.

Usage:  python -m delft3d.run_delft3d
"""
from __future__ import annotations
import os, shutil, subprocess, datetime as dt, glob
import numpy as np

from common.supabase_client import load_config, insert_model_output
from forecast.fetch_meteo import fetch_meteo
from delft3d.mdf_tools import MDF


def prepare_run(template_mdf: str, run_dir: str, start: dt.datetime, days: int) -> str:
    os.makedirs(run_dir, exist_ok=True)
    # copy the whole model folder (grid, dep, bnd, bca, etc.)
    src_dir = os.path.dirname(os.path.abspath(template_mdf))
    for f in os.listdir(src_dir):
        shutil.copy2(os.path.join(src_dir, f), run_dir)
    run_mdf = os.path.join(run_dir, "run.mdf")
    mdf = MDF.read(template_mdf)
    mdf.set_time_window(itdate=start.strftime("#%Y-%m-%d#"),
                        tstart_min=0.0, tstop_min=days * 24 * 60.0)
    mdf.write(run_mdf)
    return run_mdf


def write_uniform_wind(run_dir: str, meteo: dict):
    """Write a simple time-series wind file (.wnd) — uniform over the domain.
    For space-varying meteo use Delft3D's meteo-on-grid (.amu/.amv/.amt)."""
    path = os.path.join(run_dir, "meteo.wnd")
    with open(path, "w") as fh:
        for (ms, spd), (_, dirn) in zip(meteo["wind"], meteo["wdir"]):
            minutes = (ms - meteo["wind"][0][0]) / 60000.0
            fh.write(f"{minutes:.1f} {spd:.2f} {dirn:.0f}\n")
    return path


def run_model(run_dir: str, run_command: str) -> bool:
    try:
        subprocess.run(run_command, cwd=run_dir, shell=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        print(f"[Delft3D] could not run ({e}).")
        print(f"[Delft3D] Inputs ready in {run_dir}. Run:  cd {run_dir} && {run_command}")
        return False


def parse_trim_surface(run_dir: str, var: str = "temp") -> dict | None:
    """Read the last time step surface layer from trim-*.nc into a 'surface'
    payload {x[], y[], z[][], kind}. Variable names depend on your model
    (e.g. 'R1' temperature, 'S1' water level)."""
    files = glob.glob(os.path.join(run_dir, "trim-*.nc"))
    if not files:
        return None
    import xarray as xr
    ds = xr.open_dataset(files[0])
    name = {"temp": "R1", "level": "S1"}.get(var, var)
    if name not in ds:
        cand = [v for v in ds.data_vars if var[:3].lower() in v.lower()]
        if not cand:
            ds.close(); return None
        name = cand[0]
    da = ds[name].isel(time=-1)
    arr = np.asarray(da.values)
    surf = arr[0] if arr.ndim == 3 else arr        # top layer
    surf = np.where(np.isfinite(surf), surf, None)
    payload = {
        "x": list(range(surf.shape[1])), "y": list(range(surf.shape[0])),
        "z": np.round(np.array(surf, dtype=float), 2).tolist(),
        "kind": "sst" if var == "temp" else var,
        "time": int(np.datetime64(ds["time"].values[-1], "ms").astype("int64")),
    }
    ds.close()
    return payload


def main():
    cfg = load_config()
    if not cfg["delft3d"].get("enabled"):
        print("[Delft3D] disabled in config (delft3d.enabled: false). Enable once your model exists.")
        return
    res, d = cfg["reservoir"], cfg["delft3d"]
    start = dt.datetime.utcnow()
    run_dir = os.path.join(os.path.abspath(d["work_dir"]),
                           "run_" + start.strftime("%Y%m%d_%H"))
    prepare_run(d["mdf_template"], run_dir, start, cfg["cycle"]["forecast_days"])
    meteo = fetch_meteo(res["latitude"], res["longitude"], cfg["cycle"]["forecast_days"])
    write_uniform_wind(run_dir, meteo)
    ok = run_model(run_dir, d["run_command"])
    if ok:
        for var in ("temp", "level"):
            payload = parse_trim_surface(run_dir, var)
            if payload:
                insert_model_output("Delft3D", "surface", payload, is_public=True)
                print(f"[Delft3D] pushed surface {var} grid {len(payload['y'])}x{len(payload['x'])}")


if __name__ == "__main__":
    main()
