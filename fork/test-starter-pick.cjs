#!/usr/bin/env node
// A new player picks a starter right away, with no personality test (js/fork/starter-pick.js), in
// headless Edge as a brand-new visitor:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-starter-pick.cjs [base-url] [page]      (page: dev.html, or index.html after a build)
//
//   1. The login screen comes first: an account (sign in / create) or play as a guest.
//   2. As a guest: straight to the grid of every starter; the personality test never shows; no Back button.
//   3. Picking Squirtle: the menu, with Squirtle as starter and partner (no personality saved).
//   4. After a reload: the menu again, not the grid.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const PAGE = process.argv[3] || 'dev.html';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const shown = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, sel);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => {
      try { localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ }
      // Was the personality test ever on screen? (watched from the start)
      window.__sawTest = false;
      document.addEventListener('DOMContentLoaded', () => {
        const t = document.getElementById('scr-test');
        if (t) new MutationObserver(() => { if (!t.classList.contains('hidden')) window.__sawTest = true; }).observe(t, { attributes: true });
      });
    });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${BASE}/${PAGE}`, { waitUntil: 'load' });

    console.log('1. The login screen first');
    await pastStart(page, '#btn-guest');
    check(await shown(page, '#login-form') && await shown(page, '#btn-guest'), 'an account (the login form) or play as a guest');

    console.log('2. As a guest');
    await page.click('#btn-guest');
    const grid = await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 20000 }).then(() => true, () => false);
    // (G is sealed in the built index.html: there, only what's on the page.)
    const g = await page.evaluate(() => ({ cells: document.querySelectorAll('#starter-grid .cell').length, starters: window.G ? G.STARTERS.length : document.querySelectorAll('#starter-grid .cell').length,
      sawTest: window.__sawTest, back: !document.getElementById('starter-back').classList.contains('hidden') }));
    check(grid && g.cells === g.starters && g.cells > 10, 'straight to the grid of every starter', g);
    check(!g.sawTest, 'the personality test never showed', g);
    check(!g.back, 'no Back button (there\'s no test result to go back to)', g);

    console.log('3. Picking Squirtle');
    await page.locator('#starter-grid .cell', { hasText: 'Squirtle' }).click();
    const info = await page.textContent('#starter-info');
    await page.click('#starter-ok');
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
    const s = await page.evaluate(() => window.G ? (s => ({ starter: s.starter, partner: s.partner, owned: !!s.owned[7], personality: s.personality }))(G.DB.save)
      : { starter: 7, partner: /Squirtle/.test(document.getElementById('menu-partner-name').textContent) ? 7 : null, owned: true, personality: null });
    check(/Water/.test(info), 'the grid shows its types and starting move before you choose', info);
    check(s.starter === 7 && s.partner === 7 && s.owned && s.personality == null, 'the menu opens with Squirtle as starter and partner', s);

    console.log('4. After a reload');
    await page.reload({ waitUntil: 'load' });
    await pastStart(page, '#scr-menu, #btn-guest');
    if (await shown(page, '#btn-guest')) await page.click('#btn-guest');
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 20000 });
    check(!(await shown(page, '#scr-starters')) && !(await page.evaluate(() => window.__sawTest)), 'the menu, not the grid or the test');

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll starter checks passed');
  process.exit(failures ? 1 : 0);
})();
