(() => {
"use strict";
const W = 480, H = 600;
const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = s => s[0].toUpperCase() + s.slice(1);
const lc = s => s.toLowerCase();

/* ---------- noise + lighting ---------- */
function hash2(i, j, s) { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, s = 0) { let t = 0, a = .5, f = 1; for (let o = 0; o < 4; o++) { t += a * vnoise(x * f, y * f, s + o * 17); f *= 2; a *= .5; } return t / .9375; }
const n3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LD = n3(-.45, -.65, .62), HV = n3(LD[0], LD[1], LD[2] + 1);
function lightField(hf, w, h, K, y0 = 0) {
  const shade = new Float32Array(w * h), spec = new Float32Array(w * h);
  for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, xl = x > 0 ? i - 1 : i, xr = x < w - 1 ? i + 1 : i, yu = y > y0 ? i - w : i, yd = y < h - 1 ? i + w : i;
    let nx = -(hf[xr] - hf[xl]) * K, ny = -(hf[yd] - hf[yu]) * K, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    shade[i] = .32 + .78 * Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
    spec[i] = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 26) * .16;
  }
  return { shade, spec };
}
const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
const enc = c => 255 * (c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055);
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => "#" + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
function colorize(img, hex, shade, spec, alpha, y0) {
  const [r, g, b] = hex2rgb(hex).map(lin), d = img.data, w = img.width;
  for (let i = y0 * w, n = d.length / 4; i < n; i++) {
    const a = alpha ? alpha[i] : 255; if (!a) continue;
    const s = shade[i], p = spec[i], j = i * 4;
    d[j] = enc(Math.min(1, r * s + p + .012 * s)); d[j + 1] = enc(Math.min(1, g * s + p + .012 * s)); d[j + 2] = enc(Math.min(1, b * s + p + .012 * s)); d[j + 3] = a;
  }
  return img;
}

/* ---------- photo-style props ---------- */
let noiseC = null;
function noise() { if (noiseC) return noiseC; noiseC = document.createElement("canvas"); noiseC.width = noiseC.height = 200; const c = noiseC.getContext("2d"), im = c.createImageData(200, 200); for (let i = 0; i < im.data.length; i += 4) { const v = 70 + Math.random() * 120; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } c.putImageData(im, 0, 0); return noiseC; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); }
function toastPath(s) { const p = new Path2D(); p.moveTo(28 * s, 78 * s); p.bezierCurveTo(4 * s, 46 * s, 34 * s, 6 * s, 72 * s, 16 * s); p.bezierCurveTo(86 * s, 2 * s, 118 * s, 2 * s, 132 * s, 16 * s); p.bezierCurveTo(168 * s, 6 * s, 198 * s, 46 * s, 172 * s, 78 * s); p.lineTo(168 * s, 192 * s); p.quadraticCurveTo(168 * s, 204 * s, 156 * s, 204 * s); p.lineTo(44 * s, 204 * s); p.quadraticCurveTo(32 * s, 204 * s, 32 * s, 192 * s); p.closePath(); return p; }
function drawToast(cv, butter, seed) {
  const c = cv.getContext("2d"), s = 1.9, R = rnd(seed); c.clearRect(0, 0, cv.width, cv.height); c.save(); c.translate(14, 10);
  const outer = toastPath(s), inner = new Path2D(); inner.addPath(outer, new DOMMatrix().translate(100 * s * .12, 112 * s * .12).scale(.88));
  c.save(); c.translate(3, 9); c.fillStyle = "#5e300d"; c.fill(outer); c.restore();
  let g = c.createLinearGradient(0, 0, 380, 400); g.addColorStop(0, "#c27a33"); g.addColorStop(.5, "#9c5520"); g.addColorStop(1, "#7a3e12"); c.fillStyle = g; c.fill(outer);
  c.save(); c.clip(outer); c.globalCompositeOperation = "overlay"; c.globalAlpha = .55; c.fillStyle = c.createPattern(noise(), "repeat"); c.fillRect(0, 0, 420, 450); c.restore();
  c.save(); c.clip(inner);
  g = c.createRadialGradient(190, 215, 20, 190, 220, 230); g.addColorStop(0, "#f6d9a2"); g.addColorStop(.55, "#e9b366"); g.addColorStop(1, "#c98236"); c.fillStyle = g; c.fillRect(0, 0, 420, 450);
  for (let k = 0; k < 16; k++) { const x = 60 + R() * 270, y = 60 + R() * 300, r = 30 + R() * 70, bg = c.createRadialGradient(x, y, 0, x, y, r); bg.addColorStop(0, `rgba(150,72,14,${.12 + R() * .16})`); bg.addColorStop(1, "rgba(150,72,14,0)"); c.fillStyle = bg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let k = 0; k < 2200; k++) { const x = 30 + R() * 330, y = 30 + R() * 360, rx = .5 + R() * 2.6; c.fillStyle = `rgba(110,52,8,${.12 + R() * .3})`; c.beginPath(); c.ellipse(x, y, rx, rx * (.45 + R() * .5), R() * 3, 0, 7); c.fill(); if (R() < .35) { c.fillStyle = "rgba(255,238,200,.35)"; c.beginPath(); c.ellipse(x - .8, y - .8, rx * .6, rx * .35, 0, 0, 7); c.fill(); } }
  c.globalCompositeOperation = "overlay"; c.globalAlpha = .35; c.fillStyle = c.createPattern(noise(), "repeat"); c.fillRect(0, 0, 420, 450);
  c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.lineWidth = 30; c.strokeStyle = "rgba(105,48,8,.32)"; c.filter = "blur(9px)"; c.stroke(inner); c.filter = "none"; c.restore();
  c.lineWidth = 2.5; c.strokeStyle = "rgba(255,215,160,.35)"; c.stroke(outer);
  if (butter) {
    c.save(); const p = new Path2D(), cx = 190, cy = 205; for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, r = 62 + Math.sin(a * 3 + 1) * 10 + R() * 12, x = cx + Math.cos(a) * r * 1.15, y = cy + Math.sin(a) * r * .85; i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath();
    c.fillStyle = "rgba(250,212,88,.55)"; c.filter = "blur(1.5px)"; c.fill(p); c.filter = "none"; const gl = c.createRadialGradient(cx - 30, cy - 25, 4, cx, cy, 80); gl.addColorStop(0, "rgba(255,250,215,.75)"); gl.addColorStop(1, "rgba(255,240,170,0)"); c.fillStyle = gl; c.fill(p);
    c.translate(cx, cy - 6); c.rotate(-.22); c.shadowColor = "rgba(120,80,0,.35)"; c.shadowBlur = 10; c.shadowOffsetY = 5; c.fillStyle = "#e3bd45"; rr(c, -52, -26, 104, 66, 14); c.fill(); c.shadowColor = "transparent";
    const tg = c.createLinearGradient(-50, -36, 50, 30); tg.addColorStop(0, "#fff7c8"); tg.addColorStop(.6, "#fbe17a"); tg.addColorStop(1, "#f1cd52"); c.fillStyle = tg; rr(c, -52, -36, 104, 62, 15); c.fill();
    c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 4; c.lineCap = "round"; c.beginPath(); c.moveTo(-36, -24); c.quadraticCurveTo(-5, -32, 28, -26); c.stroke(); c.restore();
  }
  c.restore();
}
function drawBuds(cv) {
  const c = cv.getContext("2d"), sx = cv.width / 420, sy = cv.height / 260; c.clearRect(0, 0, cv.width, cv.height); c.save(); c.scale(sx, sy);
  const paths = ["M6 30 C80 0 140 110 205 92 C290 66 250 -2 330 30 C398 58 362 142 300 150 C250 156 236 118 262 104", "M205 92 C190 140 170 170 160 196", "M205 92 C236 140 250 170 252 196"];
  for (const d of paths) { const p = new Path2D(d); c.strokeStyle = "#d4d4d8"; c.lineWidth = 4.2; c.lineCap = "round"; c.stroke(p); c.strokeStyle = "#f6f6f8"; c.lineWidth = 3; c.stroke(p); c.save(); c.translate(-.6, -.7); c.strokeStyle = "#fff"; c.lineWidth = 1; c.stroke(p); c.restore(); }
  for (const [x, y, a] of [[160, 196, .18], [252, 196, -.2]]) {
    c.save(); c.translate(x, y); c.rotate(a);
    let g = c.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, "#e2e2e6"); g.addColorStop(.4, "#fff"); g.addColorStop(1, "#c9c9ce"); c.fillStyle = g; rr(c, -6, -2, 12, 32, 6); c.fill();
    g = c.createRadialGradient(-6, 30, 2, 0, 38, 20); g.addColorStop(0, "#fff"); g.addColorStop(.6, "#eeeef1"); g.addColorStop(1, "#c4c4ca"); c.fillStyle = g; c.beginPath(); c.ellipse(0, 38, 17, 15, 0, 0, 7); c.fill();
    c.fillStyle = "rgba(120,120,128,.5)"; c.beginPath(); c.ellipse(3, 43, 7, 4.5, .3, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.ellipse(-7, 31, 5, 2.5, -.6, 0, 7); c.fill(); c.restore();
  }
  c.restore();
}
const fsCache = {};
function fabricShade(w, h, seed) { const k = w + "x" + h + ":" + seed; if (fsCache[k]) return fsCache[k]; const hf = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hf[y * w + x] = Math.sin((x * .8 + y * .55) / 15 + fbm(x / 55, y / 55, seed) * 3.2) + .55 * Math.sin((x * .2 - y) / 23 + fbm(x / 40, y / 40, seed + 9) * 2) + .25 * fbm(x / 10, y / 10, seed + 4); return fsCache[k] = lightField(hf, w, h, 2.4); }
const swCache = new Map();
function fabricSwatch(cv, hex, seed = 1) {
  const w = cv.width, h = cv.height, key = hex + w + "x" + h + seed; let tile = swCache.get(key);
  if (!tile) {
    const L = fabricShade(w, h, seed), t = document.createElement("canvas"); t.width = w; t.height = h; const tc = t.getContext("2d"); tc.putImageData(colorize(tc.createImageData(w, h), hex, L.shade, L.spec, null, 0), 0, 0);
    const m = document.createElement("canvas"); m.width = w; m.height = h; const mc = m.getContext("2d"), p = new Path2D(), ins = 12, th = 7; let f = true; const pt = (x, y) => { f ? p.moveTo(x, y) : p.lineTo(x, y); f = false; };
    for (let x = ins, k = 0; x <= w - ins; x += th, k++) pt(x, ins + (k % 2 ? 5 : 0)); for (let y = ins, k = 0; y <= h - ins; y += th, k++) pt(w - ins - (k % 2 ? 5 : 0), y);
    for (let x = w - ins, k = 0; x >= ins; x -= th, k++) pt(x, h - ins - (k % 2 ? 5 : 0)); for (let y = h - ins, k = 0; y >= ins; y -= th, k++) pt(ins + (k % 2 ? 5 : 0), y);
    p.closePath(); mc.fill(p); mc.globalCompositeOperation = "source-in"; mc.drawImage(t, 0, 0); tile = m; swCache.set(key, tile);
  }
  const c = cv.getContext("2d"); c.clearRect(0, 0, w, h); c.save(); c.shadowColor = "rgba(60,40,20,.3)"; c.shadowBlur = 8; c.shadowOffsetX = 3; c.shadowOffsetY = 5; c.drawImage(tile, 0, 0, w - 8, h - 8, 1, 1, w - 8, h - 8); c.restore();
}
function undeveloped(cv) {
  const c = cv.getContext("2d"), w = cv.width, h = cv.height, ink = "#939aa1";
  c.fillStyle = "#f0f2f4"; c.fillRect(0, 0, w, h);
  const iw = Math.min(w * .5, h * .5 * 1.45), ih = iw / 1.45, x = (w - iw) / 2, y = (h - ih) / 2 - h * .04, lw = Math.max(1.5, iw * .035), r = iw * .07;
  c.lineWidth = lw; c.strokeStyle = ink; c.fillStyle = ink; c.lineJoin = "round";
  rr(c, x, y, iw, ih, r); c.stroke();
  c.save(); rr(c, x + lw / 2, y + lw / 2, iw - lw, ih - lw, r * .8); c.clip();
  c.beginPath(); c.moveTo(x + iw * .02, y + ih); c.lineTo(x + iw * .38, y + ih * .32); c.lineTo(x + iw * .66, y + ih * .74); c.lineTo(x + iw * .79, y + ih * .6); c.lineTo(x + iw * 1.02, y + ih); c.closePath(); c.fill();
  c.restore();
  c.beginPath(); c.arc(x + iw * .74, y + ih * .3, iw * .09, 0, 7); c.fill();
}

