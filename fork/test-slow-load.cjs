#!/usr/bin/env node
// A slow page load throws nothing (headless Edge on dev.html):
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-slow-load.cjs [base-url]
//
// dev.html loads every script on its own, so on a busy machine js/game.js can arrive seconds after
// the fork's scripts, whose timers (mega.js, rainbow.js, lab/shiny.js, lab/wild-legends.js) read
// G.Game.player on their first tick: "Cannot read properties of undefined (reading 'player')", a
// page error that failed other tests now and then under load. Here js/game.js is held back 3 s.
// (The built index.html has everything in one file, so G.Game is there before any timer runs.)
const { chromium } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  let ok = false;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.stack || e).split('\n').slice(0, 2).join(' ')));
    await page.route('**/js/game.js*', async r => { await new Promise(res => setTimeout(res, 3000)); await r.continue(); });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.G && G.Game && G.Flow, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    ok = !errors.length;
    console.log((ok ? '  PASS ' : '  FAIL ') + 'js/game.js 3 s late: no page errors' + (ok ? '' : ' ' + JSON.stringify(errors.slice(0, 3))));
  } catch (e) { console.error(e); }
  await browser.close();
  console.log(ok ? '\nSlow load check passed' : '\nSlow load check failed');
  process.exit(ok ? 0 : 1);
})();
