#!/usr/bin/env node
// Moves say and show what they really do (the 2026-10-21 review: js/fork/move-text.js,
// js/fork/move-looks.js, js/fork/evo-names.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-move-truth.cjs [base-url]
//
//   1. No move looks like it heals unless it heals: every move drawn with hearts (G.VFX.forMove)
//      drains or heals. Grass Knot (id giga-drain, once Giga Drain) had hearts flowing into you;
//      now leaves rise from the ground, also once evolved.
//   2. Evolution names: none promises healing it doesn't do (Giga Drain, Leech Life, Parabolic
//      Charge) and no two moves evolve into the same English name.
//   3. The English texts of the review (knockback, dash invulnerability, the beam evolution's
//      cooldown...) and the close-range tooltip line (-25 % damage taken with a melee move).
//   4. Rock Tomb in a real run: its rock falls during the warning (the zone's drawing never
//      showed before), then the enemy is stunned.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.waitForFunction(() => window.G && G.I18n && G.I18n.lang === 'en' && G.MoveText, null, { timeout: 30000 });

    console.log('1. Hearts only on moves that heal');
    const hearts = await page.evaluate(() => {
      const heals = m => !!(m.drain || m.heal || m.kind === 'heal' || m.leech);
      const isHeart = v => [v.proj, v.aura, v.buff].includes('heart');
      return G.Moves.ALL.filter(m => isHeart(G.VFX.forMove(m)) && !heals(m)).map(m => m.id);
    });
    check(!hearts.length, 'every normal move drawn with hearts drains or heals', hearts);
    const gk = await page.evaluate(() => {
      const m = G.Moves.instance('giga-drain', 1), v1 = G.VFX.forMove(m);
      G.Moves.evolve(m);
      const v2 = G.VFX.forMove(m);
      return { v1: [v1.aura, !!v1.inward, !!v1.rise], v2: [v2.aura, !!v2.inward, !!v2.rise], evolved: m.name };
    });
    check(gk.v1.join() === 'leaf,false,true' && gk.v2.join() === 'leaf,false,true', 'Grass Knot: leaves rising from the ground, evolved too', gk);

    console.log('2. Evolution names');
    const names = await page.evaluate(() => {
      const out = {};
      for (const m of G.Moves.ALL) { const e = G.Moves.EVO[m.id]; if (e) out[m.id] = G.T(e[0], 'move'); }
      return out;
    });
    const healNames = Object.entries(names).filter(([, n]) => /Giga Drain|Leech Life|Parabolic Charge|Drain Punch|Horn Leech|Draining Kiss/.test(n));
    check(!healNames.length, 'no evolution is named after a healing move', healNames);
    const seen = {}, dup = [];
    for (const [id, n] of Object.entries(names)) { if (seen[n]) dup.push([seen[n], id, n]); else seen[n] = id; }
    check(!dup.length, 'no two moves evolve into the same English name', dup);
    check(names.discharge === 'Shock Wave' && names['energy-ball'] === 'Magical Leaf' && names['u-turn'] === 'Lunge' &&
      names.hex === 'Last Respects' && names.whirlwind === 'Tailwind' && names['mirror-shot'] === 'Anchor Shot', 'the six renamed evolutions',
      ['discharge', 'energy-ball', 'u-turn', 'hex', 'whirlwind', 'mirror-shot'].map(k => names[k]));

    console.log('3. English texts');
    const tx = await page.evaluate(() => {
      const d = id => G.T(G.Moves.BY_ID[id].desc);
      return { tackle: d('tackle'), gust: d('gust'), gleam: d('dazzling-gleam'), qa: d('quick-attack'), sub: d('substitute'),
        beam: G.T('×1,8 daño, rayo un 50% más grueso y más largo'),
        tipTackle: G.MoveText.tipNotes(G.Moves.instance('tackle', 1), null).map(r => G.T(r[0])),
        tipEmber: G.MoveText.tipNotes(G.Moves.instance('ember', 1), null).map(r => G.T(r[0])) };
    });
    check(/knocking it back/.test(tx.tackle) && /blow back/.test(tx.gust) && /hurts everything/.test(tx.gleam) && /untouchable/.test(tx.qa) && /stand-in/.test(tx.sub),
      'knockback, damage, dash invulnerability and the stand-in are in the texts', tx);
    check(/15% less cooldown/.test(tx.beam), 'the beam evolution mentions its shorter cooldown', tx.beam);
    check(tx.tipTackle.some(s => /25% less damage/.test(s)) && !tx.tipEmber.some(s => /25% less damage/.test(s)),
      'the tooltip says a melee move cuts damage taken by 25% (and a ranged one doesn\'t)', [tx.tipTackle, tx.tipEmber]);

    console.log('4. Rock Tomb in a run');
    await page.click('#btn-guest');
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[74] = { at: Date.now(), from: 'starter' }; s.partner = 74; s.starter = 74; G.DB.commit();
      G.Flow.goMenu(); G.Game.startRun(null, { dex: 74, shiny: false });
    });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    const rt = await page.evaluate(async () => {
      const pl = G.Game.player, frame = () => new Promise(r => requestAnimationFrame(() => r()));
      G.Spawner.update = () => {};
      window.__alive = true;
      (function alive() { if (!window.__alive) return; pl.invuln = 99; pl.hp = pl.maxHp; requestAnimationFrame(alive); })();
      await new Promise(r => setTimeout(r, 3300));          // past the start countdown
      G.EnemyMgr.clear(); G.Combat.clearFields();
      const def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, pl.x + 90, pl.y, G.Enemies.scale(0));
      e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      const m = G.Moves.instance('rock-tomb', 1);
      pl.slots = [[m]]; pl.moves = [m]; pl.active = 0;
      const falls = []; const draw = G.VFX.draw;
      G.VFX.draw = function (ctx, shape, pal, x, y) {
        const z = G.Combat.fields && G.Combat.fields.find(f => f.kind === 'stunzone');
        if (z && shape === z.vis.proj && z.t < z.delay && y < z.y - 20) falls.push(Math.round(z.y - y));
        return draw.apply(this, arguments);
      };
      let zone = null;
      for (let i = 0; i < 400 && !(zone = G.Combat.fields.find(f => f.kind === 'stunzone')); i++) await frame();
      const shape = zone && zone.vis.proj;
      for (let i = 0; i < 120 && !(e.stunT > 0); i++) await frame();
      G.VFX.draw = draw;
      return { zone: !!zone, shape, falls: falls.length, high: falls[0] || 0, low: falls[falls.length - 1] || 0, stunned: e.stunT > 0 };
    });
    check(rt.zone && rt.shape === 'rock' && rt.falls >= 3 && rt.high > rt.low, 'a rock falls onto the zone during its warning', rt);
    check(rt.stunned, 'then the enemy is trapped (stunned)', rt.stunned);
    console.log('5. Lab moves');
    const lab = await page.evaluate(() => {
      const all = Object.values(G.Moves.BY_ID);
      const heals = m => !!(m.drain || m.leech || m.heal || m.kind === 'heal');
      const isHeart = v => [v.proj, v.aura, v.buff].includes('heart');
      const hearts = all.filter(m => isHeart(G.VFX.forMove(m)) && !heals(m)).map(m => m.id);
      const names = {};
      for (const m of all) { const e = G.Moves.EVO[m.id]; if (e) names[m.id] = G.T(e[0], 'move'); }
      const seen = {}, dup = [];
      for (const [id, n] of Object.entries(names)) { if (seen[n]) dup.push([seen[n], id, n]); else seen[n] = id; }
      const lie = Object.entries(names).filter(([id, n]) => /^(Dream Eater|Sleep Talk|Final Gambit|Healing Wish|Perish Song|Focus Energy)$/.test(n)
        || (n === 'Slack Off' && id !== 'rest'));
      const d = id => G.Moves.BY_ID[id].desc;
      const at = (id, lvl) => G.Moves.instance(id, lvl);
      const maxed = id => { const m = at(id, G.Moves.BY_ID[id].maxLvl); return G.Moves.evoInfo(m, { def: 1, hp: 1, atk: 1, cd: 1 }); };
      return {
        hearts, dup, lie,
        texts: { counter: d('counter'), bounce: d('bounce'), flare: d('flare-blitz'), rest: d('rest'), techno: d('techno-blast'), swift: d('swift') },
        cat: [G.Moves.BY_ID['kings-shield'].cat, G.Moves.BY_ID['baneful-bunker'].cat],
        protect: { ups: G.Moves.BY_ID.protect.ups.map(u => u.t), dur4: +at('protect', 5).dur.toFixed(3), evo: (maxed('protect') || {}).text },
        rest: { r2: at('rest', 2).rest, below4: at('rest', 4).below, evo: (maxed('rest') || {}).text },
        trap: +(at('shell-trap', 3).charge / G.Moves.BY_ID['shell-trap'].charge).toFixed(2),
        sky: G.VFX.forMove(G.Moves.BY_ID['sky-attack']).beam,
        tipWorkUp: G.MoveText.tipNotes(at('work-up', 1), null).map(r => G.T(r[0]))
      };
    });
    check(!lab.hearts.length, 'no move at all (Lab included) is drawn with hearts unless it heals: Sweet Kiss is a ring now', lab.hearts);
    check(!lab.dup.length, 'no two moves (Lab included) evolve into the same English name', lab.dup);
    check(!lab.lie.length, 'no Lab evolution is named after a move that heals, faints or attacks asleep when it doesn\'t', lab.lie);
    check(/every hit/.test(lab.texts.counter) && !/ may /.test(lab.texts.bounce + lab.texts.flare) && /2\.2 seconds/.test(lab.texts.rest) &&
      /first enemy/.test(lab.texts.techno) && !/never miss/.test(lab.texts.swift), 'Lab texts say what the code does', lab.texts);
    check(lab.cat.every(c => c === null), 'King\'s Shield and Baneful Bunker deal no damage: no Attack category', lab.cat);
    check(!lab.protect.ups.some(t => /damage/.test(t)) && lab.protect.dur4 > 0.9 * 1.4 && lab.protect.evo === 'Lasts longer and recharges faster',
      'Protect\'s upgrades and evolution do what they say (no "+damage" on a move that deals none)', lab.protect);
    check(lab.rest.r2 === 1.7 && lab.rest.below4 === 0.45 && lab.rest.evo === 'Half the recharge', 'Rest\'s own upgrades (shorter sleep, earlier) and evolution', lab.rest);
    check(lab.trap === 1.3, 'Shell Trap\'s upgrade keeps the trap set longer (it used to shorten it)', lab.trap);
    check(lab.sky === 'star', 'Sky Attack: a line of light, not fire (it doesn\'t burn)', lab.sky);
    check(lab.tipWorkUp.some(s => /physical and special/.test(s)), 'Work Up\'s tooltip says it boosts both sides', lab.tipWorkUp);

    const live = await page.evaluate(async () => {
      const pl = G.Game.player, frame = () => new Promise(r => requestAnimationFrame(() => r()));
      const wait = async n => { for (let i = 0; i < n; i++) await frame(); };
      window.__alive = false;
      G.EnemyMgr.clear(); G.Combat.clearFields();
      const def = G.Enemies.cast[0].list[0];
      const enemy = (dx) => { const e = new G.Enemy(def, pl.x + dx, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e); return e; };
      const out = {};
      // Metal Burst stores special hits too (Counter only physical ones).
      for (const id of ['metal-burst', 'counter']) {
        pl.invuln = 0; pl.god = false; pl.hp = pl.maxHp;
        const g = { t: 1, m: G.Moves.instance(id, 1), stored: 0 };
        pl._labGuard = g;
        pl.hurt(10, null, false, 'special');
        out[id] = g.stored > 0;
        pl._labGuard = null;
      }
      // Particles: what the sleep zone and the confused enemy draw.
      const sps = [], draws = [];
      const sp = G.FX.sp, draw = G.VFX.draw;
      G.FX.sp = function (shape) { sps.push(shape); return sp.apply(this, arguments); };
      G.VFX.draw = function (ctx, shape) { draws.push(shape); return draw.apply(this, arguments); };
      pl.invuln = 99;
      const e1 = enemy(70);
      const spore = G.Moves.instance('spore', 1);
      pl.slots = [[spore]]; pl.moves = [spore]; pl.active = 0;
      for (let i = 0; i < 300 && !(e1.labSleep > 0); i++) await frame();
      out.sleep = e1.labSleep > 0; out.sleepSps = [...new Set(sps)];
      pl.slots = []; pl.moves = [];
      sps.length = 0; draws.length = 0;
      e1.labSleep = 0; e1.stunT = 0; e1.labConf = 3;
      await wait(20);
      out.confDraws = [...new Set(draws)];
      // Wish: stars when wished, hearts when it heals.
      G.EnemyMgr.clear(); sps.length = 0;
      const wish = G.Moves.instance('wish', 1);
      pl.slots = [[wish]]; pl.moves = [wish]; pl.active = 0;
      pl.invuln = 0; pl.hp = pl.maxHp * 0.4;
      for (let i = 0; i < 200 && !sps.includes('star'); i++) { pl.invuln = 99; await frame(); }
      out.wishCast = [...new Set(sps)]; sps.length = 0;
      const hp0 = pl.hp;
      await new Promise(r => setTimeout(r, 2400));
      out.wishPay = [...new Set(sps)]; out.healed = pl.hp > hp0;
      G.FX.sp = sp; G.VFX.draw = draw;
      return out;
    });
    check(live['metal-burst'] && !live.counter, 'Metal Burst stores every hit, Counter only physical ones (as their texts say)', live);
    check(live.sleep && live.sleepSps.includes('bubble') && !live.sleepSps.includes('note'), 'Spore\'s sleep zone puffs spores, not music notes', live.sleepSps);
    check(live.confDraws.includes('ring') && !live.confDraws.includes('heart'), 'a confused enemy shows rings, not hearts', live.confDraws);
    check(live.wishCast.includes('star') && !live.wishCast.includes('heart') && live.wishPay.includes('heart') && live.healed,
      'Wish: stars when you wish, hearts when it heals 2 s later', { cast: live.wishCast, pay: live.wishPay, healed: live.healed });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll move truth checks passed');
  process.exit(failures ? 1 : 0);
})();
