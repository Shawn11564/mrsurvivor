#!/usr/bin/env node
// Per-Pokémon contracts (js/fork/lab/contracts.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-contracts.cjs [base-url]
//
//   1. Missions shows a "Contracts" block for the partner (Charmander) only with the Lab on.
//   2. Real Lab runs: 3 special moves at 20:00 completes "side20"; 3 Fire moves at 15:00 completes
//      "mono15", also with a Normal move beside them (until 2026-10-23 every move had to be Fire), and
//      2 Fire moves don't; a normal run completes nothing. Progress: 3 Fire moves at 10:00 leave the
//      bar at 67 % ("Best: 10:00 of 15:00"), and the pause menu says where each contract stands.
//   3. A real rift won without switching completes "rift"; a switch during the fight doesn't.
//   4. Claim in Missions: 1500 contract coins and 1 candy for Charmander. Upgrades with no coins of your own:
//      a banner over the list shows your coins and Charmander's contract coins apart, the buy button says
//      the contract coins pay it all, works, and your coins stay at 0.
//   5. G.DB.merge of two copies (both orders): every contract's done/claimed and the larger cspent kept.
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
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.contracts = {}; s.cspent = {}; G.DB.commit();
      G.Settings.set('underdogLadder', false);
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      window.__toMenu = async () => {
        if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.UI.hideAll(); G.Flow.goMenu();
      };
      window.__run = async (lab, moves = []) => {
        await __toMenu();
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        await __wait(() => G.Game.state === 'playing');
        const pl = G.Game.player; pl.god = true; pl.xpMul = 0; G.Spawner.update = () => {};
        pl.moves.slice().forEach(m => { const i = pl.slots.findIndex(g => g.includes(m)); if (i >= 0) pl.slots.splice(i, 1); pl.moves.splice(pl.moves.indexOf(m), 1); });
        pl.active = 0;
        for (const id of moves) pl.addMove(id);
        return pl;
      };
      const ok = m => m.kind !== 'buff' && m.cat && !m.lab;
      window.__special = G.Moves.ALL.filter(m => ok(m) && m.cat === 'special' && m.type !== 'fire').slice(0, 3).map(m => m.id);
      window.__fire = G.Moves.ALL.filter(m => ok(m) && m.type === 'fire').slice(0, 3).map(m => m.id);
      window.__st = id => { const c = G.DB.save.contracts && G.DB.save.contracts[4]; return c && c[id] ? !!c[id].done : false; };
    });

    console.log('1. Missions');
    const ui = await page.evaluate(async () => {
      G.Settings.set('lab', false);
      G.GoalsUI.open('missions');
      await new Promise(r => setTimeout(r, 200));
      const off = !!document.getElementById('lab-contracts');
      G.UI.hideAll(); G.Flow.goMenu();
      G.Settings.set('lab', true);
      G.GoalsUI.open('missions');
      await new Promise(r => setTimeout(r, 200));
      const el = document.getElementById('lab-contracts');
      return { off, on: !!el, rows: el ? [...el.querySelectorAll('[data-contract] b')].map(b => b.textContent) : [], head: el && el.querySelector('h3').textContent };
    });
    check(!ui.off && ui.on && ui.rows.length === 3 && /Charmander/.test(ui.head) && ui.rows[0] === 'Reach 20:00 with 3 special moves', 'a Contracts block for Charmander with the Lab on, none with it off', ui);

    console.log('2. Runs');
    const runs = await page.evaluate(async () => {
      const out = {};
      let pl = await __run(false, __special);
      G.Game.debugTime(1205); await new Promise(r => setTimeout(r, 1600));
      out.normal = __st('side20');
      pl = await __run(true, __special);
      G.Game.debugTime(1195); await new Promise(r => setTimeout(r, 1400));
      out.before = __st('side20');
      G.Game.debugTime(1201); await __wait(() => __st('side20'), 3000);
      out.side20 = __st('side20'); out.mono15early = __st('mono15');
      pl = await __run(true, __fire);
      out.fireMoves = pl.moves.map(m => m.type + ':' + m.cat);
      G.Game.debugTime(901); await __wait(() => __st('mono15'), 3000);
      out.mono15 = __st('mono15');
      // Again from scratch: 2 Fire moves + Tackle at 15:00 (not enough), then 3 Fire + Tackle at 10:00 (progress),
      // then at 15:00 (done).
      G.DB.save.contracts[4].mono15 = { prog: 0, done: false, claimed: false };
      pl = await __run(true, [__fire[0], __fire[1], 'tackle']);
      G.Game.debugTime(905); await new Promise(r => setTimeout(r, 1600));
      out.two = __st('mono15');
      pl = await __run(true, [__fire[0], __fire[1], __fire[2], 'tackle']);
      G.Game.debugTime(600); await new Promise(r => setTimeout(r, 1600));
      out.prog = +G.DB.save.contracts[4].mono15.prog.toFixed(2);
      G.Game.togglePause();
      out.pause = (document.querySelector('#pause-sum .lab-pause') || {}).textContent || '';
      G.Game.togglePause();
      await __toMenu();
      G.GoalsUI.open('missions');
      await new Promise(r => setTimeout(r, 200));
      const row = document.querySelector('#lab-contracts [data-contract=mono15]');
      out.bar = row.querySelector('.bar i').style.width; out.how = row.querySelector('.cc-how').textContent; out.text = row.querySelector('b').textContent;
      pl = await __run(true, [__fire[0], __fire[1], __fire[2], 'tackle']);
      G.Game.debugTime(901); await __wait(() => __st('mono15'), 3000);
      out.withTackle = __st('mono15');
      return out;
    });
    check(!runs.normal && !runs.before && runs.side20, 'side20: done at 20:00 with 3 special moves in a Lab run (not at 19:55, not in a normal run)', runs);
    check(!runs.mono15early && runs.mono15, 'mono15: done at 15:00 with only Fire moves', runs);
    check(!runs.two && runs.withTackle, 'mono15: 2 Fire moves aren\'t enough; 3 Fire moves with Tackle beside them are', runs);
    check(runs.prog === 0.67 && runs.bar === '67%' && /Best: 10:0\d of 15:00/.test(runs.how) && runs.text === 'Reach 15:00 with 3 Fire moves',
      'progress: 3 Fire moves at 10:00 leave the bar at 67 %, "Best: 10:00 of 15:00"', runs);
    check(/Contracts/.test(runs.pause) && /3 Fire moves: 3\/3 moves ✓, 10:0\d of 15:00/.test(runs.pause), 'the pause menu says where each contract stands', runs.pause);

    console.log('3. Rift without switching');
    const rift = await page.evaluate(async () => {
      const fight = async (lab, sw) => {
        const pl = await __run(lab, [__fire[0], __fire[1]]);
        G.Rift.debugArena();
        await __wait(() => G.Rift.inArena && G.EnemyMgr.all().some(e => e.legend), 8000);
        await new Promise(r => setTimeout(r, 300));
        if (sw) pl.setActive(pl.active === 0 ? 1 : 0);
        G.EnemyMgr.all().find(e => e.legend).hurt(1e12);
        await new Promise(r => setTimeout(r, 800));
        return __st('rift');
      };
      const normal = await fight(false, false);
      const switched = await fight(true, true);
      const clean = await fight(true, false);
      return { normal, switched, clean };
    });
    check(!rift.normal && !rift.switched && rift.clean, 'rift: done after a fight won without switching (not with a switch, not in a normal run)', rift);

    console.log('4. Claim and spend');
    const spend = await page.evaluate(async () => {
      await __toMenu();
      G.GoalsUI.open('missions');
      await new Promise(r => setTimeout(r, 200));
      const btn = document.querySelector('#lab-contracts [data-contract=side20] button');
      const candy0 = G.LabGrowth.candies(4);
      btn.click();
      const candy = G.LabGrowth.candies(4) - candy0;
      await new Promise(r => setTimeout(r, 200));
      const bal = G.LabContracts.balance(4), sub = document.querySelector('#lab-contracts .sub').textContent;
      const s = G.DB.save; s.coins = 0; s.pupg = s.pupg || {}; s.pupg[4] = {}; G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu();
      document.querySelector('#scr-menu [data-go=upgrades]').click();
      await new Promise(r => setTimeout(r, 300));
      const line = document.getElementById('lab-ccoins'), b = document.querySelector('#upg-list .upg-item [data-buy]');
      const price = G.Upgrades.cost(G.Upgrades.LIST[0].id, 0), enabled = !b.disabled;
      const lineText = line && line.textContent.replace(/\s+/g, ' ').trim(), outside = !!line && !document.getElementById('upg-list').contains(line), use = (b.querySelector('.cc-use') || {}).textContent || '';
      b.click();
      await new Promise(r => setTimeout(r, 300));
      return { bal, sub, candy, outside, use, line: lineText, lineAfter: line && line.textContent.replace(/\s+/g, ' ').trim(), enabled, price, lvl: G.DB.upgradesOf(4)[G.Upgrades.LIST[0].id] || 0,
        coins: s.coins, spent: s.cspent[4], left: G.LabContracts.balance(4), again: !!document.getElementById('lab-ccoins') };
    });
    check(spend.bal === 1500 && /1500 unspent/.test(spend.sub) && spend.candy === 1, 'Claim: 1500 contract coins and 1 candy for Charmander', spend);
    check(spend.outside && /Your coins: 0/.test(spend.line) && /Charmander's contract coins: 1500/.test(spend.line) && spend.use === 'contract',
      'Upgrades: a banner over the list, your coins and the contract coins apart; the button says contract coins pay it all', spend);
    check(spend.line && /1500/.test(spend.line) && spend.enabled && spend.lvl === 1 && spend.coins === 0 && spend.spent === spend.price && spend.left === 1500 - spend.price && spend.again,
      'Upgrades: bought with contract coins, your own coins untouched', spend);

    console.log('5. Merge');
    const mg = await page.evaluate(() => {
      const base = () => JSON.parse(JSON.stringify(G.DB.save));
      const a = Object.assign(base(), { contracts: { 4: { side20: { prog: 1, done: true, claimed: true } } }, cspent: { 4: 300 }, updated: 1 });
      const b = Object.assign(base(), { contracts: { 4: { rift: { prog: 1, done: true, claimed: false } }, 7: { mono15: { prog: 1, done: true } } }, cspent: { 4: 100 }, updated: 2 });
      const r = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
      const sum = x => ({ side: !!(x.contracts[4].side20 && x.contracts[4].side20.claimed), rift: !!(x.contracts[4].rift && x.contracts[4].rift.done), sq: !!(x.contracts[7] && x.contracts[7].mono15.done), spent: x.cspent[4], bal: G.LabContracts.balance(4, x) });
      return { r: sum(r), r2: sum(r2) };
    });
    check(mg.r.side && mg.r.rift && mg.r.sq && mg.r.spent === 300 && mg.r.bal === 1200 && JSON.stringify(mg.r) === JSON.stringify(mg.r2), 'both copies\' contracts kept, the larger cspent, either order', mg);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll contract checks passed');
  process.exit(failures ? 1 : 0);
})();
