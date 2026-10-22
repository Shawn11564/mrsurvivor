#!/usr/bin/env node
// The GUI scale (js/fork/ui-scale.js, Settings > Graphics > GUI), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-gui-scale.cjs [base-url]          SHOTS=<dir> for screenshots
//
//   1. The GUI section: "Icon size" and its three chips on one line, the GUI scale slider in the middle
//      (50, shown as 100%); a real drag of it to the right end, let go, makes the interface the largest
//      that fits (the HUD drawn at that scale too), and Reset puts it back in the middle.
//   2. The scale: by default DEF × the fit (≈2.16 at 4K, ≈1.08 at 1080p; 1 at 1280×720, as before), the left
//      end LOW × that, the right end the fit and never more (at 1280×720 the right half stays at 1 and the
//      row says the window is too small).
//   3. At 3840×2160, 1920×1080 and 1280×720, with the slider at 0, 50 and 100: the main menu, every menu
//      screen (Pokémon, Upgrades, Gacha, Missions, Friends, Leaderboard), every Settings tab, What's new,
//      the legal notice, the level-up cards, the pause menu and a long run's end screen are inside the
//      window, don't sit under the top bar, and no box scrolls for only a little more than it holds (a box
//      that only just didn't fit is squeezed instead; a long list still scrolls, inside its box).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const near = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  async function open(w, h, v) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(`${w}/${v}: ${e.message}`));
    await page.addInitScript(() => {
      window.__hudScale = 0;
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function () { if (this.canvas.id === 'game') window.__hudScale = Math.max(window.__hudScale, this.getTransform().a); return f.apply(this, arguments); };
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.UIScale && G.OverFit, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(v => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.owned[25] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.coins = 5000;
      G.Settings.set('lab', false); G.DB.commit();
      if (v != null) G.Settings.set('uiScale', v);
      G.Flow.goMenu();
    }, v);
    await page.waitForSelector('#scr-menu', { state: 'visible' });
    return page;
  }
  // Every box on screen against the window and the top bar.
  const boxes = (page, where) => page.evaluate(async where => {
    await new Promise(r => setTimeout(r, 450));                 // the opening animation, the squeeze
    const bad = [], W = innerWidth, H = innerHeight;
    const bar = document.getElementById('topbar'), barR = bar && !bar.classList.contains('hidden') && bar.getClientRects().length ? bar.getBoundingClientRect() : null;
    for (const scr of document.querySelectorAll('.scr:not(.hidden)')) {
      if (!scr.getClientRects().length) continue;
      for (const b of scr.querySelectorAll(':scope > .box, :scope > .menu-right > .box, :scope > .menu-left')) {
        const r = b.getBoundingClientRect();
        if (!r.width) continue;
        const id = scr.id + ' ' + (b.className || b.tagName).toString().split(' ').slice(0, 2).join('.');
        if (r.top < -1 || r.left < -1 || r.bottom > H + 1 || r.right > W + 1) bad.push(`${where}: ${id} off the window (${Math.round(r.top)}..${Math.round(r.bottom)} of ${H}, ${Math.round(r.left)}..${Math.round(r.right)} of ${W})`);
        if (b.scrollHeight > b.clientHeight + 1 && b.clientHeight / b.scrollHeight > 0.75) bad.push(`${where}: ${id} scrolls for a little (${b.clientHeight} of ${b.scrollHeight})`);
        if (barR && scr.id !== 'scr-menu' && getComputedStyle(scr).zIndex <= getComputedStyle(bar).zIndex && r.top < barR.bottom - 1 && r.right > barR.left && r.left < barR.right) bad.push(`${where}: ${id} under the top bar (box top ${Math.round(r.top)}, bar bottom ${Math.round(barR.bottom)})`);
      }
    }
    return bad;
  }, where);

  try {
    console.log('1. The GUI section');
    let page = await open(3840, 2160, null);
    await page.evaluate(() => G.SettingsUI.open('gfx'));
    const sec = await page.evaluate(() => {
      const r = document.getElementById('set-uiscale'), chips = [...document.querySelectorAll('.chip[data-k="hudSize"]')];
      const row = chips[0] && chips[0].closest('.set-row'), label = row && row.querySelector('b');
      const ys = chips.map(c => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2));
      const ly = label && Math.round(label.getBoundingClientRect().top + label.getBoundingClientRect().height / 2);
      const h3 = [...document.querySelectorAll('#set-body .set-h')].map(x => x.textContent);
      return { v: r && +r.value, shown: document.getElementById('set-uiscale-v').textContent, label: label && label.textContent, chips: chips.map(c => c.textContent),
        oneLine: ys.every(y => Math.abs(y - ly) < 30), gui: h3.includes('GUI'), guiBeforeRow: !!row && row.previousElementSibling && row.previousElementSibling.textContent === 'GUI' };
    });
    check(sec.gui && sec.guiBeforeRow && sec.label === 'Icon size' && sec.chips.join() === 'Small,Medium,Large' && sec.oneLine, 'a GUI section starts with "Icon size" and its three chips on one line', sec);
    check(sec.v === 50 && sec.shown === '100%', 'the GUI scale slider starts in the middle (100%)', sec);
    const k0 = await page.evaluate(() => G.UIScale.now);
    const sl = await page.evaluate(() => { const r = document.getElementById('set-uiscale'); r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; });
    await page.mouse.move(sl.x + sl.w / 2, sl.y); await page.mouse.down();
    await page.mouse.move(sl.x + sl.w * 0.8, sl.y, { steps: 5 });
    const mid = await page.evaluate(() => ({ k: G.UIScale.now, shown: document.getElementById('set-uiscale-v').textContent }));
    await page.mouse.move(sl.x + sl.w + 40, sl.y, { steps: 5 }); await page.mouse.up();
    const end = await page.evaluate(() => ({ v: G.Settings.get('uiScale'), k: G.UIScale.now, fit: Math.min(innerWidth / 1400, innerHeight / 850),
      zoom: +getComputedStyle(document.getElementById('scr-settings')).zoom, open: G.SettingsUI.isOpen }));
    check(near(mid.k, k0) && mid.shown !== '100%', 'while dragging, the percentage follows but the interface waits (nothing moves under the mouse)', mid);
    check(end.v === 100 && near(end.k, end.fit) && Math.abs(end.zoom - end.fit) < 1e-3 && end.open, 'let go at the right end: the largest that fits, Settings still open', end);
    await page.evaluate(() => G.SettingsUI.close());
    await page.evaluate(() => { G.Game.startRun(null, { dex: 4, shiny: false }); G.Game.player.hurt = () => {}; window.__hudScale = 0; });
    await page.waitForTimeout(600);
    const hud = await page.evaluate(() => window.__hudScale);
    check(Math.abs(hud - end.fit) < 0.01, 'the HUD is drawn at that scale too', { hud, fit: end.fit });
    await page.evaluate(() => { G.UI.hideAll(); G.Game.toUI(); G.Flow.goMenu(); G.SettingsUI.open('gfx'); });
    await page.click('#set-uiscale-reset');
    check(await page.evaluate(() => G.Settings.get('uiScale') === 50 && document.getElementById('set-uiscale').value === '50'), 'Reset puts it back in the middle');
    await page.context().close();

    console.log('2. The scale');
    page = await open(1280, 720, null);
    const sc = await page.evaluate(() => {
      const U = G.UIScale, at = (w, h, v) => +U.at(w, h, v).toFixed(4);
      return { k4: [0, 50, 100].map(v => at(3840, 2160, v)), k1080: [0, 50, 100].map(v => at(1920, 1080, v)), k720: [0, 50, 100].map(v => at(1280, 720, v)), DEF: U.DEF, LOW: U.LOW };
    });
    const fit4 = Math.min(3840 / 1400, 2160 / 850), fit1080 = Math.min(1920 / 1400, 1080 / 850);
    check(near(sc.k4[1], +(fit4 * sc.DEF).toFixed(4)) && near(sc.k4[0], +(fit4 * sc.DEF * sc.LOW).toFixed(4)) && near(sc.k4[2], +fit4.toFixed(4)), '4K: default DEF × fit, left LOW × that, right the fit', sc.k4);
    check(near(sc.k1080[1], +(fit1080 * sc.DEF).toFixed(4)) && near(sc.k1080[2], +fit1080.toFixed(4)), '1080p: the same', sc.k1080);
    check(sc.k720[1] === 1 && sc.k720[2] === 1 && sc.k720[0] < 1, '1280×720: 1 by default (as before), no bigger at the right end, smaller at the left', sc.k720);
    await page.evaluate(() => G.SettingsUI.open('gfx'));
    check(await page.evaluate(() => /too small to go bigger/.test(document.getElementById('set-uiscale').closest('.set-row').textContent)), '1280×720: the row says the window is too small to go bigger');
    await page.context().close();

    console.log('3. Every screen fits');
    for (const [w, h] of [[3840, 2160], [1920, 1080], [1280, 720]]) {
      for (const v of [0, 50, 100]) {
        page = await open(w, h, v);
        const where = `${w}×${h} @${v}`, bad = [];
        bad.push(...await boxes(page, where + ' menu'));
        for (const go of ['dex', 'upgrades', 'gacha', 'goals', 'friends', 'rank']) {
          await page.evaluate(g => document.querySelector(`#scr-menu [data-go="${g}"]`).click(), go);
          bad.push(...await boxes(page, `${where} ${go}`));
          await page.evaluate(() => G.Flow.goMenu());
        }
        for (const t of await page.evaluate(() => [...document.querySelectorAll('#set-tabs .gen-tab')].filter(b => !b.classList.contains('hidden')).map(b => b.dataset.t))) {
          await page.evaluate(t => G.SettingsUI.open(t), t);
          bad.push(...await boxes(page, `${where} settings ${t}`));
        }
        await page.evaluate(() => { G.SettingsUI.close(); G.NewsUI.open(); });
        bad.push(...await boxes(page, `${where} news`));
        await page.evaluate(() => { G.NewsUI.close(); document.querySelector('[data-legal]').click(); });
        bad.push(...await boxes(page, `${where} legal`));
        await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false }); G.Game.player.hurt = () => {}; });
        await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
        await page.evaluate(() => { const pl = G.Game.player; G.RunUI.showLevelUp(pl.level + 1, G.LevelUp.offer(pl), () => {}); });
        bad.push(...await boxes(page, `${where} level-up`));
        await page.evaluate(() => { G.RunUI.closeLevelUp(); G.Game.togglePause(); });
        bad.push(...await boxes(page, `${where} pause`));
        await page.evaluate(() => {
          G.Game.togglePause();
          const pl = G.Game.player;
          for (const m of ['tackle', 'quickattack', 'flamethrower']) pl.addMove(m);
          pl.killedBy = { name: 'Gyarados', dex: 130, how: 'touch', boss: true };
          pl.deathLog = [1, 2, 3, 4, 5].map(i => ({ name: 'Golbat', dex: 42, how: 'shot', dmg: 40 + i }));
          G.UI.hideAll();
          G.RunUI.showOver({ dead: true, time: 1500, level: 48, kills: 2140, bosses: 6, judge: { time: 1800, bosses: 3 }, coins: 1840, breakdown: 'Time 600 · Defeated 640',
            t1: 3, t10: 1, mine: G.RunStats.mine(1500), moves: [], caught: [{ dex: 25, isNew: true }], record: true }, () => {});
        });
        // The end screen squeezes further than the rest (over-fit.js MIN); below 900 px wide it scrolls by design.
        bad.push(...(await boxes(page, `${where} end`)).filter(s => !(w < 900 && /scrolls/.test(s))));
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/gui-${w}-${v}.png` });
        check(!bad.length, `${where}: every screen fits`, bad.length ? bad : undefined);
        await page.context().close();
      }
    }
    check(!errs.length, 'no page errors', errs);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
