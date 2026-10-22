#!/usr/bin/env node
// Toughness and the speed cap (js/fork/lab/toughness.js, Lab first), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-toughness.cjs [base-url]
//
//   1. Lab run: +100% defense takes half (a real hit through Player.hurt), +300% is capped at +200%
//      (a third); a normal run keeps the old rule (+50% = half).
//   2. Lab run: speed stops at ×2.5 of your own; then the speed card never comes up in 300 hands,
//      and the defense card says "toughness".
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Toughness, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.pupg = {}; s.prest = {}; G.DB.commit(); G.Flow.goMenu(); });
    const run = lab => page.evaluate(lab => { G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.level = 6; }));
    const took = dr => page.evaluate(dr => {
      const pl = G.Game.player; pl.dmgReduce = dr; pl.hp = pl.maxHp = 1e6; pl.invuln = 0; pl.god = false;
      pl.hurt(900, null, false); return +(1e6 - pl.hp).toFixed(1);
    }, dr);

    console.log('1. Toughness');
    await run(true);
    const t0 = await took(0), t1 = await took(1), t3 = await took(3);
    check(Math.abs(t1 / t0 - 0.5) < 0.01 && Math.abs(t3 / t0 - 1 / 3) < 0.01, 'Lab: +100% takes half, +300% stops at a third', { t0, t1, t3 });
    await run(false);
    const n0 = await took(0), n5 = await took(0.5);
    check(Math.abs(n5 / n0 - 0.5) < 0.01, 'normal run: the old rule (+50% = half)', { n0, n5 });

    console.log('2. Speed cap');
    await run(true);
    const s = await page.evaluate(() => {
      const pl = G.Game.player; pl.spdMul = 1; const base = pl.spd;
      pl.spdMul = 2; const two = pl.spd / base;
      pl.spdMul = 6; const six = pl.spd / base;
      let spdCards = 0, defText = null;
      for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl)) { if (c.key === 'stat:spd') spdCards++; if (c.key === 'stat:def') defText = c.desc; }
      return { two: +two.toFixed(2), six: +six.toFixed(2), spdCards, defText };
    });
    check(s.two === 2 && s.six === 2.5, 'speed: ×2 stays ×2, ×6 stops at ×2.5', s);
    check(s.spdCards === 0, 'capped: the speed card never comes up in 300 hands', s.spdCards);
    check(/toughness/.test(s.defText || ''), 'the defense card talks about toughness', s.defText);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll toughness checks passed');
  process.exit(failures ? 1 : 0);
})();
