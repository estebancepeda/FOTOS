// Prueba de estilo (no es contenido final): valida tipografía, íconos, lentes y rendimiento.
import { CX, CY, drawScene, drawDust, lensAt, loadIcon, loadImage, SWEEP_SWAP } from './engine.js';

export const DURATION = 9.0;
const ICONS = ['zap', 'cpu', 'shield-check'];

export async function load() {
  await Promise.all(ICONS.map((n) => loadIcon(n, `../assets/icons/${n}.svg`)));
  await loadImage('mayella', '../assets/logos/mayella.png');
  await loadImage('star', '../assets/logos/mercedes_star.png');
}

const LENS = [
  { type: 'sweep', t0: 2.9, dur: 1.0 },
  { type: 'reveal', t0: 6.0, dur: 2.2 },
];
const sw = (ev) => ev.t0 + SWEEP_SWAP * ev.dur;

const SCENES = [
  { t0: 0, t1: sw(LENS[0]), cut: true, els: [
    { type: 'image', name: 'star', y: -330, w: 150, at: 0.1, dur: 0.9, grow: true },
    { type: 'text', text: 'MERCEDES-BENZ', y: -160, size: 40, weight: 500, family: 'text', tracking: 0.32, at: 0.3 },
    { type: 'counter', to: 2027, from: 1986, y: 40, size: 230, weight: 200, at: 0.45, dur: 1.5 },
    { type: 'rule', y: 110, w: 560, at: 1.1 },
    { type: 'text', text: 'NUEVA GENERACIÓN', y: 210, size: 58, weight: 300, tracking: 0.12, at: 1.3 },
  ] },
  { t0: sw(LENS[0]), t1: 6.0, els: [
    { type: 'text', text: 'Diseñados para', y: -250, size: 64, weight: 300, tracking: 0.0, at: 0.15 },
    { type: 'text', text: 'lo que viene', y: -170, size: 64, weight: 600, tracking: 0.0, at: 0.3 },
    { type: 'iconrow', y: 70, at: 0.6, items: [
      { icon: 'zap', label: 'ELÉCTRICO' }, { icon: 'cpu', label: 'TECNOLOGÍA' }, { icon: 'shield-check', label: 'SEGURIDAD' }] },
  ] },
  { t0: 6.0, t1: DURATION, cut: true, els: [
    { type: 'image', name: 'mayella', y: -40, w: 640, at: 0, dur: 0.01, fade: false },
    { type: 'text', text: 'AUTO MAYELLA', y: 360, size: 40, weight: 500, family: 'text', tracking: 0.3, at: 1.3 },
  ] },
];

export function draw(ctx, t) {
  drawDust(ctx, t, 1);
  const s = SCENES.find((s) => t >= s.t0 && t < s.t1) || SCENES[SCENES.length - 1];
  drawScene(ctx, s, t);
}
export const lens = (t) => lensAt(LENS, t);
