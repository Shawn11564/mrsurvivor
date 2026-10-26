#!/usr/bin/env node
// Mutual requests work even before either lazy friendship listener has loaded.
// Run with the local Firebase emulators and `node fork/serve.cjs`.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');
const EMU = `G.FIREBASE_CONFIG={apiKey:'demo',projectId:'demo-ps',authDomain:'demo-ps.firebaseapp.com',appId:'demo',databaseURL:'http://127.0.0.1:9000?ns=demo-ps-default-rtdb',emulator:true};`;

async function account(browser, prefix, errors) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.stack || String(e)));
  await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  await page.addInitScript(() => { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  const who = await page.evaluate(async prefix => {
    const name = prefix + Date.now().toString(36), r = await G.DB.register(name, 'pw-' + name);
    if (!r.ok) throw Error(JSON.stringify(r));
    localStorage.setItem('ps.recover.no.' + G.DB.fb.uid, '1');
    if (await G.Social.start() !== 'ok' && !(await G.Social.claimNick(name)).ok) throw Error('nickname setup failed');
    G.DB.save.owned[4] = { at: Date.now() }; G.DB.save.partner = G.DB.save.starter = 4;
    G.Flow.goMenu();
    return { uid: G.DB.fb.uid, name };
  }, prefix);
  return { ctx, page, ...who };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const errors = [];
  try {
    const a = await account(browser, 'friendA', errors), b = await account(browser, 'friendB', errors);
    const first = await a.page.evaluate(name => G.Social.request(name), b.name);
    assert.equal(first.ok, true, first.error);
    // Neither account opened the Friends screen, so neither has loaded friendships.
    assert.deepEqual(await b.page.evaluate(() => G.Social.friends), []);
    const reverse = await b.page.evaluate(name => G.Social.request(name), a.name);
    assert.equal(reverse.ok, true, reverse.error);
    const id = [a.uid, b.uid].sort().join('_');
    const result = await a.page.evaluate(async id => {
      const d = (await G.DB.fb.fs.collection('friendships').doc(id).get()).data();
      return { status: d.status, from: d.from, to: d.to };
    }, id);
    assert.equal(result.status, 'ok', 'the reverse request accepts the pending friendship');
    const duplicate = await a.page.evaluate(name => G.Social.request(name), b.name);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error, 'Ya sois amigos.');
    await a.page.evaluate(id => G.DB.fb.fs.collection('friendships').doc(id).delete(), id);
    const sent = await a.page.evaluate(name => G.Social.request(name), b.name);
    assert.equal(sent.ok, true, sent.error);
    await b.page.evaluate(() => G.Social.ensureFriends());
    await b.page.waitForFunction(uid => G.Social.friends.some(f => f.uid === uid && f.status === 'in'), a.uid);
    const accepted = await b.page.evaluate(uid => G.Social.accept(uid), a.uid);
    assert.equal(accepted.ok, true, accepted.error);
    await Promise.all([a.page.evaluate(() => G.Social.ensureFriends()), b.page.evaluate(() => G.Social.ensureFriends())]);
    await Promise.all([a.page.waitForFunction(uid => G.Social.friends.some(f => f.uid === uid && f.status === 'ok'), b.uid),
      b.page.waitForFunction(uid => G.Social.friends.some(f => f.uid === uid && f.status === 'ok'), a.uid)]);
    assert.deepEqual(errors, []);
    console.log('PASS mutual requests before opening Friends, duplicate requests, normal acceptance and both friend lists');
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
