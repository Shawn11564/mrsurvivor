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
//   3. Again, then "End run": the run is just forgotten (you stay on the menu, it never starts, no
//      summary or coins), and nothing is left to resume.
//   4. A run you fell in can't be resumed: reloaded on the summary (a forced update), on the menu
//      (an update) or while fainting, nothing is offered.
//   5. Nor one you quit.
//   6. The Revive card gets you up and the run stays resumable.
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
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { if (G.Game.player !== p || p._mortal) return; p.invuln = 99; p.xpMul = 0; /* no level-up screen: nothing is saved while one is open */ requestAnimationFrame(alive); })(); }));
    // Waits for a save newer than now (none during the start countdown: up to ~8 s after starting).
    const savedNow = () => page.waitForFunction(t => { const r = G.Resume.read(); return r && r.at > t; }, Date.now() + 100, { timeout: 15000 }).then(() => true, () => false);
    // Knocks the player down the way the game does (a hit), Focus Sash and invulnerability aside.
    const kill = () => page.evaluate(() => { const p = G.Game.player; p._mortal = true; p.invuln = 0; p.sashT = performance.now(); p.hurt(p.maxHp * 100, null, true); return p.dead; });
    const offered = async () => { await page.waitForTimeout(800); return !!(await page.$('#resume-box')) || !!(await page.evaluate(() => G.Resume.read())); };
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
    const c0 = await page.evaluate(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs }));
    // Watched from before the click: the run must never start, not even for a frame.
    await page.evaluate(() => { window.__states = []; (function watch() { window.__states.push(G.Game.state); if (window.__states.length < 120) requestAnimationFrame(watch); })(); });
    await page.click('#resume-box [data-e]');
    await page.waitForTimeout(2500);
    const ended = await page.evaluate(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs, states: [...new Set(window.__states)], player: !!G.Game.player,
      menu: G.UI.isOpen('scr-menu'), box: !!document.getElementById('resume-box'), left: !!G.Resume.read() }));
    check(ended.states.join() === 'ui' && ended.menu && !ended.box && !ended.left, 'End run: the menu stays, the run never starts, and the save is gone', ended);
    check(ended.coins === c0.coins && ended.runs === c0.runs, 'and it isn\'t played out (no summary, no end-of-run coins)', { before: c0, after: ended });
    await reload();
    await page.waitForTimeout(800);
    check(!(await page.$('#resume-box')) && !(await page.evaluate(() => G.Resume.read())), 'and there is nothing left to resume');

    // A run that ended (you fell, or quit) is over even if the page reloads straight after: an update
    // reloads on the summary at once (forced) or on the menu (js/core/updater.js), sooner than the 5 s save.
    console.log('4. A run you fell in can\'t be resumed');
    await start(true);
    check(await savedNow(), 'saved before falling');
    check(await kill(), 'down');
    await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 15000 });
    await reload();
    check(!(await offered()), 'reloaded on the summary (a forced update): nothing to resume');

    await page.evaluate(() => G.Flow.goMenu());
    await start(true);
    check(await savedNow(), 'saved before falling');
    await kill();
    await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 15000 });
    await page.click('#btn-again');
    await page.waitForFunction(() => G.Game.state === 'ui', null, { timeout: 15000 });
    await reload();
    check(!(await offered()), 'back to the menu, then reloaded (an update): nothing to resume');

    await page.evaluate(() => G.Flow.goMenu());
    await start(true);
    check(await savedNow(), 'saved before falling');
    await kill();
    check(await page.evaluate(() => G.Game.state !== 'over'), 'still fainting (before the summary)');
    await reload();
    check(!(await offered()), 'reloaded while fainting: nothing to resume');

    console.log('5. A run you quit can\'t be resumed');
    await page.evaluate(() => G.Flow.goMenu());
    await start(true);
    check(await savedNow(), 'saved before quitting');
    await page.evaluate(() => G.Game.quit());
    await reload();
    check(!(await offered()), 'quit, then reloaded: nothing to resume');

    console.log('6. The Revive card keeps the run going, and resumable');
    await page.evaluate(() => G.Flow.goMenu());
    await start(true);
    check(await savedNow(), 'saved');
    await page.evaluate(() => { G.Game.player.selfRevive = 1; });
    await kill();
    const up = await page.evaluate(() => new Promise(r => setTimeout(() => r({ dead: G.Game.player.dead, left: !!G.Resume.read() }), 50)));
    check(!up.dead && up.left,'got back up with the card, and the run is still saved (as it was before the fall)', up);
    check(await savedNow(), 'and it saves again');
    await page.evaluate(() => G.Game.quit());

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll resume checks passed');
  process.exit(failures ? 1 : 0);
})();
