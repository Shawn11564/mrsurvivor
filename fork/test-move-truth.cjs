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
      (function alive() { pl.invuln = 99; pl.hp = pl.maxHp; requestAnimationFrame(alive); })();
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
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll move truth checks passed');
  process.exit(failures ? 1 : 0);
})();
