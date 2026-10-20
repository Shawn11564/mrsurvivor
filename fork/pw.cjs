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

module.exports = { chromium, pastStart };
