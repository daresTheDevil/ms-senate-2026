// Scrubbable replay of the count. Statewide numbers come from real snapshots; nothing is interpolated.
(async function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const tip = document.getElementById("tip");
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const CT_OFFSET_MS = -6 * 3600 * 1000; // CST; DST ended 01NOV2026

  // Military style in Central time: "Tuesday 03NOV2026 1936".
  function ct(ms) { return new Date(ms + CT_OFFSET_MS); }
  function stamp(ms, withDay) {
    const d = ct(ms), dd = String(d.getUTCDate()).padStart(2, "0");
    const hhmm = String(d.getUTCHours()).padStart(2, "0") + String(d.getUTCMinutes()).padStart(2, "0");
    const date = dd + MON[d.getUTCMonth()] + d.getUTCFullYear();
    return (withDay === false ? date : DAYS[d.getUTCDay()] + " " + date) + " " + hhmm;
  }
  function shortStamp(ms) {
    const d = ct(ms);
    return String(d.getUTCDate()).padStart(2, "0") + MON[d.getUTCMonth()] + " " + String(d.getUTCHours()).padStart(2, "0") + String(d.getUTCMinutes()).padStart(2, "0");
  }

  $("theme").addEventListener("click", () => window.MeridianTheme.toggle());

  async function load(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + ": HTTP " + res.status);
    return res.json();
  }
  let tl, geo, cty;
  try {
    [tl, geo, cty] = await Promise.all([load("data/timeline.json"), load("data/ms-counties.json"), load("data/counties.json")]);
  } catch (err) {
    const box = document.createElement("div");
    box.className = "mrd-callout mrd-callout--warning load-error";
    box.textContent = "Couldn't load the data (" + err.message + "). Reload the page.";
    document.querySelector(".player").replaceWith(box);
    throw err;
  }

  // Parse at the boundary.
  const snaps = tl.snapshots.map((s) => {
    if (s.colom + s.hydesmith + s.pinkins !== s.total) throw new Error("Snapshot doesn't add up: " + s.t);
    return { ms: Date.parse(s.t), total: s.total, c: s.colom, h: s.hydesmith, p: s.pinkins, lead: s.colom - s.hydesmith };
  });
  for (let i = 1; i < snaps.length; i++) if (snaps[i].ms <= snaps[i - 1].ms) throw new Error("Snapshots out of order at " + i);
  const FINAL = snaps[snaps.length - 1].total;
  const byName = {};
  cty.counties.forEach((c) => { byName[c.county] = c; });
  const events = tl.events.map((e) => {
    e.counties.forEach((c) => { if (!byName[c.county]) throw new Error("Unknown county in event: " + c.county); });
    return { ms: Date.parse(e.t), counties: e.counties, note: e.note || null };
  });

  // Piecewise time axis: election night gets 58% of the slider.
  const A0 = Date.parse("2026-11-04T01:30:00Z"), A1 = Date.parse("2026-11-04T06:15:00Z"), B1 = Date.parse("2026-11-07T00:15:00Z");
  const SPLIT = 0.58;
  const toU = (ms) => (ms <= A1 ? SPLIT * (ms - A0) / (A1 - A0) : SPLIT + (1 - SPLIT) * (ms - A1) / (B1 - A1));
  const toMs = (u) => (u <= SPLIT ? A0 + (u / SPLIT) * (A1 - A0) : A1 + ((u - SPLIT) / (1 - SPLIT)) * (B1 - A1));

  function stateAt(ms) {
    let s = null;
    for (const x of snaps) { if (x.ms <= ms) s = x; else break; }
    return s;
  }

  // Milestones worth calling out, computed from the snapshots.
  const firstHsLead = snaps.find((s) => s.lead < 0);
  const nightPeak = snaps.filter((s) => s.ms <= A1).reduce((a, s) => (s.lead < a.lead ? s : a));
  const retake = snaps.find((s, i) => i > 0 && s.lead > 0 && snaps[i - 1].lead < 0);
  const gapStart = snaps.filter((s) => s.ms <= A1).reduce((best, s, i, arr) => (i && s.ms - arr[i - 1].ms > (best ? best.gap : 0) ? { gap: s.ms - arr[i - 1].ms, from: arr[i - 1], to: s } : best), null);

  const log = [];
  log.push({ ms: snaps[0].ms, text: "First returns. " + fmt(snaps[0].total) + " votes in, Colom up " + fmt(snaps[0].lead) + "." });
  log.push({ ms: firstHsLead.ms, text: "Hyde-Smith takes the lead, up " + fmt(-firstHsLead.lead) + " with " + fmt(firstHsLead.total) + " counted." });
  log.push({ ms: gapStart.from.ms + 1, text: "No snapshots for the next two hours. When the feed comes back at " + shortStamp(gapStart.to.ms).slice(-4) + ", " + fmt(gapStart.to.total) + " votes are in." });
  log.push({ ms: nightPeak.ms, text: "Hyde-Smith's biggest lead of the night: " + fmt(-nightPeak.lead) + "." });
  log.push({ ms: retake.ms, text: "Colom goes ahead by " + fmt(retake.lead) + ". He stays ahead from here." });
  events.forEach((e) => {
    const names = e.counties.map((c) => c.county + " (" + fmt(c.votes) + ")").join(", ");
    const s = stateAt(e.ms);
    log.push({ ms: e.ms, counties: e.counties.map((c) => c.county), text: names + " reported. Colom lead now " + fmt(s.lead) + "." + (e.note ? " " + e.note : "") });
  });
  log.push({ ms: snaps[snaps.length - 1].ms + 1, text: "Last change. Colom " + fmt(snaps[snaps.length - 1].c) + ", Hyde-Smith " + fmt(snaps[snaps.length - 1].h) + ". Lead " + fmt(snaps[snaps.length - 1].lead) + "." });
  log.sort((a, b) => a.ms - b.ms);

  // --- SVG helpers
  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); for (const a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
  function text(parent, x, y, s, attrs) { const t = el("text", Object.assign({ x, y }, attrs || {}), parent); t.textContent = s; return t; }
  function hover(node, fn) {
    const show = (ev) => {
      tip.textContent = fn(); tip.style.opacity = "1";
      const r = tip.getBoundingClientRect();
      let x = ev.clientX + 12, y = ev.clientY + 12;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 12;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 12;
      tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
    };
    node.addEventListener("pointermove", show); node.addEventListener("pointerdown", show);
    node.addEventListener("pointerleave", () => { tip.style.opacity = "0"; });
  }

  // --- Map
  const mapSvg = el("svg", { viewBox: "0 0 " + geo.width + " " + geo.height, role: "img" }, $("map"));
  el("title", {}, mapSvg).textContent = "Mississippi counties, colored by final result";
  const paths = {};
  cty.counties.forEach((c) => {
    const d = geo.counties[c.fips];
    if (!d) throw new Error("No shape for " + c.county);
    const p = el("path", { d }, mapSvg);
    const m = (c.colom_2026 - c.hydesmith_2026) / c.total_2026 * 100;
    p.dataset.side = m >= 0 ? "d" : "r";
    p.dataset.strength = String(Math.min(1, 0.35 + Math.abs(m) / 60));
    hover(p, () => c.county + "\nFinal: Colom " + fmt(c.colom_2026) + ", Hyde-Smith " + fmt(c.hydesmith_2026) + "\n" + (m >= 0 ? "Colom +" : "Hyde-Smith +") + Math.abs(m).toFixed(1));
    paths[c.county] = p;
  });
  function paintMap(progress, hits) {
    const d = css("--dem"), r = css("--rep");
    Object.entries(paths).forEach(([name, p]) => {
      p.setAttribute("fill", p.dataset.side === "d" ? d : r);
      p.setAttribute("fill-opacity", (0.08 + 0.92 * progress * +p.dataset.strength).toFixed(3));
      p.classList.toggle("hit", hits.has(name));
      if (hits.has(name)) mapSvg.appendChild(p);
    });
  }

  // --- Lead charts
  function leadChart(id, from, to, yLim, ticks) {
    const box = $(id); box.textContent = "";
    const w = Math.max(280, box.clientWidth), h = 190;
    const svg = el("svg", { viewBox: "0 0 " + w + " " + h, role: "img" }, box);
    el("title", {}, svg).textContent = "Colom lead in votes over time";
    const L = 74, R = 12, T = 10, B = 26;
    const x = (ms) => L + ((ms - from) / (to - from)) * (w - L - R);
    const y = (v) => T + (1 - (v + yLim) / (2 * yLim)) * (h - T - B);
    ticks.y.forEach((v) => {
      el("line", { x1: L, x2: w - R, y1: y(v), y2: y(v), class: v === 0 ? "axis0" : "grid" }, svg);
      text(svg, L - 8, y(v) + 4, v === 0 ? "even" : (v > 0 ? "C +" : "H-S +") + fmt(Math.abs(v)), { "text-anchor": "end" });
    });
    ticks.x.forEach((ms) => text(svg, x(ms), h - 6, ticks.label(ms), { "text-anchor": "middle" }));
    const pts = snaps.filter((s) => s.ms >= from && s.ms <= to);
    // Step line: the count holds until the next snapshot lands.
    let d = "";
    pts.forEach((s, i) => { d += (i ? "H" + x(s.ms) + "V" : "M" + x(s.ms) + ",") + y(Math.max(-yLim, Math.min(yLim, s.lead))); });
    if (pts.length) d += "H" + x(to);
    const clip = "clip-" + id;
    const cp = el("clipPath", { id: clip }, el("defs", {}, svg));
    el("rect", { x: L, y: T, width: w - L - R, height: y(0) - T }, cp);
    const cp2 = el("clipPath", { id: clip + "b" }, svg.querySelector("defs"));
    el("rect", { x: L, y: y(0), width: w - L - R, height: h - B - y(0) }, cp2);
    el("path", { d, fill: "none", stroke: css("--dem"), "stroke-width": 2.25, "clip-path": "url(#" + clip + ")" }, svg);
    el("path", { d, fill: "none", stroke: css("--rep"), "stroke-width": 2.25, "clip-path": "url(#" + clip + "b)" }, svg);
    pts.forEach((s) => {
      const hit = el("circle", { cx: x(s.ms), cy: y(Math.max(-yLim, Math.min(yLim, s.lead))), r: 8, fill: "transparent" }, svg);
      hover(hit, () => stamp(s.ms) + "\n" + (s.lead >= 0 ? "Colom +" : "Hyde-Smith +") + fmt(Math.abs(s.lead)) + " with " + fmt(s.total) + " counted");
      hit.addEventListener("click", () => setU(toU(s.ms)));
    });
    const cursor = el("line", { y1: T, y2: h - B, stroke: css("--text-strong"), "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
    const dot = el("circle", { r: 4.5, fill: css("--surface-card"), "stroke-width": 2 }, svg);
    return function (ms, s) {
      const inRange = ms >= from && ms <= to;
      cursor.style.display = inRange ? "" : "none";
      dot.style.display = inRange && s ? "" : "none";
      if (!inRange) return;
      cursor.setAttribute("x1", x(ms)); cursor.setAttribute("x2", x(ms));
      if (s) { dot.setAttribute("cx", x(ms)); dot.setAttribute("cy", y(Math.max(-yLim, Math.min(yLim, s.lead)))); dot.setAttribute("stroke", s.lead >= 0 ? css("--dem") : css("--rep")); }
    };
  }
  const hourTicks = [], dayTicks = [];
  for (let hr = 2; hr <= 6; hr++) hourTicks.push(Date.parse("2026-11-04T0" + hr + ":00:00Z"));
  ["2026-11-04T18:00:00Z", "2026-11-05T18:00:00Z", "2026-11-06T18:00:00Z"].forEach((t) => dayTicks.push(Date.parse(t)));
  let drawNight, drawAfter;
  function buildCharts() {
    drawNight = leadChart("c-night", A0, A1, 25000, { y: [-25000, -12500, 0, 12500, 25000], x: hourTicks, label: (ms) => shortStamp(ms).slice(-4) });
    drawAfter = leadChart("c-after", A1, B1, 3000, { y: [-3000, 0, 3000], x: dayTicks, label: (ms) => DAYS[ct(ms).getUTCDay()].slice(0, 3) + " " + shortStamp(ms).slice(0, 5) });
  }

  // --- Slider ticks
  function buildTicks() {
    const t = $("ticks"); t.textContent = "";
    const marks = [[A0 + 30 * 60e3, "1930"], [Date.parse("2026-11-04T03:00:00Z"), "2100", false, true], [Date.parse("2026-11-04T05:00:00Z"), "2300", false, true], [A1, "0015", true], [Date.parse("2026-11-04T18:00:00Z"), "WED"], [Date.parse("2026-11-05T18:00:00Z"), "THU"], [Date.parse("2026-11-06T18:00:00Z"), "FRI"]];
    marks.forEach(([ms, label, brk, opt]) => {
      const s = document.createElement("span");
      s.style.left = (toU(ms) * 100).toFixed(2) + "%";
      s.textContent = label;
      s.className = (brk ? "brk" : "") + (opt ? " opt" : "");
      t.appendChild(s);
    });
  }

  // --- Log
  const logItems = log.map((item) => {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button";
    const t = document.createElement("span"); t.className = "t"; t.textContent = stamp(item.ms);
    const x = document.createElement("span"); x.textContent = item.text;
    b.appendChild(t); b.appendChild(x);
    b.addEventListener("click", () => { stop(); setU(toU(item.ms)); });
    li.appendChild(b); $("log-list").appendChild(li);
    return { item, li };
  });

  // --- State
  let U = 0;
  function render() {
    const ms = toMs(U), s = stateAt(ms);
    $("r-time").textContent = "";
    const full = document.createElement("span"); full.className = "t-long"; full.textContent = stamp(ms);
    const short = document.createElement("span"); short.className = "t-short"; short.textContent = DAYS[ct(ms).getUTCDay()].slice(0, 3) + " " + shortStamp(ms);
    $("r-time").append(full, short);
    if (!s) {
      ["r-c", "r-h", "r-p"].forEach((id) => { $(id).textContent = "0"; });
      ["r-cp", "r-hp", "r-pp"].forEach((id) => { $(id).textContent = ""; });
      $("r-lead").textContent = "Polls closed"; $("r-lead").className = "read__lead"; $("r-leadlabel").textContent = "Waiting on returns";
      $("r-pct").textContent = "0%"; $("r-meter").style.width = "0%";
    } else {
      $("r-c").textContent = fmt(s.c); $("r-h").textContent = fmt(s.h); $("r-p").textContent = fmt(s.p);
      $("r-cp").textContent = (s.c / s.total * 100).toFixed(1) + "%"; $("r-hp").textContent = (s.h / s.total * 100).toFixed(1) + "%"; $("r-pp").textContent = (s.p / s.total * 100).toFixed(1) + "%";
      const who = s.lead >= 0 ? "Colom" : "Hyde-Smith";
      $("r-leadlabel").textContent = who + " leads by";
      $("r-lead").textContent = fmt(Math.abs(s.lead));
      $("r-lead").className = "read__lead " + (s.lead >= 0 ? "is-d" : "is-r");
      const pct = s.total / FINAL * 100;
      $("r-pct").textContent = (pct >= 99.95 ? "100" : pct.toFixed(1)) + "%";
      $("r-meter").style.width = pct.toFixed(2) + "%";
    }
    // Counties from the most recent named update light up until the next update lands.
    const hits = new Set();
    const lastEvent = events.filter((e) => e.ms <= ms).pop();
    const nextSnap = snaps.find((x) => x.ms > (lastEvent ? lastEvent.ms : Infinity));
    if (lastEvent && (!nextSnap || ms < nextSnap.ms)) lastEvent.counties.forEach((c) => hits.add(c.county));
    paintMap(s ? s.total / FINAL : 0, hits);
    drawNight(ms, s); drawAfter(ms, s);
    let nowIdx = -1;
    logItems.forEach(({ item }, i) => { if (item.ms <= ms) nowIdx = i; });
    logItems.forEach(({ li }, i) => {
      li.className = i < nowIdx ? "is-past" : i === nowIdx ? "is-now" : "is-future";
    });
    $("scrub").value = String(Math.round(U * 1000));
    $("scrub").setAttribute("aria-valuetext", stamp(ms) + " CT");
  }
  function setU(u) { U = Math.max(0, Math.min(1, u)); render(); }

  $("scrub").addEventListener("input", (e) => { stop(); setU(+e.target.value / 1000); });
  // Arrow keys step snapshot to snapshot instead of slider ticks.
  $("scrub").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); stop();
    const ms = toMs(U);
    const target = e.key === "ArrowRight" ? snaps.find((s) => s.ms > ms + 1) : [...snaps].reverse().find((s) => s.ms < ms - 1);
    setU(target ? toU(target.ms) : e.key === "ArrowRight" ? 1 : 0);
  });

  // --- Playback: about 24 seconds end to end.
  let raf = 0, last = 0;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tick(now) {
    if (!last) last = now;
    const dt = now - last; last = now;
    if (U >= 1) { stop(); return; }
    setU(U + dt / 24000);
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (U >= 1) setU(0);
    if (reduce) { setU(1); return; }
    last = 0; raf = requestAnimationFrame(tick);
    $("play-label").textContent = "Pause"; $("play").setAttribute("aria-label", "Pause");
    $("play-icon").innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    $("play-label").textContent = U >= 1 ? "Replay" : "Play"; $("play").setAttribute("aria-label", "Play");
    $("play-icon").innerHTML = '<path d="M7 5v14l12-7z"/>';
  }
  $("play").addEventListener("click", () => (raf ? stop() : play()));

  function rebuild() { buildCharts(); buildTicks(); render(); }
  rebuild();
  let rz = 0;
  window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(rebuild); });
  document.addEventListener("meridianthemechange", rebuild);
})();
