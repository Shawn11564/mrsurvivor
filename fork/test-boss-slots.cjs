#!/usr/bin/env node
// Bosses after 15:00 in Lab runs (js/fork/lab/boss-slots.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-boss-slots.cjs [base-url]
//
//   1. A Lab run's bosses: upstream's five, then 18, 21, 24, 27 minutes and every 3 minutes from 33:00;
//      the extra ones picked by rollRun (non-legendary, none twice, BST 580+) with the numbers of
//      upstream's table continued at its trend (×1.35 HP, ×1.2 damage, as rollRun does).
//   2. The 18:00 boss really spawns at 18:00 (the real spawner), with bossScale(t) on top: HP and damage.
//   3. Endless: with Eternatus beaten, the 33:00 boss spawns; at 60:00 the spawner still has one
//      (made later, with the 60:00 slot's numbers, and js/fork/lab/boss-power.js's ×1.2^15 past 30:00).
//   4. A resumed run (G.Resume, the real save and resume) at 21:05 gets only the 21:00 boss, not
//      every boss since 3:00 at once.
//   5. A normal run keeps upstream's five: nothing at 18:00.
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
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      // A run that starts at `t` (as js/fork/lab/resume.js does: startRun, then the clock), god mode.
      window.__run = async (lab, t, won) => {
        if (G.Game.state === 'playing') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        if (won) G.Game.player._labEternatus = true;
        if (t) G.Game.debugTime(t);
        await __wait(() => G.Game.state === 'playing');
        G.Game.player.god = true;
      };
      // Bosses from the slots that are alive (not the wild legendaries, not the rift's).
      window.__bosses = () => G.EnemyMgr.all().filter(e => e.boss && !e.wildLegend && !e.legend && !e.dead);
    });

    console.log('1. The slots of a Lab run');
    const slots = await page.evaluate(async () => {
      await __run(true, 0);
      await new Promise(r => setTimeout(r, 400));
      const B = G.Enemies.BOSSES, L = G.LabBossSlots, ok = new Set(G.DEX.filter(p => !p.leg && p.bst >= 580).map(p => p.dex));
      const extra = B.filter(b => b.labSlot);
      return { at: B.map(b => b.at), up: B.filter(b => !b.labSlot).length, dexes: B.map(b => b.dex),
        extraOk: extra.every(b => ok.has(b.dex)),
        numbersOk: extra.every(b => { const n = L.defNumbers(L.slotAt(b.at)); return b.hp === n.hp && b.dmg === n.dmg && b.xp === n.xp && b.shotDmg === n.shotDmg; }),
        n18: L.defNumbers(L.slotAt(1080)), n27: L.defNumbers(L.slotAt(1620)), up15: B[4] && { hp: B[4].hp, dmg: B[4].dmg, xp: B[4].xp } };
    });
    const want = [180, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1980];
    check(slots.up === 5 && want.every((t, i) => slots.at[i] === t) && slots.at.slice(9).every((t, i) => t === 1980 + i * 180),
      'upstream\'s five, then 18, 21, 24, 27 minutes and every 3 minutes from 33:00', slots.at);
    check(new Set(slots.dexes).size === slots.dexes.length && slots.extraOk, 'the extra bosses: non-legendary, BST 580+, none twice in the run', slots.dexes);
    check(slots.numbersOk && slots.n18.hp > slots.up15.hp && slots.n27.hp > slots.n18.hp && slots.n18.xp > slots.up15.xp,
      'their numbers continue upstream\'s table (×1.35 HP, ×1.2 damage, as rollRun does)', { up15: slots.up15, at18: slots.n18, at27: slots.n27 });

    console.log('2. The 18:00 boss spawns');
    const s18 = await page.evaluate(async () => {
      await __run(true, 1076);
      await __wait(() => __bosses().length, 10000);
      const B = G.Enemies.BOSSES, b = B.find(x => x.at === 1080), e = __bosses()[0], sc = G.Enemies.bossScale(1080);
      return e && { n: __bosses().length, t: G.Game.st.time, dex: e.dex, want: b.dex, hp: e.maxHp, wantHp: Math.round(b.hp * sc.hp), dmg: +e.dmg.toFixed(1), wantDmg: +(b.dmg * sc.dmg).toFixed(1) };
    });
    check(s18 && s18.dex === s18.want && s18.t >= 1080 && s18.n === 1, 'at 18:00 the 18:00 boss spawns (alone: the run started at 17:56)', s18);
    check(s18 && Math.abs(s18.hp - s18.wantHp) <= 0.01 * s18.wantHp && Math.abs(s18.dmg - s18.wantDmg) <= 0.5, 'with bossScale(18:00) on its HP and damage', s18);

    console.log('3. Endless');
    const s33 = await page.evaluate(async () => {
      await __run(true, 1978, true);
      await __wait(() => __bosses().length, 10000);
      const e = __bosses()[0], b = G.Enemies.BOSSES.find(x => x.at === 1980);
      return { raid: !!(G.Eternatus && G.Eternatus.active), dex: e && e.dex, want: b && b.dex, t: G.Game.st.time };
    });
    check(!s33.raid && s33.dex && s33.dex === s33.want, 'Eternatus beaten: the 33:00 boss spawns', s33);
    const s60 = await page.evaluate(async () => {
      await __run(true, 3598, true);
      await __wait(() => __bosses().length, 10000);
      const e = __bosses()[0], b = G.Enemies.BOSSES.find(x => x.at === 3600), n = b && G.LabBossSlots.defNumbers(G.LabBossSlots.slotAt(3600));
      return { dex: e && e.dex, b: b && { dex: b.dex, hp: b.hp, dmg: b.dmg, xp: b.xp }, n, hp: e && e.maxHp, wantHp: b && Math.round(b.hp * G.Enemies.bossScale(3600).hp * (G.LabPower ? G.LabPower.hpK(3600) : 1)), count: G.Enemies.BOSSES.length };
    });
    check(s60.b && s60.dex === s60.b.dex && s60.b.hp === s60.n.hp && s60.b.dmg === s60.n.dmg && Math.abs(s60.hp - s60.wantHp) <= 0.01 * s60.wantHp,
      'at 60:00 a boss still comes, with the 60:00 slot\'s numbers', s60);

    console.log('4. A resumed run');
    const res = await page.evaluate(async () => {
      await __run(true, 0);
      G.Game.debugTime(1265);
      G.Resume.save();
      const saved = G.Resume.read();
      G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui');
      localStorage.setItem(G.Resume.KEY, JSON.stringify(saved));     // the summary forgot it, as a real end of run does
      const ok = G.Resume.resume();
      await __wait(() => G.Game.state === 'playing');
      G.Game.player.god = true;
      await new Promise(r => setTimeout(r, 1500));
      const b21 = G.Enemies.BOSSES.find(x => x.at === 1260);
      return { ok, saved: saved && saved.time, t: G.Game.st.time, bosses: __bosses().map(e => e.dex), want: b21 && b21.dex };
    });
    check(res.ok && res.bosses.length === 1 && res.bosses[0] === res.want, 'resumed at 21:05: only the 21:00 boss, not every boss since 3:00', res);

    console.log('5. A normal run');
    const normal = await page.evaluate(async () => {
      await __run(false, 1076);
      await new Promise(r => setTimeout(r, 2500));
      const B = G.Enemies.BOSSES;
      return { n: B.length, extra: B.filter(b => b.labSlot).length, alive: __bosses().map(e => e.dex), up: B.map(b => b.dex), t: G.Game.st.time };
    });
    check(normal.n === 5 && !normal.extra && normal.alive.every(d => normal.up.includes(d)), 'upstream\'s five only, no boss of the Lab slots', normal);
    await page.evaluate(async () => { G.Game.quit(); });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll boss slot checks passed');
  process.exit(failures ? 1 : 0);
})();
