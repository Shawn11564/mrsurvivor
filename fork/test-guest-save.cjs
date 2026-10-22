#!/usr/bin/env node
// Guest progress that survives (js/fork/guest-save.js, hooks in js/core/db.js, js/core/updater.js,
// js/ui/menu.js and js/ui/settings-ui.js), in headless Edge against the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-guest-save.cjs [base-url]
//
//   1. A guest's progress is kept in this browser: a reload lands back in the menu with it.
//   2. An update reloads a guest on the menu (the real js/core/updater.js, with a version stamp
//      put on dev.html and version.json answering a newer one) and the progress is still there.
//   3. Signing up from the guest: no "you'll lose everything" box, the login screen says the
//      progress goes to the account, and the new account has the Pokémon, coins, tickets and
//      partner, in the cloud too (read back from a fresh browser). The guest copy is used up.
//   4. Logging in to an EXISTING account adds the guest's Pokémon and the coins it earned on
//      top of its 500 to start; a guest that spent coins takes none from the account.
//   5. A browser that can't keep the guest copy: the updater doesn't reload (it says why) and
//      leaving still warns that the progress will be lost.
//   6. Without the cloud (Firebase unreachable: accounts of this browser), signing up keeps the
//      guest progress too, and a reload opens the account with it.
//   7. The built index.html (node fork/build.cjs first), through the UI only, Firebase blocked:
//      a guest who did the test is back on the menu with the same partner after a reload, and
//      after the real updater reloads for a newer version.json.
const { chromium, pastStart, pickStarter } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const STAMP = 'aaaa000001', NEWER = 'bbbb000002';
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

/** One browser profile on dev.html (cloud = the emulator). `stamp` makes js/core/updater.js run. */
async function device(browser, { stamp = false, clock = false, blockGuest = false, local = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, serviceWorkers: 'block' });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  if (local) await ctx.route('**/firebasejs/**', r => r.abort());
  const st = { newer: false, dialogs: [] };
  if (stamp) {
    // updater.js reads its version from the app.min.js tag of the built page: an inert copy of
    // that tag on dev.html, and version.json says whatever st.newer asks.
    await ctx.route(/\/dev\.html(\?.*)?$/, async r => {
      const res = await r.fetch();
      const body = (await res.text()).replace('<head>', `<head><script type="text/plain" src="js/app.min.js?v=${STAMP}"></script>`);
      r.fulfill({ response: res, body });
    });
    await ctx.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: st.newer ? NEWER : STAMP }) }));
  }
  // A browser that refuses to keep the guest copy (storage full, blocked for this site...).
  if (blockGuest) await ctx.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (/^ms\.guest/.test(k)) throw new Error('QuotaExceededError'); return set.call(this, k, v); };
  });
  // The one-time "what's new" boxes would sit over the menu after logging in.
  await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); } catch (e) { /* nada */ } });
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  page.st = st;
  page.local = local;
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e.stack || e).split('\n').slice(0, 4).join(' | ')));
  page.on('dialog', d => { st.dialogs.push(d.message()); d.dismiss(); });
  await open(page);
  return page;
}
async function open(page, sel = '#login-form, #scr-menu') {
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, sel);
  await page.waitForFunction(m => window.G && G.DB && G.DB.mode === m, page.local ? 'local' : 'cloud', { timeout: 30000 });
}
/** Clicks through toasts (they sit over the buttons for a few seconds). */
async function tap(page, sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
  await page.$eval(sel, e => e.click());
}
/**
 * Plays as a guest and gives it what a few runs would (the way the game does: change, then
 * commit). → its save once on the menu (opening the menu can award an achievement's coins).
 */
