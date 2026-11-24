// Motor del overlay Black Friday · 2160×3840 · 24 fps · fondo transparente (canal alfa).
// Capa 2D (letras de plata, barra de vidrio, logos) → WebGL (motion blur por submuestras
// con alfa premultiplicado) → píxeles RGBA con alfa recto para ProRes 4444.

export const W = 2160, H = 3840, FPS = 24;
export const SAFE = { top: 0.15 * H, bottom: 0.75 * H, left: 0.12 * W, right: 0.88 * W };
export const TITLE_Y = 0.59 * H;                 // centro óptico de los títulos (58–60 %)

// ---------------------------------------------------------------- utilidades
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, t0, d) => clamp((t - t0) / d);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = {
  // arranque veloz y desaceleración larga
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inQuad: (t) => t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
export const frames = (n) => n / FPS;

// ---------------------------------------------------------------- recursos
export const images = {};
export async function loadImage(name, url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  images[name] = img;
}

// Fuentes: nombres lógicos → archivo (Gotham si el cliente la entrega; Montserrat como sustituto libre).
export async function loadFonts(map) {
  for (const [family, spec] of Object.entries(map)) {
    const f = new FontFace(family, `url(${spec.url})`, { weight: spec.weight || 'normal', style: spec.style || 'normal' });
    await f.load();
    document.fonts.add(f);
  }
}

const icons = {};
export async function loadIcon(name, url) {
  const txt = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const parts = [];
  for (const el of doc.querySelectorAll('path')) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', el.getAttribute('d'));
    svg.appendChild(p);
    parts.push({ path: new Path2D(el.getAttribute('d')), len: p.getTotalLength() });
  }
  svg.remove();
  icons[name] = parts;
}

// Capas auxiliares del tamaño del cuadro
function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
const L1 = layer(), L1c = L1.getContext('2d');
const L2 = layer(), L2c = L2.getContext('2d');

