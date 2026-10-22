#!/usr/bin/env node
// Radiant over shiny by default, and the Radiant filter on the Pokémon screen (js/fork/radiant.js,
// js/fork/shiny-pref.js, the filter hooks in js/ui/menu.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-radiant-prefs.cjs [base-url]
//
// A stand-in radiant list (Mewtwo, Charizard) whose r/ sheets are the shiny ones. The player owns
// Mewtwo, Charizard and Pikachu, all three shiny too, and the radiants of Mewtwo and Charizard.
//   1. Owning both, the radiant is the default: main menu, its selector, a run, the co-op card.
//   2. The collection: Charizard's detail opens on Radiant, "Choose as partner (radiant)", and as
//      partner it's radiant on the menu.
//   3. Getting the shiny after the radiant (shiny-pref switches you to the shiny) keeps the radiant.
//   4. Picking Shiny on the selector is respected (and kept); Radiant brings it back.
//   5. The Radiant filter: only the radiants you own (not Pikachu, a shiny), kept with the other
//      filters (ms.dex), and off again shows the rest.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const LIST = { 6: { rarity: 4 }, 150: { rarity: 5 } };

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.route('**/js/fork/radiant-list.js*', r => r.fulfill({ contentType: 'text/javascript', body: `G.RADIANTS = ${JSON.stringify(LIST)};` }));
    await page.route('**/js/fork/radiants.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(LIST) }));
    await page.route(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/, r => r.continue({ url: r.request().url().replace('/r/', '/s/') }));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.Radiant, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    const menu = () => page.evaluate(() => ({ radiant: document.getElementById('menu-partner').classList.contains('radiant'),
      on: (document.querySelector('#menu-shiny button.on') || {}).dataset?.v }));

    console.log('1. Owning both, radiant by default');
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [150, 6, 25]) { G.DB.grant(d, 't'); G.DB.grantShiny(d, 't'); }
      s.radiant = { 150: { at: Date.now(), from: 't' }, 6: { at: Date.now(), from: 't' } };
      s.partner = 150; s.partnerShiny = true; G.DB.commit(); G.MenuUI.open();
    });
    let m = await menu();
    check(m.radiant && m.on === '2', 'main menu: Mewtwo radiant, the selector on Radiant (with its shiny picked too)', m);
    const run = await page.evaluate(() => { G.Game.startRun(); const p = G.Game.player; const r = { anim: p.anim.dex, shiny: p.shiny }; G.Game.quit(); return r; });
    check(run.anim === '150/r' && !run.shiny, 'a run: radiant, not shiny', run);
    check(await page.evaluate(() => !!(G.LobbyPick.get() || {}).rad), 'the co-op lobby card says radiant');
    await page.evaluate(() => { G.UI.hideAll(); G.Game.toUI(); G.MenuUI.open(); });

    console.log('2. The collection');
    await page.click('#scr-menu [data-go=dex]');
    await page.waitForSelector('#dex-grid .cell');
    const cellOf = name => page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) });
    await page.click('#dex-gens .gen-tab >> nth=0');                      // all generations
    await cellOf('Charizard').click();
    const d = await page.evaluate(() => ({ on: (document.querySelector('#dex-detail .seg button.on') || {}).dataset?.v, pick: document.getElementById('dex-pick').textContent }));
    check(d.on === '2' && /\(radiant\)/.test(d.pick), 'Charizard\'s detail opens on Radiant: "Choose as partner (radiant)"', d);
    await page.click('#dex-pick');
    await page.evaluate(() => { G.UI.hideAll(); G.MenuUI.open(); });
    m = await menu();
    check(await page.evaluate(() => G.DB.save.partner) === 6 && m.radiant, 'as partner, Charizard is radiant on the menu', m);

    console.log('3. The shiny after the radiant');
    await page.evaluate(() => { const s = G.DB.save; delete s.shiny[6]; s.partnerShiny = false; G.DB.commit(); G.MenuUI.open(); });
    await page.evaluate(() => { G.DB.grantShiny(6, 'gacha'); G.DB.commit(); G.MenuUI.open(); });
    m = await menu();
    check(await page.evaluate(() => G.DB.save.partnerShiny) && m.radiant && m.on === '2', 'shiny-pref switches to the shiny, but the radiant still wins', m);

    console.log('4. A choice is respected');
    await page.click('#menu-shiny [data-v="1"]');
    m = await menu();
    check(!m.radiant && m.on === '1', 'Shiny on the selector: the shiny is used', m);
    await page.evaluate(() => { G.UI.hideAll(); G.MenuUI.open(); });
    m = await menu();
    check(!m.radiant && m.on === '1', 'and kept', m);
    await page.click('#menu-shiny [data-v="2"]');
    m = await menu();
    check(m.radiant && m.on === '2', 'Radiant brings it back', m);

    console.log('5. The Radiant filter');
    await page.click('#scr-menu [data-go=dex]');
    await page.waitForSelector('#dex-grid .cell');
    const names = () => page.$$eval('#dex-grid .cell b', b => b.map(x => x.textContent));
    const chip = page.locator('#dex-filters .chip', { hasText: 'Radiant' });
    check(await chip.count() === 1, 'the filters have a Radiant chip');
    await chip.click();
    await page.waitForTimeout(200);
    const shown = await names();
    check(shown.sort().join() === 'Charizard,Mewtwo', 'only the radiants you own (Pikachu, a shiny, isn\'t)', shown);
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('ms.dex')).rad === true), 'kept with the other filters (ms.dex)');
    await page.locator('#dex-filters .chip', { hasText: 'Radiant' }).click();
    await page.waitForTimeout(200);
    check((await names()).length > 2, 'off again: the rest come back');
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll radiant preference checks passed');
  process.exit(failures ? 1 : 0);
})();
