#!/usr/bin/env node
// The starting move (Upgrades → Starting move) in normal and Lab runs (js/fork/lab/start-move.js),
// in headless Edge on dev.html, as a guest, picking through the real picker:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-start-move.cjs [base-url]
//
//   1. Lab off: the picker lists the normal moves (no Lab-only ones); the pick starts a normal run.
//   2. Lab on: the picker lists the Lab list (Scorbunny's Pyro Ball); the pick starts a Lab run.
//      This was the bug: a Lab run checked the pick against the Lab list and dropped it.
//   3. The two picks are separate: each run gets its own, and both survive a reload.
//   4. A normal pick that the Lab list doesn't have: the Lab run starts with the default, not with it.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const DEX = 813;                                     // Scorbunny: Ember by default, Pyro Ball in the Lab

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
      s.pupg = s.pupg || {}; s.pupg[dex] = { start: 1 }; G.DB.commit(); G.Flow.goMenu();
    }, DEX);

    // Opens Upgrades → Starting move and returns the picker's moves.
    const openPicker = async lab => {
      await page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.Flow.goMenu(); }, lab);
      await page.waitForTimeout(400);
      await page.click('[data-go="upgrades"]');
      await page.waitForSelector('[data-start]', { timeout: 8000 });
      if (!(await page.$('.ban-picker [data-id]'))) await page.click('[data-start]');    // it toggles, and stays open
      await page.waitForSelector('.ban-picker [data-id]', { timeout: 8000 });
      return page.$$eval('.ban-picker [data-id]', l => l.map(b => b.dataset.id));
    };
    const pick = async id => { await page.click(`.ban-picker [data-id="${id}"]`); await page.waitForTimeout(300); };
    const run = async lab => {
      const first = await page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 813, shiny: false });
        return { first: G.Game.player.moves[0].id, lab: !!G.Lab.active }; }, lab);
      await page.evaluate(() => G.Game.quit());
      await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); });
      return first;
    };

    console.log('1. Lab off');
    const normal = await openPicker(false);
    check(normal.includes('flamethrower') && !normal.includes('pyro-ball'), 'the picker lists the normal moves and not Pyro Ball', normal);
    await pick('flamethrower');
    const r1 = await run(false);
    check(r1.first === 'flamethrower' && !r1.lab, 'a normal run starts with the pick', r1);

    console.log('2. Lab on');
    const lab = await openPicker(true);
    check(lab.includes('pyro-ball'), 'the picker lists the Lab moves (Pyro Ball)', lab);
    await pick('pyro-ball');
    const label = await page.textContent('[data-start]');
    check(/Pyro Ball/.test(label), 'the button shows the Lab pick', label);
    const r2 = await run(true);
    check(r2.first === 'pyro-ball' && r2.lab, 'a Lab run starts with the pick', r2);

    console.log('3. Separate, and kept');
    const r3 = await run(false);
    check(r3.first === 'flamethrower', 'the normal run still has its own pick', r3);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.guest && G.MenuUI, null, { timeout: 30000 });
    const kept = await page.evaluate(dex => ({ n: G.DB.save.pstart[dex], l: (G.DB.save.pstartLab || {})[dex] }), DEX);
    check(kept.n === 'flamethrower' && kept.l === 'pyro-ball', 'both picks survive a reload', kept);
    const r4 = await run(true), r5 = await run(false);
    check(r4.first === 'pyro-ball' && r5.first === 'flamethrower', 'and each run still starts with its own', { lab: r4, normal: r5 });

    console.log('4. No Lab pick: the normal one if the Lab list has it, else the default');
    const set = (n, l) => page.evaluate(([dex, n, l]) => { const s = G.DB.save; s.pstart[dex] = n; if (l) s.pstartLab[dex] = l; else delete s.pstartLab[dex]; G.DB.commit(); }, [DEX, n, l]);
    await set('heat-wave', null);
    const r6 = await run(true);
    check(r6.first === 'heat-wave', 'normal pick Heat Wave (in the Lab list too): the Lab run starts with it', r6);
    await set('hyper-beam', null);                    // not in Scorbunny's Lab list: it used to be dropped silently
    const r7 = await run(true), r8 = await run(false);
    check(r7.first === 'ember' && r8.first === 'hyper-beam', 'normal pick Hyper Beam (not in the Lab list): Lab run Ember, normal run Hyper Beam', { lab: r7, normal: r8 });
    await set('hyper-beam', 'hyper-beam');            // a Lab pick the Lab list doesn't have (it changed): the default
    const r9 = await run(true);
    check(r9.first === 'ember', 'a Lab pick no longer in the Lab list: the default', r9);
    await set('flamethrower', 'ember');               // the default picked in the Lab picker beats the normal pick
    const r10 = await run(true);
    check(r10.first === 'ember', 'picking the default for Lab runs sticks (the normal pick doesn\'t come back)', r10);

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll starting move checks passed');
  process.exit(failures ? 1 : 0);
})();
