#!/usr/bin/env node
// The admin menu (js/fork/admin.js) with three real players, in headless Edge, against the
// Firebase emulator (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-admin.cjs [base-url]       (SHOTS=<folder> saves screenshots)
//
// The admin is a GUEST, so everything goes the long way: admin -> host (a friend) -> everyone.
// Each page adds the admin's emulator uid to G.Admin.ADMINS (the real list holds the owner's uid).
// Checks:
//   1. Solo: a clean run goes to the ranking; one with god mode doesn't (G.Game.taint).
//   2. Only the admin gets the ADMIN button and the panel; typing in it doesn't move you.
//   3. A non-admin sending admin messages is ignored.
//   4. Body swap and size: the target, and everyone's copy of the target, change, then change back.
//   5. Reverse controls, ice and slow-mo on the target only.
//   5b. Toggles: "Until I turn it off" has no end, the lit button turns it off (also timed ones).
//   6. Fake popups and messages (HTML in a message stays text).
//   7. Spawning a horde and a chosen boss next to the target (on the host, synced to all).
//   8. God mode and drops by a guest admin taint the host's run (no ranking); level up for the team.
//   9. Save edits: coins and a shiny.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
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
  // The emulator's own banner covers the bottom of the page, where the ADMIN button is.
  await page.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  return page;
}

async function party(host, guests) {
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  for (const g of guests) {
    const j = await g.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  }
  for (const p of [host, ...guests]) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(n => G.Social.room && G.Social.room.members.length === n &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), guests.length + 1, { timeout: 30000 });
}

const settle = (p, pred, arg, ms = 5000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);
const shown = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none'; }, sel);
/** dex drawn for a player: yours (uid = null) or your copy of someone else. */
const looks = (p, uid) => p.evaluate(u => { const pl = u ? G.Coop.mate(u).pl : G.Game.player; return { dex: pl.anim.dex, scale: pl.anim.scale, base: G.Sprites.playerScale(pl.anim.dex) }; }, uid);
/**
 * Holds a key for `ms` and returns how far the player moved in x (and leaves the y in p.dy).
 * XP picked up at any moment can open the team's level-up cards, which stops everyone: if that
 * happens during the walk, the cards are picked and the walk is done again.
 */
