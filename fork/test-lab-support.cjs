#!/usr/bin/env node
// Co-op support moves in Lab mode (js/fork/lab/support.js, fork/LAB.md "Co-op support moves", TODO 46),
// in headless Edge on dev.html: a solo page for where they may and may not show up, then two real players
// in a co-op Lab run against the Firebase emulator (no real project is touched), as fork/test-lab-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-lab-support.cjs [base-url] [--solo]      (--solo: only part 1, no emulator)
//
// 1. Solo: Heal Pulse, Aromatherapy, Wide Guard, Block and Helping Hand are registered (kind 'ally') and
//    their learnsets came through (Chansey learns Heal Pulse), but no species' Lab list has them; in a solo
//    Lab run and in a normal run, 300 level-up hands each never hold one.
// 2. Co-op Lab run (host and guest): about half the hands hold a co-op card for a move the species learns,
//    and taking it adds the move. Then each move cast by one player works on the other, both ways where it
//    matters: the guest's Heal Pulse heals the host (not the guest), the host's heals the guest; the guest's
//    Helping Hand gives the host ×1.3 damage; the host's Wide Guard blocks the guest's next 2 hits; the
//    guest's Block pulls the host's enemies off the host to the guest and the guest takes 35% less; the
//    host's Aromatherapy heals both.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const BASE = args.find(a => /^https?:/.test(a)) || require('./pw.cjs').BASE;
const SOLO = args.includes('--solo');
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const IDS = ['heal-pulse', 'aromatherapy', 'wide-guard', 'block', 'helping-hand'];

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (!ok && info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

/** Deals `n` hands to this page's player (free slots) and counts the co-op cards. */
const deal = (page, n) => page.evaluate(([n, ids]) => {
  const pl = G.Game.player;
  pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4;
  pl.addMove(G.Moves.ALL[0].id);
  let coop = 0, any = 0;
  const seen = new Set(), learn = G.Lab.learnOf(pl.mon.dex);
  for (let i = 0; i < n; i++) {
    const hand = G.LevelUp.offer(pl);
    const c = hand.filter(c => c.key && ids.includes(c.key.slice(4)));
    if (c.length) coop++;
    if (c.length || hand.some(c => c.coop)) any++;
    for (const x of c) seen.add(x.key.slice(4));
  }
  return { coop, any, seen: [...seen], learnsAll: [...seen].every(id => learn[id]), learns: ids.filter(id => learn[id]) };
}, [n, IDS]);

async function solo(browser) {
  console.log('1. Solo: where they may show up');
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* none */ } });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.Game && G.Lab && G.LabSupport, null, { timeout: 60000 }).catch(() => {});
  const reg = await page.evaluate(ids => {
    if (!window.G || !G.Lab) return { none: true };
    const defs = ids.map(id => G.Moves.BY_ID[id]);
    const inPools = [];
    for (const mon of G.DEX) for (const id of G.Lab.poolFor(mon)) if (ids.includes(id)) inPools.push(mon.dex + ':' + id);
    const learners = G.DEX.filter(mon => { const L = G.Lab.learnOf(mon.dex); return ids.some(id => L[id]); }).length;
    return { kinds: defs.map(d => d ? d.kind + (d.coop ? '/coop' : '') : null), inPools: inPools.slice(0, 5), nPools: inPools.length, learners,
             chansey: !!G.Lab.learnOf(113)['heal-pulse'], snorlax: !!G.Lab.learnOf(143).block, hasApi: !!window.G.LabSupport };
  }, IDS);
  check(reg.kinds && reg.kinds.every(k => k === 'ally/coop'), `the ${IDS.length} co-op moves are registered (kind 'ally', coop)`, reg.kinds);
  check(reg.chansey && reg.snorlax, 'their learnsets came through fetch-lab (Chansey learns Heal Pulse, Snorlax Block)', reg);
  check(reg.nPools === 0, 'no species\' Lab list has one (they only come on co-op cards)', reg.inPools);
  console.log(`  info: ${reg.learners} species learn at least one of them`);

  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
  const run = on => page.evaluate(async on => {
    const s = G.DB.save;
    s.owned[113] = { at: 1 }; s.partner = 113; G.Settings.set('lab', on); G.Settings.set('underdogLadder', false);
    if (G.Game.player && G.Game.state !== 'ui') { G.Game.quit(); const t = performance.now(); while (!G.UI.isOpen('scr-over') && performance.now() - t < 15000) await new Promise(r => setTimeout(r, 40)); document.getElementById('btn-again').click(); }
    const t0 = performance.now();
    while (G.Game.state !== 'ui' && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 40));
    G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
    while (!(G.Game.state === 'playing' && G.Game.player) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 50));
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) G[k].update = () => {};
    G.Game.player.xpMul = 0; G.Game.player.god = true;
    return { lab: G.Lab.active, coop: G.Coop.active, pool: G.Moves.poolFor(G.Game.player.mon).filter(id => G.Moves.BY_ID[id].coop) };
  }, on);
  const s1 = await run(true);
  const h1 = await deal(page, 300);
  check(s1.lab && !s1.coop && h1.any === 0 && !s1.pool.length, `solo Lab run (Chansey): no co-op card in 300 hands (${h1.any}), none in its list`, { s1, h1 });
  const s2 = await run(false);
  const h2 = await deal(page, 300);
  check(!s2.lab && h2.any === 0 && !s2.pool.length, `normal run: no co-op card in 300 hands (${h2.any})`, { s2, h2 });
  check(!errs.length, 'no page errors (solo)', errs.slice(0, 3));
  await page.close();
}

