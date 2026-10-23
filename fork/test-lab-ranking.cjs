#!/usr/bin/env node
// The Lab leaderboard (the Lab boards in js/net/ranking.js, routed by js/fork/lab/lab.js, the LAB
// switch in js/ui/ranking-ui.js), in headless Edge on dev.html against the Firebase emulator, so
// the real SDK and the real firestore.rules take every write (no real project is touched):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-lab-ranking.cjs [base-url]
//
// A new account with a nickname:
//   1. plays a real Lab run of 2:05 to the end (fake clock, no enemies, so it lasts as long as
//      asked and game.js's anti-cheat clean() sees a legal run): its time is on the Lab boards
//      (today, week, month, all-time: s_L...), the rules accepted them, none of the regular boards
//      has it, nor the Lab per-Pokémon one (under 5 min); the toast and the end screen say "Lab
//      leaderboard".
//   2. G.Ranking.submitSolo called as game.js calls it (through lab.js's wrapper; a real run costs
//      ~1.3 s per game second under the fake clock): in a Lab run, 5:05 goes on every Lab board,
//      all-time with its Pokémon too; in a normal one, 2:30 on the regular boards only.
//   3. group: G.Ranking.submitGroup in a Lab run goes to the Lab group boards (g_L...), in a
//      normal one to the regular ones (called directly: no second player here).
//   4. the leaderboard screen: LAB is off with Lab mode off and shows the regular boards; on, the
//      Lab ones (solo, group, all-time with a Pokémon), with the Lab note.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = (process.argv[2] || require('./pw.cjs').BASE).replace(/\/$/, '');
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const NAME = 'lr' + String(Date.now()).slice(-7), PASS = 'pw-' + NAME;
const FS = 'http://127.0.0.1:8080/v1/projects/demo-ps/databases/(default)/documents';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

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
/** Each board → the time `id` has on it (undefined if none). */
async function times(boards, id) {
  const out = {};
  for (const b of boards) out[b] = (await summary(b))[id];
  return out;
}

