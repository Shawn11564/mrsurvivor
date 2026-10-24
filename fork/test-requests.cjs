#!/usr/bin/env node
// Requests (js/fork/requests.js, the "req" rules in firestore.rules, fork/requests.cjs) with real accounts in
// headless Edge on the Firebase emulator (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database   (started here if 8080 is closed)
//   node fork/serve.cjs
//   node fork/test-requests.cjs [base-url]      (SHOTS=<folder> saves screenshots)
//
// The admin signs in with the owner's real uid; the artist with the first non-admin uid in firestore.rules
// staff() (when that list has only the admin, a test uid is put into the emulator's copy of the rules, and
// every page's G.Requests.STAFF). Checks:
//   1. Who: the artist has the REQUESTS button, the admin the ADMIN one (Requests inside), a player neither;
//      a player can't read or create requests.
//   2. The artist writes a change request with a picture (attached as a file): one document, status new,
//      the picture a JPEG data URL under the rules' 300 KB; the thread opens.
//   3. The admin's badge says "Requests (1)"; the row is unread until opened; the picture shows in the thread.
//   4. The watcher (fork/requests.cjs on the emulator): the thread with its picture saved as a JPEG file;
//      --find by nickname; --claim (the artist sees "Working on it" and the message live); --reply with a
//      commit and status ask ("Waiting on you", commit linked); the artist's answer sets it back to new;
//      --reply --status done; the Open / Done filters; --poll with a watch.
//   5. Rules: the artist can't set done, post as someone else or write someone else's request; the admin's
//      status select works; the artist closes their own open request.
//   6. A phone (390 px): the window fits, one column, Back from a thread.
//   7. No page errors.
const fs = require('fs'), path = require('path'), net = require('net'), { spawn, execFileSync } = require('child_process');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || require('./pw.cjs').BASE;
const ROOT = path.join(__dirname, '..');
const EMU_CFG = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const ADMIN_UID = 'TMD8t0i6jic7a1sg824ZP55TqOG3', ADMIN_NAME = 'rqadmin', PASS = 'pw-requests';
const ARTIST_NAME = 'rqartist', TEST_ARTIST = 'rqartisttest0001';
const SHOTS = process.env.SHOTS;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 10000) => p.waitForFunction(pred, arg, { timeout: ms, polling: 200 }).then(() => true, () => false);
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const portOpen = port => new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The artist's uid: the rules' staff() list, minus the admin; else a test uid in a copy of the rules.
function rulesAndArtist() {
  let rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const m = /function staff\(\) \{ return signedIn\(\) && me\(\) in \[([^\]]*)\]; \}/.exec(rules);
  if (!m) throw new Error('firestore.rules has no staff() list');
  const uids = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).filter(u => u !== ADMIN_UID);
  if (uids.length) return { rules, artist: uids[0], injected: false };
  rules = rules.replace(m[0], m[0].replace(m[1], m[1] + `, '${TEST_ARTIST}'`));
  return { rules, artist: TEST_ARTIST, injected: true };
}

async function emulator() {
  if (await portOpen(8080)) return null;
  console.log('Starting the Firebase emulator…');
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', 'firebase-tools', 'emulators:start', '--project', 'demo-ps', '--only', 'auth,firestore,database'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 180; i++) {
    if ((await portOpen(8080)) && (await portOpen(9099)) && (await portOpen(9000))) { await sleep(1500); return child; }
    if (child.exitCode !== null) throw new Error('emulator exited: ' + log.slice(-800));
    await sleep(1000);
  }
  throw new Error('emulator did not come up: ' + log.slice(-800));
}
const stopEmulator = child => {
  if (!child) return;
  try { if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill(); } catch (e) { /* gone */ }
};

