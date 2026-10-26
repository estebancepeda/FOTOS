// Motor de motion graphics vertical 1080×1920 · Auto Mayella × Mercedes-Benz 2027
// Capa 2D (texto, íconos, logos) → textura → shader de lente (refracción real,
// aberración cromática por sectores, reflejos del contorno) → cuadro final.
// Determinista: renderFrame(t) siempre produce el mismo cuadro para el mismo t.

export const W = 1080, H = 1920, FPS = 30;
// Centro de composición: centro del cuadro bajado un 10 % de la altura.
export const CX = W / 2, CY = H / 2 + 0.10 * H;   // (540, 1152)

// ---------------------------------------------------------------- utilidades
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, t0, d) => clamp((t - t0) / d);
export const ease = {
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
};
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- recursos
const images = {};
export async function loadImage(name, url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  images[name] = img;
  return img;
}

// Íconos Lucide (ISC): se convierten a Path2D con su longitud para dibujarlos trazo a trazo.
const icons = {};
const svgNS = 'http://www.w3.org/2000/svg';
function shapeToD(el) {
  const n = el.tagName.toLowerCase();
  const a = (k) => parseFloat(el.getAttribute(k) || '0');
  if (n === 'path') return el.getAttribute('d');
  if (n === 'line') return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
  if (n === 'circle') {
    const cx = a('cx'), cy = a('cy'), r = a('r');
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  if (n === 'ellipse') {
    const cx = a('cx'), cy = a('cy'), rx = a('rx'), ry = a('ry');
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  }
  if (n === 'rect') {
    const x = a('x'), y = a('y'), w = a('width'), h = a('height');
    const r = Math.min(parseFloat(el.getAttribute('rx') || el.getAttribute('ry') || '0'), w / 2, h / 2);
    if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
      `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  }
  if (n === 'polyline' || n === 'polygon') {
    const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number);
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
    return n === 'polygon' ? d + 'Z' : d;
  }
  return null;
}
export async function loadIcon(name, url) {
  const txt = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const svg = document.createElementNS(svgNS, 'svg');
  document.body.appendChild(svg);
  const parts = [];
  for (const el of doc.querySelectorAll('path,line,circle,ellipse,rect,polyline,polygon')) {
    const d = shapeToD(el);
    if (!d) continue;
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    parts.push({ path: new Path2D(d), len: p.getTotalLength() });
  }
  svg.remove();
  icons[name] = parts;
}

// ---------------------------------------------------------------- primitivas 2D
const FONT = { display: '"Inter Display", "Inter", sans-serif', text: '"Inter", sans-serif' };
const fontOf = (e, weight) => `${weight ?? e.weight ?? 300} ${e.size}px ${FONT[e.family || 'display']}`;

// Salida combinada: la de la escena y, si existe, la propia del elemento (e.out, relativo a la escena).
function outQ(e, lt, sceneOut, i = 0) {
  let q = sceneOut(i);
  if (e.out != null) q = Math.max(q, ease.inCubic(prog(lt, e.out + i * 0.04, e.outDur ?? 0.4)));
  return q;
}

// Texto palabra por palabra: cada palabra sube desde una máscara, con tracking que se cierra.
// e.text (un peso) o e.segments [{text, weight}] (pesos mezclados en la misma línea).
function drawText(ctx, e, lt, sceneOut) {
  const words = [];
  for (const seg of e.segments || [{ text: e.text, weight: e.weight }])
    for (const w of seg.text.split(' ')) words.push({ w, weight: seg.weight ?? e.weight });
  const track0 = (e.tracking ?? 0.04) * e.size;
  const stagger = e.stagger ?? 0.07, dur = e.dur ?? 0.9, at = e.at ?? 0;
  ctx.letterSpacing = `${track0}px`;
  ctx.font = fontOf(e);
  const space = ctx.measureText(' ').width * (e.space ?? 1);
  const widths = words.map((o) => { ctx.font = fontOf(e, o.weight); return ctx.measureText(o.w).width; });
  const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1);
  let x = CX + (e.x || 0) - total / 2;
  const y = CY + e.y;
  ctx.save();
  ctx.beginPath();                                    // máscara de línea
  ctx.rect(0, y - e.size * 1.15, W, e.size * 1.55);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  words.forEach((o, i) => {
    const p = ease.outExpo(prog(lt, at + i * stagger, dur));
    const q = outQ(e, lt, sceneOut, i);
    if (p > 0 && q < 1) {
      ctx.font = fontOf(e, o.weight);
      ctx.letterSpacing = `${track0 + (1 - p) * 0.22 * e.size}px`;   // tracking que se cierra al entrar
      const wNow = ctx.measureText(o.w).width;
      ctx.globalAlpha = (e.alpha ?? 1) * p * (1 - q);
      ctx.fillText(o.w, x + (widths[i] - wNow) / 2, y + (1 - p) * e.size * 0.95 - q * e.size * 0.35);
    }
    x += widths[i] + space;
  });
  ctx.restore();
}

function drawIcon(ctx, e, lt, sceneOut) {
  const parts = icons[e.name];
  if (!parts) throw new Error('ícono no cargado: ' + e.name);
  const p = ease.inOutCubic(prog(lt, e.at ?? 0, e.dur ?? 1.1));
  const q = outQ(e, lt, sceneOut);
  if (p <= 0 || q >= 1) return;
  const s = e.size / 24;
  const pop = ease.outCubic(prog(lt, e.at ?? 0, (e.dur ?? 1.1) * 0.8));
  ctx.save();
  ctx.translate(CX + (e.x || 0), CY + e.y - q * 20);
  ctx.scale(s * (0.9 + 0.1 * pop), s * (0.9 + 0.1 * pop));
  ctx.translate(-12, -12);
  ctx.lineWidth = e.stroke ?? 1.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.globalAlpha = (1 - q) * clamp(p * 3);
  for (const part of parts) {
    ctx.setLineDash([part.len, part.len + 1]);
    ctx.lineDashOffset = part.len * (1 - p);
    ctx.stroke(part.path);
  }
  ctx.restore();
}

// Ícono con etiqueta debajo.
function drawIconLabel(ctx, e, lt, sceneOut) {
  const size = e.size ?? 110;
  drawIcon(ctx, { ...e, name: e.icon, size, dur: e.dur ?? 1.0 }, lt, sceneOut);
  const lines = Array.isArray(e.label) ? e.label : [e.label];
  lines.forEach((txt, k) => drawText(ctx, { text: txt, x: e.x || 0, y: e.y + size * 0.5 + 66 + k * (e.labelSize ?? 32) * 1.25,
    size: e.labelSize ?? 32, weight: 500, family: 'text', tracking: e.labelTracking ?? 0.14, at: (e.at ?? 0) + 0.3 + k * 0.08,
    dur: 0.8, stagger: 0.05, out: e.out, outDur: e.outDur }, lt, sceneOut));
}

// Fila de íconos con etiqueta (cada uno puede tener su propio tiempo it.at).
function drawIconRow(ctx, e, lt, sceneOut) {
  const n = e.items.length, gap = e.gap ?? 300;
  e.items.forEach((it, i) => drawIconLabel(ctx, { ...e, icon: it.icon, label: it.label, x: (i - (n - 1) / 2) * gap,
    at: it.at ?? (e.at ?? 0) + i * (e.stagger ?? 0.18) }, lt, sceneOut));
}

// Línea fina que se abre desde el centro.
function drawRule(ctx, e, lt, sceneOut) {
  const p = ease.outExpo(prog(lt, e.at ?? 0, e.dur ?? 1.0));
  const q = outQ(e, lt, sceneOut);
  if (p <= 0 || q >= 1) return;
  const half = (e.w / 2) * p * (1 - 0.6 * q);
  const x0 = CX + (e.x || 0);
  ctx.save();
  ctx.globalAlpha = (e.alpha ?? 0.7) * (1 - q);
  const g = ctx.createLinearGradient(x0 - half, 0, x0 + half, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0 - half, CY + e.y - (e.h || 2) / 2, 2 * half, e.h || 2);
  ctx.restore();
}

function drawImage(ctx, e, lt, sceneOut) {
  const img = images[e.name];
  const p = ease.outCubic(prog(lt, e.at ?? 0, e.dur ?? 0.8));
  const q = outQ(e, lt, sceneOut);
  if (p <= 0 || q >= 1) return;
  const w = e.w * (e.grow ? lerp(0.94, 1, ease.outExpo(prog(lt, e.at ?? 0, 2.0))) : 1);
  const h = w * img.height / img.width;
  ctx.save();
  ctx.globalAlpha = (e.fade === false ? 1 : p) * (1 - q);
  ctx.drawImage(img, CX + (e.x || 0) - w / 2, CY + e.y - h / 2 - q * 20, w, h);
  ctx.restore();
}

// Número que rueda: cada dígito pasa por valores anteriores antes de fijarse.
function drawCounter(ctx, e, lt, sceneOut) {
  const str = String(e.to);
  const from = String(e.from ?? 0).padStart(str.length, '0');
  ctx.font = fontOf(e);
  ctx.letterSpacing = `${(e.tracking ?? 0.02) * e.size}px`;
  const dw = str.split('').map((c) => ctx.measureText(c).width);
  const total = dw.reduce((s, w) => s + w, 0);
  let x = CX + (e.x || 0) - total / 2;
  const y = CY + e.y;
  const q = outQ(e, lt, sceneOut);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - e.size * 0.92, W, e.size * 1.02);
  ctx.clip();
  ctx.fillStyle = '#fff';
  str.split('').forEach((c, i) => {
    const p = ease.outQuart(prog(lt, (e.at ?? 0) + i * (e.stagger ?? 0.09), e.dur ?? 1.4));
    if (p > 0 && q < 1) {
      const a = parseInt(from[i], 10), b = parseInt(c, 10);
      const steps = ((b - a + 10) % 10) + 10 * (e.loops ?? 1);
      const pos = steps * p, k = Math.floor(pos), frac = pos - k;
      ctx.globalAlpha = (1 - q) * clamp(p * 4);
      const lift = q * e.size * 0.3;
      ctx.fillText(String((a + k) % 10), x, y - frac * e.size - lift);
      if (frac > 0) ctx.fillText(String((a + k + 1) % 10), x, y + (1 - frac) * e.size - lift);
    }
    x += dw[i];
  });
  ctx.restore();
}

// Destello de cuatro puntas (estrella genérica, no es el logotipo).
function sparkle(ctx, x, y, r, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = a;
  ctx.beginPath();
  const k = r * 0.22;
  ctx.moveTo(0, -r); ctx.quadraticCurveTo(k, -k, r, 0); ctx.quadraticCurveTo(k, k, 0, r);
  ctx.quadraticCurveTo(-k, k, -r, 0); ctx.quadraticCurveTo(-k, -k, 0, -r);
  ctx.fill();
  ctx.restore();
}

// Patrón de estrellas en forma de faro: aparecen en ola de izquierda a derecha y titilan.
function drawStars(ctx, e, lt, sceneOut) {
  const q = outQ(e, lt, sceneOut);
  if (q >= 1) return;
  const cols = e.cols ?? 11, rows = e.rows ?? 3, sp = e.spacing ?? 62;
  ctx.save();
  ctx.fillStyle = '#fff';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = (c - (cols - 1) / 2) / ((cols - 1) / 2);            // −1..1
    const x = CX + (e.x || 0) + (c - (cols - 1) / 2) * sp + (r % 2) * sp * 0.5 - sp * 0.25;
    // contorno de faro: filas que se estrechan hacia los extremos y una ligera curva
    const y = CY + e.y + (r - (rows - 1) / 2) * sp * 0.78 + 26 * u * u - 10 * u;
    if (Math.abs(u) > 1 - 0.18 * Math.abs(r - (rows - 1) / 2)) continue;
    const delay = (e.at ?? 0) + (u + 1) * 0.45 + r * 0.06;
    const p = ease.outCubic(prog(lt, delay, 0.6));
    if (p <= 0) continue;
    const tw = 0.75 + 0.25 * Math.sin(lt * 3.1 + c * 1.7 + r * 2.3);
    sparkle(ctx, x, y, (e.size ?? 13) * p * tw * (1 - 0.3 * q), (1 - q) * clamp(p * 2) * (0.55 + 0.45 * tw));
  }
  ctx.restore();
}

function roundRectPath(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}

// Tres pantallas bajo un mismo cristal: contorno trazado, divisiones y líneas de interfaz.
function drawScreens(ctx, e, lt, sceneOut) {
  const q = outQ(e, lt, sceneOut);
  const p = ease.inOutCubic(prog(lt, e.at ?? 0, 1.1));
  if (p <= 0 || q >= 1) return;
  const w = e.w ?? 800, h = e.h ?? 150, x0 = CX - w / 2, y0 = CY + e.y - h / 2;
  const per = 2 * (w + h);
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1 - q;
  ctx.setLineDash([per * p, per]);
  ctx.stroke(roundRectPath(x0, y0, w, h, 26));
  ctx.setLineDash([]);
  // divisiones (aparecen una por una)
  for (let k = 1; k < 3; k++) {
    const d = ease.outCubic(prog(lt, (e.at ?? 0) + 0.6 + k * 0.15, 0.5));
    const x = x0 + (w * k) / 3;
    ctx.globalAlpha = (1 - q) * d * 0.85;
    ctx.beginPath(); ctx.moveTo(x, y0 + h / 2 - (h / 2 - 16) * d); ctx.lineTo(x, y0 + h / 2 + (h / 2 - 16) * d); ctx.stroke();
  }
  // contenido sugerido en cada pantalla
  for (let k = 0; k < 3; k++) {
    const d = ease.outExpo(prog(lt, (e.at ?? 0) + 0.9 + k * 0.2, 0.8));
    if (d <= 0) continue;
    const sx = x0 + (w * k) / 3 + 30, sw = w / 3 - 60;
    ctx.globalAlpha = (1 - q) * d * 0.55;
    ctx.lineWidth = 2;
    for (let l = 0; l < 3; l++) {
      ctx.beginPath(); ctx.moveTo(sx, y0 + 46 + l * 26); ctx.lineTo(sx + sw * d * (l === 0 ? 0.8 : l === 1 ? 0.55 : 0.68), y0 + 46 + l * 26); ctx.stroke();
    }
  }
  ctx.restore();
}

// Anillo con marcas y contador central (celdas de ancho fijo). Si value > 360, el punto da
// más de una vuelta: la vuelta extra se dibuja en un anillo interior (p. ej. 560° = 1 vuelta + 200°).
function drawRing(ctx, e, lt, sceneOut) {
  const q = outQ(e, lt, sceneOut);
  const p = ease.inOutCubic(prog(lt, e.at ?? 0, e.dur ?? 1.6));
  if (p <= 0 || q >= 1) return;
  const r = e.r ?? 190, cx = CX + (e.x || 0), cy = CY + e.y;
  const value = e.value ?? 360;
  const total = 2 * Math.PI * (value / 360) * p;            // ángulo recorrido
  const start = -Math.PI / 2, TAU = 2 * Math.PI;
  ctx.save();
  ctx.globalAlpha = 1 - q;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.min(total, TAU));
  ctx.stroke();
  const inner = r - 24;
  if (total > TAU) {                                         // vuelta extra, en el anillo interior
    ctx.globalAlpha = (1 - q) * 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, inner, start, start + (total - TAU));
    ctx.stroke();
  }
  // marcas cada 30° de la primera vuelta
  ctx.lineWidth = 2;
  const p1 = Math.min(total / TAU, 1);
  for (let k = 0; k < 12; k++) {
    const f = k / 12;
    if (f > p1) break;
    const a = start + TAU * f;
    const m = ease.outCubic(clamp((p1 - f) * 6));
    ctx.globalAlpha = (1 - q) * 0.7 * m;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14));
    ctx.lineTo(cx + Math.cos(a) * (r + 14 + 16 * m), cy + Math.sin(a) * (r + 14 + 16 * m));
    ctx.stroke();
  }
  // punto que recorre el anillo (pasa al anillo interior en la vuelta extra)
  const a = start + total;
  const rr = total > TAU ? lerp(r, inner, clamp((total - TAU) / 0.35)) : r;
  ctx.globalAlpha = (1 - q) * (1 - smooth(0.92, 1, p) * 0.6);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 7, 0, TAU); ctx.fill();
  // contador
  const val = String(Math.round(value * p));
  ctx.font = fontOf({ size: e.size ?? 120, weight: 200 });
  ctx.letterSpacing = '0px';
  const cell = ctx.measureText('0').width;
  const deg = e.unit ?? '°';
  const degW = ctx.measureText(deg).width;
  const tw = cell * val.length + degW;
  let x = cx - tw / 2;
  ctx.globalAlpha = (1 - q) * clamp(p * 3);
  ctx.textBaseline = 'middle';
  for (const ch of val) { ctx.fillText(ch, x + (cell - ctx.measureText(ch).width) / 2, cy + 6); x += cell; }
  ctx.fillText(deg, x, cy + 6);
  ctx.restore();
}

// Pulso tipo radar: anillos que se expanden desde un punto.
function drawPulse(ctx, e, lt, sceneOut) {
  const q = outQ(e, lt, sceneOut);
  const p = prog(lt, e.at ?? 0, 0.6);
  if (p <= 0 || q >= 1) return;
  const cx = CX + (e.x || 0), cy = CY + e.y, r0 = e.r0 ?? 70, r1 = e.r1 ?? 300, period = e.period ?? 1.6;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const ph = (((lt - (e.at ?? 0)) / period + k / 3) % 1 + 1) % 1;
    ctx.globalAlpha = (1 - q) * p * 0.55 * Math.pow(1 - ph, 1.5);
    ctx.beginPath(); ctx.arc(cx, cy, lerp(r0, r1, ease.outCubic(ph)), 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}

// Etiquetas en cápsula (p. ej. plataformas), cada una con su tiempo.
function drawChips(ctx, e, lt, sceneOut) {
  const size = e.size ?? 44, gap = e.gap ?? 112;
  const n = e.items.length;
  e.items.forEach((it, i) => {
    const q = outQ(e, lt, sceneOut, i);
    const p = ease.outExpo(prog(lt, it.at, 0.8));
    if (p <= 0 || q >= 1) return;
    ctx.save();
    ctx.font = fontOf({ size, weight: 400 });
    ctx.letterSpacing = `${0.02 * size}px`;
    const tw = ctx.measureText(it.text).width;
    const w = tw + size * 1.6, h = size * 1.75;
    const cx = CX + (e.x || 0), cy = CY + e.y + (i - (n - 1) / 2) * gap - (1 - p) * 30 - q * 20;
    ctx.globalAlpha = (1 - q) * clamp(p * 1.5);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const per = 2 * (w + h);
    ctx.setLineDash([per * p, per]);
    ctx.stroke(roundRectPath(cx - w / 2, cy - h / 2, w, h, h / 2));
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.text, cx - tw / 2, cy + 2);
    ctx.restore();
  });
}

// Lectura del terreno: rejilla en perspectiva bajo el vehículo y una línea de escaneo.
function drawScan(ctx, e, lt, sceneOut) {
  const q = outQ(e, lt, sceneOut);
  const p = ease.outCubic(prog(lt, e.at ?? 0, 1.0));
  if (p <= 0 || q >= 1) return;
  const cx = CX, top = CY + e.y, w = e.w ?? 640, h = e.h ?? 220;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  // líneas horizontales que se alejan
  for (let k = 0; k <= 6; k++) {
    const f = k / 6, y = top + h * Math.pow(f, 1.6);
    const half = lerp(w * 0.32, w * 0.5, f) * p;
    ctx.globalAlpha = (1 - q) * 0.35 * clamp(p * 2 - f);
    ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
  }
  // líneas que convergen
  for (let k = -4; k <= 4; k++) {
    ctx.globalAlpha = (1 - q) * 0.3 * p;
    ctx.beginPath(); ctx.moveTo(cx + k * w * 0.08 * p, top); ctx.lineTo(cx + k * w * 0.125 * p, top + h); ctx.stroke();
  }
  // barrido de escaneo
  const ph = (((lt - (e.at ?? 0)) / (e.period ?? 1.4)) % 1 + 1) % 1;
  const y = top + h * ease.inOutSine(ph);
  const half = lerp(w * 0.32, w * 0.5, ph) * p;
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = (1 - q) * p * 0.9;
  ctx.fillStyle = g;
  ctx.fillRect(cx - half, y - 1.5, 2 * half, 3);
  ctx.restore();
}

// Partículas de polvo de luz, muy tenues (profundidad sin velo).
function drawDust(ctx, t, amount) {
  if (amount <= 0) return;
  ctx.save();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 46; i++) {
    const r1 = Math.sin(i * 12.9898) * 43758.5453, r2 = Math.sin(i * 78.233) * 12345.678;
    const fx = r1 - Math.floor(r1), fy = r2 - Math.floor(r2);
    const sp = 6 + 14 * ((i * 7) % 5);
    const x = (fx * W + Math.sin(t * 0.3 + i) * 18) % W;
    const y = ((fy * H - t * sp) % H + H) % H;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 3.1);
    ctx.globalAlpha = amount * (0.05 + 0.12 * tw);
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + (i % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const DRAW = { text: drawText, icon: drawIcon, iconlabel: drawIconLabel, iconrow: drawIconRow, rule: drawRule,
  image: drawImage, counter: drawCounter, stars: drawStars, screens: drawScreens, ring: drawRing, pulse: drawPulse,
  chips: drawChips, scan: drawScan };

export function drawScene(ctx, scene, t) {
  const lt = t - scene.t0;
  const outDur = scene.outDur ?? 0.4;
  const outAt = scene.t1 - scene.t0 - outDur;
  const sceneOut = (i) => (scene.cut ? 0 : ease.inCubic(prog(lt, outAt + i * 0.03, outDur)));
  // acercamiento muy lento durante toda la escena: nunca queda totalmente quieta
  const z = 1 + (scene.drift ?? 0.03) * ease.inOutSine(clamp(lt / Math.max(scene.t1 - scene.t0, 0.5)));
  ctx.save();
  ctx.translate(CX, CY); ctx.scale(z, z); ctx.translate(-CX, -CY);
  for (const e of scene.els) DRAW[e.type](ctx, e, lt, sceneOut);
  ctx.restore();
}

// ---------------------------------------------------------------- lente de cristal (WebGL)
const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex;
uniform vec2 res;
uniform vec2 c;          // centro de la lente (px)
uniform float sx, aspect, n, rimK, rimW, waveK, wavePos, mag, ca, light, body, wobble, clipK, time, weight, side;
float organic(float th, float t){
  return 0.55*sin(3.*th+1.7*t+.4)+0.30*sin(5.*th-2.3*t+1.9)+0.20*sin(2.*th+1.1*t+3.1)+0.12*sin(8.*th-3.7*t+.7);
}
float lobe(float th, float ctr, float w){ float d = mod(th-ctr+3.14159265, 6.2831853)-3.14159265; return exp(-(d*d)/(w*w)); }
float field(vec2 q){            // distancia firmada aproximada a la superelipse (px)
  float sy = sx*aspect;
  float rn = pow(pow(abs(q.x/sx), n) + pow(abs(q.y/sy), n), 1./n);
  float th = atan(q.y, q.x);
  return (rn-1.)*sx + wobble*organic(th, time);
}
float samp(vec2 px){ return texture(tex, px/res).r; }   // fila 0 del canvas = v 0
void main(){
  vec2 px = vec2(uv.x, 1.-uv.y)*res;      // y hacia abajo, como el canvas
  if (sx <= 0.) { float v = samp(px); o = vec4(vec3(v)*weight, weight); return; }
  vec2 q = px - c;
  float d = field(q);
  vec2 g = vec2(field(q+vec2(1,0))-field(q-vec2(1,0)), field(q+vec2(0,1))-field(q-vec2(0,1)))*0.5;
  vec2 nrm = g/(length(g)+1e-6);
  float rn = 1. + d/sx;
  float rho = clamp(rn, 0., 1.);
  float th = atan(q.y, q.x);
  // desplazamiento: borde + onda interior (lupas de agua)
  float w = rimW, d0 = -0.55*w;
  float disp = -rimK*(d-d0)*exp(-pow((d-d0)/w,2.));
  float dw = -(1.-wavePos)*sx, ww = 0.22*sx+30.;
  disp += -waveK*0.85*(d-dw)*exp(-pow((d-dw)/ww,2.));
  disp *= smoothstep(0.02, 0.22, rn);
  float ph = 0.9*time;
  float sect = 0.15 + 0.85*max(max(lobe(th,-0.8+ph,0.55), 0.9*lobe(th,2.4+0.7*ph,0.45)), 0.6*lobe(th,1.1-0.5*ph,0.35));
  sect = mix(sect, 0.1+0.9*max(lobe(th,0.,0.45), lobe(th,3.14159,0.45)), side);
  float strength = clamp(abs(disp)/(0.25*w+1e-3), 0., 1.);
  float e = ca*sect*strength;
  float f = 1./mag + (1.-1./mag)*rho*rho;
  vec3 col;
  for (int ch=0; ch<3; ch++){
    float ec = ch==0 ? 1. : (ch==1 ? 0. : -1.);
    float k = 1. + ec*e;
    float fc = 1. + (f-1.)*(1.+0.12*ec*e);
    vec2 sp = c + q*fc + nrm*disp*k;
    col[ch] = samp(sp);
  }
  col *= 1. - clipK*smoothstep(-3., 2., d);
  // reflejos del contorno por sectores (fríos y algunos cálidos), con desfase RGB
  float cool = max(max(lobe(th,-0.75+ph,0.5), 0.75*lobe(th,1.35+0.8*ph,0.32)), 0.9*lobe(th,2.9-0.4*ph,0.42));
  float warm = max(0.8*lobe(th,2.45+0.7*ph,0.22), 0.6*lobe(th,-1.9+ph,0.18));
  float sl = max(max(lobe(th,0.,0.38), lobe(th,3.14159,0.38)), 0.7*max(lobe(th,0.35,0.15), lobe(th,3.44,0.15)));
  cool = mix(cool, sl, side); warm = mix(warm, 0.6*sl, side);
  float chunk = clamp(0.55 + 0.65*sin(7.*th+2.5*time)*sin(3.*th-1.3*time+.5), 0.15, 1.2);
  float cs = 2. + 5.*ca;
  vec3 tc = vec3(0.55,0.80,1.0), tw = vec3(1.0,0.55,0.30), glow;
  for (int ch=0; ch<3; ch++){
    float ec = ch==0 ? 1. : (ch==1 ? 0. : -1.);
    float dd = d + ec*cs*(cool+warm);
    float band = exp(-pow((dd+0.25*w)/(0.28*w+1.5),2.));
    float soft = exp(-pow((dd+0.25*w)/(1.2*w+6.),2.));        // halo suave (sustituye al bloom)
    float inner = exp(-pow((dd+0.95*w)/(0.12*w+1.),2.));
    float ghost = exp(-pow((dd-0.6*w)/(0.07*w+1.),2.));
    float bd = exp(-pow((dd+0.35*w)/(0.55*w),2.));
    float fill = exp(-pow((dd+0.5*w)/(1.1*w),2.));
    glow[ch] = light*chunk*(band*(tc[ch]*cool*2.6 + tw[ch]*warm*1.2) + 0.18*soft*(tc[ch]*cool + tw[ch]*warm)
               + 0.45*inner*cool*tc[ch] + 0.22*ghost*cool*tc[ch])
             + body*(0.14*bd*vec3(0.75,0.85,1.0)[ch] + 0.10*fill*vec3(0.30,0.50,1.0)[ch]);
  }
  col = 1. - (1.-col)*(1.-clamp(glow,0.,1.));
  o = vec4(col*weight, weight);
}`;

export class Renderer {
  constructor(outCanvas) {
    this.scene = document.createElement('canvas');
    this.scene.width = W; this.scene.height = H;
    this.ctx = this.scene.getContext('2d', { willReadFrequently: false });
    this.out = outCanvas;
    outCanvas.width = W; outCanvas.height = H;
    const gl = this.gl = outCanvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prg = this.prg = gl.createProgram();
    gl.attachShader(prg, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prg, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prg);
    if (!gl.getProgramParameter(prg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prg));
    gl.useProgram(prg);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prg, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = {};
    for (const k of ['tex', 'res', 'c', 'sx', 'aspect', 'n', 'rimK', 'rimW', 'waveK', 'wavePos', 'mag', 'ca', 'light',
      'body', 'wobble', 'clipK', 'time', 'weight', 'side']) this.u[k] = gl.getUniformLocation(prg, k);
    gl.uniform2f(this.u.res, W, H);
    gl.viewport(0, 0, W, H);
  }

  // Dibuja el cuadro de tiempo t. subframes > 1 → motion blur (obturador 180°).
  render(t, story, subframes = 1) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let s = 0; s < subframes; s++) {
      const ts = subframes > 1 ? t + ((s + 0.5) / subframes - 0.5) * (0.5 / FPS) : t;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      story.draw(ctx, ts);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
      const L = story.lens(ts);
      gl.uniform2f(this.u.c, L.cx ?? CX, L.cy ?? CY);
      for (const k of ['sx', 'aspect', 'n', 'rimK', 'rimW', 'waveK', 'wavePos', 'mag', 'ca', 'light', 'body', 'wobble', 'clipK', 'side'])
        gl.uniform1f(this.u[k], L[k] ?? 0);
      gl.uniform1f(this.u.time, ts);
      gl.uniform1f(this.u.weight, 1 / subframes);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
  }
}

// ---------------------------------------------------------------- eventos de lente
// Cada evento devuelve los parámetros de la lente para un tiempo local u ∈ [0,1].
// 'sweep'  : transición entre escenas; el cambio queda oculto en la máxima refracción (u≈0.38).
// 'reveal' : el contenido aparece solo dentro de la lente que se abre (como el bumper).
// 'pass'   : una lupa de agua cruza el texto de lado a lado.
const NEUTRAL = { sx: 0 };
export const SWEEP_SWAP = 0.38;

function sweepLens(u) {
  // forma: gota redonda → crece → se disuelve fuera del cuadro
  const grow = ease.inOutCubic(clamp(u / 0.38));
  const open = ease.inExpo(clamp((u - 0.38) / 0.62));
  const sx = lerp(40, 330, grow) + open * 1300;
  const env = Math.sin(Math.PI * clamp(u)) ** 0.8;
  return {
    sx, aspect: 1 + 0.25 * open, n: 2.0, rimK: 0.85 * env, rimW: 40 + 50 * open,
    waveK: 0.8 * Math.sin(Math.PI * clamp(u * 1.4)), wavePos: lerp(0.2, 1.0, u),
    mag: 1 - 0.32 * Math.exp(-Math.pow((u - 0.38) / 0.14, 2)) + 0.12 * open * (1 - open),
    ca: 0.55 * env, light: env, body: 0.35 * env, wobble: 6 + 10 * u, clipK: 0, side: open * 0.6,
  };
}

function revealLens(u) {
  // como el bumper: lente pequeña revela el contenido, crece, refracta y se disuelve
  const sx = lerp(30, 360, ease.outCubic(clamp(u / 0.45))) + ease.inExpo(clamp((u - 0.45) / 0.55)) * 1400;
  const fade = 1 - smooth(0.62, 1.0, u);
  return {
    sx, aspect: 1 + 0.6 * smooth(0.5, 1, u), n: 2.0, rimK: 0.85 * fade, rimW: lerp(30, 80, u),
    waveK: 0.7 * Math.sin(Math.PI * clamp(u / 0.7)) * fade, wavePos: lerp(0.1, 1, u),
    mag: lerp(1.25, 1.0, smooth(0, 0.7, u)), ca: 0.45 * fade, light: smooth(0, 0.1, u) * fade,
    body: 0.4 * fade, wobble: 5 + 12 * u, clipK: 1 - smooth(0.55, 0.9, u), side: smooth(0.55, 0.8, u),
  };
}

function passLens(u, ev) {
  const x = lerp(-320, W + 320, ease.inOutSine(u)) * (ev.dir === -1 ? -1 : 1) + (ev.dir === -1 ? W : 0);
  const env = Math.sin(Math.PI * u);
  return {
    cx: x, cy: CY + (ev.y || 0), sx: ev.r || 220, aspect: ev.aspect || 1.35, n: 2.0,
    rimK: 0.8 * env, rimW: 48, waveK: 0, wavePos: 1, mag: 1 + 0.22 * env, ca: 0.5 * env, light: 0.9 * env,
    body: 0.3 * env, wobble: 8, clipK: 0, side: 0,
  };
}

export function lensAt(events, t) {
  for (const ev of events) {
    const u = (t - ev.t0) / ev.dur;
    if (u < 0 || u > 1) continue;
    if (ev.type === 'sweep') return sweepLens(u);
    if (ev.type === 'reveal') return revealLens(u);
    if (ev.type === 'pass') return passLens(u, ev);
  }
  return NEUTRAL;
}

export { drawDust };
