#!/usr/bin/env node
// Upstream "What's new" lines that aren't true in MrSurvivor are hidden (js/fork/changelog-filter.js),
// in headless Edge on dev.html (only the static server: python -m http.server 8123):
//
//   node fork/test-changelog-filter.cjs [base-url]
//
//   1. Upstream's 2026-10-21 "co-op goes through our server" note (their TURN, off here) is gone
//      from G.CHANGELOG and from the What's new screen, in Spanish and in English; the date stays with
//      upstream's other lines for it (their big update of 2026-10-21 came later), and no date is left empty.
//   2. The dates around it are still there, and the What's new dot follows the newest date left.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form');
    await page.waitForFunction(() => window.G && G.CHANGELOG && G.NewsUI, null, { timeout: 30000 });
    // Into the menu as a guest with a starter (a new one would pick it first); the top bar has What's new.
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[1] = { at: Date.now(), from: 'starter' }; s.partner = 1; s.starter = 1; G.DB.commit(); G.Flow.goMenu(); });
    await page.waitForSelector('#btn-news', { state: 'visible', timeout: 30000 });

    console.log('1. The TURN note is gone');
    const cl = await page.evaluate(() => ({
      text: JSON.stringify(G.CHANGELOG), dates: G.CHANGELOG.map(v => v.d),
      empty: G.CHANGELOG.filter(v => !v.new && !v.chg && !v.fix).length,
      d21: (v => (v ? ['new', 'chg', 'fix'].reduce((a, k) => a + (v[k] || []).length, 0) : 0))(G.CHANGELOG.find(v => v.d === '2026-10-21'))
    }));
    check(!/nuestro servidor|through our server/.test(cl.text), 'no "goes through our server" line in G.CHANGELOG');
    check(cl.d21 > 0 && cl.empty === 0, "2026-10-21 keeps upstream's other lines, and no date is left empty", { lines: cl.d21, dates: cl.dates.slice(0, 3) });
    for (const lang of ['es', 'en']) {
      await page.evaluate(l => { G.I18n.set && G.I18n.set(l); }, lang);
      await page.click('#btn-news');
      const body = await page.textContent('#news-body');
      check(body.length > 200 && !/nuestro servidor|through our server/i.test(body), `the What's new screen doesn't show it (${lang})`);
      await page.click('#news-close');
    }

    console.log('2. The rest is untouched');
    check(cl.dates.includes('2026-10-20') && cl.dates.includes('2026-10-19'), 'the 2026-10-20 and 2026-10-19 notes are still there');
    const dot = await page.evaluate(() => {
      localStorage.setItem('ps.news.seen', G.CHANGELOG[0].d); G.NewsUI.init();
      const off = document.getElementById('btn-news').classList.contains('new');
      localStorage.setItem('ps.news.seen', '2000-01-01'); G.NewsUI.init();
      return { seenNewest: off, seenOld: document.getElementById('btn-news').classList.contains('new') };
    });
    check(!dot.seenNewest && dot.seenOld, 'the What\'s new dot is off once the newest remaining date is seen, on before', dot);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll changelog filter checks passed');
  process.exit(failures ? 1 : 0);
})();
