#!/usr/bin/env node
// Every run reaches the leaderboard however it ends (js/fork/run-record.js, the Lab boards' time cap in
// firestore.rules), in headless Edge on dev.html against the Firebase emulator, so the real SDK and the real
// rules take every write (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-run-record.cjs [base-url]
//
// One account, a fake clock (runs last as long as asked and game.js's anti-cheat clean() sees them legal):
//   1. Closing the tab mid-run (2:05, a regular run): the next visit puts it on the regular boards.
//   2. A Lab run closed at 2:05: the next visit puts 2:05 on the Lab boards and offers to resume it; resumed
//      and played to 2:20, its end goes up too (a resumed run used to be tainted and never counted).
//   3. A tainted run (G.Game.taint, as the admin menu does) closed at 2:15 doesn't go up on the next visit.
//   4. A run that ends while its submission can't reach the server (closed before it went through): the next
//      visit sends it (2:25).
//   5. Co-op: the host closes the tab 2:05 into a group run: its next visit puts the team on the group boards.
//   6. The rules: a Lab run of 46:00 goes on the Lab boards (they took nothing over 45:00, so every long Lab run
//      was refused); a regular one of 46:00 still doesn't (the Judgment ends regular runs before that).
// Quitting, End run and falling all end through game.js endRun, checked by fork/test-lab-ranking.cjs and
// fork/test-end-run.cjs.
// FROM5=1 skips 1-4, SKIP5=1 skips 5 (it plays 2 real minutes of co-op); the whole check takes about 15 minutes.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = (process.argv[2] || require('./pw.cjs').BASE).replace(/\/$/, '');
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const TAG = String(Date.now()).slice(-7), NAME = 'rr' + TAG;
const FS = 'http://127.0.0.1:8080/v1/projects/demo-ps/databases/(default)/documents';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The top 50 summary of a board, straight from the emulator (as the admin): { id: t } */
async function summary(b) {
  const r = await fetch(`${FS}/lbs/${encodeURIComponent(b)}`, { headers: { Authorization: 'Bearer owner' } });
  if (r.status === 404) return {};
  const j = await r.json();
  const top = (((j.fields || {}).top || {}).mapValue || {}).fields || {};
  const out = {};
  for (const [id, v] of Object.entries(top)) out[id] = +(((v.mapValue || {}).fields || {}).t || {}).integerValue;
  return out;
}
/** Waits until every board has `id` at a time `ok` likes (or ms pass) → { board: t } */
async function wait(boards, id, ok, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const out = {};
    for (const b of boards) out[b] = (await summary(b))[id];
    if (Object.values(out).every(ok) || Date.now() - t0 > ms) return out;
    await sleep(500);
  }
}

/** Closes the tab as a player does (beforeunload and pagehide run). With runBeforeUnload Playwright's close()
 *  doesn't wait for the page to go, so this waits for it: the next page must not open before. */
async function closeTab(page) {
  await Promise.all([page.waitForEvent('close', { timeout: 15000 }), page.close({ runBeforeUnload: true })]);
}
async function open(ctx, errors, fake = true) {
  const page = await ctx.newPage();
  if (fake) await page.clock.install();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  return page;
}
/** A page that was signed in before: back at the menu, signed in. */
async function reopen(ctx, errors, fake = true) {
  const page = await open(ctx, errors, fake);
  await pastStart(page, '#scr-menu, #scr-lobby');
  await page.waitForFunction(() => G.DB.mode === 'cloud' && G.DB.online && G.Social.me, null, { timeout: 30000 });
  return page;
}
async function account(page, name, dex) {
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Lab && G.Ranking, null, { timeout: 30000 });
  return page.evaluate(async ([n, dex]) => {
    const r = await G.DB.register(n, 'pw-' + n);
    if (r.ok === false) return r;
    const st = await G.Social.start();
    const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(n);
    const s = G.DB.save; s.owned[dex] = { at: Date.now(), from: 'starter' }; s.partner = dex; s.starter = dex; G.DB.commit();
    G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
    G.UI.hideAll(); G.Flow.goMenu();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    return { ok: nick.ok !== false, uid: G.DB.fb.uid, me: G.Social.me && G.Social.me.name };
  }, [name, dex]);
}
/** Starts a run (no enemies, can't be hurt) and plays `secs` seconds of it on the fake clock. */
async function run(page, lab, secs, before) {
  // From a run's end screen, the way a player leaves it (its button), back to the menu first.
  if (await page.evaluate(() => G.Game.state === 'over')) {
    await page.evaluate(() => document.getElementById('btn-again').click());
    await page.waitForFunction(() => G.Game.state === 'ui', null, { timeout: 15000 });
  }
  await page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false }); }, lab);
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
  await page.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.Game.player.invuln = 1e9; });
  if (before) await page.evaluate(before);
  await page.clock.runFor(secs * 1000);
  return page.evaluate(() => Math.floor(G.Game.st.time));
}

