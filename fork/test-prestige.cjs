#!/usr/bin/env node
// Prestige (js/fork/prestige.js), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-prestige.cjs [base-url] [screenshot.png]
//
//   1. Upgrades: with something left to buy the button is off; with everything maxed it's on, asks to
//      confirm, then prestige 1: its upgrades back to 0, ★ in the selector and in the collection.
//   2. In a run: prestige 2 is +10% HP, damage, speed and damage cut; prestige 3 also starts with a
//      random held item; 3 is the most (no button).
//   3. Merging two copies: one that prestiged (upgrades 0) and an older one with everything maxed:
//      the result keeps the prestige and its upgrades at 0 (merge alone would have put them back).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOT = process.argv[3];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Prestige, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; for (const d of [4, 1]) s.owned[d] = { at: Date.now(), from: 'test' };
      s.partner = 4; s.starter = 4; G.Settings.set('lab', false); G.DB.commit(); G.Flow.goMenu();
    });
    const maxAll = dex => page.evaluate(dex => { const s = G.DB.save; s.pupg = s.pupg || {}; s.pupg[dex] = Object.fromEntries(G.Upgrades.LIST.map(u => [u.id, u.max])); G.DB.commit(); }, dex);
    const open = () => page.evaluate(() => document.querySelector('#scr-menu [data-go="upgrades"]').click());
    const panel = () => page.evaluate(() => {
      const b = document.getElementById('prestige-panel'), btn = b && b.querySelector('[data-prest]');
      const opt = [...document.getElementById('upg-mon').options].find(o => o.value === '4');
      return b && { stars: b.querySelector('.prest-stars').textContent, now: b.querySelector('.prest-now').textContent, btn: btn && { off: btn.disabled, text: btn.textContent.trim() }, opt: opt && opt.textContent };
    });

    console.log('1. Upgrades');
    await page.evaluate(() => { G.DB.save.pupg = { 4: { hp: 1 } }; });
    await open();
    await page.waitForSelector('#prestige-panel', { timeout: 5000 });
    const p0 = await panel();
    check(p0 && p0.stars === '☆☆☆' && p0.btn && p0.btn.off, 'not everything bought: ☆☆☆ and the button off', p0);
    await maxAll(4);
    await page.evaluate(() => G.UI.show('scr-upgrades', true));
    await page.waitForTimeout(100);
    const p1 = await panel();
    check(p1.btn && !p1.btn.off && p1.btn.text === 'Prestige', 'everything maxed: "Prestige" on', p1);
    await page.click('#prestige-panel [data-prest]');
    const p2 = await panel();
    check(/Confirm/.test(p2.btn.text) && !(await page.evaluate(() => G.Prestige.level(4))), 'the first click asks to confirm (nothing happens yet)', p2);
    await page.click('#prestige-panel [data-prest]');
    await page.waitForTimeout(100);
    const p3 = await panel();
    const st = await page.evaluate(() => ({ lvl: G.Prestige.level(4), upg: Object.keys(G.DB.upgradesOf(4) || {}).filter(k => G.DB.upgradesOf(4)[k] > 0).length,
      pips: document.querySelectorAll('#upg-list .pips i.on').length }));
    check(st.lvl === 1 && st.upg === 0 && st.pips === 0 && p3.stars === '★☆☆' && /Prestige 1\/3: \+5%/.test(p3.now) && / · ★$/.test(p3.opt),
      'prestige 1: upgrades back to 0 (on screen too), ★☆☆, +5%, ★ in the selector', { st, p3 });
    if (SHOT) await page.locator('#scr-upgrades').screenshot({ path: SHOT });
    await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); document.querySelector('#scr-menu [data-go="dex"]').click(); });
    await page.waitForTimeout(400);
    const badge = await page.evaluate(() => { const c = [...document.querySelectorAll('#dex-grid .cell')].find(x => /^004/.test(x.querySelector('.no').textContent)); return c && (c.querySelector('.prest-b') || {}).textContent; });
    check(badge === '★', 'Charmander\'s tile in the collection has its ★', badge);

    console.log('2. In a run');
    const run = async lvl => {
      await page.evaluate(lvl => { const s = G.DB.save; s.prest = { 4: lvl }; s.pupg = { 4: {} }; G.DB.commit();
        if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lvl);
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
      return page.evaluate(() => { const p = G.Game.player; return { hp: p.maxHp, atk: p.atkMul, spd: p.spdMul, def: p.dmgReduce, item: p.item || null }; });
    };
    const r0 = await run(0), r2 = await run(2), r3 = await run(3);
    const k = { hp: +(r2.hp / r0.hp).toFixed(2), atk: +(r2.atk / r0.atk).toFixed(3), spd: +(r2.spd / r0.spd).toFixed(3), def: +(r2.def - r0.def).toFixed(3) };
    check(k.hp === 1.1 && k.atk === 1.1 && k.spd === 1.1 && k.def === 0.1 && !r2.item, 'prestige 2: +10% HP, damage, speed and damage cut, no item', k);
    check(!r0.item && r3.item && !!(await page.evaluate(id => G.Items.BY[id], r3.item)), 'prestige 3: starts holding a random item', r3.item);
    await page.evaluate(() => { G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Flow.goMenu(); });
    await maxAll(4);
    await open();
    await page.waitForTimeout(150);
    const p4 = await panel();
    check(p4 && p4.stars === '★★★' && !p4.btn, 'prestige 3 is the most: ★★★ and no button', p4);

    console.log('3. Merging two copies');
    const mg = await page.evaluate(() => {
      const full = Object.fromEntries(G.Upgrades.LIST.map(u => [u.id, u.max]));
      const base = () => JSON.parse(JSON.stringify(G.DB.save));
      const older = Object.assign(base(), { prest: {}, pupg: { 4: full, 1: { hp: 2 } }, updated: 1 });
      const newer = Object.assign(base(), { prest: { 4: 1 }, pupg: { 4: { hp: 1 }, 1: { hp: 1 } }, updated: 2 });
      const r = G.DB.merge(older, newer), r2 = G.DB.merge(newer, older);
      return { p: r.prest[4], hp4: r.pupg[4].hp, atk4: r.pupg[4].atk || 0, other: r.pupg[1].hp, same: JSON.stringify(r.pupg[4]) === JSON.stringify(r2.pupg[4]) && r2.prest[4] === 1 };
    });
    check(mg.p === 1 && mg.hp4 === 1 && mg.atk4 === 0 && mg.other === 2 && mg.same,
      'prestige kept, Charmander\'s upgrades from the prestiged copy (not maxed again), other Pokémon merged as before, either order', mg);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll prestige checks passed');
  process.exit(failures ? 1 : 0);
})();
