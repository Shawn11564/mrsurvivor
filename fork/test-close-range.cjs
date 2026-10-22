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
  async function startRun(lab) {
    if (await page.evaluate(() => G.Game.state !== 'ui')) {
      await page.evaluate(() => G.Game.quit());
      await page.waitForSelector('#btn-again', { state: 'visible', timeout: 15000 });
      await page.click('#btn-again');
      await page.waitForFunction(() => G.Game.state === 'ui' && !G.Game.player, null, { timeout: 15000 });
    }
    await page.evaluate(lab => { G.Settings.set('lab', lab); G.MenuUI.open(); G.Game.startRun(); }, lab);
    await page.waitForFunction(lab => G.Game.state === 'playing' && G.Game.player && G.Lab.active === lab, lab, { timeout: 30000 });
    await page.evaluate(() => {
      for (const k of ['Spawner', 'Events', 'Rift']) G[k].update = () => {};
      G.Weather.clear(); G.Weather.update = () => {};
      G.LevelUp.offer = () => [];
      G.Input.axis = () => [0, 0];
      const pl = G.Game.player;
      pl.xpMul = 0; pl.critChance = 0; pl.labAbility = null; pl.abil = null;
      pl.mon = Object.assign({}, pl.mon, { types: ['none'] });
      window.__wait = ms => new Promise(r => setTimeout(r, ms));
      window.__until = (f, ms = 3000) => new Promise(r => { const t0 = performance.now(); (function s() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(s, 16); })(); });
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
    __only('quick-attack');
    const e2 = __dummy(...__at(100));
    await __until(() => e2.hp < e2.maxHp, 2000);
    out.dashEnemy = e2.hp < e2.maxHp;
    return out;
  });
  check(tgt['karate-chop'], 'A1.6: Karate Chop hits an enemy in reach while a boss waits 250 px away (#186, #208)');
  check(tgt['rapid-spin'], 'A1.6: so does Rapid Spin (spin)');
  check(tgt.bossFirst, 'A1.6: a boss in reach is still hit first');
  check(tgt.rock, 'found a rock or chest to test against');
  check(tgt.dashCast === false && tgt.dashMoved < 5, `A1.7: Quick Attack doesn't fire at a rock or chest (cast ${tgt.dashCast}, moved ${tgt.dashMoved} px)`);
  check(tgt.dashEnemy, 'A1.7: and still fires at an enemy');

  check(!errors.length, 'no page errors', errors.slice(0, 3));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
