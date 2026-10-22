#!/usr/bin/env node
// "Auto-shoot" under "Manual aim" (js/fork/manual-fire.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-manual-fire.cjs [base-url]
//
//   1. Settings → Accessibility: no Auto-shoot row while Manual aim is off; a real click on Manual aim
//      shows it under it, on ("Yes") by default.
//   2. Auto-shoot on (as before): Ember goes off on its own at a dummy, with no button held.
//   3. Auto-shoot off: Ember waits while nothing is held, even with the dummy right there; holding the
//      left mouse button on the map (a real press on the canvas) fires it, letting go stops it, and
//      holding Space fires it too. Meanwhile Swords Dance in another slot (evolved, m.passive) keeps
//      going off on its own.
//   4. Lab, Auto-shoot off: Protect in another slot still raises itself when the dummy comes close.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.ManualFire, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4;
      G.Settings.set('lab', false); G.Settings.set('aimManual', false); G.DB.commit(); G.Flow.goMenu();
    });

    console.log('1. The setting');
    await page.evaluate(() => G.SettingsUI.open('a11y'));
    const before = await page.evaluate(() => !!document.querySelector('[data-k="autoFire"]'));
    await page.click('.switch[data-k="aimManual"]');
    const after = await page.evaluate(() => {
      const b = document.querySelector('.switch[data-k="autoFire"]'), aim = document.querySelector('.switch[data-k="aimManual"]');
      const rowA = aim.closest('.set-row'), rowB = b && b.closest('.set-row');
      return { shown: !!b, on: b && b.textContent.trim(), under: !!rowB && rowA.nextElementSibling === rowB, label: rowB && rowB.querySelector('b').textContent, def: G.Settings.get('autoFire') };
    });
    check(!before, 'Manual aim off: no Auto-shoot row');
    check(after.shown && after.under && after.on === 'Yes' && after.def === true && after.label === 'Auto-shoot', 'a real click on Manual aim: "Auto-shoot" under it, on by default', after);
    await page.evaluate(() => G.SettingsUI.close());

    // A quiet run: Ember alone (Swords Dance in slot 2), a dummy 90 px away that neither moves nor hurts.
    async function run(lab, second) {
      await page.evaluate(async ([lab, second]) => {
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Game.toUI(); G.Flow.goMenu();
        G.Game.startRun(null, { dex: 4, shiny: false });
        while (G.Game.state !== 'playing') await new Promise(r => setTimeout(r, 30));
        for (const n of ['Spawner', 'Events', 'Rift', 'Hazards']) G[n].update = () => {};
        const pl = G.Game.player;
        pl.hurt = () => {};
        pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4;
        G.EnemyMgr.clear(); G.Combat.clearFields();
        pl.addMove('ember'); pl.addMove(second); pl.setActive(0);
        if (second === 'swords-dance') pl.moves[1].passive = true;
        window.__casts = {};
        const cast = pl.cast;
        pl.cast = function (m) { window.__casts[m.id] = (window.__casts[m.id] || 0) + 1; return cast.apply(this, arguments); };
        const def = { dex: 19, name: 'Dummy', hp: 1e6, spd: 0, dmg: 0, xp: 0, behavior: 'chase' };
        window.__dummy = new G.Enemy(def, pl.x + 90, pl.y, { hp: 1, spd: 1, dmg: 1 }, false);
        G.EnemyMgr.add(window.__dummy);
      }, [lab, second]);
    }
    const casts = (ms, id) => page.evaluate(async ([ms, id]) => {
      const a = window.__casts[id] || 0;
      await new Promise(r => setTimeout(r, ms));
      return (window.__casts[id] || 0) - a;
    }, [ms, id]);

    console.log('2. Auto-shoot on');
    await run(false, 'swords-dance');
    check(await casts(2000, 'ember') > 0, 'Ember goes off on its own, nothing held');

    console.log('3. Auto-shoot off');
    await page.evaluate(() => G.Settings.set('autoFire', false));
    await page.waitForTimeout(300);
    const [idle, dance] = await Promise.all([casts(2500, 'ember'), casts(2500, 'swords-dance')]);
    check(idle === 0, 'nothing held: Ember waits, the dummy right there', { idle });
    check(dance > 0, 'Swords Dance in another slot still goes off on its own', { dance });
    // A real press on the map, right of the Pokémon (towards the dummy), away from the HUD.
    await page.mouse.move(820, 330); await page.mouse.down();
    const held = await casts(1500, 'ember');
    await page.mouse.up();
    await page.waitForTimeout(300);
    const released = await casts(1500, 'ember');
    check(held > 0 && released === 0, 'holding the left mouse button fires it, letting go stops it', { held, released });
    await page.keyboard.down('Space');
    const space = await casts(1500, 'ember');
    await page.keyboard.up('Space');
    check(space > 0, 'holding Space fires it', { space });

    console.log('4. Lab, Auto-shoot off');
    await run(true, 'protect');
    const guard = await page.evaluate(async () => {
      const pl = G.Game.player;
      window.__dummy.x = pl.x + 40; window.__dummy.y = pl.y;
      for (let t = 0; t < 6000; t += 30) { if (pl._labGuard) return true; await new Promise(r => setTimeout(r, 30)); }
      return false;
    });
    check(guard && await casts(1000, 'ember') === 0, 'Protect in another slot raises itself; Ember still waits', { guard });

    await page.evaluate(() => { G.Settings.set('autoFire', true); G.Settings.set('aimManual', false); G.Settings.set('lab', false); });
    check(!errs.length, 'no page errors', errs);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
