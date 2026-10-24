#!/usr/bin/env node
// Late bosses keep up with your build (js/fork/lab/boss-power.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-boss-power.cjs [base-url] [--solo]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. The meter: 2000 damage a second on one enemy (4 hits of 500) reads as power ≈ 2000, maxHit 500.
//   2. With a huge meter (1 000 000 a second) at 45:00: a boss slot's boss gets power × 24 s of HP, a wild
//      legendary × 16 s, the rift's legendary × 30 s (whatever rift-scaling and a Mega made of it).
//   3. With the meter empty at 45:00: HP × 1.2^7.5 (×3.9) and damage × √(the horde's ×4.29) over a normal run's
//      same boss; a wild legendary also × (1 + t/600) HP and × (1 + t/1800) damage.
//   4. The hit cap: at 25:00 a boss loses at most 10 % of its max HP to one hit (a regular enemy any amount); at
//      18:00 no cap.
//   5. Before 15:00 and in a normal run at 45:00 nothing changes.
//   6. Co-op (host Lab): the wild legendary the host spawns has the same max HP on the guest's screen, and the
//      guest's one-shot takes only 10 % off it on the host.
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
  // An enemy that won't fall, near the player, to pump the meter with.
  window.__dummy = () => {
    const pl = G.Game.player, def = { dex: 143, name: 'Snorlax', hp: 1e12, spd: 0, dmg: 0, xp: 0, behavior: 'tank' };
    const e = new G.Enemy(def, pl.x + 200, pl.y, { hp: 1, spd: 1, dmg: 1 });
    e._noScale = true; e.stunT = 1e9;
    G.EnemyMgr.add(e);
    return e;
  };
  window.__pump = async (perHit, n = 4, secs = 6) => {
    G.LabPower.reset();
    const d = __dummy();
    for (let s = 0; s < secs; s++) { for (let i = 0; i < n; i++) { d.hurt(perHit); await __sleep(1000 / n); } }
    d.hp = 0; d.die();
    return { power: G.LabPower.power(), maxHit: G.LabPower.maxHit(), n: G.LabPower.samples.length };
  };
  window.__boss = () => {
    const pl = G.Game.player, t = G.Game.st.time, b = G.Enemies.BOSSES[4];
    const e = new G.Enemy(b, pl.x + 300, pl.y, G.Enemies.bossScale(t), true);
    G.EnemyMgr.add(e);
    return e;
  };
};

