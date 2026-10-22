#!/usr/bin/env node
// The Synthesis upgrade heals a share of your max HP (js/fork/regen-pct.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-regen.cjs [base-url]
//
// It gave a flat +0.2 HP/s a level (+1 HP/s at 5): nothing next to enemy damage that grows ×5 in
// 30 minutes. Now +0.25 % of max HP a second a level (1.25 %/s at 5), measured on the real HP bar:
//   1. Level 5, in a run: heals 1.25 % of max HP a second; level 0: nothing.
//   2. More max HP (an HP card) → more regen, at once.
//   3. In-run regen (the Synthesis card, +0.9/s) still adds on top.
//   4. The Upgrades screen says "+0.25% max HP/s".
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    // A run with Synthesis at `lv` ('hp3': max HP ×3, 'card': the in-run card) before measuring; HP healed a second as a share of max HP.
    const run = (lv, fn) => page.evaluate(async ([lv, fn]) => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.pupg = { 4: { regen: lv } };
      G.Settings.set('lab', false); G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      const wait = f => new Promise(res => { const i = setInterval(() => { if (f()) { clearInterval(i); res(); } }, 30); });
      await wait(() => G.Game.state === 'playing');
      G.Spawner.update = () => {}; G.EnemyMgr.clear();
      const pl = G.Game.player;
      if (fn === 'hp3') pl.maxHp *= 3;                 // what HP cards and upgrades do
      if (fn === 'card') pl.regenFlat += 0.9;          // the in-run Synthesis card (js/systems/levelup.js)
      pl.hp = pl.maxHp * 0.3;
      const h0 = pl.hp, t0 = G.Game.st.time;
      await new Promise(r => setTimeout(r, 3000));
      const out = { perSec: (pl.hp - h0) / (G.Game.st.time - t0), maxHp: pl.maxHp, regen: pl.regen };
      out.pct = +(out.perSec / pl.maxHp * 100).toFixed(3);
      G.Game.quit();
      await wait(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await wait(() => G.Game.state === 'ui');
      return out;
    }, [lv, fn || '']);

    console.log('1. Level 5 and level 0');
    const r5 = await run(5);
    check(Math.abs(r5.pct - 1.25) < 0.03, `level 5: ${r5.pct}% of max HP a second (${r5.perSec.toFixed(2)} HP/s of ${r5.maxHp})`, r5);
    const r0 = await run(0);
    check(r0.perSec === 0, 'level 0: no regen', r0);
    console.log('2. More max HP, more regen');
    const big = await run(5, 'hp3');
    check(Math.abs(big.pct - 1.25) < 0.03 && Math.abs(big.perSec / r5.perSec - 3) < 0.1, `max HP ×3: regen ×${(big.perSec / r5.perSec).toFixed(2)}`, big);
    console.log('3. The in-run card on top');
    const card = await run(5, 'card');
    check(Math.abs(card.perSec - r5.perSec - 0.9) < 0.05, `+0.9/s on top: ${card.perSec.toFixed(2)} vs ${r5.perSec.toFixed(2)}`, card);
    console.log('4. The Upgrades screen');
    await page.evaluate(() => document.querySelector('#scr-menu [data-go="upgrades"]').click());
    await page.waitForTimeout(300);
    const unit = await page.evaluate(() => (document.getElementById('scr-upgrades').textContent.match(/\+0\.25% max HP\/s|\+0\.2 HP\/s/) || [''])[0]);
    check(unit === '+0.25% max HP/s', 'Synthesis says "+0.25% max HP/s"', unit);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll regen checks passed');
  process.exit(failures ? 1 : 0);
})();
