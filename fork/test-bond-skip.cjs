#!/usr/bin/env node
// The bond screen (js/ui/run-ui.js showBond, js/fork/bond-skip.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-bond-skip.cjs [base-url]
//
//   1. Every card keeps its move's description: the second step of a pair and a move joining a group
//      showed only "will fire together with ..." in its place; now that note goes under it.
//   2. "Keep them apart": the bond is spent without joining anything, your moves stay as they were,
//      +10 % damage on every move for the rest of the run (twice: ×1.21), and the run goes on.
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
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.Settings.set('lab', false); G.DB.commit(); G.Flow.goMenu(); G.Game.startRun(); });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await page.evaluate(() => { const pl = G.Game.player; pl.god = true; G.Spawner.update = () => {}; G.EnemyMgr.clear();
      for (const id of ['tackle', 'quick-attack', 'water-gun']) if (!pl.hasMove(id)) pl.addMove(id); });
    const cards = () => page.evaluate(() => [...document.querySelectorAll('#bond-cards .card')].map(c => ({
      name: c.querySelector('.nm').firstChild.textContent.trim(), ds: [...c.querySelectorAll('.ds')].map(d => d.textContent.trim()) })));
    const descOf = name => page.evaluate(n => { const m = G.Game.player.moves.find(m => G.T(m.name, 'move') === n); return m ? G.T(m.desc) : null; }, name);
    const open = () => page.evaluate(() => { const pl = G.Game.player; pl.bonds = 1; G.Game.offerBond(); });
    const unguard = () => page.waitForFunction(() => !document.getElementById('bond-cards').classList.contains('guard'), null, { timeout: 3000 });

    console.log('1. Descriptions on every card');
    await open();
    await page.waitForFunction(() => G.UI.isOpen('scr-bond'), null, { timeout: 5000 });
    await unguard();
    const step1 = await cards();
    await page.evaluate(() => G.RunUI.pickBond(0));
    const step2 = await cards();
    let ok2 = step2.length > 0;
    for (const c of step2) ok2 = ok2 && c.ds.length === 2 && c.ds[0] === await descOf(c.name) && /at the same time as/i.test(c.ds[1]);
    check(step1.every(c => c.ds[0]) && ok2, 'a pair, second step: each card has its own description and, under it, the bond note', { step1, step2 });
    await page.evaluate(() => G.RunUI.pickBond(0));
    await page.waitForFunction(() => !G.UI.isOpen('scr-bond'), null, { timeout: 3000 });
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { const pl = G.Game.player; if (!pl.hasMove('ember')) pl.addMove('ember'); });
    await open();
    await page.waitForFunction(() => G.UI.isOpen('scr-bond'), null, { timeout: 5000 });
    await unguard();
    const add = await cards();
    let okA = add.length > 0;
    for (const c of add) okA = okA && c.ds.length === 2 && c.ds[0] === await descOf(c.name) && /at the same time as/i.test(c.ds[1]);
    check(okA, 'a move joining a group: its description too, the note under it', add);

    console.log('2. Keep them apart');
    const before = await page.evaluate(() => { const pl = G.Game.player; return { slots: pl.slots.map(s => s.map(m => m.id).join('+')), bonds: pl.bonds, atk: pl.atkFor(pl.moves[0]) }; });
    const btn = await page.evaluate(() => { const b = document.getElementById('bond-skip'); return b && b.offsetParent ? b.textContent.trim() : null; });
    check(btn && /keep them apart/i.test(btn) && /10/.test(btn), 'the bond screen has a "Keep them apart" button that says what it gives', btn);
    await page.click('#bond-skip');
    await page.waitForFunction(() => !G.UI.isOpen('scr-bond'), null, { timeout: 3000 });
    const after = await page.evaluate(() => { const pl = G.Game.player; return { slots: pl.slots.map(s => s.map(m => m.id).join('+')), bonds: pl.bonds, atk: pl.atkFor(pl.moves[0]) }; });
    check(after.bonds === before.bonds - 1 && after.slots.join() === before.slots.join(), 'the bond is spent, the moves stay as they were', { before, after });
    check(Math.abs(after.atk / before.atk - 1.1) < 1e-9, 'every move: +10 % damage', +(after.atk / before.atk).toFixed(4));
    check(await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 8000 }).then(() => true, () => false), 'and the run goes on');
    await open();
    await page.waitForFunction(() => G.UI.isOpen('scr-bond'), null, { timeout: 5000 });
    await unguard();
    await page.click('#bond-skip');
    const twice = await page.evaluate(b => +(G.Game.player.atkFor(G.Game.player.moves[0]) / b).toFixed(4), before.atk);
    check(twice === 1.21, 'twice: ×1.21', twice);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll bond screen checks passed');
  process.exit(failures ? 1 : 0);
})();
