#!/usr/bin/env node
// "End run" in the pause menu after 20:00 (js/fork/end-run.js), in headless Edge, through real clicks:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-end-run.cjs [base-url]
//
//   Solo (dev.html, a guest):
//   1. At 5:00 the pause menu has no End run; at 20:01 it does, and a click ends the run: the end
//      screen says "Run over" (not fallen) and the run's coins are banked.
//   Co-op (three players peer to peer, the Firebase emulator; no real project is touched):
//   2. At 20:01 a guest's pause menu has "Vote to end run"; asking puts the prompt on all three
//      screens (the asker has said yes, 1/3).
//   3. One No: the prompt goes for everyone, the run goes on, everyone is told who said no; asking
//      again straight away is refused (cooldown).
//   4. After the cooldown the host asks and both guests say yes: the run ends for all three, with the
//      team summary and each one's end screen ("Run over"), and the guests are told everyone voted.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);
const TOASTS = () => { window.__toasts = []; const t = G.UI.toast; G.UI.toast = function (s) { window.__toasts.push(String(s)); return t.apply(this, arguments); }; };
const pauseView = p => p.evaluate(() => { const b = document.getElementById('btn-endrun'); return { open: G.UI.isOpen('scr-pause'), btn: !!b && !b.classList.contains('hidden') ? b.textContent : '' }; });
const promptView = p => p.evaluate(() => { const b = document.getElementById('end-vote'); return b && !b.classList.contains('hidden') ? b.textContent.replace(/\s+/g, ' ').trim() : ''; });

