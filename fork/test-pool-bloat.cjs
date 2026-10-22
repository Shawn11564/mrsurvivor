#!/usr/bin/env node
// Pool bloat after TMs (js/fork/pool-bloat.js, plan G7), in headless Edge on dev.html, as a guest:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-pool-bloat.cjs [base-url]
//
//   1. Veto has 5 levels: with 5 bought, the real Upgrades picker takes 5 moves, they survive a reload
//      (js/core/db.js used to cut the list at 3), and a run bans all 5 (none of them on 300 hands).
//   2. TM cards early: with 3 TMs taught, while the Pokémon has 1 move a hand shows TM moves well under
//      half as often as once it has 2 (each TM move enters the draw 40 % of the time); the same in a Lab run.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const DEX = 4;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.MenuUI, null, { timeout: 30000 });
    await page.evaluate(dex => {
      const s = G.DB.save; s.owned[dex] = { at: Date.now() }; s.partner = dex; s.starter = dex; s.coins = 1e6;
      s.pupg = s.pupg || {}; s.pupg[dex] = { ban: 5 }; s.pban = {}; G.DB.commit(); G.Settings.set('lab', false); G.Flow.goMenu();
    }, DEX);

    console.log('1. Veto: 5');
    await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); });
    await page.waitForTimeout(400);
    await page.click('[data-go="upgrades"]');
    await page.waitForSelector('[data-ban]', { timeout: 8000 });
    const label = await page.textContent('[data-ban]');
    await page.click('[data-ban]');
    await page.waitForSelector('.ban-picker [data-id]', { timeout: 8000 });
    const ids = await page.$$eval('.ban-picker [data-id]', l => l.map(b => b.dataset.id));
    for (const id of ids.slice(0, 6)) { await page.click(`.ban-picker [data-id="${id}"]`); await page.waitForTimeout(150); }
    const picked = await page.evaluate(dex => G.DB.save.pban[dex].slice(), DEX);
    check(/\/5\)/.test(label) && picked.length === 5 && picked.every(id => ids.slice(0, 5).includes(id)), 'the Upgrades picker takes 5 vetoes (a 6th is refused)', { label, picked });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.guest && G.MenuUI, null, { timeout: 30000 });
    const kept = await page.evaluate(dex => (G.DB.save.pban[dex] || []).slice(), DEX);
    check(kept.length === 5, 'all 5 survive a reload', kept);
    const run = await page.evaluate(async () => {
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      const t0 = Date.now(); while (!(G.Game.state === 'playing' && G.Game.player) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 30));
      const pl = G.Game.player, seen = new Set();
      for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new') seen.add(c.key.slice(4));
      const r = { banned: [...pl.banned], offeredBanned: [...pl.banned].filter(id => seen.has(id)) };
      G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu();
      return r;
    });
    check(run.banned.length === 5 && kept.every(id => run.banned.includes(id)) && !run.offeredBanned.length, 'a run bans all 5, and none shows on 300 hands', run);

    console.log('2. TM cards while it has 1 move');
    const rate = lab => page.evaluate(async ([dex, lab]) => {
      const s = G.DB.save;
      s.pban = {};
      // 3 TMs Charmander learns only by TM (not in its list either way).
      const own = new Set(G.Moves.poolFor(G.DEX_BY[dex], true).concat(G.Lab.poolFor(G.DEX_BY[dex], true)));
      s.ptm = { [dex]: G.TM_OF(dex).filter(id => G.Moves.BY_ID[id] && !own.has(id)).slice(0, 3) }; G.DB.commit();
      G.Settings.set('lab', lab);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      const t0 = Date.now(); while (!(G.Game.state === 'playing' && G.Game.player) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 30));
      const pl = G.Game.player, tms = s.ptm[dex], N = 3000;
      const count = () => { let n = 0; for (let i = 0; i < N; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new' && tms.includes(c.key.slice(4))) n++; return n / N; };
      const one = { slots: pl.slots.length, r: count() };
      // A second move of its own (not a TM).
      const extra = G.Moves.poolFor(pl.mon, true).find(id => !pl.hasMove(id) && G.Moves.BY_ID[id].kind !== 'buff');
      pl.addMove(extra);
      const two = { slots: pl.slots.length, r: count() };
      const r = { lab: G.Lab.active, tms, one, two, k: +(one.r / two.r).toFixed(2) };
      G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu(); G.Settings.set('lab', false);
      return r;
    }, [DEX, lab]);
    const n = await rate(false);
    check(n.tms.length === 3 && n.one.slots === 1 && n.two.slots === 2 && n.two.r > 0.1, 'a normal run offers the TMs once it has 2 moves', n);
    check(n.k < 0.65, `with 1 move, TM cards come x${n.k} as often as with 2 (about 0.4-0.5)`, n);
    const l = await rate(true);
    check(l.lab && l.two.r > 0.1 && l.k < 0.65, `the same in a Lab run (x${l.k})`, l);

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll pool bloat checks passed');
  process.exit(failures ? 1 : 0);
})();
