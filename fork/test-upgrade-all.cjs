#!/usr/bin/env node
// "Upgrade all" in Upgrades (js/fork/upgrade-all.js, Lab first), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-upgrade-all.cjs [base-url]
//
//   1. Lab off: no panel. Lab on, too few coins: the total and how much more is needed, button off.
//   2. Buying one upgrade the normal way: the panel's total goes down by its price.
//   3. Enough coins: the first click asks to confirm with the total, the second maxes every upgrade
//      and takes exactly that; then "already maxed", and Prestige switches on (js/fork/prestige.js).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.UpgradeAll, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.coins = 0; s.pupg = {}; s.gems = 100; G.Settings.set('lab', false);   // gems: with Lab on, prestige costs 100 (js/fork/lab/gems.js) G.DB.commit(); G.Flow.goMenu(); });
    const open = () => page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); document.querySelector('#scr-menu [data-go="upgrades"]').click(); });
    const panel = () => page.evaluate(() => { const b = document.getElementById('upgall-panel'), btn = b && b.querySelector('[data-all]');
      return b && { what: b.querySelector('.upgall-what').textContent, btn: btn && { off: btn.disabled, text: btn.textContent.trim() } }; });

    console.log('1. Showing it');
    await open(); await page.waitForTimeout(200);
    check(!(await panel()), 'Lab off: no Upgrade all');
    await page.evaluate(() => G.Settings.set('lab', true));
    await open(); await page.waitForTimeout(200);
    const q = await page.evaluate(() => G.UpgradeAll.quote(4)), have = await page.evaluate(() => G.DB.save.coins);   // (an achievement may have paid a few)
    const p0 = await panel();
    check(p0 && p0.btn.off && p0.what.includes(q.total.toLocaleString() + ' coins in all: ' + (q.total - have).toLocaleString() + ' more needed'), `too few coins: total ${q.total}, the rest needed, button off`, p0);

    console.log('2. A single buy');
    await page.evaluate(() => { G.DB.save.coins = 100000; G.UI.refreshCoins(); document.getElementById('upg-mon').dispatchEvent(new Event('change')); });
    await page.waitForTimeout(150);
    const price = await page.evaluate(() => G.Upgrades.cost('hp', 0));
    await page.click('#upg-list .upg-item [data-buy]');
    await page.waitForTimeout(150);
    const q1 = await page.evaluate(() => G.UpgradeAll.quote(4)), p1 = await panel();
    check(q1.total === q.total - price && p1.what.includes(q1.total.toLocaleString() + ' coins in all') && !p1.btn.off, 'after buying one, the panel shows the new total', { before: q.total, price, after: q1.total, p1 });

    console.log('3. Upgrade all');
    await page.click('#upgall-panel [data-all]');
    const p2 = await panel();
    check(/^Confirm: spend/.test(p2.btn.text) && p2.btn.text.includes(q1.total.toLocaleString()), 'first click: confirm, with the total', p2.btn);
    const c0 = await page.evaluate(() => G.DB.save.coins);
    await page.click('#upgall-panel [data-all]');
    await page.waitForTimeout(150);
    const done = await page.evaluate(() => ({ coins: G.DB.save.coins, maxed: G.Upgrades.LIST.every(u => (G.DB.upgradesOf(4)[u.id] || 0) === u.max),
      pipsOff: document.querySelectorAll('#upg-list .pips i:not(.on)').length,
      prest: (document.querySelector('#prestige-panel [data-prest]') || {}).disabled }));
    check(done.maxed && c0 - done.coins === q1.total && done.pipsOff === 0, 'every upgrade maxed, exactly the total spent, the list shows it', { spent: c0 - done.coins, ...done });
    check((await panel()).what === 'Every upgrade is already maxed.' && done.prest === false, 'then "already maxed", and Prestige is on', done.prest);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Upgrade all checks passed');
  process.exit(failures ? 1 : 0);
})();
