/* =============================================================================
   supabase-config.js  —  EDIT THIS FILE with your own Supabase project.
   -----------------------------------------------------------------------------
   1) Go to https://app.supabase.com  ->  your project  ->  Project Settings
        ->  API.  Copy "Project URL" and the "anon / public" API key.
   2) Paste them below.  These two values are SAFE to expose in front-end code
        (they are public keys); real security comes from Row Level Security
        policies (see  sql/schema.sql ) — never put the service_role key here.
   3) While these are left as "PASTE_...", the portal runs in DEMO MODE:
        - login is simulated locally so you can preview every page,
        - all dashboards use synthetic data from demo-data.js.
   ============================================================================= */
window.SUPABASE_CONFIG = {
  url:      "PASTE_YOUR_SUPABASE_URL_HERE",       // e.g. https://abcdefgh.supabase.co
  anonKey:  "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",  // e.g. eyJhbGciOiJI...

  // Fallback admin(s) used ONLY in DEMO MODE (before Supabase is configured),
  // so you can open admin.html and see the interface. In production the admin
  // role is controlled by the `is_admin` column in the `allowed_emails` table.
  demoAdmins: ["rafael.bueno.itt@gmail.com", "decarvalhobueno@gmail.com"]
};
