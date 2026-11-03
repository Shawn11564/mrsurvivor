#!/usr/bin/env node
// Shield moves (Protect, Detect, Spiky Shield, King's Shield, Baneful Bunker, Counter...; js/fork/lab/kinds.js
// C.tick) can't be kept up all the time (TODO 121, a player's "Nerf protect"): a shield's cooldown starts
// when it drops, Reflexes and cooldown stats don't shorten it, and only one shield is up at a time.
// Headless Edge on dev.html, fake clock, the real game loop:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-shields.cjs [base-url]
//
//   1. A fully upgraded Protect (2.46 s up, 1.64 s cooldown) with cooldown stats at x0.7: up about 60 % of the
//      time (2.46 / 4.10), never ~100 % as before.
//   2. A plain Protect with cooldown stats at x0.5: each gap between two shields is its full 3.2 s cooldown.
//   3. Protect and Detect together: never a shield cast while another is up, and at most ~75 % up.
const { chromium, pastStart, BASE: DEF } = require('./pw.cjs');
const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || DEF;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
    await page.clock.install();
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.locator('#btn-guest').click();
    await page.waitForFunction(() => G.DB.save);
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: 1 }; s.partner = s.starter = 4; G.DB.commit();
      G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
    });

    // A run with only the given moves (the first is the active slot), an enemy standing next to you that
    // can't hurt you (so a shield always has something to block), then `secs` of game watched every frame.
    async function measure(moves, setup, secs) {
      await page.evaluate(() => {
        if (G.Game.state !== 'ui') { G.UI.hideAll(); G.Game.quit(); }
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      });
      await page.clock.runFor(500);
      await page.waitForFunction(() => G.Game.state === 'playing');
      await page.evaluate(([moves, setup]) => {
        const pl = G.Game.player;
        pl.god = true; pl.xpMul = 0;
        G.Spawner.update = () => {}; G.EnemyMgr.clear();
        pl.moves.length = 0; pl.slots.length = 0;
        for (const id of moves) pl.addMove(id);
        pl.active = 0;
        const ms = pl.slots.flat();
        new Function('pl', 'ms', setup)(pl, ms);
        const e = new G.Enemy({ dex: 19, name: 'Rattata', hp: 1e12, spd: 0, dmg: 0, xp: 0, behavior: 'charger' }, pl.x + 30, pl.y, { hp: 1, spd: 1, dmg: 1 });
        e._noScale = true; e.stunT = 1e9; G.EnemyMgr.add(e);
        const w = window.__w = { up: 0, all: 0, gaps: [], overlap: 0, casts: 0, last: null, downAt: null, t: 0, cds: ms.map(m => [m.id, m.cd]) };
        const tick = () => {
          if (window.__w !== w) return;
          requestAnimationFrame(tick);
          if (G.Game.state !== 'playing') return;
          const dt = 1 / 60;
          w.t += dt; w.all++;
          const g = pl._labGuard;
          if (g) w.up++;
          if (g && g !== w.last) {
            w.casts++;
            if (w.last && w.last.t > 0.05 && pl._labGuard === g && w.lastSeen === w.all - 1) w.overlap++;
            if (w.downAt != null) w.gaps.push(+(w.t - w.downAt).toFixed(2));
            w.downAt = null;
          }
          if (!g && w.last && w.downAt == null) w.downAt = w.t;
          if (g) w.lastSeen = w.all;
          w.last = g || null;
        };
        requestAnimationFrame(tick);
      }, [moves, setup]);
      await page.clock.runFor(secs * 1000);
      return page.evaluate(() => {
        const w = window.__w, pl = G.Game.player;
        window.__w = null;
        return { up: +(w.up / w.all).toFixed(3), casts: w.casts, overlap: w.overlap, gaps: w.gaps.slice(1),
                 cds: pl.slots.flat().map(m => [m.id, m.kind, +(m.cd || 0).toFixed(2)]) };
      });
    }

    console.log('1. A fully upgraded Protect, cooldown stats x0.7');
    const a = await measure(['ember', 'protect'], `const m = ms.find(x => x.id === 'protect'); m.dur = 2.457; m.cd = 1.638; pl.cdMul = 0.7;`, 60);
    check(a.up > 0.5 && a.up < 0.65, 'up about 60 % of the time (2.46 s up, then its full 1.64 s)', a);

    console.log('2. A plain Protect, cooldown stats x0.5');
    const b = await measure(['ember', 'protect'], `pl.cdMul = 0.5;`, 40);
    const minGap = Math.min(...b.gaps);
    check(b.gaps.length >= 5 && minGap >= 3.1, 'every gap between two shields is its whole 3.2 s cooldown', { minGap, gaps: b.gaps.slice(0, 6), up: b.up });

    console.log('3. Protect and Detect together, fully upgraded, cooldown stats x0.7');
    const c = await measure(['ember', 'protect', 'detect'],
      `for (const m of ms) if (m.kind === 'guard') { m.dur = 2.457; m.cd = 1.638; } pl.cdMul = 0.7;`, 60);
    check(c.overlap === 0, 'never a shield raised while another is up', c);
    check(c.up < 0.8, 'two shields are up at most ~75 % of the time', c.up);

    check(!errors.length, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
