#!/usr/bin/env node
// What knocked you out (js/fork/death-cause.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-death-cause.cjs [base-url]
//   (co-op part, optional: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
// Three runs, each ended by a different real hit: an enemy's touch, an enemy's shot, an enemy's
// area attack (Enemy.hazard). Each time: the popup names the enemy and how ("Knocked out by X
// (contact)"), and the game-over screen has "What knocked you out" with the last hits.
// Co-op: a guest knocked out by the host's boss's area attack sees the boss's name too (the 'hz'
// message carries who).
const { chromium, pastStart } = require('./pw.cjs');
const http = require('http');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);
const up = url => new Promise(r => http.get(url, res => { res.resume(); r(true); }).on('error', () => r(false)));

/** In the page: an enemy next to you that hits by `how`, hard enough to knock you out. */
async function dieBy(page, how) {
  return page.evaluate(async how => {
    const pl = G.Game.player, frame = () => new Promise(r => requestAnimationFrame(() => r()));
    const toasts = [];
    const toast = G.UI.toast;
    G.UI.toast = function (msg) { toasts.push(String(msg)); return toast.apply(this, arguments); };
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Hazards.clear();
    const def = G.Enemies.cast[0].list[0];
    const dx = how === 'touch' ? 6 : 140;
    const e = new G.Enemy(def, pl.x + dx, pl.y, G.Enemies.scale(0));
    e.hp = e.maxHp = 1e7; e.spd = 0; e.dmg = 5e5; G.EnemyMgr.add(e);
    pl.god = false; pl.invuln = 0; pl.hp = pl.maxHp;
    window.__keep = false;
    if (how === 'shot') e.shoot(pl.x - e.x, pl.y - e.y);
    if (how === 'area') e.hazard({ kind: 'zone', x: pl.x, y: pl.y, r: 60, delay: 0.3, dmg: 5e5, type: 'normal', color: '#ff5050' });
    for (let i = 0; i < 300 && pl.hp > 0; i++) { pl.invuln = 0; await frame(); }
    G.UI.toast = toast;
    return { hp: pl.hp, name: e.name, killedBy: pl.killedBy || null, log: (pl.deathLog || []).map(h => h.how), toasts };
  }, how);
}

async function newRun(page) {
  await page.evaluate(() => { G.UI.hideAll && G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false }); });
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Game.player.hp > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    G.Spawner.update = () => {};
    window.__keep = true;
    (function alive() { const p = G.Game.player; if (window.__keep && p) { p.invuln = 99; p.hp = p.maxHp; } if (window.__keep) requestAnimationFrame(alive); })();
  });
  await page.waitForTimeout(3300);                       // past the start countdown
}

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save; s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'test' }; G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.DB.commit(); });

    const HOW = { touch: 'contact', shot: 'shot', area: 'area attack' };
    for (const how of ['touch', 'shot', 'area']) {
      console.log(`Knocked out by ${HOW[how]}`);
      await newRun(page);
      const d = await dieBy(page, how);
      check(d.hp <= 0 && d.killedBy && d.killedBy.how === how && d.killedBy.name === d.name, `the last hit is recorded: ${d.name}, ${how}`, d);
      check(d.toasts.some(t => t === `Knocked out by ${d.name} (${HOW[how]}).`), 'the popup says who and how', d.toasts);
      const over = await settle(page, () => !document.getElementById('scr-over').classList.contains('hidden'), null, 15000);
      const txt = over ? await page.textContent('#over-stats') : '';
      check(over && txt.includes('What knocked you out') && txt.includes(`${d.name} (${HOW[how]})`) && txt.includes('Last hits'),
        'the game-over screen shows what knocked you out and the last hits', txt.replace(/\s+/g, ' ').slice(0, 160));
    }
    check(!errors.length, 'no page errors', errors);
    await page.close();

    console.log('Co-op: a guest knocked out by the host\'s boss attack');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'dh' + tag, 4), guest = await player(browser, 'dg' + tag, 7);
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
      await host.waitForTimeout(3500);
      await host.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); const p = G.Game.player; p.god = true; p.x += 1500; });
      const gu = await guest.evaluate(() => G.Social.uid);
      await host.waitForTimeout(600);
      const name = await host.evaluate(u => {
        const g = G.Coop.mate(u).pl, def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, g.x + 200, g.y, G.Enemies.scale(0), true);
        e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
        e.hazard({ kind: 'zone', x: g.x, y: g.y, r: 80, delay: 0.6, dmg: 5e5, type: 'normal', color: '#ff5050' });
        return e.name;
      }, gu);
      const down = await settle(guest, () => G.Game.player.hp <= 0 || G.Game.player.dead, null, 8000);
      const k = await guest.evaluate(() => G.Game.player.killedBy);
      check(down && k && k.how === 'area' && k.name === name && k.boss, 'the guest knows the boss and its area attack', { k, name });
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll death cause checks passed');
  process.exit(failures ? 1 : 0);
})();
