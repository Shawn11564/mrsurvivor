#!/usr/bin/env node
// Lab builds (fork/LAB.md "Phase 11: builds"), in the game in headless Edge on dev.html, in a real
// Lab run on dummies that don't move:
//
//   node fork/serve.cjs                  (another terminal)
//   node fork/test-builds.cjs [base-url] [--only branches|sets]
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

  check(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll build checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
