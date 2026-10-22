#!/usr/bin/env node
// Your HP bar above your Pokémon instead of the top left (js/fork/hp-above.js), in headless Edge
// on dev.html, reading the real canvas:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-hp-above.cjs [base-url]
//   (with the Firebase emulator running, also a host and a guest: see fork/test-coop.cjs)
//
//   1. Solo: nothing of your HP in the top left (no bar, no "88 / 88"); your name and level stay.
//   2. A green bar just above your Pokémon, full at full HP; hurt to a third, only a third of it is green.
//      It follows you, and it's gone while you're down.
//   3. Co-op: the top left still lists your teammate with their HP; your own bar is above you.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

// What the HUD writes in the top-left corner during one frame, and the bar's pixels over your Pokémon.
const probe = page => page.evaluate(() => new Promise(res => {
  const P = CanvasRenderingContext2D.prototype, ft = P.fillText, texts = [];
  const top = (ctx, x, y) => x < 330 && y < 120 && ctx.getTransform().a === (G.Camera.dpr || 1);
  P.fillText = function (s, x, y) { if (top(this, x, y)) texts.push(String(s)); return ft.apply(this, arguments); };
  // (Names go through G.I18n.rawCanvas, which calls the untranslated fillText directly.)
  const raw = G.I18n.rawCanvas;
  G.I18n.rawCanvas = function (ctx, k, s, x, y) { if (k === 'fillText' && top(ctx, x, y)) texts.push(String(s)); return raw.apply(this, arguments); };
  requestAnimationFrame(() => requestAnimationFrame(() => { try {
    P.fillText = ft; G.I18n.rawCanvas = raw;
    const pl = G.Game.player, cam = G.Camera, cv = document.getElementById('game'), cx = cv.getContext('2d');
    const k = cam.scale * cam.dpr, b = G.HpAbove.box(pl);
    const px = (wx, wy) => { const d = cx.getImageData(Math.round((wx - cam.left()) * k), Math.round((wy - cam.top()) * k), 1, 1).data; return [d[0], d[1], d[2]]; };
    const green = c => Math.abs(c[0] - 0x5f) + Math.abs(c[1] - 0xe0) + Math.abs(c[2] - 0x8a) < 45;   // the bar's #5fe08a (not the grass)
    // Along the bar's middle row, in 20 steps: which are green.
    const row = b ? Array.from({ length: 20 }, (_, i) => green(px(b.x + b.w * (i + 0.5) / 20, b.y + b.h / 2))) : [];
    res({ texts, box: b, greens: row.filter(Boolean).length, row: row.map(g => g ? 'G' : '.').join(''),
      body: [pl.x, pl.y - pl.bodyH], hp: [pl.hp, pl.maxHp] });
  } catch (e) { P.fillText = ft; G.I18n.rawCanvas = raw; res({ error: String(e), texts, row: '', greens: -1 }); } }));
}));

async function solo(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 720 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#btn-guest');
  await page.$eval('#btn-guest', e => e.click());
  await page.waitForFunction(() => G.DB.save && G.MenuUI, null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; G.DB.commit();
    G.Settings.set('underdogLadder', false); G.Settings.set('lab', false); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false });
  });
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
  await page.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); const p = G.Game.player; p.regenFlat = 0; p.hurt = () => {}; });
  await page.waitForTimeout(600);

  console.log('1. The top left');
  const full = await probe(page);
  const hpText = full.texts.find(t => /^\d+ \/ \d+$/.test(t));
  check(!hpText, 'no "HP / max" in the top left', full.texts);
  check(full.texts.includes('Charmander') && full.texts.some(t => /^(Lv|Nv)\. \d+$/.test(t)), 'your name and level stay', full.texts);

  console.log('2. Above your Pokémon');
  const b = full.box;
  check(!!b && b.y + b.h <= full.body[1] && b.y + b.h >= full.body[1] - 14 && Math.abs(b.x + b.w / 2 - full.body[0]) < 1, 'the bar sits just above its head, centred', { box: b, head: full.body });
  check(full.greens === 20, 'full HP: all of it green', full.row);
  await page.evaluate(() => { const p = G.Game.player; p.hp = p.maxHp / 3; });
  const third = await probe(page);
  check(third.greens >= 5 && third.greens <= 8, 'at a third of its HP: a third green', third.row);
  await page.evaluate(() => { G.Game.player.x += 200; });
  await page.waitForTimeout(500);
  const moved = await probe(page);
  check(moved.box && Math.abs(moved.box.x + moved.box.w / 2 - moved.body[0]) < 1 && moved.greens >= 5, 'it follows you', { box: moved.box, at: moved.body });
  await page.evaluate(() => { const p = G.Game.player; p.dead = true; });
  const down = await probe(page);
  check(down.greens === 0, 'down: no bar', down.row);
  await page.evaluate(() => { G.Game.player.dead = false; G.Game.quit(); });
  check(!errors.length, 'no page errors', errors);
  await page.context().close();
}

async function coopPlayer(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 } });
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
    const s = G.DB.save; s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' }; G.DB.commit();
    G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false };
  }, [name, dex]);
  if (!r.ok) throw new Error(`${name}: could not set up: ${JSON.stringify(r)}`);
  page.name = name;
  return page;
}

async function coop(browser) {
  const up = await fetch('http://127.0.0.1:9099/').then(r => r.ok, () => false);
  if (!up) { console.log('3. Co-op: skipped (no Firebase emulator on 127.0.0.1:9099)'); return; }
  console.log('3. Co-op');
  const host = await coopPlayer(browser, 'hph' + tag, 4), guest = await coopPlayer(browser, 'hpg' + tag, 7);
  const id = await host.evaluate(async () => (await G.Social.createRoom()).id);
  const j = await guest.evaluate(id => G.Social.joinRoom(id), id);
  if (!j.ok) throw new Error('join failed: ' + JSON.stringify(j));
  for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
  await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
    G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
  await host.waitForFunction(() => !document.getElementById('lobby-start').disabled, null, { timeout: 30000 });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
  for (const p of [host, guest]) await p.evaluate(() => { const pl = G.Game.player; pl.regenFlat = 0; (function alive() { pl.invuln = 99; requestAnimationFrame(alive); })(); });
  await host.evaluate(() => { G.Spawner.update = () => {}; });
  await host.waitForTimeout(1500);
  for (const [p, mate] of [[host, guest.name], [guest, host.name]]) {
    const r = await probe(p);
    check(r.texts.includes(mate), `${p === host ? 'host' : 'guest'}: the top left still lists the teammate (${mate})`, r.texts);
    check(!r.texts.some(t => /^\d+ \/ \d+$/.test(t)) && r.greens === 20, `${p === host ? 'host' : 'guest'}: its own HP is the bar above it`, { texts: r.texts, row: r.row });
  }
  for (const p of [host, guest]) check(p.errs.length === 0, `no page errors (${p.name})`, p.errs.slice(0, 3));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await solo(browser);
    await coop(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll HP bar checks passed');
  process.exit(failures ? 1 : 0);
})();
