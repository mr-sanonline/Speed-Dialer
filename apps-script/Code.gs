/**
 * Speed Dialer — Google Sheets backend
 * Deploy: Extensions → Apps Script → paste → Deploy → New deployment →
 *   Type "Web app" · Execute as "Me" · Who has access "Anyone" → copy the /exec URL
 *
 * Tabs expected in the master spreadsheet:
 *   Leads      — one row per lead (columns below, header row 1)
 *   Call Log    — append-only history (created automatically)
 *   Summary     — optional, unused by the app
 */

var LEADS_TAB = 'Leads';
var LOG_TAB   = 'Call Log';
var SRC_TAB   = 'Sources';
var TZ        = 'Asia/Kolkata';
var DAY_TARGET_DEFAULT = 200;

/**
 * Shared secret. Change this to your own random string, then paste the SAME
 * string into the app: manager Settings → Google sheet connection → Access token.
 * Leave it '' to disable the check (not recommended once you roll out).
 */
var API_TOKEN = 'CHANGE-ME-to-a-long-random-string';

var COLS = [
  'Lead ID','Name','Phone','Vertical','Caller','Status','Outcome',
  'Preferred Location','Property Type','Configuration','Budget','Suggested Project',
  'Timeline','Follow Up Date','Language','Notes',
  'Attempts','Last Call At','Updated By','Updated At','Duplicate'
];

var LOG_COLS = ['Timestamp','Lead ID','Name','Phone','Vertical','Caller','Outcome','Notes'];

var SRC_COLS = ['Vertical','Source spreadsheet URL','Tab name','Rows imported','Last imported'];
var DEFAULT_VERTICALS = ['Farm land','Primary market','Secondary market','Pre-launch','Mandate plotted'];

/* ---------- entry points ---------- */