// ---------------- co-op (as fork/test-lab-coop.cjs) ----------------
async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  // A frame that throws is caught by the game's loop (console.error), and 180 in a row end the run.
  page.on('console', m => { if (m.type() === 'error' && /fotograma|frame/i.test(m.text())) page.errs.push(m.text()); });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Lab, null, { timeout: 30000 });
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
    G.Settings.set('underdogLadder', false);
    return { ok: nick.ok !== false, uid: G.DB.fb.uid };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}
const settle = (p, pred, arg, ms = 5000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function coop(browser) {
  console.log('2. Co-op Lab run');
  const host = await player(browser, 'suph' + tag, 113);       // Chansey: Heal Pulse, Helping Hand...
  const guest = await player(browser, 'supg' + tag, 143);      // Snorlax: Block, Helping Hand...
  const ALL = [host, guest];
  await host.evaluate(() => G.Settings.set('lab', true));
  await guest.evaluate(() => G.Settings.set('lab', false));
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
  if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  for (const p of ALL) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
  await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
  await host.click('#lobby-start');
  await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
  // A quiet arena: no spawns or events; nobody levels up; each player only what the step gives them.
  for (const p of ALL) await p.evaluate(() => {
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) G[k].update = () => {};
    const pl = G.Game.player;
    pl.xpMul = 0; pl.regenFlat = 0; pl.regenPct = 0; pl.invuln = 99;
    window.__only = (ids) => { pl.slots.length = 0; pl.moves.length = 0; for (const id of ids) pl.addMove(id); for (const m of pl.moves) m._st = 0; };
  });
  const st = await Promise.all(ALL.map(p => p.evaluate(() => ({ lab: G.Lab.active, coop: G.Coop.active }))));
  check(st.every(s => s.lab && s.coop), 'a co-op Lab run for both (the host\'s setting)', st);

  // ---- the co-op card ----
  for (const p of ALL) {
    const h = await deal(p, 200);
    check(h.coop >= 60 && h.coop <= 140 && h.learnsAll && h.seen.length >= 1,
      `${p === host ? 'host (Chansey)' : 'guest (Snorlax)'}: a co-op card in ${h.coop} of 200 hands, only moves it learns (${h.seen.join(', ')})`, h);
  }
  const took = await guest.evaluate(() => {
    const pl = G.Game.player;
    let c = null;
    for (let i = 0; i < 100 && !c; i++) c = G.LevelUp.offer(pl).find(c => c.coop);
    if (!c) return null;
    c.apply(pl);
    return { key: c.key, tag: c.tag, has: pl.hasMove(c.key.slice(4)) };
  });
  check(took && took.has && /^Co-op · /.test(took.tag), `taking the co-op card adds the move ("${took && took.tag}")`, took);

  // Puts the two players `d` px apart (each moves itself; the other sees it a moment later).
  const place = async d => {
    const hp = await host.evaluate(() => { const pl = G.Game.player; return [pl.x, pl.y]; });
    await guest.evaluate(([x, y, d]) => { const pl = G.Game.player; pl.x = x + d; pl.y = y; G.World.collide(pl); }, [hp[0], hp[1], d]);
    await settle(host, ([u, d]) => { const g = G.Coop.mate(u).pl, h = G.Game.player; return Math.abs(G.U.dist(g.x, g.y, h.x, h.y) - d) < 30; }, [guest.uid, d], 4000);
  };
  const hpOf = p => p.evaluate(() => { const pl = G.Game.player; return pl.hp / pl.maxHp; });
  const setHp = (p, k) => p.evaluate(k => { const pl = G.Game.player; pl.hp = pl.maxHp * k; }, k);
  const only = (p, ids) => p.evaluate(ids => __only(ids), ids);

  // ---- Heal Pulse, both ways ----
  await place(80);
  await only(host, []); await only(guest, []);
  await setHp(host, 0.4); await setHp(guest, 0.5);
  await only(guest, ['heal-pulse']);
  const healed = await settle(host, () => G.Game.player.hp / G.Game.player.maxHp >= 0.6, undefined, 6000);
  const gSelf = await hpOf(guest);
  check(healed, `the guest's Heal Pulse heals the host (40% → ${(100 * await hpOf(host)).toFixed(0)}%)`);
  check(Math.abs(gSelf - 0.5) < 0.01, `but not the guest itself (${(100 * gSelf).toFixed(0)}%)`);
  await only(guest, []);
  await setHp(guest, 0.4); await setHp(host, 1);
  await only(host, ['heal-pulse']);
  check(await settle(guest, () => G.Game.player.hp / G.Game.player.maxHp >= 0.6, undefined, 6000),
    `the host's Heal Pulse heals the guest (40% → ${(100 * await hpOf(guest)).toFixed(0)}%)`);
  await only(host, []);
  // Out of reach (600 px): the guest's heal never reaches the host.
  await place(600);
  await setHp(host, 0.4);
  await only(guest, ['heal-pulse']);
  await host.waitForTimeout(2500);
  check(Math.abs(await hpOf(host) - 0.4) < 0.01, 'a teammate 600 px away is out of its reach (no cast, no heal)');
  await only(guest, []);
  await setHp(host, 1); await setHp(guest, 1);

  // ---- Helping Hand: the guest's makes the host hit harder ----
  await place(80);
  const enemyAt = (dx, dy, o = {}) => host.evaluate(([dx, dy, o]) => {
    const pl = G.Game.player, def = G.Enemies.cast[0].list[0];
    const e = new G.Enemy(def, pl.x + dx, pl.y + dy, G.Enemies.scale(0));
    e.hp = e.maxHp = 1e6; e.spd = o.spd || 0; e.dmg = 1; e.touchCd = 99; G.EnemyMgr.add(e);
    return e.id;
  }, [dx, dy, o]);
  const e1 = await enemyAt(-150, 0);
  const k0 = await host.evaluate(() => G.Game.player.atkFor(G.Moves.instance('ember')));
  await only(guest, ['helping-hand']);
  const helped = await settle(host, () => G.LabSupport.state().help > 0, undefined, 6000);
  const k1 = await host.evaluate(() => G.Game.player.atkFor(G.Moves.instance('ember')));
  const gHelp = await guest.evaluate(() => G.LabSupport.state().help);
  check(helped && Math.abs(k1 / k0 - 1.3) < 0.001 && gHelp === 0, `the guest's Helping Hand: the host deals ×${(k1 / k0).toFixed(2)} (the guest itself ×1)`, { k0, k1, gHelp });
  await only(guest, []);

  // ---- Wide Guard: the host's blocks the guest's next 2 hits ----
  await only(host, ['wide-guard']);
  const guarded = await settle(guest, () => G.LabSupport.state().guard === 2, undefined, 6000);
  await only(host, []);
  const blocks = await guest.evaluate(() => {
    const pl = G.Game.player, out = [];
    for (let i = 0; i < 3; i++) { pl.invuln = 0; const h0 = pl.hp; pl.hurt(30); out.push(Math.round(h0 - pl.hp)); }
    pl.invuln = 99; pl.hp = pl.maxHp;
    return out;
  });
  check(guarded && blocks[0] === 0 && blocks[1] === 0 && blocks[2] > 0, `the host's Wide Guard: the guest's next 2 hits are blocked, the 3rd lands (HP lost: ${blocks})`, { guarded, blocks });

  // ---- Block: the guest pulls the host's enemies off the host ----
  await host.evaluate(id => { const e = G.EnemyMgr.get(id); if (e) e.hurt(1e9); }, e1);
  const walkers = [];
  for (let i = 0; i < 3; i++) walkers.push(await enemyAt(Math.cos(i * 2.1) * 60, Math.sin(i * 2.1) * 50));
  await host.evaluate(() => { G.Game.player.frozen = true; });
  await only(guest, ['block']);
  check(await settle(host, u => G.LabMech.decoys().some(d => d.owner === G.Coop.mate(u).pl), guest.uid, 6000), 'the guest\'s Block makes a decoy on the host (it follows the guest)');
  const gBlock = await guest.evaluate(() => G.LabSupport.state().block);
  await guest.evaluate(() => { const pl = G.Game.player; pl.x += 100; G.World.collide(pl); pl.frozen = true; });
  const pull = await host.evaluate(async ([u, ids]) => {
    const es = ids.map(id => G.EnemyMgr.get(id)).filter(Boolean);
    for (const e of es) { e.spd = 70; e.behavior = 'chase'; }
    const log = [];
    for (let i = 0; i < 22; i++) {
      await new Promise(r => setTimeout(r, 100));
      const m = G.Coop.mate(u), h = G.Game.player;
      log.push([G.Game.state, h && Math.round(h.hp), h && h.dead, m && m.pl.dead, m && Math.round(m.pl.hp)].join('/'));
    }
    const mt = G.Coop.mate(u);
    if (!mt) return { toGuest: [], toHost: [], why: { active: G.Coop.active, state: G.Game.state, mates: G.Coop.puppets().length, log } };
    const g = mt.pl, h = G.Game.player;
    return { toGuest: es.map(e => Math.round(G.U.dist(e.x, e.y, g.x, g.y))), toHost: es.map(e => Math.round(G.U.dist(e.x, e.y, h.x, h.y))) };
  }, [guest.uid, walkers]);
  check(pull.toGuest.length === 3 && pull.toGuest.every((d, i) => d < 70 && d < pull.toHost[i] - 60),
    `the host's enemies leave the host for the guest (${pull.toGuest} px from the guest, ${pull.toHost} from the host)`, pull);
  const taken = await guest.evaluate(() => {
    const pl = G.Game.player, hit = () => { pl.invuln = 0; const h0 = pl.hp; pl.hurt(100); const d = h0 - pl.hp; pl.hp = pl.maxHp; return d; };
    const a = hit(); const b0 = pl._labBlock; pl._labBlock = null; const b = hit(); pl._labBlock = b0; pl.invuln = 99;
    return { withBlock: a, without: b };
  });
  check(Math.abs(gBlock - 0.35) < 1e-6 && Math.abs(taken.withBlock / taken.without - 0.65) < 0.02,
    `while it guards the guest takes ×${(taken.withBlock / taken.without).toFixed(2)} damage`, { gBlock, taken });
  await only(guest, []);
  await host.evaluate(ids => { G.Game.player.frozen = false; for (const id of ids) { const e = G.EnemyMgr.get(id); if (e) e.hurt(1e9); } }, walkers);
  await guest.evaluate(() => { G.Game.player.frozen = false; });

  // ---- Aromatherapy: the host's heals both ----
  await place(80);
  await setHp(host, 0.5); await setHp(guest, 0.5);
  await only(host, ['aromatherapy']);
  await host.waitForTimeout(5500);
  await only(host, []);
  const aro = [await hpOf(host), await hpOf(guest)];
  check(aro.every(k => k >= 0.6), `the host's Aromatherapy heals the host and the guest over time (50% → ${aro.map(k => (100 * k).toFixed(0) + '%').join(', ')})`, aro);

  for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})`, p.errs.slice(0, 3));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!SOLO) await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op support checks passed');
  process.exit(failures ? 1 : 0);
})();
