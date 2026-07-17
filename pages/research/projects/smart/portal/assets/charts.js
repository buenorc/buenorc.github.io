/* =============================================================================
   charts.js — visualization helpers (Plotly.js). Loaded after Plotly CDN.
   All builders accept a DOM id and data in the shape produced by demo-data.js
   (or, later, by your Supabase queries). Keep the shapes identical when you
   swap to real data and every chart keeps working.
   ============================================================================= */
(function (w) {
  var ACCENT = "#6785b8", ACCENT2 = "#56AED4";
  var FONT = { family: "Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: "#2b2f36", size: 12 };
  var GRID = "#e2e6ec";
  // perceptually-ordered scale for temperature (cool→warm)
  var THERMAL = [[0,"#2c3e8c"],[0.2,"#2f7fb8"],[0.4,"#56aed4"],[0.55,"#7ec8a9"],
                 [0.7,"#f2d76e"],[0.85,"#ef8f4c"],[1,"#d24b4b"]];
  var BLUES = [[0,"#eaf2fb"],[0.5,"#6785b8"],[1,"#1d3057"]];

  function base(extra) {
    return Object.assign({
      font: FONT, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 54, r: 18, t: 14, b: 42 }, showlegend: false,
      xaxis: { gridcolor: GRID, zeroline: false }, yaxis: { gridcolor: GRID, zeroline: false }
    }, extra || {});
  }
  var CFG = { displmodeBar: false, displayModeBar: false, responsive: true };

  function fmtT(ts) { var d = new Date(ts); return d; }

  // ---- time series (one or many lines) ------------------------------------
  function timeSeries(id, series, opts) {
    opts = opts || {};
    var traces = series.map(function (s, i) {
      return {
        x: s.data.map(function (p) { return fmtT(p[0]); }),
        y: s.data.map(function (p) { return p[1]; }),
        name: s.name, mode: "lines", line: { width: 2.4, color: s.color || (i ? ACCENT2 : ACCENT), shape: "spline" },
        fill: opts.fill && series.length === 1 ? "tozeroy" : undefined,
        fillcolor: "rgba(103,133,184,.12)"
      };
    });
    var lay = base({
      showlegend: series.length > 1, legend: { orientation: "h", y: 1.14, x: 0 },
      yaxis: { gridcolor: GRID, zeroline: false, title: { text: opts.yTitle || "", font: { size: 11 } } },
      xaxis: { gridcolor: GRID, zeroline: false }
    });
    Plotly.react(id, traces, lay, CFG);
  }

  // ---- sparkline for KPI tiles --------------------------------------------
  function spark(id, pts, color) {
    var tr = [{ x: pts.map(function (p, i) { return i; }), y: pts.map(function (p) { return p[1]; }),
      mode: "lines", line: { width: 2, color: color || ACCENT, shape: "spline" }, fill: "tozeroy",
      fillcolor: (color || ACCENT) + "22", hoverinfo: "skip" }];
    var lay = { margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: { visible: false }, yaxis: { visible: false }, showlegend: false };
    Plotly.react(id, tr, lay, CFG);
  }

  // ---- depth–time heatmap (temperature or velocity) -----------------------
  function depthTimeHeatmap(id, field, which) {
    which = which || "temp";
    var Z = which === "temp" ? field.temp : field.u; // [time][depth]
    // transpose to [depth][time]
    var zz = field.depths.map(function (_, k) { return field.times.map(function (_, i) { return Z[i][k]; }); });
    var tr = [{
      z: zz, x: field.times.map(fmtT), y: field.depths, type: "heatmap",
      colorscale: which === "temp" ? THERMAL : "RdBu", reversescale: which === "u",
      colorbar: { title: which === "temp" ? "°C" : "cm/s", thickness: 12, len: .9, outlinewidth: 0 },
      zsmooth: "best"
    }];
    var lay = base({
      margin: { l: 54, r: 70, t: 10, b: 42 },
      yaxis: { title: { text: "Depth (m)", font: { size: 11 } }, autorange: "reversed", gridcolor: GRID },
      xaxis: { gridcolor: GRID }
    });
    Plotly.react(id, tr, lay, CFG);
  }

  // ---- vertical profile at a time index (for animation) -------------------
  function verticalProfile(id, field, idx, which) {
    which = which || "temp";
    var Z = which === "temp" ? field.temp : field.u;
    var vals = field.depths.map(function (_, k) { return Z[idx][k]; });
    var tr = [{
      x: vals, y: field.depths, mode: "lines+markers",
      line: { color: which === "temp" ? ACCENT : "#d24b4b", width: 3, shape: "spline" },
      marker: { size: 6, color: which === "temp" ? ACCENT : "#d24b4b" },
      fill: "tozerox", fillcolor: (which === "temp" ? ACCENT : "#d24b4b") + "14"
    }];
    var xr = which === "temp" ? [11, 27] : [-15, 15];
    var lay = base({
      xaxis: { title: { text: which === "temp" ? "Temperature (°C)" : "Velocity (cm/s)", font: { size: 11 } }, range: xr, gridcolor: GRID },
      yaxis: { title: { text: "Depth (m)", font: { size: 11 } }, autorange: "reversed", gridcolor: GRID }
    });
    Plotly.react(id, tr, lay, CFG);
  }

  // ---- reservoir surface map (2-D field) ----------------------------------
  function surfaceMap(id, gf) {
    var scale = gf.kind === "sst" ? THERMAL : (gf.kind === "level" ? BLUES : "Viridis");
    var unit = gf.kind === "sst" ? "°C" : (gf.kind === "level" ? "m" : "cm/s");
    var tr = [{
      z: gf.z, type: "heatmap", colorscale: scale, zsmooth: "best",
      colorbar: { title: unit, thickness: 12, len: .9, outlinewidth: 0 },
      hovertemplate: "x:%{x} y:%{y}<br>%{z} " + unit + "<extra></extra>"
    }];
    var lay = base({
      margin: { l: 20, r: 70, t: 10, b: 20 },
      xaxis: { visible: false, scaleanchor: "y", constrain: "domain" },
      yaxis: { visible: false, autorange: "reversed" }
    });
    Plotly.react(id, tr, lay, CFG);
  }

  // ---- forecast forcing multi-line ----------------------------------------
  function forcingChart(id, x, y, opts) {
    opts = opts || {};
    var tr = [{
      x: x.map(fmtT), y: y, mode: "lines", line: { color: opts.color || ACCENT, width: 2.2, shape: "spline" },
      fill: opts.fill ? "tozeroy" : undefined, fillcolor: (opts.color || ACCENT) + "20",
      type: opts.bars ? "bar" : "scatter", marker: { color: opts.color || ACCENT }
    }];
    var lay = base({
      margin: { l: 48, r: 12, t: 8, b: 30 }, height: opts.height || 180,
      yaxis: { gridcolor: GRID, title: { text: opts.unit || "", font: { size: 10 } } },
      xaxis: { gridcolor: GRID }
    });
    Plotly.react(id, tr, lay, CFG);
  }

  // ---- wind rose ----------------------------------------------------------
  function windRose(id, forcing) {
    var bins = 16, counts = new Array(bins).fill(0), speed = new Array(bins).fill(0);
    forcing.wdir.forEach(function (d, i) {
      var b = Math.floor(((d[1] % 360) / 360) * bins) % bins;
      counts[b]++; speed[b] += forcing.wind[i][1];
    });
    var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    var r = counts.map(function (c, i) { return c ? speed[i] / c : 0; });
    var tr = [{ r: r, theta: dirs, type: "barpolar", marker: { color: r, colorscale: [[0,ACCENT2],[1,ACCENT]] } }];
    var lay = { font: FONT, paper_bgcolor: "rgba(0,0,0,0)", margin: { l: 30, r: 30, t: 20, b: 20 },
      polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { ticksuffix: " m/s", angle: 45, gridcolor: GRID }, angularaxis: { direction: "clockwise", gridcolor: GRID } }, showlegend: false };
    Plotly.react(id, tr, lay, CFG);
  }

  w.Charts = {
    timeSeries: timeSeries, spark: spark,
    depthTimeHeatmap: depthTimeHeatmap, verticalProfile: verticalProfile,
    surfaceMap: surfaceMap, forcingChart: forcingChart, windRose: windRose
  };
})(window);
