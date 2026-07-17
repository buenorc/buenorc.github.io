"""
common/supabase_client.py
-------------------------
Thin helpers around the Supabase Python client. Uses the SERVICE ROLE key
(server-side only) so the pipeline can INSERT sensor/model/forecast rows,
bypassing Row Level Security. Never ship this key to the browser.
"""
from __future__ import annotations
import os
import yaml
from functools import lru_cache

try:
    from supabase import create_client, Client
except ImportError:  # allow importing this module even before deps are installed
    create_client = None
    Client = object  # type: ignore


@lru_cache(maxsize=1)
def load_config(path: str | None = None) -> dict:
    path = path or os.environ.get("LAKETWIN_CONFIG", "config.yaml")
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def get_client(path: str | None = None) -> "Client":
    if create_client is None:
        raise RuntimeError("Install the 'supabase' package: pip install supabase")
    cfg = load_config(path)["supabase"]
    return create_client(cfg["url"], cfg["service_key"])


# ---- convenience upserts ----------------------------------------------------
def upsert_stations(rows: list[dict]):
    return get_client().table("stations").upsert(rows).execute()


def insert_sensor_readings(rows: list[dict]):
    """rows: [{station, time(iso), water_temp, air_temp, humidity, water_level, ...}]"""
    return get_client().table("sensor_readings").insert(rows).execute()


def insert_model_output(model: str, kind: str, payload: dict, is_public: bool = True):
    return get_client().table("model_outputs").insert({
        "model": model, "kind": kind, "payload": payload, "is_public": is_public
    }).execute()


def insert_forecast_inputs(source: str, cycle: str, payload: dict):
    return get_client().table("forecast_inputs").insert({
        "source": source, "cycle": cycle, "payload": payload
    }).execute()


def insert_indicators(rows: list[dict]):
    return get_client().table("indicators").insert(rows).execute()
