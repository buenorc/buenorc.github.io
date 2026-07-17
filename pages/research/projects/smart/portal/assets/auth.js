/* =============================================================================
   auth.js — authentication + email allow-list authorization for the portal.

   Uses Supabase Auth (email/password) + a public `allowed_emails` table that an
   admin manages. Access rules:
     - Anyone can view public pages (overview, importance, reservoir,
       live sensors, public model results).
     - Restricted pages (forecast.html, dashboard.html) require a signed-in user
       whose email is present & enabled in `allowed_emails`.
     - admin.html additionally requires is_admin = true.

   DEMO MODE (no Supabase configured): everything is simulated in-memory so the
   UI is fully explorable. Demo login accepts any email + password length >= 4;
   emails in SUPABASE_CONFIG.demoAdmins get the admin role.
   ============================================================================= */
(function (w) {
  var cfg = w.SUPABASE_CONFIG || {};
  var DEMO = !cfg.url || cfg.url.indexOf("PASTE_") === 0;
  var sb = null;
  if (!DEMO && w.supabase) sb = w.supabase.createClient(cfg.url, cfg.anonKey);

  var state = { ready: false, user: null, allowed: false, isAdmin: false, demo: DEMO };

  // ---- demo session persistence (sessionStorage is fine; not localStorage) --
  function demoLoad() {
    try { return JSON.parse(sessionStorage.getItem("ltwin_demo_user") || "null"); } catch (e) { return null; }
  }
  function demoSave(u) {
    try { u ? sessionStorage.setItem("ltwin_demo_user", JSON.stringify(u))
            : sessionStorage.removeItem("ltwin_demo_user"); } catch (e) {}
  }

  // ---- resolve current session --------------------------------------------
  async function refresh() {
    if (DEMO) {
      var u = demoLoad();
      state.user = u;
      state.allowed = !!u;
      state.isAdmin = !!(u && (cfg.demoAdmins || []).indexOf((u.email || "").toLowerCase()) >= 0);
    } else {
      var { data } = await sb.auth.getUser();
      state.user = data && data.user ? { email: data.user.email, id: data.user.id } : null;
      if (state.user) {
        // check allow-list row
        var r = await sb.from("allowed_emails").select("email,is_admin,enabled")
                  .eq("email", state.user.email.toLowerCase()).maybeSingle();
        var row = r.data;
        state.allowed = !!(row && row.enabled);
        state.isAdmin = !!(row && row.is_admin && row.enabled);
      } else { state.allowed = false; state.isAdmin = false; }
    }
    state.ready = true;
    reflect();
    return state;
  }

  // ---- sign in / up / out --------------------------------------------------
  async function signIn(email, password) {
    email = (email || "").trim().toLowerCase();
    if (DEMO) {
      if (!email || (password || "").length < 4) throw new Error("Enter an email and a password (min 4 chars).");
      var u = { email: email, id: "demo-" + email };
      demoSave(u); await refresh(); return state;
    }
    var { error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    await refresh();
    if (!state.allowed) {
      await sb.auth.signOut(); await refresh();
      throw new Error("This email is not on the access list. Ask an administrator to add it.");
    }
    return state;
  }

  async function signUp(email, password) {
    email = (email || "").trim().toLowerCase();
    if (DEMO) return signIn(email, password);
    // Only pre-approved emails may register.
    var chk = await sb.from("allowed_emails").select("email,enabled").eq("email", email).maybeSingle();
    if (!chk.data || !chk.data.enabled) throw new Error("This email is not pre-approved. Contact an administrator.");
    var { error } = await sb.auth.signUp({ email: email, password: password });
    if (error) throw error;
    return { pendingConfirmation: true };
  }

  async function signOut() {
    if (DEMO) { demoSave(null); } else { await sb.auth.signOut(); }
    await refresh();
    location.href = "index.html";
  }

  // ---- admin: manage the allow-list ---------------------------------------
  async function listAllowed() {
    if (DEMO) {
      var d = demoAllow();
      return d;
    }
    var r = await sb.from("allowed_emails").select("*").order("created_at", { ascending: true });
    if (r.error) throw r.error;
    return r.data;
  }
  async function addAllowed(email, isAdmin) {
    email = (email || "").trim().toLowerCase();
    if (!email) throw new Error("Email required.");
    if (DEMO) { var d = demoAllow(); d.push({ email: email, is_admin: !!isAdmin, enabled: true, created_at: new Date().toISOString() }); demoAllowSave(d); return; }
    var r = await sb.from("allowed_emails").upsert({ email: email, is_admin: !!isAdmin, enabled: true });
    if (r.error) throw r.error;
  }
  async function setEnabled(email, enabled) {
    if (DEMO) { var d = demoAllow().map(function (x) { if (x.email === email) x.enabled = enabled; return x; }); demoAllowSave(d); return; }
    var r = await sb.from("allowed_emails").update({ enabled: enabled }).eq("email", email);
    if (r.error) throw r.error;
  }
  async function setAdmin(email, isAdmin) {
    if (DEMO) { var d = demoAllow().map(function (x) { if (x.email === email) x.is_admin = isAdmin; return x; }); demoAllowSave(d); return; }
    var r = await sb.from("allowed_emails").update({ is_admin: isAdmin }).eq("email", email);
    if (r.error) throw r.error;
  }
  async function removeAllowed(email) {
    if (DEMO) { demoAllowSave(demoAllow().filter(function (x) { return x.email !== email; })); return; }
    var r = await sb.from("allowed_emails").delete().eq("email", email);
    if (r.error) throw r.error;
  }
  function demoAllow() {
    try {
      var d = JSON.parse(sessionStorage.getItem("ltwin_demo_allow") || "null");
      if (!d) { d = (cfg.demoAdmins || []).map(function (e) { return { email: e, is_admin: true, enabled: true, created_at: new Date().toISOString() }; });
                d.push({ email: "colleague@ufpr.br", is_admin: false, enabled: true, created_at: new Date().toISOString() });
                demoAllowSave(d); }
      return d;
    } catch (e) { return []; }
  }
  function demoAllowSave(d) { try { sessionStorage.setItem("ltwin_demo_allow", JSON.stringify(d)); } catch (e) {} }

  // ---- page guard ----------------------------------------------------------
  // mode: "soft" -> show lock veil on [data-guard] blocks; "hard" -> redirect
  async function guard(opts) {
    opts = opts || {};
    if (!state.ready) await refresh();
    var need = opts.admin ? state.isAdmin : state.allowed;
    if (!need) {
      if (opts.mode === "hard") {
        location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
        return false;
      }
      document.querySelectorAll("[data-guard]").forEach(function (el) { showVeil(el, opts.admin); });
    } else {
      document.querySelectorAll("[data-guard] .veil").forEach(function (v) { v.remove(); });
    }
    return need;
  }
  function showVeil(el, admin) {
    if (el.querySelector(".veil")) return;
    el.classList.add("locked");
    var v = document.createElement("div");
    v.className = "veil";
    v.innerHTML = '<i class="fa fa-lock"></i>' +
      '<h3>' + (admin ? "Administrators only" : "Restricted content") + '</h3>' +
      '<p>' + (admin ? "You need an administrator account to view this section."
                     : "Sign in with an approved email to view the forecast forcing and full digital-twin dashboard.") + '</p>' +
      '<p style="margin-top:14px"><a class="btn" href="login.html?next=' +
        encodeURIComponent(location.pathname.split("/").pop()) + '">Sign in</a></p>';
    el.appendChild(v);
  }

  // ---- reflect auth state into the chrome ---------------------------------
  function reflect() {
    var chip = document.getElementById("chrome-user");
    if (chip) {
      if (state.user) {
        var initials = (state.user.email || "?").slice(0, 2).toUpperCase();
        chip.innerHTML = '<span class="userchip"><span class="av">' + initials + '</span>' +
          state.user.email + (state.isAdmin ? ' · <b>admin</b>' : '') +
          ' &nbsp;<a href="#" onclick="PortalAuth.signOut();return false;" style="color:#9fb0cc"><i class="fa fa-sign-out"></i> Logout</a></span>';
      } else {
        chip.innerHTML = '<i class="fa fa-envelope-o"></i> decarvalhobueno@gmail.com &nbsp; · &nbsp;<a href="login.html" style="color:#9fb0cc"><i class="fa fa-sign-in"></i> Login</a>';
      }
    }
    var fa = document.getElementById("foot-auth");
    if (fa) { fa.textContent = state.user ? "Logout" : "Login";
              fa.onclick = state.user ? function (e) { e.preventDefault(); signOut(); } : null;
              if (!state.user) fa.setAttribute("href", "login.html"); }
    // demo-mode banner
    if (state.demo) document.querySelectorAll("[data-demo-badge]").forEach(function (b) { b.classList.remove("hide"); });
  }

  w.PortalAuth = {
    state: state, isDemo: function () { return DEMO; },
    refresh: refresh, signIn: signIn, signUp: signUp, signOut: signOut, guard: guard, reflect: reflect,
    listAllowed: listAllowed, addAllowed: addAllowed, setEnabled: setEnabled, setAdmin: setAdmin, removeAllowed: removeAllowed
  };

  // auto-refresh session on load
  document.addEventListener("DOMContentLoaded", function () { refresh(); });
})(window);
