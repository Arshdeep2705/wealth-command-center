/* ============================================================================
   model.js — the calculation engine (pure functions over state)
   Income aggregation from the weekly template, calendar-accurate monthly
   projections, Australian tax (ATO 2025-26, verified), net worth + savings.
   ============================================================================ */
(function (global) {
  "use strict";

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  /* ---- Australian resident tax — 2025-26 (verified vs ato.gov.au) ---------- */
  // tax = base + rate * (income - min) for the bracket where min < income <= max
  var TAX_BRACKETS = [
    { min: 0, max: 18200, rate: 0.00, base: 0 },
    { min: 18200, max: 45000, rate: 0.16, base: 0 },
    { min: 45000, max: 135000, rate: 0.30, base: 4288 },
    { min: 135000, max: 190000, rate: 0.37, base: 31288 },
    { min: 190000, max: Infinity, rate: 0.45, base: 51638 }
  ];
  var MEDICARE_LEVY = 0.02;
  // Medicare Levy Surcharge — single, no private hospital cover (2025-26)
  var MLS_SINGLE = [
    { min: 0, max: 101000, rate: 0.0 },
    { min: 101000, max: 118000, rate: 0.01 },
    { min: 118000, max: 158000, rate: 0.0125 },
    { min: 158000, max: Infinity, rate: 0.015 }
  ];

  function incomeTax(taxable) {
    taxable = Math.max(0, taxable || 0);
    for (var i = TAX_BRACKETS.length - 1; i >= 0; i--) {
      var b = TAX_BRACKETS[i];
      if (taxable > b.min) return b.base + b.rate * (taxable - b.min);
    }
    return 0;
  }
  function medicareLevy(taxable) {
    taxable = Math.max(0, taxable || 0);
    if (taxable <= 27222) return 0;
    if (taxable < 34027) return (taxable - 27222) * 0.10;
    return taxable * MEDICARE_LEVY;
  }
  function mlsRate(taxable) {
    for (var i = MLS_SINGLE.length - 1; i >= 0; i--) {
      if (taxable > MLS_SINGLE[i].min) return MLS_SINGLE[i].rate;
    }
    return 0;
  }
  // Full ATO breakdown for an annual taxable income
  function taxBreakdown(annual, opts) {
    opts = opts || {};
    var t = Math.max(0, annual || 0);
    var tax = incomeTax(t);
    var med = medicareLevy(t);
    var mls = (opts.applyMLS && !opts.hasCover) ? t * mlsRate(t) : 0;
    var total = tax + med + mls;
    return {
      gross: t, incomeTax: tax, medicare: med, mls: mls, totalTax: total,
      takeHome: t - total, effective: t > 0 ? total / t : 0,
      marginal: marginalRate(t)
    };
  }
  function marginalRate(t) {
    for (var i = TAX_BRACKETS.length - 1; i >= 0; i--) if (t > TAX_BRACKETS[i].min) return TAX_BRACKETS[i].rate;
    return 0;
  }

  /* ---- Weekly schedule aggregation ----------------------------------------- */
  function shiftsForDay(state, day) {
    return (state.shifts || []).filter(function (s) { return s.day === day; });
  }
  function dayBlocks(state, day) {
    // time-blocked shifts only (have start/end)
    return shiftsForDay(state, day).filter(function (s) { return s.kind !== "business" && s.start != null && s.end != null; })
      .sort(function (a, b) { return a.start - b.start; });
  }
  function dayBusiness(state, day) {
    return shiftsForDay(state, day).filter(function (s) { return s.kind === "business" || s.start == null; });
  }
  function dayTotal(state, day) {
    return shiftsForDay(state, day).reduce(function (sum, s) { return sum + (+s.pay || 0); }, 0);
  }
  function dayHours(state, day) {
    return dayBlocks(state, day).reduce(function (sum, s) { return sum + Math.max(0, s.end - s.start); }, 0);
  }
  function weeklyByDay(state) {
    return DAYS.map(function (_, d) {
      return { day: d, name: DAYS[d], total: dayTotal(state, d), hours: dayHours(state, d), blocks: dayBlocks(state, d), business: dayBusiness(state, d) };
    });
  }
  function weeklyTotal(state) {
    return (state.shifts || []).reduce(function (s, x) { return s + (+x.pay || 0); }, 0);
  }
  function weeklyHours(state) {
    var h = 0; for (var d = 0; d < 7; d++) h += dayHours(state, d); return h;
  }
  function weeklyBySource(state) {
    var map = {};
    (state.incomeSources || []).forEach(function (src) { map[src.id] = 0; });
    (state.shifts || []).forEach(function (s) { map[s.sourceId] = (map[s.sourceId] || 0) + (+s.pay || 0); });
    return map;
  }
  function sourceById(state, id) {
    return (state.incomeSources || []).find(function (s) { return s.id === id; }) || { id: id, name: id, color: "#888", short: id };
  }
  function accountById(state, id) {
    return (state.accounts || []).find(function (a) { return a.id === id; }) || null;
  }

  /* ---- Calendar-accurate monthly income ------------------------------------ */
  // JS getDay(): 0=Sun..6=Sat → convert to our Mon=0..Sun=6
  function jsToMon(jsDay) { return (jsDay + 6) % 7; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m is 1-based
  function monthMeta(key) { var p = key.split("-"); return { y: +p[0], m: +p[1] }; }

  // gross income projected for a month from the weekly template across real dates
  function monthIncomeProjected(state, key) {
    var meta = monthMeta(key);
    var perDay = DAYS.map(function (_, d) { return dayTotal(state, d); });
    var total = 0, dim = daysInMonth(meta.y, meta.m), bySource = {};
    (state.incomeSources || []).forEach(function (s) { bySource[s.id] = 0; });
    var dayPaySource = {};
    DAYS.forEach(function (_, d) {
      dayPaySource[d] = {};
      shiftsForDay(state, d).forEach(function (s) { dayPaySource[d][s.sourceId] = (dayPaySource[d][s.sourceId] || 0) + (+s.pay || 0); });
    });
    for (var date = 1; date <= dim; date++) {
      var jd = new Date(meta.y, meta.m - 1, date).getDay();
      var d = jsToMon(jd);
      total += perDay[d];
      Object.keys(dayPaySource[d]).forEach(function (sid) { bySource[sid] += dayPaySource[d][sid]; });
    }
    return { gross: total, bySource: bySource, days: dim };
  }
  function monthIncome(state, key) {
    var m = state.months && state.months[key];
    if (m && m.incomeOverride != null) return { gross: +m.incomeOverride, bySource: null, days: daysInMonth(monthMeta(key).y, monthMeta(key).m), overridden: true };
    return monthIncomeProjected(state, key);
  }

  /* ---- Expenses ------------------------------------------------------------ */
  function monthExpenses(state, key) {
    var m = state.months && state.months[key];
    var list = (m && m.expenses) || [];
    var sum = list.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    // plus any imported transactions dated in this month with type expense
    (state.transactions || []).forEach(function (t) {
      if (t && t.date && t.date.slice(0, 7) === key && (t.type === "expense" || (+t.amount < 0))) {
        sum += Math.abs(+t.amount || 0);
      }
    });
    return sum;
  }
  function expenseByCategory(state, key) {
    var out = {};
    var m = state.months && state.months[key];
    ((m && m.expenses) || []).forEach(function (e) { out[e.category || "Other"] = (out[e.category || "Other"] || 0) + (+e.amount || 0); });
    (state.transactions || []).forEach(function (t) {
      if (t && t.date && t.date.slice(0, 7) === key && (t.type === "expense" || (+t.amount < 0))) {
        var c = t.category || "Other"; out[c] = (out[c] || 0) + Math.abs(+t.amount || 0);
      }
    });
    return out;
  }

  /* ---- Month summary (income, tax, expenses, net) -------------------------- */
  function monthSummary(state, key) {
    var inc = monthIncome(state, key);
    var gross = inc.gross;
    var setPct = (state.settings.taxSetAsidePct || 0) / 100;
    var taxSetAside = gross * setPct;
    var expenses = monthExpenses(state, key);
    var afterTaxFlat = gross - taxSetAside;          // user's rule (keep 60%)
    var netToSavings = gross - taxSetAside - expenses; // adds to net worth
    var netProfit = gross - expenses;                  // pre-tax operating profit
    return {
      key: key, gross: gross, bySource: inc.bySource, overridden: !!inc.overridden,
      taxSetAside: taxSetAside, expenses: expenses,
      afterTaxFlat: afterTaxFlat, netProfit: netProfit, netToSavings: netToSavings,
      savingsRate: gross > 0 ? netToSavings / gross : 0
    };
  }
  function months(state) { return Object.keys(state.months || {}).sort(); }
  function yearSummary(state) {
    var ms = months(state);
    var gross = 0, expenses = 0, taxSetAside = 0, netToSavings = 0;
    ms.forEach(function (k) {
      var s = monthSummary(state, k);
      gross += s.gross; expenses += s.expenses; taxSetAside += s.taxSetAside; netToSavings += s.netToSavings;
    });
    var annualRunRate = weeklyTotal(state) * 52;
    return { months: ms, gross: gross, expenses: expenses, taxSetAside: taxSetAside, netToSavings: netToSavings, annualRunRate: annualRunRate };
  }

  /* ---- Net worth ----------------------------------------------------------- */
  function netWorth(state) {
    var liquid = 0, pending = 0, byType = {};
    (state.accounts || []).forEach(function (a) {
      var v = +a.balance || 0;
      if (a.liquid) liquid += v; else pending += v;
      byType[a.type] = (byType[a.type] || 0) + v;
    });
    return { liquid: liquid, pending: pending, total: liquid + pending, byType: byType, accounts: state.accounts || [] };
  }
  // projected net worth path across the horizon (starts at liquid now, adds monthly netToSavings)
  function netWorthProjection(state) {
    var nw = netWorth(state);
    var pts = [{ key: "now", label: "Now", value: nw.liquid }];
    var running = nw.liquid;
    months(state).forEach(function (k) {
      running += monthSummary(state, k).netToSavings;
      pts.push({ key: k, label: monthLabel(k), value: running });
    });
    return { points: pts, endLiquid: running, endTotal: running + nw.pending, pending: nw.pending };
  }

  /* ---- Formatting ---------------------------------------------------------- */
  var _fmt2, _fmt0;
  function fmt() {
    if (!_fmt2) {
      _fmt2 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
      _fmt0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  }
  function money(n) { fmt(); return _fmt2.format(+n || 0); }
  function money0(n) { fmt(); return _fmt0.format(Math.round(+n || 0)); }
  function moneyShort(n) {
    n = +n || 0; var a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "k";
    return sign + "$" + a.toFixed(0);
  }
  function pct(n, dp) { return ((+n || 0) * 100).toFixed(dp == null ? 1 : dp) + "%"; }
  function hhmm(dec) {
    var h = Math.floor(dec), m = Math.round((dec - h) * 60);
    if (m === 60) { h++; m = 0; }
    var ap = h >= 12 && h < 24 ? "pm" : "am";
    var hh = h % 12; if (hh === 0) hh = 12; if (h === 24) { hh = 12; ap = "am"; }
    return hh + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }
  function monthLabel(key) {
    var p = key.split("-"); var d = new Date(+p[0], +p[1] - 1, 1);
    return d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
  }
  function monthLabelLong(key) {
    var p = key.split("-"); var d = new Date(+p[0], +p[1] - 1, 1);
    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }

  global.Model = {
    DAYS: DAYS, DAYS_LONG: DAYS_LONG, TAX_BRACKETS: TAX_BRACKETS,
    incomeTax: incomeTax, medicareLevy: medicareLevy, taxBreakdown: taxBreakdown, marginalRate: marginalRate,
    shiftsForDay: shiftsForDay, dayBlocks: dayBlocks, dayBusiness: dayBusiness, dayTotal: dayTotal, dayHours: dayHours,
    weeklyByDay: weeklyByDay, weeklyTotal: weeklyTotal, weeklyHours: weeklyHours, weeklyBySource: weeklyBySource,
    sourceById: sourceById, accountById: accountById,
    monthIncome: monthIncome, monthIncomeProjected: monthIncomeProjected, monthExpenses: monthExpenses,
    expenseByCategory: expenseByCategory, monthSummary: monthSummary, months: months, yearSummary: yearSummary,
    netWorth: netWorth, netWorthProjection: netWorthProjection,
    daysInMonth: daysInMonth, jsToMon: jsToMon,
    money: money, money0: money0, moneyShort: moneyShort, pct: pct, hhmm: hhmm,
    monthLabel: monthLabel, monthLabelLong: monthLabelLong
  };
})(window);
