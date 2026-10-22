// Shared bits for the fork's headless-browser checks (test-gameplay.cjs, test-import.cjs).
const path = require('path');
const { chromium } = require(require.resolve('playwright', {
  paths: [__dirname, process.env.PLAYWRIGHT_DIR || path.join(__dirname, '..', '..', 'commandcenter')]
}));

/**
 * Gets past the "Press to start" overlay until `sel` is on screen. The game only shows the
 * overlay once its database has decided between cloud and local, which on a cold page (dev.html
 * loads ~70 scripts) can take longer than any fixed guess. So this waits for whichever comes
 * first, clicks the overlay when that's it, and repeats until `sel` shows.
 */
async function pastStart(page, sel, ms = 90000) {
  const end = Date.now() + ms;
  for (;;) {
    const which = await page.waitForFunction(s => {
      const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      if ([...document.querySelectorAll(s)].some(shown)) return 'ready';
      return shown(document.getElementById('tap-start')) ? 'tap' : false;
    }, sel, { timeout: Math.max(1, end - Date.now()) }).then(h => h.jsonValue(), async e => {
      const on = await page.evaluate(() => [...document.querySelectorAll('.scr, #tap-start, #boot')]
        .filter(el => !el.classList.contains('hidden') && el.getClientRects().length).map(el => el.id)).catch(() => '?');
      throw new Error(`pastStart: "${sel}" never showed; on screen: ${JSON.stringify(on)}`);
    });
    if (which === 'ready') return;
    await page.click('#tap-start');
  }
}

/**
 * A new player's first screen after logging in: the grid of starters (js/fork/starter-pick.js; it was a
 * personality test). Picks the first one (or the one whose dex is given) and waits for the menu.
 */
async function pickStarter(page, dex = null) {
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 30000 });
  const cells = page.locator('#starter-grid .cell');
  if (dex == null) await cells.first().click();
  else await page.evaluate(d => { const i = G.STARTERS.findIndex(s => s.dex === d); document.querySelectorAll('#starter-grid .cell')[i].click(); }, dex);
  await page.click('#starter-ok');
  await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
}

module.exports = { chromium, pastStart, pickStarter };
