#!/usr/bin/env node
// The horde keeps getting stronger in Lab's late game (js/fork/lab/endgame.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-endgame.cjs [base-url]
//
//   1. The same enemy joining a Lab run and a normal run: at 15:00 the same numbers; at 25:00, 30:00, 45:00 and
//      60:00 the Lab one has HP × hp(t), damage × dmg(t), speed × spd(t) and XP × √hp(t) (× the XP pace both
//      runs don't share), elites × 1.6 more HP (a Swift affix × 1.4 speed). The curve's own values: ×2 HP at 30:00, ×13.7 at 45:00.
//   2. A normal run at 45:00: nothing changes.
//   3. Bosses, wild legendaries, Eternatus's obelisks, thieves and split copies keep their numbers.
//   4. Real spawns: no extra elites or affixes before 30:00; at 55:00 some of each.
//   5. The HUD: "THREAT ×1.5" next to the clock at 25:00 and "THREAT ×14" at 45:00; nothing at 15:00 or in a
//      normal run.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.LabEndgame, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      window.__run = async (lab, t, spawn = false) => {
        if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('underdogLadder', false);
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        G.Game.debugTime(t);
        await __wait(() => G.Game.state === 'playing');
        const pl = G.Game.player; pl.god = true;
        (function noLevels() { if (G.Game.player !== pl) return; pl.xp = 0; requestAnimationFrame(noLevels); })();
        if (!spawn) { window.__spawn = window.__spawn || G.Spawner.update; G.Spawner.update = () => {}; }
        else if (window.__spawn) G.Spawner.update = window.__spawn;
        G.EnemyMgr.clear();
      };
      // An enemy of the run's cast with the spawner's numbers at t, added to the fight; its numbers after.
      window.__one = (opt = {}) => {
        const pl = G.Game.player, t = G.Game.st.time, def = opt.def || (window.__def = window.__def || G.Enemies.cast[2].list[0]);
        const e = new G.Enemy(def, pl.x + 400, pl.y, G.Enemies.scale(t), !!opt.boss);
        Object.assign(e, opt.flags || {});
        G.EnemyMgr.add(e);
        const r = { hp: e.maxHp, dmg: e.dmg, spd: e.spd, xp: e.xp, elite: !!e._elite, endgame: !!e._endgame, affix: e.affix || null };
        G.EnemyMgr.clear();
        return r;
      };
    });

    console.log('1-2. The same enemy, Lab and normal');
    for (const t of [900, 1500, 1800, 2700, 3600]) {
      const r = await page.evaluate(async t => {
        await __run(false, t); const a = __one();
        await __run(true, t);
        const b = []; for (let i = 0; i < 12; i++) b.push(__one());
        const E = G.LabEndgame;
        return { t, a, b, hp: E.hp(t), dmg: E.dmg(t), spd: E.spd(t), pace: G.LabXpPace.factor(t) };
      }, t);
      const ok = r.b.every(x => {
        const ek = x.elite ? 1.6 : 1;
        const near = (v, w) => Math.abs(v - w) <= Math.max(1.5, w * 0.01);
        return near(x.hp, r.a.hp * r.hp * ek) && near(x.dmg, r.a.dmg * r.dmg * (x.elite ? 1.25 : 1)) && near(x.spd, r.a.spd * r.spd * (x.affix === 'swift' ? 1.4 : 1))
          && Math.abs(x.xp - r.a.xp * r.pace * Math.sqrt(r.hp) * ek) <= Math.max(2, x.xp * 0.02);
      });
      check(ok, `Lab at ${t / 60}:00: HP ×${r.hp.toFixed(2)}, damage ×${r.dmg.toFixed(2)}, speed ×${r.spd.toFixed(2)}, XP ×√HP`, { normal: r.a, lab: r.b.slice(0, 3) });
      if (t === 900) check(r.hp === 1 && r.dmg === 1 && r.spd === 1, 'at 15:00 the curve is still ×1');
    }
    const curve = await page.evaluate(() => { const E = G.LabEndgame; return [E.hp(1800), E.hp(2700), E.hp(3600), E.dmg(2700), E.spd(2700), E.spd(3600)].map(v => +v.toFixed(2)); });
    check(curve[0] === 2 && Math.abs(curve[1] - 13.74) < 0.05 && curve[2] > 75 && Math.abs(curve[3] - 4.29) < 0.05 && curve[4] === 1.4 && curve[5] === 1.6,
      'the curve: HP ×2 at 30:00, ×13.7 at 45:00, ×77 at 60:00; damage ×4.3 at 45:00; speed ×1.4 at 45:00, at most ×1.6', curve);
    const normal = await page.evaluate(async () => { await __run(false, 2700); const a = __one(), b = __one(); return { a, b }; });
    check(normal.a.hp === normal.b.hp && !normal.a.elite, 'a normal run at 45:00: no change', normal);

    console.log('3. What keeps its own numbers');
    const own = await page.evaluate(async () => {
      await __run(true, 2700);
      const out = {};
      const pairs = { obelisk: { obelisk: true }, thief: null, split: { _split: 1 }, noScale: { _noScale: true } };
      const base = (def, flags) => { G.Settings.set('lab', false); const a = __one({ def, flags }); G.Settings.set('lab', true); const b = __one({ def, flags }); return a.hp === b.hp && a.dmg === b.dmg; };
      for (const k in pairs) {
        const def = k === 'thief' ? { dex: 52, name: 'Meowth', behavior: 'thief', hp: 400, spd: 92, dmg: 0, xp: 10 } : window.__def;
        out[k] = base(def, pairs[k]);
      }
      // Bosses and legendaries: the endgame curve leaves them alone (boss-power.js has their own).
      const b = __one({ def: G.Enemies.BOSSES[4], boss: true }), w = G.WildLegends.spawn();
      out.boss = !b.endgame;
      out.wild = !!w && !w._endgame;
      out.regular = __one().endgame;
      return out;
    });
    check(Object.values(own).every(Boolean), 'obelisks, thieves, split copies, _noScale enemies, bosses and wild legendaries are left alone', own);

    console.log('4. Elites and affixes from real spawns');
    const spawns = await page.evaluate(async () => {
      const count = async t => {
        await __run(true, t, true);
        const seen = new Map(), t0 = Date.now();
        while (Date.now() - t0 < 6000) {
          for (const e of G.EnemyMgr.all()) if (!e.boss && !seen.has(e.id)) seen.set(e.id, { elite: !!e._elite, affix: e.affix || null });
          for (const e of G.EnemyMgr.all()) if (!e.boss) e.hurt(1e15);       // room for more
          await new Promise(r => setTimeout(r, 120));
        }
        const v = [...seen.values()];
        return { n: v.length, elites: v.filter(x => x.elite).length, affixes: v.filter(x => x.affix).length };
      };
      return { early: await count(1500), late: await count(3300) };
    });
    check(spawns.early.n > 20 && spawns.early.elites === 0, 'at 25:00 no extra elites (the spawner\'s cap rule only)', spawns.early);
    check(spawns.late.n > 20 && spawns.late.elites > 0 && spawns.late.affixes > 0, 'at 55:00 some extra elites and affixes', spawns.late);

    console.log('5. The HUD');
    const hud = await page.evaluate(async () => {
      const seen = async (lab, t) => {
        await __run(lab, t);
        const texts = [], raw = G.I18n.rawCanvas;
        G.I18n.rawCanvas = function (ctx, fn, txt) { texts.push(String(txt)); return raw.apply(this, arguments); };
        await new Promise(r => setTimeout(r, 300));
        G.I18n.rawCanvas = raw;
        return texts.find(x => /^THREAT/.test(x)) || null;
      };
      return { t15: await seen(true, 900), t25: await seen(true, 1500), t45: await seen(true, 2700), normal: await seen(false, 2700) };
    });
    check(!hud.t15 && hud.t25 === 'THREAT ×1.5' && hud.t45 === 'THREAT ×14' && !hud.normal, 'THREAT next to the clock from 20:00 in Lab only', hud);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll endgame checks passed');
  process.exit(failures ? 1 : 0);
})();
