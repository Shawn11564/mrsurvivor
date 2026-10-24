#!/usr/bin/env node
// Temples, dungeons and wormholes on the map (js/fork/lab/sites.js) and relics (js/fork/lab/relics.js), in headless Edge
// on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-sites.cjs [base-url] [--solo]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. When: none before 20:00, in a normal run, or in the 190 s before the Eternatus raid; at 21:40 one rises
//      1100-1500 px from you with 2:30 to reach it, and sinks if nobody comes.
//   2. The seal (a temple, the real spawner on): walking in closes it, the horde is driven off and nothing else
//      spawns, you can't leave; the guardian is a Regi. Its seal takes 90 % off a hit; the four plates light one by
//      one while you stand on them (3 s each, dark at 2 s), all four expose it (×1.25, stunned), one hit takes at most 8 % (the final number).
//   3. Beating it: a relic pick (the level-up hand that opens is 3 relics, one from the temple's pool; taking one
//      applies it and counts it), +2 gems, then the seal opens and the horde comes back.
//   4. A dungeon: wave 1 (10), wave 2 (14, every one with an affix), then the Dungeon Lord, whose allies cut the damage
//      it takes by 15 % each.
//   5. A wormhole: it dives (out of reach, hits do nothing) and leaves an Ultra Core, then comes out of a wormhole;
//      a core that bursts gives it a Beast Boost (×1.12 damage).
//   6. Time running out: no reward, the seal opens.
//   7. The Eternatus raid waits for a site fight that runs into 30:00.
//   8. Co-op: the host's site on the guest's map; the guest walking in starts it for both; the guest standing on a
//      plate lights it on the host; the guardian dressed on the guest's screen; beating it gives both a relic hand;
//      a wormhole's dive hides the beast on the guest's screen too.
const http = require('http');
const up = url => new Promise(r => http.get(url, res => { res.resume(); r(true); }).on('error', () => r(false)));
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

const HELPERS = () => {
  window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__S = () => G.LabSites.site;
  window.__guard = () => { const s = __S(); return s && G.EnemyMgr.get(s.guard); };
  window.__lost = k => { const e = __guard(); const h = e.hp; e.hurt(e.maxHp * k); return +((h - e.hp) / e.maxHp).toFixed(4); };
  window.__enter = async () => { const s = __S(), p = G.Game.player; p.x = s.x; p.y = s.y + 8; return __wait(() => __S() && __S().phase === 'fight', 6000); };
  window.__mine = () => G.EnemyMgr.all().filter(e => !e.dead && __S() && e._site === __S().id && !e._siteGuard);
};

