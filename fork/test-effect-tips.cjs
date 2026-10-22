#!/usr/bin/env node
// Hovering an ongoing effect shows what it does (js/fork/effect-tips.js), in headless Edge on dev.html,
// a real run with Charmander (Ember):
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-effect-tips.cjs [base-url]
//
//   1. Nothing hovered: no effect tooltip.
//   2. A stat boost chip (physical Attack, 2 stacks of +20 %): its name, +40 % to physical moves, time left.
//   3. The weather chip (sunshine): Fire ×1.5 and Water ×0.5 for everyone, and your moves it changes (Ember ×1.5).
//   4. The altar power chip (Fury): damage ×2 and its time left.
//   5. At 4K (the HUD drawn ×2.16, js/fork/ui-scale.js) the mouse still finds the chips.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function setup(browser, w, h) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
  await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; s.pnat = { 4: ['hardy', Date.now()] };
    G.Settings.set('lab', false); G.DB.commit(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false }); });
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
  await page.evaluate(() => {
    const pl = G.Game.player; pl.god = true; G.Spawner.update = () => {}; G.EnemyMgr.clear();
    if (!pl.hasMove('ember')) pl.addMove('ember');
    pl.addBuff('patk', 0.2, 30, 3); pl.addBuff('patk', 0.2, 30, 3);
    pl.addPower(G.Interact.POWERS.find(p => p.id === 'dmg'), 25);
    G.Weather.debugStart('sun', 60);
    window.__drawn = [];
    const o = G.I18n.rawCanvas;
    G.I18n.rawCanvas = function (c, k, t) { if (k === 'fillText') window.__drawn.push(String(t)); return o.apply(this, arguments); };
  });
  await page.waitForTimeout(3300);                            // the weather's 3 s fade-in
  return page;
}
// Hover a chip (G.EffectTips.chips: HUD units; × the HUD's scale for the mouse) and read the tooltip's lines.
const hover = (page, kind) => page.evaluate(k => {
  const c = G.EffectTips.chips.find(x => x.kind === k);
  return c && { x: (c.x + c.w / 2) * G.EffectTips.scale, y: (c.y + c.h / 2) * G.EffectTips.scale };
}, kind).then(async at => {
  if (!at) return null;
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__drawn.length = 0; });
  await page.waitForTimeout(150);
  return page.evaluate(() => ({ shown: G.EffectTips.shown, text: [...new Set(window.__drawn)].join(' | ') }));
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await setup(browser, 1200, 800);
    console.log('1. Nothing hovered');
    await page.mouse.move(600, 500);
    await page.waitForTimeout(200);
    check(await page.evaluate(() => G.EffectTips.shown === null), 'no effect tooltip');

    console.log('2. A stat boost');
    const b = await hover(page, 'buff');
    check(b && b.shown === 'buff:patk' && /Attack/.test(b.text) && /\+40%/.test(b.text) && /physical/i.test(b.text) && /\d+ s left/.test(b.text),
      'physical Attack ×2: +40% to physical moves, time left', b);

    console.log('3. The weather');
    const wx = await hover(page, 'weather');
    check(wx && wx.shown === 'weather:sun' && /Fire.*×1\.5/.test(wx.text) && /Water.*×0\.5/.test(wx.text), 'sunshine: Fire ×1.5, Water ×0.5', wx);
    check(wx && /Ember ×1\.5/.test(wx.text), 'and your moves it changes: Ember ×1.5', wx);

    console.log('4. The altar power');
    const pw = await hover(page, 'power');
    check(pw && pw.shown === 'power:dmg' && /Damage ×2/.test(pw.text) && /\d+ s left/.test(pw.text), 'Fury: damage ×2, time left', pw);
    for (const e of page.errs) console.log('  page error: ' + e);
    check(!page.errs.length, 'no page errors');
    await page.context().close();

    console.log('5. At 4K');
    const big = await setup(browser, 3840, 2160);
    const k = await big.evaluate(() => G.EffectTips.scale);
    const b4 = await hover(big, 'buff');
    check(k > 1.5 && b4 && b4.shown === 'buff:patk', `HUD ×${k.toFixed(2)}: hovering the boost chip still shows its tooltip`, b4 && b4.shown);
    check(!big.errs.length, 'no page errors', big.errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll effect tooltip checks passed');
  process.exit(failures ? 1 : 0);
})();
