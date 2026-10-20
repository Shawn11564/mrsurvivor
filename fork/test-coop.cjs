#!/usr/bin/env node
// Co-op (party) features with two real players, in headless Edge, against the Firebase
// emulator (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop.cjs [base-url]         (SHOTS=<folder> saves lobby and spectate screenshots)
//
// Both players load dev.html with js/core/firebase-config.js swapped for the emulator config
// (docs/FIREBASE.md), register, claim a nickname, and meet in a room (the host creates it, the
// guest joins by id: friend invites are not what's under test). They connect peer to peer
// with WebRTC exactly as in the real game. Checks:
//   1. Ready Up (js/ui/social-ui.js LobbyUI, G.Social.setReady): the run starts on its own a
//      moment after everyone is ready, not before; un-readying cancels it; the host can force
//      start; ready resets after a run.
//   2. Spectating while down (js/game.js spectate, HUD): the camera follows an alive teammate,
//      switches between them, and the host sends a downed guest the enemies near them.
//   3. Bonds (js/systems/rift.js finish, coop 'af'): after a legendary, every player's bond
//      screen opens at the same time and the game resumes once all have picked. With two bonds
//      for one player, nobody counts down until that player's second bond is picked too.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
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
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    G.DB.commit();
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    // New accounts get one-time notices ("save your game"): dismiss them as a player would.
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false, uid: G.DB.fb.uid, st, nick };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}

/** Host creates a room, guest joins, both open the lobby and wait for the peer connection. */
async function party(host, guests) {
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  for (const g of guests) {
    const j = await g.evaluate(id => G.Social.joinRoom(id), id);
    if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  }
  for (const p of [host, ...guests]) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(n => G.Social.room && G.Social.room.members.length === n &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), guests.length + 1, { timeout: 30000 });
  return id;
}