async function solo(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.LabSites && G.LabRelics, null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
    window.__run = async (lab, t, spawn = false) => {
      if (G.Game.state !== 'ui') {
        G.UI.hideAll(); G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui');
      }
      G.Settings.set('underdogLadder', false);
      G.Settings.set('lab', lab);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      await __wait(() => G.Game.state === 'playing');
      G.Game.debugTime(t);
      const pl = G.Game.player; pl.god = true;
      window.__xpMul = pl.xpMul; pl.xpMul = 0;            // no level-up cards freezing the world (part 3 gives it back)
      window.__spawn = window.__spawn || G.Spawner.update;
      G.Spawner.update = spawn ? window.__spawn : () => {};
      G.EnemyMgr.clear(); G.LabPower.reset();
      return pl;
    };
  });

  console.log('1. When');
  const when = await page.evaluate(async () => {
    const out = {};
    await __run(true, 1100); G.LabSites.debugNext(0.1); await __sleep(1200); out.early = !!__S();
    G.Game.debugTime(1300); G.LabSites.debugNext(0.1);
    await __wait(() => __S(), 4000);
    const s = __S(), pl = G.Game.player;
    out.open = s && { kind: s.kind, phase: s.phase, d: Math.round(Math.hypot(s.x - pl.x, s.y - pl.y)), ttl: Math.round(s.ttl) };
    if (s) s.ttl = 0.3;
    await __sleep(800); out.sank = !__S();
    G.Game.debugTime(1650); G.LabSites.debugNext(0.1); await __sleep(1200); out.raidSoon = !!__S();
    await __run(false, 1300); G.LabSites.debugNext(0.1); await __sleep(1200); out.normal = !!__S();
    return out;
  });
  check(!when.early, 'none before 20:00', when);
  check(when.open && G_KINDS.includes(when.open.kind) && when.open.phase === 'open' && when.open.d >= 1090 && when.open.d <= 1510 && when.open.ttl >= 148 && when.open.ttl <= 150,
    'at 21:40 one rises 1100-1500 px away with 2:30 to reach it', when.open);
  check(when.sank, 'nobody comes: it sinks back');
  check(!when.raidSoon && !when.normal, 'none in the 190 s before the Eternatus raid, none in a normal run', when);

  console.log('2. The seal and the temple');
  const t2 = await page.evaluate(async () => {
    const pl = await __run(true, 1300, true);
    await __wait(() => G.EnemyMgr.all().length >= 5, 10000);
    const before = G.EnemyMgr.all().length;
    G.LabSites.debugOpen('temple');
    const fought = await __enter();
    await __sleep(2000);
    const s = __S(), g = __guard();
    const strays = G.EnemyMgr.all().filter(e => !e.dead && e._site !== s.id).length;
    pl.x = s.x + G.LabSites.R + 300; pl.y = s.y;
    await __sleep(150);
    const inside = Math.hypot(pl.x - s.x, pl.y - s.y) <= G.LabSites.R;
    const out = { before, fought, strays, inside, guard: g && { dex: g.dex, boss: g.boss, cap: g._hitCap } };
    g.stunT = 1e9;
    out.sealed = __lost(0.02);
    out.lit = [];
    // A plate takes 3 s to light, like a revive (2026-10-24; it was 1.3 s): dark at 2 s, lit by 3.3 s.
    out.at2 = [];
    for (const p of s.ks.plates) {
      pl.x = p.x; pl.y = p.y;
      await __sleep(2000); out.at2.push(p.lit > 0);
      await __sleep(1300); out.lit.push(s.ks.plates.filter(q => q.lit > 0).length + (s.ks.ex > 0 ? 10 : 0));
    }
    out.ex = +s.ks.ex.toFixed(1);
    // Alone, at your own speed: standing 3 s (4 s below half HP) on each and walking plate to plate, the
    // first is still lit when the fourth lights (the real plates; the walk is from one plate's edge to the next).
    const S = G.LabSites, ps = s.ks.plates, walk = [0, 1, 2].reduce((a, i) => a + Math.max(0, Math.hypot(ps[i + 1].x - ps[i].x, ps[i + 1].y - ps[i].y) - 2 * S.PLATE_R), 0) / pl.spd;
    out.solo = [0, 1].map(i => ({ need: +(4 * S.STAND[i] + walk).toFixed(1), lit: S.LIT[i] }));
    out.stun = g.stunT > 0;
    out.exposed = __lost(0.02);
    out.cap = __lost(1e9);
    return out;
  });
  check(t2.fought && t2.before >= 5 && t2.strays === 0, 'walking in closes the seal: the horde is driven off and nothing else spawns', t2);
  check(t2.inside, 'nobody leaves the seal', t2.inside);
  check(t2.guard && [377, 378, 379, 486, 894, 895].includes(t2.guard.dex) && t2.guard.boss && t2.guard.cap === 0.08, 'the guardian is a Regi (a boss, at most 8 % a hit)', t2.guard);
  check(Math.abs(t2.sealed - 0.002) < 0.0003, 'its seal takes 90 % off a hit (2 % → 0.2 %)', t2.sealed);
  check(t2.solo && t2.solo.every(x => x.need < x.lit - 1.5), 'one player alone can light all four in time (both stages, at its speed)', t2.solo);
  check(t2.at2.length === 4 && t2.at2.every(l => !l), 'a plate is still dark after 2 s on it (it takes 3 s, like a revive)', t2.at2);
  check(t2.lit.join() === '1,2,3,10' && t2.ex > 8, 'standing on the plates lights them one by one (3 s each, the first still lit at the fourth); all four expose it', t2);
  check(Math.abs(t2.exposed - 0.025) < 0.0005 && Math.abs(t2.cap - 0.08) < 0.0005, 'exposed it takes ×1.25 (2 % → 2.5 %), and one hit at most 8 % of it', t2);

  console.log('3. Beating it');
  const t3 = await page.evaluate(async () => {
    const pl = G.Game.player, gems = G.DB.save.gems | 0;
    pl.xpMul = __xpMul;
    const g = __guard(); g.hp = 1; g.hurt(1e9);
    await __wait(() => __S() && __S().phase === 'won', 3000);
    const pick = (pl._labRelicPick || []).slice();
    const open = await __wait(() => G.UI.isOpen('scr-levelup'), 8000);
    const cards = [...document.querySelectorAll('#cards .card')].map(el => el.querySelector('.nm').textContent.replace(/\s+/g, ' ').trim());
    const hand = G.LabRelics.DEF;
    const names = Object.values(hand).map(d => d.n);
    const temple = G.LabRelics.POOL.temple.map(id => hand[id].n);
    await __sleep(1100);
    const atk = pl.atkMul, hp = pl.maxHp;
    G.RunUI.pick(0);
    await __sleep(200);
    const got = G.LabRelics.of(pl);
    // (The guardian's XP gives a level-1 Charmander many levels: the next hands are the usual cards.)
    // (And the boss's held item asks to swap: keep the one you have.)
    for (let i = 0; i < 40 && __S(); i++) {
      if (G.UI.isOpen('scr-levelup')) { await __sleep(1050); G.RunUI.pick(0); }
      else if (G.UI.isOpen('scr-item')) { await __sleep(1050); const c = document.querySelector('#item-cards .card'); if (c) c.click(); }
      await __sleep(250);
    }
    const back = await __wait(() => !__S(), 8000);
    await __sleep(800);
    const diag = { state: G.Game.state, screens: [...document.querySelectorAll('.scr')].filter(e => !e.classList.contains('hidden')).map(e => e.id).join('+'),
      phase: __S() && __S().phase, endT: __S() && __S().endT, level: pl.level };
    return { diag, pick, open, cards, isRelic: cards.every(c => names.some(n => c.startsWith(n))), fromTemple: cards.some(c => temple.some(n => c.startsWith(n))),
      got, left: (pl._labRelicPick || []).length, gems: (G.DB.save.gems | 0) - gems, back, horde: G.EnemyMgr.all().filter(e => !e.dead).length, changed: pl.atkMul !== atk || pl.maxHp !== hp || Object.keys(got).length > 0 };
  });
  check(t3.pick.join() === 'temple' && t3.gems >= 2, 'beaten: a relic pick from the temple and +2 gems', t3);
  check(t3.open && t3.cards.length === 3 && t3.isRelic && t3.fromTemple, 'the level-up that opens is 3 relics, one from the temple\'s pool', t3.cards);
  check(Object.keys(t3.got).length === 1 && t3.left === 0, 'taking one applies it and counts it (pause menu)', t3.got);
  check(t3.back && t3.horde > 0, 'then the seal opens and the horde comes back', t3);

  console.log('4. The dungeon');
  const t4 = await page.evaluate(async () => {
    await __run(true, 1300);
    G.LabSites.debugOpen('dungeon');
    await __enter();
    await __wait(() => __mine().length >= 10, 5000);
    const w1 = __mine().length;
    for (const e of __mine()) e.hurt(1e15);
    await __wait(() => __S().ks.wave === 2 && __mine().length > 2, 6000);
    const w2 = __mine(), aff = w2.filter(e => e.affix).length;
    for (let i = 0; i < 6 && !__guard(); i++) { for (const e of G.EnemyMgr.all()) if (!e._siteGuard) e.hurt(1e15); await __sleep(400); }
    await __wait(() => __guard(), 5000);
    const g = __guard();
    g.stunT = 1e9;
    await __wait(() => __S().ks.allies >= 3, 9000);
    const allies = __S().ks.allies, withAllies = __lost(0.02);
    for (const e of __mine()) e.hurt(1e15);
    await __wait(() => __S().ks.allies === 0, 3000);
    const alone = __lost(0.02);
    g.hp = 1; g.hurt(1e9);
    await __wait(() => __S() && __S().phase === 'won', 3000);
    return { w1, w2: w2.length, aff, lord: g && [248, 445, 373, 376, 635, 706, 784, 887, 998, 149].includes(g.dex), allies, withAllies, alone, won: __S() && __S().phase,
      pick: (G.Game.player._labRelicPick || []).slice() };
  });
  check(t4.w1 === 10 && t4.w2 === 14 && t4.aff === 14, 'wave 1: 10; wave 2: 14, every one with an affix', t4);
  check(t4.lord && t4.allies >= 3 && Math.abs(t4.withAllies - 0.02 * (1 - Math.min(0.6, 0.15 * t4.allies))) < 0.0005 && Math.abs(t4.alone - 0.02) < 0.0005,
    'then the Dungeon Lord: each ally cuts its damage taken by 15 %', t4);
  check(t4.won === 'won' && t4.pick.join() === 'dungeon', 'beating it gives a dungeon relic pick', t4);

  console.log('5. The wormhole');
  const t5 = await page.evaluate(async () => {
    await __run(true, 1300);
    G.LabSites.debugOpen('wormhole');
    await __enter();
    await __wait(() => __guard(), 4000);
    const s = __S(), g = __guard();
    s.ks.diveT = 0;
    await __wait(() => g._diving, 2000);
    const dive = { diving: g._diving, far: Math.hypot(g.x - s.x, g.y - s.y) > 10000, cores: s.ks.cores.length };
    const h = g.hp; g.hurt(g.maxHp * 0.05); dive.ignored = g.hp === h;
    await __wait(() => !g._diving, 3000);
    const at = s.ks.portals.map(p => Math.round(Math.hypot(p.x - g.x, p.y - g.y)));
    const emerge = { out: !g._diving, nearPortal: Math.min(...at) < 30 };
    const dmg = g.dmg, c = G.EnemyMgr.get(s.ks.cores[0]);
    if (c) c.fuse = 0.05;
    await __wait(() => s.ks.boost === 1, 2000);
    return { dive, emerge, boost: s.ks.boost, dmgK: +(g.dmg / dmg).toFixed(3), core: !!c };
  });
  check(t5.dive.diving && t5.dive.far && t5.dive.cores === 1 && t5.dive.ignored, 'it dives out of reach (a hit does nothing) and leaves an Ultra Core', t5.dive);
  check(t5.emerge.out && t5.emerge.nearPortal, 'and comes out of a wormhole', t5.emerge);
  check(t5.core && t5.boost === 1 && t5.dmgK === 1.12, 'a core that bursts gives it a Beast Boost (×1.12 damage)', t5);

  console.log('6. Time running out');
  const t6 = await page.evaluate(async () => {
    const pl = await __run(true, 1300);
    G.LabSites.debugOpen('temple');
    await __enter();
    await __wait(() => __guard(), 3000);
    G.LabSites.debugTimeLeft(0);
    await __wait(() => __S() && __S().phase === 'lost', 3000);
    const lost = __S() && __S().phase;
    await __wait(() => !__S(), 4000);
    return { lost, gone: !__S(), pick: (pl._labRelicPick || []).length };
  });
  check(t6.lost === 'lost' && t6.gone && t6.pick === 0, 'time runs out: no reward, the seal opens', t6);

  console.log('7. The raid waits');
  const t7 = await page.evaluate(async () => {
    await __run(true, 1790);
    G.LabSites.debugOpen('temple');
    await __enter();
    await __wait(() => __guard(), 3000);
    G.Game.debugTime(1801);
    await __sleep(1500);
    const during = G.Eternatus.active;
    const g = __guard(); g.hp = 1; g.hurt(1e9);
    await __wait(() => !__S(), 8000);
    G.UI.hideAll();
    const after = await __wait(() => G.Eternatus.active, 5000);
    return { during, after };
  });
  check(!t7.during && t7.after, 'a site fight running into 30:00 finishes before the Eternatus raid starts', t7);
  check(!errors.length, 'no page errors', errors);
  await page.close();
}
const G_KINDS = ['temple', 'dungeon', 'wormhole'];

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LabSites, null, { timeout: 30000 });
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
  await page.evaluate(HELPERS);
  return page;
}

