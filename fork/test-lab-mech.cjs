#!/usr/bin/env node
// Lab phase 10, move identity and new mechanics (js/fork/lab/mech.js, fork/LAB.md "Phase 10"),
// checked in the game in headless Edge on dev.html: a real Lab run, real moves cast by the game's
// own Combat on dummies that don't move.
//
//   node fork/serve.cjs                 (in the repo root, in another terminal)
//   node fork/test-lab-mech.cjs [base-url] [--only name,name]
//
// mark     B3.1: Psychic marks what it hits; Psybeam evolves into Future Sight, whose beam marks
//          everything it touches; another move's hit sets the mark off around the enemy (an enemy
//          the beam missed is hurt too); the same move never sets its own mark off; Doom Desire
//          marks; the texts say so; a normal run's Psybeam/Psychic don't mark.
// hazards  B3.2: Spikes stay instead of bursting, hurt what steps on them and again a second later,
//          still there after a mine's 8 s; Toxic Spikes poison; String Shot's webs slow; Rock
//          Slide evolves into Stealth Rock, whose rocks stay and hurt; a normal run's Spikes burst.
// convert  B3.3: Smelling Salts and Wake-Up Slap (in real pools) ×3 on stunned or sleeping enemies and
//          snap them out of it; Acid Spray evolves into Venoshock: ×3 on 4 poison stacks, poison used up.
// tradeoff B3.4: Swords Dance evolves into Belly Drum (half your HP for every stack, from any slot);
//          Shell Smash boosts three stats and you take ×1.35; Curse costs a quarter of your HP once
//          per curse and a boss loses HP over time; nothing near, no cost.
// decoy    B3.5: Follow Me and Rage Powder (in real pools) go off from another slot and leave a beacon:
//          walkers go for it when you walk off, Rage Powder slows them, bosses don't fall for it;
//          Substitute's doll draws the enemy near it. (Co-op: fork/test-lab-coop.cjs, the guest's
//          Follow Me on the host.)
// built    the built index.html's bundle has the mechanics.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const want = name => !ONLY || ONLY.includes(name);
// Names each mechanic leaves in the built bundle (checked in 'built').
const BUILT = ['HZ_STEP'];

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (!ok && info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* none */ } });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab && G.LabMech, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });

  /** A run (Lab or not) with Mew, a quiet arena and the helpers. */
  const start = labOn => page.evaluate(async on => {
    const s = G.DB.save;
    for (const d of [151, 448]) s.owned[d] = { at: 1 };
    s.partner = 151; G.Settings.set('lab', on);
    const until = async (f, ms = 15000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await new Promise(r => setTimeout(r, 40)); };
    if (G.Game.player && G.Game.state !== 'ui') {
      G.Game.quit();
      await until(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await until(() => G.Game.state === 'ui');
    }
    G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
    const t0 = performance.now();
    while (!(G.Game.state === 'playing' && G.Game.player) && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 50));
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) G[k].update = () => {};
    G.Weather.reset(); G.Weather.update = () => {};
    G.LevelUp.offer = () => [];
    const pl = G.Game.player;
    pl.xpMul = 0; pl.critChance = 0; pl.labAbility = null; pl.god = false;
    pl.mon = Object.assign({}, pl.mon, { types: ['none'] });
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__until = (f, ms = 3000) => new Promise(r => { const t0 = performance.now(); (function s() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(s, 30); })(); });
    window.__dummy = (x, y, o = {}) => {
      const def = { dex: 19, name: 'Dummy', hp: o.hp || 1e6, spd: o.spd || 0, dmg: o.dmg || 10, xp: 0, behavior: o.behavior || 'chase' };
      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
      e.types = ['none']; e.touchCd = o.touch ? 0 : 99;
      G.EnemyMgr.add(e);
      return e;
    };
    window.__open = () => {
      const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= 300; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, pl.r, true)) return false; return true; };
      if (ok(pl.x, pl.y)) return;
      for (let r = 64; r < 8000; r += 64) for (let a = 0; a < 6.283; a += 0.5) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (ok(x, y)) { pl.x = x; pl.y = y; return; } }
    };
    /** Only these moves, each in its own slot (or all in one bond with bond: true), at level lvl. */
    window.__only = (ids, o = {}) => {
      pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; pl.active = 0; pl.invuln = 0; pl.dead = false; pl.hp = pl.maxHp;
      for (const b of Object.values(pl.buffs)) b.n = 0;
      pl._labHurtAt = 0;
      G.EnemyMgr.clear(); G.Combat.clearFields(); G.Projectiles.clear(); __open();
      for (const id of ids) pl.addMove(id);
      if (o.bond) { const all = pl.slots.flat(); pl.slots.length = 0; pl.slots.push(all); }
      for (const m of pl.moves) { if (o.lvl) while (m.lvl < o.lvl && G.Moves.levelUp(m)) {} if (o.evolve) G.Moves.evolve(m); m.t = 99; }
      pl.active = 0;
      return pl.moves;
    };
    /** Fires m once now (as Combat does when its recharge is up) and waits ms. */
    window.__fire = async (m, ms = 400) => { m.t = 0; await __wait(Math.max(60, ms)); m.t = 99; };
    window.__at = (r, a = 0) => [pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r];
    return { lab: G.Lab.active };
  }, labOn);

  // ---------------- B3.1 mark + detonate ----------------
  if (want('mark')) {
    console.log('B3.1 mark + detonate');
    await start(true);
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, out = {};
      // Future Sight: Psybeam at its top level, evolved.
      let [fs] = __only(['psybeam'], { lvl: 5, evolve: true });
      pl.addMove('ember');
      const tk = pl.moves[1]; tk.t = 99;
      out.name = G.T(fs.name, 'move'); out.markField = fs.mark;
      out.evoText = G.Moves.evoInfo(Object.assign(G.Moves.instance('psybeam', 5), { evolved: false }), { cd: 1 }).text;
      out.tip = G.MoveText.tipNotes(fs, pl).map(n => n[0]).join(' | ');
      const a = __dummy(...__at(70)), b = __dummy(pl.x + 70, pl.y + 62);       // b: next to a, off the beam
      pl.target = a; pl.aim = 0;
      await __fire(fs, 350);
      out.marked = !!a._labMark; out.stored = a._labMark ? Math.round(a._labMark.dmg) : 0;
      out.bBefore = b.maxHp - b.hp;
      // Psybeam again: its own mark doesn't go off.
      await __fire(fs, 350);
      out.stillMarked = !!a._labMark && b.hp === b.maxHp;
      // Another move (Ember, in the next slot) sets it off: b, out of the beam, is hurt by it,
      // once, by what a's mark held at that moment (a takes the same).
      fs.cd = 1e6; fs.t = 1e6;
      pl.active = 1; pl.aim = 0;
      const log = e => { const l = []; const h = e.hurt; e.hurt = function (am, c) { l.push([Math.round(am), c]); return h.apply(this, arguments); }; return l; };
      const la = log(a), lb = log(b), MC = '#ff6ad5';
      const stored = a._labMark ? a._labMark.dmg : 0;
      await __fire(tk, 300);
      out.gone = !a._labMark;
      out.bHits = lb; out.aHits = la.filter(h => h[1] === MC);
      out.bHurt = Math.round(b.maxHp - b.hp);
      out.storedAt2 = Math.round(stored);
      // Psychic marks too.
      let [ps] = __only(['psychic']);
      out.psyMark = ps.mark;
      const c = __dummy(...__at(60)); pl.target = c;
      await __fire(ps, 700);
      out.psyMarked = !!c._labMark;
      // Doom Desire (Jirachi's signature) marks where its bolts fall.
      let [dd] = __only(['doom-desire']);
      const d = __dummy(...__at(90)); pl.target = d;
      await __fire(dd, 900);
      out.ddMarked = !!d._labMark;
      return out;
    });
    check(r.name === 'Future Sight' && r.markField === 1, `Psybeam evolves into Future Sight, which marks (mark ${r.markField})`, r);
    check(/marks every enemy it hits/.test(r.evoText) && /marks every enemy/.test(r.tip), 'the evolution card and the move box say what it does', { evo: r.evoText, tip: r.tip });
    check(r.marked && r.stored > 0 && r.bBefore === 0, `the beam marks the enemy (stores ${r.stored}) and doesn't touch the one beside it`, r);
    check(r.stillMarked, 'Future Sight hitting its own mark again doesn\'t set it off');
    check(r.gone && r.bHits.length === 1 && r.bHits[0][1] === '#ff6ad5' && r.aHits.length === 1 && r.aHits[0][0] === r.bHits[0][0] && Math.abs(r.bHurt - r.storedAt2) <= Math.max(2, r.storedAt2 * 0.02),
      `another move sets it off: the enemy beside it takes ${r.bHurt} once, as the marked one (stored ${r.storedAt2})`, r);
    check(r.psyMark > 0 && r.psyMarked, 'Psychic marks the enemies it hits', r);
    check(r.ddMarked, 'Doom Desire marks where its bolts fall', r);

    await start(false);
    const n = await page.evaluate(async () => {
      const pl = G.Game.player;
      const [fs] = __only(['psybeam'], { lvl: 5, evolve: true });
      const [ps] = [G.Moves.instance('psychic', 1)];
      const a = __dummy(...__at(70)); pl.target = a; pl.aim = 0;
      await __fire(fs, 350);
      return { mark: fs.mark || ps.mark || 0, marked: !!a._labMark, tip: G.MoveText.tipNotes(fs, pl).length };
    });
    check(!n.mark && !n.marked, 'in a normal run Psybeam and Psychic don\'t mark', n);
  }

  // ---------------- B3.2 persistent hazard fields ----------------
  if (want('hazards')) {
    console.log('B3.2 persistent hazard fields');
    await start(true);
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, M = G.LabMech, out = {};
      const mineFields = () => G.Combat.fields.filter(f => f.kind === 'mine').length;
      // Spikes: they don't burst, they stay.
      let [sp] = __only(['spikes']);
      out.tip = G.MoveText.tipNotes(sp, pl).map(n => n[0]).join(' | ');
      await __fire(sp, 250);
      const spikes = M.hazards().filter(h => h.kind === 'spike');
      out.spikes = spikes.length; out.mines = mineFields();
      const h = spikes[0], a = __dummy(h.x, h.y);
      await __wait(300);
      out.hit1 = Math.round(a.maxHp - a.hp);
      await __wait(1200);
      out.hit2 = Math.round(a.maxHp - a.hp);
      a.hp = 0; a.die();
      // Still there after the 8 s a mine lasts (the game at 8× speed for 1.5 s).
      G.Game.debugSpeed(8); await __wait(1500); G.Game.debugSpeed(1);
      out.later = M.hazards().filter(x => x.kind === 'spike').length; out.age = Math.round(h.t);
      // Toxic Spikes poison.
      let [ts] = __only(['toxic-spikes']);
      await __fire(ts, 250);
      const t0 = M.hazards()[0], b = __dummy(t0.x, t0.y);
      await __wait(300);
      out.poison = b.poison;
      // String Shot: a web that slows.
      let [ss] = __only(['string-shot']);
      await __fire(ss, 250);
      const w = M.hazards().find(x => x.kind === 'web'), c = __dummy(w.x, w.y);
      await __wait(400);
      out.web = !!w; out.slow = c.slow; out.webHit = c.hp < c.maxHp;
      // Stealth Rock: Rock Slide evolved; its rocks stay where they land.
      let [rs] = __only(['rock-slide'], { lvl: 5, evolve: true });
      out.rsName = G.T(rs.name, 'move');
      const d = __dummy(...__at(120)); pl.target = d;
      await __fire(rs, 1000);
      const rocks = M.hazards().filter(x => x.kind === 'rock');
      out.rocks = rocks.length;
      d.hp = 0; d.die();
      await __wait(200);
      const e = rocks[0] && __dummy(rocks[0].x, rocks[0].y);
      await __wait(300);
      out.rockHit = e ? Math.round(e.maxHp - e.hp) : 0;
      return out;
    });
    check(/stay for 60 s/.test(r.tip), 'the move box says the spikes stay', r.tip);
    check(r.spikes === 2 && r.mines === 0, `Spikes leave 2 lasting spikes, no bursting mines (${r.spikes} spikes, ${r.mines} mines)`, r);
    check(r.hit1 > 0 && r.hit2 >= r.hit1 * 1.8, `an enemy standing on one is hurt when it steps on it and again a second later (${r.hit1}, then ${r.hit2})`, r);
    check(r.later === 2 && r.age >= 10, `the spikes are still there ${r.age} s later (a mine lasts 8 s)`, r);
    check(r.poison > 0, `Toxic Spikes poison what steps on them (poison ${r.poison})`, r);
    check(r.web && r.slow >= 0.55 && r.webHit, `String Shot's web slows (${r.slow}) and hurts what walks in`, r);
    check(r.rsName === 'Stealth Rock' && r.rocks >= 3, `Rock Slide evolves into Stealth Rock and its rocks stay where they land (${r.rocks})`, r);
    check(r.rockHit > 0, `a stone hurts an enemy that walks into it (${r.rockHit})`, r);

    await start(false);
    const n = await page.evaluate(async () => {
      const [sp] = __only(['spikes']);
      await __fire(sp, 250);
      return { mines: G.Combat.fields.filter(f => f.kind === 'mine').length, hz: G.LabMech.hazards().length };
    });
    check(n.mines === 2 && n.hz === 0, 'in a normal run Spikes are the usual bursting mines', n);
  }

  // ---------------- B3.3 status converters ----------------
  if (want('convert')) {
    console.log('B3.3 status converters');
    await start(true);
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, out = {};
      const pools = [296, 297, 62].map(d => G.Lab.poolFor(G.DEX_BY[d]));
      out.inPools = pools.some(p => p.includes('smelling-salts')) && pools.some(p => p.includes('wake-up-slap'));
      /** Damage of one cast of m on a fresh dummy prepared by f. */
      const one = async (m, f = () => {}) => {
        G.EnemyMgr.clear();
        const e = __dummy(...__at(40)); f(e); pl.target = e; pl.aim = 0;
        const d0 = m.dealt || 0;
        await __fire(m, 260);
        return { d: Math.round((m.dealt || 0) - d0), e };       // the move's own damage (no poison ticks)
      };
      for (const id of ['smelling-salts', 'wake-up-slap']) {
        const [m] = __only([id]);
        const plain = await one(m), stun = await one(m, e => e.applyStun(3)), zz = await one(m, e => G.LabKinds.sleep(e, 3));
        out[id] = { plain: plain.d, stun: stun.d, sleep: zz.d, stunAfter: stun.e.stunT, sleepAfter: zz.e.labSleep };
      }
      // Venoshock: Acid Spray evolved.
      const [v] = __only(['acid-spray'], { lvl: 5, evolve: true });
      v.count = 1;                    // one shot, so one hit on the dummy
      out.vName = G.T(v.name, 'move'); out.vText = G.MoveText.tipNotes(v, pl).map(n => n[0]).join(' | ');
      const plain = await one(v), pois = await one(v, e => e.applyPoison(4));
      out.vPlain = plain.d; out.vPois = pois.d; out.poisonAfter = pois.e.poison;
      return out;
    });
    check(r.inPools, 'Smelling Salts and Wake-Up Slap reach real Lab pools through their learnsets (Makuhita, Hariyama, Poliwrath)');
    for (const id of ['smelling-salts', 'wake-up-slap']) {
      const x = r[id];
      check(Math.abs(x.stun / x.plain - 3) < 0.15 && Math.abs(x.sleep / x.plain - 3) < 0.15, `${id}: ×3 on a stunned (${x.stun}) and a sleeping (${x.sleep}) enemy, against ${x.plain}`, x);
      check(!(x.stunAfter > 0) && !(x.sleepAfter > 0), `${id}: the enemy snaps out of it`, x);
    }
    check(r.vName === 'Venoshock' && /uses the poison up/.test(r.vText), 'Acid Spray evolves into Venoshock and its box says what it does', r);
    check(Math.abs(r.vPois / r.vPlain - 3) < 0.15 && r.poisonAfter <= 1, `Venoshock: ×3 on 4 poison stacks (${r.vPois} against ${r.vPlain}), the poison used up (then 1 again from its own hit: ${r.poisonAfter})`, r);
  }

  // ---------------- B3.4 trade-off boosters ----------------
  if (want('tradeoff')) {
    console.log('B3.4 trade-off boosters');
    await start(true);
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, out = {};
      // Belly Drum: Swords Dance evolved, in the second slot (it casts on its own from there).
      const [em, bd] = __only(['ember', 'swords-dance'], { lvl: 5, evolve: true });
      out.name = G.T(bd.name, 'move'); out.drum = bd.drum; out.passive = !!bd.passive;
      out.tip = G.MoveText.tipNotes(bd, pl).map(n => n[0]).join(' | ');
      pl.hp = pl.maxHp; bd.t = 0;
      await __until(() => pl.buffs.patk.n > 0, 3000);
      out.hpShare = +(pl.hp / pl.maxHp).toFixed(2); out.stacks = pl.buffs.patk.n; out.maxStacks = bd.stacks;
      // Shell Smash: boosts three stats, and you take 35% more while it lasts.
      const [ss] = __only(['shell-smash']);
      pl.invuln = 0; let h0 = pl.hp; pl.hurt(20); const plain = h0 - pl.hp;
      pl.invuln = 0; pl.hp = pl.maxHp;
      await __fire(ss, 200);
      out.ssBuffs = ['patk', 'satk', 'spd'].map(k => pl.buffs[k].n);
      pl.invuln = 0; h0 = pl.hp; pl.hurt(20); out.frailK = +((h0 - pl.hp) / plain).toFixed(2);
      out.frailShown = !!pl._labFrail;
      // Curse: a quarter of your HP; the nearest boss loses HP over time.
      const [cu] = __only(['curse']);
      const b = __dummy(...__at(200), { boss: true, hp: 100000 });
      pl.hp = pl.maxHp;
      await __fire(cu, 200);
      out.curseHp = +(pl.hp / pl.maxHp).toFixed(2); out.cursed = !!b._labCurse;
      const bh = b.hp; await __wait(1600);
      out.bossLost = +((bh - b.hp) / b.maxHp * 100).toFixed(2);
      // Again at once: no second cost while the curse lasts.
      const h1 = pl.hp; await __fire(cu, 900);
      out.again = pl.hp >= h1;
      // No enemy near: nothing to curse, no cost.
      __only(['curse']); pl.hp = pl.maxHp;
      await __fire(pl.moves[0], 200);
      out.alone = pl.hp === pl.maxHp;
      return out;
    });
    check(r.name === 'Belly Drum' && r.drum === 0.5 && r.passive && /costs half your HP/.test(r.tip), 'Swords Dance evolves into Belly Drum (passive, drum 0.5) and its box says so', r);
    check(Math.abs(r.hpShare - 0.5) < 0.05 && r.stacks === r.maxStacks, `Belly Drum from another slot: half your HP (${r.hpShare} left) for every stack at once (${r.stacks}/${r.maxStacks})`, r);
    check(r.ssBuffs.every(n => n > 0) && Math.abs(r.frailK - 1.35) < 0.05 && r.frailShown, `Shell Smash boosts Attack, Sp. Atk and Speed (${r.ssBuffs}) and you take ×${r.frailK} while it lasts`, r);
    check(Math.abs(r.curseHp - 0.75) < 0.03 && r.cursed && r.bossLost >= 0.8 && r.bossLost < 2.5, `Curse costs a quarter of your HP (${r.curseHp} left) and the boss loses ${r.bossLost}% of its HP in 1.6 s`, r);
    check(r.again && r.alone, 'no second cost while the curse lasts, and no cost with nothing to curse', r);
  }

  // ---------------- B3.5 decoys ----------------
  if (want('decoy')) {
    console.log('B3.5 decoys');
    await start(true);
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, M = G.LabMech, out = {};
      const pools = [35, 36, 12, 637].map(d => G.Lab.poolFor(G.DEX_BY[d]));
      out.inPools = pools.some(p => p.includes('follow-me')) && pools.some(p => p.includes('rage-powder'));
      /** Walkers around you; the decoy move in slot 2 goes off on its own; then you walk 450 px away. */
      const run = async (id, boss) => {
        __only(['ember', id]);
        pl.moves[0].t = 1e9;
        const es = [0, 2.1, 4.2].map(a => __dummy(...__at(90, a), { spd: 70, boss }));
        await __until(() => M.decoys().length > 0, 3000);
        const d = M.decoys()[0];
        const x0 = pl.x, y0 = pl.y;
        pl.x += 450; G.World.collide(pl); pl.frozen = true;
        await __wait(1500);
        const res = { decoy: !!d, at: d ? Math.round(G.U.dist(d.x, d.y, x0, y0)) : -1,
          toDecoy: es.map(e => Math.round(G.U.dist(e.x, e.y, x0, y0))), toYou: es.map(e => Math.round(G.U.dist(e.x, e.y, pl.x, pl.y))),
          slow: es.map(e => e.slow) };
        pl.frozen = false;
        return res;
      };
      out.fm = await run('follow-me');
      out.rp = await run('rage-powder');
      out.boss = await run('follow-me', true);
      // Substitute's doll pulls the enemies near it.
      __only(['substitute']);
      const sub = pl.moves[0];
      out.subTip = G.MoveText.tipNotes(sub, pl).map(n => n[0]).join(' | ');
      const w = __dummy(...__at(140), { spd: 70 }); pl.target = w;
      await __fire(sub, 200);
      const doll = M.decoys().find(d => d.field);
      out.doll = !!doll;
      if (doll) { const dx0 = G.U.dist(w.x, w.y, doll.x, doll.y); pl.x -= 400; G.World.collide(pl); pl.frozen = true; await __wait(2400); out.dollPull = [Math.round(dx0), Math.round(G.U.dist(w.x, w.y, doll.x, doll.y))]; pl.frozen = false; }
      return out;
    });
    check(r.inPools, 'Follow Me and Rage Powder reach real Lab pools (Clefairy, Clefable, Butterfree, Volcarona)');
    check(r.fm.decoy && r.fm.at < 20, `Follow Me goes off on its own from another slot and leaves a beacon where you stood (${r.fm.at} px)`, r.fm);
    check(r.fm.toDecoy.every(d => d < 60) && r.fm.toYou.every(d => d > 300), `walkers go for the beacon (${r.fm.toDecoy} px from it), not for you (${r.fm.toYou} px)`, r.fm);
    check(r.rp.decoy && r.rp.toDecoy.every(d => d < 60) && r.rp.slow.some(s => s >= 0.35), `Rage Powder's powder draws them and slows them (${r.rp.slow})`, r.rp);
    check(r.boss.toYou.every((d, i) => d < 450 - 50), `bosses don't fall for it: they keep coming for you (${r.boss.toYou} px)`, r.boss);
    check(/go for it instead of you/.test(r.subTip) && r.doll && r.dollPull && r.dollPull[1] < r.dollPull[0] && r.dollPull[1] < r.dollPull[0] - 60, `Substitute's doll draws the enemy near it (${r.dollPull} px)`, r);
  }

  // ---------------- the built game ----------------
  // index.html seals G, so: its bundle has this file's code (names survive the obfuscator), and
  // the page loads with no errors.
  if (want('built')) {
    console.log('The built index.html');
    const p2 = await browser.newPage();
    p2.on('pageerror', e => errors.push('index.html: ' + String(e)));
    await p2.goto(BASE + '/index.html', { waitUntil: 'load' });
    const src = await p2.evaluate(async () => {
      const s = [...document.scripts].map(x => x.src).find(u => /app\.min\.js/.test(u));
      return s ? (await fetch(s)).text() : '';
    });
    const names = ['G.LabMech', '_labMark'].concat(BUILT || []);
    const miss = names.filter(n => !src.includes(n.replace(/^G\./, '')));
    check(src.length > 0 && !miss.length, `index.html's bundle has the Lab mechanics (${names.join(', ')})`, miss);
    await p2.waitForTimeout(1500);
    await p2.close();
  }

  check(!errors.length, 'no page errors', errors);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab mechanics checks passed');
  process.exit(failures ? 1 : 0);
})();
