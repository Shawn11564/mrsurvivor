#!/usr/bin/env node
// The on-screen progress to the next evolution in Lab runs (js/fork/lab/evo-hud.js), in headless
// Edge on dev.html. What the HUD draws is read from the canvas (fillText) as it's drawn.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-evo-hud.cjs [base-url]
//
//   1. Charmander: "→ Charmeleon" and "Lv N" (G.LabGrowth's level for it), the bar from level 1,
//      counting the XP of the current level; right under the HP bar, the stat boosts (buffs, altar
//      power) under it.
//   2. At that level: "READY" (the evolution card is in the level-up hand).
//   3. Evolved into Charmeleon: "→ Charizard", its level, the bar from the level it evolved at.
//   4. Nothing with the Everstone, for a Pokémon that can't evolve (Charizard), or with Lab off.
//   5. Eevee: the earliest evolution and "+N more".
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.addInitScript(() => {
      window.__texts = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (window.__texts.length < 20000) window.__texts.push([String(t), x, y]); return f.apply(this, arguments); };
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.LabEvoHud, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });

    const start = (dex, lab = true) => page.evaluate(([dex, lab]) => {
      if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
      G.UI.hideAll(); G.Game.toUI();
      G.DB.grant(dex, 't'); G.DB.save.partner = dex; G.Settings.set('lab', lab); G.Settings.set('underdogLadder', false); G.DB.commit();
      G.Game.startRun(); G.Game.player.hurt = () => {};
    }, [dex, lab]);
    // Up to level n (+ half of it), back to playing, and what the HUD drew in the next frames.
    const at = (n, half = 0.5) => page.evaluate(async ([n, half]) => {
      const p = G.Game.player;
      while (p.level < n) p.gainXp(p.xpNext / p.xpMul);
      p.xp = p.xpNext * half;
      G.UI.hideAll(); G.Game.state = 'playing';
      window.__texts.length = 0;
      await new Promise(r => setTimeout(r, 250));
      return { texts: window.__texts.slice(-400), st: G.LabEvoHud.state(p), level: p.level };
    }, [n, half]);
    const drew = (r, re) => r.texts.find(([t]) => re.test(t));

    console.log('1. Charmander');
    await start(4);
    const lv = await page.evaluate(() => G.LabGrowth.targets(4)[0][1]);
    let r = await at(Math.max(2, lv - 3));
    check(drew(r, /^→ Charmeleon$/) && drew(r, new RegExp('^Lv ' + lv + '$')), `"→ Charmeleon" and "Lv ${lv}"`, r.st);
    const want = (r.level - 1 + 0.5) / (lv - 1);
    check(r.st && Math.abs(r.st.p - want) < 1e-9 && r.st.base === 1, `the bar from level 1, with this level's XP (${(want * 100).toFixed(0)}%)`, r.st && r.st.p);
    const y0 = drew(r, /^→ Charmeleon$/)[2];
    // Right under the HP bar, before the stat boosts: the buff chips and the altar power go under it
    // (G.HUD.belowHp in js/ui/hud.js); it doesn't move when they show up.
    const yb = await page.evaluate(async () => {
      const p = G.Game.player;
      p.buffs.atk = { n: 1, t: 30 }; p.power = { def: { name: 'Fury', color: '#ff6b4d' }, t: 30 };
      window.__texts.length = 0; await new Promise(r => setTimeout(r, 200));
      const last = t => (window.__texts.filter(([s]) => s === t).pop() || [])[2];
      const r = { evo: last('→ Charmeleon'), buff: last('ATK ×1'), power: last('FURY 30s') };
      delete p.buffs.atk; delete p.power;
      return r;
    });
    check(yb.evo === y0 && yb.buff - y0 >= 22 && yb.power === yb.buff, 'right under the HP bar; the buff chips and the altar power under it', { y0, ...yb });

    console.log('2. At its level');
    r = await at(lv);
    check(r.st && r.st.ready && r.st.p === 1 && drew(r, /^READY$/) && drew(r, /^Charmeleon$/), 'READY, the bar full');
    check(await page.evaluate(() => G.LevelUp.offer(G.Game.player).some(c => c.key === 'grow:5')), 'and the evolution card is in the level-up hand');

    console.log('3. Evolved');
    const evoLv = await page.evaluate(() => { const p = G.Game.player; G.LabGrowth.evolveTo(p, 5); return p.level; });
    const lv2 = await page.evaluate(() => G.LabGrowth.targets(5)[0][1]);
    r = await at(evoLv + 1);
    check(drew(r, /^→ Charizard$/) && drew(r, new RegExp('^Lv ' + lv2 + '$')), `Charmeleon: "→ Charizard", "Lv ${lv2}"`);
    check(r.st && r.st.base === evoLv && Math.abs(r.st.p - (r.level - evoLv + 0.5) / (lv2 - evoLv)) < 1e-9, `the bar from the level it evolved at (${evoLv})`, r.st);

    console.log('4. When there is nothing to show');
    r = await page.evaluate(async () => { G.Game.player._labStay = true; window.__texts.length = 0; await new Promise(r => setTimeout(r, 200)); return { st: G.LabEvoHud.state(G.Game.player), any: window.__texts.some(([t]) => /^(→ |READY$)/.test(t)) }; });
    check(r.st === null && !r.any, 'with the Everstone: nothing');
    await start(6);
    r = await at(3);
    check(r.st === null && !drew(r, /^→ /), 'Charizard (no evolution): nothing');
    await start(4, false);
    r = await at(3);
    check(r.st === null && !drew(r, /^→ /), 'Lab off: nothing');

    console.log('5. Eevee');
    await start(133);
    r = await at(2);
    const ev = await page.evaluate(() => { const t = G.LabGrowth.targets(133).sort((a, b) => a[1] - b[1]); return { n: t.length, first: G.DEX_BY[t[0][0]].name, lv: t[0][1] }; });
    check(drew(r, new RegExp('^→ ' + ev.first + ' \\+' + (ev.n - 1) + ' more$')) && drew(r, new RegExp('^Lv ' + ev.lv + '$')), `"→ ${ev.first} +${ev.n - 1} more", "Lv ${ev.lv}"`);
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll evolution HUD checks passed');
  process.exit(failures ? 1 : 0);
})();