function doGet(e)  { return handle(e && e.parameter ? e.parameter : {}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(body);
}

function handle(req) {
  var out;
  try {
    if (API_TOKEN && String(req.token || '') !== API_TOKEN) {
      out = { ok: false, error: 'Unauthorised — check the access token in Settings' };
      return ContentService.createTextOutput(JSON.stringify(out))
        .setMimeType(ContentService.MimeType.JSON);
    }
    switch (req.action) {
      case 'ping':     out = { ok: true, version: 3 }; break;
      case 'leads':    out = getLeads(req); break;
      case 'save':     out = saveLeads(req); break;
      case 'metrics':  out = getMetrics(req); break;
      case 'config':   out = getConfig(req); break;
      case 'publish':  out = publishConfig(req); break;
      case 'setPin':   out = setPin(req); break;
      case 'checkPin': out = checkPin(req); break;
      case 'import':   out = importLeads(req); break;
      case 'reassign': out = reassign(req); break;
      case 'setup':    out = ensureSheets(); break;
      default:         out = { ok: false, error: 'Unknown action: ' + req.action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- sheet helpers ---------- */

function book() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets() {
  var ss = book();
  var leads = ss.getSheetByName(LEADS_TAB) || ss.insertSheet(LEADS_TAB);
  if (leads.getLastRow() === 0) {
    leads.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    leads.setFrozenRows(1);
  } else {
    var head = leads.getRange(1, 1, 1, Math.max(leads.getLastColumn(), COLS.length)).getValues()[0];
    var missing = COLS.filter(function (c) { return head.indexOf(c) === -1; });
    if (missing.length) {
      leads.getRange(1, head.filter(String).length + 1, 1, missing.length)
        .setValues([missing]).setFontWeight('bold');
    }
  }
  var log = ss.getSheetByName(LOG_TAB) || ss.insertSheet(LOG_TAB);
  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, LOG_COLS.length).setValues([LOG_COLS]).setFontWeight('bold');
    log.setFrozenRows(1);
  }

  var src = ss.getSheetByName(SRC_TAB) || ss.insertSheet(SRC_TAB);
  if (src.getLastRow() === 0) {
    src.getRange(1, 1, 1, SRC_COLS.length).setValues([SRC_COLS]).setFontWeight('bold');
    src.setFrozenRows(1);
    src.getRange(2, 1, DEFAULT_VERTICALS.length, 1)
      .setValues(DEFAULT_VERTICALS.map(function (v) { return [v]; }));
    src.getRange(2, 3, DEFAULT_VERTICALS.length, 1)
      .setValues(DEFAULT_VERTICALS.map(function () { return ['Sheet1']; }));
    src.setColumnWidth(2, 420);
  }

  return { ok: true, columns: COLS };
}

/* ---------- shared config (roster, dropdowns, target) ---------- */

var CONFIG_KEY = 'speedDialerConfig';
var PIN_KEY    = 'speedDialerManagerPin';
var PIN_DEFAULT = '1947';

/**
 * The manager PIN is deliberately NOT part of the published config — that config
 * is replicated to every caller's phone. It lives in its own Script Property and
 * is only ever compared here, so the secret never reaches a client.
 */
function setPin(req) {
  var next = String(req.pin || '').trim();
  if (!/^\d{4,6}$/.test(next)) return { ok: false, error: 'PIN must be 4–6 digits' };
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty(PIN_KEY) || PIN_DEFAULT;
  if (String(req.currentPin || '') !== current) {
    return { ok: false, error: 'Current PIN is wrong' };
  }
  props.setProperty(PIN_KEY, next);
  return { ok: true, changedAt: stamp() };
}

function checkPin(req) {
  var current = PropertiesService.getScriptProperties().getProperty(PIN_KEY) || PIN_DEFAULT;
  var match = String(req.pin || '') === current;
  return { ok: true, match: match, isDefault: current === PIN_DEFAULT };
}

/** action=config — every phone calls this on open and adopts what the manager published. */
function getConfig(req) {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_KEY);
  if (!raw) return { ok: true, config: null, publishedAt: null };
  var saved = JSON.parse(raw);
  if (saved.config) delete saved.config.pin; // never serve the PIN to a client
  return { ok: true, config: saved.config, publishedAt: saved.publishedAt };
}

/** action=publish { config, basedOn } — manager pushes the roster and dropdown lists to all phones. */
function publishConfig(req) {
  if (!req.config) return { ok: false, error: 'No config supplied' };
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(CONFIG_KEY);

  // a config already exists — anything not based on the current published copy
  // (including a device that has never pulled) must be confirmed, not silently applied
  if (raw && !req.force) {
    var current = JSON.parse(raw);
    if (req.basedOn !== current.publishedAt) {
      return { ok: false, conflict: true, publishedAt: current.publishedAt,
        error: 'Another manager published at ' + current.publishedAt + '. Reload to see their changes, or publish again to override.' };
    }
  }

  var payload = { config: req.config, publishedAt: stamp() };
  delete payload.config.pin; // the PIN is stored separately, never published
  props.setProperty(CONFIG_KEY, JSON.stringify(payload));
  return { ok: true, publishedAt: payload.publishedAt };
}

/* ---------- pulling leads in from per-vertical source sheets ---------- */

/**
 * action=import — reads every row of the Sources tab, opens each source
 * spreadsheet, and appends any Name/Phone pair not already in the master.
 * Safe to run repeatedly; existing leads and their call details are untouched.
 */
function importLeads(req) {
  ensureSheets();
  var ss = book();
  var src = ss.getSheetByName(SRC_TAB);
  if (src.getLastRow() < 2) return { ok: true, imported: 0, sources: [] };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var d = readLeads(), m = d.map, leads = d.sheet;
    var known = {};
    d.rows.forEach(function (r) {
      var p = normPhone(r[m['Phone']]);
      if (p) known[p] = true;
    });

    var si = idx(src);
    var srcRows = src.getRange(2, 1, src.getLastRow() - 1, src.getLastColumn()).getValues();
    var appended = [], report = [];

    srcRows.forEach(function (row, i) {
      var vertical = String(row[si['Vertical']] || '').trim();
      var url      = String(row[si['Source spreadsheet URL']] || '').trim();
      var tabName  = String(row[si['Tab name']] || '').trim() || 'Sheet1';
      if (!vertical || !url) return;

      var added = 0, note = '';
      try {
        var other = SpreadsheetApp.openByUrl(url);
        var tab = other.getSheetByName(tabName) || other.getSheets()[0];
        if (tab.getLastRow() < 2) {
          note = 'empty';
        } else {
          var head = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0]
            .map(function (h) { return String(h).trim().toLowerCase(); });

          // forgiving header match: "Name"/"Customer Name"/"Lead Name",
          // "Phone"/"Phone Number"/"Mobile"/"Contact No"
          var nameCol = -1, phoneCol = -1;
          var PHONE_EXACT = ['ph','no','num','tel','cell','mob','phno','mobno','contactno','phoneno'];
          head.forEach(function (h, i) {
            var t = h.replace(/[^a-z]/g, '');
            if (!t) return;
            if (phoneCol === -1 &&
                (/phone|mobile|contact|whatsapp|number/.test(t) || PHONE_EXACT.indexOf(t) !== -1)) {
              phoneCol = i;
            }
            if (nameCol === -1 && /name/.test(t) && !/username|filename/.test(t)) nameCol = i;
          });
          // last resort: two-column sheet with no usable headers
          if (nameCol === -1 && phoneCol === -1 && head.length >= 2) { nameCol = 0; phoneCol = 1; }

          if (phoneCol === -1) {
            note = 'no phone column found';
          } else {
            var vals = tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).getValues();
            vals.forEach(function (v) {
              var phone = String(v[phoneCol] == null ? '' : v[phoneCol]).trim();
              var key = normPhone(phone);
              if (!key || known[key]) return;
              known[key] = true;
              var out = new Array(COLS.length).fill('');
              out[m['Name']] = nameCol === -1 ? '' : String(v[nameCol] || '').trim();
              out[m['Phone']] = phone;
              out[m['Vertical']] = vertical;
              appended.push(out);
              added++;
            });
          }
        }
      } catch (err) {
        note = 'cannot open — share it with ' + Session.getEffectiveUser().getEmail();
      }

      src.getRange(i + 2, si['Rows imported'] + 1).setValue(added);
      src.getRange(i + 2, si['Last imported'] + 1).setValue(note || stamp());
      report.push({ vertical: vertical, added: added, note: note });
    });

    if (appended.length) {
      leads.getRange(leads.getLastRow() + 1, 1, appended.length, COLS.length).setValues(appended);
    }
    CacheService.getScriptCache().remove('metrics');
    return { ok: true, imported: appended.length, sources: report };
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the editor to pull new leads automatically every hour. */
function installHourlyImport() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledImport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledImport').timeBased().everyHours(1).create();
}

