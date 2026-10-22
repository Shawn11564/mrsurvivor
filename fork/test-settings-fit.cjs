#!/usr/bin/env node
// Settings fits the screen at any size, and a click outside it closes it, in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-settings-fit.cjs [base-url]          SHOTS=<dir> for screenshots
//
//   1. At 1280×720, 2560×1440 and 3840×2160, every Settings tab's box is inside the window with its
//      Close button, and a real click on Close closes it. js/fork/ui-scale.js zooms the pages by k (≈2.5
//      at 4K), and the zoom scaled the box's max-height: calc(100dvh - 24px) too, so at 4K it ran off the
//      top and bottom with Close out of reach. The pause menu and News (the same kind of max-height) fit too.
//   2. A real click on the dimmed backdrop closes Settings (js/ui/settings-ui.js); a click inside the box
//      doesn't, and dragging the Radiant glow slider out of the box and letting go there doesn't either.
//   3. The built index.html at 4K, as a player gets there (the gear button): it fits, the backdrop closes it.
const { chromium, pastStart, pickStarter } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  async function open(w, h) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(w + ': ' + e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.UIScale, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => { G.UI.hideAll(); G.Game.toUI(); });
    return page;
  }
  // Where a box is against the window, once its opening animation is over.
  const fits = (page, sel) => page.evaluate(async sel => {
    await new Promise(r => setTimeout(r, 400));
    const r = document.querySelector(sel).getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, ok: r.top >= 0 && r.bottom <= innerHeight + 0.5 };
  }, sel);
  const isOpen = page => page.evaluate(() => G.SettingsUI.isOpen);

  try {
    for (const [w, h] of [[1280, 720], [2560, 1440], [3840, 2160]]) {
      console.log(`1. ${w}×${h}`);
      const page = await open(w, h);
      const k = await page.evaluate(() => G.UIScale.now);
      for (const t of ['sound', 'gfx', 'ctl', 'a11y', 'acc', 'about']) {
        await page.evaluate(t => G.SettingsUI.open(t), t);
        const box = await fits(page, '.box.settings');
        const close = await fits(page, '#set-close');
        check(box.ok && close.ok, `k ${k.toFixed(2)}, ${t}: the box and its Close button are inside the window`, { box, close });
        if (SHOTS && t === 'gfx') await page.screenshot({ path: `${SHOTS}/settings-${w}.png` });
      }
      await page.click('#set-close');
      check(!(await isOpen(page)), 'a real click on Close closes it');
      await page.evaluate(() => { G.DB.grant(4, 't'); G.DB.save.partner = 4; G.DB.commit(); G.Game.startRun(); G.Game.player.hurt = () => {}; G.Game.togglePause(); });
      await page.waitForSelector('#scr-pause:not(.hidden)');
      check((await fits(page, '.pause-box')).ok, 'the pause menu fits', await fits(page, '.pause-box'));
      await page.evaluate(() => { G.UI.hideAll(); G.Game.toUI(); G.NewsUI.open(); });
      check((await fits(page, '.news-box')).ok, 'News fits', await fits(page, '.news-box'));
      await page.evaluate(() => G.UI.hideAll());

      if (w === 3840) {
        console.log('2. Clicking outside');
        await page.evaluate(() => G.SettingsUI.open('gfx'));
        await fits(page, '.box.settings');
        const r = await page.evaluate(() => { const b = document.querySelector('.box.settings').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; });
        await page.mouse.click((r.l + r.r) / 2, r.t + 40);
        check(await isOpen(page), 'a click inside the box leaves it open');
        const s = await page.evaluate(() => {
          const el = document.getElementById('set-radglow');
          el.scrollIntoView({ block: 'center' });
          const b = el.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        });
        await page.mouse.move(s.x, s.y); await page.mouse.down();
        await page.mouse.move(r.r + 60, s.y, { steps: 8 }); await page.mouse.up();
        check(await isOpen(page), 'dragging the slider out of the box and letting go there leaves it open');
        await page.mouse.click(r.r + 60, (r.t + r.b) / 2);
        check(!(await isOpen(page)), 'a click on the backdrop beside the box closes it');
      }
      await page.context().close();
    }

    console.log('3. The built index.html at 3840×2160');
    // G is sealed in app.min.js, so only what a player does: the gear button, then the backdrop.
    const ctx = await browser.newContext({ viewport: { width: 3840, height: 2160 }, serviceWorkers: 'block', locale: 'en-US' });
    const built = await ctx.newPage();
    built.on('pageerror', e => errs.push('index.html: ' + e.message));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    await built.click('#btn-guest');
    // A new guest: the grid of starters first (js/fork/starter-pick.js), then the menu.
    await pickStarter(built);
    await built.waitForSelector('#btn-settings', { state: 'visible', timeout: 30000 });
    await built.click('#btn-settings');
    await built.waitForSelector('#scr-settings:not(.hidden)');
    await built.click('#set-tabs [data-t="gfx"]');
    const bb = await fits(built, '.box.settings'), bc = await fits(built, '#set-close');
    check(bb.ok && bc.ok, 'index.html: Graphics fits, Close in reach', { bb, bc });
    await built.mouse.click(3840 - 40, 1080);
    check(await built.evaluate(() => document.getElementById('scr-settings').classList.contains('hidden')), 'index.html: a click on the backdrop closes it');
    await ctx.close();

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
