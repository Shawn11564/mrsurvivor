#!/usr/bin/env node
// How long a build survives in a real Lab run (fork/LAB.md, "Close range and sustain"). A bot
// plays the run in headless Edge with real spawns, enemies, bosses and pickups; only its moves
// are fixed. It answers "are close-range builds worse?" with a number, and checks each change.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/survival-lab.cjs [--runs 3] [--max 900] [--only name,name] [base-url]
//
//   --runs   runs per build (default 3; the median is reported)
//   --max    stop a run that lasts this many game seconds (default 900)
//   --only   just these builds (names from BUILDS below)
//   --no-sets  with Lab's set bonuses off (js/fork/lab/sets.js), to measure what they add
//
// The setup is the same for every build, so the numbers compare builds, not Pokémon:
//   - the player is Mew's stats with no type and no ability; no XP (no level-up cards, no HP
//     growth), so the run ends when the enemies outgrow the build
//   - every move is at its top level, evolved when it can; `slots` are the move slots, the
//     first one active, moves in one slot bonded (cast together)
//   - no events, rifts, hazards or weather
//   - the bot: "close" walks up to the nearest enemy until it's in reach, then strafes, and
//     steps out when 4 or more are on top of it; "far" keeps away from everything within 260 px
//     and only walks closer when nothing is in range. It never picks up anything on purpose.
// The game runs at 4× speed, 4 runs at a time. Prints a table (median, min, max seconds).
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const RUNS = +opt('--runs', 3), MAX = +opt('--max', 900), ONLY = (opt('--only', '') || '').split(',').filter(Boolean);
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const SPEED = 4, PAR = 4;

// name, bot, slots (each a list of move ids bonded together)
const BUILDS = [
  { name: 'far: Aura Sphere',            bot: 'far',   slots: [['aura-sphere']] },
  { name: 'far: Flamethrower',           bot: 'far',   slots: [['flamethrower']] },
  { name: 'close: Karate Chop',          bot: 'close', slots: [['karate-chop']] },
  { name: 'close: Play Rough',           bot: 'close', slots: [['play-rough']] },
  { name: 'close: Fury Cutter (ramp)',   bot: 'close', slots: [['fury-cutter']] },
  { name: 'close: Rapid Spin (spin)',    bot: 'close', slots: [['rapid-spin']] },
  // stream A of fork/PLAN-2026-10-22.md (A4): movers and the upstream melee moves
  { name: 'close: Quick Attack (dash)',  bot: 'close', slots: [['quick-attack']] },
  { name: 'close: U-turn (dash)',        bot: 'close', slots: [['u-turn']] },
  { name: 'close: Flame Charge (dash)',  bot: 'close', slots: [['flame-charge']] },
  { name: 'close: Double-Edge (recoil)', bot: 'close', slots: [['double-edge']] },
  { name: 'close: Fly (leap)',           bot: 'close', slots: [['fly']] },
  { name: 'close: Dig (leap)',           bot: 'close', slots: [['dig']] },
  { name: 'close: Rollout (ramp)',       bot: 'close', slots: [['rollout']] },
  { name: 'close: Body Slam',            bot: 'close', slots: [['body-slam']] },
  { name: 'close: Vine Whip',            bot: 'close', slots: [['vine-whip']] },
  { name: 'close: Bite, Counter',        bot: 'close', slots: [['bite'], ['counter']] },
  // phase 9 (js/fork/lab/kinds2.js): close-range kinds, drain, and support in other slots
  { name: 'close: Drain Punch',          bot: 'close', slots: [['drain-punch']] },
  { name: 'close: Circle Throw (grab)',  bot: 'close', slots: [['circle-throw']] },
  { name: 'close: Bind',                 bot: 'close', slots: [['bind']] },
  { name: 'close: Focus Punch',          bot: 'close', slots: [['focus-punch']] },
  { name: 'close: Revenge',              bot: 'close', slots: [['revenge']] },
  { name: 'close: Karate Chop + Bulk Up', bot: 'close', slots: [['karate-chop', 'bulk-up']] },
  { name: 'close: Karate Chop, Growl',   bot: 'close', slots: [['karate-chop'], ['growl']] },
  { name: 'close: Karate Chop, Recover', bot: 'close', slots: [['karate-chop'], ['recover']] },
  { name: 'close: Karate Chop, Reflect', bot: 'close', slots: [['karate-chop'], ['reflect']] },
  { name: 'close: Karate Chop, Endure',  bot: 'close', slots: [['karate-chop'], ['endure']] },
  { name: 'close: Drain Punch, Growl, Reflect, Endure', bot: 'close', slots: [['drain-punch'], ['growl'], ['reflect'], ['endure']] },
  { name: 'far: Aura Sphere, Recover',   bot: 'far',   slots: [['aura-sphere'], ['recover']] },
  // phase 11 (js/fork/lab/sets.js): three moves of a set; compare with --no-sets
  { name: 'far: Fire set (Ember + Flamethrower + Heat Wave)', bot: 'far', slots: [['ember'], ['flamethrower'], ['heat-wave']] },
  { name: 'close: Fighting set (Karate Chop + Dynamic Punch + Rolling Kick)', bot: 'close', slots: [['karate-chop'], ['dynamic-punch'], ['rolling-kick']] },
  { name: 'close: Physical set (Bite + Body Slam + Tackle)', bot: 'close', slots: [['bite'], ['body-slam'], ['tackle']] },
  { name: 'far: Aura Sphere, Light Screen, Recover, Endure', bot: 'far', slots: [['aura-sphere'], ['light-screen'], ['recover'], ['endure']] }
];