async function guestWith(page, { coins = 1234, t1 = 3, dex = 25 } = {}) {
  await tap(page, '#btn-guest');
  await page.evaluate(([c, t, d]) => {
    const s = G.DB.save;
    s.owned[1] = { at: Date.now(), from: 'starter' };
    s.owned[d] = { at: Date.now(), from: 'gacha' };
    s.partner = d; s.starter = 1; s.coins = c; s.tickets.t1 = t; s.stats.runs = 4;
    G.DB.commit();
    G.Flow.goMenu();
  }, [coins, t1, dex]);
  await page.waitForSelector('#scr-menu', { state: 'visible' });
  await page.waitForTimeout(300);
  return state(page);
}
const state = page => page.evaluate(() => G.DB.save && {
  guest: G.DB.guest, user: G.DB.user, partner: G.DB.save.partner, coins: G.DB.save.coins,
  t1: G.DB.save.tickets.t1, owned: Object.keys(G.DB.save.owned).map(Number).sort((a, b) => a - b), runs: G.DB.save.stats.runs
});
const onScreen = page => page.evaluate(() => [...document.querySelectorAll('.scr')].filter(e => !e.classList.contains('hidden')).map(e => e.id));
const pass = n => 'pw-' + n;
/** The save as the cloud has it: logs in from a fresh profile (no local copy to merge). */
async function cloudSave(browser, name) {
  const p = await device(browser);
  const r = await p.evaluate(async ([n, pw]) => {
    const r = await G.DB.login(n, pw);
    if (r.ok === false) return r;
    const s = G.DB.save;
    return { coins: s.coins, t1: s.tickets.t1, partner: s.partner, owned: Object.keys(s.owned).map(Number).sort((a, b) => a - b) };
  }, [name, pass(name)]);
  await p.context().close();
  return r;
}
const okSoon = (p, ms = 15000) => p.waitForFunction(() => G.DB.syncState === 'ok', null, { timeout: ms })
  .then(() => true, async () => { console.log('    syncState:', await p.evaluate(() => G.DB.syncState)); return false; });
