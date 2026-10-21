#!/usr/bin/env node
// Resuming a Lab run after a reload (js/fork/lab/resume.js), in headless Edge on dev.html, as a guest
// (whose save survives a reload):
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-resume.cjs [base-url]
//
//   1. A normal run saves nothing to resume.
//   2. A solo Lab run, played a while (level, moves levelled and evolved, a card, time, position):
//      reloading the page offers "Unfinished Lab run" with the Pokémon, time and level; Resume puts
//      it all back (and the same map), and the offer is gone.
//   3. Again, then "End run": the run ends at once with its rewards (coins for the time), and
//      nothing is left to resume.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

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
    await page.waitForFunction(() => G.DB.save && G.Resume, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
    const start = lab => page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { if (G.Game.player !== p) return; p.invuln = 99; p.xpMul = 0; /* no level-up screen: nothing is saved while one is open */ requestAnimationFrame(alive); })(); }));
    const reload = async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.guest && G.Resume, null, { timeout: 30000 });
      await page.evaluate(() => { if (G.Game.state === 'ui') { G.Flow.goMenu(); } });
    };

    console.log('1. A normal run');
    await start(false);
    await page.waitForTimeout(5600);
    check(!(await page.evaluate(() => G.Resume.read())), 'nothing saved to resume');
    await page.evaluate(() => G.Game.quit());

    console.log('2. A Lab run, reloaded');
    await start(true);
    const before = await page.evaluate(() => {
      const pl = G.Game.player;
      pl.level = 9; pl.xp = 7; pl.kills = 123; pl.coins = 45; pl.x += 300; pl.y -= 120;
      pl.addMove('flamethrower'); const m = pl.moves.find(x => x.id === 'flamethrower'); G.Moves.levelUp(m); G.Moves.levelUp(m);
      const e = pl.moves[0]; while (G.Moves.levelUp(e)) {} G.Moves.evolve(e);
      pl.atkMul *= 1.2; pl.statsTaken.atk = 2;
      G.Game.debugTime(400);
      return { level: pl.level, kills: pl.kills, coins: pl.coins, x: Math.round(pl.x), y: Math.round(pl.y), atkMul: +pl.atkMul.toFixed(3), cards: pl.statsTaken.atk,
        moves: pl.moves.map(m => [m.id, m.lvl, !!m.evolved]), kind: (() => { let h = ''; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) h += G.World.kindAt(Math.round(pl.x / 32) + i * 17, Math.round(pl.y / 32) + j * 17)[0]; return h; })() };
    });
    // Saved every 5 s, but not during the start countdown: up to ~8 s after starting.
    await page.waitForFunction(t => { const r = G.Resume.read(); return r && r.at > t; }, Date.now() + 100, { timeout: 15000 }).catch(() => {});
    const saved = await page.evaluate(() => G.Resume.read());
    check(!!saved, 'a solo Lab run is saved every few seconds');
    // What was saved (the run kept going: a coin picked up in those seconds counts)
    before.coins = saved && saved.p.coins; before.kills = saved && saved.p.kills;
    await reload();
    await page.waitForSelector('#resume-box', { timeout: 8000 });
    const box = await page.textContent('#resume-box');
    check(/Unfinished Lab run/.test(box) && /Charmander/.test(box) && /level 9/.test(box) && /6:4\d|6:5\d/.test(box), 'after reloading: the offer, with the Pokémon, time and level', box.replace(/\s+/g, ' '));
    await page.click('#resume-box [data-r]');
    // At 6:45 enemies hit hard: protect the resumed run as soon as it exists (not once it's "playing").
    await page.waitForFunction(() => G.Game.player && G.Game.state !== 'ui', null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); const p = G.Game.player; (function alive() { if (G.Game.player !== p) return; p.invuln = 99; p.xpMul = 0; requestAnimationFrame(alive); })(); });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    const after = await page.evaluate(() => {
      const pl = G.Game.player;
      return { level: pl.level, kills: pl.kills, coins: pl.coins, x: Math.round(pl.x), y: Math.round(pl.y), atkMul: +pl.atkMul.toFixed(3), cards: pl.statsTaken.atk,
        moves: pl.moves.map(m => [m.id, m.lvl, !!m.evolved]), time: G.Game.st.time, lab: G.Lab.active, kind: (() => { let h = ''; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) h += G.World.kindAt(Math.round(pl.x / 32) + i * 17, Math.round(pl.y / 32) + j * 17)[0]; return h; })(), left: !!G.Resume.read() };
    });
    check(after.level === 9 && after.kills === before.kills && after.coins === before.coins && Math.abs(after.x - before.x) < 40 && Math.abs(after.y - before.y) < 40 && after.atkMul === before.atkMul && after.cards === 2,
      'Resume: level, kills, coins, position, damage and cards are back', { before, after });
    check(JSON.stringify(after.moves) === JSON.stringify(before.moves), 'the moves, their levels and the evolution are back', after.moves);
    check(after.time >= 400 && after.lab && after.kind === before.kind && !after.left, 'the clock (≥ 6:40), Lab, the same map, and the offer is gone', after);

    console.log('3. End run');
    const saved2 = await page.waitForFunction(t => { const r = G.Resume.read(); return r && r.at > t; }, Date.now() + 100, { timeout: 15000 }).then(() => true, () => false);
    if (!saved2) console.log('  (not saved: ' + JSON.stringify(await page.evaluate(() => ({ state: G.Game.state, lab: G.Lab.active, arena: G.Rift.inArena,
      judge: !!(G.Judgment && G.Judgment.active), dead: G.Game.player && G.Game.player.dead, coop: G.Coop.active, ui: [...document.querySelectorAll('section.scr:not(.hidden)')].map(x => x.id) }))) + ')');
    await reload();
    await page.waitForSelector('#resume-box', { timeout: 8000 });
    const c0 = await page.evaluate(() => G.DB.save.coins);
    await page.click('#resume-box [data-e]');
    const over = await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 15000 }).then(() => true, () => false);
    const c1 = await page.evaluate(() => G.DB.save.coins);
    check(over && c1 - c0 >= 80, 'End run: the run ends with its rewards (coins for 6+ minutes)', { gained: c1 - c0 });
    await reload();
    await page.waitForTimeout(800);
    check(!(await page.$('#resume-box')) && !(await page.evaluate(() => G.Resume.read())), 'and there is nothing left to resume');
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll resume checks passed');
  process.exit(failures ? 1 : 0);
})();
