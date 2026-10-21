/* ============ radiant-glow.js — the radiants' glow (MrSurvivor fork) ============
 * Settings > Graphics > "Radiant glow" (G.Settings 'radGlow', 0-1; untouched, DEF = 10 %): a
 * radiant (js/fork/radiant.js) glows in its most striking colour, the same one the vote gives its
 * attacks (G.LabShiny.paletteFrom of the normal Idle sheet against the r/Idle one).
 *
 *   Mask      on each of the radiant's sheets, the pixels of that hue (±20°, fading out to ±40°) count
 *             fully and the rest of the body a little (BODY). If the striking colour is grey, the
 *             light greys count. It's done ONCE per sheet (like Sprites.white): each frame with a
 *             PAD margin, and two blurs (three box blurs in a row, almost Gaussian): a narrow one
 *             (the core, over the sprite: those pixels "give off light") and a wide one (the halo, under it).
 *   Drawing   Animator.draw wrapped: the halo under it, the sprite, and the core on top with 'lighter'
 *             (light that adds up). The halo is blended normally, not added: added, a red halo on the
 *             grass came out orange. It grows with the setting and pulses a little (not with "Menos sacudidas y
 *             destellos" (Less shaking and flashing)).
 *             At 0 % it draws as always, with nothing extra.
 * Works for everything that draws a radiant with its key '{dex}/r' or 'm{dex}/r': the run, co-op
 * teammates, the menu, the collection, the ritual and the setting's preview.
 * Texts in English only, like radiant.js. Test: fork/test-radiant-glow.cjs.
 */
