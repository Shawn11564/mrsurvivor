#!/usr/bin/env node
// The Bewear secret (js/fork/bewear.js), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-bewear.cjs [base-url] [screenshot.png]
//
//   1. Before finding it: no "Hearts" in Settings → Graphics, and shots look as always.
//   2. In a run, Bewear is far to the south of the start (about 3000 px), on free ground, drawn with
//      the scene when you're there; walking up to it unlocks Hearts (once, with a popup) and turns it on.
//   3. With Hearts on, your shots are hearts; off, they're back to normal. The setting is in
//      Settings → Graphics and its switch works.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const SHOT = process.argv[3];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Bewear, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; delete s.hearts; G.DB.commit(); G.Flow.goMenu(); });
    const gfx = () => page.evaluate(() => {
      document.getElementById('btn-settings').click();
      document.querySelector('#set-tabs [data-t="gfx"]').click();
      const b = document.querySelector('#set-body .switch[data-k="hearts"]');
      return b ? b.textContent.trim() : null;
    });

    console.log('1. Before');
    check(await gfx() === null, 'no Hearts switch in Settings → Graphics yet');
    await page.evaluate(() => { G.SettingsUI.close(); G.UI.hideAll(); G.Flow.goMenu(); });

    console.log('2. Finding Bewear');
    await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; requestAnimationFrame(alive); })(); });
    await page.waitForTimeout(3300);
    const shotsBefore = await page.evaluate(async () => {
      const pl = G.Game.player, m = G.Moves.instance('ember', 1);
      pl.slots = [[m]]; pl.moves = [m]; pl.active = 0;
      const def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, pl.x + 120, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      for (let i = 0; i < 200 && !G.Projectiles.all().some(p => p.friendly && p.owner === pl); i++) await new Promise(r => requestAnimationFrame(r));
      const p = G.Projectiles.all().find(p => p.friendly && p.owner === pl);
      return p && p.vis.proj;
    });
    check(shotsBefore && shotsBefore !== 'heart', 'shots are normal before', shotsBefore);
    const at = await page.evaluate(() => {
      const s = G.Bewear.where(), toasts = [];
      const t = G.UI.toast; G.UI.toast = function (m) { toasts.push(String(m)); return t.apply(this, arguments); };
      window.__toasts = toasts;
      const pl = G.Game.player; G.EnemyMgr.clear(); pl.x = s.x; pl.y = s.y - 160;      // close enough to see it, not touching
      return { s, free: G.World.isFree(s.x, s.y, 18) };
    });
    check(at.s.y > 2400 && at.s.y < 3700 && Math.abs(at.s.x) < 700 && at.free, 'it stands far south of the start, on free ground', at);
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => {
      const d = G.Events.drawables(), s = G.Bewear.where();
      return { drawn: d.some(x => Math.abs(x.y - s.y) < 1), hearts: !!G.DB.save.hearts };
    });
    check(seen.drawn && !seen.hearts, 'in view it is drawn with the scene; not touched yet, nothing unlocked', seen);
    if (SHOT) {
      await page.evaluate(() => { const s = G.Bewear.where(), pl = G.Game.player; pl.x = s.x - 90; pl.y = s.y + 10; });
      await page.waitForTimeout(600);
      await page.screenshot({ path: SHOT });
    }
    await page.evaluate(() => { const s = G.Bewear.where(), pl = G.Game.player; pl.x = s.x + 20; pl.y = s.y + 8; });
    const got = await page.waitForFunction(() => !!G.DB.save.hearts, null, { timeout: 5000 }).then(() => true, () => false);
    const tx = await page.evaluate(() => ({ toasts: window.__toasts, on: !!G.Settings.get('hearts') }));
    check(got && tx.on && tx.toasts.some(t => /huge hug/.test(t) && /Settings → Graphics/.test(t)), 'walking up to it: a hug, Hearts unlocked and on', tx);

    console.log('3. Hearts');
    const shot = async () => page.evaluate(async () => {
      const pl = G.Game.player; G.Projectiles.clear();
      const def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, pl.x + 120, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      for (let i = 0; i < 200 && !G.Projectiles.all().some(p => p.friendly && p.owner === pl); i++) await new Promise(r => requestAnimationFrame(r));
      const p = G.Projectiles.all().find(p => p.friendly && p.owner === pl);
      G.EnemyMgr.clear();
      return p && p.vis.proj;
    });
    check(await shot() === 'heart', 'with Hearts on, your shots are hearts');
    await page.evaluate(() => G.Settings.set('hearts', false));
    const off = await shot();
    check(off && off !== 'heart', 'off: back to normal', off);
    await page.evaluate(() => { G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Flow.goMenu(); });
    check(await gfx() === 'No', 'Settings → Graphics now has the Hearts switch (off)');
    await page.click('#set-body .switch[data-k="hearts"]');
    check(await page.evaluate(() => !!G.Settings.get('hearts')), 'and switching it turns Hearts on');
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Bewear checks passed');
  process.exit(failures ? 1 : 0);
})();
