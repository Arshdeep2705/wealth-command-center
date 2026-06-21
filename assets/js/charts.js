/* ============================================================================
   charts.js — dependency-free SVG charts (offline-safe, themable)
   Every function returns an SVG string. Colours come from the data.
   ============================================================================ */
(function (global) {
  "use strict";
  var M = global.Model;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uid() { return "g" + Math.random().toString(36).slice(2, 9); }

  /* ---- Donut / ring with optional centre label ----------------------------- */
  function donut(segments, opts) {
    opts = opts || {};
    var size = opts.size || 200, stroke = opts.stroke || 26, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
    var C = 2 * Math.PI * r;
    var total = segments.reduce(function (s, x) { return s + Math.max(0, x.value || 0); }, 0);
    var gap = opts.gap == null ? 2 : opts.gap; // px gap between segments
    var offset = 0, parts = "";
    var track = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="' + stroke + '"/>';
    if (total <= 0) {
      parts = track;
    } else {
      segments.forEach(function (seg) {
        var v = Math.max(0, seg.value || 0); if (v <= 0) return;
        var len = (v / total) * C;
        var dash = Math.max(0, len - gap);
        parts += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (seg.color || "#888") + '" ' +
          'stroke-width="' + stroke + '" stroke-linecap="round" ' +
          'stroke-dasharray="' + dash + ' ' + (C - dash) + '" stroke-dashoffset="' + (-offset) + '" ' +
          'transform="rotate(-90 ' + cx + ' ' + cy + ')" class="seg"><title>' + esc(seg.label) + ': ' + M.money0(v) + '</title></circle>';
        offset += len;
      });
      parts = track + parts;
    }
    var center = "";
    if (opts.centerTop || opts.centerMain || opts.centerSub) {
      center = '<text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" class="donut-top">' + esc(opts.centerTop || "") + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" class="donut-main">' + esc(opts.centerMain || "") + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 26) + '" text-anchor="middle" class="donut-sub">' + esc(opts.centerSub || "") + '</text>';
    }
    return '<svg class="chart donut" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img">' + parts + center + '</svg>';
  }

  /* ---- Vertical bars -------------------------------------------------------- */
  function bars(data, opts) {
    opts = opts || {};
    var w = opts.width || 640, h = opts.height || 220, pad = opts.pad || { t: 18, r: 12, b: 34, l: 12 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var max = opts.max || Math.max.apply(null, data.map(function (d) { return d.value || 0; }).concat([1]));
    var n = data.length, gap = opts.gap == null ? 12 : opts.gap;
    var bw = (iw - gap * (n - 1)) / n;
    var bodies = "", labels = "", values = "";
    data.forEach(function (d, i) {
      var bh = max > 0 ? (Math.max(0, d.value) / max) * ih : 0;
      var x = pad.l + i * (bw + gap), y = pad.t + (ih - bh);
      var col = d.color || opts.color || "var(--accent)";
      var rad = Math.min(8, bw / 2);
      bodies += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + rad + '" fill="' + col + '" class="bar" style="--bh:' + bh.toFixed(1) + 'px"><title>' + esc(d.label) + ': ' + M.money0(d.value) + '</title></rect>';
      if (opts.showValues) values += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle" class="bar-val">' + (opts.fmt ? opts.fmt(d.value) : M.moneyShort(d.value)) + '</text>';
      labels += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (h - 12) + '" text-anchor="middle" class="bar-lbl' + (d.highlight ? " hi" : "") + '">' + esc(d.label) + '</text>';
      if (d.sub) labels += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (h - 1) + '" text-anchor="middle" class="bar-sub">' + esc(d.sub) + '</text>';
    });
    return '<svg class="chart bars" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="xMidYMid meet" role="img">' + bodies + values + labels + '</svg>';
  }

  /* ---- Area / line ---------------------------------------------------------- */
  function area(points, opts) {
    opts = opts || {};
    var w = opts.width || 640, h = opts.height || 200, pad = opts.pad || { t: 16, r: 14, b: 28, l: 14 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var vals = points.map(function (p) { return p.value; });
    var max = opts.max != null ? opts.max : Math.max.apply(null, vals.concat([1]));
    var min = opts.min != null ? opts.min : Math.min.apply(null, vals.concat([0]));
    if (max === min) max = min + 1;
    var n = points.length;
    function X(i) { return pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw); }
    function Y(v) { return pad.t + ih - ((v - min) / (max - min)) * ih; }
    var id = uid(), line = "", dots = "", labels = "";
    points.forEach(function (p, i) { line += (i ? " L" : "M") + X(i).toFixed(1) + " " + Y(p.value).toFixed(1); });
    var fill = line + " L" + X(n - 1).toFixed(1) + " " + (pad.t + ih) + " L" + X(0).toFixed(1) + " " + (pad.t + ih) + " Z";
    points.forEach(function (p, i) {
      dots += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.value).toFixed(1) + '" r="3.4" class="pt"><title>' + esc(p.label) + ': ' + M.money0(p.value) + '</title></circle>';
      if (p.label) labels += '<text x="' + X(i).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" class="ax-lbl">' + esc(p.label) + '</text>';
    });
    var grad = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + (opts.color || "var(--accent)") + '" stop-opacity="0.42"/>' +
      '<stop offset="100%" stop-color="' + (opts.color || "var(--accent)") + '" stop-opacity="0"/></linearGradient></defs>';
    return '<svg class="chart area" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" role="img">' +
      grad +
      '<path d="' + fill + '" fill="url(#' + id + ')" stroke="none"/>' +
      '<path d="' + line + '" fill="none" stroke="' + (opts.color || "var(--accent)") + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" class="spark-line"/>' +
      dots + labels + '</svg>';
  }

  /* ---- Stacked horizontal bar (single row composition) --------------------- */
  function stackbar(segments, opts) {
    opts = opts || {};
    var total = segments.reduce(function (s, x) { return s + Math.max(0, x.value || 0); }, 0) || 1;
    var html = '<div class="stackbar">';
    segments.forEach(function (s) {
      var w = (Math.max(0, s.value || 0) / total) * 100;
      if (w <= 0) return;
      html += '<span class="seg" style="width:' + w.toFixed(2) + '%;background:' + (s.color || "#888") + '" title="' + esc(s.label) + ': ' + M.money0(s.value) + '"></span>';
    });
    return html + "</div>";
  }

  global.Charts = { donut: donut, bars: bars, area: area, stackbar: stackbar };
})(window);
