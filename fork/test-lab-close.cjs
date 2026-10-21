#!/usr/bin/env node
// Lab phase 9 (js/fork/lab/kinds2.js, fork/LAB.md "Phase 9"): close range and sustain, checked in
// the game in headless Edge on dev.html, in a real Lab run on dummies that don't move.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-lab-close.cjs [base-url]
//
//  1. Every phase 9 move is registered with its ladder, and some reach real Lab pools through
//     their learnsets (Lucario: Bulk Up, Drain Punch...); Dragon Dance no longer evolves into Bulk Up.
//  2. grab: the enemy is thrown away and bowls over the one behind it; Seismic Toss grows with level.
//  3. bind: the enemy is held (stunned) and hurt again and again; level 2 holds two.
//  4. focus: Focus Punch lands when you're not hit, is lost when you are; Shell Trap goes off when hit.
//  5. heal: Recover from another slot only below half HP; Rest heals fully and you can't move or
//     attack; Wish arrives later; Morning Sun ×1.5 in sun.
//  6. screen: Reflect cuts physical hits by 40% and not special ones.
//  7. shout: Growl makes nearby enemies deal 30% less (and back after); Screech +40% physical taken.
//  8. hit effects: Drain Punch heals, Leech Seed drains over time, Revenge ×2 after being hit,
//     Reversal grows at low HP, Super Fang halves (bosses a little), Power Trip grows with
//     boosts, Fake Out stuns the first hit only.
//  9. buffs: Bulk Up stacks DEFENSE too; Fillet Away costs HP and maxes its stacks.
// 10. Endure: a hit that would KO leaves you at 1 HP once, then it recharges.
// 11. Close range: with a grab/bind/focus/ramp move active you take 25% less, like melee.
// 12. Metronome never calls the support kinds; a grab evolves at its top level; Iron Fist boosts Drain Punch.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    for (const d of [4, 448]) G.DB.save.owned[d] = { at: Date.now() };
    G.DB.save.partner = 448; G.Settings.set('lab', true); G.MenuUI.open();
  });

  // ---------------- 1. registration and pools ----------------
  console.log('Moves and pools');
  const reg = await page.evaluate(() => {
    const P9 = G.LabMoves.slice(G.LabMoves.findIndex(m => m.id === 'seismic-toss'));
    const bad = P9.filter(d => { const m = G.Moves.BY_ID[d.id]; return !m || !m.ups || !m.ups.length; }).map(d => d.id);
    // Names, in English: no evolution named after a move, none shared by two evolutions.
    // (Older ones share names already: Hex and Shadow Ball → Poltergeist... reported, not failed.)
    const T = n => G.T(n, 'move'), base = new Set(Object.values(G.Moves.BY_ID).map(m => T(m.name))), seen = new Map(), clash = [], old = [];
    const mine = new Set(P9.map(d => d.id));
    for (const id in G.Moves.EVO) {
      const n = T(G.Moves.EVO[id][0]);
      if (base.has(n) || seen.has(n)) (mine.has(id) || mine.has(seen.get(n)) ? clash : old).push(`${id} → ${n}` + (seen.has(n) ? ` (also ${seen.get(n)})` : ''));
      seen.set(n, id);
    }
    return { n: P9.length, bad, ids: P9.map(d => d.id), dd: G.T(G.Moves.EVO['dragon-dance'][0], 'move'), clash, old };
  });
  check(reg.n >= 50 && !reg.bad.length, `all ${reg.n} phase 9 moves are registered with upgrades`, reg.bad);
  check(!reg.clash.length, 'no phase 9 evolution is named after a move or shares its name with another evolution', reg.clash);
  if (reg.old.length) console.log('  info: older shared evolution names: ' + reg.old.join(', '));
  check(reg.dd === 'Clangorous Soul', `Dragon Dance evolves into Clangorous Soul, not Bulk Up (a Lab move now): "${reg.dd}"`);
  await page.evaluate(() => { G.DB.save.partner = 448; G.Game.startRun(); });
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 30000 });
  const pool = await page.evaluate(ids => G.Moves.poolFor(G.Game.player.mon).filter(id => ids.includes(id)), reg.ids);
  check(pool.length >= 3, `Lucario's Lab pool has phase 9 moves from its learnset: ${pool.join(', ')}`);

  // Helpers: a quiet arena, dummies, waiting.
  await page.evaluate(() => {
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards']) G[k].update = () => {};
    G.Weather.clear(); window.__wxUpdate = G.Weather.update; G.Weather.update = () => {};
    G.LevelUp.offer = () => [];
    const pl = G.Game.player;
    pl.xpMul = 0; pl.critChance = 0; pl.labAbility = null;
    pl.mon = Object.assign({}, pl.mon, { types: ['none'] });
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__until = (f, ms = 3000) => new Promise(r => { const t0 = performance.now(); (function s() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(s, 30); })(); });
    window.__dummy = (x, y, o = {}) => {
      const def = { dex: 19, name: 'Dummy', hp: o.hp || 1e6, spd: 0, dmg: o.dmg || 10, xp: 0, behavior: 'chase' };
      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
      e.types = ['none']; e.touchCd = 99; if (o.boss) e.boss = true;
      G.EnemyMgr.add(e);
      return e;
    };
    window.__open = () => {
      const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= 260; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, pl.r, true)) return false; return true; };
      if (ok(pl.x, pl.y)) return;
      for (let r = 64; r < 6000; r += 64) for (let a = 0; a < 6.283; a += 0.5) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (ok(x, y)) { pl.x = x; pl.y = y; return; } }
    };
    window.__only = (...ids) => {
      pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; pl.active = 0; pl.invuln = 0; pl.dead = false;
      for (const b of Object.values(pl.buffs)) b.n = 0;
      delete pl._labFocus; delete pl._labRest; pl._labHurtAt = 0; pl._leech = 0;
      G.EnemyMgr.clear(); G.Combat.clearFields(); __open();
      for (const id of ids) pl.addMove(id);
      pl.active = 0;
      return pl.moves;
    };
    window.__at = (r, a = 0) => [pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r];
  });

  // ---------------- 2. grab ----------------
  console.log('grab');
  const grab = await page.evaluate(async () => {
    const pl = G.Game.player;
    let [m] = __only('circle-throw');
    const a = __dummy(...__at(40)), b = __dummy(...__at(110));
    pl.target = a;
    await __until(() => a.hp < a.maxHp, 3000);
    await __wait(500);
    const moved = Math.round(G.U.dist(pl.x, pl.y, a.x, a.y)), behind = b.hp < b.maxHp;
    // Seismic Toss: more damage at a higher level.
    [m] = __only('seismic-toss');
    const C = G.Combat, d = __dummy(...__at(40));
    pl.level = 1; m.dealt = 0; pl.target = d; m.t = 0;
    await __until(() => m.dealt > 0, 3000);
    const lo = m.dealt;
    G.EnemyMgr.clear(); const d2 = __dummy(...__at(40)); pl.level = 30; m.dealt = 0; pl.target = d2; m.t = 0;
    await __until(() => m.dealt > 0, 3000);
    const hi = m.dealt; pl.level = 1;
    return { moved, behind, k: +(hi / lo).toFixed(2) };
  });
  check(grab.moved > 90, `Circle Throw throws the enemy away (${grab.moved} px from you)`);
  check(grab.behind, 'the thrown enemy hits the one behind it');
  check(grab.k > 2, `Seismic Toss grows with your level (level 30 ×${grab.k} of level 1)`);

  // ---------------- 3. bind ----------------
  console.log('bind');
  const bind = await page.evaluate(async () => {
    const pl = G.Game.player;
    let [m] = __only('bind');
    const a = __dummy(...__at(40));
    pl.target = a;
    await __until(() => a.stunT > 0, 3000);
    const stun = a.stunT > 1.5;
    const h0 = a.hp; let drops = 0, last = a.hp;
    for (let i = 0; i < 14; i++) { await __wait(100); if (a.hp < last) { drops++; last = a.hp; } }
    // Level 2: three at once.
    [m] = __only('bind'); G.Moves.levelUp(m);
    const ds = [0, 1.2, 2.4].map(a => __dummy(...__at(40, a)));
    pl.target = ds[0];
    await __until(() => ds.every(d => d.stunT > 0), 3000);
    return { stun, drops, n: ds.filter(d => d.stunT > 0).length, count: m.count };
  });
  check(bind.stun, 'Bind holds the enemies (stunned for its duration)');
  check(bind.drops >= 2, `and hurts it again and again (${bind.drops} hits in 1.4 s)`);
  check(bind.n === 3 && bind.count === 3, `it holds two at once, three at level 2 (${bind.n})`);

  // ---------------- 4. focus ----------------
  console.log('focus');
  const focus = await page.evaluate(async () => {
    const pl = G.Game.player;
    let [m] = __only('focus-punch');
    const a = __dummy(...__at(40));
    pl.target = a; pl.aim = 0;
    await __until(() => pl._labFocus, 3000);
    await __until(() => !pl._labFocus, 3000);
    await __wait(50);
    const landed = a.maxHp - a.hp;
    G.EnemyMgr.clear(); const b = __dummy(...__at(40)); pl.target = b; m.t = 0;
    await __until(() => pl._labFocus, 3000);
    pl.invuln = 0; const h0 = pl.hp; pl.hurt(40, null, false, 'physical'); const braced = h0 - pl.hp;
    await __until(() => !pl._labFocus, 3000);
    await __wait(50);
    const lost = b.maxHp - b.hp;
    __only('ember'); pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical'); const plain = pl.maxHp - pl.hp;
    // Shell Trap: goes off when hit.
    [m] = __only('shell-trap');
    const s = [0, 1, 2].map(i => __dummy(...__at(60, i * 2.1)));
    await __until(() => pl._labFocus, 3000);
    pl.invuln = 0; pl.hurt(5, null, false, 'physical');
    await __wait(50);
    return { landed: Math.round(landed), lost: Math.round(lost), brace: +(braced / plain).toFixed(2), trap: s.filter(e => e.hp < e.maxHp).length };
  });
  check(focus.landed > 0, `Focus Punch lands when you're not hit (${focus.landed} damage)`);
  check(focus.lost > 0 && Math.abs(focus.lost / focus.landed - 0.65) < 0.03, `a hit while focusing weakens it by 35% (${focus.lost} of ${focus.landed})`);
  check(focus.brace === 0.53, `and while focusing you take 30% less, on top of the close-range 25% (×${focus.brace} = 0.7 × 0.75)`);
  check(focus.trap === 3, `Shell Trap explodes around you when you're hit (${focus.trap} of 3 hit)`);

  // ---------------- 5. heal ----------------
  console.log('heal');
  const heal = await page.evaluate(async () => {
    const pl = G.Game.player, out = {};
    __only('ember', 'recover');
    __dummy(...__at(400));
    pl.hp = pl.maxHp * 0.8;
    await __wait(400);
    out.high = Math.abs(pl.hp - pl.maxHp * 0.8) < 1;
    pl.hp = pl.maxHp * 0.4;
    await __until(() => pl.hp > pl.maxHp * 0.6, 2000);
    out.low = +(pl.hp / pl.maxHp).toFixed(2);
    // Rest: full HP, and you can't move or attack for a moment.
    const [e] = __only('ember', 'rest');
    __dummy(...__at(200));
    pl.hp = pl.maxHp * 0.3;
    await __until(() => pl._labRest > 0, 2000);
    out.restFull = pl.hp >= pl.maxHp - 1;
    const axis = G.Input.axis; G.Input.axis = () => [1, 0];
    await __wait(700);                                    // embers already flying land first
    const x0 = pl.x; e.dealt = 0;
    await __wait(800);
    out.restStill = Math.abs(pl.x - x0) < 1 && !e.dealt;
    G.Input.axis = axis;
    // Wish: arrives about 2 s later.
    __only('ember', 'wish');
    __dummy(...__at(400));
    pl.hp = pl.maxHp * 0.4;
    await __wait(700);
    out.wishSoon = pl.hp < pl.maxHp * 0.45;
    await __until(() => pl.hp > pl.maxHp * 0.6, 3000);
    out.wishLater = pl.hp > pl.maxHp * 0.6;
    // Morning Sun: ×1.5 in sunlight.
    const ms = G.Moves.instance('morning-sun');
    const h = () => { pl.hp = pl.maxHp * 0.3; G.Combat.run(pl, ms); return pl.hp / pl.maxHp - 0.3; };
    const plain = h();
    G.Weather.update = __wxUpdate; G.Weather.debugStart('sun', 30);
    await __wait(3300);                                  // weather fades in over 3 s
    const sunny = h();
    G.Weather.clear(); G.Weather.update = () => {};
    out.sun = +(sunny / plain).toFixed(2);
    pl.hp = pl.maxHp;
    return out;
  });
  check(heal.high, 'Recover (another slot) does nothing above half HP');
  check(heal.low >= 0.64, `below half it restores 25% (40% → ${Math.round(heal.low * 100)}%)`);
  check(heal.restFull && heal.restStill, 'Rest heals fully, and for a moment you neither move nor attack', heal);
  check(heal.wishSoon && heal.wishLater, 'Wish heals later, not at once');
  check(heal.sun === 1.5, `Morning Sun heals ×1.5 in sunlight (×${heal.sun})`);

  // ---------------- 6. screen ----------------
  console.log('screen');
  const screen = await page.evaluate(async () => {
    const pl = G.Game.player;
    const take = cat => { pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, cat); return pl.maxHp - pl.hp; };
    __only('ember');
    const p0 = take('physical'), s0 = take('special');
    __only('ember', 'reflect');
    __dummy(...__at(200));
    await __until(() => G.LabKinds2.counts().screens > 0, 3000);
    const p1 = take('physical'), s1 = take('special');
    return { phys: +(p1 / p0).toFixed(2), spec: +(s1 / s0).toFixed(2) };
  });
  check(Math.abs(screen.phys - 0.6) < 0.03, `Reflect: physical hits ×${screen.phys} (40% less)`);
  check(Math.abs(screen.spec - 1) < 0.03, `and special ones untouched (×${screen.spec})`);

  // ---------------- 7. shout ----------------
  console.log('shout');
  const shout = await page.evaluate(async () => {
    const pl = G.Game.player, C = G.Combat;
    __only('ember', 'growl');
    const a = __dummy(...__at(60), { dmg: 20 }), b = __dummy(...__at(60, 2));
    const d0 = a.dmg;
    await __until(() => a._meek, 3000);
    const k = +(a.dmg / d0).toFixed(2);
    a._meek.t = 0.01;
    await __wait(150);
    const back = +(a.dmg / d0).toFixed(2);
    // Screech: physical hits +40%.
    const [em, sc] = __only('ember', 'screech');
    const e = __dummy(...__at(60)), f = __dummy(...__at(60, 2));
    const m = G.Moves.instance('karate-chop');
    C.hit(pl, e, 100, '#fff', 0, 0, 0, m);
    const before = e.maxHp - e.hp;
    await __until(() => e._weak, 3000);
    const h0 = e.hp;
    C.hit(pl, e, 100, '#fff', 0, 0, 0, m);
    return { k, back, weak: +((h0 - e.hp) / before).toFixed(2) };
  });
  check(shout.k === 0.7, `Growl: nearby enemies deal ×${shout.k} (30% less)`);
  check(shout.back === 1, 'and back to normal when it wears off');
  check(Math.abs(shout.weak - 1.4) < 0.02, `Screech: physical hits on them ×${shout.weak}`);

  // ---------------- 8. hit effects ----------------
  console.log('hit effects');
  const fx = await page.evaluate(async () => {
    const pl = G.Game.player, C = G.Combat, out = {};
    const dmgOf = (id, e, set) => { const m = G.Moves.instance(id); if (set) set(m); const h0 = e.hp; C.hit(pl, e, 100, '#fff', 0, 0, 0, m); return h0 - e.hp; };
    // Drain Punch heals over the next moments.
    const [dp] = __only('drain-punch');
    __dummy(...__at(40)); __dummy(...__at(40, 1));
    pl.hp = pl.maxHp * 0.5;
    await __until(() => dp.dealt > 0, 3000);
    await __wait(800);
    out.drain = pl.hp > pl.maxHp * 0.5 + 1;
    // Leech Seed: the seeded enemy keeps losing HP and you heal.
    const [ls] = __only('leech-seed');
    const s = __dummy(...__at(150));
    pl.target = s;
    await __until(() => s._seed, 3000);
    pl.hp = pl.maxHp * 0.5; ls.t = 99;
    const sh = s.hp;
    await __wait(1300);
    out.seed = { drop: s.hp < sh, heal: pl.hp > pl.maxHp * 0.5 };
    __only('ember');
    const e = __dummy(...__at(300));
    pl.hp = pl.maxHp;
    const base = dmgOf('revenge', e);
    pl._labHurtAt = performance.now();
    out.revenge = +(dmgOf('revenge', e) / base).toFixed(2);
    pl._labHurtAt = 0;
    pl.hp = pl.maxHp; const full = dmgOf('reversal', e);
    pl.hp = pl.maxHp * 0.25; out.reversal = +(dmgOf('reversal', e) / full).toFixed(2);
    // Super Fang: half of what's left; a boss far less.
    const f = __dummy(...__at(300, 1), { hp: 10000 });
    out.fang = Math.round(dmgOf('super-fang', f));
    const bs = __dummy(...__at(300, 2), { hp: 10000, boss: true });
    out.fangBoss = Math.round(dmgOf('super-fang', bs));
    // Power Trip: +20% per stacked boost.
    pl.hp = pl.maxHp;
    const pt0 = dmgOf('power-trip', e);
    pl.buffs.patk.n = 3; pl.buffs.patk.t = 9; pl.buffs.patk.amount = 0;
    out.power = +(dmgOf('power-trip', e) / pt0).toFixed(2);
    pl.buffs.patk.n = 0;
    // Fake Out: stuns on the first hit only.
    const fo = G.Moves.instance('fake-out'), g = __dummy(...__at(300, 3));
    C.hit(pl, g, 10, '#fff', 0, 0, 0, fo);
    out.flinch1 = g.stunT > 0.9;
    g.stunT = 0;
    C.hit(pl, g, 10, '#fff', 0, 0, 0, fo);
    out.flinch2 = g.stunT > 0;
    return out;
  });
  check(fx.drain, 'Drain Punch heals you');
  check(fx.seed.drop && fx.seed.heal, 'Leech Seed keeps draining the enemy and heals you', fx.seed);
  check(fx.revenge === 2, `Revenge hits ×${fx.revenge} right after you're hit`);
  check(fx.reversal === 2.5, `Reversal at 25% HP hits ×${fx.reversal} of full HP`);
  check(fx.fang >= 4900 && fx.fang <= 5100, `Super Fang takes half of what's left (${fx.fang} of 10000)`);
  check(fx.fangBoss > 0 && fx.fangBoss <= 450, `and only a little from a boss (${fx.fangBoss})`);
  check(fx.power === 1.6, `Power Trip with 3 boosts stacked: ×${fx.power}`);
  check(fx.flinch1 && !fx.flinch2, 'Fake Out stuns on the first hit to an enemy, not the next ones');

  // ---------------- 9. buffs ----------------
  console.log('buffs');
  const buffs = await page.evaluate(async () => {
    const pl = G.Game.player;
    __only('bulk-up');
    await __until(() => pl.buffs.patk.n >= 2, 4000);
    const bu = { patk: pl.buffs.patk.n, def: pl.buffs.def.n };
    __only('fillet-away');
    pl.hp = pl.maxHp;
    await __until(() => pl.buffs.patk.n > 0, 3000);
    return { bu, cost: +(1 - pl.hp / pl.maxHp).toFixed(2), patk: pl.buffs.patk.n, spd: pl.buffs.spd.n, satk: pl.buffs.satk.n };
  });
  check(buffs.bu.def >= 2 && buffs.bu.def === buffs.bu.patk, `Bulk Up stacks ATTACK and DEFENSE together (${buffs.bu.patk}/${buffs.bu.def})`);
  check(buffs.cost === 0.4 && buffs.patk === 5 && buffs.spd === 5 && buffs.satk === 5, 'Fillet Away costs 40% HP and maxes its three stats at once', buffs);

  // ---------------- 10. Endure ----------------
  console.log('Endure');
  const endure = await page.evaluate(async () => {
    const pl = G.Game.player;
    const [, en] = __only('ember', 'endure');
    pl.hp = 10; pl.invuln = 0;
    pl.hurt(9999, null, false, 'physical');
    const first = { hp: pl.hp, dead: pl.dead, inv: pl.invuln > 1 };
    pl.invuln = 0; pl.hp = 10;
    pl.hurt(9999, null, false, 'physical');
    const second = pl.dead;
    pl.dead = false; pl.hp = pl.maxHp; pl.anim.play('Idle');
    // a normal hit is untouched
    pl.invuln = 0; en._pt = 0;
    const h0 = pl.hp; pl.hurt(20, null, false, 'physical');
    return { first, second, normal: pl.hp < h0 && en._pt === 0 };
  });
  check(endure.first.hp === 1 && !endure.first.dead && endure.first.inv, 'Endure: a hit that would KO leaves you at 1 HP, untouchable for a moment', endure.first);
  check(endure.second, 'then it recharges (a second one right after knocks you out)');
  check(endure.normal, 'an ordinary hit goes through and doesn\'t use it up');

  // ---------------- 11. close range ----------------
  console.log('Close range');
  const close = await page.evaluate(() => {
    const pl = G.Game.player;
    const take = () => { pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical'); return pl.maxHp - pl.hp; };
    __only('ember'); const far = take();
    const k = {};
    for (const id of ['bind', 'seismic-toss', 'focus-punch', 'fury-cutter', 'karate-chop']) { __only(id); k[id] = +(take() / far).toFixed(2); }
    return k;
  });
  check(Object.values(close).every(v => v === 0.75), 'with a grab, bind, focus, ramp or melee move active you take 25% less', close);

  // ---------------- 12. odds and ends ----------------
  console.log('Metronome, evolution, Iron Fist');
  const odd = await page.evaluate(() => {
    const pl = G.Game.player, kinds = new Set();
    for (let i = 0; i < 4000; i++) kinds.add(G.Moves.BY_ID[G.LabKinds.randomMove()].kind);
    const [m] = __only('circle-throw');
    while (G.Moves.levelUp(m)) {}
    const d0 = m.dmg;
    G.Moves.evolve(m);
    const fist = G.LabAbilities.DEF['iron-fist'].out(pl, G.Moves.instance('drain-punch'));
    return { support: ['heal', 'screen', 'shout', 'endure', 'focus'].filter(k => kinds.has(k)), evo: G.T(m.name, 'move'), k: +(m.dmg / d0).toFixed(2), fist };
  });
  check(!odd.support.length, 'Metronome never calls heal, screen, shout, Endure or focus moves', odd.support);
  check(odd.evo === 'Storm Throw' && odd.k === 1.8, `a grab evolves at its top level: Circle Throw → ${odd.evo} (×${odd.k})`);
  check(odd.fist === 1.2, `Iron Fist boosts Drain Punch (×${odd.fist})`);

  check(!errors.length, 'no page errors', errors.slice(0, 3));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
