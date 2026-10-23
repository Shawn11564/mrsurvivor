#!/usr/bin/env node
// "Auto-pick EV cards" in co-op (js/fork/lab/late-hand.js): two real players in headless Edge, peer
// to peer, against the Firebase emulator (no real project is touched), as in fork/test-lab-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-ev-auto-coop.cjs [base-url]
//
// A Lab run with Eternatus beaten (endless) for both; the guest has auto-pick on, the host off.
//   1. A shared level-up: the guest's cards never open, its EV card is taken (once), and a banner
//      says so and that it's waiting for the host; the host's cards open with the guest marked done
//      (only the host left to pick).
//   2. The host picks: everyone goes on, the guest's banner goes, nothing was taken twice.
//   3. Both on: a level-up opens no cards for anyone, each takes one EV card, the run goes on.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Lab, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    G.DB.commit();
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    G.Settings.set('underdogLadder', false);
    return { ok: nick.ok !== false };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  return page;
}

const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

(async () => {
  const up = await fetch('http://127.0.0.1:9099/').then(() => true, () => false);
  if (!up) { console.error('test-ev-auto-coop: the Firebase emulators are not running (see the top of this file)'); process.exit(1); }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'evh' + tag, 4), guest = await player(browser, 'evg' + tag, 7);
    const ALL = [host, guest];
    await host.evaluate(() => { G.Settings.set('lab', true); G.Settings.set('labEvAuto', false); });
    await guest.evaluate(() => { G.Settings.set('labEvAuto', true); });
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
    for (const p of ALL) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active && G.Lab.active, null, { timeout: 20000 })));
    // Endless for both (what Eternatus's win sets on every computer), no enemies, nobody falls.
    for (const p of ALL) await p.evaluate(() => { const pl = G.Game.player; pl._labEternatus = 1; pl.invuln = 1e9; pl.xpMul = 0; G.Spawner.update = () => {}; });
    const evs = p => p.evaluate(() => Object.values(G.Game.player._labEV || {}).reduce((a, b) => a + b, 0));
    const view = p => p.evaluate(() => {
      const w = document.getElementById('lab-ev-wait');
      return { state: G.Game.state, cards: G.UI.isOpen('scr-levelup'), banner: w && !w.classList.contains('hidden') ? w.textContent : '',
               wait: document.getElementById('lvl-wait').textContent };
    });

    console.log('1. A shared level-up, the guest on auto');
    const g0 = await evs(guest), h0 = await evs(host);
    await host.evaluate(() => G.Game.debugLevelUp());
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'levelup', null, { timeout: 8000 })));
    await settle(host, () => /evg/.test(document.getElementById('lvl-wait').textContent) === false && G.UI.isOpen('scr-levelup'), undefined, 4000);
    await host.waitForTimeout(800);
    const gv = await view(guest), hv = await view(host);
    check(!gv.cards && gv.state === 'levelup', 'the guest\'s cards never open (the run waits)', gv);
    check(await evs(guest) - g0 === 1, 'the guest took its EV card, once');
    check(/Auto-picked EV: /.test(gv.banner) && /Waiting for evh/.test(gv.banner), 'its banner says which, and that it waits for the host', gv.banner);
    check(hv.cards && !/evg/.test(hv.wait), 'the host\'s cards are open, the guest already done', hv);

    console.log('2. The host picks');
    await host.waitForTimeout(700);
    await host.evaluate(() => { const c = [...document.querySelectorAll('#cards .card')].find(el => !/\+1 EV/.test(el.textContent)) || document.querySelector('#cards .card'); c.click(); });
    const going = await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'playing' || G.Game.state === 'resuming', undefined, 8000)));
    const gv2 = await view(guest);
    check(going.every(Boolean), 'everyone goes on', going);
    check(!gv2.banner && !gv2.cards, 'the guest\'s banner is gone', gv2);
    check(await evs(guest) - g0 === 1 && await evs(host) - h0 === 0, 'nothing taken twice (the host took a normal card)');

    console.log('3. Both on auto');
    await host.evaluate(() => G.Settings.set('labEvAuto', true));
    await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'playing', undefined, 8000)));
    const g1 = await evs(guest), h1 = await evs(host);
    let opened = false;
    for (const p of ALL) await p.evaluate(() => { window.__open = false; const s = G.UI.show; G.UI.show = function (id) { if (id === 'scr-levelup') window.__open = true; return s.apply(this, arguments); }; });
    await host.evaluate(() => G.Game.debugLevelUp());
    const back = await Promise.all(ALL.map(p => settle(p, () => G.Game.player.level > 0 && (G.Game.state === 'playing' || G.Game.state === 'resuming') && !(document.getElementById('lab-ev-wait') && !document.getElementById('lab-ev-wait').classList.contains('hidden')), undefined, 8000)));
    for (const p of ALL) opened = opened || await p.evaluate(() => window.__open);
    check(!opened, 'nobody\'s cards open');
    check(await evs(guest) - g1 === 1 && await evs(host) - h1 === 1, 'each takes one EV card', { guest: await evs(guest) - g1, host: await evs(host) - h1 });
    check(back.every(Boolean), 'the run goes on for both', back);

    for (const p of ALL) check(!p.errs.length, 'no page errors', p.errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll co-op EV auto-pick checks passed');
  process.exit(failures ? 1 : 0);
})();