const nameEmail = name => Buffer.from(name.trim().toLowerCase()).toString('hex') + '@jugadores.pokesurvivor.net';
async function emulatorRules(rules) {
  let r = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-ps:securityRules', { method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  if (!r.ok) throw new Error('firestore rules: ' + r.status + ' ' + await r.text());
  r = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-ps-default-rtdb', { method: 'PUT',
    headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8') });
  if (!r.ok) throw new Error('database rules: ' + r.status + ' ' + await r.text());
}
async function account(uid, name) {
  // Another uid with this name's email (an earlier run with other staff uids): removed first.
  const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-ps/accounts';
  const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const look = await (await fetch(AUTH + ':lookup', { method: 'POST', headers: H, body: JSON.stringify({ email: [nameEmail(name)] }) })).json();
  for (const u of look.users || []) if (u.localId !== uid) await fetch(AUTH + ':delete', { method: 'POST', headers: H, body: JSON.stringify({ localId: u.localId }) });
  // And any other uid's profile with this nickname (so --find has one answer).
  const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-ps/databases/(default)/documents';
  const rows = await (await fetch(DOCS + ':runQuery', { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'profiles' }],
    where: { fieldFilter: { field: { fieldPath: 'lower' }, op: 'EQUAL', value: { stringValue: name.toLowerCase() } } } } }) })).json();
  for (const row of rows || []) if (row.document && !row.document.name.endsWith('/' + uid)) await fetch(DOCS + '/' + row.document.name.split('/documents/')[1], { method: 'DELETE', headers: H });
  // And the nickname's reservation, when another uid holds it.
  const NAME = DOCS + '/names/' + encodeURIComponent(name.toLowerCase());
  const held = await (await fetch(NAME, { headers: H })).json();
  if (held.fields && held.fields.uid && held.fields.uid.stringValue !== uid) await fetch(NAME, { method: 'DELETE', headers: H });
  let r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-ps/accounts', { method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid, email: nameEmail(name), password: PASS }) });
  if (r.ok) return;
  if (!/DUPLICATE/.test(await r.text())) throw new Error(name + ' account: ' + r.status);
  // The uid is there from another check (test-player-manager makes the admin with its own name): take it over.
  r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-ps/accounts:update', { method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid, email: nameEmail(name), password: PASS }) });
  if (!r.ok) throw new Error(name + ' account update: ' + r.status + ' ' + await r.text());
}

async function page(browser, artistUid, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU_CFG }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e)));
  await p.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(p, '#login-form');
  await p.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Requests && G.Admin, null, { timeout: 30000 });
  await p.evaluate(u => { if (!G.Requests.STAFF.includes(u)) G.Requests.STAFF.push(u); }, artistUid);
  await p.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  return p;
}
/** A signed-in player with a nickname, in the menu. `login` = the account exists (admin, artist). */
async function player(browser, artistUid, name, login, viewport) {
  const p = await page(browser, artistUid, viewport);
  const r = await p.evaluate(async ([name, login, pass]) => {
    const reg = login ? await G.DB.login(name, pass) : await G.DB.register(name, pass);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    if (!s.partner) { s.partner = 25; s.starter = 25; s.owned[25] = { at: Date.now(), from: 'starter' }; G.DB.commit(); }
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    await G.DB.flush();
    return { ok: true, uid: G.DB.fb.uid };
  }, [name, login, PASS]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  p.uid = r.uid; p.name = name;
  return p;
}

const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
const doc = (p, id) => p.evaluate(async id => { const d = await G.DB.fb.fs.collection('req').doc(id).get(); return d.exists ? Object.assign(d.data(), { picLen: (d.data().pics || []).map(x => x.length) }) : null; }, id);
const tryFs = (p, fn, arg) => p.evaluate(async ([src, arg]) => { try { await (new Function('fs', 'arg', 'return (' + src + ')(fs, arg)'))(G.DB.fb.fs, arg); return 'allowed'; } catch (e) { return e.code || String(e); } }, [fn.toString(), arg]);
const cli = (...a) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'requests.cjs'), '--project', 'demo-ps', ...a],
  { encoding: 'utf8', env: Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }) }));
