# SMART · LAKE TWIN — Passaúna Reservoir Portal

A web portal + backend for monitoring and forecasting the **Passaúna reservoir**,
integrating low-cost IoT sensors (SMART) with hydrodynamic digital-twin modelling
(LAKE TWIN: General Lake Model + Delft3D, data assimilation and machine learning).

It keeps the exact menu/chrome of your existing site (`smart.html`) and adds an
interactive, login-protected portal. Everything works **today** with realistic
demo data, and switches to live feeds once your Supabase project, sensors and
models are online.

---

## 1. What's in here

```
portal/
├── index.html          Overview (public)
├── importance.html     Why it matters (public)
├── reservoir.html      Passaúna + interactive map (public)
├── monitoring.html     Live sensor dashboard — Heltec LoRa (public)
├── models.html         Model results: animated profiles & surface fields (public)
├── forecast.html       Global-model forcing inputs        🔒 members only
├── dashboard.html      Full digital-twin dashboard          🔒 members only
├── admin.html          Manage the email allow-list          🔒 admins only
├── login.html          Sign in
├── assets/
│   ├── portal.css      Theme (reproduces your dark/blue chrome) + components
│   ├── layout.js       Builds the shared menu + portal sub-nav
│   ├── auth.js         Supabase auth + email allow-list guard (demo fallback)
│   ├── supabase-config.js   ← EDIT: your Supabase URL + anon key
│   ├── data-source.js  Demo↔Supabase adapter (same shapes)
│   ├── demo-data.js    Physically-plausible synthetic data
│   └── charts.js       Plotly builders (heatmaps, profiles, maps, forcing)
├── sql/
│   └── schema.sql      Supabase tables + Row Level Security policies
└── code/               Python pipeline + Heltec firmware (see code/README_CODE.md)
```

## 2. Deploy the website (GitHub Pages)

The pages are self-contained (theme, charts and auth all load from CDNs), so you
can drop the `portal/` folder anywhere in your `buenorc.github.io` repo. A natural
home, matching your menu, is next to `smart.html`:

```
pages/research/projects/smart/portal/
```

`layout.js` already assumes that depth (5 levels up to the repo root) for the
global menu links. If you place it somewhere else, edit the single `ROOT`
constant at the top of `assets/layout.js`.

Then link it from `smart.html` — e.g. add a button in the project list:

```html
<footer><ul class="nospace inline pushright">
  <li><a class="btn" href="portal/index.html"
         style="width:100%;margin-top:10px;text-align:center">
     SMART · LAKE TWIN — live portal &amp; digital twin</a></li>
</ul></footer>
```

Commit and push — GitHub Pages serves it. Until you configure Supabase, the site
runs in **demo mode** (banner shown) so every page is fully explorable.

## 3. Turn on real login + data (Supabase)

You said you already have a Supabase account. Three short steps:

**(a) Create the database.** Supabase → *SQL Editor* → paste `sql/schema.sql` →
*Run*. It creates the tables and the Row-Level-Security policies, and seeds the
first admin (`rafael.bueno.itt@gmail.com` — edit that line first if you want a
different first admin).

**(b) Connect the website.** Supabase → *Project Settings → API*. Copy *Project
URL* and the *anon/public* key into `assets/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url:     "https://YOURPROJECT.supabase.co",
  anonKey: "eyJhbGciOiJI...",            // the PUBLIC anon key (safe in front-end)
  demoAdmins: ["rafael.bueno.itt@gmail.com"]
};
```

These two values are public by design; real security is the RLS policies. **Never**
put the *service_role* key in the website.

**(c) Add your members.** In Supabase → *Authentication → Users*, create a user
for each approved email (or let them self-register — the code only allows
sign-up for pre-approved emails). Then sign in at `login.html` as the seeded
admin and use `admin.html` to add/remove emails and grant admin rights — exactly
the include/exclude control you asked for.

**How access works**
- Public pages: anyone.
- `forecast.html`, `dashboard.html`: signed-in users whose email is *enabled* in
  `allowed_emails`.
- `admin.html`: users with `is_admin = true`.

## 4. Turn on live sensor + model data

Run the Python pipeline (details in `code/README_CODE.md`):

- **Sensors** — flash `code/firmware/heltec_lora_node` to each Heltec node and
  `code/firmware/heltec_lora_gateway` to one gateway. The gateway posts readings
  into `sensor_readings`; `monitoring.html` shows them.
- **Forecast forcing** — `code/forecast/` pulls wind, radiation, air temp, rain
  (Open-Meteo/GFS) and river inflow (GloFAS) into `forecast_inputs`; `forecast.html`
  shows them.
- **Models** — `code/glm/` and `code/delft3d/` run GLM and Delft3D each cycle and
  push fields into `model_outputs`; `models.html` and `dashboard.html` show them.
- **Automation** — `python -m pipeline.scheduler` re-runs the whole cycle every
  `cycle.hours` (default 50 h), continuing from the previous state.

To flip a dashboard from demo to live, include `assets/data-source.js` and read
via `DataSource.*` (same data shapes) — no other page changes needed.

## 5. Customising

- **Colours/menu**: the theme mirrors your site (`#6785b8` accent, dark header).
  Menu items live in `assets/layout.js` (`globalNav` + `SUBNAV`).
- **Reservoir facts, stations, station map**: `assets/demo-data.js` and
  `reservoir.html`.
- **Institution logos**: drop files in `portal/img/` and reference them (your
  existing logos are in `../img/`).

## 6. Notes & credits

Content is drawn from the **SMART** (Sistema de Monitoramento Avançado de
Reservatórios e Tributários) and **LAKE TWIN** (digital twins for tropical
reservoir forecasting) proposals — de Carvalho Bueno et al., UFPR/PPGEA in
cooperation with SANEPAR, with RPTU Kaiserslautern-Landau, U. Tartu and Berkeley
Lab. Extends the open-source **Interwave Analyzer**.

> Demo data is synthetic but physically plausible (seasonal stratification,
> diel cycles, wind-driven two-layer flow). Replace with live feeds as they come
> online — the front-end does not change.
