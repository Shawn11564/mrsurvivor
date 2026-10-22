#!/usr/bin/env node
// The mouse wheel switches moves in a run (js/fork/wheel-moves.js), with real wheel input in headless
// Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-wheel.cjs [base-url]
//
//   1. A run with 3 move slots: one notch down = the next move, up = the previous one, and it wraps.
//   2. A trackpad's small steps add up: a few tiny ones don't switch, enough of them switch once.
//   3. Paused or on the level-up screen, the wheel does nothing to the moves; the page doesn't scroll.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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
      const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; p.xpMul = 0; requestAnimationFrame(alive); })();
      p.addMove('flamethrower'); p.addMove('scratch' in G.Moves.BY_ID ? 'scratch' : 'tackle');
    });
    const slots = await page.evaluate(() => G.Game.player.slots.length);
    await page.mouse.move(600, 300);
    const active = () => page.evaluate(() => G.Game.player.active);
    const wheel = async (dy, n = 1) => { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(60); } await page.waitForTimeout(150); return active(); };

    console.log('1. Notches');
    await page.evaluate(() => G.Game.player.setActive(0));
    const a0 = await active();
    const down = await wheel(100), down2 = await wheel(100), wrap = await wheel(100);
    check(slots === 3 && a0 === 0 && down === 1 && down2 === 2 && wrap === 0, 'down: the next move, and back to the first after the last', { slots, a0, down, down2, wrap });
    const up = await wheel(-100);
    check(up === 2, 'up from the first: the last one', up);

    console.log('2. A trackpad');
    await page.evaluate(() => G.Game.player.setActive(0));
    const tiny = await wheel(8, 3);
    const enough = await wheel(8, 4);
    check(tiny === 0 && enough === 1, 'a few tiny steps don\'t switch, enough of them switch once', { tiny, enough });

    console.log('3. Not while paused or choosing a card');
    await page.evaluate(() => G.Game.player.setActive(0));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => G.Game.state === 'paused', null, { timeout: 5000 });
    await page.mouse.move(600, 300);
    const paused = await wheel(100, 2);
    await page.evaluate(() => G.Game.resume ? G.Game.resume() : document.getElementById('btn-resume').click());
    await page.waitForFunction(() => G.Game.state === 'playing' || G.Game.state === 'resuming', null, { timeout: 5000 });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { const pl = G.Game.player; G.Game.state = 'levelup'; G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), () => {}); });
    const lvl = await wheel(100, 2);
    const scrolled = await page.evaluate(() => [window.scrollY, document.scrollingElement.scrollTop]);
    check(paused === 0 && lvl === 0, 'paused and on the level-up screen the moves stay put', { paused, lvl });
    check(scrolled.every(v => v === 0), 'the page itself doesn\'t scroll', scrolled);

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll wheel checks passed');
  process.exit(failures ? 1 : 0);
})();
