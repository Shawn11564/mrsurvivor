#!/usr/bin/env node
// Changing your Pokémon while in a co-op room reaches the others at once (the G.DB.commit hook
// in js/fork/coop-random.js, mine() in js/net/social.js), two real players connected peer to
// peer in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop-seat.cjs [base-url]
//
// The bug: a player who changed partner in the collection (or shiny / radiant in the menu)
// kept their old Pokémon on everyone else's screen until after the next run, because the
// room only heard about it when the lobby screen was opened again.
//   1. The guest, ready, leaves the lobby screen and picks another partner in the collection:
//      the host's lobby shows it without the guest coming back.
//   2. Radiant: picking a partner they use radiant shows them radiant (the lobby card too);
//      picking a plain one afterwards clears it (the room used to keep `rad` forever).
//   3. The host starts while the guest is still in the collection: the host's run has the guest
//      as the new Pokémon, and so does the guest's own.
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

// The real collection: menu > Pokémon, click the Pokémon's tile, "Make partner".
async function pickInCollection(page, dex) {
  await page.evaluate(() => { G.UI.hideAll && G.UI.hideAll(); G.MenuUI.open(); });
  await page.click('#scr-menu [data-go="dex"]');
  const no = String(dex).padStart(3, '0');
  const cell = page.locator('#dex-grid .cell', { has: page.locator('.no', { hasText: no }) }).first();
  // The grid adds tiles as you scroll down to its end.
  for (let i = 0; i < 40 && !(await cell.count()); i++) {
    await page.evaluate(() => { const g = document.getElementById('dex-grid'); g.lastElementChild && g.lastElementChild.scrollIntoView(); });
    await page.waitForTimeout(150);
  }
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.click('#dex-pick');
}

const seatOf = (page, uid) => page.evaluate(u => { const m = G.Social.room.members.find(x => x.uid === u); return m && { dex: m.dex, shiny: !!m.shiny, rad: !!m.rad }; }, uid);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'sh' + tag, 4, [], []);
    const guest = await player(browser, 'sg' + tag, 7, [25, 150], [150]);   // partner Squirtle; owns Pikachu, radiant Mewtwo
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
    for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    const gu = await guest.evaluate(() => G.Social.uid);
    check((await seatOf(host, gu)).dex === 7, 'the host sees the guest as Squirtle', await seatOf(host, gu));

    console.log('1. A partner picked in the collection, away from the lobby');
    await guest.click('#lobby-ready');
    await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
    await pickInCollection(guest, 25);
    check(await guest.evaluate(() => G.DB.save.partner) === 25, 'the guest\'s partner is now Pikachu');
    check(await settle(host, u => { const m = G.Social.room.members.find(x => x.uid === u); return m && m.dex === 25; }, gu),
      'the host sees Pikachu without the guest reopening the lobby', await seatOf(host, gu));

    console.log('2. Radiant on, then off');
    await pickInCollection(guest, 150);
    check(await settle(host, u => { const m = G.Social.room.members.find(x => x.uid === u); return m && m.dex === 150 && m.rad; }, gu),
      'radiant Mewtwo reaches the host as radiant', await seatOf(host, gu));
    await host.evaluate(() => G.LobbyUI.open());
    check(await settle(host, () => [...document.querySelectorAll('#lobby-members .lob-card small')].some(e => /Mewtwo/.test(e.textContent))),
      'the host\'s lobby card shows Mewtwo');
    await pickInCollection(guest, 25);
    check(await settle(host, u => { const m = G.Social.room.members.find(x => x.uid === u); return m && m.dex === 25 && !m.rad; }, gu),
      'back to Pikachu: no radiant flag left behind', await seatOf(host, gu));

    console.log('3. The host starts while the guest is still in the collection');
    await host.click('#lobby-ready');
    const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active, null, 20000)));
    check(both.every(Boolean), 'both ready: the run starts for both');
    check(await guest.evaluate(() => G.Game.player.mon.dex) === 25, 'the guest plays Pikachu');
    check(await settle(host, () => G.Coop.puppets().some(p => p.mon && p.mon.dex === 25)), 'the host sees the guest as Pikachu in the run',
      await host.evaluate(() => G.Coop.puppets().map(p => p.mon && p.mon.dex)));
    check(!host.errs.length && !guest.errs.length, 'no page errors', host.errs.concat(guest.errs));
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op seat checks passed');
  process.exit(failures ? 1 : 0);
})();
