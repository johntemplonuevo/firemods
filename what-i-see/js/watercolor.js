// Watercolor painting toolkit for <canvas>.
// Everything is seeded, so the same picture is painted on every run.
// Technique: polygons are deformed many times (recursive midpoint displacement)
// and stacked as very transparent layers -> soft, bleeding, uneven pigment.
(function (global) {
  'use strict';
  const WC = {};
  WC.W = 1920;
  WC.H = 1080;

  // ---------- randomness ----------
  WC.rng = function (seed) {
    let a = (seed * 2654435761) >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.gauss = () => {
      let u = 0;
      while (!u) u = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
    };
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  };

  // smooth 1D noise, used for flicker / wobble
  WC.noise1 = function (x, seed = 0) {
    const h = (n) => {
      const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };

  // ---------- easing ----------
  WC.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  WC.lerp = (a, b, t) => a + (b - a) * t;
  WC.smooth = (t) => { t = WC.clamp(t); return t * t * (3 - 2 * t); };
  WC.easeInOut = (t) => { t = WC.clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  WC.easeOut = (t) => { t = WC.clamp(t); return 1 - Math.pow(1 - t, 3); };
  WC.easeIn = (t) => { t = WC.clamp(t); return t * t * t; };
  // 0 before a, ramps to 1 at b
  WC.ramp = (x, a, b) => WC.smooth((x - a) / (b - a));
  // ramps up a..b, holds, ramps down c..d
  WC.window = (x, a, b, c, d) => Math.min(WC.ramp(x, a, b), 1 - WC.ramp(x, c, d));

  // ---------- canvas helpers ----------
  WC.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };

  WC.path = function (ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x ?? pts[0][0], pts[0].y ?? pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x ?? pts[i][0], pts[i].y ?? pts[i][1]);
    ctx.closePath();
  };

  WC.ellipse = function (cx, cy, rx, ry, n = 12, rot = 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return out;
  };

  WC.roundRect = function (x, y, w, h, r, n = 4) {
    const out = [];
    const corners = [
      [x + w - r, y + r, -Math.PI / 2],
      [x + w - r, y + h - r, 0],
      [x + r, y + h - r, Math.PI / 2],
      [x + r, y + r, Math.PI],
    ];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * (Math.PI / 2);
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    return out;
  };

  // ---------- polygon deformation ----------
  function toPoly(pts, rng) {
    return pts.map((p) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y, v: p[2] ?? p.v ?? 0.5 + rng() }));
  }

  WC.deform = function (pts, depth, variance, rng) {
    let cur = pts;
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i], b = cur[(i + 1) % cur.length];
        out.push(a);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const sd = len * variance * a.v;
        out.push({
          x: (a.x + b.x) / 2 + rng.gauss() * sd,
          y: (a.y + b.y) / 2 + rng.gauss() * sd,
          v: ((a.v + b.v) / 2) * (0.75 + 0.5 * rng()),
        });
      }
      cur = out;
    }
    return cur;
  };

  // ---------- textures ----------
  let grainCache = null;
  WC.grain = function () {
    if (grainCache) return grainCache;
    const s = 512, c = WC.canvas(s, s), x = c.getContext('2d');
    const img = x.createImageData(s, s), d = img.data, rng = WC.rng(99);
    for (let i = 0; i < s * s; i++) {
      const r = rng();
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
      d[i * 4 + 3] = Math.pow(r, 3) * 255;
    }
    x.putImageData(img, 0, 0);
    grainCache = c;
    return c;
  };

  // smooth blotchy noise: a tiny random grid scaled up with blur
  WC.mottle = function (w, h, cells, color, seed, minA = 0, maxA = 1) {
    const rng = WC.rng(seed);
    const cw = Math.max(2, cells), ch = Math.max(2, Math.round((cells * h) / w));
    const small = WC.canvas(cw + 2, ch + 2), sx = small.getContext('2d');
    for (let y = 0; y < ch + 2; y++) {
      for (let x = 0; x < cw + 2; x++) {
        sx.globalAlpha = WC.lerp(minA, maxA, rng());
        sx.fillStyle = color;
        sx.fillRect(x, y, 1, 1);
      }
    }
    const c = WC.canvas(w, h), cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.filter = `blur(${Math.round(w / cells / 3)}px)`;
    const cellW = w / cw, cellH = h / ch;
    cx.drawImage(small, -cellW, -cellH, w + 2 * cellW, h + 2 * cellH);
    return c;
  };

  // ---------- the core brush: a watercolor blob ----------
  // o: seed, layers, alpha, variance, baseVariance, depth, edge, grain, mode, opacity
  WC.blob = function (ctx, pts, color, o = {}) {
    const rng = WC.rng(o.seed ?? 1);
    const layers = o.layers ?? 34;
    const alpha = o.alpha ?? 0.05;
    const variance = o.variance ?? 0.1;
    const base = WC.deform(toPoly(pts, rng), o.baseDepth ?? 3, o.baseVariance ?? variance * 1.4, rng);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of base) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const pad = Math.max(x1 - x0, y1 - y0) * variance * 2.2 + 8;
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad);
    x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
    const tmp = WC.canvas(x1 - x0, y1 - y0), t = tmp.getContext('2d');
    t.translate(-x0, -y0);
    t.fillStyle = color;
    t.strokeStyle = color;
    t.lineWidth = o.edgeWidth ?? 1.5;
    for (let i = 0; i < layers; i++) {
      const p = WC.deform(base, o.depth ?? 3, variance, rng);
      WC.path(t, p);
      t.globalAlpha = alpha;
      t.fill();
      if (o.edge) {
        t.globalAlpha = alpha * o.edge;
        t.stroke();
      }
    }
    const g = o.grain ?? 0.22;
    if (g > 0) {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'destination-out';
      t.globalAlpha = g;
      t.fillStyle = t.createPattern(WC.grain(), 'repeat');
      t.translate(-rng() * 512, -rng() * 512);
      t.fillRect(0, 0, tmp.width + 512, tmp.height + 512);
    }
    ctx.save();
    ctx.globalCompositeOperation = o.mode ?? 'source-over';
    ctx.globalAlpha = o.opacity ?? 1;
    ctx.drawImage(tmp, x0, y0);
    ctx.restore();
  };

  // a vertical gradient wash with blotches, painted onto ctx
  WC.wash = function (ctx, w, h, stops, seed, o = {}) {
    const g = ctx.createLinearGradient(0, o.y0 ?? 0, 0, o.y1 ?? h);
    for (const [p, c] of stops) g.addColorStop(p, c);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    const tint = o.tint ?? 'rgb(90,70,60)';
    ctx.globalAlpha = o.mottle ?? 0.22;
    ctx.drawImage(WC.mottle(w, h, 7, tint, seed + 1), 0, 0);
    ctx.globalAlpha = (o.mottle ?? 0.22) * 0.7;
    ctx.drawImage(WC.mottle(w, h, 22, tint, seed + 2), 0, 0);
    ctx.restore();
    // a few soft blooms ("cauliflowers") of the wash colours
    const rng = WC.rng(seed + 3);
    const n = o.blooms ?? 9;
    for (let i = 0; i < n; i++) {
      const [p, c] = stops[Math.floor(rng() * stops.length)];
      const cx = rng() * w, cy = WC.lerp(o.y0 ?? 0, o.y1 ?? h, p) + rng.gauss() * h * 0.08;
      const r = rng.range(0.08, 0.2) * w;
      WC.blob(ctx, WC.ellipse(cx, cy, r, r * rng.range(0.4, 0.8), 10), c, {
        seed: seed * 31 + i, layers: 16, alpha: 0.035, variance: 0.14, edge: 1.5, grain: 0.3,
      });
    }
  };

  // paper texture used as a multiply overlay on every frame (near white)
  WC.paperOverlay = function (w, h, seed) {
    const c = WC.canvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.13;
    x.drawImage(WC.mottle(w, h, 10, 'rgb(150,120,90)', seed), 0, 0);
    x.globalAlpha = 0.09;
    x.drawImage(WC.mottle(w, h, 38, 'rgb(140,110,90)', seed + 1), 0, 0);
    // fine cold-press tooth
    const img = x.getImageData(0, 0, w, h), d = img.data, rng = WC.rng(seed + 2);
    for (let i = 0; i < w * h; i++) {
      const n = Math.pow(rng(), 4) * 34 + (rng() - 0.5) * 8;
      d[i * 4] -= n; d[i * 4 + 1] -= n; d[i * 4 + 2] -= n * 1.1;
    }
    x.putImageData(img, 0, 0);
    // fibres
    x.globalAlpha = 0.05;
    x.strokeStyle = 'rgb(120,100,80)';
    x.lineWidth = 1;
    for (let i = 0; i < 500; i++) {
      const px = rng() * w, py = rng() * h, a = rng() * Math.PI * 2, l = rng.range(8, 40);
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(a + 0.6) * l * 0.5, py + Math.sin(a + 0.6) * l * 0.5,
        px + Math.cos(a) * l, py + Math.sin(a) * l);
      x.stroke();
    }
    // soft warm vignette, like the edge of a painted page
    x.globalAlpha = 1;
    const v = x.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 1.05);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(1, 'rgba(150,115,85,0.38)');
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    return c;
  };

  // ---------- depth helpers ----------
  // a blurred copy (for out-of-focus layers); the sharp image is kept underneath
  // so the edges of an opaque layer don't turn see-through
  WC.blurred = function (src, px, keepEdges = false) {
    const c = WC.canvas(src.width, src.height), x = c.getContext('2d');
    x.filter = `blur(${px}px)`;
    x.drawImage(src, 0, 0);
    if (keepEdges) {
      x.filter = 'none';
      x.globalCompositeOperation = 'destination-over';
      x.drawImage(src, 0, 0);
    }
    return c;
  };

  // a round out-of-focus light (soft = 0 crisp disc ... 1 pure glow)
  const bokehCache = {};
  WC.bokeh = function (color, soft) {
    const key = color + soft;
    if (bokehCache[key]) return bokehCache[key];
    const c = WC.canvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    const col = (a) => color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
    g.addColorStop(0, col(1));
    g.addColorStop(Math.max(0.05, 0.9 - soft * 0.85), col(soft > 0.7 ? 0.45 : 0.8));
    g.addColorStop(1, col(0));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    bokehCache[key] = c;
    return c;
  };

  // ---------- landscape helpers ----------
  // returns ridge points from x0..x1 (left to right) by midpoint displacement
  WC.ridge = function (x0, x1, y, amp, rough, seed, levels = 7) {
    const rng = WC.rng(seed);
    let pts = [[x0, y + rng.gauss() * amp * 0.3], [x1, y + rng.gauss() * amp * 0.3]];
    let a = amp;
    for (let l = 0; l < levels; l++) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        out.push(p);
        out.push([(p[0] + q[0]) / 2 + rng.gauss() * (q[0] - p[0]) * 0.08, (p[1] + q[1]) / 2 + rng.gauss() * a]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
      a *= rough;
    }
    return pts;
  };

  // paints a mountain range layer; returns its canvas
  WC.mountains = function (w, h, o) {
    const c = WC.canvas(w, h), x = c.getContext('2d');
    const ridge = WC.ridge(-80, w + 80, o.y, o.amp, o.rough ?? 0.52, o.seed, o.levels ?? 7);
    if (o.peaks) {
      // lift a few chosen peaks so the range has a clear silhouette
      for (const [px, ph, pw] of o.peaks) {
        for (const p of ridge) {
          const d = (p[0] - px * w) / (pw * w);
          p[1] -= ph * Math.exp(-d * d * 2.2) * (1 - Math.abs(d) * 0.15);
        }
      }
    }
    const poly = ridge.concat([[w + 80, h + 60], [-80, h + 60]]);
    WC.blob(x, poly, o.color, { seed: o.seed + 7, layers: o.layers ?? 26, alpha: 0.075, variance: 0.012, baseVariance: 0.004, edge: 2.2, grain: 0.25 });
    // shading and snow are clipped to the mountain shape
    x.save();
    WC.path(x, poly);
    x.clip();
    if (o.shade) {
      x.globalCompositeOperation = 'multiply';
      x.globalAlpha = 0.55;
      x.drawImage(WC.mottle(w, h, 16, o.shade, o.seed + 3, 0, 1), 0, 0);
      const rng = WC.rng(o.seed + 11);
      // shadow sides of peaks: diagonal strokes down-right from high points
      for (let i = 2; i < ridge.length - 2; i += 3) {
        const p = ridge[i];
        if (p[1] < o.y + o.amp * 0.1 && rng() < 0.55) {
          const len = rng.range(80, 260);
          WC.blob(x, [[p[0], p[1]], [p[0] + len * 0.7, p[1] + len], [p[0] + len * 0.2, p[1] + len * 1.1]], o.shade,
            { seed: o.seed * 13 + i, layers: 8, alpha: 0.05, variance: 0.06, grain: 0.3, mode: 'multiply' });
        }
      }
    }
    if (o.snow) {
      x.globalCompositeOperation = 'source-over';
      const sl = o.snow;
      const band = [[-100, -200], [w + 100, -200], [w + 100, sl], [-100, sl]];
      WC.blob(x, band, o.snowColor ?? 'rgba(255,255,255,1)', { seed: o.seed + 5, layers: 18, alpha: 0.06, variance: 0.05, baseVariance: 0.04, grain: 0.35 });
    }
    if (o.haze) {
      x.globalCompositeOperation = 'source-over';
      const g = x.createLinearGradient(0, o.y - o.amp, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, o.haze);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    x.restore();
    c.ridge = ridge;
    return c;
  };

  // y of a ridge at x
  WC.ridgeY = function (ridge, xq) {
    for (let i = 0; i < ridge.length - 1; i++) {
      const a = ridge[i], b = ridge[i + 1];
      if (xq >= a[0] && xq <= b[0]) return WC.lerp(a[1], b[1], (xq - a[0]) / (b[0] - a[0] || 1));
    }
    return ridge[ridge.length - 1][1];
  };

  // a small pine tree polygon
  WC.pine = function (x, yBase, hgt, rng) {
    const w = hgt * rng.range(0.28, 0.38);
    const pts = [[x, yBase - hgt]];
    const tiers = 4;
    for (let i = 1; i <= tiers; i++) {
      const ty = yBase - hgt + (hgt * i) / tiers;
      const tw = (w * i) / tiers;
      pts.push([x + tw * 0.55, ty - hgt * 0.1], [x + tw, ty]);
    }
    pts.push([x + w * 0.08, yBase + 4], [x - w * 0.08, yBase + 4]);
    for (let i = tiers; i >= 1; i--) {
      const ty = yBase - hgt + (hgt * i) / tiers;
      const tw = (w * i) / tiers;
      pts.push([x - tw, ty], [x - tw * 0.55, ty - hgt * 0.1]);
    }
    return pts;
  };

  // a small standing person seen from behind, painted into a canvas; returns {canvas, ox, oy}
  // (ox, oy) is the feet position inside the canvas
  WC.figure = function (scale, colors, seed, withArms = true) {
    const s = scale, w = 140 * s, h = 300 * s;
    const c = WC.canvas(w, h), x = c.getContext('2d');
    const cx = w / 2, feet = h - 10 * s;
    const body = colors.body, dark = colors.dark, skin = colors.hair;
    // legs
    WC.blob(x, WC.roundRect(cx - 17 * s, feet - 96 * s, 14 * s, 96 * s, 5 * s, 2), dark, { seed: seed + 1, layers: 18, alpha: 0.12, variance: 0.015, grain: 0.15 });
    WC.blob(x, WC.roundRect(cx + 3 * s, feet - 96 * s, 14 * s, 96 * s, 5 * s, 2), dark, { seed: seed + 2, layers: 18, alpha: 0.12, variance: 0.015, grain: 0.15 });
    // jacket
    const jacket = [[cx - 26 * s, feet - 175 * s], [cx + 26 * s, feet - 175 * s], [cx + 33 * s, feet - 92 * s], [cx - 33 * s, feet - 92 * s]];
    WC.blob(x, jacket, body, { seed: seed + 3, layers: 22, alpha: 0.11, variance: 0.02, grain: 0.18, edge: 1.5 });
    if (withArms) {
      WC.blob(x, WC.roundRect(cx - 40 * s, feet - 170 * s, 13 * s, 78 * s, 6 * s, 2), body, { seed: seed + 4, layers: 18, alpha: 0.12, variance: 0.02, grain: 0.15 });
      WC.blob(x, WC.roundRect(cx + 27 * s, feet - 170 * s, 13 * s, 78 * s, 6 * s, 2), body, { seed: seed + 5, layers: 18, alpha: 0.12, variance: 0.02, grain: 0.15 });
    }
    // neck + head (hair from behind)
    WC.blob(x, WC.ellipse(cx, feet - 202 * s, 21 * s, 25 * s, 12), skin, { seed: seed + 6, layers: 22, alpha: 0.12, variance: 0.02, grain: 0.15 });
    return { canvas: c, ox: cx, oy: feet, scale: s };
  };

  global.WC = WC;
})(window);
