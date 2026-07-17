/* =============================================================================
   data-source.js — OPTIONAL adapter that lets pages read from Supabase in
   production and fall back to demo-data.js until then, WITHOUT changing any
   page code. Include it after demo-data.js + auth.js and call e.g.
       const rows = await DataSource.sensorSeries("PS-01","water_temp",48);
   Returned shapes match demo-data.js exactly.

   To activate live data: (1) configure supabase-config.js, (2) create the
   tables in sql/schema.sql, (3) have the Python pipeline insert rows.
   ============================================================================= */
(function (w) {
  var cfg = w.SUPABASE_CONFIG || {};
  var LIVE = !(!cfg.url || cfg.url.indexOf("PASTE_") === 0);
  var sb = (LIVE && w.supabase) ? w.supabase.createClient(cfg.url, cfg.anonKey) : null;

  // latest reading per station
  async function latest(stationId) {
    if (!LIVE) return w.Demo.latest(stationId);
    var r = await sb.from("sensor_readings").select("*")
      .eq("station", stationId).order("time", { ascending: false }).limit(1).maybeSingle();
    return r.data || w.Demo.latest(stationId);
  }

  // time series: returns [[ms, value], ...]
  async function sensorSeries(stationId, metric, hours) {
    if (!LIVE) return w.Demo.series(metric, hours, hours > 72 ? 60 : 15, stationId);
    var since = new Date(Date.now() - hours * 3600e3).toISOString();
    var r = await sb.from("sensor_readings").select("time," + metric)
      .eq("station", stationId).gte("time", since).order("time", { ascending: true });
    if (r.error || !r.data) return w.Demo.series(metric, hours, 15, stationId);
    return r.data.map(function (x) { return [new Date(x.time).getTime(), x[metric]]; });
  }

  // stations list
  async function stations() {
    if (!LIVE) return w.Demo.stations;
    var r = await sb.from("stations").select("*").order("id");
    return (r.data && r.data.length) ? r.data : w.Demo.stations;
  }

  // latest model field (depth-time) — expects JSON payload in model_outputs
  async function profileField() {
    if (!LIVE) return w.Demo.profileTimeDepth(10, 3);
    var r = await sb.from("model_outputs").select("payload")
      .eq("kind", "profile").order("issued", { ascending: false }).limit(1).maybeSingle();
    return (r.data && r.data.payload) ? r.data.payload : w.Demo.profileTimeDepth(10, 3);
  }

  // forecast forcing
  async function forcing(hoursAhead) {
    if (!LIVE) return w.Demo.forecastForcing(hoursAhead);
    var r = await sb.from("forecast_inputs").select("payload")
      .order("issued", { ascending: false }).limit(1).maybeSingle();
    return (r.data && r.data.payload) ? r.data.payload : w.Demo.forecastForcing(hoursAhead);
  }

  w.DataSource = {
    isLive: function () { return LIVE; },
    latest: latest, sensorSeries: sensorSeries, stations: stations,
    profileField: profileField, forcing: forcing
  };
})(window);
