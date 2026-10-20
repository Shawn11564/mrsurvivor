#!/usr/bin/env node
// Moves: status effects, Hex, buff timers and move text, checked in the game in headless Edge.
// It drives dev.html (same source files as the build, with G reachable).
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-moves.cjs [base-url]
//   (co-op part, optional: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
// Every attack is cast by the real combat code (G.Combat.tick from the game loop) at a real
// enemy; only the setup is scripted (which move is in the slot, where the enemy stands, the
// spawner switched off, the player kept alive). Checks:
//   1. Every move that burns, poisons, slows or stuns (paralyzes / freezes / traps) actually
//      leaves that state on the enemy it hits (js/systems/combat.js hit, Enemy.apply*).
//   2. Hex (js/systems/combat.js chain, `hasStatus`) does ×1.7 to a foe that is burned,
//      poisoned, slowed or stunned, each state put there by a real move, and ×1 to a clean one.
//   3. Buff timer on the slot (js/ui/hud.js, `buffSecs`): a buff with upgraded duration
//      (10.5 s) never shows more than it has and counts down without jumping
//      (it showed "11s", then "9.9s" half a second later).
//   4. Two buffs on the same stat (Swords Dance + Dragon Dance, Player.addBuff): the shorter
//      one no longer cuts the longer one's time.
//   5. Move tooltip (hud.js drawTip, G.MoveText.tipNotes in js/fork/move-text.js): says what
//      the move hits with and what boosts it; English descriptions fixed in move-text.js.
//   6. Co-op, if the Firebase emulator is up: a guest's Hex gets the bonus on a foe the guest
//      slowed (status bits from the host, js/net/coop.js enemyList), and a foe the guest
//      stunned shows as stunned on the guest's copy (no contact damage while stunned).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

// Test helpers installed in the page (window.TM).
function installHelpers() {
  const pl = () => G.Game.player;
  // A plain enemy Ghost moves can hit (not Normal-type), that just walks at you.
  let DEF = null;
  for (const tier of G.Enemies.cast) for (const d of tier.list) {
    const p = G.DEX_BY[d.dex];
    if (!DEF && p && !p.types.includes('normal') && !p.types.includes('dark') && (!d.behavior || d.behavior === 'chase')) DEF = d;
  }
  DEF = DEF || G.Enemies.cast[0].list[0];
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  async function waitFor(pred, ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) { if (pred()) return true; await frame(); }
    return !!pred();
  }
  const has = (e, st) => st === 'burn' ? e.burn > 0 : st === 'poison' ? e.poison > 0 : st === 'slow' ? e.slow > 0 : e.stunT > 0;
  const anyStatus = e => ['burn', 'poison', 'slow', 'stun'].some(s => has(e, s));
  const statusOf = m => m.burn ? 'burn' : m.poison ? 'poison' : m.stun ? 'stun' : m.slow ? 'slow' : null;
  function only(...ms) { const p = pl(); p.slots = ms.length ? [ms] : []; p.moves = ms.slice(); p.active = 0; }
  // (lastPatch: the trail move won't drop a new patch on top of the last one, which clearFields just removed.)
  function clear() { G.EnemyMgr.clear(); G.Combat.clearFields(); G.Projectiles.clear(); pl().lastPatch = null; }
  function spawn(dx, dy, walk) {
    const p = pl(), e = new G.Enemy(DEF, p.x + dx, p.y + dy, G.Enemies.scale(0));
    e.hp = e.maxHp = 1e7;
    if (!walk) e.spd = 0;
    G.EnemyMgr.add(e);
    return e;
  }
  function keepAlive() {
    G.Spawner.update = () => {};
    (function loop() { const p = pl(); if (p) { p.invuln = 99; p.hp = p.maxHp; p.critChance = 0; } requestAnimationFrame(loop); })();
  }
  window.TM = { pl, DEF, frame, waitFor, has, anyStatus, statusOf, only, clear, spawn, keepAlive };
}

