#!/usr/bin/env node
// The Revive card (js/fork/lab/revive-card.js, Lab first), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-revive-card.cjs [base-url]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. Solo Lab run: the card can come up (forced here) and taking it puts a revive in its slot.
//      It's a Legendary card: 1 in 100 hands, and on screen the gold "Legendary" chip and border.
//   2. Knocked out: back up at once with 50% HP, 3 s untouchable, the enemy next to you thrown back;
//      the revive is spent. Knocked out again: game over. Knocked out by an enemy's explosions landing
//      every 150 ms: revived, and still up 3 s later (js/fork/revive-grace.js).
//   3. Not in a normal run: the card never comes up.
//   4. Co-op: a guest down with a revive gets the button; R uses it, the host sees the guest up.
const http = require('http');
const up = url => new Promise(r => http.get(url, res => { res.resume(); r(true); }).on('error', () => r(false)));
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

async function guestPage(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.ReviveCard, null, { timeout: 30000 });
  await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
  return page;
}
const startRun = (page, lab) => page.evaluate(lab => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
  .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
  .then(() => page.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.level = 8; }))
  .then(() => page.waitForTimeout(3300));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await guestPage(browser);
    console.log('1. The card');
    await startRun(page, true);
    const c = await page.evaluate(() => {
      const pl = G.Game.player; G.ReviveCard.forceNext();
      const hand = G.LevelUp.offer(pl), card = hand.find(x => x.key === 'rare:revive');
      if (card) card.apply(pl);
      return { card: !!card, title: card && card.title, held: pl.selfRevive };
    });
    check(c.card && c.title === 'Revive' && c.held === 1, 'the Revive card comes up and taking it holds one', c);
    const odds = await page.evaluate(() => {
      const pl = G.Game.player, n = 20000;
      pl.selfRevive = 0;
      let hits = 0;
      for (let i = 0; i < n; i++) if (G.LevelUp.offer(pl).some(x => x.key === 'rare:revive')) hits++;
      return { rate: G.ReviveCard.RATE, seen: +(hits / n).toFixed(4) };
    });
    check(odds.rate === 0.01 && odds.seen > 0.006 && odds.seen < 0.014, 'Legendary odds: about 1 hand in 100', odds);
    await page.evaluate(() => { const pl = G.Game.player; G.ReviveCard.forceNext(); G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), () => {}); });
    await page.waitForTimeout(300);
    const look = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#cards .card')].find(e => /Revive/.test(e.textContent)), chip = el && el.querySelector('.tag-chip');
      return el && { chip: chip.textContent.trim(), bg: chip.style.background, shadow: el.style.boxShadow, cls: el.className };
    });
    check(look && look.chip === 'Legendary' && /255, 203, 61|#ffcb3d/i.test(look.bg) && /255, 203, 61|#ffcb3d/i.test(look.shadow) && /rarity-5/.test(look.cls) && !/\brare\b/.test(look.cls),
      'on screen: chip "Legendary" in gold, gold border', look);
    await page.evaluate(() => { G.RunUI.closeLevelUp(); G.Game.player.selfRevive = 1; });

    console.log('2. Knocked out');
    const r = await page.evaluate(async () => {
      const pl = G.Game.player, def = G.Enemies.cast[0].list[0];
      const e = new G.Enemy(def, pl.x + 20, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      const d0 = Math.hypot(e.x - pl.x, e.y - pl.y);
      pl.invuln = 0; pl.god = false; pl.hurt(1e7, null, true);
      const now = { dead: pl.dead, hp: +(pl.hp / pl.maxHp).toFixed(2), inv: pl.invuln, held: pl.selfRevive };
      await new Promise(r => setTimeout(r, 500));
      now.pushed = Math.round(Math.hypot(e.x - pl.x, e.y - pl.y) - d0);
      now.state = G.Game.state;
      G.EnemyMgr.clear();
      return now;
    });
    check(!r.dead && r.hp === 0.5 && r.inv >= 2.99 && r.held === 0 && r.state === 'playing', 'back up at once: 50% HP, 3 s untouchable, the revive spent, still playing', r);
    check(r.pushed > 30, 'the enemy next to you was thrown back', r.pushed);
    // (After the revive's 3 s grace, js/fork/revive-grace.js: nothing hurts until then.)
    await page.waitForFunction(() => !(G.Game.player.graceT > 0), null, { timeout: 8000 });
    await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e7, null, true); });
    check(await page.waitForFunction(() => G.Game.state === 'over' || !document.getElementById('scr-over').classList.contains('hidden'), null, { timeout: 8000 }).then(() => true, () => false),
      'knocked out again (no revive left): game over');

    console.log('2b. Knocked out standing in explosions');
    // An enemy's explosion zones (Player.hurt after invuln = 0, as js/systems/hazards.js does) landing on you
    // every 150 ms: the revive gets you up and its grace (js/fork/revive-grace.js) keeps you up for 3 s.
    // Before the grace, the next explosion knocked you straight back down, as if there had been no revive.
    await startRun(page, true);
    const z = await page.evaluate(async () => {
      const pl = G.Game.player, def = G.Enemies.cast[0].list[0];
      const e = new G.Enemy(def, pl.x + 300, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      pl.god = false; pl.selfRevive = 1; pl.hp = 1; pl.invuln = 0;
      let up = null, downs = 0, wasDead = false;
      const t0 = performance.now();
      while (performance.now() - t0 < (up === null ? 2000 : up + 2800)) {     // up to 2.8 s after the revive
        e.hazard({ kind: 'zone', x: pl.x, y: pl.y, r: 62, delay: 0.05, dmg: pl.maxHp * 2, type: 'fire', color: '#ff7b3d', boom: true });
        await new Promise(r => setTimeout(r, 150));
        if (pl.dead && !wasDead) downs++;
        wasDead = pl.dead;
        if (up === null && pl.selfRevive === 0 && !pl.dead) up = performance.now() - t0;
        if (G.Game.state !== 'playing') break;
      }
      return { up: up && Math.round(up), downs, dead: pl.dead, held: pl.selfRevive, state: G.Game.state };
    });
    check(z.up !== null && z.held === 0, 'the explosion knocks you out and the revive gets you up', z);
    check(z.downs === 0 && !z.dead && z.state === 'playing', 'explosions every 150 ms for the next 3 s: you stay up (the old 3 s invuln, cleared by each explosion, did not)', z);

    console.log('3. Normal run');
    await startRun(page, false);
    const n = await page.evaluate(() => { const pl = G.Game.player; G.ReviveCard.forceNext(); return G.LevelUp.offer(pl).some(x => x.key === 'rare:revive'); });
    check(!n, 'in a normal run the card never comes up');
    check(!page.errs.length, 'no page errors', page.errs);
    await page.close();

    console.log('4. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'rvh' + tag, 4, [], []), guest = await player(browser, 'rvg' + tag, 7, [], []);
      for (const p of [host, guest]) await p.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', true); });
      const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
      const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
      if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
      for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
      await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
        G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
      await guest.click('#lobby-ready');
      await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
      await host.click('#lobby-ready');
      const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active && G.Lab.active, null, 20000)));
      check(both.every(Boolean), 'a co-op Lab run starts');
      await host.waitForTimeout(3500);
      await host.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; p.god = true; p.x += 2000; });
      await host.waitForTimeout(600);
      const gu = await guest.evaluate(() => G.Social.uid);
      await guest.evaluate(() => { const pl = G.Game.player; pl.selfRevive = 1; pl.invuln = 0; pl.god = false; pl.hurt(1e7, null, true); });
      const down = await guest.evaluate(() => ({ dead: G.Game.player.dead, held: G.Game.player.selfRevive }));
      check(down.dead && down.held === 1, 'in co-op the guest stays down, the revive still held (theirs to use)', down);
      check(await settle(host, u => G.Coop.mate(u).pl.dead, gu), 'the host sees the guest down');
      const btn = await guest.evaluate(() => new Promise(res => { const raw = G.I18n.rawCanvas, seen = [];
        G.I18n.rawCanvas = function (c, m, t) { seen.push(String(t)); return raw.apply(this, arguments); };
        requestAnimationFrame(() => { G.I18n.rawCanvas = raw; res(seen.includes('Use your Revive  [R]')); }); }));
      check(btn, 'the guest sees "Use your Revive [R]"');
      await guest.keyboard.press('KeyR');
      const upNow = await settle(guest, () => !G.Game.player.dead, null, 3000);
      check(upNow, 'R: the guest is up');
      check(await settle(host, u => !G.Coop.mate(u).pl.dead, gu, 5000), 'and the host sees the guest up');
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Revive card checks passed');
  process.exit(failures ? 1 : 0);
})();
