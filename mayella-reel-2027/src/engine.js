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

function setFont(ctx, e) {
  ctx.font = `${e.weight || 300} ${e.size}px ${FONT[e.family || 'display']}`;
}

// Texto palabra por palabra: cada palabra sube desde una máscara, con tracking que se cierra.
function drawText(ctx, e, lt, sceneOut) {
  const words = e.text.split(' ');
  setFont(ctx, e);
  const track0 = (e.tracking ?? 0.04) * e.size;
  const stagger = e.stagger ?? 0.07, dur = e.dur ?? 0.9, at = e.at ?? 0;
  // ancho con el tracking final para que el bloque quede centrado al asentarse
  ctx.letterSpacing = `${track0}px`;
  const space = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1);
  let x = CX - total / 2;
  const y = CY + e.y;
  ctx.save();
  // máscara de línea: las palabras emergen por debajo de esta franja
  ctx.beginPath();
  ctx.rect(0, y - e.size * 1.15, W, e.size * 1.55);
  ctx.clip();
  words.forEach((w, i) => {
    const p = ease.outExpo(prog(lt, at + i * stagger, dur));
    const q = sceneOut(i);
    if (p <= 0 || q >= 1) { x += widths[i] + space; return; }
    const extra = (1 - p) * 0.22 * e.size;            // tracking que se cierra al entrar
    ctx.letterSpacing = `${track0 + extra}px`;
    const wNow = ctx.measureText(w).width;
    ctx.globalAlpha = (e.alpha ?? 1) * p * (1 - q);
    const dy = (1 - p) * e.size * 0.95 - q * e.size * 0.35;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(w, x + (widths[i] - wNow) / 2, y + dy);
    x += widths[i] + space;
  });
  ctx.restore();
}

function drawIcon(ctx, e, lt, sceneOut) {
  const parts = icons[e.name];
  if (!parts) throw new Error('ícono no cargado: ' + e.name);
  const p = ease.inOutCubic(prog(lt, e.at ?? 0, e.dur ?? 1.1));
  const q = sceneOut(0);
  if (p <= 0 || q >= 1) return;
  const s = e.size / 24;
  ctx.save();
  ctx.translate(CX + (e.x || 0), CY + e.y);
  const pop = ease.outCubic(prog(lt, e.at ?? 0, (e.dur ?? 1.1) * 0.8));
  ctx.scale(s * (0.9 + 0.1 * pop), s * (0.9 + 0.1 * pop));
  ctx.translate(-12, -12);
  ctx.lineWidth = (e.stroke ?? 1.1);
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

// Línea fina que se abre desde el centro.
function drawRule(ctx, e, lt, sceneOut) {
  const p = ease.outExpo(prog(lt, e.at ?? 0, e.dur ?? 1.0));
  const q = sceneOut(0);
  if (p <= 0 || q >= 1) return;
  const half = (e.w / 2) * p * (1 - 0.6 * q);
  ctx.save();
  ctx.globalAlpha = (e.alpha ?? 0.7) * (1 - q);
  const g = ctx.createLinearGradient(CX - half, 0, CX + half, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(CX - half, CY + e.y - (e.h || 2) / 2, 2 * half, e.h || 2);
  ctx.restore();
}

function drawImage(ctx, e, lt, sceneOut) {
  const img = images[e.name];
  const p = ease.outCubic(prog(lt, e.at ?? 0, e.dur ?? 0.8));
  const q = sceneOut(0);
  if (p <= 0 || q >= 1) return;
  const w = e.w * (e.grow ? lerp(0.94, 1, ease.outExpo(prog(lt, e.at ?? 0, 2.0))) : 1);
  const h = w * img.height / img.width;
  ctx.save();
  ctx.globalAlpha = (e.fade === false ? 1 : p) * (1 - q);
  ctx.drawImage(img, CX + (e.x || 0) - w / 2, CY + e.y - h / 2, w, h);
  ctx.restore();
}

// Número que rueda (p. ej. 2027): cada dígito pasa por valores anteriores antes de fijarse.
function drawCounter(ctx, e, lt, sceneOut) {
  const str = String(e.to);
  const from = String(e.from ?? 0).padStart(str.length, '0');
  setFont(ctx, e);
  ctx.letterSpacing = `${(e.tracking ?? 0.02) * e.size}px`;
  const dw = str.split('').map((c) => ctx.measureText(c).width);
  const total = dw.reduce((s, w) => s + w, 0);
  let x = CX - total / 2;
  const y = CY + e.y;
  const q = sceneOut(0);
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

// Fila de íconos con etiqueta debajo (lista de características).
function drawIconRow(ctx, e, lt, sceneOut) {
  const n = e.items.length;
  const gap = e.gap ?? 300;
  e.items.forEach((it, i) => {
    const x = (i - (n - 1) / 2) * gap;
    const at = (e.at ?? 0) + i * (e.stagger ?? 0.18);
    drawIcon(ctx, { name: it.icon, x, y: e.y, size: e.size ?? 110, at, dur: 1.0, stroke: e.stroke }, lt, sceneOut);
    const sub = { text: it.label, y: e.y + (e.size ?? 110) * 0.5 + 78, size: e.labelSize ?? 34, weight: 500,
      family: 'text', tracking: 0.14, at: at + 0.35, dur: 0.8, stagger: 0.05 };
    ctx.save();
    ctx.translate(x, 0);
    drawText(ctx, sub, lt, sceneOut);
    ctx.restore();
  });
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

const DRAW = { text: drawText, icon: drawIcon, rule: drawRule, image: drawImage, counter: drawCounter, iconrow: drawIconRow };

export function drawScene(ctx, scene, t) {
  const lt = t - scene.t0;
  const outAt = scene.t1 - scene.t0 - (scene.outDur ?? 0.45);
  const sceneOut = (i) => (scene.cut ? 0 : ease.inCubic(prog(lt, outAt + i * 0.04, scene.outDur ?? 0.45)));
  for (const e of scene.els) DRAW[e.type](ctx, e, lt, sceneOut);
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
