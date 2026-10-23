#!/usr/bin/env node
// Spending Lab candies on stats (js/fork/lab/growth.js points / spend / reset, js/fork/lab/candy-ui.js),
// in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-candy.cjs [base-url] [screenshot.png]
//
//   1. Upgrades with Lab on: the candy panel for the partner's line; with 20 candies, +1 Attack costs 1,
//      the next 2, +1 HP 1 (16 left, 3/10 points); Reset gives all 20 back. Lab off: no panel.
//   2. 10 points at most: then every button is off, however many candies are left.
//   3. Charizard shows Charmander's points (one line).
//   4. In a Lab run: Attack ×1.03 a point to physical moves only, Sp. Atk to special ones, HP +3 %,
//      Defense +2 % damage cut, Speed +2 %; nothing without points.
//   5. The collection (js/fork/lab/candy-name.js): next to the name, the candies its line has left to
//      spend (Charmander and Charizard the same, after spending some), 0 with Lab on and none earned,
//      nothing with Lab off and none earned, and still there with Lab off if it has some.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
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
    await page.waitForFunction(() => G.DB.save && G.LabCandyUI, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; for (const d of [4, 6, 1]) s.owned[d] = { at: Date.now(), from: 'test' };
      s.partner = 4; s.starter = 4; s.lab = { candy: { 4: 20 } }; G.Settings.set('lab', true); G.DB.commit(); G.Flow.goMenu();
    });
    const openUpg = () => page.evaluate(() => document.querySelector('#scr-menu [data-go="upgrades"]').click());
    const panel = () => page.evaluate(() => {
      const b = document.getElementById('candy-panel');
      return b && { sum: b.querySelector('.cand-sum').textContent, btns: [...b.querySelectorAll('[data-k]')].map(x => [x.dataset.k, x.disabled, x.textContent.trim().split(' (')[0]]),
        reset: b.querySelector('[data-reset]').disabled, title: b.querySelector('b').textContent };
    });

    console.log('1. The panel');
    await openUpg();
    await page.waitForSelector('#candy-panel', { timeout: 5000 });
    const p0 = await panel();
    check(p0 && p0.sum === '20 left · 0/10 points' && p0.btns.every(b => !b[1]) && p0.reset && /Charmander/.test(p0.title), 'Charmander\'s line, 20 candies, every +1 on, Reset off', p0);
    await page.click('#candy-panel [data-k="atk"]');
    await page.click('#candy-panel [data-k="atk"]');
    await page.click('#candy-panel [data-k="hp"]');
    const p1 = await panel();
    check(p1.sum === '16 left · 3/10 points' && p1.btns.find(b => b[0] === 'atk')[2] === '+1 · 3 🍬', 'Attack 1 then 2, HP 1: 16 left, 3/10 points, the next Attack costs 3', p1);
    if (SHOT) await page.locator('#scr-upgrades').screenshot({ path: SHOT });
    await page.click('#candy-panel [data-reset]');
    const p2 = await panel();
    check(p2.sum === '20 left · 0/10 points' && p2.reset, 'Reset gives all 20 back', p2);

    console.log('2. 10 points at most');
    await page.evaluate(() => { G.DB.save.lab.candy[4] = 200; });
    for (let i = 0; i < 12; i++) await page.evaluate(() => { const b = document.querySelector('#candy-panel [data-k]:not([disabled])'); if (b) b.click(); });
    const p3 = await panel();
    check(/10\/10 points/.test(p3.sum) && p3.btns.every(b => b[1]), '10 points: every +1 off, candies left over', p3);

    console.log('3. One line');
    await page.selectOption('#upg-mon', '6');
    await page.waitForTimeout(100);
    const p4 = await panel();
    check(/Charizard/.test(p4.title) && /10\/10 points/.test(p4.sum), 'Charizard shows the same points as Charmander', p4);
    await page.selectOption('#upg-mon', '1');
    await page.waitForTimeout(100);
    check(/0\/10 points/.test((await panel()).sum), 'Bulbasaur (another line): its own, none');
    await page.evaluate(() => { G.Settings.set('lab', false); G.UI.show('scr-upgrades', true); });
    await page.waitForTimeout(100);
    check(!(await panel()), 'Lab off: no candy panel');

    console.log('4. In a Lab run');
    const run = async pts => {
      await page.evaluate(pts => {
        const s = G.DB.save; s.lab.cpts = { [G.LabGrowth.lineKey(4)]: pts }; G.Settings.set('lab', true); G.DB.commit();
        if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
        G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false });
      }, pts);
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 15000 });
      return page.evaluate(() => {
        const pl = G.Game.player;
        return { phys: pl.atkFor(G.Moves.instance('tackle')), spec: pl.atkFor(G.Moves.instance('ember')), hp: pl.maxHp, def: pl.dmgReduce, spd: pl.spdMul };
      });
    };
    const none = await run({});
    const some = await run({ atk: 3, satk: 1, hp: 2, def: 1, spd: 2 });
    const r = { phys: +(some.phys / none.phys).toFixed(3), spec: +(some.spec / none.spec).toFixed(3), hp: +(some.hp / none.hp).toFixed(3), def: +(some.def - none.def).toFixed(3), spd: +(some.spd / none.spd).toFixed(3) };
    check(r.phys === 1.09 && r.spec === 1.03 && r.hp >= 1.05 && r.hp <= 1.07 && r.def === 0.02 && r.spd === 1.04,
      'Attack 3 / Sp. Atk 1 / HP 2 / Defense 1 / Speed 2: physical ×1.09, special ×1.03, HP +6 %, damage cut +2 %, speed ×1.04', r);

    console.log('5. Candies by the name in the collection');
    // dex's page in the collection: the candy count by its name, or null.
    const chip = dex => page.evaluate(async dex => {
      G.MenuUI.openDex();
      await new Promise(r => setTimeout(r, 50));
      const cell = [...document.querySelectorAll('#dex-grid .cell')].find(c => (c.querySelector('.no') || {}).textContent.startsWith(String(dex).padStart(3, '0')));
      cell.click();
      await new Promise(r => setTimeout(r, 50));
      const h = document.querySelector('#dex-detail h3'), c = h && h.querySelector('.cand-name');
      return c ? { text: c.textContent.trim(), title: c.title, name: h.firstChild.textContent.trim() } : null;
    }, dex);
    await page.evaluate(() => { const s = G.DB.save; G.LabGrowth.reset(4); s.lab.candy = { 4: 20 }; G.LabGrowth.spend(4, 'atk'); G.LabGrowth.spend(4, 'atk'); G.Settings.set('lab', true); });
    const c4 = await chip(4), c6 = await chip(6), c1 = await chip(1);
    check(c4 && c4.text === '🍬 17' && c4.name === 'Charmander' && /17 candy left/.test(c4.title), 'Charmander: "🍬 17" by its name (20 earned, 3 spent), with a tooltip', c4);
    check(c6 && c6.text === '🍬 17', 'Charizard, same line: the same 17', c6);
    check(c1 && c1.text === '🍬 0', 'Bulbasaur with Lab on and none earned: 🍬 0', c1);
    await page.evaluate(() => G.Settings.set('lab', false));
    const off1 = await chip(1), off4 = await chip(4);
    check(off1 === null && off4 && off4.text === '🍬 17', 'Lab off: nothing for Bulbasaur (none), Charmander still shows its 17', { off1, off4 });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll candy checks passed');
  process.exit(failures ? 1 : 0);
})();
