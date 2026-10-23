#!/usr/bin/env node
// The gacha machine's Skip button sits under the machine (css/brand.css; #pull-skip, js/ui/gacha-ui.js),
// in headless Edge, real pulls through the gacha's buttons, on a desktop, a phone held upright and a phone
// on its side. The pulls run on dev.html (tickets set through G) with the stylesheet index.html links
// (css/brand.css, which dev.html doesn't); first, the built index.html is checked to link a brand.css
// that has the rule.
//   1. While the machine spins, Skip is below the machine (its top under the canvas's bottom), centred
//      on it, and on screen.
//   2. Nothing goes under it: the cards come once the machine and its Skip have gone.
//   3. Skip still skips (a second pull): the cards show and Continue comes.
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-gacha-skip.cjs [base-url]     (SHOTS=<folder> saves a screenshot of each)
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    console.log('The built page');
    const html = await (await fetch(BASE + '/index.html')).text();
    const brandHref = (html.match(/href="(css\/brand\.css[^"]*)"/) || [])[1];
    const css = brandHref ? await (await fetch(BASE + '/' + brandHref)).text() : '';
    check(!!brandHref && /#slot-wrap\s*\{[^}]*flex-direction:\s*column/.test(css) && /#pull-skip\s*\{[^}]*position:\s*static/.test(css),
      'index.html links ' + brandHref + ', which puts Skip under the machine');
    for (const [w, h, name] of [[1280, 800, 'desktop'], [390, 800, 'phone'], [844, 390, 'phone on its side']]) {
      console.log(`${name} (${w}×${h})`);
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      const errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
      await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
      await page.addStyleTag({ url: BASE + '/' + brandHref });
      await pastStart(page, '#btn-guest');
      await page.click('#btn-guest');
      await page.waitForFunction(() => window.G && G.DB && G.DB.save, null, { timeout: 30000 });
      await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.tickets.t1 = 20; G.DB.commit(); G.Flow.goMenu(); });
      await page.click('#scr-menu [data-go=gacha]');
      await page.click('#pull-10');
      await page.waitForSelector('#pull-skip', { state: 'visible', timeout: 10000 });
      const geo = await page.evaluate(() => {
        const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        return { slot: r(document.getElementById('slot')), skip: r(document.getElementById('pull-skip')), vh: innerHeight, vw: innerWidth };
      });
      const mid = g => (g.l + g.r) / 2;
      check(geo.skip.t >= geo.slot.b - 0.5, 'Skip is below the machine', { skipTop: Math.round(geo.skip.t), slotBottom: Math.round(geo.slot.b) });
      check(Math.abs(mid(geo.skip) - mid(geo.slot)) < 2, 'centred on it', { skip: Math.round(mid(geo.skip)), slot: Math.round(mid(geo.slot)) });
      check(geo.skip.b <= geo.vh && geo.skip.l >= 0 && geo.skip.r <= geo.vw, 'on screen', geo.skip);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'gacha-skip-' + name.replace(/ /g, '-') + '.png') });
      // Left to play: the cards come only once the machine's box (and Skip in it) has gone, so none is ever under it.
      await page.waitForSelector('#pull-results .pcard', { timeout: 20000 });
      check(!(await page.isVisible('#pull-skip')), 'when the first card shows, the machine and its Skip have gone (nothing under it)');
      await page.waitForSelector('#pull-close', { state: 'visible', timeout: 20000 });
      await page.click('#pull-close');
      await page.click('#pull-10');
      await page.waitForSelector('#pull-skip', { state: 'visible', timeout: 10000 });
      await page.click('#pull-skip');
      await page.waitForSelector('#pull-close', { state: 'visible', timeout: 15000 });
      const n = await page.locator('#pull-results .pcard').count();
      check(n >= 1 && !(await page.isVisible('#pull-skip')), 'it skips to the end: the cards show, Continue comes, Skip goes', n);
      check(!errs.length, 'no page errors', errs.slice(0, 3));
      await page.context().close();
    }
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll gacha Skip checks passed');
  process.exit(failures ? 1 : 0);
})();
