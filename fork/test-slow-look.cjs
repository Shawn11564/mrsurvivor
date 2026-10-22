#!/usr/bin/env node
// Slowing you can see, and the "Your type" chip (js/fork/slow-look.js, js/fork/move-text.js part 3,
// the `dur` of G.Coop.status in js/net/coop.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-slow-look.cjs [base-url]
//   (co-op part, optional: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. Mist Ball, in a run: a hit slows 40 % for 2 s (it was 30 % for 1.2 s, and nothing showed);
//      Ice Beam's slow keeps its 1.2 s.
//   2. A slowed enemy has an ice-blue ring at its feet; a clean one doesn't.
//   3. Level-up cards with Tatsugiri (Dragon/Water, a special attacker: physical at 71 %): Dragon
//      Claw (physical Dragon) and Water Gun get "Your type"; the physical one's note says it's
//      the category ("Physical move: Tatsugiri does -29% damage with these"), not "Weaker for".
//   4. Co-op (if the emulator is up): a guest's Mist Ball slows the host's enemy for 2 s, and the
//      guest sees the ring on an enemy the host slowed (status bit 8).
const { chromium, pastStart } = require('./pw.cjs');
const http = require('http');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);
const up = url => new Promise(r => http.get(url, res => { res.resume(); r(true); }).on('error', () => r(false)));

