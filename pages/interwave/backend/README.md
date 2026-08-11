# Precompiled version — request form backend

The page [`precompiled.html`](../precompiled.html) posts the request form to a small
Google Apps Script web app ([`Code.gs`](Code.gs)), which:

1. validates the submission and rejects bots (hidden honeypot field);
2. logs the request in a Google spreadsheet (created automatically);
3. e-mails the applicant the download of the precompiled version, using the template
   agreed for Interwave Analyzer;
4. sends you a copy/notification of every request;
5. optionally revokes the access after 30 days (Google Drive delivery mode).

Everything runs on your own Google account — no paid service, no Microsoft Forms.

---

## Why a link and not an attachment

`InterwaveAnalyzer.exe` is **127 MB**. Gmail (and every other provider) caps attachments
at 25 MB and blocks `.exe` files outright, including inside `.zip` archives — such a
message would bounce or arrive stripped. The e-mail therefore carries a download link,
which is also what makes the 30-day expiry possible.

---

## Why the previous setup kept dying — and what stops it here

Apps Script does not decay on its own, but a web app has a handful of failure
modes that are **completely silent**: the visitor sees an error, you see nothing.
These are the usual ones, and all of them are now either prevented or detected.

| What breaks | Why it is silent | Handled by |
|---|---|---|
| The page points at the `/dev` test URL | `/dev` only runs while *you* are logged in; everyone else gets a Google login page | The check workflow refuses a `/dev` URL; the comment next to `ENDPOINT` says the same |
| Code edited but not re-deployed, or the deployment archived | The old (or no) version keeps answering | Daily check reads the live URL, not the source |
| **Deployed under the ufpr.br account** — Workspace admins can forbid "Anyone" web apps, and revoke it later | Nothing tells you the policy changed | Deploy under your **personal gmail account**; the daily check catches a revocation |
| Authorisation expired (password change, or Google dropping an unused grant) | Executions just start failing | Daily check |
| Daily quota reached (100 e-mails/day on a free account) | Later requests fail for the rest of the day | Daily check + the per-request notification you receive |
| **The shared file was deleted and re-created** (see below) | The link 404s, the form still says "sent" | Release folder, never `dist/` |
| The e-mail arrives in the applicant's spam folder | They think nothing was sent | The success panel tells them to look there |

Two mechanisms cover the rest:

- **`.github/workflows/interwave-request-service.yml`** (in this repository) pings
  the service every morning and fails if it does not answer `status=ok, ready=true`.
  GitHub then e-mails you. It runs on GitHub's infrastructure, so it still works
  when the Google side is entirely dead. Note that GitHub disables scheduled
  workflows in a repository with no commits for 60 days — it warns you by e-mail
  before doing so; pushing anything re-enables it.
- **The page never depends on the backend to be useful.** If the service does not
  answer within 20 s, the visitor gets a button that opens their mail client with
  the request already written, addressed to you. Worst case you answer by hand —
  nobody is left with a form that quietly did nothing.

---

## Setup (about 10 minutes)

### 1. Publish the executable — never share `dist/`

`app/build.py` **deletes** `dist/InterwaveAnalyzer.exe` before every build
(`remove_path(EXE_PATH)`). In OneDrive and Google Drive a file that is deleted and
re-created is a *new* file with a new id, so every share link already handed out
stops working — silently. Share a folder that only ever gains files:

```bash
python build.py --release
```

Every build now leaves `dist/` already named `InterwaveAnalyzer-<version>.exe`, and
`--release` copies it to `Main!_v2/releases/` together with
`interwave_user_manual_v<version>.pdf` and a `.sha256` file, printing the checksum.
`python build.py --publish-only` does just that copy, for a build you already have.

`IWA_RELEASE_DIR` chooses the destination. Point it at a folder synchronised by
Google Drive for Desktop and publishing a release becomes a single command — the
file is in the shared folder as soon as the sync finishes, with nothing to upload
by hand.

