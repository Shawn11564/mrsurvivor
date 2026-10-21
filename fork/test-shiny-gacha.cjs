#!/usr/bin/env node
// Shiny by default and the gacha odds (js/fork/shiny-pref.js, js/ui/menu.js, js/systems/gacha.js),
// in headless Edge on dev.html against the Firebase emulator (a real account, so the save
// survives a reload the way a player's does):
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   python -m http.server 8123          (in the repo root)
//   node fork/test-shiny-gacha.cjs [base-url]
//
//   1. The Pokémon screen opens a Pokémon you have the shiny of on Shiny; picking Normal is
//      remembered after a reload; choosing it as partner keeps that choice.
//   2. Getting your partner's shiny (as the gacha does: straight into save.shiny) switches you
//      to it at the menu; a partner you already played in Normal stays Normal.
//   3. Gacha: Legendary 0.15 % (odds screen and 200 000 real pulls), soft pity from pull 180
//      (+2 points a pull), pity at 220.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const NAME = 'sh' + String(Date.now()).slice(-7), PASS = 'pw-' + NAME;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function load(page, fresh) {
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  if (!fresh) {
    // A reload: the account signs itself back in, as it does for a player.
    await pastStart(page, '#scr-menu');
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.fb && G.ShinyPref, null, { timeout: 30000 });
    await page.evaluate(() => { for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click(); G.MenuUI.open(); });
    return;
  }
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.ShinyPref, null, { timeout: 30000 });
  await page.evaluate(async ([n, pw]) => {
    const r = await G.DB.register(n, pw);
    if (r.ok === false) throw new Error(JSON.stringify(r));
    const s = G.DB.save;
    for (const d of [4, 7, 25]) s.owned[d] = { at: Date.now(), from: 'test' };
    s.shiny[25] = { at: Date.now(), from: 'test' };
    s.partner = 4; s.partnerShiny = false;
    G.DB.commit();
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    G.MenuUI.open();
  }, [NAME, PASS]);
}
const detail = async (page, dex) => {
  // One-time notices (save your game, add a recovery email) are dismissed as a player would.
  await page.evaluate(() => {
    for (const id of ['scr-recover', 'scr-savenote']) document.getElementById(id).classList.add('hidden');
    try { localStorage.setItem('ps.recover.no.' + G.DB.fb.uid, '1'); } catch (e) { /* nada */ }
    G.MenuUI.open();
  });
  await page.click('#scr-menu [data-go="dex"]');
  await page.fill('#dex-q', String(dex));
  await page.waitForTimeout(300);
  await page.click('#dex-grid > * >> nth=0');
  return page.evaluate(() => document.getElementById('dex-big').classList.contains('shiny'));
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    console.log('1. Shiny by default, Normal remembered');
    await load(page, true);
    check(await detail(page, 25), 'Pikachu (shiny owned) opens on Shiny');
    check(!(await detail(page, 7)), 'Squirtle (no shiny) opens on Normal');
    await detail(page, 25);
    await page.click('#dex-detail .seg button[data-v="0"]');
    check(!(await detail(page, 25)), 'picking Normal sticks when coming back');
    await load(page, false);
    check(!(await detail(page, 25)), 'and after a reload');
    await page.click('#dex-detail .seg button[data-v="1"]');
    await page.click('#dex-pick');
    check(await page.evaluate(() => G.DB.save.partner === 25 && G.DB.save.partnerShiny), 'Shiny again, chosen as partner: plays shiny');
    await load(page, false);
    check(await page.evaluate(() => G.DB.save.partner === 25 && G.DB.save.partnerShiny), 'still shiny after a reload');
    check(await page.evaluate(() => document.querySelector('#menu-shiny button[data-v="1"]').classList.contains('on')), 'the menu switch says Shiny');

    console.log('2. Getting your partner\'s shiny');
    await page.evaluate(() => { const s = G.DB.save; s.partner = 7; s.partnerShiny = false; s.shiny[7] = { at: Date.now(), from: 'gacha' }; G.DB.commit(); G.MenuUI.open(); });
    check(await page.evaluate(() => G.DB.save.partnerShiny === true), 'new shiny of the partner: switched to Shiny at the menu');
    await page.click('#menu-shiny button[data-v="0"]');
    await load(page, false);
    check(await page.evaluate(() => G.DB.save.partnerShiny === false), 'Normal on the menu switch is kept after a reload');
    const old = await page.evaluate(() => {   // an older save: shiny owned, partner in Normal, no shinyOff yet
      const s = G.DB.save; delete s.shinyOff; s.partner = 25; s.partnerShiny = false; G.MenuUI.open(); return s.partnerShiny;
    });
    check(old === false, 'an existing save that played its partner in Normal stays Normal');

    console.log('3. Gacha');
    const g = await page.evaluate(() => ({ leg: G.Gacha.RATES.find(r => r[0] === 5)[1], total: G.Gacha.RATES.reduce((a, r) => a + r[1], 0), pity: G.Gacha.PITY_5 }));
    check(g.leg === 0.15 && Math.abs(g.total - 100) < 1e-9 && g.pity === 220, 'Legendary 0.15 %, rates add to 100 %, pity 220', g);
    await page.evaluate(() => G.GachaUI && G.GachaUI.open ? G.GachaUI.open() : document.querySelector('#scr-menu [data-go="gacha"]').click());
    const txt = await page.textContent('#gacha-rates');
    check(/0[.,]15\s*%/.test(txt) && /220/.test(txt) && /180/.test(txt), 'the odds screen says 0.15 %, 180 and 220', txt.replace(/\s+/g, ' ').slice(0, 160));
    const soft = await page.evaluate(() => [1, 179, 180, 181, 200, 219, 220].map(k => +G.Gacha.legendRate(k).toFixed(2)));
    check(JSON.stringify(soft) === JSON.stringify([0.15, 0.15, 2.15, 4.15, 42.15, 80.15, 100]), 'soft pity: 0.15 % up to pull 179, then +2 points a pull, 100 % at 220', soft);
    const at200 = await page.evaluate(() => {   // pull 200 on its own, many times: 42.15 % Legendary, the rest still adds up
      let leg = 0, epic = 0; const N = 20000;
      for (let i = 0; i < N; i++) {
        const s = JSON.parse(JSON.stringify(G.DB.save)); s.tickets = { t1: 1, t10: 0 }; s.pity = { 1: 199 };
        const r = G.Gacha.pull(s, 1, 1)[0].rarity; if (r === 5) leg++; if (r === 4) epic++;
      }
      return { leg: leg / N * 100, epic: epic / N * 100 };
    });
    // Epic shares what's left: 6.5 × (100 − 42.15) / 99.85 ≈ 3.77 %.
    check(at200.leg > 40.5 && at200.leg < 43.8 && at200.epic > 3.2 && at200.epic < 4.4, 'pull 200 without one: Legendary about 42 %, Epic shrinks in proportion', at200);
    await page.evaluate(() => { G.DB.save.pity = { 1: 199 }; G.GachaUI.open(); });
    const pityTxt = await page.textContent('#gacha-pity');
    check(/199 \/ 220/.test(pityTxt) && /42[.,]15\s*%/.test(pityTxt), "the pity line shows the next pull's Legendary chance", pityTxt);
    const sim = await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(G.DB.save)); s.tickets = { t1: 1e9, t10: 0 }; s.pity = {};
      let leg = 0, n = 0, maxRun = 0, run = 0, firstPity = null;
      for (let i = 0; i < 20000; i++) for (const r of G.Gacha.pull(s, 10, 1)) {
        n++; run++;
        if (r.rarity === 5) { leg++; maxRun = Math.max(maxRun, run); run = 0; }
      }
      return { n, leg, rate: leg / n * 100, maxRun };
    });
    // 0.15 % a pull with the soft pity from 180 and the hard one at 220 is 1/163.6 ≈ 0.61 %; the ×10's guaranteed
    // Epic+ roll (Legendary 0.15/6.65 of it, when the first 9 had none) brings it to ≈ 0.674 % (a Python model of
    // this code, 4 M pulls). One run of 200 000 varies by ±0.018 %: the bounds are about 5 of those.
    check(sim.n >= 200000 && sim.rate > 0.58 && sim.rate < 0.77, '200 000 pulls: Legendary about 0.67 % overall (0.15 % a pull + soft and hard pity + the ×10 guarantee)', sim);
    check(sim.maxRun <= 221, 'never more than 220 pulls in a row without one', sim.maxRun);
    const p = await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(G.DB.save)); s.tickets = { t1: 10, t10: 0 }; s.pity = { 1: 219 };
      const r = G.Gacha.pull(s, 1, 1)[0];
      return { rarity: r.rarity, after: s.pity[1] };
    });
    check(p.rarity === 5 && p.after === 0, 'pull 220 after 219 without one is Legendary, pity resets', p);
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll shiny/gacha checks passed');
  process.exit(failures ? 1 : 0);
})();