/* ---------- colour science ---------- */
function rgb2lab([r, g, b]) { const R = lin(r), G = lin(g), B = lin(b); let X = (R * .4124 + G * .3576 + B * .1805) / .95047, Y = R * .2126 + G * .7152 + B * .0722, Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883; const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; X = f(X); Y = f(Y); Z = f(Z); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; }
const lum = (r, g, b) => (.2126 * r + .7152 * g + .0722 * b) / 255;
const COLORS = [
  ["Coral", "#FF7F61", .8, .35, .85], ["Peach", "#FFB38A", .85, .15, .55], ["Buttercup", "#F7C948", .9, .2, .8], ["Warm aqua", "#2EC4B6", .3, .4, .8], ["Leaf green", "#6DBE45", .7, .4, .8],
  ["Ivory", "#F3EBD8", .6, .05, .15], ["Powder blue", "#A9C6E8", -.6, .15, .35], ["Lavender", "#B9A7D9", -.6, .2, .35], ["Dusty rose", "#C99AA0", -.3, .35, .25], ["Ice pink", "#F4D6E4", -.7, .05, .3],
  ["Slate", "#6E7F91", -.5, .55, .2], ["Sage", "#9CAF88", .2, .35, .2], ["Mustard", "#D4A017", .9, .45, .6], ["Terracotta", "#C0603F", .8, .55, .5], ["Olive", "#6B6B2E", .6, .7, .35],
  ["Camel", "#C19A6B", .7, .4, .3], ["Chocolate", "#5C3A21", .6, .9, .3], ["Deep teal", "#14535C", .1, .8, .5], ["Jet black", "#111111", -.4, 1, .9], ["Crisp white", "#FFFFFF", -.5, 0, .85],
  ["Royal blue", "#2142B5", -.8, .65, .95], ["Emerald", "#0B8F5A", -.3, .6, .9], ["Ruby", "#A3123A", -.6, .65, .9], ["Fuchsia", "#D61F8C", -.7, .45, .95], ["Navy", "#1D2B53", -.5, .9, .45]
].map(([name, hex, t, v, c]) => ({ name, hex, t, v, c, lab: rgb2lab(hex2rgb(hex)) }));
function attrsFromHex(hex) { const lab = rgb2lab(hex2rgb(hex)), C = Math.hypot(lab[1], lab[2]), h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI; return { name: "Your " + hex.toUpperCase(), hex, lab, t: Math.cos((h - 75) * Math.PI / 180) * Math.min(1, C / 25), v: clamp(1 - lab[0] / 100), c: clamp(C / 70) }; }

/* ---------- shade finder: hundreds of hex shades across colour families ---------- */
function lab2hex(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, fi = t => t ** 3 > .008856 ? t ** 3 : (t - 16 / 116) / 7.787;
  const X = fi(fx) * .95047, Y = fi(fy), Z = fi(fz) * 1.08883;
  const rgb = [3.2406 * X - 1.5372 * Y - .4986 * Z, -.9689 * X + 1.8758 * Y + .0415 * Z, .0557 * X - .204 * Y + 1.057 * Z];
  if (rgb.some(v => v < -.002 || v > 1.002)) return null;
  return rgb2hex(rgb.map(v => enc(clamp(v)))).toUpperCase();
}
const FAMILIES = [
  ["Reds", "red", [20, 30, 38], [22, 32, 42, 52, 62], [35, 50, 65, 80]],
  ["Oranges", "orange", [48, 58], [35, 45, 55, 65, 75, 85], [25, 40, 55, 70]],
  ["Yellows", "yellow", [78, 88, 96], [55, 65, 75, 85, 92], [25, 40, 55, 75]],
  ["Greens", "green", [115, 135, 150], [25, 35, 45, 55, 65, 75, 85], [18, 30, 45, 60]],
  ["Teals", "teal", [185, 200], [25, 35, 45, 55, 65, 75, 85], [15, 25, 35, 45]],
  ["Blues", "blue", [240, 255, 275], [20, 30, 40, 50, 60, 70, 80, 90], [15, 30, 45, 60]],
  ["Purples", "purple", [295, 310], [22, 32, 42, 52, 62, 72, 84], [18, 32, 46, 60]],
  ["Pinks", "pink", [340, 352, 5], [40, 50, 60, 70, 80, 90], [15, 28, 42, 58]],
  ["Browns", "brown", [55, 65, 72], [20, 28, 36, 44, 52, 62], [10, 18, 28, 38]],
  ["Neutrals", "neutral", [75, 260], [10, 22, 36, 50, 64, 78, 90, 97], [0, 3, 7]]
].map(([name, word, hues, Ls, Cs]) => {
  const seen = new Set(), shades = [];
  for (const h of hues) for (const L of Ls) for (const C of Cs) {
    const hex = lab2hex(L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)); if (!hex || seen.has(hex)) continue; seen.add(hex);
    const a = attrsFromHex(hex); a.name = hex; a.fam = name; shades.push(a);
  }
  return { name, word, shades };
});
const SHADE_COUNT = FAMILIES.reduce((n, f) => n + f.shades.length, 0);
function shadeReport(P) {
  return FAMILIES.map(f => {
    const scored = f.shades.map(s => judge(s, P)).sort((a, b) => b.score - a.score), best = scored[0], worst = scored[scored.length - 1];
    const Ls = scored.map(s => s.lab[0]).sort((a, b) => a - b), Cs = scored.map(s => Math.hypot(s.lab[1], s.lab[2])).sort((a, b) => a - b);
    const medL = Ls[Ls.length >> 1], medC = Cs[Cs.length >> 1], bC = Math.hypot(best.lab[1], best.lab[2]), bh = (Math.atan2(best.lab[2], best.lab[1]) * 180 / Math.PI + 360) % 360;
    const dirs = [];
    dirs.push(best.lab[0] < medL - 8 ? "deeper than most" : best.lab[0] > medL + 8 ? "lighter than most" : "mid-depth");
    if (f.word !== "neutral") { if (bC < medC - 8) dirs.push("softer and slightly greyed"); else if (bC > medC + 8) dirs.push("clear and saturated"); }
    if (f.word === "neutral") dirs.push(best.t > .05 ? "warm (creamy, beige-leaning)" : best.t < -.05 ? "cool (blue-grey-leaning)" : "a true neutral");
    else if (["red", "pink", "green", "blue", "purple"].includes(f.word)) dirs.push(Math.cos((bh - 75) * Math.PI / 180) > .1 ? "on the warm, golden side" : "on the cool, blue side");
    const byL = [...scored].sort((a, b) => a.lab[0] - b.lab[0]), strip = [];
    for (let i = 0; i < 9; i++) { const s = byL[Math.round(i * (byL.length - 1) / 8)]; if (!strip.includes(s)) strip.push(s); }
    [best, worst].forEach(x => { if (strip.includes(x)) return; let k = 0, d = 1e9; strip.forEach((s, i) => { const dd = Math.abs(s.lab[0] - x.lab[0]); if (dd < d && s !== best && s !== worst) { d = dd; k = i; } }); strip[k] = x; });
    strip.sort((a, b) => a.lab[0] - b.lab[0]);
    return { ...f, best, worst, dirs, strip, avg: scored.slice(0, 5).reduce((n, s) => n + s.score, 0) / 5 };
  });
}

