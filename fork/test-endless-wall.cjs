#!/usr/bin/env node
// The endless has a wall (js/fork/lab/endgame.js, late-hand.js, relics.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (or any server on the repo root)
//   node fork/test-endless-wall.cjs [base-url] [--at 40,50,55,60,65,70,80] [--rep 2] [--json out.json]
//
// A top build in a World 2 run at each time T: can it still thin the horde?
//   - THE BUILD: the 103-minute run the owner sent (2026-10-27, Mewtwo): Esper Wing, Psystrike ★, Focus Blast,
//     Future Sight and Rock Blast (Stored Power, Psystrike, Aura Sphere, Psybeam and Ancient Power, evolved, at
//     their top level), fused as far as bonds go; every upgrade card at its cap; a relic every 5 min (damage
//     first; the game's own hand, so its cap); and the EV cards it would have by T: one a level from 10:00
//     (Eternatus beaten), at the levels LEVELS gives for the rules this page runs (old: XP × √ of the horde's whole
//     HP factor; new: without its exponential term), picked at random like "Auto-pick EV cards".
//     The levels come from a model of that run's XP (21 kills/s, level 3,768 at 103:33 under the old rules).
//   - THE RUN: World 2 for real (Eternatus beaten at 10:00, the portal walked into; Necrozma marked beaten, so no
//     raid stops the spawns); then the clock jumps to T − 60 s and the horde gathers for a minute; then 2 minutes
//     count: kills a minute, and the damage that reaches the player (every hit is refunded: nothing ends the run).
//     A script plays: it kites (away from the enemies near it, turned so it goes round them), keeps its biggest
//     bond firing and takes the best card. Each T runs REP times (--rep) and the numbers are averaged.
// THE WALL here is where the horde outgrows the build: the first T whose kills a minute fall under WALL_K of
// the first T's. Passes (new rules) when it's between LOW and HIGH minutes (the owner's aim: a top run ends
// around 60), the damage multiplier stays under the anti-cheat's 2,000 and the run's levels under its
// 20 + seconds/3 (js/game.js clean()), so a long legit run still reaches the leaderboard.
// What it can't tell: when a person dies. A script doesn't dodge: under the old rules (a worktree at an older
// commit) it took ~45 million damage a minute at 103:33, where the owner's player took 5.9 million in the whole
// run. The horde stays at its cap (~65) whether you kill it or not, so a player who stops killing faces the same
// numbers, growing with the horde's damage (×1.16 every 2 min); with Titan's Heart and Phoenix Ash capped at 3
// (relics.js) a top build has a few hundred HP instead of tens of thousands, so shots and touches one-shot it
// from about 45 min and area attacks from about 70.
// Frames: requestAnimationFrame and performance.now are taken over once the run starts, and frames of 1/30 s
// (the game's own step under 30 fps: G.Game.debugSpeed(2)) play back to back as fast as the CPU goes.
const { chromium, pastStart } = require('./pw.cjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : require('./pw.cjs').BASE;
const AT = arg('--at', '40,50,55,60,65,70,80').split(',').map(Number), JSON_OUT = arg('--json', null), REP = +arg('--rep', 2);
const WALL_K = 0.25, LOW = 50, HIGH = 70, WARM = 60, COUNT = 120;
// Levels at each 10 minutes of that run (the model): old rules and new rules.
const LEVELS = {
  old: [1, 112, 230, 333, 564, 841, 1186, 1607, 2110, 2721, 3465, 4370, 5473],
  new: [1, 112, 230, 333, 526, 699, 868, 1032, 1189, 1340, 1488, 1634, 1777]
};
const levelAt = (rules, m) => { const a = LEVELS[rules], i = Math.min(a.length - 2, Math.floor(m / 10)); return Math.round(a[i] + (a[i + 1] - a[i]) * (m / 10 - i)); };

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const errs = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 900, height: 560 }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
    await page.addInitScript(() => {
      try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ }
      // Nothing is drawn (the canvas calls do nothing; the game's logic is the same).
      const C = CanvasRenderingContext2D.prototype, none = function () {};
      for (const k of ['drawImage', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData']) C[k] = none;
      // Our own frames once the run starts: __drive.run(n) plays n frames back to back.
      const raf = window.requestAnimationFrame.bind(window), now = performance.now.bind(performance);
      let q = [], id = 0, vt = now(), fast = false;
      window.requestAnimationFrame = cb => { q.push([++id, cb]); return id; };
      window.cancelAnimationFrame = i => { q = q.filter(e => e[0] !== i); };
      performance.now = () => vt;
      const step = () => { vt += 1000 / 60; const cur = q; q = []; for (const [, cb] of cur) { try { cb(vt); } catch (e) { console.error(e); } } };
      (function pump() { if (fast) return; vt = Math.max(vt, now()); step(); raf(pump); })();
      window.__drive = { start() { fast = true; }, run(n) { for (let k = 0; k < n; k++) step(); }, until(f, n) { for (let k = 0; k < n && !f(); k++) step(); return !!f(); } };
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Worlds && G.LabEndgame, null, { timeout: 30000 });
    const rules = await page.evaluate(() => typeof G.LabEndgame.xp === 'function' ? 'new' : 'old');

    // ---------------- the player script (installed once) ----------------
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[150] = { at: Date.now() }; s.partner = s.starter = 150; G.DB.commit();
      G.Settings.set('underdogLadder', false); G.Settings.set('worlds', true); G.Settings.set('labEvAuto', true);
      const L = window.__wall = { taken: 0, counting: false };
      const P = G.Player.prototype, hurt = P.hurt, BIG = 1e13;
      P.hurt = function () {
        if (this !== G.Game.player) return hurt.apply(this, arguments);
        const hp0 = this.hp;
        this.hp = hp0 + BIG;
        const r = hurt.apply(this, arguments);
        const lost = Math.max(0, hp0 + BIG - this.hp);
        this.hp = hp0;                         // every hit refunded: only counted (no knockout and its invulnerability)
        if (L.counting) L.taken += lost;
        return r;
      };
      const RELIC = ['might', 'haste', 'keen', 'titan', 'ward', 'swift', 'training', 'bloom', 'fortune', 'phoenix'];
      const STAT = { atk: 45, cd: 40, hp: 30, def: 28, spd: 20 };
      const score = c => c.type === 'evo' ? 100 : c.type === 'relic' ? 90 - RELIC.indexOf(c.relic) : c.type === 'up' ? 60
        : c.type === 'new' ? 55 : c.type === 'stat' ? (c.late ? 2 : STAT[(c.key || '').slice(5)] || 10) : 1;
      window.__best = list => list.slice().sort((a, b) => score(b) - score(a))[0];
      const show = G.RunUI.showLevelUp;
      G.RunUI.showLevelUp = function (level, list, cb) {
        if (!Array.isArray(list) || !list.length || typeof cb !== 'function' || list.some(c => c.type === 'ev')) return show.apply(this, arguments);
        cb(__best(list));
      };
      const item = G.RunUI.showItemChoice;
      G.RunUI.showItemChoice = function (cur, next, cb) { if (typeof cb === 'function') return cb(cur); return item.apply(this, arguments); };
      const bond = G.RunUI.showBond;
      G.RunUI.showBond = function () { const r = bond.apply(this, arguments); for (let i = 0; i < 3 && G.UI.isOpen('scr-bond'); i++) G.RunUI.pickBond(0); return r; };

      let away = 0, ax = 0, ay = 0, lastX = 0, lastY = 0, stuckT = 0, slotT = 0;
      const axis = G.Input.axis;
      G.Input.axis = function () {
        const pl = G.Game.player;
        if (!pl || !G.Game.st || G.Game.state === 'ui') return axis.apply(this, arguments);
        const portal = G.Worlds.portal;
        if (portal && G.Worlds.world === 1) return G.U.norm(portal.x - pl.x, portal.y - pl.y);
        if (away > 0) return [ax, ay];
        let fx = 0, fy = 0, n = 0;
        for (const e of G.EnemyMgr.all()) {
          if (e.dead) continue;
          const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy);
          if (d < 220 && d > 1) { const w = (220 - d) / 220; fx += dx / d * w * w; fy += dy / d * w * w; n++; }
        }
        if (n && Math.hypot(fx, fy) > 0.1) { const a = Math.atan2(fy, fx) + 1.1; return [Math.cos(a), Math.sin(a)]; }
        const t = G.Game.st.time;
        return [Math.cos(t / 7), Math.sin(t / 7)];
      };
      const bestSlot = pl => { let bi = pl.active, bv = -1; pl.slots.forEach((g, i) => { const v = g.reduce((a, m) => a + (m.kind === 'buff' ? 0 : 1), 0); if (v > bv) { bv = v; bi = i; } }); return bi; };
      (function tick() {
        requestAnimationFrame(tick);
        const pl = G.Game.player;
        if (!pl || !G.Game.st || G.Game.state === 'ui' || G.Game.state === 'over') return;
        for (const R of [G.Eternatus, G.Necrozma]) {
          if (!R || !R.active || !R.raid) continue;
          for (const e of G.EnemyMgr.all()) if (!e.dead && (e.obelisk || e.name === 'Prism' || e.name === 'Obelisk')) e.hurt(1e12);
          const b = G.EnemyMgr.get(R.raid.bossId);
          if (b && !b.dead) { b.hp = 1; b.hurt(1e12); }
        }
        if (Math.hypot(pl.x - lastX, pl.y - lastY) < 0.3) stuckT += 1 / 30; else stuckT = 0;
        lastX = pl.x; lastY = pl.y;
        if (away > 0) away -= 1 / 30;
        else if (stuckT > 0.5) { const a = Math.random() * Math.PI * 2; ax = Math.cos(a); ay = Math.sin(a); away = 1.2; stuckT = 0; }
        if ((slotT -= 1 / 30) <= 0) { slotT = 2; const b = bestSlot(pl); if (b !== pl.active) pl.setActive(b); }
      })();
      // The build at T (EV cards: n of them).
      window.__build = (T, evCards) => {
        const pl = G.Game.player;
        pl.maxMoves = 5;
        pl.moves.length = 0; pl.slots.length = 0; pl.active = 0;   // not the starting move: that run's five
        for (const id of ['stored-power', 'psystrike', 'aura-sphere', 'psybeam', 'ancient-power']) pl.addMove(id);
        for (const m of pl.moves) { while (G.Moves.levelUp(m)) { /* to the top */ } G.Moves.evolve(m); }
        const loose = pl.slots.filter(g => g.length === 1).map(g => g[0]);
        pl.bonds = 9;
        if (loose.length > 1) pl.fuse(loose.slice(0, G.Player.BOND_MAX || 3));
        pl.bonds = 0;
        for (const s of G.LevelUp.STATS) for (let i = 0; i < (s.max || 0); i++) { s.apply(pl); pl.statsTaken[s.id] = (pl.statsTaken[s.id] || 0) + 1; }
        for (let i = 0; i < Math.floor(T / 300); i++) { const h = G.LabRelics.hand(pl, 'any'); if (h.length) __best(h).apply(pl); }
        for (let i = 0; i < evCards; i++) {
          const keys = G.LabLateHand.evKeys(pl);
          if (!keys.length) break;
          G.LabLateHand.evCard(keys[Math.floor(Math.random() * keys.length)]).apply(pl);
        }
        pl.level = Math.max(pl.level, Math.round(evCards + 112));
        pl.hp = pl.maxHp;
        return { moves: pl.moves.map(m => m.name + ' ' + m.lvl + (m.evolved ? '★' : '')), slots: pl.slots.map(g => g.length), atk: +pl.atkMul.toPrecision(4), cd: +pl.cdMul.toFixed(3),
          hp: Math.round(pl.maxHp), def: +pl.dmgReduce.toFixed(2), ev: Object.assign({}, pl._labEV), relics: G.LabRelics.of(pl) };
      };
    });

    console.log(`Rules on this page: ${rules}. A top build in World 2 at each T (${REP} runs each, ${COUNT / 60} min counted).`);
    console.log('   T  level  EVs        atk     cd   maxHP  def  alive  kills/min  damage taken/min');
    const rows = [];
    for (const T of AT) for (let rep = 0; rep < REP; rep++) {
      const ev = Math.max(0, levelAt(rules, T) - levelAt(rules, 10));
      const r = await page.evaluate(async ([T, ev, WARM, COUNT]) => {
        const D = window.__drive, L = window.__wall;
        if (G.Game.state !== 'ui' && G.Game.player) { G.Game.quit(); D.until(() => G.UI.isOpen('scr-over'), 600); document.getElementById('btn-again').click(); D.until(() => G.Game.state === 'ui', 600); }
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 150, shiny: false });
        D.start();
        if (!D.until(() => G.Game.state === 'playing' && G.Game.player, 3000)) return { err: 'no run' };
        G.Game.debugSpeed(2);
        const pl = G.Game.player;
        // World 2: Eternatus at 10:00, beaten; the portal walked into.
        G.Game.debugTime(598);
        if (!D.until(() => G.Eternatus.active, 1200)) return { err: 'no Eternatus' };
        if (!D.until(() => !G.Eternatus.active && G.Worlds.portal, 3000)) return { err: 'Eternatus not beaten' };
        if (!D.until(() => G.Worlds.world === 2, 6000)) return { err: 'no World 2', w: G.Worlds.world, p: G.Worlds.portal };
        pl._labNecrozma = 1;                       // no raid in the way of the spawns
        const build = __build(T * 60, ev);
        G.Game.debugTime(T * 60 - WARM);
        G.EnemyMgr.clear();
        D.run(WARM * 30);                          // speed 2: 30 frames a second
        L.counting = true; L.taken = 0;
        const k0 = pl.kills;
        D.run(COUNT * 30);
        L.counting = false;
        return { build, t: G.Game.st.time, level: pl.level, alive: G.EnemyMgr.all().filter(e => !e.dead).length, kills: (pl.kills - k0) / (COUNT / 60),
          taken: L.taken / (COUNT / 60), world: G.Worlds.world, state: G.Game.state };
      }, [T, ev, WARM, COUNT]);
      if (r.err) throw new Error('T ' + T + ': ' + JSON.stringify(r));
      rows.push(Object.assign({ T, ev }, r));
      const b = r.build;
      console.log(String(T).padStart(4), String(r.level).padStart(6), String(ev).padStart(5), String(b.atk).padStart(11), String(b.cd).padStart(6), String(b.hp).padStart(7),
        String(b.def).padStart(5), String(r.alive).padStart(6), String(Math.round(r.kills)).padStart(10), String(Math.round(r.taken)).padStart(17));
    }
    console.log('build at the last T:', JSON.stringify(rows[rows.length - 1].build));
    if (JSON_OUT) require('fs').writeFileSync(JSON_OUT, JSON.stringify({ rules, rows }, null, 1));

    const avg = T => { const rs = rows.filter(r => r.T === T); return { T, kills: rs.reduce((a, r) => a + r.kills, 0) / rs.length, taken: rs.reduce((a, r) => a + r.taken, 0) / rs.length, atk: Math.max(...rs.map(r => r.build.atk)) }; };
    const means = AT.map(avg), first = means[0];
    console.log('averages:', means.map(m => `${m.T}: ${Math.round(m.kills)} kills/min, ${Math.round(m.taken)} taken/min`).join(' · '));
    const wall = means.find(m => m.kills < first.kills * WALL_K);
    console.log(`the wall (kills a minute under ${WALL_K * 100}% of ${first.T}:00's ${Math.round(first.kills)}): ${wall ? wall.T + ' min' : 'not by ' + AT[AT.length - 1] + ' min'}`);
    if (rules === 'new') {
      check(!!wall && wall.T >= LOW && wall.T <= HIGH, `the horde outgrows a top build between ${LOW} and ${HIGH} min`, wall ? wall.T : null);
      check(means.every(m => m.atk < 2000), 'its damage multiplier stays under the anti-cheat limit of 2,000', means.map(m => m.atk));
      const over = AT.find(T => levelAt(rules, T) > 20 + T * 60 / 3);
      check(!over, 'the levels of the run stay under the anti-cheat line, 20 + seconds/3', over && { T: over, level: levelAt(rules, over) });
    } else console.log('(old rules: no pass/fail, this is the comparison)');
    check(rows.every(r => r.world === 2 && r.state !== 'over'), 'every snapshot ran in World 2 and kept going');
    check(!errs.length, 'no page errors', errs.slice(0, 5));
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
