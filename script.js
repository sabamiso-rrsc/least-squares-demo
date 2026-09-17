const canvas = document.querySelector('#plot');
const ctx = canvas.getContext('2d');
const ui = {
  r2: document.querySelector('#r2'), reset: document.querySelector('#reset'),
};
const points = [];
let view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

function layout() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  updateView();
  draw();
}

function plotArea() { return { left: 64, right: innerWidth - 34, top: 34, bottom: innerHeight - 64 }; }
function updateView() {
  const a = plotArea();
  const width = Math.max(1, a.right - a.left);
  const height = Math.max(1, a.bottom - a.top);
  const aspect = width / height;
  const baseSpan = 20;
  const xSpan = aspect >= 1 ? baseSpan * aspect : baseSpan;
  const ySpan = aspect >= 1 ? baseSpan : baseSpan / aspect;
  view = { xMin: -xSpan / 2, xMax: xSpan / 2, yMin: -ySpan / 2, yMax: ySpan / 2 };
}
function pxX(x) { const a = plotArea(); return a.left + (x - view.xMin) / (view.xMax - view.xMin) * (a.right - a.left); }
function pxY(y) { const a = plotArea(); return a.bottom - (y - view.yMin) / (view.yMax - view.yMin) * (a.bottom - a.top); }
function valX(px) { const a = plotArea(); return view.xMin + (px - a.left) / (a.right - a.left) * (view.xMax - view.xMin); }
function valY(py) { const a = plotArea(); return view.yMin + (a.bottom - py) / (a.bottom - a.top) * (view.yMax - view.yMin); }

function niceStep(range) {
  const raw = range / 8, power = 10 ** Math.floor(Math.log10(raw)), fraction = raw / power;
  return (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * power;
}
function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return '—';
  const v = Math.abs(n) < 1e-10 ? 0 : n;
  return Math.abs(v) >= 1e4 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3) ? v.toExponential(2) : Number(v.toFixed(digits)).toString();
}

function regression() {
  const n = points.length;
  if (n < 2) return null;
  const xBar = points.reduce((s, p) => s + p.x, 0) / n;
  const yBar = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - xBar) ** 2, 0);
  if (sxx < 1e-12) return { vertical: true, xBar, n };
  const sxy = points.reduce((s, p) => s + (p.x - xBar) * (p.y - yBar), 0);
  const m = sxy / sxx, b = yBar - m * xBar;
  const sse = points.reduce((s, p) => s + (p.y - (m * p.x + b)) ** 2, 0);
  const sst = points.reduce((s, p) => s + (p.y - yBar) ** 2, 0);
  const r2 = sst < 1e-12 ? (sse < 1e-12 ? 1 : NaN) : 1 - sse / sst;
  return { n, xBar, sxx, m, b, sse, r2 };
}

// Two-sided 95% Student's-t critical values (df 1–30); normal approximation beyond that.
function t95(df) {
  const table = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
  if (df <= 30) return table[df - 1];
  return 1.959964 * (1 + 2.372 / df + 2.822 / (df * df));
}

function updateStats(model) {
  if (!model) { ui.r2.textContent = '—'; return; }
  if (model.vertical) { ui.r2.textContent = '—'; return; }
  ui.r2.textContent = fmt(model.r2, 4);
}

function drawGrid() {
  const a = plotArea();
  const unitsPerPixel = (view.xMax - view.xMin) / (a.right - a.left);
  const step = niceStep(unitsPerPixel * 800);
  ctx.strokeStyle = 'rgba(145, 169, 193, .12)'; ctx.lineWidth = 1;
  for (let x = Math.ceil(view.xMin / step) * step; x <= view.xMax; x += step) {
    const px = pxX(x); ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
  }
  for (let y = Math.ceil(view.yMin / step) * step; y <= view.yMax; y += step) {
    const py = pxY(y); ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(205, 225, 245, .45)'; ctx.lineWidth = 1.4;
  if (view.xMin <= 0 && view.xMax >= 0) { ctx.beginPath(); ctx.moveTo(pxX(0), a.top); ctx.lineTo(pxX(0), a.bottom); ctx.stroke(); }
  if (view.yMin <= 0 && view.yMax >= 0) { ctx.beginPath(); ctx.moveTo(a.left, pxY(0)); ctx.lineTo(a.right, pxY(0)); ctx.stroke(); }
  ctx.fillStyle = '#91a3b8'; ctx.font = 'italic 13px Georgia, serif'; ctx.fillText('x', a.right - 4, a.bottom + 20); ctx.fillText('y', a.left - 18, a.top + 2);
}

function drawBand(model) {
  if (!model || model.vertical || model.n < 3) return;
  const residual = Math.sqrt(model.sse / (model.n - 2));
  const t = t95(model.n - 2), steps = 120, upper = [], lower = [];
  for (let i = 0; i <= steps; i++) {
    const x = view.xMin + (view.xMax - view.xMin) * i / steps;
    const delta = t * residual * Math.sqrt(1 / model.n + (x - model.xBar) ** 2 / model.sxx);
    upper.push([pxX(x), pxY(model.m * x + model.b + delta)]);
    lower.push([pxX(x), pxY(model.m * x + model.b - delta)]);
  }
  ctx.beginPath(); upper.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); lower.reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
  ctx.fillStyle = 'rgba(104, 213, 255, .16)'; ctx.fill();
  ctx.strokeStyle = 'rgba(104, 213, 255, .55)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
  [upper, lower].forEach(line => { ctx.beginPath(); line.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }); ctx.setLineDash([]);
}

function drawModel(model) {
  if (!model) return;
  if (model.vertical) { ctx.strokeStyle = '#68d5ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(pxX(model.xBar), plotArea().top); ctx.lineTo(pxX(model.xBar), plotArea().bottom); ctx.stroke(); return; }
  ctx.strokeStyle = '#68d5ff'; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(pxX(view.xMin), pxY(model.m * view.xMin + model.b)); ctx.lineTo(pxX(view.xMax), pxY(model.m * view.xMax + model.b)); ctx.stroke();
}

function drawPoints() {
  points.forEach(p => { ctx.beginPath(); ctx.arc(pxX(p.x), pxY(p.y), 5.2, 0, Math.PI * 2); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.strokeStyle = '#1b2432'; ctx.lineWidth = 1.5; ctx.stroke(); });
}
function draw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.fillStyle = '#07101d'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  drawGrid(); const model = regression(); drawBand(model); drawModel(model); drawPoints(); updateStats(model);
}

canvas.addEventListener('click', event => {
  const a = plotArea();
  if (event.clientX < a.left || event.clientX > a.right || event.clientY < a.top || event.clientY > a.bottom) return;
  points.push({ x: valX(event.clientX), y: valY(event.clientY) }); draw();
});
ui.reset.addEventListener('click', () => { points.length = 0; draw(); });
window.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) { points.length = 0; draw(); } });
window.addEventListener('resize', layout);
layout();
