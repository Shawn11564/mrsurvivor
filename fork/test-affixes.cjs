#!/usr/bin/env node
// Elite affixes in Lab runs (js/fork/lab/affixes.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database   (co-op part)
//   node fork/test-affixes.cjs [base-url] [--solo]
//
// Solo:
//   1. With the real spawner at its cap, about a third of the elites get an affix, only when 55+ enemies
//      are alive (the spawner's elite rule), and a normal run gets none.
//   2. Each effect on a real enemy: Shielded (a 60 % shield that takes the hits), Swift (×1.4 speed),
//      Vampiric (a touch that lands heals it 10 %), Splitting (two copies at 30 % HP when it falls),
//      Explosive (a blast where it fell, after 0.8 s, that hits you); the name is drawn over it.
// Co-op (host Lab, the Firebase emulator):
//   3. The guest sees the affixes the host rolled; a Splitting one the guest knocks out splits once
//      (two copies on the host, the same two on the guest); an Explosive one blows up once (one hazard on
//      each screen); a Vampiric one touching the guest heals on the host.
const { chromium, pastStart } = require('./pw.cjs');
const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || require('./pw.cjs').BASE;
const SOLO = args.includes('--solo');
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

const HELPERS = () => {
  window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__regular = e => !e.dead && !e.boss && !e.legend && !e.wildLegend && !e.affix && !e._split && e.behavior !== 'thief';
};

