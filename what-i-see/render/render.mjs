// Renders the animation frame-by-frame in headless Chromium.
//   node render/render.mjs stills 5 12 40      -> out/stills/frame-5.00.jpg ...
//   node render/render.mjs video [fps]         -> out/video-only.mp4
// Then mux with the soundtrack (see README).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [mode = 'stills', ...args] = process.argv.slice(2);

const browser = await playwright.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--allow-file-access-from-files', '--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => { console.error('[page error]', e); process.exitCode = 1; });
await page.goto(pathToFileURL(resolve(root, 'index.html')).href + '?render=1');
const t0 = Date.now();
await page.evaluate(() => window.ready);
console.log(`painted all scenes in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const grab = (t, q) => page.evaluate(([t, q]) => {
  window.renderFrame(t);
  return document.getElementById('stage').toDataURL('image/jpeg', q);
}, [t, q]);

if (mode === 'stills') {
  const dir = resolve(root, 'out/stills');
  mkdirSync(dir, { recursive: true });
  for (const a of args) {
    const t = Number(a);
    const url = await grab(t, 0.9);
    const f = resolve(dir, `frame-${t.toFixed(2).padStart(6, '0')}.jpg`);
    writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(f);
  }
} else if (mode === 'video') {
  const fps = Number(args[0] || 30);
  const duration = await page.evaluate(() => window.TIMELINE.duration);
  const n = Math.round(duration * fps);
  const out = resolve(root, 'out/video-only.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const start = Date.now();
  for (let i = 0; i < n; i++) {
    const url = await grab(i / fps, 0.95);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) {
      const el = (Date.now() - start) / 1000;
      console.log(`frame ${i}/${n}  ${el.toFixed(0)}s elapsed, ~${((el / (i + 1)) * (n - i - 1)).toFixed(0)}s left`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
