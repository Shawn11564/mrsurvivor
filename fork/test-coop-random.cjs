#!/usr/bin/env node
// Random Pokémon in a co-op lobby (js/fork/coop-random.js, mine() in js/net/social.js), two real
// players connected peer to peer in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop-random.cjs [base-url]
//
//   1. The guest presses "Random Pokémon" in the lobby: their card (on the host's screen too)
//      shows the rolled Pokémon; their saved partner doesn't change; nothing starts.
//   2. Ready-up as usual: while ready the button is off; the run starts once both are ready.
//   3. In the run the guest plays the rolled Pokémon, and the host sees that Pokémon.
//   4. "Back to my partner" and leaving the room drop the pick.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function player(browser, name, dex, owned) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LobbyPick, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex, owned]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex;
    for (const d of [dex, ...owned]) s.owned[d] = { at: Date.now(), from: 'test' };
    G.Settings.set('randMin', 1);
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex, owned]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'rh' + tag, 4, []);
    const guest = await player(browser, 'rg' + tag, 7, [25, 133, 150]);   // partner Squirtle; owns 3 more
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
    for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    const guestUid = await guest.evaluate(() => G.Social.uid);

    console.log('1. Rolling in the lobby');
    check(await guest.isVisible('#lobby-rand') && !(await guest.isVisible('#lobby-partner')), 'the lobby has "Random Pokémon" (and no "Back" yet)');
    await guest.click('#lobby-rand');
    const rolled = await guest.evaluate(() => G.LobbyPick.get() && G.LobbyPick.get().dex);
    check([25, 133, 150].includes(rolled) || rolled === 7, 'a Pokémon the guest owns is rolled', rolled);
    check(await settle(host, ([u, d]) => { const m = G.Social.room.members.find(x => x.uid === u); return m && m.dex === d; }, [guestUid, rolled]),
      'the host\'s lobby shows the guest with it');
    check(await guest.evaluate(() => G.DB.save.partner) === 7, 'the guest\'s saved partner is still Squirtle');
    await guest.click('#lobby-rand');
    const rolled2 = await guest.evaluate(() => G.LobbyPick.get().dex);
    check(rolled2 !== rolled, 'rolling again gives a different one', [rolled, rolled2]);
    await host.waitForTimeout(1500);
    check(await host.evaluate(() => G.Game.state) === 'ui', 'rolling starts nothing');

    console.log('2. Ready-up as usual');
    await guest.click('#lobby-ready');
    await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
    check(await guest.isDisabled('#lobby-rand'), 'while ready, the button is off');
    await host.waitForTimeout(2500);
    check(await host.evaluate(() => G.Game.state) === 'ui', 'one of two ready: no start');
    await host.click('#lobby-ready');
    const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active, null, 15000)));
    check(both.every(Boolean), 'both ready: the run starts for both');

    console.log('3. In the run');
    check(await guest.evaluate(() => G.Game.player.mon.dex) === rolled2, 'the guest plays the rolled Pokémon', await guest.evaluate(() => G.Game.player.mon.dex));
    check(await settle(host, d => G.Coop.puppets().some(p => p.mon && p.mon.dex === d), rolled2), 'the host sees the guest as that Pokémon');
    await host.evaluate(() => G.Game.quit());
    await settle(guest, () => G.Game.state === 'ui' || G.Game.state === 'over', null, 15000);

    console.log('4. Dropping the pick');
    // Past the end-of-run screens (team summary first), back to the lobby.
    await guest.waitForTimeout(800);
    if (await guest.isVisible('#scr-party [data-a=next]')) await guest.click('#scr-party [data-a=next]');
    await guest.evaluate(() => { G.UI.hideAll(); G.Game.toUI(); G.LobbyUI.open(); });
    check(await guest.evaluate(() => G.LobbyPick.get() && G.LobbyPick.get().dex) === rolled2, 'back in the lobby, the pick is kept');
    const rdy = await guest.evaluate(() => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
    if (rdy) await guest.click('#lobby-ready');
    await guest.click('#lobby-partner');
    check(await settle(host, ([u]) => { const m = G.Social.room.members.find(x => x.uid === u); return m && m.dex === 7; }, [guestUid]),
      '"Back to my partner": Squirtle again, on the host too');
    await guest.click('#lobby-rand');
    await guest.evaluate(async () => { await G.Social.leaveRoom(); G.Net.close(); G.MenuUI.open(); });
    check(await guest.evaluate(() => G.LobbyPick.get()) === null, 'leaving the room drops the pick');
    check(!host.errs.length && !guest.errs.length, 'no page errors', host.errs.concat(guest.errs));
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op random checks passed');
  process.exit(failures ? 1 : 0);
})();
