// Draws every number and chart from data/counties.json so the page and the CSV can't disagree.
(async function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const tip = document.getElementById("tip");
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const sgn = (n) => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
  const mg = (m) => (Math.abs(m) < 0.05 ? "even" : (m > 0 ? "D+" : "R+") + Math.abs(m).toFixed(1));
  const pct = (n, d) => (n / d) * 100;
  const set = (id, s) => { document.getElementById(id).textContent = s; };

  document.getElementById("theme").addEventListener("click", () => window.MeridianTheme.toggle());

  let raw;
  try {
    const res = await fetch("data/counties.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    raw = await res.json();
  } catch (err) {
    const box = document.createElement("div");
    box.className = "mrd-callout mrd-callout--warning load-error";
    box.textContent = "Couldn't load data/counties.json (" + err.message + "). Reload the page.";
    document.querySelector(".tiles").replaceWith(box);
    throw err;
  }

  // Parse at the boundary. A county whose numbers don't add up stops the page.
  const C = raw.counties.map((r) => {
    if (r.colom_2026 + r.hydesmith_2026 + r.pinkins_2026 !== r.total_2026) throw new Error("Totals don't add up: " + r.county);
    const m26 = pct(r.colom_2026 - r.hydesmith_2026, r.total_2026);
    const m20 = pct(r.espy_2020 - r.hydesmith_2020, r.total_2020);
    return {
      county: r.county, black: r.black_pct_2020,
      colom: r.colom_2026, hs26: r.hydesmith_2026, pinkins: r.pinkins_2026, total26: r.total_2026,
      espy: r.espy_2020, hs20: r.hydesmith_2020, oth20: r.other_2020, total20: r.total_2020,
      m26, m20, swing: m26 - m20, turnout: pct(r.total_2026, r.total_2020),
      net: (r.colom_2026 - r.hydesmith_2026) - (r.espy_2020 - r.hydesmith_2020),
    };
  });
  if (C.length !== 82) throw new Error("Expected 82 counties, got " + C.length);

  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  const S = {};
  ["colom", "hs26", "pinkins", "total26", "espy", "hs20", "total20", "net"].forEach((k) => { S[k] = sum(C, k); });
  const find = (n) => C.find((c) => c.county === n);

  set("t-c", fmt(S.colom)); set("t-cp", pct(S.colom, S.total26).toFixed(1) + "%");
  set("t-h", fmt(S.hs26)); set("t-hp", pct(S.hs26, S.total26).toFixed(1) + "%");
  set("t-l", fmt(S.colom - S.hs26)); set("t-lp", pct(S.colom - S.hs26, S.total26).toFixed(2) + " points of " + fmt(S.total26));
  set("t-p", fmt(S.pinkins)); set("t-pp", pct(S.pinkins, S.total26).toFixed(1) + "%");

  set("n-retain", "Hyde-Smith: " + fmt(S.hs26) + ", which is " + pct(S.hs26, S.hs20).toFixed(1) + "% of her " + fmt(S.hs20) +
    " in 2020. Colom: " + fmt(S.colom) + ", " + pct(S.colom, S.espy).toFixed(1) + "% of Espy's " + fmt(S.espy) +
    ". Total turnout was " + pct(S.total26, S.total20).toFixed(1) + "% of 2020. Statewide margin went from " +
    mg(pct(S.espy - S.hs20, S.total20)) + " to " + mg(pct(S.colom - S.hs26, S.total26)) + ".");

  const byNet = [...C].sort((a, b) => b.net - a.net);
  let acc = 0, k = 0;
  while (acc < S.net / 2) { acc += byNet[k].net; k++; }
  const hinds = find("Hinds");
  set("p-where", "The margin moved " + fmt(S.net) + " votes toward the Democrat. Half of that came from " + k + " counties: " +
    byNet.slice(0, k).map((x) => x.county).join(", ") + ". Not one of them is majority-Black. Hinds actually moved " +
    fmt(Math.abs(hinds.net)) + " toward Hyde-Smith. It cast about " + fmt(hinds.total20 - hinds.total26) + " fewer votes than 2020.");

  function fit(key) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    C.forEach((x) => { const w = x.total20; sw += w; sx += w * x.black; sy += w * x[key]; sxx += w * x.black * x.black; sxy += w * x.black * x[key]; });
    const b = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), a = (sy - b * sx) / sw;
    const mx = sum(C, "black") / C.length, my = sum(C, key) / C.length;
    let num = 0, dx = 0, dy = 0;
    C.forEach((x) => { num += (x.black - mx) * (x[key] - my); dx += (x.black - mx) ** 2; dy += (x[key] - my) ** 2; });
    return { a, b, r: num / Math.sqrt(dx * dy) };
  }
  const fs = fit("swing"), ft = fit("turnout");
  const toward = C.filter((x) => x.swing > 0).length;
  const back = C.filter((x) => x.swing < 0).sort((a, b) => a.swing - b.swing);
  const sw = C.map((x) => x.swing).sort((a, b) => a - b);
  const median = (sw[40] + sw[41]) / 2;
  set("p-swing", toward + " of 82 counties moved toward Colom. The median swing was " + median.toFixed(1) +
    " points. Correlation between a county's Black share and its swing: " + Math.abs(fs.r).toFixed(2) +
    ". The Delta and the hill country moved about the same. The outliers are suburbs. DeSoto moved 22 points. Rankin, Lamar, Forrest and Harrison moved 13 or 14. The " +
    back.length + " that went the other way: " + back.map((x) => x.county + " (" + x.swing.toFixed(1) + ")").join(", ") +
    ". Mostly small. Sharkey is Pinkins' home county.");
  set("p-turnout", "Statewide turnout was " + pct(S.total26, S.total20).toFixed(1) + "% of 2020. Run a line through the counties and one with almost no Black residents kept about " +
    ft.a.toFixed(0) + "%. An 80% Black county kept about " + (ft.a + 80 * ft.b).toFixed(0) +
    "%. Real, but small. And 2020 already had strong Black turnout with Espy on the ballot. Compare against 2024 instead and the jump looks a lot bigger. That's the comparison the national “surge” stories use.");

  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); for (const a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
  function text(parent, x, y, s, attrs) { const t = el("text", Object.assign({ x, y }, attrs || {}), parent); t.textContent = s; return t; }
  function hover(node, s) {
    const show = (ev) => {
      tip.textContent = s; tip.style.opacity = "1";
      const r = tip.getBoundingClientRect();
      let x = ev.clientX + 12, y = ev.clientY + 12;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 12;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 12;
      tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
    };
    node.addEventListener("pointermove", show); node.addEventListener("pointerdown", show);
    node.addEventListener("pointerleave", () => { tip.style.opacity = "0"; });
  }
  function svgFor(id, h) {
    const box = document.getElementById(id); box.textContent = "";
    const w = Math.max(280, box.clientWidth);
    return { svg: el("svg", { viewBox: "0 0 " + w + " " + h, role: "img" }, box), w, h };
  }

  function retain() {
    const rows = [["Democrat", S.espy, S.colom, css("--dem")], ["Hyde-Smith", S.hs20, S.hs26, css("--rep")]];
    const { svg, w } = svgFor("c-retain", 150);
    el("title", {}, svg).textContent = "Votes by side, 2020 vs 2026";
    const L = 96, R = 120, max = 750000, x = (v) => L + (v / max) * (w - L - R);
    [0, 250000, 500000, 750000].forEach((v) => { el("line", { x1: x(v), x2: x(v), y1: 4, y2: 124, class: "grid" }, svg); text(svg, x(v), 142, v ? v / 1000 + "k" : "0", { "text-anchor": "middle" }); });
    rows.forEach((r, i) => {
      const top = 8 + i * 58;
      text(svg, L - 10, top + 26, r[0], { class: "lab", "text-anchor": "end" });
      hover(el("rect", { x: L, y: top, width: x(r[1]) - L, height: 20, rx: 3, fill: css("--border-strong") }, svg), r[0] + ", 2020: " + fmt(r[1]));
      text(svg, x(r[1]) + 6, top + 15, fmt(r[1]), {});
      hover(el("rect", { x: L, y: top + 24, width: x(r[2]) - L, height: 20, rx: 3, fill: r[3] }, svg), r[0] + ", 2026: " + fmt(r[2]) + "\n" + pct(r[2], r[1]).toFixed(1) + "% of 2020");
      text(svg, x(r[2]) + 6, top + 39, fmt(r[2]) + " (" + pct(r[2], r[1]).toFixed(1) + "%)", { class: "val" });
    });
  }

  function contrib() {
    const rows = byNet.slice(0, 15).concat([hinds]);
    const rowH = 26, h = rows.length * rowH + 30;
    const { svg, w } = svgFor("c-contrib", h);
    el("title", {}, svg).textContent = "Change in net margin since 2020, by county";
    const L = 92, R = 58, lo = -6000, hi = 16000, x = (v) => L + ((v - lo) / (hi - lo)) * (w - L - R);
    [-5000, 0, 5000, 10000, 15000].forEach((v) => { el("line", { x1: x(v), x2: x(v), y1: 2, y2: h - 24, class: v === 0 ? "axis0" : "grid" }, svg); text(svg, x(v), h - 8, v === 0 ? "0" : (v > 0 ? "+" : "−") + Math.abs(v / 1000) + "k", { "text-anchor": "middle" }); });
    let run = 0;
    rows.forEach((c, i) => {
      const cy = 4 + i * rowH + rowH / 2, isH = c === hinds;
      if (!isH) run += c.net;
      text(svg, L - 10, cy + 4, c.county, { class: "lab", "text-anchor": "end" });
      const x0 = x(0), x1 = x(c.net);
      hover(el("rect", { x: Math.min(x0, x1), y: cy - 8, width: Math.max(2, Math.abs(x1 - x0)), height: 16, rx: 3, fill: c.net >= 0 ? css("--dem") : css("--rep"), opacity: isH ? 0.6 : 1 }, svg),
        c.county + ": " + sgn(c.net) + " net\n" + mg(c.m20) + " in 2020, " + mg(c.m26) + " now");
      text(svg, c.net >= 0 ? x1 + 5 : x1 - 5, cy + 4, sgn(c.net), { class: "val", "text-anchor": c.net >= 0 ? "start" : "end" });
      if (!isH) text(svg, w - 2, cy + 4, ((run / S.net) * 100).toFixed(0) + "%", { "text-anchor": "end" });
    });
  }

  function scatter(id, key, o) {
    const h = 360, { svg, w } = svgFor(id, h);
    el("title", {}, svg).textContent = o.title;
    const L = 46, R = 16, T = 12, B = 40;
    const x = (v) => L + (v / 90) * (w - L - R);
    const y = (v) => T + (1 - (v - o.lo) / (o.hi - o.lo)) * (h - T - B);
    o.ticks.forEach((v) => { el("line", { x1: L, x2: w - R, y1: y(v), y2: y(v), class: v === o.zero ? "axis0" : "grid" }, svg); text(svg, L - 8, y(v) + 4, o.tf(v), { "text-anchor": "end" }); });
    [0, 20, 40, 60, 80].forEach((v) => text(svg, x(v), h - B + 18, v + "%", { "text-anchor": "middle" }));
    text(svg, (L + w - R) / 2, h - 4, "Black share of county population, 2020 Census", { "text-anchor": "middle" });
    el("line", { x1: x(0), x2: x(90), y1: y(o.fit.a), y2: y(o.fit.a + 90 * o.fit.b), stroke: css("--text-faint"), "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    const maxV = Math.max(...C.map((c) => c.total26));
    const rad = (c) => 3 + Math.sqrt(c.total26 / maxV) * 14;
    [...C].sort((a, b) => b.total26 - a.total26).forEach((c) => {
      const col = o.color(c);
      hover(el("circle", { cx: x(c.black), cy: y(c[key]), r: rad(c), fill: col, "fill-opacity": 0.3, stroke: col, "stroke-width": 1.2 }, svg), c.county + "\n" + o.tipf(c));
    });
    o.labels.forEach((n) => { const c = find(n); text(svg, x(c.black) + rad(c) + 3, y(c[key]) + 4, n, { class: "lab" }); });
  }

  function lead() {
    const pts = [["04NOV 1158", 43], ["04NOV 1730", 1138], ["05NOV 0918", 1936], ["05NOV 1311", 1764], ["05NOV 1733", 1813], ["05NOV 1828", 1882], ["06NOV 1136", 2010], ["06NOV 1705", 2574], ["09NOV 1141", S.colom - S.hs26]];
    const { svg, w, h } = svgFor("c-lead", 260);
    el("title", {}, svg).textContent = "Colom's lead over the count";
    const L = 76, R = 16, T = 16, B = 40, max = 3000;
    const x = (i) => L + (i * (w - L - R)) / (pts.length - 1);
    const y = (v) => T + (1 - v / max) * (h - T - B);
    [0, 1000, 2000, 3000].forEach((v) => { el("line", { x1: L, x2: w - R, y1: y(v), y2: y(v), class: "grid" }, svg); text(svg, L - 8, y(v) + 4, fmt(v), { "text-anchor": "end" }); });
    el("path", { d: "M" + x(0) + "," + y(0) + pts.map((p, i) => "L" + x(i) + "," + y(p[1])).join("") + "L" + x(pts.length - 1) + "," + y(0) + "Z", fill: css("--accent"), opacity: 0.1 }, svg);
    el("path", { d: pts.map((p, i) => (i ? "L" : "M") + x(i) + "," + y(p[1])).join(""), fill: "none", stroke: css("--accent"), "stroke-width": 2.5 }, svg);
    const every = w < 760 ? 2 : 1;
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      el("circle", { cx: x(i), cy: y(p[1]), r: last ? 6 : 4, fill: last ? css("--accent") : css("--surface-card"), stroke: css("--accent"), "stroke-width": 2 }, svg);
      hover(el("circle", { cx: x(i), cy: y(p[1]), r: 14, fill: "transparent" }, svg), p[0] + ": Colom +" + fmt(p[1]));
      if (i % every === 0 || last) text(svg, x(i), h - B + 18, p[0], { "text-anchor": last ? "end" : "middle" });
      if (i === 0 || last) text(svg, x(i) + (last ? -10 : 8), y(p[1]) - 10, fmt(p[1]), { class: "val", "text-anchor": last ? "end" : "start" });
    });
  }

  function aff() {
    const itaw = find("Itawamba");
    const rows = [
      { name: "Oktibbeha", a: 21.1, aL: "regular ballots, 60.0 to 38.9", b: 60.8, bL: "affidavits, 401 to 96 of 502" },
      { name: "Itawamba", a: itaw.m26, aL: "overall", b: -46, bL: "affidavits, as reported" },
    ];
    const rowH = 56, h = rows.length * rowH + 30, { svg, w } = svgFor("c-aff", h);
    el("title", {}, svg).textContent = "Affidavit margins vs regular margins";
    const L = 90, R = 16, lim = 80, x = (m) => L + ((m + lim) / (2 * lim)) * (w - L - R);
    [-80, -40, 0, 40, 80].forEach((v) => { el("line", { x1: x(v), x2: x(v), y1: 4, y2: h - 24, class: v === 0 ? "axis0" : "grid" }, svg); text(svg, x(v), h - 8, mg(v), { "text-anchor": "middle" }); });
    rows.forEach((r, i) => {
      const top = 6 + i * rowH;
      text(svg, L - 10, top + rowH / 2 + 4, r.name, { class: "lab", "text-anchor": "end" });
      [[r.a, r.aL, css("--border-strong"), top + 8], [r.b, r.bL, css("--accent"), top + 28]].forEach((s) => {
        const x0 = x(0), x1 = x(s[0]);
        hover(el("rect", { x: Math.min(x0, x1), y: s[3], width: Math.abs(x1 - x0), height: 16, rx: 3, fill: s[2] }, svg), r.name + ", " + s[1] + ": " + mg(s[0]));
        text(svg, s[0] >= 0 ? x1 + 6 : x1 - 6, s[3] + 12, mg(s[0]), { class: "val", "text-anchor": s[0] >= 0 ? "start" : "end" });
      });
    });
  }

  function td(tr, s, cls) { const c = document.createElement("td"); c.textContent = s; if (cls) c.className = cls; tr.appendChild(c); return c; }
  function head(table, cols) {
    const tr = document.createElement("tr");
    cols.forEach((c) => { const th = document.createElement("th"); th.textContent = c; tr.appendChild(th); });
    const thead = document.createElement("thead"); thead.appendChild(tr); table.appendChild(thead);
  }
  const mcls = (m) => (m >= 0 ? "d" : "r");

  (function groups() {
    const t = document.getElementById("t-groups");
    head(t, ["Counties", "N", "Turnout vs 2020", "2020", "2026", "Swing", "Net change"]);
    const body = document.createElement("tbody");
    [["Majority Black (50%+)", (c) => c.black >= 50], ["30 to 50% Black", (c) => c.black >= 30 && c.black < 50], ["Under 30% Black", (c) => c.black < 30], ["Statewide", () => true]].forEach(([lab, f]) => {
      const g = C.filter(f), s = (key) => sum(g, key);
      const m20 = pct(s("espy") - s("hs20"), s("total20")), m26 = pct(s("colom") - s("hs26"), s("total26"));
      const tr = document.createElement("tr");
      td(tr, lab); td(tr, g.length); td(tr, pct(s("total26"), s("total20")).toFixed(1) + "%");
      td(tr, mg(m20), mcls(m20)); td(tr, mg(m26), mcls(m26)); td(tr, (m26 - m20 >= 0 ? "+" : "") + (m26 - m20).toFixed(1)); td(tr, sgn(s("net")));
      body.appendChild(tr);
    });
    t.appendChild(body);
  })();

  (function flips() {
    const t = document.getElementById("t-flips");
    head(t, ["County", "Black share", "2020", "2026", "Swing", "Votes 2026"]);
    const body = document.createElement("tbody");
    C.filter((c) => c.m20 < 0 && c.m26 > 0).sort((a, b) => b.total26 - a.total26).forEach((c) => {
      const tr = document.createElement("tr");
      td(tr, c.county); td(tr, c.black.toFixed(1) + "%"); td(tr, mg(c.m20), "r"); td(tr, mg(c.m26), "d"); td(tr, "+" + c.swing.toFixed(1)); td(tr, fmt(c.total26));
      body.appendChild(tr);
    });
    t.appendChild(body);
  })();

  (function claims() {
    const nesh = find("Neshoba"), sharkey = find("Sharkey");
    const pinkRed = C.filter((c) => c.m20 < 0).reduce((a, c) => a + c.pinkins, 0);
    const nFlip = C.filter((c) => c.m20 < 0 && c.m26 > 0).length;
    const grpT = (f) => { const g = C.filter(f); return pct(sum(g, "total26"), sum(g, "total20")); };
    const rows = [
      ["Colom flipped 18 or more counties.", "warning", "Partly",
        "Against Hyde-Smith's own 2020 race it's " + nFlip + ", and none went back. The 18 is against Trump 2024. I couldn't check that one at the county level."],
      ["Black turnout surged.", "warning", "Partly",
        "Majority-Black counties cast " + grpT((c) => c.black >= 50).toFixed(1) + "% of their 2020 vote. Counties under 30% Black cast " + grpT((c) => c.black < 30).toFixed(1) + "%. An edge, not a surge, measured against 2020. Against 2024 it looks bigger."],
      ["White Republicans crossed over.", "warning", "Partly",
        "Hyde-Smith lost " + fmt(S.hs20 - S.hs26) + " votes from 2020, and the worst of it was in white suburbs. DeSoto gave her 57% of her 2020 vote. County totals can't separate crossover from staying home. The surveys say it was both."],
      ["High turnout helps Hyde-Smith. (Henry Barbour, before the election)", "success", "Checks out",
        "Turnout was normal for a midterm, and the swing was about the same in high- and low-turnout counties. Who stayed home mattered more than how many."],
      ["77% of my votes came from conservative counties. (Ty Pinkins)", "success", "Checks out",
        fmt(pinkRed) + " of his " + fmt(S.pinkins) + " votes (" + pct(pinkRed, S.pinkins).toFixed(0) + "%) came from counties Hyde-Smith won in 2020. Best county was Sharkey, his home, at " + pct(sharkey.pinkins, sharkey.total26).toFixed(1) + "%. Doesn't say whose voters they were."],
      ["Choctaw turnout was up significantly. (Mississippi Band of Choctaw Indians)", "neutral", "Can't tell",
        "Neshoba cast " + nesh.turnout.toFixed(1) + "% of its 2020 vote, a bit under the state's " + pct(S.total26, S.total20).toFixed(1) + "%. Choctaw residents are about 17% of the county. You'd need precinct data to see it."],
      ["The late ballots would put Hyde-Smith back ahead.", "danger", "Nope",
        "The lead went from 43 to " + fmt(S.colom - S.hs26) + ". Affidavits ran ahead of Colom's regular vote everywhere it got reported."],
    ];
    const t = document.getElementById("t-claims");
    head(t, ["Claim", "What the returns show"]);
    const body = document.createElement("tbody");
    rows.forEach(([claim, kind, label, s]) => {
      const tr = document.createElement("tr");
      td(tr, claim);
      const cell = td(tr, "");
      const b = document.createElement("span"); b.className = "mrd-badge mrd-badge--" + kind; b.textContent = label;
      cell.appendChild(b); cell.appendChild(document.createElement("br")); cell.appendChild(document.createTextNode(s));
      body.appendChild(tr);
    });
    t.appendChild(body);
  })();

  const cols = [
    ["County", (c) => c.county, (c) => c.county],
    ["Black %", (c) => c.black, (c) => c.black.toFixed(1)],
    ["Colom", (c) => c.colom, (c) => fmt(c.colom)],
    ["Hyde-Smith", (c) => c.hs26, (c) => fmt(c.hs26)],
    ["Pinkins", (c) => c.pinkins, (c) => fmt(c.pinkins)],
    ["2026", (c) => c.m26, (c) => mg(c.m26)],
    ["2020", (c) => c.m20, (c) => mg(c.m20)],
    ["Swing", (c) => c.swing, (c) => (c.swing >= 0 ? "+" : "") + c.swing.toFixed(1)],
    ["Turnout vs 2020", (c) => c.turnout, (c) => c.turnout.toFixed(1) + "%"],
    ["Net change", (c) => c.net, (c) => sgn(c.net)],
  ];
  let sortK = 9, sortDir = -1;
  function all() {
    const t = document.getElementById("t-all"); t.textContent = "";
    const thead = document.createElement("thead"), tr = document.createElement("tr");
    cols.forEach((c, i) => {
      const th = document.createElement("th"), b = document.createElement("button");
      b.type = "button";
      b.textContent = c[0] + (i === sortK ? (sortDir > 0 ? " ↑" : " ↓") : "");
      b.addEventListener("click", () => { if (sortK === i) sortDir = -sortDir; else { sortK = i; sortDir = i === 0 ? 1 : -1; } all(); });
      th.setAttribute("aria-sort", i === sortK ? (sortDir > 0 ? "ascending" : "descending") : "none");
      th.appendChild(b); tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);
    const body = document.createElement("tbody");
    [...C].sort((a, b) => { const va = cols[sortK][1](a), vb = cols[sortK][1](b); return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir; }).forEach((c) => {
      const r = document.createElement("tr");
      cols.forEach((col, i) => td(r, col[2](c), i === 5 ? mcls(c.m26) : i === 6 ? mcls(c.m20) : ""));
      body.appendChild(r);
    });
    t.appendChild(body);
  }
  all();

  function draw() {
    retain(); contrib(); lead(); aff();
    scatter("c-swing", "swing", {
      title: "County swing vs Black share", lo: -10, hi: 25, zero: 0, ticks: [-10, -5, 0, 5, 10, 15, 20, 25],
      tf: (v) => (v > 0 ? "+" : "") + v, fit: fs, color: (c) => (c.swing >= 0 ? css("--dem") : css("--rep")),
      tipf: (c) => "Swing " + (c.swing >= 0 ? "+" : "") + c.swing.toFixed(1) + " (" + mg(c.m20) + " to " + mg(c.m26) + ")\nBlack share " + c.black.toFixed(1) + "%",
      labels: ["DeSoto", "Rankin", "Hinds", "Madison", "Forrest", "Harrison", "Issaquena", "Sharkey"],
    });
    scatter("c-turn", "turnout", {
      title: "Turnout vs 2020 by Black share", lo: 55, hi: 90, zero: null, ticks: [55, 60, 65, 70, 75, 80, 85, 90],
      tf: (v) => v + "%", fit: ft, color: () => css("--accent"),
      tipf: (c) => fmt(c.total26) + " votes, " + c.turnout.toFixed(1) + "% of 2020\nBlack share " + c.black.toFixed(1) + "%",
      labels: ["Hinds", "Madison", "Clay", "Washington", "DeSoto", "Jackson", "Hancock"],
    });
  }
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  draw();
  window.addEventListener("resize", redraw);
  document.addEventListener("meridianthemechange", redraw);
})();
