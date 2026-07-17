/* =============================================================================
   demo-data.js — physically plausible SYNTHETIC data for the Passaúna portal.
   Every generator is deterministic-ish (seeded) so charts look stable across
   reloads. When real feeds arrive, replace the `Demo.*` calls with Supabase
   queries returning the SAME shape (see assets/data-source.js notes).

   Passaúna facts baked in: max depth ~17 m, length ~11 km, area ~9 km²,
   subtropical monsoon climate (Curitiba). Warm monomictic-ish behaviour:
   stratifies in summer (Dec–Mar), mixes in winter (Jun–Aug).
   ============================================================================= */
(function (w) {
  // ---- tiny seeded RNG so the "live" values wander smoothly -----------------
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function noise(seed){var r=mulberry32(seed);return r();}

  var DAY = 86400000, HOUR = 3600000;
  function now(){return Date.now();}

  // seasonal helper: 0 in mid-winter (Jul), 1 in mid-summer (Jan) — S. Hemisphere
  function seasonal(t){
    var d=new Date(t), doy=(d-new Date(d.getFullYear(),0,0))/DAY;
    return 0.5+0.5*Math.cos((doy-15)/365*2*Math.PI); // peak ~ Jan 15
  }
  function diel(t){var h=new Date(t).getHours()+new Date(t).getMinutes()/60;return Math.sin((h-9)/24*2*Math.PI);}

  // =========================================================================
  //  1) SENSOR STATIONS (Heltec WiFi LoRa nodes)
  // =========================================================================
  var STATIONS = [
    { id:"PS-01", name:"Dam / Intake",     lat:-25.5205, lon:-49.3880, status:"online" },
    { id:"PS-02", name:"Central Basin",    lat:-25.4790, lon:-49.3760, status:"online" },
    { id:"PS-03", name:"Riverine Inflow",  lat:-25.4430, lon:-49.3670, status:"online" },
    { id:"PS-04", name:"Ferraria Bridge",  lat:-25.4990, lon:-49.3820, status:"demo"   }
  ];

  // latest snapshot for the KPI tiles
  function latest(stationId){
    var t=now(), s=seasonal(t), dn=diel(t), st=stationId||"PS-01";
    var base = st==="PS-03" ? 1.5 : 0; // inflow a touch cooler
    var wt = 15 + 9*s + 1.2*dn - base + (noise(t/HOUR|0)-0.5)*0.6;   // water temp
    var at = 12 + 12*s + 4*dn + (noise((t/HOUR|0)+7)-0.5)*1.4;        // air temp
    var rh = 92 - 22*Math.max(0,dn) - 10*s + (noise((t/HOUR|0)+3)-0.5)*6; // humidity
    var wl = 4.6 + 0.9*s + 0.15*Math.sin(t/DAY/9) + (noise((t/HOUR|0)+11)-0.5)*0.05; // level (m above intake)
    return {
      station: st, time: t,
      water_temp: round(wt,1), air_temp: round(at,1),
      humidity: round(clamp(rh,35,99),0), water_level: round(wl,2),
      battery: round(3.7+0.2*noise((t/HOUR|0)+1),2), rssi: -70-Math.round(30*noise((t/HOUR|0)+5))
    };
  }

  // a time series for the trend charts (default 48 h at 15-min steps)
  function series(kind, hours, stepMin, stationId){
    hours=hours||48; stepMin=stepMin||15;
    var pts=[], t0=now()-hours*HOUR, n=Math.floor(hours*60/stepMin);
    for(var i=0;i<=n;i++){
      var t=t0+i*stepMin*60000, s=seasonal(t), dn=diel(t), j=(t/1e6|0);
      var v;
      switch(kind){
        case "water_temp": v=15+9*s+1.1*dn+(noise(j)-0.5)*0.4; break;
        case "air_temp":   v=12+12*s+4.5*dn+(noise(j+7)-0.5)*1.2; break;
        case "humidity":   v=clamp(90-20*Math.max(0,dn)-9*s+(noise(j+3)-0.5)*5,35,99); break;
        case "water_level":v=4.6+0.9*s+0.15*Math.sin(t/DAY/9)+0.03*Math.sin(t/HOUR/6)+(noise(j+11)-0.5)*0.02; break;
        case "wind":       v=clamp(2.4+2.6*Math.abs(dn)+3*noise(j+13),0,12); break;
        case "solar":      v=Math.max(0,(820+220*s)*Math.max(0,Math.sin((new Date(t).getHours()-6)/12*Math.PI))+(noise(j+2)-0.5)*30); break;
        default: v=noise(j);
      }
      pts.push([t, round(v, kind==="humidity"||kind==="solar"?0:2)]);
    }
    return pts;
  }

  // =========================================================================
  //  2) MODEL FIELD — vertical temperature/velocity profile through time
  //     (GLM 1-D style). Returns {depths[], times[], temp[t][z], u[t][z]}
  // =========================================================================
  function profileTimeDepth(days, stepH){
    days=days||10; stepH=stepH||3;
    var zmax=17, dz=1, depths=[], times=[], temp=[], u=[];
    for(var z=0; z<=zmax; z+=dz) depths.push(z);
    var t0=now()-days*DAY, steps=Math.floor(days*24/stepH);
    for(var i=0;i<=steps;i++){
      var t=t0+i*stepH*HOUR, s=seasonal(t), dn=diel(t);
      times.push(t);
      var surf=16+9*s+1.4*dn;               // surface temp
      var strat=0.55+0.5*s;                  // stratification strength (summer↑)
      var thermo=5+4*s;                      // thermocline depth (m)
      var rowT=[], rowU=[];
      for(var k=0;k<depths.length;k++){
        var z=depths[k];
        var Tz=surf - (surf-13)*(1/(1+Math.exp(-(z-thermo)/ (0.9))))*strat
               - 0.05*z + (noise(((t/HOUR|0)+z*13))-0.5)*0.12;
        rowT.push(round(Tz,2));
        // wind-driven two-layer flow: surface with wind, return flow below thermocline
        var wind=0.8+1.6*Math.abs(dn)+noise((t/HOUR|0)+z);
        var dir=z<thermo?1:-0.7;
        var Uz=dir*wind*Math.exp(-Math.abs(z-(z<thermo?0:zmax))/6)*3.5; // cm/s
        rowU.push(round(Uz,2));
      }
      temp.push(rowT); u.push(rowU);
    }
    return { depths:depths, times:times, temp:temp, u:u };
  }

  // =========================================================================
  //  3) SURFACE FIELD — reservoir surface temperature / level map (Delft3D 2-D)
  //     Returns a grid over a stylised reservoir footprint for a given frame.
  // =========================================================================
  function surfaceField(frame, kind){
    frame=frame||0; kind=kind||"sst";
    // stylised curved reservoir: 60 x 24 grid, mask defines water cells
    var NX=64, NY=26, x=[], y=[], z=[];
    for(var i=0;i<NX;i++) x.push(i);
    for(var j=0;j<NY;j++) y.push(j);
    var t=now()+frame*3*HOUR, s=seasonal(t);
    for(var jj=0;jj<NY;jj++){
      var row=[];
      for(var ii=0;ii<NX;ii++){
        // reservoir centerline meanders; width varies (narrow riverine → wide dam)
        var cx=jj*0.9;
        var center=13+7*Math.sin((ii/NX)*3.1)+ (ii/NX)*2;
        var halfw=3.5+4.5*(ii/NX);                 // widens toward the dam (left)
        var inside=Math.abs(jj-center)<halfw && ii>1 && ii<NX-1;
        if(!inside){ row.push(null); continue; }
        var val;
        if(kind==="sst"){
          var along=ii/NX; // inflow(right)=cooler, dam(left)=warmer
          val=17+8*s + 2.2*(1-along) - 1.6*(1-along) + Math.sin((ii+frame)/6)*0.5
              + Math.cos((jj+frame)/5)*0.4;
        } else if(kind==="level"){
          val=4.7+0.9*s - (ii/NX)*0.05 + Math.sin((ii+frame)/9)*0.02;
        } else { // velocity magnitude
          val=Math.abs(2.5*Math.sin((ii+frame)/7)+1.5*Math.cos((jj)/4))*1.4;
        }
        row.push(round(val,2));
      }
      z.push(row);
    }
    return { x:x, y:y, z:z, kind:kind, frame:frame, time:t };
  }

  // =========================================================================
  //  4) FORECAST FORCING — global-model driven inputs (GFS / Open-Meteo / GloFAS)
  // =========================================================================
  function forecastForcing(hoursAhead){
    hoursAhead=hoursAhead||120;
    var wind=[], gust=[], wdir=[], solar=[], airt=[], rain=[], inflow=[], t0=now();
    for(var i=0;i<=hoursAhead;i+=3){
      var t=t0+i*HOUR, s=seasonal(t), h=new Date(t).getHours(), j=(t/HOUR|0);
      var wv=clamp(2.5+3*Math.abs(Math.sin(i/14))+2*noise(j+4),0,14);
      wind.push([t,round(wv,1)]);
      gust.push([t,round(wv*(1.4+0.3*noise(j+9)),1)]);
      wdir.push([t,round((180+120*Math.sin(i/22)+40*noise(j))%360,0)]);
      solar.push([t,round(Math.max(0,(800+240*s)*Math.max(0,Math.sin((h-6)/12*Math.PI))),0)]);
      airt.push([t,round(12+12*s+5*Math.sin((h-9)/24*2*Math.PI),1)]);
      var rn = noise(j+21)>0.82 ? round(noise(j+5)*9,1) : 0;
      rain.push([t,rn]);
      inflow.push([t,round(2.2+1.4*s+ (rn>0?rn*0.35:0) +0.6*noise(j+17),2)]); // m³/s
    }
    return { wind:wind, gust:gust, wdir:wdir, solar:solar, air_temp:airt, rain:rain, inflow:inflow,
             issued:t0, model:"GFS 0.25° + Open-Meteo (demo)", cycle:cycleLabel(t0) };
  }
  function cycleLabel(t){var d=new Date(t);var hc=[0,6,12,18].reduce(function(p,c){return Math.abs(c-d.getUTCHours())<Math.abs(p-d.getUTCHours())?c:p;},0);return d.toISOString().slice(0,10)+" "+String(hc).padStart(2,"0")+"Z";}

  // ---- helpers -------------------------------------------------------------
  function round(v,n){var p=Math.pow(10,n||0);return Math.round(v*p)/p;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

  w.Demo = {
    stations: STATIONS,
    latest: latest,
    series: series,
    profileTimeDepth: profileTimeDepth,
    surfaceField: surfaceField,
    forecastForcing: forecastForcing,
    _util: { round: round, seasonal: seasonal }
  };
})(window);
