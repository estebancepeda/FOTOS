// Guion visual del reel · Lanzamiento Mercedes-Benz 2027 en Auto Mayella (audio de Marcel Hernández).
// Cada tiempo sale de transcript/words.json (alineación palabra a palabra con el audio):
// w(frase, palabra) = segundo en que empieza esa palabra. Las frases y palabras están en
// transcript/phrases.json; si se rehace la alineación, todo se resincroniza solo.
import { drawScene, drawDust, lensAt, loadIcon, loadImage, SWEEP_SWAP } from './engine.js';

export const DURATION = 71.0;          // audio 69.9 s + reposo final del logo
const LEAD = 0.12;                     // el gráfico arranca un instante antes de la palabra
const SWEEP = 0.9;                     // duración de la transición de cristal

const ICONS = ['user-round', 'car-front', 'sparkles', 'lightbulb', 'armchair', 'palette', 'layers', 'film', 'play',
  'mouse-pointer-click', 'shield-check', 'person-standing', 'motorbike', 'car', 'truck', 'square-parking', 'log-out',
  'undo-2', 'disc-3', 'radar', 'mountain', 'gauge', 'key-round', 'cpu', 'scan-eye'];

let WORDS = [];
const w = (p, i) => WORDS.find((x) => x.phrase === p && x.i === i).start - LEAD;

export async function load() {
  WORDS = await (await fetch('../transcript/words.json')).json();
  await Promise.all(ICONS.map((n) => loadIcon(n, `../assets/icons/${n}.svg`)));
  await loadImage('mayella', '../assets/logos/mayella.png');
  await loadImage('star', '../assets/logos/mercedes_star.png');
  build();
}

// ------------------------------------------------------------------ utilidades del guion
// Los elementos usan T (segundo absoluto) y OUT (salida propia, absoluta); se pasan a relativos.
function scene(t0, t1, els, opts = {}) {
  const rel = (e) => {
    const o = { ...e };
    if (e.T != null) o.at = e.T - t0;
    if (e.OUT != null) o.out = e.OUT - t0;
    if (e.items) o.items = e.items.map((it) => ({ ...it, at: it.T != null ? it.T - t0 : it.at }));
    return o;
  };
  return { t0, t1, els: els.map(rel), ...opts };
}
const kicker = (text, y, T, extra = {}) => ({ type: 'text', text, y, size: 38, weight: 500, family: 'text', tracking: 0.32, T, ...extra });
const title = (text, y, T, extra = {}) => ({ type: 'text', text, y, size: 84, weight: 300, tracking: 0.0, T, stagger: 0.08, ...extra });

let SCENES = [], LENS = [];

