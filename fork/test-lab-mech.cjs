#!/usr/bin/env node
// Lab phase 10, move identity and new mechanics (js/fork/lab/mech.js, fork/LAB.md "Phase 10"),
// checked in the game in headless Edge on dev.html: a real Lab run, real moves cast by the game's
// own Combat on dummies that don't move.
//
//   node fork/serve.cjs                 (in the repo root, in another terminal)
//   node fork/test-lab-mech.cjs [base-url] [--only name,name]
//
// mark   B3.1: Psychic marks what it hits; Psybeam evolves into Future Sight, whose beam marks
//        everything it touches; another move's hit sets the mark off around the enemy (an enemy
//        the beam missed is hurt too); the same move never sets its own mark off; Doom Desire
//        marks; the texts say so; a normal run's Psybeam/Psychic don't mark.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const want = name => !ONLY || ONLY.includes(name);
// Names each mechanic leaves in the built bundle (checked in 'built').
const BUILT = [];

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
      const stored = a._labMark ? a._labMark.dmg : 0;
      // Another move (Ember, in the next slot) sets it off: b, out of the beam, is hurt by it.
      pl.active = 1; pl.aim = 0;
      const ha = a.hp;
      await __fire(tk, 300);
      out.gone = !a._labMark;
      out.bHurt = Math.round(b.maxHp - b.hp);
      out.aDrop = Math.round(ha - a.hp);
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
    check(r.gone && Math.abs(r.bHurt - r.storedAt2) <= Math.max(2, r.storedAt2 * 0.02) && r.bHurt > 0, `another move sets it off: the enemy beside it takes ${r.bHurt} (stored ${r.storedAt2})`, r);
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
