/* ============ fork/test-cloud.cjs — live check of accounts + cloud saves ============
 *   node fork/test-cloud.cjs [base]      base = http://127.0.0.1:8123 (default, serve the
 *                                        repo first: python -m http.server 8123) or the
 *                                        live site, https://play.mrshawn.dev
 *
 * Runs against the REAL Firebase project in js/core/firebase-config.js, in headless
 * Edge, each browser step in a fresh profile (no localStorage carried over):
 *   1. index.html (the branded build): the login screen says the cloud is on, and
 *      signing up a throwaway name+password account works; then a starter and the Save button
 *      (a new account waits for Save before its first upload).
 *   2. Firebase REST, signed in as that account with the page's own API key and origin:
 *      its save document exists in Firestore, so the page really wrote to the cloud.
 *   3. a fresh profile logs in on index.html.
 *   4. local only: dev.html (exposes G) writes a marker into the save and a fresh
 *      profile reads it back. dev.html is upstream's raw source, whose host allowlist
 *      only lets the cloud run on localhost, so this step can't run on the live site.
 *   5. cleanup through REST, removing what the game's "Delete account" removes for a new
 *      account (saves, pres, profiles, names), then the login; logging in must then fail.
 * On failure it prints the throwaway login so the account can be cleaned up by hand.
 * Needs Playwright: from this repo's node_modules, or PLAYWRIGHT_DIR=<folder with node_modules>.
 */
const path = require('path'), fs = require('fs');
const { pickStarter } = require('./pw.cjs');
const { chromium } = require(require.resolve('playwright', {
  paths: require('./pw.cjs').NODE_DIRS
}));
const BASE = (process.argv[2] || require('./pw.cjs').BASE).replace(/\/$/, '');
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE + '/');
const NAME = 'cctest' + String(Date.now()).slice(-6);
const PASS = 'pw-' + Math.random().toString(36).slice(2, 12);
const MARK = 40000 + Math.floor(Math.random() * 9999);

// The page's own config, read from the file the build bundles.
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'firebase-config.js'), 'utf8');
const API_KEY = (cfgSrc.match(/apiKey:\s*'([^']+)'/) || [])[1];
const PROJECT = (cfgSrc.match(/projectId:\s*'([^']+)'/) || [])[1];
// Same mapping as db.js nameToEmail(): hex of the lowercased name at the internal domain.
const EMAIL = Buffer.from(NAME.toLowerCase()).toString('hex') + '@jugadores.pokesurvivor.net';

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

