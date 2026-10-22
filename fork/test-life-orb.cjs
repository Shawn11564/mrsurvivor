#!/usr/bin/env node
// Life Orb never takes you below 30 % HP (js/entities/player.js cast), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-life-orb.cjs [base-url]
//
//   1. From full HP, attacking non-stop: each attack costs 1 % of max HP until 30 %, then nothing more.
//   2. Already under 30 % (an enemy hit): attacking costs nothing.
//   3. Still +30 % damage; the item's text says it stops at 30 %.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.Settings.set('lab', false); G.DB.commit(); G.Flow.goMenu(); G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    const atk0 = await page.evaluate(() => { const pl = G.Game.player; pl.god = true; G.Spawner.update = () => {}; G.EnemyMgr.clear(); return pl.atk; });
    // Attack for `secs` with the move's cooldown at 0 (an enemy to aim at): the lowest HP seen.
    const attack = (hp, secs) => page.evaluate(async ([hp, secs]) => {
      const pl = G.Game.player, def = G.Enemies.cast[0].list[0];
      const e = new G.Enemy(def, pl.x + 120, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e9; e.spd = 0; G.EnemyMgr.add(e);
      pl.hp = pl.maxHp * hp; pl.regenFlat = 0;
      let casts = 0, low = pl.hp;
      const cast = pl.cast; pl.cast = function () { casts++; return cast.apply(this, arguments); };
      const t0 = performance.now();
      while (performance.now() - t0 < secs * 1000) {
        for (const m of pl.moves) m.t = 0;
        await new Promise(r => requestAnimationFrame(r));
        low = Math.min(low, pl.hp);
      }
      pl.cast = cast;
      e.hurt(1e12, '#fff', 0, 0, 0, null);
      return { casts, low: +(low / pl.maxHp).toFixed(4), end: +(pl.hp / pl.maxHp).toFixed(4) };
    }, [hp, secs]);

    await page.evaluate(() => G.Game.player.equip('lifeorb'));
    console.log('1. From full HP');
    const full = await attack(1, 4);
    check(full.casts > 80 && full.low === 0.3 && full.end === 0.3, `${full.casts} attacks: down to 30 % and no lower`, full);
    console.log('2. Already under 30 %');
    const low = await attack(0.2, 1.5);
    check(low.casts > 20 && low.low === 0.2 && low.end === 0.2, `${low.casts} attacks at 20 %: no cost`, low);
    console.log('3. Damage and text');
    const r = await page.evaluate(() => ({ k: G.Game.player.atk, desc: G.T(G.Items.LIST.find(i => i.id === 'lifeorb').desc) }));
    check(Math.abs(r.k / atk0 - 1.3) < 1e-9, 'still +30 % damage', +(r.k / atk0).toFixed(3));
    check(/30%/.test(r.desc) && /below 30%|under 30%/i.test(r.desc), 'its text says it stops at 30 %', r.desc);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Life Orb checks passed');
  process.exit(failures ? 1 : 0);
})();
