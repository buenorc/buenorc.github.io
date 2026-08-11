/**
 * Interwave Analyzer - precompiled version request handler
 * -----------------------------------------------------------------------------
 * Google Apps Script web app that receives the request form from
 * pages/interwave/precompiled.html, logs the request in a spreadsheet and
 * automatically sends the applicant an e-mail with the download of the
 * precompiled (Windows) version.
 *
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
 *         Execute as .......: Me
 *         Who has access ...: Anyone
 * See README.md in this folder for the full step-by-step.
 * -----------------------------------------------------------------------------
 */

/** Default configuration. Any of these can be overridden in Script Properties. */
var DEFAULTS = {
  DELIVERY_MODE : 'link',        // 'link'   = send DOWNLOAD_URL (OneDrive share link)
                                 // 'drive'  = share one fixed Google Drive file, per person
                                 // 'folder' = share the newest build found in a Drive folder, per person
  DOWNLOAD_URL  : '',            // OneDrive / 4sync / any direct link (used when DELIVERY_MODE = 'link')
  DRIVE_FILE_ID : '',            // Google Drive file id (used when DELIVERY_MODE = 'drive')
  DRIVE_FOLDER_ID: '',           // Google Drive folder id (used when DELIVERY_MODE = 'folder')
  FILE_PATTERN  : '\\.exe$',     // which files count as a release inside that folder
  VERSION       : '2.260810',
  RELEASE_DATE  : 'August 2026',
  CHECKSUM      : '01821340F618FDBF6EB16BC29B1C9EAA5980FF2E33F88E62B853088EE9368C8F',
  EXPIRY_DAYS   : '30',
  OWNER_EMAIL   : 'rafael.bueno.itt@gmail.com',
  REPLY_TO      : 'rafael.bueno.itt@gmail.com',
  SENDER_NAME   : 'Interwave Analyzer',
  MANUAL_URL    : 'https://buenorc.github.io/pages/interwave/user-manual.html',
  FAQ_URL       : 'https://buenorc.github.io/pages/interwave/faq.html',
  SITE_URL      : 'https://buenorc.github.io/pages/interwave.html',
  SHEET_ID      : '',            // filled automatically on the first request
  COOLDOWN_HOURS: '6'            // same e-mail cannot request again within this window
};

function config_(key) {
  var stored = PropertiesService.getScriptProperties().getProperty(key);
  return (stored === null || stored === '') ? DEFAULTS[key] : stored;
}

/* ---------------------------------------------------------------- endpoints */

/** Simple status endpoint - open the /exec URL in the browser to check config. */
function doGet() {
  var ready = false;
  try { ready = Boolean(deliveryTarget_()); } catch (err) { ready = false; }

  return json_({
    status  : 'ok',
    service : 'Interwave Analyzer request handler',
    version : currentVersion_(),
    release : config_('RELEASE_DATE'),
    mode    : config_('DELIVERY_MODE'),
    ready   : ready
  });
}