/* ---------- state ---------- */
const src = document.createElement("canvas"); src.width = W; src.height = H; const sctx = src.getContext("2d", { willReadFrequently: true });
let srcData = null;
const MK = { forehead: ["forehead", .5, .27], cheek: ["cheek", .37, .5], eye: ["iris", .42, .38], hair: ["hair", .5, .075], chin: ["chin", .5, .69], white: ["white paper", .86, .55] };
const st = { m: {}, useWhite: false, has: false, P: null, R: [], sel: null, light: null, runId: 0, tested: false, view: "light" };
const resetMarkers = () => { for (const k in MK) st.m[k] = { x: MK[k][1], y: MK[k][2] }; };
resetMarkers();

/* ---------- drape renderer ---------- */
let dmap = null; const dCache = new Map();
function capePath(cx, cy) { const p = new Path2D(), y1 = cy + .06 * H, dip = cy + .105 * H, side = cy + .15 * H; p.moveTo(0, H); p.lineTo(0, side); p.quadraticCurveTo(W * .12, cy + .078 * H, cx - .15 * W, y1); p.quadraticCurveTo(cx, dip + .012 * H, cx + .15 * W, y1); p.quadraticCurveTo(W * .88, cy + .078 * H, W, side); p.lineTo(W, H); p.closePath(); return p; }
function buildDrapeMap() {
  const cx = st.m.chin.x * W, cy = Math.min(st.m.chin.y, .86) * H, path = capePath(cx, cy);
  const mc = document.createElement("canvas"); mc.width = W; mc.height = H; const m = mc.getContext("2d"); m.fill(path);
  const md = m.getImageData(0, 0, W, H).data, alpha = new Uint8ClampedArray(W * H); for (let i = 0; i < alpha.length; i++) alpha[i] = md[i * 4 + 3];
  const top = Math.max(0, Math.floor(cy + .05 * H) - 2), hf = new Float32Array(W * H), oy = cy - 30;
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - cx, dy = y - oy, th = Math.atan2(dx, dy), r = Math.hypot(dx, dy), wob = fbm(x / 80, y / 80, 3) * 1.8; hf[y * W + x] = Math.sin(th * 11 + wob) * clamp((r - 60) / 140) + .42 * Math.sin(th * 25 + wob * 1.6 + 2) * clamp((r - 90) / 180) + .5 * fbm(x / 34, y / 34, 9); }
  const L = lightField(hf, W, H, 3.2, top);
  for (let x = 0; x < W; x++) { let first = -1; for (let y = top; y < H; y++) { const i = y * W + x; if (!alpha[i]) continue; if (first < 0) first = y; const rel = Math.abs(x - cx) / (W * .5), k = y - first; let s = L.shade[i] * (1 - .32 * rel * rel) * (1 - .22 * clamp((y - top) / (H - top))); if (k < 2) s *= 1.12; else if (k < 6) s *= .72; else if (k < 9) s *= .9; L.shade[i] = s; } }
  dmap = { shade: L.shade, spec: L.spec, alpha, top, cx, cy, path }; dCache.clear();
}
function drapeComposite(hex) {
  if (!hex) return src; let cv = dCache.get(hex); if (cv) return cv;
  cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d"); c.drawImage(src, 0, 0);
  c.save(); c.beginPath(); c.ellipse(dmap.cx, dmap.cy - .03 * H, .21 * W, .09 * H, 0, 0, 7); c.clip(); c.globalCompositeOperation = "soft-light";
  const rg = c.createRadialGradient(dmap.cx, dmap.cy + .02 * H, 5, dmap.cx, dmap.cy, .2 * W), [r, g, b] = hex2rgb(hex); rg.addColorStop(0, `rgba(${r},${g},${b},.55)`); rg.addColorStop(1, `rgba(${r},${g},${b},0)`); c.fillStyle = rg; c.fillRect(0, 0, W, H); c.restore();
  c.save(); c.shadowColor = "rgba(0,0,0,.42)"; c.shadowBlur = 18; c.shadowOffsetY = -5; c.fillStyle = "#000"; c.fill(dmap.path); c.restore();
  const lay = document.createElement("canvas"); lay.width = W; lay.height = H; const l2 = lay.getContext("2d"); l2.putImageData(colorize(l2.createImageData(W, H), hex, dmap.shade, dmap.spec, dmap.alpha, dmap.top), 0, 0); c.drawImage(lay, 0, 0);
  dCache.set(hex, cv); return cv;
}
function paint(cv, hex) { const c = cv.getContext("2d"); if (!st.has) return undeveloped(cv, cv.width + (hex ? hex.length : 0)); c.drawImage(drapeComposite(hex), 0, 0, cv.width, cv.height); }
const bareCache = new Map();
function paintBareDrape(cv, hex) {
  undeveloped(cv, 3); const c = cv.getContext("2d");
  let lay = bareCache.get(hex);
  if (!lay) { lay = document.createElement("canvas"); lay.width = W; lay.height = H; const l2 = lay.getContext("2d"); l2.putImageData(colorize(l2.createImageData(W, H), hex, dmap.shade, dmap.spec, dmap.alpha, dmap.top), 0, 0); bareCache.set(hex, lay); }
  c.drawImage(lay, 0, 0, cv.width, cv.height);
}

