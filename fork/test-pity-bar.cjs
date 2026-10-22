#!/usr/bin/env node
// The gacha's pity bar (js/fork/pity-bar.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-pity-bar.cjs [base-url] [screenshot.png]
//
//   1. 22 segments of 10 pulls under the pity line; the 4 from pull 180 on are gold, with "180"
//      marked under where they start.
//   2. It fills with the banner's pulls without a Legendary: 0, 95 (9 full and half of one), 199.
//   3. Switching banners shows that banner's count; a real pull moves it on.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const SHOT = process.argv[3];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[1] = { at: Date.now(), from: 'starter' }; s.partner = 1; s.starter = 1; G.DB.commit(); G.Flow.goMenu(); });

    const bar = () => page.evaluate(() => {
      const b = document.getElementById('gacha-pitybar');
      if (!b) return null;
      const segs = [...b.querySelectorAll('.pity-seg')];
      return { n: segs.length, soft: segs.filter(s => s.classList.contains('soft')).length, firstSoft: segs.findIndex(s => s.classList.contains('soft')),
        full: segs.filter(s => s.classList.contains('full')).length, part: segs.filter(s => s.classList.contains('part')).map(s => s.querySelector('i').style.width),
        mark: (b.querySelector('.pity-mark') || {}).textContent || null, line: document.getElementById('gacha-pity').textContent };
    });
    const at = async (pity, gen = 1) => {
      await page.evaluate(([p, g]) => { G.DB.save.pity = Object.assign(G.DB.save.pity || {}, { [g]: p }); G.GachaUI.open(); }, [pity, gen]);
      return bar();
    };

    console.log('1. The bar');
    const b0 = await at(0);
    check(b0 && b0.n === 22 && b0.soft === 4 && b0.firstSoft === 18 && b0.mark === '180', '22 segments of 10, the last 4 (from 180) gold, 180 marked', b0);
    console.log('2. It fills');
    check(b0.full === 0 && !b0.part.length, '0 pulls: empty', b0);
    const b95 = await at(95);
    check(b95.full === 9 && b95.part.join() === '50%', '95 pulls: 9 segments and half of the tenth', b95);
    const b199 = await at(199);
    check(b199.full === 19 && b199.part.join() === '90%' && /199 \/ 220/.test(b199.line), '199 pulls: into the gold part, the line says 199 / 220', b199);
    if (SHOT) await page.locator('#scr-gacha').screenshot({ path: SHOT });

    console.log('3. Banners and pulls');
    await page.evaluate(() => { G.DB.save.pity = { 1: 199, 2: 30 }; G.GachaUI.open(); });
    await page.click('#gacha-gens .gen-tab[data-gen="2"]');
    const b2 = await bar();
    check(b2.full === 3 && /30 \/ 220/.test(b2.line), 'Johto\'s tab: its own 30 pulls', b2);
    await page.click('#gacha-gens .gen-tab[data-gen="1"]');
    check((await bar()).full === 19, 'back to Kanto: 199 again');
    await page.evaluate(() => { G.DB.save.pity = { 1: 40 }; G.DB.save.tickets = { t1: 5, t10: 0 }; G.GachaUI.open(); });
    await page.click('#pull-1');
    await page.waitForTimeout(400);
    await page.evaluate(() => { const s = document.getElementById('pull-skip'); if (s && !s.classList.contains('hidden')) s.click(); });
    await page.waitForFunction(() => !document.getElementById('pull-close').classList.contains('hidden'), null, { timeout: 15000 });
    await page.click('#pull-close');
    const after = await bar();
    check(after.full === 4 && after.part.join() === '10%', 'one pull later: 41 (4 segments and a bit)', after);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll pity bar checks passed');
  process.exit(failures ? 1 : 0);
})();
