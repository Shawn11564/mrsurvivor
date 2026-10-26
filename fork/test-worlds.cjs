#!/usr/bin/env node
// Lab mode: World 2 (js/fork/lab/worlds.js and its LAB switch, js/fork/lab/worlds-toggle.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (or python -m http.server 8123 in the repo root)
//   node fork/test-worlds.cjs [base-url]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. The LAB switch by Play is the 'worlds' setting (Lab mode), and clicking it doesn't start a run.
//   2. A World 2 run: rifts stop 2 min before 10:00; nothing at 9:50, the Eternatus raid at 10:00.
//   3. Beating it opens the portal near you; the next raid is Necrozma at 30:00.
//   4. World 1 grows stronger from then on (×1.25 HP, ×1.15 damage a minute) and, after 60 s, the ghost rush:
//      Gastly first, Gengar later, flying, no affixes, 1 XP, faster every minute.
//   5. Standing in the portal for 1.5 s: World 2, far away, its own palette, no ghosts left; its own Pokémon
//      (×1.15 HP, a later tier at +8 min, type hordes from its tiers); the 4-minute turn stays on World 2's palettes;
//      a resumed run would come back in World 2.
//   6. Necrozma at 30:00 in World 2.
//   7. A run with the switch off: no Eternatus at 10:00 (still 30:00), no portal, World 1's turn as before.
//   8. Co-op: the host's switch decides; the guest sees the portal, both travel together, the guest's palette too.
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

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Worlds, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex;
    s.owned[dex] = { at: Date.now(), from: 'test' };
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  return page;
}

