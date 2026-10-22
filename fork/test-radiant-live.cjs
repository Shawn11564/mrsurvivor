#!/usr/bin/env node
// Radiants published without a rebuild (js/fork/radiants.json, read by refresh() in
// js/fork/radiant.js) and the ritual's rarity weights, in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-radiant-live.cjs [base-url]
//
// The built list (radiant-list.js) is served empty, as on the site before a rebuild; radiants.json
// lists Mewtwo (Legendary, with its Lab sheet) and Bulbasaur (Common). Their r/ sheets are their
// shiny ones (s/), real sheets that differ from the normal ones.
//   1. On load both become radiants: in the pool, with their rarities and the game's odds.
//   2. The ritual rolls by weight: a high roll gives the Legendary, a low one the Common.
//   3. Published while the game is open: opening the ritual reads radiants.json again and the new
//      one is in the pool at once, its odds in the prize's tooltip.
//   4. A run with the radiant Mewtwo uses its 150/r sheets.
//   5. No radiants.json (404): the built list still works, nothing breaks.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function open(browser, live) {
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const errs = [], asked = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/js/fork/radiant-list.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'G.RADIANTS = {};' }));
  await page.route('**/js/fork/radiants.json*', r => live.json ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(live.json) }) : r.fulfill({ status: 404, body: '' }));
  await page.route(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/, r => {
    const u = r.request().url();
    asked.push(u.match(/pokemon\/(.+)$/)[1]);
    r.continue({ url: u.includes('/r/lab/') ? u.replace('/r/lab/', '/lab/') : u.replace('/r/', '/s/') });
  });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.Radiant, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    const s = G.DB.save;
    for (const d of [4, 7, 10, 13, 16, 19, 21, 23, 27, 29, 32, 35, 37, 39, 41, 43, 46, 48, 50, 52]) G.DB.grantShiny(d, 'test');
    s.partner = 4; G.DB.commit(); G.MenuUI.open();
  });
  return { page, errs, asked };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const live = { json: { 1: { rarity: 1 }, 150: { lab: ['SpAttack'], rarity: 5 } } };
    const { page, errs, asked } = await open(browser, live);

    console.log('1. Read on load');
    await page.waitForFunction(() => G.Radiant.has(150) && G.Radiant.has(1), null, { timeout: 10000 }).catch(() => {});
    const s = await page.evaluate(() => ({ pool: G.Radiant.pool(), t: [G.Radiant.tier(1), G.Radiant.tier(150)], c: [G.Radiant.chance(1), G.Radiant.chance(150)], W: G.Radiant.SHARE }));
    check(s.pool.join() === '1,150', 'both radiants from radiants.json are in the pool (the built list is empty)', s.pool);
    check(s.t.join() === '1,5', 'with their rarities: Common and Legendary', s.t);
    const want150 = s.W[5] / (s.W[1] + s.W[5]);
    check(Math.abs(s.c[1] - want150) < 1e-9 && Math.abs(s.c[0] + s.c[1] - 1) < 1e-9, `odds by rarity share (one radiant each): Mewtwo ${(want150 * 100).toFixed(1)}%`, s.c);

    console.log('2. The roll follows the shares');
    const roll = r => page.evaluate(([r, ten]) => { const o = Math.random; Math.random = () => r; try { return G.Radiant.sacrifice(ten).dex; } finally { Math.random = o; } },
      [r, r > 0.5 ? [7, 10, 13, 16, 19, 21, 23, 27, 29, 32] : [35, 37, 39, 41, 43, 46, 48, 50, 52, 4]]);
    check(await roll(0.999) === 150, 'a roll in the top ' + (want150 * 100).toFixed(1) + '% gives the Legendary');
    check(await roll(0.5) === 1, 'a middling roll gives the Common');

    console.log('3. Published while the game is open');
    live.json = Object.assign({}, live.json, { 4: { rarity: 3 } });
    await page.evaluate(() => { G.DB.grantShiny(60, 't'); G.Radiant.open(); });
    await page.waitForSelector('#scr-radiant', { state: 'visible' });
    check(await page.waitForFunction(() => document.querySelectorAll('#rad-feat canvas').length === 3, null, { timeout: 8000 }).then(() => true, () => false),
      'opening the ritual reads radiants.json again: 3 on the banner, no reload');
    const rows = await page.$$eval('#rad-rates [data-tier]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    check(rows.length === 3 && rows.every(t => /[\d.]+% · 1$/.test(t)), 'the odds table has its 3 rarities, one radiant each', rows);
    await page.click('#rad-back');

    console.log('4. A run with the radiant');
    const run = await page.evaluate(() => { const s = G.DB.save; s.partner = 150; G.DB.grant(150, 't'); G.DB.commit(); G.Game.startRun(); const p = G.Game.player; return { anim: p.anim.dex, radiant: !!p.radiant }; });
    check(run.radiant && run.anim === '150/r', 'Mewtwo plays as its radiant (150/r)', run);
    await page.waitForTimeout(800);
    check(asked.some(a => a.startsWith('150/r/')), 'its r/ sheets are loaded', asked.slice(0, 4));
    check(!errs.length, 'no page errors', errs);
    await page.context().close();

    console.log('5. No radiants.json');
    const none = await open(browser, { json: null });
    await none.page.waitForTimeout(1200);
    check(await none.page.evaluate(() => G.Radiant.pool().length) === 0 && !none.errs.length, 'a 404 leaves the built list as it is, no errors', none.errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll radiant live checks passed');
  process.exit(failures ? 1 : 0);
})();
