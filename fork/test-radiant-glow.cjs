#!/usr/bin/env node
// The radiant glow (js/fork/radiant-glow.js) in headless Edge on dev.html, with the real radiant
// Mewtwo (assets/pokemon/150/r/):
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-radiant-glow.cjs [base-url]          SHOTS=<dir> for screenshots
//
//   1. Settings > Graphics: the "Radiant glow" slider, 10% by default, with a preview; moving it
//      sets G.Settings 'radGlow' and it's kept after a reload.
//   2. The glow's colour is the standout colour of the vibrancy vote (G.LabShiny.paletteFrom).
//   3. Animator.draw on a black canvas: at 0% exactly the plain sprite; at 10% a mild halo; at 100%
//      far more, reaching further; the light added is in the standout hue.
//   4. A real run as the radiant: the game canvas around the player is brighter at 100% than at
//      0%, and a normal (non-radiant) partner gets nothing.
const fs = require('fs');
const path = require('path');
const { chromium, pastStart, pickStarter } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const shot = async (name, opts) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png') }, opts)); } };
  const login = async () => {
    await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.RadiantGlow, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest, #scr-menu');
    if (await page.isVisible('#btn-guest')) {                // after the reload, the guest save is kept (guest-save.js)
      await page.click('#btn-guest');
      await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    }
    await page.evaluate(() => {
      const s = G.DB.save;
      G.DB.grant(150, 't'); G.DB.grant(25, 't');
      s.radiant = { 150: { at: Date.now(), from: 't' } };
      s.partner = 150; G.DB.commit(); G.UI.hideAll(); G.MenuUI.open();
    });
  };
  try {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await login();

    console.log('1. The setting');
    await page.evaluate(() => { localStorage.removeItem('ps.settings'); G.Settings.set('calm', true); G.SettingsUI.open('gfx'); });
    const row = await page.evaluate(() => {
      const r = document.getElementById('set-radglow');
      return r && { value: r.value, label: document.getElementById('set-radglow-v').textContent, title: [...document.querySelectorAll('#set-body .set-h')].map(h => h.textContent),
        preview: !!document.getElementById('set-radglow-cv'), level: G.RadiantGlow.level(), stored: G.Settings.get('radGlow') };
    });
    check(row && row.title.includes('Radiant glow') && row.value === '10' && row.label === '10%' && row.level === 0.1 && row.stored === undefined,
      'the Graphics tab has the Radiant glow slider at 10% by default', row);
    check(row && row.preview, 'with a preview of a radiant');
    await page.waitForTimeout(1500);
    if (SHOTS) await page.locator('.rad-glow-row').screenshot({ path: path.join(SHOTS, 'settings-10.png') });
    await page.locator('#set-radglow').fill('100');
    let st = await page.evaluate(() => ({ v: G.Settings.get('radGlow'), label: document.getElementById('set-radglow-v').textContent }));
    check(st.v === 1 && st.label === '100%', 'moving it to 100% sets radGlow to 1', st);
    await page.waitForTimeout(800);
    if (SHOTS) await page.locator('.rad-glow-row').screenshot({ path: path.join(SHOTS, 'settings-100.png') });
    await page.locator('#set-radglow').fill('0');
    st = await page.evaluate(() => G.Settings.get('radGlow'));
    check(st === 0, 'and to 0% sets it to 0', st);
    await page.locator('#set-radglow').fill('37');
    await page.reload({ waitUntil: 'load' });
    await login();
    st = await page.evaluate(() => { G.SettingsUI.open('gfx'); return { v: G.Settings.get('radGlow'), slider: document.getElementById('set-radglow').value }; });
    check(st.v === 0.37 && st.slider === '37', 'kept after a reload', st);
    await page.evaluate(() => { G.SettingsUI.close(); G.Settings.set('calm', true); });

    console.log('2. The colour');
    const tone = await page.evaluate(async () => {
      G.Sprites.preload(['150', '150/r'], 8000);
      for (let i = 0; i < 100 && !G.RadiantGlow.tone('150/r'); i++) await new Promise(r => setTimeout(r, 50));
      const read = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
      const pal = G.LabShiny.paletteFrom(read(G.Sprites.sheet(150, 'Idle').img), read(G.Sprites.sheet('150/r', 'Idle').img));
      const t = G.RadiantGlow.tone('150/r');
      return { t, pal };
    });
    const hueOf = hex => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
      return 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4); };
    const H = tone.pal ? hueOf(tone.pal[2]) : null;
    check(tone.t && H !== null && Math.abs(tone.t.h - H) < 1, 'the glow hue is the vibrancy vote\'s standout hue', { glow: tone.t && Math.round(tone.t.h), vote: H && Math.round(H), pal: tone.pal });

    console.log('3. Drawing');
    const res = await page.evaluate(async () => {
      const W = 240, Hh = 240, X = 120, Y = 170;
      const an = new G.Sprites.Animator('150/r', 1.5);
      const paint = v => {
        G.Settings.set('radGlow', v);
        const c = document.createElement('canvas'); c.width = W; c.height = Hh;
        const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, Hh); x.imageSmoothingEnabled = false;
        an.draw(x, X, Y);
        return { c, d: x.getImageData(0, 0, W, Hh).data };
      };
      // Until the glow of the Idle sheet is built (one sheet per 30 ms).
      for (let i = 0; i < 100; i++) { paint(1); await new Promise(r => setTimeout(r, 40)); }
      const plain = (() => {
        const c = document.createElement('canvas'); c.width = W; c.height = Hh;
        const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, Hh); x.imageSmoothingEnabled = false;
        const m = G.Sprites.animMeta('150/r', 'Idle'), s = G.Sprites.sheet('150/r', 'Idle'), k = G.Sprites.PX * an.scale;
        x.drawImage(s.img, 0, 0, m.w, m.h, Math.round(X - m.ax * k), Math.round(Y - m.ay * k), m.w * k, m.h * k);
        return { d: x.getImageData(0, 0, W, Hh).data, m, k };
      })();
      const t = G.RadiantGlow.tone('150/r');
      const measure = d => {
        let outside = 0, far = 0, hx = 0, hy = 0, diffs = 0;
        const { m, k } = plain, L = Math.round(X - m.ax * k), T = Math.round(Y - m.ay * k), R = L + m.w * k, B = T + m.h * k;
        for (let i = 0; i < d.length; i += 4) {
          const dr = d[i] - plain.d[i], dg = d[i + 1] - plain.d[i + 1], db = d[i + 2] - plain.d[i + 2];
          if (dr || dg || db) diffs++;
          const add = dr + dg + db;
          if (plain.d[i] + plain.d[i + 1] + plain.d[i + 2] === 0 && add > 0) {
            outside += add;
            const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            if (mx > mn) { const h = (mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4) * Math.PI / 3; hx += add * Math.cos(h); hy += add * Math.sin(h); }
          }
          const px = (i / 4) % W, py = Math.floor(i / 4 / W);
          if (add > 6 && (px < L - 4 || px > R + 4 || py < T - 4 || py > B + 4)) far++;
        }
        return { diffs, outside, far, hue: Math.round((Math.atan2(hy, hx) * 180 / Math.PI + 360) % 360) };
      };
      const z = paint(0), a = paint(0.1), b = paint(1);
      window.__glowShots = [z, a, b].map(p => p.c.toDataURL());
      return { z: measure(z.d), a: measure(a.d), b: measure(b.d), h: Math.round(t.h) };
    });
    check(res.z.diffs === 0, 'at 0%: exactly the plain sprite, no glow', res.z);
    check(res.a.outside > 2000, 'at 10%: a halo around it', res.a);
    check(res.b.outside > res.a.outside * 2.5 && res.b.far > res.a.far, 'at 100%: much more light, reaching further', { a: res.a.outside, b: res.b.outside, farA: res.a.far, farB: res.b.far });
    const dh = Math.abs(((res.b.hue - res.h) % 360 + 540) % 360 - 180);
    check(dh < 25, 'the light added is in the standout hue', { added: res.b.hue, standout: res.h });
    if (SHOTS) {
      const urls = await page.evaluate(() => window.__glowShots);
      ['0', '10', '100'].forEach((n, i) => fs.writeFileSync(path.join(SHOTS, 'draw-' + n + '.png'), Buffer.from(urls[i].split(',')[1], 'base64')));
    }

    console.log('4. A real run');
    // Paused, with nothing left moving (the paused game still animates at 1/4 speed), so the
    // only change between two samples is the glow.
    const freeze = () => {
      G.Game.togglePause();
      document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
      G.FX.update = () => {}; G.Weather.draw = () => {};
      G.Sprites.Animator.prototype.update = function () {};
    };
    const around = () => page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 600));
      const cv = document.getElementById('game'), p = G.Game.player, k = G.Camera.scale, dpr = cv.width / cv.clientWidth;
      const x = (p.x - G.Camera.left()) * k * dpr, y = (p.y - G.Camera.top()) * k * dpr;
      const R = Math.round(70 * k * dpr);
      const d = cv.getContext('2d').getImageData(Math.round(x - R), Math.round(y - R * 1.6), 2 * R, 2 * R).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return { mean: sum / (d.length / 4), dex: p.anim.dex };
    });
    await page.evaluate(() => { G.Settings.set('radGlow', 0); G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(freeze);
    await page.waitForTimeout(1500);
    const r0 = await around();
    await shot('run-0');
    await page.evaluate(() => G.Settings.set('radGlow', 1));
    await page.waitForTimeout(1200);
    const r1 = await around();
    await shot('run-100');
    await page.evaluate(() => G.Settings.set('radGlow', 0.1));
    await page.waitForTimeout(600);
    const r10 = await around();
    await shot('run-10');
    check(r1.dex === '150/r' && r1.mean > r0.mean + 6 && r10.mean > r0.mean + 0.5 && r10.mean < r1.mean,
      'the radiant player glows on the game canvas (0% < 10% < 100%)', { '0': +r0.mean.toFixed(1), '10': +r10.mean.toFixed(1), '100': +r1.mean.toFixed(1) });
    await page.evaluate(() => { G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); });

    await page.evaluate(() => { const s = G.DB.save; s.partner = 25; G.DB.commit(); G.Settings.set('radGlow', 0); G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(freeze);
    await page.waitForTimeout(1500);
    const n0 = await around(), n0b = await around();
    await page.evaluate(() => G.Settings.set('radGlow', 1));
    const n1 = await around();
    check(n0.mean === n0b.mean, 'frozen: two samples alike', { a: n0.mean, b: n0b.mean });
    check(n0.dex === 25 && n1.mean === n0.mean, 'a normal Pokémon gets no glow', { '0': n0.mean, '100': n1.mean });
    await page.evaluate(() => G.Game.quit());

    console.log('5. Built index.html');
    // G is sealed in app.min.js (fork/build.cjs), so as a player would: guest, the starter quiz,
    // Settings → Graphics. A guest owns no radiant, so the preview shows the first one in the game.
    const built = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    built.on('pageerror', e => errs.push('index.html: ' + e.message));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    await built.click('#btn-guest');
    await pickStarter(built);   // a new player's first screen (js/fork/starter-pick.js)
    await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
    await built.click('#btn-settings');
    await built.click('#set-tabs [data-t="gfx"]');
    await built.waitForSelector('#set-radglow');
    // Light in the preview: how many of its pixels aren't transparent (the halo adds a ring).
    const lit = async v => {
      await built.locator('#set-radglow').fill(String(v));
      await built.waitForTimeout(1500);
      return built.evaluate(() => {
        const c = document.getElementById('set-radglow-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
        return n;
      });
    };
    const b0 = await built.evaluate(() => ({ value: document.getElementById('set-radglow').value,
      bg: getComputedStyle(document.getElementById('set-radglow-cv')).backgroundColor }));
    const off = await lit(0), full = await lit(100);
    if (SHOTS) await built.locator('.rad-glow-row').screenshot({ path: path.join(SHOTS, 'built-settings-100.png') });
    check(b0.value === '10' && b0.bg === 'rgb(12, 17, 27)', 'index.html: the slider at 10%, the preview on its brand.css backdrop', b0);
    check(off > 200 && full > off * 1.5, 'index.html: the preview glows at 100% and not at 0%', { off, full });
    await built.close();

    check(!errs.length, 'no page errors', errs);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