/* ---------- light check ---------- */
const OV = { cx: .5, cy: .42, rx: .26, ry: .27 };
function computeLight(d, w, h) {
  let sy = 0, n = 0, clip = 0, ly = 0, ln = 0, ry = 0, rn = 0, fr = 0, fb = 0, fn = 0; const step = Math.max(1, Math.round(w / 120));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; fr += r; fb += b; fn++; const dx = (x / w - OV.cx) / OV.rx, dy = (y / h - OV.cy) / OV.ry; if (dx * dx + dy * dy > .7) continue; const Y = lum(r, g, b); sy += Y; n++; if (r > 248 || g > 248 || b > 248) clip++; if (x / w < OV.cx - .05) { ly += Y; ln++; } else if (x / w > OV.cx + .05) { ry += Y; rn++; } }
  const Y = n ? sy / n : 0, cl = n ? clip / n : 0, L = ln ? ly / ln : 0, R = rn ? ry / rn : 0, un = Math.abs(L - R) / Math.max(.05, L, R);
  let rb = (fr / fn) / Math.max(1, fb / fn), wb = false; if (st.useWhite && srcData && d === srcData.data) { const wr = rawSample("white"); rb = wr[0] / Math.max(1, wr[2]); wb = true; }
  const lim = wb ? [1.15, 1.05, .9, .95] : [1.6, 1.35, .85, .95];
  const items = [
    ["Brightness", Y < .22 || Y > .84 ? "bad" : Y < .32 ? "warn" : "ok", Y < .22 ? "too dark" : Y < .32 ? "dim" : Y > .84 ? "blown out" : "bright", Y < .32 ? "Move closer to a window." : "Step back from the light, flash off."],
    ["Highlights", cl > .1 ? "bad" : cl > .035 ? "warn" : "ok", cl > .1 ? "shiny" : cl > .035 ? "some shine" : "clean", "Blot shine and avoid direct sun."],
    ["Evenness", un > .28 ? "bad" : un > .15 ? "warn" : "ok", un > .28 ? "half shadow" : un > .15 ? "slightly off" : "even", "Turn to face the window straight on."],
    ["Light colour", rb > lim[0] || rb < lim[2] ? (wb ? "warn" : "bad") : rb > lim[1] || rb < lim[3] ? "warn" : "ok", rb > lim[1] ? "yellow lamp" : rb < lim[3] ? "blue shade" : wb ? "corrected" : "daylight", "Switch lamps off and use daylight."]
  ];
  return { items, ok: !items.some(i => i[1] === "bad"), tips: items.filter(i => i[1] !== "ok").map(i => i[3]) };
}
function renderTicket() {
  const L = st.light, mark = s => s === "ok" ? "✓" : s === "warn" ? "~" : "✗";
  $("ticket").innerHTML = L ? `<div class="tin">${L.items.map(([k, s, v]) => `<div><small>${k}</small><span class="${s}">${mark(s)} ${v}</span></div>`).join("")}<div class="single"><span>${L.ok ? "Good to go" : "Retake"}</span><span>SINGLE</span></div></div><div class="foot">Light Ticket</div>`
    : `<div class="tin"><div><small>Brightness</small>—</div><div><small>Highlights</small>—</div><div><small>Evenness</small>—</div><div><small>Light colour</small>—</div><div class="single"><span>Waiting</span><span>SINGLE</span></div></div><div class="foot">Light Ticket</div>`;
  if (!L) return;
  const n = $("lightNote");
  n.className = "hand sm" + (L.ok ? "" : " bad");
  n.textContent = L.ok && !L.tips.length ? "Lovely light. Window-facing, no filters. Check the dots, then drape." : (L.ok ? "Good enough. " : "Retake this one. ") + L.tips.join(" ");
  $("toDrape").hidden = !L.ok; $("anyway").hidden = L.ok;
}

/* ---------- camera + files ---------- */
let stream = null, camTimer = null;
const video = $("video"), probe = document.createElement("canvas"); probe.width = 120; probe.height = 150; const pctx = probe.getContext("2d", { willReadFrequently: true });
function coverDraw(ctx, img, iw, ih, w, h, mirror) { const t = w / h; let sw = iw, sh = ih, sx = 0, sy = 0; if (iw / ih > t) { sw = ih * t; sx = (iw - sw) / 2; } else { sh = iw / t; sy = (ih - sh) / 2; } ctx.save(); if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); } ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); ctx.restore(); }
const menu = $("menu");
$("cta").onclick = () => { menu.hidden = !menu.hidden; };
$("undev").onclick = () => { setView("light"); menu.hidden = false; };
document.querySelectorAll("[data-open-menu]").forEach(b => b.onclick = () => { setView("light"); menu.hidden = false; });
document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest("#menu,#cta,#undev,[data-open-menu]")) menu.hidden = true; });
$("optLive").onclick = async () => {
  menu.hidden = true; setView("light");
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw 0;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1350 } }, audio: false });
    video.srcObject = stream; await video.play(); $("camBlocked").hidden = true; video.hidden = false; $("mirror").hidden = true; $("undev").hidden = true; $("snapBtn").hidden = false;
    document.querySelectorAll(".mk").forEach(m => m.hidden = true);
    camTimer = setInterval(() => { if (!video.videoWidth) return; coverDraw(pctx, video, video.videoWidth, video.videoHeight, 120, 150); const L = computeLight(pctx.getImageData(0, 0, 120, 150).data, 120, 150); $("mirrorCap").textContent = L.ok && !L.tips.length ? "light: lovely ✓ snap when ready" : (L.ok ? "light: okay. " : "light: not yet. ") + L.tips[0]; }, 400);
  } catch (e) { stream = null; $("mirrorCap").textContent = "webcam blocked in this preview"; $("camBlocked").hidden = false; }
};
function stopCam() { clearInterval(camTimer); stream?.getTracks().forEach(t => t.stop()); stream = null; video.hidden = true; $("mirror").hidden = false; $("snapBtn").hidden = true; }
$("snapBtn").onclick = () => { setSource(video, video.videoWidth, video.videoHeight, true); stopCam(); };
function loadFile(f) { if (!f) return; menu.hidden = true; if (stream) stopCam(); const fr = new FileReader(); fr.onload = () => { const img = new Image(); img.onload = () => setSource(img, img.naturalWidth, img.naturalHeight, false); img.onerror = () => { $("mirrorCap").textContent = "that file isn't a readable image. try a JPG or PNG"; }; img.src = fr.result; }; fr.readAsDataURL(f); }
$("takeInput").onchange = e => { loadFile(e.target.files[0]); e.target.value = ""; };
$("uploadInput").onchange = e => { loadFile(e.target.files[0]); e.target.value = ""; };

function setSource(img, iw, ih, mirror) {
  sctx.clearRect(0, 0, W, H); coverDraw(sctx, img, iw, ih, W, H, mirror); srcData = sctx.getImageData(0, 0, W, H);
  lab.hexes = []; st.has = true; st.tested = false; st.sel = null; st.runId++; st.running = false; resetMarkers();
  $("undev").hidden = true; $("cta").textContent = "Retake"; $("mirrorCap").textContent = "your photo"; $("dotNote").hidden = false; $("whiteWrap").hidden = false;
  $("mirror").getContext("2d").drawImage(src, 0, 0);
  st.light = computeLight(srcData.data, W, H);
  buildMarkers(); buildDrapeMap(); recompute(); renderSheet(); renderTicket(); renderFilm();
  setView("light");
}

/* ---------- sampling + dots ---------- */
function rawSample(key) {
  const m = st.m[key], cx = Math.round(m.x * W), cy = Math.round(m.y * H), rad = key === "eye" ? 3 : 6, px = [], d = srcData.data;
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = (y * W + x) * 4; px.push([d[i], d[i + 1], d[i + 2], lum(d[i], d[i + 1], d[i + 2])]); }
  if (!px.length) return [128, 128, 128]; px.sort((a, b) => a[3] - b[3]);
  const [lo, hi] = key === "eye" ? [.4, .85] : key === "white" ? [.5, .95] : [.2, .8], a = Math.floor(px.length * lo), sl = px.slice(a, Math.max(a + 1, Math.ceil(px.length * hi)));
  return [0, 1, 2].map(c => sl.reduce((s, p) => s + p[c], 0) / sl.length);
}
function gains() { if (!st.useWhite) return [1, 1, 1]; const w = rawSample("white"), m = (w[0] + w[1] + w[2]) / 3; return m < 60 ? [1, 1, 1] : w.map(v => clamp(m / Math.max(1, v), .6, 1.6)); }
const sample = key => { const g = gains(); return rawSample(key).map((v, i) => clamp(v * g[i], 0, 255)); };
function buildMarkers() {
  const sg = $("stage"); sg.querySelectorAll(".mk").forEach(e => e.remove());
  for (const key in MK) {
    const el = document.createElement("button"); el.type = "button"; el.className = "mk"; el.dataset.key = key; el.setAttribute("aria-label", `${MK[key][0]} dot. Arrow keys move it`); el.innerHTML = `<span>${MK[key][0]}</span>`; el.hidden = key === "white" && !st.useWhite; sg.appendChild(el);
    el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); el.dataset.drag = 1; e.preventDefault(); });
    el.addEventListener("pointermove", e => { if (!el.dataset.drag) return; const r = sg.getBoundingClientRect(); st.m[key] = { x: clamp((e.clientX - r.left) / r.width, .01, .99), y: clamp((e.clientY - r.top) / r.height, .01, .99) }; place(el); schedule(); });
    const end = () => { if (!el.dataset.drag) return; delete el.dataset.drag; if (key === "chin") { buildDrapeMap(); renderSheet(); recompute(); } };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", e => { const d = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[e.key]; if (!d) return; e.preventDefault(); const m = st.m[key]; st.m[key] = { x: clamp(m.x + d[0], .01, .99), y: clamp(m.y + d[1], .01, .99) }; place(el); if (key === "chin") { buildDrapeMap(); renderSheet(); } schedule(); });
    place(el);
  }
}
function place(el) { const k = el.dataset.key, m = st.m[k]; el.style.left = m.x * 100 + "%"; el.style.top = m.y * 100 + "%"; el.style.background = k === "chin" ? "rgba(255,255,255,.35)" : rgb2hex(rawSample(k)); el.classList.toggle("flip", m.x > .62); }
$("whiteToggle").onchange = e => { st.useWhite = e.target.checked; const w = document.querySelector('.mk[data-key="white"]'); if (w) w.hidden = !st.useWhite; st.light = computeLight(srcData.data, W, H); renderTicket(); recompute(); };
let raf = false; function schedule() { if (raf) return; raf = true; requestAnimationFrame(() => { raf = false; if (st.useWhite) { st.light = computeLight(srcData.data, W, H); renderTicket(); } recompute(); renderFilm(); }); }
$("toDrape").onclick = () => setView("drape"); $("anyway").onclick = () => setView("drape");

