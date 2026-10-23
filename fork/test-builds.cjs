#!/usr/bin/env node
// Lab builds (fork/LAB.md "Phase 11: builds"), in the game in headless Edge on dev.html, in a real
// Lab run on dummies that don't move:
//
//   node fork/serve.cjs                  (another terminal)
//   node fork/test-builds.cjs [base-url] [--only branches|sets|synergy|recipes]
//
// sets (js/fork/lab/sets.js, js/fork/lab/hits.js): each set one move short and then complete, on real hits: Fire +1 burn
//   stack, Water slows, Electric jumps to the enemy beside it (~35%), Grass and Physical heal, Fighting x1.2 physical
//   and x0.75 damage taken with a ranged move active, Priority switches leave 10% of the cooldown (35% without);
//   the chip under the HP bar, the pause line, the "completes the set" note on a new-move card.
// branches (js/fork/lab/branches.js):
//   1. Every move in the table exists, with three branches; every `like` move exists.
//   2. A move at level 3 doesn't get its plain upgrade card: the real hand (G.LevelUp.offer) shows two
//      Branch cards for it, always the same two of its three in that run (the third never comes).
//   3. Picking one on the real level-up screen: Flamethrower → Fire Spin becomes a Fire bind that holds
//      and burns dummies; its next upgrade is the bind's; it evolves with the bind's evolution.
//      Heat Wave: twice the spread and 4 more flames than the plain level 4.
//   4. Volt Switch: switching to it casts it at once, and that cast hits ×1.6.
//   5. The branch survives the Pokémon's Lab evolution and a resume (reload) of the run.
// synergy (js/fork/lab/synergy.js): no card without its prerequisites, Frost Fire comes with Ember + Ice Beam (one
//   at a time, red border and chip), picked on the real screen Ice Beam burns, and it never comes again; on real
//   hits: Overload (half the hit onto the neighbour of a stunned enemy), Steam Burst x1.5, Wildfire spreading the
//   burn, Shatter x1.35 on the slowed one only, Quicksand stopping a slowed enemy; the pause line.
//   Also Overload near the world's origin, where EnemyMgr.queryCircle used to list the neighbour twice.
// recipes (js/fork/lab/recipes.js): the real bond screen marks the picks that make a recipe (first and second
//   step); Sunny Day + Solar Beam fused there: no charge, the beam lands at once; Rain Dance + Thunder Shock (homing,
//   jumps), Will-O-Wisp + Hex (burning chain), Snowscape + Ice Beam (stops), Leech Seed + Giga Drain (seeds);
//   a resumed run gets its recipe back.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7) || (args.includes('--only') ? args[args.indexOf('--only') + 1] : '');
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const want = s => !only || only === s;

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (!ok && info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab && G.LabBranches, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    for (const d of [4, 5, 25]) G.DB.save.owned[d] = { at: Date.now() };
    G.DB.save.partner = 4; G.Settings.set('lab', true); G.Settings.set('underdogLadder', false); G.MenuUI.open();
  });
  const start = async () => {
    await page.evaluate(() => { G.DB.save.partner = 4; G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 30000 });
    await page.evaluate(() => {
      for (const k of ['Spawner', 'Events', 'Rift', 'Hazards']) G[k].update = () => {};
      G.Weather.clear(); G.Weather.update = () => {};
      const pl = G.Game.player;
      pl.xpMul = 0; pl.critChance = 0; pl.labAbility = null; pl.god = true;
      window.__wait = ms => new Promise(r => setTimeout(r, ms));
      window.__until = (f, ms = 3000) => new Promise(r => { const t0 = performance.now(); (function s() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(s, 30); })(); });
      window.__dummy = (x, y, o = {}) => {
        const def = { dex: 19, name: 'Dummy', hp: o.hp || 1e6, spd: 0, dmg: 1, xp: 0, behavior: 'chase' };
        const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
        e.types = ['none']; e.touchCd = 99;
        G.EnemyMgr.add(e);
        return e;
      };
      window.__open = () => {
        const p = G.Game.player;
        const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= 260; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, p.r, true)) return false; return true; };
        if (ok(p.x, p.y)) return;
        for (let r = 64; r < 6000; r += 64) for (let a = 0; a < 6.283; a += 0.5) { const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (ok(x, y)) { p.x = x; p.y = y; return; } }
      };
      window.__only = (...ids) => {
        const p = G.Game.player;
        p.slots.length = 0; p.moves.length = 0; p.maxMoves = 4; p.active = 0;
        G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); __open();   // nothing left flying from the check before
        for (const id of ids) p.addMove(id);
        p.active = 0;
        return p.moves;
      };
      window.__at = (r, a = 0) => [G.Game.player.x + Math.cos(a) * r, G.Game.player.y + Math.sin(a) * r];
    });
  };
  await start();

  if (want('branches')) {
    // ---------------- 1. the table ----------------
    console.log('branches: the table');
    const tbl = await page.evaluate(() => {
      const T = G.LabBranches.TABLE, bad = [];
      for (const id in T) {
        if (!G.Moves.BY_ID[id]) bad.push('no move ' + id);
        if (Object.keys(T[id]).length !== 3) bad.push(id + ' has ' + Object.keys(T[id]).length + ' branches');
        for (const k in T[id]) if (T[id][k].like && !G.Moves.BY_ID[T[id][k].like]) bad.push(id + ':' + k + ' like ' + T[id][k].like);
      }
      return { n: Object.keys(T).length, bad };
    });
    check(tbl.n >= 10 && !tbl.bad.length, `${tbl.n} moves with three branches each, every one built from moves that exist`, tbl.bad);

    // ---------------- 2. the hand ----------------
    console.log('branches: the hand');
    const hand = await page.evaluate(() => {
      const pl = G.Game.player;
      const [m] = __only('flamethrower');
      pl.maxMoves = 1;                                  // no new-move cards: upgrades and stats only
      G.Moves.levelUp(m); G.Moves.levelUp(m);           // level 3, as two upgrade cards would
      const seen = new Set(), keysOf = h => h.map(c => c.key);
      let first = null, plain = 0, hands = 0, both = 0;
      for (let i = 0; i < 400; i++) {
        const h = G.LevelUp.offer(pl), br = h.filter(c => c.branch);
        if (h.some(c => c.key === 'up:flamethrower')) plain++;
        if (!br.length) continue;
        hands++;
        if (br.length === 2 && br.every(c => c.key.startsWith('up:flamethrower:'))) both++;
        for (const c of br) seen.add(c.key.split(':')[2]);
        if (!first) first = { keys: keysOf(h), titles: br.map(c => c.title), tags: br.map(c => c.tag) };
      }
      return { first, plain, hands, both, seen: [...seen].sort(), pair: (pl._labBrPair || {}).flamethrower, lvl: m.lvl };
    });
    check(hand.hands > 10 && hand.both === hand.hands, `at level 3 the hand shows two Branch cards for Flamethrower (${hand.hands} hands of 400)`, hand.first);
    check(hand.plain === 0, 'and never its plain level 4 upgrade', hand.plain);
    check(hand.seen.length === 2 && JSON.stringify(hand.seen) === JSON.stringify(hand.pair), `only two of its three branches come up in this run (${hand.seen.join(', ')})`, hand);
    console.log('  info: ' + JSON.stringify(hand.first));

    // ---------------- 3. picking one on the real screen ----------------
    console.log('branches: Fire Spin and Heat Wave');
    const pickOnScreen = async key => {
      await page.evaluate(k => {
        const pl = G.Game.player;
        pl._labBrPair = { flamethrower: ['a', 'b'] };    // the two this check picks from
        let h = [];
        for (let i = 0; i < 400 && !h.some(c => c.key === 'up:flamethrower:' + k); i++) h = G.LevelUp.offer(pl);
        window.__picked = null;
        G.RunUI.showLevelUp(pl.level, h, c => { window.__picked = c.key; c.apply(pl); });
      }, key);
      await page.waitForFunction(() => !document.getElementById('cards').classList.contains('guard'), null, { timeout: 4000 });
      const i = await page.evaluate(k => [...document.querySelectorAll('#cards .card')].findIndex(el => /→/.test(el.textContent) && el.textContent.includes(k)), key === 'a' ? 'Fire Spin' : 'Heat Wave');
      await page.click(`#cards .card >> nth=${i}`);
      return page.evaluate(() => window.__picked);
    };
    await page.evaluate(() => { const [m] = __only('flamethrower'); G.Game.player.maxMoves = 1; G.Moves.levelUp(m); G.Moves.levelUp(m); });
    const pickedA = await pickOnScreen('a');
    const spin = await page.evaluate(async () => {
      const pl = G.Game.player, m = pl.moves[0];
      const out = { picked: m.branch, kind: m.kind, type: m.type, cat: m.cat, burn: m.burn, lvl: m.lvl, name: m.branchName };
      const a = __dummy(...__at(40)), b = __dummy(...__at(46, 0.6));
      pl.target = a; m.t = 0;
      await __until(() => a.stunT > 0 && a.burn > 0, 3000);
      out.held = a.stunT > 0; out.burning = a.burn > 0; out.hurt = a.hp < a.maxHp;
      out.nextText = G.Moves.nextUpText(m); out.wrapText = G.Moves.BY_ID.wrap.ups[3].t;
      const c0 = m.count; G.Moves.levelUp(m); out.countUp = m.count - c0;
      const ev = G.Moves.evoInfo(m, { atk: 1, cd: 1 });
      out.evo = ev && ev.text; out.bindEvo = G.LabKinds2.EVO.bind.t;
      G.Moves.evolve(m); out.evolved = m.evolved && m.kind === 'bind';
      return out;
    });
    check(pickedA === 'up:flamethrower:a' && spin.picked === 'a' && spin.lvl === 4, 'the Fire Spin card picked on the level-up screen gives level 4 with branch a', { pickedA, spin });
    check(spin.kind === 'bind' && spin.type === 'fire' && spin.cat === 'special' && spin.burn >= 1, `Fire Spin is a Fire bind that burns (${spin.kind}, ${spin.type}, ${spin.cat}, burn ${spin.burn})`);
    check(spin.held && spin.burning && spin.hurt, 'it holds a dummy in place, burns it and hurts it', spin);
    check(spin.nextText === spin.wrapText && spin.countUp === 1, `its next upgrade is the bind's ("${spin.nextText}")`, spin);
    check(spin.evo === spin.bindEvo && spin.evolved, 'it evolves with the bind\'s evolution', spin);

    await page.evaluate(() => { const [m] = __only('flamethrower'); G.Game.player.maxMoves = 1; G.Moves.levelUp(m); G.Moves.levelUp(m); });
    await pickOnScreen('b');
    const wave = await page.evaluate(() => {
      const m = G.Game.player.moves[0], plain = G.Moves.instance('flamethrower', 4);
      return { br: m.branch, arc: +(m.arc / plain.arc).toFixed(3), count: m.count - plain.count, kind: m.kind };
    });
    check(wave.br === 'b' && wave.kind === 'cone' && wave.arc === 2 && wave.count === 4, 'Heat Wave: still a cone, twice the spread and 4 more flames than the plain level 4', wave);

    // ---------------- 4. Volt Switch ----------------
    console.log('branches: Volt Switch');
    const volt = await page.evaluate(async () => {
      const pl = G.Game.player;
      const [w, tb] = __only('water-gun', 'thunderbolt');
      for (let i = 0; i < 2; i++) G.Moves.levelUp(tb);
      G.LabBranches.applyBranch(tb, 'b');
      const e = __dummy(...__at(80));
      pl.target = e; pl.active = 0; tb.t = 5;
      const hits = [];
      const dealt = () => tb.dealt || 0;
      let last = dealt();
      // Switch to it: the cast comes at once (its recharge was 5 s) and hits ×1.6.
      const t0 = performance.now();
      pl.setActive(1);
      await __until(() => dealt() > last, 2000);
      const first = { dmg: dealt() - last, ms: Math.round(performance.now() - t0) };
      last = dealt();
      await __until(() => dealt() > last, 3000);
      const second = dealt() - last;
      return { first, second, k: +(first.dmg / second).toFixed(2) };
    });
    check(volt.first.ms < 400, `switching to Volt Switch casts it at once (${volt.first.ms} ms, recharge was 5 s)`, volt);
    check(Math.abs(volt.k - 1.6) < 0.05, `and that cast hits ×1.6 (×${volt.k} of the next one)`, volt);

    // ---------------- 5. evolution of the Pokémon, resume ----------------
    console.log('branches: evolution and resume');
    const keep = await page.evaluate(() => {
      const pl = G.Game.player;
      const [m] = __only('flamethrower');
      G.Moves.levelUp(m); G.Moves.levelUp(m); G.LabBranches.applyBranch(m, 'a');
      pl._labBranch = { flamethrower: 'a' };
      pl.level = 20; G.LabGrowth.evolveTo(pl, 5);
      return { dex: pl.dex, br: pl.moves[0].branch, kind: pl.moves[0].kind };
    });
    check(keep.dex === 5 && keep.br === 'a' && keep.kind === 'bind', 'evolving into Charmeleon keeps the branched move as it is', keep);
    await page.evaluate(() => { G.Game.player.moves[0].lvl === 4 && G.Moves.levelUp(G.Game.player.moves[0]); G.Resume.save(); });
    const saved = await page.evaluate(() => (G.Resume.read() || {}).moves);
    await page.evaluate(() => G.Resume.resume());
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 30000 });
    const back = await page.evaluate(() => { const m = G.Game.player.moves[0]; return { id: m.id, lvl: m.lvl, br: m.branch, kind: m.kind, count: m.count, type: m.type }; });
    check(saved && saved[0].br === 'a' && back.br === 'a' && back.kind === 'bind' && back.lvl === 5 && back.type === 'fire',
      'a resumed run brings the move back with its branch and level', { saved, back });
  }

  if (want('sets')) {
    // ---------------- sets ----------------
    // Each pair: the same hit with the set one move short, then complete (the third move sits in another slot).
    console.log('sets');
    await page.evaluate(() => { const pl = G.Game.player; pl.regenFlat = 0; pl.god = false; pl.invuln = 0; });
    /** Casts the first move of `ids` on a dummy 70 px away (and one more off to the side); returns what happened. */
    const trial = (ids, o = {}) => page.evaluate(async ([ids, o]) => {
      const pl = G.Game.player;
      __only(...ids);
      pl.hp = pl.maxHp * 0.5; pl._labSetHeal = 0; pl.invuln = 0;
      const a = __dummy(...__at(o.r || 70)), b = o.side ? __dummy(...__at(105, 1.2)) : null;
      pl.target = a; pl.aim = 0;
      const m = pl.moves[0], hp0 = pl.hp;
      m.t = 0;
      await __until(() => a.hp < a.maxHp, 3000);
      await __wait(o.wait || 120);
      return { sets: [...G.LabSets.active(pl)], burn: a.burn, slow: a.slow, side: b ? b.maxHp - b.hp : 0, heal: Math.round(pl.hp - hp0), hit: a.maxHp - a.hp };
    }, [ids, o]);
    const f2 = await trial(['ember', 'flamethrower']), f3 = await trial(['ember', 'flamethrower', 'heat-wave']);
    check(!f2.sets.includes('fire') && f3.sets.includes('fire') && f3.burn === f2.burn + 1, `Fire set: 2 Fire moves burn ${f2.burn}, 3 burn ${f3.burn} (one more stack)`, { f2, f3 });
    const w2 = await trial(['water-gun', 'hydro-pump']), w3 = await trial(['water-gun', 'hydro-pump', 'bubble']);
    check(w2.slow === 0 && w3.slow > 0 && w3.sets.includes('water'), `Water set: Water Gun slows only with 3 Water moves (${w2.slow} → ${w3.slow})`, { w2, w3 });
    const e2 = await trial(['thunderbolt', 'discharge'], { side: true }), e3 = await trial(['thunderbolt', 'discharge', 'thunder-wave'], { side: true });
    const z2 = await trial(['thunder-shock', 'discharge'], { side: true }), z3 = await trial(['thunder-shock', 'discharge', 'thunder-wave'], { side: true });
    check(z2.side === 0 && z3.side > 0 && Math.abs(z3.side / z3.hit - 0.35) < 0.08, `Electric set: Thunder Shock's hit jumps to the enemy beside it for ~35% (${z2.side} → ${Math.round(z3.side)} of ${Math.round(z3.hit)})`, { z2, z3 });
    console.log(`  info: Thunderbolt (a chain) with/without the set, the side dummy: ${Math.round(e2.side)} / ${Math.round(e3.side)}`);
    const g2 = await trial(['vine-whip', 'razor-leaf'], { wait: 1200 }), g3 = await trial(['vine-whip', 'razor-leaf', 'leaf-storm'], { wait: 1200 });
    check(g2.heal <= 0 && g3.heal > 0, `Grass set: Vine Whip heals you only with 3 Grass moves (${g2.heal} → +${g3.heal} HP)`, { g2, g3 });
    const p2 = await trial(['tackle', 'bite'], { wait: 1200, r: 40 }), p3 = await trial(['tackle', 'bite', 'rock-throw'], { wait: 1200, r: 40 });
    check(p2.heal <= 0 && p3.heal > 0 && p3.sets.includes('physical'), `Physical set: lifesteal with 3 physical moves (${p2.heal} → +${p3.heal} HP)`, { p2, p3 });
    const fight = await page.evaluate(() => {
      const pl = G.Game.player, out = {};
      for (const ids of [['aura-sphere', 'karate-chop'], ['aura-sphere', 'karate-chop', 'dynamic-punch']]) {
        __only(...ids);
        pl.active = 0;                                   // Aura Sphere: no close-range cut of its own
        const k = pl.atkFor({ cat: 'physical', type: 'normal' }), ks = pl.atkFor({ cat: 'special', type: 'normal' });
        pl.invuln = 0; pl.dead = false; pl.hp = pl.maxHp; pl.hurt(20);
        out[ids.length] = { phys: k, spec: ks, took: pl.maxHp - pl.hp };
      }
      return { k: +(out[3].phys / out[2].phys).toFixed(3), ks: +(out[3].spec / out[2].spec).toFixed(3), took: +(out[3].took / out[2].took).toFixed(3) };
    });
    check(fight.k === 1.2 && fight.ks === 1 && Math.abs(fight.took - 0.75) < 0.01, `Fighting set: ×${fight.k} physical (×${fight.ks} special), ×${fight.took} damage taken with Aura Sphere active`, fight);
    const prio = await page.evaluate(() => {
      const pl = G.Game.player, out = [];
      for (const ids of [['water-gun', 'quick-attack', 'bite'], ['water-gun', 'quick-attack', 'ice-shard']]) {
        __only(...ids);
        pl.active = 0; const m = pl.moves[2]; m.t = 5; pl.setActive(2);
        out.push(+(m.t / m.cd).toFixed(3));
      }
      return out;
    });
    check(prio[0] === 0.35 && prio[1] === 0.1, `Priority set: a switch leaves ${prio[0] * 100}% of the cooldown, with 2 priority moves ${prio[1] * 100}%`, prio);
    const ui = await page.evaluate(() => {
      const pl = G.Game.player, cv = document.createElement('canvas').getContext('2d');
      __only('ember', 'flamethrower');
      const h0 = G.HUD.belowHp(cv, pl, 10, 10);
      const pause0 = (() => { G.RunUI.showPause(); const t = document.getElementById('pause-sum').textContent; G.UI.hide('scr-pause'); return t; })();
      __only('ember', 'flamethrower', 'heat-wave');
      G.Combat.tick(0.016, pl, performance.now());
      const h1 = G.HUD.belowHp(cv, pl, 10, 10);
      G.RunUI.showPause();
      const pause = document.getElementById('pause-sum').textContent;
      G.UI.hide('scr-pause');
      // A new-move card that would complete a set says so.
      __only('ember', 'flamethrower');
      pl.maxMoves = 4;
      let note = null;
      for (let i = 0; i < 300 && !note; i++) { const c = G.LevelUp.offer(pl).find(c => c.type === 'new' && /Completes the Fire set/.test(c.desc)); if (c) note = c.key; }
      return { h0, h1, pause, pause0: /One move away: Fire set/.test(pause0), note };
    });
    check(ui.h1 > ui.h0, `a chip under the HP bar while a set is on (${ui.h0} → ${ui.h1} px)`, ui);
    check(/Sets: Fire set/.test(ui.pause) && ui.pause0, 'the pause menu names the active set, and the one a move away', ui.pause.slice(0, 300));
    check(!!ui.note && ui.note.startsWith('new:'), `a new Fire move card says it completes the Fire set (${ui.note})`, ui);
  }

  if (want('synergy')) {
    // ---------------- synergy cards ----------------
    console.log('synergy');
    await page.evaluate(() => { const pl = G.Game.player; pl.god = true; pl.regenFlat = 0; });
    const off = await page.evaluate(() => {
      const pl = G.Game.player;
      pl._labSyn = [];
      __only('ember'); pl.maxMoves = 4;
      let without = 0;
      for (let i = 0; i < 200; i++) if (G.LevelUp.offer(pl).some(c => c.syn)) without++;
      __only('ember', 'ice-beam'); pl.maxMoves = 2;
      let withN = 0, multi = 0;
      const keys = new Set();
      for (let i = 0; i < 200; i++) { const s = G.LevelUp.offer(pl).filter(c => c.syn); if (s.length) withN++; if (s.length > 1) multi++; s.forEach(c => keys.add(c.key)); }
      return { without, withN, multi, keys: [...keys] };
    });
    check(off.without === 0, 'no Synergy card without its prerequisites (Ember alone, 200 hands)', off);
    check(off.withN > 50 && off.multi === 0 && off.keys.join() === 'syn:frost-fire', `with Ember + Ice Beam, Frost Fire comes up (${off.withN} of 200 hands, never two at once)`, off);
    /** Casts the first move on dummy a (70 px; `prep` puts a status on it first); b stands 40 px beside a. */
    const shot = (ids, prep, o = {}) => page.evaluate(async ([ids, prep, o]) => {
      const pl = G.Game.player;
      const keep = pl._labSyn;
      __only(...ids);
      pl._labSyn = keep;
      const a = __dummy(...__at(o.r || 70)), [bx, by] = __at(o.r || 70);
      const b = __dummy(bx + 10, by + 38);
      if (prep === 'stun') a.applyStun(5);
      if (prep === 'burn') { a.applyBurn(1); a.burnT = 9; }
      if (prep === 'slow') a.applySlow(0.5, 9);
      pl.target = a; pl.aim = Math.atan2(a.y - pl.y, a.x - pl.x);
      const m = pl.moves[0];
      m.t = 0; m.dealt = 0;
      await __until(() => m.dealt > 0, 3000);
      const first = m.dealt;
      await __wait(60);
      return { first, a: +(a.maxHp - a.hp).toFixed(2), b: b.maxHp - b.hp, aBurn: a.burn, bBurn: b.burn, aStun: a.stunT, own: +(a.maxHp - a.hp).toFixed(1) };
    }, [ids, prep, o]);
    // Pick Frost Fire on the real level-up screen; Ice Beam burns only after it.
    const ice0 = await shot(['ice-beam', 'ember']);
    await page.evaluate(() => {
      const pl = G.Game.player;
      let h = [];
      for (let i = 0; i < 300 && !h.some(c => c.syn); i++) h = G.LevelUp.offer(pl);
      window.__picked = null;
      G.RunUI.showLevelUp(pl.level, h, c => { window.__picked = c.key; c.apply(pl); });
    });
    await page.waitForFunction(() => !document.getElementById('cards').classList.contains('guard'), null, { timeout: 4000 });
    const look = await page.evaluate(() => { const el = [...document.querySelectorAll('#cards .card')].find(el => /Frost Fire/.test(el.textContent)); return el && { shadow: el.style.boxShadow, chip: el.querySelector('.tag-chip').style.background, text: el.textContent.replace(/\s+/g, ' ').trim() }; });
    check(!!look && /255, 77, 94/.test(look.shadow) && /255, 77, 94/.test(look.chip), 'the Synergy card is red-bordered with a red chip', look);
    await page.click('#cards .card.syn');
    const ice1 = await shot(['ice-beam', 'ember']);
    check(await page.evaluate(() => window.__picked) === 'syn:frost-fire' && ice0.aBurn === 0 && ice1.aBurn > 0, `Frost Fire picked on screen: Ice Beam now burns (${ice0.aBurn} → ${ice1.aBurn})`, { ice0, ice1 });
    const taken = await page.evaluate(() => { const pl = G.Game.player; let n = 0; for (let i = 0; i < 200; i++) if (G.LevelUp.offer(pl).some(c => c.syn)) n++; return n; });
    check(taken === 0, 'once taken, it doesn\'t come again', taken);
    const pair = async (id, ids, prep, o) => {
      await page.evaluate(() => { G.Game.player._labSyn = []; });
      const before = await shot(ids, prep, o);
      await page.evaluate(id => { G.Game.player._labSyn = [id]; }, id);
      return [before, await shot(ids, prep, o)];
    };
    const [ov0, ov1] = await pair('overload', ['thunder-shock', 'thunder-wave'], 'stun');
    check(ov0.b === 0 && ov1.b > 0 && Math.abs(ov1.b / (ov1.first - ov1.b) - 0.5) < 0.05, `Overload: Thunder Shock on a stunned enemy explodes onto the one beside it for half the hit (${ov0.b} → ${Math.round(ov1.b)}, hit ${Math.round(ov1.first - ov1.b)})`, { ov0, ov1 });
    // Near the world's origin EnemyMgr.queryCircle used to list some enemies twice (the grid's hash gave
    // (1,-1) and (-1,1) one bucket; fixed in c15d303, fork/test-enemy-grid.cjs): the neighbour is listed
    // once and the explosion hits it once.
    const dup = await page.evaluate(async () => {
      const pl = G.Game.player;
      __only('thunder-shock', 'thunder-wave');
      pl._labSyn = ['overload'];
      for (const x of pl.moves) x.t = 99;                // nothing casts by itself meanwhile
      const a = __dummy(0, 26), b = __dummy(-26, 60);
      await __wait(100);                                   // a frame: the grid is rebuilt
      const twice = G.EnemyMgr.queryCircle(a.x, a.y, 70).filter(o => o === b).length;
      a.applyStun(5);
      const m = pl.moves[0], d = m.dmg * pl.atkFor(m), a0 = a.hp, b0 = b.hp;
      G.Combat.hit(pl, a, d, '#ff0', 0, 0, 0, m);
      return { twice, a: a0 - a.hp, b: b0 - b.hp };
    });
    check(dup.twice === 1 && Math.abs(dup.b / dup.a - 0.5) < 0.06, `Overload near the origin: the neighbour listed once and hit once (×${(dup.b / dup.a).toFixed(2)} of the hit)`, dup);
    const [st0, st1] = await pair('steam', ['water-gun', 'ember'], 'burn');
    check(Math.abs(st1.first / st0.first - 1.5) < 0.05, `Steam Burst: Water Gun on a burning enemy ×${(st1.first / st0.first).toFixed(2)}`, { st0, st1 });
    const [wf0, wf1] = await pair('wildfire', ['vine-whip', 'ember'], 'burn');
    check(wf0.bBurn === 0 && wf1.bBurn > 0, `Wildfire: Vine Whip on a burning enemy spreads the burn (${wf0.bBurn} → ${wf1.bBurn})`, { wf0, wf1 });
    const [sh0, sh1] = await pair('shatter', ['karate-chop', 'ice-beam'], 'slow', { r: 40 });
    check(Math.abs(sh1.a / sh0.a - 1.35) < 0.08 && sh1.b === sh0.b, `Shatter: Karate Chop on the slowed enemy ×${(sh1.a / sh0.a).toFixed(2)}, the other one ×1`, { sh0, sh1 });
    const [qs0, qs1] = await pair('quicksand', ['mud-shot', 'water-gun'], 'slow');
    check(!(qs0.aStun > 0) && qs1.aStun > 0, `Quicksand: Mud Shot stops a slowed enemy (stun ${qs0.aStun} → ${qs1.aStun.toFixed(2)})`, { qs0, qs1 });
    const pause = await page.evaluate(() => { G.Game.player._labSyn = ['frost-fire']; G.RunUI.showPause(); const t = document.getElementById('pause-sum').textContent; G.UI.hide('scr-pause'); return t; });
    check(/Synergies: Frost Fire/.test(pause), 'the pause menu lists the synergies taken');
  }

  if (want('recipes')) {
    // ---------------- bond recipes ----------------
    console.log('recipes');
    await page.evaluate(() => { const pl = G.Game.player; pl.god = true; pl._labSyn = []; __only('sunny-day', 'solar-beam', 'water-gun'); pl.bonds = 1; G.Game.offerBond(); });
    await page.waitForFunction(() => G.UI.isOpen('scr-bond') && !document.getElementById('bond-cards').classList.contains('guard'), null, { timeout: 6000 });
    const cardsNow = () => page.evaluate(() => [...document.querySelectorAll('#bond-cards .card')].map(el => ({ nm: el.querySelector('.nm').textContent.trim(), recipe: (el.querySelector('.bond-recipe') || {}).textContent || null })));
    const step1 = await cardsNow();
    const at = (list, re) => list.findIndex(c => re.test(c.nm));
    check(/Solar Flare/.test(step1[at(step1, /Solar Beam/)].recipe || '') && !step1[at(step1, /Water Gun/)].recipe, 'bond screen, first pick: Solar Beam (and Sunny Day) say they make a recipe, Water Gun doesn\'t', step1);
    await page.click(`#bond-cards .card >> nth=${at(step1, /Sunny Day/)}`);
    const step2 = await page.waitForFunction(() => document.querySelectorAll('#bond-cards .card').length === 2 && document.querySelector('#bond-cards .card[data-recipes]'), null, { timeout: 3000 }).then(() => cardsNow());
    check(/Solar Flare/.test(step2[at(step2, /Solar Beam/)].recipe || '') && !step2[at(step2, /Water Gun/)].recipe, 'second pick (with Sunny Day): only Solar Beam makes one', step2);
    const m0 = await page.evaluate(() => G.Game.player.moves.find(m => m.id === 'solar-beam').charge);
    await page.click(`#bond-cards .card >> nth=${at(step2, /Solar Beam/)}`);
    await page.waitForFunction(() => !G.UI.isOpen('scr-bond') && G.Game.state === 'playing', null, { timeout: 8000 });
    const solar = await page.evaluate(async () => {
      const pl = G.Game.player, m = pl.moves.find(m => m.id === 'solar-beam');
      const fused = pl.slots.some(g => g.includes(m) && g.some(x => x.id === 'sunny-day'));
      const a = __dummy(...__at(120));
      pl.target = a; pl.aim = 0; pl.active = pl.slots.findIndex(g => g.includes(m));
      m.t = 0;
      const t0 = performance.now();
      await __until(() => a.hp < a.maxHp, 3000);
      return { fused, recipe: m._recipe, charge: m.charge, ms: Math.round(performance.now() - t0) };
    });
    check(solar.fused && solar.recipe === 'sun-solar' && solar.charge <= 0.05 && m0 >= 0.8, `fused on the real bond screen: Solar Beam's charge ${m0} → ${solar.charge}`, solar);
    check(solar.ms < 400, `and it fires at once (${solar.ms} ms to the hit)`, solar);
    /** Fuses `ids` (Player.fuse, as the bond screen does), casts the first on dummy a; b and c stand beside a. */
    const fused = (ids, prep) => page.evaluate(async ([ids, prep]) => {
      const pl = G.Game.player;
      __only(...ids);
      if (ids.length > 1) pl.fuse([pl.moves[0], pl.moves[1]]);
      G.Combat.tick(0.016, pl, performance.now());      // the frame that gives the recipe
      const m = pl.moves[0];
      const a = __dummy(...__at(90)), [ax, ay] = __at(90), b = __dummy(ax + 20, ay + 60), c = __dummy(ax + 20, ay - 60);
      pl.target = a; pl.aim = 0; pl.active = 0; m.t = 0; m.dealt = 0;
      for (const x of pl.moves) if (x !== m) x.t = 99;
      await __until(() => a.hp < a.maxHp, 3000);
      await __wait(80);
      return { recipe: m._recipe || null, homing: m.homing || 0, side: (b.maxHp - b.hp) + (c.maxHp - c.hp), burn: a.burn + b.burn + c.burn, stun: a.stunT, seed: !!a._seed };
    }, [ids, prep]);
    const rt0 = await fused(['thunder-shock']), rt1 = await fused(['thunder-shock', 'rain-dance']);
    check(rt1.recipe === 'rain-thunder' && rt1.homing >= 8 && rt0.side === 0 && rt1.side > 0, `Rain Dance + Thunder Shock: homing bolts that jump to the enemies beside (${rt0.side} → ${Math.round(rt1.side)})`, { rt0, rt1 });
    const wh0 = await fused(['hex']), wh1 = await fused(['hex', 'will-o-wisp']);
    check(wh1.recipe === 'wisp-hex' && wh0.burn === 0 && wh1.burn > 0, `Will-O-Wisp + Hex: Hex's chain burns (${wh0.burn} → ${wh1.burn})`, { wh0, wh1 });
    const sb0 = await fused(['ice-beam']), sb1 = await fused(['ice-beam', 'snowscape']);
    check(sb1.recipe === 'snow-beam' && !(sb0.stun > 0) && sb1.stun > 0, `Snowscape + Ice Beam: its hit stops the enemy (${sb0.stun} → ${sb1.stun.toFixed(2)})`, { sb0, sb1 });
    const sd0 = await fused(['giga-drain']), sd1 = await fused(['giga-drain', 'leech-seed']);
    check(sd1.recipe === 'seed-drain' && !sd0.seed && sd1.seed, 'Leech Seed + Giga Drain: Giga Drain seeds what it touches', { sd0, sd1 });
    // A resumed run gets its recipe back (resume.js rebuilds the slots).
    await page.evaluate(() => { const pl = G.Game.player; __only('sunny-day', 'solar-beam'); pl.fuse([pl.moves[0], pl.moves[1]]); G.Combat.tick(0.016, pl, performance.now()); pl.god = true; G.Resume.save(); G.Resume.resume(); });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => { const m = G.Game.player.moves.find(m => m.id === 'solar-beam'); return m && { recipe: m._recipe, charge: m.charge }; });
    check(back && back.recipe === 'sun-solar' && back.charge <= 0.05, 'a resumed run has the recipe again', back);
  }

  check(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll build checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
