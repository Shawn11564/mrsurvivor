/* ============ fork/test-cloud.cjs — live check of accounts + cloud saves ============
 *   (serve the repo first: python -m http.server 8123)
 *   node fork/test-cloud.cjs [http://127.0.0.1:8123]
 *
 * Runs against the REAL Firebase project in js/core/firebase-config.js, in headless
 * Edge, each step in a fresh browser profile (no localStorage carried over):
 *   1. index.html (the branded build): the login screen says the cloud is on, and
 *      signing up a throwaway name+password account works.
 *   2. dev.html (exposes G): log in, write a marker into the save, saveNow().
 *   3. fresh profile: log in again; the marker must come back from Firestore.
 *   4. delete the account; logging in again must fail.
 * Needs Playwright: from this repo's node_modules, or PLAYWRIGHT_DIR=<folder with node_modules>.
 */
const path = require('path');
const { chromium } = require(require.resolve('playwright', {
  paths: [__dirname, process.env.PLAYWRIGHT_DIR || path.join(__dirname, '..', '..', 'commandcenter')]
}));
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const NAME = 'cctest' + String(Date.now()).slice(-6);
const PASS = 'pw-' + Math.random().toString(36).slice(2, 12);
const MARK = 40000 + Math.floor(Math.random() * 9999);

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const fresh = async (page_) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    await page.goto(`${BASE}/${page_}`, { waitUntil: 'load' });
    return { ctx, page };
  };
  const devReady = page => page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud', null, { timeout: 20000 });
  console.log(`test-cloud: ${BASE} · account ${NAME}`);
  try {
    // 1. sign up through the real branded page
    let { ctx, page } = await fresh('index.html');
    await page.waitForTimeout(3000);
    await page.mouse.click(640, 425);
    await page.waitForSelector('#login-form', { state: 'visible' });
    await page.waitForFunction(() => /cloud/i.test(document.getElementById('login-mode').textContent), null, { timeout: 20000 })
      .then(() => check(true, 'login screen says saves go to the cloud'), () => check(false, 'login screen says saves go to the cloud'));
    check(await page.isVisible('#btn-google'), '"Sign in with Google" button shown');
    await page.click('.tab[data-tab="register"]');
    await page.fill('#f-user', NAME);
    await page.fill('#f-pass', PASS);
    await page.click('#btn-auth');
    const left = await page.waitForSelector('#scr-login', { state: 'hidden', timeout: 20000 }).then(() => true, () => false);
    const err = await page.textContent('#login-err');
    check(left && !err.trim(), 'sign-up on index.html' + (err.trim() ? ': ' + err.trim() : ''));
    check(!page.errs.length, 'no page errors on index.html' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();

    // 2. write a marker into the cloud save
    ({ ctx, page } = await fresh('dev.html'));
    await devReady(page);
    let r = await page.evaluate(async ([n, p, m]) => {
      const res = await G.DB.login(n, p);
      if (!res.ok) return { step: 'login', res };
      G.DB.save.coins = m; G.DB.commit(true);
      return { step: 'save', res: await G.DB.saveNow() };
    }, [NAME, PASS, MARK]);
    check(r.step === 'save' && r.res && r.res.ok, 'log in + saveNow() on dev.html: ' + JSON.stringify(r.res));
    await ctx.close();

    // 3. fresh profile: the marker comes back from Firestore
    ({ ctx, page } = await fresh('dev.html'));
    await devReady(page);
    r = await page.evaluate(async ([n, p]) => {
      const res = await G.DB.login(n, p);
      return { ok: res.ok, coins: G.DB.save && G.DB.save.coins, error: res.error };
    }, [NAME, PASS]);
    check(r.ok && r.coins === MARK, `save survives a fresh browser (coins ${r.coins}, expected ${MARK})`);

    // 4. clean up: delete the throwaway account
    r = await page.evaluate(async p => await G.DB.deleteAccount(p), PASS);
    check(r && r.ok, 'delete the test account: ' + JSON.stringify(r));
    await ctx.close();
    ({ ctx, page } = await fresh('dev.html'));
    await devReady(page);
    r = await page.evaluate(async ([n, p]) => (await G.DB.login(n, p)).ok, [NAME, PASS]);
    check(r === false, 'deleted account can no longer log in');
    await ctx.close();
  } catch (e) {
    console.error('test-cloud: ERROR ' + e.message);
    failures++;
  }
  await browser.close();
  console.log(failures ? `test-cloud: ${failures} FAILED (account ${NAME} may need deleting in the console)` : 'test-cloud: all passed');
  process.exit(failures ? 1 : 0);
})();