async function coop(browser) {
  console.log('8. Co-op');
  if (!(await up('http://127.0.0.1:9099/'))) { console.log('  (skipped: no Firebase emulator)'); return; }
  const host = await player(browser, 'sih' + tag, 4), guest = await player(browser, 'sig' + tag, 7);
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
  await host.waitForTimeout(3000);
  for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; window.__xpMul = G.Game.player.xpMul; G.Game.player.xpMul = 0; });
  await host.evaluate(() => { G.Game.debugTime(1300); for (const e of G.EnemyMgr.all()) e.hurt(1e15); G.LabSites.debugOpen('temple'); });
  const seen = await settle(guest, () => __S() && __S().phase === 'open', null, 6000);
  const same = await Promise.all([host, guest].map(p => p.evaluate(() => __S() && [__S().id, __S().x, __S().y, __S().kind].join())));
  check(seen && same[0] === same[1], 'the host\'s site is on the guest\'s map', same);
  await guest.evaluate(() => __enter());
  const fight = await Promise.all([host, guest].map(p => settle(p, () => __S() && __S().phase === 'fight', null, 6000)));
  check(fight.every(Boolean), 'the guest walking in starts the fight for both', fight);
  const dressed = await settle(guest, () => { const g = __guard(); return g && g._dressed && g.remote; }, null, 8000);
  check(dressed, 'the guardian is on the guest\'s screen, sealed');
  await host.evaluate(() => { const g = __guard(); g.stunT = 1e9; });
  await guest.evaluate(() => { const p = __S().ks.plates[0], pl = G.Game.player; pl.x = p.x; pl.y = p.y; });
  const litHost = await settle(host, () => __S().ks.plates[0].lit > 0, null, 6000);
  const litGuest = await settle(guest, () => __S().ks.plates[0].lit > 0, null, 3000);
  check(litHost && litGuest, 'the guest standing on a plate lights it on the host (and the guest sees it lit)', { litHost, litGuest });
  await host.evaluate(() => { G.Game.player.xpMul = __xpMul; const g = __guard(); g.hp = 1; g.hurt(1e9); });   // (XP back for the reward's level)
  const won = await Promise.all([host, guest].map(p => settle(p, () => (G.Game.player._labRelicPick || []).length === 1 || Object.keys(G.LabRelics.of(G.Game.player)).length > 0, null, 6000)));
  const hands = await Promise.all([host, guest].map(p => p.evaluate(async () => {
    await __wait(() => G.UI.isOpen('scr-levelup'), 10000);
    const n = [...document.querySelectorAll('#cards .card')].filter(el => /Relic/.test(el.textContent)).length;
    await __sleep(1100);
    if (n) G.RunUI.pick(0);
    // (The guardian's XP gives more levels: the next hands are the usual cards.)
    for (let i = 0; i < 60 && __S(); i++) { if (G.UI.isOpen('scr-levelup') && !document.getElementById('cards').classList.contains('done')) { await __sleep(1050); G.RunUI.pick(0); } await __sleep(250); }
    return n;
  })));
  check(won.every(Boolean) && hands.every(n => n === 3), 'beating it: both get a relic pick and a relic hand', { won, hands });
  const back = await Promise.all([host, guest].map(p => settle(p, () => !__S(), null, 10000)));
  check(back.every(Boolean), 'both back on the map', back);
  await host.evaluate(async () => { await __wait(() => G.Game.state === 'playing', 8000); G.LabSites.debugOpen('wormhole'); });
  await settle(guest, () => __S() && __S().kind === 'wormhole', null, 6000);
  await host.evaluate(() => __enter());
  await settle(guest, () => { const g = __guard(); return g && g.remote; }, null, 8000);
  await host.evaluate(async () => { await __wait(() => __guard(), 4000); __S().ks.diveT = 0; });
  const hid = await settle(guest, () => { const g = __guard(); return g && g._diving; }, null, 4000);
  const out = await settle(guest, () => { const g = __guard(); return g && !g._diving && Math.hypot(g.x - __S().x, g.y - __S().y) < G.LabSites.R; }, null, 5000);
  check(hid && out, 'a wormhole\'s dive hides the beast on the guest\'s screen, and it comes back out', { hid, out });
  check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!args.includes('--solo')) await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll site checks passed');
  process.exit(failures ? 1 : 0);
})();
