#!/usr/bin/env node
// Gems (js/fork/lab/gems.js; gm in CUR of js/core/db.js; the gem cost and merge epoch in
// js/fork/prestige.js), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-gems.cjs [base-url]
//
//   1. Lab run: a boss gives 1, a legendary 2, a normal enemy 1 when the 0.7% roll hits (forced) and
//      none when it misses; a normal run gives none.
//   2. Upgrades (Lab on): resetting a Pokémon's upgrades costs 100 gems (with a confirm) and gives
//      back exactly the coins they cost.
//   3. Prestige with Lab on costs 100 gems too: off without them, and it takes them.
//   4. Merging: the copy that reset keeps its upgrades over an older one with them maxed; two devices
//      that each found gems add up (the ledger).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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
    await page.waitForFunction(() => G.DB.save && G.Gems, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.gems = 0; s.pupg = {}; s.prest = {}; G.DB.commit(); G.Flow.goMenu(); });
    const run = lab => page.evaluate(lab => { G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; }));

    console.log('1. Drops');
    await run(true);
    const d = await page.evaluate(() => {
      const s = G.DB.save, g = () => s.gems | 0, def = G.Enemies.cast[0].list[0], pl = G.Game.player;
      const mk = boss => { const e = new G.Enemy(def, pl.x + 300, pl.y, G.Enemies.scale(0), boss); return e; };
      const out = {}, r = Math.random;
      s.gems = 0; G.Progress.kill(mk(true)); out.boss = g();
      s.gems = 0; const L = mk(true); L.legend = 150; G.Progress.kill(L); out.legend = g();
      s.gems = 0; Math.random = () => 0.001; G.Progress.kill(mk(false)); out.hit = g();
      Math.random = r;
      return out;
    }).catch(e => ({ err: String(e) }));
    check(d.boss === 1 && d.legend === 2 && d.hit === 1, 'Lab: a boss 1, a legendary 2, a lucky enemy 1', d);
    const miss = await page.evaluate(() => {
      const s = G.DB.save, r = Math.random, def = G.Enemies.cast[0].list[0], pl = G.Game.player;
      s.gems = 0; Math.random = () => 0.5; G.Progress.kill(new G.Enemy(def, pl.x + 300, pl.y, G.Enemies.scale(0))); Math.random = r;
      return s.gems | 0;
    });
    check(miss === 0, 'an enemy when the roll misses: none', miss);
    await run(false);
    const off = await page.evaluate(() => {
      const s = G.DB.save, def = G.Enemies.cast[0].list[0], pl = G.Game.player;
      s.gems = 0; G.Progress.kill(new G.Enemy(def, pl.x + 300, pl.y, G.Enemies.scale(0), true)); return s.gems | 0;
    });
    check(off === 0, 'a normal run: no gems', off);
    await page.evaluate(() => { G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Settings.set('lab', true); G.Flow.goMenu(); });

    console.log('2. Resetting upgrades');
    await page.evaluate(() => { const s = G.DB.save; s.gems = 150; s.coins = 0; s.pupg = { 4: { hp: 3, atk: 2 } }; G.DB.commit(); document.querySelector('#scr-menu [data-go="upgrades"]').click(); });
    await page.waitForSelector('#gems-panel [data-reset]', { timeout: 5000 });
    const want = await page.evaluate(() => G.Gems.spent(4)), c0 = await page.evaluate(() => G.DB.save.coins);
    await page.click('#gems-panel [data-reset]');
    const conf = await page.textContent('#gems-panel [data-reset]');
    await page.click('#gems-panel [data-reset]');
    await page.waitForTimeout(150);
    const rs = await page.evaluate(() => ({ gems: G.DB.save.gems, coins: G.DB.save.coins, upg: Object.values(G.DB.upgradesOf(4) || {}).reduce((a, b) => a + b, 0), ureset: G.DB.save.ureset[4] }));
    check(/^Confirm: 100 gems/.test(conf) && rs.gems === 50 && rs.coins - c0 === want && rs.upg === 0 && rs.ureset === 1, `100 gems: upgrades back to 0 and their ${want} coins back`, { conf, ...rs });

    console.log('3. Prestige costs gems with Lab on');
    const pr = await page.evaluate(() => {
      const s = G.DB.save; s.pupg = { 4: Object.fromEntries(G.Upgrades.LIST.map(u => [u.id, u.max])) }; s.gems = 50;
      const poor = G.Prestige.can(4);
      s.gems = 120; const rich = G.Prestige.can(4); G.Prestige.prestige(4);
      return { poor, rich, gems: s.gems, lvl: G.Prestige.level(4) };
    });
    check(!pr.poor && pr.rich && pr.gems === 20 && pr.lvl === 1, 'with 50 gems it can\'t; with 120 it can, and takes 100', pr);

    console.log('4. Merging');
    const mg = await page.evaluate(() => {
      const full = Object.fromEntries(G.Upgrades.LIST.map(u => [u.id, u.max]));
      const base = () => JSON.parse(JSON.stringify(G.DB.save));
      const older = Object.assign(base(), { prest: {}, ureset: {}, pupg: { 1: full }, updated: 1 });
      const newer = Object.assign(base(), { prest: {}, ureset: { 1: 1 }, pupg: { 1: { hp: 1 } }, updated: 2 });
      const r = G.DB.merge(older, newer), r2 = G.DB.merge(newer, older);
      const ga = Object.assign(base(), { gems: 3, led: { dA: { gm: [3, 0] } }, updated: 1 }), gb = Object.assign(base(), { gems: 5, led: { dB: { gm: [5, 0] } }, updated: 2 });
      return { hp: r.pupg[1].hp, atk: r.pupg[1].atk || 0, same: JSON.stringify(r.pupg[1]) === JSON.stringify(r2.pupg[1]), gems: G.DB.merge(ga, gb).gems };
    });
    check(mg.hp === 1 && mg.atk === 0 && mg.same, 'the copy that reset keeps its upgrades over the older maxed one, either order', mg);
    check(mg.gems === 8, 'gems found on two devices add up (3 + 5)', mg.gems);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll gem checks passed');
  process.exit(failures ? 1 : 0);
})();
