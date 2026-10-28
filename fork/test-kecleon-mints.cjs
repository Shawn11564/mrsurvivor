#!/usr/bin/env node
// The fork's changes to Kecleon's shop (js/fork/kecleon.js), through the real UI, in headless Edge on dev.html, as a guest:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-kecleon-mints.cjs [base-url]
//
//   1. The random Mint, used 40 times from Charmander's card: a new nature every time, never a neutral one,
//      40 Mints gone; its shop text says so.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra).slice(0, 500) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.MenuUI && G.Kecleon, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [4, 143]) s.owned[d] = { at: Date.now() };
      s.partner = 4; s.starter = 4; s.coins = 1e6; s.pnat = { 4: ['hardy', Date.now()] };
      G.Settings.set('calm', true); G.DB.commit();
    });
    const menu = () => page.evaluate(() => { G.UI.hideAll(); G.MenuUI.open(); });
    const openShop = async () => {
      await menu();
      await page.click('#scr-menu [data-go="shop"]');
      await page.waitForSelector('#shop-body [data-buy]', { timeout: 10000 });
    };
    const card = async name => {
      await menu();
      await page.click('#scr-menu [data-go=dex]');
      await page.waitForSelector('#dex-grid .cell');
      await page.fill('#dex-q', name);
      await page.waitForTimeout(350);
      await page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).click();
      await page.waitForSelector('#dex-detail .mon-extra', { timeout: 8000 });
    };

    console.log('1. The random Mint');
    await page.evaluate(() => { G.DB.save.bag = { mint: 40 }; G.DB.commit(); });
    await card('Charmander');
    const seen = [];
    for (let i = 0; i < 40; i++) {
      const before = await page.evaluate(() => G.Mons.natureOf(4).id);
      await page.click('#dex-detail [data-extra="nat"]');
      await page.waitForFunction(b => G.Mons.natureOf(4).id !== b, before, { timeout: 3000 }).catch(() => {});
      seen.push([before, await page.evaluate(() => G.Mons.natureOf(4).id)]);
    }
    const r1 = await page.evaluate(seen => ({
      neutral: seen.filter(([, n]) => !G.NATURE_BY[n].up).map(x => x[1]),
      same: seen.filter(([a, b]) => a === b).length,
      kinds: new Set(seen.map(x => x[1])).size,
      left: (G.DB.save.bag || {}).mint || 0,
      button: !!document.querySelector('#dex-detail [data-extra="nat"]')
    }), seen);
    check(r1.neutral.length === 0 && r1.same === 0 && r1.kinds >= 10, `40 uses: a new nature each time, never a neutral one (${r1.kinds} different)`, r1);
    check(r1.left === 0 && !r1.button, 'the 40 Mints are used up and the button is gone', r1);
    await openShop();
    const desc = await page.$eval('#shop-body [data-buy="mint"]', b => b.closest('.upg-item').querySelector('.sub').textContent);
    check(/never a neutral one/.test(desc), 'the shop says it never gives a neutral nature', desc);

    check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
