#!/usr/bin/env node
// The pause menu's Continue button in co-op (js/fork/coop-background.js wraps G.RunUI.wirePause),
// two real players connected peer to peer in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop-pause.cjs [base-url]
//
// In co-op the pause menu doesn't stop the game (the others keep playing), so the run never goes
// into the "paused" state; Continue only resumed from that state and did nothing: only Esc / P
// closed the menu. For the host and for a guest:
//   1. Esc opens the pause menu, the run keeps going (co-op), your Pokémon is held.
//   2. Continue closes it, and you can move again; the run never stopped.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
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
    const host = await player(browser, 'ph' + tag, 4, [], []);
    const guest = await player(browser, 'pg' + tag, 7, [], []);
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
    check(both.every(Boolean), 'the co-op run starts for both');
    await host.waitForTimeout(3500);                     // past the start countdown

    for (const [who, page] of [['host', host], ['guest', guest]]) {
      console.log(`${who === 'host' ? 1 : 2}. ${who}: Esc, then Continue`);
      await page.keyboard.press('Escape');
      const open = await settle(page, () => G.UI.isOpen('scr-pause'));
      const t0 = await page.evaluate(() => G.Game.st && G.Game.st.time);
      await page.waitForTimeout(800);
      const s = await page.evaluate(() => ({ state: G.Game.state, frozen: !!G.Game.player.frozen, time: G.Game.st && G.Game.st.time }));
      check(open && s.state === 'playing' && s.frozen && s.time > t0, 'the pause menu is open, the run keeps going, your Pokémon is held', s);
      await page.click('#btn-resume');
      const closed = await settle(page, () => !G.UI.isOpen('scr-pause'), null, 3000);
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ state: G.Game.state, frozen: !!G.Game.player.frozen }));
      check(closed && after.state === 'playing' && !after.frozen, 'Continue closes it and you can move again', after);
    }
    check(!host.errs.length && !guest.errs.length, 'no page errors', host.errs.concat(guest.errs));
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op pause checks passed');
  process.exit(failures ? 1 : 0);
})();
