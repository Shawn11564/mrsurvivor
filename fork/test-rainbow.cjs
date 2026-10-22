#!/usr/bin/env node
// The rainbow ×25 ticket (js/fork/rainbow.js; t25 in js/core/db.js and js/systems/gacha.js), in
// headless Edge on dev.html, as a guest (saved in the browser):
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-rainbow.cjs [base-url] [screenshot.png]
//
//   1. 200 rainbow pulls of 25: every one has a Legendary; without a ticket it can't be paid.
//   2. The gacha screen: the "Rainbow ×25" button (on with a ticket, off without), the count and
//      the note; a real pull through the button: 25 Pokémon, a Legendary among them, the ticket spent.
//   3. Where they come from: a rift legendary (1 in 10, forced here), 30:00 in a run (once), and the
//      4 big achievements (paid once on saving, also to whoever already had them; shown in rewards).
//   4. It stays: after a reload, and in the currency ledger; save.r25 is joined when two copies merge.
//   5. The ticket count at the top of the menu shows the rainbow tickets too.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOT = process.argv[3];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Rainbow, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[1] = { at: Date.now(), from: 'starter' }; s.partner = 1; s.starter = 1; G.DB.commit(); G.Flow.goMenu(); });

    console.log('1. A Legendary in every ×25');
    const sim = await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(G.DB.save));
      s.tickets = { t1: 0, t10: 0, t25: 200 }; s.pity = {};
      let all = true, n = 0;
      for (let i = 0; i < 200; i++) { const r = G.Gacha.pull(s, 25, 1, 't25'); n += r.length; if (!r.some(x => x.rarity === 5)) all = false; }
      const none = JSON.parse(JSON.stringify(G.DB.save)); none.tickets = { t1: 99, t10: 9, t25: 0 };
      return { all, n, left: s.tickets.t25, unpaid: G.Gacha.pull(none, 25, 1, 't25') === null && G.Gacha.costOf(none, 25, 't1') === null };
    });
    check(sim.all && sim.n === 5000 && sim.left === 0, '200 pulls of 25 (5000 Pokémon), each with a Legendary, 200 tickets spent', sim);
    check(sim.unpaid, 'without a rainbow ticket a ×25 can\'t be paid (not with normal tickets either)', sim.unpaid);

    console.log('2. The gacha screen');
    const ui = async () => page.evaluate(() => {
      const b = document.getElementById('pull-25');
      return b && { text: b.textContent.trim(), off: b.disabled, line: document.getElementById('gacha-tickets').textContent.replace(/\s+/g, ' '),
        note: /rainbow pull/.test(document.getElementById('gacha-rates').textContent) };
    });
    await page.evaluate(() => { G.DB.save.tickets.t25 = 0; G.GachaUI.open(); });
    const off = await ui();
    check(off && /Rainbow ×25/.test(off.text) && off.off && off.note, 'no ticket: "Rainbow ×25" is there but off, and the note explains it', off);
    await page.evaluate(() => { G.DB.save.tickets.t25 = 1; G.DB.save.pity = { 1: 0 }; G.GachaUI.open(); });
    const on = await ui();
    check(on && !on.off && /1 ×25 rainbow tickets/.test(on.line), 'one ticket: on, and the count says 1', on);
    if (SHOT) { await page.waitForTimeout(800); await page.locator('#scr-gacha').screenshot({ path: SHOT }); }
    await page.click('#pull-25');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const s = document.getElementById('pull-skip'); if (s && !s.classList.contains('hidden')) s.click(); });
    await page.waitForFunction(() => !document.getElementById('pull-close').classList.contains('hidden'), null, { timeout: 30000 });
    const res = await page.evaluate(() => ({ cards: document.querySelectorAll('#pull-results .pcard').length, leg: document.querySelectorAll('#pull-results .pcard.r5').length, t25: G.DB.save.tickets.t25 }));
    check(res.cards === 25 && res.leg >= 1 && res.t25 === 0, 'a real pull through the button: 25 Pokémon, a Legendary, the ticket spent', res);
    await page.click('#pull-close');
    check((await ui()).off, 'and the button is off again');

    console.log('3. Where they come from');
    const src = await page.evaluate(() => {
      const s = G.DB.save, r = Math.random, t = () => s.tickets.t25 | 0, out = {};
      s.tickets.t25 = 0;
      Math.random = () => 0.05; G.Progress.event('rift', { type: 'fire' }); out.rift = t();
      Math.random = () => 0.5; G.Progress.event('rift', { type: 'fire' }); out.riftMiss = t();
      Math.random = r;
      s.ach = s.ach || {}; delete (s.r25 || {}).own500;
      s.ach.own500 = Date.now(); G.DB.commit(); out.ach = t();
      G.DB.commit(); out.achAgain = t();
      out.paid = !!(s.r25 && s.r25.own500);
      out.reward = G.Progress.rewardText(G.AchDefs.LIST.find(a => a.id === 'ownAll').reward);
      return out;
    });
    check(src.rift === 1 && src.riftMiss === 1, 'a rift legendary: one when the 1-in-10 roll hits, none when it misses', src);
    check(src.ach === 2 && src.achAgain === 2 && src.paid, '500 Pokémon (an achievement you already had): paid once on saving', src);
    check(/ 2 ×25/.test(src.reward), 'the all-Pokémon achievement lists its rainbow tickets', src.reward);
    await page.evaluate(() => G.Game.startRun(null, { dex: 1, shiny: false }));
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    const run = await page.evaluate(async () => {
      const s = G.DB.save, pl = G.Game.player; G.Spawner.update = () => {};
      (function alive() { pl.invuln = 99; pl.hp = pl.maxHp; requestAnimationFrame(alive); })();
      s.r25 = { own500: 1, ownAll: 1, shiny20: 1, time20: 1 };   // the achievements' ones (20 minutes!) are paid already
      const t0 = s.tickets.t25 | 0;
      G.Game.debugTime(1790); await new Promise(r => setTimeout(r, 1300));
      const before = (s.tickets.t25 | 0) - t0;
      G.Game.debugTime(1801); await new Promise(r => setTimeout(r, 1300));
      const at = (s.tickets.t25 | 0) - t0;
      G.Game.debugTime(2400); await new Promise(r => setTimeout(r, 1300));
      return { before, at, later: (s.tickets.t25 | 0) - t0 };
    });
    check(run.before === 0 && run.at === 1 && run.later === 1, '30:00 in a run gives one, once', run);
    await page.evaluate(() => { G.Game.quit(); });

    console.log('4. It stays');
    // (A guest's save has no ledger: that's for accounts, checked with G.DB.merge below.)
    const n = await page.evaluate(() => { G.DB.commit(); return { t25: G.DB.save.tickets.t25 }; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.guest, null, { timeout: 30000 });
    const after = await page.evaluate(() => G.DB.save.tickets.t25);
    check(n.t25 > 0 && after === n.t25, 'after a reload the guest still has them', { before: n.t25, after });
    const led = await page.evaluate(() => {
      // Two devices each earned one since the last sync: the merge keeps both (t25 is in the ledger, CUR).
      const base = () => Object.assign(JSON.parse(JSON.stringify(G.DB.save)), { tickets: { t1: 0, t10: 0, t25: 1 } });
      const a = base(), b = base();
      a.led = { dA: { t25: [1, 0] } }; b.led = { dB: { t25: [1, 0] } }; a.updated = 1; b.updated = 2;
      const r = G.DB.merge(a, b);
      return r && r.tickets && r.tickets.t25;
    });
    check(led === 2, 'two devices that each earned one merge to 2 (the currency ledger counts t25)', led);
    const mg = await page.evaluate(() => { const r = {}; G.forkMerge(r, { r25: { own500: 1 } }, { r25: { time20: 2 } }); return Object.keys(r.r25).sort().join(); });
    check(mg === 'own500,time20', 'two copies merge their paid achievements', mg);

    console.log('5. The menu\'s ticket count');
    // (The rainbow count goes in right after ui.js redraws the pill: a microtask, before the screen is painted.)
    const pill = await page.evaluate(async () => {
      const tick = () => new Promise(r => setTimeout(r, 0));
      const s = G.DB.save; s.tickets.t1 = 4; s.tickets.t10 = 2; s.tickets.t25 = 3; G.UI.refreshCoins(); await tick();
      const el = document.getElementById('tickets-pill'), a = { text: el.textContent.replace(/\s+/g, ' ').trim(), icon: [...el.querySelectorAll('.t25 img')].some(i => i.getAttribute('src') === G.Icons.url('ticket25')) };
      s.tickets.t25 = 0; G.UI.refreshCoins(); await tick();
      return { with: a, without: el.textContent.replace(/\s+/g, ' ').trim() };
    });
    check(pill.with.text === '4 2 3' && pill.with.icon, 'the pill at the top shows ×1, ×10 and rainbow ×25 tickets (with its icon)', pill.with);
    check(pill.without === '4 2 0', 'and the rainbow count shows at 0 too', pill.without);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll rainbow ticket checks passed');
  process.exit(failures ? 1 : 0);
})();