// firestore.rules refuses a save written less than 20 s (server time) after the last one.
const RULE_GAP = () => new Promise(res => setTimeout(res, 21000));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    console.log('1. A reload keeps the guest');
    const a = await device(browser);
    const g1 = await guestWith(a);
    await open(a);
    const s1 = await state(a);
    check(s1 && s1.guest && (await onScreen(a)).includes('scr-menu'), 'back in the menu as the guest', await onScreen(a));
    check(s1 && s1.partner === 25 && s1.coins === g1.coins && g1.coins >= 1234 && s1.t1 === 3 && s1.owned.includes(25), 'with the Pokémon, coins and tickets', { s1, g1 });
    check(!a.errs.length, 'no page errors', a.errs);
    await a.context().close();

    console.log('2. An update reloads a guest without losing anything');
    const u = await device(browser, { stamp: true, clock: true });
    const g2 = await guestWith(u, { coins: 777, dex: 133 });
    u.st.newer = true;
    const loaded = u.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false);
    await u.clock.fastForward('00:35');                  // the first check is 30 s after loading
    // Then the 5 s countdown in real time: fast-forwarding through the reload itself can leave
    // the fake clock stopped on the new page (it then never gets past the boot screen).
    const seen = await u.waitForFunction(() => G.Updater.pending, null, { timeout: 10000 }).then(() => true, () => false);
    check(seen, 'the updater saw the new version');
    const reloaded = await loaded;
    check(reloaded, 'the updater reloaded the page');
    u.st.newer = false;
    if (reloaded) {
      await pastStart(u, '#login-form, #scr-menu');
      await u.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud', null, { timeout: 30000 });
      const s2 = await state(u);
      check(s2 && s2.guest && s2.partner === 133 && s2.coins === g2.coins && s2.owned.includes(133), 'still the same guest, with its progress', s2);
    }
    check(!u.errs.length, 'no page errors', u.errs);
    await u.context().close();

    console.log('3. Signing up keeps the guest progress');
    const NEW = 'gs' + tag;
    const b = await device(browser);
    const g3 = await guestWith(b, { coins: 1234, t1: 3, dex: 25 });
    await tap(b, '#btn-logout');
    check(!b.st.dialogs.length, 'leaving the guest asks nothing (nothing is lost)', b.st.dialogs);
    await b.waitForSelector('#scr-login', { state: 'visible', timeout: 10000 }).catch(() => {});
    const note = await b.evaluate(() => { const e = document.getElementById('guest-carry'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
    check(/2 Pokémon/.test(note), 'the login screen says the guest progress goes to the account', note);
    await tap(b, '#scr-login .tab[data-tab="register"]');
    await b.fill('#f-user', NEW);
    await b.fill('#f-pass', pass(NEW));
    await tap(b, '#btn-auth');
    await b.waitForSelector('#scr-menu', { state: 'visible', timeout: 20000 }).catch(() => {});
    const s3 = await state(b);
    check(s3 && !s3.guest && s3.user === NEW, 'signed in to the new account, straight to the menu', { s3, on: await onScreen(b) });
    check(s3 && s3.partner === 25 && s3.coins === g3.coins && s3.t1 === 3 && s3.runs === 4 && s3.owned.join() === '1,25',
      'the account has the guest\'s Pokémon, partner, coins, tickets and stats', { s3, g3 });
    check(await okSoon(b), 'and uploads it at once');
    const c3 = await cloudSave(browser, NEW);
    check(c3 && c3.coins === g3.coins && c3.t1 === 3 && c3.partner === 25 && c3.owned.join() === '1,25', 'the cloud has it (fresh browser)', c3);
    check(await b.evaluate(() => localStorage.getItem('ms.guest') === null), 'the guest copy is used up');
    await tap(b, '#btn-logout');
    await b.waitForSelector('#scr-login', { state: 'visible', timeout: 10000 });
    await tap(b, '#btn-guest');
    const fresh = await state(b);
    check(fresh && fresh.guest && !fresh.partner && fresh.coins === 500, 'playing as a guest again starts afresh', fresh);
    check(!b.st.dialogs.length && !b.errs.length, 'no dialogs or page errors', { d: b.st.dialogs, e: b.errs });
    await b.context().close();

    console.log('4. Logging in to an existing account adds to it');
    const OLD = 'go' + tag;
    const o = await device(browser);
    const reg = await o.evaluate(async ([n, pw]) => {
      const r = await G.DB.register(n, pw);
      if (r.ok === false) return r;
      const s = G.DB.save;
      s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; s.tickets.t1 = 10; s.stats.runs = 9;
      G.DB.commit();
      await G.DB.saveNow();
      return { ok: true, coins: s.coins };
    }, [OLD, pass(OLD)]);
    check(reg.ok !== false, 'existing account made', reg);
    check(await okSoon(o), 'and saved to the cloud');
    await o.context().close();
    await RULE_GAP();
    // Rich guest: earned 300 (and whatever the menu awarded) over the 500 it started with.
    const g = await device(browser);
    const g4 = await guestWith(g, { coins: 800, t1: 2, dex: 133 });
    await tap(g, '#btn-logout');
    await g.waitForSelector('#scr-login', { state: 'visible', timeout: 10000 });
    await g.fill('#f-user', OLD);
    await g.fill('#f-pass', pass(OLD));
    await tap(g, '#btn-auth');
    await g.waitForSelector('#scr-menu', { state: 'visible', timeout: 20000 }).catch(() => {});
    const s4 = await state(g);
    check(s4 && s4.user === OLD && s4.partner === 4 && s4.runs === 9, 'the account keeps its own partner and stats', s4);
    const want4 = reg.coins + g4.coins - 500;
    check(s4 && s4.owned.join() === '1,4,133' && s4.coins === want4 && s4.t1 === 12, `and gains the guest's Pokémon, the ${g4.coins - 500} coins it earned and its tickets`, { s4, want4 });
    check(await okSoon(g), 'uploaded');
    check(!g.errs.length, 'no page errors', g.errs);
    await g.context().close();
    await RULE_GAP();
    // Poor guest: spent 400 of its 500.
    const p = await device(browser);
    const g5 = await guestWith(p, { coins: 100, t1: 0, dex: 7 });
    await p.evaluate(() => { G.DB.save.coins = 100; G.DB.commit(); });   // (spent what the menu awarded too)
    await tap(p, '#btn-logout');
    await p.waitForSelector('#scr-login', { state: 'visible', timeout: 10000 });
    await p.fill('#f-user', OLD);
    await p.fill('#f-pass', pass(OLD));
    await tap(p, '#btn-auth');
    await p.waitForSelector('#scr-menu', { state: 'visible', timeout: 20000 }).catch(() => {});
    const s5 = await state(p);
    check(s5 && s5.owned.includes(7) && s4 && s5.coins === s4.coins && s5.t1 === 12, 'a guest that spent coins adds its Pokémon and takes no coins', { s5, g5 });
    check(await okSoon(p), 'uploaded');
    await p.context().close();

    console.log('5. A browser that can\'t keep the guest copy');
    const x = await device(browser, { stamp: true, clock: true, blockGuest: true });
    const gx = await guestWith(x, { coins: 600, dex: 39 });
    x.st.newer = true;
    let reloads = 0;
    x.on('load', () => reloads++);
    await x.clock.fastForward('00:35');
    await x.waitForTimeout(3000);
    const toast = await x.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; });
    check(/new version/i.test(toast) || /versión nueva/.test(toast), 'the updater says a new version is waiting', toast);
    await x.clock.fastForward('01:00');
    await x.waitForTimeout(1500);
    check(!reloads && await x.evaluate(c => G.DB.guest && G.DB.save.coins === c, gx.coins), 'and leaves the guest alone', { reloads });
    await tap(x, '#btn-logout');
    check(x.st.dialogs.length === 1, 'leaving still warns that the progress will be lost', x.st.dialogs);
    check(!x.errs.length, 'no page errors', x.errs);
    await x.context().close();

    console.log('6. Without the cloud');
    const LOC = 'gl' + tag;
    const l = await device(browser, { local: true });
    const g6 = await guestWith(l, { coins: 950, t1: 1, dex: 150 });
    await tap(l, '#btn-logout');
    await l.waitForSelector('#scr-login', { state: 'visible', timeout: 10000 });
    await tap(l, '#scr-login .tab[data-tab="register"]');
    await l.fill('#f-user', LOC);
    await l.fill('#f-pass', pass(LOC));
    await tap(l, '#btn-auth');
    await l.waitForSelector('#scr-menu', { state: 'visible', timeout: 20000 }).catch(() => {});
    const s6 = await state(l);
    check(s6 && !s6.guest && s6.user === LOC && s6.partner === 150 && s6.coins === g6.coins && s6.t1 === 1 && s6.owned.join() === '1,150',
      'the local account has the guest progress', { s6, g6 });
    await open(l);
    const r6 = await state(l);
    check(r6 && !r6.guest && r6.user === LOC && r6.owned.join() === '1,150' && r6.coins === g6.coins, 'and still has it after a reload', r6);
    check(!l.errs.length, 'no page errors', l.errs);
    await l.context().close();

    console.log('7. The built index.html');
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, serviceWorkers: 'block' });
    await ctx.route('**/firebasejs/**', r => r.abort());
    let newer = false;
    const built = require('fs').readFileSync(require('path').join(__dirname, '..', 'version.json'), 'utf8');
    await ctx.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: newer ? JSON.stringify({ v: NEWER }) : built }));
    const w = await ctx.newPage();
    const werrs = [];
    w.on('pageerror', e => werrs.push(String(e)));
    await w.clock.install();
    await w.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(w, '#btn-guest');
    await w.click('#btn-guest');
    await pickStarter(w);   // a new player's first screen (js/fork/starter-pick.js)
    await w.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
    const mon = (await w.textContent('#menu-partner-name')).trim();
    await w.reload({ waitUntil: 'load' });
    await pastStart(w, '#scr-menu, #scr-login');
    check(await w.isVisible('#scr-menu') && (await w.textContent('#menu-partner-name')).trim() === mon, `a reload lands on the menu with ${mon}`);
    newer = true;
    const again = w.waitForEvent('load', { timeout: 30000 }).then(() => true, () => false);
    await w.clock.fastForward('00:35');
    check(await again, 'the updater reloaded for the new version');
    newer = false;
    await pastStart(w, '#scr-menu, #scr-login');
    check(await w.isVisible('#scr-menu') && (await w.textContent('#menu-partner-name')).trim() === mon, `and the guest is still on the menu with ${mon}`);
    check(!werrs.length, 'no page errors', werrs);
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
