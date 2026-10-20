#!/usr/bin/env node
// Radiant forms and the Radiant Ritual (js/fork/radiant.js), in headless Edge on dev.html.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-radiant.cjs [base-url]
//
// No radiant sheets are in the repo yet, so the page is served a radiant list with Bulbasaur,
// Charmander and Charizard (with its Lab sheet and Mega), and their r/ sheets are the normal
// ones (the test only follows which file is asked for).
//   1. The ritual: 10 chosen shinies (no 11th), the shiny-legendary warning and its
//      confirmation, the roll (10 shinies gone, normal kept, sac dates, one radiant of the pool),
//      the warning switched off, a duplicate's coins, and an empty pool.
//   2. Cloud merge: a sacrificed shiny doesn't come back from the other copy unless it was won
//      again after the sacrifice; radiants are joined.
//   3. Menu and collection: the Radiant button for the partner and in the detail panel, its
//      sheets from {dex}/r/, Normal/Shiny turn it off, the collection badge.
//   4. Runs: your Pokémon plays with {dex}/r (and m{dex}/r when it Mega Evolves), and the
//      co-op lobby card says rad.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const FAKE = { 1: {}, 4: {}, 6: { lab: ['SpAttack'], mega: true } };

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function open(browser, list) {
  // The game's service worker fetches the sheets itself, out of page.route's reach: off here.
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const asked = [];
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/js/fork/radiant-list.js*', r => r.fulfill({ contentType: 'text/javascript', body: `G.RADIANTS = ${JSON.stringify(list)};` }));
  await page.route(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/, r => {
    const m = r.request().url().match(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/);
    asked.push(m[1] + '/r/' + m[2]);
    r.continue({ url: r.request().url().replace('/r/', '/') });
  });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.Radiant, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    const s = G.DB.save;
    for (const d of [4, 7, 10, 13, 16, 19, 21, 23, 27, 29, 32, 35, 37, 39, 41, 150]) G.DB.grantShiny(d, 'test');
    s.partner = 4; s.coins = 0; G.DB.commit(); G.MenuUI.open();
  });
  await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
  return { page, asked, errs };
}
const save = (page, f, arg) => page.evaluate(f, arg);
const pickCells = (page, dexes) => (async () => { for (const d of dexes) await page.click(`#rad-grid .cell[data-dex="${d}"]`); })();

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const { page, asked, errs } = await open(browser, FAKE);

  console.log('Ritual');
  check(await page.isVisible('#menu-radiant'), 'the menu has a Radiant Ritual button');
  await page.click('#menu-radiant');
  await page.waitForSelector('#scr-radiant', { state: 'visible' });
  check(await page.$$eval('#rad-pool .rad-prize', e => e.length) === 3, 'the pool shows the 3 radiants');
  check(await page.$$eval('#rad-grid .cell', e => e.length) === 16, 'all 16 shinies to choose from');
  check(await page.isDisabled('#rad-go'), 'Sacrifice is off with none chosen');
  const ten = [7, 10, 13, 16, 19, 21, 23, 27, 29, 150];
  await pickCells(page, ten);
  check((await page.textContent('#rad-count')).startsWith('10 / 10'), 'the count says 10 / 10');
  await page.click('#rad-grid .cell[data-dex="32"]');
  check(!(await page.$eval('#rad-grid .cell[data-dex="32"]', e => e.classList.contains('on'))), 'an 11th can\'t be chosen');
  check(await page.isEnabled('#rad-go'), 'Sacrifice is on with 10');
  await page.click('#rad-go');
  check(await page.isVisible('#rad-warning') && (await page.textContent('#rad-warning')).includes('Mewtwo'), 'a shiny legendary (Mewtwo): the warning names it');
  check(await page.isDisabled('#rad-go') && await save(page, () => !!G.DB.save.shiny[150]), 'nothing sacrificed before confirming');
  await page.click('#rad-no');
  check(!(await page.isVisible('#rad-warning')), 'Cancel closes the warning');
  await page.click('#rad-go');
  await page.click('#rad-yes');
  await page.waitForSelector('#rad-ok', { state: 'visible', timeout: 10000 });
  let s = await save(page, () => JSON.parse(JSON.stringify({ shiny: G.DB.save.shiny, sac: G.DB.save.sac, rad: G.DB.save.radiant, owned: G.DB.save.owned, coins: G.DB.save.coins })));
  check(ten.every(d => !s.shiny[d] && s.sac[d] && s.owned[d]), 'the 10 lost their shiny, kept the normal one, and have a sacrifice date');
  check(Object.keys(s.shiny).length === 6, '6 shinies left', Object.keys(s.shiny));
  const won = Object.keys(s.rad).map(Number);
  check(won.length === 1 && [1, 4, 6].includes(won[0]) && s.owned[won[0]], 'one radiant from the pool, and its Pokémon', won);
  check((await page.textContent('#rad-name')).includes(await save(page, d => G.DEX_BY[d].name, won[0])), 'the reveal shows it');
  await page.click('#rad-ok');

  // Warning off: a legendary goes without asking (the setting stays on this device).
  await save(page, () => { for (const d of [43, 46, 48, 50, 52, 54, 56, 58, 144]) G.DB.grantShiny(d, 'test'); });
  await page.uncheck('#rad-warn');
  check(await save(page, () => G.Settings.get('radWarn') === false), 'the warning can be turned off');
  await pickCells(page, [32, 35, 37, 39, 41, 43, 46, 48, 50, 144]);
  await page.click('#rad-go');
  await page.waitForSelector('#rad-ok', { state: 'visible', timeout: 10000 });
  check(await save(page, () => !G.DB.save.shiny[144]), 'with it off, the legendary goes without asking');
  await page.click('#rad-ok');
  await page.check('#rad-warn');

  // A duplicate: coins instead.
  const dup = await save(page, () => {
    const all = G.Radiant.pool();
    for (const d of all) G.DB.save.radiant[d] = G.DB.save.radiant[d] || { at: 1, from: 'test' };
    for (const d of [60, 61, 62, 63, 64, 66, 67, 69, 70, 72]) G.DB.grantShiny(d, 'test');
    const c = G.DB.save.coins;
    const r = G.Radiant.sacrifice([60, 61, 62, 63, 64, 66, 67, 69, 70, 72]);
    return { r, more: G.DB.save.coins - c };
  });
  check(dup.r.ok && dup.r.dup && dup.more === dup.r.coins && dup.r.coins > 0, 'a radiant you have gives coins', dup);
  check(!(await save(page, () => G.Radiant.sacrifice([4, 52, 54]).ok)), 'fewer than 10 is refused');

  console.log('Cloud merge');
  const m = await save(page, () => {
    const local = JSON.parse(JSON.stringify(G.DB.save));
    const cloud = JSON.parse(JSON.stringify(G.DB.save));
    // The cloud copy is from before the ritual: it still has the sacrificed shinies and no radiant.
    for (const d of [7, 10, 150]) cloud.shiny[d] = { at: 1000, from: 'gacha' };
    delete cloud.sac; cloud.radiant = { 25: { at: 5, from: 'other' } };
    // And Squirtle (7) was won again on this device after its sacrifice.
    local.shiny[7] = { at: local.sac[7] + 10, from: 'wild' };
    const a = G.DB.merge(local, cloud), b = G.DB.merge(cloud, local);
    return [a, b].map(r => ({ s7: !!r.shiny[7], s10: !!r.shiny[10], s150: !!r.shiny[150], rad: Object.keys(r.radiant).length, sac: !!(r.sac && r.sac[10]),
      n: Object.keys(G.DB.save.radiant).length }));
  });
  check(m.every(r => !r.s10 && !r.s150 && r.sac), 'sacrificed shinies don\'t come back from the older copy (both ways)', m);
  check(m.every(r => r.s7), 'one won again after its sacrifice stays');
  check(m.every(r => r.rad === r.n + 1), 'radiants from both copies are joined');

  console.log('Menu and collection');
  const dex = won[0];
  await page.click('#rad-back');
  await save(page, d => { G.DB.save.partner = d; G.DB.save.owned[d] = G.DB.save.owned[d] || { at: 1 }; G.DB.commit(); G.MenuUI.open(); }, dex);
  await page.waitForSelector('#menu-shiny:not(.hidden) [data-v="2"]');
  check(await page.$eval('#menu-shiny [data-v="2"]', b => b.classList.contains('on')), 'the partner\'s selector has Radiant, on by default');
  check(await page.$eval('#menu-partner', c => c.classList.contains('radiant')), 'the partner stage glows radiant');
  await page.waitForTimeout(500);
  check(asked.some(a => a === dex + '/r/Idle.png') && await save(page, d => !!G.Sprites.sheet(d + '/r', 'Idle').ready, dex),
    'its sheets come from ' + dex + '/r/ (and load)', asked.slice(0, 4));
  await page.click('#menu-shiny [data-v="0"]');
  check(await save(page, d => !G.Radiant.wants(d) && G.DB.save.radOff[d] === 1, dex), 'Normal turns it off (and it is kept in the save)');
  check(!(await page.$eval('#menu-partner', c => c.classList.contains('radiant'))), 'and the glow goes');
  await page.click('#menu-shiny [data-v="2"]');
  check(await save(page, d => G.Radiant.wants(d), dex), 'Radiant turns it back on');
  await page.click('#scr-menu [data-go=dex]');
  await page.waitForSelector(`#dex-grid .cell .rad-badge`, { timeout: 15000 });
  check(await page.$$eval('#dex-grid .cell .rad-badge', e => e.length) >= 1, 'the collection marks the radiants you have');
  await save(page, d => { const c = [...document.querySelectorAll('#dex-grid .cell')].find(c => c.querySelector('.no').textContent === String(d).padStart(3, '0')); c.click(); }, dex);
  await page.waitForSelector('#dex-detail .seg [data-v="2"].on');
  check(await page.$eval('#dex-big', c => c.classList.contains('radiant')), 'the detail panel shows it radiant');
  await page.click('#dex-detail .seg [data-v="0"]');
  await page.waitForSelector('#dex-detail .seg [data-v="0"].on');
  check(await save(page, d => !G.Radiant.wants(d), dex), 'Normal in the detail panel turns it off');
  await page.click('#dex-detail .seg [data-v="2"]');
  await page.waitForSelector('#dex-detail .seg [data-v="2"].on');
  check(await save(page, d => G.Radiant.wants(d), dex), 'Radiant in the detail panel turns it on');

  console.log('Runs');
  const run = await save(page, d => {
    G.Game.startRun();
    const p = G.Game.player, out = { anim: p.anim.dex, radiant: !!p.radiant };
    p.megaKey = 'm' + p.dex; G.Admin.repaint(p); out.mega = p.anim.dex;
    p.megaKey = null; G.Admin.repaint(p); out.back = p.anim.dex;
    return out;
  }, dex);
  check(run.radiant && run.anim === dex + '/r', 'your Pokémon plays radiant', run);
  check(run.back === dex + '/r', 'and stays radiant after a change of look (repaint)');
  if (dex === 6) check(run.mega === 'm6/r', 'its Mega is the radiant Mega');
  else check(run.mega === 'm' + dex, 'no radiant Mega: its normal one', run.mega);
  await save(page, () => { G.Game.st && (G.Game.state = 'ui'); });
  const lobby = await save(page, d => ({ on: G.LobbyPick.get(), off: (G.Radiant.set(d, false), G.LobbyPick.get()) }), dex);
  check(lobby.on && lobby.on.rad === true && lobby.on.dex === dex, 'the co-op lobby card says rad', lobby.on);
  check(lobby.off === null, 'and not when you play it normal', lobby.off);
  check(!errs.length, 'no page errors', errs);
  await page.close();

  console.log('No radiants yet');
  const empty = await open(browser, {});
  await empty.page.click('#menu-radiant');
  await empty.page.waitForSelector('#scr-radiant', { state: 'visible' });
  await pickCells(empty.page, [7, 10, 13, 16, 19, 21, 23, 27, 29, 32]);
  check((await empty.page.textContent('#rad-pool')).includes('No radiant forms'), 'says there are none to summon');
  check(await empty.page.isDisabled('#rad-go'), 'and Sacrifice stays off');
  check(!empty.errs.length, 'no page errors', empty.errs);

  console.log('Built index.html (the real radiant list, through the UI)');
  const built = await browser.newPage();
  const berrs = [];
  built.on('pageerror', e => berrs.push(e.message));
  await built.goto(BASE + '/index.html', { waitUntil: 'load' });
  await pastStart(built, '#btn-guest');
  await built.click('#btn-guest');
  await built.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  for (let i = 0; i < 20 && !(await built.isVisible('#scr-result')); i++) {
    await built.click('#test-a button >> nth=0').catch(() => {});
    await built.waitForTimeout(250);
  }
  await built.click('#res-ok');
  await built.waitForSelector('#menu-radiant', { state: 'visible', timeout: 15000 });
  await built.click('#menu-radiant');
  await built.waitForSelector('#scr-radiant', { state: 'visible' });
  const n = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'fork', 'radiant-list.js'), 'utf8').match(/G\.RADIANTS = (\{.*\});/);
  const real = Object.keys(JSON.parse(n[1])).length;
  check(real ? (await built.$$eval('#rad-pool .rad-prize', e => e.length)) === real : (await built.textContent('#rad-pool')).includes('No radiant forms'),
    `the ritual opens with the real pool (${real} radiants)`);
  await built.click('#rad-back');
  check(await built.isVisible('#scr-menu'), 'Back returns to the menu');
  check(!berrs.length, 'no page errors', berrs);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
