#!/usr/bin/env node
// The Eternatus raid (js/fork/lab/eternatus.js, Lab first), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-eternatus.cjs [base-url]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. Lab run: nothing at 29:50; at 30:00 the raid instead of Arceus (the run paused), Eternatus and 3
//      obelisks, you in the arena.
//   2. The obelisks heal it and don't move; all broken, no more healing.
//   3. The Eternabeam takes 75% of your HP in the open (death cause: Eternabeam); behind a crystal, nothing.
//   4. Beating it: a ×25 rainbow ticket, back to the map, the run goes on, no Arceus, rifts again.
//   5. Time runs out: the run ends (knocked out by Eternatus, time ran out).
//   6. A normal run: Arceus at 30:00 as always.
//   7. Co-op: the raid for both (the guest sees Eternatus and the obelisks), the beam warns the guest,
//      a ticket each when it falls, both back on the map together (no obelisks left behind).
//   3. Co-op: the host's wild legendary is on the guest's screen; the guest never spawns its own.
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

const st = page => page.evaluate(() => {
  const r = G.Eternatus.raid, pl = G.Game.player, s = G.DB.save;
  const boss = r && G.EnemyMgr.get(r.bossId);
  return { on: G.Eternatus.active, phase: r && r.phase, arceus: G.Judgment.cinematic || G.Judgment.summary() !== null, jActive: G.Judgment.active,
    boss: !!(boss && !boss.dead && boss.dex === 890 && boss.boss), obs: G.EnemyMgr.all().filter(e => e.obelisk && !e.dead).length,
    inside: !!r && Math.hypot(pl.x - r.x, pl.y - r.y) < 15 * G.Tiles.T * G.Sprites.PX, t25: (s.tickets && s.tickets.t25) | 0,
    done: !!pl._labEternatus, at: isFinite(G.Judgment.AT) ? G.Judgment.AT : 'never', state: G.Game.state, x: pl.x, y: pl.y };
});
// The raid's boss and obelisks (the host's: guests mark theirs from the 'ids' message).
const boss = page => page.evaluate(() => { const e = G.EnemyMgr.get(G.Eternatus.raid.bossId); return { hp: e.hp, max: e.maxHp }; });