function doPost(e) {
  try {
    buildCache_ = null;                 // always look at the folder as it is now
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 1. honeypot: only bots fill the hidden "website" field
    if (String(data.website || '').trim() !== '') {
      return json_({ status: 'ok', message: 'accepted' });   // pretend success
    }

    // 2. validation
    var name        = clean_(data.name, 120);
    var email       = clean_(data.email, 150).toLowerCase();
    var institution = clean_(data.institution, 150);
    var country     = clean_(data.country, 80);
    var role        = clean_(data.role, 80);
    var application = clean_(data.application, 80);
    var purpose     = clean_(data.purpose, 1200);

    if (!name || !institution || !country || !role || !purpose) {
      return json_({ status: 'error', message: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json_({ status: 'error', message: 'Invalid e-mail address' });
    }
    if (data.terms !== true) {
      return json_({ status: 'error', message: 'Terms of use were not accepted' });
    }

    // 3. one request per e-mail per cooldown window
    var sheet = getSheet_();
    if (recentlyRequested_(sheet, email)) {
      return json_({
        status : 'error',
        message: 'A link was already sent to this address recently. Please check your inbox and spam folder.'
      });
    }

    // 4. build the download for this person
    var expiryDays = parseInt(config_('EXPIRY_DAYS'), 10) || 30;
    var expiresAt  = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    lastFileId_    = '';
    var link       = grantAccess_(email);
    var version    = currentVersion_();
    if (!link) {
      notifyOwner_('Interwave Analyzer request FAILED - no download configured',
                   'Request from ' + name + ' <' + email + '> could not be served: no build was found.\n\n'
                   + 'Delivery mode: ' + config_('DELIVERY_MODE') + '\n'
                   + 'Check DOWNLOAD_URL / DRIVE_FILE_ID / DRIVE_FOLDER_ID in the script properties.');
      return json_({ status: 'error', message: 'Download is temporarily unavailable' });
    }

    // 5. e-mails
    sendToApplicant_(name, email, link, expiresAt, version);
    notifyOwner_(
      'Interwave Analyzer - new request: ' + name + ' (' + institution + ')',
      [ 'Name       : ' + name,
        'E-mail     : ' + email,
        'Institution: ' + institution,
        'Country    : ' + country,
        'Position   : ' + role,
        'Application: ' + (application || '-'),
        'Updates    : ' + (data.updates === true ? 'yes' : 'no'),
        'Version    : ' + version,
        'Expires on : ' + formatDate_(expiresAt),
        '',
        'Intended use:',
        purpose ].join('\n'));

    // 6. log
    sheet.appendRow([
      new Date(), name, email, institution, country, role, application, purpose,
      data.updates === true ? 'yes' : 'no', version,
      expiresAt, 'sent', config_('DELIVERY_MODE'), clean_(data.page, 200), lastFileId_
    ]);

    return json_({ status: 'ok', message: 'E-mail sent' });

  } catch (err) {
    notifyOwner_('Interwave Analyzer request handler error', String(err && err.stack || err));
    return json_({ status: 'error', message: 'Internal error' });
  }
}

/* ----------------------------------------------------------------- delivery */

/** Returns the configured download target, or '' when nothing is configured. */
function deliveryTarget_() {
  switch (config_('DELIVERY_MODE')) {
    case 'drive' : return config_('DRIVE_FILE_ID');
    case 'folder': var f = latestBuild_(); return f ? f.getId() : '';
    default      : return config_('DOWNLOAD_URL');
  }
}

/**
 * 'folder' mode: newest file matching FILE_PATTERN inside DRIVE_FOLDER_ID.
 * Publishing a new release is then just dropping the new .exe in that folder -
 * no property to edit, no deployment to redo.
 */
var buildCache_ = null;      // one folder listing per execution is enough

function latestBuild_() {
  if (buildCache_) { return buildCache_; }

  var folderId = config_('DRIVE_FOLDER_ID');
  if (!folderId) { return null; }

  var pattern = new RegExp(config_('FILE_PATTERN'), 'i');
  var files   = DriveApp.getFolderById(folderId).getFiles();
  var newest  = null;

  while (files.hasNext()) {
    var file = files.next();
    if (!pattern.test(file.getName())) { continue; }
    if (!newest || file.getLastUpdated() > newest.getLastUpdated()) { newest = file; }
  }
  buildCache_ = newest;
  return newest;
}

/**
 * Checksum of the build being sent.
 *
 * `build.py --release` writes "<build>.sha256" next to the executable, so in
 * folder mode the right value is already in the folder: reading it there keeps
 * the e-mail honest without anyone having to remember to update a property.
 */
function currentChecksum_() {
  if (config_('DELIVERY_MODE') === 'folder') {
    try {
      var build = latestBuild_();
      if (build) {
        var sidecars = DriveApp.getFolderById(config_('DRIVE_FOLDER_ID'))
                               .getFilesByName(build.getName() + '.sha256');
        if (sidecars.hasNext()) {
          var found = sidecars.next().getBlob().getDataAsString().match(/[0-9a-fA-F]{64}/);
          if (found) { return found[0].toUpperCase(); }
        }
      }
      return '';         // no sidecar: better no checksum than a stale one
    } catch (err) {
      return '';
    }
  }
  return config_('CHECKSUM');
}

/** Version shown in the e-mail: read from the build file name when possible. */
function currentVersion_() {
  if (config_('DELIVERY_MODE') === 'folder') {
    try {
      var file = latestBuild_();
      if (file) {
        var found = file.getName().match(/(\d+\.\d{4,})/);   // e.g. InterwaveAnalyzer-2.260810.exe
        if (found) { return found[1]; }
      }
    } catch (err) { /* fall through to the configured value */ }
  }
  return config_('VERSION');
}

/**
 * Prepares the download for one applicant and returns the URL to send.
 * In 'drive'/'folder' mode the applicant's address is added as a viewer of the
 * file and revoked later by revokeExpiredAccess(); in 'link' mode the shared URL
 * is used as it is.
 */
function grantAccess_(email) {
  var mode = config_('DELIVERY_MODE');
  var file = null;

  if (mode === 'drive') {
    var fileId = config_('DRIVE_FILE_ID');
    file = fileId ? DriveApp.getFileById(fileId) : null;
  } else if (mode === 'folder') {
    file = latestBuild_();
  } else {
    return config_('DOWNLOAD_URL');
  }

  if (!file) { return ''; }

  try {
    file.addViewer(email);
  } catch (err) {
    // address is not a Google account: fall back to a link-visible file
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  lastFileId_ = file.getId();
  return file.getUrl();
}

/** Id of the file shared by the last grantAccess_() call ('' in link mode). */
var lastFileId_ = '';

/** Daily trigger: removes viewers whose 30-day window has passed (Drive modes). */
function revokeExpiredAccess() {
  var sheet = getSheet_();
  var rows  = sheet.getDataRange().getValues();
  var now   = new Date();

  for (var i = 1; i < rows.length; i++) {
    var email   = rows[i][2];
    var expires = rows[i][10];
    var state   = rows[i][11];
    var fileId  = rows[i][14];
    if (state !== 'sent' || !email || !fileId || !(expires instanceof Date)) { continue; }
    if (expires > now) { continue; }

    try { DriveApp.getFileById(fileId).removeViewer(email); } catch (err) { /* already gone */ }
    sheet.getRange(i + 1, 12).setValue('expired');
  }
}

/* ------------------------------------------------------------------- e-mail */

function sendToApplicant_(name, email, link, expiresAt, version) {
  version      = version || currentVersion_();
  var manual   = config_('MANUAL_URL');
  var faq      = config_('FAQ_URL');
  var site     = config_('SITE_URL');
  var contact  = config_('REPLY_TO');
  var checksum = currentChecksum_();
  var expiry   = formatDate_(expiresAt);

  var subject = 'Interwave Analyzer ' + version + ' - precompiled version for Windows';

  var plain =
'Dear ' + name + ',\n\n' +
'We have received your request. We are sharing the latest precompiled version of\n' +
'Interwave Analyzer for Windows:\n\n' +
'  Software version : ' + version + '\n' +
'  Download         : ' + link + '\n' +
'  Access expires on: ' + expiry + '\n\n' +
'This permission may expire after ' + (parseInt(config_('EXPIRY_DAYS'), 10) || 30) + ' days.\n\n' +
(checksum ? '  SHA-256 checksum: ' + checksum + '\n\n' : '') +
'For instructions, please read carefully the User\'s Manual, available at\n' + manual + '.\n\n' +
'The Interwave Analyzer is meant to be used on Windows operating systems, and can\n' +
'present instabilities due to incompatibilities between Windows versions. The\n' +
'executable is not digitally signed, so Windows SmartScreen may ask for a\n' +
'confirmation the first time you run it ("More info" > "Run anyway").\n\n' +
'If you have questions, we advise you to read the FAQ page (' + faq + ').\n' +
'For more information on our Interwave Analyzer package, please check out our\n' +
'website (' + site + ') or contact ' + contact + '.\n\n' +
'With kind regards,\n\n' +
'Rafael de Carvalho Bueno\n' +
'Interwave Analyzer developer';

  var html =
'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;line-height:1.6;max-width:620px">' +
  '<p>Dear ' + escape_(name) + ',</p>' +

  '<p>We have received your request. We are sharing the latest precompiled version of ' +
  '<strong>Interwave Analyzer</strong> for Windows:</p>' +

  '<table cellpadding="0" cellspacing="0" style="border-left:4px solid #6785b8;background:#f7f9fc;padding:0;margin:18px 0;width:100%">' +
    '<tr><td style="padding:16px 18px">' +
      '<p style="margin:0 0 6px 0"><strong>Software version:</strong> ' + escape_(version) + '</p>' +
      '<p style="margin:0 0 14px 0"><strong>Access expires on:</strong> ' + escape_(expiry) + '</p>' +
      '<p style="margin:0">' +
        '<a href="' + escape_(link) + '" style="display:inline-block;background:#6785b8;color:#ffffff;' +
        'text-decoration:none;padding:11px 26px;border-radius:25px;font-weight:bold">Download Interwave Analyzer</a>' +
      '</p>' +
    '</td></tr>' +
  '</table>' +

  '<p style="font-size:12px;color:#777777;margin-top:-6px">If the button does not work, copy this address into your browser:<br>' +
  '<a href="' + escape_(link) + '">' + escape_(link) + '</a></p>' +

  (checksum ? '<p style="font-size:12px;color:#777777">SHA-256 checksum: <code>' + escape_(checksum) + '</code></p>' : '') +

  '<p>This permission may expire after ' + (parseInt(config_('EXPIRY_DAYS'), 10) || 30) + ' days. ' +
  'For instructions, please read carefully the User\'s Manual, available at ' +
  '<a href="' + escape_(manual) + '">' + escape_(manual) + '</a>.</p>' +

  '<p>The Interwave Analyzer is meant to be used on Windows operating systems, and can present ' +
  'instabilities due to incompatibilities between Windows versions. The executable is not digitally ' +
  'signed, so Windows SmartScreen may ask for a confirmation the first time you run it ' +
  '(&ldquo;More info&rdquo; &rsaquo; &ldquo;Run anyway&rdquo;).</p>' +

  '<p>If you have questions, we advise you to read the <a href="' + escape_(faq) + '">FAQ page</a>. ' +
  'For more information on our Interwave Analyzer package, please check out ' +
  '<a href="' + escape_(site) + '">our website</a> or contact ' +
  '<a href="mailto:' + escape_(contact) + '">' + escape_(contact) + '</a>.</p>' +

  '<p>With kind regards,</p>' +
  '<p style="margin-bottom:0"><strong>Rafael de Carvalho Bueno</strong><br>' +
  '<span style="color:#6785b8">Interwave Analyzer developer</span></p>' +
'</div>';

  MailApp.sendEmail({
    to      : email,
    subject : subject,
    body    : plain,
    htmlBody: html,
    name    : config_('SENDER_NAME'),
    replyTo : config_('REPLY_TO'),
    bcc     : config_('OWNER_EMAIL')
  });
}

function notifyOwner_(subject, body) {
  try {
    MailApp.sendEmail({ to: config_('OWNER_EMAIL'), subject: subject, body: body, name: config_('SENDER_NAME') });
  } catch (err) { /* never break the request because of the notification */ }
}

/* -------------------------------------------------------------- spreadsheet */

var HEADERS = ['Timestamp', 'Name', 'E-mail', 'Institution', 'Country', 'Position',
               'Application', 'Intended use', 'Updates', 'Version', 'Expires on',
               'Status', 'Mode', 'Page', 'File id'];

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id    = props.getProperty('SHEET_ID');
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Interwave Analyzer - precompiled requests');
    props.setProperty('SHEET_ID', ss.getId());
  }

  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function recentlyRequested_(sheet, email) {
  var hours = parseInt(config_('COOLDOWN_HOURS'), 10);
  if (!hours) { return false; }

  var last  = sheet.getLastRow();
  if (last < 2) { return false; }

  var start = Math.max(2, last - 199);                       // check the last 200 rows
  var rows  = sheet.getRange(start, 1, last - start + 1, 3).getValues();
  var limit = new Date(Date.now() - hours * 60 * 60 * 1000);

  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][2]).toLowerCase() === email && rows[i][0] instanceof Date && rows[i][0] > limit) {
      return true;
    }
  }
  return false;
}

