#!/usr/bin/env node
// Beating a rift legendary (js/fork/rift-rewards.js, TODO 44 and 45), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in another terminal)
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database   (part 2; skipped without it)
//   node fork/test-rift-rewards.cjs [base-url]
//
//   1. Solo: the legendary falls, no held item lands on the floor; back on the map, after the bond,
//      your own item is offered (not the one you hold) and taking it equips it.
//   2. Co-op, host and guest: the guest is down when the host kills the legendary. The guest is back on
//      their feet at once, still in the arena (it used to wait for the trip back); nothing drops for
//      the nearest player to grab, and each of them gets their own item back on the map.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);

// Picks the bond (two keys for a pair) and level-up cards that show up, until the item screen or `ms`.
async function clearScreens(p, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await p.evaluate(() => ({ bond: G.UI.isOpen('scr-bond'), lvl: G.UI.isOpen('scr-levelup'), item: G.UI.isOpen('scr-item'), st: G.Game.state }));
    if (s.item) return 'item';
    if (s.bond || s.lvl) { await p.waitForTimeout(1200); await p.keyboard.press('Digit1'); await p.waitForTimeout(300); continue; }
    await p.waitForTimeout(200);
  }
  return 'none';
}
const offered = p => p.evaluate(() => [...document.querySelectorAll('#item-cards .card')].map(c => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));

async function solo(browser) {
  console.log('1. Solo');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.RiftRewards, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    G.UI.hideAll(); G.Game.toUI();
    G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.DB.commit();
    G.Game.startRun(); const pl = G.Game.player; pl.god = true; pl.hurt = () => {}; pl.xpMul = 0;
    pl.equip('leftovers');
  });
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
  await page.evaluate(() => G.Rift.debugArena());
  check(await settle(page, () => G.Rift.inArena && G.EnemyMgr.all().some(e => e.legend)), 'in the arena with the legendary');
  await page.waitForTimeout(300);
  await page.evaluate(() => G.EnemyMgr.all().find(e => e.legend).hurt(1e12));
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => ({ phase: G.Rift.arena && G.Rift.arena.phase, items: G.Pickups.all().filter(p => p.kind === 'item').length, pending: G.RiftRewards.pending }));
  check(r.phase === 'won' && r.items === 0 && r.pending && r.pending !== 'leftovers', 'won: no held item on the floor, your own one waiting (not Leftovers, the one you hold)', r);
  const scr = await clearScreens(page);
  const cards = scr === 'item' ? await offered(page) : [];
  check(scr === 'item' && cards.length === 2 && /Leftovers/.test(cards[0]), 'back on the map, after the bond: the item choice, Leftovers against the new one', cards);
  await page.waitForTimeout(1200);
  await page.keyboard.press('Digit2');
  check(await settle(page, p => G.Game.player.item === p, r.pending), 'taking it equips it', await page.evaluate(() => G.Game.player.item));
  check(!errs.length, 'no page errors', errs);
  await ctx.close();
}

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, locale: 'en-US' });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.RiftRewards, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'test' };
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  await page.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  return page;
}

async function coop(browser) {
  console.log('2. Co-op: the guest is down when the legendary falls');
  const host = await player(browser, 'rh' + tag, 4), guest = await player(browser, 'rg' + tag, 7);
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
  await host.waitForTimeout(3500);
  await host.evaluate(() => { const pl = G.Game.player; pl.god = true; pl.xpMul = 0; pl.equip('leftovers'); });
  await guest.evaluate(() => { const pl = G.Game.player; pl.god = true; pl.xpMul = 0; });
  await host.evaluate(() => G.Rift.debugArena());
  check((await Promise.all([host, guest].map(p => settle(p, () => G.Rift.inArena, null, 10000)))).every(Boolean), 'both in the arena');
  await host.waitForTimeout(1500);
  await guest.evaluate(() => { const pl = G.Game.player; pl.god = false; pl.invuln = 0; pl.hurt(1e9, null, true); });
  check(await settle(guest, () => G.Game.player.dead), 'the guest is down');
  // The host stands on the legendary, so a dropped item would be theirs.
  await host.evaluate(() => { const e = G.EnemyMgr.all().find(e => e.legend), pl = G.Game.player; pl.x = e.x; pl.y = e.y + 20; e.hurt(1e12); });
  const up = await settle(guest, () => !G.Game.player.dead && G.Rift.inArena && G.Rift.arena.phase === 'won', null, 5000);
  const g = await guest.evaluate(() => ({ dead: G.Game.player.dead, inArena: G.Rift.inArena, hp: +(G.Game.player.hp / G.Game.player.maxHp).toFixed(2), pending: G.RiftRewards.pending }));
  check(up && g.hp > 0.2, 'the guest is back on their feet right away, still in the arena', g);
  const h = await host.evaluate(() => ({ items: G.Pickups.all().filter(p => p.kind === 'item').length, pending: G.RiftRewards.pending, item: G.Game.player.item }));
  check(h.items === 0 && h.pending && h.pending !== 'leftovers' && g.pending, 'no held item on the floor; host and guest each have their own waiting', { host: h, guest: g.pending });
  // Back on the map: the bonds, then the items (the guest holds none, so theirs is put on at once).
  const [hs] = await Promise.all([clearScreens(host, 25000), clearScreens(guest, 25000)]);
  // (The host's choice stops the run for both; the guest's item comes once it's made.)
  const hCards = hs === 'item' ? await offered(host) : [];
  await host.waitForTimeout(1200);
  await host.keyboard.press('Digit2');
  const hItem = await settle(host, p => G.Game.player.item === p, h.pending, 5000);
  const gItem = await settle(guest, p => G.Game.player.item === p, g.pending, 10000);
  check(hs === 'item' && /Leftovers/.test(hCards[0] || '') && hItem && gItem, 'back on the map: the host chooses between Leftovers and theirs, the guest wears theirs', { host: hCards, guest: await guest.evaluate(() => G.Game.player.item) });
  check(!host.errs.length && !guest.errs.length, 'no page errors', [...host.errs, ...guest.errs]);
  await host.context().close(); await guest.context().close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await solo(browser);
    if (await fetch('http://127.0.0.1:9099/').then(r => r.ok, () => false)) await coop(browser);
    else console.log('2. SKIP no Firebase emulator');
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll rift reward checks passed');
  process.exit(failures ? 1 : 0);
})();
