#!/usr/bin/env node
// Network stats in co-op (js/fork/net-stats.js, G.Net.stats in js/net/net.js), two real players
// connected peer to peer in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-net-stats.cjs [base-url]
//
//   1. Off (the default): nothing drawn.
//   2. On: within a few seconds each player has the other's ping from getStats (a real number, tiny on
//      one machine) and draws "Name: N ms · ±J ms" and its FPS bottom right.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function player(browser, name, dex, owned, radiant) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LobbyPick && G.Radiant, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex, owned, radiant]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex;
    for (const d of [dex, ...owned]) s.owned[d] = { at: Date.now(), from: 'test' };
    s.radiant = s.radiant || {};
    for (const d of radiant) s.radiant[d] = { at: Date.now(), from: 'test' };
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex, owned, radiant]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'nh' + tag, 4, [], []);
    const guest = await player(browser, 'ng' + tag, 7, [], []);
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
    for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    await guest.click('#lobby-ready');
    await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
    await host.click('#lobby-ready');
    const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active, null, 20000)));
    check(both.every(Boolean), 'the co-op run starts');
    const drawn = p => p.evaluate(() => new Promise(res => {
      const seen = [], raw = G.I18n.rawCanvas;
      G.I18n.rawCanvas = function (ctx, m, text) { if (m === 'fillText') seen.push(String(text)); return raw.apply(this, arguments); };
      requestAnimationFrame(() => requestAnimationFrame(() => { G.I18n.rawCanvas = raw; res(seen.filter(t => / ms · ±| FPS$/.test(t))); }));
    }));
    console.log('1. Off');
    check((await drawn(host)).length === 0 && (await drawn(guest)).length === 0, 'nothing drawn by default');
    console.log('2. On');
    for (const p of [host, guest]) await p.evaluate(() => G.Settings.set('netStats', true));
    await host.waitForTimeout(3500);
    for (const [who, p, other] of [['host', host, guest], ['guest', guest, host]]) {
      const name = await other.evaluate(() => G.Social.me.name);
      const st = await p.evaluate(() => [...G.NetStats.S.values()].map(s => ({ rtt: s.rtt, jit: s.jit })));
      const lines = await drawn(p);
      check(st.length === 1 && typeof st[0].rtt === 'number' && st[0].rtt >= 0 && st[0].rtt < 200 && lines.some(l => l.startsWith(name + ': ') && / ms · ±\d+ ms$/.test(l)) && lines.some(l => /^\d+ FPS$/.test(l)),
        `${who}: the other's ping from getStats, drawn with the name, and the FPS`, { st, lines });
    }
    check(!host.errs.length && !guest.errs.length, 'no page errors', host.errs.concat(guest.errs));
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll network stats checks passed');
  process.exit(failures ? 1 : 0);
})();