async function walk(p, key, ms) {
  for (let tries = 0; ; tries++) {
    await pickCards(8000, 1);
    // (Keys pressed with focus in the admin panel stay in the panel, by design.)
    const [x0, y0] = await p.evaluate(() => {
      if (document.activeElement) document.activeElement.blur();
      window.__stopped = false;
      (function watch() { if (G.Game.state !== 'playing') window.__stopped = true; if (!window.__walkDone) requestAnimationFrame(watch); })();
      window.__walkDone = false;
      return [G.Game.player.x, G.Game.player.y];
    });
    await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key);
    const [x1, y1, stopped] = await p.evaluate(() => { window.__walkDone = true; return [G.Game.player.x, G.Game.player.y, window.__stopped]; });
    if (!stopped || tries >= 3) { p.dy = y1 - y0; return x1 - x0; }
  }
}
const xNow = p => p.evaluate(() => G.Game.player.x);
let ALL_PAGES = [];
/** Picks the first level-up card on every screen showing them, until none has been open for `calm` checks in a row (0.5 s apart). */
async function pickCards(ms = 20000, calm = 3) {
  if (!ALL_PAGES.length) return;
  const end = Date.now() + ms;
  let quiet = 0;
  while (Date.now() < end && quiet < calm) {
    let any = false;
    for (const p of ALL_PAGES) {
      if (!(await p.evaluate(() => G.UI.isOpen('scr-levelup') && !document.getElementById('cards').classList.contains('done')))) continue;
      any = true;
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.keyboard.press('Digit1');
    }
    quiet = any ? 0 : quiet + 1;
    await ALL_PAGES[0].waitForTimeout(500);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'hst' + tag, 4);         // a friend hosts (Charmander)
    const adm = await player(browser, 'adm' + tag, 25);         // the admin joins (Pikachu)
    const frd = await player(browser, 'frd' + tag, 448);        // another friend (Lucario, which has a Mega)
    const ALL = [host, adm, frd];
    ALL_PAGES = ALL;
    for (const p of ALL) await p.evaluate(u => G.Admin.ADMINS.push(u), adm.uid);
    const $ = (p, sel) => p.locator('#adm ' + sel);

    // ---------------- 1. Solo: ranking ----------------
    console.log('Solo run: ranking');
    await adm.evaluate(() => { window.__subs = 0; G.Ranking.submitSolo = () => { window.__subs++; return Promise.resolve(null); }; });
    await adm.evaluate(() => G.Game.startRun());
    await adm.waitForTimeout(800);
    await adm.evaluate(() => G.Game.quit());
    check(await adm.evaluate(() => window.__subs) === 1, 'a clean solo run is sent to the ranking');
    await adm.evaluate(() => G.Game.startRun());
    await adm.keyboard.press('Backquote');
    check(await shown(adm, '#adm-run'), 'in a run the admin panel shows the run tools');
    await $(adm, '[data-do=god]').click();
    const solo = await adm.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9); return { dead: pl.dead, god: pl.god }; });
    check(solo.god && !solo.dead, 'god mode: a huge hit does nothing ' + JSON.stringify(solo));
    await adm.evaluate(() => G.Game.quit());
    check(await adm.evaluate(() => window.__subs) === 1, 'a solo run with god mode is not sent to the ranking');
    await adm.keyboard.press('Backquote');
    await adm.evaluate(() => { G.UI.hideAll(); G.Flow.afterRun(); });

    // ---------------- party ----------------
    await party(host, [adm, frd]);
    await host.waitForTimeout(400);
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 15000 })));
    console.log('Party of 3 in a run (the admin is a guest)');
    // The friends can't die during the test (the flag only; the admin's own god mode is tested through the menu).
    for (const p of [host, frd]) await p.evaluate(() => { G.Game.player.god = true; });
    await host.evaluate(() => { window.__taints = 0; const t = G.Game.taint; G.Game.taint = () => { window.__taints++; t(); };
      window.__subs = 0; G.Ranking.submitGroup = () => { window.__subs++; return Promise.resolve(null); }; });

    // ---------------- 2. Who sees the menu ----------------
    console.log('Menu');
    check(await shown(adm, '#adm-btn') && !(await shown(host, '#adm-btn')) && !(await shown(frd, '#adm-btn')), 'only the admin has the ADMIN button');
    check(await adm.evaluate(() => G.Ranking.isAdmin()) && !(await host.evaluate(() => G.Ranking.isAdmin())), 'the ranking moderation screen uses the same admin list');
    await host.keyboard.press('Backquote');
    check(!(await shown(host, '#adm')), 'the hotkey does nothing for a non-admin');
    await adm.click('#adm-btn');
    check(await shown(adm, '#adm'), 'the ADMIN button opens the panel');
    await adm.waitForTimeout(600);
    if (process.env.SHOTS) await adm.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-panel.png') });
    const opts = await adm.evaluate(() => [...document.querySelectorAll('#adm-to option')].map(o => o.textContent));
    check(opts.join('|') === `Everyone else|hst${tag}|frd${tag}|Me`, 'targets: everyone else, each friend, me: ' + opts.join(', '));
    const xa = await xNow(adm);
    await $(adm, '#adm-text').pressSequentially('dddddddddd', { delay: 40 });
    await adm.waitForTimeout(200);
    const typed = await $(adm, '#adm-text').inputValue();
    check(typed === 'dddddddddd' && Math.abs((await xNow(adm)) - xa) < 1, `typing "d"s in the panel types them and does not walk your Pokémon ("${typed}")`);
    await $(adm, '#adm-text').fill('');

    // ---------------- 3. Non-admins are ignored ----------------
    await frd.evaluate(() => G.Net.toHost({ k: 'adm', a: 'morph', x: { to: '*', dex: 129, secs: 20 } }));
    await host.evaluate(() => G.Net.send(G.Coop.mates[0].uid, { k: 'adm', a: 'morph', by: G.DB.fb.uid, x: { to: '*', dex: 129, secs: 20 } }));
    await host.waitForTimeout(800);
    const ign = [await looks(host), await looks(adm), await looks(frd)].map(l => l.dex);
    check(ign.join() === '4,25,448', 'admin messages from a non-admin (or claiming a non-admin) are ignored: ' + ign);

    // ---------------- 4. Body swap and size ----------------
    console.log('Body swap and size');
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '#adm-secs').selectOption('10');
    await $(adm, '[data-do=karp]').click();
    const karpAt = Date.now();
    check(await settle(frd, () => G.Game.player.anim.dex === 129), 'Magikarp: the target turns into Magikarp');
    check(await settle(host, u => G.Coop.mate(u).pl.anim.dex === 129, frd.uid) && await settle(adm, u => G.Coop.mate(u).pl.anim.dex === 129, frd.uid),
      'the host and the admin see the target as Magikarp too');
    check((await looks(host)).dex === 4 && (await looks(adm)).dex === 25, 'nobody else changes');
    if (process.env.SHOTS) await frd.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-magikarp.png') });
    await $(adm, '#adm-to').selectOption('*');
    await $(adm, '#adm-secs').selectOption('20');
    await $(adm, '[data-do=giant]').click();
    await host.waitForTimeout(800);
    const big = [await looks(host), await looks(frd), await looks(adm), await looks(adm, host.uid), await looks(frd, adm.uid)];
    check(big[0].scale > big[0].base * 2 && big[1].scale > big[1].base * 2 && big[3].scale > big[3].base * 2, 'Giant on "everyone else": host and friend are giant, also as the admin sees them');
    check(Math.abs(big[2].scale - big[2].base) < 1e-6 && Math.abs(big[4].scale - big[4].base) < 1e-6, 'the admin stays normal size, as everyone sees them');
    await $(adm, '#adm-mon').fill('Gengar #94');
    await $(adm, '#adm-to').selectOption(host.uid);
    await $(adm, '[data-do=morph]').click();
    check(await settle(host, () => G.Game.player.anim.dex === 94 && G.Game.player.anim.scale > 2), 'a typed Pokémon ("Gengar #94") while still giant: giant Gengar');
    await $(adm, '#adm-mon').fill('');

    // ---------------- 5. Controls ----------------
    console.log('Controls');
    await $(adm, '#adm-secs').selectOption('10');
    const base = await walk(host, 'KeyD', 700);
    await $(adm, '[data-do=rev]').click();
    await host.waitForTimeout(500);
    const rev = await walk(host, 'KeyD', 700), other = await walk(frd, 'KeyD', 700);
    check(base > 20 && rev < -20 && other > 20, `reverse controls: D walks left for the target only (normal ${base.toFixed(0)}, reversed ${rev.toFixed(0)}, friend ${other.toFixed(0)})`);
    // (Walking left: the friend already walked right three times and could be at a wall.)
    await walk(frd, 'KeyA', 500);
    const stop0 = await xNow(frd); await frd.waitForTimeout(400);
    const glide0 = (await xNow(frd)) - stop0;
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '[data-do=ice]').click();
    await frd.waitForTimeout(500);
    const iced = await walk(frd, 'KeyA', 900);
    const stop1 = await xNow(frd); await frd.waitForTimeout(400);
    const glide1 = (await xNow(frd)) - stop1;
    check(Math.abs(glide0) < 3 && glide1 < -15, `ice skates: the target keeps sliding after letting go (${glide0.toFixed(0)} -> ${glide1.toFixed(0)} px; walked ${iced.toFixed(0)})`);
    // Slow-mo on the admin themself ("Me"): nobody else has an effect running on them.
    const fast = await walk(adm, 'KeyA', 700);
    await $(adm, '#adm-to').selectOption(adm.uid);
    await $(adm, '[data-do=slow]').click();
    await adm.waitForTimeout(500);
    const slow = await walk(adm, 'KeyA', 700);
    check(fast < -20 && Math.abs(slow) < Math.abs(fast) * 0.6, `slow-mo: the target crawls (${fast.toFixed(0)} -> ${slow.toFixed(0)} px)`);
    await $(adm, '#adm-to').selectOption(frd.uid);

    // ---------------- 6. Fake popups ----------------
    console.log('Fake popups');
    await $(adm, '[data-do=flegend]').click();
    check(await settle(frd, () => /LEGENDARY/.test((document.getElementById('adm-fx') || {}).textContent || '') && getComputedStyle(document.getElementById('adm-fx')).display !== 'none'),
      'fake legendary pops up on the target');
    if (process.env.SHOTS) await frd.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-fake-legendary.png') });
    check(!(await shown(host, '#adm-fx')), 'and not on anyone else');
    check(await settle(frd, () => /jk/.test(document.getElementById('adm-fx').textContent), undefined, 6000), 'then it says "jk"');
    const evil = '<img src=x onerror="window.__pwned=1">hi';
    await $(adm, '#adm-text').fill(evil);
    await $(adm, '[data-do=ftext]').click();
    check(await settle(frd, t => (document.querySelector('#adm-fx b') || {}).textContent === t, evil), 'a message shows on the target as plain text');
    check(await frd.evaluate(() => !document.querySelector('#adm-fx img') && !window.__pwned), 'HTML in a message is not run');
    await $(adm, '[data-do=fshiny]').click();
    check(await settle(frd, () => /shiny/.test((G.Spawner.banner() || {}).text || '')), 'fake shiny: the real "shiny nearby" banner, on the target');

    // ---------------- 7. Spawning ----------------
    console.log('Spawning');
    const near = (p, uid, r) => p.evaluate(([u, r]) => { const pl = u ? G.Coop.mate(u).pl : G.Game.player;
      return G.EnemyMgr.all().filter(e => !e.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < r).map(e => ({ dex: e.dex, boss: e.boss })); }, [uid, r]);
    const before = (await near(host, null, 320)).length;
    await $(adm, '#adm-to').selectOption(host.uid);
    await $(adm, '#adm-n').fill('6');
    await $(adm, '[data-do=horde]').click();
    check(await settle(host, n => G.EnemyMgr.all().filter(e => !e.dead && Math.hypot(e.x - G.Game.player.x, e.y - G.Game.player.y) < 320).length >= n, before + 6),
      'Spawn wild ×6: six enemies appear around the host');
    check(await settle(adm, n => G.EnemyMgr.all().length >= n, 6), 'and they reach the guests');
    await $(adm, '#adm-mon').fill('Mewtwo');
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '[data-do=boss]').click();
    check(await settle(host, u => { const p = G.Coop.mate(u).pl; return G.EnemyMgr.all().some(e => e.boss && e.dex === 150 && Math.hypot(e.x - p.x, e.y - p.y) < 320); }, frd.uid),
      'Spawn boss "Mewtwo" next to the friend');
    check(await settle(frd, () => G.EnemyMgr.all().some(e => e.boss && e.dex === 150)), 'the friend sees the boss');
    await $(adm, '#adm-mon').fill('');

    // ---------------- Body swap wears off ----------------
    const left = 10500 - (Date.now() - karpAt);
    if (left > 0) await frd.waitForTimeout(left);
    check(await settle(frd, () => G.Game.player.anim.dex === 448) && await settle(host, u => G.Coop.mate(u).pl.anim.dex === 448, frd.uid),
      'after 10 s the Magikarp turns back into Lucario (for itself and for the others)');

    // ---------------- Whole run (everyone) ----------------
    console.log('Whole run');
    const pageAll = fn => Promise.all(ALL.map(p => p.evaluate(fn)));
    await $(adm, '#adm-secs').selectOption('10');
    await $(adm, '#adm-mon').fill('Psyduck #54');
    for (const k of ['freeze', 'skin', 'disco']) await $(adm, `[data-do=${k}]`).click();
    const fxAt = Date.now();
    await host.waitForTimeout(700);
    const fz = await host.evaluate(() => {
      const es = G.EnemyMgr.all().filter(e => !e.dead), pos = es.map(e => [e.x, e.y]);
      return new Promise(r => setTimeout(() => r({ n: es.length, stun: es.every(e => e.dead || e.stunT > 0),
        moved: Math.max(0, ...es.filter(e => !e.dead).map(e => Math.hypot(e.x - pos[es.indexOf(e)][0], e.y - pos[es.indexOf(e)][1]))) }), 1000));
    });
    check(fz.n >= 6 && fz.stun && fz.moved < 10, `Freeze all Pokémon: every enemy on the host is stunned and stays put (${fz.n} enemies, moved at most ${fz.moved.toFixed(1)} px in 1 s)`);
    const copies = await Promise.all([adm, frd].map(p => p.evaluate(() => { const es = G.EnemyMgr.all().filter(e => !e.dead); return es.length > 0 && es.every(e => e.stunT > 0); })));
    check(copies.every(Boolean), "and on the guests' copies too (touching them doesn't hurt, combat.js)");
    check(await host.evaluate(() => window.__taints > 0), 'freezing taints the run (enemies that can\'t hit you help)');
    const skins = await pageAll(() => { const es = G.EnemyMgr.all().filter(e => !e.dead); return es.length > 0 && es.every(e => e.anim.dex === 54); });
    check(skins.every(Boolean), 'Invasion "Psyduck": every enemy looks like Psyduck, for all three players');
    const disco = await pageAll(() => /hue-rotate/.test(document.getElementById('game').style.filter));
    check(disco.every(Boolean), 'Disco: the colours cycle on all three screens');
    const dirs = await adm.evaluate(() => new Promise(r => { const a = G.EnemyMgr.all()[0], s = new Set();
      const t = setInterval(() => s.add(a.anim.dir), 50); setTimeout(() => { clearInterval(t); r(s.size); }, 1500); }));
    check(dirs >= 4, `and everybody dances: an enemy faces ${dirs} different ways in 1.5 s`);
    if (process.env.SHOTS) await adm.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-disco.png') });
    // Lights out: dark except around your own Pokémon (read off the canvas on the friend's screen).
    const lum = p => p.evaluate(() => { const c = document.getElementById('game'), x = c.getContext('2d');
      const px = (fx, fy) => { const d = x.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };
      return { edge: Math.max(px(0.82, 0.45), px(0.18, 0.55)) }; });
    const lit = await lum(frd);
    await $(adm, '[data-do=dark]').click();
    await frd.waitForTimeout(600);
    const dark = await lum(frd);
    check(lit.edge > 25 && dark.edge < 12, `Lights out: away from your Pokémon the screen goes black (${lit.edge.toFixed(0)} -> ${dark.edge.toFixed(0)})`);
    if (process.env.SHOTS) await frd.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-lights-out.png') });
    await $(adm, '[data-do=quake]').click();
    check((await Promise.all(ALL.map(p => settle(p, () => G.Camera.shake > 0.5, undefined, 2000)))).every(Boolean), 'Earthquake: every screen shakes');
    // Thanos snap and piñata (made by the host).
    const live0 = await host.evaluate(() => G.EnemyMgr.all().filter(e => !e.dead).length);
    await host.evaluate(() => { window.__pin = 0; const d = G.Pickups.drop; G.Pickups.drop = (...a) => { window.__pin++; return d(...a); }; });
    await $(adm, '[data-do=snap]').click();
    await host.waitForTimeout(500);
    const live1 = await host.evaluate(() => G.EnemyMgr.all().filter(e => !e.dead).length);
    check(live1 <= Math.ceil(live0 * 0.6), `Thanos snap: half the enemies are gone (${live0} -> ${live1})`);
    await $(adm, '[data-do=pinata]').click();
    check(await settle(host, () => window.__pin >= 72), 'Piñata: a ring of coins, XP and heals around each of the 3 players (72 drops)');
    await pickCards();                               // the XP from the snap and the piñata levels the team up
    // Wearing off: all of them after their 10 s, for everyone.
    await host.waitForTimeout(Math.max(0, 10600 - (Date.now() - fxAt)));
    const after = await pageAll(() => { const es = G.EnemyMgr.all().filter(e => !e.dead);
      return { skin: es.every(e => e.anim.dex === e.dex), frozen: es.filter(e => e.remote ? e.stunT > 0 : e.stunT > 0.35).length, filter: document.getElementById('game').style.filter }; });
    check(after.every(a => a.skin && !a.frozen && !a.filter), 'after 10 s: enemies look like themselves, move again and the disco is over, everywhere ' + JSON.stringify(after));

    // ---------------- Screen and place ----------------
    console.log('Screen and place');
    const tf = p => p.evaluate(() => document.getElementById('game').style.transform);
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '[data-do=flip]').click();
    await $(adm, '#adm-to').selectOption(host.uid);
    await $(adm, '#adm-secs').selectOption('60');
    await $(adm, '[data-do=mirror]').click();
    await host.waitForTimeout(500);
    check(await tf(frd) === 'rotate(180deg)' && await tf(host) === 'scaleX(-1)' && await tf(adm) === '', `Upside down / Mirror: only on the target's screen ("${await tf(frd)}", "${await tf(host)}")`);
    if (process.env.SHOTS) await frd.screenshot({ path: require('path').join(process.env.SHOTS, 'admin-upside-down.png') });
    const pos = p => p.evaluate(() => [G.Game.player.x, G.Game.player.y]);
    const f0 = await pos(frd);
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '[data-do=yeet]').click();
    await frd.waitForTimeout(500);
    const f1 = await pos(frd);
    check(Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) > 500, `Yeet: the friend lands far away (${Math.round(Math.hypot(f1[0] - f0[0], f1[1] - f0[1]))} px)`);
    await $(adm, '[data-do=tpme]').click();
    await frd.waitForTimeout(500);
    const [a2, f2] = [await pos(adm), await pos(frd)];
    check(Math.hypot(f2[0] - a2[0], f2[1] - a2[1]) < 100, `Bring to me: the friend is back next to the admin (${Math.round(Math.hypot(f2[0] - a2[0], f2[1] - a2[1]))} px)`);
    await $(adm, '#adm-secs').selectOption('10');
    const norm = await walk(frd, 'KeyA', 500);
    await $(adm, '[data-do=fast]').click();
    await frd.waitForTimeout(400);
    const zoom = await walk(frd, 'KeyD', 500);
    check(Math.abs(zoom) > Math.abs(norm) * 1.6, `Zoomies: the friend runs much faster (${norm.toFixed(0)} -> ${zoom.toFixed(0)} px)`);
    await $(adm, '#adm-to').selectOption(host.uid);
    await $(adm, '[data-do=drunk]').click();
    await host.waitForTimeout(400);
    const dx = await walk(host, 'KeyD', 1200);
    const dy = host.dy;
    check(Math.abs(dy) > 10, `Drunk: holding D the host wobbles off course (dx ${dx.toFixed(0)}, dy ${dy.toFixed(0)})`);

    // ---------------- Toggles ("Until I turn it off") ----------------
    // Lasting effects can run with no end (secs 0, G.Admin.ends() gives Infinity); the button
    // stays lit while it's on for the selected target, and clicking it lit turns it off.
    console.log('Toggles');
    const isOn = d => adm.evaluate(d => document.querySelector(`#adm [data-do=${d}]`).classList.contains('on'), d);
    const ends = (p, k) => p.evaluate(k => G.Admin.ends()[k], k);
    await $(adm, '#adm-secs').selectOption('0');
    await $(adm, '#adm-to').selectOption(frd.uid);
    const n0 = await walk(frd, 'KeyD', 600);
    await $(adm, '[data-do=rev]').click();
    await frd.waitForTimeout(500);
    const r1 = await walk(frd, 'KeyD', 600), rEnd = await ends(frd, 'rev'), rLit = await isOn('rev');
    check(n0 > 20 && r1 < -20 && rEnd === Infinity && rLit, `until turned off: reverse controls on the friend with no end (${rEnd}), button lit ${rLit} (D walks ${n0.toFixed(0)} -> ${r1.toFixed(0)})`);
    await $(adm, '#adm-to').selectOption(host.uid);
    const hostLit = await isOn('rev');
    await $(adm, '#adm-to').selectOption(frd.uid);
    check(!hostLit && await isOn('rev'), 'the lit button follows the target: off for the host, on again for the friend');
    await $(adm, '[data-do=rev]').click();
    await frd.waitForTimeout(500);
    const r2 = await walk(frd, 'KeyD', 600);
    check(r2 > 20 && await ends(frd, 'rev') === 0 && !(await isOn('rev')), `clicking the lit button turns it off: D walks right again (${r2.toFixed(0)})`);
    await $(adm, '[data-do=karp]').click();
    check(await settle(frd, () => G.Game.player.anim.dex === 129 && G.Game.player.admLook.dexT === Infinity) && await settle(host, u => G.Coop.mate(u).pl.anim.dex === 129, frd.uid) && await isOn('karp'),
      'Magikarp until turned off, seen by the host too');
    await $(adm, '[data-do=karp]').click();
    check(await settle(frd, () => G.Game.player.anim.dex === 448) && await settle(host, u => G.Coop.mate(u).pl.anim.dex === 448, frd.uid) && !(await isOn('karp')),
      'clicked again: Lucario again, for itself and for the host');
    await $(adm, '[data-do=disco]').click();
    check((await Promise.all(ALL.map(p => settle(p, () => /hue-rotate/.test(document.getElementById('game').style.filter) && G.Admin.ends().disco === Infinity)))).every(Boolean) && await isOn('disco'),
      'Disco until turned off, on all three screens');
    await $(adm, '[data-do=disco]').click();
    check((await Promise.all(ALL.map(p => settle(p, () => !document.getElementById('game').style.filter && G.Admin.ends().disco === 0)))).every(Boolean) && !(await isOn('disco')),
      'clicked again: the disco is over everywhere');
    // A timed one can be stopped early too.
    await $(adm, '#adm-secs').selectOption('30');
    await $(adm, '[data-do=flip]').click();
    check(await settle(frd, () => document.getElementById('game').style.transform === 'rotate(180deg)') && await isOn('flip'), 'Upside down for 30 s: the button is lit');
    await $(adm, '[data-do=flip]').click();
    check(await settle(frd, () => !document.getElementById('game').style.transform) && !(await isOn('flip')), 'clicked again before the 30 s: it stops');
    // Left on (until turned off) for the end of the run, below.
    await $(adm, '#adm-secs').selectOption('0');
    await $(adm, '#adm-to').selectOption(host.uid);
    await $(adm, '[data-do=flip]').click();
    check(await settle(host, () => /rotate\(180deg\)/.test(document.getElementById('game').style.transform)), 'Upside down on the host until turned off');
    await $(adm, '#adm-secs').selectOption('10');

    // ---------------- 8. Powers ----------------
    console.log('Powers');
    const t0 = await host.evaluate(() => window.__taints);
    check(t0 > 0, `spawning tainted the host's run (${t0})`);
    // The admin is the only one without the test's god flag: by now the horde may have downed them.
    await pickCards();
    await $(adm, '[data-do=heal]').click();
    check(await settle(adm, () => !G.Game.player.dead && G.Game.player.hp === G.Game.player.maxHp), 'Heal / revive: the admin is up with full health');
    await host.evaluate(() => { window.__taints = 0; });
    await $(adm, '[data-do=god]').click();
    check(await settle(host, () => window.__taints > 0), "a guest admin's god mode taints the host's run");
    const hit = await adm.evaluate(() => { const pl = G.Game.player, hp = pl.hp; pl.invuln = 0; pl.hurt(1e9); return { dead: pl.dead, lost: hp - pl.hp, god: pl.god }; });
    check(hit.god && !hit.dead && hit.lost === 0, 'god mode as a guest: a huge hit does nothing ' + JSON.stringify(hit));
    // (Spied on: a heal dropped next to someone is picked up almost at once.)
    await host.evaluate(() => { window.__drops = []; const d = G.Pickups.drop;
      G.Pickups.drop = (k, x, y, v) => { window.__drops.push({ k, x, y }); return d(k, x, y, v); }; });
    await $(adm, '#adm-to').selectOption(adm.uid);
    await $(adm, '#adm-drop').selectOption({ label: 'Heal' });
    await $(adm, '[data-do=drop]').click();
    check(await settle(host, u => { const p = G.Coop.mate(u).pl;
      return window.__drops.some(d => d.k === 'heal' && Math.hypot(d.x - p.x, d.y - p.y) < 80); }, adm.uid),
      'Drop "Heal" at me: the host drops it next to the admin');
    // A Mega Stone dropped next to the friend (Lucario). This is a normal run and Mega Evolution
    // only exists in Lab runs (js/fork/mega.js), so it holds the stone and stays Lucario, for
    // everyone. (The Lab version, with everyone seeing Mega Lucario, is in fork/test-lab-coop.cjs.)
    // The others step away so only the friend picks it up.
    await pickCards();
    for (const p of [host, adm]) await p.evaluate(() => { G.Game.player.x += 2500; });
    await host.waitForTimeout(500);
    await $(adm, '#adm-to').selectOption(frd.uid);
    await $(adm, '#adm-drop').selectOption({ label: 'Item: Mega Stone (Lab runs only)' });
    await $(adm, '[data-do=drop]').click();
    for (let i = 0; i < 20 && !(await frd.evaluate(() => G.Game.player.item === 'megastone')); i++) {
      // Holding an item already: the friend takes the stone in the choice.
      await frd.evaluate(() => { if (G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].find(el => /Mega Stone/.test(el.textContent)); if (c) c.click(); } });
      await pickCards(3000, 1);
      await frd.waitForTimeout(400);
    }
    await frd.waitForTimeout(800);
    check(await frd.evaluate(() => G.Game.player.item === 'megastone' && G.Game.player.anim.dex === 448 && !G.Game.player.mega),
      'Drop "Mega Stone" at the friend in a normal run: Lucario holds it but does not Mega Evolve (Lab runs only)');
    check(await host.evaluate(u => G.Coop.mate(u).pl.anim.dex === 448, frd.uid) && await adm.evaluate(u => G.Coop.mate(u).pl.anim.dex === 448, frd.uid),
      'the host and the admin still see plain Lucario');
    for (const p of [host, adm]) await p.evaluate(() => { G.Game.player.x -= 2500; });
    await pickCards();
    const lv0 = await host.evaluate(() => G.Game.player.level);
    await $(adm, '[data-do=rare]').click();
    await $(adm, '[data-do=lvl]').click();
    check(await settle(host, l => G.Game.player.level > l, lv0), 'Level up (as a guest): the team levels up');
    check((await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'levelup' || G.UI.isOpen('scr-levelup'))))).every(Boolean), 'everyone gets the level-up cards');
    check(await adm.evaluate(() => [...document.querySelectorAll('#cards .card')].pop().classList.contains('rare')),
      '"Rare card next": the admin\'s hand ends with the very rare card (js/fork/rare-cards.js)');

    // ---------------- 9. Save ----------------
    console.log('Save');
    const c0 = await adm.evaluate(() => ({ c: G.DB.save.coins, t: G.DB.save.tickets.t10 }));
    await $(adm, '#adm-amt').fill('1234');
    await $(adm, '[data-do=coins]').click();
    await $(adm, '[data-do=t10]').click();
    await $(adm, '#adm-mon').fill('Mew #151');
    await $(adm, '[data-do=ownshiny]').click();
    const c1 = await adm.evaluate(() => ({ c: G.DB.save.coins, t: G.DB.save.tickets.t10, mew: G.DB.ownsShiny(151) && G.DB.owns(151) }));
    check(c1.c - c0.c === 1234 && c1.t - c0.t === 1234 && c1.mew, 'save: +1234 coins, +1234 ×10 tickets, shiny Mew ' + JSON.stringify(c1));

    // ---------------- Ranking at the end ----------------
    await host.evaluate(() => G.Game.quit());
    await host.waitForTimeout(500);
    check(await host.evaluate(() => window.__subs) === 0, 'the tainted group run is not sent to the ranking');
    check(await host.waitForFunction(() => !document.getElementById('game').style.transform, null, { timeout: 3000 }).then(() => true, () => false),
      'when the run ends, screen effects still running (60 s Mirror, Upside down until turned off) are undone (the menu uses the same canvas)');

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