// Firebase REST, sent the way the browser sends it (the API key only accepts our sites).
const headers = { 'Content-Type': 'application/json', Referer: BASE + '/' };
async function idt(method, body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${API_KEY}`,
    { method: 'POST', headers, body: JSON.stringify(body) });
  return r.json();
}
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const fsReq = (method, docPath, token) => fetch(`${FS}/${docPath}`, { method, headers: { ...headers, Authorization: 'Bearer ' + token } });

(async () => {
  if (!API_KEY || !PROJECT) { console.error('test-cloud: no Firebase config in firebase-config.js'); process.exit(1); }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const fresh = async (page_) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    await page.goto(`${BASE}/${page_}`, { waitUntil: 'load' });
    return { ctx, page };
  };
  const toLoginForm = async page => {
    await page.waitForTimeout(3000);
    await page.mouse.click(640, 425);
    await page.waitForSelector('#login-form', { state: 'visible' });
    await page.waitForFunction(() => /cloud/i.test(document.getElementById('login-mode').textContent), null, { timeout: 20000 });
  };
  const submit = async (page, tab) => {
    if (tab) await page.click(`.tab[data-tab="${tab}"]`);
    await page.fill('#f-user', NAME);
    await page.fill('#f-pass', PASS);
    await page.click('#btn-auth');
    const left = await page.waitForSelector('#scr-login', { state: 'hidden', timeout: 20000 }).then(() => true, () => false);
    return { left, err: (await page.textContent('#login-err')).trim() };
  };
  const devReady = page => page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud', null, { timeout: 20000 });
  console.log(`test-cloud: ${BASE} · project ${PROJECT} · account ${NAME}`);
  let created = false;
  try {
    // 1. sign up through the real branded page
    let { ctx, page } = await fresh('index.html');
    await toLoginForm(page).then(() => check(true, 'login screen says saves go to the cloud'),
      () => check(false, 'login screen says saves go to the cloud'));
    check(await page.isVisible('#btn-google'), '"Sign in with Google" button shown');
    let r = await submit(page, 'register');
    created = r.left && !r.err;
    check(created, 'sign-up on index.html' + (r.err ? ': ' + r.err : ''));
    // A new account isn't uploaded on sign-up (upstream, 20-10-2026: it waits for Save, or the fork's
    // 10-minute backup, js/fork/cloud-backup.js): pick a starter and press Save, as a player would.
    if (created) {
      await pickStarter(page).catch(e => check(false, 'starter grid after sign-up: ' + e.message));
      for (const id of ['savenote-ok']) if (await page.isVisible('#' + id)) await page.click('#' + id);
      const saved = await page.waitForSelector('#btn-save', { state: 'visible', timeout: 15000 }).then(() => page.click('#btn-save')).then(() => true, () => false);
      check(saved, 'the Save button is there after picking a starter, and pressed');
    }
    await page.waitForTimeout(4000);                 // let the save reach Firestore
    check(!page.errs.length, 'no page errors on index.html' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();

    // 2. the save document is in Firestore
    const auth = await idt('signInWithPassword', { email: EMAIL, password: PASS, returnSecureToken: true });
    check(!!auth.idToken, 'account exists in Firebase Auth' + (auth.error ? ': ' + auth.error.message : ''));
    const save = auth.idToken ? await fsReq('GET', `saves/${auth.localId}`, auth.idToken) : null;
    const saveBody = save ? await save.text() : '';
    check(save && save.status === 200 && saveBody.includes(NAME), `save document saves/${auth.localId} is in Firestore` + (save ? ` (HTTP ${save.status})` : ''));

    // 3. a fresh profile logs in on the branded page
    ({ ctx, page } = await fresh('index.html'));
    await toLoginForm(page);
    r = await submit(page, null);
    check(r.left && !r.err, 'log in from a fresh browser on index.html' + (r.err ? ': ' + r.err : ''));
    await ctx.close();

    // 4. local only: the save round-trips through the game's own sync
    // firestore.rules lets a save be written again only 20 s after the last one (an anti-loop cap; the
    // game retries later): step 1's Save was a few seconds ago.
    await new Promise(r => setTimeout(r, 21000));
    if (LOCAL) {
      ({ ctx, page } = await fresh('dev.html'));
      await devReady(page);
      r = await page.evaluate(async ([n, p, m]) => {
        const res = await G.DB.login(n, p);
        if (!res.ok) return res;
        G.DB.save.coins = m; G.DB.commit(true);
        return await G.DB.saveNow();
      }, [NAME, PASS, MARK]);
      check(r && r.ok, 'dev.html: log in + saveNow(): ' + JSON.stringify(r));
      await ctx.close();
      ({ ctx, page } = await fresh('dev.html'));
      await devReady(page);
      r = await page.evaluate(async ([n, p]) => { const res = await G.DB.login(n, p); return { ok: res.ok, coins: G.DB.save && G.DB.save.coins }; }, [NAME, PASS]);
      check(r.ok && r.coins === MARK, `dev.html: save survives a fresh browser (coins ${r.coins}, expected ${MARK})`);
      await ctx.close();
    } else {
      console.log('  SKIP save round trip through dev.html (its raw upstream code only uses the cloud on localhost)');
    }
  } catch (e) {
    console.error('test-cloud: ERROR ' + e.message);
    failures++;
  }

  // 5. cleanup: what the game's "Delete account" removes for a brand-new account
  if (created) {
    const auth = await idt('signInWithPassword', { email: EMAIL, password: PASS, returnSecureToken: true });
    if (auth.idToken) {
      const uid = auth.localId, tok = auth.idToken;
      const prof = await fsReq('GET', `profiles/${uid}`, tok);
      const lower = prof.status === 200 ? (((await prof.json()).fields || {}).lower || {}).stringValue : null;
      for (const p of [`saves/${uid}`, `pres/${uid}`, `runs/${uid}`, lower && `names/${lower}`, `profiles/${uid}`].filter(Boolean)) {
        const d = await fsReq('DELETE', p, tok);
        if (d.status !== 200) console.log(`  note: DELETE ${p} → HTTP ${d.status}`);
      }
      const del = await idt('delete', { idToken: tok });
      check(!del.error, 'delete the test account' + (del.error ? ': ' + del.error.message : ''));
      const again = await idt('signInWithPassword', { email: EMAIL, password: PASS, returnSecureToken: true });
      check(!again.idToken, 'deleted account can no longer log in');
    } else check(false, 'sign in for cleanup: ' + (auth.error && auth.error.message));
  }
  await browser.close();
  if (failures && created) console.log(`test-cloud: leftover account? name ${NAME} · password ${PASS} · ${EMAIL}`);
  console.log(failures ? `test-cloud: ${failures} FAILED` : 'test-cloud: all passed');
  process.exit(failures ? 1 : 0);
})();