/* --------------------------------------------------------------- utilities */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function clean_(value, max) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function escape_(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMMM yyyy');
}

/* ------------------------------------------------------------------- setup */

/**
 * Run once from the editor: writes the configuration, creates the log
 * spreadsheet and installs the daily expiry trigger.
 * Edit the values below before running.
 */
function setup() {
  PropertiesService.getScriptProperties().setProperties({
    // ---- the only line you normally have to edit ----------------------------
    // Id of the "Interwave releases" folder in Drive, taken from its address:
    // https://drive.google.com/drive/folders/THIS_PART
    DRIVE_FOLDER_ID: 'PASTE_THE_DRIVE_FOLDER_ID_HERE',
    // -------------------------------------------------------------------------

    DELIVERY_MODE : 'folder',                     // 'folder' | 'drive' | 'link'
    DOWNLOAD_URL  : '',                           // only for 'link' mode
    DRIVE_FILE_ID : '',                           // only for 'drive' mode
    FILE_PATTERN  : DEFAULTS.FILE_PATTERN,
    VERSION       : DEFAULTS.VERSION,
    RELEASE_DATE  : DEFAULTS.RELEASE_DATE,
    CHECKSUM      : DEFAULTS.CHECKSUM,
    EXPIRY_DAYS   : '30',
    OWNER_EMAIL   : DEFAULTS.OWNER_EMAIL,
    REPLY_TO      : DEFAULTS.REPLY_TO
  }, false);

  getSheet_();

  var installed = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'revokeExpiredAccess';
  });
  if (!installed) {
    ScriptApp.newTrigger('revokeExpiredAccess').timeBased().everyDays(1).atHour(3).create();
  }

  Logger.log('Configuration stored. Log spreadsheet: ' +
             SpreadsheetApp.openById(config_('SHEET_ID')).getUrl());
}

