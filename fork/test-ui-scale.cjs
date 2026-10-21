#!/usr/bin/env node
// The interface sized to the screen (js/fork/ui-scale.js), in headless Edge on dev.html and the built
// index.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-ui-scale.cjs [base-url]          SHOTS=<dir> for screenshots
//
//   1. 1280×720: scale 1, exactly as before (the HUD drawn without a scale, no page zoom).
//   2. 2560×1440: scale ≈1.69 for the HUD and the pages; the move slots' buttons are where they're
//      drawn, bigger (a real mouse click on the second slot switches to it, and hovering it shows its
//      tooltip); a level-up card is bigger and a real click on it picks it.
//   3. The built index.html at 2560×1440: its pages are zoomed too.
const fs = require('fs');
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  // A run with Charmander and two moves; the HUD's buttons and texts as it draws them.
  async function open(w, h) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(w + ': ' + e.message));
    await page.addInitScript(() => {
      window.__texts = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
        if (window.__texts.length < 5000) window.__texts.push([String(t), this.getTransform().a]);
        return f.apply(this, arguments);
      };
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.UIScale, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.DB.commit();
      G.UI.hideAll(); G.Game.toUI(); G.Game.startRun();
      const p = G.Game.player; p.hurt = () => {};
      if (!p.addMove('tackle')) throw new Error('no second move');
      p.setActive(0);
      // The buttons the HUD registers, in CSS px (ui-scale's wrapper hands them on to this one).
      const add = G.Touch.addButton;
      G.Touch.addButton = function (x, y, bw, bh, fn, pad, slot) { window.__btns.push({ x, y, w: bw, h: bh, slot }); return add.apply(this, arguments); };
      window.__btns = [];
    });
    return page;
  }
  const frame = page => page.evaluate(async () => {
    window.__btns = []; window.__texts.length = 0;
    await new Promise(r => setTimeout(r, 200));
    const p = G.Game.player, name = window.__texts.filter(([t]) => t === p.mon.name).pop();
    const slots = {};
    for (const b of window.__btns) if (b.slot != null) slots[b.slot] = b;
    return { k: G.UIScale.now, zoom: getComputedStyle(document.getElementById('scr-levelup')).zoom, nameScale: name && name[1],
      dpr: document.getElementById('game').width / innerWidth, slots, active: p.active, moves: p.slots.filter(Boolean).length };
  });
  const card = page => page.evaluate(async () => {
    G.Game.debugLevelUp();
    let c = null;
    for (let i = 0; i < 100 && !(c = document.querySelector('#scr-levelup:not(.hidden) .card')); i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 1200));                // past the cards' 1 s click guard (run-ui.js GUARD)
    const r = c.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { w: r.width, h: r.height, x, y, hit: c.contains(document.elementFromPoint(x, y)) };
  });

  try {
    console.log('1. 1280×720');
    let page = await open(1280, 720);
    const a = await frame(page);
    check(a.k === 1 && a.zoom === '1' && Math.abs(a.nameScale - a.dpr) < 1e-9, 'scale 1: the HUD unscaled, no page zoom', { k: a.k, zoom: a.zoom, nameScale: a.nameScale });
    check(a.moves === 2 && a.slots[0] && a.slots[1], 'two move slots registered', a.slots);
    const cardA = await card(page);
    await page.context().close();

    console.log('2. 2560×1440');
    page = await open(2560, 1440);
    const b = await frame(page);
    const K = Math.min(2560 / 1400, 1440 / 850);
    check(Math.abs(b.k - K) < 1e-9 && Math.abs(+b.zoom - K) < 1e-3, `scale ${K.toFixed(2)} for the HUD and the pages`, { k: b.k, zoom: b.zoom });
    check(Math.abs(b.nameScale - b.dpr * K) < 1e-6, 'the HUD is drawn at that scale', { nameScale: b.nameScale, dpr: b.dpr });
    check(Math.abs(b.slots[1].w - a.slots[1].w * K) < 0.01, 'the move slots are that much bigger', { at1280: a.slots[1].w, at2560: b.slots[1].w });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'run-2560.png') }); }
    const s1 = b.slots[1], cx = s1.x + s1.w / 2, cy = s1.y + s1.h / 2;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(300);
    const tip = await page.evaluate(async () => { window.__texts.length = 0; await new Promise(r => setTimeout(r, 200)); return window.__texts.some(([t]) => /^(Tackle|Placaje)$/.test(t)); });
    check(tip, 'hovering the second slot shows its tooltip');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tooltip-2560.png') });
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    check(await page.evaluate(() => G.Game.player.active) === 1, 'a real click on the second slot switches to it', { x: cx, y: cy });
    const cardB = await card(page);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'levelup-2560.png') });
    check(Math.abs(cardB.w / cardA.w - K) < 0.02, 'a level-up card is that much bigger', { at1280: cardA.w, at2560: cardB.w });
    check(cardB.hit, 'the point at its centre is the card (hit-testing under the zoom)');
    await page.mouse.click(cardB.x, cardB.y);
    await page.waitForTimeout(400);
    check(await page.evaluate(() => document.getElementById('scr-levelup').classList.contains('hidden')), 'a real click on it picks it');
    await page.context().close();

    console.log('3. Built index.html');
    // G is sealed in app.min.js, so only what the page shows: the guest screen's box, zoomed.
    const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 }, serviceWorkers: 'block' });
    const built = await ctx.newPage();
    built.on('pageerror', e => errs.push('index.html: ' + e.message));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    const z = await built.evaluate(() => ({ login: getComputedStyle(document.getElementById('scr-login')).zoom, game: getComputedStyle(document.getElementById('game')).zoom }));
    check(Math.abs(+z.login - K) < 1e-3 && z.game === '1', 'index.html: the pages zoomed, the game canvas not', z);
    await ctx.close();

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