function scheduledImport() { importLeads({}); }

function idx(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  head.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

function readLeads() {
  ensureSheets();
  var sheet = book().getSheetByName(LEADS_TAB);
  var last = sheet.getLastRow();
  if (last < 2) return { sheet: sheet, map: idx(sheet), rows: [] };
  var map = idx(sheet);
  var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  return { sheet: sheet, map: map, rows: values };
}

function normPhone(v) { return String(v == null ? '' : v).replace(/[^\d]/g, '').slice(-10); }
function today() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function stamp() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"); }

/* ---------- leads: assign, dedupe, fetch ---------- */

/**
 * action=leads  { caller, vertical, roster: ["Kavya","Sujan"], limit }
 * Auto-distributes every unassigned row of that vertical across the roster,
 * flags in-sheet duplicate phone numbers, and returns only this caller's
 * uncalled rows.
 */
function getLeads(req) {
  var caller  = String(req.caller || '').trim();
  var vertical = String(req.vertical || '').trim();
  var roster  = (req.roster || []).map(function (n) { return String(n).trim(); }).filter(String);
  var limit   = Number(req.limit || 500);
  if (!caller) return { ok: false, error: 'caller is required' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = readLeads(), m = d.map, rows = d.rows, sheet = d.sheet;
    var writes = [];

    // stable ids + in-sheet duplicate flags
    var seen = {};
    rows.forEach(function (r, i) {
      if (!r[m['Lead ID']]) {
        r[m['Lead ID']] = 'L' + (i + 2);
        writes.push({ row: i + 2, col: m['Lead ID'] + 1, value: r[m['Lead ID']] });
      }
      var p = normPhone(r[m['Phone']]);
      if (!p) return;
      var dupe = seen[p] ? 'YES' : '';
      if (seen[p] && String(r[m['Duplicate']] || '') !== 'YES') {
        writes.push({ row: i + 2, col: m['Duplicate'] + 1, value: 'YES' });
        r[m['Duplicate']] = 'YES';
      }
      seen[p] = true;
    });

    // even auto-distribution of unassigned rows within this vertical
    if (roster.length) {
      var load = {};
      roster.forEach(function (n) { load[n] = 0; });
      rows.forEach(function (r) {
        var c = String(r[m['Caller']] || '').trim();
        if (load.hasOwnProperty(c)) load[c]++;
      });
      rows.forEach(function (r, i) {
        var rowVertical = String(r[m['Vertical']] || '').trim();
        if (vertical && rowVertical && rowVertical.toLowerCase() !== vertical.toLowerCase()) return;
        if (String(r[m['Caller']] || '').trim()) return;
        var pick = roster[0];
        roster.forEach(function (n) { if (load[n] < load[pick]) pick = n; });
        load[pick]++;
        r[m['Caller']] = pick;
        writes.push({ row: i + 2, col: m['Caller'] + 1, value: pick });
      });
    }

    writes.forEach(function (w) { sheet.getRange(w.row, w.col).setValue(w.value); });

    var mine = [];
    rows.forEach(function (r, i) {
      if (String(r[m['Caller']] || '').trim().toLowerCase() !== caller.toLowerCase()) return;
      if (String(r[m['Outcome']] || '').trim()) return; // only uncalled
      if (mine.length >= limit) return;
      mine.push({
        id: r[m['Lead ID']], row: i + 2,
        name: String(r[m['Name']] || ''), phone: String(r[m['Phone']] || ''),
        vertical: String(r[m['Vertical']] || ''),
        dupe: String(r[m['Duplicate']] || '') === 'YES',
        attempts: Number(r[m['Attempts']] || 0),
        f: {
          location: String(r[m['Preferred Location']] || ''),
          ptype: String(r[m['Property Type']] || ''),
          config: String(r[m['Configuration']] || ''),
          budget: String(r[m['Budget']] || ''),
          project: String(r[m['Suggested Project']] || ''),
          timeline: String(r[m['Timeline']] || ''),
          followUp: r[m['Follow Up Date']]
            ? Utilities.formatDate(new Date(r[m['Follow Up Date']]), TZ, 'yyyy-MM-dd') : '',
          lang: String(r[m['Language']] || ''),
          notes: String(r[m['Notes']] || '')
        }
      });
    });
    return { ok: true, caller: caller, vertical: vertical, count: mine.length, leads: mine };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- saving ---------- */

/**
 * action=save  { caller, items: [ { id, phone, outcome, dialed, f:{...} } ] }
 * Updates the lead's own row AND appends to Call Log.
 * A dial with no outcome is recorded as "Attempted, not logged".
 */
function saveLeads(req) {
  var caller = String(req.caller || '').trim();
  var items = req.items || [];
  if (!items.length) return { ok: true, saved: 0 };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = readLeads(), m = d.map, rows = d.rows, sheet = d.sheet;
    var byId = {}, byPhone = {};
    rows.forEach(function (r, i) {
      if (r[m['Lead ID']]) byId[String(r[m['Lead ID']])] = i;
      var p = normPhone(r[m['Phone']]);
      if (p && byPhone[p] === undefined) byPhone[p] = i;
    });

    var logRows = [], saved = 0;
    items.forEach(function (it) {
      var i = byId[String(it.id)];
      if (i === undefined) i = byPhone[normPhone(it.phone)];
      if (i === undefined) return;

      var r = rows[i], f = it.f || {};
      var outcome = String(it.outcome || '').trim();
      var status = outcome ? 'Called' : (it.dialed ? 'Attempted, not logged' : 'New');

      r[m['Outcome']] = outcome;
      r[m['Status']] = status;
      r[m['Preferred Location']] = f.location || '';
      r[m['Property Type']] = f.ptype || '';
      r[m['Configuration']] = f.config || '';
      r[m['Budget']] = f.budget || '';
      r[m['Suggested Project']] = f.project || '';
      r[m['Timeline']] = f.timeline || '';
      r[m['Follow Up Date']] = f.followUp || '';
      r[m['Language']] = f.lang || '';
      r[m['Notes']] = f.notes || '';
      r[m['Attempts']] = Number(r[m['Attempts']] || 0) + (it.dialed ? 1 : 0);
      if (it.dialed) r[m['Last Call At']] = stamp();
      r[m['Updated By']] = caller;
      r[m['Updated At']] = stamp();

      sheet.getRange(i + 2, 1, 1, sheet.getLastColumn()).setValues([r]);
      saved++;

      logRows.push([
        stamp(), r[m['Lead ID']], r[m['Name']], r[m['Phone']],
        r[m['Vertical']], caller, outcome || status, f.notes || ''
      ]);
    });

    if (logRows.length) {
      var log = book().getSheetByName(LOG_TAB);
      log.getRange(log.getLastRow() + 1, 1, logRows.length, LOG_COLS.length).setValues(logRows);
    }
    CacheService.getScriptCache().remove('metrics');
    return { ok: true, saved: saved, at: stamp() };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- manager metrics (live, 2-minute cache) ---------- */

function getMetrics(req) {
  var cache = CacheService.getScriptCache();
  if (!req.fresh) {
    var hit = cache.get('metrics');
    if (hit) { var c = JSON.parse(hit); c.cached = true; return c; }
  }

  ensureSheets();
  var d = readLeads(), m = d.map, rows = d.rows;
  var log = book().getSheetByName(LOG_TAB);
  var t = today();

  var perCaller = {}, perVertical = {}, hot = [], due = [];
  var connectedSet = { 'Interested': 1, 'Call back later': 1, 'Not interested': 1 };

  function caller(name, vertical) {
    if (!perCaller[name]) perCaller[name] = { name: name, vertical: vertical || '', calls: 0, connected: 0, left: 0 };
    if (vertical && !perCaller[name].vertical) perCaller[name].vertical = vertical;
    return perCaller[name];
  }

  // today's logged calls
  if (log.getLastRow() > 1) {
    var li = idx(log);
    var lv = log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).getValues();
    lv.forEach(function (r) {
      var when = r[li['Timestamp']];
      var day = when instanceof Date
        ? Utilities.formatDate(when, TZ, 'yyyy-MM-dd')
        : String(when).slice(0, 10);
      if (day !== t) return;
      var oc = String(r[li['Outcome']] || '');
      if (!oc || oc === 'Attempted, not logged') return;
      var name = String(r[li['Caller']] || '—');
      var vert = String(r[li['Vertical']] || '');
      var c = caller(name, vert);
      c.calls++;
      if (connectedSet[oc]) c.connected++;
      if (!perVertical[vert]) perVertical[vert] = { name: vert, calls: 0, hot: 0 };
      perVertical[vert].calls++;
      if (oc === 'Interested') perVertical[vert].hot++;
    });
  }

  // remaining + hot + follow-ups from the Leads tab
  rows.forEach(function (r) {
    var name = String(r[m['Caller']] || '').trim();
    var vert = String(r[m['Vertical']] || '').trim();
    if (name && !String(r[m['Outcome']] || '').trim()) caller(name, vert).left++;
    if (String(r[m['Outcome']] || '') === 'Interested' && hot.length < 12) {
      hot.push({
        name: String(r[m['Name']] || ''), by: name,
        detail: [r[m['Property Type']], r[m['Configuration']], r[m['Budget']], r[m['Preferred Location']],
                 r[m['Suggested Project']]].filter(String).join(' · ')
      });
    }
    var fu = r[m['Follow Up Date']];
    if (fu) {
      var day = fu instanceof Date ? Utilities.formatDate(fu, TZ, 'yyyy-MM-dd') : String(fu).slice(0, 10);
      if (day <= t && due.length < 20) due.push({ name: String(r[m['Name']] || ''), when: day, by: name });
    }
  });

  var team = Object.keys(perCaller).map(function (k) { return perCaller[k]; });
  var totalCalls = team.reduce(function (a, b) { return a + b.calls; }, 0);
  var totalConn  = team.reduce(function (a, b) { return a + b.connected; }, 0);

  var out = {
    ok: true, date: t, target: DAY_TARGET_DEFAULT,
    totals: {
      calls: totalCalls,
      connectRate: totalCalls ? Math.round(totalConn / totalCalls * 100) : 0,
      followUpsDue: due.length,
      leadsRemaining: team.reduce(function (a, b) { return a + b.left; }, 0)
    },
    team: team.sort(function (a, b) { return b.calls - a.calls; }),
    verticals: Object.keys(perVertical).map(function (k) { return perVertical[k]; }),
    hot: hot, followUps: due, cached: false
  };
  cache.put('metrics', JSON.stringify(out), 120);
  return out;
}

/* ---------- manager reassignment ---------- */

/** action=reassign { from, to, vertical, count } — moves uncalled rows between callers. */
function reassign(req) {
  var from = String(req.from || '').trim(), to = String(req.to || '').trim();
  var count = Number(req.count || 0) || Infinity;
  if (!from || !to) return { ok: false, error: 'from and to are required' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = readLeads(), m = d.map, rows = d.rows, sheet = d.sheet, moved = 0;
    rows.forEach(function (r, i) {
      if (moved >= count) return;
      if (String(r[m['Caller']] || '').trim().toLowerCase() !== from.toLowerCase()) return;
      if (String(r[m['Outcome']] || '').trim()) return;
      sheet.getRange(i + 2, m['Caller'] + 1).setValue(to);
      moved++;
    });
    CacheService.getScriptCache().remove('metrics');
    return { ok: true, moved: moved };
  } finally {
    lock.releaseLock();
  }
}
