#!/usr/bin/env node
// The Necrozma raid at 45:00 (js/fork/lab/necrozma.js, Lab first), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-necrozma.cjs [base-url] [--solo]
//   (co-op part: npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)
//
//   1. A Lab run with Eternatus beaten: nothing at 44:50; at 45:00 the raid, Necrozma and 4 prisms, you in the
//      arena, its HP at least the power meter × 45 s; rifts stopped from 43:00 (G.Judgment.AT is 45:00).
//      Without Eternatus beaten there's no Necrozma (Eternatus comes first).
//   2. Prism Armor: a hit does half; the light drains; breaking a prism brings it back to full, stuns and exposes
//      Necrozma (a hit then does ×1.25, at most 5 %); the prism re-forms.
//   3. The dark: at 0 light you lose 8 % of your max HP a second (death cause: darkness) and Necrozma heals.
//   4. Ultra Burst at half HP: the light drains faster.
//   5. Beating it: a ×25 rainbow ticket, 3 gems, two relic picks, back to the map, rifts open again (AT never).
//   6. Time running out: the run ends.
//   7. Co-op: the raid for both, the guest sees the prisms and the light, a prism the host breaks brings the light
//      back on the guest's screen too, both get the ticket and back on the map together.
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
  window.__R = () => G.Necrozma.raid;
  window.__boss = () => __R() && G.EnemyMgr.get(__R().bossId);
  window.__prisms = () => G.EnemyMgr.all().filter(e => e.necroPrism && !e.dead);
  window.__lost = k => { const e = __boss(); const h = e.hp; e.hurt(e.maxHp * k); return +((h - e.hp) / e.maxHp).toFixed(4); };
};