/* ---------- profile + scoring ---------- */
const SEASONS = {
  "Light Spring": ["light, warm and clear", "Warm-leaning but delicate. Clear, light, warm colours like peach, warm aqua and buttercup make you look rested; black and deep brown sit on you like a weight."],
  "Warm Spring": ["warm and bright", "Golden through and through, with some sparkle. Coral, marigold, leaf green and warm turquoise light you up; icy blue-based pastels turn you sallow."],
  "Bright Spring": ["clear, bright and warm-leaning", "Warm-leaning with clear eyes and real contrast. Saturated warm brights suit you; dusty, greyed colours make you look tired."],
  "Light Summer": ["light, cool and soft", "Cool, light and low contrast. Powder blue, lavender and rose blend beautifully; black and heavy darks overpower your face."],
  "Cool Summer": ["cool and gentle", "Rosy and blue-leaning at medium depth. Soft blues, raspberry and slate work; orange and gold fight the pink in your skin."],
  "Soft Summer": ["soft, dusty and cool", "Muted, cool-neutral, gentle contrast. Dusty rose, grey-blue and soft denim look expensive on you; neon and stark white are too sharp."],
  "Soft Autumn": ["soft, warm and muted", "Warm-neutral, muted and gentle. Camel, sage and soft teal suit you; jewel brights arrive before you do."],
  "Warm Autumn": ["rich, warm and a little muted", "Golden and rich. Mustard, terracotta, olive and rust echo your undertone; icy pastels and fuchsia drain colour from your face."],
  "Deep Autumn": ["deep, warm and rich", "Warm and dark with real depth. Chocolate, deep teal, tomato red and forest green hold their own next to you; pastels wash you out."],
  "Deep Winter": ["deep, cool and strong", "Dark, cool-neutral, strong contrast. Black, ruby, emerald and navy look natural; muted camels and khakis look muddy."],
  "Cool Winter": ["icy, cool and crisp", "Blue-based and high contrast. Royal blue, fuchsia, pure white and black are your friends; warm earth tones turn you sallow."],
  "Bright Winter": ["vivid, cool and high-contrast", "Cool-leaning, very clear, high contrast. Electric blue, crisp white and hot pink suit you; soft, dusty colours flatten your features."]
};
function computeProfile() {
  const a = sample("cheek"), b = sample("forehead"), skinRgb = [0, 1, 2].map(i => (a[i] + b[i]) / 2), skin = rgb2lab(skinRgb), hair = rgb2lab(sample("hair")), eye = rgb2lab(sample("eye"));
  const hue = Math.atan2(skin[2], skin[1]) * 180 / Math.PI, eyeC = Math.hypot(eye[1], eye[2]), ita = Math.atan((skin[0] - 50) / Math.max(1, skin[2])) * 180 / Math.PI;
  const T = clamp((hue - 57) / 8, -1, 1), d = clamp((72 - (.55 * skin[0] + .45 * hair[0])) / 45), k = clamp(Math.max(Math.abs(skin[0] - hair[0]), Math.abs(skin[0] - eye[0]) * .8) / 55), c = clamp(.6 * k + .4 * clamp((eyeC - 8) / 25));
  const fam = { Spring: (1 - d) + c + T, Summer: (1 - d) + (1 - c) - T, Autumn: d + (1 - c) + T, Winter: d + c - T }, family = Object.entries(fam).sort((x, y) => y[1] - x[1])[0][0];
  const dom = [["temp", Math.abs(T)], ["depth", Math.abs(d - .5) * 2], ["clarity", Math.abs(c - .5) * 2]].sort((x, y) => y[1] - x[1])[0][0];
  const map = { Spring: { temp: "Warm Spring", depth: d < .5 ? "Light Spring" : "Bright Spring", clarity: c > .5 ? "Bright Spring" : "Light Spring" }, Summer: { temp: "Cool Summer", depth: d < .5 ? "Light Summer" : "Soft Summer", clarity: c < .5 ? "Soft Summer" : "Cool Summer" }, Autumn: { temp: "Warm Autumn", depth: d > .5 ? "Deep Autumn" : "Soft Autumn", clarity: c < .5 ? "Soft Autumn" : "Deep Autumn" }, Winter: { temp: "Cool Winter", depth: d > .5 ? "Deep Winter" : "Bright Winter", clarity: c > .5 ? "Bright Winter" : "Deep Winter" } };
  return { skinRgb, skin, hair, eye, hue, eyeC, ita, T, d, k, c, fam, family, dom, season: map[family][dom],
    undertone: T > .35 ? "warm (golden)" : T > .15 ? "warm-neutral" : T < -.35 ? "cool (rosy)" : T < -.15 ? "cool-neutral" : "neutral",
    depthW: d < .25 ? "light" : d < .45 ? "light-medium" : d < .65 ? "medium" : d < .82 ? "medium-deep" : "deep", conW: k < .35 ? "low" : k < .65 ? "medium" : "high", clarW: c < .35 ? "soft" : c < .6 ? "balanced" : "clear",
    itaBand: ita > 55 ? "very light" : ita > 41 ? "light" : ita > 28 ? "intermediate" : ita > 10 ? "tan" : ita > -30 ? "brown" : "dark" };
}
const tempWord = t => t > .3 ? "yellow-based (warm)" : t < -.3 ? "blue-based (cool)" : "fairly neutral";
function judge(col, P) {
  const tD = Math.abs(col.t - P.T) / 2, vStar = .2 + .65 * P.d, vRaw = col.v - vStar, vD = Math.max(0, Math.abs(vRaw) - .35 * P.k), cStar = .15 + .8 * P.c, cRaw = col.c - cStar, cD = Math.abs(cRaw);
  const score = Math.round(clamp(1 - 1.5 * (.45 * tD + .3 * vD + .25 * cD)) * 100), skinW = P.T > .15 ? "golden" : P.T < -.15 ? "rosy" : "balanced", why = [];
  if (tD < .25) why.push(["pos", `${cap(tempWord(col.t))}, like my ${skinW} undertone, so skin looks even and clear.`, tD]);
  else if (col.t < P.T) why.push(["neg", P.T > .15 ? "Blue-based against golden skin. It pulls the yellow forward as a grey, sallow cast under the eyes and round the mouth." : "Cooler than my undertone, so skin looks a bit grey and flat.", tD]);
  else why.push(["neg", P.T < -.15 ? "Yellow-based against rosy skin. The pink reads as redness and the face looks ruddy." : "Warmer than my undertone, it leaves a faint orange cast.", tD]);
  if (vD < .12) why.push(["pos", "Same depth as my colouring, so it frames my face instead of competing.", vD]);
  else if (vRaw > 0) why.push(["neg", "Much deeper than my colouring. It becomes the heaviest thing in the photo and darkens shadows under the jaw and eyes.", vD]);
  else why.push(["neg", "Much lighter than my colouring, so I lose definition and look washed out.", vD]);
  if (cD < .2) why.push(["pos", "Saturation matches my eyes and my hair-to-skin contrast.", cD]);
  else if (cRaw > 0) why.push(["neg", "Brighter than my features can carry. You see the colour first and me second.", cD]);
  else why.push(["neg", "Dustier than my natural clarity, so it looks dull and dims my eyes.", cD]);
  why.sort((a, b) => score >= 65 ? (a[0] === "pos" ? -1 : 1) - (b[0] === "pos" ? -1 : 1) || a[2] - b[2] : b[2] - a[2]);
  return { ...col, score, why, verdict: score >= 70 ? "wear it" : score >= 50 ? "works with care" : "skip near my face" };
}
function combos(P, R) {
  const desired = .15 + .7 * P.k, top = R.slice(0, 10), pairs = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) { const a = top[i], b = top[j], dv = Math.abs(a.v - b.v); pairs.push({ a, b, dv, s: (a.score + b.score) / 2 - 60 * Math.abs(dv - desired) - 10 * Math.abs(a.t - b.t) }); }
  pairs.sort((x, y) => y.s - x.s); const good = [], used = {};
  for (const p of pairs) { if (good.length >= 4) break; if ((used[p.a.name] || 0) >= 2 || (used[p.b.name] || 0) >= 2) continue; good.push(p); used[p.a.name] = (used[p.a.name] || 0) + 1; used[p.b.name] = (used[p.b.name] || 0) + 1; }
  const cw = dv => dv < .3 ? "low" : dv < .6 ? "medium" : "high", by = n => R.find(r => r.name === n);
  const g = good.map(p => ({ a: p.a, b: p.b, text: `A ${cw(p.dv)}-contrast pair for my ${P.conW}-contrast face, so outfit and face read as one picture. ${p.a.v < p.b.v ? p.a.name : p.b.name} goes closest to my face.` }));
  const bad = [], w = R.slice(-2); bad.push({ a: w[0], b: w[1], text: `My two lowest scores (${w[0].score} and ${w[1].score}). ${w[0].why[0][1]}` });
  const cm = P.k < .55 ? { a: by("Jet black"), b: by("Crisp white"), text: `Maximum contrast on a ${P.conW}-contrast face. The outfit wins and my face fades.` } : { a: by("Camel"), b: by("Sage"), text: "Almost the same lightness on a high-contrast face. The outfit looks sleepy and my features look harsh beside it." };
  bad.push(cm);
  const best = R[0], clash = R.slice(0, 14).find(r => Math.sign(r.t) !== Math.sign(best.t) && Math.abs(r.t - best.t) > .9 && r !== cm.a && r !== cm.b) || R.find(r => Math.abs(r.t - best.t) > 1);
  if (clash) bad.push({ a: best, b: clash, text: `Fine alone, but one is ${tempWord(best.t)} and the other ${tempWord(clash.t)}. Together the undertones fight, and one always looks off on me.` });
  return { good: g, bad };
}

