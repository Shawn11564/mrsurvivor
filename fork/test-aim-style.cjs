#!/usr/bin/env node
// Crosshair colour and size, and aiming with the right stick (js/fork/aim-style.js), in headless
// Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-aim-style.cjs [base-url]
//
//   1. Settings → Controls: 6 colours, 3 sizes and "Aim with the right stick" (on); picking Red and
//      Large sets them.
//   2. In a run with "Manual aim" and the mouse moved: the crosshair is stroked in red, scaled ×1.4.
//   3. "Manual aim" off: pushing the right stick aims where it points; letting go aims on its own
//      again; with "Aim with the right stick" off the stick does nothing.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

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
    await page.waitForFunction(() => G.DB.save && G.AimStyle, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu();
      document.getElementById('btn-settings').click(); document.querySelector('#set-tabs [data-t="ctl"]').click(); });
    await page.waitForTimeout(300);

    console.log('1. Settings → Controls');
    const s0 = await page.evaluate(() => ({ colors: document.querySelectorAll('#set-body .chip[data-k="aimColor"]').length, sizes: document.querySelectorAll('#set-body .chip[data-k="aimSize"]').length,
      pad: (document.querySelector('#set-body .switch[data-k="padAim"]') || {}).textContent, text: document.getElementById('set-body').textContent }));
    check(s0.colors === 6 && s0.sizes === 3 && s0.pad === 'Yes' && /Crosshair/.test(s0.text) && /Aim with the right stick/.test(s0.text), '6 colours, 3 sizes, the stick switch on', { ...s0, text: undefined });
    await page.click('#set-body .chip[data-k="aimColor"][data-v="#ff5f6d"]');
    await page.click('#set-body .chip[data-k="aimSize"][data-v="1.4"]');
    const s1 = await page.evaluate(() => ({ c: G.Settings.get('aimColor'), k: G.Settings.get('aimSize') }));
    check(s1.c === '#ff5f6d' && s1.k === 1.4, 'Red and Large are set', s1);
    await page.evaluate(() => G.SettingsUI.close());

    console.log('2. The crosshair');
    await page.evaluate(() => { G.Settings.set('aimManual', true); G.Game.startRun(null, { dex: 4, shiny: false }); });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; requestAnimationFrame(alive); })(); });
    await page.waitForTimeout(3300);
    await page.mouse.move(800, 300); await page.mouse.move(820, 310);
    await page.waitForTimeout(200);
    const mark = await page.evaluate(() => new Promise(res => {
      const P = CanvasRenderingContext2D.prototype, st = P.stroke, sc = P.scale, seen = { cols: [], scales: [] };
      P.stroke = function () { seen.cols.push(this.strokeStyle); return st.apply(this, arguments); };
      P.scale = function (a, b) { seen.scales.push(a); return sc.apply(this, arguments); };
      requestAnimationFrame(() => { P.stroke = st; P.scale = sc; res({ red: seen.cols.includes('#ff5f6d'), k14: seen.scales.includes(1.4), manual: G.Game.player.manualAim }); });
    }));
    check(mark.manual && mark.red && mark.k14, 'the crosshair is stroked in red at ×1.4', mark);

    console.log('3. The right stick');
    const pad = await page.evaluate(() => {
      const pl = G.Game.player, aim = G.Pad.aim;
      G.Settings.set('aimManual', false);
      G.Pad.aim = () => [0, 1];                  // pushed down
      const pushed = pl.handAim();
      G.Pad.aim = () => null;                    // let go
      const free = pl.handAim();
      G.Pad.aim = () => [0, 1]; G.Settings.set('padAim', false);
      const off = pl.handAim();
      G.Pad.aim = aim; G.Settings.set('padAim', true);
      return { pushed: pushed == null ? null : +pushed.toFixed(3), free, off };
    });
    check(pad.pushed === +(Math.PI / 2).toFixed(3) && pad.free === null && pad.off === null, 'Manual aim off: the stick aims while pushed, auto when let go, nothing with the switch off', pad);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll aim style checks passed');
  process.exit(failures ? 1 : 0);
})();