/** Puts the player 200 px from Eternatus in the open (or right behind a crystal) and fires the Eternabeam: the HP lost, as a share. */
async function beam(page, hide) {
  await page.evaluate(hide => {
    const r = G.Eternatus.raid, e = G.EnemyMgr.get(r.bossId), pl = G.Game.player;
    pl.god = false; pl.hp = pl.maxHp; pl.invuln = 0; pl.deathLog = [];
    if (hide) {
      const c = r.crystals.slice().sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      pl.x = c.x + (c.x - e.x) / d * 44; pl.y = c.y + (c.y - e.y) / d * 44;
    } else {
      for (let i = 0; i < 64; i++) {
        const a = i / 64 * 6.2832, x = e.x + Math.cos(a) * 200, y = e.y + Math.sin(a) * 200;
        if (G.World.isFree(x, y, 16) && !G.Eternatus.shielded(e.x, e.y, x, y)) { pl.x = x; pl.y = y; break; }
      }
    }
    window.__shielded = G.Eternatus.shielded(e.x, e.y, pl.x, pl.y);
    G.Eternatus.debugBeam();
  }, hide);
  await page.waitForTimeout((3 + 0.6) * 1000);
  return page.evaluate(() => { const pl = G.Game.player, l = pl.deathLog || [];
    pl.god = true; const r = { lost: +(1 - pl.hp / pl.maxHp).toFixed(2), shielded: window.__shielded, how: l.length ? l[l.length - 1].how : null }; pl.hp = pl.maxHp; return r; });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    page.errs = [];
    page.on('pageerror', e => page.errs.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Eternatus, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
    const run = lab => page.evaluate(lab => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; p.god = true; p.xpMul = 0; G.EnemyMgr.clear(); }))
      .then(() => page.waitForTimeout(3300));

    console.log('1. A Lab run at 30:00');
    await run(true);
    await page.evaluate(() => G.Game.debugTime(1790));
    await page.waitForTimeout(1500);
    check(!(await st(page)).on, 'at 29:50: no raid yet');
    await page.evaluate(() => G.Game.debugTime(1800));
    await page.waitForFunction(() => G.Eternatus.active, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const s1 = await st(page);
    check(s1.on && !s1.arceus && s1.jActive, 'at 30:00 the Eternatus raid starts instead of Arceus (and the run pauses: waves, events, weather)', s1);
    check(s1.boss && s1.obs === 3 && s1.inside, 'Eternatus (a boss) and 3 obelisks, with you in the arena', s1);

    console.log('2. Obelisks');
    const o0 = await page.evaluate(() => G.EnemyMgr.all().filter(e => e.obelisk).map(e => [Math.round(e.x), Math.round(e.y)]).join());
    await page.evaluate(() => { const e = G.EnemyMgr.get(G.Eternatus.raid.bossId); e.hp = e.maxHp * 0.5; });
    await page.waitForTimeout(1000);
    const h1 = await boss(page);
    const o1 = await page.evaluate(() => G.EnemyMgr.all().filter(e => e.obelisk).map(e => [Math.round(e.x), Math.round(e.y)]).join());
    check(h1.hp / h1.max > 0.53, 'they heal Eternatus (3 × 1.5% a second)', +(h1.hp / h1.max).toFixed(3));
    check(o0 === o1, 'and stay where they are', { o0, o1 });
    await page.evaluate(() => { for (const e of G.EnemyMgr.all()) if (e.obelisk) e.hurt(1e9); const b = G.EnemyMgr.get(G.Eternatus.raid.bossId); b.hp = b.maxHp * 0.5; });
    await page.waitForTimeout(1000);
    const h2 = await boss(page);
    check(h2.hp / h2.max <= 0.501 && (await st(page)).obs === 0, 'all three broken: no more healing', +(h2.hp / h2.max).toFixed(3));

    console.log('3. Eternabeam');
    const open = await beam(page, false);
    check(!open.shielded && open.lost >= 0.7 && open.how === 'beam', 'in the open it takes 75% of your HP (death cause: Eternabeam)', open);
    const hid = await beam(page, true);
    check(hid.shielded && hid.lost < 0.1, 'right behind a crystal it misses you', hid);

    console.log('4. Winning');
    const t0 = (await st(page)).t25;
    await page.evaluate(() => G.EnemyMgr.get(G.Eternatus.raid.bossId).hurt(1e9));
    await page.waitForTimeout(1500);
    const w1 = await st(page);
    check(w1.phase === 'won' && w1.t25 === t0 + 1 && w1.done, 'beating Eternatus gives a ×25 rainbow ticket', { t0, w1 });
    await page.waitForFunction(() => !G.Eternatus.active, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const w2 = await st(page);
    check(!w2.on && !w2.arceus && !w2.jActive && w2.state === 'playing' && w2.at === 'never', 'then back to the map, the run goes on, Arceus never comes and rifts open again', w2);

    console.log('5. Losing');
    await run(true);
    await page.evaluate(() => G.Game.debugTime(1800));
    await page.waitForFunction(() => G.Eternatus.active, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { G.Game.player.god = false; G.Eternatus.debugTimeLeft(0); });
    const over = await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 8000 }).then(() => true, () => false);
    const why = await page.evaluate(() => G.Game.player && G.Game.player.killedBy && G.Game.player.killedBy.how);
    check(over && why === 'raid', 'time runs out: the run ends (knocked out by Eternatus, time ran out)', { over, why });

    console.log('6. A normal run');
    await run(false);
    await page.evaluate(() => G.Game.debugTime(1800));
    await page.waitForTimeout(2000);
    const n1 = await st(page);
    check(!n1.on && n1.arceus, 'at 30:00 Arceus\'s Judgment, as always', n1);
    check(!page.errs.length, 'no page errors', page.errs);
    await page.close();

    console.log('7. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'eth' + tag, 4, [], []), guest = await player(browser, 'etg' + tag, 7, [], []);
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
      for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; G.Game.player.xpMul = 0; });
      await host.evaluate(() => G.Game.debugTime(1800));
      const inRaid = await Promise.all([host, guest].map(p => settle(p, () => G.Eternatus.active, null, 8000)));
      const marked = await settle(guest, () => { const r = G.Eternatus.raid; return r && G.EnemyMgr.get(r.bossId) && G.EnemyMgr.all().filter(e => e.obelisk).length === 3; }, null, 8000);
      const gs = await st(guest);
      check(inRaid.every(Boolean) && marked && gs.inside && !gs.arceus, 'the raid starts for both; the guest is in the arena and sees Eternatus and its 3 obelisks', { inRaid, marked, gs });
      await host.evaluate(() => G.Eternatus.debugBeam());
      check(await settle(guest, () => !!G.Eternatus.raid.beam, null, 3000), 'the host\'s Eternabeam warns the guest too');
      await host.waitForTimeout(4000);
      const g0 = (await st(guest)).t25, h0 = (await st(host)).t25;
      await host.evaluate(() => G.EnemyMgr.get(G.Eternatus.raid.bossId).hurt(1e9));
      const won = await Promise.all([host, guest].map(p => settle(p, () => G.Eternatus.raid && G.Eternatus.raid.phase === 'won', null, 5000)));
      const back = await Promise.all([host, guest].map(p => settle(p, () => !G.Eternatus.active, null, 10000)));
      const [h1s, g1s] = [await st(host), await st(guest)];
      check(won.every(Boolean) && h1s.t25 === h0 + 1 && g1s.t25 === g0 + 1, 'Eternatus beaten: a ×25 rainbow ticket each', { won, h0, g0, h: h1s.t25, g: g1s.t25 });
      check(back.every(Boolean) && h1s.state === 'playing' && g1s.state === 'playing' && Math.hypot(h1s.x - g1s.x, h1s.y - g1s.y) < 300,
        'both back on the map together, the run goes on', { back, h1s, g1s });
      check(await settle(guest, () => !G.EnemyMgr.all().some(e => e.obelisk), null, 4000), 'the obelisks left standing are gone from the guest map too');
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Eternatus raid checks passed');
  process.exit(failures ? 1 : 0);
})();