(async () => {
  const up = await fetch('http://127.0.0.1:8080/').then(r => r.ok, () => false);
  if (!up) { console.error('test-lab-ranking: the Firestore emulator is not on 127.0.0.1:8080 (see the top of this file)'); process.exit(1); }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
    const page = await ctx.newPage();
    await page.clock.install();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form');
    await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Lab && G.Ranking, null, { timeout: 30000 });

    const acct = await page.evaluate(async ([n, pw]) => {
      const r = await G.DB.register(n, pw);
      if (r.ok === false) return r;
      const st = await G.Social.start();
      const nick = st === 'ok' ? { ok: true } : await G.Social.claimNick(n);
      const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu();
      // Every toast, and the ranking submission's promise (outermost wrapper, after lab.js's).
      window.__toasts = [];
      const toast = G.UI.toast; G.UI.toast = function (t) { window.__toasts.push(String(t)); return toast.apply(this, arguments); };
      const sub = G.Ranking.submitSolo; G.Ranking.submitSolo = function () { return (window.__sub = sub.apply(this, arguments)); };
      return { ok: true, uid: G.DB.fb.uid, nick, me: G.Social.me && G.Social.me.name };
    }, [NAME, PASS]);
    check(acct.ok && acct.me === NAME, 'account on the emulator with its nickname', acct);
    const uid = acct.uid;
    const B = await page.evaluate(() => {
      const per = m => ['d', 'w', 'm', 'a'].map(p => G.Ranking.board(m, p));
      return { s: per('s'), ls: per('ls'), g: per('g'), lg: per('lg'),
               sP: G.Ranking.board('s', 'a', 4), lsP: G.Ranking.board('ls', 'a', 4) };
    });
    check(B.ls.every(b => /^s_L/.test(b)) && B.lg.every(b => /^g_L/.test(b)) && B.s.every(b => /^s_[^L]/.test(b)) && /^s_L.*_p4$/.test(B.lsP),
      'Lab boards are the regular ones with an L (s_L..., g_L...)', B);

    /** A real run of `secs` seconds (no enemies), ended by falling; → the submission's result. */
    async function play(lab, secs) {
      await page.evaluate(lab => { window.__sub = null; window.__toasts = []; G.Settings.set('lab', lab); G.UI.hideAll(); G.Flow.goMenu(); }, lab);
      await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
      await page.evaluate(() => { G.Spawner.update = () => {}; G.Game.player.invuln = 1e9; });
      await page.clock.runFor(secs * 1000);
      const info = await page.evaluate(() => ({ lab: G.Lab.active }));
      await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e12); });
      await page.waitForFunction(() => G.Game.state === 'over', null, { timeout: 20000 });
      info.better = await page.evaluate(async () => (window.__sub ? await window.__sub : 'not submitted'));
      info.toasts = await page.evaluate(() => window.__toasts.slice());
      await page.keyboard.press('Escape').catch(() => {});
      return info;
    }

    console.log('1. A real Lab run of 2:05');
    const lab = await play(true, 125);
    check(lab.lab && Array.isArray(lab.better) && lab.better.length > 0, 'it was a Lab run and it went up (game.js clean() passed)', lab.better);
    const labT = await times(B.ls, uid);
    check(Object.values(labT).every(t => t >= 120 && t <= 130), 'its time is on every Lab solo board', labT);
    check((await summary(B.lsP))[uid] === undefined, 'not on the Lab per-Pokémon board (under 5 min)');
    const regAfterLab = await times([...B.s, B.sP], uid);
    check(Object.values(regAfterLab).every(t => t === undefined), 'none of the regular boards has it', regAfterLab);
    check(lab.toasts.some(t => /New best .* on the Lab leaderboard!/.test(t)), 'the toast says "Lab leaderboard"', lab.toasts);
    const overNote = await page.evaluate(() => (document.querySelector('.lab-over') || {}).textContent || '');
    check(/Lab leaderboard/.test(overNote), 'the end screen\'s Lab note names the Lab leaderboard', overNote);

    console.log('2. Solo submissions (G.Ranking.submitSolo)');
    const solo = await page.evaluate(async () => {
      const go = async (on, t) => { G.Settings.set('lab', on); G.Lab.begin(null); return G.Ranking.submitSolo({ t, lv: 6, kills: 60, dex: 4, shiny: false }); };
      const a = await go(true, 305), b = await go(false, 150);
      return { a, b };
    });
    const labT2 = await times([...B.ls, B.lsP], uid);
    check(Object.values(labT2).every(t => t === 305), 'Lab, 5:05: on every Lab solo board, all-time with Charmander too', labT2);
    const regT = await times([...B.s, B.sP], uid);
    check(B.s.every(b => regT[b] === 150) && regT[B.sP] === undefined, 'normal, 2:30: on the regular solo boards (not the per-Pokémon one: under 5 min)', regT);

    console.log('3. Group (G.Ranking.submitGroup)');
    const group = await page.evaluate(async uid => {
      const members = [{ uid, name: G.Social.me.name, dex: 4, shiny: false }, { uid: 'zzOtherPlayer', name: 'Other', dex: 7, shiny: false }];
      const go = async (on, t) => { G.Settings.set('lab', on); G.Lab.begin(null); return G.Ranking.submitGroup({ t, lv: 5, kills: 40, members }); };
      const a = await go(true, 200), b = await go(false, 150);
      G.Settings.set('lab', false); G.Lab.begin(null);
      return { a, b, id: members.map(m => m.uid).sort().join('_') };
    }, uid);
    const gLab = await times(B.lg, group.id), gReg = await times(B.g, group.id);
    check(Object.values(gLab).every(t => t === 200), 'a Lab group run is on the Lab group boards', gLab);
    check(Object.values(gReg).every(t => t === 150), 'a normal one on the regular group boards', gReg);

    console.log('4. The leaderboard screen');
    const screen = async () => page.evaluate(() => ({
      lab: !!document.querySelector('#rk-mode .rk-lab.on'),
      note: !document.getElementById('rk-labnote').classList.contains('hidden'),
      times: [...document.querySelectorAll('#rk-list .rk-row .time')].map(e => e.textContent),
      me: document.getElementById('rk-me').textContent
    }));
    const settle = () => page.waitForFunction(() => !/Loading|Cargando/.test(document.getElementById('rk-list').textContent), null, { timeout: 15000 });
    await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); G.RankingUI.open(); });
    await page.waitForSelector('#scr-rank', { state: 'visible' }); await settle();
    const s0 = await screen();
    check(!s0.lab && !s0.note && s0.times.includes('2:30') && !s0.times.includes('5:05'), 'Lab mode off: LAB is off and the regular board shows (2:30)', s0);
    await page.click('#rk-mode .rk-lab'); await settle();
    const s1 = await screen();
    check(s1.lab && s1.note && s1.times.includes('5:05') && !s1.times.includes('2:30') && /Lab/.test(s1.me), 'LAB on: the Lab board (5:05), the note, "Lab" in your rank line', s1);
    await page.click('#rk-mode .gen-tab:first-child + .gen-tab'); await settle();
    const s2 = await screen();
    check(s2.lab && s2.times.includes('3:20') && !s2.times.includes('2:30'), 'Group with LAB on: the Lab group board (3:20)', s2);
    await page.click('#rk-mode .gen-tab:first-child'); await settle();
    await page.evaluate(() => { const i = document.getElementById('rk-poke'); i.value = G.T(G.DEX_BY[4].name); i.onchange(); }); await settle();
    const s3 = await screen();
    check(s3.lab && s3.times.includes('5:05'), 'all-time with Charmander, LAB on: the Lab run is there', s3);
    await page.click('#rk-mode .rk-lab'); await settle();
    const s4 = await screen();
    check(!s4.lab && !s4.note && !s4.times.length, 'LAB off, all-time with Charmander: nothing (the normal time was under 5 min)', s4);

    check(!errors.length, 'no page errors', errors.slice(0, 5));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