const inRun = ps => Promise.all(ps.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 15000 })));
const down = p => p.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9); return pl.dead; });
const settle = (p, pred, arg, ms = 5000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'host' + tag, 4);        // Charmander
    const g1 = await player(browser, 'gsta' + tag, 7);          // Squirtle
    const g2 = await player(browser, 'gstb' + tag, 1);          // Bulbasaur
    const ALL = [host, g1, g2];
    await party(host, [g1, g2]);
    console.log('Party of 3 connected peer to peer');

    // ---------------- Ready Up ----------------
    console.log('Ready Up');
    const lobby = p => p.evaluate(() => ({ state: G.Game.state, cd: G.LobbyUI.countingDown, btn: document.getElementById('lobby-start').textContent,
      note: document.getElementById('lobby-note').textContent, me: document.getElementById('lobby-ready').textContent }));
    await host.waitForTimeout(400);                              // room listener + translation settle
    let h = await lobby(host);
    check(/Force start \(0\/3 ready\)/.test(h.btn) && !h.cd, `nobody ready: host sees "${h.btn}", no countdown`);
    await g1.click('#lobby-ready'); await g2.click('#lobby-ready');
    await settle(host, () => G.Social.room.members.filter(m => m.ready).length === 2);
    await host.waitForTimeout(3800);
    h = await lobby(host);
    check(h.state === 'ui' && !h.cd && /2\/3/.test(h.btn), `two of three ready: no start after 4 s ("${h.btn}")`);
    await host.click('#lobby-ready');                            // the host readies up too
    await Promise.all(ALL.map(p => settle(p, () => G.LobbyUI.countingDown)));
    h = await lobby(host);
    check(/Everyone's ready: starting in/.test(h.note) && /Start now/.test(h.btn), `all ready: countdown on all three ("${h.note}")`);
    if (process.env.SHOTS) await g1.screenshot({ path: require('path').join(process.env.SHOTS, 'coop-lobby.png') });
    await g2.click('#lobby-ready');                              // changes their mind
    await Promise.all(ALL.map(p => settle(p, () => !G.LobbyUI.countingDown)));
    await host.waitForTimeout(3500);
    check((await Promise.all(ALL.map(lobby))).every(l => l.state === 'ui'), 'un-readying cancels the countdown for everyone; no start');
    await g2.click('#lobby-ready');
    const t0 = Date.now();
    await inRun(ALL);
    const dt = Date.now() - t0;
    check(dt > 2500 && dt < 6000, `everyone ready again: the run starts on its own for all three, ${(dt / 1000).toFixed(1)} s later`);
    check(await settle(host, () => G.Social.room.members.every(m => !m.ready)), 'ready resets for everyone once the run starts');

    // ---------------- Spectating while down ----------------
    console.log('Spectating while down');
    // Spread out: host far from g1's body (well past the 950 px the host sends by default).
    await host.evaluate(() => { G.Game.player.x += 2200; });
    await g2.evaluate(() => { const pl = G.Game.player; pl.x -= 1200; pl.y += 300; });
    await host.waitForTimeout(800);
    // The others hear of it (js/fork/markers.js): "{name} is down!" on screen, and the markers
    // gather around their Pokémon for a moment (g1's body is off their screens).
    const spy = p => p.evaluate(() => { window.__drawn = []; const o = G.I18n.rawCanvas;
      G.I18n.rawCanvas = function (c, k, t) { if (k === 'fillText') window.__drawn.push(String(t)); return o.apply(this, arguments); }; });
    await spy(host); await spy(g2);
    await down(g1);
    for (const p of [host, g2]) {
      const ok = await settle(p, n => G.Markers.notes.includes(n) && G.Markers.focusK > 0.5 && window.__drawn.includes(n + ' is down!'), g1.name, 4000);
      check(ok, `${p.name} gets "${g1.name} is down!" on screen and the markers gather round`);
    }
    if (process.env.SHOTS) await host.screenshot({ path: require('path').join(process.env.SHOTS, 'mate-down.png') });
    await settle(g1, () => G.Game.watching);
    const where = (p, uid) => p.evaluate(u => { const m = G.Coop.mate(u); return { cam: [G.Camera.x, G.Camera.y], at: m ? [m.pl.x, m.pl.y] : null,
      watching: G.Game.watching && G.Game.watching.uid }; }, uid);
    const near = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 80;
    const w0 = await g1.evaluate(() => G.Game.watching && G.Game.watching.uid);
    const first = w0 === host.uid ? host : g2, other = first === host ? g2 : host;
    await g1.waitForTimeout(1500);
    let pos = await where(g1, first.uid);
    check(!!w0 && near(pos.cam, pos.at), `downed g1 watches ${first.name}: camera on them`);
    await g1.keyboard.press('KeyE');
    await g1.waitForTimeout(1500);
    pos = await where(g1, other.uid);
    check(pos.watching === other.uid && near(pos.cam, pos.at), `E switches to ${other.name}, camera follows`);
    await g1.keyboard.press('ArrowLeft');
    await g1.waitForTimeout(1500);
    pos = await where(g1, first.uid);
    check(pos.watching === first.uid && near(pos.cam, pos.at), `left arrow switches back to ${first.name}`);
    // Watch the host; an enemy appears next to the host (far from g1's body): g1 must get it.
    await g1.evaluate(u => { for (let i = 0; i < 4 && G.Game.watching.uid !== u; i++) G.Game.watchNext(1); }, host.uid);
    const eid = await host.evaluate(() => {
      const pl = G.Game.player, def = G.Enemies.cast[0].list[0];
      const e = new G.Enemy(def, pl.x + 120, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; G.EnemyMgr.add(e); return e.id;
    });
    check(await settle(g1, id => G.EnemyMgr.all().some(e => e.id === id), eid),
      "an enemy next to the watched host (2200 px from g1's body) reaches downed g1");
    // HUD names who you're watching.
    const hud = await g1.evaluate(() => new Promise(res => {
      const seen = [], o = G.I18n.rawCanvas;
      G.I18n.rawCanvas = function (c, k, s) { if (k === 'fillText') seen.push(String(s)); return o.apply(this, arguments); };
      setTimeout(() => { G.I18n.rawCanvas = o; res([...new Set(seen)]); }, 300);
    }));
    check(hud.includes('Watching ' + host.name), `HUD shows "Watching ${host.name}"`);
    if (process.env.SHOTS) await g1.screenshot({ path: require('path').join(process.env.SHOTS, 'coop-spectate.png') });
    // The watched one goes down: g1 moves on to the one still standing.
    await down(host);
    check(await settle(g1, u => G.Game.watching && G.Game.watching.uid === u, g2.uid),
      'the watched host goes down: g1 switches to g2, the one still standing');
    // Revived: g2 walks over to g1's body and stays there (the real 3 s revive, which credits
    // g2 a rescue); the host is just stood back up.
    const body = await g1.evaluate(() => [G.Game.player.x, G.Game.player.y]);
    await g2.evaluate(b => { const pl = G.Game.player; pl.x = b[0] + 20; pl.y = b[1]; pl.frozen = true; }, body);
    check(await settle(g1, () => !G.Game.player.dead, undefined, 12000), 'g2 stands next to g1 and revives them');
    await g2.evaluate(() => { G.Game.player.frozen = false; });
    await host.evaluate(() => G.Game.player.revive(0.5));
    await g1.waitForTimeout(1500);
    const back = await g1.evaluate(() => ({ watching: G.Game.watching, cam: [G.Camera.x, G.Camera.y], me: [G.Game.player.x, G.Game.player.y] }));
    check(!back.watching && near(back.cam, back.me), 'revived: no longer spectating, camera back on g1');
    await host.evaluate(id => { const e = G.EnemyMgr.get(id); if (e) e.hurt(1e9, '#fff', 0, 0, 0, null); }, eid);

    // ---------------- Bonds ----------------
    console.log('Bonds: everyone picks at the same time');
    for (const p of ALL) await p.evaluate(() => { const pl = G.Game.player; pl.addMove('tackle') || pl.addMove('quick-attack'); });
    await host.evaluate(() => G.Rift.enterRequest());
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Rift.inArena, null, { timeout: 15000 })));
    await host.waitForFunction(() => G.EnemyMgr.get(G.Rift.arena.bossId), null, { timeout: 15000 });
    await host.evaluate(() => G.EnemyMgr.get(G.Rift.arena.bossId).hurt(1e9, '#fff', 0, 0, 0, null));
    const b0 = Date.now(), opened = ALL.map(() => null);
    let allOpen = false;
    while (Date.now() - b0 < 16000) {
      // Level-up cards (the legendary gives XP) are picked as a player would.
      for (const p of ALL) if (await p.evaluate(() => G.UI.isOpen('scr-levelup') && !document.getElementById('cards').classList.contains('done')))
        await p.evaluate(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); });
      const open = await Promise.all(ALL.map(p => p.evaluate(() => G.UI.isOpen('scr-bond'))));
      open.forEach((o, i) => { if (o && opened[i] == null) opened[i] = Date.now() - b0; });
      if (open.every(Boolean)) { allOpen = true; break; }
      await host.waitForTimeout(100);
    }
    check(allOpen, `all three bond screens are open at the same time (opened at ${opened.join(' / ')} ms)`);
    if (allOpen) check(Math.max(...opened) - Math.min(...opened) < 1500, `they opened together (${Math.max(...opened) - Math.min(...opened)} ms apart)`);
    const states = await Promise.all(ALL.map(p => p.evaluate(() => G.Game.state)));
    check(allOpen && states.every(s => s === 'choice'), `everyone is choosing and the run is paused (${states})`);
    // Each picks (key 1 = first card; a "pair" bond takes two picks), after the cards' short
    // "can't pick yet" guard (run-ui.js guard) so the press isn't swallowed. g2 picks last.
    await host.waitForTimeout(1200);
    const pick = async p => { for (let i = 0; i < 2; i++) if (await p.evaluate(() => G.UI.isOpen('scr-bond'))) { await p.keyboard.press('Digit1'); await p.waitForTimeout(300); } };
    await pick(host); await pick(g1);
    await host.waitForTimeout(800);
    const mid = await Promise.all([host, g1].map(p => p.evaluate(() => G.Game.state)));
    check(mid.every(s => s === 'held'), `host and g1 have picked and wait for g2 (${mid})`);
    await pick(g2);
    check((await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'resuming', undefined, 3000)))).every(Boolean),
      'the last pick starts the 3 s "Resuming…" countdown for everyone');
    await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'playing', undefined, 8000)));
    const after = await Promise.all(ALL.map(p => p.evaluate(() => ({ st: G.Game.state, fused: G.Game.player.slots.some(g => g.length > 1), bonds: G.Game.player.bonds }))));
    check(after.every(a => a.st === 'playing' && a.fused && a.bonds === 0), 'after all pick, everyone is fused and playing again: ' + JSON.stringify(after));

    // Two bonds for g2, one for g1 (js/game.js bondBusy): nobody counts down until g2's second
    // bond is picked too. It used to count down for everyone between g2's two bonds.
    console.log('Bonds: countdown only once every screen is clear');
    for (const p of [g1, g2]) await p.evaluate(two => { const pl = G.Game.player; pl.maxMoves = 8;
      for (const id of ['bite', 'ember', 'water-gun', 'vine-whip']) if (pl.slots.filter(g => g.length === 1).length < 2) pl.addMove(id);
      pl.bonds = two ? 2 : 1; }, p === g2);
    const counted = () => Promise.all(ALL.map(p => p.evaluate(() => { window.__counted = false; window.__stopC = false;
      (function w() { if (G.Game.state === 'resuming') window.__counted = true; if (!window.__stopC) requestAnimationFrame(w); })(); })));
    await counted();
    check((await Promise.all([g1, g2].map(p => settle(p, () => G.UI.isOpen('scr-bond'), undefined, 5000)))).every(Boolean), 'g1 and g2 get their bond screens');
    await host.waitForTimeout(1200);
    await pick(g1); await pick(g2);
    await host.waitForTimeout(1000);
    const between2 = await Promise.all(ALL.map(p => p.evaluate(() => ({ st: G.Game.state, counted: window.__counted }))));
    const g2open = await g2.evaluate(() => ({ open: G.UI.isOpen('scr-bond'), bonds: G.Game.player.bonds }));
    check(g2open.open && g2open.bonds === 1 && between2.every(b => !b.counted && b.st !== 'playing'),
      `g2's second bond opens at once and nobody has counted down yet (${JSON.stringify(between2)}, g2 ${JSON.stringify(g2open)})`);
    await g2.waitForTimeout(800);
    await pick(g2);
    check((await Promise.all(ALL.map(p => settle(p, () => window.__counted, undefined, 4000)))).every(Boolean), 'after g2\'s last bond, the countdown runs for everyone');
    await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'playing', undefined, 8000)));
    await Promise.all(ALL.map(p => p.evaluate(() => { window.__stopC = true; })));

    // ---------------- Level-up: countdown only after a long pick ----------------
    // Everyone's cards close together; if choosing took over 10 s, a 3 s countdown follows.
    console.log('Level-up cards: countdown after a long pick');
    const watch = () => Promise.all(ALL.map(p => p.evaluate(() => { window.__counted = false;
      (function w() { if (G.Game.state === 'resuming') window.__counted = true; if (!window.__stopW) requestAnimationFrame(w); })(); })));
    const levelUp = async waitMs => {
      await Promise.all(ALL.map(p => p.evaluate(() => { window.__stopW = false; })));
      await watch();
      await host.evaluate(() => G.Game.debugLevelUp());
      await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'levelup', null, { timeout: 8000 })));
      await host.waitForTimeout(waitMs);
      for (const p of ALL) await p.evaluate(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); });
      await Promise.all(ALL.map(p => settle(p, () => G.Game.state === 'playing', undefined, 8000)));
      const counted = await Promise.all(ALL.map(p => p.evaluate(() => { window.__stopW = true; return window.__counted; })));
      // More level-ups may follow (the XP of earlier kills): pick them quickly.
      for (let i = 0; i < 6; i++) {
        let any = false;
        for (const p of ALL) if (await p.evaluate(() => G.Game.state === 'levelup')) { any = true; await p.waitForTimeout(700); await p.evaluate(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); }); }
        if (!any) break;
        await host.waitForTimeout(800);
      }
      return counted;
    };
    const quick = await levelUp(1200);
    check(quick.every(c => !c), `picked within 10 s: straight back to playing, no countdown (${quick})`);
    const slow = await levelUp(10600);
    check(slow.every(Boolean), `picked after more than 10 s: the countdown plays for everyone (${slow})`);

    // ---------------- Back in the lobby: ready reset, force start ----------------
    console.log('Back to the lobby; force start');
    // g2's own attacks finish off fragile enemies placed in front of it: the host credits g2
    // (and the move) from the 'h' events, which now carry the move. The others are moved far
    // away first, or their attacks would take some of g2's kills (correctly credited to them).
    for (const p of [host, g1]) await p.evaluate(() => { G.Game.player.x += 3000; });
    await host.waitForTimeout(600);
    const k0 = await host.evaluate(u => (G.RunStats.tally[u] || { k: 0 }).k, g2.uid);
    const ids = await host.evaluate(u => {
      const p = G.Coop.mate(u).pl, def = G.Enemies.cast[0].list[0], out = [];
      for (let i = 0; i < 4; i++) { const e = new G.Enemy(def, p.x + 40 + i * 14, p.y + (i % 2 ? 12 : -12), G.Enemies.scale(0)); e.hp = e.maxHp = 1; e.spd = 0; G.EnemyMgr.add(e); out.push(e.id); }
      return out;
    }, g2.uid);
    await settle(host, ids => ids.every(id => !G.EnemyMgr.get(id)), ids, 15000);
    const kd = await host.evaluate(([u, k0]) => ({ delta: (G.RunStats.tally[u] || { k: 0 }).k - k0, mk: (G.RunStats.tally[u] || {}).mk }), [g2.uid, k0]);
    check(kd.delta === 4, `the 4 enemies g2 finished off are credited to g2 on the host, by move: ${JSON.stringify(kd)}`);

    for (const p of ALL) await down(p);
    for (const p of ALL) await p.waitForSelector('#scr-party', { timeout: 20000 });
    // Everyone's own final numbers (shots already in flight when they went down count too).
    const own = await Promise.all(ALL.map(p => p.evaluate(() => ({ d: Math.round(G.Game.player.dmgDealt || 0), dn: G.RunStats.my.dn }))));
    const tables = await Promise.all(ALL.map(p => p.evaluate(() => [...document.querySelectorAll('#scr-party tr')].slice(1).map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim().replace(/\s+/g, ' '))))));
    console.log('  party summary (host view): ' + JSON.stringify(tables[0]));
    const meRow = await Promise.all(ALL.map(p => p.evaluate(() => [...document.querySelectorAll('#scr-party tr')].slice(1).findIndex(tr => tr.classList.contains('me')))));
    check(meRow.join() === '0,1,2', `each player's own row is highlighted (${meRow})`);
    check(tables.every(t => JSON.stringify(t) === JSON.stringify(tables[0])) && tables[0].length === 3, 'all three see the same team summary, one row each');
    const num = v => +String(v).replace(/[^0-9]/g, '');
    const rows = tables[0];
    check(rows.every((r, i) => num(r[2]) === own[i].dn), `downs match what each player counted (${own.map(o => o.dn)})`);
    check(num(rows[2][3]) >= 1, `g2 has the rescue it made (${rows[2][3]})`);
    check(num(rows[2][1]) >= 4, `g2's kills are in its row (${rows[2][1]})`);
    check(rows.every((r, i) => Math.abs(num(r[4]) - own[i].d) <= 1), `damage in the summary matches each player's final total (${own.map(o => o.d)})`);
    if (process.env.SHOTS) await g2.screenshot({ path: require('path').join(process.env.SHOTS, 'coop-party-summary.png') });
    // Then each sees their own breakdown: per move, and the moves add up to the total.
    for (const p of ALL) await p.click('#scr-party [data-a=next]');
    const mineOk = await Promise.all(ALL.map(p => p.evaluate(() => {
      const s = G.RunStats.mine(0, G.RunStats.party() || null);
      const rows = [...document.querySelectorAll('#over-stats table tr')].slice(1);
      return { rows: rows.length, moves: s.moves.length, sum: s.moves.reduce((a, m) => a + m.d, 0), d: s.d,
               kills: s.moves.reduce((a, m) => a + m.k, 0), k: s.k,
               shown: document.getElementById('scr-over') && !document.getElementById('scr-over').classList.contains('hidden') };
    })));
    check(mineOk.every((m, i) => m.kills === num(rows[i][1]) && m.k === num(rows[i][1])), `per-move kills add up to each player's kills in the summary (${mineOk.map(m => m.kills)})`);
    check(mineOk.every((m, i) => Math.abs(m.d - num(rows[i][4])) <= 1), `each breakdown's total equals that player's row in the summary (${mineOk.map(m => m.d)})`);
    check(mineOk.every(m => m.shown && m.rows === m.moves && m.moves > 0 && Math.abs(m.sum - m.d) <= m.moves),
      'each player then sees their own per-move breakdown, adding up to their total: ' + JSON.stringify(mineOk));
    await g2.waitForTimeout(700);                                  // the screen fades in
    const vis = await g2.evaluate(() => { const el = document.getElementById('scr-over'), cs = getComputedStyle(el);
      return { op: +cs.opacity, disp: cs.display, vis: cs.visibility, z: cs.zIndex }; });
    check(vis.disp !== 'none' && vis.vis === 'visible' && vis.op > 0.9, 'the end screen with the breakdown is actually visible: ' + JSON.stringify(vis));
    if (process.env.SHOTS) await g2.screenshot({ path: require('path').join(process.env.SHOTS, 'coop-my-breakdown.png') });
    for (const p of ALL) {
      await p.waitForSelector('#btn-again', { state: 'visible', timeout: 20000 });
      await p.waitForTimeout(600);
      await p.click('#btn-again');
    }
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.UI.isOpen('scr-lobby'), null, { timeout: 15000 })));
    await settle(host, n => G.Social.room.members.length === n && G.Social.room.open, ALL.length, 10000);
    await host.waitForTimeout(600);
    const l2 = await Promise.all(ALL.map(lobby));
    check(l2.every(l => /I'm ready/.test(l.me)) && /0\/3/.test(l2[0].btn), `after the run nobody is ready again ("${l2[0].btn}")`);
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');                            // force start: nobody ready
    check(await inRun(ALL).then(() => true, () => false), 'the host can force start with nobody ready');

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
