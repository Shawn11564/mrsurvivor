#!/usr/bin/env node
// Lab mode in co-op (js/fork/lab/lab.js, fork/LAB.md): two real players in headless Edge,
// against the Firebase emulator (no real project is touched), as in fork/test-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-lab-coop.cjs [base-url]       (SHOTS=<folder> saves the lobby screenshot)
//
// Checks:
//   1. Host Lab on, guest Lab off: the lobby tells both it will be a Lab run (the host's
//      { k:'lab' } message); the run is a Lab run for both (the host's 'start' carries lab and
//      labV); each gets their own Pokémon's ability and Lab pool.
//   2. The guest's Lab-only move (Swift) is seen on the host's screen (Combat.ghostCast from
//      the move id), and its hits reach the host's enemies.
//   2b. The guest's Hypnosis and Confuse Ray put the host's enemies to sleep / confuse them (and the
//      guest sees them asleep), its Rain Dance brings rain for both, its Fly is seen on the host,
//      it evolves during the run (Wartortle, Blastoise), and as a Lucario Mega Evolves; the host sees it all.
//   3. The host does not send the Lab run to the group leaderboard.
//   4. Host Lab off, guest Lab on: the lobby says nothing, the run is normal for both, and the
//      host sends it to the leaderboard.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.addStyleTag({ url: BASE + '/css/brand.css' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Lab, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    s.pabil = { [dex]: [0, Date.now()] };              // its first ability: 1 save in 20 rolls the hidden one
    G.DB.commit();
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    // Leaderboard spy: what the host's endRun sends.
    window.__group = 0;
    const sub = G.Ranking.submitGroup;
    G.Ranking.submitGroup = function () { window.__group++; return sub.apply(this, arguments); };
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
const inRun = ps => Promise.all(ps.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
const badge = p => p.evaluate(() => { const el = document.getElementById('lab-lobby'); return el && !el.classList.contains('hidden') ? el.textContent : null; });
async function forceStart(host, all) {
  await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
  await host.click('#lobby-start');
  await inRun(all);
}
/** Everyone down: the run ends; back to the lobby. */
async function finish(all) {
  // (_relocT: a Lab mover's grace, js/fork/lab/mobility.js, counts in game time and a level-up pause keeps it.)
  for (const p of all) await p.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl._relocT = 0; pl.hurt(1e9); });
  // First the team summary (js/fork/run-stats.js), then each one's own end screen.
  for (const p of all) await p.waitForSelector('#scr-party', { timeout: 20000 });
  for (const p of all) await p.click('#scr-party [data-a=next]');
  for (const p of all) {
    await p.waitForSelector('#btn-again', { state: 'visible', timeout: 20000 });
    await p.waitForTimeout(600);
    await p.click('#btn-again');
  }
  await Promise.all(all.map(p => p.waitForFunction(() => G.UI.isOpen('scr-lobby'), null, { timeout: 15000 })));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'labh' + tag, 4);        // Charmander
    const guest = await player(browser, 'labg' + tag, 7);       // Squirtle
    const ALL = [host, guest];
    await host.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', true); });
    await guest.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', false); });
    await party(host, [guest]);
    console.log('Party of 2 connected peer to peer');

    // ---------------- 1. host on, guest off ----------------
    console.log('Host Lab on, guest Lab off');
    check(await settle(guest, () => { const el = document.getElementById('lab-lobby'); return el && !el.classList.contains('hidden'); }),
          `the guest's lobby says it will be a Lab run ("${await badge(guest)}")`);
    check(/Your setting/.test(await badge(host) || ''), 'the host\'s lobby says so too');
    if (process.env.SHOTS) await guest.screenshot({ path: require('path').join(process.env.SHOTS, 'lab-lobby.png') });
    await forceStart(host, ALL);
    const st = await Promise.all(ALL.map(p => p.evaluate(() => {
      const pl = G.Game.player;
      return { active: G.Lab.active, ability: pl.labAbility, pool: G.Moves.poolFor(pl.mon), lab: G.Lab.poolFor(pl.mon) };
    })));
    check(st[0].active && st[1].active, 'the run is a Lab run for both (the guest\'s own setting is off)');
    check(st[0].ability === 'blaze' && st[1].ability === 'torrent', `each has their own ability (host ${st[0].ability}, guest ${st[1].ability})`);
    check(JSON.stringify(st[1].pool) === JSON.stringify(st[1].lab), 'the guest\'s cards come from Squirtle\'s Lab pool');

    // ---------------- 2. the guest's Swift on the host's screen ----------------
    console.log('Guest casts a Lab-only move');
    // Enemies next to the guest (the host owns them; the guest gets copies).
    const gpos = await guest.evaluate(() => [G.Game.player.x, G.Game.player.y]);
    const ids = await host.evaluate(g => {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const def = G.Enemies.cast[0].list[0], a = i * 2.1;
        const e = new G.Enemy(def, g[0] + Math.cos(a) * 150, g[1] + Math.sin(a) * 130, G.Enemies.scale(0));
        e.hp = e.maxHp = 1e6; e.spd = 0; G.EnemyMgr.add(e); out.push(e.id);
      }
      G.Game.player.invuln = 99;
      return out;
    }, gpos);
    await settle(guest, ids => ids.every(id => G.EnemyMgr.get(id)), ids, 8000);
    await guest.evaluate(() => { const pl = G.Game.player; pl.invuln = 99; pl.slots.length = 0; pl.moves.length = 0; pl.addMove('swift'); });
    const seen = await host.evaluate(async ([uid, ids]) => {
      const mate = G.Coop.mate(uid);
      let ghosts = 0;
      const hp0 = ids.map(id => (G.EnemyMgr.get(id) || {}).hp);
      const t0 = performance.now();
      while (performance.now() - t0 < 4000) {
        await new Promise(r => setTimeout(r, 50));
        ghosts = Math.max(ghosts, G.Projectiles.all().filter(p => p.ghost && p.owner === mate.pl && p.vis && p.vis.proj === 'star').length);
      }
      const hit = ids.some((id, i) => { const e = G.EnemyMgr.get(id); return !e || e.hp < hp0[i]; });
      return { ghosts, hit };
    }, [guest.uid, ids]);
    check(seen.ghosts > 0, `the host sees the guest's Swift stars (${seen.ghosts} at once)`);
    check(seen.hit, 'the guest\'s Swift damages the host\'s enemies');

    // ---------------- 2b. the new kinds and phases in co-op (fork/LAB.md, phases 4-7) ----------------
    // The host owns the enemies and the weather: what a guest's move does to them goes to the
    // host ({ k:'labst' }) and comes back to the guest ({ k:'labes' }). Weather moves are only a
    // zone around their user now (others see it as a ghost), never the arena's weather.
    console.log('Guest: sleep, confusion, weather, leap, evolution, Mega');
    const learn = (p, id) => p.evaluate(id => { const pl = G.Game.player; pl.slots.length = 0; pl.moves.length = 0; pl.addMove(id); }, id);
    await learn(guest, 'hypnosis');
    check(await settle(host, ids => ids.some(id => { const e = G.EnemyMgr.get(id); return e && e.labSleep > 0 && e.stunT > 0; }), ids, 8000),
      'the guest\'s Hypnosis puts the host\'s enemies to sleep');
    check(await settle(guest, ids => ids.some(id => { const e = G.EnemyMgr.get(id); return e && e.labSleepNet > 0; }), ids, 4000),
      'and the guest sees them asleep (the host\'s { k:\'labes\' })');
    await learn(guest, 'confuse-ray');
    check(await settle(host, ids => ids.some(id => { const e = G.EnemyMgr.get(id); return e && e.labConf > 0; }), ids, 8000),
      'the guest\'s Confuse Ray confuses the host\'s enemies');
    await host.evaluate(() => G.Weather.reset());
    await guest.evaluate(() => G.Weather.reset());
    await learn(guest, 'rain-dance');
    check(await settle(host, u => G.LabKinds.fields().some(f => f.kind === 'wxzone' && f.wx === 'rain' && f.owner === G.Coop.mate(u).pl), guest.uid, 6000),
      'the host sees the guest\'s Rain Dance as rain around the guest');
    check((await Promise.all(ALL.map(p => p.evaluate(() => !G.Weather.current)))).every(Boolean), 'and it doesn\'t start the arena\'s weather for anyone');
    await learn(guest, 'fly');
    check(await settle(host, u => !!G.Coop.mate(u).pl._labLeap, guest.uid, 6000), 'the host sees the guest fly up (its ghost leaves the ground)');
    await learn(guest, 'water-gun');
    // The guest evolves (growth.js): the host sees Wartortle, then Blastoise.
    await guest.evaluate(() => { const pl = G.Game.player; pl.level = 30; G.LabGrowth.evolveTo(pl, 8); });
    check(await settle(host, u => G.Coop.mate(u).pl.anim.dex === 8, guest.uid, 5000), 'the guest evolves into Wartortle and the host sees it');
    await guest.evaluate(() => G.LabGrowth.evolveTo(G.Game.player, 9));
    check(await settle(host, u => G.Coop.mate(u).pl.anim.dex === 9, guest.uid, 5000), 'then Blastoise, also on the host');
    // Mega Evolution is Lab only. Blastoise has no Mega sprites, so the guest is made a Lucario
    // (the same 'labevo' message) and holds its Mega Stone: everyone sees Mega Lucario.
    await guest.evaluate(() => G.LabGrowth.evolveTo(G.Game.player, 448));
    await settle(host, u => G.Coop.mate(u).pl.anim.dex === 448, guest.uid, 5000);
    await guest.evaluate(() => G.Game.player.equip('megastone'));
    check(await guest.evaluate(() => G.Mega.can(448)) && await settle(guest, () => G.Game.player.anim.dex === 'm448', undefined, 5000)
      && await settle(host, u => G.Coop.mate(u).pl.anim.dex === 'm448', guest.uid, 5000),
      'Mega Stone in a Lab run: the guest\'s Lucario Mega Evolves, and the host sees it');
    if (process.env.SHOTS) await host.screenshot({ path: require('path').join(process.env.SHOTS, 'lab-coop-mega.png') });

    // ---------------- 3. leaderboard ----------------
    await finish(ALL);
    check(await host.evaluate(() => window.__group === 0), 'the host does not send the Lab run to the group leaderboard');

    // ---------------- 4. host off, guest on ----------------
    console.log('Host Lab off, guest Lab on');
    await host.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', false); });
    await guest.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', true); });
    check(await settle(guest, () => document.getElementById('lab-lobby').classList.contains('hidden')), 'the guest\'s lobby no longer mentions Lab');
    check(await badge(host) === null, 'neither does the host\'s');
    await forceStart(host, ALL);
    const st2 = await Promise.all(ALL.map(p => p.evaluate(() => ({ active: G.Lab.active, ability: G.Game.player.labAbility || null }))));
    check(!st2[0].active && !st2[1].active && !st2[0].ability && !st2[1].ability, 'the run is normal for both (the host decides)');
    await finish(ALL);
    check(await host.evaluate(() => window.__group === 1), 'the host sends the normal run to the group leaderboard');

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab co-op checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
