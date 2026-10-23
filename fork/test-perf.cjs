#!/usr/bin/env node
// Performance in a long run (TODO 55), in headless Edge on dev.html, as a guest, on the game's fake clock
// (page.clock: ~1.3 s real per game second):
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-perf.cjs [base-url] [--only mem|fps]
//
// The run: Charmander with three more moves at their top level, invulnerable, walking a slow circle so
// the map scrolls and enemies chase it; level-up cards, items, bonds and the Choice Band are picked at once.
//
//   1. Memory: sprite sheets in a late run. At 15:00 of the game clock, played on at the real pace for
//      2 minutes: the sheets js/core/sprites.js keeps (G.Sprites.sheetCount) must stay near its cap of
//      200 (at most 290 at any sample from 60 s on); then 30 s in the menu, at most 200. Before
//      js/fork/sheet-budget.js (and the sweep it needs in js/core/sprites.js) the spawner's preload
//      kept the whole run's cast (every tier and boss so far, all 7 animations) in use, so 322-340
//      sheets stayed (59 Mpx decoded, ~235 MB, plus their white hit-flash copies, 27 Mpx, ~107 MB);
//      with it, 212-254 (46 Mpx, flash copies 23 Mpx).
//   2. Frame cost guard (no fix behind it: nothing measured here was slow): the JS time of the game's
//      frame (the requestAnimationFrame callback, timed with the real clock) at 1:00 and at 25:00 with
//      all four moves bonded into one slot and 60+ enemies. Late at most 4x early and at most 10 ms.
//      Measured on the owner's PC (2026-10-23): 1.3 ms early, 2.5-3.3 ms late (p99 4-5 ms); with the
//      CPU slowed 4x (CDP throttling) 6.8 ms early and 14.5 ms late (p95 21 ms).
//
// PERF_WITHOUT=sheet-budget (a comma list of js/fork/*.js names) serves those files empty, to see the
// checks fail without them.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const WITHOUT = (process.env.PERF_WITHOUT || '').split(',').filter(Boolean);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  for (const name of WITHOUT) await ctx.route('**/js/fork/' + name + '.js*', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__realNow = performance.now.bind(performance);        // before the fake clock replaces it
    try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ }
  });
  await page.clock.install();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.Game && G.Sprites.sheetCount != null, null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; G.Settings.set('lab', false); G.DB.commit();
    G.UI.hideAll(); G.Flow.goMenu();
    // Cards, items and bonds are picked at once (the run never waits on a screen).
    G.RunUI.showLevelUp = (lvl, list, cb) => setTimeout(() => { G.UI.hide('scr-levelup'); cb(list[0]); }, 0);
    G.RunUI.showItemChoice = (cur, next, cb) => setTimeout(() => cb(next), 0);
    G.RunUI.showBond = (opt, cb) => setTimeout(() => { G.Game.player.bonds = 0; cb(null); }, 0);
    if (G.ChoiceLock) G.ChoiceLock.ask = (pl, done) => { setTimeout(done, 0); return true; };   // the Choice Band keeps the slot it has
    // The game's frame: its requestAnimationFrame callback is game.js's loop(); its real time.
    const raf = window.requestAnimationFrame;
    window.__ft = [];
    window.requestAnimationFrame = cb => raf(ts => { const t0 = window.__realNow(); cb(ts); if (cb.name === 'loop') window.__ft.push(window.__realNow() - t0); });
  });
  return { page, errors, ctx };
}

/** A run at game time `mins` minutes (see the top); `fuse` bonds all four moves into one slot. */
async function run(page, mins, fuse) {
  await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
  await page.evaluate(([mins, fuse]) => {
    const pl = G.Game.player;
    pl.invuln = 1e9; pl.hurt = function () {}; pl.atkMul = 6;
    pl.gainXp = function () { return 0; };             // no level-ups from gems (the late clock would bring dozens)
    for (const id of G.Moves.poolFor(pl.mon).filter(id => !pl.hasMove(id)).slice(0, 3)) pl.addMove(id);
    for (const m of pl.moves) while (G.Moves.levelUp(m)) { /* to the top */ }
    if (fuse) pl.fuse(pl.moves.slice());
    G.Game.debugTime(mins * 60);
    G.Input.axis = () => { const t = G.Game.st.time; return [Math.cos(t * 0.15), Math.sin(t * 0.15)]; };
  }, [mins, fuse]);
}

const frameStats = page => page.evaluate(() => {
  const f = window.__ft.slice().sort((a, b) => a - b), n = f.length;
  window.__ft = [];
  return { frames: n, mean: +(f.reduce((a, b) => a + b, 0) / n).toFixed(2), p95: +f[Math.floor(n * 0.95)].toFixed(2), p99: +f[Math.floor(n * 0.99)].toFixed(2) };
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    if (WITHOUT.length) console.log('(without ' + WITHOUT.join(', ') + ')');
    if (!only || only === 'mem') {
      console.log('1. Memory: sprite sheets in a late run (15:00 on, real pace)');
      const { page, errors, ctx } = await open(browser);
      await run(page, 15, false);
      const look = () => page.evaluate(() => {
        const t = Math.round(G.Game.st.time), sheets = G.Sprites.sheetCount;
        return { t, sheets, enemies: G.EnemyMgr.count, state: G.Game.state };
      });
      const samples = [];
      for (let i = 0; i < 4; i++) { await page.clock.runFor(30000); samples.push(await look()); }
      console.log('    ' + samples.map(s => s.t + ' s: ' + s.sheets + ' sheets, ' + s.enemies + ' enemies').join(' · '));
      const late = samples.slice(1);
      check(late.every(s => s.state === 'playing' || s.state === 'resuming' || s.state === 'levelup'), 'the run went on', late.map(s => s.state));
      check(Math.max(...late.map(s => s.sheets)) <= 290, 'at most 290 sprite sheets kept from 60 s on (the cap is 200; the whole cast was 320+)', late.map(s => s.sheets));
      await page.evaluate(() => G.Game.quit());
      await page.clock.runFor(1500);
      await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); });
      await page.clock.runFor(30000);
      const menu = await look();
      check(menu.sheets <= 200, 'at most 200 sheets after 30 s in the menu', menu.sheets);
      check(!errors.length, 'no page errors', errors.slice(0, 3));
      await ctx.close();
    }
    if (!only || only === 'fps') {
      console.log('2. Frame cost guard: 1:00 against 25:00 with all moves in one slot');
      const { page, errors, ctx } = await open(browser);
      await run(page, 1, true);
      await page.clock.runFor(30000); await frameStats(page);
      await page.clock.runFor(10000);
      const early = await frameStats(page);
      await page.evaluate(() => G.Game.quit());
      await page.clock.runFor(1500);
      await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); });
      await run(page, 25, true);
      await page.clock.runFor(40000); await frameStats(page);
      await page.clock.runFor(10000);
      const late = await frameStats(page);
      const enemies = await page.evaluate(() => G.EnemyMgr.count);
      console.log('    early ' + JSON.stringify(early) + ' · late ' + JSON.stringify(late) + ' with ' + enemies + ' enemies');
      check(early.frames > 500 && late.frames > 500, 'frames ran', [early.frames, late.frames]);
      check(enemies >= 50, 'a crowded late run (50+ enemies)', enemies);
      check(late.mean <= Math.max(4 * early.mean, 2), 'a late frame costs at most 4x an early one', [early.mean, late.mean]);
      check(late.mean <= 10, 'a late frame costs at most 10 ms of JS', late.mean);
      check(!errors.length, 'no page errors', errors.slice(0, 3));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
