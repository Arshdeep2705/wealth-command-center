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
  function commit() { var ok = S.save(state); if (!ok) toast("⚠ Couldn’t save on this device — storage may be full"); if (global.Sync && Sync.enabled() && Sync.hasLocalPin()) Sync.queuePush(state); }
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
      '<button class="ai-fab" data-act="ai-open" title="Ask the assistant" aria-label="Ask the assistant">' + icoSpark() + '<span>Ask</span></button>' +
      '<div class="modal-root" id="modalRoot"></div>' +
      '<div class="lock-root" id="lockRoot"></div>' +
      '<div class="sync-badge" id="syncBadge" hidden></div>' +
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
              '<div class="hero-num">' + M.money0(nw.total) + '</div>' +
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

        // after tax (ATO)
        card(cardH("Projected annual after tax") +
          '<div class="kpi-row">' +
            kpi("After tax", M.money0(atoTax.takeHome), { color: "var(--good)", sub: "ATO 2025-26" }) +
            kpi("Tax payable", M.money0(atoTax.totalTax), { color: "var(--warn)", sub: "eff. " + M.pct(atoTax.effective) }) +
          '</div>' +
          '<p class="muted small">Australian resident tax — income tax + 2% Medicare levy. Set aside about ' + M.money0(atoTax.totalTax / 12) + '/month for tax.</p>') +

        // this month
        card(cardH(M.monthLabel(t.monthKey) + " snapshot", '<a class="mini-link" href="#months">details ›</a>') +
          '<div class="kpi-row">' +
            kpi("Income", M.money0(ms.gross), { color: "var(--accent)" }) +
            kpi("Expenses", M.money0(ms.expenses), { color: ms.expenses ? "var(--bad)" : "var(--muted)" }) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Tax (ATO)", M.money0(ms.tax), { color: "var(--warn)" }) +
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
      var blocks = d.blocks.slice().sort(function (a, b) { return a.start - b.start; });
      // group into connected overlap CLUSTERS so a single overlap doesn't shrink the whole day's blocks
      var clusters = [], cur = null;
      blocks.forEach(function (b) {
        if (!cur || b.start >= cur.end - 0.001) { cur = { end: b.end, items: [b], lanes: [] }; clusters.push(cur); }
        else { cur.items.push(b); cur.end = Math.max(cur.end, b.end); }
        b._cluster = cur;
      });
      clusters.forEach(function (cl) {
        cl.items.forEach(function (b) {
          var placed = false;
          for (var i = 0; i < cl.lanes.length; i++) { if (b.start >= cl.lanes[i] - 0.001) { b._lane = i; cl.lanes[i] = b.end; placed = true; break; } }
          if (!placed) { b._lane = cl.lanes.length; cl.lanes.push(b.end); }
        });
        cl.laneCount = Math.max(1, cl.lanes.length);
      });
      var blocksHtml = blocks.map(function (b) {
        var s = M.sourceById(state, b.sourceId);
        var top = b.start * HOURPX, hgt = Math.max(20, (b.end - b.start) * HOURPX);
        var laneCount = (b._cluster && b._cluster.laneCount) || 1;
        var w = 100 / laneCount, left = b._lane * w;
        var tall = hgt > 52;
        return '<div class="sch-block" style="top:' + top + 'px;height:' + (hgt - 3) + 'px;left:calc(' + left + '% + 2px);width:calc(' + w + '% - 4px);--c:' + s.color + '" ' +
          'data-shift="' + esc(b.id) + '" title="' + esc(s.name + " · " + b.label + " · " + M.hhmm(b.start) + "–" + M.hhmm(b.end) + " · " + M.money(b.pay) + " (" + b.rateNote + ")") + '">' +
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
    var actualIn = M.monthIncomeActual(state, activeMonth);
    var byCat = M.expenseByCategory(state, activeMonth);
    var catSegs = Object.keys(byCat).map(function (c, i) { return { label: c, value: byCat[c], color: catColor(i) }; }).sort(function (a, b) { return b.value - a.value; });
    var list = M.monthEntries(state, activeMonth).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    var monthTabs = '<div class="seg-tabs">' + mons.map(function (k) {
      return '<button class="seg' + (k === activeMonth ? " on" : "") + '" data-month="' + k + '">' + M.monthLabel(k) + '</button>';
    }).join("") + '</div>';

    return topbar("Transactions", "Import statements or add by hand · tap any row to edit or add a note",
        '<button class="pill-btn primary" data-act="import-statement">' + icoUpload() + ' Import statement</button>' +
        '<button class="pill-btn" data-act="add-expense">+ Add</button>') +
      monthTabs +
      '<div class="grid">' +
        card(cardH(M.monthLabelLong(activeMonth)) +
          '<div class="kpi-row">' +
            kpi("Income (projected)", M.money0(sum.gross), { color: "var(--accent)" }) +
            kpi("Expenses", M.money0(sum.expenses), { color: sum.expenses ? "var(--bad)" : "var(--muted)" }) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Money in (logged)", M.money0(actualIn), { color: actualIn ? "var(--good)" : "var(--muted)", sub: "from statements" }) +
            kpi("Net profit", M.money0(sum.netProfit), { color: "var(--good)" }) +
          '</div>') +
        card(cardH("Where it goes") + (catSegs.length ?
          '<div class="mix"><div class="mix-chart">' + C.donut(catSegs, { size: 150, stroke: 18, centerMain: M.moneyShort(sum.expenses), centerSub: "spent" }) + '</div>' +
          '<ul class="legend">' + catSegs.map(function (s) { return '<li><i style="background:' + s.color + '"></i><span>' + esc(s.label) + '</span><b>' + M.money0(s.value) + '</b></li>'; }).join("") + '</ul></div>'
          : '<p class="muted">No expenses yet for this month. Use <b>Import statement</b> or <b>+ Add</b>.</p>')) +
        card(cardH(list.length + " transaction" + (list.length === 1 ? "" : "s"), '<button class="mini-link" data-act="add-expense">+ add</button>') +
          (list.length ?
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th><th></th></tr></thead><tbody>' +
            list.map(function (e) {
              var inn = e.type === "in";
              return '<tr class="row-edit" data-edit-entry="' + esc(e.id) + '" title="Tap to edit / add a note">' +
                '<td class="num">' + esc((e.date || "").slice(5)) + '</td>' +
                '<td>' + esc(e.description || "—") + (e.note ? '<div class="entry-note">' + icoNote() + ' ' + esc(e.note) + '</div>' : '') + '</td>' +
                '<td>' + chip(inn ? "Income" : (e.category || "Other")) + '</td>' +
                '<td class="r num ' + (inn ? "good" : "bad") + '">' + (inn ? "+" : "−") + M.money0(e.amount) + '</td>' +
                '<td><button class="x-btn" data-del-entry="' + esc(e.id) + '" title="delete">' + icoX() + '</button></td></tr>';
            }).join("") + '</tbody></table></div>' +
            '<p class="muted xs" style="margin-top:10px">Tap a row to edit the amount, category, or add a note explaining what it was.</p>'
            : '<p class="muted">Nothing logged yet. <b>Import statement</b> to pull in your bank transactions, or <b>+ Add</b> one manually.</p>'), "span-2") +
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
            kpi("To savings · Jun–Dec", M.money0(ys.netToSavings), { color: "var(--good)", sub: "after tax & expenses" }) +
          '</div>', "span-2") +
        '<div class="month-cards span-2">' + rows.map(function (r) {
          var s = r.s;
          return '<div class="month-card" data-month-go="' + r.k + '">' +
            '<div class="mc-h"><strong>' + M.monthLabel(r.k) + '</strong>' + (s.overridden ? chip("actual") : chip("projected")) + '</div>' +
            '<div class="mc-bar"><span style="height:' + (s.gross / maxG * 100).toFixed(0) + '%"></span></div>' +
            '<dl class="mc-stats">' +
              '<div><dt>Income</dt><dd class="num">' + M.money0(s.gross) + '</dd></div>' +
              '<div><dt>Expenses</dt><dd class="num bad">' + (s.expenses ? M.money0(s.expenses) : "—") + '</dd></div>' +
              '<div><dt>Tax (ATO)</dt><dd class="num warn">' + M.money0(s.tax) + '</dd></div>' +
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
        card(cardH("Set aside for tax") +
          '<div class="kpi-row">' +
            kpi("Per month", M.money0(tb.totalTax / 12), { color: "var(--warn)" }) +
            kpi("Per week", M.money0(tb.totalTax / 52)) +
          '</div>' +
          '<div class="kpi-row">' +
            kpi("Per year", M.money0(tb.totalTax)) +
            kpi("Effective rate", M.pct(tb.effective)) +
          '</div>' +
          '<div class="buffer ok">Move <b>' + M.money0(tb.totalTax / 12) + '</b> into a separate “tax” account each month and your ATO bill is fully covered, with the rest free to spend or save.</div>') +
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
    var syncOn = global.Sync && Sync.enabled();
    var linked = syncOn && Sync.hasLocalPin();
    return topbar("Settings & Data", "Cloud sync keeps every device up to date. Back up anytime.") +
      '<div class="grid">' +
        card(cardH("Cloud sync", linked ? '<span class="chip" style="--c:var(--good)">Connected</span>' : '<span class="chip" style="--c:var(--warn)">Not linked</span>') +
          (!syncOn ? '<p class="muted small">Cloud sync is off in this build.</p>'
           : linked
             ? '<p class="muted small">This device is synced to your private cloud. Changes you make here appear on your other devices automatically.</p>' +
               '<div class="set-row"><div><strong>Refresh from cloud</strong><p class="muted small">Pull the latest data now.</p></div><button class="pill-btn" data-act="sync-pull">Refresh</button></div>' +
               '<div class="set-row"><div><strong>Change passcode</strong><p class="muted small">Updates it for all devices.</p></div><button class="pill-btn" data-act="change-pin">Change</button></div>' +
               '<div class="set-row danger"><div><strong>Lock this device</strong><p class="muted small">Forget the passcode here (data stays in the cloud).</p></div><button class="pill-btn danger" data-act="sync-signout">Lock</button></div>'
             : '<p class="muted small">Not linked on this device.</p><div class="set-row"><div><strong>Connect to cloud</strong><p class="muted small">Enter your passcode to sync this device.</p></div><button class="pill-btn primary" data-act="sync-link">Connect</button></div>')) +
        card(cardH("Your data") +
          '<div class="set-row"><div><strong>Export backup</strong><p class="muted small">Download a .json with everything. Save it to OneDrive to open on your phone.</p></div><button class="pill-btn primary" data-act="export">' + icoDownload() + ' Export</button></div>' +
          '<div class="set-row"><div><strong>Import backup</strong><p class="muted small">Load a .json backup (replaces current data).</p></div><button class="pill-btn" data-act="import">' + icoUpload() + ' Import</button></div>' +
          '<div class="set-row"><div><strong>Import bank statement</strong><p class="muted small">CSV (ANZ / CommBank / any) or PDF.</p></div><button class="pill-btn" data-act="import-statement">' + icoUpload() + ' Statement</button></div>' +
          '<div class="set-row danger"><div><strong>Reset to demo</strong><p class="muted small">Clears your data from this browser.</p></div><button class="pill-btn danger" data-act="reset">Reset</button></div>') +
        card(cardH("AI assistant", '<span class="chip" style="--c:var(--accent)">Gemini</span>') +
          '<p class="muted small">Tap the ✨ <b>Ask</b> button anywhere to describe changes in plain English (new job, balance change, one-off expense) and the app updates itself.</p>' +
          '<div class="set-row"><div><strong>Free AI key</strong><p class="muted small">One free Google Gemini key powers it. Stored privately in your Supabase.</p></div><button class="pill-btn" data-act="ai-key">Set / update key</button></div>') +
        card(cardH("Tax & assumptions") +
          '<p class="muted small" style="margin-bottom:14px">All tax figures use the Australian resident brackets for FY2025-26 (income tax + 2% Medicare levy). Income, after-tax and savings are all calculated on this.</p>' +
          '<label class="check"><input type="checkbox" data-set="privateHospitalCover" ' + (s.privateHospitalCover ? "checked" : "") + '><span>I have private hospital cover (avoids the Medicare Levy Surcharge)</span></label>' +
          '<label class="check"><input type="checkbox" data-set="mlsEnabled" ' + (s.mlsEnabled ? "checked" : "") + '><span>Include Medicare Levy Surcharge in estimates (applies to high earners without hospital cover)</span></label>') +
        card(cardH("Income streams", '<span class="muted small">tap to edit</span>') +
          '<div class="acct-list">' + (state.incomeSources || []).map(function (src) {
            var weekly = M.weeklyBySource(state)[src.id] || 0;
            return '<div class="acct" data-edit-source="' + esc(src.id) + '"><span class="acct-dot" style="background:' + src.color + '"></span><div class="acct-main"><strong>' + esc(src.name) + '</strong><span class="muted xs">' + (src.businessIncome ? "business income · " : "") + esc(src.note || "") + '</span></div><div class="acct-bal num">' + M.money0(weekly) + '/wk</div>' + icoPencil() + '</div>';
          }).join("") + '</div>' +
          '<button class="pill-btn" data-act="add-source" style="margin-top:10px">+ Add income stream</button>' +
          '<p class="muted xs" style="margin-top:8px">Adding or editing a stream instantly updates your schedule, weekly &amp; monthly income, net worth and tax.</p>') +
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

  /* ============================================================= AI assistant */
  function aiAvailable() { return global.Sync && Sync.enabled() && Sync.hasLocalPin(); }
  function buildAIContext() {
    // Privacy: send only NAMES/types so the model can resolve references — never balances or pay amounts.
    var accts = (state.accounts || []).map(function (a) { return a.name + " (" + a.type + (a.liquid ? "" : ", pending") + ")"; }).join("; ");
    var srcs = (state.incomeSources || []).map(function (s) { return s.name + " → " + ((M.accountById(state, s.account) || {}).name || "?") + (s.businessIncome ? " [business]" : ""); }).join("; ");
    var today = new Date().toISOString().slice(0, 10);
    return "Today: " + today + ". Tracking months " + state.horizon.startMonth + " to " + state.horizon.endMonth + ".\n" +
      "Accounts (names only): " + (accts || "none") + ".\n" +
      "Income sources (names only): " + (srcs || "none") + ".\n" +
      "Expense categories: " + (state.expenseCategories || []).join(", ") + ".";
  }
  function num(v) { if (typeof v === "number") return v; if (typeof v === "string" && v.indexOf(":") >= 0) return hhmmToDec(v); var n = parseFloat(v); return isNaN(n) ? null : n; }
  function slug(s) { return (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16); }
  function resolveAccount(ref) {
    if (!ref) return null; var r = String(ref).toLowerCase().trim();
    var exact = (state.accounts || []).find(function (a) { return a.id === ref || a.name.toLowerCase() === r || (a.short || "").toLowerCase() === r; });
    if (exact) return exact;
    var fuzzy = (state.accounts || []).filter(function (a) { return a.name.toLowerCase().indexOf(r) >= 0 || r.indexOf(a.name.toLowerCase()) >= 0; });
    return fuzzy.length === 1 ? fuzzy[0] : null; // refuse to guess when ambiguous
  }
  function resolveSource(ref) {
    if (!ref) return null; var r = String(ref).toLowerCase().trim();
    var exact = (state.incomeSources || []).find(function (s) { return s.id === ref || s.name.toLowerCase() === r; });
    if (exact) return exact;
    var fuzzy = (state.incomeSources || []).filter(function (s) { return s.name.toLowerCase().indexOf(r) >= 0 || r.indexOf(s.name.toLowerCase()) >= 0; });
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }
  function expandShift(sh, sourceId, biz, name, idx) {
    var day = +sh.day || 0, pay = +sh.pay || 0;
    if (biz || sh.start == null) return [{ id: sourceId + "_b" + idx, sourceId: sourceId, day: day, pay: pay, label: name, kind: "business" }];
    var s = num(sh.start), e = num(sh.end); if (s == null) s = 0; if (e == null) e = 24;
    if (e <= s) { var h1 = 24 - s, h2 = e, tot = (h1 + h2) || 1; return [
      { id: sourceId + "_" + idx + "a", sourceId: sourceId, day: day, start: s, end: 24, pay: +(pay * h1 / tot).toFixed(2), label: sh.label || name, kind: "shift" },
      { id: sourceId + "_" + idx + "b", sourceId: sourceId, day: (day + 1) % 7, start: 0, end: e, pay: +(pay * h2 / tot).toFixed(2), label: sh.label || name, kind: "shift" }
    ]; }
    return [{ id: sourceId + "_" + idx, sourceId: sourceId, day: day, start: s, end: e, pay: pay, label: sh.label || name, kind: "shift" }];
  }
  function shiftsWeekly(shifts) { return (shifts || []).reduce(function (t, s) { return t + (+s.pay || 0); }, 0); }
  function describeOp(op) {
    switch (op.op) {
      case "add_income_source": var a = resolveAccount(op.account); return "➕ Income <b>" + esc(op.name) + "</b> → " + esc(a ? a.name : (op.account || "?")) + " · ≈ <b>" + M.money0(shiftsWeekly(op.shifts)) + "/wk</b>" + (op.businessIncome ? " (business)" : "");
      case "update_income_source": return "✏️ Update income <b>" + esc(op.name) + "</b>" + (op.shifts ? " · new schedule ≈ " + M.money0(shiftsWeekly(op.shifts)) + "/wk" : "");
      case "remove_income_source": return "🗑️ Remove income <b>" + esc(op.name) + "</b>";
      case "add_account": return "➕ Account <b>" + esc(op.name) + "</b> (" + esc(op.type || "bank") + ") · " + M.money0(op.balance || 0);
      case "update_account": var ac = resolveAccount(op.name); return "🏦 " + esc(ac ? ac.name : op.name) + " " + (op.set != null ? "→ " + M.money0(op.set) : ((op.delta >= 0 ? "+" : "") + M.money0(op.delta || 0)));
      case "add_transaction": var tk = (op.date || "").slice(0, 7); var oor = !state.months[tk]; return (op.type === "in" ? "➕ Income " : "➖ Expense ") + "<b>" + M.money0(op.amount) + "</b> · " + esc(op.description || "") + " (" + esc(op.date || "") + ")" + (oor ? ' <em style="color:var(--warn)">⚠ outside Jun–Dec 2026 — will be skipped</em>' : "");
      case "set_setting": return "⚙️ " + esc(op.key) + " = " + esc(String(op.value));
      default: return "• " + esc(op.op || "change");
    }
  }
  function applyOps(ops) {
    var n = 0;
    (ops || []).forEach(function (op) {
      try {
        if (op.op === "add_income_source") {
          var acc = resolveAccount(op.account) || (state.accounts || [])[0];
          var id = "src_" + slug(op.name) + "_" + Date.now().toString(36).slice(-3) + n;
          var sc = (typeof op.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(op.color)) ? op.color : catColor(state.incomeSources.length);
          state.incomeSources.push({ id: id, name: op.name, short: op.name.length > 14 ? op.name.slice(0, 12) + "…" : op.name, account: acc ? acc.id : null, color: sc, businessIncome: !!op.businessIncome, kind: op.businessIncome ? "business" : "work", note: op.note || "" });
          (op.shifts || []).forEach(function (sh, i) { expandShift(sh, id, !!op.businessIncome, op.name, i).forEach(function (b) { state.shifts.push(b); }); });
          n++;
        } else if (op.op === "update_income_source") {
          var src = resolveSource(op.name); if (!src) return;
          if (op.account) { var a2 = resolveAccount(op.account); if (a2) src.account = a2.id; }
          if (op.note != null) src.note = op.note;
          if (op.color) src.color = op.color;
          if (op.businessIncome != null) src.businessIncome = !!op.businessIncome;
          if (Array.isArray(op.shifts)) {
            state.shifts = state.shifts.filter(function (s) { return s.sourceId !== src.id; });
            op.shifts.forEach(function (sh, i) { expandShift(sh, src.id, !!src.businessIncome, src.name, i).forEach(function (b) { state.shifts.push(b); }); });
          }
          n++;
        } else if (op.op === "remove_income_source") {
          var s2 = resolveSource(op.name); if (!s2) return;
          state.incomeSources = state.incomeSources.filter(function (x) { return x.id !== s2.id; });
          state.shifts = state.shifts.filter(function (x) { return x.sourceId !== s2.id; });
          n++;
        } else if (op.op === "add_account") {
          state.accounts.push({ id: "acc_" + slug(op.name) + "_" + Date.now().toString(36).slice(-3) + n, name: op.name, short: (op.name || "").slice(0, 6), type: op.type || "bank", liquid: op.liquid !== false, balance: +op.balance || 0, color: catColor(state.accounts.length), note: op.note || "" });
          n++;
        } else if (op.op === "update_account") {
          var ac2 = resolveAccount(op.name); if (!ac2) return;
          var v = (op.set != null) ? +op.set : (op.delta != null ? ((+ac2.balance || 0) + (+op.delta)) : null);
          if (v != null && isFinite(v)) { ac2.balance = v; n++; }
        } else if (op.op === "add_transaction") {
          var key = (op.date || "").slice(0, 7); if (!state.months[key]) return; // outside horizon (preview warns)
          var amt = Math.abs(+op.amount || 0); if (!isFinite(amt) || !amt) return;
          state.months[key].entries.push({ id: "e_" + Date.now().toString(36) + n, date: op.date, description: op.description || "", amount: amt, type: op.type === "in" ? "in" : "out", category: op.type === "in" ? "Income" : (op.category || "Other"), note: op.note || "" });
          n++;
        } else if (op.op === "set_setting") {
          if (op.key === "privateHospitalCover" || op.key === "mlsEnabled") { state.settings[op.key] = (op.value === true || op.value === "true"); n++; }
        }
      } catch (e) { console.warn("op failed", op, e); }
    });
    return n;
  }

  function aiFabClick() {
    if (!(global.Sync && Sync.enabled())) { toast("Cloud sync is off in this build"); return; }
    if (!Sync.hasLocalPin()) { toast("Unlock the app first (enter your passcode)"); return; }
    assistantModal();
  }
  function assistantModal() {
    modal("✨ Assistant",
      '<p class="muted small">Tell me what changed in plain English and I’ll update your dashboard. For example:</p>' +
      '<div class="ai-examples">' +
        '<button class="ai-eg">I started Tuesdays at a cafe, 9am–5pm, $32/hr, paid into CommBank</button>' +
        '<button class="ai-eg">My ANZ balance is now $41,200</button>' +
        '<button class="ai-eg">Add a $900 one-off car repair expense on the 12th</button>' +
        '<button class="ai-eg">I stopped working at King Kitchen</button>' +
      '</div>' +
      '<textarea id="aiMsg" rows="3" class="ai-input" placeholder="Type what changed…"></textarea>' +
      '<div id="aiOut" class="ai-out"></div>',
      '<button class="pill-btn" data-close-modal>Close</button><button class="pill-btn primary" data-act="ai-send">Ask</button>');
    $$(".ai-eg").forEach(function (b) { b.addEventListener("click", function () { $("#aiMsg").value = b.textContent; }); });
    setTimeout(function () { var m = $("#aiMsg"); if (m) m.focus(); }, 60);
  }
  function aiSend() {
    var msg = ($("#aiMsg") && $("#aiMsg").value || "").trim(); if (!msg) return;
    var out = $("#aiOut"); out.innerHTML = '<div class="ai-thinking"><span class="sb-dot"></span> Thinking…</div>';
    Sync.assistant(msg, buildAIContext()).then(function (res) {
      window.__aiOps = (res && res.operations) || [];
      if (res && res.clarify && (!res.operations || !res.operations.length)) {
        out.innerHTML = '<div class="ai-clarify">' + esc(res.clarify) + '</div>'; return;
      }
      if (!window.__aiOps.length) { out.innerHTML = '<div class="ai-clarify">I couldn’t turn that into a change — try being more specific.</div>'; return; }
      out.innerHTML = '<div class="ai-summary">' + esc(res.summary || "Here’s what I’ll change:") + '</div>' +
        '<ul class="ai-ops">' + window.__aiOps.map(function (op) { return '<li>' + describeOp(op) + '</li>'; }).join("") + '</ul>' +
        '<button class="pill-btn primary" data-act="ai-apply" style="width:100%;justify-content:center;margin-top:6px">Apply these changes</button>';
    }).catch(function (e) {
      if (e && (e.code === 400) && /key/i.test(e.message || "")) { out.innerHTML = '<div class="ai-clarify">You need a free AI key first. <button class="mini-link" data-act="ai-key">Set it up →</button></div>'; return; }
      out.innerHTML = '<div class="ai-clarify bad">' + esc((e && e.message) || "Something went wrong.") + '</div>';
    });
  }
  function aiApply() {
    var ops = window.__aiOps || []; var n = applyOps(ops);
    commit(); closeModal(); render(); toast(n ? "Done ✓ Updated " + n + " thing" + (n > 1 ? "s" : "") : "Nothing to apply");
  }
  function aiKeyModal() {
    modal("Set up the free AI key",
      '<ol class="ai-steps">' +
        '<li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (sign in with Google).</li>' +
        '<li>Click <b>Create API key</b> → copy it (starts with <code>AIza…</code>).</li>' +
        '<li>Paste it below. It’s stored privately in your own Supabase — never in the app.</li>' +
      '</ol>' +
      '<input type="password" id="aiKey" class="lock-input" placeholder="AIza…" autocomplete="off" style="text-align:left;letter-spacing:0">' +
      '<div id="aiKeyErr" class="lock-err"></div>',
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="ai-savekey">Save key</button>');
    setTimeout(function () { var k = $("#aiKey"); if (k) k.focus(); }, 60);
  }
  function aiSaveKey() {
    var key = ($("#aiKey") && $("#aiKey").value || "").trim();
    if (key.length < 20) { $("#aiKeyErr").textContent = "That doesn’t look like a key."; return; }
    Sync.setKey(key).then(function () { closeModal(); toast("AI key saved ✓ — try the ✨ button"); }).catch(function (e) { $("#aiKeyErr").textContent = (e && e.message) || "Failed to save."; });
  }

  /* =============================================================== modals */
  function modal(title, bodyHtml, footHtml) {
    $("#modalRoot").innerHTML = '<div class="overlay">' +
      '<div class="dialog" role="dialog" aria-modal="true"><div class="dlg-h"><h3>' + esc(title) + '</h3><button class="x-btn" data-close-modal>' + icoX() + '</button></div>' +
      '<div class="dlg-b">' + bodyHtml + '</div>' + (footHtml ? '<div class="dlg-f">' + footHtml + '</div>' : '') + '</div></div>';
    requestAnimationFrame(function () {
      var o = $(".overlay"); if (!o) return; o.classList.add("show");
      var fi = o.querySelector(".dlg-b input[type=text], .dlg-b input[type=number], .dlg-b input[type=password], .dlg-b textarea");
      if (fi) { try { fi.focus({ preventScroll: false }); } catch (e) { fi.focus(); } }
    });
  }
  function closeModal() { var o = $(".overlay"); if (o) { o.classList.remove("show"); setTimeout(function () { $("#modalRoot").innerHTML = ""; }, 180); } }

  function findEntry(id) {
    var found = null;
    Object.keys(state.months).forEach(function (k) {
      (state.months[k].entries || []).forEach(function (e) { if (e.id === id) found = { e: e, key: k }; });
    });
    return found;
  }
  function entryModal(id) {
    var hit = id ? findEntry(id) : null, e = hit ? hit.e : null, isNew = !e;
    var cats = (state.expenseCategories || []).slice();
    if (e && e.category && e.category !== "Income" && cats.indexOf(e.category) < 0) cats.push(e.category);
    e = e || { id: "e_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: activeMonth + "-01", description: "", amount: 0, type: "out", category: cats[0] || "Other", note: "" };
    var isIn = e.type === "in";
    var mons = M.months(state), minD = (mons[0] || "2026-06") + "-01";
    var lastM = mons[mons.length - 1] || "2026-12", lp = lastM.split("-"), maxD = lastM + "-" + String(M.daysInMonth(+lp[0], +lp[1])).padStart(2, "0");
    modal(isNew ? "Add transaction" : "Edit transaction", '<form id="entryForm" class="form">' +
      '<input type="hidden" name="id" value="' + esc(e.id) + '">' +
      '<div class="type-toggle"><label class="tt ' + (!isIn ? "on out" : "") + '"><input type="radio" name="type" value="out" ' + (!isIn ? "checked" : "") + '>Money out</label>' +
        '<label class="tt ' + (isIn ? "on in" : "") + '"><input type="radio" name="type" value="in" ' + (isIn ? "checked" : "") + '>Money in</label></div>' +
      '<div class="form-2"><label class="field"><span>Date</span><input type="date" name="date" value="' + esc(e.date) + '" min="' + minD + '" max="' + maxD + '" required></label>' +
      '<label class="field"><span>Amount ($)</span><input type="number" name="amount" step="0.01" min="0" value="' + (e.amount || "") + '" placeholder="0.00" required></label></div>' +
      '<label class="field"><span>Description</span><input type="text" name="description" value="' + esc(e.description) + '" placeholder="e.g. Woolworths, or ‘car repair’" required></label>' +
      '<label class="field"><span>Category</span><select name="category">' + cats.map(function (c) { return '<option ' + (e.category === c ? "selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select></label>' +
      '<label class="field"><span>Note — explain this one (optional)</span><textarea name="note" rows="2" placeholder="e.g. One-off car repair, not a normal month. Or: this transfer is actually savings.">' + esc(e.note || "") + '</textarea></label>' +
      '</form>',
      (isNew ? '' : '<button class="pill-btn danger" data-del-entry="' + esc(e.id) + '">Delete</button>') +
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="save-entry">Save</button>');
    // live toggle styling
    $$("[name=type]").forEach(function (r) { r.addEventListener("change", function () {
      $$(".type-toggle .tt").forEach(function (l) { l.classList.remove("on", "in", "out"); });
      var lab = r.closest(".tt"); lab.classList.add("on", r.value);
    }); });
  }
  function saveEntry() {
    var f = $("#entryForm"); if (!f || !f.reportValidity()) return;
    var amt = Math.abs(parseFloat(f.amount.value) || 0); if (!amt) { toast("Enter an amount"); return; }
    var d = f.date.value, key = d.slice(0, 7);
    if (!state.months[key]) { toast("Date must be within " + M.monthLabel(M.months(state)[0]) + "–" + M.monthLabel(M.months(state).slice(-1)[0])); return; }
    var type = f.type.value === "in" ? "in" : "out";
    var obj = { id: f.id.value, date: d, description: f.description.value.trim(), amount: amt, type: type, category: type === "in" ? "Income" : f.category.value, note: (f.note.value || "").trim() };
    // remove any existing copy (date/month may have changed), then add to the right month
    var existing = findEntry(obj.id);
    if (existing) state.months[existing.key].entries = state.months[existing.key].entries.filter(function (x) { return x.id !== obj.id; });
    state.months[key].entries.push(obj);
    commit(); closeModal(); activeMonth = key; render(); toast("Saved ✓");
  }
  function delEntry(id) {
    var hit = findEntry(id); if (!hit) return;
    state.months[hit.key].entries = state.months[hit.key].entries.filter(function (x) { return x.id !== id; });
    commit(); closeModal(); render(); toast("Deleted");
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

  /* ---- income stream editor (drives schedule + weekly + monthly + net worth + tax) ---- */
  function decToHHMM(d) { if (d == null) return ""; var h = Math.floor(d), m = Math.round((d - h) * 60); if (m === 60) { h++; m = 0; } if (h >= 24) h -= 24; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }
  function hhmmToDec(s) { if (!s) return null; var p = s.split(":"); return (+p[0]) + (+p[1]) / 60; }
  function shiftRowHTML(sh, biz) {
    sh = sh || { day: 0, start: 9, end: 17, pay: 0, label: "" };
    var dayOpts = M.DAYS_LONG.map(function (d, i) { return '<option value="' + i + '" ' + (sh.day === i ? "selected" : "") + '>' + d + '</option>'; }).join("");
    return '<div class="shift-row' + (biz ? " biz" : "") + '">' +
      '<select class="sr-day">' + dayOpts + '</select>' +
      (biz ? '' :
        '<input type="time" class="sr-start" value="' + decToHHMM(sh.start) + '" title="start">' +
        '<input type="time" class="sr-end" value="' + decToHHMM(sh.end) + '" title="end">' +
        '<input type="number" class="sr-rate" step="0.01" min="0" placeholder="$/hr" title="optional hourly rate — auto-fills pay">') +
      '<input type="number" class="sr-pay" step="0.01" min="0" placeholder="$ pay" value="' + (sh.pay || "") + '" title="total pay for this shift">' +
      (biz ? '' : '<input type="text" class="sr-label" placeholder="client / role" value="' + esc(sh.label || "") + '">') +
      '<button type="button" class="x-btn" data-del-shift-row>' + icoX() + '</button>' +
      '</div>';
  }
  function sourceModal(id) {
    var accts = state.accounts || [];
    var src = id ? M.sourceById(state, id) : null, isNew = !src || !src.name;
    src = (id && src && src.name) ? src : { id: "src_" + Date.now().toString(36), name: "", account: (accts[0] || {}).id, color: "#34e3ff", businessIncome: false, note: "" };
    var biz = !!src.businessIncome;
    var shifts = (state.shifts || []).filter(function (s) { return s.sourceId === src.id; });
    if (!shifts.length) shifts = [{ day: 0, start: 9, end: 17, pay: 0, label: "" }];
    modal(isNew ? "Add income stream" : "Edit income stream",
      '<form id="srcForm" class="form">' +
        '<input type="hidden" name="id" value="' + esc(src.id) + '">' +
        '<label class="field"><span>Name</span><input name="name" value="' + esc(src.name) + '" placeholder="e.g. Cafe job" required></label>' +
        '<div class="form-2">' +
          '<label class="field"><span>Pays into</span><select name="account">' + accts.map(function (a) { return '<option value="' + esc(a.id) + '" ' + (src.account === a.id ? "selected" : "") + '>' + esc(a.name) + '</option>'; }).join("") + '</select></label>' +
          '<label class="field"><span>Colour</span><input type="color" name="color" value="' + (src.color || "#34e3ff") + '"></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" name="biz" id="srcBiz" ' + (biz ? "checked" : "") + '><span>Passive / business income — paid per day, no fixed clock hours (like a daily profit)</span></label>' +
        '<div class="shift-head"><span>' + (biz ? "Days &amp; daily amount" : "Shifts — when you work &amp; what you earn") + '</span></div>' +
        '<div id="shiftRows">' + shifts.map(function (s) { return shiftRowHTML(s, biz); }).join("") + '</div>' +
        '<button type="button" class="ghost-btn" data-add-shift>+ Add ' + (biz ? "day" : "shift") + '</button>' +
        '<label class="field" style="margin-top:14px"><span>Note (optional)</span><input name="note" value="' + esc(src.note || "") + '" placeholder="anything to remember about this income"></label>' +
        '<div id="srcPreview" class="src-preview"></div>' +
      '</form>',
      (isNew ? '' : '<button class="pill-btn danger" data-del-source="' + esc(src.id) + '">Delete stream</button>') +
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="save-source">Save</button>');
    var rows = $("#shiftRows");
    $("[data-add-shift]").addEventListener("click", function () { rows.insertAdjacentHTML("beforeend", shiftRowHTML(null, $("#srcBiz").checked)); updateSrcPreview(); });
    $("#srcBiz").addEventListener("change", function () {
      var cur = readShiftRows(); rows.innerHTML = cur.map(function (s) { return shiftRowHTML(s, this.checked); }.bind(this)).join("");
      $(".shift-head span").innerHTML = this.checked ? "Days &amp; daily amount" : "Shifts — when you work &amp; what you earn";
      $("[data-add-shift]").textContent = "+ Add " + (this.checked ? "day" : "shift");
      updateSrcPreview();
    });
    rows.addEventListener("input", function (e) {
      var row = e.target.closest(".shift-row"); if (!row) return;
      // auto-fill pay ONLY when the rate field is edited — never overwrite a manually typed pay
      if (e.target.classList.contains("sr-rate")) {
        var rate = parseFloat((row.querySelector(".sr-rate") || {}).value);
        var st = hhmmToDec((row.querySelector(".sr-start") || {}).value), en = hhmmToDec((row.querySelector(".sr-end") || {}).value);
        if (rate && st != null && en != null) { var hrs = (en <= st ? en + 24 : en) - st; row.querySelector(".sr-pay").value = (hrs * rate).toFixed(2); }
      }
      updateSrcPreview();
    });
    rows.addEventListener("click", function (e) { var b = e.target.closest("[data-del-shift-row]"); if (b) { b.closest(".shift-row").remove(); updateSrcPreview(); } });
    updateSrcPreview();
  }
  function readShiftRows() {
    return $$("#shiftRows .shift-row").map(function (row) {
      var biz = row.classList.contains("biz");
      var startEl = row.querySelector(".sr-start"), endEl = row.querySelector(".sr-end");
      var start = startEl ? hhmmToDec(startEl.value) : null, end = endEl ? hhmmToDec(endEl.value) : null;
      if (!biz && end === 0 && start > 0) end = 24; // midnight end
      return { day: +row.querySelector(".sr-day").value, start: start, end: end, pay: parseFloat(row.querySelector(".sr-pay").value) || 0, label: (row.querySelector(".sr-label") || {}).value || "" };
    });
  }
  function updateSrcPreview() {
    var el = $("#srcPreview"); if (!el) return;
    var wk = readShiftRows().reduce(function (s, r) { return s + (+r.pay || 0); }, 0);
    el.innerHTML = 'Weekly from this stream: <b>' + M.money0(wk) + '</b> · ' + M.money0(wk * 52) + '/yr';
  }
  function saveSource() {
    var f = $("#srcForm"); if (!f || !f.reportValidity()) return;
    var biz = $("#srcBiz").checked;
    var id = f.id.value, name = f.name.value.trim();
    var bad = false;
    var rows = readShiftRows().filter(function (r) {
      var hasPay = (+r.pay || 0) > 0;
      if (biz) return hasPay;
      var hasTime = r.start != null && r.end != null;
      if (hasTime && hasPay) return true;
      if (hasTime || hasPay) bad = true; // partial row — don't drop silently
      return false;
    });
    if (bad) { toast(biz ? "Each day needs an amount" : "Each shift needs a start time, end time and pay"); return; }
    if (!rows.length) { toast("Add at least one " + (biz ? "day with an amount" : "shift with time & pay")); return; }
    // upsert source
    var srcObj = { id: id, name: name, short: name.length > 14 ? name.slice(0, 12) + "…" : name, account: f.account.value, color: f.color.value, businessIncome: biz, kind: biz ? "business" : "work", note: f.note.value.trim() };
    var i = (state.incomeSources || []).findIndex(function (s) { return s.id === id; });
    if (i >= 0) state.incomeSources[i] = Object.assign(state.incomeSources[i], srcObj); else state.incomeSources.push(srcObj);
    // replace this source's shifts — route through expandShift so overnight shifts split at midnight (same as the AI path)
    state.shifts = (state.shifts || []).filter(function (s) { return s.sourceId !== id; });
    rows.forEach(function (r, n) {
      expandShift({ day: r.day, start: r.start, end: r.end, pay: r.pay, label: r.label }, id, biz, name, n)
        .forEach(function (b) { state.shifts.push(b); });
    });
    commit(); closeModal(); render(); toast("“" + name + "” saved — dashboard updated ✓");
  }
  function deleteSource(id) {
    var src = M.sourceById(state, id);
    if (!confirm("Delete “" + (src.name || "this") + "” and all its shifts? This updates your whole dashboard.")) return;
    state.incomeSources = (state.incomeSources || []).filter(function (s) { return s.id !== id; });
    state.shifts = (state.shifts || []).filter(function (s) { return s.sourceId !== id; });
    commit(); closeModal(); render(); toast("Income stream removed");
  }

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
  function setStmtStatus(html) { var s = $("#stmtStatus"); if (s) s.innerHTML = html; }
  function handleStatementFile(file) {
    setStmtStatus("Reading " + esc(file.name) + "…");
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
    if (res.error) { setStmtStatus('<span class="bad">' + esc(res.error) + '</span>'); return; }
    var txns = (res.transactions || []).filter(function (t) { return t.date; });
    if (!txns.length) { setStmtStatus('<span class="bad">No transactions detected. Try a CSV export from your bank.</span>'); return; }
    reviewImportModal(txns, name);
  }
  function reviewImportModal(txns, name) {
    var cats = (state.expenseCategories || []).slice();
    txns.forEach(function (t) { if (t.category && t.category !== "Income" && cats.indexOf(t.category) < 0) cats.push(t.category); });
    window.__import = txns;
    var rows = txns.map(function (t, i) {
      var inn = t.amount > 0;
      return '<tr class="imp-row">' +
        '<td><input type="checkbox" data-imp-chk="' + i + '" ' + (t.include ? "checked" : "") + '></td>' +
        '<td class="num">' + esc((t.date || "").slice(5)) + '</td>' +
        '<td><input class="imp-input" data-imp-desc="' + i + '" value="' + esc(t.description) + '" />' +
          '<input class="imp-input imp-note" data-imp-note="' + i + '" placeholder="＋ note (optional)" value="' + esc(t.note || "") + '" /></td>' +
        '<td><select data-imp-cat="' + i + '"' + (inn ? " disabled" : "") + '>' + cats.concat(["Income"]).map(function (c) { return '<option ' + ((inn ? "Income" : t.category) === c ? "selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select></td>' +
        '<td class="r num ' + (inn ? "good" : "bad") + '">' + (inn ? "+" : "−") + M.money(Math.abs(t.amount)) + '</td></tr>';
    }).join("");
    var exp = txns.filter(function (t) { return t.amount < 0; }).reduce(function (s, t) { return s + Math.abs(t.amount); }, 0);
    var inc = txns.filter(function (t) { return t.amount > 0; }).reduce(function (s, t) { return s + t.amount; }, 0);
    modal("Review " + txns.length + " transactions",
      '<p class="muted small">From <b>' + esc(name) + '</b> · <span class="bad">' + M.money0(exp) + ' out</span> · <span class="good">' + M.money0(inc) + ' in</span>. Untick anything you don’t want, fix a description, or add a note. Dates route to the right month automatically.</p>' +
      '<div class="table-wrap tall"><table class="tbl imp"><thead><tr><th></th><th>Date</th><th>Description &amp; note</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="commit-import">Import selected</button>');
  }
  function commitImport() {
    var txns = window.__import || [];
    $$("[data-imp-chk]").forEach(function (cb) { txns[+cb.getAttribute("data-imp-chk")].include = cb.checked; });
    $$("[data-imp-cat]").forEach(function (sel) { txns[+sel.getAttribute("data-imp-cat")].category = sel.value; });
    $$("[data-imp-desc]").forEach(function (inp) { txns[+inp.getAttribute("data-imp-desc")].description = inp.value; });
    $$("[data-imp-note]").forEach(function (inp) { txns[+inp.getAttribute("data-imp-note")].note = inp.value; });
    var added = 0, skipped = 0, dupes = 0;
    txns.forEach(function (t) {
      if (!t.include) return;
      var key = t.date.slice(0, 7);
      if (!state.months[key]) { skipped++; return; } // outside Jun–Dec 2026 horizon
      var inn = t.amount > 0;
      var desc = (t.description || "").trim(), amt = Math.abs(t.amount), type = inn ? "in" : "out";
      // skip duplicates already logged for this month (same date + amount + type + description)
      var dup = (state.months[key].entries || []).some(function (e) {
        return e.date === t.date && Math.abs(+e.amount || 0) === amt && e.type === type && (e.description || "").trim().toLowerCase() === desc.toLowerCase();
      });
      if (dup) { dupes++; return; }
      state.months[key].entries.push({
        id: t.id, date: t.date, description: desc, amount: amt,
        type: type, category: inn ? "Income" : (t.category || "Other"), note: (t.note || "").trim()
      });
      added++;
    });
    commit(); closeModal(); render();
    toast(added + " imported" + (dupes ? " · " + dupes + " duplicate" + (dupes > 1 ? "s" : "") + " skipped" : "") + (skipped ? " · " + skipped + " outside range" : "") + " ✓");
  }

  /* ---- change passcode ---- */
  function changePinModal() {
    modal("Change passcode", '<form id="pinForm" class="form">' +
      '<label class="field"><span>Current passcode</span><input type="password" name="cur" autocomplete="off" required></label>' +
      '<label class="field"><span>New passcode</span><input type="password" name="next" autocomplete="off" minlength="4" required></label>' +
      '<label class="field"><span>Confirm new passcode</span><input type="password" name="next2" autocomplete="off" minlength="4" required></label>' +
      '<div id="pinErr" class="lock-err"></div></form>',
      '<button class="pill-btn" data-close-modal>Cancel</button><button class="pill-btn primary" data-act="save-pin">Update</button>');
  }
  function doChangePin() {
    var f = $("#pinForm"); if (!f || !f.reportValidity()) return;
    if (f.next.value !== f.next2.value) { $("#pinErr").textContent = "New passcodes don’t match."; return; }
    Sync.changePin(f.cur.value, f.next.value).then(function () { closeModal(); toast("Passcode updated ✓"); })
      .catch(function (e) { $("#pinErr").textContent = e && e.code === 401 ? "Current passcode is wrong." : (e.message || "Failed."); });
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
        try {
          state = S.replace(JSON.parse(String(r.result))); render();
          if (global.Sync && Sync.enabled() && Sync.hasLocalPin()) Sync.queuePush(state);
          toast("Data imported ✓");
        } catch (e) { toast("Could not read that file"); }
      };
      r.readAsText(f);
    };
    fi.click();
  }

  /* ============================================================== events */
  function bind() {
    document.addEventListener("click", function (e) {
      // backdrop close: ONLY when the dark backdrop itself is tapped (never bubbled from a field/button inside)
      if (e.target.classList && e.target.classList.contains("overlay")) { closeModal(); return; }
      var t = e.target.closest("[data-act],[data-close-modal],[data-month],[data-del-entry],[data-edit-entry],[data-edit-acct],[data-del-acct],[data-edit-source],[data-del-source],[data-month-go],[data-shift]");
      if (!t) return;
      if (t.hasAttribute("data-close-modal")) { closeModal(); return; }
      var act = t.getAttribute("data-act");
      if (t.hasAttribute("data-month")) { activeMonth = t.getAttribute("data-month"); render(); return; }
      if (t.hasAttribute("data-month-go")) { activeMonth = t.getAttribute("data-month-go"); location.hash = "#expenses"; return; }
      if (t.hasAttribute("data-del-entry")) { delEntry(t.getAttribute("data-del-entry")); return; }
      if (t.hasAttribute("data-edit-entry")) { entryModal(t.getAttribute("data-edit-entry")); return; }
      if (t.hasAttribute("data-edit-source")) { sourceModal(t.getAttribute("data-edit-source")); return; }
      if (t.hasAttribute("data-del-source")) { deleteSource(t.getAttribute("data-del-source")); return; }
      if (t.hasAttribute("data-edit-acct")) { accountModal(t.getAttribute("data-edit-acct")); return; }
      if (t.hasAttribute("data-del-acct")) { deleteAccount(t.getAttribute("data-del-acct")); return; }
      if (t.hasAttribute("data-shift")) { showShift(t.getAttribute("data-shift")); return; }
      switch (act) {
        case "export": exportBackup(); break;
        case "import": importBackup(); break;
        case "import-statement": importStatementModal(); break;
        case "add-expense": entryModal(null); break;
        case "save-entry": saveEntry(); break;
        case "add-account": accountModal(null); break;
        case "save-account": saveAccount(); break;
        case "add-source": sourceModal(null); break;
        case "save-source": saveSource(); break;
        case "ai-open": aiFabClick(); break;
        case "ai-send": aiSend(); break;
        case "ai-apply": aiApply(); break;
        case "ai-key": aiKeyModal(); break;
        case "ai-savekey": aiSaveKey(); break;
        case "commit-import": commitImport(); break;
        case "reset": if (confirm("Reset to demo data? This clears this device and disconnects it from cloud sync (your cloud data is NOT changed).")) { if (global.Sync && Sync.enabled() && Sync.hasLocalPin()) Sync.signOut(); state = S.reset(); render(); toast("Reset done"); } break;
        case "sync-pull": if (global.Sync) { updateSyncBadge("syncing"); Sync.pull().then(function (b) { if (b && b.data) { state = S.replace(b.data); render(); } updateSyncBadge("synced"); toast("Up to date ✓"); }).catch(function () { updateSyncBadge("offline"); toast("Couldn’t refresh"); }); } break;
        case "sync-link": showLock("unlock"); break;
        case "change-pin": changePinModal(); break;
        case "sync-signout": if (confirm("Lock this device? You’ll need your passcode to view data here again. Your data stays safe in the cloud.")) { Sync.signOut(); showLock("unlock"); } break;
        case "save-pin": doChangePin(); break;
        case "install": doInstall(); break;
        case "dismiss-demo": var b = $("#demoBanner"); if (b) b.remove(); break;
      }
    });
    document.addEventListener("input", function (e) {
      var el = e.target;
      if (el.hasAttribute("data-set")) {
        var k = el.getAttribute("data-set");
        state.settings[k] = el.type === "checkbox" ? el.checked : (isNaN(+el.value) ? el.value : +el.value);
        commit();
        var v = $("#view"), y = v ? v.scrollTop : 0; render(); var v2 = $("#view"); if (v2) v2.scrollTop = y; // keep scroll position
      }
    });
    window.addEventListener("hashchange", render);
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); global.__deferredPrompt = e; $$("[data-act=install]").forEach(function (b) { b.hidden = false; }); });
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
  function icoNote() { return svg('<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>', "ico-xs"); }
  function icoSpark() { return svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 .3 .3 2 .7-2 .7-.3.3-.7 2-.7-2-.3-.3-2-.7 2-.7.3-.3z"/>'); }
  function svg(inner, cls) { return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; }

  /* ---------------------------------------------------------- cloud sync */
  function setupSync() {
    if (!(global.Sync && Sync.enabled())) return;          // pure offline build
    Sync.on("status", updateSyncBadge);
    // Conflict: merge this device's edits with the server copy (union — no loss), then re-push.
    Sync.on("conflict", function (c) {
      try {
        var merged = S.merge(c.local || state, c.server);
        state = S.replace(merged); render();
        toast("Merged changes from your other device");
        Sync.push(state).catch(function () {});
      } catch (e) { console.warn("merge failed", e); }
    });
    Sync.on("refresh", function () { if (Sync.isDirty()) { Sync.flush(); return; } Sync.pull().then(function (b) { if (b && b.data) { state = S.replace(b.data); render(); updateSyncBadge("synced"); } }).catch(function () {}); });
    Sync.on("locked", function () { showLock("unlock"); });

    if (Sync.hasLocalPin()) {
      updateSyncBadge("syncing");
      if (Sync.isDirty()) {
        // unsynced local edits exist — push them (server merge resolves any conflict). Never pull-over them.
        Sync.push(state).then(function () { updateSyncBadge("synced"); }).catch(function (e) { if (e && e.code === 401) showLock("unlock"); else updateSyncBadge("offline"); });
      } else {
        Sync.pull().then(function (b) { if (b && b.data) { state = S.replace(b.data); render(); } updateSyncBadge("synced"); })
          .catch(function (e) { if (e && e.code === 401) showLock("unlock"); else updateSyncBadge("offline"); });
      }
    } else {
      Sync.status().then(function (st) { showLock(st && st.hasPin ? "unlock" : "setup"); })
        .catch(function () { updateSyncBadge("offline"); }); // backend unreachable → use local cache
    }
  }

  function showLock(mode) {
    mode = mode || "unlock";
    var setup = mode === "setup";
    document.getElementById("lockRoot").innerHTML =
      '<div class="lock"><div class="lock-card">' +
        '<div class="lock-mark">' + icoDiamond() + '</div>' +
        '<h2>' + (setup ? "Secure your dashboard" : "Welcome back, Arsh") + '</h2>' +
        '<p class="muted">' + (setup
          ? "Create a passcode. You’ll use this same passcode to unlock your data on every device — phone and laptop. It keeps your data in sync."
          : "Enter your passcode to load your latest data.") + '</p>' +
        '<input type="password" id="pinInput" inputmode="text" autocomplete="off" placeholder="Passcode" class="lock-input" />' +
        (setup ? '<input type="password" id="pinInput2" autocomplete="off" placeholder="Confirm passcode" class="lock-input" />' : '') +
        '<div id="lockErr" class="lock-err"></div>' +
        '<button class="pill-btn primary lock-btn" id="lockGo">' + (setup ? "Create & sync" : "Unlock") + '</button>' +
        (setup ? '<p class="muted xs" style="margin-top:12px">Tip: choose something you’ll remember — there’s no email reset. You can change it later in Settings.</p>'
               : '<button class="mini-link" id="lockOffline" style="margin-top:12px">Continue offline (view only)</button>') +
      '</div></div>';
    var root = document.getElementById("lockRoot"); root.classList.add("show");
    var input = document.getElementById("pinInput"), go = document.getElementById("lockGo");
    setTimeout(function () { input.focus(); }, 50);
    function fail(m) { document.getElementById("lockErr").textContent = m; go.disabled = false; go.textContent = setup ? "Create & sync" : "Unlock"; }
    function submit() {
      var pin = input.value.trim();
      if (pin.length < 4) return fail("Passcode must be at least 4 characters.");
      if (setup) { var p2 = (document.getElementById("pinInput2").value || "").trim(); if (pin !== p2) return fail("Passcodes don’t match."); }
      go.disabled = true; go.textContent = "Working…";
      (setup ? Sync.setup(pin, state.isDemo ? null : state) : Sync.unlock(pin)).then(function (b) {
        if (b && b.data) state = S.replace(b.data);
        hideLock(); render(); updateSyncBadge("synced");
        toast(setup ? "Synced ✓ Your data is now on all your devices" : "Unlocked ✓");
      }).catch(function (e) {
        if (e && e.code === "SETUP") { showLock("setup"); return; }
        fail(e && e.code === 401 ? "Wrong passcode — try again." : (e && e.message) || "Couldn’t connect. Check your internet.");
      });
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === "Enter") submit(); };
    var off = document.getElementById("lockOffline");
    if (off) off.onclick = function () { hideLock(); updateSyncBadge("offline"); toast("Offline mode — changes won’t sync until you unlock"); };
  }
  function hideLock() { var r = document.getElementById("lockRoot"); if (r) { r.classList.remove("show"); r.innerHTML = ""; } }

  var badgeFadeT;
  function updateSyncBadge(st) {
    var el = document.getElementById("syncBadge"); if (!el) return;
    var map = {
      syncing: ["Syncing…", "is-syncing"], pending: ["Syncing…", "is-syncing"],
      synced: ["Synced", "is-synced"], offline: ["Offline", "is-offline"],
      error: ["Sync error", "is-error"], locked: ["Locked", "is-offline"]
    };
    var m = map[st] || map.synced;
    el.className = "sync-badge " + m[1]; el.hidden = false;
    el.innerHTML = '<span class="sb-dot"></span>' + m[0];
    clearTimeout(badgeFadeT);
    if (st === "synced") badgeFadeT = setTimeout(function () { el.classList.add("fade"); }, 2200);
    else el.classList.remove("fade");
  }

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
    setupSync();
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  global.App = { render: render, getState: function () { return state; } };
})(window);