(async () => {
  const up = await fetch('http://127.0.0.1:8080/').then(r => r.ok, () => false);
  if (!up) { console.error('test-run-record: the Firestore emulator is not on 127.0.0.1:8080 (see the top of this file)'); process.exit(1); }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    let page = await open(ctx, errors);
    const acct = await account(page, NAME, 4);
    check(acct.ok && acct.me === NAME, 'account on the emulator with its nickname', acct);
    const uid = acct.uid;
    const B = await page.evaluate(() => {
      const per = m => ['d', 'w', 'm', 'a'].map(p => G.Ranking.board(m, p));
      return { s: per('s'), ls: per('ls'), g: per('g') };
    });

    if (!process.env.FROM5) {
    console.log('1. Closing the tab mid-run');
    const t1 = await run(page, false, 125);
    await closeTab(page);
    page = await reopen(ctx, errors);
    const b1 = await wait(B.s, uid, t => t >= 120);
    check(t1 >= 120 && Object.values(b1).every(t => t >= 120 && t <= t1), `the next visit puts the ${t1} s run on every regular board`, b1);

    console.log('2. A Lab run closed, then resumed');
    const t2 = await run(page, true, 125);
    await closeTab(page);
    page = await reopen(ctx, errors);
    const b2 = await wait(B.ls, uid, t => t >= 120);
    check(t2 >= 120 && Object.values(b2).every(t => t >= 120 && t <= t2), `the next visit puts its ${t2} s on every Lab board`, b2);
    await page.waitForSelector('#resume-box [data-r]', { timeout: 10000 });
    await page.evaluate(() => { window.__sub = null; const s = G.Ranking.submitSolo; G.Ranking.submitSolo = function () { return (window.__sub = s.apply(this, arguments)); }; });
    await page.click('#resume-box [data-r]');
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.Game.player.invuln = 1e9; });
    await page.clock.runFor(15 * 1000);
    const t2b = await page.evaluate(() => Math.floor(G.Game.st.time));
    await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e12); });
    await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 20000 });
    const sent2 = await page.evaluate(async () => (window.__sub ? await window.__sub : 'not submitted'));
    const b2b = await wait(B.ls, uid, t => t >= t2b - 2);
    check(Array.isArray(sent2) && Object.values(b2b).every(t => t >= t2b - 2), `resumed and played to ${t2b} s, its end goes up too`, { sent: sent2, boards: b2b });
    await page.keyboard.press('Escape').catch(() => {});

    console.log('3. A tainted run closed');
    await run(page, false, 135, () => G.Game.taint());
    await closeTab(page);
    page = await reopen(ctx, errors);
    await sleep(6000);
    const b3 = await wait(B.s, uid, () => false, 1);
    check(Object.values(b3).every(t => t === b1[B.s[0]]), 'the next visit doesn\'t put it up (the boards keep the earlier time)', b3);

    console.log('4. A submission cut off by closing the tab');
    await run(page, false, 145);
    await ctx.route(/127\.0\.0\.1:8080/, () => { /* never answers: the server can't be reached */ });
    await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e12); });
    await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 20000 });
    await page.clock.runFor(2000);
    await closeTab(page);
    await ctx.unroute(/127\.0\.0\.1:8080/);
    page = await reopen(ctx, errors);
    const b4 = await wait(B.s, uid, t => t >= 140);
    check(Object.values(b4).every(t => t >= 140), 'the next visit sends it', b4);
    }
    await page.close();

    if (!process.env.SKIP5) {
    console.log('5. Co-op: the host closes the tab');
    const hctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), gctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    for (const c of [hctx, gctx]) {
      await c.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
      await c.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    }
    let host = await open(hctx, errors, false);
    const guest = await open(gctx, errors, false);
    const ha = await account(host, 'rrh' + TAG, 4), ga = await account(guest, 'rrg' + TAG, 7);
    const roomId = await host.evaluate(async () => (await G.Social.createRoom()).id);
    const j = await guest.evaluate(id => G.Social.joinRoom(id), roomId);
    for (const p of [host, guest]) await p.evaluate(() => G.LobbyUI.open());
    await host.waitForFunction(() => G.Social.room && G.Social.room.members.length === 2 &&
      G.Social.room.members.every(m => m.uid === G.Social.room.host || G.Net.mode(m.uid) === 'direct'), null, { timeout: 30000 });
    await host.waitForFunction(() => !document.getElementById('lobby-start').disabled, null, { timeout: 30000 });
    await host.click('#lobby-start');
    await host.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 30000 });
    await guest.waitForFunction(() => G.Game.state === 'playing' && G.Coop.active, null, { timeout: 30000 });
    for (const p of [host, guest]) await p.evaluate(() => { G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.Game.player.invuln = 1e9; });
    check(j.ok, 'a two-player group run started', j);
    await host.waitForFunction(() => G.Game.st.time >= 125, null, { timeout: 200000 });
    const gt = await host.evaluate(() => Math.floor(G.Game.st.time));
    await closeTab(host);
    host = await reopen(hctx, errors, false);
    const gid = [ha.uid, ga.uid].sort().join('_');
    const b5 = await wait(B.g, gid, t => t >= 120, 20000);
    check(Object.values(b5).every(t => t >= 120 && t <= gt + 2), `the host's next visit puts the team's ${gt} s on every group board`, b5);
    await hctx.close(); await gctx.close();
    }

    console.log('6. The rules: runs over 45:00');
    page = await reopen(ctx, errors);
    const r6 = await page.evaluate(async () => {
      const go = async (on, t) => { G.Settings.set('lab', on); G.Lab.begin(null); return G.Ranking.submitSolo({ t, lv: 30, kills: 9000, dex: 4, shiny: false }); };
      const a = await go(true, 2760), b = await go(false, 2760);
      G.Settings.set('lab', false); G.Lab.begin(null);
      return { a, b };
    });
    const b6l = await wait(B.ls, uid, t => t === 2760, 8000), b6r = await wait(B.s, uid, () => false, 1);
    check(Object.values(b6l).every(t => t === 2760), 'a Lab run of 46:00 goes on every Lab board', { sent: r6.a, boards: b6l });
    check(Array.isArray(r6.b) && !r6.b.length && B.s.every(b => !(b6r[b] >= 2700)), 'a regular one of 46:00 still doesn\'t (the rules refuse it)', { sent: r6.b, boards: b6r });
    check(!errors.length, 'no page errors', errors.slice(0, 4));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll run record checks passed');
  process.exit(failures ? 1 : 0);
})();
