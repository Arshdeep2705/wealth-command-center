/* ============================================================================
   app.js — router, views, interactions for the Wealth Command Center
   ============================================================================ */
(function (global) {
  "use strict";
  var M, C, S, IMP, state;

  var NAV = [
    { id: "overview", label: "Command", m: "Home", icon: icoGrid },
    { id: "schedule", label: "Schedule", m: "Roster", icon: icoCalendar },
    { id: "income", label: "Income", m: "Income", icon: icoTrend },
    { id: "expenses", label: "Expenses", m: "Spend", icon: icoWallet },
    { id: "networth", label: "Net Worth", m: "Worth", icon: icoDiamond },
    { id: "months", label: "Months", m: "Months", icon: icoStack },
    { id: "tax", label: "Tax", m: "Tax", icon: icoShield },
    { id: "settings", label: "Settings", m: "Setup", icon: icoGear }
  ];

  /* ---------------------------------------------------------------- helpers */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function commit() { S.save(state); }
  function delta(n) { return (n >= 0 ? "+" : "") + M.money0(n); }

  function todayInfo() {
    var d = new Date();
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    var mons = M.months(state);
    if (mons.indexOf(key) < 0) key = mons[0];
    return { date: d, monthKey: key, weekday: M.jsToMon(d.getDay()) };
  }

  /* ------------------------------------------------------------------ shell */
  function shell() {
    var nw = M.netWorth(state);
    return '' +
      '<div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<div class="grain" aria-hidden="true"></div>' +
      '<aside class="sidebar">' +
        '<div class="brand">' +
          '<div class="brand-mark">' + icoDiamond() + '</div>' +
          '<div class="brand-txt"><strong>ARSH</strong><span>Command Center</span></div>' +
        '</div>' +
        '<nav class="nav">' + NAV.map(function (n) {
          return '<a href="#' + n.id + '" class="nav-item" data-nav="' + n.id + '">' +
            '<span class="ni-ico">' + n.icon() + '</span><span class="ni-lbl">' + n.label + '</span></a>';
        }).join("") + '</nav>' +
        '<div class="side-foot">' +
          '<div class="side-nw"><span class="lbl">Net worth</span><strong class="num">' + M.money0(nw.total) + '</strong></div>' +
          '<button class="ghost-btn" data-act="install" hidden>Install app</button>' +
        '</div>' +
      '</aside>' +
      '<main class="main" id="view"></main>' +
      '<nav class="tabbar">' + NAV.map(function (n) {
        return '<a href="#' + n.id + '" class="tab" data-nav="' + n.id + '"><span class="t-ico">' + n.icon() + '</span><span>' + n.m + '</span></a>';
      }).join("") + '</nav>' +
      '<div class="modal-root" id="modalRoot"></div>' +
      '<div class="toast" id="toast"></div>';
  }

  /* --------------------------------------------------------------- topbar UI */
  function topbar(title, sub, actions) {
    return '<header class="topbar">' +
      '<div class="tb-l"><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      '<div class="tb-r">' + (actions || "") + '</div></header>';
  }
  function kpi(label, value, opts) {
    opts = opts || {};
    return '<div class="kpi ' + (opts.cls || "") + '">' +
      '<span class="kpi-l">' + esc(label) + '</span>' +
      '<strong class="kpi-v" style="' + (opts.color ? "color:" + opts.color : "") + '">' + value + '</strong>' +
      (opts.sub ? '<span class="kpi-s">' + opts.sub + '</span>' : '') +
      (opts.bar ? opts.bar : '') + '</div>';
  }
  function card(inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + '</section>'; }
  function cardH(title, right) { return '<div class="card-h"><h3>' + esc(title) + '</h3>' + (right ? '<div class="card-h-r">' + right + '</div>' : '') + '</div>'; }
  function chip(txt, color) { return '<span class="chip" style="' + (color ? "--c:" + color : "") + '">' + esc(txt) + '</span>'; }

  /* =================================================================== views */
  function render() {
    var hash = (location.hash || "#overview").slice(1);
    var view = NAV.find(function (n) { return n.id === hash; }) ? hash : "overview";
    $$(".nav-item, .tab").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === view); });
    var host = $("#view");
    host.classList.remove("enter"); void host.offsetWidth;
    host.innerHTML = ({
      overview: viewOverview, schedule: viewSchedule, income: viewIncome,
      expenses: viewExpenses, networth: viewNetworth, months: viewMonths,
      tax: viewTax, settings: viewSettings
    }[view])();
    host.classList.add("enter");
    host.scrollTop = 0;
    if (state.isDemo && view === "overview") showDemoBanner();
  }

  /* ----------------------------------------------------------- OVERVIEW */
  function viewOverview() {
    var nw = M.netWorth(state);
    var wk = M.weeklyTotal(state), annual = wk * 52;
    var setPct = state.settings.taxSetAsidePct || 0;
    var afterFlat = annual * (1 - setPct / 100);
    var atoTax = M.taxBreakdown(annual, { applyMLS: state.settings.mlsEnabled, hasCover: state.settings.privateHospitalCover });
    var t = todayInfo();
    var ms = M.monthSummary(state, t.monthKey);
    var proj = M.netWorthProjection(state);

    // income by source donut
    var bySrc = M.weeklyBySource(state);
    var segs = (state.incomeSources || []).map(function (s) { return { label: s.name, value: bySrc[s.id] || 0, color: s.color }; })
      .filter(function (s) { return s.value > 0; }).sort(function (a, b) { return b.value - a.value; });

    // net worth composition donut
    var nwSegs = (state.accounts || []).map(function (a) { return { label: a.name, value: +a.balance || 0, color: a.color }; }).filter(function (s) { return s.value > 0; });

    // month strip
    var monthBars = M.months(state).map(function (k) {
      var s = M.monthSummary(state, k);
      return { label: M.monthLabel(k).split(" ")[0], value: s.gross, sub: M.moneyShort(s.netToSavings), color: k === t.monthKey ? "var(--accent)" : "var(--bar-dim)", highlight: k === t.monthKey };
    });

    var dayList = M.weeklyByDay(state)[t.weekday];

    return topbar("Command Center", M.monthLabelLong(t.monthKey) + " · " + state.fyLabel,
        '<button class="pill-btn" data-act="export">' + icoDownload() + ' Backup</button>' +
        '<button class="pill-btn primary" data-act="import">' + icoUpload() + ' Import</button>') +
      '<div class="grid">' +
        // HERO net worth
        card(
          '<div class="hero">' +
            '<div class="hero-l">' +
              '<span class="eyebrow">Total net worth</span>' +
              '<div class="hero-num" data-count="' + nw.total + '">' + M.money0(nw.total) + '</div>' +
              '<div class="hero-split">' +
                '<span><i class="dot" style="background:var(--good)"></i>Liquid now <b>' + M.money0(nw.liquid) + '</b></span>' +
                '<span><i class="dot" style="background:var(--warn)"></i>Pending / future <b>' + M.money0(nw.pending) + '</b></span>' +
              '</div>' +
              C.stackbar([
                { label: "Liquid", value: nw.liquid, color: "var(--good)" },
                { label: "Pending", value: nw.pending, color: "var(--warn)" }
              ]) +
              '<div class="hero-tags">' + nw.accounts.map(function (a) { return chip(a.short + " · " + M.moneyShort(a.balance), a.color); }).join("") + '</div>' +
            '</div>' +
            '<div class="hero-r">' + C.donut(nwSegs, { size: 188, stroke: 22, centerTop: "PROJECTED", centerMain: M.moneyShort(proj.endTotal), centerSub: "by Dec 2026" }) + '</div>' +
          '</div>', "span-2 hero-card") +

        // KPI cluster
        card(cardH("This week") +
          '<div class="kpi-row">' +
            kpi("Per week", M.money0(wk), { color: "var(--accent)" }) +
            kpi("Per year (run-rate)", M.money0(annual)) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Hours / week", M.weeklyHours(state).toFixed(1) + "h") +
            kpi("Effective hourly", M.money(wk / Math.max(1, M.weeklyHours(state)))) +
          '</div>', "") +

        // after tax
        card(cardH("Projected annual after tax") +
          '<div class="kpi-row">' +
            kpi("Your set-aside (" + setPct + "%)", M.money0(afterFlat), { color: "var(--good)", sub: "keep " + (100 - setPct) + "%" }) +
            kpi("ATO estimate", M.money0(atoTax.takeHome), { sub: "eff. " + M.pct(atoTax.effective) }) +
          '</div>' +
          '<p class="muted small">You set aside ' + M.money0(annual * setPct / 100) + '/yr. Real ATO tax ≈ ' + M.money0(atoTax.totalTax) + ' — a ' + M.money0(annual * setPct / 100 - atoTax.totalTax) + ' buffer.</p>') +

        // this month
        card(cardH(M.monthLabel(t.monthKey) + " snapshot", '<a class="mini-link" href="#months">details ›</a>') +
          '<div class="kpi-row">' +
            kpi("Income", M.money0(ms.gross), { color: "var(--accent)" }) +
            kpi("Expenses", M.money0(ms.expenses), { color: ms.expenses ? "var(--bad)" : "var(--muted)" }) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Tax set-aside", M.money0(ms.taxSetAside), { color: "var(--warn)" }) +
            kpi("Added to savings", M.money0(ms.netToSavings), { color: "var(--good)" }) +
          '</div>' +
          (ms.expenses === 0 ? '<p class="muted small">No expenses logged yet — import a statement to fill this in.</p>' : '')) +

        // today
        card(cardH("Today · " + M.DAYS_LONG[t.weekday]) +
          (dayList.blocks.length || dayList.business.length ?
            '<ul class="today-list">' +
              dayList.business.map(function (b) { var s = M.sourceById(state, b.sourceId); return '<li><span class="td-dot" style="background:' + s.color + '"></span><span class="td-name">' + esc(s.short) + ' <em>business</em></span><b>' + M.money0(b.pay) + '</b></li>'; }).join("") +
              dayList.blocks.map(function (b) { var s = M.sourceById(state, b.sourceId); return '<li><span class="td-dot" style="background:' + s.color + '"></span><span class="td-name">' + esc(s.short) + ' · ' + esc(b.label) + '<em>' + M.hhmm(b.start) + "–" + M.hhmm(b.end) + '</em></span><b>' + M.money0(b.pay) + '</b></li>'; }).join("") +
            '</ul><div class="today-total">Today earns <b>' + M.money0(dayList.total) + '</b></div>'
            : '<p class="muted">Rest day — nothing rostered.</p>') ) +

        // income mix
        card(cardH("Income mix · weekly") +
          '<div class="mix">' +
            '<div class="mix-chart">' + C.donut(segs, { size: 168, stroke: 20, centerTop: "WEEKLY", centerMain: M.moneyShort(wk), centerSub: M.weeklyHours(state).toFixed(0) + "h" }) + '</div>' +
            '<ul class="legend">' + segs.map(function (s) { return '<li><i style="background:' + s.color + '"></i><span>' + esc(s.label) + '</span><b>' + M.money0(s.value) + '</b></li>'; }).join("") + '</ul>' +
          '</div>', "span-2") +

        // month strip
        card(cardH("Income across the horizon", '<span class="muted small">Jun–Dec 2026 · projected</span>') +
          C.bars(monthBars, { height: 200, showValues: true, fmt: M.moneyShort }), "span-2") +
      '</div>';
  }

  /* ----------------------------------------------------------- SCHEDULE */
  function viewSchedule() {
    var HOURPX = 46;
    var byDay = M.weeklyByDay(state);
    var wk = M.weeklyTotal(state);
    var hourCol = '<div class="sch-hours">' + Array.apply(null, { length: 25 }).map(function (_, h) {
      return '<div class="sch-hr" style="height:' + HOURPX + 'px"><span>' + (h === 24 ? "" : (h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : (h - 12) + "p")) + '</span></div>';
    }).join("") + '</div>';

    var cols = byDay.map(function (d) {
      var blocks = d.blocks.slice();
      // lane assignment for overlaps
      var lanes = [];
      blocks.forEach(function (b) {
        var placed = false;
        for (var i = 0; i < lanes.length; i++) { if (b.start >= lanes[i] - 0.001) { b._lane = i; lanes[i] = b.end; placed = true; break; } }
        if (!placed) { b._lane = lanes.length; lanes.push(b.end); }
      });
      var laneCount = Math.max(1, lanes.length);
      var blocksHtml = blocks.map(function (b) {
        var s = M.sourceById(state, b.sourceId);
        var top = b.start * HOURPX, hgt = Math.max(20, (b.end - b.start) * HOURPX);
        var w = 100 / laneCount, left = b._lane * w;
        var tall = hgt > 52;
        return '<div class="sch-block" style="top:' + top + 'px;height:' + (hgt - 3) + 'px;left:calc(' + left + '% + 2px);width:calc(' + w + '% - 4px);--c:' + s.color + '" ' +
          'data-shift="' + b.id + '" title="' + esc(s.name + " · " + b.label + " · " + M.hhmm(b.start) + "–" + M.hhmm(b.end) + " · " + M.money(b.pay) + " (" + b.rateNote + ")") + '">' +
          '<span class="sb-name">' + esc(b.label) + (b.phNote ? ' <em class="ph">PH</em>' : '') + '</span>' +
          (tall ? '<span class="sb-src">' + esc(s.short) + '</span><span class="sb-time">' + M.hhmm(b.start) + "–" + M.hhmm(b.end) + '</span>' : '') +
          '<span class="sb-pay">' + M.money0(b.pay) + '</span></div>';
      }).join("");
      var biz = d.business.map(function (b) { var s = M.sourceById(state, b.sourceId); return '<span class="sch-biz" style="--c:' + s.color + '" title="' + esc(s.name + " · business income") + '">' + esc(s.short) + ' +' + M.money0(b.pay) + '</span>'; }).join("");
      var isToday = todayInfo().weekday === d.day;
      return '<div class="sch-col' + (isToday ? " today" : "") + '">' +
        '<div class="sch-dh"><span class="sch-day">' + M.DAYS_LONG[d.day] + '</span>' + (isToday ? '<span class="sch-now">now</span>' : '') + '</div>' +
        (biz ? '<div class="sch-bizrow">' + biz + '</div>' : '<div class="sch-bizrow empty"></div>') +
        '<div class="sch-grid" style="height:' + (24 * HOURPX) + 'px">' +
          Array.apply(null, { length: 24 }).map(function (_, h) { return '<div class="sch-cell" style="height:' + HOURPX + 'px"></div>'; }).join("") +
          blocksHtml +
        '</div>' +
        '<div class="sch-foot"><span>' + d.hours.toFixed(1) + 'h</span><b>' + M.money0(d.total) + '</b></div>' +
      '</div>';
    }).join("");

    var legend = '<div class="sch-legend">' + (state.incomeSources || []).map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join("") + '</div>';

    return topbar("Weekly Schedule", "A normal week · 12am → 12am · earnings per day",
        '<span class="big-pill">Week total <b>' + M.money0(wk) + '</b></span>') +
      legend +
      '<div class="schedule-wrap">' +
        '<div class="schedule">' + hourCol + '<div class="sch-cols">' + cols + '</div></div>' +
      '</div>' +
      '<p class="muted small center">Tip: scroll sideways on mobile. Overlapping shifts (e.g. an overnight that bleeds into a day job) stack into lanes. “PH” marks the public-holiday Monday, shown at normal pay per your note.</p>';
  }

  /* ----------------------------------------------------------- INCOME */
  function viewIncome() {
    var bySrc = M.weeklyBySource(state), wk = M.weeklyTotal(state);
    var srcRows = (state.incomeSources || []).map(function (s) {
      var weekly = bySrc[s.id] || 0; var annual = weekly * 52;
      var acc = M.accountById(state, s.account);
      return { s: s, weekly: weekly, annual: annual, acc: acc, pctv: wk ? weekly / wk : 0 };
    }).sort(function (a, b) { return b.weekly - a.weekly; });

    var dayBars = M.weeklyByDay(state).map(function (d) {
      return { label: M.DAYS[d.day], value: d.total, sub: d.hours ? d.hours.toFixed(1) + "h" : "", color: "var(--accent)", highlight: todayInfo().weekday === d.day };
    });

    var srcBars = srcRows.map(function (r) { return { label: r.s.short, value: r.weekly, color: r.s.color }; });

    return topbar("Income", "Five sources · " + M.money0(wk) + "/wk · " + M.money0(wk * 52) + "/yr") +
      '<div class="grid">' +
        card(cardH("Earnings by day of week") + C.bars(dayBars, { height: 220, showValues: true, fmt: M.moneyShort }), "span-2") +
        card(cardH("By source · weekly") + C.bars(srcBars, { height: 220, showValues: true, fmt: M.moneyShort })) +
        card(cardH("Source split") +
          '<ul class="legend big">' + srcRows.map(function (r) {
            return '<li><i style="background:' + r.s.color + '"></i><span>' + esc(r.s.name) + '<em>' + M.pct(r.pctv, 0) + '</em></span><b>' + M.money0(r.weekly) + '</b></li>';
          }).join("") + '</ul>') +
        card(cardH("Source detail") +
          '<div class="table-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Lands in</th><th class="r">Weekly</th><th class="r">Monthly*</th><th class="r">Yearly</th></tr></thead><tbody>' +
            srcRows.map(function (r) {
              return '<tr><td><span class="td-dot" style="background:' + r.s.color + '"></span>' + esc(r.s.name) + '<div class="muted xs">' + esc(r.s.note || "") + '</div></td>' +
                '<td>' + (r.acc ? esc(r.acc.name) : "—") + '</td>' +
                '<td class="r num">' + M.money0(r.weekly) + '</td>' +
                '<td class="r num">' + M.money0(r.weekly * 52 / 12) + '</td>' +
                '<td class="r num">' + M.money0(r.annual) + '</td></tr>';
            }).join("") +
            '<tr class="total"><td>Total</td><td></td><td class="r num">' + M.money0(wk) + '</td><td class="r num">' + M.money0(wk * 52 / 12) + '</td><td class="r num">' + M.money0(wk * 52) + '</td></tr>' +
          '</tbody></table></div><p class="muted xs">*Monthly = weekly × 52 ÷ 12 average. The Months tab computes each calendar month exactly.</p>', "span-2") +
      '</div>';
  }

  /* ----------------------------------------------------------- EXPENSES */
  var activeMonth = null;
  function viewExpenses() {
    if (!activeMonth) activeMonth = todayInfo().monthKey;
    var mons = M.months(state);
    var sum = M.monthSummary(state, activeMonth);
    var byCat = M.expenseByCategory(state, activeMonth);
    var catSegs = Object.keys(byCat).map(function (c, i) { return { label: c, value: byCat[c], color: catColor(i) }; }).sort(function (a, b) { return b.value - a.value; });
    var m = state.months[activeMonth];
    var list = (m.expenses || []).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    var monthTabs = '<div class="seg-tabs">' + mons.map(function (k) {
      return '<button class="seg' + (k === activeMonth ? " on" : "") + '" data-month="' + k + '">' + M.monthLabel(k) + '</button>';
    }).join("") + '</div>';

    return topbar("Expenses", "Log spending · import bank statements · auto-categorised",
        '<button class="pill-btn primary" data-act="import-statement">' + icoUpload() + ' Import statement</button>' +
        '<button class="pill-btn" data-act="add-expense">+ Add</button>') +
      monthTabs +
      '<div class="grid">' +
        card(cardH(M.monthLabelLong(activeMonth)) +
          '<div class="kpi-row">' +
            kpi("Income", M.money0(sum.gross), { color: "var(--accent)" }) +
            kpi("Expenses", M.money0(sum.expenses), { color: sum.expenses ? "var(--bad)" : "var(--muted)" }) +
            kpi("Net profit", M.money0(sum.netProfit), { color: "var(--good)" }) +
          '</div>') +
        card(cardH("By category") + (catSegs.length ?
          '<div class="mix"><div class="mix-chart">' + C.donut(catSegs, { size: 150, stroke: 18, centerMain: M.moneyShort(sum.expenses), centerSub: "spent" }) + '</div>' +
          '<ul class="legend">' + catSegs.map(function (s) { return '<li><i style="background:' + s.color + '"></i><span>' + esc(s.label) + '</span><b>' + M.money0(s.value) + '</b></li>'; }).join("") + '</ul></div>'
          : '<p class="muted">No expenses yet for this month. Use <b>Import statement</b> or <b>+ Add</b>.</p>')) +
        card(cardH(list.length + " transactions", '<button class="mini-link" data-act="add-expense">+ add</button>') +
          (list.length ?
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th><th></th></tr></thead><tbody>' +
            list.map(function (e) {
              return '<tr><td class="num">' + esc((e.date || "").slice(5)) + '</td><td>' + esc(e.description || e.name || "—") + '</td>' +
                '<td>' + chip(e.category || "Other") + '</td><td class="r num bad">' + M.money0(e.amount) + '</td>' +
                '<td><button class="x-btn" data-del-exp="' + esc(e.id) + '" title="delete">' + icoX() + '</button></td></tr>';
            }).join("") + '</tbody></table></div>'
            : '<p class="muted">Nothing logged.</p>'), "span-2") +
      '</div>';
  }

  /* ----------------------------------------------------------- NET WORTH */
  function viewNetworth() {
    var nw = M.netWorth(state);
    var proj = M.netWorthProjection(state);
    var pts = proj.points.map(function (p) { return { label: p.label, value: p.value }; });
    var accRows = (state.accounts || []).slice().sort(function (a, b) { return b.balance - a.balance; });
    var typeOrder = { bank: 0, cash: 1, business: 2, receivable: 3, investment: 4 };
    return topbar("Net Worth", "Liquid " + M.money0(nw.liquid) + " · pending " + M.money0(nw.pending) + " · total " + M.money0(nw.total),
        '<button class="pill-btn" data-act="add-account">+ Account</button>') +
      '<div class="grid">' +
        card('<div class="nw-hero"><span class="eyebrow">Total net worth</span><div class="hero-num">' + M.money0(nw.total) + '</div>' +
          '<div class="hero-split"><span><i class="dot" style="background:var(--good)"></i>Liquid <b>' + M.money0(nw.liquid) + '</b></span>' +
          '<span><i class="dot" style="background:var(--warn)"></i>Pending <b>' + M.money0(nw.pending) + '</b></span></div>' +
          C.stackbar([{ label: "Liquid", value: nw.liquid, color: "var(--good)" }, { label: "Pending", value: nw.pending, color: "var(--warn)" }]) + '</div>', "span-2") +
        card(cardH("Composition") + C.donut(accRows.map(function (a) { return { label: a.name, value: a.balance, color: a.color }; }).filter(function (s) { return s.value > 0; }), { size: 168, stroke: 20, centerMain: M.moneyShort(nw.total), centerSub: "total" })) +
        card(cardH("Projected growth", '<span class="muted small">if savings keep pace</span>') +
          C.area(pts, { height: 200, color: "var(--good)" }) +
          '<p class="muted small">Ends ' + M.money0(proj.endLiquid) + ' liquid by Dec 2026' + (proj.pending ? ', plus ' + M.money0(proj.pending) + ' pending = <b>' + M.money0(proj.endTotal) + '</b>' : '') + '.</p>', "span-2") +
        card(cardH("Accounts") +
          '<div class="acct-list">' + accRows.sort(function (a, b) { return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9); }).map(function (a) {
            return '<div class="acct" data-edit-acct="' + esc(a.id) + '">' +
              '<span class="acct-dot" style="background:' + a.color + '"></span>' +
              '<div class="acct-main"><strong>' + esc(a.name) + '</strong><span class="muted xs">' + esc(a.note || "") + (a.liquid ? "" : " · not yet liquid") + '</span></div>' +
              '<div class="acct-bal num">' + M.money0(a.balance) + '</div>' + icoPencil() + '</div>';
          }).join("") + '</div>', "span-2") +
      '</div>';
  }

  /* ----------------------------------------------------------- MONTHS */
  function viewMonths() {
    var ys = M.yearSummary(state);
    var atoTax = M.taxBreakdown(ys.annualRunRate, { applyMLS: state.settings.mlsEnabled, hasCover: state.settings.privateHospitalCover });
    var rows = ys.months.map(function (k) { return { k: k, s: M.monthSummary(state, k) }; });
    var maxG = Math.max.apply(null, rows.map(function (r) { return r.s.gross; }).concat([1]));
    return topbar("Months", "Jun–Dec 2026 · income, expenses, net profit & savings",
        '<span class="big-pill">Year so far <b>' + M.money0(ys.gross) + '</b></span>') +
      '<div class="grid">' +
        card(cardH("Year projection · " + state.fyLabel) +
          '<div class="kpi-row">' +
            kpi("Annual run-rate", M.money0(ys.annualRunRate), { color: "var(--accent)" }) +
            kpi("Tax (ATO est.)", M.money0(atoTax.totalTax), { color: "var(--warn)", sub: M.pct(atoTax.effective) + " eff." }) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("After-tax (ATO)", M.money0(atoTax.takeHome), { color: "var(--good)" }) +
            kpi("Your 60% keep", M.money0(ys.annualRunRate * (1 - (state.settings.taxSetAsidePct || 0) / 100))) +
          '</div>', "span-2") +
        '<div class="month-cards span-2">' + rows.map(function (r) {
          var s = r.s;
          return '<div class="month-card" data-month-go="' + r.k + '">' +
            '<div class="mc-h"><strong>' + M.monthLabel(r.k) + '</strong>' + (s.overridden ? chip("actual") : chip("projected")) + '</div>' +
            '<div class="mc-bar"><span style="height:' + (s.gross / maxG * 100).toFixed(0) + '%"></span></div>' +
            '<dl class="mc-stats">' +
              '<div><dt>Income</dt><dd class="num">' + M.money0(s.gross) + '</dd></div>' +
              '<div><dt>Expenses</dt><dd class="num bad">' + (s.expenses ? M.money0(s.expenses) : "—") + '</dd></div>' +
              '<div><dt>Tax set-aside</dt><dd class="num warn">' + M.money0(s.taxSetAside) + '</dd></div>' +
              '<div><dt>To savings</dt><dd class="num good">' + M.money0(s.netToSavings) + '</dd></div>' +
            '</dl></div>';
        }).join("") + '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------- TAX */
  function viewTax() {
    var annual = M.weeklyTotal(state) * 52;
    var opts = { applyMLS: state.settings.mlsEnabled, hasCover: state.settings.privateHospitalCover };
    var tb = M.taxBreakdown(annual, opts);
    var setPct = state.settings.taxSetAsidePct || 0;
    var setAside = annual * setPct / 100;
    var brackets = M.TAX_BRACKETS.map(function (b, i) {
      var within = annual > b.min;
      var inThis = annual > b.min && annual <= (b.max === Infinity ? 1e15 : b.max);
      var amtInBracket = within ? (Math.min(annual, b.max === Infinity ? annual : b.max) - b.min) : 0;
      return '<tr class="' + (inThis ? "in" : "") + '"><td>' + (b.max === Infinity ? "$" + b.min.toLocaleString() + "+" : "$" + b.min.toLocaleString() + " – $" + b.max.toLocaleString()) + '</td>' +
        '<td class="r">' + (b.rate * 100).toFixed(0) + '%</td>' +
        '<td class="r num">' + (amtInBracket > 0 ? M.money0(amtInBracket) : "—") + '</td>' +
        '<td class="r num">' + (amtInBracket > 0 ? M.money0(amtInBracket * b.rate) : "—") + '</td></tr>';
    }).join("");

    return topbar("Tax", "Australian resident · 2025-26 · verified ATO brackets") +
      '<div class="grid">' +
        card(cardH("On your " + M.money0(annual) + " run-rate") +
          '<div class="kpi-row">' +
            kpi("Income tax", M.money0(tb.incomeTax)) +
            kpi("Medicare levy 2%", M.money0(tb.medicare)) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Total tax (ATO)", M.money0(tb.totalTax), { color: "var(--warn)" }) +
            kpi("Take-home", M.money0(tb.takeHome), { color: "var(--good)" }) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Effective rate", M.pct(tb.effective)) +
            kpi("Marginal rate", M.pct(tb.marginal, 0)) +
          '</div>' +
          (tb.mls ? '<p class="muted small">Includes Medicare Levy Surcharge ' + M.money0(tb.mls) + ' (no private hospital cover). Toggle in Settings.</p>' : '')) +
        card(cardH("Your set-aside plan") +
          '<div class="kpi-row">' +
            kpi("You set aside (" + setPct + "%)", M.money0(setAside), { color: "var(--warn)" }) +
            kpi("Real ATO tax", M.money0(tb.totalTax)) +
          '</div>' +
          '<div class="buffer ' + (setAside >= tb.totalTax ? "ok" : "short") + '">' +
            (setAside >= tb.totalTax
              ? '<b>' + M.money0(setAside - tb.totalTax) + '</b> safety buffer — you set aside more than the ATO will likely take. 👍'
              : '<b>' + M.money0(tb.totalTax - setAside) + '</b> short — consider lifting your set-aside to ' + Math.ceil(tb.effective * 100) + '%.') +
          '</div>' +
          '<label class="field"><span>Set-aside %</span><input type="range" min="0" max="50" value="' + setPct + '" data-setaside></label>' +
          '<p class="muted small">Set aside ' + M.money0(setAside / 12) + '/month into a separate “tax” bucket and you’ll never be caught out.</p>') +
        card(cardH("Bracket breakdown") +
          '<div class="table-wrap"><table class="tbl"><thead><tr><th>Bracket</th><th class="r">Rate</th><th class="r">Your $ in band</th><th class="r">Tax</th></tr></thead><tbody>' +
          brackets +
          '<tr class="total"><td>Income tax</td><td></td><td></td><td class="r num">' + M.money0(tb.incomeTax) + '</td></tr>' +
          '</tbody></table></div>' +
          '<p class="muted xs">Brackets verified against ato.gov.au for FY2025-26. Excludes deductions, offsets, super & business structuring — treat as a planning estimate, not tax advice.</p>', "span-2") +
      '</div>';
  }

  /* ----------------------------------------------------------- SETTINGS */
  function viewSettings() {
    var s = state.settings;
    return topbar("Settings & Data", "Your data lives only in this browser. Back it up.") +
      '<div class="grid">' +
        card(cardH("Your data") +
          '<div class="set-row"><div><strong>Export backup</strong><p class="muted small">Download a .json with everything. Save it to OneDrive to open on your phone.</p></div><button class="pill-btn primary" data-act="export">' + icoDownload() + ' Export</button></div>' +
          '<div class="set-row"><div><strong>Import backup</strong><p class="muted small">Load a .json backup (replaces current data).</p></div><button class="pill-btn" data-act="import">' + icoUpload() + ' Import</button></div>' +
          '<div class="set-row"><div><strong>Import bank statement</strong><p class="muted small">CSV (ANZ / CommBank / any) or PDF.</p></div><button class="pill-btn" data-act="import-statement">' + icoUpload() + ' Statement</button></div>' +
          '<div class="set-row danger"><div><strong>Reset to demo</strong><p class="muted small">Clears your data from this browser.</p></div><button class="pill-btn danger" data-act="reset">Reset</button></div>') +
        card(cardH("Tax & assumptions") +
          '<label class="field"><span>Tax set-aside %</span><input type="number" min="0" max="60" value="' + (s.taxSetAsidePct || 0) + '" data-set="taxSetAsidePct"></label>' +
          '<label class="check"><input type="checkbox" data-set="privateHospitalCover" ' + (s.privateHospitalCover ? "checked" : "") + '><span>I have private hospital cover (avoids Medicare Levy Surcharge)</span></label>' +
          '<label class="check"><input type="checkbox" data-set="mlsEnabled" ' + (s.mlsEnabled ? "checked" : "") + '><span>Apply Medicare Levy Surcharge in estimates</span></label>') +
        card(cardH("Income sources") +
          '<div class="acct-list">' + (state.incomeSources || []).map(function (src) {
            var weekly = M.weeklyBySource(state)[src.id] || 0;
            return '<div class="acct"><span class="acct-dot" style="background:' + src.color + '"></span><div class="acct-main"><strong>' + esc(src.name) + '</strong><span class="muted xs">' + esc(src.note || "") + '</span></div><div class="acct-bal num">' + M.money0(weekly) + '/wk</div></div>';
          }).join("") + '</div>' +
          '<p class="muted xs">Edit shift-level pay in a future update, or adjust the backup JSON directly.</p>') +
        card(cardH("Accounts & balances") +
          '<div class="acct-list">' + (state.accounts || []).map(function (a) {
            return '<div class="acct" data-edit-acct="' + esc(a.id) + '"><span class="acct-dot" style="background:' + a.color + '"></span><div class="acct-main"><strong>' + esc(a.name) + '</strong></div><div class="acct-bal num">' + M.money0(a.balance) + '</div>' + icoPencil() + '</div>';
          }).join("") + '</div>' +
          '<button class="pill-btn" data-act="add-account" style="margin-top:10px">+ Add account</button>') +
        card(cardH("About") +
          '<p class="muted small">Wealth Command Center · all calculations run locally in your browser. Nothing is uploaded anywhere. Net-worth, income and ATO tax figures are planning estimates. Built ' + new Date().getFullYear() + '.</p>' +
          '<button class="ghost-btn" data-act="install" hidden>Install as app</button>', "span-2") +
      '</div>';
  }

  /* =============================================================== modals */
  function modal(title, bodyHtml, footHtml) {
    $("#modalRoot").innerHTML = '<div class="overlay" data-close-modal>' +
      '<div class="dialog" role="dialog" aria-modal="true"><div class="dlg-h"><h3>' + esc(title) + '</h3><button class="x-btn" data-close-modal>' + icoX() + '</button></div>' +
      '<div class="dlg-b">' + bodyHtml + '</div>' + (footHtml ? '<div class="dlg-f">' + footHtml + '</div>' : '') + '</div></div>';
    requestAnimationFrame(function () { var o = $(".overlay"); if (o) o.classList.add("show"); });
  }
  function closeModal() { var o = $(".overlay"); if (o) { o.classList.remove("show"); setTimeout(function () { $("#modalRoot").innerHTML = ""; }, 180); } }

  function addExpenseModal() {
    var cats = state.expenseCategories || [];
    modal("Add expense", '<form id="expForm" class="form">' +
      '<label class="field"><span>Date</span><input type="date" name="date" value="' + activeMonth + '-01" required></label>' +
      '<label class="field"><span>Description</span><input type="text" name="description" placeholder="e.g. Woolworths" required></label>' +
      '<label class="field"><span>Amount ($)</span><input type="number" name="amount" step="0.01" min="0" placeholder="0.00" required></label>' +
      '<label class="field"><span>Category</span><select name="category">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("") + '</select></label>' +
      '</form>',
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="save-expense">Save expense</button>');
  }
  function saveExpense() {
    var f = $("#expForm"); if (!f || !f.reportValidity()) return;
    var d = f.date.value, amt = Math.abs(parseFloat(f.amount.value) || 0);
    if (!amt) return;
    var key = d.slice(0, 7); if (!state.months[key]) key = activeMonth;
    state.months[key].expenses.push({ id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5), date: d, description: f.description.value, amount: amt, category: f.category.value });
    commit(); closeModal(); activeMonth = key; render(); toast("Expense added");
  }

  function accountModal(id) {
    var a = id ? M.accountById(state, id) : null;
    var isNew = !a;
    a = a || { id: "acc_" + Date.now().toString(36), name: "", short: "", type: "bank", liquid: true, balance: 0, note: "", color: "#2f7fff" };
    var types = ["bank", "cash", "business", "receivable", "investment"];
    modal(isNew ? "Add account" : "Edit account", '<form id="acctForm" class="form">' +
      '<input type="hidden" name="id" value="' + esc(a.id) + '">' +
      '<label class="field"><span>Name</span><input name="name" value="' + esc(a.name) + '" required></label>' +
      '<div class="form-2"><label class="field"><span>Short label</span><input name="short" value="' + esc(a.short || "") + '"></label>' +
      '<label class="field"><span>Type</span><select name="type">' + types.map(function (t) { return '<option ' + (a.type === t ? "selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label></div>' +
      '<div class="form-2"><label class="field"><span>Balance ($)</span><input type="number" name="balance" step="0.01" value="' + (a.balance || 0) + '"></label>' +
      '<label class="field"><span>Colour</span><input type="color" name="color" value="' + (a.color || "#2f7fff") + '"></label></div>' +
      '<label class="field"><span>Note</span><input name="note" value="' + esc(a.note || "") + '"></label>' +
      '<label class="check"><input type="checkbox" name="liquid" ' + (a.liquid ? "checked" : "") + '><span>Liquid / available now (uncheck for receivables & future payouts)</span></label>' +
      '</form>',
      (isNew ? '' : '<button class="pill-btn danger" data-del-acct="' + esc(a.id) + '">Delete</button>') +
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="save-account">Save</button>');
  }
  function saveAccount() {
    var f = $("#acctForm"); if (!f || !f.reportValidity()) return;
    var obj = { id: f.id.value, name: f.name.value, short: f.short.value || f.name.value.slice(0, 6), type: f.type.value, balance: parseFloat(f.balance.value) || 0, color: f.color.value, note: f.note.value, liquid: f.liquid.checked };
    var i = (state.accounts || []).findIndex(function (a) { return a.id === obj.id; });
    if (i >= 0) state.accounts[i] = Object.assign(state.accounts[i], obj); else state.accounts.push(obj);
    commit(); closeModal(); render(); toast("Account saved");
  }
  function deleteAccount(id) { state.accounts = (state.accounts || []).filter(function (a) { return a.id !== id; }); commit(); closeModal(); render(); toast("Account removed"); }

  /* ---- statement import flow ---- */
  function importStatementModal() {
    modal("Import bank statement",
      '<div class="drop" id="dropZone"><div class="drop-ico">' + icoUpload() + '</div>' +
      '<p><b>Drop a CSV or PDF here</b><br>or click to choose</p>' +
      '<p class="muted xs">ANZ, CommBank, or any bank. CSV works offline & is most accurate.</p>' +
      '<input type="file" id="stmtFile" accept=".csv,.pdf,text/csv,application/pdf" hidden></div>' +
      '<div id="stmtStatus" class="muted small"></div>',
      '<button class="pill-btn" data-close-modal>Cancel</button>');
    var dz = $("#dropZone"), fi = $("#stmtFile");
    dz.addEventListener("click", function () { fi.click(); });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("over"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("over"); });
    dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) handleStatementFile(e.dataTransfer.files[0]); });
    fi.addEventListener("change", function () { if (fi.files[0]) handleStatementFile(fi.files[0]); });
  }
  function handleStatementFile(file) {
    var status = $("#stmtStatus"); status.textContent = "Reading " + file.name + "…";
    var isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (isPdf) {
      var rd = new FileReader();
      rd.onload = function () { IMP.fromPDF(rd.result).then(function (res) { afterParse(res, file.name); }); };
      rd.readAsArrayBuffer(file);
    } else {
      var r = new FileReader();
      r.onload = function () { afterParse(IMP.fromCSV(String(r.result)), file.name); };
      r.readAsText(file);
    }
  }
  function afterParse(res, name) {
    if (res.error) { $("#stmtStatus").innerHTML = '<span class="bad">' + esc(res.error) + '</span>'; return; }
    var txns = (res.transactions || []).filter(function (t) { return t.date; });
    if (!txns.length) { $("#stmtStatus").innerHTML = '<span class="bad">No transactions detected. Try a CSV export from your bank.</span>'; return; }
    reviewImportModal(txns, name);
  }
  function reviewImportModal(txns, name) {
    var cats = state.expenseCategories || [];
    window.__import = txns;
    var rows = txns.map(function (t, i) {
      return '<tr><td><input type="checkbox" data-imp-chk="' + i + '" ' + (t.include ? "checked" : "") + '></td>' +
        '<td class="num">' + esc(t.date) + '</td><td class="imp-desc">' + esc(t.description) + '</td>' +
        '<td><select data-imp-cat="' + i + '">' + cats.concat(["Income"]).map(function (c) { return '<option ' + (t.category === c ? "selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select></td>' +
        '<td class="r num ' + (t.amount < 0 ? "bad" : "good") + '">' + M.money(t.amount) + '</td></tr>';
    }).join("");
    var exp = txns.filter(function (t) { return t.amount < 0; }).reduce(function (s, t) { return s + Math.abs(t.amount); }, 0);
    var inc = txns.filter(function (t) { return t.amount > 0; }).reduce(function (s, t) { return s + t.amount; }, 0);
    modal("Review " + txns.length + " transactions",
      '<p class="muted small">From <b>' + esc(name) + '</b> · ' + M.money0(exp) + ' out · ' + M.money0(inc) + ' in. Untick anything you don’t want. Dates route to the right month automatically.</p>' +
      '<div class="table-wrap tall"><table class="tbl imp"><thead><tr><th></th><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="commit-import">Import selected</button>');
  }
  function commitImport() {
    var txns = window.__import || [];
    $$("[data-imp-chk]").forEach(function (cb) { txns[+cb.getAttribute("data-imp-chk")].include = cb.checked; });
    $$("[data-imp-cat]").forEach(function (sel) { txns[+sel.getAttribute("data-imp-cat")].category = sel.value; });
    var added = 0;
    txns.forEach(function (t) {
      if (!t.include) return;
      var key = t.date.slice(0, 7);
      if (!state.months[key]) return; // outside horizon → skip silently
      if (t.amount < 0) {
        state.months[key].expenses.push({ id: t.id, date: t.date, description: t.description, amount: Math.abs(t.amount), category: t.category });
        added++;
      } else {
        // income — store as a transaction (informational), doesn't override projections
        state.transactions.push({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: "income", category: "Income" });
        added++;
      }
    });
    commit(); closeModal(); render(); toast(added + " transactions imported");
  }

  /* ---- export / import backup ---- */
  function exportBackup() {
    var blob = new Blob([S.exportJSON(state)], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "arsh-finance-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Backup downloaded");
  }
  function importBackup() {
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = ".json,application/json";
    fi.onchange = function () {
      var f = fi.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try { state = S.replace(JSON.parse(String(r.result))); render(); toast("Data imported ✓"); }
        catch (e) { toast("Could not read that file"); }
      };
      r.readAsText(f);
    };
    fi.click();
  }

  /* ============================================================== events */
  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act],[data-close-modal],[data-month],[data-del-exp],[data-edit-acct],[data-del-acct],[data-month-go],[data-shift]");
      if (!t) return;
      if (t.hasAttribute("data-close-modal")) { closeModal(); return; }
      var act = t.getAttribute("data-act");
      if (t.hasAttribute("data-month")) { activeMonth = t.getAttribute("data-month"); render(); return; }
      if (t.hasAttribute("data-month-go")) { activeMonth = t.getAttribute("data-month-go"); location.hash = "#expenses"; return; }
      if (t.hasAttribute("data-del-exp")) { delExpense(t.getAttribute("data-del-exp")); return; }
      if (t.hasAttribute("data-edit-acct")) { accountModal(t.getAttribute("data-edit-acct")); return; }
      if (t.hasAttribute("data-del-acct")) { deleteAccount(t.getAttribute("data-del-acct")); return; }
      if (t.hasAttribute("data-shift")) { showShift(t.getAttribute("data-shift")); return; }
      switch (act) {
        case "export": exportBackup(); break;
        case "import": importBackup(); break;
        case "import-statement": importStatementModal(); break;
        case "add-expense": addExpenseModal(); break;
        case "save-expense": saveExpense(); break;
        case "add-account": accountModal(null); break;
        case "save-account": saveAccount(); break;
        case "commit-import": commitImport(); break;
        case "reset": if (confirm("Reset to demo data? Your entries in this browser will be cleared.")) { state = S.reset(); render(); toast("Reset done"); } break;
        case "install": doInstall(); break;
        case "dismiss-demo": var b = $("#demoBanner"); if (b) b.remove(); break;
      }
    });
    document.addEventListener("input", function (e) {
      var el = e.target;
      if (el.hasAttribute("data-set")) {
        var k = el.getAttribute("data-set");
        state.settings[k] = el.type === "checkbox" ? el.checked : (isNaN(+el.value) ? el.value : +el.value);
        commit(); if (k !== "taxSetAsidePct") render();
      }
      if (el.hasAttribute("data-setaside")) {
        state.settings.taxSetAsidePct = +el.value; commit();
        var hash = location.hash; render(); // re-render tax view
      }
    });
    window.addEventListener("hashchange", render);
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); global.__deferredPrompt = e; $$("[data-act=install]").forEach(function (b) { b.hidden = false; }); });
  }
  function delExpense(id) {
    Object.keys(state.months).forEach(function (k) { state.months[k].expenses = (state.months[k].expenses || []).filter(function (e) { return e.id !== id; }); });
    state.transactions = (state.transactions || []).filter(function (t) { return t.id !== id; });
    commit(); render(); toast("Deleted");
  }
  function showShift(id) {
    var sh = (state.shifts || []).find(function (x) { return x.id === id; }); if (!sh) return;
    var src = M.sourceById(state, sh.sourceId);
    modal(src.name + " · " + sh.label,
      '<ul class="kv">' +
        '<li><span>Source</span><b>' + esc(src.name) + '</b></li>' +
        (sh.start != null ? '<li><span>Time</span><b>' + M.hhmm(sh.start) + " – " + M.hhmm(sh.end) + '</b></li>' : '<li><span>Type</span><b>Business income</b></li>') +
        (sh.start != null ? '<li><span>Hours</span><b>' + (sh.end - sh.start).toFixed(2) + 'h</b></li>' : '') +
        '<li><span>Pay</span><b>' + M.money(sh.pay) + '</b></li>' +
        '<li><span>Basis</span><b>' + esc(sh.rateNote || "") + '</b></li>' +
        '<li><span>Lands in</span><b>' + esc((M.accountById(state, src.account) || {}).name || "—") + '</b></li>' +
      '</ul>', '<button class="pill-btn primary" data-close-modal>Close</button>');
  }

  /* ---- demo banner, toast, install, counters ---- */
  function showDemoBanner() {
    if ($("#demoBanner")) return;
    var b = document.createElement("div"); b.id = "demoBanner"; b.className = "demo-banner";
    b.innerHTML = '<span>👋 You’re viewing <b>demo data</b>. Import your private backup to see your real numbers.</span>' +
      '<span class="db-actions"><button class="pill-btn primary sm" data-act="import">Import my data</button><button class="x-btn" data-act="dismiss-demo">' + icoX() + '</button></span>';
    $("#view").prepend(b);
  }
  var toastT;
  function toast(msg) {
    var el = $("#toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
  function doInstall() { var p = global.__deferredPrompt; if (p) { p.prompt(); p.userChoice.then(function () { global.__deferredPrompt = null; }); } else toast("Use your browser menu → Add to Home screen"); }

  function catColor(i) { var pal = ["#818cf8", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#a78bfa", "#f472b6", "#4ade80", "#facc15", "#60a5fa", "#f87171", "#2dd4bf", "#c084fc", "#fdba74"]; return pal[i % pal.length]; }

  /* ---- one-time #seed import (URL hash, never sent to server) ---- */
  function trySeedFromHash() {
    if (location.hash.indexOf("seed=") < 0) return false;
    try {
      var raw = decodeURIComponent(location.hash.split("seed=")[1]);
      var json = JSON.parse(decodeURIComponent(escape(atob(raw))));
      state = S.replace(json);
      history.replaceState(null, "", location.pathname);
      location.hash = "#overview";
      return true;
    } catch (e) { console.warn("seed failed", e); return false; }
  }

  /* ---- icons (inline SVG) ---- */
  function icoGrid() { return svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'); }
  function icoCalendar() { return svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'); }
  function icoTrend() { return svg('<path d="M3 17l6-6 4 4 7-7"/><path d="M17 7h4v4"/>'); }
  function icoWallet() { return svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>'); }
  function icoDiamond() { return svg('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 6 3-6M12 21l-3-12M12 21l3-12"/>'); }
  function icoStack() { return svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'); }
  function icoShield() { return svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'); }
  function icoGear() { return svg('<circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 00-2.2-1.3L14 1h-4l-.3 2.4a7 7 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 005 12a7 7 0 00.1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 002.2 1.3L10 23h4l.3-2.4a7 7 0 002.2-1.3l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z"/>'); }
  function icoDownload() { return svg('<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>'); }
  function icoUpload() { return svg('<path d="M12 21V9M7 13l5-5 5 5M5 3h14"/>'); }
  function icoX() { return svg('<path d="M6 6l12 12M18 6L6 18"/>'); }
  function icoPencil() { return svg('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', "ico-sm"); }
  function svg(inner, cls) { return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; }

  /* --------------------------------------------------------------- boot */
  function init() {
    M = global.Model; C = global.Charts; S = global.AppState; IMP = global.Importer;
    state = S.load();
    document.getElementById("app").innerHTML = shell();
    var seeded = trySeedFromHash();
    if (seeded) state = S.load();
    bind();
    if (!location.hash) location.hash = "#overview";
    render();
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  global.App = { render: render, getState: function () { return state; } };
})(window);
