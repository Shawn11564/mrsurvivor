#!/usr/bin/env node
// "Half are new" (js/fork/half-new.js, Lab first), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-half-new.cjs [base-url]
//
// Owning all but 2 of a banner's Legendaries, 4000 Legendary pulls (pity forces one each time):
//   1. Lab off: a new one about as often as chance gives (2 of the banner's Legendaries).
//   2. Lab on: about half of them are new, plus chance's share of the other half.
//   3. Owning them all: nothing changes (no error, normal picks). The odds screen notes it with Lab on.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.GachaPick, null, { timeout: 30000 });
    const run = (lab, ownAll) => page.evaluate(([lab, ownAll]) => {
      G.Settings.set('lab', lab);
      const legs = G.Gacha.pool(5, 1), keep = ownAll ? legs.length : legs.length - 2;
      let fresh = 0, n = 0;
      for (let i = 0; i < 4000; i++) {
        const s = JSON.parse(JSON.stringify(G.DB.save));
        s.owned = {}; legs.slice(0, keep).forEach(p => { s.owned[p.dex] = { at: 1 }; });
        s.tickets = { t1: 1, t10: 0 }; s.pity = { 1: 219 }; s.shiny = {};
        const r = G.Gacha.pull(s, 1, 1)[0];
        if (r.rarity !== 5) continue;
        n++; if (!legs.slice(0, keep).some(p => p.dex === r.dex)) fresh++;
      }
      return { n, legs: legs.length, rate: +(fresh / n).toFixed(3), chance: +((legs.length - keep) / legs.length).toFixed(3) };
    }, [lab, ownAll]);
    const off = await run(false, false), on = await run(true, false), all = await run(true, true);
    console.log('  banner Legendaries:', off.legs);
    check(off.n === 4000 && Math.abs(off.rate - off.chance) < 0.04, 'Lab off: new ones only by chance', off);
    const want = 0.5 + 0.5 * on.chance;
    check(Math.abs(on.rate - want) < 0.04, `Lab on: about ${want.toFixed(2)} new (half, plus chance on the other half)`, on);
    check(all.n === 4000 && all.rate === 0, 'owning them all: normal picks, no errors', all);
    await page.evaluate(() => { G.Settings.set('lab', true); G.DB.save.owned[1] = { at: 1 }; G.DB.save.partner = 1; G.DB.save.starter = 1; G.Flow.goMenu(); G.GachaUI.open(); });
    await page.waitForTimeout(200);
    check(/half of the Legendaries you pull are ones you don't have yet/.test(await page.textContent('#gacha-rates')), 'the odds screen says so with Lab on');
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll half-are-new checks passed');
  process.exit(failures ? 1 : 0);
})();
