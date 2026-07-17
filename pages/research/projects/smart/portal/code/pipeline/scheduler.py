"""
pipeline/scheduler.py
---------------------
Continuously run the operational cycle every N hours (config: cycle.hours,
e.g. 50). This is the "program that runs every 50 hours with new information"
you described.

Three ways to schedule — pick ONE:

  A) This script (simplest, keeps a process alive):
        python -m pipeline.scheduler

  B) cron (Linux) — run every 50 h is awkward in cron; use hours list or a
     wrapper. Example every day at 03:00:
        0 3 * * *  cd /path/to/code && /usr/bin/python -m pipeline.operational_cycle >> cycle.log 2>&1

  C) systemd timer (robust, survives reboots): see code/pipeline/systemd/ below
     in the setup guide.

This loop also runs one cycle immediately on start, then sleeps.
"""
from __future__ import annotations
import time, traceback
from common.supabase_client import load_config
from pipeline.operational_cycle import run_once


def main():
    cfg = load_config()
    hours = float(cfg["cycle"]["hours"])
    period = hours * 3600
    print(f"[scheduler] running every {hours} h. Ctrl-C to stop.")
    while True:
        t0 = time.time()
        try:
            run_once()
        except Exception:
            print("[scheduler] cycle error:\n", traceback.format_exc())
        elapsed = time.time() - t0
        sleep_for = max(60, period - elapsed)
        print(f"[scheduler] next cycle in {sleep_for/3600:.1f} h")
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()
