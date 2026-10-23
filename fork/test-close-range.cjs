#!/usr/bin/env node
// Close range and mobility (fork/PLAN-2026-10-22.md, section A; fork/LAB.md "Close range and
// mobility"), checked in the game in headless Edge on dev.html: real runs, real casts through
// Combat.tick, on dummies that don't move.
//
//   node fork/serve.cjs                 (in another terminal)
//   node fork/test-close-range.cjs [base-url]
//
// Every run (js/fork/close-target.js):
//  A1.6 melee and spin aim at the nearest enemy in reach: a boss 250 px away no longer freezes them
//       (upstream #186, #208); a boss in reach is still hit first.
//  A1.7 a dash never fires at a rock or a chest (it dragged you across the map).
// Lab runs (js/fork/lab/mobility.js, js/fork/lab/kinds.js, js/fork/lab/kinds2.js):
//  A1.1 with a spin, dash or recoil move active you take 25% less (not in a normal run yet)
//  A1.2 for 0.5 s after a dash, leap, recoil or roll nothing hurts you, not even a hazard
//  A1.3 a leap keeps you untouchable 0.6 s after landing, and the landing blast hits
//  A1.4 recoil costs at most 8% of max HP a second; a KO gives half that cast's recoil back
//  A1.5 ramp stacks fade one per 1.5 s instead of resetting
//  A2   policy (a): a dash, recoil or roll goes the way you walk (else at the target), only when an
//       enemy is on that line, and leaves you where you were, with no camera kick
//  A3   pivots switch to the next slot, Flame Charge stacks speed, Parting Shot weakens; Fly/Bounce
//       come down where they took off, Dig/Dive 70 px in front of the enemy, Phantom Force behind
//       you; Counter blocks and stores (the Aegis); the 11 upstream melee moves get a trait each
//       (reach, heavy, leech, flinch, parry) and none swings 360°; normal runs keep upstream's moves
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (!ok && info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab && G.LabKinds2, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    G.DB.save.owned[448] = { at: Date.now() };
    G.DB.save.partner = 448; G.Settings.set('underdogLadder', false); G.MenuUI.open();
  });

  // A run with a quiet arena and the helpers (dummies, one move, waiting).
  async function startRun(lab, dex = 448) {
    if (await page.evaluate(() => G.Game.state !== 'ui')) {
      await page.evaluate(() => G.Game.quit());
      await page.waitForSelector('#btn-again', { state: 'visible', timeout: 15000 });
      await page.click('#btn-again');
      await page.waitForFunction(() => G.Game.state === 'ui' && !G.Game.player, null, { timeout: 15000 });
    }
    await page.evaluate(([lab, dex]) => { G.DB.save.owned[dex] = G.DB.save.owned[dex] || { at: Date.now() }; G.DB.save.partner = dex; G.Settings.set('lab', lab); G.MenuUI.open(); G.Game.startRun(); }, [lab, dex]);
    await page.waitForFunction(lab => G.Game.state === 'playing' && G.Game.player && G.Lab.active === lab, lab, { timeout: 30000 });
    await page.evaluate(() => {
      for (const k of ['Spawner', 'Events', 'Rift']) G[k].update = () => {};
      G.Weather.clear(); G.Weather.update = () => {};
      G.LevelUp.offer = () => [];
      G.Input.axis = () => [0, 0];
      const pl = G.Game.player;
      pl.xpMul = 0; pl.critChance = 0; pl.labAbility = null; pl.abil = null;
      pl.mon = Object.assign({}, pl.mon, { types: ['none'] });
      // Waits count GAME time (G.Game.st.time): on a loaded machine the game runs slower than the
      // clock, and a real-time wait saw fewer casts than it expected (at most 10x the time, really).
      const gt = () => G.Game.st.time;
      window.__until = (f, ms = 3000) => new Promise(r => { const g0 = gt(), t0 = performance.now(); (function s() { if (f()) return r(true); if ((gt() - g0) * 1000 > ms || performance.now() - t0 > ms * 10) return r(false); setTimeout(s, 16); })(); });
      window.__wait = ms => __until(() => false, ms);
      window.__dummy = (x, y, o = {}) => {
        const def = { dex: 19, name: 'Dummy', hp: o.hp || 1e6, spd: 0, dmg: 10, xp: 0, behavior: 'chase' };
        const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
        e.types = ['none']; e.touchCd = 99; e.spd = 0; if (o.boss) e.boss = true;
        G.EnemyMgr.add(e);
        return e;
      };
      // An open spot (no walls or props within 260 px) so nothing blocks a dash or a landing.
      window.__open = () => {
        const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= 260; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, pl.r, true)) return false; return G.World.propsInCircle(x, y, 260).length === 0; };
        if (ok(pl.x, pl.y)) return;
        for (let r = 64; r < 6000; r += 64) for (let a = 0; a < 6.283; a += 0.5) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (ok(x, y)) { pl.x = x; pl.y = y; return; } }
      };
      window.__only = (...ids) => {
        pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; pl.active = 0; pl.invuln = 0; pl.dead = false; pl.graceT = 0;
        for (const b of Object.values(pl.buffs)) b.n = 0;
        delete pl._labLeap; delete pl._labFocus; pl._labHurtAt = 0; pl._leech = 0; pl._relocT = 0; pl._relocAt = -1e9; pl._labRecoil = null;
        G.EnemyMgr.clear(); G.Combat.clearFields(); G.Hazards.clear(); __open();
        for (const id of ids) pl.addMove(id);
        pl.active = 0;
        return pl.moves;
      };
      window.__at = (r, a = 0) => [pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r];
      // How much of a 40-point hit gets through.
      window.__take = () => { pl.invuln = 0; pl._relocT = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical'); return pl.maxHp - pl.hp; };
    });
  }

  // ================= every run =================
  await startRun(false);
  console.log('Normal run: targeting (A1.6, A1.7)');
  const tgt = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    // A1.6: a boss 250 px away and an enemy in reach (not touching you): the melee hits the enemy.
    for (const id of ['karate-chop', 'rapid-spin']) {
      __only(id);
      __dummy(...__at(250, Math.PI), { boss: true });
      const e = __dummy(...__at(66, Math.PI / 2));
      await __until(() => e.hp < e.maxHp, 2000);
      out[id] = e.hp < e.maxHp;
    }
    // A boss in reach still comes first.
    __only('karate-chop');
    const b = __dummy(...__at(60, 0), { boss: true }), o = __dummy(...__at(60, Math.PI));
    await __until(() => b.hp < b.maxHp || o.hp < o.maxHp, 2000);
    out.bossFirst = b.hp < b.maxHp && o.hp === o.maxHp;
    // A1.7: no enemies, a rock or chest within 200 px: a dash doesn't fire at it.
    const [m] = __only('quick-attack');
    let spot = null;
    for (let r = 0; r < 4000 && !spot; r += 48) for (let a = 0; a < 6.283 && !spot; a += 0.3) {
      const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r;
      const p = G.World.nearestBreakable(x, y, 140);
      if (p && G.U.dist(x, y, p.x, p.y) > 70 && G.World.isFree(x, y, pl.r, true)) spot = [x, y, p];
    }
    out.rock = !!spot;
    if (spot) {
      pl.x = spot[0]; pl.y = spot[1]; m.castAt = 0; m.t = 0;
      const x0 = pl.x, y0 = pl.y;
      await __wait(1500);
      out.dashCast = !!m.castAt;
      out.dashMoved = Math.round(G.U.dist(x0, y0, pl.x, pl.y));
      out.prop = spot[2].hp != null ? spot[2].hp : null;
    }
    // ...but it still fires at an enemy.
    const [qa] = __only('quick-attack');
    const e2 = __dummy(...__at(100)), p0 = [Math.round(pl.x), Math.round(pl.y)];
    await __until(() => e2.hp < e2.maxHp, 2000);
    out.dashEnemy = e2.hp < e2.maxHp;
    out.dashInfo = { p0, p: [Math.round(pl.x), Math.round(pl.y)], e: [Math.round(e2.x), Math.round(e2.y)], cast: qa.castAt, t: qa.t, tgt: pl.target === e2 ? 'dummy' : pl.target ? (pl.target.hurt ? 'enemy' : 'prop') : null, props: G.World.propsInCircle(pl.x, pl.y, 260).length, dead: pl.dead, hp: Math.round(e2.hp) };
    // A normal run has no close-range cut for dash and spin yet.
    __only('ember'); const far = __take();
    __only('quick-attack'); out.cutDash = +(__take() / far).toFixed(2);
    __only('rapid-spin'); out.cutSpin = +(__take() / far).toFixed(2);
    return out;
  });
  check(tgt['karate-chop'], 'A1.6: Karate Chop hits an enemy in reach while a boss waits 250 px away (#186, #208)');
  check(tgt['rapid-spin'], 'A1.6: so does Rapid Spin (spin)');
  check(tgt.bossFirst, 'A1.6: a boss in reach is still hit first');
  check(tgt.rock, 'found a rock or chest to test against');
  check(tgt.dashCast === false && tgt.dashMoved < 5, `A1.7: Quick Attack doesn't fire at a rock or chest (cast ${tgt.dashCast}, moved ${tgt.dashMoved} px)`);
  check(tgt.dashEnemy, 'A1.7: and still fires at an enemy', tgt.dashInfo);
  check(tgt.cutDash === 1 && tgt.cutSpin === 1, `normal run: dash and spin take full damage (×${tgt.cutDash}, ×${tgt.cutSpin})`);

  // ================= Lab runs =================
  await startRun(true);
  console.log('Lab run: close-range cut (A1.1)');
  const cut = await page.evaluate(() => {
    __only('ember'); const far = __take(), k = {};
    for (const id of ['quick-attack', 'rapid-spin', 'double-edge', 'karate-chop', 'fury-cutter']) { __only(id); k[id] = +(__take() / far).toFixed(2); }
    const [kc] = __only('karate-chop');
    k.tip = G.MoveText.tipNotes(kc, G.Game.player).map(n => n[0]).filter(t => /25 %|35%/.test(t));
    return k;
  });
  const tip = cut.tip; delete cut.tip;
  check(tip.length === 1 && /35% less/.test(tip[0]), "A4: the move's box says 35% in Lab", tip);
  check(Object.values(cut).every(v => v === 0.65), 'A1.1, A4: in Lab, with a dash, spin, recoil, melee or ramp move active you take 35% less', cut);

  console.log('Lab run: relocation grace (A1.2)');
  const grace = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    for (const id of ['quick-attack', 'double-edge', 'dig']) {
      const [m] = __only(id);
      pl.hp = pl.maxHp;
      const e = __dummy(...__at(110));
      m.castAt = 0;
      await __until(() => m.castAt, 3000);
      if (pl._labLeap) await __until(() => !pl._labLeap, 2000);
      // A hazard (it sets invuln to 0 before it hits) and lava, right after you moved.
      pl.invuln = 0;
      G.Hazards.add({ kind: 'zone', x: pl.x, y: pl.y, r: 50, delay: 0.05, dmg: 30, color: '#ff0000' });
      const h0 = pl.hp;
      await __wait(150);
      out[id] = Math.round(h0 - pl.hp);
    }
    // After the grace (and no mover in the slot), the hazard hurts.
    const [m] = __only('quick-attack');
    const e = __dummy(...__at(110));
    m.castAt = 0;
    await __until(() => m.castAt, 3000);
    pl.slots.length = 0; pl.moves.length = 0; pl.addMove('ember'); pl.active = 0;
    await __wait(700);
    pl.invuln = 0; pl.hp = pl.maxHp;
    G.Hazards.add({ kind: 'zone', x: pl.x, y: pl.y, r: 50, delay: 0.05, dmg: 30, color: '#ff0000' });
    await __wait(150);
    out.after = Math.round(pl.maxHp - pl.hp);
    return out;
  });
  check(['quick-attack', 'double-edge', 'dig'].every(id => grace[id] === 0), 'A1.2: a hazard right after a dash, a recoil charge or a leap that lands by the enemy does nothing', grace);
  check(grace.after > 0, `A1.2: 0.7 s later it hurts again (${grace.after})`);

  console.log('Lab run: leap (A1.3)');
  const leap = await page.evaluate(async () => {
    const pl = G.Game.player;
    const out = {};
    for (const id of ['dig', 'fly']) {
      __only(id);
      const e = __dummy(...__at(150));
      await __until(() => pl._labLeap, 3000);
      await __until(() => !pl._labLeap, 3000);
      out[id] = { inv: +pl.invuln.toFixed(2), hit: e.hp < e.maxHp };
    }
    return out;
  });
  check(leap.dig.inv >= 0.45, `A1.3: after Dig comes up by the enemy you stay untouchable ~0.6 s (${leap.dig.inv} s left)`);
  check(leap.dig.hit && leap.fly.hit, 'A1.3: the landing blast hits the enemy');
  check(leap.fly.inv <= 0.2, `A4: Fly comes down where it took off, away from the crowd: no long grace after it (${leap.fly.inv} s), or it was never hit at all`);

  console.log('Lab run: recoil (A1.4)');
  const rec = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    // Into a crowd of sturdy dummies, 3 s: at most 3% of max HP a second.
    const [m] = __only('double-edge');
    m.cd = 0.3;
    for (let i = 0; i < 8; i++) __dummy(...__at(30 + i * 12, (i % 2 ? 0.1 : -0.1)));
    pl.hp = pl.maxHp;
    const g = G.Game.st.time;
    await __wait(3000);
    const secs = G.Game.st.time - g;
    out.lostPerSec = +((pl.maxHp - pl.hp) / pl.maxHp / secs).toFixed(3);
    // A KO: half of that cast's recoil comes back.
    const [m2] = __only('double-edge');
    m2.recoil = 1;
    const weak = __dummy(...__at(60), { hp: 40 });
    weak.hp = 40;
    pl.hp = pl.maxHp; m2.dealt = 0;
    await __until(() => weak.dead, 3000);
    await __wait(50);
    out.ko = weak.dead;
    out.dealt = Math.round(m2.dealt);
    out.lost = +(pl.maxHp - pl.hp).toFixed(2);
    out.cap = +(pl.maxHp * 0.03).toFixed(2);
    return out;
  });
  check(rec.lostPerSec > 0 && rec.lostPerSec <= 0.032, `A1.4, A4: recoil costs at most 3% of max HP a second (${(rec.lostPerSec * 100).toFixed(1)}%/s)`);
  check(rec.ko && rec.lost > 0 && rec.lost <= rec.cap / 2 + 0.01, `A1.4: a KO gives half the recoil back (lost ${rec.lost}, at most half of ${rec.cap})`, rec);

  console.log('Lab run: ramp and roll (A1.5)');
  const ramp = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    const [m] = __only('fury-cutter');
    const e = __dummy(...__at(40));
    await __until(() => (m._ramp || 0) >= 4, 4000);
    out.built = m._ramp;
    G.EnemyMgr.clear();
    await __wait(1700);                                   // one step of decay (1.5 s), not a reset
    const e2 = __dummy(...__at(40));
    const d0 = m.dealt || 0;
    await __until(() => (m.dealt || 0) > d0, 2000);
    out.after = m._ramp;
    return out;
  });
  check(ramp.built >= 4 && ramp.after >= ramp.built - 1, `A1.5: after a 1.7 s gap Fury Cutter keeps its stacks but one (${ramp.built} → ${ramp.after} after the next hit)`);

  // ================= Phase 2: the way you walk, and back (A2, policy (a)) =================
  console.log('Lab run: movers go the way you walk and leave you where you were (A2)');
  const pa = await page.evaluate(async () => {
    const pl = G.Game.player, C = G.Combat, out = {};
    // Every mover's run, recorded: where you were before and after, which way it went, camera kicks.
    const rec = [], kick = G.Camera.kick;
    let kicks = 0;
    const spy = (o, k) => {
      const f = o[k];
      o[k] = function (p, m, ghost) {
        const x0 = p.x, y0 = p.y, a = p.aim, k0 = kicks, r = f.apply(this, arguments);
        if (!ghost && r !== false) rec.push({ id: m.id, moved: Math.round(G.U.dist(x0, y0, p.x, p.y)), a: +a.toFixed(2), kicks: kicks - k0 });
        return r;
      };
      return () => { o[k] = f; };
    };
    const undo = [spy(C.EXTRA.dash, 'over'), spy(C.EXTRA.recoil, 'run'), spy(C.EXTRA.ramp, 'run')];
    G.Camera.kick = function () { kicks++; return kick.apply(this, arguments); };
    try {
      // Standing still: towards the aim (the target); the enemy is hit and you don't move.
      for (const id of ['quick-attack', 'double-edge', 'rollout']) {
        __only(id);
        const e = __dummy(...__at(id === 'rollout' ? 45 : 90));
        rec.length = 0;
        await __until(() => rec.length && e.hp < e.maxHp, 3000);
        out[id] = { hit: e.hp < e.maxHp, moved: rec[0] && rec[0].moved, kicks: rec[0] && rec[0].kicks };
      }
      // Walking north with the enemy east: nothing on that line, so it waits; walking at it, it fires.
      __only('quick-attack');
      const e = __dummy(...__at(90));
      G.Input.axis = () => [0, -1];
      rec.length = 0;
      await __wait(900);
      out.sideways = { casts: rec.length, hit: e.hp < e.maxHp };
      __only('quick-attack');
      const n = __dummy(...__at(90, -Math.PI / 2));
      rec.length = 0;
      await __until(() => rec.length, 2000);
      out.along = { hit: n.hp < n.maxHp, a: rec[0] && rec[0].a, moved: rec[0] && rec[0].moved };
    } finally { undo.forEach(f => f()); G.Camera.kick = kick; G.Input.axis = () => [0, 0]; }
    return out;
  });
  for (const id of ['quick-attack', 'double-edge', 'rollout']) {
    const r = pa[id];
    check(r.hit && r.moved === 0 && r.kicks === 0, `A2: ${id} standing still hits the target and leaves you where you were, no camera kick`, r);
  }
  check(pa.sideways.casts === 0 && !pa.sideways.hit, 'A2: walking past an enemy that isn\'t on your way: the dash waits', pa.sideways);
  check(pa.along.hit && Math.abs(pa.along.a + 1.57) < 0.05 && pa.along.moved === 0, 'A2: walking at it: the dash goes the way you walk and hits it, and you stay', pa.along);

  // ================= Phase 2: identity (A3) =================
  console.log('Lab run: pivots, Flame Charge, leaps, Aegis (A3)');
  const a3 = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    // Pivots: hit, then the next slot is the active one.
    for (const id of ['u-turn', 'volt-switch', 'flip-turn', 'parting-shot']) {
      const [m] = __only(id, 'ember');
      pl.active = 0;
      const e = __dummy(...__at(80));
      await __until(() => e.hp < e.maxHp, 3000);
      await __wait(30);
      out[id] = { hit: e.hp < e.maxHp, active: pl.active, meek: !!e._meek };
    }
    // Flame Charge: a speed stack per cast.
    __only('flame-charge');
    __dummy(...__at(80));
    await __until(() => pl.buffs.spd.n > 0, 3000);
    out.rush = pl.buffs.spd.n;
    // Leaps: where you come down.
    for (const id of ['fly', 'bounce', 'dig', 'dive', 'phantom-force']) {
      __only(id);
      const x0 = pl.x, y0 = pl.y, e = __dummy(...__at(180));
      await __until(() => pl._labLeap, 3000);
      await __until(() => !pl._labLeap, 3000);
      await __wait(30);
      out[id] = { hit: e.hp < e.maxHp, fromStart: Math.round(G.U.dist(x0, y0, pl.x, pl.y)), toEnemy: Math.round(G.U.dist(pl.x, pl.y, e.x, e.y)) };
    }
    // Counter (the Aegis): physical hits blocked, special ones halved, the blast returns what it blocked.
    const [cm] = __only('ember', 'counter');
    pl.active = 0;
    const d = __dummy(...__at(60));
    await __until(() => pl._labGuard, 6000);
    pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical');
    out.blocked = Math.round(pl.maxHp - pl.hp);
    pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'special');
    out.special = Math.round(pl.maxHp - pl.hp);
    const stored = pl._labGuard ? pl._labGuard.stored : 0;
    await __until(() => !pl._labGuard, 3000);
    out.stored = stored;
    return out;
  });
  for (const id of ['u-turn', 'volt-switch', 'flip-turn', 'parting-shot']) check(a3[id].hit && a3[id].active === 1, `A3: ${id} hits, then switches you to the next slot`, a3[id]);
  check(a3['parting-shot'].meek, 'A3: Parting Shot leaves the enemies it hit dealing less');
  check(a3.rush >= 1, `A3: Flame Charge stacks a speed boost (${a3.rush})`);
  for (const id of ['fly', 'bounce']) check(a3[id].hit && a3[id].fromStart < 4, `A3: ${id} strikes the enemy and you come down where you were`, a3[id]);
  for (const id of ['dig', 'dive']) check(a3[id].hit && a3[id].toEnemy >= 55 && a3[id].toEnemy <= 85, `A3: ${id} comes up about 70 px in front of the enemy and hits it`, a3[id]);
  check(a3['phantom-force'].hit && a3['phantom-force'].fromStart >= 45 && a3['phantom-force'].toEnemy > 200, 'A3: Phantom Force strikes the enemy and you come back behind where you were', a3['phantom-force']);
  check(a3.blocked === 0 && a3.special > 0 && a3.stored >= 40, `A3: Counter blocks a physical hit (${a3.blocked}), halves a special one (${a3.special}) and stores what it blocked (${a3.stored})`);

  console.log('Lab run: melee traits (A3)');
  const mt = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    const top = id => { const m = G.Moves.instance(id, 1); while (G.Moves.levelUp(m)) {} G.Moves.evolve(m); return m; };
    const ids = ['tackle', 'vine-whip', 'wing-attack', 'body-slam', 'bug-bite', 'karate-chop', 'lick', 'metal-claw', 'bite', 'dragon-claw', 'play-rough'];
    out.traits = Object.fromEntries(ids.map(id => [id, G.Moves.instance(id, 1).labTrait || null]));
    out.arcs = Object.fromEntries(ids.map(id => [id, +top(id).arc.toFixed(2)]));
    const vw = G.Moves.instance('vine-whip', 1), vd = G.Moves.BY_ID['vine-whip'];
    out.reach = { r: Math.round(vw.radius), r0: vd.radius, arc: +vw.arc.toFixed(2), arc0: vd.arc };
    // Body Slam: the first hit stuns.
    __only('body-slam');
    const b = __dummy(...__at(40));
    await __until(() => b.hp < b.maxHp, 3000);
    out.flinch = b.stunT > 0;
    // Bug Bite: heals.
    __only('bug-bite');
    pl.hp = pl.maxHp * 0.5;
    __dummy(...__at(40));
    await __wait(1500);
    out.leech = Math.round(pl.hp - pl.maxHp * 0.5);
    // Karate Chop: right after a swing the first hit is parried, the next one isn't.
    const [kc] = __only('karate-chop');
    const k = __dummy(...__at(40));
    kc.castAt = 0;
    await __until(() => kc.castAt, 3000);
    pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical');
    out.parry = Math.round(pl.maxHp - pl.hp);
    pl.invuln = 0; pl.hurt(40, null, false, 'physical');
    out.second = Math.round(pl.maxHp - pl.hp);
    return out;
  });
  check(Object.values(mt.traits).every(Boolean), 'A3: the 11 upstream melee moves each get a trait in Lab', mt.traits);
  check(Object.values(mt.arcs).every(a => a < 6.28), 'A3: none of them swings all around at its top level (no name says so)', mt.arcs);
  check(mt.reach.r >= 100 && mt.reach.arc < mt.reach.arc0, `A3: Vine Whip reaches far (${mt.reach.r} px, was ${mt.reach.r0}) in a narrow arc (${mt.reach.arc}, was ${mt.reach.arc0})`);
  check(mt.flinch, 'A3: Body Slam\'s first hit makes the enemy flinch (stunned)');
  check(mt.leech > 0, `A3: Bug Bite heals you (+${mt.leech})`);
  check(mt.parry === 0 && mt.second > 0, `A3: Karate Chop parries the first hit after a swing (${mt.parry}), not the second (${mt.second})`);

  // ================= normal runs don't change =================
  await startRun(false);
  console.log('Normal run: nothing of the above (A2, A3 are Lab only)');
  const nr = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    __only('quick-attack');
    const x0 = pl.x, e = __dummy(...__at(90));
    await __until(() => e.hp < e.maxHp, 3000);
    out.dashMoved = Math.round(G.U.dist(x0, pl.y, pl.x, pl.y));
    const kc = G.Moves.instance('karate-chop', 1);
    while (G.Moves.levelUp(kc)) {}
    G.Moves.evolve(kc);
    out.kcArc = kc.arc; out.kcTrait = kc.labTrait || null;
    return out;
  });
  check(nr.dashMoved > 40, `normal run: Quick Attack still carries you (${nr.dashMoved} px)`);
  check(nr.kcArc >= 6.28 && !nr.kcTrait, `normal run: Karate Chop is upstream's (360° at the top, no trait)`, nr);

  // The move a Lab run starts with is made before the run is Lab: it still gets its identity.
  await startRun(true, 66);
  const first = await page.evaluate(() => G.Game.player.moves.map(m => ({ id: m.id, trait: m.labTrait || null, lab: !!G.LabMech.ID[m.id] })));
  check(first.some(m => m.lab) && first.every(m => !m.lab || m.trait), "a Lab run's starting move gets its Lab trait too (Machop)", first);

  check(!errors.length, 'no page errors', errors.slice(0, 3));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
