#!/usr/bin/env node
// Lab mode (js/fork/lab/, fork/LAB.md), checked in the game in headless Edge on dev.html.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-lab.cjs [base-url] [screenshot-dir]
//
// Solo, as a guest (in-memory save):
//   1. The setting: Settings → Experimental has the Lab row and its switch flips G.Settings 'lab'.
//   2. Lab off: a run is not a Lab run, the level-up cards only offer the normal pool
//      (types + Normal), the Lab-only move (Swift) never shows, no ability, and the run is
//      sent to the leaderboard as usual.
//   3. Lab on: the run is a Lab run; the cards only offer the species' Lab pool, which
//      follows its learnset (Charmander: Dragon Breath / Metal Claw / Dragon Rage as coverage,
//      Caterpie topped up to the minimum); Swift can be learned and cast (star projectiles,
//      no errors); its ability is attached (Charmander: Blaze); "LAB" on the HUD; the pause
//      screen shows the ability and the pool.
//   4. Protections: the Lab run is not sent to the leaderboard, save.stats, missions and
//      achievements are as before, coins are kept, the summary says it's a Lab run and shows
//      no time record; back in the menu G.Lab.active is false and pools are normal again.
//   5. Abilities, on a real Player: damage taken (Levitate, Thick Fat, Intimidate, Water
//      Absorb, Wonder Guard, Sturdy), damage dealt (Blaze, Technician, Sheer Force), speed in
//      weather (Swift Swim), contact (Static), switching (Regenerator), and every implemented
//      ability survives a few seconds of a real run without errors.
//   7. New move kinds (js/fork/lab/kinds.js), each on dummies that don't move or hurt: leap (Fly),
//      recoil (Double-Edge; Rock Head), ramp (Fury Cutter), guard (Protect from another slot,
//      Counter), sleep (Hypnosis: a burn doesn't wake them, a hit does), confusion (Confuse Ray),
//      weather zones (Rain Dance, Sandstorm, Snowscape: around you, never the arena's), terrain (Electric, Misty), wave (Surf), Metronome, Transform; every
//      Lab move at its top level in a real run; a new kind evolving (Fly → Sky Attack).
//   8. Signature moves: only for their line (Blast Burn only for Charizard), gold "Signature"
//      card, Pikachu's own QuickStrike animation for Volt Tackle, evolving at the top level.
//   9. Lower tiers (js/fork/lab/growth.js): Charmander evolves during the run (card, sprite, HP,
//      ability, pool), then Charizard with Blast Burn; Everstone; Eviolite, Light Ball, items in
//      chests; underdog XP; candies from gacha duplicates and the bonus of the points they buy.
//  10. Shinies (js/fork/lab/shiny.js): shiny Charizard's moves use its shiny palette; +10% XP,
//      +10% coins, +1 reroll.
//  11. Mega Evolution, Lab only (js/fork/mega.js): the menu marks with Lab on, the 1 in 30 drop
//      from minute 5, a real rift giving Gengar its stone, the stats, Mega Charizard X's types.
//  12. Promotion (phase 8): a Lab move marked `promote` joins the normal game's pools.
// Co-op (host on, guest off; host off, guest on) is in fork/test-lab-coop.cjs.
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.argv[3] || null;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.DB.playAsGuest && G.Game && G.Lab, null, { timeout: 30000 });
  // The LAB tag's look is in the fork's css/brand.css, which only the built pages link (fork/build.cjs).
  await page.addStyleTag({ url: BASE + '/css/brand.css' });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    for (const d of [4, 10]) G.DB.save.owned[d] = G.DB.save.owned[d] || { at: Date.now() };
    G.DB.save.partner = 4;
    G.Settings.set('lab', false);
    // Leaderboard spy: what endRun sends (guest saves never reach the server anyway).
    window.__sent = [];
    const sub = G.Ranking.submitSolo;
    G.Ranking.submitSolo = r => { window.__sent.push(r); return sub(r); };
    G.MenuUI.open();
  });

  // ---------------- 1. setting ----------------
  console.log('Setting');
  await page.evaluate(() => document.getElementById('btn-settings').click());
  await page.click('#set-tabs [data-t="gfx"]');
  const inGfx = await page.$('#set-body .switch[data-k="lab"]');
  await page.click('#set-tabs [data-t="lab"]');
  const row = inGfx ? null : await page.$('#set-body .switch[data-k="lab"]');
  check(!!row, 'Settings → Experimental has the Lab mode switch (and Graphics no longer does)');
  if (row) await row.click();
  check(await page.evaluate(() => G.Settings.get('lab') === true), 'clicking it turns Lab on (G.Settings lab)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'lab-setting.png') });
  await page.evaluate(() => { G.Settings.set('lab', false); document.getElementById('set-close').click(); });

  // Runs as fast as the page allows; offers sampled straight from G.LevelUp.
  const startRun = async dex => {
    await page.evaluate(d => { G.DB.save.partner = d; G.Game.startRun(); }, dex);
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Game.player.activeMove(), null, { timeout: 30000 });
  };
  const offers = () => page.evaluate(() => {
    const pl = G.Game.player, seen = new Set();
    for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new') seen.add(c.key.slice(4));
    return [...seen];
  });
  const endRun = async () => {
    await page.evaluate(() => G.Game.quit());
    await page.waitForSelector('#btn-again', { state: 'visible', timeout: 15000 });
  };
  const toMenu = async () => {
    await page.click('#btn-again');
    await page.waitForFunction(() => G.Game.state === 'ui' && !G.Game.player, null, { timeout: 15000 });
  };

  // ---------------- 2. Lab off ----------------
  console.log('Lab off');
  await startRun(4);
  const off = await page.evaluate(() => {
    const pl = G.Game.player;
    const normal = new Set(['normal', ...pl.mon.types].flatMap(t => G.Moves.POOL[t] || []));
    return { active: G.Lab.active, ability: pl.labAbility || null, normal: [...normal] };
  });
  const offOffers = await offers();
  check(!off.active, 'a run with Lab off is not a Lab run');
  check(offOffers.length > 0 && offOffers.every(id => off.normal.includes(id)), `the cards only offer the normal pool (${offOffers.length} moves seen)`);
  check(!offOffers.includes('swift'), 'the Lab-only move (Swift) never shows');
  check(off.ability === null, 'no ability');
  await endRun();
  check(await page.evaluate(() => window.__sent.length === 1), 'the run is sent to the leaderboard as usual');
  await toMenu();

  // ---------------- 3. Lab on ----------------
  console.log('Lab on');
  const before = await page.evaluate(() => {
    const s = G.DB.save;
    s.stats.bestTime = 0;                                      // a quit run would be a "record"
    return { stats: JSON.stringify(s.stats), ach: JSON.stringify(s.ach || {}), missions: JSON.stringify(s.missions || {}), coins: s.coins };
  });
  await page.evaluate(() => G.Settings.set('lab', true));
  await startRun(4);
  const on = await page.evaluate(() => {
    const pl = G.Game.player;
    return { active: G.Lab.active, pool: G.Moves.poolFor(pl.mon), learn: G.Lab.learnOf(4), ability: pl.labAbility, info: G.Lab.ability,
             hud: !document.getElementById('lab-hud').classList.contains('hidden') && document.getElementById('lab-hud').textContent,
             // A small tag centred at the top, above the game canvas (not a full-width bar under it).
             hudBox: (() => { const r = document.getElementById('lab-hud').getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - innerWidth / 2) < 2 && r.width < 200 && r.y < 20; })() };
  });
  const onOffers = await offers();
  check(on.active, 'a run with Lab on is a Lab run');
  check(onOffers.length > 0 && onOffers.every(id => on.pool.includes(id)), `the cards only offer Charmander's Lab pool (${onOffers.join(', ')})`);
  const cover = on.pool.filter(id => ['dragon-breath', 'dragon-rage', 'metal-claw'].includes(id));
  check(cover.length >= 1, `its coverage comes from moves it learns by level-up in the games (${cover.join(', ')})`);
  check(on.pool.includes('swift') === !!on.learn.swift, `Swift is in its pool exactly when it learns Swift in the games (${!!on.learn.swift})`);
  check(on.ability === 'blaze' && on.info && on.info.name === 'Blaze', `Charmander has Blaze (${on.info && on.info.name})`);
  check(on.hud === 'LAB · Blaze' && on.hudBox, `"LAB · Blaze" shows as a small tag at the top of the HUD (${on.hud})`);

  // Swift: learn it and let it fire for a moment.
  const swift = await page.evaluate(async () => {
    const pl = G.Game.player;
    pl.slots.length = 0; pl.moves.length = 0;
    pl.addMove('swift');
    pl.invuln = 99;
    // Something to aim at: a few enemies of the current wave, close by.
    for (let i = 0; i < 4; i++) {
      const sc = G.Enemies.scale(G.Game.st.time), a = i * 1.57;
      G.EnemyMgr.add(new G.Enemy(G.U.pick(G.Enemies.bagAt(G.Game.st.time)), pl.x + Math.cos(a) * 160, pl.y + Math.sin(a) * 140, Object.assign({}, sc, { hp: sc.hp * 40 }), false));
    }
    let stars = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      await new Promise(r => setTimeout(r, 50));
      stars = Math.max(stars, G.Projectiles.all().filter(p => p.owner === pl && p.vis && p.vis.proj === 'star' && p.vis.pal === 'electric').length);
    }
    return { has: pl.hasMove('swift'), stars, def: !!G.Moves.BY_ID.swift, inAll: G.Moves.ALL.some(m => m.id === 'swift') };
  });
  check(swift.has && swift.def && !swift.inAll, 'Swift is registered for Lab runs only (BY_ID yes, ALL no) and can be learned');
  check(swift.stars > 0, `Swift fires yellow star projectiles (${swift.stars} seen at once)`);

  // Pause screen.
  await page.evaluate(() => G.Game.togglePause());
  const pause = await page.evaluate(() => {
    const b = document.querySelector('#pause-sum .lab-pause');
    return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), icons: b.querySelectorAll('.lab-pool span').length } : null;
  });
  check(!!pause && /Ability: Blaze/.test(pause.text) && pause.icons === on.pool.length, `the pause screen shows the ability and the ${on.pool.length} moves it can learn`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'lab-pause.png') });
  await page.evaluate(() => { G.UI.hide('scr-pause'); G.Game.togglePause(); });

  // ---------------- 4. protections ----------------
  console.log('Protections');
  await page.evaluate(() => { G.Game.player.coins += 50; });
  await endRun();
  const after = await page.evaluate(() => {
    const s = G.DB.save;
    return { stats: JSON.stringify(s.stats), ach: JSON.stringify(s.ach || {}), missions: JSON.stringify(s.missions || {}), coins: s.coins,
             sent: window.__sent.length, note: !!document.querySelector('#over-stats .lab-over'),
             // The time-record line (run-ui.js showOver), not the Lab note (which mentions records).
             record: [...document.querySelectorAll('#over-stats > div')].some(d => !d.classList.contains('lab-over') && /récord|record/i.test(d.textContent)) };
  });
  check(after.sent === 1, 'the Lab run is not sent to the leaderboard');
  check(after.stats === before.stats, 'save.stats (records, run counts) are as before');
  check(after.ach === before.ach && after.missions === before.missions, 'missions and achievements are as before');
  check(after.coins > before.coins, `coins are kept (${before.coins} → ${after.coins})`);
  check(after.note && !after.record, 'the summary says it was a Lab run and shows no time record');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'lab-over.png') });
  await toMenu();
  const menu = await page.evaluate(() => {
    const mon = G.DEX_BY[4];
    const normal = new Set(['normal', 'fire'].flatMap(t => G.Moves.POOL[t]));
    return { active: G.Lab.active, normal: G.Moves.poolFor(mon).every(id => normal.has(id)), hud: document.getElementById('lab-hud').classList.contains('hidden') };
  });
  await page.waitForTimeout(500);
  check(!menu.active && menu.normal, 'back in the menu, G.Lab.active is false and pools are the normal ones (start-move picker, bans)');
  check(await page.evaluate(() => document.getElementById('lab-hud').classList.contains('hidden')), 'the LAB tag is gone');

  // Caterpie: learns 3 catalog moves in the games, topped up to the minimum.
  await startRun(10);
  const cat = await page.evaluate(() => ({ pool: G.Moves.poolFor(G.Game.player.mon), learn: Object.keys(G.Lab.learnOf(10)) }));
  check(cat.pool.length >= 6 && cat.learn.every(id => cat.pool.includes(id)), `Caterpie's pool has what it learns plus a top-up (${cat.pool.join(', ')})`);
  await endRun(); await toMenu();

  // ---------------- 5. abilities ----------------
  console.log('Abilities');
  await startRun(4);
  const ab = await page.evaluate(() => {
    const out = {};
    const mk = (dex, ability) => {
      const p = new G.Player(G.DEX_BY[dex]);
      p.labAbility = ability;
      const d = G.LabAbilities.DEF[ability];
      if (d.start) d.start(p);
      p.x = 0; p.y = 0;
      return p;
    };
    const taken = (p, amount, type, cat) => { p.invuln = 0; const h = p.hp; p.hurt(amount, type, false, cat); return h - p.hp; };
    // Damage taken (same Pokémon with and without the ability).
    const plain = mk(4, 'blaze');
    out.ground = [taken(mk(92, 'levitate'), 20, 'ground'), taken(mk(92, 'levitate'), 20, 'normal')];
    out.fat = [taken(mk(143, 'thick-fat'), 30, 'fire'), taken((() => { const p = new G.Player(G.DEX_BY[143]); return p; })(), 30, 'fire')];
    out.intim = [taken(mk(4, 'intimidate'), 30, null, 'physical'), taken(plain, 30, null, 'physical')];
    const wa = mk(7, 'water-absorb'); wa.hp = 10; wa.invuln = 0; wa.hurt(40, 'water'); out.absorb = wa.hp;
    const wg = mk(292, 'wonder-guard');
    out.wonder = { half: wg.maxHp === Math.round(new G.Player(G.DEX_BY[292]).maxHp / 2), neutral: taken(wg, 20, 'water'), se: taken(wg, 20, 'fire') };
    const st = mk(74, 'sturdy');
    st.invuln = 0; st.hurt(9999, 'water'); out.sturdy1 = { dead: st.dead, hp: st.hp };
    st.hp = st.maxHp; st.invuln = 0; st.hurt(9999, 'water'); out.sturdy2 = st.dead;
    // Damage dealt.
    const bz = mk(4, 'blaze'), ember = G.Moves.instance('ember');
    const full = bz.atkFor(ember); bz.hp = bz.maxHp * 0.2; out.blaze = bz.atkFor(ember) / full;
    const tech = mk(123, 'technician'), tp = new G.Player(G.DEX_BY[123]);
    out.tech = [tech.atkFor(G.Moves.instance('tackle')) / tp.atkFor(G.Moves.instance('tackle')),
                tech.atkFor(G.Moves.instance('flamethrower')) / tp.atkFor(G.Moves.instance('flamethrower'))];
    const sf = mk(4, 'sheer-force'); sf.addMove('ember');
    const sm = sf.moves[sf.moves.length - 1];
    out.sheer = { burn: sm.burn, k: sf.atkFor(sm) / new G.Player(G.DEX_BY[4]).atkFor(G.Moves.instance('ember')) };
    // Speed in the rain.
    const ss = mk(7, 'swift-swim'), sp0 = ss.spd;
    G.Weather.force('rain', 30);
    G.Weather.update(3, 0, null);                    // weather fades in over 3 s
    out.swim = ss.spd / sp0;
    G.Weather.reset();
    // Contact: Static stuns (random forced).
    const rnd = Math.random; Math.random = () => 0.01;
    const sc = G.Enemies.scale(0);
    const e = new G.Enemy(G.U.pick(G.Enemies.bagAt(0)), 300, 300, sc, false);
    let stunned = null;
    if (e) { const s0 = e.applyStun; e.applyStun = d => { stunned = d; }; e.strike(mk(25, 'static')); e.applyStun = s0; }
    Math.random = rnd;
    out.static = stunned;
    // Switching.
    const rg = mk(80, 'regenerator'); rg.addMove('tackle'); rg.addMove('water-gun'); rg.hp = 10; rg.setActive(1); out.regen = rg.hp > 10;
    return out;
  });
  check(ab.ground[0] === 0 && ab.ground[1] > 0, `Levitate: Ground attacks do nothing, others hurt (${ab.ground})`);
  check(Math.abs(ab.fat[0] / ab.fat[1] - 0.5) < 0.05, `Thick Fat: Fire deals half (${ab.fat})`);
  check(Math.abs(ab.intim[0] / ab.intim[1] - 0.75) < 0.05, `Intimidate: physical hits deal 75% (${ab.intim})`);
  check(ab.absorb > 10, `Water Absorb: a Water hit heals (hp 10 → ${ab.absorb})`);
  check(ab.wonder.half && ab.wonder.neutral === 0 && ab.wonder.se > 0, `Wonder Guard: half HP, neutral hit blocked, super-effective hurts (${JSON.stringify(ab.wonder)})`);
  check(!ab.sturdy1.dead && ab.sturdy1.hp === 1 && ab.sturdy2, `Sturdy: survives at 1 HP once, then not again within a minute`);
  check(Math.abs(ab.blaze - 1.5) < 0.01, `Blaze: Fire moves ×1.5 at low HP (${ab.blaze.toFixed(2)})`);
  check(Math.abs(ab.tech[0] - 1.5) < 0.01 && Math.abs(ab.tech[1] - 1) < 0.01, `Technician: Tackle (40) ×1.5, Flamethrower (90) ×1 (${ab.tech.map(x => x.toFixed(2))})`);
  check(ab.sheer.burn === 0 && Math.abs(ab.sheer.k - 1.3) < 0.01, `Sheer Force: Ember loses its burn and deals ×1.3 (${JSON.stringify(ab.sheer)})`);
  check(Math.abs(ab.swim - 1.4) < 0.01, `Swift Swim: ×1.4 speed in the rain (${ab.swim.toFixed(2)})`);
  check(ab.static != null && ab.static > 0, `Static: an enemy that touches you can be stunned (${ab.static})`);
  check(ab.regen, 'Regenerator: switching moves heals');
  await endRun(); await toMenu();

  // Every ability for a few seconds of a real run.
  const all = await page.evaluate(() => Object.keys(G.LabAbilities.DEF));
  const errs0 = errors.length;
  await startRun(4);
  for (const id of all) {
    await page.evaluate(id => {
      const pl = G.Game.player, d = G.LabAbilities.DEF[id];
      pl.labAbility = id; pl.invuln = 0;
      if (d.start) d.start(pl);
      if (d.learn) for (const m of pl.moves) d.learn(pl, m);
      pl.hurt(5, 'water', false, 'physical'); pl.hurt(5, null); pl.cycle(1);
      pl.hp = pl.maxHp;
    }, id);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  check(errors.length === errs0 && await page.evaluate(() => G.Game.state === 'playing' || G.Game.state === 'levelup'),
        `all ${all.length} abilities run in a real run without errors`);
  await endRun(); await toMenu();

  // Coverage: species whose ability does something.
  const cov = await page.evaluate(() => {
    const n = G.DEX.length, on = G.DEX.filter(p => (G.LabAbilities.of(p.dex) || {}).on).length;
    return { n, on };
  });
  console.log(`  info: ${cov.on} of ${cov.n} species (${Math.round(cov.on / cov.n * 100)}%) get an ability that does something`);

  // Helpers in the page for the phase 4-7 checks: dummies that don't move or hurt, and waiting.
  await page.evaluate(() => {
    window.__until = (f, ms = 3000) => new Promise(r => { const t0 = performance.now(); (function s() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(s, 30); })(); });
    window.__dummy = (x, y, o = {}) => {
      const def = { dex: o.dex || 19, name: 'Dummy', hp: o.hp || 1e6, spd: 0, dmg: o.dmg || 0, xp: 0, behavior: 'chase' };
      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
      if (!o.typed) e.types = ['none'];
      G.EnemyMgr.add(e);
      return e;
    };
    // A quiet arena: no spawns, events, rifts or weather while these run. Weather that starts on its
    // own is cleared (a sandstorm or hail chips HP every 2 s, which once passed for Double-Edge
    // recoil under Rock Head); weather a test asks for (debugStart, force) still runs.
    const W = G.Weather, wxUpdate = W.update, wxStart = W.debugStart, wxForce = W.force;
    let wxAsked = false, wxSeen = false;
    W.debugStart = function () { wxAsked = true; wxSeen = false; return wxStart.apply(this, arguments); };
    W.force = function () { wxAsked = true; wxSeen = false; return wxForce.apply(this, arguments); };
    window.__quiet = on => {
      const k = ['Spawner', 'Events', 'Rift', 'Hazards'];
      if (on) {
        W.clear(); wxAsked = false;
        window.__q = k.map(n => G[n].update); k.forEach(n => { G[n].update = () => {}; });
        W.update = function () {
          const r = wxUpdate.apply(this, arguments);
          if (W.current) { if (!wxAsked) W.clear(); else wxSeen = true; }
          else if (wxSeen) wxAsked = wxSeen = false;      // the asked-for weather is over
          return r;
        };
      } else if (window.__q) { k.forEach((n, i) => { G[n].update = window.__q[i]; }); window.__q = null; W.update = wxUpdate; }
    };
    // Open ground (nothing solid within R): the dummies go at fixed distances, and a tree or rock in
    // between stopped dashes short (Double-Edge "costing no HP" was a Double-Edge that never hit).
    window.__open = (R = 240) => {
      const pl = G.Game.player;
      const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= R; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, pl.r, true)) return false; return true; };
      if (ok(pl.x, pl.y)) return true;
      for (let r = 64; r < 6000; r += 64) for (let a = 0; a < 6.283; a += 0.5) {
        const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r;
        if (ok(x, y)) { pl.x = x; pl.y = y; return true; }
      }
      return false;
    };
    window.__only = id => { const pl = G.Game.player; pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; G.EnemyMgr.clear(); G.Combat.clearFields(); __open(); pl.addMove(id); return pl.moves[0]; };
  });

  // ---------------- 7. new move kinds (phase 4, js/fork/lab/kinds.js) ----------------
  console.log('New move kinds');
  await startRun(4);
  // The quiet arena itself: weather that starts on its own (as a random one does) is cleared.
  const calm = await page.evaluate(async () => {
    __quiet(true);
    G.Weather.onEvent(['wx', 'sand', 60]);                // internal start(), not asked for
    await new Promise(r => setTimeout(r, 400));
    const w = G.Weather.current;
    __quiet(false);
    return !w;
  });
  check(calm, 'test harness: the quiet arena keeps weather that starts on its own out (sandstorm chip damage)');
  const kinds = await page.evaluate(async () => {
    __quiet(true);
    const pl = G.Game.player, out = {};
    pl.xpMul = 0; G.Pickups.clear();
    const at = (r, a = 0) => [pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r];
    // leap: off the ground (can't be hit) and lands on the target with a hit.
    let m = __only('fly'), e = __dummy(...at(200));
    await __until(() => pl._labLeap, 3000);
    const inv = pl.invuln > 0.4, h0 = pl.hp;
    pl.hurt(50, null, false, 'physical');
    const blocked = pl.hp === h0;
    await __until(() => !pl._labLeap, 2000);
    await new Promise(r => setTimeout(r, 60));
    out.leap = { inv, blocked, near: Math.round(G.U.dist(pl.x, pl.y, e.x, e.y)), hit: e.hp < e.maxHp };
    // recoil: costs HP (never below 1); Rock Head doesn't pay it.
    m = __only('double-edge'); e = __dummy(...at(80));
    pl.hp = pl.maxHp;
    await __until(() => m.dealt > 0, 3000);
    await new Promise(r => setTimeout(r, 60));
    out.recoil = { lost: Math.round(pl.maxHp - pl.hp), cap: Math.round(pl.maxHp * 0.12) };
    pl.hp = pl.maxHp; pl.labAbility = 'rock-head'; m.dealt = 0;
    await __until(() => m.dealt > 0, 3000);
    await new Promise(r => setTimeout(r, 60));
    out.rockHead = pl.hp === pl.maxHp;
    pl.labAbility = 'blaze';
    // ramp: grows with each hit up to its max, starts over when nothing is there.
    m = __only('fury-cutter');
    for (let i = 0; i < 4; i++) __dummy(...at(36, i * 1.57));
    await __until(() => (m._ramp || 0) >= m.stacks, 5000);
    out.ramp = { top: m._ramp, stacks: m.stacks };
    G.EnemyMgr.clear();
    await new Promise(r => setTimeout(r, 2200));
    __dummy(...at(36)); m.t = 0;
    await __until(() => m._rampAt && performance.now() - m._rampAt < 100, 2000);
    out.ramp.after = m._ramp;
    // guard: Protect in another slot raises itself when something is close, and blocks.
    m = __only('ember'); pl.addMove('protect'); pl.active = 0;
    __dummy(...at(40));
    out.protect = await __until(() => pl._labGuard, 6000);
    pl.invuln = 0; const h1 = pl.hp; pl.hurt(30, null, false, 'physical');
    out.protect = out.protect && pl.hp === h1;
    // In the active slot too, but only when something is about to hit you (not at a rock or chest
    // the Pokémon aims at, pl.target).
    await __until(() => !pl._labGuard, 2000);
    __only('protect');
    await new Promise(r => setTimeout(r, 1500));
    out.idle = !pl._labGuard;
    __dummy(...at(40));
    out.activeSlot = await __until(() => pl._labGuard, 4000);
    await __until(() => !pl._labGuard, 2000);
    // Counter: half from physical hits while it lasts, then a blast with the stored damage.
    await __until(() => !pl._labGuard, 2000);
    m = __only('ember'); const ctr = (pl.addMove('counter'), pl.moves[1]); pl.active = 0;
    const ce = __dummy(...at(40));
    await __until(() => pl._labGuard, 6000);
    const g = pl._labGuard;
    pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical');
    const stored = g.stored, hp1 = ce.hp;
    await __until(() => !pl._labGuard, 3000);
    await new Promise(r => setTimeout(r, 60));
    out.counter = { stored, took: Math.round(pl.maxHp - pl.hp), blast: Math.round(hp1 - ce.hp) };
    // sleep: Hypnosis puts them to sleep; a hit wakes them, a burn tick doesn't.
    m = __only('hypnosis');
    const zs = [0, 1, 2].map(i => __dummy(...at(140 + i * 8, 0.2 * i)));
    await __until(() => zs.filter(z => z.labSleep > 0).length >= 2, 5000);
    const asleep = zs.filter(z => z.labSleep > 0);
    pl.slots.length = 0; pl.moves.length = 0;
    await new Promise(r => setTimeout(r, 300));
    out.sleep = { n: asleep.length, stun: asleep.every(z => z.stunT > 0) };
    asleep[0].hurt(3, '#ff9a4d');
    out.sleep.burnKeeps = asleep[0].labSleep > 0;
    asleep[0].hurt(3, '#ffffff');
    out.sleep.hitWakes = !(asleep[0].labSleep > 0) && !(asleep[0].stunT > 0);
    // confusion: Confuse Ray; a confused one doesn't touch you and hits the one next to it.
    m = __only('confuse-ray');
    const ca = __dummy(...at(150)), cb = __dummy(ca.x + 18, ca.y);
    await __until(() => ca.labConf > 0 || cb.labConf > 0, 5000);
    pl.slots.length = 0; pl.moves.length = 0;
    const conf = ca.labConf > 0 ? ca : cb, other = conf === ca ? cb : ca, oh = other.hp;
    await new Promise(r => setTimeout(r, 1200));
    out.conf = { touch: conf.touchCd > 0, hits: Math.round(oh - other.hp) };
    // weather (2026-10-21): a few seconds of it around you, never the arena's weather. Rain: Water ×1.3
    // inside; Sandstorm wears down the enemies inside; Snowscape slows them.
    G.EnemyMgr.clear(); G.Weather.reset();
    m = __only('rain-dance');
    const zoneOf = wx => G.LabKinds.fields().find(f => f.kind === 'wxzone' && f.wx === wx);
    const rz = await __until(() => zoneOf('rain'), 3000);
    const wg = G.Moves.instance('water-gun'), wIn = pl.atkFor(wg), z = zoneOf('rain');
    if (z) z.gone = true;
    const wOut = pl.atkFor(wg);
    out.rain = { zone: !!rz, boost: +(wIn / wOut).toFixed(2), arena: !!G.Weather.current, follows: !!z && Math.abs(z.x - pl.x) < 1 };
    m = __only('sandstorm');
    const se = __dummy(...at(60)), shp = se.hp;
    await __until(() => zoneOf('sand'), 3000);
    await new Promise(r => setTimeout(r, 1200));
    out.sand = { hurt: Math.round(shp - se.hp), arena: !!G.Weather.current };
    m = __only('snowscape');
    const ne = __dummy(...at(60));
    await __until(() => ne.slow > 0, 3000);
    out.snow = { slow: ne.slow, arena: !!G.Weather.current };
    pl.slots.length = 0; pl.moves.length = 0;
    G.Weather.reset();
    // terrain: Electric Terrain: Electric moves ×1.3 inside; Misty: 25% less damage inside.
    m = __only('electric-terrain');
    await __until(() => G.LabKinds.fields().some(f => f.kind === 'terrain'), 3000);
    const ts = G.Moves.instance('thunder-shock'), inK = pl.atkFor(ts);
    pl.x += 2000; const outK = pl.atkFor(ts); pl.x -= 2000;
    out.terrain = +(inK / outK).toFixed(2);
    m = __only('misty-terrain');
    await __until(() => G.LabKinds.fields().some(f => f.kind === 'terrain' && f.terr === 'misty'), 3000);
    pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical'); const inM = pl.maxHp - pl.hp;
    pl.x += 2000; pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(40, null, false, 'physical'); const outM = pl.maxHp - pl.hp; pl.x -= 2000;
    out.misty = +(inM / outM).toFixed(2);
    // wave: Surf hits and carries them away.
    m = __only('surf');
    const wv = __dummy(...at(90)), d0 = G.U.dist(pl.x, pl.y, wv.x, wv.y);
    await __until(() => m.dealt > 0, 3000);
    await new Promise(r => setTimeout(r, 500));
    out.wave = { hit: wv.hp < wv.maxHp, pushed: Math.round(G.U.dist(pl.x, pl.y, wv.x, wv.y) - d0) };
    // metronome: a different move each time, its damage counted on Metronome.
    m = __only('metronome');
    for (let i = 0; i < 6; i++) __dummy(...at(70 + i * 20, i));
    const called = new Set(), run = G.Combat.run;
    G.Combat.run = function (p, x) { if (p === pl) called.add(x.id); return run.apply(this, arguments); };
    await new Promise(r => setTimeout(r, 4500));
    G.Combat.run = run;
    out.metronome = { called: called.size, dealt: Math.round(m.dealt || 0) };
    // transform: turns into the nearest enemy (look and types) and uses its move; then back.
    m = __only('transform');
    const tp = __dummy(...at(120), { dex: 25, typed: true });
    await __until(() => pl._labTf, 3000);
    const tf = pl._labTf;
    out.transform = { dex: pl.anim.dex, types: pl.mon.types.join(), move: tf && tf.inst.id };
    tf.t = 0.05;
    await __until(() => !pl._labTf, 2000);
    out.transform.back = { dex: pl.anim.dex, types: pl.mon.types.join() };
    G.EnemyMgr.clear(); __quiet(false);
    return out;
  });
  check(kinds.leap.inv && kinds.leap.blocked && kinds.leap.near < 40 && kinds.leap.hit, `Fly: can't be hit in the air, lands on the target and hits it (${JSON.stringify(kinds.leap)})`);
  check(kinds.recoil.lost > 0 && kinds.recoil.lost <= kinds.recoil.cap + 1 && kinds.rockHead, `Double-Edge costs HP (${kinds.recoil.lost}, at most ${kinds.recoil.cap}); with Rock Head it costs none`);
  check(kinds.ramp.top === kinds.ramp.stacks && kinds.ramp.after <= 1, `Fury Cutter builds up to ×${kinds.ramp.stacks} hits in a row and starts over after a pause (${JSON.stringify(kinds.ramp)})`);
  check(kinds.protect, 'Protect raises itself from another slot when an enemy is close, and blocks the hit');
  check(kinds.idle && kinds.activeSlot, 'as the active move, Protect stays down with nothing around and goes up when an enemy comes close');
  check(kinds.counter.stored === 40 && kinds.counter.took > 0 && kinds.counter.blast > 0, `Counter: takes half, stores the hit (${kinds.counter.stored}) and sends it back in a blast (${kinds.counter.blast})`);
  check(kinds.sleep.n >= 2 && kinds.sleep.stun && kinds.sleep.burnKeeps && kinds.sleep.hitWakes, `Hypnosis: they fall asleep (can't act), a burn tick doesn't wake them, a hit does (${JSON.stringify(kinds.sleep)})`);
  check(kinds.conf.touch && kinds.conf.hits > 0, `Confuse Ray: the confused one doesn't touch you and hits the one next to it (${kinds.conf.hits} damage)`);
  check(kinds.rain.zone && kinds.rain.boost === 1.3 && !kinds.rain.arena && kinds.rain.follows,
    `Rain Dance: rain around you (it follows you), Water ×1.3 inside, and not the arena's weather: ${JSON.stringify(kinds.rain)}`);
  check(kinds.sand.hurt > 0 && !kinds.sand.arena, `Sandstorm wears down an enemy inside, no arena weather: ${JSON.stringify(kinds.sand)}`);
  check(kinds.snow.slow > 0 && !kinds.snow.arena, `Snowscape slows an enemy inside, no arena weather: ${JSON.stringify(kinds.snow)}`);
  check(kinds.terrain === 1.3 && kinds.misty === 0.75, `Electric Terrain: Electric moves ×${kinds.terrain} inside; Misty Terrain: ×${kinds.misty} damage taken inside`);
  check(kinds.wave.hit && kinds.wave.pushed > 40, `Surf hits and carries the enemy away (${kinds.wave.pushed} px)`);
  check(kinds.metronome.called >= 3 && kinds.metronome.dealt > 0, `Metronome calls a different move each time (${kinds.metronome.called} different), its damage counted on it (${kinds.metronome.dealt})`);
  check(kinds.transform.dex === 25 && kinds.transform.types === 'electric' && kinds.transform.move && kinds.transform.back.dex === 4 && kinds.transform.back.types === 'fire',
    `Transform: becomes the nearest enemy (Pikachu, Electric, uses ${kinds.transform.move}), then back to Charmander`);

  // Every Lab move for a moment of a real run, at its top level (evolved when it can).
  const labIds = await page.evaluate(() => G.LabMoves.map(m => m.id));
  const e0 = errors.length;
  const evolvedNames = [];
  for (const id of labIds) {
    evolvedNames.push(await page.evaluate(async id => {
      __quiet(true);
      const pl = G.Game.player; pl.god = true; pl.xpMul = 0;
      const m = __only(id);
      while (G.Moves.levelUp(m)) {}
      G.Moves.evolve(m);
      for (let i = 0; i < 4; i++) __dummy(pl.x + Math.cos(i * 1.6) * 90, pl.y + Math.sin(i * 1.6) * 70);
      await new Promise(r => setTimeout(r, 450));
      __quiet(false);
      if (G.Game.state === 'levelup') G.RunUI.pick(0);
      return G.T(m.name, 'move');
    }, id));
  }
  check(errors.length === e0, `all ${labIds.length} Lab moves cast at their top level in a real run without errors`);
  const evoCard = await page.evaluate(() => {
    const pl = G.Game.player, m = __only('fly');
    while (G.Moves.levelUp(m)) {}
    pl.statsTaken = { spd: 1 };
    const c = G.LevelUp.offer(pl).find(c => c.key === 'evo:fly');
    const d0 = m.dmg;
    if (c) c.apply(pl);
    return { title: c && c.title, name: m.name, k: +(m.dmg / d0).toFixed(2) };
  });
  // Dual Wingbeat, not Sky Attack (Moltres's signature): js/fork/evo-names.js.
  check(evoCard.title === 'Fly → Dual Wingbeat' && evoCard.name === 'Dual Wingbeat' && evoCard.k === 1.9, `new kinds evolve too: "${evoCard.title}" (×${evoCard.k} damage)`);
  await endRun(); await toMenu();

  // ---------------- 8. signature moves (phase 5) ----------------
  console.log('Signature moves');
  const sig = await page.evaluate(() => {
    const pool = d => G.Lab.poolFor(G.DEX_BY[d]);
    return { c4: pool(4).includes('blast-burn'), c6: pool(6).includes('blast-burn'), p25: pool(25).includes('volt-tackle'), p172: pool(172).includes('volt-tackle'),
             c10: pool(10).filter(id => G.Moves.BY_ID[id].sig), normal: G.Moves.poolFor(G.DEX_BY[25]).includes('volt-tackle') };
  });
  check(!sig.c4 && sig.c6, 'Blast Burn is only for the last evolution (Charizard has it, Charmander not)');
  check(sig.p25 && sig.p172 && !sig.c10.length, 'Volt Tackle is for the whole Pikachu line (Pichu too); Caterpie has no signature');
  check(!sig.normal, 'outside a Lab run, signatures are not in the pool');
  await startRun(25);
  const vt = await page.evaluate(async () => {
    const pl = G.Game.player;
    pl.slots.length = 0; pl.moves.length = 0; pl.addMove('thunder-shock');
    let seen = 0, card = null;
    for (let i = 0; i < 400 && !card; i++) { card = G.LevelUp.offer(pl).find(c => c.key === 'new:volt-tackle'); seen++; }
    __quiet(true);
    const m = __only('volt-tackle');
    __dummy(pl.x + 90, pl.y);
    let anim = null;
    await __until(() => { if (pl.anim.cur.startsWith('lab/')) anim = pl.anim.cur; return anim; }, 4000);
    // (Its sheet is asked for when the run starts, G.LabAnims.preload; a few hundred ms to arrive.)
    const sheet = anim && G.Sprites.sheet(25, anim);
    if (sheet) await __until(() => sheet.ready || sheet.failed, 4000);
    while (G.Moves.levelUp(m)) {}
    const ev = G.Moves.evoInfo(m, {});
    __quiet(false);
    return { card: card && { type: card.type, tag: card.tag }, hands: seen, anim, ready: !!(sheet && sheet.ready), evo: ev && ev.name, evoReady: ev && ev.ready };
  });
  check(!!vt.card && vt.card.type === 'evo' && vt.card.tag === "Signature · Electric · Physical", `Pikachu's level-up cards offer Volt Tackle as a gold "Signature" card (${JSON.stringify(vt.card)}, within ${vt.hands} hands)`);
  check(vt.anim === 'lab/QuickStrike' && vt.ready, `Volt Tackle plays Pikachu's own QuickStrike animation (${vt.anim}, sheet loaded: ${vt.ready})`);
  check(vt.evo === 'Volt Tackle ★' && vt.evoReady, `at its top level a signature evolves with no condition ("${vt.evo}")`);
  await endRun(); await toMenu();

  // ---------------- 9. lower tiers (phase 6, js/fork/lab/growth.js) ----------------
  console.log('Lower tiers');
  await startRun(4);
  const grow = await page.evaluate(() => {
    const pl = G.Game.player, out = {};
    out.lv = G.LabGrowth.levelFor(4, 16);
    pl.level = out.lv - 1;
    out.before = G.LevelUp.offer(pl).some(c => c.key.startsWith('grow:'));
    pl.level = out.lv;
    const hand = G.LevelUp.offer(pl);
    out.hand = hand.map(c => c.key).slice(0, 2);
    const hp0 = pl.maxHp;
    hand[0].apply(pl);
    out.c5 = { dex: pl.dex, anim: pl.anim.dex, hp: pl.maxHp - hp0, name: pl.mon.name, ability: G.Lab.ability && G.Lab.ability.name,
               pool: G.Moves.poolFor(pl.mon).join() === G.Lab.poolFor(G.DEX_BY[5]).join() };
    pl.level = G.LabGrowth.levelFor(5, 36);
    G.LevelUp.offer(pl).find(c => c.key === 'grow:6').apply(pl);
    out.c6 = { dex: pl.dex, anim: pl.anim.dex, blast: G.Moves.poolFor(pl.mon).includes('blast-burn'), more: G.LevelUp.offer(pl).some(c => c.key.startsWith('grow:')) };
    return out;
  });
  check(!grow.before && grow.hand[0] === 'grow:5' && grow.hand[1] === 'grow:stay', `at run level ${grow.lv} (16 in the games) Charmander gets "Evolve into Charmeleon" first, and Everstone (${grow.hand})`);
  check(grow.c5.dex === 5 && grow.c5.anim === 5 && grow.c5.hp === 8 && grow.c5.ability === 'Blaze' && grow.c5.pool,
    `evolving: Charmeleon's sprite, +8 HP, Blaze, Charmeleon's Lab pool (${JSON.stringify(grow.c5)})`);
  check(grow.c6.dex === 6 && grow.c6.anim === 6 && grow.c6.blast && !grow.c6.more, 'then Charizard: its sprite and Blast Burn in its pool; no more evolution cards');
  await endRun(); await toMenu();
  await startRun(4);
  const stay = await page.evaluate(() => {
    const pl = G.Game.player, red = pl.dmgReduce, hp = pl.maxHp;
    pl.level = 10;
    G.LevelUp.offer(pl).find(c => c.key === 'grow:stay').apply(pl);
    const red1 = pl.dmgReduce, again = G.LevelUp.offer(pl).some(c => c.key.startsWith('grow:'));
    // Eviolite (it can't evolve now that it stayed? It still CAN in the games: it works).
    const r0 = pl.dmgReduce; pl.equip('eviolite'); const evio = +(pl.dmgReduce - r0).toFixed(2); pl.equip(null);
    // Light Ball: only for Pikachu.
    const em = G.Moves.instance('ember'), k0 = pl.atkFor(em); pl.equip('light-ball'); const ball4 = pl.atkFor(em) / k0; pl.equip(null);
    // A chest or boss item in a Lab run: sometimes one of the items made for it.
    const rnd = Math.random; Math.random = () => 0;
    const rolled = G.Items.roll(); Math.random = rnd;
    return { red: +(red1 - red).toFixed(2), hp: pl.maxHp - hp, again, evio, ball4: +ball4.toFixed(2), rolled, under: pl._labUnder, xp: pl.xpMul };
  });
  check(stay.red === 0.15 && stay.hp > 0 && !stay.again, `Everstone: stays Charmander with -15% damage taken and +${stay.hp} HP; no more evolution cards`);
  check(stay.evio === 0.25 && stay.ball4 === 1 && stay.rolled === 'eviolite', `Eviolite: -25% damage taken while it can evolve; Light Ball does nothing on Charmander; chests can give its own items (${stay.rolled})`);
  await endRun(); await toMenu();
  await startRun(25);
  const ball = await page.evaluate(() => { const pl = G.Game.player, ts = G.Moves.instance('thunder-shock'), k0 = pl.atkFor(ts);
    pl.equip('light-ball'); const k = pl.atkFor(ts) / k0; pl.equip(null); return +k.toFixed(2); });
  check(ball === 1.6, `Light Ball on Pikachu: ×${ball} damage`);
  await endRun(); await toMenu();
  // Underdog XP: Caterpie (BST 195) gets +60%, Charizard none; compared with the same Pokémon out of Lab.
  const xpOf = async (dex, lab) => { await page.evaluate(l => G.Settings.set('lab', l), lab); await startRun(dex);
    const x = await page.evaluate(() => G.Game.player.xpMul); await endRun(); await toMenu(); return x; };
  const under = { cat: (await xpOf(10, true)) / (await xpOf(10, false)), zard: (await xpOf(6, true)) / (await xpOf(6, false)) };
  await page.evaluate(() => G.Settings.set('lab', true));
  check(Math.abs(under.cat - 1.6) < 0.01 && Math.abs(under.zard - 1) < 0.01, `underdog XP: Caterpie ×${under.cat.toFixed(2)}, Charizard ×${under.zard.toFixed(2)}`);
  // Candies: duplicates from the gacha with Lab on give one for that line; spent on stats in Upgrades
  // (fork/test-candy.cjs): 5 points of Sp. Atk = +15% to special moves in a Lab run.
  const candy = await page.evaluate(() => {
    const s = G.DB.save, keep = { owned: Object.assign({}, s.owned), shiny: Object.assign({}, s.shiny || {}), t: s.tickets.t1, coins: s.coins };
    for (const p of G.DEX) { s.owned[p.dex] = s.owned[p.dex] || { at: 1 }; if (G.Sprites.hasShiny(p.dex)) (s.shiny = s.shiny || {})[p.dex] = { at: 1 }; }
    s.tickets.t1 = 100;
    const before = Object.values((s.lab && s.lab.candy) || {}).reduce((a, b) => a + b, 0);
    G.Settings.set('lab', false); G.Gacha.pull(s, 10, 1, 't1');
    const off = Object.values((s.lab && s.lab.candy) || {}).reduce((a, b) => a + b, 0);
    G.Settings.set('lab', true); G.Gacha.pull(s, 10, 1, 't1');
    const on = Object.values((s.lab && s.lab.candy) || {}).reduce((a, b) => a + b, 0);
    s.owned = keep.owned; s.shiny = keep.shiny; s.tickets.t1 = keep.t; s.coins = keep.coins;
    s.lab.candy = { 4: 5 };
    return { before, off, on, line: G.LabGrowth.candies(6) };
  });
  check(candy.off === candy.before && candy.on === candy.before + 10 && candy.line === 5, `10 duplicate pulls: no candy with Lab off, 10 with it on; Charmander's candies count for Charizard (${JSON.stringify(candy)})`);
  const withCandy = await page.evaluate(() => { const s = G.DB.save; s.lab.candy = { 4: 15 }; s.lab.cpts = { [G.LabGrowth.lineKey(4)]: { satk: 5 } }; s.partner = 4; G.Game.startRun(); return null; })
    .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 }))
    .then(() => page.evaluate(() => ({ atk: G.Game.player.atkFor(G.Moves.instance('ember')), n: G.Game.player._labCandy && G.Game.player._labCandy.satk })));
  await endRun(); await toMenu();
  await page.evaluate(() => { G.DB.save.lab.candy = {}; G.DB.save.lab.cpts = {}; });
  await startRun(4);
  const noCandy = await page.evaluate(() => G.Game.player.atkFor(G.Moves.instance('ember')));
  check(withCandy.n === 5 && Math.abs(withCandy.atk / noCandy - 1.15) < 0.001, `5 Sp. Atk points: ×${(withCandy.atk / noCandy).toFixed(2)} to special moves in a Lab run`);
  if (SHOTS) {
    await page.evaluate(() => { G.Game.player.level = 7; G.RunUI.showLevelUp(7, G.LevelUp.offer(G.Game.player), () => {}); });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, 'lab-evolve-card.png') });
    await page.evaluate(() => G.RunUI.closeLevelUp());
  }
  await endRun(); await toMenu();

  // ---------------- 10. shinies (phase 7, js/fork/lab/shiny.js) ----------------
  console.log('Shinies');
  const shinyRun = async (dex, shiny) => {
    await page.evaluate(([d, s]) => { G.DB.save.shiny = G.DB.save.shiny || {}; G.DB.save.shiny[d] = { at: 1 }; G.DB.save.owned[d] = { at: 1 }; G.Game.startRun(null, { dex: d, shiny: s }); }, [dex, shiny]);
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 });
  };
  await shinyRun(6, false);
  const plain = await page.evaluate(() => ({ xp: G.Game.player.xpMul, coin: G.Game.player.coinMul, rr: G.Game.player.rerollBonus }));
  await endRun(); await toMenu();
  await shinyRun(6, true);
  const sh = await page.evaluate(async () => {
    const pl = G.Game.player;
    await __until(() => pl._labPal, 6000);
    __quiet(true);
    __only('ember'); pl.addMove('flamethrower');
    // Only a shot fired from now on: one fired before the palette was ready can still be in the air.
    const older = new Set(G.Projectiles.all());
    __dummy(pl.x + 100, pl.y);
    await __until(() => G.Projectiles.all().some(p => p.owner === pl && !older.has(p)), 3000);
    const proj = G.Projectiles.all().find(p => p.owner === pl && !older.has(p));
    __quiet(false);
    return { pal: pl._labPal, colors: G.VFX.PAL[pl._labPal], looks: pl.moves.map(m => m.look && m.look.pal), proj: proj && proj.vis.pal,
             xp: pl.xpMul, coin: pl.coinMul, rr: pl.rerollBonus };
  });
  check(sh.pal === 'shiny6' && sh.colors && sh.colors.length === 5 && sh.looks.every(p => p === 'shiny6') && sh.proj === 'shiny6',
    `shiny Charizard: its moves use a palette from its shiny sprite (${sh.colors && sh.colors.join(' ')}), Ember's fireballs included`, { looks: sh.looks, proj: sh.proj });
  check(Math.abs(sh.xp / plain.xp - 1.1) < 1e-6 && Math.abs(sh.coin / plain.coin - 1.1) < 1e-6 && sh.rr === plain.rr + 1, 'shiny: +10% XP, +10% coins and one more card reroll');
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'lab-shiny-moves.png') }); }
  await endRun(); await toMenu();

  // ---------------- 11. Mega Evolution, Lab only (js/fork/mega.js) ----------------
  // A Lab run with Gengar (a Mega with SpriteCollab sprites): a real rift past minute 5 with a
  // winning roll, the legendary beaten, back on the map (after the bond and the countdown) its
  // Mega Stone is offered; taken, Gengar Mega Evolves. (Out of Lab: fork/test-gameplay.cjs.)
  console.log('Mega Stones');
  const playOn = (cond, ms = 30000) => page.evaluate(([cond, ms]) => new Promise(r => {
    const end = performance.now() + ms, ok = new Function('return (' + cond + ')()');
    (function step() {
      if (G.UI.isOpen('scr-levelup') && !document.getElementById('cards').classList.contains('guard')) G.RunUI.pick(0);
      if (G.UI.isOpen('scr-bond') && !document.getElementById('bond-cards').classList.contains('guard')) G.RunUI.pickBond(0);
      if (G.UI.isOpen('scr-item') && !document.getElementById('item-cards').classList.contains('guard')) {
        const c = [...document.querySelectorAll('#item-cards .card')].find(el => /Mega Stone/.test(el.textContent)); if (c) c.click();
      }
      if (ok()) return r(true);
      if (performance.now() > end) return r(false);
      setTimeout(step, 150);
    })();
  }), [cond.toString(), ms]);
  // Out of a run, with Lab on: the stone on Gengar's collection cell, a line in its detail, a chip on the partner.
  const prevPartner = await page.evaluate(() => { const s = G.DB.save, was = s.partner;
    s.owned[94] = s.owned[94] || { at: Date.now() }; s.partner = 94; G.Settings.set('lab', true); G.MenuUI.open(); return was; });
  await page.waitForSelector('#scr-menu', { state: 'visible' });
  await page.waitForTimeout(150);
  const chipTxt = await page.evaluate(() => { const c = document.querySelector('#menu-partner-info .mega-chip'); return c && c.textContent.trim(); });
  await page.click('#scr-menu [data-go="dex"]');
  await page.waitForSelector('#scr-dex', { state: 'visible' });
  const megaCell = async name => {
    await page.fill('#dex-q', name);
    await page.waitForTimeout(250);
    const cell = page.locator('#dex-grid .cell', { hasText: name }).first();
    const badge = await cell.locator('.mega-badge').count();
    await cell.click();
    await page.waitForTimeout(150);
    const hint = await page.evaluate(() => { const h = document.querySelector('#dex-detail .mega-hint'); return h ? h.textContent.trim() : ''; });
    return { badge, hint };
  };
  const mgG = await megaCell('Gengar'), mgC = await megaCell('Charmander');
  await page.fill('#dex-q', '');
  check(chipTxt === 'Mega' && mgG.badge === 1 && mgG.hint === 'Can Mega Evolve: from minute 5 on, each rift legendary you beat with it has a 1 in 30 chance to drop its Mega Stone.',
    `Lab on: can Mega Evolve chip on the partner ("${chipTxt}"), stone on Gengar's cell, detail says "${mgG.hint}"`);
  check(mgC.badge === 0 && !mgC.hint, 'nothing of the kind on Charmander (no Mega)');
  await page.evaluate(p => { G.DB.save.partner = p; }, prevPartner);
  await page.evaluate(() => { G.MenuUI.open(); G.Game.startRun(null, { dex: 94, shiny: false }); });
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player.dex === 94 && G.Lab.active, null, { timeout: 15000 });
  const mg0 = await page.evaluate(() => { const pl = G.Game.player; pl.god = true; G.Game.debugSpeed(1);
    return { can94: G.Mega.can(94), can4: G.Mega.can(4), atk: pl.atkMul, spd: pl.spdMul, red: pl.dmgReduce, maxHp: pl.maxHp, types: pl.mon.types.join() }; });
  check(mg0.can94 && !mg0.can4, "Gengar can Mega Evolve (it has Mega sprites); Charmander can't");
  const fixRoll = r => page.evaluate(r => {
    const won = G.Mega.riftWon, rnd = Math.random;
    G.Mega.riftWon = pl => { Math.random = () => r; try { won(pl); } finally { Math.random = rnd; G.Mega.riftWon = won; } };
  }, r);
  const offered = (t, r) => fixRoll(r).then(() => page.evaluate(async t => {
    G.Game.debugTime(t); G.Mega.riftWon(G.Game.player);
    await new Promise(res => setTimeout(res, 800));
    return G.UI.isOpen('scr-item') || G.Game.player.item === 'megastone';
  }, t));
  check(await page.evaluate(() => G.Mega.DROP_T === 300 && Math.abs(G.Mega.DROP_P - 1 / 30) < 1e-9), 'Mega Stone odds: from minute 5, 1 in 30');
  check(!(await offered(299, 0)), 'a rift won before minute 5: no Mega Stone, even on the luckiest roll');
  check(!(await offered(300, 1 / 30)), 'a rift won after minute 5 on a roll of 1/30: no Mega Stone');
  await fixRoll(0.0333);
  await page.evaluate(() => G.Rift.enterRequest());
  await page.waitForFunction(() => G.Rift.inArena && G.Rift.arena && G.EnemyMgr.get(G.Rift.arena.bossId), null, { timeout: 15000 });
  check(await page.evaluate(() => G.Game.player.item !== 'megastone'), 'no Mega Stone before beating the legendary');
  await page.evaluate(() => G.EnemyMgr.get(G.Rift.arena.bossId).hurt(1e9, '#fff', 0, 0, 0, null));
  const got = await playOn(() => !G.Rift.inArena && G.Game.player.item === 'megastone');
  const mg1 = await page.evaluate(() => { const pl = G.Game.player;
    return { key: pl.anim.dex, atk: pl.atkMul, spd: pl.spdMul, red: pl.dmgReduce, maxHp: pl.maxHp, types: pl.mon.types.join() }; });
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  check(got && mg1.key === 'm94', `beating the rift's legendary gives Gengar its Mega Stone and it Mega Evolves (sprite ${mg1.key})`);
  if (SHOTS) { await page.waitForTimeout(2500); await page.screenshot({ path: path.join(SHOTS, 'mega-gengar.png') }); }
  const mg2 = await page.evaluate(() => { const pl = G.Game.player; pl.equip('quickclaw');
    const r = { key: pl.anim.dex, spd: pl.spdMul, red: pl.dmgReduce, maxHp: pl.maxHp, mega: !!pl.mega }; pl.equip(null);
    r.atkAfter = pl.atkMul; return r; });
  check(mg2.key === 94 && !mg2.mega, `swapping the stone for another item turns it back into Gengar (sprite ${mg2.key})`);
  check(near(mg1.atk, mg2.atkAfter * 1.25) && near(mg1.spd, mg2.spd * 1.1) && near(mg1.red, mg2.red + 0.08) && mg1.maxHp === mg2.maxHp + Math.round(mg2.maxHp * 0.15) && mg1.types === mg0.types,
    `Mega Gengar: +25 % damage, +10 % speed, +8 % defense, +15 % HP (${mg2.maxHp} -> ${mg1.maxHp}), same types (${mg1.types})`);
  const zard = await page.evaluate(() => { const p = new G.Player(G.DEX_BY[6]); p.equip('megastone');
    const on = { key: p.anim.dex, types: p.mon.types.join() }; p.equip(null);
    return { on, off: p.mon.types.join(), dex: G.DEX_BY[6].types.join() }; });
  check(zard.on.key === 'm6' && zard.on.types === 'fire,dragon' && zard.off === zard.dex && zard.dex === 'fire,flying',
    `Mega Charizard X is Fire/Dragon while it holds the stone, Fire/Flying again without it (${JSON.stringify(zard)})`);
  await endRun(); await toMenu();

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  // ---------------- 12. promoting Lab moves to the normal game (phase 8) ----------------
  // `promote: true` on a Lab move (lab-moves.js) puts it in the normal game: Surf in the Water
  // pool, Volt Tackle (a signature) in the Pikachu line's pool. Nothing is promoted yet, so this
  // loads the page with a copy of lab-moves.js that promotes those two.
  console.log('Promotion');
  const prom = await browser.newPage();
  await prom.route('**/js/fork/lab/lab-moves.js*', async r => {
    const body = (await (await r.fetch()).text()).replace("{ id: 'surf',", "{ id: 'surf', promote: true,").replace("{ id: 'volt-tackle',", "{ id: 'volt-tackle', promote: true,");
    r.fulfill({ contentType: 'application/javascript', body });
  });
  await prom.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await prom.waitForFunction(() => window.G && G.Lab && G.Moves, null, { timeout: 30000 });
  const pr = await prom.evaluate(() => ({ surf: G.Moves.poolFor(G.DEX_BY[7]).includes('surf'), all: G.Moves.ALL.some(m => m.id === 'surf'),
    vt25: G.Moves.poolFor(G.DEX_BY[25]).includes('volt-tackle'), vt4: G.Moves.poolFor(G.DEX_BY[4]).includes('volt-tackle'), lab: G.Lab.active }));
  check(!pr.lab && pr.surf && pr.all && pr.vt25 && !pr.vt4, `promote: Surf joins the normal Water pool, Volt Tackle the normal Pikachu pool (not Charmander's) (${JSON.stringify(pr)})`);
  await prom.close();

  // ---------------- 6. the built page ----------------
  // index.html + app.min.js (node fork/build.cjs): G is sealed there, so only the UI is used,
  // as a player would: guest, the starter quiz, Settings, Play.
  console.log('Built page (index.html)');
  const built = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const berr = [];
  built.on('pageerror', e => berr.push(String(e)));
  await built.goto(BASE + '/index.html', { waitUntil: 'load' });
  await pastStart(built, '#btn-guest');
  await built.click('#btn-guest');
  await built.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  for (let i = 0; i < 20 && !(await built.isVisible('#scr-result')); i++) {
    await built.click('#test-a button >> nth=0').catch(() => {});
    await built.waitForTimeout(250);
  }
  await built.click('#res-ok');
  await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
  await built.click('#btn-settings');
  await built.click('#set-tabs [data-t="lab"]');
  const sw = built.locator('#set-body .switch[data-k="lab"]');
  check(await sw.count() === 1, 'the built game has the Lab switch in Settings → Experimental');
  await sw.click();
  await built.click('#set-close');
  await built.click('#scr-menu [data-go="play"]');
  // With Lab on, Play first shows the Underdog XP ladder (js/fork/lab/underdog.js, fork/test-underdog.cjs).
  await built.waitForSelector('#ud-ladder:not(.hidden)', { timeout: 10000 });
  check((await built.textContent('#ud-ladder .ud-row.me')).length > 0, 'the built game shows the Underdog XP ladder before a Lab run');
  await built.click('#ud-go');
  await built.waitForFunction(() => { const h = document.getElementById('lab-hud'); return h && !h.classList.contains('hidden'); }, null, { timeout: 30000 })
    .catch(() => {});
  const tagText = await built.evaluate(() => { const h = document.getElementById('lab-hud'); return h && !h.classList.contains('hidden') ? h.textContent : null; });
  check(/^LAB/.test(tagText || ''), `a run in the built game is a Lab run ("${tagText}" on the HUD)`);
  await built.keyboard.press('Escape');
  await built.waitForSelector('#scr-pause', { state: 'visible', timeout: 5000 }).catch(() => {});
  const pb = await built.evaluate(() => { const b = document.querySelector('#pause-sum .lab-pause'); return b ? b.querySelectorAll('.lab-pool span').length : 0; });
  check(pb >= 6, `its pause screen shows the Lab block with the pool (${pb} moves)`);
  if (SHOTS) await built.screenshot({ path: path.join(SHOTS, 'lab-built-pause.png') });
  check(berr.length === 0, 'no page errors on the built page' + (berr.length ? ': ' + berr.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