// In the page: a fixed enemy in front, one move in the slot, the player kept alive; and a spy on
// what's stroked in ice blue.
function helpers() {
  const pl = () => G.Game.player, frame = () => new Promise(r => requestAnimationFrame(() => r()));
  window.__ice = 0;
  const stroke = CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.stroke = function () { if (this.strokeStyle === '#9fe4ff') window.__ice++; return stroke.apply(this, arguments); };
  function enemy(dx) {
    const p = pl(), def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, p.x + dx, p.y, G.Enemies.scale(0));
    e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e); return e;
  }
  function only(id) { const m = G.Moves.instance(id, 1), p = pl(); p.slots = [[m]]; p.moves = [m]; p.active = 0; return m; }
  async function until(pred, n = 400) { for (let i = 0; i < n && !pred(); i++) await frame(); return !!pred(); }
  window.TS = { pl, frame, enemy, only, until };
}

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save; s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'test' }; G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  await page.evaluate(helpers);
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[978] = { at: Date.now(), from: 'starter' }; s.partner = 978; s.starter = 978; G.DB.commit();
      G.Flow.goMenu(); G.Game.startRun(null, { dex: 978, shiny: false });
    });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(helpers);
    await page.evaluate(() => {
      G.Spawner.update = () => {};
      (function alive() { const p = G.Game.player; if (p) { p.invuln = 99; p.hp = p.maxHp; p.xpMul = 0; } requestAnimationFrame(alive); })();
    });
    await page.waitForTimeout(3300);                     // past the start countdown

    console.log('1. Mist Ball slows 40 % for 2 s');
    const mb = await page.evaluate(async () => {
      const { enemy, only, until } = TS;
      G.EnemyMgr.clear(); G.Combat.clearFields(); G.Projectiles.clear();
      const e = enemy(110); only('mist-ball');
      await until(() => e.slow > 0);
      const a = { slow: e.slow, slowT: +e.slowT.toFixed(2) };
      TS.pl().slots = []; TS.pl().moves = [];
      G.EnemyMgr.clear(); G.Projectiles.clear();
      const f = enemy(90); only('ice-beam');
      await until(() => f.slow > 0);
      const b = { slow: f.slow, slowT: +f.slowT.toFixed(2) };
      TS.pl().slots = []; TS.pl().moves = [];
      return { mist: a, ice: b, def: [G.Moves.BY_ID['mist-ball'].slow, G.Moves.BY_ID['mist-ball'].slowDur] };
    });
    check(mb.def.join() === '0.4,2' && Math.abs(mb.mist.slow - 0.4) < 1e-9 && mb.mist.slowT > 1.8, 'Mist Ball: 40 % slow for 2 s on the enemy it hits', mb);
    check(mb.ice.slowT <= 1.21 && mb.ice.slowT > 0.9, 'Ice Beam keeps its 1.2 s', mb.ice);

    console.log('2. The ring at a slowed enemy\'s feet');
    const ring = await page.evaluate(async () => {
      const { enemy, frame } = TS;
      G.EnemyMgr.clear(); G.Projectiles.clear();
      const e = enemy(80);
      for (let i = 0; i < 10; i++) await frame();
      window.__ice = 0; for (let i = 0; i < 10; i++) await frame();
      const clean = window.__ice;
      e.applySlow(0.4, 3);
      window.__ice = 0; for (let i = 0; i < 10; i++) await frame();
      return { clean, slowed: window.__ice };
    });
    check(ring.clean === 0 && ring.slowed >= 5, 'a slowed enemy shows an ice-blue ring, a clean one doesn\'t', ring);

    console.log('3. "Your type" on the level-up cards (Tatsugiri)');
    const cards = await page.evaluate(() => {
      const pl = G.Game.player, pool = G.Moves.poolFor;
      const out = {};
      for (const id of ['dragon-claw', 'water-gun']) {
        G.Moves.poolFor = () => [id];
        let c = null;                                   // offer picks 3 of all the candidates
        for (let i = 0; i < 200 && !c; i++) c = G.LevelUp.offer(pl).find(x => x.key === 'new:' + id);
        out[id] = c && { own: !!c.own, note: (c.desc.match(/<span class="fit-low">([^<]*)<\/span>/) || [])[1] || '' };
      }
      G.Moves.poolFor = pool;
      out.en = G.T(out['dragon-claw'] ? out['dragon-claw'].note : '');
      out.tip = G.MoveText.tipNotes(G.Moves.instance('dragon-claw', 1), pl).map(r => G.T(r[0]));
      return out;
    });
    check(cards['dragon-claw'] && cards['dragon-claw'].own && cards['water-gun'] && cards['water-gun'].own,
      'Dragon Claw (physical) and Water Gun both get "Your type" for a Dragon/Water Pokémon', cards);
    check(/^Physical move: Tatsugiri does -29% damage with these/.test(cards.en) && !/Weaker for/.test(cards.en), 'the note says it\'s the category, in English', cards.en);
    check(cards.tip.some(s => /^Physical move: Tatsugiri does -29% damage/.test(s)), 'the move tooltip says the same', cards.tip);
    check(!errors.length, 'no page errors', errors);
    await page.close();

    console.log('4. Co-op');
    if (!(await up('http://127.0.0.1:9099/'))) console.log('  (skipped: no Firebase emulator)');
    else {
      const host = await player(browser, 'lh' + tag, 4), guest = await player(browser, 'lg' + tag, 7);
      const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
      const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
      if (!j.ok) throw new Error('join: ' + JSON.stringify(j));
      for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
      await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
        G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
      await guest.click('#lobby-ready');
      await settle(guest, () => G.Social.room.members.find(m => m.uid === G.Social.uid).ready);
      await host.click('#lobby-ready');
      const both = await Promise.all([host, guest].map(p => settle(p, () => G.Game.state === 'playing' && G.Coop.active, null, 20000)));
      check(both.every(Boolean), 'the co-op run starts');
      await host.waitForTimeout(3500);
      for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; (function alive() { const q = G.Game.player; if (q) { q.invuln = 99; q.hp = q.maxHp; q.xpMul = 0; } requestAnimationFrame(alive); })(); });
      await host.evaluate(() => { G.EnemyMgr.clear(); G.Game.player.x += 1500; });   // the host's own moves stay out of it
      await host.waitForTimeout(600);
      const gu = await guest.evaluate(() => G.Social.uid);
      const eid = await host.evaluate(u => {
        const p = G.Coop.mate(u).pl, def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, p.x + 100, p.y, G.Enemies.scale(0));
        e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e); return e.id;
      }, gu);
      await settle(guest, id => !!G.EnemyMgr.get(id), eid);
      await guest.evaluate(() => TS.only('mist-ball'));
      const slowed = await settle(host, id => { const e = G.EnemyMgr.get(id); return e && e.slow > 0; }, eid, 10000);
      const hs = await host.evaluate(id => { const e = G.EnemyMgr.get(id); return e && { slow: e.slow, slowT: +e.slowT.toFixed(2) }; }, eid);
      check(slowed && Math.abs(hs.slow - 0.4) < 1e-9 && hs.slowT > 1.6, 'a guest\'s Mist Ball slows the host\'s enemy 40 % for 2 s', hs);
      await guest.evaluate(() => { TS.pl().slots = []; TS.pl().moves = []; });
      await host.evaluate(id => G.EnemyMgr.get(id).applySlow(0.5, 4), eid);
      const seen = await settle(guest, id => { const e = G.EnemyMgr.get(id); return e && e.net && e.net.st & 8; }, eid);
      const gring = await guest.evaluate(async () => { window.__ice = 0; for (let i = 0; i < 10; i++) await TS.frame(); return window.__ice; });
      check(seen && gring >= 5, 'the guest sees the ring on an enemy the host slowed', { seen, gring });
      check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
    }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll slow / type chip checks passed');
  process.exit(failures ? 1 : 0);
})();
