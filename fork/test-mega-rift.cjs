#!/usr/bin/env node
// Mega/Primal rift legendaries (js/fork/lab/mega-rift.js, Lab first), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-mega-rift.cjs [base-url]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. The odds: none before 15:00, 5% at 15, 15% at 30, 30% at 60.
//   2. Lab run: a rift legendary with a Mega (Mewtwo), added as rift.js adds it: on a hit it's Mega
//      Mewtwo (×1.3 HP, ×1.2 damage, ×1.2 XP, its Mega sprite); never before 15:00; never in a normal run.
//   3. Co-op: the host's Mega Mewtwo shows as Mega on the guest's screen.
const http = require('http');
const up = url => new Promise(r => http.get(url, res => { res.resume(); r(true); }).on('error', () => r(false)));
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
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

// A rift legendary (Mewtwo, which has a Mega) added the way rift.js does, with the arena forced on.
async function legend(page, t, roll) {
  return page.evaluate(([t, roll]) => {
    const pl = G.Game.player;
    G.Game.debugTime(t);
    const was = Object.getOwnPropertyDescriptor(G.Rift, 'inArena');
    Object.defineProperty(G.Rift, 'inArena', { configurable: true, get: () => true });
    const r = Math.random; Math.random = () => roll;
    const def = { dex: 150, name: 'Mewtwo', hp: 5000, spd: 60, dmg: 40, xp: 600, behavior: 'charger' };
    const e = new G.Enemy(def, pl.x + 400, pl.y, { hp: 1, spd: 1, dmg: 1 }, true);
    e.legend = true;
    try { G.EnemyMgr.add(e); } finally { Math.random = r; Object.defineProperty(G.Rift, 'inArena', was); }
    const out = { form: e.megaForm || null, hp: e.maxHp, dmg: e.dmg, xp: e.xp, name: e.name, key: e.anim && e.anim.dex, id: e.id };
    return out;
  }, [t, roll]);
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
    await page.waitForFunction(() => G.DB.save && G.MegaRift, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });

    console.log('1. The odds');
    const c = await page.evaluate(() => [899, 900, 1350, 1800, 2700, 3600, 5000].map(t => +G.MegaRift.chance(t).toFixed(3)));
    check(JSON.stringify(c) === JSON.stringify([0, 0.05, 0.1, 0.15, 0.225, 0.3, 0.3]), 'none before 15:00; 5% at 15, 15% at 30, 30% at 60 (straight lines between)', c);

    console.log('2. A Lab run');
    const run = lab => page.evaluate(lab => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', lab); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; }));
    await run(true);
    const plain = await legend(page, 1800, 0.99), mega = await legend(page, 1800, 0);
    check(!plain.form && mega.form === 'Mega', 'at 30:00, a miss stays Mewtwo, a hit is Mega', { plain: plain.form, mega: mega.form });
    check(Math.abs(mega.hp / plain.hp - 1.3) < 0.01 && Math.abs(mega.dmg / plain.dmg - 1.2) < 0.01 && Math.abs(mega.xp / plain.xp - 1.2) < 0.01,
      'Mega: ×1.3 HP, ×1.2 damage, ×1.2 XP', { plain, mega });
    check(mega.name === 'Mega Mewtwo' && mega.key === 'm150', 'it is called Mega Mewtwo and drawn with its Mega sprite', { name: mega.name, key: mega.key });
    const early = await legend(page, 800, 0);
    check(!early.form, 'before 15:00, never (even on the luckiest roll)', early.form);
    await run(false);
    const off = await legend(page, 3600, 0);
    check(!off.form, 'a normal run: never', off.form);
    check(!page.errs.length, 'no page errors', page.errs);
    await page.close();

    console.log('3. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'mrh' + tag, 4, [], []), guest = await player(browser, 'mrg' + tag, 7, [], []);
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
      const hm = await legend(host, 1800, 0);
      const seen = await settle(guest, id => { const e = G.EnemyMgr.get(id); return e && e.megaForm === 'Mega' && e.anim.dex === 'm150'; }, hm.id, 8000);
      check(hm.form === 'Mega' && seen, 'the host\'s Mega Mewtwo is Mega on the guest\'s screen too', hm);
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Mega rift checks passed');
  process.exit(failures ? 1 : 0);
})();
