#!/usr/bin/env node
// Kecleon collection consumables apply a random valid change without a result picker.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
    await page.waitForFunction(() => G.DB.save && G.MenuUI);
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [4, 143]) s.owned[d] = { at: Date.now() };
      s.partner = 4; s.starter = 4; s.coins = 0;
      s.bag = { mint: 1, cap: 1, caph: 1 };
      G.Mons.setNature(4, 'hardy'); G.Mons.setAbility(143, 0);
      window.__picks = [];
      const pick = G.U.pick; G.U.pick = list => { window.__picks.push(list.slice()); return list[list.length - 1]; };
      G.DB.commit(); G.Flow.goMenu();
    });
    const card = async name => {
      await page.evaluate(() => { G.UI.hideAll(); G.MenuUI.open(); });
      await page.click('#scr-menu [data-go=dex]');
      await page.waitForSelector('#dex-grid .cell');
      await page.fill('#dex-q', name); await page.waitForTimeout(250);
      await page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).click();
      await page.waitForSelector('#dex-detail [data-extra]');
    };
    const use = async (name, kind) => {
      await card(name); await page.click(`#dex-detail [data-extra="${kind}"]`);
      await page.waitForTimeout(100);
      return page.evaluate(() => ({ chips: document.querySelectorAll('#mx-picker [data-v]').length, picks: window.__picks,
        nature: G.Mons.natureOf(4).id, ability: G.Mons.abilityOf(143).slot, abilityId: G.Mons.abilityOf(143).id, bag: Object.assign({}, G.DB.save.bag) }));
    };
    const mint = await use('Charmander', 'nat');
    assert.equal(mint.chips, 0, 'mint use applies immediately instead of asking for a nature');
    assert.ok(mint.nature && mint.nature !== 'hardy', 'mint selects a different valid nature');
    assert.equal(mint.bag.mint, undefined);
    const capsule = await use('Snorlax', 'cap');
    assert.equal(capsule.chips, 0, 'capsule use applies immediately instead of asking for an ability');
    assert.ok([0, 1].includes(capsule.ability) && capsule.ability !== 0, 'capsule selects another regular ability');
    assert.equal(capsule.bag.cap, undefined);
    const patch = await use('Snorlax', 'caph');
    assert.equal(patch.chips, 0, 'patch use applies immediately instead of asking for an ability');
    assert.ok([0, 1, 2].includes(patch.ability), 'patch selects a valid ability');
    assert.equal(patch.ability, 2, 'the patch can randomly select the hidden ability');
    assert.equal(patch.bag.caph, undefined);
    assert.deepEqual(errors, []);
    console.log('PASS Mint, Capsule and Ability Patch apply random valid outcomes and consume one item without choice dialogs');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
