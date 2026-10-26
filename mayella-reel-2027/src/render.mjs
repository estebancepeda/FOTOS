// Render cuadro a cuadro en Chromium sin cabeza → ffmpeg.
// Uso:
//   node render.mjs video  [story] [subframes]      → renders/<story>.mp4 (con audio)
//   node render.mjs stills [story] t1 t2 …          → preview/<story>_t.png
//   node render.mjs range  [story] from to [sub]    → video parcial sin audio (pruebas)
//   node render.mjs part   story f0 f1 salida.mp4 sub → bloque de cuadros [f0, f1) sin audio (render en paralelo)
//   node render.mjs events [story]                  → transcript/<story>_events.json (tiempos para el sonido)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright y Chromium ya instalados en el sistema (NODE_PATH global)
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'assets/audio/AUDIO_MERCEDES_MAYELLA.mp3');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function open(story, sub) {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => { console.error('ERROR página:', e.message); process.exit(1); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('consola:', m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/src/index.html?story=${story}&sub=${sub}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  return { srv, browser, page };
}

async function grabTo(page, f, sink) {
  const b64 = await page.evaluate((f) => window.grab(f), f);
  return Buffer.from(b64, 'base64');
}

function ffmpegRaw(out, withAudio) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-r', '30', '-i', '-'];
  if (withAudio) args.push('-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k');
  args.push('-vf', 'vflip', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-movflags', '+faststart', '-shortest', out);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  return ff;
}

const [mode = 'stills', story = 'story', ...rest] = process.argv.slice(2);
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'renders'), { recursive: true });

if (mode === 'events') {
  const { srv, browser, page } = await open(story, 1);
  const out = path.join(ROOT, `transcript/${story}_events.json`);
  fs.writeFileSync(out, await page.evaluate('window.exportEvents()'));
  await browser.close(); srv.close();
  console.log('ok', out);
} else if (mode === 'stills') {
  const { srv, browser, page } = await open(story, 3);
  for (const t of rest.map(Number)) {
    const raw = await grabTo(page, Math.round(t * 30));
    const out = path.join(ROOT, `preview/${story}_${t.toFixed(2)}.png`);
    await new Promise((ok, ko) => {
      const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-i', '-', '-vf', 'vflip', out]);
      ff.on('close', (c) => (c ? ko(new Error('ffmpeg ' + c)) : ok()));
      ff.stdin.end(raw);
    });
    console.log('ok', out);
  }
  await browser.close(); srv.close();
} else if (mode === 'part') {
  const [f0, f1, out, subS] = rest;
  const { srv, browser, page } = await open(story, parseInt(subS || '3', 10));
  const ff = ffmpegRaw(path.resolve(out), false);
  const t0 = Date.now();
  for (let f = parseInt(f0, 10); f < parseInt(f1, 10); f++) {
    const raw = await grabTo(page, f);
    if (!ff.stdin.write(raw)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (f % 60 === 0) console.log(`[${f0}-${f1}] cuadro ${f}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((ok) => ff.on('close', ok));
  await browser.close(); srv.close();
  console.log('ok', out);
} else {
  const sub = parseInt(mode === 'range' ? rest[2] || '3' : rest[0] || '3', 10);
  const { srv, browser, page } = await open(story, sub);
  const dur = await page.evaluate('window.DURATION');
  const f0 = mode === 'range' ? Math.round(parseFloat(rest[0]) * 30) : 0;
  const f1 = mode === 'range' ? Math.round(parseFloat(rest[1]) * 30) : Math.round(dur * 30);
  const out = path.join(ROOT, mode === 'range' ? `preview/${story}_${rest[0]}-${rest[1]}.mp4` : `renders/${story}.mp4`);
  const ff = ffmpegRaw(out, mode !== 'range');
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const raw = await grabTo(page, f);
    if (!ff.stdin.write(raw)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (f % 30 === 0) console.log(`cuadro ${f}/${f1}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((ok) => ff.on('close', ok));
  await browser.close(); srv.close();
  console.log('ok', out);
}
