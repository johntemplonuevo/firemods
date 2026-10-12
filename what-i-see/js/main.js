// Timeline engine: picks the scene, paints watercolor "bloom" transitions,
// captions and the paper texture, and drives playback in sync with the soundtrack.
(function () {
  'use strict';
  const TL = window.TIMELINE;
  const { W, H } = WC;
  const { clamp, ramp, easeOut, easeInOut } = WC;
  const SC = Scenes.all;

  const canvas = document.getElementById('stage');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bufA = WC.canvas(W, H), bufB = WC.canvas(W, H);
  let paper, blooms;

  const STYLES = {
    title:    { font: '600 136px "Cormorant Garamond"', color: '#23243a', y: 0.45, track: 3 },
    subtitle: { font: 'italic 500 46px "Cormorant Garamond"', color: '#5d5768', y: 0.56, track: 1 },
    verse:    { font: 'italic 500 60px "Cormorant Garamond"', color: '#f7eedc', y: 0.79, shadow: 'rgba(4,6,20,0.9)', max: 1500 },
    ref:      { font: '600 34px "Cormorant Garamond"', color: '#ecd29a', y: 0.935, track: 8, shadow: 'rgba(4,6,20,0.9)' },
    big:      { font: '600 104px "Cormorant Garamond"', color: '#1d1f33', y: 0.5, track: 1 },
    light:    { font: '500 56px "Cormorant Garamond"', color: '#f6eddb', y: 0.86, shadow: 'rgba(0,0,8,0.95)', max: 1500, sceneY: true },
    lightbig: { font: '600 80px "Cormorant Garamond"', color: '#fbf3e3', y: 0.86, shadow: 'rgba(0,0,8,0.95)', max: 1600, sceneY: true },
    body:     { font: '500 56px "Cormorant Garamond"', color: '#fdf6e8', y: 0.87, shadow: 'rgba(25,18,10,0.95)', max: 1500, sceneY: true },
  };

  function sceneIndexAt(t) {
    const s = TL.scenes;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return i;
    return 0;
  }

  function drawScene(target, i, t) {
    const s = TL.scenes[i];
    target.save();
    SC[s.id].draw(target, t - s.start, t);
    target.restore();
  }

  // unit-size ragged blob outlines used to reveal each new scene like spreading paint
  function makeBlooms() {
    return TL.scenes.map((s, i) => {
      const rng = WC.rng(4000 + i * 17);
      const base = WC.ellipse(0, 0, 1, 0.8, 14).map((p) => ({ x: p[0], y: p[1], v: 0.6 + rng() }));
      const pts = WC.deform(base, 5, 0.16, rng);
      const sats = Array.from({ length: 9 }, () => {
        const a = rng() * Math.PI * 2;
        return { a, d: rng.range(1.05, 1.35), r: rng.range(0.05, 0.14), pts: WC.deform(WC.ellipse(0, 0, 1, 1, 8).map((p) => ({ x: p[0], y: p[1], v: 1 })), 3, 0.15, rng) };
      });
      return { pts, sats, cx: W / 2 + rng.gauss() * 140, cy: H / 2 + rng.gauss() * 80 };
    });
  }

  function bloomPath(c, b, R, k) {
    c.beginPath();
    const p = b.pts;
    c.moveTo(b.cx + p[0].x * R * k, b.cy + p[0].y * R * k);
    for (let i = 1; i < p.length; i++) c.lineTo(b.cx + p[i].x * R * k, b.cy + p[i].y * R * k);
    c.closePath();
    for (const s of b.sats) {
      const sx = b.cx + Math.cos(s.a) * R * s.d * k, sy = b.cy + Math.sin(s.a) * R * s.d * 0.8 * k;
      const r = R * s.r * k;
      c.moveTo(sx + s.pts[0].x * r, sy + s.pts[0].y * r);
      for (let i = 1; i < s.pts.length; i++) c.lineTo(sx + s.pts[i].x * r, sy + s.pts[i].y * r);
      c.closePath();
    }
  }

  function wrap(c, text, max) {
    if (!max) return [text];
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCaptions(t, sceneId) {
    for (const cap of TL.captions) {
      if (t < cap.t0 || t > cap.t1) continue;
      const st = STYLES[cap.style];
      const inn = easeOut((t - cap.t0) / 0.8);
      const a = Math.min(inn, 1 - ramp(t, cap.t1 - 0.55, cap.t1));
      if (a <= 0) continue;
      ctx.save();
      ctx.font = st.font;
      ctx.letterSpacing = (st.track || 0) + 'px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = a;
      const blur = (1 - inn) * 9;
      if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      const sc = SC[sceneId];
      const yFrac = st.sceneY && sc.captionY ? sc.captionY : st.y;
      const xc = st.sceneY && sc.captionX ? W * sc.captionX : W / 2;
      const lines = wrap(ctx, cap.text, (st.sceneY && sc.captionMax) || st.max);
      const lh = parseInt(st.font.match(/(\d+)px/)[1], 10) * 1.18;
      const y0 = H * yFrac - ((lines.length - 1) * lh) / 2 + (1 - inn) * 16;
      lines.forEach((ln, i) => {
        if (st.shadow) {
          ctx.save();
          ctx.shadowColor = st.shadow;
          ctx.shadowBlur = 26;
          ctx.fillStyle = st.shadow;
          ctx.globalAlpha = a * 0.55;
          ctx.fillText(ln, xc, y0 + i * lh);
          ctx.restore();
        }
        ctx.fillStyle = st.color;
        ctx.fillText(ln, xc, y0 + i * lh);
      });
      ctx.restore();
    }
  }

  function renderFrame(t) {
    t = clamp(t, 0, TL.duration);
    const i = sceneIndexAt(t);
    const s = TL.scenes[i];
    const lt = t - s.start;
    const TR = TL.transition;
    ctx.save();
    if (i > 0 && lt < TR && s.id !== 'dark') {
      // previous scene keeps moving underneath while the new one blooms over it
      const a = bufA.getContext('2d'), b = bufB.getContext('2d');
      drawScene(a, i - 1, t);
      drawScene(b, i, t);
      ctx.drawImage(bufA, 0, 0);
      const p = easeInOut(lt / TR);
      const R = p * 1500;
      // soft wet edge: several thin rings of increasing opacity
      for (const [d, al] of [[42, 0.12], [30, 0.25], [20, 0.4], [11, 0.6], [0, 1]]) {
        if (R < 1) break;
        ctx.save();
        bloomPath(ctx, blooms[i], R, 1 + d / R);
        ctx.clip();
        ctx.globalAlpha = al;
        ctx.drawImage(bufB, 0, 0);
        ctx.restore();
      }
      // a faint darker "tide line" where the wet edge dries
      ctx.save();
      bloomPath(ctx, blooms[i], R, 1.0);
      ctx.strokeStyle = 'rgba(90,70,60,0.12)';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - p;
      ctx.stroke();
      ctx.restore();
    } else {
      drawScene(ctx, i, t);
    }
    drawCaptions(t, s.id);
    // paper texture over everything; it shifts a few pixels 8 times a second like hand-drawn animation
    const step = Math.floor(t * 8);
    const ox = (WC.noise1(step * 0.37, 1) - 0.5) * 8, oy = (WC.noise1(step * 0.37, 2) - 0.5) * 8;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(paper, -12 + ox, -12 + oy);
    ctx.globalCompositeOperation = 'source-over';
    // fade from paper at the start, back to paper at the end
    const fade = Math.max(1 - ramp(t, 0, 0.8), ramp(t, TL.duration - 1.8, TL.duration - 0.2));
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#f4ead8';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = fade * 0.9;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(paper, -12, -12);
    }
    ctx.restore();
  }

  async function init() {
    const fonts = ['600 40px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"', '500 40px "Cormorant Garamond"', '500 40px "Caveat"'];
    await Promise.all(fonts.map((f) => document.fonts.load(f)));
    paper = WC.paperOverlay(W + 24, H + 24, 7);
    blooms = makeBlooms();
    Scenes.init();
    renderFrame(0);
  }

  window.renderFrame = renderFrame;
  window.ready = init();

  // ---------------- player ----------------
  const params = new URLSearchParams(location.search);
  if (params.has('render')) return;

  const audio = document.getElementById('music');
  const btn = document.getElementById('play');
  const bar = document.getElementById('bar');
  const status = document.getElementById('status');
  let playing = false, startWall = 0, startT = Number(params.get('t') || 0), useAudio = true;

  function now() {
    if (useAudio && !audio.paused) return audio.currentTime;
    return startT + (performance.now() - startWall) / 1000;
  }

  function loop() {
    if (!playing) return;
    const t = now();
    renderFrame(t);
    bar.style.width = (100 * t / TL.duration).toFixed(2) + '%';
    if (t >= TL.duration) { playing = false; btn.textContent = '↻ Replay'; btn.hidden = false; startT = 0; return; }
    requestAnimationFrame(loop);
  }

  window.ready.then(() => {
    status.hidden = true;
    btn.hidden = false;
    renderFrame(startT);
  });

  btn.addEventListener('click', async () => {
    btn.hidden = true;
    playing = true;
    audio.currentTime = startT;
    startWall = performance.now();
    try { await audio.play(); } catch (e) { useAudio = false; }
    requestAnimationFrame(loop);
  });

  canvas.addEventListener('click', () => {
    if (!playing) return;
    playing = false;
    startT = now();
    audio.pause();
    btn.textContent = '▶ Play';
    btn.hidden = false;
  });
})();
