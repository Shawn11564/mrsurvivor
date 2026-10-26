#!/usr/bin/env node
// Lab mode's leaderboard (js/net/ranking.js modes 'ls' / 'lg', js/fork/lab/worlds.js, js/ui/ranking-ui.js), on the
// Firebase emulator with the real SDK and rules; never writes to the live project.
//
//   node fork/serve.cjs
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/test-lab-mode-ranking.cjs [base-url]
//
//   1. A Lab mode run's time (the run's own submission, without saying lab) lands on the Lab boards only.
//   2. A run without Lab mode lands on the regular boards only; a group Lab mode run on the Lab group boards.
//   3. A record queued with lab (js/fork/run-record.js) keeps it when sent from the menu.
//   4. The Leaderboard screen: its LAB switch starts as your Lab mode setting and shows your Lab time; off, the
//      regular time. With Lab mode off it starts off.
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
      const name = 'lbm' + Date.now().toString(36);
      const reg = await G.DB.register(name, 'pw-' + name);
      if (!reg.ok) throw new Error(JSON.stringify(reg));
      const s = G.DB.save; s.partner = 4; s.owned[4] = { at: Date.now() }; G.DB.commit();
      const st = await G.Social.start();
      if (st !== 'ok') await G.Social.claimNick(name);
      G.Flow.afterLogin();
      for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
      const uid = G.DB.fb.uid, db = firebase.firestore();
      const read = async (mode, id = uid) => { const d = await db.doc('lbs/' + G.Ranking.board(mode, 'a')).get(); return (d.exists && d.data().top[id] && d.data().top[id].t) || 0; };
      const start = on => { G.Settings.set('worlds', on); G.UI.hideAll(); G.Game.toUI(); G.Game.startRun(null, { dex: 4, shiny: false }); };
      // 1. A Lab mode run sends its time (as game.js does: no lab in the record).
      start(true);
      await new Promise(res => setTimeout(res, 500));
      await G.Ranking.submitSolo({ t: 401, lv: 8, kills: 80, dex: 4, shiny: false });
      const one = { lab: await read('ls'), reg: await read('s'), board: G.Ranking.board('ls', 'a') };
      // 2. Without Lab mode, and a group Lab mode run.
      G.Game.quit(); start(false);
      await new Promise(res => setTimeout(res, 500));
      await G.Ranking.submitSolo({ t: 302, lv: 7, kills: 70, dex: 4, shiny: false });
      const two = { lab: await read('ls'), reg: await read('s') };
      G.Game.quit(); start(true);
      await new Promise(res => setTimeout(res, 500));
      const members = [{ uid, name, dex: 4, shiny: false }, { uid: 'zzLabModeOther', name: 'Other', dex: 7, shiny: false }];
      await G.Ranking.submitGroup({ t: 333, lv: 7, kills: 70, members });
      const gid = members.map(m => m.uid).sort().join('_');
      const grp = { lab: await read('lg', gid), reg: await read('g', gid) };
      G.Game.quit(); G.Game.toUI();
      // 3. A queued record from the menu says which it was.
      await G.Ranking.submitSolo({ t: 455, lv: 9, kills: 90, dex: 4, shiny: false, lab: true });
      await G.Ranking.submitSolo({ t: 320, lv: 9, kills: 90, dex: 4, shiny: false, lab: false });
      const three = { lab: await read('ls'), reg: await read('s') };
      return { one, two, grp, three };
    });
    console.log('1-3. Routing');
    check(r.one.lab === 401 && r.one.reg === 0 && /^s_L/.test(r.one.board), 'a Lab mode run lands on the Lab boards only (s_L...)', r.one);
    check(r.two.reg === 302 && r.two.lab === 401, 'a run without Lab mode lands on the regular boards only', r.two);
    check(r.grp.lab === 333 && r.grp.reg === 0, 'a group Lab mode run lands on the Lab group boards', r.grp);
    check(r.three.lab === 455 && r.three.reg === 320, 'records sent from the menu keep their own lab', r.three);

    console.log('4. The Leaderboard screen');
    await page.evaluate(() => G.Settings.set('worlds', true));
    await page.evaluate(() => G.RankingUI.open());
    await page.waitForSelector('#rk-lab', { timeout: 8000 });
    const all = await page.$$('#rk-period .chip');
    await all[all.length - 1].click();
    await page.waitForFunction(() => /7:35/.test(document.getElementById('rk-list').innerText), null, { timeout: 8000 }).catch(() => {});
    const s1 = await page.evaluate(() => ({ on: document.getElementById('rk-lab').classList.contains('on'), label: document.getElementById('rk-lab').textContent.trim(),
      list: document.getElementById('rk-list').innerText, note: !document.getElementById('rk-labnote').classList.contains('hidden') && document.getElementById('rk-labnote').textContent }));
    check(s1.on && s1.label === 'LAB' && /7:35/.test(s1.list) && !/5:20/.test(s1.list) && /Lab leaderboard/.test(s1.note || ''),
      'with Lab mode on, the LAB switch starts on: your Lab 7:35 and the Lab leaderboard note', Object.assign({}, s1, { list: s1.list.slice(0, 100) }));
    await page.click('#rk-lab');
    await page.waitForFunction(() => /5:20/.test(document.getElementById('rk-list').innerText), null, { timeout: 8000 }).catch(() => {});
    const reg = await page.$eval('#rk-list', e => e.innerText);
    check(/5:20/.test(reg) && !/7:35/.test(reg), 'switched off: the regular 5:20, not the Lab time', reg.slice(0, 100));
    check(!page.errs.length, 'no page errors', page.errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab mode leaderboard checks passed');
  process.exit(failures ? 1 : 0);
})();
