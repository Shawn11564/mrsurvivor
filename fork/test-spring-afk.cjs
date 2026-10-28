#!/usr/bin/env node
// Healing springs can't be camped (js/systems/interact.js spring), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (or python -m http.server 8123 in the repo root)
//   node fork/test-spring-afk.cjs [base-url]
//
// A real spring from the run's map, the player put on it, and G.Interact.update stepped at 60 fps
// for 5 minutes of game time while a weak horde chips 3 % of max HP a second (the kind of damage
// a player standing still can live with). A dried spring used to start again at 2 % charge, so
// it healed about 3.5 % of max HP a second for ever.
//
//   1. Standing on it: it heals at first, dries up, and heals nothing for the remaining 4 minutes.
//   2. It doesn't refill while you stand close by (just off the pad counts as close).
//   3. Walk away: it refills in about 45 s and heals again when you come back.
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
    const found = await page.evaluate(() => {
      const pl = G.Game.player; pl.regenFlat = 0; G.Spawner.update = () => {}; G.EnemyMgr.clear();
      // The nearest real spring on this run's map.
      for (let r = 1; r < 40; r++) for (let a = 0; a < 16; a++) {
        const x = Math.cos(a / 16 * 6.2832) * r * 1500, y = Math.sin(a / 16 * 6.2832) * r * 1500;
        const s = G.World.specialsNear(x, y, 1500).find(p => p.type === 'spring');
        if (s) { window.__spring = s; return { x: s.x, y: s.y, charge: s.charge }; }
      }
      return null;
    });
    check(!!found, 'a spring on the map', found);
    if (!found) throw new Error('no spring found');

    // `secs` of game time at `dx` px from the spring's pad, taking `chip` of max HP a second.
    // Returns the HP it healed (as a share of max HP) and its charge at the end.
    const stand = (dx, secs, chip = 0.03) => page.evaluate(([dx, secs, chip]) => {
      const pl = G.Game.player, s = window.__spring, dt = 1 / 60;
      let healed = 0, firstSec = 0;
      for (let i = 0; i < secs * 60; i++) {
        pl.x = s.x + dx; pl.y = s.y - 8;
        pl.hp = Math.max(1, pl.hp - pl.maxHp * chip * dt);
        const before = pl.hp;
        G.Interact.update(dt, pl);
        healed += pl.hp - before;
        if (i < 60) firstSec = healed;
      }
      return { healed: +(healed / pl.maxHp).toFixed(3), first: +(firstSec / pl.maxHp).toFixed(3), charge: +s.charge.toFixed(3), dry: !!s.dry };
    }, [dx, secs, chip]);

    console.log('1. Standing on it for 5 minutes');
    await page.evaluate(() => { const pl = G.Game.player; pl.hp = pl.maxHp * 0.5; });
    const first = await stand(0, 60);
    check(first.first > 0.1, 'it heals at first', first);
    const camp = await stand(0, 240);
    check(camp.healed < 0.01, 'dried up, it heals nothing for the next 4 minutes', camp);
    const said = await page.evaluate(() => { const b = G.Spawner.banner(); return b && G.T(b.text); });
    check(said === 'The spring has dried up: leave it and it refills in 45 s', 'it says so, in English', said);

    console.log('2. Waiting just off the pad');
    const beside = await stand(60, 90);
    check(beside.healed === 0 && beside.charge < 0.15, 'no refill while you stand close by', beside);
    const back = await stand(0, 5);
    check(back.healed < 0.01, 'still dry when you step back on', back);

    console.log('3. Walking away');
    const half = await stand(300, 22, 0);
    check(half.dry && Math.abs(half.charge - 0.51) < 0.03, 'half full after 22 s away, and still dry', half);
    const away = await stand(300, 24, 0);
    check(away.charge === 1 && !away.dry, 'refilled after 46 s away', away);
    await page.evaluate(() => { const pl = G.Game.player; pl.hp = pl.maxHp * 0.5; });
    const again = await stand(0, 3);
    check(again.healed > 0.3, 'it heals again when you come back', again);
    // Out of update()'s range (720 px) the spring isn't visited: the time still counts.
    await stand(0, 60);
    const far = await stand(2000, 46, 0);
    await page.evaluate(() => { const pl = G.Game.player; pl.hp = pl.maxHp * 0.5; });
    const farBack = await stand(0, 3);
    check(far.dry && farBack.healed > 0.3, 'refilled after 46 s far away (out of range)', { far, farBack });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll spring checks passed');
  process.exit(failures ? 1 : 0);
})();
