#!/usr/bin/env node
// The Radiant Ritual's screen and odds (js/fork/radiant.js), in headless Edge on dev.html with the
// game's real radiants (Arcanine ★4, Mewtwo ★5, Eternatus ★5):
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-radiant-ritual.cjs [base-url]
//
//   1. The screen doesn't list every radiant: a gacha-style banner shows 3 of them, picked at random
//      each time it opens, as dark silhouettes; one you own shows as the real (coloured) radiant.
//   2. The odds go by rarity like the gacha's: each rarity with radiants gets its share (40/30/18/9/3;
//      empty ones don't count) split evenly among its radiants. Today: Epic 75 % (Arcanine),
//      Legendary 25 % (Mewtwo and Eternatus, 12.5 % each). The table on the screen says so.
//   3. 3000 real sacrifices come out at those odds.
//   4. With more radiants than fit (3 more, served as radiants.json like fork/radiant-admin.cjs
//      publishes them) the banner still shows 3, a different 3 from one opening to the next.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let extra = null;                                   // section 4: more radiants in radiants.json
    await ctx.route('**/fork/radiants.json*', async r => {
      if (!extra) return r.continue();
      const res = await r.fetch(), j = await res.json();
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign(j, extra)) });
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.MenuUI && G.Radiant, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; G.DB.commit(); G.Flow.goMenu(); });
    const open = async () => {
      await page.evaluate(() => { if (document.getElementById('scr-radiant') && G.UI.isOpen('scr-radiant')) document.getElementById('rad-back').click(); });
      await page.click('#menu-radiant');
      await page.waitForSelector('#scr-radiant', { state: 'visible', timeout: 8000 });
      await page.waitForTimeout(1500);                 // the sheets load and the banner draws
    };
    // The banner's canvases: which radiant, and whether what's drawn is coloured or a black shape.
    const banner = () => page.evaluate(() => [...document.querySelectorAll('#rad-feat canvas')].map(cv => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let drawn = 0, colour = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60) { drawn++; if (d[i] + d[i + 1] + d[i + 2] > 90) colour++; }
      return { dex: +cv.dataset.dex, drawn, colour };
    }));

    console.log('1. The banner');
    await open();
    const s1 = await page.evaluate(() => ({ pool: G.Radiant.pool().sort((a, b) => a - b), list: !!document.querySelector('#rad-pool, .rad-prize'),
      bannerShown: !!document.querySelector('#rad-banner') && document.querySelector('#rad-banner').getClientRects().length > 0 }));
    const b1 = await banner();
    check(!s1.list && s1.bannerShown, 'no list of every radiant; a banner instead', s1);
    check(b1.length === 3 && JSON.stringify(b1.map(x => x.dex).sort((a, b) => a - b)) === JSON.stringify(s1.pool), 'it shows 3 radiants', b1.map(x => x.dex));
    check(b1.every(x => x.drawn > 300 && x.colour < x.drawn * 0.02), 'none owned: all three are dark silhouettes', b1);
    await page.evaluate(() => { G.DB.save.radiant = { 59: { at: Date.now(), from: 'test' } }; G.DB.commit(); });
    await open();
    const b2 = await banner(), arc = b2.find(x => x.dex === 59), others = b2.filter(x => x.dex !== 59);
    check(arc && arc.colour > arc.drawn * 0.5, 'owned Arcanine shows as its real, coloured radiant', arc);
    check(others.length === 2 && others.every(x => x.drawn > 300 && x.colour < x.drawn * 0.02), 'the other two stay silhouettes', others);
    const orders = new Set();
    for (let i = 0; i < 8; i++) { await page.evaluate(() => { document.getElementById('rad-back').click(); document.getElementById('menu-radiant').click(); }); orders.add(await page.evaluate(() => [...document.querySelectorAll('#rad-feat canvas')].map(c => c.dataset.dex).join())); }
    check(orders.size >= 2, 'a new random pick each time it opens', [...orders]);

    console.log('2. The odds');
    const o = await page.evaluate(() => ({ tiers: G.Radiant.tiers(), arc: G.Radiant.chance(59), mew: G.Radiant.chance(150), eter: G.Radiant.chance(890),
      rows: [...document.querySelectorAll('#rad-rates [data-tier]')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }));
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    check(near(o.arc, 0.75) && near(o.mew, 0.125) && near(o.eter, 0.125), 'Arcanine 75 %, Mewtwo and Eternatus 12.5 % each', o);
    check(o.rows.length === 2 && /Legendary 25% · 2$/.test(o.rows[0]) && /Epic 75% · 1$/.test(o.rows[1]), 'the table: Legendary 25 % (2 radiants), Epic 75 % (1)', o.rows);
    const synth = await page.evaluate(() => {
      // Made-up pools (by Pokémon rarity: Pidgey 1, Pikachu ... whatever tiers they have): the shares renormalise.
      const t = G.Radiant.tiers([16, 59, 150, 890]), sum = Object.values(t).reduce((s, x) => s + x.pct, 0);
      return { t, sum, tier16: G.Radiant.tier(16) };
    });
    check(Math.abs(synth.sum - 100) < 1e-9 && Object.keys(synth.t).length >= 2, 'with other rarities in the pool the shares still add up to 100 %', synth);

    console.log('3. 3000 sacrifices');
    const n = await page.evaluate(() => {
      const s = G.DB.save, out = { 59: 0, 150: 0, 890: 0 }, ids = [1, 4, 7, 10, 13, 16, 19, 21, 23, 25];
      const commit = G.DB.commit; G.DB.commit = () => {};
      for (let i = 0; i < 3000; i++) {
        s.shiny = {}; for (const d of ids) s.shiny[d] = { at: Date.now() };
        const r = G.Radiant.sacrifice(ids);
        if (r.ok) out[r.dex]++;
      }
      G.DB.commit = commit;
      return out;
    });
    check(n[59] > 2100 && n[59] < 2400 && n[150] > 270 && n[150] < 480 && n[890] > 270 && n[890] < 480, 'about 75 / 12.5 / 12.5 %', n);

    console.log('4. More radiants than the banner holds');
    extra = { 3: { rarity: 3 }, 6: { rarity: 4 }, 9: { rarity: 3 } };
    await page.evaluate(() => G.Radiant.refresh());
    const pool = await page.evaluate(() => G.Radiant.pool().length);
    const sets = new Set();
    for (let i = 0; i < 10; i++) { await page.evaluate(() => { document.getElementById('rad-back').click(); document.getElementById('menu-radiant').click(); }); sets.add(await page.evaluate(() => [...document.querySelectorAll('#rad-feat canvas')].map(c => c.dataset.dex).sort().join())); }
    const sizes = await page.evaluate(() => document.querySelectorAll('#rad-feat canvas').length);
    check(pool === 6 && sizes === 3 && sets.size >= 3, '6 radiants: always 3 on the banner, a different 3 from one opening to the next', { pool, sizes, sets: [...sets] });

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll ritual checks passed');
  process.exit(failures ? 1 : 0);
})();
