#!/usr/bin/env node
// The fork's changes to Kecleon's shop (js/fork/kecleon.js), through the real UI, in headless Edge on dev.html, as a guest:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-kecleon-mints.cjs [base-url]
//
//   1. The random Mint, used 40 times from Charmander's card: a new nature every time, never a neutral one,
//      40 Mints gone; its shop text says so.
//   2. The stock changes at noon and midnight in Spain (a fixed clock): the 8 TMs, the heading's "new ones in", an
//      afternoon TM bought, a morning-only one refused, summer time, and Lab's extra TM with it.
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

    console.log('2. The stock changes every 12 h (midnight and noon in Spain)');
    const at = async iso => { await page.clock.setFixedTime(new Date(iso)); };
    const stock = () => page.evaluate(() => ({ key: G.Shop.today(), tms: G.Shop.dailyTms().slice(0, 8), lab: G.LabTms.today() }));
    await at('2026-10-28T09:30:00Z');                     // 10:30 in Spain (winter time)
    const am = await stock();
    await openShop();
    const shown = await page.$$eval('#shop-body [data-buy^="tm:"]', l => l.map(b => b.dataset.buy.slice(3)));
    const head = await page.$eval('#shop-body .kec-next', e => e.closest('h3').textContent).catch(() => null);
    check(am.key === '20261028' && am.tms.length === 8, 'before noon: the day\'s stock, under upstream\'s key', am);
    check(am.tms.every(id => shown.includes(id)), 'the shop shows those 8 TMs', { shown });
    check(/TMs on sale · new ones in 1 h 30 min/.test(head || ''), 'the heading says when they change', head);
    await at('2026-10-28T11:30:00Z');                     // 12:30
    const pm = await stock();
    const fresh = pm.tms.filter(id => !am.tms.includes(id)), gone = am.tms.filter(id => !pm.tms.includes(id));
    check(pm.key === '20261028pm' && fresh.length >= 3, `after noon: a new stock (${fresh.length} TMs new)`, pm);
    await openShop();
    const c0 = await page.evaluate(() => G.DB.save.coins);
    await page.click(`#shop-body [data-buy="tm:${fresh[0]}"]`);
    await page.waitForTimeout(250);
    const got = await page.evaluate(([id, c0]) => ({ n: (G.DB.save.tms || {})[id] || 0, spent: c0 - G.DB.save.coins, price: G.Shop.tmPrice(id) }), [fresh[0], c0]);
    check(got.n === 1 && got.spent === got.price, `an afternoon TM (${fresh[0]}) can be bought`, got);
    const old = gone.length ? await page.evaluate(id => G.Shop.buy('tm:' + id), gone[0]) : { ok: false };
    check(!old.ok, `a morning-only TM (${gone[0]}) can't any more`, old);
    await at('2026-10-28T23:30:00Z');                     // 00:30 on the 29th
    const next = await stock();
    await at('2026-07-01T10:30:00Z');                     // 12:30 in summer time
    const summer = await page.evaluate(() => G.Shop.today());
    check(next.key === '20261029' && summer === '20260701pm', 'midnight starts the next day\'s; Spain\'s summer time is followed', { next: next.key, summer });
    const labs = [];
    for (const iso of ['2026-10-28T09:30:00Z', '2026-10-28T11:30:00Z', '2026-10-29T09:30:00Z', '2026-10-29T11:30:00Z', '2026-10-30T09:30:00Z', '2026-10-30T11:30:00Z']) { await at(iso); labs.push((await stock()).lab); }
    check(new Set(labs).size >= 3, 'Lab\'s extra TM changes with it', labs);

    check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
