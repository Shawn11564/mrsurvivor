#!/usr/bin/env node
// The admin's Player Manager (js/fork/player-manager.js, presence.js, drop-in.js, player-edits.js)
// with real players in headless Edge on the Firebase emulator (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-player-manager.cjs [base-url]      (SHOTS=<folder> saves screenshots)
//
// The admin signs in with the owner's real uid (made in the auth emulator), so the real
// firestore.rules and database.rules.json decide (this loads both into the emulator first).
// Checks:
//   1. Only the admin: the Player Manager button and window; a player can't write adm/live,
//      read the list of saves or edit someone else's save.
//   2. The list: every player, live status while the manager is open (none written before).
//   3. Give coins, a ×10 ticket and a shiny Pokémon from the window: the cloud save has them and
//      the player (online, in the menu) gets them at once with a message.
//   4. Delete: Cancel keeps it, Delete removes it (the confirmation comes first, always).
//   5. Reset Pokémon, coins and tickets: typing the name to confirm; the player's game reloads
//      into the personality test with 500 coins; their public profile's favourites are cleared.
//   6. Status of a solo run, then Join run: the player's game opens a closed room, the admin
//      joins it as a co-op teammate next to them, sees the enemies already there; their run is
//      no longer ranked.
//   7. Join lobby: the admin lands in a player's open lobby.
//   8. Join a co-op run already going: the admin joins as a third player; the other guest sees them.
//   9. Bulk: two players ticked, coins given to both.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const ROOT = path.join(__dirname, '..');
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const ADMIN_UID = 'TMD8t0i6jic7a1sg824ZP55TqOG3', ADMIN_NAME = 'pmadmin', ADMIN_PASS = 'pw-pmadmin';
// Until dev.html lists them (fork/README.md), the page gets the Player Manager's scripts here.
const OURS = ['js/fork/player-edits.js', 'js/fork/presence.js', 'js/fork/drop-in.js', 'js/fork/player-manager.js'];
const SHOTS = process.env.SHOTS;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 10000) => p.waitForFunction(pred, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

async function emulatorRules() {
  const fsr = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  let r = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-ps:securityRules', { method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fsr }] } }) });
  if (!r.ok) throw new Error('firestore rules: ' + r.status + ' ' + await r.text());
  r = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-ps-default-rtdb', { method: 'PUT',
    headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8') });
  if (!r.ok) throw new Error('database rules: ' + r.status + ' ' + await r.text());
  // The admin's account, with the owner's uid (it may be there from an earlier run).
  const email = Buffer.from(ADMIN_NAME).toString('hex') + '@jugadores.pokesurvivor.net';
  r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-ps/accounts', { method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: ADMIN_UID, email, password: ADMIN_PASS }) });
  if (!r.ok && !/DUPLICATE/.test(await r.text())) throw new Error('admin account: ' + r.status);
}

async function page(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  await ctx.route('**/dev.html*', async r => {
    const res = await r.fetch();
    let html = await res.text();
    const add = OURS.filter(f => !html.includes(f)).map(f => `<script defer src="${f}"></script>`).join('\n');
    if (add) html = html.replace('<script defer src="js/fork/over-fit.js"></script>', '$&\n' + add);
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e)));
  await p.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(p, '#login-form');
  await p.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.PlayerManager, null, { timeout: 30000 });
  await p.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  return p;
}

