#!/usr/bin/env node
// The 3 s "Resuming…" count-in only after a long stop (js/game.js countInAfter, TODO 47), solo, in
// headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in another terminal)
//   node fork/test-count-in.cjs [base-url]
//
// For each stop (the pause menu, a level-up card, a held item to swap, a bond): done within 10 s,
// the run goes straight back to playing; done after more than 10 s, the count-in plays. The 10 s go by
// on the game's clock (performance.now moved on 11 s), not for real. Co-op's holds and level-ups:
// fork/test-coop.cjs.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.Game, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      G.UI.hideAll(); G.Game.toUI();
      G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.Settings.set('pauseCount', true); G.DB.commit();
      G.Game.startRun(); const pl = G.Game.player; pl.god = true; pl.hurt = () => {}; pl.xpMul = 0;   // no level-ups from kills: only the ones asked for
      // The game's clock, moved on by later(s); and whether a count-in has played since watch().
      const o = performance.now.bind(performance); window.__skew = 0; performance.now = () => o() + window.__skew;
      (function w() { if (G.Game.state === 'resuming') window.__counted = true; requestAnimationFrame(w); })();
    });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    const later = s => page.evaluate(s => { window.__skew += s * 1000; }, s);
    const watch = () => page.evaluate(() => { window.__counted = false; });
    const settled = () => page.waitForFunction(() => G.Game.state === 'playing' && !G.UI.isOpen('scr-levelup'), null, { timeout: 8000 })
      .then(() => page.evaluate(() => window.__counted), () => page.evaluate(() => 'stuck in ' + G.Game.state));
    // Level-ups from the XP of kills may open by themselves: pick them quickly before each part.
    const clear = async () => {
      for (let i = 0; i < 10; i++) {
        const st = await page.evaluate(() => G.Game.state);
        if (st === 'playing') return;
        if (st === 'levelup') { await page.waitForTimeout(1200); await page.evaluate(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); }); }
        await page.waitForTimeout(400);
      }
    };

    console.log('1. The pause menu');
    for (const [label, secs, want] of [['under 10 s', 0, false], ['over 10 s', 11, true]]) {
      await clear(); await watch();
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      const paused = await page.evaluate(() => G.Game.state === 'paused' && G.UI.isOpen('scr-pause'));
      if (secs) await later(secs);
      await page.click('#btn-resume');
      const c = await settled();
      check(paused && c === want, `open and closed ${label}: ` + (want ? 'the count-in plays' : 'straight back to playing'), { paused, counted: c });
    }

    console.log('2. A level-up card');
    for (const [label, secs, want] of [['within 10 s', 0, false], ['after 10 s', 11, true]]) {
      await clear(); await watch();
      await page.evaluate(() => G.Game.debugLevelUp());
      const open = await page.waitForFunction(() => G.Game.state === 'levelup' && G.UI.isOpen('scr-levelup'), null, { timeout: 5000 }).then(() => true, () => false);
      await page.waitForTimeout(1200);                      // past the cards' guard
      if (secs) await later(secs);
      await page.keyboard.press('Digit1');
      const c = await settled();
      check(open && c === want, `picked ${label}: ` + (want ? 'the count-in plays' : 'straight back to playing'), { open, counted: c });
    }

    console.log('3. A held item to swap');
    for (const [label, secs, want] of [['within 10 s', 0, false], ['after 10 s', 11, true]]) {
      await clear(); await watch();
      await page.evaluate(() => { G.Game.player.equip('leftovers'); G.Game.offerItem('quickclaw'); });
      const open = await page.waitForFunction(() => G.Game.state === 'choice' && G.UI.isOpen('scr-item'), null, { timeout: 5000 }).then(() => true, () => false);
      await page.waitForTimeout(1200);
      if (secs) await later(secs);
      await page.keyboard.press('Digit2');
      const c = await settled();
      check(open && c === want, `chosen ${label}: ` + (want ? 'the count-in plays' : 'straight back to playing'), { open, counted: c });
    }

    console.log('4. A bond');
    for (const [label, secs, want] of [['within 10 s', 0, false], ['after 10 s', 11, true]]) {
      await clear(); await watch();
      await page.evaluate(() => { const pl = G.Game.player; pl.maxMoves = 8;
        for (const id of ['bite', 'ember', 'water-gun', 'vine-whip']) if (pl.slots.filter(g => g.length === 1).length < 2) pl.addMove(id);
        pl.bonds = 1; G.Game.offerBond(); });
      const open = await page.waitForFunction(() => G.Game.state === 'choice' && G.UI.isOpen('scr-bond'), null, { timeout: 5000 }).then(() => true, () => false);
      await page.waitForTimeout(1200);
      if (secs) await later(secs);
      for (let i = 0; i < 2 && await page.evaluate(() => G.UI.isOpen('scr-bond')); i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(300); }
      const c = await settled();
      check(open && c === want, `picked ${label}: ` + (want ? 'the count-in plays' : 'straight back to playing'), { open, counted: c });
    }
    check(!errs.length, 'no page errors', errs);
    await ctx.close();
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll count-in checks passed');
  process.exit(failures ? 1 : 0);
})();
