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
//   3. Chosen-nature Mints: 3 on sale (none neutral) at 4,000, 3 of each per player per stock (a 4th refused, one not on
//      sale refused), kept over a reload, new ones and a fresh limit after noon, listed in the bag, used from the
//      card's Nature Mint pick (and in runs), and two copies of the save merged.
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

    console.log('3. Chosen-nature Mints');
    await at('2026-10-28T09:30:00Z');
    await page.evaluate(() => { const s = G.DB.save; s.bag = {}; s.coins = 100000; delete s.kmint; s.pnat = { 4: ['hardy', Date.now()] }; G.DB.commit(); });
    await openShop();
    const sale = await page.evaluate(() => G.Kecleon.onSale());
    const items = await page.$$eval('#shop-body [data-buy]', l => l.map(b => b.dataset.buy).filter(k => !k.startsWith('tm:')));
    const rowOf = id => page.$eval(`#shop-body [data-buy="${id}"]`, b => ({ text: b.closest('.upg-item').textContent.replace(/\s+/g, ' '), price: b.textContent.replace(/\D/g, ''), off: b.disabled }));
    const r0 = await rowOf(sale[0]);
    const natures = await page.evaluate(sale => sale.map(id => G.NATURE_BY[G.Kecleon.MINTS[id]]).map(n => n.id + (n.up ? '' : '!')), sale);
    check(sale.length === 3 && JSON.stringify(items) === JSON.stringify(['mint', ...sale, 'cap', 'caph']) && !natures.some(n => n.endsWith('!')),
      'the shop sells 3 chosen-nature Mints, after the random one, none neutral', { items, natures });
    check(r0.price === '4000' && /3 of 3 left for you · new stock in 1 h 30 min/.test(r0.text) && /Sets a Pokémon's nature to/.test(r0.text), 'each costs 4,000 and says 3 of 3 left', r0);
    for (let i = 0; i < 3; i++) { await page.click(`#shop-body [data-buy="${sale[0]}"]`); await page.waitForTimeout(250); }
    await page.click(`#shop-body [data-buy="${sale[1]}"]`); await page.waitForTimeout(250);
    const after3 = await rowOf(sale[0]), after1 = await rowOf(sale[1]);
    const st = await page.evaluate(([a, b]) => ({ coins: G.DB.save.coins, a: G.Shop.count(a), b: G.Shop.count(b), fourth: G.Shop.buy(a), kmint: G.DB.save.kmint }), [sale[0], sale[1]]);
    check(st.coins === 100000 - 16000 && st.a === 3 && st.b === 1, '3 of the first and 1 of the second are in the bag, for 16,000', st);
    check(after3.off && /Sold out for you/.test(after3.text) && !st.fourth.ok && /until the shop changes/.test(st.fourth.error || ''), 'a 4th of the first is refused (sold out for you)', { after3, fourth: st.fourth });
    check(/2 of 3 left/.test(after1.text) && !after1.off, 'the second says 2 of 3 left', after1);
    const notSale = await page.evaluate(sale => { const id = Object.keys(G.Kecleon.MINTS).find(x => !sale.includes(x)); return { id, r: G.Shop.buy(id) }; }, sale);
    check(!notSale.r.ok, `one not on sale (${notSale.id}) can't be bought`, notSale);

    // A reload keeps them (the bag's ledger and the count).
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => G.DB.save && G.MenuUI && G.Kecleon, null, { timeout: 30000 });
    await at('2026-10-28T09:30:00Z');
    const kept = await page.evaluate(([a, b]) => ({ a: G.Shop.count(a), b: G.Shop.count(b), leftA: G.Kecleon.left(a), leftB: G.Kecleon.left(b), led: Object.keys((G.DB.save.led || {})[Object.keys(G.DB.save.led || {})[0]] || {}).filter(k => k.startsWith('b:mint')) }), [sale[0], sale[1]]);
    check(kept.a === 3 && kept.b === 1 && kept.leftA === 0 && kept.leftB === 2, 'after a reload: still in the bag, still 0 and 2 left', kept);

    // The next stock: new natures, and the limit starts again; the bag lists the ones you have.
    await at('2026-10-28T11:30:00Z');
    const sale2 = await page.evaluate(() => G.Kecleon.onSale());
    const left2 = await page.evaluate(id => G.Kecleon.left(id), sale[0]);
    check(JSON.stringify(sale2) !== JSON.stringify(sale) && left2 === 3, 'after noon: other natures on sale, and the limit starts again', { sale, sale2, left2 });
    await openShop();
    const items2 = await page.$$eval('#shop-body [data-buy]', l => l.map(b => b.dataset.buy).filter(k => !k.startsWith('tm:')));
    check(JSON.stringify(items2) === JSON.stringify(['mint', ...sale2, 'cap', 'caph']), 'the shop lists only the new ones (not the ones in your bag)', items2);
    await menu();
    await page.click('#scr-menu [data-go="bag"]');
    await page.waitForSelector('#bag-body .upg-item', { timeout: 8000 });
    const bag = await page.$eval('#bag-body', e => e.textContent.replace(/\s+/g, ' '));
    const names = await page.evaluate(([a, b]) => [G.Shop.ITEMS[a].name, G.Shop.ITEMS[b].name], [sale[0], sale[1]]);
    check(bag.includes(names[0] + ' ×3') || (bag.includes(names[0]) && bag.includes(names[1])), `the bag lists ${names.join(' and ')}`, bag.slice(0, 300));

    // The collection card: Nature Mint, pick one, Charmander gets that nature.
    await card('Charmander');
    await page.click('#dex-detail [data-kmint]');
    await page.waitForSelector('#mx-picker [data-kmint-v]', { timeout: 5000 });
    const chips = await page.$$eval('#mx-picker [data-kmint-v]', l => l.map(c => c.dataset.kmintV));
    await page.click(`#mx-picker [data-kmint-v="${sale[0]}"]`);
    await page.waitForTimeout(400);
    const set = await page.evaluate(id => ({ nature: G.Mons.natureOf(4).id, want: G.Kecleon.MINTS[id], left: G.Shop.count(id), run: G.Mons.monFor(4).nature }), sale[0]);
    const chips2 = await page.$$eval('#dex-detail [data-kmint]', l => l.length).then(n => n ? page.click('#dex-detail [data-kmint]').then(() => page.$$eval('#mx-picker [data-kmint-v]', l => l.map(c => c.dataset.kmintV))) : []);
    check(chips.includes(sale[0]) && chips.includes(sale[1]), 'Nature Mint lists the chosen Mints in the bag', chips);
    check(set.nature === set.want && set.run === set.want && set.left === 2, `Charmander is now ${set.want} (in runs too), 2 of that Mint left`, set);
    check(!chips2.includes(sale[0]) && chips2.includes(sale[1]), 'the pick no longer offers the nature it already has', chips2);

    // Two copies of the save (two devices) merged.
    const merged = await page.evaluate(([a, b]) => {
      const s = JSON.parse(JSON.stringify(G.DB.save)), p = G.Shop.today();
      const x = JSON.parse(JSON.stringify(s)), y = JSON.parse(JSON.stringify(s));
      x.kmint = { p, n: { [G.Kecleon.MINTS[a]]: 3 } }; y.kmint = { p, n: { [G.Kecleon.MINTS[a]]: 1, [G.Kecleon.MINTS[b]]: 2 } }; y.updated = (x.updated || 0) + 1;
      const r = G.DB.merge(x, y);
      const z = JSON.parse(JSON.stringify(s)); z.kmint = { p: '20261027pm', n: { calm: 3 } }; z.updated = (x.updated || 0) + 2;
      const r2 = G.DB.merge(x, z);
      return { kmint: r.kmint, bag: r.bag[a], old: r2.kmint };
    }, [sale[0], sale[1]]);
    check(merged.kmint.n[await page.evaluate(id => G.Kecleon.MINTS[id], sale[0])] === 3 && merged.bag === 2 && merged.old.p === '20261028pm',
      'merging two copies keeps the higher count of the same stock, the later stock, and the bag', merged);

    check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