/** A player with a cloud save (pushed) and a nickname, in the menu. */
async function player(browser, name, dex, extra) {
  const p = await page(browser);
  const r = await p.evaluate(async ([name, dex, extra, login]) => {
    const reg = login ? await G.DB.login(name, login) : await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    if (!s.partner) {
      s.partner = dex; s.starter = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
      for (const d of extra || []) s.owned[d] = { at: Date.now(), from: 'gacha' };
      G.DB.commit();
    }
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    await G.DB.flush();
    return { ok: true, uid: G.DB.fb.uid, sync: G.DB.syncState };
  }, [name, dex, extra, name === ADMIN_NAME ? ADMIN_PASS : null]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  p.uid = r.uid; p.name = name;
  return p;
}

const cloud = (adm, uid) => adm.evaluate(async u => { const d = await G.DB.fb.fs.collection('saves').doc(u).get(); return d.exists ? d.data().save : null; }, uid);
const $pm = (p, sel) => p.locator('#pm ' + sel);
async function openPlayer(adm, uid) {
  await adm.locator(`#pm .pm-row[data-u="${uid}"] .who`).click();
  await settle(adm, u => document.querySelector('#pm-main .pm-head') && G.PlayerManager.players.get(u).raw, uid);
}
async function confirmModal(adm, typed) {
  await adm.waitForSelector('#pm-modal:not(.hidden) [data-m=yes]');
  if (typed) await adm.fill('#pm-type', typed);
  await adm.click('#pm-modal [data-m=yes]');
}
/** Picks the first level-up card wherever cards are open (a run stops for them). */
async function pickCards(pages) {
  for (const p of pages) {
    await p.evaluate(() => {
      if (G.UI.isOpen('scr-levelup') && !document.getElementById('cards').classList.contains('done')) {
        const c = document.querySelector('#cards .card'); if (c) c.click();
      }
    }).catch(() => {});
  }
}

(async () => {
  await emulatorRules();
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    // A page served by the route above counts as "public", and Chromium then blocks its calls to
    // the emulator on 127.0.0.1 (local network access); the real game is served from the server.
    args: ['--mute-audio', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] });
  try {
    const adm = await player(browser, ADMIN_NAME, 25);
    const p1 = await player(browser, 'pma' + tag, 4, [1, 7, 150]);
    const p2 = await player(browser, 'pmb' + tag, 7);
    check(adm.uid === ADMIN_UID, 'the admin signed in with the owner\'s uid');

    // ---------------- 1. admins only ----------------
    console.log('1. Admins only');
    check(await settle(adm, () => getComputedStyle(document.getElementById('adm-btn')).display !== 'none'), 'the admin has the ADMIN button');
    check(await p1.evaluate(() => getComputedStyle(document.getElementById('adm-btn')).display === 'none'), 'a player doesn\'t');
    await p1.evaluate(() => G.PlayerManager.open());
    check(await p1.evaluate(() => !G.PlayerManager.isOpen), 'a player can\'t open the window');
    const denied = await p1.evaluate(async other => {
      const fs = G.DB.fb.fs, out = {};
      const tryIt = async (k, fn) => { try { await fn(); out[k] = 'allowed'; } catch (e) { out[k] = e.code; } };
      await tryIt('live', () => fs.collection('adm').doc('live').set({ watch: Date.now() + 1e6 }, { merge: true }));
      await tryIt('list', () => fs.collection('saves').get());
      await tryIt('edit', () => fs.collection('saves').doc(other).update({ v: 3 }));
      await tryIt('apres', () => fs.collection('apres').get());
      return out;
    }, p2.uid);
    check(Object.values(denied).every(v => v === 'permission-denied'), 'the rules stop a player writing adm/live, listing saves, editing another save, reading statuses', denied);
    check(await p1.evaluate(async () => (await G.DB.fb.fs.collection('apres').doc(G.DB.fb.uid).get().catch(e => e.code)) === 'permission-denied'),
      'nobody writes a status while the admin isn\'t watching (and players can\'t read them)');

    // ---------------- 2. the list ----------------
    console.log('2. The list and live status');
    await adm.evaluate(() => { G.Admin.close(); document.getElementById('adm-btn').click(); });
    await adm.click('#adm-players');
    check(await settle(adm, () => G.PlayerManager.isOpen), 'Player Manager opens from the admin menu');
    check(await settle(adm, () => /Pick a player/.test(document.getElementById('pm-main').textContent)), 'with an overview until a player is picked');
    check(await settle(adm, ([a, b]) => document.querySelector(`#pm .pm-row[data-u="${a}"]`) && document.querySelector(`#pm .pm-row[data-u="${b}"]`), [p1.uid, p2.uid]),
      'both players are in the list');
    check(await settle(adm, ([a, b]) => document.querySelector(`#pm .pm-row[data-u="${a}"] .pm-dot.on`) && document.querySelector(`#pm .pm-row[data-u="${b}"] .pm-dot.on`), [p1.uid, p2.uid], 15000),
      'and show online within seconds of opening it');
    await adm.fill('#pm-q', 'pmb' + tag);
    check(await settle(adm, u => document.querySelectorAll('#pm .pm-row').length === 1 && document.querySelector(`#pm .pm-row[data-u="${u}"]`), p2.uid), 'search narrows the list');
    await adm.fill('#pm-q', '');
    await shot(adm, 'pm-list');

    // ---------------- 3. gifts ----------------
    console.log('3. Gifts reach an online player at once');
    await openPlayer(adm, p1.uid);
    check(await settle(adm, () => /In the menus/.test(document.querySelector('#pm-live').textContent)), 'the detail shows where they are (the menus)',
      await adm.evaluate(() => document.querySelector('#pm-live').textContent.trim().slice(0, 80)));
    const before = await p1.evaluate(() => ({ coins: G.DB.save.coins, t10: G.DB.save.tickets.t10 }));
    await adm.fill('#pm-amt', '1234');
    await adm.selectOption('#pm-curk', 'c');
    await adm.click('#pm [data-a=give-cur]');
    await settle(adm, () => /Gave 1,234 coins/.test(document.getElementById('pm-toast').textContent));
    await adm.fill('#pm-amt', '3');
    await adm.selectOption('#pm-curk', 't10');
    await adm.click('#pm [data-a=give-cur]');
    await settle(adm, () => /Gave 3/.test(document.getElementById('pm-toast').textContent));
    await adm.fill('#pm-give-mon', 'Pikachu #25');
    await adm.selectOption('#pm-give-var', 'shiny');
    await adm.click('#pm [data-a=give-mon]');
    await settle(adm, () => /Gave Pikachu/.test(document.getElementById('pm-toast').textContent));
    const c1 = await cloud(adm, p1.uid);
    check(c1.coins === before.coins + 1234 && c1.tickets.t10 === before.t10 + 3 && c1.owned[25] && c1.shiny[25], 'the cloud save has the coins, tickets and shiny Pikachu',
      { coins: c1.coins, t10: c1.tickets.t10 });
    check(await settle(p1, ([c, t]) => G.DB.save.coins === c && G.DB.save.tickets.t10 === t && G.DB.ownsShiny(25), [before.coins + 1234, before.t10 + 3], 15000),
      'the player has them in their game without reloading', await p1.evaluate(() => ({ coins: G.DB.save.coins, shiny25: G.DB.ownsShiny(25) })));
    check(await p1.evaluate(() => /From the admin/.test(document.body.innerText)), 'and a message says what came',
      await p1.evaluate(() => (document.querySelector('#toast') || {}).textContent));
    await settle(adm, () => document.querySelector('#pm .pm-mon[data-dex="25"]'));
    await shot(adm, 'pm-player');

    // ---------------- 4. delete, with a confirmation ----------------
    console.log('4. Deleting asks first');
    await adm.click('#pm .pm-mon[data-dex="150"]');
    await adm.waitForSelector('#pm-modal:not(.hidden) [data-m=rm-all]');
    await shot(adm, 'pm-mon');
    await adm.click('#pm-modal [data-m=rm-all]');
    await adm.waitForSelector('#pm-modal:not(.hidden) [data-m=no]');
    await shot(adm, 'pm-confirm');
    await adm.click('#pm-modal [data-m=no]');
    await adm.waitForTimeout(1200);
    check(!!(await cloud(adm, p1.uid)).owned[150], 'Cancel keeps it');
    await adm.click('#pm .pm-mon[data-dex="150"]');
    await adm.click('#pm-modal [data-m=rm-all]');
    await confirmModal(adm);
    check(await settle(adm, () => /Removed Mewtwo/.test(document.getElementById('pm-toast').textContent)), 'Delete removes it');
    check(!(await cloud(adm, p1.uid)).owned[150], 'gone from the cloud save');
    check(await settle(p1, () => !G.DB.owns(150), null, 15000), 'and from the player\'s game (their own copy doesn\'t bring it back)');
    // Take coins asks too.
    await adm.fill('#pm-amt', '1');
    await adm.selectOption('#pm-curk', 'c');
    await adm.click('#pm [data-a=take-cur]');
    check(await settle(adm, () => !document.getElementById('pm-modal').classList.contains('hidden')), 'taking coins asks first');
    await adm.click('#pm-modal [data-m=no]');

    // ---------------- 5. reset ----------------
    console.log('5. Reset Pokémon, coins and tickets');
    await p1.evaluate(async () => { G.DB.save.profile.favs = [{ dex: 4, shiny: false }]; G.DB.commit(); G.Social.publishProfile(true); });
    check(await settle(adm, async u => { const d = await G.DB.fb.fs.collection('profiles').doc(u).get(); return (d.data().favs || []).length === 1; }, p1.uid),
      '(the player has a favourite on their public profile)');
    await adm.click('#pm [data-a=reset][data-k=monscur]');
    await adm.waitForSelector('#pm-modal:not(.hidden) #pm-type');
    check(await adm.evaluate(() => document.querySelector('#pm-modal [data-m=yes]').disabled), 'the reset button stays off until the name is typed');
    await adm.fill('#pm-type', 'wrong');
    check(await adm.evaluate(() => document.querySelector('#pm-modal [data-m=yes]').disabled), 'and with the wrong name');
    await confirmModal(adm, p1.name);
    check(await settle(adm, () => /done/.test(document.getElementById('pm-toast').textContent), null, 15000), 'reset done');
    const c2 = await cloud(adm, p1.uid);
    check(Object.keys(c2.owned).length === 0 && c2.coins === 500 && c2.tickets.t10 === 0 && c2.partner == null, 'cloud save: no Pokémon, 500 coins, no tickets', { owned: Object.keys(c2.owned).length, coins: c2.coins });
    const prof = await adm.evaluate(async u => (await G.DB.fb.fs.collection('profiles').doc(u).get()).data(), p1.uid);
    check(Array.isArray(prof.favs) && prof.favs.length === 0, 'their public profile\'s favourites are cleared');
    // Their game brings it in and reloads (the page goes away: wait for the new one).
    const reloaded = await p1.waitForEvent('load', { timeout: 30000 }).then(() => true, () => false);
    check(reloaded, 'the player\'s game reloads by itself');
    if (reloaded) {
      await pastStart(p1, '#scr-test, #scr-menu, #scr-starters', 60000).catch(() => {});
      check(await settle(p1, () => G.DB.save && G.DB.save.coins === 500 && Object.keys(G.DB.save.owned).length === 0 && (G.UI.isOpen('scr-test') || G.UI.isOpen('scr-starters')), null, 20000),
        'and lands in the personality test with 500 coins and no Pokémon', await p1.evaluate(() => G.DB.save && { coins: G.DB.save.coins, owned: Object.keys(G.DB.save.owned).length }));
    }

    // ---------------- 6. a solo run: status and Join ----------------
    console.log('6. A solo run: Join run');
    await p2.evaluate(() => G.Flow.play());
    await p2.waitForTimeout(4000);
    await pickCards([p2]);
    await openPlayer(adm, p2.uid);
    check(await settle(adm, () => /Solo run/.test(document.querySelector('#pm-live').textContent), null, 15000), 'the status says solo run, with time and level',
      await adm.evaluate(() => document.querySelector('#pm-live').textContent.trim().slice(0, 100)));
    check(await adm.evaluate(() => /Playing Squirtle/.test(document.querySelector('#pm-live').textContent)), 'and the Pokémon they play');
    await shot(adm, 'pm-run');
    await adm.click('#pm [data-a=join]');
    const joined = await settle(adm, () => G.Game.state !== 'ui' && G.Coop.active, null, 45000);
    check(joined, 'the admin is in their run as a co-op teammate', await adm.evaluate(() => ({ state: G.Game.state, coop: G.Coop.active, room: G.Social.room && G.Social.room.id })));
    if (joined) {
      await pickCards([adm, p2]);
      check(await settle(p2, u => G.Coop.active && G.Coop.isHost && G.Coop.mate(u) && G.Coop.mate(u).connected, adm.uid), 'the player\'s game turned the solo run into a group one, with the admin');
      check(await p2.evaluate(() => G.Social.room && G.Social.room.open === false), 'their room stays closed to everyone else');
      const near = await adm.evaluate(h => { const m = G.Coop.mate(h); return m && Math.hypot(m.pl.net.x - G.Game.player.x, m.pl.net.y - G.Game.player.y); }, p2.uid);
      check(near !== null && near < 200, 'the admin appears next to them', near);
      check(await settle(adm, () => G.EnemyMgr.all().length > 0, null, 8000), 'and sees the enemies that were already there', await adm.evaluate(() => G.EnemyMgr.all().length));
      check(await settle(adm, t => G.Game.st.time >= t - 1, await p2.evaluate(() => G.Game.st.time)), 'at the run\'s time');
      check(await p2.evaluate(() => /joined the run/.test(JSON.stringify(G.Spawner.banner && G.Spawner.banner()))), 'they see "joined the run"');
      check(await p2.evaluate(() => { window.__subs = 0; G.Ranking.submitGroup = G.Ranking.submitSolo = () => { window.__subs++; return Promise.resolve(null); }; return true; }), '(ranking watched)');
      await adm.evaluate(() => G.Game.quit());
      await settle(adm, () => G.Game.state === 'over' || G.Game.state === 'ui', null, 8000);
      await p2.evaluate(() => G.Game.quit());
      await p2.waitForTimeout(2500);
      check(await p2.evaluate(() => window.__subs === 0), 'their run is not ranked (the admin helped)', await p2.evaluate(() => window.__subs));
      for (const p of [adm, p2]) await p.evaluate(async () => { await G.Social.leaveRoom(); G.Net.close(); G.Flow.goMenu(); });
    }

    // ---------------- 7. a lobby: Join lobby ----------------
    console.log('7. A lobby: Join lobby');
    const p3 = await player(browser, 'pmc' + tag, 1);
    await p3.evaluate(async () => { await G.Social.createRoom(); G.LobbyUI.open(); });
    await adm.evaluate(() => { if (!G.PlayerManager.isOpen) G.PlayerManager.open(); });
    await settle(adm, u => document.querySelector(`#pm .pm-row[data-u="${u}"]`), p3.uid, 15000);
    await openPlayer(adm, p3.uid);
    check(await settle(adm, () => /co-op lobby/.test(document.querySelector('#pm-live').textContent), null, 15000), 'the status says in a co-op lobby');
    await adm.click('#pm [data-a=join]');
    check(await settle(adm, () => G.Social.room && G.UI.isOpen('scr-lobby'), null, 20000), 'the admin is in their lobby');
    check(await settle(p3, u => G.Social.room.members.some(m => m.uid === u), adm.uid), 'and the host sees them in it');
    await adm.evaluate(async () => { await G.Social.leaveRoom(); G.Net.close(); G.MenuUI.open(); });

    // ---------------- 8. a co-op run already going ----------------
    console.log('8. A co-op run: Join run as a third player');
    const p4 = await player(browser, 'pmd' + tag, 133);
    await p4.evaluate(id => G.Social.joinRoom(id), await p3.evaluate(() => G.Social.room.id));
    await p4.evaluate(() => G.LobbyUI.open());
    const linked = await settle(p3, () => G.Social.room.members.length === 2 && G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, 30000);
    check(linked, 'two players connected in a lobby');
    if (linked) {
      await p3.evaluate(() => document.getElementById('lobby-start').click());
      await settle(p4, () => G.Game.state !== 'ui' && G.Coop.active, null, 15000);
      await p3.waitForTimeout(3000);
      await pickCards([p3, p4]);
      await adm.evaluate(() => { if (!G.PlayerManager.isOpen) G.PlayerManager.open(); });
      await openPlayer(adm, p3.uid);
      check(await settle(adm, () => /Co-op run \(host\)/.test(document.querySelector('#pm-live').textContent), null, 15000), 'the status says co-op run (host)');
      await adm.click('#pm [data-a=join]');
      const in3 = await settle(adm, () => G.Game.state !== 'ui' && G.Coop.active && G.Coop.mates.length === 2, null, 45000);
      check(in3, 'the admin joined the run going on', await adm.evaluate(() => ({ state: G.Game.state, mates: G.Coop.mates.map(m => m.name) })));
      if (in3) {
        await pickCards([adm, p3, p4]);
        check(await settle(p4, u => !!G.Coop.mate(u), adm.uid), 'the other guest sees the admin too');
        check(await settle(p4, u => { const m = G.Coop.mate(u); return m && m.pl.net && Math.abs(m.pl.net.x) + Math.abs(m.pl.net.y) > 0; }, adm.uid), 'and where they are (through the host)');
      }
      for (const p of [adm, p3, p4]) await p.evaluate(() => { try { G.Game.quit(); } catch (e) { /* not in a run */ } });
      await adm.waitForTimeout(1500);
      for (const p of [adm, p3, p4]) await p.evaluate(async () => { await G.Social.leaveRoom(); G.Net.close(); G.Flow.goMenu(); });
    }

    // ---------------- 9. bulk ----------------
    console.log('9. Bulk gifts');
    await adm.evaluate(() => { if (!G.PlayerManager.isOpen) G.PlayerManager.open(); });
    const b2 = (await cloud(adm, p2.uid)).coins, b3 = (await cloud(adm, p3.uid)).coins;
    await adm.check(`#pm .pm-row[data-u="${p2.uid}"] input[data-sel]`);
    await adm.check(`#pm .pm-row[data-u="${p3.uid}"] input[data-sel]`);
    await adm.click('#pm-bulk');
    await adm.fill('#pm [data-bc=c]', '250');
    await shot(adm, 'pm-bulk');
    await adm.click('#pm [data-a=bulk-cur]');
    await confirmModal(adm);
    check(await settle(adm, () => /done for 2 of 2/.test(document.getElementById('pm-blog').textContent), null, 20000), 'done for both',
      await adm.evaluate(() => document.getElementById('pm-blog').textContent));
    const a2 = (await cloud(adm, p2.uid)).coins, a3 = (await cloud(adm, p3.uid)).coins;
    check(a2 === b2 + 250 && a3 === b3 + 250, 'each got 250 coins', [b2, a2, b3, a3]);
    await adm.evaluate(() => G.PlayerManager.close());
    check(await settle(adm, async () => (await G.DB.fb.fs.collection('adm').doc('live').get()).data().watch === 0),
      'closing the window stops the status reports (watch 0)');

    for (const p of [adm, p1, p2, p3, p4]) check(!p.errs.length, (p.name || '?') + ': no page errors', p.errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