/* ---------- rendering ---------- */
function recompute() {
  if (!st.has) return;
  document.querySelectorAll(".mk").forEach(place);
  const P = st.P = computeProfile(); st.R = COLORS.map(c => judge(c, P)).sort((a, b) => b.score - a.score);
  if (st.sel) st.sel = st.R.find(r => r.name === st.sel.name) || judge(attrsFromHex(st.sel.hex), P);
  renderDrapeBoard(); renderColours(); if (st.view === "lab") renderLab();
}
function renderFilm() {
  const f = $("sampleFilm"); f.querySelectorAll("canvas").forEach(e => e.remove());
  for (const k of ["cheek", "eye", "hair"]) {
    const cv = document.createElement("canvas"); cv.width = 240; cv.height = 180; const c = cv.getContext("2d");
    if (!st.has) { undeveloped(cv, k.length); c.font = "500 20px Inter, system-ui, sans-serif"; c.fillStyle = "#7d858d"; c.fillText(MK[k][0], 12, 28); f.appendChild(cv); continue; }
    const m = st.m[k], zw = k === "eye" ? 70 : 130, zh = zw * .75; c.drawImage(src, clamp(m.x * W - zw / 2, 0, W - zw), clamp(m.y * H - zh / 2, 0, H - zh), zw, zh, 0, 0, 240, 180);
    c.fillStyle = rgb2hex(sample(k)); c.fillRect(196, 136, 34, 34); c.strokeStyle = "#fff"; c.lineWidth = 3; c.strokeRect(196, 136, 34, 34);
    c.font = "500 22px Inter, system-ui, sans-serif"; c.fillStyle = "#fff"; c.shadowColor = "#000"; c.shadowBlur = 4; c.fillText(MK[k][0], 12, 30); f.appendChild(cv);
  }
}
function renderSheet() {
  const sh = $("sheet");
  if (!sh.children.length) COLORS.forEach(col => {
    const b = document.createElement("button"); b.type = "button"; b.className = "fr"; b.dataset.name = col.name; b.setAttribute("aria-label", "Drape " + col.name);
    b.innerHTML = `<canvas width="150" height="188"></canvas><b></b><span>${col.name}</span><span style="color:#8d8d8d;margin-top:1px">${col.hex}</span>`;
    b.onclick = () => { if (!st.has) { setView("light"); menu.hidden = false; return; } st.runId++; st.running = false; st.tested = true; $("runBtn").disabled = false; select(st.R.find(r => r.name === col.name)); renderColours(); };
    sh.appendChild(b);
  });
  [...sh.children].forEach((b, i) => st.has ? paint(b.querySelector("canvas"), COLORS[i].hex) : paintBareDrape(b.querySelector("canvas"), COLORS[i].hex));
  revealSheet(st.has && !st.tested ? 0 : COLORS.length);
}
function revealSheet(n) { [...$("sheet").children].forEach((b, i) => { const r = st.R.find(x => x.name === b.dataset.name); b.classList.toggle("pending", st.has && i >= n); b.querySelector("b").textContent = st.has && r ? r.score : ""; b.classList.toggle("sel", st.sel?.name === b.dataset.name); }); $("pillN").textContent = st.has ? Math.min(n, 25) : 0; }
function select(r) {
  if (!r) return; st.sel = r; paint($("testCanvas"), r.hex); $("testCap").textContent = lc(r.name) + " · " + r.score;
  $("verdict").innerHTML = `<h3>${esc(r.name)}</h3><div style="color:#4b6a5e">${r.score}/100 · ${r.verdict} · <span class="n">${r.hex.toUpperCase()}</span></div><ul>${r.why.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join("")}</ul>`;
  revealSheet(st.tested ? 25 : COLORS.findIndex(c => c.name === r.name) + 1);
}
function renderDrapeBoard() {
  if (!st.has) {
    undeveloped($("testCanvas"), 4); undeveloped($("bestCanvas"), 9); $("testCap").textContent = "testing…"; $("bestCap").textContent = "best so far";
    $("verdict").innerHTML = `<h3>25 drapes, one by one</h3><p>Warm, cool, light, deep, bright and soft colours, each laid under your chin as fabric. They develop once you've taken your photo.</p>`;
    $("runBtn").disabled = true; return;
  }
  if (!st.running) $("runBtn").disabled = false;
  const best = st.R[0]; paint($("bestCanvas"), best.hex); $("bestCap").textContent = "best: " + lc(best.name) + " · " + best.score;
  fabricSwatch($("swDeco"), best.hex, 3);
  if (st.sel) select(st.sel);
  else if (st.tested) select(best);
  else { paint($("testCanvas"), null); $("testCap").textContent = "ready when you are"; $("verdict").innerHTML = `<h3>Ready to drape</h3><p>The test runs through all 25 colours and keeps score. Tap any frame after to see why it works or doesn't.</p>`; revealSheet(0); }
}
function renderColours() {
  const on = st.has && st.tested; $("colEmpty").hidden = on;
  ["seasonTicket", "bestPolWrap", "seasonNote", "top8Wrap", "shadeWrap", "goodWrap", "badWrap", "avoidWrap", "journalWrap", "askWrap"].forEach(id => $(id).hidden = !on || (id === "askWrap" && !sampleFn));
  if (!on) return;
  const P = st.P, R = st.R, best = R[0];
  $("seasonTicket").innerHTML = `<div class="ticket"><div class="tin"><div class="big">${P.season}</div><div><small>Undertone</small>${P.undertone}</div><div><small>Depth</small>${P.depthW}</div><div><small>Contrast</small>${P.conW}</div><div><small>Clarity</small>${P.clarW}</div><div><small>Skin hue</small>${P.hue.toFixed(0)}°</div><div><small>ITA</small>${P.ita.toFixed(0)}°</div><div class="single"><span>${esc(best.name)} · ${best.score}</span><span>SINGLE</span></div></div><div class="foot">Season Pass</div></div>`;
  paint($("bestPol"), best.hex); $("bestPolCap").textContent = lc(best.name) + ", " + best.score + "/100";
  $("seasonNote").innerHTML = `<h3>${P.season}</h3><p>${esc(SEASONS[P.season][1])}</p><p>Can't beat a ${esc(lc(best.name))} moment. Obsessed with ${esc(lc(R[1].name))} and ${esc(lc(R[2].name))} right now. ${Math.round(best.score / 10)}/10 recommend!</p>`;
  $("best").innerHTML = R.slice(0, 8).map((r, i) => `<div class="sw"><canvas width="220" height="170" data-hex="${r.hex}" data-seed="${i + 2}"></canvas><div class="nm">${esc(lc(r.name))} <small>${r.score}</small></div><span class="hex" title="Click to copy">${r.hex.toUpperCase()}</span><p>${esc((r.why.find(w => w[0] === "pos") || r.why[0])[1])}</p></div>`).join("");
  $("best").querySelectorAll("canvas").forEach(cv => fabricSwatch(cv, cv.dataset.hex, +cv.dataset.seed));
  const cb = combos(P, R);
  const ch = (c, bad) => `<div class="combo"><div class="pr"><canvas width="150" height="150" data-hex="${c.a.hex}"></canvas><canvas width="150" height="150" data-hex="${c.b.hex}"></canvas>${bad ? '<svg class="x" viewBox="0 0 116 100"><path d="M10 12 L104 88 M104 14 L12 86" stroke="#d6261a" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"/></svg>' : ""}</div><div class="lined"><strong>${esc(lc(c.a.name))} + ${esc(lc(c.b.name))}</strong> <span class="hex">${c.a.hex}</span> <span class="hex">${c.b.hex}</span><br>${esc(c.text)}</div></div>`;
  $("goodCombos").innerHTML = cb.good.map(c => ch(c, false)).join(""); $("badCombos").innerHTML = cb.bad.map(c => ch(c, true)).join("");
  $("avoid").innerHTML = R.slice(-5).reverse().map(r => `<div class="combo"><div class="pr"><canvas width="150" height="150" data-hex="${r.hex}"></canvas></div><div class="lined"><strong>${esc(lc(r.name))} · ${r.score}</strong> <span class="hex">${r.hex}</span><br>${esc(r.why.filter(w => w[0] === "neg").map(w => w[1]).join(" ") || r.why[0][1])}</div></div>`).join("");
  document.querySelectorAll("#v-colours .combo canvas").forEach((cv, i) => fabricSwatch(cv, cv.dataset.hex, 7 + (i % 5)));
  const rep = shadeReport(P), rank = [...rep].sort((a, b) => b.avg - a.avg), lead = rank.slice(0, 3), easy = rank.slice(-2);
  $("shadeIntro").textContent = `${SHADE_COUNT} hex shades scored against your measurements, family by family. The outlined chip is your best shade, the crossed one your worst. Tap any chip to drape it.`;
  $("shadeSummary").innerHTML = `<h3>Where to start</h3>
    <p><b>Lead with</b> ${lead.map(f => `${lc(f.name)} <span class="hex">${f.best.hex}</span>`).join(", ")}. These families have the most shades that score well on you, so they're the easiest wins when you shop.</p>
    <p><b>Go easy on</b> ${easy.map(f => `${lc(f.name)} (best only ${f.best.score}/100)`).join(" and ")}. Even their best shade fights your colouring a little, so wear them away from your face: shoes, bags, trousers.</p>
    <p><b>Your rule of thumb:</b> ${P.T > .15 ? "pick the yellow-leaning version of any colour" : P.T < -.15 ? "pick the blue-leaning version of any colour" : "pick versions that are neither very golden nor very icy"}, ${P.d > .55 ? "go medium to deep" : P.d < .35 ? "stay light to medium" : "stay around medium depth"}, and ${P.c > .55 ? "choose clear, saturated shades over dusty ones" : P.c < .35 ? "choose soft, slightly greyed shades over bright ones" : "avoid both neon brights and very dusty tones"}.</p>`;
  $("shades").innerHTML = rep.map(f => `<div class="fam"><h4>${f.name}<small>best ${f.best.score} · ${f.shades.length} shades</small></h4>
    <div class="strip">${f.strip.map(s => `<button type="button" data-hex="${s.hex}" class="${s === f.best ? "best" : s === f.worst ? "worst" : ""}" style="background:${s.hex}" title="${s.hex} · ${s.score}/100" aria-label="${s.hex}, ${s.score} out of 100">${s === f.best || s === f.worst ? `<span>${s.hex}</span>` : ""}</button>`).join("")}</div>
    <div><p><b style="font-weight:500">Best <span class="hex">${f.best.hex}</span> ${f.best.score}/100.</b> Your ${f.word === "neutral" ? "neutrals" : f.word + "s"} should be ${f.dirs.join(", ")}. ${esc((f.best.why.find(w => w[0] === "pos") || f.best.why[0])[1])}</p>
    <p style="color:#5a2a22"><b style="font-weight:500">Avoid <span class="hex">${f.worst.hex}</span> ${f.worst.score}/100.</b> ${esc((f.worst.why.find(w => w[0] === "neg") || f.worst.why[0])[1])}</p></div></div>`).join("");
  $("shades").querySelectorAll(".strip button").forEach(b => b.onclick = () => { const r = judge(attrsFromHex(b.dataset.hex), st.P); r.name = b.dataset.hex; st.runId++; st.running = false; st.tested = true; $("runBtn").disabled = false; setView("drape"); select(r); });
  const dt = { temp: "Temperature", depth: "Depth", clarity: "Clarity" }[P.dom];
  $("journal").innerHTML = `
    <p><b>Undertone.</b> My skin, averaged from cheek and forehead, measures <span class="n">L* ${P.skin[0].toFixed(0)} · a* ${P.skin[1].toFixed(0)} · b* ${P.skin[2].toFixed(0)}</span> in CIELAB. a* is how red it is, b* how yellow. The angle between them is my skin hue, <span class="n">${P.hue.toFixed(0)}°</span>. Below about 50° red wins (rosy, cool); above about 64° yellow wins (golden, warm). Mine reads ${P.undertone}. That's what the gold-versus-silver jewellery test is guessing at, measured instead.</p>
    <p><b>Depth.</b> My Individual Typology Angle, the measure dermatologists use for skin lightness, is <span class="n">${P.ita.toFixed(0)}°</span>, the "${P.itaBand}" band. With hair at <span class="n">L* ${P.hair[0].toFixed(0)}</span>, my overall colouring is ${P.depthW}. Colours near my depth frame me; much lighter or deeper ones steal focus.</p>
    <p><b>Contrast.</b> Skin against hair is <span class="n">${Math.abs(P.skin[0] - P.hair[0]).toFixed(0)} pts</span> of lightness and skin against iris <span class="n">${Math.abs(P.skin[0] - P.eye[0]).toFixed(0)} pts</span>, so I'm ${P.conW} contrast. Outfits with a similar light-dark jump look intentional on me; a far bigger jump overwhelms, a far smaller one looks flat.</p>
    <p><b>Clarity.</b> My iris colour has a chroma of <span class="n">${P.eyeC.toFixed(0)}</span>; with my contrast that reads ${P.clarW}. Clear faces glow in saturated jewel tones, soft faces look richer in dusty, greyed colour.</p>
    <p><b>So, ${P.season}.</b> Season fit: ${Object.entries(P.fam).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} <span class="n">${v.toFixed(2)}</span>`).join(", ")}. ${dt} is my strongest trait, so it names the sub-season. Wear colours that are ${SEASONS[P.season][0]}.</p>
    <p><b>How the score works.</b> Each drape scores out of 100 on three matches: temperature against my undertone (45%), depth against my colouring (30%, with more leeway because of my ${P.conW} contrast) and brightness against my clarity (25%). Cameras shift colour, so check the top three in a mirror by a window.</p>`;
}

/* ---------- drape run ---------- */
async function runDrape() {
  if (!st.has) return; const id = ++st.runId; st.tested = false; st.sel = null; st.running = true; $("runBtn").disabled = true;
  for (let i = 0; i < COLORS.length; i++) {
    if (id !== st.runId) return; const r = st.R.find(x => x.name === COLORS[i].name);
    paint($("testCanvas"), r.hex); $("testCap").textContent = `testing ${i + 1}/25: ${lc(r.name)} · ${r.score}`; revealSheet(i + 1);
    await sleep(reduced ? 0 : 260);
  }
  if (id !== st.runId) return; st.running = false; st.tested = true; select(st.R[0]); $("runBtn").disabled = false; renderColours();
}
$("runBtn").onclick = runDrape;
$("customColor").oninput = e => { if (!st.has) return; st.runId++; st.running = false; st.tested = true; $("runBtn").disabled = false; select(judge(attrsFromHex(e.target.value), st.P)); renderColours(); };

document.addEventListener("click", e => { const h = e.target.closest(".hex"); if (!h || h.dataset.busy) return; const t = h.textContent.trim(); navigator.clipboard?.writeText(t).then(() => { h.dataset.busy = 1; h.textContent = "copied"; setTimeout(() => { h.textContent = t; delete h.dataset.busy; }, 900); }).catch(() => {}); });
/* ---------- hex lab: random hex colours, draped, scored, then analysed ---------- */
const lab = { hexes: [], dirty: true };
const chroma = x => Math.hypot(x.lab[1], x.lab[2]);
function randomHexes(n) { const out = new Set(); while (out.size < n) out.add("#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()); return [...out]; }
function fixShade(col, P) {
  const h0 = Math.atan2(col.lab[2], col.lab[1]) * 180 / Math.PI; let best = null;
  const cMin = Math.max(14, chroma(col) * .45);
  for (const dh of [-12, -6, 0, 6, 12]) for (let L = 18; L <= 94; L += 4) for (let C = cMin; C <= 84; C += 6) {
    const h = (h0 + dh) * Math.PI / 180, hex = lab2hex(L, C * Math.cos(h), C * Math.sin(h)); if (!hex) continue;
    const j = judge(attrsFromHex(hex), P); if (!best || j.score > best.score) best = j;
  }
  best.name = best.hex;
  const moves = [], dL = best.lab[0] - col.lab[0], dC = chroma(best) - chroma(col), dT = best.t - col.t;
  if (Math.abs(dL) > 6) moves.push(dL < 0 ? "deeper" : "lighter");
  if (Math.abs(dC) > 8) moves.push(dC < 0 ? "softer" : "brighter");
  if (Math.abs(dT) > .2) moves.push(dT > 0 ? "warmer" : "cooler");
  return { best, moves };
}
function renderLab() {
  const on = st.has; $("labEmpty").hidden = on; ["labSummary", "labGrid", "labFixWrap", "labCtl"].forEach(id => $(id).hidden = !on);
  if (!on) return;
  if (!lab.hexes.length) lab.hexes = randomHexes(16);
  const P = st.P, items = lab.hexes.map(h => { const j = judge(attrsFromHex(h), P); j.name = h; return j; }).sort((a, b) => b.score - a.score);
  $("labGrid").innerHTML = items.map((r, i) => `<button type="button" class="labcard" data-hex="${r.hex}"><canvas width="240" height="300"></canvas><div class="lc-row"><span class="hex">${r.hex}</span><span class="pill-s ${r.score >= 70 ? "ok" : r.score >= 50 ? "warn" : "bad"}">${r.score}</span></div><p>${esc((r.score >= 60 ? (r.why.find(w => w[0] === "pos") || r.why[0]) : (r.why.find(w => w[0] === "neg") || r.why[0]))[1])}</p></button>`).join("");
  $("labGrid").querySelectorAll(".labcard").forEach((b, i) => { paint(b.querySelector("canvas"), items[i].hex); b.onclick = e => { if (e.target.closest(".hex")) return; const r = items[i]; st.runId++; st.running = false; st.tested = true; $("runBtn").disabled = false; setView("drape"); select(r); }; });
  // analysis
  const half = Math.ceil(items.length / 2), top = items.slice(0, half), bot = items.slice(half), mean = (a, f) => a.reduce((n, x) => n + f(x), 0) / a.length;
  const tL = mean(top, x => x.lab[0]), bL = mean(bot, x => x.lab[0]), tC = mean(top, chroma), bC = mean(bot, chroma), tT = mean(top, x => x.t), bT = mean(bot, x => x.t);
  const sep = [["temperature", Math.abs(tT - bT) / 2], ["lightness", Math.abs(tL - bL) / 100], ["saturation", Math.abs(tC - bC) / 80]].sort((a, b) => b[1] - a[1]);
  const tw = t => t > .3 ? "yellow-leaning (warm)" : t < -.3 ? "blue-leaning (cool)" : "close to neutral";
  const why = {
    temperature: `On a scale from −1 (cool) to +1 (warm), winners averaged <span class="n">${tT.toFixed(2)}</span> (${tw(tT)}); losers averaged <span class="n">${bT.toFixed(2)}</span> (${tw(bT)}). Your skin scored <span class="n">${P.T.toFixed(2)}</span> on the same scale (−1 cool to +1 warm), so colours on the same side of that line agree with your skin and the rest pull a cast into it.`,
    lightness: `Winners averaged <span class="n">L* ${tL.toFixed(0)}</span>; losers <span class="n">L* ${bL.toFixed(0)}</span>. Your colouring sits around <span class="n">L* ${(100 * (1 - (.2 + .65 * P.d))).toFixed(0)}</span>, so how light or dark a colour is decides more for you than which hue it is.`,
    saturation: `Winners averaged a chroma of <span class="n">${tC.toFixed(0)}</span>; losers <span class="n">${bC.toFixed(0)}</span>. Your clarity is ${P.clarW}, so ${tC < bC ? "softer, slightly greyed versions" : "clearer, more saturated versions"} of any colour work better on you than ${tC < bC ? "loud ones" : "dusty ones"}.`
  };
  const cnt = k => items.filter(r => k === "ok" ? r.score >= 70 : k === "warn" ? r.score >= 50 && r.score < 70 : r.score < 50).length;
  const w4 = items.slice(0, 4), rng = (a, f, d = 0) => `${Math.min(...a.map(f)).toFixed(d)}–${Math.max(...a.map(f)).toFixed(d)}`;
  $("labSummary").innerHTML = `<h3>What this roll tells us</h3>
    <p>Of ${items.length} random colours, <b>${cnt("ok")}</b> are wear-it, <b>${cnt("warn")}</b> work with care and <b>${cnt("bad")}</b> are skip-near-your-face. Random colours land mostly in the middle and bottom; that's normal, since most of the colour space is wrong for any one person.</p>
    <p><b>The biggest dividing line was ${sep[0][0]}.</b> ${why[sep[0][0]]}</p>
    <p><b>Second: ${sep[1][0]}.</b> ${why[sep[1][0]]}</p>
    <p><b>Your sweet spot, from this roll's top four:</b> lightness <span class="n">L* ${rng(w4, x => x.lab[0])}</span>, chroma <span class="n">${rng(w4, chroma)}</span>, warmth <span class="n">${rng(w4, x => x.t, 2)}</span>. Shop inside those numbers and most colours will behave.</p>
    <p><b>Best of the roll:</b> <span class="hex">${items[0].hex}</span> at ${items[0].score}. <b>Worst:</b> <span class="hex">${items[items.length - 1].hex}</span> at ${items[items.length - 1].score}. Roll again and the pattern should hold even though the colours change; if it does, it's a real rule for your skin rather than luck.</p>`;
  // fixes for the three worst
  $("labFix").innerHTML = items.slice(-3).reverse().map(r => { const f = fixShade(r, P); return `<div class="combo"><div class="pr"><canvas width="150" height="150" data-hex="${r.hex}"></canvas><canvas width="150" height="150" data-hex="${f.best.hex}"></canvas></div><div class="lined"><strong>${r.hex} → ${f.best.hex}</strong> <span class="n">${r.score} → ${f.best.score}</span><br>Same colour family, made ${f.moves.length ? f.moves.join(", ") : "a touch different"}. ${esc((r.why.find(w => w[0] === "neg") || r.why[0])[1])} The fixed version: ${esc((f.best.why.find(w => w[0] === "pos") || f.best.why[0])[1]).toLowerCase()}</div></div>`; }).join("");
  $("labFix").querySelectorAll("canvas").forEach((cv, i) => fabricSwatch(cv, cv.dataset.hex, 20 + i));
}
$("rollBtn").onclick = () => { lab.hexes = randomHexes(16); renderLab(); };
$("hexAdd").onsubmit = e => { e.preventDefault(); const v = $("hexIn").value.trim().replace(/^#?/, "#").toUpperCase(); if (!/^#[0-9A-F]{6}$/.test(v)) { $("hexMsg").textContent = "Use a 6-digit hex like #7A2048."; return; } $("hexMsg").textContent = ""; lab.hexes = [v, ...lab.hexes.filter(h => h !== v)].slice(0, 24); $("hexIn").value = ""; renderLab(); };
/* ---------- views ---------- */
function setView(v) {
  st.view = v; ["light", "drape", "colours", "lab"].forEach(k => $("v-" + k).hidden = k !== v);
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v));
  scrollTo({ top: 0 });
  if (v === "drape" && st.has && !st.tested && !st.running) runDrape();
  if (v === "lab") renderLab();
}
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => setView(b.dataset.view));

