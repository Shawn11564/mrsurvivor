#!/usr/bin/env node
// The gem count in the top bar's coin bubble (js/fork/lab/gems.js, pill), in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-gem-pill.cjs [base-url]       (SHOTS=<folder> saves the top bar)
//
//   1. index.html (the built page): on the main menu the coin bubble has the coins, then a gem and the
//      gem count (0 for a new guest), in the same bubble.
//   2. dev.html: gems won (G.Gems.give) show within a second, and the count follows the save when gems
//      are spent; a coin change (refreshCoins) keeps it right.
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const open = async file => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.errs = []; page.on('pageerror', e => page.errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await page.isVisible('#scr-starters')) { await page.locator('#starter-grid .cell').first().click(); await page.click('#starter-ok'); }
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    return page;
  };
  const bubble = page => page.evaluate(() => {
    const c = document.getElementById('coins'), pill = c && c.closest('.pill'), n = document.getElementById('gems-n');
    return { same: !!pill && !!n && pill.contains(n) && !!pill.querySelector('.gem-ico'), coins: c && c.textContent, gems: n && n.textContent,
             shown: !!n && n.offsetParent !== null, text: pill && pill.textContent.replace(/\s+/g, ' ').trim() };
  });
  try {
    console.log('1. The built page');
    const built = await open('/index.html');
    await built.waitForTimeout(300);
    const b = await bubble(built);
    check(b.same && b.shown && b.gems === '0', 'the main menu\'s coin bubble also has a gem and the gem count', b);
    if (process.env.SHOTS) await built.screenshot({ path: path.join(process.env.SHOTS, 'gem-pill.png'), clip: { x: 260, y: 0, width: 760, height: 70 } });
    check(!built.errs.length, 'no page errors (index.html)', built.errs.slice(0, 3));
    await built.context().close();

    console.log('2. It follows the gems');
    const page = await open('/dev.html');
    await page.evaluate(() => G.Gems.give(7));
    const won = await page.waitForFunction(() => document.getElementById('gems-n').textContent === '7', null, { timeout: 2000 }).then(() => true, () => false);
    check(won, 'gems won show within a second (7)');
    await page.evaluate(() => { G.DB.save.gems = 1234; G.DB.save.coins += 5; G.UI.refreshCoins(); });
    const after = await bubble(page);
    check(after.gems === (1234).toLocaleString('en') && after.same, 'with a coin change it shows the save\'s gems at once', after);
    await page.evaluate(() => { G.DB.save.gems = 3; });
    const spent = await page.waitForFunction(() => document.getElementById('gems-n').textContent === '3', null, { timeout: 2000 }).then(() => true, () => false);
    check(spent, 'gems spent show within a second (3)');
    check(!page.errs.length, 'no page errors (dev.html)', page.errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll gem bubble checks passed');
  process.exit(failures ? 1 : 0);
})();