async function solo(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.Necrozma, null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
    window.__run = async (eter = true) => {
      if (G.Game.state !== 'ui') { G.UI.hideAll(); G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
      G.Settings.set('underdogLadder', false); G.Settings.set('lab', true);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      await __wait(() => G.Game.state === 'playing');
      const pl = G.Game.player; pl.god = true; pl.xpMul = 0;
      if (eter) pl._labEternatus = 1;
      G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.LabPower.reset();
      return pl;
    };
    // The team's damage meter: 4 hits of `per` a second on an enemy that won't fall.
    window.__pump = async per => {
      const pl = G.Game.player, d = new G.Enemy({ dex: 143, name: 'Snorlax', hp: 1e12, spd: 0, dmg: 0, xp: 0, behavior: 'tank' }, pl.x + 200, pl.y, { hp: 1, spd: 1, dmg: 1 });
      d._noScale = true; d.stunT = 1e9; G.EnemyMgr.add(d); G.LabPower.reset();
      for (let i = 0; i < 24; i++) { d.hurt(per); await __sleep(250); }
      d.hp = 0; d.die();
      return G.LabPower.power();
    };
  });

  console.log('1. At 45:00');
  const s1 = await page.evaluate(async () => {
    await __run(true);
    const power = await __pump(25000);
    G.Game.debugTime(2690); await __sleep(1200);
    const before = { on: G.Necrozma.active, at: G.Judgment.AT };
    G.Game.debugTime(2700);
    await __wait(() => G.Necrozma.active, 5000);
    await __sleep(1200);
    const r = __R(), b = __boss(), pl = G.Game.player;
    return { before, on: G.Necrozma.active, jActive: G.Judgment.active, boss: !!(b && b.dex === 800 && b.boss), prisms: __prisms().length,
      inside: !!r && Math.hypot(pl.x - r.x, pl.y - r.y) < 15 * G.Tiles.T * G.Sprites.PX, max: b && b.maxHp, power: Math.round(power), biome: G.World.biomeName() };
  });
  check(!s1.before.on && s1.before.at === 2700, 'Eternatus beaten: at 44:50 no raid yet, and the next one is at 45:00 (rifts stop 2 min before)', s1.before);
  check(s1.on && s1.jActive && s1.boss && s1.prisms === 4 && s1.inside && s1.biome === 'Ultra Space', 'at 45:00 the Necrozma raid: Necrozma, 4 prisms, you in the arena', s1);
  check(s1.power > 80000 && s1.max >= s1.power * 45 * 0.98, 'its HP is at least the power meter × 45 s', s1);
  const noEter = await page.evaluate(async () => { await __run(false); G.Game.debugTime(2700); await __sleep(1500); return { necro: G.Necrozma.active, eter: G.Eternatus.active }; });
  check(!noEter.necro && noEter.eter, 'without Eternatus beaten, no Necrozma (Eternatus comes first)', noEter);

  console.log('2. Prism Armor and the prisms');
  const s2 = await page.evaluate(async () => {
    await __run(true); G.Game.debugTime(2700);
    await __wait(() => __boss(), 5000);
    const b = __boss(); b.stunT = 1e9;
    const armored = __lost(0.04);
    const l0 = __R().light; await __sleep(1000); const l1 = __R().light;
    __R().light = 40;
    const p = __prisms()[0], slot = __R().slots.findIndex(s => s.id === p.id);
    p.hurt(1e15);
    await __wait(() => __R().ex > 0, 3000);
    const after = { light: Math.round(__R().light), ex: +__R().ex.toFixed(1), stun: b.stunT > 0, prisms: __prisms().length };
    const exposed = __lost(0.02), cap = __lost(1e9);
    __R().slots[slot].reT = 0.2;
    const back = await __wait(() => __prisms().length === 4, 3000);
    return { armored, drained: +(l0 - l1).toFixed(1), after, exposed, cap, back };
  });
  check(Math.abs(s2.armored - 0.02) < 0.0005, 'Prism Armor: a hit does half (4 % → 2 %)', s2.armored);
  check(s2.drained >= 3 && s2.drained <= 5.5, 'the light drains (about 4 % a second)', s2.drained);
  check(s2.after.light >= 99 && s2.after.ex > 6 && s2.after.stun && s2.after.prisms === 3, 'breaking a prism: the light back to full, Necrozma stunned and exposed', s2.after);
  check(Math.abs(s2.exposed - 0.025) < 0.0005 && Math.abs(s2.cap - 0.05) < 0.0005, 'exposed a hit does ×1.25 (2 % → 2.5 %), and one hit at most 5 %', s2);
  check(s2.back, 'the prism re-forms');

  console.log('3. The dark');
  const s3 = await page.evaluate(async () => {
    const pl = G.Game.player, b = __boss();
    pl.god = false; pl.hp = pl.maxHp; pl.invuln = 0; pl.deathLog = [];
    b.hp = b.maxHp * 0.7; b.stunT = 1e9; G.Hazards.clear();
    __R().light = 0; __R().ex = 0; __R().geyserT = 99; __R().laserT = 99;
    const h0 = b.hp;
    await __sleep(2150);
    const lost = +(1 - pl.hp / pl.maxHp).toFixed(3), l = pl.deathLog || [];
    pl.god = true; pl.hp = pl.maxHp;
    return { lost, how: l.length ? l[l.length - 1].how : null, healed: b.hp > h0 };
  });
  check(s3.lost >= 0.15 && s3.lost <= 0.25 && s3.how === 'dark' && s3.healed, 'at 0 light: 8 % of your max HP a second (death cause: darkness), and Necrozma heals', s3);

  console.log('4. Ultra Burst');
  const s4 = await page.evaluate(async () => {
    const b = __boss(); b.hp = b.maxHp * 0.49; __R().light = 100;
    await __wait(() => __R().stage === 2, 3000);
    const l0 = __R().light; await __sleep(1000);
    return { stage: __R().stage, drained: +(l0 - __R().light).toFixed(1) };
  });
  check(s4.stage === 2 && s4.drained >= 5 && s4.drained <= 7.5, 'below half HP, Ultra Burst: the light drains faster (about 6 % a second)', s4);

  console.log('5. Beating it');
  const s5 = await page.evaluate(async () => {
    const pl = G.Game.player, t25 = (G.DB.save.tickets && G.DB.save.tickets.t25) | 0, gems = G.DB.save.gems | 0;
    const b = __boss(); b.hp = 1; b.hurt(1e9);
    await __wait(() => __R() && __R().phase === 'won', 3000);
    const won = { phase: __R() && __R().phase, t25: ((G.DB.save.tickets && G.DB.save.tickets.t25) | 0) - t25, gems: (G.DB.save.gems | 0) - gems,
      picks: (pl._labRelicPick || []).length, done: !!pl._labNecrozma };
    await __wait(() => !G.Necrozma.active, 9000);
    await __sleep(500);
    return { won, back: !G.Necrozma.active && !G.Judgment.active && G.Game.state === 'playing', at: isFinite(G.Judgment.AT) ? G.Judgment.AT : 'never' };
  });
  check(s5.won.phase === 'won' && s5.won.t25 === 1 && s5.won.gems >= 3 && s5.won.picks === 2 && s5.won.done, 'beaten: a ×25 rainbow ticket, 3 gems and two relic picks', s5.won);
  check(s5.back && s5.at === 'never', 'then back to the map, the run goes on and rifts open again', s5);

  console.log('6. Time running out');
  const s6 = await page.evaluate(async () => {
    await __run(true); G.Game.debugTime(2700);
    await __wait(() => __boss(), 5000);
    G.Game.player.god = false; G.Necrozma.debugTimeLeft(0);
    const over = await __wait(() => G.Game.state === 'over', 8000);
    return { over, why: G.Game.player && G.Game.player.killedBy && G.Game.player.killedBy.how };
  });
  check(s6.over && s6.why === 'raid', 'time runs out: the run ends', s6);
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
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Necrozma, null, { timeout: 30000 });
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
  console.log('7. Co-op');
  if (!(await up('http://127.0.0.1:9099/'))) { console.log('  (skipped: no Firebase emulator)'); return; }
  const host = await player(browser, 'nzh' + tag, 4), guest = await player(browser, 'nzg' + tag, 7);
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
  // Eternatus beaten for both (what its win sets on every computer).
  // (and its 30-minute rainbow ticket already given, so only the raid's is counted)
  for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; const pl = G.Game.player; pl.god = true; pl.xpMul = 0; pl._labEternatus = 1; pl._rainbow30 = true; });
  await host.evaluate(() => G.Game.debugTime(2700));
  const on = await Promise.all([host, guest].map(p => settle(p, () => G.Necrozma.active, null, 8000)));
  const marked = await settle(guest, () => __R() && __boss() && __prisms().length === 4, null, 8000);
  check(on.every(Boolean) && marked, 'the raid starts for both; the guest sees Necrozma and its 4 prisms', { on, marked });
  await host.evaluate(() => { __R().light = 30; });
  const dim = await settle(guest, () => __R().light < 35, null, 3000);
  await host.evaluate(() => __prisms()[0].hurt(1e15));
  const lit = await settle(guest, () => __R().light > 95 && __R().ex > 0, null, 4000);
  check(dim && lit, 'the light is shared: a prism the host breaks brings it back on the guest\'s screen', { dim, lit });
  const t0 = await Promise.all([host, guest].map(p => p.evaluate(() => (G.DB.save.tickets && G.DB.save.tickets.t25) | 0)));
  await host.evaluate(() => { const b = __boss(); b.hp = 1; b.hurt(1e9); });
  const won = await Promise.all([host, guest].map(p => settle(p, () => __R() && __R().phase === 'won', null, 5000)));
  const back = await Promise.all([host, guest].map(p => settle(p, () => !G.Necrozma.active, null, 10000)));
  const t1 = await Promise.all([host, guest].map(p => p.evaluate(() => (G.DB.save.tickets && G.DB.save.tickets.t25) | 0)));
  const pos = await Promise.all([host, guest].map(p => p.evaluate(() => [G.Game.player.x, G.Game.player.y])));
  check(won.every(Boolean) && t1[0] === t0[0] + 1 && t1[1] === t0[1] + 1, 'Necrozma beaten: a ×25 rainbow ticket each', { won, t0, t1 });
  check(back.every(Boolean) && Math.hypot(pos[0][0] - pos[1][0], pos[0][1] - pos[1][1]) < 300, 'both back on the map together', { back, pos });
  check(!host.errs.length && !guest.errs.length, 'no page errors in co-op', host.errs.concat(guest.errs));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!args.includes('--solo')) await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Necrozma raid checks passed');
  process.exit(failures ? 1 : 0);
})();
