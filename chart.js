/* 折れ線グラフ描画(SVG手描画・依存ライブラリなし) */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // きりのよい目盛りステップを選ぶ
  function niceStep(span, targetTicks) {
    const raw = span / Math.max(targetTicks, 1);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (pow * m >= raw) return pow * m;
    }
    return pow * 10;
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function fmtDateTime(ms) {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + hh + ":" + mm;
  }

  /**
   * container に折れ線グラフを描画する。
   * opts = {
   *   series: [{ name, color, points: [{t(ms), v}] }],  // points は時刻昇順
   *   unit: "kg" | "mmHg",
   *   decimals: 値の表示桁数,
   *   refLines: [{ v, label }],   // 基準線(任意)
   * }
   */
  function renderLineChart(container, opts) {
    container.textContent = "";

    const series = opts.series.filter(s => s.points.length > 0);
    if (series.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-chart";
      p.textContent = "この期間のデータがありません";
      container.appendChild(p);
      return;
    }

    const W = 640, H = 280;
    const PAD = { top: 16, right: 48, bottom: 30, left: 44 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // --- スケール計算 ---
    let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.t < tMin) tMin = p.t;
        if (p.t > tMax) tMax = p.t;
        if (p.v < vMin) vMin = p.v;
        if (p.v > vMax) vMax = p.v;
      }
    }
    for (const r of (opts.refLines || [])) {
      if (r.v < vMin) vMin = r.v;
      if (r.v > vMax) vMax = r.v;
    }
    if (tMin === tMax) { tMin -= 43200000; tMax += 43200000; } // 1点のみ→±12h
    const vPad = (vMax - vMin) * 0.1 || Math.max(vMax * 0.05, 1);
    vMin -= vPad; vMax += vPad;

    const step = niceStep(vMax - vMin, 4);
    const y0 = Math.floor(vMin / step) * step;
    const y1 = Math.ceil(vMax / step) * step;

    const x = t => PAD.left + (t - tMin) / (tMax - tMin) * plotW;
    const y = v => PAD.top + (1 - (v - y0) / (y1 - y0)) * plotH;

    const surface = cssVar("--surface-1") || "#fcfcfb";

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", tabindex: "0" });
    svg.setAttribute("aria-label", series.map(s => s.name).join("・") + "の推移グラフ");

    // --- Y目盛りとグリッド線(ヘアライン・実線) ---
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      const yy = y(v);
      svg.appendChild(el("line", {
        x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy,
        stroke: cssVar("--grid"), "stroke-width": 1,
      }));
      const t = el("text", {
        x: PAD.left - 8, y: yy + 4, "text-anchor": "end",
        "font-size": 11, fill: cssVar("--text-muted"),
        style: "font-variant-numeric: tabular-nums",
      });
      t.textContent = Number(v.toFixed(6)).toLocaleString();
      svg.appendChild(t);
    }

    // --- X目盛り(日付ラベル 最大5個) ---
    const nx = Math.min(5, Math.max(2, Math.round(plotW / 110)));
    for (let i = 0; i < nx; i++) {
      const t = tMin + (tMax - tMin) * i / (nx - 1);
      const anchor = i === 0 ? "start" : (i === nx - 1 ? "end" : "middle");
      const tx = el("text", {
        x: x(t), y: H - 8, "text-anchor": anchor,
        "font-size": 11, fill: cssVar("--text-muted"),
      });
      tx.textContent = fmtDate(t);
      svg.appendChild(tx);
    }

    // --- 基準線 ---
    for (const r of (opts.refLines || [])) {
      const yy = y(r.v);
      svg.appendChild(el("line", {
        x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy,
        stroke: cssVar("--text-muted"), "stroke-width": 1, "stroke-dasharray": "4 4",
      }));
      const t = el("text", {
        x: W - PAD.right, y: yy - 4, "text-anchor": "end",
        "font-size": 10, fill: cssVar("--text-muted"),
      });
      t.textContent = r.label;
      svg.appendChild(t);
    }

    // --- 折れ線・マーカー ---
    const manyPoints = Math.max(...series.map(s => s.points.length)) > 60;
    for (const s of series) {
      const d = s.points.map((p, i) => (i === 0 ? "M" : "L") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
      svg.appendChild(el("path", {
        d, fill: "none", stroke: s.color, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
      s.points.forEach((p, i) => {
        const last = i === s.points.length - 1;
        if (manyPoints && !last) return;
        svg.appendChild(el("circle", {
          cx: x(p.t), cy: y(p.v), r: 4,
          fill: s.color, stroke: surface, "stroke-width": 2,
        }));
      });
    }

    // --- 終端の直接ラベル(値はテキスト色、系列色は使わない) ---
    const endLabels = series.map(s => {
      const p = s.points[s.points.length - 1];
      return { yPos: y(p.v), text: p.v.toFixed(opts.decimals ?? 0) };
    }).sort((a, b) => a.yPos - b.yPos);
    for (let i = 1; i < endLabels.length; i++) {
      if (endLabels[i].yPos - endLabels[i - 1].yPos < 14) {
        endLabels[i].yPos = endLabels[i - 1].yPos + 14;
      }
    }
    for (const lb of endLabels) {
      const t = el("text", {
        x: W - PAD.right + 6, y: lb.yPos + 4,
        "font-size": 12, "font-weight": 600, fill: cssVar("--text-primary"),
        style: "font-variant-numeric: tabular-nums",
      });
      t.textContent = lb.text;
      svg.appendChild(t);
    }

    // --- ホバー層: クロスヘア + ツールチップ ---
    const xsSet = new Set();
    for (const s of series) for (const p of s.points) xsSet.add(p.t);
    const xs = [...xsSet].sort((a, b) => a - b);

    const crosshair = el("line", {
      y1: PAD.top, y2: H - PAD.bottom,
      stroke: cssVar("--baseline"), "stroke-width": 1, visibility: "hidden",
    });
    svg.appendChild(crosshair);

    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    container.appendChild(tooltip);

    const overlay = el("rect", {
      x: PAD.left, y: PAD.top, width: plotW, height: plotH,
      fill: "transparent",
    });
    svg.appendChild(overlay);

    let hoverIdx = -1;

    function showAt(idx) {
      hoverIdx = idx;
      const t = xs[idx];
      const cx = x(t);
      crosshair.setAttribute("x1", cx);
      crosshair.setAttribute("x2", cx);
      crosshair.setAttribute("visibility", "visible");

      tooltip.textContent = "";
      const dateEl = document.createElement("div");
      dateEl.className = "tt-date";
      dateEl.textContent = fmtDateTime(t);
      tooltip.appendChild(dateEl);
      for (const s of series) {
        const p = s.points.find(pp => pp.t === t);
        if (!p) continue;
        const row = document.createElement("div");
        row.className = "tt-row";
        const key = document.createElement("span");
        key.className = "tt-key";
        key.style.background = s.color;
        const val = document.createElement("span");
        val.className = "tt-val";
        val.textContent = p.v.toFixed(opts.decimals ?? 0) + (opts.unit ? " " + opts.unit : "");
        const name = document.createElement("span");
        name.textContent = s.name;
        row.append(key, val, name);
        tooltip.appendChild(row);
      }

      tooltip.style.display = "block";
      const rect = container.getBoundingClientRect();
      const scale = rect.width / W;
      let left = cx * scale + 12;
      const ttW = tooltip.offsetWidth;
      if (left + ttW > rect.width - 4) left = cx * scale - ttW - 12;
      tooltip.style.left = Math.max(4, left) + "px";
      tooltip.style.top = (PAD.top * scale + 4) + "px";
    }

    function hide() {
      hoverIdx = -1;
      crosshair.setAttribute("visibility", "hidden");
      tooltip.style.display = "none";
    }

    overlay.addEventListener("pointermove", ev => {
      const rect = container.getBoundingClientRect();
      const scale = rect.width / W;
      const px = (ev.clientX - rect.left) / scale;
      const t = tMin + (px - PAD.left) / plotW * (tMax - tMin);
      let best = 0, bestD = Infinity;
      xs.forEach((xt, i) => {
        const d = Math.abs(xt - t);
        if (d < bestD) { bestD = d; best = i; }
      });
      showAt(best);
    });
    overlay.addEventListener("pointerleave", hide);
    svg.addEventListener("keydown", ev => {
      if (ev.key === "ArrowRight") { showAt(Math.min(xs.length - 1, hoverIdx < 0 ? xs.length - 1 : hoverIdx + 1)); ev.preventDefault(); }
      else if (ev.key === "ArrowLeft") { showAt(Math.max(0, hoverIdx < 0 ? xs.length - 1 : hoverIdx - 1)); ev.preventDefault(); }
      else if (ev.key === "Escape") hide();
    });
    svg.addEventListener("blur", hide);

    container.appendChild(svg);
  }

  window.renderLineChart = renderLineChart;
})();
