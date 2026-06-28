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
  var DMY = true; // day-first (AU) by default; refined per-file by detectDateOrder()
  function detectDateOrder(rows) {
    var dayFirst = 0, monthFirst = 0;
    rows.forEach(function (r) {
      r.forEach(function (v) {
        var m = String(v == null ? "" : v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}$/);
        if (m) { var a = +m[1], b = +m[2]; if (a > 12 && b <= 12) dayFirst++; else if (b > 12 && a <= 12) monthFirst++; }
      });
    });
    DMY = monthFirst > dayFirst ? false : true; // only flip to month-first if the file proves it
  }
  function dim(y, m) { return new Date(y, m, 0).getDate(); }
  function iso(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1)) return null;
    if (d > dim(y, m)) return null; // reject impossible day-of-month (e.g. 31 Feb)
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }
  function parseDate(s) {
    if (!s) return null; s = String(s).trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
      var a = +m[1], b = +m[2], yy = m[3];
      var dd = DMY ? a : b, mm = DMY ? b : a;
      if (mm > 12 && dd <= 12) { var t = dd; dd = mm; mm = t; } // correct when one component is unambiguous
      if (yy.length === 2) yy = (+yy > 70 ? "19" : "20") + yy;
      return iso(yy, mm, dd);
    }
    if ((m = s.match(/^(\d{1,2})[\s\-]*([A-Za-z]{3})[A-Za-z]*[\s\-]*(\d{2,4})/))) {
      var mo = MONTHS[m[2].toLowerCase()]; if (!mo) return null;
      var y = m[3]; if (y.length === 2) y = "20" + y;
      return iso(y, mo, m[1]);
    }
    var d = new Date(s); if (!isNaN(d)) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); // LOCAL components — no UTC day-shift
    return null;
  }
  function toNum(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    var neg = false;
    if (/dr\b|dr$/i.test(s)) neg = true;          // "DR" debit suffix
    if (/^\(.*\)$/.test(s)) neg = true;            // (123.45) accounting negative
    s = s.replace(/\b(dr|cr)\b/ig, "").replace(/[()]/g, "").replace(/[$£€\s]/g, "");
    // European decimal (1.234,56) → 1234.56
    if (/,\d{2}$/.test(s) && /\.\d{3}/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(,\d{1,2})$/.test(s)) s = s.replace(",", ".");
    s = s.replace(/,/g, "");
    if (s === "" || s === "-" || s === "+") return NaN;
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  }

  /* ---- column detection ---------------------------------------------------- */
  function looksLikeHeader(row) {
    var joined = row.join(" ").toLowerCase();
    return /date|amount|description|debit|credit|balance|details|narrative|transaction/.test(joined) &&
      !row.some(function (c) { return parseDate(c) && /\d/.test(c); });
  }
  function detectColumns(header) {
    var map = { date: -1, amount: -1, debit: -1, credit: -1, desc: -1, balance: -1 };
    var H = header.map(function (h) { return String(h).toLowerCase().trim(); });
    var used = {};
    var exact = { date: /^(date|transaction date|posted|posting date|value date)$/, amount: /^(amount|amt|value)$/, debit: /^(debit|withdrawal|withdrawals|money out|paid out|debit amount)$/, credit: /^(credit|deposit|deposits|money in|paid in|credit amount)$/, desc: /^(description|details|narrative|transaction details|reference|particulars|merchant|memo|payee)$/, balance: /^(balance|running balance)$/ };
    var sub = { date: /\bdate\b|posted|processed/, amount: /\bamount\b|\bamt\b/, debit: /\bdebit\b|withdrawal|paid out|money out/, credit: /\bcredit\b|deposit|paid in|money in/, desc: /desc|detail|narrative|particulars|merchant|memo|reference|payee/, balance: /\bbalance\b/ };
    function pass(re) { H.forEach(function (h, i) {
      if (/credit card|card number|card no/.test(h)) return; // card columns must not hijack credit/amount
      for (var k in re) { if (map[k] < 0 && !used[i] && re[k].test(h)) { map[k] = i; used[i] = 1; break; } }
    }); }
    pass(exact); pass(sub);
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
    // numeric columns (not the date col), left-to-right. Canonical AU layout is
    // Date, Amount, Description[, Balance] — so the EARLIEST numeric col is the amount
    // and the LAST is the running balance. This is correct even when the account is
    // overdrawn (balance negative) — we never pick balance as the amount.
    var numeric = stats.filter(function (s) { return s.c !== dateCol && s.numHits > sample.length / 2; }).sort(function (a, b) { return a.c - b.c; });
    var amtCol = numeric.length ? numeric[0].c : -1;
    var balCol = numeric.length >= 2 ? numeric[numeric.length - 1].c : -1;
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
    detectDateOrder(rows); // decide dd/mm vs mm/dd for the whole file before parsing dates
    var map, dataRows;
    if (looksLikeHeader(rows[0])) { map = detectColumns(rows[0]); dataRows = rows.slice(1); }
    else { map = detectPositional(rows); dataRows = rows; }
    if (map.date < 0) { map = detectPositional(rows); dataRows = looksLikeHeader(rows[0]) ? rows.slice(1) : rows; }
    var txns = normalize(dataRows, map);
    // If the file carried no signs and no debit/credit split, in-vs-out is unknowable.
    // Default everything to "out" (statements are mostly spending) and flag for the user.
    var usedSplit = map.debit >= 0 || map.credit >= 0;
    var anyNeg = txns.some(function (t) { return t.amount < 0; });
    var directionUnknown = !usedSplit && !anyNeg && map.amount >= 0 && txns.length > 0;
    if (directionUnknown) txns.forEach(function (t) { t.type = "expense"; t.amount = -Math.abs(t.amount); t.category = guessCategory(t.description); });
    return { transactions: txns, map: map, rowCount: dataRows.length, directionUnknown: directionUnknown };
  }

  /* ---- PDF parsing (coordinate-aware; lazy-loads pdf.js if online) ----------
     Bank PDFs (esp. CommBank) put Debit/Credit/Amount and the running Balance in
     separate COLUMNS, often on a different visual row than the transaction's date.
     We rebuild rows by Y, columns by X (from the header anchors), walk each
     transaction (date-led, possibly multi-row), and derive the amount + direction
     from the running BALANCE delta (authoritative), with the Debit/Credit/Amount
     column as fallback. This makes expenses-vs-income exact and misses nothing. */
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var PDF_NOISE = /^(Card\s+xx|Value Date|to PayID Phone$|PayID Phone|from CommBank App|CommBank App$)/i;
  var PDF_FOOTER = /while this letter|we.?re not responsible|reliance on this information|any pending|created \d|transaction summary v|opening balance|closing balance|brought forward|carried forward|page \d+ of|account number|cheque proceeds|available when|^cleared|^date\b/i;
  function pdfIsMoney(s) { return /\d[\d,]*\.\d{2}/.test(s); }
  function pdfMoneyVal(s) { var neg = /^\s*[-(]/.test(s); var v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? NaN : (neg ? -v : v); }
  function pdfBuildRows(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var x = Math.round(it.transform[4]), y = Math.round(it.transform[5]);
      if (x < 45) return; // drop far-left margin noise (barcodes, print codes)
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].y - y) <= 3) { row = rows[i]; break; } }
      if (!row) { row = { y: y, cells: [] }; rows.push(row); }
      row.cells.push({ x: x, s: it.str.trim() });
    });
    rows.forEach(function (r) { r.cells.sort(function (a, b) { return a.x - b.x; }); });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows;
  }
  function pdfFindHeader(rows) {
    for (var i = 0; i < rows.length; i++) {
      var txt = rows[i].cells.map(function (c) { return c.s; }).join(" ");
      if (/Balance/i.test(txt) && /Date/i.test(txt) && /(Amount|Debit)/i.test(txt)) {
        var a = {};
        rows[i].cells.forEach(function (c) {
          if (/^Date/i.test(c.s)) a.date = c.x;
          else if (/Transaction/i.test(c.s)) a.desc = c.x;
          else if (/^Debit/i.test(c.s)) a.debit = c.x;
          else if (/^Credit/i.test(c.s)) a.credit = c.x;
          else if (/^Amount/i.test(c.s)) a.amount = c.x;
          else if (/^Balance/i.test(c.s)) a.balance = c.x;
        });
        if (a.balance != null && (a.amount != null || a.debit != null)) return a;
      }
    }
    return null;
  }
  function pdfLeadingDate(s, ys) {
    var m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})\b/);
    if (m) { var mo = MON[m[2].slice(0, 3).toLowerCase()]; if (mo == null) return null; ys.cur = +m[3]; ys.lastMo = mo; return { day: +m[1], mo: mo, yr: +m[3], rest: s.slice(m[0].length).trim() }; }
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?(?!\w)/);
    if (m) { var mo2 = MON[m[2].slice(0, 3).toLowerCase()]; if (mo2 == null) return null; var yr = ys.cur || new Date().getFullYear(); if (ys.lastMo != null && mo2 < ys.lastMo - 1) yr += 1; ys.cur = yr; ys.lastMo = mo2; return { day: +m[1], mo: mo2, yr: yr, rest: s.slice(m[0].length).trim() }; }
    return null;
  }
  function pdfIso(d) { return d.yr + "-" + String(d.mo + 1).padStart(2, "0") + "-" + String(d.day).padStart(2, "0"); }
  // Parse a CommBank-style statement from per-page text items. Returns [] if no header found.
  function parseStatement(pages) {
    var raw = [], cur = null, prevBal = null, ys = { cur: null, lastMo: null }, anchors = null, done = false;
    function pushCur() { if (cur && cur.date) raw.push(cur); cur = null; }
    for (var pi = 0; pi < pages.length && !done; pi++) {
      var rows = pdfBuildRows(pages[pi].items);
      var h = pdfFindHeader(rows); if (h) anchors = h;
      if (!anchors) continue;
      var balBound = anchors.balance - 30;
      var amtStart = (anchors.amount != null ? anchors.amount : anchors.debit) - 30;
      var creditBound = anchors.credit != null ? (anchors.debit + anchors.credit) / 2 : null;
      for (var ri = 0; ri < rows.length && !done; ri++) {
        var r = rows[ri];
        var txt = r.cells.map(function (c) { return c.s; }).join(" ");
        if (/CLOSING BALANCE/.test(txt) && (cur || raw.length)) { pushCur(); done = true; break; } // table-end marker (uppercase), not the top summary "Closing Balance"
        var first = r.cells[0];
        var dt = first ? pdfLeadingDate(first.s, ys) : null;
        if (/OPENING BALANCE/i.test(txt)) { var ob = r.cells.filter(function (c) { return pdfIsMoney(c.s) && c.x >= balBound; }).pop(); if (ob) prevBal = pdfMoneyVal(ob.s); continue; }
        if (!dt && /^Date\b/i.test(first ? first.s : "") && /Balance/i.test(txt)) continue; // header row
        // classify money cells
        var balCell = null, amtCell = null;
        r.cells.forEach(function (c) { if (!pdfIsMoney(c.s)) return; if (c.x >= balBound) balCell = c; else if (c.x >= amtStart) amtCell = c; });
        if (dt) {
          pushCur();
          cur = { date: pdfIso(dt), desc: [], bal: null, colAmt: null };
          if (dt.rest) cur.desc.push(dt.rest);
          r.cells.slice(1).forEach(function (c) { if (pdfIsMoney(c.s)) return; if (c.x < amtStart) cur.desc.push(c.s); });
        } else if (cur && !PDF_FOOTER.test(txt)) {
          r.cells.forEach(function (c) { if (pdfIsMoney(c.s)) return; if (c.x >= amtStart) return; if (PDF_NOISE.test(c.s)) return; cur.desc.push(c.s); });
        }
        if (cur) {
          if (balCell) cur.bal = pdfMoneyVal(balCell.s);
          if (amtCell) {
            var v = pdfMoneyVal(amtCell.s);
            if (creditBound != null && !/^[-($]/.test(amtCell.s.trim())) cur.colAmt = amtCell.x >= creditBound ? Math.abs(v) : -Math.abs(v);
            else cur.colAmt = v;
          }
        }
      }
    }
    pushCur();
    var out = [], pb = prevBal;
    raw.forEach(function (t) {
      var amount = null;
      if (t.bal != null && pb != null) amount = Math.round((t.bal - pb) * 100) / 100;
      if ((amount == null || amount === 0) && t.colAmt != null) amount = t.colAmt;
      if (amount == null || amount === 0) return;
      if (t.bal != null) pb = t.bal;
      var desc = t.desc.join(" ").replace(/\s+/g, " ").trim();
      var isRentIn = amount > 0 && /\brent\b/i.test(desc); // money received that's actually rent collected from housemates
      out.push({
        date: t.date, amount: amount, description: desc,
        type: amount < 0 ? "expense" : "income",
        category: amount < 0 ? guessCategory(desc) : (isRentIn ? "Rent (collected)" : "Income"),
        excludeFromIncome: isRentIn, // pass-through — not the user's own income (toggle on the transaction if wrong)
        include: true,
        id: "tx_" + t.date + "_" + Math.random().toString(36).slice(2, 7)
      });
    });
    return out;
  }
  function fromPDF(arrayBuffer) {
    return new Promise(function (resolve) {
      function go() {
        try {
          var pdfjsLib = global.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
            var jobs = [];
            for (var p = 1; p <= pdf.numPages; p++) {
              jobs.push(pdf.getPage(p).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  return { items: tc.items.map(function (it) { return { str: it.str, transform: it.transform }; }) };
                });
              }));
            }
            Promise.all(jobs).then(function (pages) {
              var txns = [];
              try { txns = parseStatement(pages); } catch (e) { txns = []; }
              if (txns && txns.length) { resolve({ transactions: txns, fromPdf: true }); return; }
              // fallback: generic single-line date+amount text parse
              var text = pages.map(function (pg) {
                var lines = {};
                pg.items.forEach(function (it) { var y = Math.round(it.transform[5]); (lines[y] = lines[y] || []).push({ x: Math.round(it.transform[4]), s: it.str }); });
                return Object.keys(lines).sort(function (a, b) { return b - a; }).map(function (y) { return lines[y].sort(function (a, b) { return a.x - b.x; }).map(function (c) { return c.s; }).join(" "); }).join("\n");
              }).join("\n");
              resolve(parsePdfText(text));
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
  // generic fallback: free text lines like "12/06/2026  WOOLWORTHS METRO  -84.20"
  function parsePdfText(text) {
    var lines = text.split(/\n/), out = [];
    var MONEY = /(?:\$\s?-?\d[\d,]*(?:\.\d{2})?|-?\d[\d,]*\.\d{2}|\(\s?\$?\d[\d,]*(?:\.\d{2})?\s?\))/g;
    lines.forEach(function (ln) {
      var dm = ln.match(/(\d{1,2}[\/\-.][A-Za-z0-9]{2,3}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/);
      var amts = ln.match(MONEY);
      if (!dm || !amts) return;
      var date = parseDate(dm[1]); if (!date) return;
      var amount = toNum(amts[0]);
      if (isNaN(amount)) return;
      if (/^\(/.test(amts[0].trim())) amount = -Math.abs(amount);
      var desc = ln.replace(dm[1], "").replace(MONEY, "").replace(/\s+/g, " ").trim();
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
