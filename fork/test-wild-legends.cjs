#!/usr/bin/env node
// Wild legendaries on the map (js/fork/lab/wild-legends.js, Lab first), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-wild-legends.cjs [base-url]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. Lab run: none before 15:00; at 15:00 one (a legendary, as a boss but not a rift legend, 650-850
//      px away, its own HP); 75 s later a second; never more than 2; one beaten, another after the gap;
//      they don't count as a boss fight (rifts, events and waves carry on).
//   2. A normal run: none.
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

const wild = page => page.evaluate(() => G.EnemyMgr.all().filter(e => e.wildLegend && !e.dead).map(e => ({ id: e.id, dex: e.dex, boss: !!e.boss, legend: !!e.legend,
  rar: (G.DEX_BY[e.dex] || {}).rarity, hp: e.maxHp, d: e.spawnD })));

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
    await page.waitForFunction(() => G.DB.save && G.WildLegends, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });
    const run = lab => page.evaluate(lab => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; p.god = true; p.xpMul = 0; G.EnemyMgr.clear(); }))
      .then(() => page.waitForTimeout(3300));

    console.log('1. Lab run');
    await run(true);
    await page.evaluate(() => G.Game.debugTime(800));
    await page.waitForTimeout(2200);
    check((await wild(page)).length === 0, 'before 15:00: none');
    await page.evaluate(() => G.Game.debugTime(901));
    await page.waitForTimeout(2200);
    const w1 = await wild(page), want = await page.evaluate(() => G.WildLegends.stats(G.Game.st.time, 1).hp);
    check(w1.length === 1 && w1[0].boss && !w1[0].legend && w1[0].rar === 5 && w1[0].d >= 650 && w1[0].d <= 850 && Math.abs(w1[0].hp - want) / want < 0.05,
      'at 15:00 one appears: a legendary, as a boss (not a rift legend), 650-850 px away, with its own HP', { w1, want });
    await page.evaluate(() => G.Game.debugTime(G.Game.st.time + 80));
    await page.waitForTimeout(2200);
    check((await wild(page)).length === 2, '75 s later, a second');
    await page.evaluate(() => G.Game.debugTime(G.Game.st.time + 80));
    await page.waitForTimeout(2200);
    check((await wild(page)).length === 2, 'never more than 2 alive');
    check(!(await page.evaluate(() => G.EnemyMgr.bossAlive())), 'they do not count as a boss fight (rifts, events and waves carry on)');
    await page.evaluate(() => { const e = G.EnemyMgr.all().find(x => x.wildLegend && !x.dead); e.hurt(1e9, '#fff'); G.Game.debugTime(G.Game.st.time + 80); });
    await page.waitForTimeout(2200);
    check((await wild(page)).length === 2, 'one beaten: another comes after the gap');
    check(!page.errs.length, 'no page errors', page.errs);

    console.log('2. Normal run');
    await run(false);
    await page.evaluate(() => G.Game.debugTime(1000));
    await page.waitForTimeout(2200);
    check((await wild(page)).length === 0, 'a normal run: none');
    await page.close();

    console.log('3. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'wlh' + tag, 4, [], []), guest = await player(browser, 'wlg' + tag, 7, [], []);
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
      for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; });
      const e = await host.evaluate(() => { const e = G.WildLegends.spawn(150); return { id: e.id, hp: e.maxHp }; });
      const seen = await settle(guest, id => { const x = G.EnemyMgr.get(id); return x && x.dex === 150 && x.boss; }, e.id, 8000);
      const guestSpawns = await guest.evaluate(() => { G.Game.debugTime(1000); return new Promise(r => setTimeout(() => r(G.EnemyMgr.all().filter(x => x.wildLegend).length), 2200)); });
      check(seen && guestSpawns === 0, 'the host\'s wild Mewtwo is on the guest\'s screen; the guest never spawns its own', { seen, guestSpawns });
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll wild legend checks passed');
  process.exit(failures ? 1 : 0);
})();
