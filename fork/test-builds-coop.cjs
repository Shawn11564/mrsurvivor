#!/usr/bin/env node
// Lab builds in co-op (fork/LAB.md "Phase 11: builds"): two real players in headless Edge against the
// Firebase emulator (no real project is touched), as fork/test-lab-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs
//   node fork/test-builds-coop.cjs [base-url]
//
// 1. Branches (js/fork/lab/branches.js): the guest's branched Flamethrower is drawn on the host as it
//    is: Heat Wave's wider fan with its flame count, Fire Spin as a Fire bind (also once evolved), and
//    the guest's Fire Spin holds the host's enemies.
// 2. Sets (js/fork/lab/sets.js): the guest's Fire set puts more burn stacks on the host's enemies.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, info) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (!ok && info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
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
    return { ok: nick.ok !== false, uid: G.DB.fb.uid };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
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

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'bbh' + tag, 4);
    const guest = await player(browser, 'bbg' + tag, 7);
    const ALL = [host, guest];
    for (const p of ALL) await p.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', true); });
    await party(host, [guest]);
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active && G.Lab.active, null, { timeout: 20000 })));
    for (const p of ALL) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; G.LevelUp.offer = () => []; });
    console.log('Party of 2 in a Lab run');

    // Dummies next to the guest (the host owns them; the guest gets copies), and a spy on the host's
    // puppet of the guest: every move it casts (Combat.ghostCast → pl.cast).
    const gpos = await guest.evaluate(() => [G.Game.player.x, G.Game.player.y]);
    const ids = await host.evaluate(g => {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const def = G.Enemies.cast[0].list[0], a = i * 0.5;
        const e = new G.Enemy(def, g[0] + Math.cos(a) * 45, g[1] + Math.sin(a) * 40, G.Enemies.scale(0));
        e.hp = e.maxHp = 1e7; e.spd = 0; e.touchCd = 99; G.EnemyMgr.add(e); out.push(e.id);
      }
      return out;
    }, gpos);
    await settle(guest, ids => ids.every(id => G.EnemyMgr.get(id)), ids, 8000);
    await host.evaluate(uid => {
      const pl = G.Coop.mate(uid).pl, cast = pl.cast;
      window.__ghosts = [];
      pl.cast = function (m) {
        if (m && m.id) window.__ghosts.push({ id: m.id, kind: m.kind, type: m.type, branch: m.branch || null, count: m.count, arc: m.arc, lvl: m.lvl, evolved: !!m.evolved });
        return cast.apply(this, arguments);
      };
    }, guest.uid);
    const learn = (br, evolve) => guest.evaluate(([br, evolve]) => {
      const pl = G.Game.player;
      pl.slots.length = 0; pl.moves.length = 0; pl.addMove('flamethrower');
      const m = pl.moves[0];
      G.Moves.levelUp(m); G.Moves.levelUp(m); G.LabBranches.applyBranch(m, br);
      if (evolve) { G.Moves.levelUp(m); G.Moves.evolve(m); }
      return { kind: m.kind, count: m.count, arc: +m.arc.toFixed(4), lvl: m.lvl, evolved: !!m.evolved };
    }, [br, evolve]);
    const lastGhost = () => host.evaluate(() => window.__ghosts.filter(g => g.id === 'flamethrower').pop() || null);

    console.log('1. Branches');
    const hw = await learn('b');
    await host.evaluate(() => { window.__ghosts.length = 0; });
    await settle(host, () => window.__ghosts.some(g => g.id === 'flamethrower'), undefined, 6000);
    const g1 = await lastGhost();
    check(g1 && g1.branch === 'b' && g1.kind === 'cone' && g1.count === hw.count && Math.abs(g1.arc - hw.arc) < 1e-3 && g1.lvl === hw.lvl,
      `the host draws the guest's Heat Wave as it is (${hw.count} flames, arc ${hw.arc}, level ${hw.lvl})`, { guest: hw, host: g1 });
    const fs = await learn('a');
    await host.evaluate(() => { window.__ghosts.length = 0; });
    await settle(host, () => window.__ghosts.some(g => g.id === 'flamethrower'), undefined, 6000);
    const g2 = await lastGhost();
    check(g2 && g2.branch === 'a' && g2.kind === 'bind' && g2.type === 'fire', 'the guest\'s Fire Spin is a Fire bind on the host too', { guest: fs, host: g2 });
    check(await settle(host, ids => ids.some(id => { const e = G.EnemyMgr.get(id); return e && e.stunT > 0 && e.burn > 0; }), ids, 6000),
      'and it holds and burns the host\'s enemies');
    const ev = await learn('a', true);
    await host.evaluate(() => { window.__ghosts.length = 0; });
    await settle(host, () => window.__ghosts.some(g => g.id === 'flamethrower' && g.evolved), undefined, 6000);
    const g3 = await lastGhost();
    check(g3 && g3.evolved && g3.kind === 'bind' && g3.branch === 'a' && g3.lvl === 5, 'evolved, it is still the branched bind on the host', { guest: ev, host: g3 });

    console.log('2. Sets');
    // The guest's Fire set: one more burn stack on the host's enemies (applyBurn goes to the host).
    const burnOn = async moves => {
      await guest.evaluate(ms => { const pl = G.Game.player; pl.slots.length = 0; pl.moves.length = 0; for (const id of ms) pl.addMove(id); pl.active = 0; }, moves);
      await host.evaluate(ids => { for (const id of ids) { const e = G.EnemyMgr.get(id); if (e) { e.burn = 0; e.burnT = 0; } } }, ids);
      await settle(host, ids => ids.some(id => { const e = G.EnemyMgr.get(id); return e && e.burn > 0; }), ids, 6000);
      await host.waitForTimeout(150);
      return host.evaluate(ids => Math.max(...ids.map(id => (G.EnemyMgr.get(id) || {}).burn || 0)), ids);
    };
    const b2 = await burnOn(['ember', 'flamethrower']);
    await guest.evaluate(() => { G.Game.player.moves.length = 0; G.Game.player.slots.length = 0; });
    await host.evaluate(ids => { for (const id of ids) { const e = G.EnemyMgr.get(id); if (e) { e.burn = 0; e.burnT = 0; } } }, ids);
    await host.waitForTimeout(500);
    const b3 = await burnOn(['ember', 'flamethrower', 'heat-wave']);
    check(b3 > b2, `the guest's Fire set burns the host's enemies one stack more (${b2} → ${b3} after the first hits)`, { b2, b3 });

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})`, p.errs.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll build co-op checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
