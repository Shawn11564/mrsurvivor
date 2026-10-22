#!/usr/bin/env node
// Cloud saves without the Save button (js/fork/cloud-backup.js, pushNow in js/core/db.js), in
// headless Edge against the Firebase emulator (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-cloud-backup.cjs [base-url]
//
//   1. A change stays local at first, and reaches the cloud by itself 10 min later (fake clock).
//   2. Hiding the tab with something unsaved uploads it at once.
//   3. Two devices on one account, each with a Pokémon the other lacks, both upload: the cloud
//      ends up with both (each upload merges with the cloud; upstream's blind write lost one).
// The cloud is read back by logging in from a fresh profile (no local copy to merge).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const NAME = 'bk' + String(Date.now()).slice(-7), PASS = 'pw-' + NAME;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function device(browser, { clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.CloudBackup, null, { timeout: 30000 });
  return page;
}
const cloudOwned = async (browser, dex) => {
  const p = await device(browser);
  const r = await p.evaluate(async ([n, pw]) => { const r = await G.DB.login(n, pw); return r.ok !== false ? Object.keys(G.DB.save.owned).map(Number) : r; }, [NAME, PASS]);
  await p.context().close();
  return Array.isArray(r) ? dex.filter(d => r.includes(d)) : r;
};
const grant = (p, dex) => p.evaluate(d => { G.DB.save.owned[d] = { at: Date.now(), from: 'test' }; G.DB.commit(); return G.DB.syncState; }, dex);
// firestore.rules refuses a save written less than 20 s (server time) after the last one.
const RULE_GAP = () => new Promise(res => setTimeout(res, 21000));
const okSoon = (p, ms = 15000) => p.waitForFunction(() => G.DB.syncState === 'ok', null, { timeout: ms }).then(() => true, async () => { console.log('    syncState:', await p.evaluate(() => G.DB.syncState)); return false; });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    console.log('1. Automatic backup');
    const a = await device(browser, { clock: true });
    const reg = await a.evaluate(async ([n, pw]) => G.DB.register(n, pw), [NAME, PASS]);
    check(reg.ok !== false, 'account created on the emulator', reg.ok === false ? reg : undefined);
    // A new account starts with its first upload pending: done by hand here (Save) so the
    // 10 min below count from the next change. No fast-forward while an upload is in flight
    // (it would trip the 12 s network timeout).
    await a.evaluate(() => G.DB.saveNow());
    check(await okSoon(a), 'first upload (Save)');
    await RULE_GAP();
    await a.clock.fastForward('01:10');                 // past the game's own 65 s gap
    check(await grant(a, 25) === 'pending', 'a new Pokémon is saved locally, cloud pending');
    check(!(await cloudOwned(browser, [25])).length, 'not in the cloud yet');
    await a.clock.fastForward('09:00');
    const st9 = await a.evaluate(() => G.DB.syncState);
    check(st9 === 'pending', 'still pending after 9 min', st9);
    await a.clock.fastForward('01:05');
    check(await okSoon(a), 'uploaded by itself at 10 min');
    check((await cloudOwned(browser, [25])).length === 1, 'and the cloud has it');

    console.log('2. Hiding the tab');
    await RULE_GAP();
    await a.clock.fastForward('01:10');
    await grant(a, 133);
    // Headless Chromium can't really background a tab: this fires the same event a tab
    // switch or app switch does, with the page reporting itself hidden.
    await a.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    check(await okSoon(a), 'hiding the tab uploads at once');
    check((await cloudOwned(browser, [133])).length === 1, 'and the cloud has it');
    await a.evaluate(() => { delete document.visibilityState; });

    console.log('3. Two devices merge');
    await RULE_GAP();
    await a.clock.fastForward('01:10');
    const b = await device(browser);
    await b.evaluate(async ([n, pw]) => G.DB.login(n, pw), [NAME, PASS]);
    await grant(a, 150);                                 // only on A
    await grant(b, 151);                                 // only on B (B never saw 150)
    await a.evaluate(() => G.DB.flush());
    check(await okSoon(a), 'A uploads Mewtwo');
    await RULE_GAP();
    await b.evaluate(() => G.DB.flush());
    check(await okSoon(b), 'B uploads Mew');
    const both = await cloudOwned(browser, [25, 133, 150, 151]);
    check(both.length === 4, 'the cloud keeps everything from both devices', both);
    check(await b.evaluate(() => !!G.DB.save.owned[150]), 'and B now has A\'s Mewtwo locally too');
    check(!a.errs.length && !b.errs.length, 'no page errors', a.errs.concat(b.errs));
  } catch (e) {
    console.error(e); failures++;
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll cloud backup checks passed');
  process.exit(failures ? 1 : 0);
})();
