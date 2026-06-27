/* ============================================================================
   state.js — single source of truth + persistence (localStorage)
   No real personal data lives in this file. The committed default is a
   FICTIONAL demo so the public template renders. Real data is loaded by the
   owner via Settings → Import backup (.json), or a one-time #seed link.
   ============================================================================ */
(function (global) {
  "use strict";

  var STORAGE_KEY = "arsh_command_center_state_v3";
  var SCHEMA_VERSION = 3;

  /* ---- Fictional demo dataset (safe to publish) ---------------------------- */
  var DEMO_STATE = {
    version: SCHEMA_VERSION,
    currency: "AUD",
    locale: "en-AU",
    owner: "Demo",
    isDemo: true,
    fyLabel: "FY 2025-26",
    horizon: { startMonth: "2026-06", endMonth: "2026-12" },
    settings: { weekStartsOn: 1, theme: "command-dark", privateHospitalCover: false, mlsEnabled: false },
    accounts: [
      { id: "a1", name: "Everyday bank", short: "Bank", type: "bank", liquid: true, balance: 12000, note: "Demo account", color: "#2f7fff" },
      { id: "a2", name: "Cash", short: "Cash", type: "cash", liquid: true, balance: 1500, note: "", color: "#34d399" },
      { id: "a3", name: "Business", short: "Biz", type: "business", liquid: true, balance: 8000, note: "", color: "#f0c560" },
      { id: "a4", name: "Receivable", short: "Recv", type: "receivable", liquid: false, balance: 20000, note: "Arriving later", color: "#a78bfa" },
      { id: "a5", name: "Investment", short: "Inv", type: "investment", liquid: false, balance: 30000, note: "Future payout", color: "#fb7185" }
    ],
    incomeSources: [
      { id: "s1", name: "Day Job", short: "Day Job", account: "a1", kind: "office", color: "#818cf8", note: "" },
      { id: "s2", name: "Night Care", short: "Care", account: "a1", kind: "care", color: "#34d399", note: "" },
      { id: "s3", name: "Weekend Gig", short: "Gig", account: "a3", kind: "business", color: "#fbbf24", businessIncome: true, note: "" }
    ],
    rates: {},
    shifts: [
      { id: "d1", sourceId: "s1", day: 0, start: 9, end: 17, pay: 220, label: "Office", rateNote: "demo", kind: "shift" },
      { id: "d2", sourceId: "s1", day: 1, start: 9, end: 17, pay: 220, label: "Office", rateNote: "demo", kind: "shift" },
      { id: "d3", sourceId: "s2", day: 3, start: 20, end: 24, pay: 120, label: "Night", rateNote: "demo", kind: "shift" },
      { id: "d4", sourceId: "s2", day: 4, start: 0, end: 8, pay: 120, label: "Night", rateNote: "demo", kind: "shift" },
      { id: "d5", sourceId: "s3", day: 5, start: 10, end: 15, pay: 200, label: "Weekend", rateNote: "demo", kind: "shift" },
      { id: "d6", sourceId: "s3", day: 0, pay: 80, label: "Business", rateNote: "passive", kind: "business" }
    ],
    monthsSeed: {
      "2026-06": { expenses: [], incomeOverride: null },
      "2026-07": { expenses: [], incomeOverride: null },
      "2026-08": { expenses: [], incomeOverride: null },
      "2026-09": { expenses: [], incomeOverride: null },
      "2026-10": { expenses: [], incomeOverride: null },
      "2026-11": { expenses: [], incomeOverride: null },
      "2026-12": { expenses: [], incomeOverride: null }
    },
    transactions: [],
    expenseCategories: ["Rent", "Groceries", "Transport", "Bills", "Other"]
  };

  /* ---- Normalisation: tolerate partial / legacy imports -------------------- */
  function normalize(s) {
    s = s || {};
    s.version = SCHEMA_VERSION;
    s.currency = s.currency || "AUD";
    s.locale = s.locale || "en-AU";
    s.owner = s.owner || "You";
    s.fyLabel = s.fyLabel || "FY 2025-26";
    s.horizon = s.horizon || { startMonth: "2026-06", endMonth: "2026-12" };
    s.settings = Object.assign({ weekStartsOn: 1, theme: "command-dark", privateHospitalCover: false, mlsEnabled: false }, s.settings || {});
    delete s.settings.taxSetAsidePct;
    s.accounts = Array.isArray(s.accounts) ? s.accounts : [];
    s.incomeSources = Array.isArray(s.incomeSources) ? s.incomeSources : [];
    // sanitize colour fields (rendered into style/SVG attributes) to block HTML/attribute injection
    s.accounts.forEach(function (a) { if (a) a.color = safeColor(a.color); });
    s.incomeSources.forEach(function (x) { if (x) x.color = safeColor(x.color); });
    s.rates = s.rates || {};
    s.shifts = Array.isArray(s.shifts) ? s.shifts : [];
    s.transactions = Array.isArray(s.transactions) ? s.transactions : [];
    s.expenseCategories = Array.isArray(s.expenseCategories) && s.expenseCategories.length
      ? s.expenseCategories : DEMO_STATE.expenseCategories.slice();
    // Build the month map across the horizon
    s.monthsSeed = s.monthsSeed || {};
    var months = monthRange(s.horizon.startMonth, s.horizon.endMonth);
    s.months = s.months || {};
    months.forEach(function (m) {
      var seed = s.monthsSeed[m] || {};
      var prev = s.months[m] || {};
      var mo = {
        key: m,
        incomeOverride: (prev.incomeOverride != null) ? prev.incomeOverride : (seed.incomeOverride != null ? seed.incomeOverride : null),
        note: prev.note || seed.note || ""
      };
      // Unified transaction list: entries[]  { id, date, description, amount(+), type:'in'|'out', category, note }
      var entries = prev.entries || seed.entries || null;
      if (!Array.isArray(entries)) {
        // migrate from the old expenses[] shape (all treated as money out)
        entries = ((prev.expenses || seed.expenses || [])).map(function (e) {
          return { id: e.id || uid(), date: e.date, description: e.description || e.name || "", amount: Math.abs(+e.amount || 0), type: "out", category: e.category || "Other", note: e.note || "" };
        });
      }
      mo.entries = entries;
      s.months[m] = mo;
    });
    // migrate any legacy global transactions[] into the right month, then retire the array
    (s.transactions || []).forEach(function (t) {
      var k = (t.date || "").slice(0, 7), mo = s.months[k]; if (!mo) return;
      if (mo.entries.some(function (x) { return x.id === t.id; })) return;
      var amt = +t.amount || 0;
      mo.entries.push({ id: t.id || uid(), date: t.date, description: t.description || "", amount: Math.abs(amt), type: (t.type === "income" || amt > 0) ? "in" : "out", category: t.category || (amt > 0 ? "Income" : "Other"), note: t.note || "" });
    });
    s.transactions = [];
    return s;
  }
  function uid() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function monthRange(start, end) {
    var out = [];
    var sd = parseMonth(start), ed = parseMonth(end);
    var y = sd.y, m = sd.m;
    var guard = 0;
    while ((y < ed.y || (y === ed.y && m <= ed.m)) && guard < 120) {
      out.push(y + "-" + String(m).padStart(2, "0"));
      m++; if (m > 12) { m = 1; y++; }
      guard++;
    }
    return out;
  }
  function parseMonth(str) { var p = (str || "2026-06").split("-"); return { y: +p[0], m: +p[1] }; }
  function safeColor(c) { c = String(c == null ? "" : c); return /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|var\(--[\w-]+\)|[a-z]+)$/.test(c) ? c : "#818cf8"; }

  /* ---- Persistence --------------------------------------------------------- */
  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn("State load failed, using demo:", e); }
    return normalize(JSON.parse(JSON.stringify(DEMO_STATE)));
  }
  function save(state) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (e) { console.error("State save failed:", e); return false; }
  }
  function replace(obj) {
    var s = normalize(obj);
    save(s);
    return s;
  }
  function exportJSON(state) {
    var copy = JSON.parse(JSON.stringify(state));
    delete copy.months; // months are rebuilt from monthsSeed + live edits
    copy.monthsSeed = copy.monthsSeed || {};
    // persist live month edits back into the seed so a re-import restores them
    if (state.months) {
      Object.keys(state.months).forEach(function (k) {
        copy.monthsSeed[k] = { entries: state.months[k].entries, incomeOverride: state.months[k].incomeOverride, note: state.months[k].note };
      });
    }
    copy.transactions = [];
    copy.exportedAt = new Date().toISOString();
    return JSON.stringify(copy, null, 2);
  }
  function reset() {
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    return load();
  }
  // Conflict merge: union of both devices' data so nothing added on either side is lost.
  // Starts from `local` (this device's latest), then adds any entities only present on the server.
  // Same-id conflicts keep the local version (this device just edited it). Avoids silent data loss.
  function merge(local, server) {
    if (!server) return local; if (!local) return server;
    local = normalize(local); server = normalize(server);
    function unionById(a, b) {
      var seen = {}; (a || []).forEach(function (x) { if (x && x.id != null) seen[x.id] = true; });
      (b || []).forEach(function (x) { if (x && x.id != null && !seen[x.id]) { a.push(x); seen[x.id] = true; } });
      return a;
    }
    local.accounts = unionById(local.accounts, server.accounts);
    local.incomeSources = unionById(local.incomeSources, server.incomeSources);
    local.shifts = unionById(local.shifts, server.shifts);
    var sm = server.months || {};
    Object.keys(sm).forEach(function (k) {
      if (!local.months[k]) local.months[k] = sm[k];
      else local.months[k].entries = unionById(local.months[k].entries || [], sm[k].entries || []);
    });
    return normalize(local);
  }

  global.AppState = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEMO_STATE: DEMO_STATE,
    normalize: normalize,
    monthRange: monthRange,
    parseMonth: parseMonth,
    load: load,
    save: save,
    replace: replace,
    merge: merge,
    exportJSON: exportJSON,
    reset: reset
  };
})(window);
