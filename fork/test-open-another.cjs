#!/usr/bin/env node
// "Open Another" next to Continue after a roll (js/fork/open-another.js, js/fork/radiant.js again), in
// headless Edge on dev.html, real pulls through the gacha's buttons:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-open-another.cjs [base-url]
//
//   1. Gacha ×1 with 2 tickets: after the roll, "Open Another" next to Continue; it rolls ×1 again at once
//      (one more ticket spent, new cards, the gacha screen never left). With 0 tickets left: no button.
//   2. ×10 with a ×10 ticket: the button repeats a ×10 paid with a ×10 ticket (not 10 normal tickets).
//   3. Rainbow ×25: the same with a rainbow ticket.
//   4. Radiant Ritual: with 15 spare shinies after a sacrifice, "Open Another" fills the next 10 like "Fill with the
//      commonest" (no legendaries, not your partner) and sacrifices them; with fewer than 10 left: no button.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const LIST = { 150: { rarity: 5 } };

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 860 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    // A stand-in radiant list (Mewtwo), its r/ sheets the shiny ones, as fork/test-variant-bonus.cjs does.
    await page.route('**/js/fork/radiant-list.js*', r => r.fulfill({ contentType: 'text/javascript', body: `G.RADIANTS = ${JSON.stringify(LIST)};` }));
    await page.route('**/js/fork/radiants.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(LIST) }));
    await page.route(/\/assets\/pokemon\/(m?\d+)\/r\/(.+\.png)/, r => r.continue({ url: r.request().url().replace('/r/', '/s/') }));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Radiant && G.OpenAnother, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });

    // Wait for a roll's end (Continue shown), then what's on screen.
    const done = () => page.waitForFunction(() => !document.getElementById('pull-close').classList.contains('hidden'), null, { timeout: 30000 })
      .then(() => page.evaluate(() => { const a = document.getElementById('pull-another'), t = G.DB.save.tickets;
        return { again: !!a && !a.classList.contains('hidden') ? a.textContent.trim() : null, cards: document.querySelectorAll('#pull-results .pcard').length,
          t1: t.t1, t10: t.t10, t25: t.t25 | 0, gacha: G.UI.isOpen('scr-gacha'), owned: Object.keys(G.DB.save.owned).length }; }));
    const skip = () => page.evaluate(() => { const s = document.getElementById('pull-skip'); if (s && !s.classList.contains('hidden')) s.click(); });

    console.log('1. Gacha ×1');
    await page.evaluate(() => { const t = G.DB.save.tickets; t.t1 = 2; t.t10 = 0; t.t25 = 0; G.DB.commit(); document.querySelector('#scr-menu [data-go=gacha]').click(); });
    await page.waitForSelector('#pull-1', { state: 'visible' });
    await page.click('#pull-1'); await skip();
    let a = await done();
    check(a.again && /open another/i.test(a.again) && a.t1 === 1 && a.cards === 1, '1 ticket left: "Open Another" next to Continue', a);
    await page.click('#pull-another'); await page.waitForTimeout(100); await skip();
    let b = await done();
    check(b.t1 === 0 && b.cards === 1 && b.gacha, 'it rolls ×1 again at once: one more ticket spent, still on the gacha screen', b);
    check(b.again === null, 'no ticket left: no button', b);
    await page.click('#pull-close');

    console.log('2. ×10 with a ×10 ticket');
    await page.evaluate(() => { const t = G.DB.save.tickets; t.t1 = 25; t.t10 = 2; G.DB.commit(); G.GachaUI.open && G.GachaUI.open(); });
    await page.waitForSelector('#pull-10b', { state: 'visible' });
    await page.click('#pull-10b'); await skip();
    a = await done();
    check(a.again && a.t10 === 1 && a.cards === 10, 'after a ×10 with a ×10 ticket: the button', a);
    await page.click('#pull-another'); await page.waitForTimeout(100); await skip();
    b = await done();
    check(b.t10 === 0 && b.t1 >= a.t1 && b.cards === 10, 'it repeats it with a ×10 ticket (normal tickets not spent; achievements may add some)', { before: a, after: b });
    check(b.again === null, 'no ×10 ticket left: no button (25 normal tickets don\'t count for this one)', b);
    await page.click('#pull-close');

    console.log('3. Rainbow ×25');
    await page.evaluate(() => { const t = G.DB.save.tickets; t.t25 = 2; G.DB.commit(); G.GachaUI.open && G.GachaUI.open(); });
    await page.waitForSelector('#pull-25', { state: 'visible', timeout: 5000 });
    await page.click('#pull-25');
    await skip();
    a = await done();
    check(a.again && a.t25 === 1 && a.cards === 25, 'after a rainbow ×25: the button', a);
    await page.click('#pull-another'); await page.waitForTimeout(100); await skip();
    b = await done();
    check(b.t25 === 0 && b.cards === 25, 'it repeats the ×25 with a rainbow ticket', b);
    await page.click('#pull-close');

    console.log('4. Radiant Ritual');
    // 28 shinies: 25 spare (rarity 1-3), 2 legendaries and the partner (never filled in).
    const pool = await page.evaluate(() => {
      const s = G.DB.save, ds = G.DEX.filter(p => p.rarity <= 3 && !p.leg && p.dex !== 4).slice(0, 25).map(p => p.dex).concat([144, 145, 4]);
      s.shiny = {}; for (const d of ds) { s.owned[d] = s.owned[d] || { at: Date.now() }; s.shiny[d] = { at: Date.now() }; }
      G.DB.commit(); G.UI.hideAll(); G.Flow.goMenu(); G.Radiant.open();
      return ds.length;
    });
    await page.click('#rad-auto');
    await page.click('#rad-go'); await skip();
    a = await done();
    const left1 = await page.evaluate(() => Object.keys(G.DB.save.shiny).length);
    check(a.again && /10 commonest shinies/i.test(a.again) && left1 === pool - 10, `after a sacrifice (${left1} shinies left, 15 spare): the button, naming what it takes`, { a, left1 });
    await page.click('#pull-another'); await page.waitForTimeout(100); await skip();
    b = await done();
    const after = await page.evaluate(() => ({ left: Object.keys(G.DB.save.shiny).length, legKept: !!G.DB.save.shiny[144] && !!G.DB.save.shiny[145], partner: !!G.DB.save.shiny[4] }));
    check(after.left === pool - 20 && after.legKept && after.partner && b.cards === 1, 'it sacrifices the next 10 at once, never the legendaries or the partner', after);
    check(b.again === null, '5 spare left: no button', b);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Open Another checks passed');
  process.exit(failures ? 1 : 0);
})();
