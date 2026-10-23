#!/usr/bin/env node
// One health bar per nearby boss (js/fork/boss-bars.js, drawn from js/ui/hud.js), in headless Edge
// on dev.html, as a guest, in a real run with real bosses (G.Enemy, boss = true):
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-boss-bars.cjs [base-url]
//
//   1. No boss: no bar, and the text under the clock stays where upstream put it (y 76).
//   2. One boss near you: one bar with its name, the text under it at 98, as before.
//   3. Three near and one far away (past G.BossBars.RANGE): three bars, nearest first; the far one
//      has none.
//   4. Six near: four bars and "+2 MORE"; the text under the clock moves below them.
//   5. Killing bosses takes their bars away.
// What was drawn is read from the canvas's fillText calls in a real frame. A screenshot of case 4
// goes to the scratch folder given in BOSS_BARS_SHOT, if set.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.BossBars, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; G.Settings.set('lab', false); G.DB.commit(); G.Flow.goMenu(); });
    await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => {
      G.Spawner.update = () => {};
      const pl = G.Game.player; pl.invuln = 1e9;
      for (const e of G.EnemyMgr.all()) e.dead = true;
      // Bosses that stay put (they'd walk to you otherwise) and that your own moves can't hurt
      // (Charmander auto-fires at the nearest: a boss going down mid-check made it flaky).
      window.__boss = (dx, dy, name) => {
        const def = G.Enemies.cast.flatMap(c => c.list)[0];
        const e = new G.Enemy(def, pl.x + dx, pl.y + dy, G.Enemies.scale(0), true);
        e.name = name; e.update = function () {}; e.hurt = function () {}; G.EnemyMgr.add(e);
        return e;
      };
      // The texts one real HUD frame draws, with their y.
      const fill = CanvasRenderingContext2D.prototype.fillText;
      window.__texts = null;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (window.__texts) window.__texts.push([String(t), Math.round(y)]); return fill.apply(this, arguments); };
      window.__frame = () => new Promise(r => requestAnimationFrame(() => { window.__texts = []; requestAnimationFrame(() => { const t = window.__texts; window.__texts = null; r(t); }); }));
    });
    const look = () => page.evaluate(async () => {
      const t = await window.__frame();
      return { state: G.Game.state, shown: G.BossBars.shown, more: G.BossBars.more, below: G.BossBars.below(76),
               names: t.filter(([s]) => /^BOSS/.test(s)).map(([s, y]) => s + '@' + y), more$: t.filter(([s]) => /MORE/.test(s)).map(([s]) => s) };
    });

    console.log('1. No boss');
    const a = await look();
    check(a.shown === 0 && !a.names.length && a.below === 76, 'no bar; the text under the clock at 76', a);

    console.log('2. One boss near you');
    await page.evaluate(() => window.__boss(300, 0, 'Boss A'));
    const b = await look();
    check(b.shown === 1 && b.names.join() === 'BOSS A@80' && b.below === 98, 'one bar (name at 80, as upstream), text under it at 98', b);

    console.log('3. Three near, one far');
    await page.evaluate(() => { window.__boss(-150, 100, 'Boss B'); window.__boss(0, -700, 'Boss C'); window.__boss(G.BossBars.RANGE + 400, 0, 'Boss FAR'); });
    const c = await look();
    check(c.shown === 3 && c.names.join() === 'BOSS B@80,BOSS A@97,BOSS C@114' && !c.more$.length, 'three bars, nearest first; the far boss has none', c);

    console.log('4. Six near');
    await page.evaluate(() => { window.__boss(500, 300, 'Boss D'); window.__boss(-600, -200, 'Boss E'); window.__boss(200, 800, 'Boss F'); });
    const d = await look();
    check(d.shown === 4 && d.more === 2 && d.names.length === 4 && d.more$.join() === '+2 MORE', 'four bars and "+2 MORE"', d);
    check(d.below > 70 + 4 * 17, 'the text under the clock moves below the stack', d.below);
    if (process.env.BOSS_BARS_SHOT) await page.screenshot({ path: process.env.BOSS_BARS_SHOT, clip: { x: 340, y: 0, width: 600, height: 190 } });

    console.log('5. Bosses killed');
    // (Their drops go at once: XP picked up here could level you up, and the cards pause the HUD.)
    await page.evaluate(() => { for (const e of G.EnemyMgr.all()) if (e.boss && e.name !== 'Boss FAR' && e.name !== 'Boss A') G.Enemy.prototype.hurt.call(e, 1e12, '#fff', 1, 0, 0); G.Pickups.clear(); });
    const e = await look();
    check(e.state === 'playing' && e.shown === 1 && e.names.join() === 'BOSS A@80' && e.below === 98, 'only Boss A\'s bar is left', e);

    check(!errors.length, 'no page errors', errors.slice(0, 5));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll boss bar checks passed');
  process.exit(failures ? 1 : 0);
})();
