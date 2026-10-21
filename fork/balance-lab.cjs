#!/usr/bin/env node
// Lab mode balance check (fork/LAB.md, phase 8). Plays every move in the real combat code in
// headless Edge and reports its damage per second next to the normal game's moves.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/balance-lab.cjs [--lab] [--lvl1] [--secs 6] [base-url]
//
//   --lab    only Lab moves (the normal ones are still measured once, for the medians)
//   --lvl1   also at level 1 (by default only at the top level, evolved when it can)
//   --secs   game seconds per measurement (default 6; the page runs at 4× speed)
//
// The setup is the same for every move, so the numbers compare moves, not Pokémon:
//   - the player is Mew's stats with no type (no same-type bonus), can't be hurt, no XP
//   - targets are typeless dummies that can't move or hit back, put back in place every 0.4 s
//   - "crowd": 12 dummies around the player (70, 150 and 240 px away); "single": one, 55 px away
//     (close enough for melee)
//   - no spawns, events, rifts, weather or hazards
// Each move's DPS is divided by the median of the normal game's damaging moves at the same level
// and arena (×crowd, ×single); its score is the geometric mean of the two (good at both, or very
// good at one). Kinds are strong in different places (homing against one, melee against many),
// so a move is also compared with the normal game's moves of its own kind (×kind; a new kind with
// the nearest old one, LIKE): over 1.6 is flagged "strong", under 0.6 "weak". Moves that don't
// deal damage themselves (guard, weather, terrain, buff, heal, screen, shout, endure) are listed as "support",
// and the ones that take a share of the HP left (`cut`: Super Fang...) as "HP cut": against dummies
// with a billion HP their numbers mean nothing (fork/survival-lab.cjs measures those in a real run).
// Writes fork/BALANCE-LAB.md (the full table) and prints the flagged ones.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const SECS = +(args[args.indexOf('--secs') + 1] || 0) || 6;
const BASE = args.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8123';
const OUT = path.join(__dirname, 'BALANCE-LAB.md');
const SPEED = 4, STRONG = 1.6, WEAK = 0.6;
// The new kinds (js/fork/lab/kinds.js) next to the old kind they play most like.
const LIKE = { recoil: 'dash', ramp: 'melee', leap: 'meteor', sleep: 'stun', wave: 'beam', grab: 'melee', bind: 'melee', focus: 'melee' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    G.DB.save.owned[151] = { at: 1 }; G.DB.save.partner = 151; G.Settings.set('lab', true); G.MenuUI.open(); G.Game.startRun();
  });
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 30000 });
  const list = await page.evaluate(([speed]) => {
    // Judgment too: Arceus comes at 30 game minutes, which a full report passes (4× speed, 6 s a
    // move); its arena took the player away from the dummies and the moves after it measured ~0.
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) G[k].update = () => {};
    G.Weather.reset(); G.Weather.update = () => {};
    G.LevelUp.offer = () => [];
    G.Game.debugSpeed(speed);
    const pl = G.Game.player;
    pl.god = true; pl.xpMul = 0; pl.labAbility = null;
    pl.mon = Object.assign({}, G.DEX_BY[151], { types: ['none'] });
    return { normal: G.Moves.ALL.map(m => m.id), lab: G.LabMoves.filter(m => G.Moves.BY_ID[m.id]).map(m => m.id) };
  }, [SPEED]);

  /** DPS of one move at a level, in one arena. */
  const measure = (id, top, crowd) => page.evaluate(async ([id, top, crowd, secs]) => {
    const pl = G.Game.player;
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
    pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; pl.hp = pl.maxHp; pl.dead = false;
    // Nothing left over from the move before (Transform, a leap or a shield still going).
    if (pl._labTf) { pl.mon = pl._labTf.mon0; delete pl._labTf; G.Admin.repaint(pl); }
    delete pl._labLeap; delete pl._labGuard;
    for (const b of Object.values(pl.buffs)) b.n = 0;
    pl.addMove(id);
    const m = pl.moves[0];
    if (top) { while (G.Moves.levelUp(m)) {} G.Moves.evolve(m); }
    const spots = crowd ? [70, 150, 240].flatMap((r, i) => [0, 1, 2, 3].map(k => [r, k * 1.571 + i * 0.52])) : [[55, 0.3]];
    const def = { dex: 19, name: 'Dummy', hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' };
    const dummies = spots.map(([r, a]) => {
      const e = new G.Enemy(def, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.8, { hp: 1, spd: 1, dmg: 1 }, false);
      e.types = ['none']; e.home = [e.x, e.y]; G.EnemyMgr.add(e);
      return e;
    });
    const x0 = pl.x, y0 = pl.y;
    m.dealt = 0; m.t = 0;
    const t0 = G.Game.st.time;
    await new Promise(r => {
      const tick = setInterval(() => {
        for (const e of dummies) { e.x = e.home[0]; e.y = e.home[1]; e.kx = e.ky = 0; e.hp = e.maxHp; e.stunT = 0; e.labSleep = 0; e.labConf = 0; }
        pl.x = x0; pl.y = y0;
        if (G.Game.st.time - t0 >= secs) { clearInterval(tick); r(); }
      }, 400 / 4);
    });
    const t = G.Game.st.time - t0;
    return { dps: (m.dealt || 0) / t, cut: !!m.cut, kind: m.kind, type: m.type, name: G.T(m.name, 'move'), evolved: !!m.evolved, lvl: m.lvl, lab: !!m.lab, sig: !!m.sig };
  }, [id, top, crowd, SECS]);

  const SUPPORT = new Set(['buff', 'guard', 'weather', 'terrain', 'heal', 'screen', 'shout', 'endure']);
  const levels = flag('--lvl1') ? [true, false] : [true];
  const ids = flag('--lab') ? list.lab : list.normal.concat(list.lab);
  const rows = [];
  const t0 = Date.now();
  for (const top of levels) {
    for (const id of list.normal.concat(list.lab)) {
      if (!ids.includes(id) && !list.normal.includes(id)) continue;
      const crowd = await measure(id, top, true), single = await measure(id, top, false);
      rows.push(Object.assign({ id, top, crowd: crowd.dps, single: single.dps }, crowd));
      process.stdout.write('.');
    }
  }
  console.log(` ${rows.length} measurements in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 1; };
  const out = [];
  for (const top of levels) {
    const base = rows.filter(r => r.top === top && !r.lab && !SUPPORT.has(r.kind) && r.crowd > 0);
    const mc = median(base.map(r => r.crowd)), ms = median(base.map(r => r.single));
    const score = r => Math.sqrt((r.crowd / mc) * (r.single / ms));
    const kindMed = {};
    for (const k of new Set(base.map(r => r.kind))) kindMed[k] = median(base.filter(r => r.kind === k).map(score));
    const allMed = median(base.map(score));
    for (const r of rows.filter(r => r.top === top && (r.lab || !flag('--lab')))) {
      r.rc = r.crowd / mc; r.rs = r.single / ms; r.sc = score(r);
      r.rk = r.sc / (kindMed[r.kind] || kindMed[LIKE[r.kind]] || allMed);
      r.flag = SUPPORT.has(r.kind) ? 'support' : r.cut ? 'HP cut' : r.rk > STRONG ? 'strong' : r.rk < WEAK ? 'weak' : '';
      out.push(r);
    }
    out.push({ medians: true, top, mc, ms });
  }
  const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);
  const md = ['# Lab mode balance report', '',
    `Generated by \`node fork/balance-lab.cjs\` on ${new Date().toISOString().slice(0, 10)} (${SECS} game seconds per move and arena). Don't edit by hand.`,
    'DPS against typeless dummies with Mew\'s stats; ×crowd / ×single = divided by the median of the normal game\'s damaging moves;',
    'score = √(×crowd · ×single); ×kind = score divided by the median score of the normal game\'s moves of the same kind (new kinds: '
      + Object.entries(LIKE).map(([a, b]) => a + ' as ' + b).join(', ') + '; the others, all moves).',
    `Flags (on ×kind): strong over ×${STRONG}, weak under ×${WEAK}, support = deals no damage itself, HP cut = takes a share of the HP left (not comparable here).`, ''];
  for (const top of levels) {
    const med = out.find(r => r.medians && r.top === top);
    md.push(`## ${top ? 'Top level (evolved when it can)' : 'Level 1'}`, '', `Normal-game medians: crowd ${f1(med.mc)} DPS, single ${f1(med.ms)} DPS.`, '',
      '| Move | Kind | Type | Lab | DPS crowd | ×crowd | DPS single | ×single | Score | ×kind | Flag |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of out.filter(r => !r.medians && r.top === top).sort((a, b) => b.rk - a.rk))
      md.push(`| ${r.name} (${r.id}) | ${r.kind} | ${r.type} | ${r.sig ? 'signature' : r.lab ? 'yes' : ''} | ${f1(r.crowd)} | ${f2(r.rc)} | ${f1(r.single)} | ${f2(r.rs)} | ${f2(r.sc)} | ${f2(r.rk)} | ${r.flag} |`);
    md.push('');
  }
  fs.writeFileSync(OUT, md.join('\n'));
  const lab = out.filter(r => !r.medians && r.lab);
  for (const k of ['strong', 'weak']) {
    const l = lab.filter(r => r.flag === k);
    console.log(`${k} (${l.length}): ` + l.map(r => `${r.id} ×${f2(r.rk)}`).join(', '));
  }
  console.log('wrote ' + path.relative(process.cwd(), OUT) + (errors.length ? `\npage errors: ${errors.slice(0, 3).join(' | ')}` : ''));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
