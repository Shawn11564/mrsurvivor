#!/usr/bin/env node
// Missions in Lab runs (js/fork/lab/lab.js missions()), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-lab-missions.cjs [base-url]
//
// The same run is played with Lab off and then with Lab on, from the same missions: 20 enemies
// defeated (5 of them of one type, T: the run's first enemy's; the cast is drawn per run), a boss, then falling at minute 9 and level 16. Checks:
//   1. The Lab run moves the missions exactly as the normal run does (kills, T kills, boss,
//      the end-of-run ones: level and minutes survived).
//   2. A mission finished in a Lab run shows the "Mission complete" popup, in English.
//   3. The Lab run still doesn't touch achievements or save.stats.
//   4. The progress is saved: it's still there after a reload, and the reward can be claimed.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Lab && G.Progress, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });

    /** Today's missions set by hand (same day and week, so ensure() keeps them). */
    // Two real enemies: one of type T, one without it.
    const PICK = `(() => {
      const types = d => (G.DEX_BY[d.dex] && G.DEX_BY[d.dex].types) || ['normal'];
      const all = G.Enemies.cast.flatMap(c => c.list), typed = all[0], T = types(typed)[0];
      return { T, typed, other: all.find(d => !types(d).includes(T)) };
    })()`;
    const setMissions = () => page.evaluate(() => {
      const s = G.DB.save, M = s.missions;
      G.Progress.ensure(s);
      const m = (id, goal, param = null) => ({ id, goal, param, prog: 0, claimed: false, told: false });
      M.daily = [m('kill', 300), m('killType', 30, 'normal'), m('level', 8)];
      M.weekly = [m('wboss', 4), m('wsurvive', 12)];
      G.DB.commit();
    });
    const missions = () => page.evaluate(() => [...G.DB.save.missions.daily, ...G.DB.save.missions.weekly].map(m => `${m.id}:${m.prog}/${m.goal}${m.told ? ' told' : ''}`));
    /** One run: the kills, a boss, then falling at minute 9, level 16; back to the menu. */
    async function play(lab) {
      await page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.Flow.goMenu(); }, lab);
      await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
      const r = await page.evaluate(async PICK => {
        G.Spawner.update = () => {};
        const pl = G.Game.player; pl.invuln = 99;
        window.__pops = [];
        const pop = () => { const el = document.getElementById('ach-pop'); if (el && !el.classList.contains('hidden')) window.__pops.push(el.textContent); };
        window.__popT = setInterval(pop, 50);
        const { T, typed, other } = eval(PICK);
        G.DB.save.missions.daily.find(m => m.id === 'killType').param = T;   // T kills: T is this run's
        const down = async (def, boss) => {
          const e = new G.Enemy(def, pl.x + 220, pl.y, G.Enemies.scale(0), boss); G.EnemyMgr.add(e);
          e.hurt(1e12, '#fff', 1, 0, 0);
          await new Promise(r => requestAnimationFrame(r));
          return e.dead;
        };
        let n = 0;
        for (let i = 0; i < 20; i++) if (await down(i < 5 ? typed : other, false)) n++;
        const boss = await down(other, true);
        G.Game.debugTime(9 * 60 + 5); pl.level = 16;
        return { lab: G.Lab.active, n, boss, ach: JSON.stringify(G.DB.save.ach || {}), stats: JSON.stringify(G.DB.save.stats) };
      }, PICK);
      await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e12); });
      await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      r.pops = await page.evaluate(() => { clearInterval(window.__popT); return [...new Set(window.__pops)]; });
      return r;
    }

    console.log('1. Normal run, then Lab run, from the same missions');
    await setMissions();
    const normal = await play(false);
    const afterNormal = await missions();
    await setMissions();
    const before = await page.evaluate(() => ({ ach: JSON.stringify(G.DB.save.ach || {}), stats: JSON.stringify(G.DB.save.stats) }));
    const lab = await play(true);
    const afterLab = await missions();
    check(!normal.lab && lab.lab && normal.n === 20 && lab.n === 20 && normal.boss && lab.boss, 'both runs played (the second one is a Lab run)', { normal: normal.n, lab: lab.n });
    check(JSON.stringify(afterLab) === JSON.stringify(afterNormal), 'the Lab run moves the missions exactly as the normal run', { afterNormal, afterLab });
    check(afterLab.includes('kill:21/300') && afterLab.includes('killType:5/30') && afterLab.includes('level:16/8 told')
      && afterLab.includes('wboss:1/4') && afterLab.includes('wsurvive:9/12'), 'kills, type-T kills, the boss, level and minutes all count', afterLab);

    console.log('2. The popup');
    check(lab.pops.some(t => /Mission complete: Reach level 8/.test(t) && /Claim your reward in Missions/.test(t)), 'the Lab run shows "Mission complete: Reach level 8" in English', lab.pops);

    console.log('3. Achievements and stats');
    const after = await page.evaluate(() => ({ ach: JSON.stringify(G.DB.save.ach || {}), stats: JSON.stringify(G.DB.save.stats) }));
    check(after.ach === before.ach, 'the Lab run unlocks no achievements');
    check(after.stats === before.stats, 'the Lab run leaves save.stats as it was');

    console.log('4. Saved');
    await page.evaluate(() => G.DB.commit(true));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.Progress, null, { timeout: 30000 }).catch(async () => {
      await pastStart(page, '#btn-guest'); await page.$eval('#btn-guest', e => e.click());
      await page.waitForFunction(() => G.DB.save && G.Progress, null, { timeout: 30000 });
    });
    check(JSON.stringify(await missions()) === JSON.stringify(afterLab), 'the progress is still there after a reload');
    const claim = await page.evaluate(() => { const s = G.DB.save, c0 = s.coins, m = s.missions.daily.find(x => x.id === 'level'); return { ok: G.Progress.claim(m), more: s.coins > c0 }; });
    check(claim.ok && claim.more, 'and its reward can be claimed', claim);

    check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll Lab mission checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