async function solo(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit();
    window.__run = async (lab, t) => {
      if (G.Game.state === 'playing') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
      G.Settings.set('lab', lab);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
      G.Game.debugTime(t);
      await __wait(() => G.Game.state === 'playing');
      const pl = G.Game.player; pl.god = true; pl.xpMul = 0;      // no level-up cards freezing the world
    };
    // What the spawner adds: the count before, and the affix it came out with.
    window.__adds = [];
    const add = G.EnemyMgr.add;
    G.EnemyMgr.add = function (e) { const n = G.EnemyMgr.count, r = add.apply(this, arguments); if (__regular(Object.assign({}, e, { affix: null }))) __adds.push({ n, affix: e.affix || null }); return r; };
  });

  console.log('1. Rolled on elites');
  const roll = await page.evaluate(async () => {
    await __run(true, 960);                // past 15:00's boss, before 18:00's: the spawner at full rate
    __adds.length = 0;
    await __sleep(12000);
    const at = __adds.slice(), A = G.LabAffixes, elite = at.filter(a => a.n >= A.FROM), got = at.filter(a => a.affix);
    return { adds: at.length, elites: elite.length, affixed: got.length, share: +(got.length / Math.max(1, elite.length)).toFixed(2),
      belowCap: got.filter(a => a.n < A.FROM).length, kinds: [...new Set(got.map(a => a.affix))], known: got.every(a => A.KEYS.includes(a.affix)) };
  });
  check(roll.elites >= 10 && roll.affixed > 0 && roll.belowCap === 0 && roll.known, 'affixes only on elites (55+ enemies alive)', roll);
  check(roll.share >= 0.15 && roll.share <= 0.55, 'about a third of the elites get one', roll);
  const normal = await page.evaluate(async () => {
    await __run(false, 960);
    const alive = G.EnemyMgr.bossAlive;
    G.EnemyMgr.bossAlive = () => false;     // a normal run started late gets every past boss at once: keep the spawner at full rate
    __adds.length = 0;
    await __sleep(12000);
    G.EnemyMgr.bossAlive = alive;
    return { adds: __adds.length, elites: __adds.filter(a => a.n >= G.LabAffixes.FROM).length, affixed: __adds.filter(a => a.affix).length };
  });
  check(normal.elites >= 10 && normal.affixed === 0, 'a normal run: no affixes', normal);

  console.log('2. Effects');
  const fx = await page.evaluate(async () => {
    await __run(true, 300);
    const pl = G.Game.player, A = G.LabAffixes;
    await __wait(() => G.EnemyMgr.all().filter(__regular).length >= 6, 15000);
    G.Spawner.update = () => {};
    const pick = () => G.EnemyMgr.all().filter(__regular)[0];
    const out = {};
    // Shielded
    let e = pick(); A.tag(e, 'shielded');
    const sh = e.shield, hp0 = e.hp; e.hurt(10);
    out.shielded = { want: Math.round(e.maxHp * 0.6), shield: sh, hpKept: e.hp === hp0, after: sh - e.shield };
    // Swift
    e = pick(); const s0 = e.spd; A.tag(e, 'swift'); out.swift = +(e.spd / s0).toFixed(3);
    // Vampiric: on the player, half its HP; a shield (not an affix) takes your moves' hits, so only the touch moves its HP.
    e = pick(); A.tag(e, 'vampiric');
    pl.god = false; pl.maxHp = pl.hp = 1e7; pl.invuln = 0;
    e.shield = 1e12; e.shieldT = 1e9; e.hp = Math.round(e.maxHp / 2); e.stunT = 0;
    const half = e.hp, texts = [], dt = G.FX.dmgText;
    G.FX.dmgText = function (x, y, v, color) { if (color === A.DEF.vampiric.color) texts.push(v); return dt.apply(this, arguments); };
    for (let i = 0; i < 80 && !texts.length; i++) { e.x = pl.x + 4; e.y = pl.y; e.touchCd = 0; pl.invuln = 0; await __sleep(25); }
    G.FX.dmgText = dt;
    out.vampiric = { gained: e.hp - half, want: Math.round(e.maxHp * 0.1), texts };
    pl.god = true;
    // Splitting
    e = pick(); A.tag(e, 'splitting');
    e.hurt(1e12);
    await __sleep(100);
    const kids = G.EnemyMgr.all().filter(c => c._split === e.id);
    out.splitting = { n: kids.length, hp: kids.map(c => c.maxHp), want: Math.round(e.maxHp * 0.3), dex: kids.every(c => c.dex === e.dex), noAffix: kids.every(c => !c.affix) };
    // Explosive, where you stand
    e = pick(); A.tag(e, 'explosive');
    e.x = pl.x + 10; e.y = pl.y;
    const P = G.Player.prototype, hurt = P.hurt, hits = [];
    P.hurt = function (amount) { if (this === pl) hits.push(Math.round(amount)); return hurt.apply(this, arguments); };
    pl.god = false; pl.invuln = 0;
    G.EnemyMgr.all().forEach(o => { if (o !== e) { o.x = pl.x + 2000; o.y = pl.y; } });
    e.hurt(1e12);
    const hz = G.Hazards.all.filter(h => h.affixOf === e.id);
    const dmg = Math.round(e.dmg);
    for (let i = 0; i < 60 && !(hz[0] && hz[0].hit); i++) { pl.invuln = 0; await __sleep(25); }
    P.hurt = hurt; pl.god = true;
    out.explosive = { hazards: hz.length, boom: hz[0] && hz[0].boom, r: hz[0] && hz[0].r, delay: hz[0] && hz[0].delay, hit: hz[0] && hz[0].hit, dmg, hits };
    // The name over it, drawn this frame.
    e = pick(); A.tag(e, 'swift'); e.x = pl.x + 60; e.y = pl.y; e.shield = 1e12; e.shieldT = 1e9;   // on screen, alive
    const raw = G.I18n.rawCanvas, said = [];
    G.I18n.rawCanvas = function (ctx, m, text) { said.push(text); return raw.apply(this, arguments); };
    await __sleep(200);
    G.I18n.rawCanvas = raw;
    out.label = said.includes('Swift');
    return out;
  });
  check(fx.shielded.shield === fx.shielded.want && fx.shielded.hpKept && fx.shielded.after === 10, 'Shielded: a 60 % shield that takes the hits', fx.shielded);
  check(fx.swift === 1.4, 'Swift: ×1.4 speed', fx.swift);
  check(fx.vampiric.texts[0] === '+' + fx.vampiric.want && fx.vampiric.gained >= fx.vampiric.want, 'Vampiric: a touch that lands heals it 10 % of its HP', fx.vampiric);
  check(fx.splitting.n === 2 && fx.splitting.hp.every(h => h === fx.splitting.want) && fx.splitting.dex && fx.splitting.noAffix, 'Splitting: two copies at 30 % HP when it falls', fx.splitting);
  check(fx.explosive.hazards === 1 && fx.explosive.boom && fx.explosive.r === 70 && fx.explosive.delay === 0.8 && fx.explosive.hit && fx.explosive.hits.includes(fx.explosive.dmg),
    'Explosive: one blast where it fell, 0.8 s later, that hits you for its contact damage', fx.explosive);
  check(fx.label, 'the affix\'s name is drawn over the enemy');
  check(!errors.length, 'no page errors', errors);
  await page.context().close();
}

// ---------------- co-op ----------------
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
  await page.evaluate(HELPERS);
  page.name = name;
  return page;
}