async function solo(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.LabPower, null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
    window.__run = async (lab, t) => {
      if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
      G.Settings.set('underdogLadder', false);
      G.Settings.set('lab', lab);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      await __wait(() => G.Game.state === 'playing');
      G.Game.debugTime(t);
      const pl = G.Game.player; pl.god = true;
      (function noLevels() { if (G.Game.player !== pl) return; pl.xp = 0; requestAnimationFrame(noLevels); })();
      window.__spawn = window.__spawn || G.Spawner.update; G.Spawner.update = () => {};
      G.EnemyMgr.clear();
    };
  });

  console.log('1. The meter');
  const m = await page.evaluate(async () => { await __run(true, 2700); return __pump(500); });
  check(m.n >= 5 && Math.abs(m.power - 2000) < 400 && m.maxHit === 500, 'four hits of 500 a second on one enemy: power ≈ 2000, biggest hit 500', m);

  console.log('2. Floors from the meter at 45:00');
  const f = await page.evaluate(async () => {
    await __run(true, 2700);
    const p = (await __pump(250000)).power, t = G.Game.st.time, P = G.LabPower;
    const b = __boss(), slot = { hp: b.maxHp, want: p * P.secs('slot', t) };
    const w = G.WildLegends.spawn(), wild = { hp: w.maxHp, want: p * P.secs('wild', t) };
    G.Rift.debugArena();
    await __wait(() => G.Rift.inArena && G.EnemyMgr.get(G.Rift.arena.bossId), 5000);
    const l = G.EnemyMgr.get(G.Rift.arena.bossId), rift = { hp: l.maxHp, want: p * P.secs('rift', t), mega: !!l.megaForm };
    return { p, secs: ['slot', 'wild', 'rift'].map(k => P.secs(k, t)), slot, wild, rift };
  });
  const near = (a, b) => Math.abs(a - b) <= b * 0.01 + 2;
  check(f.p > 9e5 && near(f.slot.hp, f.slot.want) && near(f.wild.hp, f.wild.want) && near(f.rift.hp, f.rift.want) && f.secs.map(Math.round).join() === '24,16,30',
    'a boss lasts power × 24 s, a wild legendary × 16 s, the rift\'s legendary × 30 s', f);

  console.log('3. The clock at 45:00 (meter empty)');
  const c = await page.evaluate(async () => {
    const t = 2700, B = G.Enemies.BOSSES[4], E = G.LabEndgame, P = G.LabPower;
    window.__bdef = B;
    await __run(false, t);
    const nb = new G.Enemy(B, 0, 0, G.Enemies.bossScale(t), true); G.EnemyMgr.add(nb);
    const ws = G.WildLegends.stats(t, 1);
    await __run(true, t); P.reset();
    const lb = new G.Enemy(__bdef, 0, 0, G.Enemies.bossScale(t), true); G.EnemyMgr.add(lb);
    const w = G.WildLegends.spawn();
    return { normal: { hp: nb.maxHp, dmg: nb.dmg }, lab: { hp: lb.maxHp, dmg: lb.dmg, cap: lb._hitCap }, hpK: P.hpK(t), dmgK: P.dmgK(t), endDmg: E.dmg(t),
      wild: { hp: w.maxHp, dmg: w.dmg, want: ws.hp * (1 + t / 600) * P.hpK(t), wantDmg: ws.dmg * (1 + t / 1800) * P.dmgK(t) } };
  });
  check(near(c.lab.hp, c.normal.hp * c.hpK) && near(c.lab.dmg, c.normal.dmg * c.dmgK) && Math.abs(c.hpK - 3.93) < 0.02 && Math.abs(c.dmgK - Math.sqrt(c.endDmg)) < 1e-9,
    'a boss: HP × 3.93 and damage × √4.29 over a normal run\'s', c);
  check(near(c.wild.hp, c.wild.want) && near(c.wild.dmg, c.wild.wantDmg), 'a wild legendary: × (1 + t/600) HP and × (1 + t/1800) damage on top', c.wild);

  console.log('4. The hit cap');
  const cap = await page.evaluate(async () => {
    const one = async t => {
      await __run(true, t); G.LabPower.reset();
      const b = __boss(); const before = b.hp; b.hurt(1e15);
      const e = __dummy(); e.hurt(5e11);
      return { lost: (before - b.hp) / b.maxHp, dead: b.dead, cap: b._hitCap || 0, reg: e.hp };
    };
    return { t25: await one(1500), t18: await one(1080) };
  });
  check(Math.abs(cap.t25.lost - 0.1) < 1e-6 && !cap.t25.dead && cap.t25.reg === 5e11, 'at 25:00 one hit takes 10 % of a boss\'s max HP (a regular enemy: all of it)', cap.t25);
  check(cap.t18.dead && !cap.t18.cap, 'at 18:00 no cap', cap.t18);

  console.log('5. Early and normal runs');
  const same = await page.evaluate(async () => {
    const one = async (lab, t) => { await __run(lab, t); const b = new G.Enemy(G.Enemies.BOSSES[2], 0, 0, G.Enemies.bossScale(t), true); G.EnemyMgr.add(b); return [b.maxHp, Math.round(b.dmg), !!b._power]; };
    return { lab10: await one(true, 600), normal10: await one(false, 600), normal45: await one(false, 2700), normal45b: await one(false, 2700) };
  });
  check(same.lab10[0] === same.normal10[0] && same.lab10[1] === same.normal10[1], 'at 10:00 a Lab boss has a normal run\'s numbers', same);
  check(!same.normal45[2], 'a normal run at 45:00: untouched', same);
  check(!errors.length, 'no page errors', errors);
  await page.close();
}

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LabPower, null, { timeout: 30000 });
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
  console.log('6. Co-op');
  if (!(await up('http://127.0.0.1:9099/'))) { console.log('  (skipped: no Firebase emulator)'); return; }
  const host = await player(browser, 'bph' + tag, 4), guest = await player(browser, 'bpg' + tag, 7);
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
  for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.god = true; G.Game.player.xpMul = 0; });
  const h = await host.evaluate(async () => {
    G.Game.debugTime(2700);
    for (const e of G.EnemyMgr.all()) e.hurt(1e15);
    await __sleep(300);
    const m = await __pump(50000);
    const g = G.Game.everyone().find(p => p !== G.Game.player);
    const w = G.WildLegends.spawn();
    w.x = g.x + 150; w.y = g.y; w.stunT = 1e9;
    return { id: w.id, max: w.maxHp, power: m.power, cap: w._hitCap };
  });
  const seen = await settle(guest, id => { const e = G.EnemyMgr.get(id); return e && e.remote; }, h.id, 8000);
  const g = await guest.evaluate(id => { const e = G.EnemyMgr.get(id); return e ? { max: e.maxHp, remote: !!e.remote } : null; }, h.id);
  check(seen && g && g.max === Math.ceil(h.max) && h.max > h.power * 15, 'the guest sees the host\'s wild legendary with its full max HP (power × 16 s)', { h, g });
  await guest.evaluate(id => G.EnemyMgr.get(id).hurt(1e15), h.id);
  const hit = await settle(host, id => { const e = G.EnemyMgr.get(id); return e && e.hp < e.maxHp; }, h.id, 6000);
  const after = await host.evaluate(id => { const e = G.EnemyMgr.get(id); return e && { lost: (e.maxHp - e.hp) / e.maxHp, dead: e.dead }; }, h.id);
  check(hit && after && !after.dead && Math.abs(after.lost - 0.1) < 0.002, 'the guest\'s one-shot takes 10 % of its HP on the host', after);
  check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!args.includes('--solo')) await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll boss power checks passed');
  process.exit(failures ? 1 : 0);
})();
