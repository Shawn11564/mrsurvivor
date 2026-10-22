#!/usr/bin/env node
// Gholdengo's rainbow ticket in co-op (js/fork/rainbow.js): a host and a guest in headless Edge,
// against the Firebase emulator (no real project is touched), as in fork/test-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-rainbow-coop.cjs [base-url]
//
//   1. The host (which runs the enemies) knocks out a Gholdengo whose roll gives the rainbow ticket:
//      both players get one, once, and no ×10 ticket is dropped.
//   2. One whose roll doesn't: nobody gets a rainbow ticket (the ×10 drops as usual).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Rainbow, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    G.DB.commit();
    G.Settings.set('lab', false);
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false, uid: G.DB.fb.uid };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'rbh' + tag, 4);
    const guest = await player(browser, 'rbg' + tag, 7);
    const ALL = [host, guest];
    const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
    for (const p of ALL) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    await host.waitForFunction(() => !document.getElementById('lobby-start').disabled, null, { timeout: 30000 });
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
    console.log('Party of 2 in a run');
    for (const p of ALL) await p.evaluate(() => { const pl = G.Game.player; (function alive() { pl.invuln = 99; pl.hp = pl.maxHp; requestAnimationFrame(alive); })(); });
    await host.evaluate(() => { G.Spawner.update = () => {}; });

    const t25 = () => Promise.all(ALL.map(p => p.evaluate(() => G.DB.save.tickets.t25 | 0)));
    // On the host (it owns the enemies): a Gholdengo as js/systems/events.js makes it, knocked out.
    const gholdengo = force => host.evaluate(force => {
      const pl = G.Game.player, def = { dex: 1000, name: 'Gholdengo', behavior: 'thief', hp: 90, spd: 0, dmg: 0, xp: 10, loot: 'ticket10' };
      const before = G.Pickups.all().filter(x => x.kind === 'ticket10').length;
      const e = new G.Enemy(def, pl.x + 160, pl.y, { hp: 1, spd: 1, dmg: 1 });
      G.EnemyMgr.add(e);
      if (force) G.Rainbow.forceGold();
      const r = Math.random;
      if (!force) Math.random = () => 0.5;                // the roll misses
      try { e.hurt(e.maxHp * 10); } finally { Math.random = r; }
      return { dead: e.dead, t10: G.Pickups.all().filter(x => x.kind === 'ticket10').length - before };
    }, force);

    console.log('1. A rainbow Gholdengo');
    const b1 = await t25();
    const k1 = await gholdengo(true);
    await guest.waitForFunction(n => (G.DB.save.tickets.t25 | 0) > n, b1[1], { timeout: 8000 }).catch(() => {});
    await host.waitForTimeout(1500);                        // and no second one arrives
    const a1 = await t25();
    check(k1.dead && k1.t10 === 0, 'knocked out, with no ×10 ticket dropped', k1);
    check(a1[0] - b1[0] === 1, 'the host gets one rainbow ticket', { before: b1[0], after: a1[0] });
    check(a1[1] - b1[1] === 1, 'the guest gets one too (sent by the host)', { before: b1[1], after: a1[1] });

    console.log('2. A normal Gholdengo');
    const k2 = await gholdengo(false);
    await host.waitForTimeout(2000);
    const a2 = await t25();
    check(k2.dead && k2.t10 === 1 && a2[0] === a1[0] && a2[1] === a1[1], 'its ×10 ticket drops and nobody gets a rainbow one', { k2, before: a1, after: a2 });

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})`, p.errs.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
