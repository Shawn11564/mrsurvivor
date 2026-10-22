#!/usr/bin/env node
// Rift legendaries get harder as the run goes on (js/fork/rift-scaling.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-rift-scaling.cjs [base-url]
//
// js/systems/rift.js gives the legendary 3200 + 9/s HP and 36 + t/20 damage: linear, so by minute 15 it
// had a quarter of a regular boss's HP (16 000 × 2.5). Now its HP is also × (1 + t/600), the regular
// bosses' curve, its damage (contact and shots) × (1 + t/1800) and its XP × (1 + t/1200). A real rift
// (G.Rift.debugArena) at 1, 15 and 30 minutes:
//   1. HP, contact damage, shot damage and XP are rift.js's numbers times those factors.
//   2. It grows faster than before: at 30 minutes, ×4 HP and ×2 damage.
//   3. Only the rift's legendary: a regular boss spawned in the same run is untouched.
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
    // A run at t seconds, its rift: the legendary's numbers and what rift.js alone would give.
    const at = t => page.evaluate(async t => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.Settings.set('lab', false); G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      const wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      await wait(() => G.Game.state === 'playing');
      const pl = G.Game.player; pl.god = true; G.Spawner.update = () => {}; G.EnemyMgr.clear();
      G.Game.debugTime(t);
      G.Rift.debugArena();
      await wait(() => G.EnemyMgr.all().some(e => e.legend));
      const e = G.EnemyMgr.all().find(e => e.legend), T = G.Game.st.time;
      const out = { t: T, hp: e.maxHp, dmg: e.dmg, shot: e.shotDmg(), xp: e.xp,
        base: { hp: Math.round(3200 + T * 9), dmg: Math.round(36 + T / 20), shot: Math.round(18 + T / 40), xp: Math.round(500 + T * 1.2) } };
      G.Game.quit();
      await wait(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await wait(() => G.Game.state === 'ui');
      return out;
    }, t);

    console.log('1-2. A rift at 1, 15 and 30 minutes');
    const rows = [];
    for (const t of [60, 900, 1800]) {
      const r = await at(t), kh = 1 + r.t / 600, kd = 1 + r.t / 1800, kx = 1 + r.t / 1200;
      rows.push(r);
      check(Math.abs(r.hp - Math.round(r.base.hp * kh)) <= 2 && Math.abs(r.dmg / r.base.dmg - kd) < 0.01 && Math.abs(r.shot / r.base.shot - kd) < 0.02 && Math.abs(r.xp - Math.round(r.base.xp * kx)) <= 2,
        `minute ${Math.round(r.t / 60)}: HP ${r.hp} (×${kh.toFixed(2)}), damage ${r.dmg.toFixed(0)} and shots ${r.shot.toFixed(0)} (×${kd.toFixed(2)}), XP ${r.xp}`, r);
    }
    const late = rows[2];
    check(late.hp / late.base.hp >= 3.9 && late.dmg / late.base.dmg >= 1.95, 'at 30 minutes: about ×4 HP and ×2 damage on what it had', { hp: late.hp, was: late.base.hp, dmg: late.dmg, wasDmg: late.base.dmg });

    console.log('3. Only the rift legendary');
    const boss = await page.evaluate(async () => {
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      const wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      await wait(() => G.Game.state === 'playing');
      G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.Game.debugTime(900);
      const b = G.Enemies.BOSSES[4], sc = G.Enemies.bossScale(900);
      const e = new G.Enemy(b, G.Game.player.x + 200, G.Game.player.y, sc, true); G.EnemyMgr.add(e);
      return { hp: e.maxHp, want: Math.round(b.hp * sc.hp), dmg: e.dmg, wantDmg: b.dmg * sc.dmg };
    });
    check(boss.hp === boss.want && Math.abs(boss.dmg - boss.wantDmg) < 1e-6, 'a regular boss keeps its own numbers', boss);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll rift scaling checks passed');
  process.exit(failures ? 1 : 0);
})();
