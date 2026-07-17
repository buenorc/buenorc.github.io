/* =============================================================================
   layout.js — builds the shared site chrome (identical menu structure to
   smart.html) plus the portal sub-navigation. Include on every portal page:
     <script src="assets/layout.js"></script>
     <script>Portal.chrome({active:'overview'});</script>
   ============================================================================= */
(function (w) {
  // Relative path from  pages/research/projects/smart/portal/  to the repo root
  var ROOT = "../../../../../";

  // ---- Global top menu (mirrors smart.html exactly) -----------------------
  function globalNav() {
    return `
    <li><a href="${ROOT}index.html">Home</a></li>
    <li><a class="drop" href="#">About me</a>
      <ul>
        <li><a href="${ROOT}pages/about-me.html">About me</a></li>
        <li><a href="${ROOT}pages/tools.html">Tools</a></li>
        <li><a href="${ROOT}pages/publications.html">Publications</a></li>
        <li><a href="${ROOT}limnotronic/index.html">Limnotronic</a></li>
      </ul>
    </li>
    <li class="active"><a class="drop" href="#">Research</a>
      <ul>
        <li><a href="${ROOT}pages/research/wave/wave.html">Internal Waves</a></li>
        <li><a href="${ROOT}pages/research/monitoring/monitoring.html">Sensors Development</a></li>
        <li><a href="${ROOT}pages/research/current/current.html">Gravity Currents</a></li>
        <li class="active"><a href="${ROOT}pages/research/projects/projects.html">Research Projects</a></li>
      </ul>
    </li>
    <li><a class="drop" href="#">Teaching</a>
      <ul>
        <li><a href="${ROOT}pages/modules/modules.html">Modules</a></li>
        <li><a class="drop" href="#">Miscellaneous</a>
          <ul>
            <li><a href="${ROOT}pages/miscellaneous/journal/journal.html">Journal</a></li>
            <li><a href="${ROOT}pages/miscellaneous/experiments/experiments.html">Laboratory</a></li>
          </ul>
        </li>
      </ul>
    </li>
    <li><a href="${ROOT}pages/contact-me.html">Contact me</a>
      <ul><li><a href="${ROOT}pages/opportunities.html">Opportunities</a></li></ul>
    </li>`;
  }

  // ---- Portal sub-navigation (pages inside this project) ------------------
  // lock:true  -> requires login;  admin:true -> requires admin role
  var SUBNAV = [
    { id: "overview",   label: "Overview",       href: "index.html",       icon: "fa-home" },
    { id: "importance", label: "Why it matters",  href: "importance.html",  icon: "fa-lightbulb-o" },
    { id: "reservoir",  label: "Passaúna",        href: "reservoir.html",   icon: "fa-map-marker" },
    { id: "monitoring", label: "Live Sensors",    href: "monitoring.html",  icon: "fa-rss" },
    { id: "models",     label: "Model Results",   href: "models.html",      icon: "fa-cubes" },
    { id: "forecast",   label: "Forecast Inputs", href: "forecast.html",    icon: "fa-cloud",  lock: true },
    { id: "dashboard",  label: "Twin Dashboard",  href: "dashboard.html",   icon: "fa-line-chart", lock: true },
    { id: "admin",      label: "Admin",           href: "admin.html",       icon: "fa-user-secret", admin: true }
  ];

  function subnav(active) {
    var items = SUBNAV.map(function (it) {
      var lock = it.lock ? ' <i class="fa fa-lock" title="Login required"></i>' : "";
      var adm  = it.admin ? ' <i class="fa fa-shield" title="Admin only"></i>' : "";
      var cls  = it.id === active ? "active" : "";
      return `<a class="${cls}" data-nav="${it.id}" href="${it.href}"><i class="fa ${it.icon}"></i> ${it.label}${lock}${adm}</a>`;
    }).join("");
    return `<div class="wrapper subnav-wrap"><div class="hoc"><nav class="subnav">${items}</nav></div></div>`;
  }

  // ---- Breadcrumb ---------------------------------------------------------
  function crumb(pageLabel) {
    return `
    <div class="wrapper row2"><div id="breadcrumb" class="hoc clear"><ul>
      <li><a href="${ROOT}index.html">Home</a></li>
      <li><a href="${ROOT}pages/research/projects/projects.html">Research Projects</a></li>
      <li><a href="index.html">SMART · LAKE TWIN</a></li>
      <li><a>${pageLabel || "Portal"}</a></li>
    </ul></div></div>`;
  }

  // ---- Header + top bar ---------------------------------------------------
  function header() {
    return `
    <div class="wrapper row0"><div id="topbar" class="hoc clear">
      <div class="fl_left"><ul class="faico clear">
        <li><a class="faicon-linkedin" href="https://www.linkedin.com/" target="_blank" rel="noopener"><i class="fa fa-linkedin"></i></a></li>
        <li><a class="faicon-google-plus" href="https://scholar.google.com/" target="_blank" rel="noopener"><i class="fa fa-google"></i></a></li>
        <li><a href="https://github.com/buenorc" target="_blank" rel="noopener"><i class="fa fa-github"></i></a></li>
      </ul></div>
      <div class="fl_right"><ul class="nospace inline pushright">
        <li id="chrome-user"><i class="fa fa-envelope-o"></i> decarvalhobueno@gmail.com</li>
      </ul></div>
    </div></div>

    <div class="wrapper row1"><header id="header" class="hoc clear">
      <div id="logo" class="fl_left">
        <h1><a href="${ROOT}index.html"><span>de Carvalho Bueno</span>, Rafael</a></h1>
        <span class="tag">SMART · LAKE TWIN — Passaúna Reservoir Digital Twin</span>
      </div>
      <nav id="mainav" class="fl_right">
        <ul class="clear">${globalNav()}</ul>
        <select id="mainav-mobile" onchange="if(this.value)location.href=this.value;">
          <option value="">☰ Menu…</option>
          <option value="${ROOT}index.html">Home</option>
          <option value="index.html">Portal · Overview</option>
          <option value="importance.html">Why it matters</option>
          <option value="reservoir.html">Passaúna</option>
          <option value="monitoring.html">Live Sensors</option>
          <option value="models.html">Model Results</option>
          <option value="forecast.html">Forecast Inputs 🔒</option>
          <option value="dashboard.html">Twin Dashboard 🔒</option>
          <option value="admin.html">Admin (admin only)</option>
          <option value="${ROOT}pages/contact-me.html">Contact me</option>
        </select>
      </nav>
    </header></div>`;
  }

  function footer() {
    return `
    <div class="wrapper row5"><div id="copyright" class="hoc clear">
      <p class="fl_left">Copyright &copy; ${new Date().getFullYear()} — SMART · LAKE TWIN — <a href="${ROOT}index.html">de Carvalho Bueno</a></p>
      <p class="fl_right footlinks">
        <a href="importance.html">About the project</a>
        <a href="${ROOT}pages/contact-me.html">Contact</a>
        <a href="login.html" id="foot-auth">Login</a>
      </p>
    </div></div>
    <a id="backtotop" href="#top"><i class="fa fa-chevron-up"></i></a>`;
  }

  // ---- Public API ---------------------------------------------------------
  var Portal = {
    ROOT: ROOT,
    subnavItems: SUBNAV,
    chrome: function (opts) {
      opts = opts || {};
      var host = document.getElementById("chrome");
      var html = header() + crumb(opts.crumb || labelFor(opts.active));
      // sub-nav only shown on portal pages (not login)
      if (opts.subnav !== false) html += subnav(opts.active);
      if (host) host.innerHTML = html;
      // footer
      var f = document.getElementById("chrome-footer");
      if (f) f.innerHTML = footer();
      wireBackToTop();
      if (w.PortalAuth) w.PortalAuth.reflect(); // update user chip / lock states
    }
  };

  function labelFor(id) {
    var it = SUBNAV.filter(function (x) { return x.id === id; })[0];
    return it ? it.label : "Portal";
  }

  function wireBackToTop() {
    var b = document.getElementById("backtotop");
    if (!b) return;
    w.addEventListener("scroll", function () {
      if (w.scrollY > 380) b.classList.add("show"); else b.classList.remove("show");
    });
    b.addEventListener("click", function (e) { e.preventDefault(); w.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  w.Portal = Portal;
})(window);
