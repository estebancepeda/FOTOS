// Guion de animación · Reel Honda Black Friday · Auto Mayella
// Tiempos en segundos desde el primer fotograma del video (24 fps, 28,375 s = 681 cuadros).
// Los tiempos de voz salen de la tabla del cliente y se afinan al fotograma con el audio real
// (transcript/cues.json, si existe, sobrescribe los valores de CUE).
import { W, H, FPS, TITLE_Y, frames, clamp, lerp, ease, prog, loadImage, loadFonts, loadIcon,
  flyGlyphs, drawSilver, drawWhite, drawGlassBar, drawLogo, drawFirma, drawIcon } from './engine.js';

export const DURATION = 28.375;

// Marcas de la voz (s). Se afinan con transcript/cues.json.
export const CUE = {
  espera: 0.15, autoMayella1: 3.5, corte1: 4.45,
  elige: 5.75, hrv: 6.8, brv: 7.9, crv: 9.0, ridgeline: 9.7, finModelos: 10.6,
  unidades: 10.62, garantias: 11.75, cambioPlano: 13.12,
  tasa: 13.35, once: 14.5, fija: 15.25, durante: 15.7, foco: 18.1,
  blackFriday: 18.55, tuHonda: 19.85, autoMayella2: 21.6, dealer: 22.7, finVoz: 24.45,
};

// Tipografías: Gotham si el cliente la entrega (assets/fonts), si no Montserrat (OFL) como sustituto.
const FONTS = {
  HeadBold: { url: '../node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2', weight: 'normal' },
  BodyReg: { url: '../node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2', weight: 'normal' },
  UrlItalic: { url: '../node_modules/@fontsource/montserrat/files/montserrat-latin-700-italic.woff2', weight: 'normal' },
};
const LOGOS = { mayella: 'provisional_mayella', bf: 'provisional_blackfriday', redes: 'provisional_redes' };

export async function load() {
  try {
    const r = await fetch('../transcript/cues.json');
    if (r.ok) Object.assign(CUE, await r.json());
  } catch (e) { /* sin afinado todavía */ }
  try {
    const r = await fetch('../assets/fonts/fonts.json');           // {HeadBold:{url},BodyReg:{url},UrlItalic:{url}}
    if (r.ok) Object.assign(FONTS, await r.json());
  } catch (e) { /* sin Gotham */ }
  try {
    const r = await fetch('../assets/logos/logos.json');           // {mayella:'archivo', bf:'archivo', redes:'archivo'}
    if (r.ok) Object.assign(LOGOS, await r.json());
  } catch (e) { /* logos provisionales */ }
  await loadFonts(FONTS);
  await loadImage('mayella', `../assets/logos/${LOGOS.mayella}.png`);
  await loadImage('bf', `../assets/logos/${LOGOS.bf}.png`);
  await loadImage('redes', `../assets/logos/${LOGOS.redes}.png`);
  await loadIcon('shield', '../node_modules/lucide-static/icons/shield.svg');
  build();
}

// ------------------------------------------------------------------ composición
const CX = W / 2;
const FIRMA = { cx: CX, cy: 0.19 * H, w: 0.28 * W };            // firma superior
const HEAD = (size, extra = {}) => ({ family: 'HeadBold', size, tracking: 0.0, ...extra });
const BODY = (size, extra = {}) => ({ family: 'BodyReg', size, ...extra });

let ITEMS = [];          // {t0, t1, draw(ctx,t)} activos en su intervalo
let MOTION = [];         // intervalos con movimiento (activan el desenfoque de movimiento)

// salida rápida: 0→1 en `d` segundos antes de t1
const exitAt = (t, t1, d = frames(6)) => ease.inQuad(prog(t, t1 - d, d));

function word(text, cy, size, t0, t1, opts = {}) {
  const spec = { text, cx: opts.cx ?? CX, cy, t0, ...HEAD(size), dur: opts.dur ?? frames(14),
    stagger: opts.stagger ?? frames(1.5), split: opts.split, from: opts.from, s0: opts.s0 ?? 9 };
  MOTION.push([t0, t0 + spec.dur + (text.length / 2) * spec.stagger + 0.05], [t1 - frames(7), t1]);
  ITEMS.push({ t0, t1, draw: (ctx, t) => {
    const g = flyGlyphs(ctx, spec, t, exitAt(t, t1));
    const gl = opts.glint != null ? prog(t, opts.glint, 0.6) : -1;
    drawSilver(ctx, g, { ...spec, span: size * text.length * 0.7 }, gl > 0 && gl < 1 ? gl : -1);
  } });
}

function white(text, cy, size, t0, t1, opts = {}) {
  const spec = { text, cx: CX, cy, t0, ...BODY(size), ...opts };
  MOTION.push([t0, t0 + frames(14)], [t1 - frames(6), t1]);
  ITEMS.push({ t0, t1, draw: (ctx, t) => drawWhite(ctx, spec, t, exitAt(t, t1)) });
}

