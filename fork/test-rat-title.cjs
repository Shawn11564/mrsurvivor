#!/usr/bin/env node
// The "Rat" title (js/fork/rat-title.js): reach 15:00 in a run as Rattata. Headless Edge on dev.html.
//
//   node fork/serve.cjs                  (or python -m http.server 8123, in the repo root)
//   node fork/test-rat-title.cjs [base-url]
//
// The run's clock is set with G.Game.resumeAt (it then runs in real time, as a resumed run does)
// and the game's own loop and the title's own once-a-second check do the rest. Checks:
//   1. Rattata at 14:57: nothing yet; once the clock passes 15:00, the achievement and the "Rat"
//      title are yours, mid-run, with its pop-up.
//   2. The title is in the profile's title picker (Goals → Profile), shown as "Rat".
//   3. Mew past 15:00 and Rattata at 10:00 don't get it (fresh save).
//   4. The built js/app.min.js has it.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

/** A run as `dex` with the clock at `t` seconds; enemies off, kept alive; waits `ms` of real time. */
async function runAt(page, dex, t, ms) {
  return page.evaluate(async ([dex, t, ms]) => {
    const s = G.DB.save, until = async (f, w = 20000) => { const e = performance.now() + w; while (!f() && performance.now() < e) await new Promise(r => setTimeout(r, 40)); };
    s.owned[dex] = s.owned[dex] || { at: 1 };
    s.partner = dex;
    if (G.Game.player && G.Game.state !== 'ui') {
      G.Game.quit();
      await until(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await until(() => G.Game.state === 'ui');
    }
    G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
    await until(() => G.Game.state === 'playing' && G.Game.player);
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) if (G[k]) G[k].update = () => {};
    G.LevelUp.offer = () => [];
    G.EnemyMgr.clear();
    (function loop() { const p = G.Game.player; if (p) { p.invuln = 99; p.hp = p.maxHp; } requestAnimationFrame(loop); })();
    G.Game.resumeAt(t);
    const before = !!(s.ach && s.ach.rat);
    let pop = '';
    const end = performance.now() + ms;
    while (performance.now() < end) {
      await new Promise(r => setTimeout(r, 100));
      const el = document.getElementById('ach-pop');
      if (el && !el.classList.contains('hidden') && /Rat\b/.test(el.textContent)) pop = el.textContent;
    }
    return { dex: G.Game.player.dex, clock: G.Game.st.time, state: G.Game.state, before, got: !!(s.ach && s.ach.rat),
             titles: G.Progress.titles(), pop };
  }, [dex, t, ms]);
}

async function fresh(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, locale: 'en-US' });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Progress && G.AchDefs, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });

  // ---------------- 1-2. Rattata ----------------
  console.log('Rattata reaching 15:00');
  const page = await fresh(browser);
  const early = await runAt(page, 19, 15 * 60 - 3, 1500);
  check(early.dex === 19 && early.clock < 900 && !early.got, `at ${early.clock.toFixed(1)} s: not yet (${early.got ? 'already has it' : 'no title'})`);
  const r = await page.evaluate(async () => {
    const until = async (f, w) => { const e = performance.now() + w; while (!f() && performance.now() < e) await new Promise(r => setTimeout(r, 50)); };
    let pop = '';
    const end = performance.now() + 6000;
    while (performance.now() < end && !(G.DB.save.ach && G.DB.save.ach.rat && pop)) {
      await new Promise(r => setTimeout(r, 50));
      const el = document.getElementById('ach-pop');
      if (el && !el.classList.contains('hidden') && /Rat\b/.test(el.textContent)) pop = el.textContent;
    }
    return { clock: G.Game.st.time, state: G.Game.state, got: !!(G.DB.save.ach && G.DB.save.ach.rat), titles: G.Progress.titles(), pop };
  });
  check(r.got && r.titles.includes('Rat'), `past 15:00 (${r.clock.toFixed(1)} s): the achievement and the "Rat" title (titles: ${r.titles.join(', ') || 'none'})`);
  check(r.state === 'playing', `granted mid-run (game state: ${r.state})`);
  check(!!r.pop, `its pop-up shows ("${r.pop}")`);

  const picker = await page.evaluate(async () => {
    G.Game.quit();
    const until = async (f, w = 15000) => { const e = performance.now() + w; while (!f() && performance.now() < e) await new Promise(r => setTimeout(r, 40)); };
    await until(() => G.UI.isOpen('scr-over'));
    document.getElementById('btn-again').click();
    await until(() => G.Game.state === 'ui');
    G.UI.hideAll(); G.Flow.goMenu();
    G.GoalsUI.open('profile');
    await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll('select.field option')].map(o => o.textContent.trim());
  });
  check(picker.includes('Rat'), `the profile's title picker offers "Rat" (${picker.join(' | ')})`);
  check(page.errors.length === 0, 'no page errors' + (page.errors.length ? ': ' + page.errors.slice(0, 3).join(' | ') : ''));
  await page.close();

  // ---------------- 3. not for others ----------------
  console.log('Not for another Pokémon, not before 15:00');
  const p2 = await fresh(browser);
  const mew = await runAt(p2, 151, 15 * 60 + 5, 2500);
  check(mew.dex === 151 && mew.clock > 900 && !mew.got, `Mew at ${mew.clock.toFixed(1)} s: no title`);
  const ten = await runAt(p2, 19, 10 * 60, 2500);
  check(ten.dex === 19 && !ten.got, `Rattata at ${ten.clock.toFixed(1)} s: no title`);
  check(p2.errors.length === 0, 'no page errors' + (p2.errors.length ? ': ' + p2.errors.slice(0, 3).join(' | ') : ''));
  await browser.close();

  // ---------------- 4. the build ----------------
  const min = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.min.js'), 'utf8');
  // (It's obfuscated: texts come out with \x20 for spaces; the keys stay.)
  check(min.includes("'ratRun'") && min.includes("'title':'Rat'"), 'the built js/app.min.js has the title');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
