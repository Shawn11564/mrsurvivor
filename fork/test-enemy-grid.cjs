#!/usr/bin/env node
// The enemy grid lists each enemy once (js/entities/enemy.js `key`), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root, in another terminal)
//   node fork/test-enemy-grid.cjs [base-url]
//
// EnemyMgr buckets enemies by 52 px cell under key(cx, cy) = cx*73856093 ^ cy*19349663, and that key
// is the same for a cell and its mirror through the world origin: (1,-1) and (-1,1), (6,6) and (-6,-6).
// queryCircle walks every cell of its box, so a box that spans the origin (where every run starts)
// visited the same bucket twice and returned its enemies twice: an aura move hit them twice, and
// enemies were pushed apart twice as hard. In a real run:
//   1. queryCircle around the origin returns a dummy once (it returned it twice).
//   2. A real Discharge cast at the origin hits the dummy once, the same as far from the origin.
//   3. Across a block of cells around the origin, a query never lists an enemy twice.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (info !== undefined ? ' (' + JSON.stringify(info) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* none */ } });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[25] = { at: Date.now() }; s.partner = 25; s.starter = 25;
      G.Settings.set('lab', false); G.Settings.set('underdogLadder', false); G.DB.commit();
      G.UI.hideAll(); G.MenuUI.open(); G.Game.startRun();
    });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 });

    const res = await page.evaluate(() => {
      for (const k of ['Spawner', 'Events', 'Rift']) G[k].update = () => {};
      const pl = G.Game.player;
      pl.critChance = 0;
      const dummy = (x, y) => {
        const e = new G.Enemy({ dex: 19, name: 'Dummy', hp: 1e6, spd: 0, dmg: 1, xp: 0, behavior: 'chase' }, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
        e.spd = 0; e.touchCd = 99; e.hits = 0;
        const hurt = e.hurt; e.hurt = function () { this.hits++; return hurt.apply(this, arguments); };
        G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
        return e;
      };
      // A Discharge (aura) cast from (x, y) at a dummy 60 px away: how many times it's hit.
      const cast = (x, y) => {
        G.EnemyMgr.clear();
        pl.x = x; pl.y = y;
        const e = dummy(x + 60, y - 30);
        const listed = G.EnemyMgr.queryCircle(x, y, 100).filter(o => o === e).length;
        pl.slots.length = 0; pl.moves.length = 0; pl.active = 0; pl.addMove('discharge');
        G.Combat.run(pl, pl.moves[0]);
        return { listed, hits: e.hits };
      };
      return { origin: cast(0, 0), far: cast(5200, 5200) };
    });
    check(res.origin.listed === 1, 'queryCircle at the origin lists the dummy once', res.origin.listed);
    check(res.origin.hits === 1, 'a real Discharge at the origin hits it once', res.origin.hits);
    check(res.far.listed === 1 && res.far.hits === 1, 'far from the origin: listed once, hit once (as before)', res.far);

    // One enemy in every cell of an 81 × 81 block around the origin (about 2100 px each way): a query
    // over each cell and its neighbours never lists an enemy twice.
    const shared = await page.evaluate(() => {
      G.EnemyMgr.clear();
      const CELL = 52, R = 40, bad = [];
      const mk = (cx, cy) => {
        const e = new G.Enemy({ dex: 19, name: 'Dummy', hp: 10, spd: 0, dmg: 1, xp: 0, behavior: 'chase' }, (cx + 0.5) * CELL, (cy + 0.5) * CELL, { hp: 1, spd: 1, dmg: 1 }, false);
        e.r = 1; return e;
      };
      for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) G.EnemyMgr.add(mk(cx, cy));
      G.EnemyMgr.rebuildGrid();
      for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) {
        // 60 px reaches the cells beside it (not the diagonals): each enemy listed once.
        const q = G.EnemyMgr.queryCircle((cx + 0.5) * CELL, (cy + 0.5) * CELL, 60);
        if (q.length !== new Set(q).size && bad.length < 5) bad.push([cx, cy, q.length, new Set(q).size]);
      }
      G.EnemyMgr.clear();
      return bad;
    });
    check(shared.length === 0, 'each cell near the origin finds only its own enemy, once', shared);
    check(errors.length === 0, 'no page errors', errors);
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll enemy-grid checks passed');
  process.exit(failures ? 1 : 0);
})();
