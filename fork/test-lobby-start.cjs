#!/usr/bin/env node
// The lobby's Ready Up countdown never sits at 0 (js/ui/social-ui.js LobbyUI). Real players in
// headless Edge on the Firebase emulator, connected peer to peer as in the game:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-lobby-start.cjs [base-url]
//
// Each player used to count down on their own clock as soon as they saw everyone ready, but only
// the host starts the run. So a guest reached "starting in 0" and stayed there whenever the host
// wasn't counting: the host was still connecting to someone (or couldn't: direct-only co-op), or
// had gone to the menu while marked ready. Now the host runs the countdown and tells the guests;
// a guest at 0 asks the host to start (a message wakes a host whose background tab's timers are
// throttled); leaving the lobby screen clears your ready. Checks:
//   1. A guest who can't connect (their WebRTC may only use relay servers, and co-op has none: what a
//      network that blocks direct UDP does) and everyone ready: no
//      one shows a countdown, the guests say they're waiting for the host to connect, nobody at 0.
//   2. The host goes to the menu while ready: their ready is cleared, so no countdown anywhere.
//   3. Everyone ready: the run starts for everyone 2.5-6 s later, the guests' countdown in step
//      with the host's; back in the lobby after the run, it starts again.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (info === undefined ? '' : ' ' + JSON.stringify(info))); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function player(browser, name, dex, cut) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  // Relay only, and no relay server: real WebRTC that never finds a route.
  if (cut) await ctx.addInitScript(() => { const R = window.RTCPeerConnection;
    window.RTCPeerConnection = function (cfg) { return new R(Object.assign({}, cfg, { iceTransportPolicy: 'relay', iceServers: [] })); };
    window.RTCPeerConnection.prototype = R.prototype; });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social, null, { timeout: 30000 });
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
    return { ok: nick.ok !== false, uid: G.DB.fb.uid };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}

const lobby = p => p.evaluate(() => ({ state: G.Game.state, cd: G.LobbyUI.countingDown, open: G.UI.isOpen('scr-lobby'),
  note: document.getElementById('lobby-note').textContent, ready: (G.Social.room.members.find(m => m.uid === G.Social.uid) || {}).ready }));
const setReady = (p, on) => p.evaluate(on => G.Social.setReady(on), on);
const allSeeReady = (ps, n) => Promise.all(ps.map(p => settle(p, n => G.Social.room && G.Social.room.members.filter(m => m.ready).length === n, n)));
const inRun = ps => Promise.all(ps.map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active, undefined, 15000)));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'lhst' + tag, 4);
    const g1 = await player(browser, 'lgsa' + tag, 7);

    // ---------------- 1. A guest the host can't connect to ----------------
    console.log('1. Everyone ready, but the host can\'t connect to one guest');
    const g2 = await player(browser, 'lgsb' + tag, 1, true);
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    for (const g of [g1, g2]) { const j = await g.evaluate(id => G.Social.joinRoom(id), id); if (!j.ok) throw new Error('join: ' + JSON.stringify(j)); }
    for (const p of [host, g1, g2]) await p.evaluate(() => G.LobbyUI.open());
    check(await settle(host, u => G.Social.room.members.length === 3 && G.Net.mode(u) === 'direct', g1.uid, 30000), 'g1 connects to the host');
    const g2mode = await host.evaluate(u => G.Net.mode(u), g2.uid);
    check(g2mode !== 'direct', 'g2 (no route) is not connected to the host', g2mode);
    for (const p of [host, g1, g2]) await setReady(p, true);
    await allSeeReady([host, g1, g2], 3);
    await host.waitForTimeout(6000);
    const s1 = await Promise.all([host, g1, g2].map(lobby));
    check(s1.every(l => l.state === "ui" && l.open), "nobody starts a run", s1);
    check(s1.every(l => !/in 0/.test(l.note)), 'nobody shows "starting in 0"', s1.map(l => l.note));
    check(s1.every(l => !l.cd), 'no countdown anywhere while the host can\'t start', s1.map(l => l.cd));
    check(/waiting for the host/i.test(s1[1].note) && /waiting for the host/i.test(s1[2].note), 'the guests say they\'re waiting for the host', [s1[1].note, s1[2].note]);
    await g2.evaluate(() => G.Social.leaveRoom());
    await g2.context().close();
    await allSeeReady([host, g1], 2);

    // ---------------- 2. The host leaves the lobby screen while ready ----------------
    console.log('2. The host goes to the menu while ready');
    for (const p of [host, g1]) await setReady(p, false);
    await allSeeReady([host, g1], 0);
    await setReady(host, true);
    await allSeeReady([host, g1], 1);
    await host.evaluate(() => document.getElementById('lobby-menu').click());
    check(await settle(g1, () => G.Social.room.members.filter(m => m.ready).length === 0), 'leaving the lobby screen clears the host\'s ready');
    await setReady(g1, true);
    await g1.waitForTimeout(5000);
    const s2 = await Promise.all([host, g1].map(lobby));
    check(s2.every(l => l.state === 'ui' && !l.cd) && !/in 0/.test(s2[1].note), 'no countdown, nobody stuck at 0', s2.map(l => l.note));
    await host.evaluate(() => G.LobbyUI.open());

    // ---------------- 3. Everyone ready: it starts, twice ----------------
    for (const round of [1, 2]) {
      console.log(`3.${round} Everyone ready${round === 2 ? ', back in the lobby after a run' : ''}`);
      await setReady(host, true); await setReady(g1, true);
      const t0 = Date.now();
      const both = await settle(g1, () => G.LobbyUI.countingDown, undefined, 4000);
      const notes = await Promise.all([host, g1].map(p => p.evaluate(() => document.getElementById('lobby-note').textContent)));
      check(both && notes.every(n => /starting in [123]/.test(n)), 'the guest counts down with the host', notes);
      const ok = (await inRun([host, g1])).every(Boolean);
      const dt = (Date.now() - t0) / 1000;
      check(ok && dt > 2.5 && dt < 6, `the run starts for both, ${dt.toFixed(1)} s later`);
      if (!ok) break;
      // End it and go back to the lobby as players do: the summary's button (G.Flow.afterRun).
      for (const p of [host, g1]) await p.evaluate(() => { G.Game.quit(); });
      for (const p of [host, g1]) await settle(p, () => G.Game.state === 'over' || G.Game.state === 'ui', undefined, 8000);
      for (const p of [host, g1]) await p.evaluate(() => G.Flow.afterRun());
      check((await Promise.all([host, g1].map(p => settle(p, () => G.UI.isOpen('scr-lobby') && G.Game.state === 'ui')))).every(Boolean), 'both back in the lobby');
      await allSeeReady([host, g1], 0);
    }
    for (const p of [host, g1]) check(!p.errs.length, `${p.name}: no page errors`, p.errs.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll lobby start checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
