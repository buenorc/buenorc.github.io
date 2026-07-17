"""
delft3d/mdf_tools.py
--------------------
Read and modify a Delft3D-FLOW master definition file (.mdf).

The classic .mdf format is a list of  `Keyword = value`  records (values may be
numbers, quoted strings, or multi-value lists). This lightweight parser lets you
programmatically change run parameters — most importantly the simulation time
window (Tstart, Tstop, reference date Itdate) — which is what an operational,
rolling-forecast pipeline needs to update every cycle.

If you prefer a maintained library, `hydrolib-core` (Deltares) can also read/write
.mdf/DIMR models:  https://deltares.github.io/HYDROLIB-core/

Example:
    mdf = MDF.read("passauna.mdf")
    mdf["Itdate"] = "#2026-07-11#"
    mdf["Tstart"] = 0.0
    mdf["Tstop"]  = 7200.0            # minutes since Itdate
    mdf.write("passauna_run.mdf")
"""
from __future__ import annotations
import re
from collections import OrderedDict


class MDF:
    def __init__(self, records: "OrderedDict[str,str]"):
        self._r = records

    # ---- dict-like access ----
    def __getitem__(self, k): return self._r[k]
    def __setitem__(self, k, v): self._r[k] = _fmt(v)
    def __contains__(self, k): return k in self._r
    def get(self, k, default=None): return self._r.get(k, default)
    def keys(self): return self._r.keys()

    @classmethod
    def read(cls, path: str) -> "MDF":
        rec: "OrderedDict[str,str]" = OrderedDict()
        cur_key, cur_val = None, []
        with open(path, "r", encoding="latin-1") as fh:
            for line in fh:
                m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$", line.rstrip("\n"))
                if m:
                    if cur_key is not None:
                        rec[cur_key] = " ".join(cur_val).strip()
                    cur_key, cur_val = m.group(1), [m.group(2).strip()]
                else:
                    # continuation line (multi-value)
                    if cur_key is not None and line.strip():
                        cur_val.append(line.strip())
        if cur_key is not None:
            rec[cur_key] = " ".join(cur_val).strip()
        return cls(rec)

    def write(self, path: str):
        with open(path, "w", encoding="latin-1") as fh:
            for k, v in self._r.items():
                fh.write(f"{k} = {v}\n")

    def set_time_window(self, itdate: str, tstart_min: float, tstop_min: float,
                        dt_min: float | None = None):
        """itdate like '#2026-07-11#'; Tstart/Tstop in minutes since Itdate."""
        self["Itdate"] = itdate if itdate.startswith("#") else f"#{itdate}#"
        self["Tstart"] = tstart_min
        self["Tstop"] = tstop_min
        if dt_min is not None:
            self["Dt"] = dt_min
        return self


def _fmt(v) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, float):
        return f"{v:.7e}" if abs(v) >= 1e6 else f"{v:g}"
    return str(v)


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2:
        mdf = MDF.read(sys.argv[1])
        print("Runid   :", mdf.get("Runtxt", "?"))
        for k in ("Itdate", "Tstart", "Tstop", "Dt", "Filwnd", "Fildep"):
            if k in mdf:
                print(f"{k:8s}:", mdf[k])
