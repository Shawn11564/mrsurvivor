// Promoted runs use regular boards; explicitly queued old Lab records stay in the archive.
// Real Firebase SDK + local emulators; never writes to the live project.
const assert = require('node:assert/strict');
const { chromium, pastStart, BASE } = require('./pw.cjs');
const EMU = `G.FIREBASE_CONFIG = {apiKey:'demo',projectId:'demo-ps',authDomain:'demo-ps.firebaseapp.com',appId:'demo',databaseURL:'http://127.0.0.1:9000?ns=demo-ps-default-rtdb',emulator:true};`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form');
    const result = await page.evaluate(async () => {
      const name = 'prom' + Date.now().toString(36);
      const registered = await G.DB.register(name, 'test-' + name);
      if (!registered.ok) throw new Error(JSON.stringify(registered));
      const st = await G.Social.start();
      if (st !== 'ok') await G.Social.claimNick(name);
      G.Settings.set('lab', false); G.Lab.begin(null);
      const solo = await G.Ranking.submitSolo({ t: 305, lv: 6, kills: 60, dex: 4, shiny: false });
      const archive = await G.Ranking.submitSolo({ t: 306, lv: 6, kills: 60, dex: 4, shiny: false, lab: true });
      const uid = G.DB.fb.uid;
      const members = [{ uid, name, dex: 4, shiny: false }, { uid: 'zzPromotionOther', name: 'Other', dex: 7, shiny: false }];
      const group = await G.Ranking.submitGroup({ t: 305, lv: 6, kills: 60, members });
      const db = firebase.firestore();
      const read = async (mode, id) => {
        const doc = await db.doc('lbs/' + G.Ranking.board(mode, 'a')).get();
        return doc.exists && doc.data().top[id]?.t;
      };
      let long;
      try { long = await G.Ranking.submitSolo({ t: 3600, lv: 60, kills: 6000, dex: 4, shiny: false }); }
      catch (e) { long = e.code || e.message; }
      let tooLong;
      try { tooLong = await G.Ranking.submitSolo({ t: 14401, lv: 60, kills: 6000, dex: 4, shiny: false }); }
      catch (e) { tooLong = e.code || e.message; }
      return { solo, group, archive, regular: await read('s', uid), old: await read('ls', uid),
        grouped: await read('g', members.map(m => m.uid).sort().join('_')), long, tooLong };
    });
    assert.ok(result.solo.length > 0 && result.group.length > 0 && result.archive.length > 0);
    assert.equal(result.old, 306, 'explicit historical Lab submission stays archived');
    assert.equal(result.grouped, 305, 'new group run uses regular boards');
    if (process.argv.includes('--current-rules')) {
      assert.equal(result.regular, 305, 'current server rules reject a one-hour regular run');
      console.log('PASS normal/archived routing; CONFIRMED current rules block endless regular runs');
    } else {
      assert.equal(result.regular, 3600, 'endless regular run is accepted by the deployed rules');
      console.log('PASS normal/archived routing and endless regular run');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