/* ---------- ask Claude ---------- */
let sampleFn = null;
(async () => { try { if (!window.claude?.use) return; sampleFn = await window.claude.use("sample"); renderColours(); } catch (e) { } })();
$("askBtn").onclick = async () => {
  if (!sampleFn || !st.P) return; const P = st.P, R = st.R;
  const data = { season: P.season, undertone: P.undertone, skinLab: P.skin.map(v => +v.toFixed(1)), skinHueDeg: +P.hue.toFixed(1), ITA: +P.ita.toFixed(1), hairL: +P.hair[0].toFixed(1), irisChroma: +P.eyeC.toFixed(1), depth: P.depthW, contrast: P.conW, clarity: P.clarW, best: R.slice(0, 6).map(r => `${r.name} ${r.hex} (${r.score})`), worst: R.slice(-5).map(r => `${r.name} ${r.hex} (${r.score})`) };
  const prompt = `You are a personal colour analyst. A web app measured someone's colouring from a daylight selfie: ${JSON.stringify(data)}.\nWrite to them directly in 250-350 words, plain text, short paragraphs, no markdown or headings. Explain what their undertone, depth, contrast and clarity mean visually; why ${P.season} fits; why their best colours flatter and their worst don't (effects on skin, eyes and shadows); two outfit ideas from the best colours; one makeup or hair-colour note. End by saying photo analysis is a first read and a mirror check by a window is worth doing.`;
  const out = $("askOut"); out.hidden = false; out.textContent = "thinking…"; $("askBtn").disabled = true;
  try { const r = await sampleFn(prompt, { onText: ({ text }) => { out.textContent = text; } }); out.textContent = r.text; }
  catch (e) { if (e?.code === "not_granted") $("askWrap").hidden = true; else out.textContent = e?.text || "Claude couldn't answer just now. Try again in a minute."; }
  finally { $("askBtn").disabled = false; }
};

/* ---------- boot ---------- */
drawToast($("toastA"), true, 29); drawToast($("toastB"), false, 11); drawBuds($("budsA"));
fabricSwatch($("swDeco"), "#C0603F", 3);
undeveloped($("mirror"), 7); buildDrapeMap();
renderTicket(); renderFilm(); renderSheet(); renderDrapeBoard(); renderColours();
document.fonts?.ready.then(renderFilm);
})();