function build() {
  // límites de sección = inicio de frase (sin adelanto)
  const B = (p) => w(p, 0) + LEAD;
  const sweepAt = (t) => ({ type: 'sweep', t0: t - SWEEP_SWAP * SWEEP, dur: SWEEP });
  const sw = (ev) => ev.t0 + SWEEP_SWAP * ev.dur;

  const s1 = B(1), revealMay = w(1, 10) - 0.15, lensModels = { type: 'sweep', t0: revealMay + 1.25, dur: SWEEP };
  const s3 = sw(lensModels);
  const s4 = B(5), s5 = B(7), s6 = B(9), s7 = B(13), s8 = B(17), s9 = B(20), s10 = B(24), s11 = B(25);
  const finalReveal = w(25, 11) - 0.2;

  LENS = [
    { type: 'reveal', t0: 0.0, dur: 1.9 },                            // apertura: todo nace dentro del cristal
    sweepAt(s1),
    { type: 'reveal', t0: revealMay, dur: 1.5 },                      // «Auto Mayella»
    lensModels,
    sweepAt(s4),
    { type: 'pass', t0: w(6, 4) + 0.1, dur: 0.95, y: -10, r: 230, aspect: 1.25 },   // «y no todo es diseño»
    sweepAt(s5),
    sweepAt(s6),
    { type: 'pass', t0: w(11, 5) - 0.1, dur: 1.4, y: 0, r: 200, aspect: 1.6, dir: -1 }, // plataformas
    sweepAt(s7),
    sweepAt(s8),
    sweepAt(s9),
    sweepAt(s10),
    sweepAt(s11),
    { type: 'reveal', t0: finalReveal, dur: 2.1 },                    // cierre con el logo
  ];

  SCENES = [
    // 1 · Presentación (0.0 – «y para mí…»)
    scene(0, s1, [
      { type: 'image', name: 'star', y: -300, w: 118, T: 0.15, dur: 0.9, grow: true },
      title('Marcel Hernández', -110, 0.1, { size: 88 }),
      { type: 'rule', y: -40, w: 520, T: 0.6 },
      kicker('EXPERTO DE PRODUCTO', 40, w(0, 2)),
      kicker('MERCEDES-BENZ AUTOSAMA', 100, w(0, 6), { weight: 600 }),
    ], { cut: true }),

    // 2 · «…presentarles aquí en Auto Mayella»
    scene(s1, revealMay, [
      kicker('ES UN PLACER PRESENTARLES', -120, w(1, 5)),
      title('aquí en', 0, w(1, 8), { size: 72 }),
    ], { outDur: 0.25 }),
    scene(revealMay, s3, [
      { type: 'image', name: 'mayella', y: -30, w: 560, T: revealMay, dur: 0.01, fade: false },
    ], { cut: true }),

    // 3 · Los tres modelos
    scene(s3, s4, [
      kicker('NUEVOS MODELOS 2027', -340, s3 + 0.05),
      { type: 'icon', name: 'car-front', y: -215, size: 120, T: s3 + 0.1 },
      { type: 'text', segments: [{ text: 'GLE 450', weight: 600 }, { text: 'AMG Line', weight: 300 }], y: -30, size: 74, T: s3 + 0.15 },
      { type: 'rule', y: 15, w: 420, T: s3 + 0.5, alpha: 0.35 },
      { type: 'text', segments: [{ text: 'GLS 450', weight: 600 }, { text: 'AMG Line', weight: 300 }], y: 95, size: 74, T: w(3, 1) },
      { type: 'rule', y: 140, w: 420, T: w(3, 1) + 0.3, alpha: 0.35 },
      { type: 'text', segments: [{ text: 'GLE 450', weight: 600 }, { text: 'AMG Line', weight: 300 }], y: 220, size: 74, T: w(4, 2) },
      kicker('COUPÉ', 285, w(4, 11), { size: 36, weight: 600, tracking: 0.5 }),
    ], { cut: true }),

    // 4 · Iluminación con patrón de estrellas
    scene(s4, w(6, 0) + LEAD, [
      kicker('NUEVO DISEÑO', -330, s4 + 0.1),
      { type: 'stars', y: -160, T: s4 + 0.35, cols: 11, rows: 3, spacing: 72, size: 17 },
      title('Nueva iluminación', 30, w(5, 5), { size: 76 }),
      kicker('DELANTERA', 105, w(5, 7), { weight: 600 }),
      kicker('PATRÓN DE ESTRELLAS', 165, w(5, 10), { alpha: 0.75 }),
    ], { outDur: 0.35 }),
    scene(w(6, 0) + LEAD, w(6, 4) + 0.05, [
      { type: 'icon', name: 'lightbulb', y: -230, size: 110, T: w(6, 0) + 0.05 },
      title('Trasera', -40, w(6, 0) + 0.05, { size: 76 }),
      { type: 'rule', y: 20, w: 380, T: w(6, 1) },
      { type: 'text', text: 'Calandra iluminada', y: 110, size: 64, weight: 600, T: w(6, 2) },
    ], { outDur: 0.3 }),
    scene(w(6, 4) + 0.05, s5, [
      title('Y no todo', -55, w(6, 4) + 0.08, { size: 92 }),
      { type: 'text', text: 'es diseño.', y: 50, size: 92, weight: 600, T: w(6, 7) },
    ], { cut: true }),

    // 5 · Interior
    scene(s5, s6, [
      kicker('INTERIOR', -340, w(7, 3)),
      title('Nuevos materiales', -220, w(7, 5), { size: 70 }),
      { type: 'iconrow', y: 30, size: 104, gap: 300, labelSize: 32, items: [
        { icon: 'armchair', label: 'CUERO', T: w(7, 8) },
        { icon: 'palette', label: ['NUEVOS', 'COLORES'], T: w(8, 4) },
        { icon: 'layers', label: ['NUEVAS', 'MOLDURAS'], T: w(8, 11) },
      ] },
    ], { cut: true }),

    // 6 · Tres pantallas y entretenimiento
    scene(s6, w(10, 0) + LEAD, [
      { type: 'screens', y: -190, w: 800, h: 150, T: s6 + 0.1 },
      { type: 'counter', to: 3, from: 0, y: 70, size: 210, weight: 200, T: w(9, 3) - 0.25, dur: 0.9, loops: 0 },
      kicker('PANTALLAS', 150, w(9, 4), { size: 40, weight: 600 }),
    ], { outDur: 0.35 }),
    scene(w(10, 0) + LEAD, w(11, 0) + LEAD, [
      kicker('PARA EL ACOMPAÑANTE', -300, w(10, 4)),
      { type: 'iconrow', y: -20, size: 112, gap: 330, labelSize: 34, items: [
        { icon: 'film', label: 'PELÍCULAS', T: w(10, 9) },
        { icon: 'play', label: 'VIDEOS', T: w(10, 10) },
      ] },
    ], { outDur: 0.3 }),
    scene(w(11, 0) + LEAD, w(12, 0) + LEAD, [
      kicker('ENTRETENIMIENTO', -300, w(11, 3)),
      { type: 'chips', y: 10, size: 56, gap: 150, items: [
        { text: 'YouTube', T: w(11, 5) }, { text: 'Netflix', T: w(11, 6) }, { text: 'Amazon', T: w(11, 7) }] },
    ], { outDur: 0.3 }),
    scene(w(12, 0) + LEAD, s7, [
      { type: 'icon', name: 'mouse-pointer-click', y: -180, size: 120, T: w(12, 0) + 0.05 },
      title('Muy interactivo', 30, w(12, 1), { size: 80 }),
    ], { cut: true }),

    // 7 · Seguridad
    scene(s7, w(15, 0) + LEAD, [
      { type: 'pulse', y: -250, r0: 70, r1: 230, T: s7 + 0.3 },
      { type: 'icon', name: 'shield-check', y: -250, size: 120, T: s7 + 0.1 },
      kicker('MEJORAS EN SEGURIDAD', -80, w(13, 3)),
      kicker('MERCEDES-BENZ', 20, w(14, 2), { weight: 600, size: 36 }),
      title('Drive Assistant Plus', 120, w(14, 4), { size: 76 }),
    ], { outDur: 0.35 }),
    scene(w(15, 0) + LEAD, s8, [
      { type: 'text', text: 'Interfaz más dinámica', y: -340, size: 56, weight: 300, T: w(15, 5) },
      kicker('PREVENCIÓN DE CHOQUES', -250, w(15, 9), { weight: 600 }),
      { type: 'pulse', y: -90, r0: 40, r1: 170, period: 1.4, T: w(15, 9) },
      { type: 'icon', name: 'radar', y: -90, size: 96, T: w(15, 9), OUT: w(16, 0) - 0.2 },
      { type: 'iconrow', y: 120, size: 92, gap: 222, labelSize: 29, labelTracking: 0.06, items: [
        { icon: 'person-standing', label: 'PEATONES', T: w(16, 1) },
        { icon: 'motorbike', label: 'MOTOS', T: w(16, 2) },
        { icon: 'car', label: 'VEHÍCULOS', T: w(16, 3) },
        { icon: 'truck', label: 'CAMIONES', T: w(16, 4) },
      ] },
    ], { cut: true }),

    // 8 · Asistencia de parqueo
    scene(s8, s9, [
      kicker('ASISTENCIA INTELIGENTE', -350, s8 + 0.1),
      { type: 'iconlabel', icon: 'disc-3', label: ['PROTECCIÓN', 'DE AROS'], x: -210, y: -170, size: 100, labelSize: 31, T: w(17, 6) },
      { type: 'iconlabel', icon: 'square-parking', label: ['PARQUEO', 'AUTOMÁTICO'], x: 210, y: -170, size: 100, labelSize: 31, T: w(18, 6) },
      { type: 'iconlabel', icon: 'log-out', label: ['SALIDA', 'DE PARQUEO'], x: -210, y: 150, size: 100, labelSize: 31, T: w(19, 0) },
      { type: 'iconlabel', icon: 'undo-2', label: ['REVERSA', 'AUTOMÁTICA'], x: 210, y: 150, size: 100, labelSize: 31, T: w(19, 5) },
    ], { cut: true }),

    // 9 · Tecnología: cámara y lectura del terreno
    scene(s9, w(21, 0) + LEAD, [
      { type: 'icon', name: 'cpu', y: -150, size: 120, T: s9 + 0.1 },
      kicker('TODA ESTA', 10, w(20, 4)),
      title('Tecnología', 110, w(20, 6), { size: 88, weight: 600 }),
    ], { outDur: 0.35 }),
    scene(w(21, 0) + LEAD, w(22, 0) + LEAD, [
      kicker('CÁMARA', -330, w(21, 2), { weight: 600, size: 38 }),
      { type: 'ring', y: -20, r: 200, size: 118, value: 360, T: w(21, 4) - 0.2, dur: 1.5 },
      kicker('GRADOS', 255, w(21, 6)),
    ], { outDur: 0.3 }),
    scene(w(22, 0) + LEAD, s10, [
      { type: 'icon', name: 'car-front', y: -300, size: 130, T: w(22, 0) + 0.05 },
      { type: 'scan', y: -210, w: 620, h: 210, T: w(22, 5) - 0.2, period: 1.3 },
      kicker('LEE EL TERRENO DELANTERO', 90, w(22, 5), { size: 36, tracking: 0.2 }),
      title('y muestra', 200, w(23, 4), { size: 68 }),
      { type: 'text', text: 'la parte inferior', y: 285, size: 68, weight: 600, T: w(23, 6) },
    ], { cut: true }),

    // 10 · Modo de manejo (nombre no claro en el audio → solo ícono y rótulo genérico)
    scene(s10, s11, [
      { type: 'pulse', y: -120, r0: 80, r1: 260, period: 1.8, T: s10 + 0.3 },
      { type: 'icon', name: 'gauge', y: -120, size: 140, T: s10 + 0.1 },
      kicker('FUNCIONA CON', 90, w(24, 1)),
      title('Modo de manejo', 190, w(24, 4), { size: 76 }),
    ], { cut: true }),

    // 11 · Cierre en Auto Mayella
    scene(s11, finalReveal, [
      { type: 'icon', name: 'key-round', y: -190, size: 120, T: s11 + 0.1 },
      kicker('LO MEJOR', -10, w(25, 1)),
      title('Ven a probarla', 95, w(25, 6), { size: 84 }),
    ], { outDur: 0.25 }),
    scene(finalReveal, DURATION + 1, [
      { type: 'image', name: 'mayella', y: -60, w: 600, T: finalReveal, dur: 0.01, fade: false },
      { type: 'text', text: 'Pruébala y llévatela', y: 330, size: 52, weight: 300, T: w(26, 0) + 0.3 },
    ], { cut: true }),
  ];
}

export function draw(ctx, t) {
  drawDust(ctx, t, 1);
  const s = SCENES.find((s) => t >= s.t0 && t < s.t1) || SCENES[SCENES.length - 1];
  drawScene(ctx, s, t);
}
export const lens = (t) => lensAt(LENS, t);
export const scenes = () => SCENES;
export const lensEvents = () => LENS;