The version is read from the compiled manual (`manual/main.pdf`): the newest release
listed in its change-notes table — currently **2.260810**. The manual ships with the
software, so what it announces *is* the release. The `version:` headers inside the
`iw*.py` modules are not used: they still read 2.260305 in a 2.260810 build.

### The manual on the website

[`user-manual.html`](../user-manual.html) embeds `manual/main.pdf` — a fixed name.
At each release, copy `Main!_v2/manual/main.pdf` over
`pages/interwave/manual/main.pdf` and the page is up to date with no editing. Keep
the outgoing one as `interwave_user_manual_v<version>.pdf` (the copy `--release`
already made) and add it to the *Previous Versions* buttons if you want it listed.

**Option A — Google Drive folder (`DELIVERY_MODE = 'folder'`) — recommended**

1. Put the `releases` folder in Google Drive (or point Drive for Desktop at it).
2. Copy the folder id from its URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.
3. Set `DRIVE_FOLDER_ID`. The script always shares the **newest** matching file in
   that folder and reads the version from its name, so publishing a new release is
   *only* `python build.py --release` — no property to edit, no re-deployment,
   nothing on the website to change. Each applicant gets individual access, revoked
   after 30 days.

Keep the folder private — the per-person sharing *is* the access control. One
limitation to know: `addViewer()` only accepts Google accounts, so for an
institutional address that is not one, the script falls back to making that file
readable by anyone with the link. Those downloads are no longer individually gated.

**Option B — one fixed Google Drive file (`DELIVERY_MODE = 'drive'`)**

Upload the exe, set `DRIVE_FILE_ID` from `https://drive.google.com/file/d/<FILE_ID>/view`.
For a new release use Drive's **Manage versions → Upload new version**, which keeps
the same id and link. Uploading it as a *new file* instead breaks every link.

**Option C — OneDrive link (`DELIVERY_MODE = 'link'`, the default)**

1. In OneDrive open the `releases` folder, right-click the new
   `InterwaveAnalyzer-<version>.exe` → **Share** → **Anyone with the link** → **Can view**.
2. Copy the URL, append `&download=1` to skip the OneDrive preview page, and paste
   it into `DOWNLOAD_URL`. Update `VERSION` and `CHECKSUM` in the same screen.
3. This is the only mode that needs three properties updated at each release, and
   the only one where the 30-day expiry depends on OneDrive's own link settings
   rather than on the script.

### 2. Create the Apps Script project

> **Sign in with the account that owns the release folder** — `decarvalhobueno@gmail.com`.
> The script reads that folder and shares files from it as itself, so a project
> created under another account simply cannot see it (share the folder with that
> account as *Editor* if you ever need to split them).
>
> Not the ufpr.br account either way: a Workspace administrator can forbid — or
> later revoke — web apps open to "Anyone", and that is one of the ways a working
> script suddenly stops answering.
>
> The applicant's e-mail then arrives *from* that account, with `REPLY_TO` as the
> reply address. The release folder itself stays private: access is granted per
> person, per request, and withdrawn after 30 days.

1. Go to <https://script.google.com> → **New project**, name it `Interwave request handler`.
2. Delete the placeholder code and paste the whole content of [`Code.gs`](Code.gs).
3. In `setup()` (bottom of the file), set the delivery: `DELIVERY_MODE: 'folder'`
   plus `DRIVE_FOLDER_ID`, or `'drive'` plus `DRIVE_FILE_ID`, or `'link'` plus
   `DOWNLOAD_URL`.
4. Select `setup` in the function dropdown → **Run**, and accept the Google
   authorisation prompt (it asks for Gmail, Drive and Spreadsheet access; the
   "unverified app" warning is expected for your own scripts — *Advanced* →
   *Go to project (unsafe)*).
   This stores the configuration, creates the log spreadsheet and installs the
   daily expiry trigger. The spreadsheet URL is printed in the execution log.

### 3. Deploy it as a web app

