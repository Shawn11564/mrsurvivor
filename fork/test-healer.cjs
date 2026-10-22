#!/usr/bin/env node
// Enemy healers heal the others around them, not themselves (js/fork/healer-self.js), in headless Edge
// on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-healer.cjs [base-url]
//
//   1. A hurt healer next to a hurt ally: its heal (enemy.js healAround) raises the ally, not itself.
//   2. Two hurt healers side by side: each heals the other.
//   3. Left to the game for a while (its own AI casting): a lone hurt healer never gets its health back.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.MenuUI, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; G.DB.commit();
      G.Settings.set('lab', false); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false });
    });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(() => {
      G.Spawner.update = () => {};
      const p = G.Game.player; p.hurt = () => {}; p.moves.forEach(m => { m.t = 1e9; m.cd = 1e9; });   // it doesn't fight back
      window.mk = (dx, dy, healer) => {
        const def = G.Enemies.cast.flatMap(t => t.list)[0];
        const e = new G.Enemy(def, p.x + dx, p.y + dy, G.Enemies.scale(0));
        e.spd = 0; e.maxHp *= 50; e.hp = e.maxHp / 2;
        if (healer) e.behavior = 'healer';
        G.EnemyMgr.add(e);
        return e;
      };
    });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    console.log('1. A healer next to an ally');
    await page.evaluate(() => { G.EnemyMgr.clear(); window.h = mk(200, 0, true); window.a = mk(240, 0, false); });
    await frame();                                    // queryCircle's grid is rebuilt each frame
    const r1 = await page.evaluate(() => { const h0 = h.hp, a0 = a.hp; h.healAround(); return { healer: [h0, h.hp], ally: [a0, a.hp] }; });
    check(r1.ally[1] > r1.ally[0], 'the ally is healed', r1.ally);
    check(r1.healer[1] === r1.healer[0], 'the healer isn\'t', r1.healer);

    console.log('2. Two healers');
    await page.evaluate(() => { G.EnemyMgr.clear(); window.h = mk(200, 0, true); window.h2 = mk(240, 0, true); });
    await frame();
    const r2 = await page.evaluate(() => { const a0 = h.hp, b0 = h2.hp; h.healAround(); return { self: [a0, h.hp], other: [b0, h2.hp] }; });
    check(r2.other[1] > r2.other[0] && r2.self[1] === r2.self[0], 'one healer heals the other, not itself', r2);

    console.log('3. A lone healer, left to the game');
    await page.evaluate(() => { G.EnemyMgr.clear(); window.h = mk(120, 0, true); window.h0 = h.hp; window.casts = 0;
      const f = h.healAround; h.healAround = function () { casts++; return f.apply(this, arguments); }; });
    await page.waitForFunction(() => casts >= 2, null, { timeout: 30000 }).catch(() => {});
    const r3 = await page.evaluate(() => ({ casts, hp: [h0, h.hp], dead: h.dead }));
    check(r3.casts >= 2 && r3.hp[1] <= r3.hp[0] && !r3.dead, 'it casts its heal and its health doesn\'t go up', r3);

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll healer checks passed');
  process.exit(failures ? 1 : 0);
})();