const st = page => page.evaluate(() => {
  const W = G.Worlds, pl = G.Game.player, p = W.portal;
  return { on: W.on, world: W.world, portal: p && { x: Math.round(p.x), y: Math.round(p.y), at: Math.round(p.at) }, eter: G.Eternatus.active,
    necro: G.Necrozma.active, at: isFinite(G.Judgment.AT) ? G.Judgment.AT : 'never', biome: G.World.biome, name: G.World.biomeName(),
    t: Math.round(G.Game.st.time), x: Math.round(pl.x), y: Math.round(pl.y), state: G.Game.state, ghosts: G.EnemyMgr.all().filter(e => e._ghost && !e.dead).length };
});
/** Beats the Eternatus raid now (authority) and waits until you're back on the map. */
async function beatEternatus(page) {
  await page.waitForFunction(() => G.Eternatus.active && G.Eternatus.raid && G.EnemyMgr.get(G.Eternatus.raid.bossId), null, { timeout: 8000 });
  await page.evaluate(() => { for (const e of G.EnemyMgr.all()) if (e.obelisk) e.hurt(1e9); const e = G.EnemyMgr.get(G.Eternatus.raid.bossId); e.hp = 1; e.hurt(1e9); });
  await page.waitForFunction(() => !G.Eternatus.active, null, { timeout: 12000 });
}
/** A regular enemy joining now: its HP and damage against its definition's. */
const probe = page => page.evaluate(() => {
  const pl = G.Game.player, def = { dex: 19, name: 'Rattata', hp: 1000, spd: 50, dmg: 10, xp: 10, behavior: 'chase' };
  const e = new G.Enemy(def, pl.x + 400, pl.y, { hp: 1, spd: 1, dmg: 1 });
  G.EnemyMgr.add(e);
  const r = { hp: e.maxHp / 1000, dmg: e.dmg / 10, elite: !!e._elite };
  e.hp = 0; e.dead = true;
  return r;
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); localStorage.removeItem('ms.resume'); } catch (e) { /* nada */ } });
    page.errs = [];
    page.on('pageerror', e => page.errs.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.Worlds, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });

    console.log('1. The switch');
    await page.waitForSelector('#w2-q', { state: 'visible', timeout: 8000 });
    const s0 = await page.evaluate(() => !!G.Settings.get('worlds'));
    await page.click('#w2-q');
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => ({ on: !!G.Settings.get('worlds'), box: document.getElementById('w2-q-on').checked, state: G.Game.state,
      label: document.getElementById('w2-q').textContent.trim(), tip: document.querySelector('.w2-tip').textContent }));
    check(!s0 && s1.on && s1.box && s1.state === 'ui' && s1.label === 'LAB' && /Lab mode/.test(s1.tip) && /Lab leaderboard/.test(s1.tip),
      'off by default; the switch says LAB and its tip Lab mode / Lab leaderboard; clicking it turns Lab mode on, and doesn\'t start a run', { s0, s1: Object.assign({}, s1, { tip: s1.tip.slice(0, 60) }) });

    const run = worlds => page.evaluate(w => { G.Settings.set('underdogLadder', false); G.Settings.set('worlds', w); if (G.Game.player && G.Game.state !== 'ui') G.Game.quit(); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); }, worlds)
      .then(() => page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 }))
      .then(() => page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; p.god = true; p.xpMul = 0; G.EnemyMgr.clear(); }))
      .then(() => page.waitForTimeout(3300));

    console.log('2. Eternatus at 10:00');
    await run(true);
    const a0 = await st(page);
    check(a0.on && a0.world === 1 && a0.at === 600, 'a World 2 run: the next raid is at 10:00 (rifts stop at 8:00)', a0);
    await page.evaluate(() => G.Game.debugTime(590));
    await page.waitForTimeout(1500);
    check(!(await st(page)).eter, 'at 9:50: no raid yet');
    await page.evaluate(() => G.Game.debugTime(600));
    check(await settle(page, () => G.Eternatus.active, null, 5000), 'at 10:00 the Eternatus raid starts');

    console.log('3. The portal');
    await beatEternatus(page);
    await page.waitForTimeout(500);
    const p1 = await st(page);
    const ts = await page.evaluate(() => G.Tiles.T * G.Sprites.PX);
    const near = p1.portal && Math.hypot(p1.portal.x - p1.x, p1.portal.y - p1.y);
    check(!!p1.portal && near < ts * 8 && p1.world === 1, 'beating Eternatus opens the portal near you', { p1, near: Math.round(near), max: ts * 8 });
    check(p1.at === 1800, 'the next raid is Necrozma at 30:00', p1.at);

    console.log('4. Staying in World 1');
    await page.waitForTimeout(2500);
    const g0 = await st(page);
    check(g0.ghosts === 0, 'no ghosts in the first minute', g0.ghosts);
    await page.evaluate(at => G.Game.debugTime(at + 180), p1.portal.at);
    const r3 = await probe(page);
    check(Math.abs(r3.hp - Math.pow(1.25, 3)) < 0.02 && Math.abs(r3.dmg - Math.pow(1.15, 3)) < 0.02, '3 min after it opens, a new enemy has ×1.95 HP and ×1.52 damage', r3);
    await page.evaluate(at => G.Game.debugTime(at + 70), p1.portal.at);
    await page.evaluate(() => G.EnemyMgr.clear());
    const came = await settle(page, () => G.EnemyMgr.all().some(e => e._ghost), null, 6000);
    const gh = await page.evaluate(() => G.EnemyMgr.all().filter(e => e._ghost).map(e => ({ dex: e.dex, fly: e.flying, xp: e.xp, affix: e.affix || null, spd: Math.round(e.spd) })));
    check(came && gh.every(g => g.dex === 92 && g.fly && g.xp === 1 && !g.affix), 'after a minute the ghost rush: Gastly, flying, 1 XP, no affixes', gh.slice(0, 3));
    await page.evaluate(at => G.Game.debugTime(at + 60 + 330), p1.portal.at);
    await page.evaluate(() => { G.EnemyMgr.clear(); for (let i = 0; i < 6; i++) G.Worlds.debugGhosts(); });
    const late = await page.evaluate(() => { const g = G.EnemyMgr.all().filter(e => e._ghost); return { dex: [...new Set(g.map(e => e.dex))].sort(), spd: Math.round(Math.max(...g.map(e => e.spd))), n: g.length, me: Math.round(G.Game.player.baseSpd * G.Game.player.spdMul) }; });
    check(late.dex.includes(94) && late.spd > 140, 'five and a half minutes in: Gengar among them, faster (×1.55 speed)', late);

    console.log('5. World 2');
    await page.evaluate(() => { const p = G.Worlds.portal, pl = G.Game.player; pl.x = p.x; pl.y = p.y; });
    const went = await settle(page, () => G.Worlds.world === 2, null, 5000);
    await page.waitForTimeout(400);
    const w2 = await page.evaluate(() => {
      const pl = G.Game.player, W = G.Worlds;
      return { world: W.world, x: pl.x / (G.Tiles.T * G.Sprites.PX), biome: G.World.biome, start: W.W2_START, name: G.World.biomeName(),
        ghosts: G.EnemyMgr.all().filter(e => e._ghost).length, portal: W.portal, at: G.Judgment.AT };
    });
    check(went && w2.x > 19000 && w2.biome >= w2.start && /^World 2 · /.test(w2.name) && !w2.ghosts && !w2.portal,
      'standing in the portal for 1.5 s: World 2, far away, its own palette, the ghosts gone', w2);
    const bag = await page.evaluate(() => {
      const t = G.Game.st.time, tiers = G.Enemies.cast.filter(c => c.from >= 1e6), dex = c => c.list.map(d => d.dex);
      const b = new Set(G.Enemies.bagAt(t).map(d => d.dex)), w1 = new Set(G.Enemies.cast.filter(c => c.from < 1e6).flatMap(dex));
      return { only0: [...b].every(d => dex(tiers[0]).includes(d)), n: b.size, hp: Math.min(...G.Enemies.bagAt(t).map(d => d.hp)), w1hp: G.Enemies.TIERS[5].hp,
        fresh: [...b].filter(d => !w1.has(d)).length };
    });
    check(bag.only0 && bag.n >= 5 && bag.fresh >= 3, 'its own Pokémon (the first World 2 tier), mostly not seen in World 1', bag);
    const r2 = await probe(page);
    check(Math.abs(r2.hp - 1.15) < 0.01 || (r2.elite && Math.abs(r2.hp - 1.84) < 0.01), 'a regular enemy there has ×1.15 HP (×1.84 as an elite), the World 1 ramp gone', r2);
    const later = await page.evaluate(() => {
      const s = G.Game.player._labWorlds; G.Game.debugTime(s.wt + 500);
      const t = G.Game.st.time, top = G.Enemies.cast.filter(c => c.from >= 1e6)[2].list.map(d => d.dex);
      const types = G.Enemies.hordeTypes(t), h = types.length ? G.Enemies.hordeDefs(types[0], t) : [];
      const tier = G.Enemies.TIERS.find(r => r.from === 1e6 + 2);
      return { top: G.Enemies.bagAt(t).some(d => top.includes(d.dex)), horde: h.length, hordeW2: h.every(d => { const p = G.DEX_BY[d.dex]; return p.bst >= tier.bst[0] && p.bst <= tier.bst[1]; }) };
    });
    check(later.top && later.horde > 0 && later.hordeW2, '8 min after arriving: the third tier joins, and type hordes come from it', later);
    const turn = await page.evaluate(() => { G.World.setBiome(7); const a = G.World.biome; G.World.setBiome(8); return [a, G.World.biome, G.Worlds.W2_START]; });
    check(turn[0] >= turn[2] && turn[1] >= turn[2] && turn[0] !== turn[1], 'the 4-minute turn goes round World 2\'s palettes', turn);
    await page.waitForTimeout(5600);
    const saved = await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('ms.resume')); return s && s.p && s.p._labWorlds; } catch (e) { return null; } });
    check(saved && saved.on === 1 && saved.w === 2, 'the resume save keeps the world (a reload comes back in World 2)', saved);

    console.log('6. Necrozma at 30:00');
    await page.evaluate(() => G.Game.debugTime(1790));
    await page.waitForTimeout(1500);
    check(!(await st(page)).necro, 'at 29:50: no Necrozma yet');
    await page.evaluate(() => G.Game.debugTime(1800));
    check(await settle(page, () => G.Necrozma.active, null, 5000), 'at 30:00 the Necrozma raid starts in World 2');

    console.log('7. A run with the switch off');
    await run(false);
    const n0 = await st(page);
    check(!n0.on && n0.world === 0 && n0.at === 1800, 'not a World 2 run: the next raid is at 30:00', n0);
    await page.evaluate(() => G.Game.debugTime(600));
    await page.waitForTimeout(2000);
    const n1 = await st(page);
    check(!n1.eter && !n1.portal, 'nothing at 10:00', n1);
    const nb = await page.evaluate(() => { G.World.setBiome(5); return G.World.biome; });
    check(nb === 5, 'World 1\'s 4-minute turn as before (World 2\'s palettes never come)', nb);
    const r0 = await probe(page);
    check(r0.hp === 1 && r0.dmg === 1, 'and enemies keep their numbers', r0);
    check(!page.errs.length, 'no page errors', page.errs);
    await page.close();

    console.log('8. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'w2h' + tag, 4), guest = await player(browser, 'w2g' + tag, 7);
      await host.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('worlds', true); });
      await guest.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('worlds', false); });
      const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
      const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
      if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
      for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
      await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
        G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
      check(await settle(guest, () => { const i = document.getElementById('w2-q-on'); return i && i.checked && i.disabled; }, null, 6000),
        'in the room, the guest\'s switch shows the host\'s (on), greyed out');
      await guest.click('#lobby-ready');
      await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
      await host.click('#lobby-ready');
      const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active && G.Worlds.on, null, 20000)));
      check(both.every(Boolean), 'the host\'s switch decides: a World 2 run for both (the guest\'s own is off)');
      await host.waitForTimeout(3500);
      for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; G.Game.player.xpMul = 0; });
      await host.evaluate(() => G.Game.debugTime(600));
      const raid = await Promise.all([host, guest].map(p => settle(p, () => G.Eternatus.active, null, 8000)));
      check(raid.every(Boolean), 'Eternatus at 10:00 for both');
      await beatEternatus(host);
      const seen = await settle(guest, () => !!G.Worlds.portal, null, 10000);
      const [hp, gp] = [await st(host), await st(guest)];
      check(seen && gp.portal && hp.portal && gp.portal.x === hp.portal.x && gp.portal.y === hp.portal.y, 'the guest sees the portal where the host\'s is', { hp: hp.portal, gp: gp.portal });
      // Only the host in the portal: nobody goes.
      await host.evaluate(() => { const p = G.Worlds.portal, pl = G.Game.player; pl.x = p.x; pl.y = p.y; });
      await guest.evaluate(() => { const p = G.Worlds.portal, pl = G.Game.player; pl.x = p.x + 300; pl.y = p.y; });
      await host.waitForTimeout(2500);
      check((await st(host)).world === 1, 'with only one of you in the portal, nobody goes');
      await guest.evaluate(() => { const p = G.Worlds.portal, pl = G.Game.player; pl.x = p.x + 10; pl.y = p.y; });
      await host.evaluate(() => { const p = G.Worlds.portal, pl = G.Game.player; pl.x = p.x; pl.y = p.y; });
      const went = await Promise.all([host, guest].map(p => settle(p, () => G.Worlds.world === 2, null, 8000)));
      await host.waitForTimeout(1500);
      const [h2, g2] = [await st(host), await st(guest)];
      check(went.every(Boolean) && Math.hypot(h2.x - g2.x, h2.y - g2.y) < 400 && g2.biome >= (await guest.evaluate(() => G.Worlds.W2_START)),
        'both in the portal: both travel to World 2 together, the guest with World 2\'s palette', { went, h2, g2 });
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll World 2 checks passed');
  process.exit(failures ? 1 : 0);
})();