1. **Deploy** → **New deployment** → gear icon → **Web app**.
2. Description: `v1`; **Execute as:** *Me*; **Who has access:** *Anyone*.
   *Execute as: User accessing the web app* would need every visitor to have a
   Google account and to authorise your script — it cannot work here.
3. **Deploy**, then copy the **Web app URL** (ends in `/exec`).
   The `/dev` URL shown next to it works **only for you**; using it is the single
   most common reason these forms appear to work in testing and fail for everyone
   else.

### 4. Connect the page

In [`precompiled.html`](../precompiled.html), near the bottom, replace the placeholder:

```js
var ENDPOINT = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

with the `/exec` URL, then commit and push the site.

### 5. Test

- Open the `/exec` URL in a browser: it must answer `{"status":"ok", ..., "ready":true}`.
- Run `testEmail()` from the editor to preview the message in your own inbox.
- Submit the real form once with your own address.

---

## Day-to-day use

| Task | What to do |
|---|---|
| New release, `folder` mode | `python build.py --release`, then copy `manual/main.pdf` onto the website. Nothing else — the handler picks the newest file in the folder and reads its version from the name. The version box in `precompiled.html` is cosmetic and worth updating. |
| New release, `drive` mode | `python build.py --release`, then Drive → **Manage versions → Upload new version** on the shared file; update `VERSION` and `CHECKSUM`. |
| New release, `link` mode | `python build.py --release`, share the new file, update `DOWNLOAD_URL`, `VERSION` and `CHECKSUM`. |
| See who requested | Open the log spreadsheet (URL printed by `setup()`, also under Drive as *Interwave Analyzer - precompiled requests*). |
| Mailing list | The `Updates` column marks who agreed to be informed about new releases. |
| Revoke someone | Drive modes: remove the viewer from the file (the `File id` column says which). Link mode: replace the share link and update `DOWNLOAD_URL`. |
| Change the e-mail text | `sendToApplicant_()` in `Code.gs` — the plain-text and HTML versions are side by side. |
| Check the service now | Actions tab → *Interwave request service check* → **Run workflow**; or just open the `/exec` URL. |

### Script properties reference

| Property | Meaning |
|---|---|
| `DELIVERY_MODE` | `folder` (newest build in a Drive folder), `drive` (one fixed Drive file) or `link` (send `DOWNLOAD_URL`) |
| `DOWNLOAD_URL` | Share link used in `link` mode |
| `DRIVE_FILE_ID` | Google Drive file id used in `drive` mode |
| `DRIVE_FOLDER_ID`, `FILE_PATTERN` | Release folder and which names count as a build (default `\.exe$`) used in `folder` mode |
| `VERSION`, `RELEASE_DATE` | Shown in the e-mail and in the log. In `folder` mode the version is read from the file name (`InterwaveAnalyzer-2.260810.exe`) and this is only the fallback |
| `CHECKSUM` | SHA-256 printed in the e-mail so users can verify the download |
| `EXPIRY_DAYS` | Access window, default `30` |
| `COOLDOWN_HOURS` | Minimum interval between two requests from the same address (default `6`) |
| `OWNER_EMAIL`, `REPLY_TO` | Your addresses for notifications and replies |
| `MANUAL_URL`, `FAQ_URL`, `SITE_URL` | Links used in the e-mail |
| `SHEET_ID` | Log spreadsheet, filled automatically |

### Limits and notes

- A consumer Gmail account can send **100 e-mails/day** through Apps Script
  (1 500/day with Google Workspace). Each request sends one message to the
  applicant (with you in Bcc) plus one notification.
- After editing `Code.gs` you must **Deploy → Manage deployments → Edit → Deploy**
  again for the change to reach the live URL.
- The current build hash is
  `01821340F618FDBF6EB16BC29B1C9EAA5980FF2E33F88E62B853088EE9368C8F`
  (`Get-FileHash InterwaveAnalyzer.exe -Algorithm SHA256`). Recompute it at every
  release and update `CHECKSUM`.
