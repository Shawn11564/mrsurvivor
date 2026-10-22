// Shared bits for the fork's headless-browser checks (every fork/test-*.cjs).
const path = require('path'), fs = require('fs'), os = require('os');

// Where Playwright (and acorn) are found: this repo, PLAYWRIGHT_DIR, Command Center's checkout beside
// the repo, and the same by absolute path, so a git worktree anywhere else finds it too.
const NODE_DIRS = [__dirname, process.env.PLAYWRIGHT_DIR, path.join(__dirname, '..', '..', 'commandcenter'),
  path.join(os.homedir(), 'Documents', 'IdeaProjects', 'commandcenter')].filter(Boolean);
const { chromium } = require(require.resolve('playwright', { paths: NODE_DIRS }));

// The local server the checks talk to by default. The main checkout serves on 8123; a git worktree
// (its .git is a file) gets its own port from its path, 8130-8189, so two sessions' servers never
// collide. `node fork/serve.cjs` serves this checkout on that port. TEST_PORT / TEST_BASE override,
// and a URL given on the command line still wins.
const ROOT = path.join(__dirname, '..');
function portFor(root) {
  let h = 0;
  for (const c of path.resolve(root).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 8130 + h % 60;
}
let worktree = false;
try { worktree = fs.statSync(path.join(ROOT, '.git')).isFile(); } catch (e) { /* not a git checkout */ }
const PORT = String(process.env.TEST_PORT || (worktree ? portFor(ROOT) : 8123));
const BASE = (process.env.TEST_BASE || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');

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

module.exports = { chromium, pastStart, pickStarter, BASE, PORT, NODE_DIRS, ROOT };
