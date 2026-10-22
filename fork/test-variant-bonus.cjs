#!/usr/bin/env node
// What a shiny or a radiant gives, shown in the collection's detail (js/fork/lab/variant-bonus.js)
// and applied in Lab runs (BONUS / RBONUS in js/fork/lab/shiny.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-variant-bonus.cjs [base-url]      (SHOT=<file.png> saves the radiant panel)
//
// A stand-in radiant list (Mewtwo) whose r/ sheets are the shiny ones. The player owns Mewtwo
// (shiny and radiant), Charizard (shiny) and Pikachu (neither).
//   1. Charizard, viewing its shiny: a Shiny bonus box under the stats, +10% XP and coins (the
//      coloured end of each bar) and one coloured reroll pip. Viewing Normal: the box dimmed,
//      "Pick Shiny above". Pikachu: no box.
//   2. Mewtwo with its radiant: a Radiant bonus box, +20% and two pips, its bars' coloured ends
//      twice the shiny's. Viewing its shiny instead: the shiny box, saying the radiant gives more.
//   3. Lab off: the box says to turn Lab mode on.
//   4. In Lab runs: the shiny gives ×1.1 XP and coins and +1 reroll, the radiant ×1.2 and +2
//      (against the same Pokémon's normal run), and the pause screen line says so.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const LIST = { 150: { rarity: 5 } };

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.route('**/js/fork/radiant-list.js*', r => r.fulfill({ contentType: 'text/javascript', body: `G.RADIANTS = ${JSON.stringify(LIST)};` }));
    await page.route('**/js/fork/radiants.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(LIST) }));
    await page.route(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/, r => r.continue({ url: r.request().url().replace('/r/', '/s/') }));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.Radiant && G.VariantBonus, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [150, 6, 25]) G.DB.grant(d, 't');
      G.DB.grantShiny(150, 't'); G.DB.grantShiny(6, 't');
      s.radiant = { 150: { at: Date.now(), from: 't' } };
      s.partner = 25; G.Settings.set('lab', true); G.DB.commit(); G.MenuUI.open();
    });
    await page.click('#scr-menu [data-go=dex]');
    await page.waitForSelector('#dex-grid .cell');
    await page.click('#dex-gens .gen-tab >> nth=0');
    const open = async name => {
      await page.fill('#dex-q', name);                   // the grid loads in batches: search for it
      await page.waitForTimeout(300);
      await page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).click();
      await page.waitForTimeout(150);
    };
    const box = () => page.evaluate(() => {
      const b = document.getElementById('vb-box');
      if (!b) return null;
      const ext = [...b.querySelectorAll('.vb-bar i.vb-x')].map(i => i.getBoundingClientRect().width);
      return { kind: b.dataset.kind, off: b.classList.contains('off'), nums: [...b.querySelectorAll('.vb-n')].map(n => n.textContent),
        pips: b.querySelectorAll('.vb-pips i.vb-x').length, ext, note: b.querySelector('.vb-note').textContent,
        afterStats: b.previousElementSibling && b.previousElementSibling.classList.contains('stat') };
    });

    console.log('1. A shiny');
    await open('Charizard');
    let b = await box();
    check(b && b.kind === 'shiny' && !b.off && b.afterStats, 'Charizard, viewing its shiny: a Shiny bonus box under the stats', b);
    check(b && b.nums.join() === '+10%,+10%,+1' && b.pips === 1, '+10% XP, +10% coins, one coloured reroll pip', b && b.nums);
    const shinyExt = b ? b.ext[0] : 0;
    await page.click('#dex-detail .seg [data-v="0"]');
    b = await box();
    check(b && b.kind === 'shiny' && b.off && /Pick Shiny above/.test(b.note), 'viewing Normal: the box dimmed, "Pick Shiny above"', b);
    await page.click('#dex-detail .seg [data-v="1"]');
    await open('Pikachu');
    check(await box() === null, 'Pikachu (no shiny, no radiant): no box');

    console.log('2. A radiant');
    await open('Mewtwo');
    b = await box();
    check(b && b.kind === 'radiant' && !b.off && b.nums.join() === '+20%,+20%,+2' && b.pips === 2, 'Mewtwo with its radiant: +20%, +20%, two pips', b);
    check(b && Math.abs(b.ext[0] - 2 * shinyExt) <= 1.5, 'its bars\' coloured ends are twice the shiny\'s', { radiant: b && b.ext[0], shiny: shinyExt });
    if (process.env.SHOT) {
      await page.locator('#vb-box').scrollIntoViewIfNeeded();
      const r = await page.evaluate(() => { const a = document.querySelectorAll('#dex-detail .stat')[0].getBoundingClientRect(), b = document.getElementById('vb-box').getBoundingClientRect();
        return { x: Math.min(a.left, b.left) - 8, y: a.top - 8, width: Math.max(a.width, b.width) + 16, height: b.bottom - a.top + 16 }; });
      await page.screenshot({ path: process.env.SHOT, clip: r });
    }
    await page.click('#dex-detail .seg [data-v="1"]');
    b = await box();
    check(b && b.kind === 'shiny' && !b.off && /radiant gives more/.test(b.note), 'viewing its shiny: the shiny box, saying the radiant gives more', b);
    await page.click('#dex-detail .seg [data-v="2"]');

    console.log('3. Lab off');
    await page.evaluate(() => G.Settings.set('lab', false));
    await open('Charizard'); await open('Mewtwo');
    b = await box();
    check(b && /Turn on Lab mode/.test(b.note), 'the box says to turn Lab mode on', b && b.note);

    console.log('4. In Lab runs');
    const run = (dex, shiny, rad) => page.evaluate(([dex, shiny, rad]) => {
      const s = G.DB.save;
      G.Settings.set('lab', true);
      s.partner = dex; s.partnerShiny = shiny; G.Radiant.set(dex, rad); G.DB.commit();
      G.UI.hideAll(); G.Game.toUI();
      G.Game.startRun();
      const p = G.Game.player, out = { xp: p.xpMul, coins: p.coinMul, rr: p.rerollBonus || 0, rad: !!p._labRadiant, shiny: !!p._labShiny };
      G.Game.quit();
      return out;
    }, [dex, shiny, rad]);
    const n6 = await run(6, false, false), s6 = await run(6, true, false);
    check(Math.abs(s6.xp / n6.xp - 1.1) < 1e-9 && Math.abs(s6.coins / n6.coins - 1.1) < 1e-9 && s6.rr - n6.rr === 1 && s6.shiny,
      'shiny Charizard: ×1.1 XP and coins, +1 reroll', { n6, s6 });
    const n150 = await run(150, false, false), r150 = await run(150, true, true);
    check(Math.abs(r150.xp / n150.xp - 1.2) < 1e-9 && Math.abs(r150.coins / n150.coins - 1.2) < 1e-9 && r150.rr - n150.rr === 2 && r150.rad && !r150.shiny,
      'radiant Mewtwo (its shiny picked too): ×1.2 XP and coins, +2 rerolls, not the shiny\'s', { n150, r150 });
    const line = await page.evaluate(() => { G.Settings.set('lab', true); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(); G.RunUI.showPause(); return document.getElementById('pause-sum').textContent; });
    check(/Radiant: \+20% XP, \+20% coins and two more card rerolls/.test(line), 'the pause screen says what the radiant gives');
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll variant bonus checks passed');
  process.exit(failures ? 1 : 0);
})();
