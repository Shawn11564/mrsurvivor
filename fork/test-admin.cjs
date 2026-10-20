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
/** Holds a key for `ms` and returns how far the player moved in x. */
async function walk(p, key, ms) {
  // (Keys pressed with focus in the admin panel stay in the panel, by design.)
  const x0 = await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); return G.Game.player.x; });
  await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key);
  return (await p.evaluate(() => G.Game.player.x)) - x0;
}
const xNow = p => p.evaluate(() => G.Game.player.x);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'hst' + tag, 4);         // a friend hosts (Charmander)
    const adm = await player(browser, 'adm' + tag, 25);         // the admin joins (Pikachu)
    const frd = await player(browser, 'frd' + tag, 7);          // another friend (Squirtle)
    const ALL = [host, adm, frd];
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
    check(ign.join() === '4,25,7', 'admin messages from a non-admin (or claiming a non-admin) are ignored: ' + ign);

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
    check(await settle(frd, () => G.Game.player.anim.dex === 7) && await settle(host, u => G.Coop.mate(u).pl.anim.dex === 7, frd.uid),
      'after 10 s the Magikarp turns back into Squirtle (for itself and for the others)');

    // ---------------- 8. Powers ----------------
    console.log('Powers');
    const t0 = await host.evaluate(() => window.__taints);
    check(t0 > 0, `spawning tainted the host's run (${t0})`);
    await host.evaluate(() => { window.__taints = 0; });
    await $(adm, '[data-do=god]').click();
    check(await settle(host, () => window.__taints > 0), "a guest admin's god mode taints the host's run");
    const hit = await adm.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9); return pl.dead; });
    check(!hit, 'god mode as a guest: a huge hit does nothing');
    // (Spied on: a heal dropped next to someone is picked up almost at once.)
    await host.evaluate(() => { window.__drops = []; const d = G.Pickups.drop;
      G.Pickups.drop = (k, x, y, v) => { window.__drops.push({ k, x, y }); return d(k, x, y, v); }; });
    await $(adm, '#adm-to').selectOption(adm.uid);
    await $(adm, '#adm-drop').selectOption({ label: 'Heal' });
    await $(adm, '[data-do=drop]').click();
    check(await settle(host, u => { const p = G.Coop.mate(u).pl;
      return window.__drops.some(d => d.k === 'heal' && Math.hypot(d.x - p.x, d.y - p.y) < 80); }, adm.uid),
      'Drop "Heal" at me: the host drops it next to the admin');
    const lv0 = await host.evaluate(() => G.Game.player.level);
    await $(adm, '[data-do=lvl]').click();
    check(await settle(host, l => G.Game.player.level > l, lv0), 'Level up (as a guest): the team levels up');
    check((await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'levelup' || G.UI.isOpen('scr-levelup'))))).every(Boolean), 'everyone gets the level-up cards');

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

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
