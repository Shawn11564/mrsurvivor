#!/usr/bin/env node
// XP per kill keeps pace with the run in Lab (js/fork/lab/xp-pace.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-xp-pace.cjs [base-url]
//
//   1. Enemies the real spawner sends in a Lab run carry their XP × (1 + max(0, t − 500)/600):
//      ×1 at 5:00, ×1.67 at 15:00, ×2.67 at 25:00 (the spawner's ×5.6, and ×1.6 for elites, under it). From 20:00
//      js/fork/lab/endgame.js adds ×√(its HP factor) on top: ×2.67 × √1.5 at 25:00.
//   2. A normal run at 25:00: no change.
//   3. Bosses and wild legendaries keep their own XP.
//   4. One kill at 25:00 with Charmander (Underdog +39 %): the orb is worth the paced XP, and picking
//      it up gives that × the player's xpMul (the Underdog bonus multiplies on top).
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
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      window.__run = async (lab, t) => {
        if (G.Game.state === 'playing') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        G.Game.debugTime(t);
        await __wait(() => G.Game.state === 'playing');
        const pl = G.Game.player; pl.god = true;
        (function noLevels() { if (G.Game.player !== pl) return; pl.xp = 0; requestAnimationFrame(noLevels); })();   // no level-up cards freezing the world
      };
      // The regular enemies alive and the factor their XP carries over the spawner's (×5.6, elites ×1.6).
      window.__seen = async (ms = 2500) => {
        const out = new Map(), t0 = Date.now(), cast = new Set(G.Enemies.cast.flatMap(c => c.list));
        while (Date.now() - t0 < ms) {
          for (const e of G.EnemyMgr.all()) {
            if (out.has(e.id) || e.boss || e.legend || e.shiny || e.golden || !cast.has(e.def)) continue;   // the run's cast (no minions)
            const base = Math.round(e.def.xp * 5.6), elite = Math.round(base * 1.6);
            const k = [e.xp / base, e.xp / elite];
            out.set(e.id, { xp: e.xp, base, k: +k[0].toFixed(3), kElite: +k[1].toFixed(3) });
          }
          await new Promise(r => setTimeout(r, 100));
        }
        return { t: G.Game.st.time, list: [...out.values()] };
      };
    });
    const fits = (r, want) => r.list.length >= 4 && r.list.every(x => Math.abs(x.k - want) <= 0.02 * want + 1 / x.base || Math.abs(x.kElite - want) <= 0.02 * want + 1 / x.base);

    console.log('1-2. Real spawns');
    for (const [lab, t, want] of [[true, 300, 1], [true, 900, 1 + 400 / 600], [true, 1500, (1 + 1000 / 600) * Math.sqrt(1.5)], [false, 1500, 1]]) {
      const r = await page.evaluate(async ([lab, t]) => { await __run(lab, t); return __seen(); }, [lab, t]);
      check(fits(r, want), `${lab ? 'Lab' : 'normal'} run at ${Math.round(t / 60)}:00: XP ×${want.toFixed(2)} on every regular enemy (${r.list.length} seen)`, r.list.slice(0, 6));
    }

    console.log('3. Bosses and wild legendaries');
    const bosses = await page.evaluate(async () => {
      await __run(true, 1500);
      const pl = G.Game.player, t = G.Game.st.time;
      const b = G.Enemies.BOSSES[4], e = new G.Enemy(b, pl.x + 300, pl.y, G.Enemies.bossScale(t), true);
      G.EnemyMgr.add(e);
      const w = G.WildLegends.spawn(), ws = G.WildLegends.stats(t, 1);
      return { boss: e.xp, bossWant: b.xp, wild: w && w.xp, wildWant: ws.xp };
    });
    check(bosses.boss === bosses.bossWant && bosses.wild === bosses.wildWant, 'a boss and a wild legendary keep their own XP', bosses);

    console.log('4. A kill, picked up');
    const kill = await page.evaluate(async () => {
      await __run(true, 1500);
      const pl = G.Game.player;
      const cast = new Set(G.Enemies.cast.flatMap(c => c.list)), ok = e => !e.boss && !e.legend && !e.shiny && !e.golden && cast.has(e.def);
      await __wait(() => G.EnemyMgr.all().some(ok), 8000);
      G.Spawner.update = () => {};
      const e = G.EnemyMgr.all().find(ok);
      for (const o of G.EnemyMgr.all()) if (o !== e) o.hurt(1e12);
      await new Promise(r => setTimeout(r, 300));
      G.Pickups.clear();
      const P = G.Player.prototype, gain = P.gainXp;
      let amount = 0, added = 0;
      P.gainXp = function (a) { amount += a; added += a * this.xpMul; return gain.apply(this, arguments); };
      const xp = e.xp, base = Math.round(e.def.xp * 5.6);
      e.hurt(1e12);
      await new Promise(r => setTimeout(r, 200));
      const orbs = G.Pickups.all().filter(o => o.value > 0).map(o => o.value);
      G.Pickups.pullAll();
      await __wait(() => !G.Pickups.all().some(o => o.value > 0), 6000);
      P.gainXp = gain;
      return { xp, base, k: +(xp / base).toFixed(3), orbs, amount, added: +added.toFixed(2), xpMul: +pl.xpMul.toFixed(4), under: pl._labUnder, want: +(xp * pl.xpMul).toFixed(2) };
    });
    check(kill.orbs.length === 1 && kill.orbs[0] === kill.xp && kill.amount === kill.xp && (kill.k >= 2.6 || kill.k / 1.6 >= 2.6),
      'the orb is worth the paced XP (×2.67 at 25:00)', kill);
    check(kill.under > 0.3 && Math.abs(kill.added - kill.want) < 0.01, 'picked up: × the player\'s xpMul, Underdog included', kill);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll XP pace checks passed');
  process.exit(failures ? 1 : 0);
})();
