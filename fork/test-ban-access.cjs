#!/usr/bin/env node
// Existing bans from the old move pool remain visible and removable in Upgrades.
// Run with `node fork/serve.cjs` in another terminal.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(() => { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForFunction(() => G.DB.save && G.MenuUI);
    const fixture = await page.evaluate(() => {
      const dex = 4, mon = G.DEX_BY[dex], pool = G.Moves.poolFor(mon);
      const oldMove = Object.keys(G.Moves.BY_ID).find(id => !pool.includes(id) && id !== G.startMoveOf(dex)
        && id !== G.startMove2Of(dex) && G.Moves.BY_ID[id].kind !== 'buff');
      if (!oldMove) throw Error('No legacy move outside the promoted pool');
      const s = G.DB.save;
      s.owned[dex] = { at: Date.now() }; s.partner = s.starter = dex; s.coins = 1e6;
      s.pupg = { [dex]: { ban: 5 } }; s.pban = { [dex]: [oldMove, G.startMoveOf(dex)] };
      G.DB.commit(); G.Settings.set('lab', false); G.Flow.goMenu();
      return { dex, oldMove, start: G.startMoveOf(dex) };
    });
    await page.click('[data-go="upgrades"]');
    await page.waitForSelector('[data-ban]');
    await page.click('[data-ban]');
    await page.waitForSelector('.ban-picker [data-id]');
    const shown = await page.locator('.ban-picker [data-id]').evaluateAll(es => es.map(e => e.dataset.id));
    assert.ok(shown.includes(fixture.oldMove), `saved ban ${fixture.oldMove} is visible outside the current species pool`);
    assert.ok(shown.includes(fixture.start), 'a saved ban stays visible when the move is now a starting move');
    for (const id of [fixture.oldMove, fixture.start]) {
      await page.click(`.ban-picker [data-id="${id}"]`);
      await page.waitForFunction(([dex, id]) => !(G.DB.save.pban[dex] || []).includes(id), [fixture.dex, id]);
    }
    const after = await page.evaluate(dex => G.DB.save.pban[dex] || [], fixture.dex);
    assert.deepEqual(after, []);
    console.log('PASS legacy and starting-move bans stay visible and can be removed in Upgrades');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
