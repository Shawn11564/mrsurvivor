#!/usr/bin/env node
// Kecleon's shop through the real UI (upstream's js/data/shop.js, js/ui/shop-ui.js, js/systems/mons.js; plan D11),
// and the Lab TMs it sells with Lab on (js/fork/lab/lab-tms.js, plan D7), in headless Edge on dev.html, as a guest:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-kecleon.cjs [base-url]
//
//   1. Lab off: the shop lists 8 TMs (no Lab one); buying a Mint, an Ability Capsule and a TM Charmander can learn
//      takes the coins and fills the bag.
//   2. The collection card uses them: the Mint changes Charmander's nature, the Capsule Snorlax's ability, and
//      Teach TM teaches Charmander the TM (gone from the bag).
//   3. A run started with Play has them: the nature on its stats, the TM in its list and on its cards.
//   4. Lab on: a 9th TM, a Lab move upstream doesn't sell, tagged LAB, priced 300 + 6 x power (status 400); bought
//      and taught to a species that learns it by TM; a Lab run with it has it, a normal run doesn't (Lab TMs stay
//      Lab-only, plan G5), and with Lab off it can't be taught to anyone.
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
    await page.waitForFunction(() => G.DB.save && G.MenuUI && G.LabTms, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [4, 143]) s.owned[d] = { at: Date.now() };
      s.partner = 4; s.starter = 4; s.coins = 1e6; s.pnat = { 4: ['hardy', Date.now()] }; s.pabil = { 143: [0, Date.now()] };
      G.Settings.set('lab', false); G.Settings.set('calm', true); G.DB.commit();
    });
    const menu = () => page.evaluate(() => { G.UI.hideAll(); G.MenuUI.open(); });
    const openShop = async () => {
      await menu();
      await page.click('#scr-menu [data-go="shop"]');
      await page.waitForSelector('#shop-body [data-buy]', { timeout: 10000 });
      return page.$$eval('#shop-body [data-buy^="tm:"]', l => l.map(b => b.dataset.buy.slice(3)));
    };
    const buy = async key => { await page.click(`#shop-body [data-buy="${key}"]`); await page.waitForTimeout(250); };
    const card = async name => {
      await menu();
      await page.click('#scr-menu [data-go=dex]');
      await page.waitForSelector('#dex-grid .cell');
      await page.fill('#dex-q', name);
      await page.waitForTimeout(350);
      await page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click();
      await page.waitForSelector('#dex-detail .mon-extra', { timeout: 8000 });
    };
    const useExtra = async (key, v) => {
      await page.click(`#dex-detail [data-extra="${key}"]`);
      await page.waitForSelector(`#mx-picker [data-v="${v}"]`, { timeout: 5000 });
      await page.click(`#mx-picker [data-v="${v}"]`);
      await page.waitForTimeout(300);
    };

    console.log('1. Buying (Lab off)');
    const tms = await openShop();
    const tm = await page.evaluate(list => list.find(id => G.Mons.canLearn(4, id)), tms);
    const c0 = await page.evaluate(() => G.DB.save.coins);
    await buy('mint'); await buy('cap'); await buy('tm:' + tm);
    const bought = await page.evaluate(([tm, c0]) => { const s = G.DB.save; return { mint: (s.bag || {}).mint, cap: (s.bag || {}).cap, tm: (s.tms || {})[tm], spent: c0 - s.coins, want: 3000 + G.Shop.tmPrice(tm) }; }, [tm, c0]);
    check(tms.length === 8, `8 TMs for sale (${tms.join(', ')})`, tms);
    check(await page.evaluate(list => !list.some(id => G.LabTms.isLab(id)), tms), 'no Lab TM with Lab off');
    check(!!tm && bought.mint === 1 && bought.cap === 1 && bought.tm === 1 && bought.spent === bought.want, `a Mint, a Capsule and TM ${tm} are in the bag, for ${bought.want} coins`, bought);

    console.log('2. Using them on the collection card');
    await card('Charmander');
    await useExtra('nat', 'adamant');
    await card('Snorlax');
    await useExtra('cap', '1');
    await card('Charmander');
    await useExtra('tm', tm);
    const used = await page.evaluate(tm => { const s = G.DB.save; return { nature: G.Mons.natureOf(4).id, abil: G.Mons.abilityOf(143), taught: G.Mons.taught(4), bag: Object.assign({}, s.bag), tms: Object.assign({}, s.tms) }; }, tm);
    check(used.nature === 'adamant' && !used.bag.mint, 'the Mint made Charmander Adamant (and was used up)', used);
    check(used.abil.id === 'thick-fat' && used.abil.slot === 1 && !used.bag.cap, 'the Capsule gave Snorlax Thick Fat (and was used up)', used);
    check(used.taught.includes(tm) && !used.tms[tm], `Charmander learned ${tm} (the TM was used up)`, used);

    console.log('3. A run with them');
    await menu();
    await page.click('#scr-menu [data-go="play"]');
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 });
    const run = await page.evaluate(tm => {
      const pl = G.Game.player, seen = new Set();
      for (let i = 0; i < 400; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new') seen.add(c.key.slice(4));
      const r = { dex: pl.dex, nature: pl.mon.nature, pa: +(pl.mon.pa / G.DEX_BY[4].pa).toFixed(2), pool: G.Moves.poolFor(pl.mon).includes(tm), offered: seen.has(tm) };
      G.Game.quit();
      return r;
    }, tm);
    check(run.dex === 4 && run.nature === 'adamant' && run.pa === 1.1, 'the run\'s Charmander is Adamant (Attack x1.1)', run);
    check(run.pool && run.offered, `the run can learn ${tm} and its cards offer it`, run);

    console.log('4. Lab TMs (Lab on)');
    await page.evaluate(() => G.Settings.set('lab', true));
    const lab = await openShop();
    const ltm = lab[lab.length - 1];
    const info = await page.evaluate(id => {
      const D = G.LabData, p = D.POWER[D.MOVES.indexOf(id)] || 0, row = document.querySelector(`#shop-body [data-buy="tm:${id}"]`).closest('.upg-item');
      // A species that learns it by TM in the games and whose Lab list doesn't have it.
      const who = (G.LabTms.LAB_TMS[id] || []).find(d => G.DEX_BY[d] && !G.Lab.poolFor(G.DEX_BY[d], true).includes(id));
      return { n: Object.keys(G.LabTms.LAB_TMS).length, isLab: G.LabTms.isLab(id), upstream: !!G.TM_MOVES[id], price: G.Shop.tmPrice(id), want: p ? Math.round((300 + 6 * p) / 10) * 10 : 400,
               tag: !!row.querySelector('.lab-tm'), note: (row.querySelector('.lab-tm-note') || {}).textContent, who, name: who && G.DEX_BY[who].name };
    }, ltm);
    console.log(`  info: ${info.n} Lab TMs; today's is ${ltm}, ${info.price} coins; taught to ${info.name}`);
    check(lab.length === 9 && info.isLab && !info.upstream && info.price === info.want, `with Lab on, a 9th TM: ${ltm}, a Lab move upstream doesn't sell, ${info.price} coins`, info);
    check(info.tag && /Lab runs only/.test(info.note || ''), 'its row is tagged LAB and says it works in Lab runs only', info);
    const c1 = await page.evaluate(() => G.DB.save.coins);
    await buy('tm:' + ltm);
    const got = await page.evaluate(([id, c1]) => ({ n: (G.DB.save.tms || {})[id], spent: c1 - G.DB.save.coins }), [ltm, c1]);
    check(got.n === 1 && got.spent === info.price, 'buying it puts it in the bag', got);
    await page.evaluate(d => { G.DB.save.owned[d] = { at: Date.now() }; G.DB.save.partner = d; G.DB.commit(); }, info.who);
    await card(info.name);
    await useExtra('tm', ltm);
    const taught = await page.evaluate(([d, id]) => G.Mons.taught(d).includes(id), [info.who, ltm]);
    check(taught, `${info.name} learned it from the card`, taught);
    const inRun = lab => page.evaluate(async ([d, id, lab]) => {
      G.Settings.set('lab', lab);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: d, shiny: false });
      const t0 = Date.now(); while (!(G.Game.state === 'playing' && G.Game.player) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 30));
      const pl = G.Game.player, seen = new Set();
      for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new') seen.add(c.key.slice(4));
      const r = { lab: G.Lab.active, pool: G.Moves.poolFor(pl.mon).includes(id), offered: seen.has(id) };
      G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu();
      return r;
    }, [info.who, ltm, lab]);
    const rl = await inRun(true), rn = await inRun(false);
    check(rl.lab && rl.pool, 'a Lab run can learn it', rl);
    check(!rn.lab && !rn.pool && !rn.offered, 'a normal run can\'t (Lab TMs stay Lab-only)', rn);
    const off = await page.evaluate(id => { G.Settings.set('lab', false); return { sold: G.Shop.dailyTms().includes(id), learners: Object.keys(G.DB.save.owned).filter(d => G.Mons.canLearn(+d, id)).length,
      buy: G.Shop.buy('tm:' + id) }; }, ltm);
    check(!off.sold && off.learners === 0 && !off.buy.ok, 'with Lab off it isn\'t sold, can\'t be bought or taught', off);

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Kecleon checks passed');
  process.exit(failures ? 1 : 0);
})();