function build() {
  ITEMS = []; MOTION = [];
  const C = CUE;

  // ── Firma superior: visible todo el reel. En «este Black Friday» viaja al área protagonista y vuelve.
  const fGo = C.blackFriday - frames(4), fBack = C.tuHonda - frames(10);
  MOTION.push([0, frames(12)], [fGo, fGo + 0.7], [fBack, fBack + 0.7]);
  ITEMS.push({ t0: 0, t1: DURATION + 1, draw: (ctx, t) => {
    const go = ease.outExpo(prog(t, fGo, frames(16)));
    const back = ease.outExpo(prog(t, fBack, frames(16)));
    const k = go * (1 - back);                                   // 0 arriba · 1 protagonista
    const cy = lerp(FIRMA.cy, TITLE_Y, k), w = lerp(FIRMA.w, 0.74 * W, k);
    drawFirma(ctx, { left: 'mayella', right: 'bf', cx: CX, cy, w, t0: 0, dur: frames(12) }, t);
  } });

  // ── 0,00–4,45 · «¡Espera!» y logo institucional en «Auto Mayella»
  word('¡ESPERA!', TITLE_Y, 330, C.espera - frames(2), 1.18, { split: 4, glint: C.espera + 0.62 });
  ITEMS.push({ t0: C.autoMayella1 - frames(3), t1: C.corte1, draw: (ctx, t) =>
    drawLogo(ctx, { name: 'mayella', cx: CX, cy: TITLE_Y + 120, w: 980, t0: C.autoMayella1 - frames(3), dur: frames(16),
      s0: 1.1, sweepAt: C.autoMayella1 + 0.25, sweepDur: 0.6 }, t, exitAt(t, C.corte1)) });
  MOTION.push([C.autoMayella1 - frames(3), C.autoMayella1 + 0.6]);

  // ── 5,70–10,60 · «ELIGE ENTRE» + modelos relevándose en la misma posición
  white('ELIGE ENTRE', TITLE_Y - 330, 120, C.elige, C.finModelos, { tracking: 0.14, open: 0.5 });
  const models = [['HR-V', C.hrv, C.brv], ['BR-V', C.brv, C.crv], ['CR-V', C.crv, C.ridgeline], ['RIDGELINE', C.ridgeline, C.finModelos]];
  for (const [name, a, b] of models) word(name, TITLE_Y + 40, 255, a - frames(3), b - frames(1), { split: Math.ceil(name.length / 2), s0: 8 });

  // ── 10,60–13,12 · «UNIDADES NUEVAS» + barra «CON GARANTÍAS DE FÁBRICA» con escudo
  word('UNIDADES', TITLE_Y - 230, 250, C.unidades - frames(2), C.cambioPlano, { split: 4 });
  word('NUEVAS', TITLE_Y + 60, 250, C.unidades + frames(4), C.cambioPlano, { split: 3 });
  const barG = { cx: CX, cy: TITLE_Y + 400, w: 1600, h: 190, t0: C.unidades + 0.45, dur: frames(12) };
  ITEMS.push({ t0: barG.t0, t1: C.cambioPlano, draw: (ctx, t) => drawGlassBar(ctx, barG, t, exitAt(t, C.cambioPlano)) });
  const GSIZE = 80, ICON = 96;
  const runsG = [{ text: 'CON', family: 'BodyReg' }, { text: 'GARANTÍAS', family: 'HeadBold' }, { text: 'DE FÁBRICA', family: 'BodyReg' }];
  ITEMS.push({ t0: barG.t0 + 0.12, t1: C.cambioPlano, draw: (ctx, t) => {
    // ancho real del texto para centrar el conjunto escudo + texto dentro de la barra
    let tw = 0;
    ctx.save(); ctx.letterSpacing = `${0.04 * GSIZE}px`;
    for (const r of runsG) { ctx.font = `normal normal ${GSIZE}px "${r.family}"`; tw += ctx.measureText(r.text).width; }
    ctx.restore();
    tw += GSIZE * 0.3 * (runsG.length - 1);
    const gap = 40, total = ICON + gap + tw, x0 = CX - total / 2;
    drawWhite(ctx, { cx: x0 + ICON + gap + tw / 2, cy: TITLE_Y + 404, size: GSIZE, t0: barG.t0 + 0.12, tracking: 0.04, open: 0.4,
      s0: 1.1, runs: runsG, gap: 0.3 }, t, exitAt(t, C.cambioPlano));
    drawIcon(ctx, { name: 'shield', cx: x0 + ICON / 2, cy: TITLE_Y + 400, size: ICON, stroke: 1.8, t0: C.garantias - 0.1, dur: 0.5 },
      t, exitAt(t, C.cambioPlano));
  } });
  MOTION.push([barG.t0, barG.t0 + 0.7]);

  // ── 13,12–18,10 · Escena principal: «TASA DEL / 11% / FIJA DURANTE 5 AÑOS»
  const offEnd = C.foco - frames(2);
  word('TASA DEL', TITLE_Y - 700, 200, C.tasa, offEnd, { split: 4, s0: 7 });
  word('11%', TITLE_Y - 150, 880, C.once - frames(3), offEnd, { split: 2, s0: 6, dur: frames(14), stagger: frames(1), glint: 16.9 });
  const bar = { cx: CX, cy: TITLE_Y + 470, w: 1600, h: 230, t0: C.once + 0.55, dur: frames(12), sweep: 1.0 };
  ITEMS.push({ t0: bar.t0, t1: offEnd, draw: (ctx, t) => drawGlassBar(ctx, bar, t, exitAt(t, offEnd)) });
  MOTION.push([bar.t0, bar.t0 + 0.6]);
  // «FIJA» al oírse; «DURANTE 5 AÑOS» desde 15,7 s, en la misma barra (la línea se recentra)
  ITEMS.push({ t0: C.fija - frames(2), t1: offEnd, draw: (ctx, t) => {
    const q = exitAt(t, offEnd), size = 112, gap = size * 0.3;
    ctx.save();
    ctx.letterSpacing = `${0.04 * size}px`;
    ctx.font = `normal normal ${size}px "HeadBold"`; const wF = ctx.measureText('FIJA').width, w5 = ctx.measureText('5 AÑOS').width;
    ctx.font = `normal normal ${size}px "BodyReg"`; const wDu = ctx.measureText('DURANTE').width;
    ctx.restore();
    const wD = wDu + gap + w5, full = wF + gap + wD;
    const k = ease.outExpo(prog(t, C.durante - frames(2), frames(14)));
    const fx = lerp(CX, CX - full / 2 + wF / 2, k);
    drawWhite(ctx, { text: 'FIJA', family: 'HeadBold', cx: fx, cy: TITLE_Y + 474, size, t0: C.fija - frames(2),
      tracking: 0.04, open: 0.45, s0: 1.15 }, t, q);
    drawWhite(ctx, { cx: CX - full / 2 + wF + gap + wD / 2, cy: TITLE_Y + 474, size, t0: C.durante - frames(2), tracking: 0.04,
      open: 0.4, s0: 1.12, runs: [{ text: 'DURANTE', family: 'BodyReg' }, { text: '5 AÑOS', family: 'HeadBold' }], gap: 0.3 }, t, q);
  } });
  MOTION.push([C.fija - frames(2), C.fija + 0.6], [C.durante - frames(2), C.durante + 0.6], [offEnd - frames(7), offEnd]);

  // ── 18,10–22,70 · firma protagonista → «TU HONDA TE ESPERA AQUÍ» → logo Mayella
  word('TU HONDA', TITLE_Y - 150, 230, C.tuHonda, C.autoMayella2 - frames(4), { split: 4 });
  word('TE ESPERA AQUÍ', TITLE_Y + 120, 175, C.tuHonda + frames(5), C.autoMayella2 - frames(4), { split: 7 });
  const logo2 = { name: 'mayella', cx: CX, cy: TITLE_Y + 20, w: 1000, t0: C.autoMayella2 - frames(3), dur: frames(16), s0: 1.1,
    sweepAt: C.autoMayella2 + 0.3, sweepDur: 0.65 };
  ITEMS.push({ t0: logo2.t0, t1: C.finVoz, draw: (ctx, t) => drawLogo(ctx, logo2, t, exitAt(t, C.finVoz)) });
  MOTION.push([logo2.t0, logo2.t0 + 0.7]);

  // ── 22,70–24,45 · eslogan bajo el logo
  white('El Dealer de los Dominicanos', TITLE_Y + 520, 104, C.dealer - frames(2), C.finVoz, { tracking: 0.02, open: 0.3 });

  // ── 24,45–28,375 · cierre: firma digital (redes + web) dentro del margen seguro
  const sig = C.finVoz + 0.25;
  ITEMS.push({ t0: sig, t1: DURATION + 1, draw: (ctx, t) => {
    const US = 100, IW = 380, gap = 64, y = 0.70 * H;
    ctx.save(); ctx.font = `normal normal ${US}px "UrlItalic"`; ctx.letterSpacing = '0px';
    const uw = ctx.measureText('automayella.com.do').width; ctx.restore();
    const total = IW + gap * 2 + 8 + uw, x0 = CX - total / 2;
    drawLogo(ctx, { name: 'redes', cx: x0 + IW / 2, cy: y, w: IW, t0: sig, dur: frames(14), s0: 1.2 }, t);
    drawWhite(ctx, { text: 'automayella.com.do', family: 'UrlItalic', cx: x0 + IW + gap * 2 + 8 + uw / 2, cy: y + 4, size: US,
      t0: sig + frames(4), tracking: 0.0, open: 0.35, s0: 1.1 }, t);
    const p = ease.outExpo(prog(t, sig + frames(2), frames(14)));
    ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + IW + gap, y - 70 * p, 8, 140 * p); ctx.restore();
  } });
  MOTION.push([sig, sig + 0.7]);
}

export function draw(ctx, t) {
  for (const it of ITEMS) if (t >= it.t0 - 0.001 && t < it.t1) it.draw(ctx, t);
}
export const moving = (t) => MOTION.some(([a, b]) => t >= a - 0.02 && t <= b + 0.02);
export const cues = () => CUE;
