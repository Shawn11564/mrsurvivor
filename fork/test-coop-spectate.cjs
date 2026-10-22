#!/usr/bin/env node
// A downed co-op player watching a teammate when the rift opens (js/fork/spectate-cut.js), two
// real players connected peer to peer in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-coop-spectate.cjs [base-url]
//
// The arena is ~200 000 px from the map. Every computer moves everyone there (Rift.begin), but
// the teammate's last network position was still on the map, so netUpdate snapped them back and
// the spectator's camera glided all the way there and back again, painting every map chunk on
// the way (seconds of stutter). Now a teammate moved by a teleport waits for their own arrival,
// and a camera target more than ~1.5 screens away is cut to, not glided to. Checks, on the guest:
// Each way round (a downed guest watching the host, a downed host watching a guest):
//   1. Down and watching a teammate far away: the camera cuts to them, no frame half-way.
//   2. The host opens a rift: within 2 s the camera never travels between the map and the arena,
//      never goes back to the map, only a few screens of chunks get painted, and it ends on the
//      teammate in the arena.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 8000) => p.waitForFunction(pred, arg, { timeout: ms }).then(() => true, () => false);

async function player(browser, name, dex, owned, radiant) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.LobbyPick && G.Radiant, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex, owned, radiant]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex;
    for (const d of [dex, ...owned]) s.owned[d] = { at: Date.now(), from: 'test' };
    s.radiant = s.radiant || {};
    for (const d of radiant) s.radiant[d] = { at: Date.now(), from: 'test' };
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, [name, dex, owned, radiant]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  return page;
}

const near = (a, b, d) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;

async function scenario(browser, downRole) {
  const t = tag + downRole[0];
  const host = await player(browser, 'vh' + t, 4, [], []);
  const guest = await player(browser, 'vg' + t, 7, [], []);
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
  check(both.every(Boolean), 'the co-op run starts for both');
  await host.waitForTimeout(3500);                     // past the start countdown
  for (const p of [host, guest]) await p.evaluate(() => { G.Game.player.god = true; G.Game.player.xpMul = 0; });
  const down = downRole === 'host' ? host : guest, up = downRole === 'host' ? guest : host;

  console.log(`1. The ${downRole} goes down, watching the other far away`);
  await up.evaluate(() => { G.Game.player.x += 2400; });   // out of reviving range, ~3 screens away
  await down.waitForTimeout(800);
  await down.evaluate(() => {
    window.__cam = [];
    const f = G.Camera.follow;
    G.Camera.follow = function () { const r = f.apply(this, arguments); window.__cam.push([this.x, this.y]); return r; };
    const pl = G.Game.player; pl.god = false; pl.invuln = 0; pl.hurt(1e9, null, true);
  });
  const watching = await settle(down, () => G.Game.player.dead && !!G.Game.watching);
  await down.waitForTimeout(150);
  const w = await down.evaluate(() => {
    const t = G.Game.watching, c = window.__cam.filter(Boolean);
    return { d: Math.round(Math.hypot(G.Camera.x - t.x, G.Camera.y - t.y)) };
  });
  check(watching && w.d < 60, 'down: the camera is on the teammate at once (no glide across)', w);
  const glide = await down.evaluate(() => {
    // From the moment it switched: no frame half-way between you and them.
    const t = G.Game.watching, me = G.Game.player, c = window.__cam;
    return c.filter(p => Math.hypot(p[0] - t.x, p[1] - t.y) > 200 && Math.hypot(p[0] - me.x, p[1] - me.y) > 200).length;
  });
  check(glide === 0, 'no frame half-way across', glide);

  console.log(`2. The host opens a rift (the ${downRole} is watching)`);
  await down.evaluate(() => {
    window.__bakes = 0;
    const pc = G.Tiles.paintChunk;
    G.Tiles.paintChunk = function () { window.__bakes++; return pc.apply(this, arguments); };
    window.__old = [G.Camera.x, G.Camera.y]; window.__cam = [];
  });
  await host.evaluate(() => G.Rift.debugArena());
  check(await settle(down, () => G.Rift.inArena, null, 8000), `the ${downRole} is taken to the arena`);
  await down.waitForTimeout(2000);
  const r = await down.evaluate(() => {
    const a = [G.Rift.arena.x, G.Rift.arena.y], o = window.__old, far = 3000;
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const i0 = window.__cam.findIndex(p => d(p, a) < far);   // the first frame in the arena
    const after = i0 < 0 ? window.__cam : window.__cam.slice(i0);
    const t = G.Game.watching && G.Game.watching;
    return { frames: window.__cam.length, transit: window.__cam.filter(p => d(p, a) > far && d(p, o) > far).length,
      backOnMap: after.filter(p => d(p, o) < far).length, bakes: window.__bakes, still: !!t && G.Game.player.dead,
      onMate: t ? Math.round(d([G.Camera.x, G.Camera.y], [t.x, t.y])) : null, toArena: Math.round(d([G.Camera.x, G.Camera.y], a)) };
  });
  check(r.transit === 0, 'the camera never travels between the map and the arena', r);
  check(r.backOnMap === 0, 'once in the arena it never goes back to the map', r.backOnMap);
  check(r.bakes <= 40, 'only a few screens of map chunks get painted', r.bakes);
  check(r.toArena < 1500 && (r.onMate === null || r.onMate < 80), 'it ends on the teammate, in the arena', r);
  check(!host.errs.length && !guest.errs.length, 'no page errors', host.errs.concat(guest.errs));
  await Promise.all([host.context().close(), guest.context().close()]);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    console.log('A downed guest watching the host');
    await scenario(browser, 'guest');
    console.log('A downed host watching a guest');
    await scenario(browser, 'host');
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll co-op spectate checks passed');
  process.exit(failures ? 1 : 0);
})();
