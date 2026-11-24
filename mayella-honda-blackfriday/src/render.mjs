// Render cuadro a cuadro en Chromium sin cabeza → ffmpeg (ProRes 4444 con alfa).
// Uso:
//   node render.mjs stills t1 t2 …              → preview/still_<t>.png (RGBA) y preview/comp_<t>.png (sobre el video o un fondo neutro)
//   node render.mjs part f0 f1 salida.mov [sub] → bloque de cuadros [f0, f1) en ProRes 4444
//   node render.mjs cues                        → imprime los tiempos de voz en uso
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 2160, H = 3840, FPS = 24;
const VIDEO = path.join(ROOT, 'assets/video/source.mov');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf', '.webp': 'image/webp' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function open(sub) {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
  page.on('pageerror', (e) => { console.error('ERROR página:', e.message); process.exit(1); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('consola:', m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/src/index.html?sub=${sub}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 180000 });
  return { srv, browser, page };
}
const grab = async (page, f) => Buffer.from(await page.evaluate((f) => window.grab(f), f), 'base64');

const [mode = 'stills', ...rest] = process.argv.slice(2);
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });

if (mode === 'cues') {
  const { srv, browser, page } = await open(1);
  console.log(await page.evaluate('window.cues()'));
  await browser.close(); srv.close();
} else if (mode === 'stills') {
  const { srv, browser, page } = await open(5);
  for (const t of rest.map(Number)) {
    const raw = await grab(page, Math.round(t * FPS));
    const tag = t.toFixed(3);
    const still = path.join(ROOT, `preview/still_${tag}.png`);
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-vf', 'vflip', still], { input: raw });
    // composición de control: sobre el cuadro real del video si existe, si no sobre un fondo neutro
    const comp = path.join(ROOT, `preview/comp_${tag}.png`);
    const bg = fs.existsSync(VIDEO)
      ? ['-ss', String(t), '-i', VIDEO]
      : ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=0x5a6472:c1=0x1e232b:x0=0:y0=0:x1=${W}:y1=${H}:d=1`];
    spawnSync('ffmpeg', ['-y', '-v', 'error', ...bg, '-i', still, '-filter_complex',
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=rgba[b];[b][1:v]overlay=0:0:format=auto`, '-frames:v', '1', comp]);
    console.log('ok', comp);
  }
  await browser.close(); srv.close();
} else if (mode === 'part') {
  const [f0, f1, out, subS] = rest;
  const { srv, browser, page } = await open(parseInt(subS || '5', 10));
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`,
    '-r', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
    '-alpha_bits', '16', '-vendor', 'apl0', '-qscale:v', '6', path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = parseInt(f0, 10); f < parseInt(f1, 10); f++) {
    const raw = await grab(page, f);
    if (!ff.stdin.write(raw)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (f % 24 === 0) console.log(`[${f0}-${f1}] cuadro ${f}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((ok) => ff.on('close', ok));
  await browser.close(); srv.close();
  console.log('ok', out);
}
