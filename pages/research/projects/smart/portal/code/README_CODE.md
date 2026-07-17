# SMART · LAKE TWIN — Backend code

Python pipeline + microcontroller firmware that feed the web portal.

```
code/
├── requirements.txt
├── config.example.yaml        # copy to config.yaml and fill in
├── common/
│   └── supabase_client.py      # service-role client + insert helpers
├── forecast/
│   ├── fetch_meteo.py          # Open-Meteo/GFS: wind, radiation, air T, rain
│   └── fetch_inflow.py         # GloFAS river discharge (or rating curve)
├── glm/
│   ├── run_glm.py              # operational General Lake Model cycle
│   └── glm3.template.nml       # GLM config template (placeholders filled per run)
├── delft3d/
│   ├── run_delft3d.py          # operational Delft3D-FLOW cycle
│   └── mdf_tools.py            # read/modify .mdf (time window etc.)
├── pipeline/
│   ├── operational_cycle.py    # ONE full cycle: forcing -> models -> push
│   └── scheduler.py            # run every N hours (config: cycle.hours = 50)
└── firmware/
    ├── heltec_lora_node/       # sensor node (Heltec WiFi LoRa 32 V3/V4)
    └── heltec_lora_gateway/    # LoRa->WiFi->Supabase gateway
```

## Quick start

```bash
cd code
python -m venv .venv && source .venv/bin/activate     # optional
pip install -r requirements.txt
cp config.example.yaml config.yaml                    # then edit config.yaml
```

Test the free forecast fetchers (no API key needed):

```bash
python -m forecast.fetch_meteo
python -m forecast.fetch_inflow
```

Run one full cycle (pushes to Supabase — needs config.yaml + schema created):

```bash
python -m pipeline.operational_cycle
```

Run continuously every `cycle.hours` (e.g. 50 h):

```bash
python -m pipeline.scheduler
```

## The operational forecast loop (what you asked for)

`scheduler.py` runs `operational_cycle.run_once()` every ~50 h. Each cycle:

1. **Forcing** — `fetch_meteo` (Open-Meteo/GFS: wind speed & direction, gusts,
   shortwave radiation, air temperature, humidity, precipitation) and
   `fetch_inflow` (GloFAS river discharge). Pushed to `forecast_inputs`.
2. **GLM** — `run_glm` writes `met.csv`, fills `glm3.nml` with the new time
   window, runs GLM, reads `output/output.nc`, and pushes a depth–time
   temperature field to `model_outputs (kind='profile')`.
3. **Delft3D** — `run_delft3d` copies the template model, updates the `.mdf`
   time window via `mdf_tools`, runs Delft3D-FLOW, reads `trim-*.nc`, and pushes
   surface temperature/level grids (`kind='surface'`).
4. **Indicators** — Interwave-Analyzer-style thermocline depth, Schmidt
   stability and Lake number (`indicators` table).

Models re-start from the previous state ("hot start"), so each run continues the
last one with fresh forecast forcing — the same approach used operationally on
Lake Erie (Lin et al., 2022).

## Installing the models

- **GLM** — <https://github.com/AquaticEcoDynamics/GLM> or `pip install glm-py`.
  Put the binary on PATH or set `glm.binary` in config. Replace the hypsography
  (`H`/`A`) in `glm3.template.nml` with Passaúna's real bathymetry.
- **Delft3D-FLOW** — install from Deltares (open source). Set `delft3d.enabled:
  true`, point `delft3d.mdf_template` at your model, and set `delft3d.run_command`
  to your `d_hydro`/`dimr` invocation.

Both runners degrade gracefully: with the model absent they still build every
input file and print the exact command to run.

## Scheduling in production (alternatives to scheduler.py)

**systemd timer** (`/etc/systemd/system/laketwin.service` + `.timer`):

```ini
# laketwin.service
[Service]
Type=oneshot
WorkingDirectory=/opt/laketwin/code
ExecStart=/opt/laketwin/code/.venv/bin/python -m pipeline.operational_cycle
Environment=LAKETWIN_CONFIG=/opt/laketwin/code/config.yaml
```
```ini
# laketwin.timer
[Timer]
OnBootSec=5min
OnUnitActiveSec=50h
[Install]
WantedBy=timers.target
```
`sudo systemctl enable --now laketwin.timer`

**cron** (daily example): `0 3 * * * cd /opt/laketwin/code && .venv/bin/python -m pipeline.operational_cycle >> cycle.log 2>&1`

## Security

The pipeline uses the Supabase **service-role** key (server side only) and can
insert into any table. Never expose it in the website or firmware repo. The
website uses only the public **anon** key; Row Level Security (see
`../sql/schema.sql`) keeps restricted data private.