G.RadiantGlow = (() => {
  const DEF = 0.1;
  const PAD = 10;                          // art pixels around each frame (how far the halo reaches)
  const BODY = 0.18;                       // how much the rest of the body counts in the mask
  const FALLBACK = 32;                     // hue if the sheet can't be read: the radiants' orange
  const tones = {};                        // '150/r' -> { h, s, grey, halo, core } ; not computed yet: undefined
  const glows = new WeakMap();             // sheet img -> { tight, wide }
  let lastBuild = 0;

  const level = () => { const v = G.Settings.get('radGlow'); return v == null ? DEF : G.U.clamp(+v || 0, 0, 1); };
  const isRad = dex => typeof dex === 'string' && dex.endsWith('/r');

  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  const rgb = (h, s, l) => {
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  };
  function pixels(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }

  /** The striking colour of radiant key ('150/r'): { h, s, grey, halo, core }; undefined while the sheets are still loading. */
  function tone(key) {
    if (tones[key]) return tones[key];
    const a = G.Sprites.sheet(key.slice(0, -2), 'Idle'), b = G.Sprites.sheet(key, 'Idle');
    if (!b || b.failed) return (tones[key] = make(FALLBACK, 0.9));
    if (!b.ready || (a && !a.ready && !a.failed)) return undefined;
    let pal = null;
    try {
      const pb = pixels(b.img), none = { width: 0, height: 0, data: [] };
      // What changes from the normal one to the radiant; if almost nothing changes, the whole radiant.
      pal = (a && a.ready && G.LabShiny.paletteFrom(pixels(a.img), pb)) || G.LabShiny.paletteFrom(none, pb);
    } catch (e) { /* file:// won't let us read them */ }
    if (!pal) return (tones[key] = make(FALLBACK, 0.9));
    const n = parseInt(pal[2].slice(1), 16), [h, s] = hsl(n >> 16, (n >> 8) & 255, n & 255);
    return (tones[key] = make(h, s));
  }
  function make(h, s) {
    const grey = s < 0.05;
    return { h, s, grey, halo: grey ? [235, 240, 255] : rgb(h, Math.max(s, 0.9), 0.55), core: grey ? [255, 255, 255] : rgb(h, Math.max(s, 0.9), 0.6) };
  }

  /** How much light a pixel gives off (0-1) given the striking colour t. */
  function weight(t, r, g, b) {
    const [h, , l] = hsl(r, g, b), c = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    if (t.grey) return c < 0.12 && l > 0.45 ? BODY + (1 - BODY) * Math.min(1, (l - 0.45) / 0.4) : BODY;
    if (c < 0.1 || l < 0.12) return BODY;
    const d = Math.abs(((h - t.h) % 360 + 540) % 360 - 180);
    const near = d <= 20 ? 1 : d >= 40 ? 0 : (40 - d) / 20;
    return Math.max(BODY, near * Math.min(1, c / 0.3));
  }

  // Box blur (r) over v (W×H), horizontal then vertical; three times ≈ Gaussian.
  function box(v, tmp, W, H, r) {
    const n = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let acc = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < W) acc += v[o + x];
      for (let x = 0; x < W; x++) {
        tmp[o + x] = acc / n;
        if (x - r >= 0) acc -= v[o + x - r];
        if (x + r + 1 < W) acc += v[o + x + r + 1];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < H) acc += tmp[y * W + x];
      for (let y = 0; y < H; y++) {
        v[y * W + x] = acc / n;
        if (y - r >= 0) acc -= tmp[(y - r) * W + x];
        if (y + r + 1 < H) acc += tmp[(y + r + 1) * W + x];
      }
    }
  }

  /** A sheet's two glow layers (each frame in a cell of (w+2·PAD)×(h+2·PAD)). */
  function build(img, w, h, t) {
    const cols = Math.round(img.width / w), rows = Math.round(img.height / h);
    const W = w + 2 * PAD, H = h + 2 * PAD, src = pixels(img).data;
    const out = {};
    for (const [name, r, gain, col] of [['tight', 1, 1.6, t.core], ['wide', 3, 3.2, t.halo]]) {
      const cv = document.createElement('canvas');
      cv.width = cols * W; cv.height = rows * H;
      const x = cv.getContext('2d'), id = x.createImageData(cv.width, cv.height), d = id.data;
      const v = new Float32Array(W * H), tmp = new Float32Array(W * H);
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        v.fill(0);
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
          const i = ((cy * h + py) * img.width + cx * w + px) * 4;
          if (src[i + 3] >= 128) v[(py + PAD) * W + px + PAD] = weight(t, src[i], src[i + 1], src[i + 2]);
        }
        for (let k = 0; k < 3; k++) box(v, tmp, W, H, r);
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
          const a = Math.min(1, v[py * W + px] * gain);
          if (a < 0.004) continue;
          const o = ((cy * H + py) * cv.width + cx * W + px) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a * 255;
        }
      }
      x.putImageData(id, 0, 0);
      out[name] = cv;
    }
    return out;
  }

  /** What's needed for the glow of the frame Animator an is about to draw, or null. */
  function frameGlow(an) {
    let m = G.Sprites.animMeta(an.dex, an.cur, an.shiny), s = G.Sprites.sheet(an.dex, an.cur, an.shiny);
    const cur = s;
    if (s && !s.ready) {                                   // like Animator.draw: Idle while it loads
      const idle = G.Sprites.sheet(an.dex, 'Idle', an.shiny);
      if (idle && idle.ready) { s = idle; m = G.Sprites.animMeta(an.dex, 'Idle', an.shiny); }
    }
    if (!m || !s || !s.ready) return null;
    let g = glows.get(s.img);
    if (!g) {
      const t = tone(an.dex), now = performance.now();
      if (!t || now - lastBuild < 30) return null;          // one sheet every two frames at most
      lastBuild = now;
      try { g = build(s.img, m.w, m.h, t); } catch (e) { g = { none: true }; }
      glows.set(s.img, g);
    }
    if (g.none) return null;
    const k = G.Sprites.PX * an.scale, frame = s === cur ? an.frame : 0;
    const W = m.w + 2 * PAD, H = m.h + 2 * PAD;
    return { g, W, H, k, sx: Math.min(frame, m.n - 1) * W, sy: Math.min(an.dir, m.r - 1) * H, ax: m.ax + PAD, ay: m.ay + PAD };
  }

  function layer(ctx, cv, f, x, y, alpha, grow) {
    if (alpha <= 0.003) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * Math.min(1, alpha);
    const w = f.W * f.k * grow, h = f.H * f.k * grow;
    // It grows from the centre of the cell, not from the feet.
    const cx = Math.round(x - f.ax * f.k) + f.W * f.k / 2, cy = Math.round(y - f.ay * f.k) + f.H * f.k / 2;
    ctx.drawImage(cv, f.sx, f.sy, f.W, f.H, cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = prev;
  }

  const draw = G.Sprites.Animator.prototype.draw;
  G.Sprites.Animator.prototype.draw = function (ctx, x, y, opts = {}) {
    const v = isRad(this.dex) ? level() : 0;
    // At 0 %, or with a filter on (the collection's black silhouette), as always.
    if (!v || (ctx.filter && ctx.filter !== 'none')) return draw.call(this, ctx, x, y, opts);
    const f = frameGlow(this);
    if (!f) return draw.call(this, ctx, x, y, opts);
    const fade = opts.alpha == null ? 1 : opts.alpha;
    const pulse = G.Settings.get('calm') ? 1 : 0.88 + 0.12 * Math.sin(performance.now() / 1000 * 2.4);
    const a = Math.pow(v, 0.35) * pulse * fade;              // 10 % → 0.45 · 50 % → 0.78 · 100 % → 1
    const smooth = ctx.imageSmoothingEnabled, op = ctx.globalCompositeOperation;
    ctx.imageSmoothingEnabled = true;                        // the halo smooth even when the sprite is pixelated
    layer(ctx, f.g.wide, f, x, y, a, 1.1 + 0.25 * v);       // a little bigger than the sprite: otherwise the sprite covers it
    layer(ctx, f.g.wide, f, x, y, (v - 0.4) * 1.2 * pulse * fade, 1 + 0.6 * v);   // from 40 % up, a second, wider halo
    ctx.imageSmoothingEnabled = smooth;
    draw.call(this, ctx, x, y, opts);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    layer(ctx, f.g.tight, f, x, y, Math.pow(v, 0.6) * 0.75 * pulse * fade, 1);
    ctx.globalCompositeOperation = op;
    ctx.imageSmoothingEnabled = smooth;
  };

  // ---------------- the setting (Graphics, js/ui/settings-ui.js) ----------------

  /** A radiant for the preview: your partner if you use it, else one of yours, else the first one. */
  function previewDex() {
    const R = G.Radiant, s = G.DB.save;
    if (!R) return null;
    const pool = R.pool();
    if (s && R.wants(s.partner)) return s.partner;
    return pool.find(d => R.owns(d)) || pool[0] || null;
  }
  function settingsRow(section) {
    const p = Math.round(level() * 100), dex = previewDex();
    queueMicrotask(() => {                                   // it's on the page by now (render() just put it there)
      const r = document.getElementById('set-radglow'), out = document.getElementById('set-radglow-v');
      if (!r) return;
      r.oninput = () => { G.Settings.set('radGlow', r.value / 100); out.textContent = r.value + '%'; };
      r.onchange = () => G.Audio.sfx('click');
      const cv = document.getElementById('set-radglow-cv');
      if (cv && dex) G.UI.sprite(cv, dex, { scale: 2, hero: true, radiant: true });
    });
    return section('Radiant glow', 'How much radiant Pokémon glow, in their standout colour. 0% is no glow at all.')
      + `<div class="set-row rad-glow-row">${dex ? '<canvas id="set-radglow-cv" width="96" height="96"></canvas>' : ''}
           <input type="range" id="set-radglow" min="0" max="100" step="1" value="${p}" aria-label="Radiant glow">
           <b id="set-radglow-v">${p}%</b></div>`;
  }

  return { DEF, level, tone, settingsRow, PAD };
})();