async function coop(browser) {
  const host = await player(browser, 'afxh' + tag, 4), guest = await player(browser, 'afxg' + tag, 7);
  await host.evaluate(() => { G.Settings.set('underdogLadder', false); G.Settings.set('lab', true); });
  await guest.evaluate(() => { G.Settings.set('underdogLadder', false); });
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
  if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
  await host.waitForFunction(() => !document.getElementById('lobby-start').disabled, null, { timeout: 30000 });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
  console.log('3. Co-op (host Lab)');
  for (const p of [host, guest]) await p.evaluate(() => { const pl = G.Game.player; pl.god = true; pl.xpMul = 0; });

  // The host: three regular enemies get Splitting, Explosive and Vampiric, and the spawner stops.
  const ids = await host.evaluate(async () => {
    await __wait(() => G.EnemyMgr.all().filter(__regular).length >= 5, 20000);
    G.Spawner.update = () => {};
    const [a, b, c] = G.EnemyMgr.all().filter(__regular);
    G.LabAffixes.tag(a, 'splitting'); G.LabAffixes.tag(b, 'explosive'); G.LabAffixes.tag(c, 'vampiric');
    c.shield = 1e12; c.shieldT = 1e9;        // (not an affix: keeps it alive for part 3's touch)
    // What happens from now on: copies split off (kept alive by a shield, so the guest's copies can be counted) and blasts.
    window.__kids = []; window.__blasts = [];
    const add = G.EnemyMgr.add;
    G.EnemyMgr.add = function (e) { const r = add.apply(this, arguments); if (e._split) { __kids.push([e._split, e.id]); e.shield = 1e12; e.shieldT = 1e9; } return r; };
    const hz = G.Hazards.add;
    G.Hazards.add = function (h) { if (h && h.affixOf) __blasts.push(h.affixOf); return hz.apply(this, arguments); };
    return { split: a.id, boom: b.id, vamp: c.id, lab: G.Lab.active };
  });
  const seen = await guest.evaluate(async ids => {
    await __wait(() => [ids.split, ids.boom, ids.vamp].every(id => G.EnemyMgr.get(id) && G.EnemyMgr.get(id).affix), 8000);
    return [ids.split, ids.boom, ids.vamp].map(id => G.EnemyMgr.get(id) && G.EnemyMgr.get(id).affix);
  }, ids);
  check(ids.lab && seen.join() === 'splitting,explosive,vampiric', 'the guest sees the affixes the host rolled', seen);

  // The guest knocks out the Splitting one and the Explosive one (its hits go to the host, which decides).
  // (The guest counts the blasts that reach it: every boom hazard added from then on.)
  await guest.evaluate(async ids => {
    window.__booms = [];
    const add = G.Hazards.add;
    G.Hazards.add = function (h) { if (h && h.boom) __booms.push([Math.round(h.x), Math.round(h.y)]); return add.apply(this, arguments); };
    for (const id of [ids.split, ids.boom]) { const e = G.EnemyMgr.get(id); if (e) e.hurt(1e12); }
  }, ids);
  const onHost = await host.evaluate(async ids => {
    await __wait(() => __kids.length >= 2 && __blasts.length >= 1, 8000);
    await __sleep(1500);
    return { kids: __kids.filter(k => k[0] === ids.split).map(k => k[1]), allKids: __kids.length, blasts: __blasts.filter(b => b === ids.boom).length, allBlasts: __blasts.length };
  }, ids);
  const onGuest = await guest.evaluate(async kids => {
    await __wait(() => kids.every(id => G.EnemyMgr.get(id)), 6000);
    return { kids: kids.filter(id => G.EnemyMgr.get(id)).length, booms: __booms };
  }, onHost.kids);
  check(onHost.kids.length === 2 && onHost.allKids === 2 && onGuest.kids === 2, 'Splitting: it split once, two copies on the host and the same two on the guest', { onHost, onGuest });
  check(onHost.blasts === 1 && onHost.allBlasts === 1 && onGuest.booms.length === 1, 'Explosive: it blew up once, one blast on the host and one on the guest', { onHost, booms: onGuest.booms });

  // The Vampiric one on the guest's Pokémon: the guest's touch heals it on the host.
  const vamp = await host.evaluate(async id => {
    const e = G.EnemyMgr.get(id), g = G.Game.everyone().find(p => p !== G.Game.player);
    e.shield = 1e12; e.shieldT = 1e9; e.hp = Math.round(e.maxHp / 2);
    const half = e.hp, dt = G.FX.dmgText;
    window.__drains = [];
    G.FX.dmgText = function (x, y, v, color) { if (color === G.LabAffixes.DEF.vampiric.color) __drains.push(v); return dt.apply(this, arguments); };
    window.__vamp = setInterval(() => { e.x = g.x + 4; e.y = g.y; e.stunT = 0; }, 20);
    return { half, want: Math.round(e.maxHp * 0.1) };
  }, ids.vamp);
  await guest.evaluate(async () => { const pl = G.Game.player; pl.god = false; pl.maxHp = pl.hp = 1e7; for (let i = 0; i < 100; i++) { pl.invuln = 0; await __sleep(30); } pl.god = true; });
  const healed = await host.evaluate(id => { clearInterval(window.__vamp); const e = G.EnemyMgr.get(id); return { hp: e && e.hp, drains: __drains }; }, ids.vamp);
  check(healed.drains.length > 0 && healed.drains.every((v, i, a) => v === '+' + vamp.want || (i === a.length - 1 && +v.slice(1) <= vamp.want)) && healed.hp >= vamp.half + vamp.want,
    'Vampiric: touching the guest heals it on the host (10 % a touch, the last one up to full)', { half: vamp.half, now: healed.hp, per: vamp.want, drains: healed.drains });

  for (const p of [host, guest]) check(p.errs.length === 0, `no page errors (${p.name})` + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    if (!SOLO) await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll affix checks passed');
  process.exit(failures ? 1 : 0);
})();