const chip = p => p.evaluate(() => (document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent || '');

(async () => {
  const { rules, artist: ARTIST_UID, injected } = rulesAndArtist();
  console.log(`Artist uid for the rules: ${ARTIST_UID}${injected ? ' (test uid put into the rules copy: the real staff() list has only the admin)' : ' (from firestore.rules)'}`);
  const emu = await emulator();
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--mute-audio', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] });
  let created = [];
  try {
    await emulatorRules(rules);
    await account(ADMIN_UID, ADMIN_NAME);
    await account(ARTIST_UID, ARTIST_NAME);
    // Threads from earlier runs would confuse the counts: gone before any page loads.
    for (const t of cli('--list').threads) cli('--delete', t.id);
    const adm = await player(browser, ARTIST_UID, ADMIN_NAME, true);
    const art = await player(browser, ARTIST_UID, ARTIST_NAME, true);
    const ply = await player(browser, ARTIST_UID, 'rqp' + tag, false);
    check(adm.uid === ADMIN_UID && art.uid === ARTIST_UID, 'the admin and the artist signed in with the staff uids', [adm.uid, art.uid]);

    // ---------------- 1. who ----------------
    console.log('1. Who sees what');
    check(await settle(art, () => getComputedStyle(document.getElementById('rq-btn')).display !== 'none'), 'the artist has the REQUESTS button');
    check(await settle(adm, () => getComputedStyle(document.getElementById('adm-btn')).display !== 'none') && !(await shown(adm, '#rq-btn')), 'the admin has ADMIN, not REQUESTS');
    check(!(await shown(ply, '#rq-btn')) && !(await shown(ply, '#adm-btn')), 'a player has neither');
    await ply.evaluate(() => G.Requests.open());
    check(await ply.evaluate(() => !G.Requests.isOpen()), 'a player can\'t open the window');
    check(await tryFs(ply, async fs => fs.collection('req').get()) === 'permission-denied', 'a player can\'t read the requests');
    check(await tryFs(ply, async fs => fs.collection('req').add({ by: G.DB.fb.uid, n: 'x', k: 'c', t: 'hi', st: 'new', lb: G.DB.fb.uid,
      at: firebase.firestore.FieldValue.serverTimestamp(), up: firebase.firestore.FieldValue.serverTimestamp() })) === 'permission-denied', 'nor create one');

    // ---------------- 2. the artist writes a request with a picture ----------------
    console.log('2. A change request with a picture');
    await art.click('#rq-btn');
    check(await settle(art, () => G.Requests.isOpen()), 'the window opens from the button');
    await art.click('#rq [data-a=new]');
    await art.fill('#rq-text', 'The Rattata idle sprite looks off.\nIts tail is clipped on the right side.');
    const png = await adm.screenshot();                       // a real PNG, 1280x800
    await art.setInputFiles('#rq-file', { name: 'shot.png', mimeType: 'image/png', buffer: png });
    check(await settle(art, () => document.querySelectorAll('#rq-dpics img').length === 1, null, 15000), 'the picture is attached and shown');
    await shot(art, 'rq-new');
    await art.click('#rq-send');
    check(await settle(art, () => G.Requests.current && document.querySelector('#rq-thread .rq-msg'), null, 15000), 'sent: the thread opens');
    const id = await art.evaluate(() => G.Requests.current);
    created.push(id);
    const d1 = await doc(adm, id);
    check(!!d1 && d1.st === 'new' && d1.by === ARTIST_UID && d1.k === 'c' && d1.lb === ARTIST_UID, 'one document, status new, by the artist', d1 && { st: d1.st, by: d1.by, k: d1.k });
    check(!!d1 && d1.picLen.length === 1 && d1.picLen[0] <= 300000 && /^data:image\/jpeg;base64,/.test(d1.pics[0]), 'the picture is a JPEG data URL under 300 KB', d1 && d1.picLen);

    // ---------------- 3. the admin's badge and window ----------------
    console.log('3. The admin sees it');
    await adm.evaluate(() => G.Requests.check());
    check(await settle(adm, () => G.Requests.unread === 1, null, 10000), 'one unread for the admin');
    await adm.keyboard.press('Backquote');
    check(await settle(adm, () => document.getElementById('adm-requests').textContent === 'Requests (1)'), 'the admin menu says "Requests (1)"',
      await adm.evaluate(() => document.getElementById('adm-requests').textContent));
    await adm.click('#adm-requests');
    check(await settle(adm, () => G.Requests.isOpen() && document.querySelector('#rq .rq-row.unread')), 'the window opens with the row unread');
    await adm.click('#rq .rq-row');
    check(await settle(adm, () => G.Requests.current && G.Requests.unread === 0 && !document.querySelector('#rq .rq-row.unread')), 'opening the thread clears the unread');
    check(await settle(adm, () => document.querySelectorAll('#rq-thread .rq-msg .rq-pics img').length === 1), 'the picture shows in the thread');
    check(await adm.evaluate(() => document.getElementById('adm-requests').textContent === 'Requests'), 'the badge is gone');
    await shot(adm, 'rq-admin-thread');

    // ---------------- 4. the watcher ----------------
    console.log('4. The watcher (fork/requests.cjs)');
    const poll = cli();
    const it = poll.items.find(x => x.id === id);
    check(!!it && it.status === 'new' && it.kind === 'change' && /Rattata/.test(it.text) && it.name === ARTIST_NAME, 'the thread is waiting, with its text and name', it && { status: it.status, kind: it.kind, name: it.name });
    check(!!it && it.pics.length === 1 && fs.existsSync(it.pics[0]) && fs.readFileSync(it.pics[0]).slice(0, 2).toString('hex') === 'ffd8', 'the picture is saved as a JPEG file', it && it.pics);
    const found = cli('--find', ARTIST_NAME);
    check(found.found.length === 1 && found.found[0].uid === ARTIST_UID, '--find gives the artist\'s uid by nickname', found.found);
    cli('--claim', id, '--text', 'On it.');
    check(await settle(art, () => /Working on it/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent) &&
      [...document.querySelectorAll('#rq-thread .rq-msg.claude .txt')].some(e => e.textContent === 'On it.')), 'the artist sees "Working on it" and the message live');
    const msgFile = path.join(require('os').tmpdir(), 'rq-msg-' + tag + '.txt');
    fs.writeFileSync(msgFile, 'Fixed the tail. Is the shadow right too?\nLook at the sprite in the menu.');
    cli('--reply', id, '--file', msgFile, '--commit', 'abc1234', '--status', 'ask');
    check(await settle(art, () => /Waiting on you/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent) &&
      !!document.querySelector('#rq-thread .rq-msg.claude .c a[href$="abc1234"]')), 'the artist sees "Waiting on you" with the commit linked');
    check(await art.evaluate(() => [...document.querySelectorAll('#rq-thread .rq-msg.claude .txt')].some(e => /shadow right too\?\nLook at/.test(e.textContent))), 'the reply kept its line break');
    await art.fill('#rq-rtext', 'Yes, the shadow is fine now.');
    await art.click('#rq-reply');
    check(await settle(art, () => /^New$/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent) &&
      [...document.querySelectorAll('#rq-thread .rq-msg.mine .txt')].some(e => /shadow is fine/.test(e.textContent))), 'the artist\'s answer sets it back to New');
    // The artist's screen shows it before the server has it: wait for the server's copy (what the watcher reads).
    let d2 = null;
    for (let i = 0; i < 40 && !(d2 && d2.status === 'new'); i++) { await sleep(250); d2 = cli('--show', id); }
    check(!!d2 && d2.status === 'new' && d2.lastBy === ARTIST_UID && d2.thread.some(m => /shadow is fine/.test(m.text)), 'on the server too, with the answer', d2 && { st: d2.status, lb: d2.lastBy });
    const r = cli('--reply', id, '--text', 'Done, thanks.', '--commit', 'deadbee', '--status', 'done');
    check(r.status === 'done' && r.posted, '--reply --status done', r);
    check(await settle(art, () => /^Done$/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent)), 'the artist sees Done');
    check(await art.evaluate(() => !document.querySelector('#rq .rq-row')), 'the Open filter no longer lists it');
    await art.click('#rq [data-a=filter][data-v=done]');
    check(await art.evaluate(id => !!document.querySelector(`#rq .rq-row[data-v="${id}"]`), id), 'the Done filter does');
    await art.click('#rq [data-a=filter][data-v=open]');
    cli('--watch-start', 'job-test');
    const pl = cli('--poll');
    check(pl.watch && pl.watch.polls === 1 && !pl.stop && pl.items.length === 0, '--poll under a watch counts an empty poll and goes on', pl.watch);
    cli('--watch-end');
    check(cli('--poll').stop === true, 'without a watch --poll says stop');
    check(cli('--ping').threads >= 1, '--ping counts the threads');

    // ---------------- 5. rules ----------------
    console.log('5. Rules');
    // Denied writes from the SDK are applied to the page's own cache first and rolled back when the server
    // says no (a deleted thread would close the artist's view for a moment): a second artist page makes them.
    const art2 = await player(browser, ARTIST_UID, ARTIST_NAME, true);
    await art.click('#rq [data-a=new]');
    await art.fill('#rq-text', 'Can Rattata get a hat?');
    await art.click('#rq input[name=rq-kind][value=q]');
    await art.click('#rq-send');
    await settle(art, id => G.Requests.current && G.Requests.current !== id && document.querySelector('#rq-thread .rq-msg'), id, 15000);
    const id2 = await art.evaluate(() => G.Requests.current);
    created.push(id2);
    check(id2 && id2 !== id && (await doc(adm, id2)).k === 'q', 'a question is its own thread', id2);
    check(await tryFs(art2, async (fs, id) => fs.collection('req').doc(id).update({ st: 'done', up: firebase.firestore.FieldValue.serverTimestamp(), lb: G.DB.fb.uid }), id2) === 'permission-denied', 'the artist can\'t set done');
    check(await tryFs(art2, async (fs, [id, adm]) => fs.collection('req').doc(id).collection('m').add({ by: adm, n: 'x', t: 'hi', at: firebase.firestore.FieldValue.serverTimestamp() }), [id2, ADMIN_UID]) === 'permission-denied', 'nor post as someone else');
    check(await tryFs(art2, async (fs, [id, adm]) => fs.collection('req').doc(id).collection('m').add({ by: 'claude', n: 'Claude', t: 'hi', at: firebase.firestore.FieldValue.serverTimestamp() }), [id2, ADMIN_UID]) === 'permission-denied', 'nor as Claude');
    check(await tryFs(art2, async (fs, adm) => fs.collection('req').add({ by: adm, n: 'x', k: 'c', t: 'hi', st: 'new', lb: adm,
      at: firebase.firestore.FieldValue.serverTimestamp(), up: firebase.firestore.FieldValue.serverTimestamp() }), ADMIN_UID) === 'permission-denied', 'nor write a request as someone else');
    check(await tryFs(art2, async (fs, id) => fs.collection('req').doc(id).update({ t: 'changed', up: firebase.firestore.FieldValue.serverTimestamp(), lb: G.DB.fb.uid }), id2) === 'permission-denied', 'nor edit the text afterwards');
    check(await tryFs(art2, async (fs, id) => fs.collection('req').doc(id).delete(), id2) === 'permission-denied', 'nor delete it');
    // The admin's status select.
    await adm.click('#rq [data-a=filter][data-v=open]');
    await adm.click(`#rq .rq-row[data-v="${id2}"]`);
    await adm.waitForSelector('#rq-status');
    await adm.selectOption('#rq-status', 'working');
    check(await settle(adm, async id => (await G.DB.fb.fs.collection('req').doc(id).get()).data().st === 'working', id2), 'the admin sets Working on it from the select');
    check(await settle(art, () => /Working on it/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent)), 'the artist sees it');
    check(await art.evaluate(() => !document.querySelector('#rq [data-a=closeit]')), 'no Close button once it\'s being worked on');
    await adm.selectOption('#rq-status', 'ask');
    check(await settle(art, () => !!document.querySelector('#rq [data-a=closeit]')), 'the Close button is back when it waits on the artist');
    await art.click('#rq [data-a=closeit]');
    check(await settle(art, () => /^Closed$/.test((document.querySelector('#rq-main .rq-head .rq-st') || {}).textContent)), 'the artist closes their own request');
    check((await doc(adm, id2)).st === 'closed', 'closed in Firestore');
    check(await tryFs(art2, async (fs, id) => fs.collection('req').doc(id).update({ st: 'new', up: firebase.firestore.FieldValue.serverTimestamp(), lb: G.DB.fb.uid }), id2) === 'permission-denied', 'and can\'t reopen it');

    // ---------------- 6. a phone ----------------
    console.log('6. A phone');
    // Signed in, opened and listed in one go, before the panel's once-a-second sign-in check has seen the new
    // account; that check then runs with the list on screen and must leave it and the thread alone. (One run of
    // this check failed here once, a row tapped that opened no thread; never made to fail again.)
    const ph = await page(browser, ARTIST_UID, { width: 390, height: 800 });
    ph.name = 'phone';
    const at = await ph.evaluate(async ([n, pw, id]) => {
      const r = await G.DB.login(n, pw);
      G.Requests.open();
      document.querySelector('#rq [data-a=filter][data-v=all]').click();
      const t0 = performance.now();
      while (!document.querySelector(`#rq .rq-row[data-v="${id}"]`) && performance.now() - t0 < 10000) await new Promise(r => setTimeout(r, 20));
      return { ok: r.ok && G.Requests.isOpen(), rows: performance.now() - t0 | 0 };
    }, [ARTIST_NAME, PASS, id]);
    check(at.ok, 'signed in, opened and listed at once', at);
    await ph.waitForTimeout(1500);                // the sign-in check runs while the list is on screen
    await ph.click(`#rq .rq-row[data-v="${id}"]`);
    check(await settle(ph, () => getComputedStyle(document.querySelector('#rq .rq-list')).display === 'none' && getComputedStyle(document.querySelector('#rq .rq-back')).display !== 'none'), 'the thread alone, with Back');
    // The window was opened straight after signing in, before the once-a-second sign-in check had run: it
    // used to empty the list then, and the next update (changes only) left the open thread out, closing it.
    await ph.waitForTimeout(2500);
    check(await ph.evaluate(id => G.Requests.current === id && document.getElementById('rq').classList.contains('in-thread'), id), 'the thread stays open past the sign-in check');
    const fit = await ph.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: document.getElementById('rq').getBoundingClientRect().width, main: document.getElementById('rq-main').scrollWidth }));
    check(fit.sw <= 390 && fit.w <= 390 && fit.main <= 390, 'it fits the width', fit);
    await shot(ph, 'rq-phone');
    await ph.click('#rq .rq-back');
    check(await settle(ph, () => getComputedStyle(document.querySelector('#rq .rq-main')).display === 'none'), 'Back to the list');
    await ph.keyboard.press('Escape');
    check(await settle(ph, () => !G.Requests.isOpen()), 'Esc closes');

    for (const p of [adm, art, art2, ply, ph]) check(!p.errs.length, (p.name || '?') + ': no page errors', p.errs.slice(0, 3));
    // Leave the emulator clean.
    for (const id of created) cli('--delete', id);
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
    stopEmulator(emu);
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