/** A move that puts `st` on its target, then Hex at it; and Hex at a clean foe. → dealt ratio. */
async function hexRatio(id) {
  const { only, clear, spawn, waitFor, has, anyStatus, statusOf } = TM;
  const sm = G.Moves.instance(id, 1), st = statusOf(sm);
  clear();
  const a = spawn(70, 0);
  const hx = G.Moves.instance('hex', 1);
  sm.t = 0; hx.t = 1e9;                      // Hex waits until the state is on
  only(sm, hx);
  if (!await waitFor(() => has(a, st), 6000)) { only(); return { st, err: 'state never applied' }; }
  hx.t = 0;
  await waitFor(() => hx.dealt > 0, 2000);
  const onAtHit = has(a, st), dA = hx.dealt || 0;
  only();
  clear();
  const b = spawn(70, 0), h2 = G.Moves.instance('hex', 1);
  h2.t = 0; only(h2);
  await waitFor(() => h2.dealt > 0, 2000);
  const dB = h2.dealt || 0, clean = !anyStatus(b);
  only();
  return { st, ratio: dB ? dA / dB : 0, onAtHit, clean };
}

async function solo(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.DB.playAsGuest && G.Game && G.EnemyMgr, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  // Gengar (Ghost/Poison): learns Hex.
  await page.evaluate(() => { G.DB.save.partner = 94; G.DB.save.owned[94] = G.DB.save.owned[94] || { at: Date.now() }; G.Flow.goMenu(); G.Game.startRun(null, { dex: 94, shiny: false }); });
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Game.player.activeMove(), null, { timeout: 30000 });
  await page.evaluate(installHelpers);
  await page.evaluate(() => TM.keepAlive());

  // ---------------- 1. every status move leaves its state ----------------
  console.log('Status moves leave their state on the enemy');
  const ids = await page.evaluate(() => G.Moves.ALL.filter(m => TM.statusOf(m)).map(m => m.id));
  for (const id of ids) {
    const r = await page.evaluate(async id => {
      const { only, clear, spawn, waitFor, has, statusOf } = TM;
      clear();
      const m = G.Moves.instance(id, 1), st = statusOf(m);
      // Where the enemy has to be for this kind of attack to reach it.
      const d = m.kind === 'orbit' ? m.radius : m.kind === 'trail' ? 4 : m.kind === 'mine' ? 110 : 70;
      const e = spawn(d, 0, m.kind === 'mine');          // mines: it walks onto them
      m.t = 0; only(m);
      const ok = await waitFor(() => has(e, st), m.kind === 'mine' ? 12000 : 6000);
      only();
      return { id, name: G.T(m.name, 'move'), st, kind: m.kind, ok };
    }, id);
    check(r.ok, `${r.name} (${r.kind}) leaves the enemy ${r.st === 'stun' ? 'stunned' : r.st === 'slow' ? 'slowed' : r.st + 'ed'}`);
  }

  // ---------------- 2. Hex ----------------
  console.log('Hex: ×1.7 on a foe with a status, put there by a real move');
  for (const id of ['ember', 'sludge', 'lick', 'thunder-wave', 'freeze-dry']) {
    const r = await page.evaluate(hexRatio, id);
    check(!r.err && r.onAtHit && r.clean && Math.abs(r.ratio - 1.7) < 0.02,
      `${id} → ${r.st}: Hex does ×${r.ratio ? r.ratio.toFixed(2) : '?'} vs a clean foe` + (r.err ? ` (${r.err})` : ''));
  }

  // ---------------- 3. buff timer on the slot ----------------
  console.log('Buff timer: upgraded duration shows true time, no jumps');
  const tl = await page.evaluate(async () => {
    const { only, clear, waitFor } = TM;
    clear();
    const sd = G.Moves.instance('swords-dance', 4);    // +50 % duration: 10.5 s
    // Watch it cast once, then leave it in the slot without recasting (so it counts down).
    sd.t = 0; only(sd);
    await waitFor(() => TM.pl().buffs.patk.n > 0, 2000);
    sd.t = 1e9;
    const P = CanvasRenderingContext2D.prototype, orig = P.fillText, out = [];
    P.fillText = function (s) { if (/^\d+(\.\d)?s$/.test(String(s))) out.push([performance.now(), parseFloat(s), TM.pl().buffs.patk.t]); return orig.apply(this, arguments); };
    await new Promise(r => setTimeout(r, 2500));
    P.fillText = orig;
    only();
    return { dur: sd.dur, out };
  });
  let worstJump = 0, over = 0;
  for (let i = 1; i < tl.out.length; i++) {
    const [t0, v0] = tl.out[i - 1], [t1, v1] = tl.out[i];
    worstJump = Math.max(worstJump, (v0 - v1) - (t1 - t0) / 1000);   // drop beyond the time that passed
  }
  for (const [, v, real] of tl.out) over = Math.max(over, v - real);
  const shown = [...new Set(tl.out.map(o => o[1]))];
  check(tl.out.length > 10 && over <= 0.001, `never shows more time than is left (max ${shown[0]}s for ${tl.dur} s; worst +${over.toFixed(2)} s)`);
  check(tl.out.length > 10 && worstJump < 0.2, `counts down without jumping (worst extra drop ${worstJump.toFixed(2)} s; shown: ${shown.slice(0, 8).join(', ')}...)`);

  // ---------------- 4. two buffs on one stat ----------------
  console.log('Swords Dance + Dragon Dance: the shorter one keeps the longer time');
  const sh = await page.evaluate(async () => {
    const { only, clear, frame } = TM;
    clear();
    const b = TM.pl().buffs.patk;
    b.n = 0; b.t = 0;
    const sd = G.Moves.instance('swords-dance', 4), dd = G.Moves.instance('dragon-dance', 1);   // 10.5 s and 7 s
    sd.t = 0; dd.t = 0.4;
    only(sd, dd);
    let prev = null, worst = 0;
    const end = performance.now() + 2500;
    while (performance.now() < end) {
      await frame();
      if (prev != null && b.n > 0) worst = Math.max(worst, prev - b.t - 0.1);
      prev = b.n > 0 ? b.t : null;
    }
    only();
    return { worst, n: b.n, amount: b.amount };
  });
  check(sh.worst < 0.05, `the timer never drops when Dragon Dance (7 s) casts over Swords Dance (10.5 s) (worst drop ${sh.worst.toFixed(2)} s)`);

  // ---------------- 5. upgrades ----------------
  console.log('Upgrades: every step changes what it says; "+1 projectile" really adds a shot');
  const noop = await page.evaluate(() => {
    const out = [], M = G.Moves;
    // What combat.js uses (a missing count fires 1; novas at least 3, cones 2; boomerangs fan 0.5).
    const eff = (s, k) => k === 'count' ? Math.max(s.kind === 'nova' ? 3 : s.kind === 'cone' ? 2 : 1, s.count | 0)
      : k === 'spread' && s.kind === 'boomerang' ? (s.spread || 0.5) : s[k] || 0;
    for (const d of M.ALL) {
      const s = M.instance(d.id, 1);
      d.ups.forEach((u, i) => { const b = { ...s }; M.levelUp(s); for (const k in u.m) if (eff(b, k) === eff(s, k)) out.push(`${d.id} Lv${i + 2} "${u.t}": ${k}`); });
    }
    return out;
  });
  check(noop.length === 0, 'no upgrade step leaves a stat it names unchanged' + (noop.length ? ': ' + noop.join(' | ') : ''));
  // With several shots, one always flies straight at the target (an even fan used to straddle
  // it: two shots 8-20° either side, both missing). fanOff in js/systems/combat.js.
  for (const [id, lvl, want] of [['shadow-sneak', 2, 2], ['energy-ball', 5, 3], ['seed-bomb', 5, 2], ['air-slash', 1, 2], ['air-slash', 2, 3],
                                 ['ember', 2, 2], ['ember', 5, 3], ['water-gun', 5, 3], ['razor-leaf', 1, 2], ['psycho-cut', 1, 2]]) {
    const r = await page.evaluate(async ([id, lvl]) => {
      TM.clear();
      const e = TM.spawn(120, -40), pl = TM.pl();
      const m = G.Moves.instance(id, lvl); m.t = 0; TM.only(m);
      await TM.waitFor(() => G.Projectiles.all().some(p => p.src === m), 2000);
      const to = Math.atan2(e.y - pl.y, e.x - pl.x);
      const a = G.Projectiles.all().filter(p => p.src === m).map(p => Math.atan2(p.vy, p.vx));
      TM.only();
      const off = Math.min(...a.map(x => Math.abs(Math.atan2(Math.sin(x - to), Math.cos(x - to)))));
      return { n: a.length, fan: a.length > 1 ? (Math.max(...a) - Math.min(...a)) * 180 / Math.PI : 0, off: off * 180 / Math.PI };
    }, [id, lvl]);
    check(r.n === want && (want === 1 || (r.fan > 8 && r.fan < 120)) && r.off < 3,
      `${id} Lv${lvl} fires ${r.n} shot(s) (want ${want})${r.n > 1 ? `, fanned over ${r.fan.toFixed(0)}°` : ''}, nearest ${r.off.toFixed(1)}° off the target`);
  }

  // ---------------- charge meter ----------------
  console.log('Charge meter over the player: long-wait moves show recharge and wind-up');
  const cm = await page.evaluate(async () => {
    if (!G.ChargeMeter) return null;
    const out = {};
    for (const id of ['hyper-beam', 'ominous-wind', 'will-o-wisp']) {
      TM.clear(); const e = TM.spawn(110, 0);
      const m = G.Moves.instance(id, 1); m.t = 0; TM.only(m);
      // One cast, then the enemy steps out of reach so the move sits ready instead of recasting.
      await TM.waitFor(() => m.castAt, 2000);
      e.x += 5000;
      const seen = [];
      const end = performance.now() + m.cd * 1000 + 600;
      // (Up to "ready": a turret needs no target, and with none the aim falls back to rocks and
      // chests nearby, so it may well cast again.)
      while (performance.now() < end) {
        const s = G.ChargeMeter.state(m, TM.pl()); seen.push(s.st + ':' + s.frac.toFixed(2) + (s.flash ? '!' : ''));
        if (s.st === 'ready') break;
        await TM.frame();
      }
      TM.only();
      // Order of phases (without repeats) and whether the recharge only ever fills up.
      const phases = seen.map(s => s.split(':')[0]).filter((s, i, a) => s !== a[i - 1]);
      const rec = seen.filter(s => s.startsWith('recharging')).map(s => parseFloat(s.split(':')[1]));
      out[id] = { phases: phases.join('>'), rising: rec.every((v, i) => i === 0 || v >= rec[i - 1]), flash: seen.some(s => s.endsWith('!')) };
    }
    // Drawn above the player, and only for these kinds.
    const P = CanvasRenderingContext2D.prototype, arc = P.arc, pl = TM.pl();
    const count = async id => {
      TM.clear(); const m = G.Moves.instance(id, 1); m.t = 1; TM.only(m);
      let n = 0; P.arc = function (x, y) { if (Math.abs(x - pl.x) < 30 && y < pl.y - pl.bodyH) n++; return arc.apply(this, arguments); };
      await new Promise(r => setTimeout(r, 300)); P.arc = arc; TM.only(); return n;
    };
    out.drawn = { 'ominous-wind': await count('ominous-wind'), ember: await count('ember') };
    return out;
  });
  if (!cm) check(false, 'G.ChargeMeter (js/fork/charge-meter.js) is loaded');
  else {
    check(/charging>recharging/.test(cm['hyper-beam'].phases) && cm['hyper-beam'].rising && cm['hyper-beam'].flash,
      `Hyper Beam: charging (wind-up) → recharging, flash when the beam fires (${cm['hyper-beam'].phases})`);
    for (const id of ['ominous-wind', 'will-o-wisp'])
      check(/recharging>ready/.test(cm[id].phases) && !/charging>/.test(cm[id].phases.replace('recharging', '')) && cm[id].rising && cm[id].flash,
        `${id}: fills while it recharges, then ready; flash on cast (${cm[id].phases})`);
    check(cm.drawn['ominous-wind'] > 0 && cm.drawn.ember === 0, `the ring is drawn above the player for Ominous Wind, not for Ember (${JSON.stringify(cm.drawn)})`);
  }

  // ---------------- 6. tooltip and English text ----------------
  console.log('Tooltip: what the move hits with and what boosts it; English descriptions');
  const hasText = await page.evaluate(() => !!(window.G && G.MoveText));
  if (!hasText) check(false, 'G.MoveText (js/fork/move-text.js) is loaded');
  else {
    const hud = () => page.evaluate(() => {
      const pl = G.Game.player, K = G.Settings.get('hudSize') || 1, S = 54 * K, GAP = 9 * K, n = Math.max(1, pl.slots.length);
      const sx = (innerWidth - (n * S + (n - 1) * GAP)) / 2, sy = innerHeight - S - 18;
      return pl.slots.map((g, i) => ({ x: sx + i * (S + GAP) + S / 2, y: sy + S / 2 }));
    });
    const tipText = () => page.evaluate(() => new Promise(res => {
      const seen = [], orig = G.I18n.rawCanvas;
      G.I18n.rawCanvas = function (ctx, k, s) { if (k === 'fillText') seen.push(String(s)); return orig.apply(this, arguments); };
      setTimeout(() => { G.I18n.rawCanvas = orig; res(seen.join(' ').replace(/\s+/g, ' ')); }, 300);
    }));
    // Gengar is a special attacker: a physical move gets the "weaker" note too.
    const cases = [['shadow-ball', /Special: hits with your Special Attack\. Boosted by Nasty Plot\./, null],
                   ['lick', /Physical: hits with your Attack\. Boosted by Swords Dance and Dragon Dance\./, /Weaker for Gengar: only \d+ % damage/],
                   ['nasty-plot', /Boosts your special moves\./, null],
                   ['agility', null, null]];
    for (const [id, want, also] of cases) {
      await page.evaluate(id => { const m = G.Moves.instance(id, 1); m.t = 1e9; TM.only(m); }, id);
      const pos = await hud();
      await page.mouse.move(pos[0].x, pos[0].y);
      const tt = await tipText();
      await page.mouse.move(550, 150);
      if (want) check(want.test(tt) && (!also || also.test(tt)), `${id}: tooltip says ${want.source.replace(/\\/g, '')}${also ? ' + ' + also.source : ''}`);
      else check(!/Boosted by|Boosts your/.test(tt) && /Agility/.test(tt), `${id}: no category line on a buff that isn't Attack/Sp. Atk`);
    }
    const txt = await page.evaluate(() => Object.fromEntries(['lick', 'bubble', 'vine-whip', 'psybeam', 'giga-drain', 'ice-shard', 'substitute',
      'dragon-dance', 'hex', 'ember'].map(id => [id, G.T(G.Moves.BY_ID[id].desc)])));
    check(txt.lick === 'A ghostly lick that slows the foes it touches.' && txt.bubble.startsWith('A ring of bubbles') &&
          txt['ice-shard'].startsWith('Fires ice shards in rapid succession') && /paralyzed/.test(txt.hex) && /burns/.test(txt.ember),
      'English descriptions come from move-text.js: ' + JSON.stringify(txt).slice(0, 220) + '…');
  }
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await page.close();
}