// Textura de cepillado: trazos horizontales finos, claros y oscuros
const BRUSH = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const y = rnd() * 512, x = rnd() * 1024, len = 80 + rnd() * 600, a = 0.025 + rnd() * 0.07;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(20,30,50,${a * 0.8})`;
    g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 2); g.stroke();
  }
  return c;
})();

// ---------------------------------------------------------------- texto de plata cepillada
const NAVY = '#0c1a4f';
export function font(spec) {
  return `${spec.style || 'normal'} ${spec.weight || 'normal'} ${spec.size}px "${spec.family}"`;
}

// Posiciones finales de cada letra conservando el espaciado de la fuente (kerning).
export function layoutLetters(ctx, text, spec) {
  ctx.font = font(spec);
  ctx.letterSpacing = `${(spec.tracking || 0) * spec.size}px`;
  const total = ctx.measureText(text).width;
  const letters = [];
  for (let i = 0; i < text.length; i++) {
    const x0 = ctx.measureText(text.slice(0, i)).width;
    const w = ctx.measureText(text[i]).width;
    letters.push({ ch: text[i], x: x0, w });
  }
  return { letters, total };
}

// Gradiente de plata con contraste suave, anclado a la línea base del texto.
function silverGradient(ctx, y, size) {
  const g = ctx.createLinearGradient(0, y - size * 0.78, 0, y + size * 0.04);
  g.addColorStop(0.00, '#f7f9fc');
  g.addColorStop(0.30, '#d9dee6');
  g.addColorStop(0.48, '#b4bbc7');
  g.addColorStop(0.56, '#c9ced8');
  g.addColorStop(0.70, '#eef1f5');
  g.addColorStop(1.00, '#a2aab8');
  return g;
}

/**
 * Dibuja un conjunto de letras de plata. glyphs: [{ch, x, y, s, a}] (x,y = centro de la letra en
 * su posición, s = escala, a = opacidad). glint ∈ [0,1] recorre el filo superior; <0 = sin destello.
 * Contorno, bisel y destello salen de la forma rellena (no de strokeText), así los contornos
 * superpuestos de algunas fuentes no dejan líneas internas.
 */
export function drawSilver(ctx, glyphs, spec, glint = -1) {
  const size = spec.size;
  const fillAt = (c, g, dx, dy, style) => {
    c.save();
    c.translate(g.x, g.y);
    c.scale(g.s, g.s);
    c.font = font(spec);
    c.letterSpacing = '0px';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = typeof style === 'function' ? style(c, size * 0.36) : style;
    c.fillText(g.ch, dx, size * 0.36 + dy);    // línea base: el centro óptico de mayúsculas queda en y
    c.restore();
  };
  const live = glyphs.filter((g) => g.a > 0);
  if (!live.length) return;
  const ring = (c, r, style, alpha) => {
    const n = Math.max(16, Math.min(48, Math.round(r * 1.2)));        // pasos según el radio: borde sin escalones
    for (let k = 0; k < n; k++) {
      const an = (k / n) * Math.PI * 2;
      for (const g of live) { c.globalAlpha = g.a * alpha; fillAt(c, g, Math.cos(an) * r, Math.sin(an) * r, style); }
    }
    c.globalAlpha = 1;
  };
  const clear = (c) => { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, H); };
  // 1) filo: resplandor azul tenue + contorno azul marino (dilatación de la forma)
  clear(L2c);
  ring(L2c, size * 0.042, 'rgba(70,120,255,1)', 0.5);
  ctx.save();
  ctx.filter = `blur(${Math.max(1, size * 0.008)}px)`;               // resplandor azul suave
  ctx.drawImage(L2, 0, 0);
  ctx.restore();
  clear(L2c);
  ring(L2c, size * 0.026, NAVY, 1);
  ctx.drawImage(L2, 0, 0);
  // 2) relleno de plata + cepillado en una capa aislada
  clear(L1c);
  for (const g of live) { L1c.globalAlpha = g.a; fillAt(L1c, g, 0, 0, (c, y) => silverGradient(c, y, size)); }
  L1c.globalAlpha = 1;
  L1c.globalCompositeOperation = 'source-atop';
  L1c.fillStyle = L1c.createPattern(BRUSH, 'repeat');
  L1c.fillRect(0, 0, W, H);
  L1c.globalCompositeOperation = 'source-over';
  ctx.drawImage(L1, 0, 0);
  // 3) bisel: media luna superior = forma − forma desplazada hacia abajo
  const bevel = (shift) => {
    clear(L2c);
    for (const g of live) { L2c.globalAlpha = g.a; fillAt(L2c, g, 0, 0, '#ffffff'); }
    L2c.globalAlpha = 1;
    L2c.globalCompositeOperation = 'destination-out';
    for (const g of live) fillAt(L2c, g, 0, shift, '#000');
    L2c.globalCompositeOperation = 'source-over';
  };
  bevel(size * 0.014);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.drawImage(L2, 0, 0);
  ctx.restore();
  // 4) destello fino que recorre el filo y desaparece
  if (glint >= 0 && glint <= 1) {
    bevel(size * 0.03);
    const span = spec.span || size * 4, cx = spec.cx ?? W / 2;
    const gx = cx + lerp(-span * 0.6, span * 0.6, glint);
    L2c.globalCompositeOperation = 'source-in';
    const band = L2c.createLinearGradient(gx - size * 0.45, 0, gx + size * 0.45, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,1)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    L2c.fillStyle = band;
    L2c.fillRect(0, 0, W, H);
    L2c.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.sin(Math.PI * glint);
    ctx.drawImage(L2, 0, 0);
    ctx.drawImage(L2, 0, 0);
    ctx.restore();
  }
}

/**
 * Palabra que llega en profundidad: las letras se reparten en dos grupos (izquierda/derecha),
 * nacen enormes desde detrás de cámara y convergen a su sitio. Devuelve los glifos del instante.
 * spec: {text, size, family, weight, tracking, cx, cy, t0, dur(s), stagger(s), from:'sides'|'left'|'right'}
 */
export function flyGlyphs(ctx, spec, t, exit = 0) {
  const { letters, total } = layoutLetters(ctx, spec.text, spec);
  const n = letters.length;
  const mid = spec.split ?? Math.ceil(n / 2);
  const dur = spec.dur ?? frames(14);
  const st = spec.stagger ?? frames(1.5);
  const out = [];
  letters.forEach((L, i) => {
    if (L.ch === ' ') return;
    const left = i < mid;
    // orden: desde los extremos hacia el centro en ambos lados a la vez
    const order = left ? i : n - 1 - i;
    const p = clamp((t - spec.t0 - order * st) / dur);
    if (p <= 0) return;
    const e = ease.outExpo(p);
    const fx = spec.cx - total / 2 + L.x + L.w / 2;
    const fy = spec.cy;
    const side = spec.from === 'left' ? -1 : spec.from === 'right' ? 1 : (left ? -1 : 1);
    const sx = spec.cx + side * W * (0.55 + 0.12 * (left ? mid - 1 - i : i - mid));
    const s0 = spec.s0 ?? 9;
    const x = lerp(sx, fx, e);
    const y = lerp(fy + H * 0.06, fy, e);
    const s = lerp(s0, 1, e);
    // salida: se aleja hacia el fondo y se desvanece
    const q = exit;
    out.push({ ch: L.ch, x: x + (q ? side * q * 60 : 0), y, s: s * (1 - 0.25 * q), a: clamp(p * 6) * (1 - q), p });
  });
  return out;
}

// ---------------------------------------------------------------- texto blanco de apoyo
// Entra con tracking abierto que se cierra y una escala que se asienta.
export function drawWhite(ctx, spec, t, exit = 0) {
  const p = ease.outExpo(prog(t, spec.t0, spec.dur ?? frames(14)));
  if (p <= 0 || exit >= 1) return;
  const s = lerp(spec.s0 ?? 1.12, 1, p);
  const track = (spec.tracking ?? 0.06) + (1 - p) * (spec.open ?? 0.35);
  ctx.save();
  ctx.translate(spec.cx, spec.cy);
  ctx.scale(s, s);
  ctx.globalAlpha = clamp(p * 2) * (1 - exit) * (spec.alpha ?? 1);
  ctx.fillStyle = spec.color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (spec.runs) {
    // tramos con distinta fuente en la misma línea: [{text, family, weight}]
    const parts = spec.runs.map((r) => {
      ctx.font = font({ ...spec, ...r });
      ctx.letterSpacing = `${track * spec.size}px`;
      return { ...r, w: ctx.measureText(r.text).width };
    });
    const gap = spec.size * (spec.gap ?? 0.45);
    const tw = parts.reduce((a, r) => a + r.w, 0) + gap * (parts.length - 1);
    let x = -tw / 2;
    ctx.textAlign = 'left';
    for (const r of parts) {
      ctx.font = font({ ...spec, ...r });
      ctx.letterSpacing = `${track * spec.size}px`;
      if (r.sep) {
        ctx.globalAlpha *= 0.75;
        ctx.fillRect(x + r.w / 2 - spec.size * 0.03, -spec.size * 0.55, spec.size * 0.06, spec.size * 1.1);
        ctx.globalAlpha /= 0.75;
      } else ctx.fillText(r.text, x, 0);
      x += r.w + gap;
    }
  } else {
    ctx.font = font(spec);
    ctx.letterSpacing = `${track * spec.size}px`;
    ctx.fillText(spec.text, 0, 0);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cápsula de vidrio
function capsule(x, y, w, h) {
  const r = h / 2, p = new Path2D();
  p.moveTo(x + r, y); p.lineTo(x + w - r, y);
  p.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  p.lineTo(x + r, y + h);
  p.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  p.closePath();
  return p;
}

/** Barra de vidrio translúcido (azul → rojo), filo brillante y reflejo que se desliza. */
export function drawGlassBar(ctx, spec, t, exit = 0) {
  const p = ease.outExpo(prog(t, spec.t0, spec.dur ?? frames(12)));
  if (p <= 0 || exit >= 1) return;
  const w = Math.max(spec.h, spec.w * p), h = spec.h * lerp(0.6, 1, p);
  const x = spec.cx - w / 2, y = spec.cy - h / 2;
  const path = capsule(x, y, w, h);
  ctx.save();
  ctx.globalAlpha = (1 - exit) * clamp(p * 3);
  // cuerpo translúcido
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(22,62,226,0.80)');
  g.addColorStop(0.55, 'rgba(52,36,170,0.74)');
  g.addColorStop(1, 'rgba(214,18,46,0.80)');
  ctx.fillStyle = g;
  ctx.fill(path);
  // volumen: brillo superior y sombra interior inferior
  ctx.save();
  ctx.clip(path);
  const v = ctx.createLinearGradient(0, y, 0, y + h);
  v.addColorStop(0, 'rgba(255,255,255,0.42)');
  v.addColorStop(0.22, 'rgba(255,255,255,0.10)');
  v.addColorStop(0.55, 'rgba(255,255,255,0)');
  v.addColorStop(1, 'rgba(5,10,40,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(x, y, w, h);
  // reflejo que se desliza (banda diagonal)
  const ru = prog(t, spec.t0 + (spec.dur ?? frames(12)) * 0.6, spec.sweep ?? 0.9);
  if (ru > 0 && ru < 1) {
    const bx = lerp(x - h * 2, x + w + h * 2, ease.inOutSine(ru));
    const rg = ctx.createLinearGradient(bx - h, y, bx + h, y + h);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  // filo brillante (resplandor del borde, sin sombra proyectada)
  ctx.lineWidth = Math.max(3, h * 0.035);
  const e = ctx.createLinearGradient(x, 0, x + w, 0);
  e.addColorStop(0, 'rgba(150,210,255,1)');
  e.addColorStop(0.5, 'rgba(235,240,255,0.95)');
  e.addColorStop(1, 'rgba(255,150,160,1)');
  ctx.strokeStyle = e;
  ctx.shadowColor = 'rgba(90,160,255,0.85)';
  ctx.shadowBlur = h * 0.18;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ---------------------------------------------------------------- logos
/** Logo con escala discreta y barrido de luz recortado a su silueta. */
export function drawLogo(ctx, spec, t, exit = 0) {
  const img = images[spec.name];
  const p = ease.outExpo(prog(t, spec.t0, spec.dur ?? frames(14)));
  if (p <= 0 || exit >= 1) return;
  const s = lerp(spec.s0 ?? 1.08, 1, p) * (1 - 0.06 * exit);
  const w = spec.w * s, h = w * img.height / img.width;
  const x = spec.cx - w / 2, y = spec.cy - h / 2;
  const a = clamp(p * 2.5) * (1 - exit);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  const su = spec.sweepAt != null ? prog(t, spec.sweepAt, spec.sweepDur ?? 0.7) : -1;
  if (su > 0 && su < 1) {
    L1c.setTransform(1, 0, 0, 1, 0, 0);
    L1c.globalCompositeOperation = 'source-over';
    L1c.clearRect(0, 0, W, H);
    L1c.globalAlpha = 1;
    L1c.drawImage(img, x, y, w, h);
    L1c.globalCompositeOperation = 'source-in';
    const bx = lerp(x - w * 0.4, x + w * 1.4, ease.inOutSine(su));
    const g = L1c.createLinearGradient(bx - w * 0.12, y, bx + w * 0.12, y + h * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    L1c.fillStyle = g;
    L1c.fillRect(x, y, w, h);
    L1c.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * Math.sin(Math.PI * su);
    ctx.drawImage(L1, 0, 0);
    ctx.restore();
  }
}

/** Firma horizontal: logo Mayella a la izquierda + Black Friday a la derecha. */
export function drawFirma(ctx, spec, t, exit = 0) {
  const m = images[spec.left], b = images[spec.right];
  const p = ease.outExpo(prog(t, spec.t0, spec.dur ?? frames(12)));
  if (p <= 0 || exit >= 1) return;
  const s = lerp(spec.s0 ?? 1.15, 1, p);
  const total = spec.w * s, gap = total * 0.05;
  // ambos a la misma altura visual
  const hh = (total - gap) / (m.width / m.height + b.width / b.height);
  const mw = hh * m.width / m.height, bw = hh * b.width / b.height;
  const x0 = spec.cx - total / 2, y0 = spec.cy - hh / 2;
  ctx.save();
  ctx.globalAlpha = clamp(p * 2.5) * (1 - exit);
  ctx.drawImage(m, x0, y0, mw, hh);
  ctx.drawImage(b, x0 + mw + gap, y0, bw, hh);
  ctx.restore();
  return { x: x0, y: y0, w: total, h: hh };
}

/** Ícono de trazo (Lucide) que se dibuja. */
export function drawIcon(ctx, spec, t, exit = 0) {
  const parts = icons[spec.name];
  const p = ease.inOutCubic(prog(t, spec.t0, spec.dur ?? 0.6));
  if (p <= 0 || exit >= 1) return;
  const sc = spec.size / 24;
  ctx.save();
  ctx.translate(spec.cx, spec.cy);
  ctx.scale(sc, sc);
  ctx.translate(-12, -12);
  ctx.lineWidth = spec.stroke ?? 1.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.globalAlpha = (1 - exit);
  for (const part of parts) {
    ctx.setLineDash([part.len, part.len + 1]);
    ctx.lineDashOffset = part.len * (1 - p);
    ctx.stroke(part.path);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- render WebGL con alfa
const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;
// acumula el cuadro 2D (premultiplicado) con peso
const FRAG_ACC = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o; uniform sampler2D tex; uniform float weight;
void main(){ o = texture(tex, vec2(uv.x, 1.-uv.y)) * weight; }`;
// pasa la acumulación a alfa recto (lo que espera ProRes 4444)
const FRAG_OUT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o; uniform sampler2D acc;
void main(){ vec4 c = texture(acc, uv); o = c.a > 0.0001 ? vec4(c.rgb / c.a, c.a) : vec4(0.); }`;

export class Renderer {
  constructor(outCanvas) {
    this.scene = layer();
    this.ctx = this.scene.getContext('2d');
    outCanvas.width = W; outCanvas.height = H;
    const gl = this.gl = outCanvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: true, antialias: false });
    gl.getExtension('EXT_color_buffer_float');
    const prog_ = (fs) => {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    this.pAcc = prog_(FRAG_ACC); this.pOut = prog_(FRAG_OUT);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.pAcc, this.pOut]) {
      const loc = gl.getAttribLocation(p, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    const mkTex = (internal, fmt, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      if (internal) gl.texImage2D(gl.TEXTURE_2D, 0, internal, W, H, 0, fmt, type, null);
      return t;
    };
    this.src = mkTex();
    this.accTex = mkTex(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
  }

  render(t, story, maxSub = 5) {
    const gl = this.gl, ctx = this.ctx;
    const sub = story.moving(t) ? maxSub : 1;              // desenfoque solo durante el viaje
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pAcc);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    for (let s = 0; s < sub; s++) {
      const ts = sub > 1 ? t + ((s + 0.5) / sub - 0.5) * (0.5 / FPS) : t;   // obturador 180°
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      story.draw(ctx, ts);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.src);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
      gl.uniform1f(gl.getUniformLocation(this.pAcc, 'weight'), 1 / sub);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.pOut);
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return sub;
  }
}
