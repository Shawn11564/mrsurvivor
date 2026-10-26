#!/usr/bin/env node
// The "Rat" title (js/fork/rat-title.js): beat the Eternatus raid (js/fork/lab/eternatus.js) as Rattata.
// Headless Edge on dev.html.
//
//   node fork/serve.cjs                  (or python -m http.server 8123, in the repo root)
//   node fork/test-rat-title.cjs [base-url]
//
// A run with the clock set to 30:00 (G.Game.debugTime); the raid starts by itself, and the check breaks the
// obelisks and knocks Eternatus out, so the raid's own win (and its call into the title) does the rest. Checks:
//   1. Rattata: no title at the raid's start; once Eternatus falls, the achievement and the "Rat" title, with
//      its pop-up, mid-run.
//   2. The title is in the profile's title picker (Goals → Profile), shown as "Rat".
//   3. Not any more for reaching 15:00 as Rattata, and not for beating Eternatus as Charmander (fresh save).
//   4. The built js/app.min.js has it.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

/** A run as `dex` (Lab or not), kept alive with no waves, clock at `t` seconds. */
async function runAs(page, dex, lab, t) {
  await page.evaluate(([dex, lab]) => {
    const s = G.DB.save;
    s.owned[dex] = s.owned[dex] || { at: Date.now() };
    s.partner = dex;
    G.Settings.set('underdogLadder', false);
    G.Settings.set('lab', lab);
    if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
    G.UI.hideAll(); G.Game.toUI();
    G.Game.startRun(null, { dex, shiny: false });
  }, [dex, lab]);
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
  await page.evaluate(t => {
    G.Spawner.update = () => {}; G.LevelUp.offer = () => [];
    const p = G.Game.player; p.god = true; p.xpMul = 0; G.EnemyMgr.clear();
    G.Game.debugTime(t);
  }, t);
}

/** Waits for the raid, breaks its obelisks and knocks Eternatus out; the title's state after. */
async function beatEternatus(page) {
  const on = await page.waitForFunction(() => G.Eternatus.active && G.Eternatus.raid.phase === 'fight' && G.EnemyMgr.get(G.Eternatus.raid.bossId),
    null, { timeout: 8000 }).then(() => true, () => false);
  const before = await page.evaluate(() => !!(G.DB.save.ach && G.DB.save.ach.rat));
  if (!on) return { on, before };
  return page.evaluate(async before => {
    for (const e of G.EnemyMgr.all()) if (e.obelisk) e.hurt(1e9);
    const b = G.EnemyMgr.get(G.Eternatus.raid.bossId); b.hp = 1; b.hurt(1e9);
    let pop = '';
    const end = performance.now() + 4000;
    while (performance.now() < end && !(G.DB.save.ach && G.DB.save.ach.rat && pop)) {
      await new Promise(r => setTimeout(r, 50));
      const el = document.getElementById('ach-pop');
      if (el && !el.classList.contains('hidden') && /Rat\b/.test(el.textContent)) pop = el.textContent;
    }
    return { on: true, before, phase: G.Eternatus.raid && G.Eternatus.raid.phase, state: G.Game.state, dex: G.Game.player.dex,
             got: !!(G.DB.save.ach && G.DB.save.ach.rat), titles: G.Progress.titles(), pop };
  }, before);
}

async function fresh(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, locale: 'en-US' });
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* none */ } });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Progress && G.AchDefs && G.Eternatus && G.RatTitle, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
  await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });

  // ---------------- 1-2. Rattata beats Eternatus ----------------
  console.log('Rattata beating Eternatus');
  const page = await fresh(browser);
  await runAs(page, 19, true, 1800);
  const r = await beatEternatus(page);
  check(r.on && !r.before, `the raid starts at 30:00 and the title isn't yours yet (raid: ${r.on}, had it: ${r.before})`);
  check(r.got && r.titles.includes('Rat'), `Eternatus beaten as Rattata: the achievement and the "Rat" title (titles: ${(r.titles || []).join(', ') || 'none'})`);
  check(r.phase === 'won' && r.state === 'playing', `granted mid-run, on the raid's own win (raid: ${r.phase}, game: ${r.state})`);
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

  // ---------------- 3. not otherwise ----------------
  console.log('Not for 15:00 as Rattata, not for another Pokémon');
  const p2 = await fresh(browser);
  await runAs(p2, 19, false, 15 * 60 + 5);
  await p2.waitForTimeout(2500);
  const old = await p2.evaluate(() => ({ clock: G.Game.st.time, dex: G.Game.player.dex, got: !!(G.DB.save.ach && G.DB.save.ach.rat) }));
  check(old.dex === 19 && old.clock > 900 && !old.got, `Rattata at ${old.clock.toFixed(1)} s: no title (the old way doesn't give it)`);
  await runAs(p2, 4, true, 1800);
  const ch = await beatEternatus(p2);
  check(ch.on && ch.phase === 'won' && ch.dex === 4 && !ch.got, `Charmander beating Eternatus: no title (raid: ${ch.phase}, got: ${ch.got})`);
  check(p2.errors.length === 0, 'no page errors' + (p2.errors.length ? ': ' + p2.errors.slice(0, 3).join(' | ') : ''));
  await browser.close();

  // ---------------- 4. the build ----------------
  const min = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.min.js'), 'utf8');
  // (It's obfuscated: texts come out with \x20 for spaces; the keys stay.)
  check(min.includes("'ratBeat'") && min.includes("'title':'Rat'") && !min.includes("'ratRun'"), 'the built js/app.min.js has the new title');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