async function coopPlayer(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.EndRun, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save; s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' }; G.DB.commit();
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
    return { ok: nick.ok !== false };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  await page.evaluate(TOASTS);
  page.name = name;
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    // ---------------- solo ----------------
    console.log('1. Solo');
    const solo = await (await browser.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
    solo.errs = []; solo.on('pageerror', e => solo.errs.push(String(e)));
    await solo.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await solo.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(solo, '#btn-guest');
    await solo.$eval('#btn-guest', e => e.click());
    await solo.waitForFunction(() => G.DB.save && G.EndRun, null, { timeout: 30000 });
    await solo.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; G.Settings.set('lab', false); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false }); });
    await solo.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    await solo.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.invuln = 1e9; G.Game.debugTime(300); G.Game.togglePause(); });
    const s5 = await pauseView(solo);
    check(s5.open && !s5.btn, 'at 5:00 the pause menu has no End run', s5);
    await solo.evaluate(() => { G.Game.togglePause(); G.Game.debugTime(20 * 60 + 1); });
    await solo.waitForFunction(() => G.Game.state === 'playing' || G.Game.state === 'resuming', null, { timeout: 8000 });
    await solo.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 8000 });
    await solo.evaluate(() => G.Game.togglePause());
    const s20 = await pauseView(solo);
    check(s20.open && s20.btn === 'End run', 'at 20:01 it has End run', s20);
    const coins0 = await solo.evaluate(() => G.DB.save.coins);
    await solo.click('#btn-endrun');
    await solo.waitForSelector('#scr-over', { state: 'visible', timeout: 10000 });
    const over = await solo.evaluate(() => ({ title: document.getElementById('over-title').textContent, state: G.Game.state, coins: G.DB.save.coins }));
    check(/Run over/i.test(over.title) && over.state === 'over' && over.coins > coins0, 'a click ends it: "Run over", the coins banked', { over, coins0 });
    check(!solo.errs.length, 'no page errors (solo)', solo.errs.slice(0, 3));
    await solo.context().close();

    // ---------------- co-op ----------------
    const up = await fetch('http://127.0.0.1:9099/').then(() => true, () => false);
    if (!up) { console.log('  FAIL the Firebase emulators are not running: the co-op part needs them (see the top of this file)'); failures++; return; }
    const host = await coopPlayer(browser, 'erh' + tag, 4), g1 = await coopPlayer(browser, 'era' + tag, 7), g2 = await coopPlayer(browser, 'erb' + tag, 1);
    const ALL = [host, g1, g2];
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    for (const g of [g1, g2]) { const j = await g.evaluate(id => G.Social.joinRoom(id), id); if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j)); }
    for (const p of ALL) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 3 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 40000 });
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
    for (const p of ALL) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.invuln = 1e9; });
    await host.evaluate(() => G.Game.debugTime(20 * 60 + 1));        // the host's clock; the guests follow it
    const synced = await Promise.all([g1, g2].map(p => settle(p, () => G.Game.st.time > 1200, undefined, 8000)));
    check(synced.every(Boolean), 'the guests\' clocks follow the host past 20:00', synced);

    console.log('2. A guest asks');
    await g1.evaluate(() => G.Game.togglePause());
    const gp = await pauseView(g1);
    check(gp.open && gp.btn === 'Vote to end run', 'the guest\'s pause menu has "Vote to end run"', gp);
    await g1.click('#btn-endrun');
    const shown = await Promise.all(ALL.map(p => settle(p, () => { const b = document.getElementById('end-vote'); return b && !b.classList.contains('hidden'); }, undefined, 6000)));
    const views = await Promise.all(ALL.map(promptView));
    check(shown.every(Boolean), 'the prompt is on all three screens', views);
    check(/1\/3 said yes/.test(views[1]) && /You said yes/.test(views[1]) && /Yes, end it/.test(views[0]) && /Yes, end it/.test(views[2]),
      'the asker has said yes (1/3); the others get Yes / No', views);

    console.log('3. One No');
    await g2.click('#end-vote [data-v=no]');
    const gone = await Promise.all(ALL.map(p => settle(p, () => { const b = document.getElementById('end-vote'); return !b || b.classList.contains('hidden'); }, undefined, 6000)));
    const states = await Promise.all(ALL.map(p => p.evaluate(() => G.Game.state)));
    const told = await Promise.all(ALL.map(p => p.evaluate(() => window.__toasts.some(t => /erb\d+ said no/.test(t)))));
    check(gone.every(Boolean) && states.every(s => s !== 'over'), 'the prompt goes for everyone and the run goes on', states);
    check(told.every(Boolean), 'everyone is told who said no', told);
    await g1.evaluate(() => { window.__toasts = []; G.EndRun.ask(); });
    const cool = await settle(g1, () => window.__toasts.some(t => /Wait a little/.test(t)), undefined, 4000);
    check(cool, 'asking again straight away is refused (cooldown)');

    console.log('4. Everyone says yes');
    await host.waitForTimeout(31000);                              // the cooldown
    await host.evaluate(() => { if (!G.UI.isOpen('scr-pause')) G.Game.togglePause(); });
    const hp = await pauseView(host);
    check(hp.btn === 'Vote to end run', 'the host\'s pause menu has it too', hp);
    await host.click('#btn-endrun');
    for (const g of [g1, g2]) { await settle(g, () => !!document.querySelector('#end-vote [data-v=yes]'), undefined, 6000); await g.click('#end-vote [data-v=yes]'); }
    const ended = await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'over', undefined, 10000)));
    check(ended.every(Boolean), 'the run ends for all three', ended);
    const party = await Promise.all(ALL.map(p => p.waitForSelector('#scr-party', { timeout: 15000 }).then(() => true, () => false)));
    check(party.every(Boolean), 'everyone gets the team summary', party);
    for (const p of ALL) await p.click('#scr-party [data-a=next]').catch(() => {});
    const titles = await Promise.all(ALL.map(p => p.waitForSelector('#scr-over', { state: 'visible', timeout: 15000 }).then(() => p.textContent('#over-title'), () => '')));
    check(titles.every(t => /Run over/i.test(t)), 'then each one\'s end screen, "Run over" (nobody fell)', titles);
    const voted = await Promise.all([g1, g2].map(p => p.evaluate(() => window.__toasts.some(t => /Everyone voted to end the run/.test(t)))));
    check(voted.every(Boolean), 'the guests are told everyone voted', voted);
    for (const p of ALL) check(!p.errs.length, 'no page errors (' + p.name + ')', p.errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
    console.log(failures ? `\n${failures} FAILED` : '\nAll End run checks passed');
    process.exit(failures ? 1 : 0);
  }
})();