// Pages load one at a time: several loading dev.html's ~70 scripts at once from the local
// Python server lost scripts (undefined G.* at boot). Once loaded, the runs play in parallel.
let loading = Promise.resolve();
async function oneRun(browser, b) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let release;
  const mine = loading.then(() => {});
  loading = new Promise(r => { release = r; });
  try {
    await mine;
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab, null, { timeout: 60000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 30000 });
    await page.evaluate(() => {
      G.DB.save.owned[151] = { at: 1 }; G.DB.save.partner = 151; G.Settings.set('lab', true);
      G.Settings.set('underdogLadder', false); G.MenuUI.open(); G.Game.startRun();
    });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Lab.active, null, { timeout: 60000 });
    release();
    return await page.evaluate(async ([b, speed, max, noSets]) => {
      if (noSets && G.LabSets) G.LabSets.off = true;
      for (const k of ['Events', 'Rift', 'Hazards']) G[k].update = () => {};
      G.Weather.reset(); G.Weather.update = () => {};
      G.LevelUp.offer = () => [];
      const pl = G.Game.player;
      pl.xpMul = 0; pl.labAbility = null;
      pl.mon = Object.assign({}, G.DEX_BY[151], { types: ['none'] });
      pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4;
      for (const ids of b.slots) {
        const g = [];
        for (const id of ids) {
          const m = G.Moves.instance(id, 1);
          while (G.Moves.levelUp(m)) {}
          G.Moves.evolve(m);
          m.since = 0; pl.moves.push(m); g.push(m);
        }
        pl.slots.push(g);
      }
      pl.active = 0;
      pl.hp = pl.maxHp;
      // ---- the bot ----
      const C = G.Combat;
      const reach = Math.max(...pl.slots[0].map(m => C.reach(m) || 0));
      let stuckT = 0, lastX = pl.x, lastY = pl.y, wander = null, side = 1, sideT = 0;
      const norm = (x, y) => { const d = Math.hypot(x, y); return d > 1e-6 ? [x / d, y / d] : [0, 0]; };
      G.Input.axis = () => {
        if (pl.dead) return [0, 0];
        if (wander && (wander.t -= 1 / 60) > 0) return wander.v;
        wander = null;
        let near = null, nd = Infinity, rx = 0, ry = 0, crowd = 0, cx = 0, cy = 0;
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 400)) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - pl.x, e.y - pl.y);
          if (d < nd) { nd = d; near = e; }
          if (d < 260) { rx += (pl.x - e.x) / (d * d + 1); ry += (pl.y - e.y) / (d * d + 1); }
          if (d < 70) { crowd++; cx += e.x; cy += e.y; }
        }
        let v = [0, 0];
        if (b.bot === 'far') {
          if (nd < 260) v = norm(rx, ry);
          else if (near && nd > 300) v = norm(near.x - pl.x, near.y - pl.y).map(k => k * 0.6);
        } else if (near) {
          if (crowd >= 4) v = norm(pl.x - cx / crowd, pl.y - cy / crowd);
          else if (nd > reach * 0.7) v = norm(near.x - pl.x, near.y - pl.y);
          else {
            if ((sideT -= 1 / 60) <= 0) { sideT = 1.2; side = -side; }
            const [ux, uy] = norm(near.x - pl.x, near.y - pl.y);
            v = [-uy * side * 0.5, ux * side * 0.5];
          }
        }
        // stuck against a wall: walk a random way for a moment
        if (Math.hypot(pl.x - lastX, pl.y - lastY) < 0.3 && (v[0] || v[1])) stuckT += 1 / 60; else stuckT = 0;
        lastX = pl.x; lastY = pl.y;
        if (stuckT > 0.4) { const a = Math.random() * 6.2832; wander = { t: 0.6, v: [Math.cos(a), Math.sin(a)] }; stuckT = 0; return wander.v; }
        return v;
      };
      G.Game.debugSpeed(speed);
      const t0 = G.Game.st.time;
      await new Promise(r => {
        const iv = setInterval(() => {
          if (pl.dead || G.Game.state !== 'playing' || G.Game.st.time - t0 >= max) { clearInterval(iv); r(); }
        }, 250);
      });
      return { secs: G.Game.st.time - t0, dead: pl.dead, dealt: Math.round(pl.dmgDealt) };
    }, [b, SPEED, MAX, args.includes('--no-sets')]);
  } finally {
    release();
    if (errors.length) console.log(`\n  page errors (${b.name}): ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const builds = BUILDS.filter(b => !ONLY.length || ONLY.some(o => b.name.toLowerCase().includes(o.toLowerCase())));
  const jobs = builds.flatMap(b => Array.from({ length: RUNS }, () => b));
  const res = new Map(builds.map(b => [b, []]));
  const t0 = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (next < jobs.length) {
      const b = jobs[next++];
      try { res.get(b).push(await oneRun(browser, b)); } catch (e) { console.log(`\n  run failed (${b.name}): ${e.message.split('\n')[0]}`); }
      process.stdout.write('.');
    }
  }));
  console.log(` ${jobs.length} runs in ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log('| Build | Median s | Min | Max | Runs |\n|---|---|---|---|---|');
  for (const b of builds) {
    const s = res.get(b).map(r => r.secs);
    if (!s.length) { console.log(`| ${b.name} | - | - | - | 0 |`); continue; }
    console.log(`| ${b.name} | ${Math.round(med(s))} | ${Math.round(Math.min(...s))} | ${Math.round(Math.max(...s))} | ${s.length} |`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
