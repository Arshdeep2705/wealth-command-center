/* ============================================================================
   importer.js — bank statement ingestion (CSV primary, PDF best-effort)
   Auto-detects ANZ / CommBank / generic CSV layouts, normalises to
   { date:'YYYY-MM-DD', amount:+credit/-debit, description, type, category }.
   ============================================================================ */
(function (global) {
  "use strict";

  /* ---- RFC-4180-ish CSV parser (handles quotes, commas, newlines) ---------- */
  function parseCSV(text) {
    var rows = [], row = [], field = "", i = 0, inQ = false, c;
    text = text.replace(/^﻿/, ""); // strip BOM
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\r") { /* ignore */ }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
      i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }

  /* ---- date parsing: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd Mon yyyy -------- */
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(s) {
    if (!s) return null; s = String(s).trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
      var dd = +m[1], mm = +m[2], yy = m[3]; // AU default dd/mm/yyyy
      if (mm > 12 && dd <= 12) { var t = dd; dd = mm; mm = t; } // tolerate mm/dd
      if (yy.length === 2) yy = (+yy > 70 ? "19" : "20") + yy;
      return iso(yy, mm, dd);
    }
    if ((m = s.match(/^(\d{1,2})[\s\-]*([A-Za-z]{3})[A-Za-z]*[\s\-]*(\d{2,4})/))) {
      var mo = MONTHS[m[2].toLowerCase()]; if (!mo) return null;
      var y = m[3]; if (y.length === 2) y = "20" + y;
      return iso(y, mo, m[1]);
    }
    var d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return null;
  }
  function iso(y, m, d) { return y + "-" + String(+m).padStart(2, "0") + "-" + String(+d).padStart(2, "0"); }
  function toNum(s) {
    if (s == null) return NaN;
    s = String(s).replace(/[$,\s]/g, "").replace(/[()]/g, function (x) { return x === "(" ? "-" : ""; });
    if (s === "" || s === "-") return NaN;
    return parseFloat(s);
  }

  /* ---- column detection ---------------------------------------------------- */
  function looksLikeHeader(row) {
    var joined = row.join(" ").toLowerCase();
    return /date|amount|description|debit|credit|balance|details|narrative|transaction/.test(joined) &&
      !row.some(function (c) { return parseDate(c) && /\d/.test(c); });
  }
  function detectColumns(header) {
    var map = { date: -1, amount: -1, debit: -1, credit: -1, desc: -1, balance: -1 };
    header.forEach(function (h, i) {
      h = String(h).toLowerCase().trim();
      if (map.date < 0 && /date|posted|processed/.test(h)) map.date = i;
      else if (map.amount < 0 && /^amount|^amt|value/.test(h)) map.amount = i;
      else if (map.debit < 0 && /debit|withdrawal|paid out|money out/.test(h)) map.debit = i;
      else if (map.credit < 0 && /credit|deposit|paid in|money in/.test(h)) map.credit = i;
      else if (map.desc < 0 && /desc|detail|narrative|transaction|reference|particulars|merchant/.test(h)) map.desc = i;
      else if (map.balance < 0 && /balance/.test(h)) map.balance = i;
    });
    return map;
  }
  // headerless heuristic: find date col, amount col (numeric, signed), desc col (longest text)
  // Key insight: AU bank CSVs are usually Date,Amount,Description[,Balance]. The amount
  // column carries the debits (negatives); the balance is a running total (rarely negative,
  // usually the LAST numeric column). We must NOT mistake balance for amount.
  function detectPositional(rows) {
    var sample = rows.slice(0, 14), cols = Math.max.apply(null, sample.map(function (r) { return r.length; }));
    var stats = [];
    var dateCol = -1, descCol = -1, bestDesc = 0;
    for (var c = 0; c < cols; c++) {
      var dateHits = 0, numHits = 0, negHits = 0, textLen = 0, decimals = 0;
      sample.forEach(function (r) {
        var v = r[c]; if (v == null || String(v).trim() === "") return;
        if (parseDate(v)) dateHits++;
        var n = toNum(v);
        if (!isNaN(n) && /\d/.test(v)) { numHits++; if (n < 0 || /^\(/.test(String(v).trim())) negHits++; if (/\.\d/.test(String(v))) decimals++; }
        else if (isNaN(n)) textLen += String(v).length;
      });
      stats[c] = { c: c, dateHits: dateHits, numHits: numHits, negHits: negHits, textLen: textLen };
      if (dateHits > sample.length / 2 && dateCol < 0) dateCol = c;
      if (textLen > bestDesc) { bestDesc = textLen; descCol = c; }
    }
    // numeric columns that aren't the date column
    var numeric = stats.filter(function (s) { return s.c !== dateCol && s.numHits > sample.length / 2; });
    var amtCol = -1;
    if (numeric.length) {
      var withNeg = numeric.filter(function (s) { return s.negHits > 0; });
      if (withNeg.length) {
        // the column with the most negatives is the transaction amount
        withNeg.sort(function (a, b) { return b.negHits - a.negHits || a.c - b.c; });
        amtCol = withNeg[0].c;
      } else if (numeric.length >= 2) {
        // no negatives detected: assume earliest numeric is amount, last is balance
        numeric.sort(function (a, b) { return a.c - b.c; });
        amtCol = numeric[0].c;
      } else {
        amtCol = numeric[0].c;
      }
    }
    var balCol = -1;
    if (numeric.length >= 2) { var sorted = numeric.slice().sort(function (a, b) { return b.c - a.c; }); if (sorted[0].c !== amtCol) balCol = sorted[0].c; }
    // don't let the balance column win the description slot
    if (descCol === amtCol || descCol === balCol || descCol === dateCol) {
      var textCols = stats.filter(function (s) { return s.c !== dateCol && s.c !== amtCol && s.c !== balCol && s.textLen > 0; }).sort(function (a, b) { return b.textLen - a.textLen; });
      descCol = textCols.length ? textCols[0].c : descCol;
    }
    return { date: dateCol, amount: amtCol, debit: -1, credit: -1, desc: descCol, balance: balCol };
  }

  /* ---- merchant → category guesser ----------------------------------------- */
  var RULES = [
    [/woolworth|coles|aldi|iga|grocer|foodworks|costco/i, "Groceries"],
    [/uber eats|menulog|doordash|mcdonald|kfc|hungry|cafe|coffee|restaurant|domino|pizza|guzman/i, "Eating out"],
    [/bp |caltex|shell|ampol|7-eleven|fuel|petrol|united petrol/i, "Fuel / Transport"],
    [/uber|didi|ola|taxi|myki|opal|transport|linkt|toll|e-?tag/i, "Fuel / Transport"],
    [/telstra|optus|vodafone|tpg|belong|aussie broadband|internet|mobile/i, "Phone / Internet"],
    [/origin|agl|energyaustralia|red energy|water|council|electric|gas bill/i, "Utilities"],
    [/netflix|spotify|disney|youtube|prime|stan|kayo|subscription|apple\.com|google/i, "Subscriptions"],
    [/insurance|nrma|aami|bupa|medibank|allianz|budget direct/i, "Insurance"],
    [/rent|real estate|property|mortgage|home loan/i, "Rent / Mortgage"],
    [/chemist|pharmacy|priceline|medical|doctor|dental|hospital|physio/i, "Health"],
    [/anz|commbank|cba|nab|westpac|transfer|bpay|atm|withdrawal|cash out/i, "Other"],
    [/gym|fitness|anytime|jetts/i, "Health"]
  ];
  function guessCategory(desc) {
    desc = desc || "";
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(desc)) return RULES[i][1];
    return "Other";
  }

  /* ---- normalise rows → transactions --------------------------------------- */
  function normalize(rows, map) {
    var out = [];
    rows.forEach(function (r) {
      var date = parseDate(map.date >= 0 ? r[map.date] : null);
      if (!date) return;
      var amount = NaN;
      if (map.amount >= 0 && !isNaN(toNum(r[map.amount]))) amount = toNum(r[map.amount]);
      else if (map.debit >= 0 || map.credit >= 0) {
        var deb = map.debit >= 0 ? toNum(r[map.debit]) : NaN;
        var cre = map.credit >= 0 ? toNum(r[map.credit]) : NaN;
        if (!isNaN(deb) && deb !== 0) amount = -Math.abs(deb);
        else if (!isNaN(cre) && cre !== 0) amount = Math.abs(cre);
      }
      if (isNaN(amount)) return;
      var desc = (map.desc >= 0 ? r[map.desc] : r.filter(function (x, i) { return i !== map.date && i !== map.amount; }).join(" ")) || "";
      desc = String(desc).replace(/\s+/g, " ").trim();
      out.push({
        date: date, amount: amount, description: desc,
        type: amount < 0 ? "expense" : "income",
        category: amount < 0 ? guessCategory(desc) : "Income",
        include: true,
        id: "tx_" + date + "_" + Math.random().toString(36).slice(2, 7)
      });
    });
    return out;
  }

  function fromCSV(text) {
    var rows = parseCSV(text);
    if (!rows.length) return { transactions: [], map: null, error: "No rows found in file." };
    var map, dataRows;
    if (looksLikeHeader(rows[0])) { map = detectColumns(rows[0]); dataRows = rows.slice(1); }
    else { map = detectPositional(rows); dataRows = rows; }
    if (map.date < 0) { map = detectPositional(rows); dataRows = looksLikeHeader(rows[0]) ? rows.slice(1) : rows; }
    var txns = normalize(dataRows, map);
    return { transactions: txns, map: map, rowCount: dataRows.length };
  }

  /* ---- PDF best-effort (lazy-loads pdf.js if online) ----------------------- */
  function fromPDF(arrayBuffer) {
    return new Promise(function (resolve) {
      function go() {
        try {
          var pdfjsLib = global.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
            var pages = []; var jobs = [];
            for (var p = 1; p <= pdf.numPages; p++) {
              jobs.push(pdf.getPage(p).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  // group items into lines by y
                  var lines = {};
                  tc.items.forEach(function (it) {
                    var y = Math.round(it.transform[5]);
                    (lines[y] = lines[y] || []).push(it.str);
                  });
                  return Object.keys(lines).sort(function (a, b) { return b - a; }).map(function (y) { return lines[y].join(" "); }).join("\n");
                });
              }));
            }
            Promise.all(jobs).then(function (texts) {
              resolve(parsePdfText(texts.join("\n")));
            });
          }).catch(function (e) { resolve({ transactions: [], error: "Could not read PDF: " + e.message }); });
        } catch (e) { resolve({ transactions: [], error: "PDF engine error: " + e.message }); }
      }
      if (global.pdfjsLib) return go();
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = go;
      s.onerror = function () { resolve({ transactions: [], error: "PDF support needs an internet connection. Export your statement as CSV instead — it works offline and is more accurate." }); };
      document.head.appendChild(s);
    });
  }
  // parse free text lines like: 12/06/2026  WOOLWORTHS METRO  -84.20
  function parsePdfText(text) {
    var lines = text.split(/\n/), out = [];
    lines.forEach(function (ln) {
      var dm = ln.match(/(\d{1,2}[\/\-.][A-Za-z0-9]{2,3}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      var amts = ln.match(/-?\$?\(?\d[\d,]*\.\d{2}\)?/g);
      if (!dm || !amts) return;
      var date = parseDate(dm[1]); if (!date) return;
      var amount = toNum(amts[0]);
      if (/\(/.test(amts[0])) amount = -Math.abs(amount);
      var desc = ln.replace(dm[1], "").replace(/-?\$?\(?\d[\d,]*\.\d{2}\)?/g, "").replace(/\s+/g, " ").trim();
      out.push({
        date: date, amount: amount, description: desc, type: amount < 0 ? "expense" : "income",
        category: amount < 0 ? guessCategory(desc) : "Income", include: true,
        id: "tx_" + date + "_" + Math.random().toString(36).slice(2, 7)
      });
    });
    return { transactions: out, fromPdf: true };
  }

  global.Importer = { parseCSV: parseCSV, fromCSV: fromCSV, fromPDF: fromPDF, guessCategory: guessCategory, parseDate: parseDate };
})(window);
