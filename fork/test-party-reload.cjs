#!/usr/bin/env node
// Parties survive a page reload (js/net/social.js resume), in headless Edge against the
// Firebase emulator, with the real security rules (database.rules.json):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-party-reload.cjs [base-url]
//
// A reload (F5, or the auto-updater's reload in the lobby) used to break the party up: the
// host's room was deleted on disconnect, and a guest's place in it too. Now a disconnect
// only marks you away, and the tab rejoins after reloading. Checks:
//   1. A guest reloads: back in the same room, lobby open, connected to the host again;
//      nobody else's party broke.
//   2. The host reloads: same room, still the host; the guest never saw it close.
//   3. Leaving with the button, then reloading: you stay out.
//   4. A guest who closes the tab for good is dropped once the grace period runs out.
//   5. A host who closes the tab for good: the guest's room closes after the grace
//      period and is deleted from the database.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const GRACE = 6000;                       // test grace period (the game's is 90 s)

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function boot(page) {
  // Shorter grace period for the test, set before the game's scripts run.
  await page.addInitScript(ms => { window.__partyGrace = ms; }, GRACE);
}

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  await boot(page);
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
    await G.DB.flush();
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false, uid: G.DB.fb.uid, st, nick };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}

/** Reloads like F5 and waits until the game is back past the start screen and signed in. */
async function reload(page) {
  await page.reload({ waitUntil: 'load' });
  await pastStart(page, '#scr-menu, #scr-lobby');
  for (let i = 0; i < 5; i++) {
    const note = await page.$('#scr-savenote:not(.hidden) #savenote-ok');
    if (!note) break;
    await note.click();
  }
}

const roomOf = p => p.evaluate(() => G.Social.room ? { id: G.Social.room.id, isHost: G.Social.room.isHost,
  n: G.Social.room.members.length, away: G.Social.room.members.filter(m => m.away).length, lobby: G.UI.isOpen('scr-lobby') } : null);
const connected = (host, n) => settle(host, n => G.Social.room && G.Social.room.members.length === n &&
  G.Social.room.members.every(m => !m.away && (m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct')), n, 30000);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'rhst' + tag, 4);
    const g1 = await player(browser, 'rgsa' + tag, 7);
    const g2 = await player(browser, 'rgsb' + tag, 1);
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    for (const g of [g1, g2]) {
      const j = await g.evaluate(id => G.Social.joinRoom(id), id);
      if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
    }
    for (const p of [host, g1, g2]) await p.evaluate(() => G.LobbyUI.open());
    check(await connected(host, 3), 'party of 3 connected peer to peer');
    // Anything that says the room closed counts as the party breaking.
    for (const p of [host, g1, g2]) await p.evaluate(() => { window.__closed = 0; G.Social.on(w => { if (w === 'room-closed') window.__closed++; }); });

    console.log('A guest reloads');
    await g1.evaluate(() => G.Social.setReady(true));
    await settle(host, u => G.Social.room.members.some(m => m.uid === u && m.ready), g1.uid);
    await reload(g1);
    check(await settle(g1, id => G.Social.room && G.Social.room.id === id, id, 20000), 'after reloading, g1 is back in the same room');
    let r = await roomOf(g1);
    check(r && !r.isHost && r.n === 3 && r.away === 0 && r.lobby, 'g1 lands in the lobby, 3 members, nobody away: ' + JSON.stringify(r));
    check(await connected(host, 3), 'the host is connected to g1 again (direct)');
    check(await host.evaluate(u => G.Social.room.members.find(m => m.uid === u).ready === true, g1.uid), "g1's ready mark survived the reload");
    check((await Promise.all([host, g2].map(p => p.evaluate(() => window.__closed)))).every(n => n === 0), 'neither the host nor g2 saw the room close');

    console.log('The host reloads');
    await reload(host);
    check(await settle(host, id => G.Social.room && G.Social.room.id === id && G.Social.room.isHost, id, 20000), 'after reloading, the host is back in the same room, still the host');
    for (const p of [host, g1, g2]) await p.evaluate(() => { window.__closed = window.__closed || 0; G.Social.on(w => { if (w === 'room-closed') window.__closed++; }); });
    check(await connected(host, 3), 'the host reconnects to both guests (direct)');
    r = await roomOf(host);
    check(r && r.lobby && r.n === 3, 'the host lands in the lobby: ' + JSON.stringify(r));
    check((await Promise.all([g1, g2].map(p => p.evaluate(() => window.__closed)))).every(n => n === 0), 'the guests never saw the room close');
    check(await host.evaluate(() => G.Social.room.open === true), 'the room is still open to join');

    console.log('Leaving, then reloading');
    await g2.click('#lobby-leave');
    await settle(host, () => G.Social.room.members.length === 2);
    await reload(g2);
    await g2.waitForTimeout(3000);
    check(!(await roomOf(g2)), 'g2 left with the button: after a reload it stays out');
    check(await host.evaluate(() => G.Social.room.members.length === 2), 'the host sees 2 members');

    console.log('A guest closes the tab for good');
    await g1.context().close();
    check(await settle(host, u => G.Social.room.members.some(m => m.uid === u && m.away), g1.uid), 'the host sees g1 as away (reconnecting)');
    await host.waitForTimeout(400);
    const conn = await host.evaluate(u => document.querySelector(`.conn[data-u="${u}"]`).textContent, g1.uid);
    check(/Reconnecting/.test(conn), `the lobby says so: "${conn}"`);
    check(await host.evaluate(() => document.getElementById('lobby-start').disabled), 'the host cannot start while someone is away');
    check(await settle(host, () => G.Social.room.members.length === 1, undefined, GRACE + 15000), 'after the grace period g1 is dropped from the room');

    console.log('The host closes the tab for good');
    const g3 = g2;                                               // g2 joins again, then the host leaves
    const j = await g3.evaluate(id => G.Social.joinRoom(id), id);
    check(j.ok, 'g2 joins the room again');
    await g3.evaluate(() => G.LobbyUI.open());
    await g3.evaluate(() => { window.__closed = 0; G.Social.on(w => { if (w === 'room-closed') window.__closed++; }); });
    await host.context().close();
    check(await settle(g3, h => G.Social.room && G.Social.room.members.some(m => m.uid === h && m.away), host.uid), 'g2 sees the host as away');
    check(await g3.evaluate(() => !!G.Social.room), 'the room stays open while the host might come back');
    check(await settle(g3, () => !G.Social.room && window.__closed === 1, undefined, GRACE + 15000), 'after the grace period the room closes for g2');
    const gone = await g3.evaluate(async id => (await G.DB.fb.rtdb.ref('rooms/' + id + '/host').get()).val(), id);
    check(gone === null, 'and the room is deleted from the database');

    for (const p of [g3]) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
