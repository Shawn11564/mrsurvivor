#!/usr/bin/env node
// The level-up cards can't be picked for 1 s after they show (js/ui/run-ui.js GUARD; upstream's 0.6 s
// was short enough to pick one by accident in the middle of a fight), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-pick-guard.cjs [base-url]
//
//   At 0.75 s a click on a card and the 1 key do nothing, and the cards look dimmed; after 1 s they
//   don't, and a real mouse click on a card picks it.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
    // The level-up screen, and the moment its cards showed (the guard starts there).
    await page.evaluate(async () => {
      G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.DB.commit();
      G.UI.hideAll(); G.Game.toUI(); G.Game.startRun();
      G.Game.player.hurt = () => {};
      G.Game.debugLevelUp();
      while (!document.querySelector('#scr-levelup:not(.hidden) .card')) await new Promise(r => setTimeout(r, 5));
      window.__t0 = performance.now();
    });
    const at = ms => page.evaluate(async ms => { while (performance.now() - window.__t0 < ms) await new Promise(r => setTimeout(r, 5)); }, ms);
    const now = () => page.evaluate(() => Math.round(performance.now() - window.__t0));
    const open = () => page.evaluate(() => G.UI.isOpen('scr-levelup') && G.Game.state === 'levelup');

    await at(750);
    await page.evaluate(() => document.querySelector('#cards .card').click());
    await page.keyboard.press('Digit1');
    const t = await now();
    const dim = await page.evaluate(() => document.getElementById('cards').classList.contains('guard'));
    check(t < 1000 && await open() && dim, `at ${t} ms a click on a card and the 1 key don't pick, and the cards look dimmed`);

    await at(1100);
    check(!(await page.evaluate(() => document.getElementById('cards').classList.contains('guard'))), 'after 1 s the cards are no longer dimmed');
    const c = await page.evaluate(() => { const r = document.querySelector('#cards .card').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(300);
    check(!(await page.evaluate(() => G.UI.isOpen('scr-levelup'))), 'then a real mouse click on a card picks it');
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
