#!/usr/bin/env node
// The level-up cards can't be picked for 1 s after they show (js/ui/run-ui.js GUARD; upstream's 0.6 s
// was short enough to pick one by accident in the middle of a fight), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-pick-guard.cjs [base-url]
//
//   1. At 0.75 s a click on a card and the 1 key do nothing, and the cards look dimmed; after 1 s they
//      don't, and a real mouse click on a card picks it.
//   2. Another reward popup within 3 s of the last pick (several levels at once, js/fork/pick-chain.js)
//      has no guard: not dimmed, and a real click at 0.15 s picks it.
//   3. One 3.5 s of play after the last pick is guarded again.
//   4. Two levels queued and the first picked after 11 s: the count-in runs (game.js countInAfter), and the
//      second, which opens when it ends, isn't guarded (no play in between: the run's clock stood still).
//   5. A new run's first level-up is guarded, even right after the last run's pick (its clock starts at 0).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

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
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
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

    // Another popup soon after (at 0.5 s), then one 3.5 s after the last pick.
    const again = async wait => {
      await page.evaluate(async wait => {
        await new Promise(r => setTimeout(r, wait));
        G.Game.debugLevelUp();
        while (!document.querySelector('#scr-levelup:not(.hidden) .card')) await new Promise(r => setTimeout(r, 5));
        window.__t0 = performance.now();
      }, wait);
      await at(150);
      const dimmed = await page.evaluate(() => document.getElementById('cards').classList.contains('guard'));
      const p = await page.evaluate(() => { const r = document.querySelector('#cards .card').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(p.x, p.y);
      const t2 = await now();
      await page.waitForTimeout(200);
      return { dimmed, picked: !(await page.evaluate(() => G.UI.isOpen('scr-levelup'))), t: t2 };
    };
    const soon = await again(500);
    check(!soon.dimmed && soon.picked && soon.t < 1000, `a popup 0.5 s after the last pick: not dimmed, a click at ${soon.t} ms picks it`, soon);
    const late = await again(3500);
    check(late.dimmed && !late.picked, 'a popup 3.5 s after the last pick is guarded again', late);
    await page.waitForTimeout(1100);
    await page.evaluate(() => document.querySelector('#cards .card').click());   // close it (guard over)
    await page.waitForTimeout(3500);

    // Two levels queued; the first picked slowly (11 s), so the count-in runs before the second.
    await page.evaluate(async () => {
      G.Game.debugLevelUp(); G.Game.debugLevelUp();
      while (!document.querySelector('#scr-levelup:not(.hidden) .card')) await new Promise(r => setTimeout(r, 5));
    });
    await page.waitForTimeout(11000);
    await page.evaluate(() => document.querySelector('#cards .card').click());
    const counted = await page.evaluate(async () => { const seen = G.Game.state === 'resuming';
      while (!document.querySelector('#scr-levelup:not(.hidden) .card')) await new Promise(r => setTimeout(r, 5));
      window.__t0 = performance.now(); return seen; });
    await at(150);
    const dim2 = await page.evaluate(() => document.getElementById('cards').classList.contains('guard'));
    const p2 = await page.evaluate(() => { const r = document.querySelector('#cards .card').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(p2.x, p2.y);
    await page.waitForTimeout(200);
    const picked2 = !(await page.evaluate(() => G.UI.isOpen('scr-levelup')));
    check(counted && !dim2 && picked2, 'after a slow pick and its count-in, the queued level opens without the guard', { counted, dimmed: dim2, picked: picked2 });

    // A new run right after that pick: its first level-up is guarded.
    await page.evaluate(async () => {
      G.Game.quit();
      const w = f => new Promise(r => { const i = setInterval(() => { if (f()) { clearInterval(i); r(); } }, 20); });
      await w(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await w(() => G.Game.state === 'ui');
      G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(); G.Game.player.hurt = () => {};
      await w(() => G.Game.state === 'playing');
      G.Game.debugLevelUp();
      while (!document.querySelector('#scr-levelup:not(.hidden) .card')) await new Promise(r => setTimeout(r, 5));
    });
    check(await page.evaluate(() => document.getElementById('cards').classList.contains('guard')), "a new run's first level-up is guarded");
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
