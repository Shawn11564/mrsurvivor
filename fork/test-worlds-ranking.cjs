#!/usr/bin/env node
// World 2 boards (js/net/ranking.js modes 'ws' / 'wg', js/fork/lab/worlds.js, js/ui/ranking-ui.js), on the Firebase
// emulator with the real SDK and rules; never writes to the live project.
//
//   node fork/serve.cjs
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/test-worlds-ranking.cjs [base-url]
//
//   1. A World 2 run's time (the run's own submission, without saying w2) lands on the World 2 boards only.
//   2. A run without the switch lands on the regular boards only; a group World 2 run on the World 2 group boards.
//   3. A record queued with w2 (js/fork/run-record.js) keeps it when sent from the menu.
//   4. The Leaderboard screen: the World 2 button shows your World 2 time, the regular view the other.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 750 } });
    await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    await ctx.addInitScript(() => { try { localStorage.setItem('ps.lang', 'en'); localStorage.removeItem('ms.runrec'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form');
    await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.Worlds, null, { timeout: 30000 });
    const r = await page.evaluate(async () => {
      const name = 'w2r' + Date.now().toString(36);
      const reg = await G.DB.register(name, 'pw-' + name);
      if (!reg.ok) throw new Error(JSON.stringify(reg));
      const s = G.DB.save; s.partner = 4; s.owned[4] = { at: Date.now() }; G.DB.commit();
      const st = await G.Social.start();
      if (st !== 'ok') await G.Social.claimNick(name);
      G.Flow.afterLogin();
      for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
      const uid = G.DB.fb.uid, db = firebase.firestore();
      const read = async (mode, id = uid) => { const d = await db.doc('lbs/' + G.Ranking.board(mode, 'a')).get(); return (d.exists && d.data().top[id] && d.data().top[id].t) || 0; };
      const start = w => { G.Settings.set('worlds', w); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); };
      // 1. A World 2 run sends its time (as game.js does: no w2 in the record).
      start(true);
      await new Promise(res => setTimeout(res, 500));
      await G.Ranking.submitSolo({ t: 401, lv: 8, kills: 80, dex: 4, shiny: false });
      const one = { w2: await read('ws'), reg: await read('s'), board: G.Ranking.board('ws', 'a') };
      // 2. Without the switch, and a group World 2 run.
      G.Game.quit(); start(false);
      await new Promise(res => setTimeout(res, 500));
      await G.Ranking.submitSolo({ t: 302, lv: 7, kills: 70, dex: 4, shiny: false });
      const two = { w2: await read('ws'), reg: await read('s') };
      G.Game.quit(); start(true);
      await new Promise(res => setTimeout(res, 500));
      const members = [{ uid, name, dex: 4, shiny: false }, { uid: 'zzWorlds2Other', name: 'Other', dex: 7, shiny: false }];
      await G.Ranking.submitGroup({ t: 333, lv: 7, kills: 70, members });
      const gid = members.map(m => m.uid).sort().join('_');
      const grp = { w2: await read('wg', gid), reg: await read('g', gid) };
      G.Game.quit(); G.Game.toUI();
      // 3. A queued record from the menu says which it was.
      await G.Ranking.submitSolo({ t: 455, lv: 9, kills: 90, dex: 4, shiny: false, w2: true });
      await G.Ranking.submitSolo({ t: 320, lv: 9, kills: 90, dex: 4, shiny: false, w2: false });
      const three = { w2: await read('ws'), reg: await read('s') };
      return { one, two, grp, three };
    });
    console.log('1-3. Routing');
    check(r.one.w2 === 401 && r.one.reg === 0 && /^s_W/.test(r.one.board), 'a World 2 run lands on the World 2 boards only (s_W...)', r.one);
    check(r.two.reg === 302 && r.two.w2 === 401, 'a run without the switch lands on the regular boards only', r.two);
    check(r.grp.w2 === 333 && r.grp.reg === 0, 'a group World 2 run lands on the World 2 group boards', r.grp);
    check(r.three.w2 === 455 && r.three.reg === 320, 'records sent from the menu keep their own w2', r.three);

    console.log('4. The Leaderboard screen');
    await page.evaluate(() => G.RankingUI.open());
    await page.waitForSelector('#rk-w2', { timeout: 8000 });
    const all = await page.$$('#rk-period .chip');
    await all[all.length - 1].click();
    await page.waitForTimeout(1500);
    const regText = await page.$eval('#rk-list', e => e.innerText);
    await page.click('#rk-w2');
    await page.waitForFunction(() => /7:35/.test(document.getElementById('rk-list').innerText), null, { timeout: 8000 }).catch(() => {});
    const w2Text = await page.$eval('#rk-list', e => e.innerText);
    const note = await page.$eval('#rk-labnote', e => !e.classList.contains('hidden') && e.textContent);
    check(/5:20/.test(regText) && !/7:35/.test(regText), 'all-time regular view: your 5:20, not the World 2 time', regText.slice(0, 120));
    check(/7:35/.test(w2Text) && !/5:20/.test(w2Text) && /World 2/.test(note || ''), 'the World 2 button: your 7:35 and its note', { w2Text: w2Text.slice(0, 120), note });
    check(!page.errs.length, 'no page errors', page.errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll World 2 leaderboard checks passed');
  process.exit(failures ? 1 : 0);
})();
