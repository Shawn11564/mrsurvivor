#!/usr/bin/env node
// Held items' PNGs (the artist's, js/fork/icon-overrides.json) take the old code icons' space,
// in headless Edge on dev.html with the real lists and PNGs:
//
//   node fork/serve.cjs                 (in another terminal)
//   node fork/test-item-icons.cjs [base-url] [--shot <file.png>]
//
// The code drawings are 12×12 and the PNGs 13 to 22 px a side, uploaded with their own size. Shown
// 1:1 off the PNG they came out up to twice as big as before (44 on the ground, 66 in the HUD's
// 36 box), so js/fork/asset-overrides.js fits a held item into the box the code icon took.
// For every held item, at every size the game draws it (the pickup 24, the HUD's box 36 with fit, the
// HUD tip 18, the item card 36 and the pause line 18): its longer side fills the code icon's box
// (no more, no less than 85% of it), it's centred there, its shape (w:h) is the PNG's, and it isn't
// blurred to mush (drawn from a whole multiple of the PNG). Then the HUD's item box in a real run.
// --shot saves a picture: each item, the code drawing next to the PNG, at 18, 24 and 36.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const shotAt = args.indexOf('--shot');
const SHOT = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const BASE = args[0] || require('./pw.cjs').BASE;
const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, '../js/fork/icon-overrides.json'), 'utf8'));

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.AssetOverrides && G.DB && G.Items, null, { timeout: 30000 });
    await page.evaluate(() => G.AssetOverrides.loaded);
    const items = await page.evaluate(() => G.Items.LIST.map(i => i.id));
    const withPng = items.filter(n => ICONS[n]);
    check(withPng.length === items.length, 'every held item has a PNG in icon-overrides.json', items.filter(n => !ICONS[n]));
    // Wait for the PNGs (the <img> in an html() switch to the PNG once it has loaded).
    await page.waitForFunction(ns => ns.every(n => { const c = G.Icons.canvas(n); return c.width !== 12 || c.height !== 12 || G.AssetOverrides.icons().includes(n); }), withPng, { timeout: 15000 });
    await page.waitForTimeout(500);

    console.log('1. Each held item at the sizes the game draws it');
    // [what, size, fit, kind]: the call sites (pickup.js, hud.js, run-ui.js).
    const SITES = [['pickup on the ground', 24, false, 'draw'], ['HUD item box', 36, true, 'draw'], ['HUD tip', 18, false, 'draw'],
      ['item card', 36, false, 'html'], ['pause line', 18, false, 'html']];
    const res = await page.evaluate(([names, sites]) => {
      const out = {};
      for (const n of names) {
        out[n] = [];
        for (const [what, size, fit, kind] of sites) {
          // The code icon's box: G.Icons' own rule (snap to a whole multiple of 12; with fit, the size asked if that's 20% off).
          let box = 12 * Math.max(1, Math.round(size / 12));
          if (fit && Math.abs(box - size) > size * 0.2) box = size;
          if (kind === 'html') {
            const m = G.Icons.html(n, size).match(/src="([^"]+)" width="([\d.]+)" height="([\d.]+)"/);
            out[n].push({ what, size, box, src: m[1].slice(0, 40), w: +m[2], h: +m[3], x: (box - +m[2]) / 2, y: (box - +m[3]) / 2, cx: 0, cy: 0 });
            continue;
          }
          const c = document.createElement('canvas'); c.width = c.height = 120;
          const x = c.getContext('2d'), seen = [], od = x.drawImage;
          x.drawImage = function (img, ...a) { seen.push({ src: (img.src || 'canvas ' + img.width + 'x' + img.height).slice(-30), sw: img.naturalWidth || img.width, a, smooth: x.imageSmoothingEnabled }); return od.apply(this, arguments); };
          G.Icons.draw(x, n, 10, 10, size, fit);
          const d = seen[seen.length - 1], a = d.a.length >= 8 ? d.a.slice(4) : d.a;
          out[n].push({ what, size, box, src: d.src, from: d.sw, smooth: d.smooth, x: a[0] - 10, y: a[1] - 10, w: a[2], h: a[3], cx: a[0] - 10 + a[2] / 2 - size / 2, cy: a[1] - 10 + a[3] / 2 - size / 2 });
        }
      }
      return out;
    }, [withPng, SITES]);
    for (const n of withPng) {
      const png = ICONS[n], rows = res[n], bad = [];
      for (const r of rows) {
        const long = Math.max(r.w, r.h), aspect = (r.w / r.h) / (png.w / png.h);
        if (long > r.box + 0.5) bad.push(`${r.what} ${r.size}: ${r.w}×${r.h} is bigger than the code icon's ${r.box}`);
        else if (long < r.box * 0.85) bad.push(`${r.what} ${r.size}: ${r.w}×${r.h} is much smaller than the code icon's ${r.box}`);
        if (Math.abs(aspect - 1) > 0.08) bad.push(`${r.what} ${r.size}: ${r.w}×${r.h} isn't ${png.w}:${png.h}`);
        if (Math.abs(r.cx) > 1 || Math.abs(r.cy) > 1) bad.push(`${r.what} ${r.size}: off centre by ${r.cx.toFixed(1)},${r.cy.toFixed(1)}`);
        if (r.from !== undefined && r.smooth && r.from < Math.max(r.w, r.h) / Math.max(png.w, png.h) * png.w - 0.5)
          bad.push(`${r.what} ${r.size}: a ${r.from}px picture smoothed up to ${r.w}`);
      }
      check(!bad.length, `${n} (${png.w}×${png.h}): ` + rows.map(r => `${r.size}${r.what.startsWith('HUD item') ? 'fit' : ''}→${Math.round(r.w)}×${Math.round(r.h)}`).join(' '), bad.length ? bad : undefined);
    }

    console.log('2. The HUD\'s item box in a real run');
    await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    const box = await page.evaluate(() => {
      G.UI.hideAll(); G.Game.toUI();
      G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.DB.commit();
      G.Game.startRun(); G.Game.player.hurt = () => {};
      G.Game.player.equip('choiceband');
      return new Promise(r => {
        // What G.Icons.draw('choiceband') puts down (from the PNG or from its enlargement).
        const od = CanvasRenderingContext2D.prototype.drawImage, odraw = G.Icons.draw, seen = [];
        let cur = null;
        G.Icons.draw = function (ctx, n) { cur = n; try { return odraw.apply(this, arguments); } finally { cur = null; } };
        CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { if (cur === 'choiceband') seen.push(a.slice(a.length >= 8 ? 4 : 0).map(Math.round)); return od.apply(this, arguments); };
        setTimeout(() => { CanvasRenderingContext2D.prototype.drawImage = od; G.Icons.draw = odraw; r({ seen: seen.slice(-1)[0], item: G.Game.player.item }); }, 700);
      });
    });
    check(box.item === 'choiceband' && box.seen && box.seen[2] <= 40 && box.seen[2] >= 28, 'Choice Band in the HUD box: drawn about the old 36 (not 66)', box);
    if (SHOT) {
      await page.evaluate(([names]) => {
        G.Game.quit && G.Game.quit();
        const c = document.createElement('canvas'), S = [18, 24, 36], W = 30 + S.reduce((a, s) => a + 2 * (s + 10), 0);
        c.width = W; c.height = names.length * 46 + 10; c.id = 'item-shot';
        Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, background: '#1b2238' });
        const x = c.getContext('2d'); x.fillStyle = '#1b2238'; x.fillRect(0, 0, c.width, c.height);
        names.forEach((n, i) => {
          let px = 10;
          for (const s of S) {
            const y = 10 + i * 46;
            x.strokeStyle = '#3a4870'; x.strokeRect(px - 0.5, y - 0.5, s + 1, s + 1); G.AssetOverrides.codeDraw(x, n, px, y, s); px += s + 10;
            x.strokeRect(px - 0.5, y - 0.5, s + 1, s + 1); G.Icons.draw(x, n, px, y, s); px += s + 10;
          }
        });
        document.body.appendChild(c);
      }, [withPng]);
      await page.locator('#item-shot').screenshot({ path: SHOT });
      console.log('  picture: ' + SHOT);
    }
    check(!errs.length, 'no page errors', errs);
    await ctx.close();
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll held-item icon checks passed');
  process.exit(failures ? 1 : 0);
})();