// ---------------- 6. co-op ----------------
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, locale: 'en-US' });
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
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false, uid: G.DB.fb.uid };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.uid = r.uid; page.name = name;
  return page;
}

async function coop(browser) {
  const up = await fetch('http://127.0.0.1:9099/').then(() => true, () => false);
  if (!up) { console.log('Co-op: SKIPPED (start the Firebase emulator to run it)'); return; }
  console.log('Co-op: a guest\'s Hex and stuns');
  const host = await player(browser, 'mhst' + tag, 4);         // Charmander
  const guest = await player(browser, 'mgst' + tag, 94);       // Gengar
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
  if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
  await host.waitForTimeout(400);
  await guest.click('#lobby-ready'); await host.click('#lobby-ready');
  await Promise.all([host, guest].map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
  for (const p of [host, guest]) { await p.evaluate(installHelpers); await p.evaluate(() => TM.keepAlive()); }
  // Host: no other enemies; spawns ours next to the guest.
  await host.evaluate(() => { for (const e of G.EnemyMgr.all()) G.Coop.enemyGone(e, false); G.EnemyMgr.clear(); });
  await host.evaluate(() => { G.Game.player.x += 2500; });     // the host's own attacks stay out of it
  const spawnAtGuest = (dx, dy, walk) => host.evaluate(([u, dx, dy, walk]) => {
    const g = G.Coop.mate(u).pl, e = new G.Enemy(TM.DEF, g.x + dx, g.y + dy, G.Enemies.scale(0));
    e.hp = e.maxHp = 1e7; if (!walk) e.spd = 0; G.EnemyMgr.add(e); return e.id;
  }, [guest.uid, dx, dy, walk]);
  const gone = id => host.evaluate(id => { const e = G.EnemyMgr.get(id); if (e) { G.Coop.enemyGone(e, false); e.dead = true; } }, id);

  // Hex: the guest slows foe A with Lick (bonded with Hex), then Hex; then Hex on a clean foe B.
  const guestHex = async (withLick) => {
    const eid = await spawnAtGuest(60, 0);
    await guest.waitForFunction(id => G.EnemyMgr.get(id), eid, { timeout: 8000 });
    const r = await guest.evaluate(async ([eid, withLick]) => {
      const { only, waitFor } = TM, e = G.EnemyMgr.get(eid);
      const hx = G.Moves.instance('hex', 1);
      if (withLick) {
        const lk = G.Moves.instance('lick', 1);
        lk.t = 0; hx.t = 1e9; only(lk, hx);
        // The host has it slowed and says so (status bit 8) before Hex goes.
        await waitFor(() => e.net && (e.net.st & 8), 3000);
        await waitFor(() => false, 150);
      } else only(hx);
      const bit = !!(e.net && e.net.st & 8);
      hx.t = 0; if (!withLick) only(hx);
      await waitFor(() => hx.dealt > 0, 3000);
      only();
      return { dealt: hx.dealt || 0, bit };
    }, [eid, withLick]);
    await gone(eid);
    await guest.waitForTimeout(400);
    return r;
  };
  const slowed = await guestHex(true), clean = await guestHex(false);
  check(slowed.bit, 'the guest\'s copy of the foe it slowed carries the host\'s "slowed" bit');
  const ratio = clean.dealt ? slowed.dealt / clean.dealt : 0;
  check(Math.abs(ratio - 1.7) < 0.03, `guest's Hex on the foe it slowed does ×${ratio.toFixed(2)} vs a clean foe`);

  // Stun: the guest's Thunder Wave on a foe standing on it; the guest's copy shows it stunned
  // and that foe doesn't hit the guest while stunned.
  const cid = await spawnAtGuest(4, 0);
  await guest.waitForFunction(id => G.EnemyMgr.get(id), cid, { timeout: 8000 });
  const st = await guest.evaluate(async cid => {
    const { only, waitFor, frame } = TM, e = G.EnemyMgr.get(cid);
    const tw = G.Moves.instance('thunder-wave', 1); tw.t = 0; only(tw);
    let seen = 0, strikesWhileStunned = 0, lastCd = e.touchCd || 0;
    const end = performance.now() + 3000;
    while (performance.now() < end) {
      await frame();
      if (e.stunT > 0) seen++;
      if ((e.touchCd || 0) > lastCd + 0.3 && e.stunT > 0) strikesWhileStunned++;
      lastCd = e.touchCd || 0;
    }
    only();
    return { seen, strikesWhileStunned };
  }, cid);
  const hostSaw = await host.evaluate(id => { const e = G.EnemyMgr.get(id); return !!e; }, cid);
  check(hostSaw && st.seen > 10 && st.strikesWhileStunned === 0, `the guest's copy shows the foe the guest stunned as stunned (${st.seen} frames) and it doesn't hit the guest meanwhile`);
  await gone(cid);
  for (const p of [host, guest]) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!process.env.NO_COOP) await coop(browser);
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