/**
 * Reports what the service would deliver right now. Run it after setup() and
 * after every release, before trusting the live form.
 */
function checkConfig() {
  buildCache_ = null;
  var mode = config_('DELIVERY_MODE');
  Logger.log('Delivery mode : ' + mode);

  if (mode === 'folder') {
    var folderId = config_('DRIVE_FOLDER_ID');
    if (!folderId || folderId.indexOf('PASTE') === 0) {
      Logger.log('PROBLEM: DRIVE_FOLDER_ID is not set. Edit setup() and run it again.');
      return;
    }
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (err) {
      Logger.log('PROBLEM: this account cannot open the folder ' + folderId + '.');
      Logger.log('         Create the script in the account that owns the folder, '
                 + 'or share the folder with this one as Editor.');
      return;
    }
    Logger.log('Folder        : ' + folder.getName());

    var build = latestBuild_();
    if (!build) {
      Logger.log('PROBLEM: no file matching ' + config_('FILE_PATTERN') + ' in that folder.');
      return;
    }
    Logger.log('Newest build  : ' + build.getName()
               + ' (' + Math.round(build.getSize() / 1048576) + ' MB, updated '
               + formatDate_(build.getLastUpdated()) + ')');
  } else {
    Logger.log('Target        : ' + (deliveryTarget_() || '(nothing configured)'));
  }

  Logger.log('Version sent  : ' + currentVersion_());
  Logger.log('Checksum sent : ' + (currentChecksum_() || '(none - upload the .sha256 file)'));
  Logger.log('E-mail from   : ' + Session.getEffectiveUser().getEmail());
  Logger.log('Notifications : ' + config_('OWNER_EMAIL'));
  Logger.log('Quota left    : ' + MailApp.getRemainingDailyQuota() + ' e-mails today');
  var sheetId = config_('SHEET_ID');
  Logger.log('Log sheet     : ' + (sheetId ? SpreadsheetApp.openById(sheetId).getUrl()
                                           : '(created on the first request)'));
  Logger.log('READY.');
}

/** Sends the real e-mail to you, exactly as an applicant would receive it. */
function testEmail() {
  var expires = new Date(Date.now() + (parseInt(config_('EXPIRY_DAYS'), 10) || 30)
                                      * 24 * 60 * 60 * 1000);
  var link = grantAccess_(config_('OWNER_EMAIL'));
  if (!link) {
    Logger.log('Nothing to send: run checkConfig() first.');
    return;
  }
  sendToApplicant_('Rafael de Carvalho Bueno (test)', config_('OWNER_EMAIL'),
                   link, expires, currentVersion_());
  Logger.log('Test e-mail sent to ' + config_('OWNER_EMAIL') + ' with ' + link);
}
