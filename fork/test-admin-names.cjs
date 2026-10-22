#!/usr/bin/env node
// The admin menu (js/fork/admin.js) and the Player Manager (js/fork/player-manager.js) name things
// in the player's language, in headless Edge on dev.html in English (no emulator needed):
//
//   node fork/serve.cjs                 (in another terminal)
//   node fork/test-admin-names.cjs [base-url]
//
// Both windows are translate="no" (so the page's dictionary doesn't rewrite what the admin types), so
// names taken from the game's data, which is written in Spanish, came out in Spanish: the drop list
// said "Item: Cinta Elección" for Choice Band, and Type: Null was "Código Cero".
//   1. No data name in Spanish anywhere in the admin menu (text, options, values, titles): every held
//      item, Pokémon, move, nature and ability whose English differs.
//   2. The drop list: "Item: Choice Scarf" drops choicescarf, one entry per held item.
//   3. The Pokémon box takes the English name (and still the Spanish one): "Unlock Pokémon" with
//      "Type: Null" unlocks it and says so in English.
//   4. With the Firebase emulator running (else skipped): the Player Manager, opened by the admin on a
//      player whose partner is Type: Null, says "Type: Null" and never "Código Cero", and so does its list.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// Part 4, as fork/test-player-manager.cjs does it: the real rules, the admin with the owner's uid.
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const ADMIN_UID = 'TMD8t0i6jic7a1sg824ZP55TqOG3', ADMIN_NAME = 'pmadmin', ADMIN_PASS = 'pw-pmadmin';
const ROOT = require('path').join(__dirname, '..');
async function emulatorSetup() {
  const fs = require('fs'), path = require('path');
  let r = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-ps:securityRules', { method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') }] } }) });
  if (!r.ok) throw new Error('firestore rules: ' + r.status);
  r = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-ps-default-rtdb', { method: 'PUT',
    headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8') });
  if (!r.ok) throw new Error('database rules: ' + r.status);
  const email = Buffer.from(ADMIN_NAME).toString('hex') + '@jugadores.pokesurvivor.net';
  r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-ps/accounts', { method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: ADMIN_UID, email, password: ADMIN_PASS }) });
  if (!r.ok && !/DUPLICATE/.test(await r.text())) throw new Error('admin account: ' + r.status);
}
async function cloudPage(browser, name, login) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e)));
  await p.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(p, '#login-form');
  await p.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Social && G.PlayerManager, null, { timeout: 30000 });
  await p.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  const r = await p.evaluate(async ([name, login]) => {
    const reg = login ? await G.DB.login(name, login) : await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save;
    if (!s.partner) { s.partner = 772; s.starter = 772; s.owned[772] = { at: Date.now(), from: 'starter' }; G.DB.commit(); }
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    for (let i = 0; i < 5 && !document.getElementById('scr-savenote').classList.contains('hidden'); i++) document.getElementById('savenote-ok').click();
    await G.DB.flush();
    return { ok: true, uid: G.DB.fb.uid };
  }, [name, login]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  p.uid = r.uid;
  return p;
}
async function playerManager(browser) {
  await emulatorSetup();
  const pl = await cloudPage(browser, 'nul' + String(Date.now()).slice(-6));
  const adm = await cloudPage(browser, ADMIN_NAME, ADMIN_PASS);
  await adm.evaluate(() => G.PlayerManager.open());
  const row = `#pm .pm-row[data-u="${pl.uid}"] .who`;
  await adm.waitForSelector(row, { timeout: 20000 });
  await adm.click(row);
  await adm.waitForFunction(u => document.querySelector('#pm-main .pm-head') && G.PlayerManager.players.get(u).raw, pl.uid, { timeout: 10000 });
  await adm.waitForTimeout(500);
  const r = await adm.evaluate(() => {
    const t = document.getElementById('pm').innerText, titles = [...document.querySelectorAll('#pm [title]')].map(e => e.title);
    return { codigo: /Código Cero/.test(t) || titles.some(x => /Código Cero/.test(x)), typeNull: (t.match(/Type: Null/g) || []).length,
      dex: [...document.querySelectorAll('#pm-dex option')].map(o => o.value).filter(v => /#772$/.test(v)) };
  });
  check(!r.codigo && r.typeNull >= 2, 'the player\'s page: their partner and their Pokémon say "Type: Null", never "Código Cero"', r);
  check(r.dex.join() === 'Type: Null #772', 'the Player Manager\'s Pokémon list: "Type: Null #772"', r.dex);
  check(!pl.errs.length && !adm.errs.length, 'no page errors', [...pl.errs, ...adm.errs]);
  await pl.context().close(); await adm.context().close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.Items && G.Admin && G.PlayerManager && document.getElementById('adm'), null, { timeout: 30000 });
    await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    check(await page.evaluate(() => G.I18n.lang) === 'en', 'the game is in English');

    const r = await page.evaluate(() => {
      // Every data name whose English differs: Spanish -> English.
      const es = {};
      const add = n => { if (typeof n === 'string' && n && G.T(n) !== n) es[n] = G.T(n); };
      G.Items.LIST.forEach(i => add(i.name));
      G.DEX.forEach(p => add(p.name));
      Object.values(G.Moves.BY || G.Moves).forEach(m => m && add(m.name));
      (G.NATURES || []).forEach(n => add(n.name));
      Object.values(G.ABIL || {}).forEach(a => a && add(a.name));
      // Everything the two windows show or hold.
      const texts = [];
      for (const id of ['adm', 'pm']) {
        const root = document.getElementById(id);
        if (!root) continue;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (n.nodeType === 3) { if (n.nodeValue.trim()) texts.push([id, n.nodeValue.trim()]); continue; }
          for (const a of ['value', 'title', 'placeholder', 'label']) { const v = n.getAttribute(a); if (v) texts.push([id, v]); }
        }
      }
      const hit = (s, n) => new RegExp('(^|[^\\p{L}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'u').test(s);
      const spanish = [];
      for (const [id, s] of texts) for (const n of Object.keys(es)) if (es[n].toLowerCase() !== n.toLowerCase() && hit(s, n)) spanish.push(id + ': "' + s.slice(0, 60) + '" has ' + n);
      const sel = document.getElementById('adm-drop'), kinds = document.getElementById('adm').dropKinds;
      const drop = [...sel.options].map(o => [o.textContent, kinds[+o.value][2]]);
      const nul = G.DEX.find(p => p.name === 'Código Cero');
      return { n: Object.keys(es).length, items: G.Items.LIST.length, spanish: spanish.slice(0, 15), nSpanish: spanish.length, drop, nul: nul && nul.dex,
        admDex: [...document.querySelectorAll('#adm-dex option')].map(o => o.value).filter(v => /#772$/.test(v))};
    });
    console.log('1. Names in the admin menu (' + r.n + ' data names differ in English)');
    check(r.nSpanish === 0, 'no Spanish data name in the admin menu', r.spanish);
    check(r.admDex.join() === 'Type: Null #772', 'the admin menu\'s Pokémon list: "Type: Null #772"', r.admDex);

    console.log('2. The drop list');
    const items = r.drop.filter(([t]) => t.startsWith('Item: ') && t !== 'Item: Mega Stone');
    check(items.length === r.items, 'one entry per held item (' + r.items + ')', items.map(i => i[0]));
    check(r.drop.some(([t, id]) => t === 'Item: Choice Scarf' && id === 'choicescarf') && r.drop.some(([t, id]) => t === 'Item: Choice Band' && id === 'choiceband'),
      '"Item: Choice Scarf" drops the Choice Scarf, "Item: Choice Band" the Choice Band', r.drop.filter(([t]) => /Choice/.test(t)));

    console.log('3. The Pokémon box takes the English name');
    const un = await page.evaluate(nul => {
      const toasts = [], ot = G.UI.toast;
      G.UI.toast = (m, ...a) => { toasts.push(m); return ot.call(G.UI, m, ...a); };
      const out = {};
      for (const name of ['Type: Null', 'código cero']) {
        if (G.DB.save.owned) delete G.DB.save.owned[nul];
        document.getElementById('adm-mon').value = name;
        document.querySelector('#adm [data-do="own"]').click();
        out[name] = G.DB.owns(nul);
      }
      G.UI.toast = ot;
      return { out, toasts };
    }, r.nul);
    check(un.out['Type: Null'] && un.out['código cero'], '"Type: Null" (and "código cero") unlocks #772', un);
    check(un.toasts[0] === 'Unlocked Type: Null', 'the message says "Unlocked Type: Null"', un.toasts);
    check(!errs.length, 'no page errors', errs);
    await ctx.close();

    console.log('4. The Player Manager with a player who has Type: Null (Firebase emulator)');
    if (!await fetch('http://127.0.0.1:9099/').then(r => r.ok, () => false)) {
      console.log('  SKIP no emulator (npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database)');
    } else await playerManager(browser);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll admin naming checks passed');
  process.exit(failures ? 1 : 0);
})();
