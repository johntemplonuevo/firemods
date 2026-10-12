// The ten painted scenes of "What I See".
// Each scene has init() (paints its layers once) and draw(ctx, lt, T)
// where lt = seconds since the scene started and T = global time.
(function (global) {
  'use strict';
  const { W, H } = WC;
  const TL = global.TIMELINE;
  const { clamp, lerp, ramp, smooth, easeOut, easeInOut } = WC;
  const sfxTimes = (type) => TL.sfx.filter((e) => e.type === type).map((e) => e.t);
  const CREAM = '#f4ead8';

  // ---------- shared drawing helpers ----------
  function zoomAbout(ctx, z, cx = W / 2, cy = H / 2) {
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  }

  function glow(ctx, x, y, r, color, alpha, mode = 'screen') {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = clamp(alpha);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function flame(ctx, x, y, h, T, seed = 0) {
    if (h <= 0.5) return;
    const flick = 0.88 + 0.2 * WC.noise1(T * 7, seed) + 0.06 * Math.sin(T * 23 + seed);
    h *= flick;
    const w = h * 0.3;
    const sway = (WC.noise1(T * 2.6, seed + 4) - 0.5) * h * 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - w * 1.25, y - h * 0.08, x - w * 0.75, y - h * 0.62, x + sway, y - h);
    ctx.bezierCurveTo(x + w * 0.75, y - h * 0.62, x + w * 1.25, y - h * 0.08, x, y);
    const g = ctx.createRadialGradient(x, y - h * 0.28, 0, x, y - h * 0.35, h * 0.75);
    g.addColorStop(0, 'rgba(255,253,235,1)');
    g.addColorStop(0.3, 'rgba(255,222,130,0.98)');
    g.addColorStop(0.7, 'rgba(244,140,60,0.8)');
    g.addColorStop(1, 'rgba(210,70,30,0.1)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawCentered(ctx, img, x, y, s = 1, alpha = 1, mode) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha);
    if (mode) ctx.globalCompositeOperation = mode;
    ctx.drawImage(img, x - (img.width * s) / 2, y - (img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  }

  function layer(w = W, h = H) {
    const c = WC.canvas(w, h);
    return [c, c.getContext('2d')];
  }

  function creamPaper(seed) {
    const [c, x] = layer();
    WC.wash(x, W, H, [[0, '#f7efdf'], [1, '#f1e5cf']], seed, { mottle: 0.1, blooms: 0, tint: 'rgb(170,140,100)' });
    return c;
  }

  // a clay oil lamp, side view, painted
  function paintLamp(seed) {
    const [c, x] = layer(380, 210);
    const clay = 'rgb(178,104,64)', shade = 'rgb(112,58,38)';
    WC.blob(x, WC.ellipse(175, 128, 122, 50, 16), clay, { seed, layers: 30, alpha: 0.1, variance: 0.01, grain: 0.2, edge: 2 });
    WC.blob(x, [[255, 104], [342, 100], [350, 118], [340, 132], [258, 146]], clay, { seed: seed + 1, layers: 26, alpha: 0.1, variance: 0.01, grain: 0.2, edge: 2 });
    WC.blob(x, WC.ellipse(185, 152, 110, 26, 14), shade, { seed: seed + 2, layers: 16, alpha: 0.07, variance: 0.03, grain: 0.3, mode: 'multiply' });
    WC.blob(x, WC.ellipse(165, 90, 36, 11, 12), 'rgb(60,30,24)', { seed: seed + 3, layers: 16, alpha: 0.12, variance: 0.02, grain: 0.1 });
    x.save();
    x.strokeStyle = clay;
    x.lineWidth = 13;
    x.globalAlpha = 0.85;
    x.beginPath();
    x.ellipse(50, 112, 26, 30, 0, Math.PI * 0.45, Math.PI * 1.6);
    x.stroke();
    x.restore();
    // light catching the rim
    x.save();
    x.globalAlpha = 0.25;
    x.strokeStyle = 'rgb(255,220,170)';
    x.lineWidth = 4;
    x.beginPath();
    x.ellipse(175, 122, 112, 40, 0, Math.PI * 1.1, Math.PI * 1.75);
    x.stroke();
    x.restore();
    c.wick = [344, 102];
    return c;
  }

  // a painted horizontal brush stroke
  function paintStroke(color, seed) {
    const [c, x] = layer();
    const rng = WC.rng(seed);
    const top = [], bot = [];
    const x0 = 230, x1 = W - 230, yc = H / 2 + 6;
    for (let i = 0; i <= 14; i++) {
      const px = lerp(x0, x1, i / 14);
      const thick = 95 * (0.75 + 0.25 * Math.sin((i / 14) * Math.PI)) + rng.gauss() * 6;
      top.push([px, yc - thick + Math.sin(i * 0.7) * 8]);
      bot.unshift([px, yc + thick * 0.95 + Math.sin(i * 0.5) * 8]);
    }
    WC.blob(x, top.concat(bot), color, { seed, layers: 34, alpha: 0.07, variance: 0.02, baseVariance: 0.03, edge: 3, grain: 0.3 });
    // dry-brush streaks
    x.save();
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const y = yc + rng.gauss() * 55, xs = rng.range(x0, x1), len = rng.range(80, 500);
      x.globalAlpha = rng.range(0.1, 0.45);
      x.lineWidth = rng.range(1, 3.5);
      x.beginPath();
      x.moveTo(xs, y);
      x.lineTo(xs + len, y + rng.gauss() * 3);
      x.stroke();
    }
    x.restore();
    // a few splatter drops
    for (let i = 0; i < 9; i++) {
      const r = rng.range(4, 16);
      WC.blob(x, WC.ellipse(rng.range(x0, x1), yc + rng.gauss() * 200, r, r, 8), color, { seed: seed + 50 + i, layers: 12, alpha: 0.12, variance: 0.08, grain: 0.15 });
    }
    return c;
  }

  // ====================================================================
  const scenes = {};

  // ---------- 1. title ----------
  scenes.title = {
    init() {
      this.bg = creamPaper(11);
      [this.blue] = layer();
      WC.blob(this.blue.getContext('2d'), WC.ellipse(W / 2 - 60, H / 2 + 10, 560, 330, 14), 'rgb(150,182,214)', { seed: 12, layers: 40, alpha: 0.045, variance: 0.12, edge: 2.5 });
      [this.gold] = layer();
      WC.blob(this.gold.getContext('2d'), WC.ellipse(W / 2 + 120, H / 2 - 40, 330, 300, 14), 'rgb(240,196,118)', { seed: 13, layers: 40, alpha: 0.05, variance: 0.12, edge: 2.5 });
      const [d, dx] = layer();
      const rng = WC.rng(14);
      for (let i = 0; i < 16; i++) {
        const r = rng.range(6, 26), a = rng() * Math.PI * 2, R = rng.range(420, 700);
        WC.blob(dx, WC.ellipse(W / 2 + Math.cos(a) * R, H / 2 + Math.sin(a) * R * 0.6, r, r, 8), rng() < 0.5 ? 'rgb(140,170,205)' : 'rgb(232,180,100)', { seed: 15 + i, layers: 14, alpha: 0.1, variance: 0.1 });
      }
      this.drops = d;
    },
    draw(ctx, lt) {
      ctx.drawImage(this.bg, 0, 0);
      const zb = 0.7 + 0.32 * easeOut(lt / 4.5);
      drawCentered(ctx, this.blue, W / 2, H / 2, zb, easeOut(lt / 2.5) * 0.85, 'multiply');
      const zg = 0.55 + 0.47 * easeOut((lt - 0.7) / 4.5);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.sin(lt * 0.2) * 0.03);
      ctx.translate(-W / 2, -H / 2);
      drawCentered(ctx, this.gold, W / 2, H / 2, zg, easeOut((lt - 0.7) / 2.5) * 0.8);
      ctx.restore();
      drawCentered(ctx, this.drops, W / 2, H / 2, 1 + lt * 0.006, ramp(lt, 1.5, 4.5) * 0.8, 'multiply');
    },
    captionY: null,
  };

  // ---------- 2. the eye is the lamp of the body ----------
  scenes.lamp = {
    init() {
      [this.bg] = layer();
      WC.wash(this.bg.getContext('2d'), W, H, [[0, '#1b2040'], [0.55, '#2a2b56'], [1, '#352f55']], 21, { mottle: 0.35, tint: 'rgb(10,10,30)' });
      [this.gold] = layer();
      WC.blob(this.gold.getContext('2d'), WC.ellipse(W / 2, H * 0.44, 760, 470, 14), 'rgb(226,148,48)', { seed: 22, layers: 40, alpha: 0.05, variance: 0.13, edge: 2 });
      // the eye
      this.ex = W / 2; this.ey = H * 0.42; this.rx = 380; this.ry = 165;
      const [e, ex] = layer(900, 460);
      const pts = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([70 + 760 * u, 230 - this.ry * 4 * u * (1 - u)]); }
      for (let i = 19; i >= 1; i--) { const u = i / 20; pts.push([70 + 760 * u, 230 + this.ry * 0.85 * 4 * u * (1 - u)]); }
      WC.blob(ex, pts, 'rgb(242,234,216)', { seed: 23, layers: 26, alpha: 0.12, variance: 0.01, grain: 0.15 });
      WC.blob(ex, WC.ellipse(450, 236, 300, 60, 12), 'rgb(190,190,210)', { seed: 24, layers: 12, alpha: 0.04, variance: 0.08, mode: 'multiply' });
      this.sclera = e;
      const [ir, ix] = layer(320, 320);
      WC.blob(ix, WC.ellipse(160, 160, 132, 132, 16), 'rgb(44,82,138)', { seed: 25, layers: 30, alpha: 0.1, variance: 0.02, edge: 3 });
      WC.blob(ix, WC.ellipse(160, 160, 100, 100, 14), 'rgb(64,138,150)', { seed: 26, layers: 24, alpha: 0.07, variance: 0.06 });
      WC.blob(ix, WC.ellipse(160, 160, 62, 62, 12), 'rgb(222,176,92)', { seed: 27, layers: 24, alpha: 0.08, variance: 0.06 });
      WC.blob(ix, WC.ellipse(160, 160, 40, 40, 12), 'rgb(22,22,40)', { seed: 28, layers: 26, alpha: 0.14, variance: 0.02, grain: 0.1 });
      const rng = WC.rng(29);
      ix.strokeStyle = 'rgba(20,40,80,0.25)';
      for (let i = 0; i < 40; i++) {
        const a = rng() * Math.PI * 2;
        ix.lineWidth = rng.range(1, 2.5);
        ix.beginPath();
        ix.moveTo(160 + Math.cos(a) * 46, 160 + Math.sin(a) * 46);
        ix.lineTo(160 + Math.cos(a + rng.gauss() * 0.05) * 128, 160 + Math.sin(a + rng.gauss() * 0.05) * 128);
        ix.stroke();
      }
      this.iris = ir;
      this.lidJit = Array.from({ length: 6 }, () => [rng.gauss() * 5, rng.gauss() * 5, rng.range(3, 8)]);
    },
    eyePath(ctx, open) {
      const { ex, ey, rx, ry } = this;
      ctx.beginPath();
      ctx.moveTo(ex - rx, ey);
      ctx.quadraticCurveTo(ex, ey - 2 * ry * open, ex + rx, ey);
      ctx.quadraticCurveTo(ex, ey + 2 * ry * 0.85 * open, ex - rx, ey);
      ctx.closePath();
    },
    draw(ctx, lt, T) {
      const open = Math.max(0.02, easeInOut((lt - 0.8) / 1.8) * (1 - 0.72 * easeInOut((lt - 9.8) / 3)));
      const flameOn = ramp(lt, 2.1, 3.0);
      const light = ramp(lt, 5.5, 8.5) * (1 - ramp(lt, 9.6, 12));
      const dim = ramp(lt, 9.6, 13);
      ctx.save();
      zoomAbout(ctx, 1 + 0.07 * easeInOut(lt / 13), this.ex, this.ey);
      ctx.drawImage(this.bg, 0, 0);
      glow(ctx, this.ex, this.ey, 650, 'rgba(255,215,150,0.5)', flameOn * 0.35 + light * 0.3);
      // golden flood: "your whole body benefits from the light"
      drawCentered(ctx, this.gold, W / 2, H / 2, 0.55 + 0.6 * light, light * 0.75, 'lighter');
      drawCentered(ctx, this.gold, W / 2, H / 2, 0.4 + 0.5 * light, light * 0.35, 'screen');
      if (light > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + lt * 0.04;
          const spread = 0.05 + 0.02 * Math.sin(i * 3.1 + lt);
          const g = ctx.createRadialGradient(this.ex, this.ey, 60, this.ex, this.ey, 1300);
          g.addColorStop(0, `rgba(255,226,160,${0.32 * light})`);
          g.addColorStop(1, 'rgba(255,226,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(this.ex, this.ey);
          ctx.lineTo(this.ex + Math.cos(a - spread) * 1400, this.ey + Math.sin(a - spread) * 1400);
          ctx.lineTo(this.ex + Math.cos(a + spread) * 1400, this.ey + Math.sin(a + spread) * 1400);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      // eye contents, clipped by the lids
      ctx.save();
      this.eyePath(ctx, open);
      ctx.clip();
      ctx.drawImage(this.sclera, this.ex - 450, this.ey - 230);
      const lookX = (WC.noise1(lt * 0.4, 3) - 0.5) * 60, lookY = (WC.noise1(lt * 0.35, 9) - 0.5) * 20;
      const ix = this.ex + lookX, iy = this.ey + lookY;
      ctx.drawImage(this.iris, ix - 160, iy - 160);
      // the lamp inside the eye
      glow(ctx, ix, iy, 120, 'rgba(255,220,140,0.95)', flameOn * (1 - dim * 0.8));
      flame(ctx, ix, iy + 26, 62 * flameOn * (1 - dim * 0.55), T, 1);
      glow(ctx, ix - 34, iy - 38, 18, 'rgba(255,255,255,0.9)', 0.8);
      if (dim > 0) {
        ctx.globalAlpha = dim * 0.6;
        ctx.fillStyle = 'rgb(60,62,80)';
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillRect(this.ex - this.rx, this.ey - this.ry * 2, this.rx * 2, this.ry * 4);
      }
      ctx.restore();
      // painted lid lines
      ctx.save();
      ctx.lineCap = 'round';
      for (const [jx, jy, lw] of this.lidJit) {
        ctx.strokeStyle = 'rgba(14,16,40,0.45)';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(this.ex - this.rx + jx, this.ey + jy);
        ctx.quadraticCurveTo(this.ex + jx, this.ey - 2 * this.ry * open + jy, this.ex + this.rx + jx, this.ey + jy * 0.5);
        ctx.stroke();
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(this.ex - this.rx + jx, this.ey + jy * 0.5);
        ctx.quadraticCurveTo(this.ex + jx, this.ey + 2 * this.ry * 0.85 * open + jy, this.ex + this.rx + jx, this.ey + jy);
        ctx.stroke();
      }
      // lashes
      ctx.strokeStyle = 'rgba(14,16,40,0.7)';
      ctx.lineWidth = 4;
      for (let i = 1; i < 10; i++) {
        const u = i / 10;
        const px = lerp(this.ex - this.rx, this.ex + this.rx, u);
        const py = this.ey - 2 * this.ry * open * 2 * u * (1 - u);
        const ang = -Math.PI / 2 + (u - 0.5) * 1.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + Math.cos(ang) * 22, py + Math.sin(ang) * 22, px + Math.cos(ang + 0.3) * 36, py + Math.sin(ang + 0.3) * 40);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
      // darkness closing in: "your whole person is without light"
      if (dim > 0) {
        const g = ctx.createRadialGradient(this.ex, this.ey, lerp(900, 120, dim), this.ex, this.ey, lerp(1300, 700, dim));
        g.addColorStop(0, 'rgba(6,7,16,0)');
        g.addColorStop(1, `rgba(6,7,16,${0.92 * dim})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };

  // ---------- 3 & 7. "What I see, I consume." ----------
  function consumeScene(strokeColor, dropColor, seed, warm) {
    return {
      init() {
        this.bg = creamPaper(seed);
        this.stroke = paintStroke(strokeColor, seed + 1);
        const [d, dx] = layer();
        const rng = WC.rng(seed + 2);
        for (let i = 0; i < 22; i++) {
          const r = rng.range(5, 22);
          WC.blob(dx, WC.ellipse(rng() * W, rng() < 0.5 ? rng.range(60, 330) : rng.range(760, 1030), r, r, 8), dropColor, { seed: seed + 10 + i, layers: 12, alpha: 0.1, variance: 0.1 });
        }
        this.drops = d;
        if (warm) {
          [this.sun] = layer();
          WC.blob(this.sun.getContext('2d'), WC.ellipse(W / 2, H / 2, 640, 420, 14), 'rgb(250,214,150)', { seed: seed + 3, layers: 34, alpha: 0.04, variance: 0.13 });
        }
      },
      draw(ctx, lt) {
        ctx.save();
        zoomAbout(ctx, 1.0 + 0.035 * lt / 7);
        ctx.drawImage(this.bg, 0, 0);
        if (this.sun) drawCentered(ctx, this.sun, W / 2, H / 2, 0.8 + 0.25 * easeOut(lt / 4), easeOut(lt / 2) * 0.9, 'multiply');
        const rev = easeOut((lt - 0.4) / 1.5);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 200 + (W - 360) * rev, H);
        ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.stroke, 0, 0);
        ctx.restore();
        drawCentered(ctx, this.drops, W / 2, H / 2, 1, ramp(lt, 1.2, 3.2) * 0.85, 'multiply');
        ctx.restore();
      },
    };
  }
  scenes.consume1 = consumeScene('rgb(128,148,176)', 'rgb(120,130,150)', 31, false);
  scenes.consume2 = consumeScene('rgb(236,180,96)', 'rgb(140,170,120)', 71, true);

  // ---------- 4. the feed ----------
  const PHONE = { x: 1180, y: 540, s: 0.86, sx: 48, sy: 64, sw: 464, sh: 912 };
  const AI_POSTS = [
    ['✦ New AI model just dropped', 'Trending in AI · 2m'],
    ['10 AI tools you need today', 'AI Daily · 5m'],
    ['Watch: AI makes a movie', 'Reels · 1m'],
    ['Prompt tricks nobody tells you', 'AI Hacks · 8m'],
    ['Is AI changing everything?', 'Tech Now · 3m'],
    ['Build an AI agent in 5 min', 'AI Daily · 12m'],
    ['✦ AI art challenge', 'Trending · 4m'],
    ['The future of AI, explained', 'AI Weekly · 9m'],
  ];
  const FRIEND_POSTS = [['Ana · beach day with family', 'Friends · 3d'], ['Mark · our new puppy!', 'Friends · 5d'], ['Lia · graduation day', 'Friends · 1w']];
  const AI_COLS = ['rgb(108,72,196)', 'rgb(36,140,186)', 'rgb(176,56,150)', 'rgb(64,86,200)'];

  scenes.feed = {
    init() {
      [this.bg] = layer();
      WC.wash(this.bg.getContext('2d'), W, H, [[0, '#15172b'], [0.5, '#1e1a3a'], [1, '#110f22']], 41, { mottle: 0.4, tint: 'rgb(0,0,10)' });
      // phone body
      const [p, px] = layer(560, 1040);
      WC.blob(px, WC.roundRect(20, 20, 520, 1000, 72, 5), 'rgb(22,23,34)', { seed: 42, layers: 30, alpha: 0.1, variance: 0.004, grain: 0.15 });
      px.strokeStyle = 'rgba(160,170,220,0.25)';
      px.lineWidth = 3;
      WC.path(px, WC.roundRect(24, 24, 512, 992, 68, 6));
      px.stroke();
      this.phone = p;
      // feed cards
      this.cards = [];
      for (let i = 0; i < 42; i++) {
        const friend = i % 6 === 3;
        this.cards.push(this.makeCard(i, friend));
      }
      // head-and-shoulders silhouette in the foreground
      const [hd, hx] = layer(900, 760);
      WC.blob(hx, WC.ellipse(430, 300, 170, 200, 16), 'rgb(9,9,18)', { seed: 44, layers: 30, alpha: 0.12, variance: 0.01, grain: 0.05 });
      WC.blob(hx, WC.ellipse(440, 720, 430, 230, 18), 'rgb(9,9,18)', { seed: 45, layers: 30, alpha: 0.12, variance: 0.01, grain: 0.05 });
      WC.blob(hx, WC.roundRect(360, 420, 150, 200, 40, 3), 'rgb(9,9,18)', { seed: 46, layers: 24, alpha: 0.14, variance: 0.01, grain: 0.05 });
      this.head = hd;
      // floating glyphs that spill out of the phone
      const rng = WC.rng(47);
      this.glyphs = [];
      let ts = 31.5;
      while (ts < 50.3) {
        this.glyphs.push({
          t0: ts, a: rng() * Math.PI * 2, sp: rng.range(70, 170), sw: rng.range(0.15, 0.5) * (rng() < 0.5 ? -1 : 1),
          ch: rng.pick(['✦', 'AI', '✧', 'AI', '✦', '#AI', '◆']), size: rng.range(22, 54),
          col: rng.pick(['rgb(140,230,255)', 'rgb(190,150,255)', 'rgb(255,130,220)', 'rgb(150,170,255)']),
          ox: rng.range(-160, 160), oy: rng.range(-360, 360),
        });
        ts += lerp(0.5, 0.05, clamp((ts - 31.5) / 17));
      }
      this.swipes = sfxTimes('swipe');
      this.pings = sfxTimes('ping');
    },
    makeCard(i, friend) {
      const cw = 420, ch = 300;
      const [c, x] = layer(cw, ch);
      const rng = WC.rng(500 + i);
      const col = friend ? 'rgb(206,176,132)' : AI_COLS[i % 4];
      WC.blob(x, WC.roundRect(6, 6, cw - 12, ch - 12, 26, 3), col, { seed: 600 + i, layers: 20, alpha: 0.13, variance: 0.006, grain: 0.15 });
      x.save();
      WC.path(x, WC.roundRect(22, 22, cw - 44, 188, 18, 3));
      x.clip();
      if (friend) {
        const g = x.createLinearGradient(0, 22, 0, 210);
        g.addColorStop(0, 'rgb(250,226,180)');
        g.addColorStop(1, 'rgb(236,190,140)');
        x.fillStyle = g;
        x.fillRect(0, 0, cw, ch);
        WC.blob(x, WC.ellipse(300, 80, 34, 34, 10), 'rgb(250,240,210)', { seed: 700 + i, layers: 14, alpha: 0.15, variance: 0.03 });
        WC.blob(x, [[0, 210], [0, 160], [140, 120], [260, 170], [420, 140], [420, 210]], 'rgb(150,170,120)', { seed: 710 + i, layers: 16, alpha: 0.12, variance: 0.03 });
      } else {
        const g = x.createRadialGradient(rng.range(100, 320), rng.range(60, 160), 10, 210, 110, 260);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.3, col.replace('rgb', 'rgba').replace(')', ',0.9)'));
        g.addColorStop(1, 'rgba(10,10,30,1)');
        x.fillStyle = g;
        x.fillRect(0, 0, cw, ch);
        x.fillStyle = 'rgba(255,255,255,0.9)';
        x.font = '700 92px "DejaVu Sans", sans-serif';
        x.textAlign = 'center';
        x.fillText(rng() < 0.5 ? 'AI' : '✦ AI', 210, 150);
        x.font = '28px "DejaVu Sans", sans-serif';
        for (let k = 0; k < 6; k++) x.fillText('✦', rng.range(40, 380), rng.range(40, 200));
      }
      x.restore();
      const [title, sub] = friend ? FRIEND_POSTS[i % 3] : AI_POSTS[i % 8];
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.font = '600 24px "DejaVu Sans", sans-serif';
      x.fillText(title, 26, 246);
      x.fillStyle = 'rgba(255,255,255,0.6)';
      x.font = '18px "DejaVu Sans", sans-serif';
      x.fillText(sub, 26, 276);
      return c;
    },
    captionX: 0.3,
    captionY: 0.42,
    captionMax: 760,
    zoom(lt) { return 1 + 0.24 * easeInOut(lt / 21.3); },
    drawPhone(ctx, T, screenOn) {
      const P = PHONE;
      ctx.save();
      ctx.translate(P.x, P.y);
      ctx.scale(P.s, P.s);
      ctx.translate(-280, -520);
      ctx.drawImage(this.phone, 0, 0);
      ctx.save();
      WC.path(ctx, WC.roundRect(P.sx, P.sy, P.sw, P.sh, 44, 5));
      ctx.clip();
      ctx.fillStyle = '#0c0e1d';
      ctx.fillRect(P.sx, P.sy, P.sw, P.sh);
      if (screenOn > 0) {
        ctx.globalAlpha = screenOn;
        // scrolling: each swipe pushes the feed up by one card
        let off = 0;
        for (const ts of this.swipes) off += easeOut((T - ts) / 0.32);
        off *= 320;
        const y0 = P.sy + 70 - off;
        for (let i = 0; i < this.cards.length; i++) {
          const y = y0 + i * 320;
          if (y > P.sy + P.sh || y + 300 < P.sy) continue;
          ctx.drawImage(this.cards[i], P.sx + 22, y);
        }
        // top bar
        ctx.fillStyle = 'rgba(12,14,29,0.92)';
        ctx.fillRect(P.sx, P.sy, P.sw, 60);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '600 26px "DejaVu Sans", sans-serif';
        ctx.fillText('For You', P.sx + 24, P.sy + 40);
        // notification banners
        for (const tp of this.pings) {
          const age = T - tp;
          if (age < 0 || age > 1.1) continue;
          const yIn = P.sy + 12 - 90 * (1 - easeOut(age / 0.22));
          ctx.save();
          ctx.globalAlpha = screenOn * (1 - ramp(age, 0.75, 1.1));
          ctx.fillStyle = 'rgba(245,244,255,0.95)';
          WC.path(ctx, WC.roundRect(P.sx + 14, yIn, P.sw - 28, 74, 22, 4));
          ctx.fill();
          ctx.fillStyle = 'rgb(110,72,196)';
          ctx.beginPath();
          ctx.arc(P.sx + 52, yIn + 37, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '700 18px "DejaVu Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('AI', P.sx + 52, yIn + 44);
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgb(30,30,50)';
          ctx.font = '600 20px "DejaVu Sans", sans-serif';
          ctx.fillText('✦ New AI update for you', P.sx + 84, yIn + 32);
          ctx.fillStyle = 'rgb(90,90,110)';
          ctx.font = '17px "DejaVu Sans", sans-serif';
          ctx.fillText('Tap to see what’s trending', P.sx + 84, yIn + 56);
          ctx.restore();
        }
      }
      ctx.restore();
      ctx.restore();
    },
    draw(ctx, lt, T) {
      const z = this.zoom(lt);
      const screenOn = ramp(T, 29.6, 30.0);
      let pingPulse = 0;
      for (const tp of this.pings) if (T >= tp) pingPulse = Math.max(pingPulse, Math.exp(-(T - tp) * 6));
      const tension = ramp(lt, 6, 20);
      ctx.save();
      zoomAbout(ctx, z, PHONE.x, PHONE.y);
      ctx.drawImage(this.bg, 0, 0);
      glow(ctx, PHONE.x, PHONE.y, 760 + 200 * tension, 'rgba(120,110,255,0.9)', screenOn * (0.3 + 0.3 * tension + 0.18 * pingPulse));
      this.drawPhone(ctx, T, screenOn);
      // ping ripples
      for (const tp of this.pings) {
        const age = T - tp;
        if (age < 0 || age > 0.8) continue;
        ctx.save();
        ctx.globalAlpha = (1 - age / 0.8) * 0.5;
        ctx.strokeStyle = 'rgb(170,190,255)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(PHONE.x, PHONE.y - 300, 60 + age * 400, 30 + age * 200, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // glyphs spilling out and swirling around
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.textAlign = 'center';
      for (const g of this.glyphs) {
        const age = T - g.t0;
        if (age < 0) continue;
        const r = 40 + g.sp * age;
        const a = g.a + g.sw * age;
        const x = PHONE.x + g.ox * 0.5 + Math.cos(a) * r * 1.3;
        const y = PHONE.y + g.oy * 0.5 + Math.sin(a) * r * 0.8;
        ctx.globalAlpha = ramp(age, 0, 0.4) * (1 - ramp(age, 4, 7)) * 0.85;
        ctx.fillStyle = g.col;
        ctx.font = `700 ${g.size}px "DejaVu Sans", sans-serif`;
        ctx.fillText(g.ch, x, y);
      }
      ctx.restore();
      ctx.restore();
      // the viewer, in the foreground
      ctx.save();
      zoomAbout(ctx, 1 + (z - 1) * 0.4, PHONE.x, PHONE.y);
      ctx.drawImage(this.head, -110, 520);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = screenOn * (0.35 + 0.3 * tension + 0.2 * pingPulse);
      ctx.strokeStyle = 'rgb(150,170,255)';
      ctx.lineWidth = 7;
      ctx.filter = 'blur(4px)';
      ctx.beginPath();
      ctx.ellipse(-110 + 430, 520 + 300, 166, 196, 0, -1.25, 0.5);
      ctx.stroke();
      ctx.restore();
      // "I am consumed by it": darkness closing in around the phone
      const dark = ramp(T, 45.5, 50);
      if (dark > 0) {
        const g = ctx.createRadialGradient(PHONE.x, PHONE.y, lerp(1000, 260, dark), PHONE.x, PHONE.y, lerp(1400, 700, dark));
        g.addColorStop(0, 'rgba(4,4,10,0)');
        g.addColorStop(1, `rgba(4,4,10,${0.9 * dark})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };

  // ---------- 5. phone off, darkness ----------
  scenes.dark = {
    init() {},
    draw(ctx, lt, T) {
      ctx.fillStyle = '#06070c';
      ctx.fillRect(0, 0, W, H);
      const feed = scenes.feed;
      const z = feed.zoom(21.3);
      ctx.save();
      zoomAbout(ctx, z, PHONE.x, PHONE.y);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(feed.phone, PHONE.x - 280 * PHONE.s, PHONE.y - 520 * PHONE.s, 560 * PHONE.s, 1040 * PHONE.s);
      ctx.globalAlpha = 1;
      // old-TV switch-off: a line that collapses to a dot
      if (lt < 0.5) {
        const w = 380 * (1 - easeOut(lt / 0.3));
        const a = 1 - ramp(lt, 0.3, 0.5);
        ctx.fillStyle = `rgba(220,225,255,${a})`;
        ctx.fillRect(PHONE.x - w / 2 - 3, PHONE.y - 3, w + 6, 6);
        glow(ctx, PHONE.x, PHONE.y, 90, 'rgba(200,210,255,1)', a);
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(feed.head, -110, 520);
      ctx.restore();
      // first warmth of dawn at the bottom edge
      const dawn = ramp(lt, 2.8, 4.7);
      if (dawn > 0) {
        const g = ctx.createLinearGradient(0, H, 0, H * 0.45);
        g.addColorStop(0, `rgba(240,170,110,${0.55 * dawn})`);
        g.addColorStop(1, 'rgba(240,170,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };

  // ---------- 6. the Japan Alps ----------
  const LW = W + 380;
  scenes.alps = {
    init() {
      [this.sky] = layer(LW, H);
      WC.wash(this.sky.getContext('2d'), LW, H, [[0, '#9fbedb'], [0.42, '#d6e2e8'], [0.62, '#f3dfc6'], [0.8, '#f6d2ab']], 61, { mottle: 0.14, tint: 'rgb(110,120,150)' });
      [this.sun] = layer(400, 400);
      WC.blob(this.sun.getContext('2d'), WC.ellipse(200, 200, 70, 70, 12), 'rgb(252,226,170)', { seed: 62, layers: 30, alpha: 0.1, variance: 0.03, grain: 0.1 });
      this.far = WC.mountains(LW, H, { y: 600, amp: 110, seed: 63, color: 'rgb(150,160,198)', shade: 'rgb(118,118,168)', snow: 455, snowColor: 'rgb(250,248,250)', peaks: [[0.22, 170, 0.07], [0.48, 250, 0.09], [0.7, 190, 0.07], [0.9, 140, 0.06]], haze: 'rgba(244,228,214,0.6)' });
      this.mid = WC.mountains(LW, H, { y: 720, amp: 80, seed: 64, color: 'rgb(98,122,154)', shade: 'rgb(68,84,124)', snow: 585, snowColor: 'rgb(236,240,246)', peaks: [[0.1, 150, 0.06], [0.36, 110, 0.06], [0.62, 200, 0.07], [0.85, 120, 0.05]], haze: 'rgba(228,222,222,0.35)' });
      this.forest = WC.mountains(LW, H, { y: 860, amp: 40, seed: 65, color: 'rgb(60,96,92)', shade: 'rgb(38,62,70)', levels: 6 });
      const fx = this.forest.getContext('2d'), rng = WC.rng(66);
      for (let i = 0; i < 150; i++) {
        const x = rng.range(-20, LW + 20);
        const y = WC.ridgeY(this.forest.ridge, x) + rng.range(-6, 40);
        WC.blob(fx, WC.pine(x, y, rng.range(50, 120), rng), rng() < 0.5 ? 'rgb(36,70,66)' : 'rgb(48,84,74)', { seed: 800 + i, layers: 10, alpha: 0.13, variance: 0.03, grain: 0.15 });
      }
      this.near = WC.mountains(LW, H, { y: 975, amp: 26, seed: 67, color: 'rgb(84,110,70)', shade: 'rgb(52,72,52)', levels: 6, peaks: [[0.44, 50, 0.12]] });
      const nx = this.near.getContext('2d');
      nx.save();
      nx.lineCap = 'round';
      for (let i = 0; i < 500; i++) {
        const x = rng.range(0, LW), y = WC.ridgeY(this.near.ridge, x) + rng.range(2, 120);
        nx.strokeStyle = rng() < 0.5 ? 'rgba(40,60,40,0.4)' : 'rgba(150,170,100,0.35)';
        nx.lineWidth = rng.range(1.5, 3.5);
        nx.beginPath();
        nx.moveTo(x, y);
        nx.quadraticCurveTo(x + rng.gauss() * 4, y - 12, x + rng.gauss() * 10, y - rng.range(14, 34));
        nx.stroke();
      }
      nx.restore();
      [this.mist] = layer(LW, 300);
      const mx = this.mist.getContext('2d');
      for (let i = 0; i < 7; i++) {
        WC.blob(mx, WC.ellipse(rng.range(0, LW), rng.range(110, 190), rng.range(260, 480), rng.range(26, 50), 10), 'rgb(255,252,248)', { seed: 900 + i, layers: 16, alpha: 0.05, variance: 0.12, grain: 0.3 });
      }
      this.fig = WC.figure(1.0, { body: 'rgb(48,64,100)', dark: 'rgb(34,38,58)', hair: 'rgb(42,32,30)' }, 68);
      this.figX = 1010;
      this.figY = WC.ridgeY(this.near.ridge, this.figX) + 8;
      // a ghost of the phone that dissolves away
      const [g, gx] = layer(120, 220);
      gx.strokeStyle = 'rgba(40,46,70,0.85)';
      gx.lineWidth = 6;
      WC.path(gx, WC.roundRect(10, 10, 100, 200, 18, 4));
      gx.stroke();
      gx.fillStyle = 'rgba(100,90,190,0.35)';
      WC.path(gx, WC.roundRect(18, 26, 84, 168, 10, 4));
      gx.fill();
      this.ghost = g;
      this.specks = Array.from({ length: 70 }, () => [rng.range(-50, 50), rng.range(-100, 100), rng.range(0.6, 1.4), rng.range(-1, 1)]);
      this.birds = Array.from({ length: 6 }, (_, i) => ({ t0: 9 + i * 0.5 + rng() * 0.6, y: rng.range(260, 420), sp: rng.range(150, 200), ph: rng() * 6, s: rng.range(0.7, 1.2) }));
    },
    draw(ctx, lt, T) {
      const cam = easeInOut(lt / 24) * (LW - W);
      ctx.save();
      zoomAbout(ctx, 1.07 - 0.07 * easeOut(lt / 24));
      ctx.drawImage(this.sky, -cam * 0.15, 0);
      const sunY = lerp(420, 300, easeOut(lt / 24));
      const sunX = LW * 0.66 - cam * 0.15;
      glow(ctx, sunX, sunY, 520, 'rgba(255,236,190,0.95)', 0.75);
      drawCentered(ctx, this.sun, sunX, sunY, 1, 0.95);
      ctx.drawImage(this.far, -cam * 0.3, 0);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.mist, -cam * 0.4 + lt * 10 - 150, 470);
      ctx.restore();
      ctx.drawImage(this.mid, -cam * 0.5, 0);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this.mist, -cam * 0.6 - lt * 12 - 100, 640);
      ctx.restore();
      ctx.drawImage(this.forest, -cam * 0.75, 0);
      ctx.drawImage(this.near, -cam, 0);
      // the person, looking out at the view
      const f = this.fig, breathe = 1 + 0.006 * Math.sin(lt * 1.6);
      ctx.drawImage(f.canvas, this.figX - cam - f.ox, this.figY - f.oy * breathe, f.canvas.width, f.canvas.height * breathe);
      // phone ghost dissolving into the sky (uninstalled)
      const gIn = ramp(lt, 6.0, 6.8), gOut = ramp(lt, 7.6, 9.6);
      if (gIn > 0 && gOut < 1) {
        const gx = this.figX - cam + 150, gy = 470;
        drawCentered(ctx, this.ghost, gx, gy - gOut * 40, 1, gIn * (1 - gOut) * 0.9);
        ctx.save();
        ctx.fillStyle = 'rgba(70,70,120,0.6)';
        for (const [sx, sy, sp, dr] of this.specks) {
          const k = gOut * sp;
          ctx.globalAlpha = gIn * clamp(gOut * 3) * (1 - gOut) * 0.9;
          ctx.beginPath();
          ctx.arc(gx + sx + k * 200 * (0.6 + dr), gy + sy - k * 180, 3 * (1 - gOut) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      // birds crossing the sky
      ctx.save();
      ctx.strokeStyle = 'rgba(50,50,70,0.75)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      for (const b of this.birds) {
        const age = lt - b.t0;
        if (age < 0 || age > 14) continue;
        const x = -60 + b.sp * age * 1.1, y = b.y + Math.sin(age * 0.8 + b.ph) * 20;
        const flap = Math.sin(age * 9 + b.ph) * 12 * b.s, wsp = 18 * b.s;
        ctx.beginPath();
        ctx.moveTo(x - wsp, y - flap);
        ctx.quadraticCurveTo(x - wsp * 0.4, y - flap * 0.2 - 4, x, y);
        ctx.quadraticCurveTo(x + wsp * 0.4, y - flap * 0.2 - 4, x + wsp, y - flap);
        ctx.stroke();
      }
      ctx.restore();
    },
  };

  // ---------- 8. bringing Jesus' light into my whole being ----------
  scenes.light = {
    init() {
      [this.sky] = layer();
      WC.wash(this.sky.getContext('2d'), W, H, [[0, '#f8ebcb'], [0.45, '#f3d39b'], [1, '#e9b97e']], 81, { mottle: 0.16, tint: 'rgb(170,120,70)' });
      this.far = WC.mountains(W, H, { y: 720, amp: 100, seed: 82, color: 'rgb(214,168,150)', shade: 'rgb(188,138,132)', snow: 600, snowColor: 'rgb(255,240,226)', peaks: [[0.18, 140, 0.07], [0.78, 170, 0.08]], haze: 'rgba(252,232,200,0.6)' });
      this.hill = WC.mountains(W, H, { y: 930, amp: 22, seed: 83, color: 'rgb(150,122,74)', shade: 'rgb(112,86,52)', levels: 6, peaks: [[0.5, 110, 0.22]] });
      this.fig = WC.figure(1.45, { body: 'rgb(54,62,98)', dark: 'rgb(36,38,58)', hair: 'rgb(44,32,30)' }, 84, false);
      this.figX = W / 2;
      this.figY = WC.ridgeY(this.hill.ridge, this.figX) + 10;
      const rng = WC.rng(85);
      this.motes = Array.from({ length: 70 }, () => [rng() * W, rng() * H, rng.range(10, 40), rng.range(1.5, 4), rng() * 6]);
      [this.petal] = layer(40, 30);
      WC.blob(this.petal.getContext('2d'), WC.ellipse(20, 15, 14, 8, 10), 'rgb(240,160,170)', { seed: 86, layers: 14, alpha: 0.15, variance: 0.05, grain: 0.1 });
      this.petals = Array.from({ length: 30 }, () => [rng() * W, rng.range(-200, -20), rng.range(50, 90), rng() * 6, rng.range(0.6, 1.2)]);
    },
    draw(ctx, lt, T) {
      const z = 1 + 0.08 * easeInOut(lt / 16);
      ctx.save();
      zoomAbout(ctx, z, this.figX, this.figY - 150);
      ctx.drawImage(this.sky, 0, 0);
      const src = [W / 2, -40], on = ramp(lt, 0.3, 3);
      glow(ctx, src[0], src[1], 900, 'rgba(255,250,225,1)', 0.85 * on);
      // rays
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 11; i++) {
        const a = Math.PI / 2 + (i - 5) * 0.13 + Math.sin(lt * 0.3 + i) * 0.015;
        const sp = 0.035 + 0.015 * Math.sin(i * 2.3);
        const g = ctx.createLinearGradient(src[0], src[1], src[0], src[1] + 1100);
        const al = (0.2 + 0.08 * Math.sin(lt * 0.9 + i * 1.7)) * on;
        g.addColorStop(0, `rgba(255,246,210,${al})`);
        g.addColorStop(1, 'rgba(255,246,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(src[0], src[1]);
        ctx.lineTo(src[0] + Math.cos(a - sp) * 1300, src[1] + Math.sin(a - sp) * 1300);
        ctx.lineTo(src[0] + Math.cos(a + sp) * 1300, src[1] + Math.sin(a + sp) * 1300);
        ctx.closePath();
        ctx.fill();
      }
      // a soft cross-shaped flare in the light source
      ctx.globalAlpha = 0.45 * on;
      let g = ctx.createLinearGradient(0, src[1], 0, src[1] + 520);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(src[0] - 5, src[1], 10, 520);
      g = ctx.createLinearGradient(src[0] - 300, 0, src[0] + 300, 0);
      g.addColorStop(0, 'rgba(255,255,240,0)');
      g.addColorStop(0.5, 'rgba(255,255,240,1)');
      g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(src[0] - 300, src[1] + 150, 600, 8);
      ctx.restore();
      ctx.drawImage(this.far, 0, 0);
      ctx.drawImage(this.hill, 0, 0);
      // the light filling the person
      const aura = ramp(lt, 1, 12);
      glow(ctx, this.figX, this.figY - 180, 260 + 260 * aura, 'rgba(255,240,190,1)', 0.25 + 0.6 * aura);
      const f = this.fig, s = f.scale;
      // arms open slowly to receive ("Will I think the way He thinks?")
      const open = easeInOut((lt - 6) / 3.5);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgb(54,62,98)';
      ctx.lineWidth = 13 * s;
      const shY = this.figY - 166 * s;
      for (const side of [-1, 1]) {
        const ang = lerp(0.1, 0.95, open);
        const sx = this.figX + side * 30 * s;
        ctx.beginPath();
        ctx.moveTo(sx, shY);
        ctx.lineTo(sx + side * Math.sin(ang) * 80 * s, shY + Math.cos(ang) * 80 * s);
        ctx.stroke();
      }
      ctx.restore();
      ctx.drawImage(f.canvas, this.figX - f.ox, this.figY - f.oy);
      glow(ctx, this.figX, this.figY - 200, 160, 'rgba(255,245,210,1)', 0.35 * aura, 'screen');
      // dust motes rising in the light
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const [mx, my, sp, r, ph] of this.motes) {
        const y = ((my - lt * sp) % H + H) % H;
        const x = mx + Math.sin(lt * 0.5 + ph) * 20;
        ctx.globalAlpha = (0.4 + 0.4 * Math.sin(lt * 2 + ph)) * on;
        ctx.fillStyle = 'rgb(255,248,220)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
      // petals of mercy and compassion
      const pt = lt - 12.6;
      if (pt > 0) {
        for (const [px, py, sp, ph, sc] of this.petals) {
          const y = py + pt * sp * 1.6;
          const x = px + Math.sin(pt * 0.9 + ph) * 60;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(pt * 0.8 + ph);
          ctx.scale(sc, sc * (0.6 + 0.4 * Math.sin(pt * 2 + ph)));
          ctx.globalAlpha = 0.9 * ramp(pt, 0, 0.8);
          ctx.drawImage(this.petal, -20, -15);
          ctx.restore();
        }
      }
    },
  };

  // ---------- 9. the journal ----------
  const NB = { w: 1240, h: 720, pw: 600 };
  scenes.journal = {
    init() {
      [this.desk] = layer();
      const dx = this.desk.getContext('2d');
      WC.wash(dx, W, H, [[0, '#8d5d3e'], [1, '#6a4330']], 91, { mottle: 0.3, tint: 'rgb(60,30,20)', blooms: 4 });
      const rng = WC.rng(92);
      for (let i = 0; i < 46; i++) {
        const y = rng() * H, x = rng.range(-200, W), len = rng.range(400, 1400);
        WC.blob(dx, [[x, y], [x + len, y + rng.gauss() * 10], [x + len, y + 5], [x, y + rng.range(3, 9)]], 'rgb(70,40,26)', { seed: 930 + i, layers: 6, alpha: 0.06, variance: 0.02, grain: 0.3, mode: 'multiply' });
      }
      // cover
      [this.cover] = layer(NB.w + 50, NB.h + 50);
      WC.blob(this.cover.getContext('2d'), WC.roundRect(8, 8, NB.w + 34, NB.h + 34, 22, 3), 'rgb(36,36,42)', { seed: 93, layers: 26, alpha: 0.12, variance: 0.004, grain: 0.15 });
      // pages
      const page = (seed, header, squiggles) => {
        const [c, x] = layer(NB.pw, NB.h - 20);
        x.fillStyle = '#f2e9d7';
        x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'multiply';
        x.globalAlpha = 0.18;
        x.drawImage(WC.mottle(c.width, c.height, 6, 'rgb(190,170,140)', seed), 0, 0);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        x.fillStyle = 'rgba(120,112,104,0.55)';
        for (let yy = 36; yy < c.height - 20; yy += 28) for (let xx = 30; xx < c.width - 20; xx += 28) x.fillRect(xx - 1, yy - 1, 2.4, 2.4);
        if (header) {
          x.fillStyle = 'rgba(70,72,90,0.45)';
          x.font = '500 40px "Caveat"';
          x.fillText(header, 60, 76);
        }
        if (squiggles) {
          const r = WC.rng(seed + 1);
          x.strokeStyle = 'rgba(30,34,62,0.75)';
          x.lineWidth = 2.4;
          x.lineCap = 'round';
          for (let ln = 0; ln < 15; ln++) {
            const y = 132 + ln * 42;
            let xx = 60 + (ln % 5 === 0 ? 40 : 0);
            const end = ln % 5 === 4 ? r.range(200, 380) : r.range(480, 540);
            x.beginPath();
            x.moveTo(xx, y);
            while (xx < end) {
              const step = r.range(7, 13);
              x.quadraticCurveTo(xx + step / 2, y - r.range(4, 16), xx + step, y + r.gauss() * 2);
              xx += step;
              if (r() < 0.12) { xx += 16; x.moveTo(xx, y); }
            }
            x.stroke();
          }
        }
        return c;
      };
      this.pages = [
        page(94, 'Aug 30', true), page(95, 'September', false), page(96), page(97), page(98), page(99), page(100), page(101),
      ];
      // pen (lying with its tip at the origin, pointing left)
      const [pen, px] = layer(520, 40);
      const g = px.createLinearGradient(0, 4, 0, 36);
      g.addColorStop(0, 'rgb(238,240,244)');
      g.addColorStop(0.45, 'rgb(150,154,164)');
      g.addColorStop(1, 'rgb(70,72,82)');
      px.fillStyle = g;
      WC.path(px, [[0, 20], [60, 8], [500, 6], [516, 12], [516, 28], [500, 34], [60, 32]]);
      px.fill();
      px.fillStyle = 'rgb(40,40,48)';
      px.fillRect(150, 6, 10, 28);
      px.fillStyle = 'rgba(255,255,255,0.6)';
      px.fillRect(70, 11, 420, 3);
      this.pen = pen;
      this.flips = sfxTimes('page');
    },
    // draws a page squashed horizontally, anchored at the spine (side 1 = right, -1 = left)
    drawPage(ctx, img, spineX, top, width, side, shade) {
      if (width < 1) return;
      ctx.save();
      ctx.translate(side > 0 ? spineX : spineX - width, top);
      ctx.scale(width / NB.pw, 1);
      ctx.drawImage(img, 0, 0);
      const g = ctx.createLinearGradient(side > 0 ? 0 : NB.pw, 0, side > 0 ? 70 : NB.pw - 70, 0);
      g.addColorStop(0, 'rgba(90,70,50,0.35)');
      g.addColorStop(1, 'rgba(90,70,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, NB.pw, img.height);
      if (shade > 0) {
        ctx.fillStyle = `rgba(60,40,20,${shade})`;
        ctx.fillRect(0, 0, NB.pw, img.height);
      }
      ctx.restore();
    },
    draw(ctx, lt, T) {
      ctx.drawImage(this.desk, 0, 0);
      const cx = W / 2, cy = 470;
      ctx.save();
      zoomAbout(ctx, 1 + 0.07 * easeInOut(lt / 11), cx + 300, cy);
      ctx.translate(cx, cy);
      ctx.rotate(-0.025);
      ctx.translate(-NB.w / 2, -NB.h / 2);
      // shadow + cover
      ctx.save();
      ctx.filter = 'blur(18px)';
      ctx.fillStyle = 'rgba(30,15,8,0.55)';
      ctx.fillRect(10, 30, NB.w + 30, NB.h + 30);
      ctx.restore();
      ctx.drawImage(this.cover, -25, -25);
      // ribbons (blue and red, like the real journal)
      ctx.save();
      ctx.fillStyle = 'rgb(40,70,170)';
      ctx.beginPath();
      ctx.moveTo(NB.w / 2 - 6, NB.h - 30);
      ctx.bezierCurveTo(NB.w / 2 + 10, NB.h + 20, NB.w / 2 - 14, NB.h + 40, NB.w / 2 + 4, NB.h + 70);
      ctx.lineTo(NB.w / 2 + 20, NB.h + 62);
      ctx.bezierCurveTo(NB.w / 2 + 4, NB.h + 40, NB.w / 2 + 28, NB.h + 20, NB.w / 2 + 12, NB.h - 30);
      ctx.fill();
      ctx.fillStyle = 'rgb(190,40,40)';
      ctx.fillRect(NB.w - 14, 80, 30, 14);
      ctx.restore();
      const spine = NB.w / 2, top = 10;
      // which flip are we in?
      let k = 0, flipP = -1;
      for (let i = 0; i < this.flips.length; i++) {
        if (T >= this.flips[i]) { k = i; flipP = clamp((T - this.flips[i]) / 0.9); }
      }
      const done = flipP >= 1 ? k + 1 : k;
      const flipping = flipP >= 0 && flipP < 1;
      const leftIdx = 2 * done, rightIdx = 2 * done + 1;
      this.drawPage(ctx, this.pages[leftIdx], spine, top, NB.pw, -1, 0);
      this.drawPage(ctx, this.pages[flipping ? rightIdx + 2 : rightIdx], spine, top, NB.pw, 1, 0);
      if (flipping) {
        const e = easeInOut(flipP), c = Math.cos(e * Math.PI);
        // shadow cast by the lifting page
        ctx.save();
        ctx.fillStyle = `rgba(40,25,10,${0.25 * Math.sin(e * Math.PI)})`;
        ctx.fillRect(spine, top, NB.pw * Math.max(0, c) + 40 * Math.sin(e * Math.PI), NB.h - 20);
        ctx.restore();
        if (c > 0) this.drawPage(ctx, this.pages[rightIdx], spine, top, NB.pw * c, 1, (1 - c) * 0.25);
        else this.drawPage(ctx, this.pages[rightIdx + 1], spine, top, NB.pw * -c, -1, (1 + c) * 0.25);
      }
      // writing again: "Oct 12 / What I see, I consume."
      const lines = [
        { text: 'Oct 12', x: spine + 60, y: top + 96, size: 52, t0: 108.9, t1: 109.6 },
        { text: 'What I see, I consume.', x: spine + 60, y: top + 180, size: 52, t0: 109.8, t1: 111.5 },
      ];
      let tip = null;
      ctx.save();
      ctx.fillStyle = 'rgb(28,34,66)';
      for (const L of lines) {
        ctx.font = `500 ${L.size}px "Caveat"`;
        const wFull = ctx.measureText(L.text).width;
        const p = clamp((T - L.t0) / (L.t1 - L.t0));
        if (p <= 0) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(L.x - 10, L.y - L.size, wFull * p + 10, L.size * 1.5);
        ctx.clip();
        ctx.fillText(L.text, L.x, L.y);
        ctx.restore();
        if (p < 1) tip = [L.x + wFull * p, L.y - 12 + Math.sin(T * 40) * 7];
      }
      ctx.restore();
      // the pen
      // ang is the direction from the tip to the end of the pen
      const rest = [NB.w + 30, NB.h - 60], restA = -1.15;
      let pos = rest, ang = restA;
      const approach = easeInOut((T - 108.0) / 0.9);
      if (approach > 0) {
        const lift = ramp(T, 111.5, 112);
        const target = tip || (T < 110.5 ? [lines[0].x, lines[0].y - 12] : [lines[1].x + 520, lines[1].y - 12 - 30 * lift]);
        pos = [lerp(rest[0], target[0], approach), lerp(rest[1], target[1], approach)];
        ang = lerp(restA, 0.62, approach);
      }
      ctx.save();
      ctx.translate(pos[0] + 16, pos[1] + 22);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.35;
      ctx.filter = 'blur(6px)';
      ctx.drawImage(this.pen, 0, -20);
      ctx.restore();
      ctx.save();
      ctx.translate(pos[0], pos[1]);
      ctx.rotate(ang);
      ctx.drawImage(this.pen, 0, -20);
      ctx.restore();
      ctx.restore();
      // warm lamp light from the top-left
      glow(ctx, 300, 120, 1100, 'rgba(255,214,150,0.9)', 0.25, 'soft-light');
    },
  };

  // ---------- 10. Amen ----------
  scenes.amen = {
    init() {
      [this.sky] = layer();
      WC.wash(this.sky.getContext('2d'), W, H, [[0, '#1c2246'], [0.42, '#463d70'], [0.68, '#b97482'], [0.85, '#eeb07c']], 111, { mottle: 0.22, tint: 'rgb(40,30,60)' });
      this.far = WC.mountains(W, H, { y: 700, amp: 120, seed: 112, color: 'rgb(98,80,124)', shade: 'rgb(72,58,100)', snow: 575, snowColor: 'rgb(226,196,214)', peaks: [[0.3, 190, 0.08], [0.62, 230, 0.09], [0.86, 150, 0.07]], haze: 'rgba(236,160,140,0.3)' });
      this.mid = WC.mountains(W, H, { y: 830, amp: 60, seed: 113, color: 'rgb(56,48,80)', shade: 'rgb(36,30,56)', levels: 6 });
      [this.ledge] = layer();
      WC.blob(this.ledge.getContext('2d'), [[-40, 950], [400, 925], [900, 935], [1500, 920], [1960, 945], [1960, 1120], [-40, 1120]], 'rgb(34,28,44)', { seed: 114, layers: 26, alpha: 0.12, variance: 0.01, grain: 0.15 });
      this.lamp = paintLamp(115);
      const rng = WC.rng(116);
      this.stars = Array.from({ length: 140 }, () => [rng() * W, Math.pow(rng(), 1.6) * 520, rng.range(0.8, 2.6), rng() * 6, rng.range(0.5, 1)]);
    },
    draw(ctx, lt, T) {
      ctx.save();
      zoomAbout(ctx, 1.1 - 0.1 * easeOut(lt / 13), W / 2, H * 0.75);
      ctx.drawImage(this.sky, 0, 0);
      const st = ramp(lt, 0.8, 5);
      ctx.save();
      ctx.fillStyle = 'rgb(255,250,235)';
      for (const [x, y, r, ph, b] of this.stars) {
        ctx.globalAlpha = st * b * (0.55 + 0.45 * Math.sin(lt * 2.2 + ph * 3));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      glow(ctx, W * 0.5, 760, 900, 'rgba(255,190,140,0.8)', 0.4);
      ctx.drawImage(this.far, 0, 0);
      ctx.drawImage(this.mid, 0, 0);
      ctx.drawImage(this.ledge, 0, 0);
      const ls = 1.55, lx = W / 2 - 190 * ls, ly = 940 - 172 * ls;
      const wx = lx + this.lamp.wick[0] * ls, wy = ly + this.lamp.wick[1] * ls;
      const lit = ramp(T, 113.0, 113.8);
      const amen = ramp(T, 120.8, 122.5);
      glow(ctx, wx, wy - 30, 420 + 700 * amen, 'rgba(255,200,120,1)', lit * (0.55 + 0.35 * amen));
      ctx.drawImage(this.lamp, lx, ly, this.lamp.width * ls, this.lamp.height * ls);
      flame(ctx, wx, wy + 4, 74 * lit * (1 + 0.15 * amen), T, 7);
      glow(ctx, wx, wy - 26, 70, 'rgba(255,240,200,1)', lit * 0.8);
      ctx.restore();
    },
    captionY: 0.17,
  };

  // ---------- registry ----------
  global.Scenes = {
    all: scenes,
    init() {
      for (const id of Object.keys(scenes)) scenes[id].init();
    },
  };
})(window);
