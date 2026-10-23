#!/usr/bin/env node
// Late-hand decisions in Lab runs (js/fork/lab/late-hand.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-late-hand.cjs [base-url]
//
//   1. Carrera past its cap (8 taken) keeps coming in Lab, up to 4 more, saying it costs 4% max HP;
//      taking it gives the speed and takes the HP. Reflejos the same past 10.
//   2. With an Epic roll (js/fork/card-rarity.js) it is painted Epic, gives ×2 and still costs the HP.
//   3. A normal run: never past the cap.
//   4. Endless (Eternatus beaten): every hand has a "+1 EV" card; taking it gives its bonus. Not before.
//   5. The real level-up screen shows "Auto-pick EV cards"; ticking it takes the open hand's EV card
//      at once (the screen closes); then a real level-up in endless takes the EV card with no menu, and
//      the run keeps going. Co-op: fork/test-ev-auto-coop.cjs.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
      G.Settings.set('underdogLadder', false); G.Settings.set('labEvAuto', false);
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      window.__run = async (lab, won) => {
        if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        await __wait(() => G.Game.state === 'playing');
        const pl = G.Game.player; pl.god = true; pl.xpMul = 0; G.Spawner.update = () => {};
        if (won) pl._labEternatus = true;
        // Moves full, so hands are mostly upgrade cards.
        return pl;
      };
      // n offers: the cards with key k.
      window.__find = (pl, k, n = 400) => { const out = []; for (let i = 0; i < n; i++) for (const c of G.LevelUp.offer(pl)) if (c.key === k) out.push(c); return out; };
    });

    console.log('1-2. Past the cap');
    const late = await page.evaluate(async () => {
      const pl = await __run(true), R = G.CardRarity;
      const out = {};
      for (const [id, max] of [['spd', 8], ['cd', 10]]) {
        pl.statsTaken[id] = max;
        const roll = R.roll; R.roll = m => roll(m); // the real roll (Common most of the time)
        const cards = __find(pl, 'stat:' + id);
        R.roll = roll;
        const c = cards.find(x => !x.rarity);
        const sp = pl.spdMul, cd = pl.cdMul, hp = pl.maxHp;
        if (c) c.apply(pl);
        out[id] = { n: cards.length, late: cards.every(x => x.late), text: c && G.T(c.desc), en: c && /Costs 4% of your max HP/.test(c.desc),
          spd: +(pl.spdMul / sp).toFixed(4), cd: +(pl.cdMul / cd).toFixed(4), hp: [hp, pl.maxHp], paid: pl.maxHp === Math.round(hp * 0.96), taken: pl.statsTaken[id] };
        pl.statsTaken[id] = max + 4;
        out[id].atEnd = __find(pl, 'stat:' + id, 200).length;
      }
      // Epic: ×2, painted, and the HP still paid.
      pl.statsTaken.spd = 8;
      const roll = R.roll; R.roll = () => R.TIERS[3];
      const e = __find(pl, 'stat:spd', 300)[0];
      R.roll = roll;
      const sp = pl.spdMul, hp = pl.maxHp;
      e.apply(pl);
      out.epic = { rarity: e.rarity, tag: e.tag, spd: +(pl.spdMul / sp).toFixed(4), hp: [hp, pl.maxHp], paid: pl.maxHp === Math.round(hp * 0.96), taken: pl.statsTaken.spd, cost: /Costs 4%/.test(e.desc) };
      return out;
    });
    check(late.spd.n > 10 && late.spd.late && late.spd.en && late.spd.spd === 1.07 && late.spd.paid && late.spd.taken === 9,
      'Carrera past 8: offered, says the cost, +7% speed for −4% max HP', late.spd);
    check(late.cd.n > 10 && late.cd.late && late.cd.cd === 0.92 && late.cd.paid && late.cd.taken === 11, 'Reflejos past 10: the same', late.cd);
    check(late.spd.atEnd === 0 && late.cd.atEnd === 0, 'never past cap + 4', { spd: late.spd.atEnd, cd: late.cd.atEnd });
    check(late.epic.rarity === 4 && late.epic.spd === 1.14 && late.epic.paid && late.epic.taken === 10 && late.epic.cost, 'an Epic one: painted Epic, ×2, still −4% max HP', late.epic);

    console.log('3. A normal run');
    const normal = await page.evaluate(async () => { const pl = await __run(false); pl.statsTaken.spd = 8; pl.statsTaken.cd = 10; return __find(pl, 'stat:spd').length + __find(pl, 'stat:cd').length; });
    check(normal === 0, 'never past the cap', normal);

    console.log('4. EV cards in endless');
    const ev = await page.evaluate(async () => {
      let pl = await __run(true);
      let before = 0;
      for (let i = 0; i < 50; i++) if (G.LevelUp.offer(pl).some(c => c.type === 'ev')) before++;
      pl = await __run(true, true);
      let every = 0, kinds = new Set();
      for (let i = 0; i < 100; i++) { const h = G.LevelUp.offer(pl), c = h.find(c => c.type === 'ev'); if (c && h.length === 3) { every++; kinds.add(c.ev); } }
      const h = G.LevelUp.offer(pl), c = h.find(c => c.type === 'ev');
      const atk = pl.atkMul;
      const atkCard = G.LabLateHand.evCard('atk');
      atkCard.apply(pl);
      return { before, every, kinds: [...kinds], atk: +(pl.atkMul / atk).toFixed(4), count: pl._labEV && pl._labEV.atk, title: c && c.title };
    });
    check(ev.before === 0 && ev.every === 100 && ev.kinds.length === 5, 'every endless hand has one +1 EV card (none before Eternatus falls)', ev);
    check(ev.atk === 1.02 && ev.count === 1, 'EV Attack: +2% damage, counted', ev);

    console.log('5. Auto-pick');
    const ui = await page.evaluate(async () => {
      const pl = G.Game.player;
      G.Game.debugLevelUp();
      await __wait(() => G.UI.isOpen('scr-levelup'), 5000);
      const row = document.getElementById('lab-ev-auto'), box = row && row.querySelector('input');
      const shown = !!row && !row.classList.contains('hidden') && [...document.querySelectorAll('#cards .card')].some(el => /\+1 EV/.test(el.textContent));
      const evs = () => Object.values(pl._labEV || {}).reduce((a, b) => a + b, 0), before = evs();
      box.click();
      const set = G.Settings.get('labEvAuto');
      // Ticking takes this hand's EV card (once the screen's 1 s guard against stray clicks is over).
      await __wait(() => G.Game.state === 'playing', 5000);
      const tick = { took: evs() - before, open: G.UI.isOpen('scr-levelup') };
      const n0 = evs(), lvl = pl.level;
      for (let i = 0; i < 3; i++) G.Game.debugLevelUp();
      await new Promise(r => setTimeout(r, 600));
      const n1 = Object.values(pl._labEV || {}).reduce((a, b) => a + b, 0);
      return { shown, set, tick, n0, n1, open: G.UI.isOpen('scr-levelup'), state: G.Game.state, levels: pl.level - lvl };
    });
    check(ui.shown && ui.set === true, 'the level-up screen shows "Auto-pick EV cards" with an EV card; ticking it sets it', ui);
    check(ui.tick.took === 1 && !ui.tick.open, 'ticking it takes the open hand\'s EV card and closes the screen', ui.tick);
    check(ui.n1 - ui.n0 === 3 && !ui.open && ui.state === 'playing', 'ticked: three level-ups in endless take three EV cards with no menu', ui);
    const off = await page.evaluate(async () => {
      G.Settings.set('labEvAuto', true);
      const pl = await __run(true, false);          // Lab, not endless: the menu still comes
      G.Game.debugLevelUp();
      const open = await __wait(() => G.UI.isOpen('scr-levelup'), 4000);
      G.Settings.set('labEvAuto', false);
      return { open, row: !!document.getElementById('lab-ev-auto') && !document.getElementById('lab-ev-auto').classList.contains('hidden') };
    });
    check(off.open && !off.row, 'before Eternatus falls the menu still comes, without the toggle', off);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll late-hand checks passed');
  process.exit(failures ? 1 : 0);
})();
