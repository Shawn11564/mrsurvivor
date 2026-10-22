#!/usr/bin/env node
// 3 s without damage after being revived (js/fork/revive-grace.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-revive-grace.cjs [base-url]
//
// Player.revive (what a teammate's revive, the rift, Eternatus and the Revive card all call) gave 2 s
// of invulnerability, but traps, explosions, lava, Arceus's touch and the Eternabeam clear it before
// they hit. A run: knocked out, revived, then an enemy standing on you (contact damage) and a trap's
// hit (invuln cleared, as js/systems/interact.js does), every frame:
//   1. Nothing for 3 s: HP stays where the revive put it, you blink the whole time.
//   2. After 3 s, damage again.
//   3. Knocked out by a hit while not revived: no grace (a normal hit's 0.45 s, as before).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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

    // Every frame for `secs`: the hp, whether it blinks (invuln), after a trap's hit with invuln cleared.
    const run = secs => page.evaluate(async secs => {
      const pl = G.Game.player, out = [], t0 = performance.now();
      G.Spawner.update = () => {};
      const def = G.Enemies.cast[0].list[0];
      const e = new G.Enemy(def, pl.x, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      while (performance.now() - t0 < secs * 1000) {
        await new Promise(r => requestAnimationFrame(r));
        e.x = pl.x; e.y = pl.y;                                  // right on you: contact damage
        const before = pl.hp;
        if (!pl.dead) { pl.invuln = Math.min(pl.invuln, 0); pl.hurt(pl.maxHp * 0.02); }   // a trap (interact.js) clears invuln first
        out.push([Math.round(performance.now() - t0), before, pl.hp, pl.dead]);
        pl.invuln = Math.max(pl.invuln, 0);
      }
      e.hurt(1e9, '#fff', 0, 0, 0, null);
      return out;
    }, secs);

    console.log('1-2. Revived: 3 s without damage, then damage again');
    const hp0 = await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9, null, true); const dead = pl.dead; pl.revive(0.5); return { dead, hp: pl.hp, max: pl.maxHp }; });
    check(hp0.dead && Math.abs(hp0.hp - hp0.max * 0.5) < 1, 'knocked out, then revived with 50% HP', hp0);
    const f = await run(4.5);
    const early = f.filter(x => x[0] < 2900), late = f.filter(x => x[0] > 3300);
    check(early.length > 20 && early.every(x => x[2] === hp0.hp), 'no damage at all in the first 3 s (contact and trap hits every frame)', early.filter(x => x[2] !== hp0.hp).slice(0, 3));
    check(late.some(x => x[2] < x[1] || x[3]), 'after 3 s it hurts again', late.slice(0, 3));

    console.log('3. No grace without a revive');
    await page.evaluate(() => { const pl = G.Game.player; if (pl.dead) pl.revive(1); pl.graceT = 0; pl.hp = pl.maxHp; pl.invuln = 0; });
    await page.waitForTimeout(3500);                          // that revive's grace runs out
    const g = await run(0.6);
    check(g.some(x => x[2] < x[1] || x[3]), 'a plain hit still hurts right away', g.slice(0, 3));
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll revive grace checks passed');
  process.exit(failures ? 1 : 0);
})();
