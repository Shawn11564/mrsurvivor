#!/usr/bin/env node
// Bewear's Hearts in co-op (js/fork/bewear.js): three real players in headless Edge, against the
// Firebase emulator (no real project is touched), as in fork/test-coop.cjs:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-bewear-coop.cjs [base-url]
//
// A host and two guests in one run, all firing Ember. Checks:
//   1. Guest A has Hearts on: the host and guest B (through the host) see A's shots as hearts.
//      The others' shots stay normal everywhere.
//   2. The host turns Hearts on mid-run: both guests see the host's hearts.
//   3. Guest A turns Hearts off: nobody sees A's hearts any more.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const tag = String(Date.now()).slice(-6);

async function player(browser, name, dex) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Bewear, null, { timeout: 30000 });
  const r = await page.evaluate(async ([name, dex]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    s.partner = dex; s.owned[dex] = { at: Date.now(), from: 'starter' };
    delete s.hearts;
    G.DB.commit();
    G.Settings.set('lab', false);
    G.Settings.set('hearts', false);
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
/** Hearts unlocked (as after Bewear's hug) and switched on or off; then a moment for the
 *  { k:'hearts' } message to reach everyone (a shot cast before it lands keeps the old look). */
const hearts = async (p, on) => {
  await p.evaluate(on => { G.DB.save.hearts = G.DB.save.hearts || Date.now(); G.Settings.set('hearts', on); }, on);
  await p.waitForTimeout(400);
};
/** What `obs` draws for `shooter`'s shots over ~2.5 s: the set of vis.proj seen. Shots already
 *  in the air when it starts don't count (they were fired before the switch). */
const looks = (obs, shooter) => obs.evaluate(async uid => {
  const mate = G.Coop.mate(uid), seen = new Set(), old = new Set(G.Projectiles.all()), t0 = performance.now();
  while (performance.now() - t0 < 2500) {
    await new Promise(r => setTimeout(r, 40));
    for (const p of G.Projectiles.all()) if (!old.has(p) && p.owner === mate.pl && p.ghost && p.vis) seen.add(p.vis.proj);
  }
  return [...seen].sort();
}, shooter.uid);
const ownLooks = p => p.evaluate(async () => {
  const pl = G.Game.player, seen = new Set(), old = new Set(G.Projectiles.all()), t0 = performance.now();
  while (performance.now() - t0 < 1500) {
    await new Promise(r => setTimeout(r, 40));
    for (const s of G.Projectiles.all()) if (!old.has(s) && s.owner === pl && !s.ghost && s.vis) seen.add(s.vis.proj);
  }
  return [...seen].sort();
});
const isHearts = l => l.length > 0 && l.every(x => x === 'heart');
const isNormal = l => l.length > 0 && !l.includes('heart');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const host = await player(browser, 'bwh' + tag, 4);
    const ga = await player(browser, 'bwa' + tag, 7);
    const gb = await player(browser, 'bwb' + tag, 1);
    const ALL = [host, ga, gb];
    await hearts(ga, true);
    await party(host, [ga, gb]);
    console.log('Party of 3 connected peer to peer');
    await settle(host, () => !document.getElementById('lobby-start').disabled, undefined, 30000);
    await host.click('#lobby-start');
    await Promise.all(ALL.map(p => p.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 20000 })));
    // Everyone fires Ember, can't fall, and has a tough enemy beside them (the host owns enemies).
    for (const p of ALL) await p.evaluate(() => {
      const pl = G.Game.player, m = G.Moves.instance('ember', 1);
      pl.slots = [[m]]; pl.moves = [m]; pl.active = 0;
      (function alive() { pl.invuln = 99; pl.hp = pl.maxHp; requestAnimationFrame(alive); })();
    });
    await host.evaluate(() => { G.Spawner.update = () => {}; });
    for (const p of ALL) {
      const at = await p.evaluate(() => [G.Game.player.x, G.Game.player.y]);
      await host.evaluate(at => {
        const def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, at[0] + 110, at[1], G.Enemies.scale(0));
        e.hp = e.maxHp = 1e8; e.spd = 0; G.EnemyMgr.add(e);
      }, at);
    }
    await host.waitForTimeout(1500);

    console.log('1. Guest A has Hearts on');
    const own = await ownLooks(ga);
    check(isHearts(own), "guest A's own shots are hearts", own);
    const onHost = await looks(host, ga), onB = await looks(gb, ga);
    check(isHearts(onHost), "the host sees guest A's shots as hearts", onHost);
    check(isHearts(onB), "guest B sees guest A's shots as hearts (passed on by the host)", onB);
    const bOnHost = await looks(host, gb), hOnA = await looks(ga, host);
    check(isNormal(bOnHost) && isNormal(hOnA), "the others' shots stay normal", { bOnHost, hOnA });

    console.log('2. The host turns Hearts on mid-run');
    await hearts(host, true);
    const hA = await looks(ga, host), hB = await looks(gb, host);
    check(isHearts(hA) && isHearts(hB), "both guests see the host's hearts", { hA, hB });

    console.log('3. Guest A turns Hearts off');
    await hearts(ga, false);
    const offHost = await looks(host, ga), offB = await looks(gb, ga);
    check(isNormal(offHost) && isNormal(offB), "nobody sees guest A's hearts any more", { offHost, offB });

    for (const p of ALL) check(p.errs.length === 0, `no page errors (${p.name})`, p.errs.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
