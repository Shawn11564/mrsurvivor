#!/usr/bin/env node
// The in-run stats panel (js/fork/stats-panel.js), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-stats-panel.cjs [base-url] [screenshot.png]
//
//   1. Settings → Graphics has "Stats panel", off: in a run nothing is drawn under the HP bar.
//   2. On: the lines under the HP bar say the real numbers (damage ×1.00 at the start, the HP), and
//      after an Epic Potencia card (×1.2) "Dmg ×1.20" and "Cards: Power 2".
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
    await page.waitForFunction(() => G.DB.save && G.StatsPanel, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
    await page.evaluate(() => { document.getElementById('btn-settings').click(); document.querySelector('#set-tabs [data-t="gfx"]').click(); });
    await page.waitForTimeout(300);
    const sw = await page.evaluate(() => { const b = document.querySelector('#set-body .switch[data-k="statsPanel"]'); return b && b.textContent.trim(); });
    await page.evaluate(() => G.SettingsUI.close());
    check(sw === 'No', 'Settings → Graphics has the Stats panel switch, off', sw);

    await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; requestAnimationFrame(alive); })(); });
    const lines = () => page.evaluate(() => new Promise(res => {
      const seen = [], raw = G.I18n.rawCanvas;
      G.I18n.rawCanvas = function (ctx, m, text) { if (m === 'fillText') seen.push(String(text)); return raw.apply(this, arguments); };
      requestAnimationFrame(() => { G.I18n.rawCanvas = raw; res(seen.filter(t => /Dmg|Cards:/.test(t))); });
    }));
    check((await lines()).length === 0, 'off: nothing under the HP bar');
    await page.evaluate(() => G.Settings.set('statsPanel', true));
    const l1 = await lines(), hp = await page.evaluate(() => Math.round(G.Game.player.maxHp));
    check(l1.length && /Dmg ×1\.00/.test(l1[0]) && l1[0].includes('HP ' + hp) && !l1.some(t => /Cards:/.test(t)), 'on: the real numbers, no cards yet', l1);
    await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity, roll = R.roll;
      R.roll = () => R.TIERS[3];
      let c = null;
      for (let i = 0; i < 300 && !c; i++) c = G.LevelUp.offer(pl).find(x => x.key === 'stat:atk');
      R.roll = roll;
      c.apply(pl);
    });
    const l2 = await lines();
    check(/Dmg ×1\.20/.test(l2.join(' ')) && l2.some(t => /Cards: Power 2/.test(t)), 'after an Epic Potencia: Dmg ×1.20 and "Cards: Power 2"', l2);
    if (SHOT) { await page.waitForTimeout(300); await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 420, height: 160 } }); }
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll stats panel checks passed');
  process.exit(failures ? 1 : 0);
})();
