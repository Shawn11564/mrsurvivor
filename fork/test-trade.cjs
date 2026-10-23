#!/usr/bin/env node
// Trading Pokémon between friends (js/fork/trade.js, js/fork/trade-ui.js, firestore.rules "trading"),
// two real players in headless Edge on the Firebase emulator:
//
//   npx firebase-tools emulators:start --project demo-ps --only auth,firestore,database
//   node fork/serve.cjs                 (or python -m http.server 8123 in the repo root)
//   node fork/test-trade.cjs [base-url]      (SHOTS=<folder> saves screenshots, TEST_VIEW=1000x640 the window)
//
//   1. The main menu's Trade item, the friend picker, the request popup (like a party invite).
//   2. The window: search, the Shiny filter, "they have it", your partner can't go, the other's offer
//      shows up, hovering shows its stats at Lv. 1.
//   3. Confirming: a change after a confirmation unconfirms it; both confirmed starts the 3 s countdown
//      on both screens and unconfirming stops it (nothing traded); the chat.
//   4. The trade: each has the other's Pokémon, without its upgrades, TMs or Mint; the cloud has it
//      (nobody left in pend); a reload keeps it; a stale copy of the save can't bring a Pokémon back.
//   5. Leaving with Pokémon up (the Friends screen's Trade button): nothing moves.
//   6. Reloading mid-trade: back in the same trade, offer intact, unconfirmed; then it finishes.
//   7. Closing the tab (network cut) during the countdown: the friend's game finishes it and the
//      closed one gets it on its next load ("finished while you were away").
//   8. A cheating client (raw Firestore writes): the other's offer or confirmation, done without
//      both confirmations or before 3 s, a stale confirmation, a trade made as done, a non-friend,
//      a forged name, someone else's lock or pend, leaving a finished trade unapplied, chat as the
//      other player: all refused.
//   9. One Pokémon in two trades (two tabs): once its player has moved on, the first trade can't finish.
//   10. The built index.html has the Trade item; a guest is told it needs an account.
const { chromium, pastStart, pickStarter } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const EMU = `G.FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo-ps', authDomain: 'demo-ps.firebaseapp.com', appId: 'demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-ps-default-rtdb', emulator: true };`;
const tag = String(Date.now()).slice(-6);

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined && !ok ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const settle = (p, pred, arg, ms = 10000) => p.waitForFunction(pred, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// SHOTS=<folder>: screenshots of the screens along the way.
const SHOTS = process.env.SHOTS;
const shot = (page, name) => SHOTS ? page.screenshot({ path: require('path').join(SHOTS, name + '.png') }).catch(() => {}) : null;

async function boot(ctx) {
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (/Trade|DB\]/.test(m.text())) console.log("    [" + (page.name || "?") + "] " + m.text().slice(0, 300)); });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await pastStart(page, '#login-form, #scr-menu');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'cloud' && G.Trade && G.TradeUI, null, { timeout: 30000 });
  return page;
}
const noNotes = page => page.evaluate(() => { for (const id of ['scr-savenote', 'scr-recover']) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); } });

async function player(browser, name, partner, coll) {
  const [vw, vh] = (process.env.TEST_VIEW || '1400x860').split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: !!process.env.TEST_TOUCH });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: EMU }));
  const page = await boot(ctx);
  const r = await page.evaluate(async ([name, partner, coll]) => {
    const reg = await G.DB.register(name, 'pw-' + name);
    if (!reg.ok) return reg;
    const s = G.DB.save, t = Date.now() - 60000;
    s.partner = partner;
    s.owned[partner] = { at: t, from: 'starter' };
    for (const d of coll.owned || []) s.owned[d] = { at: t, from: 'test' };
    for (const d of coll.shiny || []) { s.owned[d] = s.owned[d] || { at: t, from: 'test' }; s.shiny[d] = { at: t, from: 'test' }; }
    s.radiant = s.radiant || {};
    for (const d of coll.radiant || []) { s.owned[d] = s.owned[d] || { at: t, from: 'test' }; s.radiant[d] = { at: t, from: 'test' }; }
    // Upgrades, a TM and a Mint on Pikachu: none of it may go with it.
    if (coll.extras) {
      const up = Object.keys(G.Upgrades.BY)[0];
      s.pupg[25] = { [up]: 3 };
      s.ptm[25] = [G.Mons.learnable(25)[0] || 'thunderbolt'].filter(Boolean);
      s.pnat[25] = ['adamant', Date.now()];
    }
    G.DB.commit();
    const st = await G.Social.start();
    if (st !== 'ok') await G.Social.claimNick(name);
    G.Flow.afterLogin();
    return { ok: true, uid: G.DB.fb.uid };
  }, [name, partner, coll]);
  if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r));
  await noNotes(page);
  page.uid = r.uid; page.name = name; page.ctx = ctx;
  return page;
}

const has = (page, key) => page.evaluate(k => { const m = /^(\d+)([nsr])$/.exec(k); const c = { n: 'owned', s: 'shiny', r: 'radiant' }[m[2]]; return !!(G.DB.save[c] || {})[m[1]]; }, key);
const trade = page => page.evaluate(() => G.Trade.trade && JSON.parse(JSON.stringify(G.Trade.trade)));
const cloudTrade = (page, id) => page.evaluate(id => G.DB.fb.fs.collection('trades').doc(id).get().then(s => s.exists ? s.data() : null), id);
const cloudSave = page => page.evaluate(() => G.DB.fb.fs.collection('saves').doc(G.DB.fb.uid).get({ source: 'server' }).then(s => s.exists ? s.data().save : null, e => ({ err: e.code })));
const cloudHas = (save, key) => { const m = /^(\d+)([nsr])$/.exec(key); return !!(save && (save[{ n: 'owned', s: 'shiny', r: 'radiant' }[m[2]]] || {})[m[1]]); };
const raw = (page, fn, arg) => page.evaluate(new Function('arg', `const fs = G.DB.fb.fs, me = G.DB.fb.uid, ts = () => firebase.firestore.FieldValue.serverTimestamp();
  const T = id => fs.collection('trades').doc(id), L = u => fs.collection('tl').doc(u);
  const ok = p => p.then(() => 'ok', e => e.code || String(e));
  return (${fn})(arg);`), arg);

/** Types in the trade window's search and waits for the grid to follow (it waits 150 ms for more typing). */
async function search(page, q) {
  await page.fill('#tr-q', q);
  await settle(page, q => G.TradeUI.filters.q === q, q, 3000);
  await sleep(100);
}
/** Searches and clicks the tile with that key. */
async function offer(page, key, q) {
  await search(page, q);
  const cell = page.locator(`#tr-grid .tr-cell[data-key="${key}"]`);
  await cell.waitFor({ state: 'visible', timeout: 5000 });
  await cell.click();
  await settle(page, k => G.Trade.mine.some(m => m.key === k), key, 5000);
}
const offered = (page, whose, key) => settle(page, ([w, k]) => (w === 'mine' ? G.Trade.mine : G.Trade.theirs).some(m => m.key === k), [whose, key], 8000);
const bothOpen = (a, b) => Promise.all([a, b].map(p => settle(p, () => G.Trade.trade && G.Trade.trade.st === 'open' && document.getElementById('scr-trade') && !document.getElementById('scr-trade').classList.contains('hidden'), null, 15000)));
const isOk = page => page.evaluate(() => { const t = G.Trade.trade; return !!t && t.rv > 0 && t['k' + G.Trade.side] === t.rv; });
/** Clicks Confirm (unless already confirmed) and waits for the server to have it. */
async function confirm(page) {
  if (!(await isOk(page))) await page.click('#tr-confirm');
  return settle(page, () => { const t = G.Trade.trade; return t && t['k' + G.Trade.side] === t.rv; }, null, 6000);
}
/** Waits until both games have applied trade id in the cloud (nobody left in pend). */
async function pendClear(page, id, ms = 90000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) {
    const t = await cloudTrade(page, id).catch(() => null);
    if (t && t.st === 'done' && (t.pend || []).length === 0) return true;
  }
  return false;
}

/** A trade between a and b through the real client (no clicks): → its id. */
async function startTrade(a, b) {
  const r = await a.evaluate(u => G.Trade.ask(u), b.uid);
  if (!r.ok) throw new Error('ask: ' + JSON.stringify(r));
  const id = await a.evaluate(() => G.Trade.cur.id);
  await settle(b, id => G.Trade.requests().some(t => t.id === id), id, 15000);
  const j = await b.evaluate(id => G.Trade.accept(id), id);
  if (!j.ok) throw new Error('accept: ' + JSON.stringify(j));
  await bothOpen(a, b);
  return id;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    // A: partner Charmander; Pikachu (upgrades, a TM, a Mint), Eevee and its shiny, radiant Mewtwo, Charizard.
    // B: partner Squirtle; Bulbasaur, Chikorita, Charizard (so A's Charizard is "they have it").
    const A = await player(browser, 'tra' + tag, 4, { owned: [25, 133, 6, 150], shiny: [133], radiant: [150], extras: true });
    const B = await player(browser, 'trb' + tag, 7, { owned: [1, 152, 6] });
    const fr = await A.evaluate(n => G.Social.request(n), B.name);
    check(fr.ok, 'A asks B to be friends', fr);
    await B.evaluate(() => G.Social.ensureFriends());
    await settle(B, u => G.Social.friends.some(f => f.uid === u && f.status === 'in'), A.uid);
    // (On the emulator upstream's accept sometimes reports permission-denied although it went through:
    // the SDK sends the write twice. What counts is the friendship on the server.)
    await B.evaluate(u => G.Social.accept(u), A.uid);
    check(await settle(B, u => G.Social.friends.some(f => f.uid === u && f.status === 'ok'), A.uid), 'B accepts');
    await A.evaluate(() => G.Social.ensureFriends());
    await settle(A, u => G.Social.friends.some(f => f.uid === u && f.status === 'ok'), B.uid);
    const pikaA = await A.evaluate(() => JSON.parse(JSON.stringify({ pupg: G.DB.save.pupg[25], ptm: G.DB.save.ptm[25], pnat: G.DB.save.pnat[25] })));
    const staleA = await A.evaluate(() => JSON.parse(JSON.stringify(G.DB.save)));
    const staleB = await B.evaluate(() => JSON.parse(JSON.stringify(G.DB.save)));

    console.log('1. The main menu, the friend picker, the request');
    await A.evaluate(() => G.MenuUI.open());
    await noNotes(A);
    const item = A.locator('#scr-menu [data-go="trade"]');
    check(await item.isVisible(), 'the main menu has a Trade item');
    await shot(A, '1-menu');
    await item.click();
    await A.waitForSelector('#scr-trade-friends:not(.hidden)', { timeout: 5000 });
    await shot(A, '2-friends');
    check(/no upgrades, TMs/.test(await A.textContent('#scr-trade-friends')), 'the friend picker says traded Pokémon come without upgrades or TMs');
    const row = A.locator('#trf-list .fr-row', { hasText: B.name });
    await row.waitFor({ state: 'visible', timeout: 8000 });
    await row.locator('button').click();
    check(await settle(A, () => !document.getElementById('scr-trade').classList.contains('hidden') && /Waiting for/.test(document.getElementById('tr-cover').textContent)),
      'A is in the trade window, waiting for B');
    check(await settle(B, n => { const p = document.getElementById('trade-pop'); return p && !p.classList.contains('hidden') && p.textContent.includes(n); }, A.name, 15000),
      'B gets a popup: A wants to trade');
    await shot(B, '3-popup'); await shot(A, '3-waiting');
    await B.click('#tp-yes');
    check((await bothOpen(A, B)).every(Boolean), 'B accepts: both are in the trade window');
    check(await settle(A, () => document.getElementById('tr-cover').classList.contains('hidden')), "A's waiting cover is gone");
    check(/no upgrades, TMs/.test(await B.textContent('#scr-trade .tr-fresh')), 'the window says traded Pokémon arrive without upgrades or TMs');
    const id1 = await A.evaluate(() => G.Trade.cur.id);

    console.log('2. Picking, filters, the stats card');
    await offer(A, '25n', 'pika');
    check(await A.locator('#tr-grid .tr-cell').count() === 1, 'searching "pika" shows just Pikachu');
    check(await offered(B, 'theirs', '25n'), "B sees A's Pikachu in A's offer");
    check(await settle(B, () => document.querySelector('#tr-theirs .tr-slot[data-key="25n"]')), "it's on B's screen");
    await search(A, '');
    await A.click('#tr-filters .chip:has-text("Shiny")');
    const shinyKeys = await A.evaluate(() => [...document.querySelectorAll('#tr-grid .tr-cell')].map(c => c.dataset.key));
    check(shinyKeys.length === 1 && shinyKeys[0] === '133s', 'the Shiny filter shows only shiny Eevee', shinyKeys);
    await A.click('#tr-filters .chip:has-text("Shiny")');
    check(!(await A.evaluate(() => [...document.querySelectorAll('#tr-grid .tr-cell')].some(c => c.dataset.key === '133n'))),
      "Eevee itself isn't on offer while A has its shiny (only the shiny is)");
    await settle(A, () => !!G.Trade.theirHave);
    await A.click('#tr-filters .chip:has-text("Hide ones they have")');
    const six = A.locator('#tr-grid .tr-cell[data-key="6n"]');
    check(await six.count() === 1 && /They have it/.test(await six.textContent()), 'with "hide ones they have" off, Charizard says "They have it"');
    await six.click();
    await sleep(600);
    check(!(await A.evaluate(() => G.Trade.mine.some(m => m.key === '6n'))), 'and clicking it does not put it up');
    await A.click('#tr-filters .chip:has-text("Hide ones they have")');
    await search(A, 'charmander');
    const four = A.locator('#tr-grid .tr-cell[data-key="4n"]');
    check(await four.count() === 1 && /partner/i.test(await four.textContent()), 'your partner is marked and can\'t go');
    await four.click();
    await sleep(500);
    check(!(await A.evaluate(() => G.Trade.mine.some(m => m.key === '4n'))), 'clicking the partner does not put it up');
    await offer(B, '1n', '1');
    check(await offered(A, 'theirs', '1n'), "A sees B's Bulbasaur");
    await B.hover('#tr-theirs .tr-slot[data-key="25n"]');
    const tip = await B.evaluate(() => { const t = document.getElementById('tr-tip'); return t.classList.contains('hidden') ? '' : t.textContent; });
    const hp = await B.evaluate(() => G.DEX_BY[25].hp);
    check(/Stats at Lv\. 1/.test(tip) && tip.includes('HP') && tip.includes(String(hp)) && /Speed/.test(tip) && /Sp\. Atk/.test(tip),
      'hovering A\'s Pikachu shows its stats at Lv. 1 (HP ' + hp + ', Speed, Sp. Atk...)', tip.slice(0, 200));
    check(/would be/.test(tip), 'and the nature and ability it would arrive with for B');
    await shot(B, '4-tooltip');
    await B.mouse.move(5, 5);
    check(await settle(B, () => document.getElementById('tr-tip').classList.contains('hidden')), 'moving away hides it');

    console.log('3. Confirming, the countdown, the chat');
    check(await confirm(A), 'A confirms');
    check(await settle(B, () => /Confirmed/.test(document.getElementById('tr-their-ok').textContent) && document.getElementById('tr-their-ok').classList.contains('on')),
      'B sees A confirmed');
    await offer(B, '152n', 'chiko');
    check(await settle(A, () => { const t = G.Trade.trade; return t.ka !== t.rv && /Not confirmed/.test(document.getElementById('tr-mine-ok').textContent); }),
      "B changing the offer unconfirms A by itself");
    check(await settle(A, () => /offer changed/i.test(document.getElementById('tr-status').textContent)), 'A is told the offer changed');
    await B.locator('#tr-mine .tr-slot[data-key="152n"]').click();
    await offered(A, 'theirs', '1n');
    await settle(A, () => !G.Trade.theirs.some(m => m.key === '152n'));
    check(await confirm(A), 'A confirms again');
    check(await confirm(B), 'B confirms');
    check((await Promise.all([A, B].map(p => settle(p, () => /Trading in/.test(document.getElementById('tr-status').textContent), null, 5000)))).every(Boolean),
      'both screens count down');
    await shot(A, '5-countdown');
    await A.click('#tr-confirm');
    check((await Promise.all([A, B].map(p => settle(p, () => G.Trade.countLeft < 0 && !/Trading in/.test(document.getElementById('tr-status').textContent), null, 4000)))).every(Boolean),
      'A unconfirms during the countdown: it stops on both');
    await sleep(4500);
    const t1 = await cloudTrade(A, id1);
    check(t1.st === 'open' && await has(A, '25n') && await has(B, '1n') && !(await has(A, '1n')) && !(await has(B, '25n')), 'nothing was traded', t1.st);
    await A.fill('#tr-chat-in', 'hello there');
    await A.press('#tr-chat-in', 'Enter');
    check(await settle(B, () => /hello there/.test(document.getElementById('tr-msgs').textContent)), 'the chat: B reads what A wrote');
    check(await settle(A, () => /You:/.test(document.getElementById('tr-msgs').textContent)), 'and A sees it as "You"');

    console.log('4. The trade');
    check(await isOk(B), 'B is still confirmed (only A backed out)');
    check(await confirm(A), 'A confirms again: the countdown starts again');
    check((await Promise.all([A, B].map(p => settle(p, () => /Trade complete/.test(document.getElementById('tr-cover').textContent), null, 15000)))).every(Boolean),
      'after the countdown both see "Trade complete!"');
    await shot(B, '6-done');
    check(await has(A, '1n') && !(await has(A, '25n')), 'A has Bulbasaur and no Pikachu');
    check(await has(B, '25n') && !(await has(B, '1n')), 'B has Pikachu and no Bulbasaur');
    const pikaB = await B.evaluate(() => JSON.parse(JSON.stringify({ pupg: G.DB.save.pupg[25] || {}, ptm: G.DB.save.ptm[25] || [], pnat: G.DB.save.pnat[25] || null, from: G.DB.save.owned[25].from })));
    check(Object.keys(pikaA.pupg).length && pikaA.ptm.length && pikaA.pnat, "(A's Pikachu had upgrades, a TM and a Mint)", pikaA);
    check(!Object.keys(pikaB.pupg).length && !pikaB.ptm.length && !pikaB.pnat && pikaB.from === 'trade', "B's Pikachu came with none of them", pikaB);
    check(await pendClear(A, id1), 'the cloud: both games applied it (nobody left in pend)');
    const csA = await cloudSave(A), csB = await cloudSave(B);
    if (!csA || !csB) console.log('DEBUG', JSON.stringify(await cloudTrade(A, id1)), await A.evaluate(() => [G.DB.syncState, G.DB.fb.uid, Object.keys(G.DB.save.trd || {})]), await A.evaluate(() => G.DB.fb.fs.collection('saves').doc(G.DB.fb.uid).get({ source: 'server' }).then(s => [s.exists, Object.keys(s.data() || {})], e => e.code)),
      await B.evaluate(() => G.DB.fb.fs.collection('saves').doc(G.DB.fb.uid).get({ source: 'server' }).then(s => [s.exists, Object.keys(s.data() || {})], e => e.code)));
    check(cloudHas(csA, '1n') && !cloudHas(csA, '25n') && cloudHas(csB, '25n') && !cloudHas(csB, '1n'), "both cloud saves have it");
    check(csA.trd && csA.trd[id1] && csB.trd && csB.trd[id1], 'and record it');
    // A copy of the save from before the trade (another device) can't bring a traded Pokémon back.
    const mA = await A.evaluate(stale => { const r = G.DB.merge(stale, JSON.parse(JSON.stringify(G.DB.save))); return { p: !!r.owned[25], b: !!r.owned[1] }; }, staleA);
    check(!mA.p && mA.b, "merging A's save with a copy from before the trade: no Pikachu back, Bulbasaur kept", mA);
    const mB = await B.evaluate(stale => { const r = G.DB.merge(JSON.parse(JSON.stringify(G.DB.save)), stale); return { p: !!r.owned[25], b: !!r.owned[1] }; }, staleB);
    check(mB.p && !mB.b, "merging B's save with its old copy: Pikachu kept, no Bulbasaur back", mB);
    const again = await A.evaluate(stale => {
      const now = JSON.parse(JSON.stringify(G.DB.save));
      now.owned[25] = { at: Date.now() + 5000, from: 'gacha' };               // caught again after the trade
      return !!G.DB.merge(stale, now).owned[25];
    }, staleA);
    check(again, 'a Pikachu A gets again after the trade stays');
    await A.click('#trd-ok');
    await B.click('#trd-ok');
    await A.reload({ waitUntil: 'load' });
    await pastStart(A, '#scr-menu');
    await A.waitForFunction(() => G.DB.save && G.Trade.ready, null, { timeout: 30000 });
    check(await has(A, '1n') && !(await has(A, '25n')), 'after a reload A still has Bulbasaur and no Pikachu');

    console.log('5. Leaving with Pokémon up');
    await noNotes(A);
    await A.evaluate(() => G.FriendsUI.open());
    const tb = A.locator('#fr-list .fr-row', { hasText: B.name }).locator('button', { hasText: 'Trade' });
    await tb.waitFor({ state: 'visible', timeout: 8000 });
    await tb.click();
    await settle(B, () => G.Trade.requests().length > 0, null, 15000);
    await settle(B, () => !document.getElementById('trade-pop').classList.contains('hidden'), null, 8000);
    await B.click('#tp-yes');
    check((await bothOpen(A, B)).every(Boolean), "the Friends screen's Trade button starts a trade");
    const id2 = await A.evaluate(() => G.Trade.cur.id);
    await offer(A, '133s', 'eevee');
    await offer(B, '152n', 'chiko');
    await confirm(A);
    await A.click('#tr-leave');
    check(await settle(B, () => !G.Trade.cur && document.getElementById('scr-trade').classList.contains('hidden')), "A leaves: B's window closes");
    check((await cloudTrade(B, id2)).st === 'off', 'the trade is off');
    check(await has(A, '133s') && await has(B, '152n') && !(await has(B, '133s')) && !(await has(A, '152n')), 'nobody lost or got anything');

    console.log('6. Reloading mid-trade');
    const id3 = await startTrade(A, B);
    await offer(A, '133s', 'eevee');
    await offer(B, '152n', 'chiko');
    await offered(B, 'theirs', '133s');
    await confirm(A);
    await A.reload({ waitUntil: 'load' });
    await pastStart(A, '#scr-menu, #scr-trade');
    check(await settle(A, id => G.Trade.cur && G.Trade.cur.id === id && !document.getElementById('scr-trade').classList.contains('hidden'), id3, 20000),
      'after reloading, A is back in the same trade');
    check(await settle(A, () => G.Trade.mine.some(m => m.key === '133s') && G.Trade.theirs.some(m => m.key === '152n')), 'both offers are still there');
    check(await settle(A, () => { const t = G.Trade.trade; return t.ka === 0; }), 'and A has to confirm again');
    check(await has(A, '133s'), 'A still has shiny Eevee');
    check(await B.evaluate(id => G.Trade.cur && G.Trade.cur.id === id, id3), 'B never left it');
    await confirm(A);
    await confirm(B);
    check((await Promise.all([A, B].map(p => settle(p, () => /Trade complete/.test(document.getElementById('tr-cover').textContent), null, 15000)))).every(Boolean), 'then it goes through');
    check(!(await has(A, '133s')) && await has(A, '133n') && await has(A, '152n'), 'A gave shiny Eevee (keeps Eevee itself) and got Chikorita');
    check(await has(B, '133s') && await has(B, '133n') && !(await has(B, '152n')), 'B has Eevee and its shiny, no Chikorita');
    await A.click('#trd-ok'); await B.click('#trd-ok');
    check(await pendClear(A, id3), 'both applied it in the cloud');

    console.log('7. Closing the tab during the countdown');
    const id4 = await startTrade(A, B);
    await offer(A, '150r', 'mewtwo');
    await offer(B, '133s', 'eevee');
    await offered(A, 'theirs', '133s');
    await confirm(A);
    await confirm(B);
    await settle(A, () => G.Trade.countLeft >= 0, null, 5000);
    await A.ctx.setOffline(true);                      // A's game can't say anything any more
    await A.close();
    check(await settle(B, () => /Trade complete/.test(document.getElementById('tr-cover').textContent), null, 20000), "B's game finishes the trade");
    check(await has(B, '150r') && !(await has(B, '133s')), 'B has radiant Mewtwo and gave shiny Eevee');
    await A.ctx.setOffline(false);
    const A2 = await boot(A.ctx);
    A2.uid = A.uid; A2.name = A.name; A2.ctx = A.ctx;
    await A2.waitForFunction(() => G.DB.save && G.Trade.ready, null, { timeout: 30000 });
    check(await settle(A2, () => !G.DB.save.radiant[150] && !!G.DB.save.shiny[133], null, 20000), 'A comes back: the trade is in A\'s save (no radiant Mewtwo, shiny Eevee back)');
    check(await has(A2, '150n'), 'A keeps Mewtwo itself');
    check(await pendClear(A2, id4), 'and in the cloud');
    await B.click('#trd-ok');

    console.log('8. A cheating client');
    const P = A2;
    // A trade made with raw writes, as a cheating game would. (A has shiny Eevee back from part 7.)
    const rid = await raw(P, async b => {
      const id = fs.collection('trades').doc().id;
      const batch = fs.batch();
      batch.set(T(id), { a: me, b, users: [me, b], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
      batch.set(L(me), { t: id, at: ts() });
      await batch.commit();
      return id;
    }, B.uid);
    await B.evaluate(() => { G.Trade.decline = () => {}; });
    check(await raw(B, id => { const b = fs.batch(); b.update(T(id), { st: 'open', hb: ts(), at: ts() }); b.set(L(me), { t: id, at: ts() }); return ok(b.commit()); }, rid) === 'ok', 'B joins a raw trade');
    const r8 = {};
    r8.otherOffer = await raw(B, id => ok(T(id).update({ oa: ['1n'], rv: firebase.firestore.FieldValue.increment(1), at: ts() })), rid);
    r8.mine = await raw(P, id => ok(T(id).update({ oa: ['133s'], rv: firebase.firestore.FieldValue.increment(1), at: ts() })), rid);
    r8.otherConfirm = await raw(B, id => ok(T(id).update({ ka: 1, ta: ts(), at: ts() })), rid);
    r8.doneNoOk = await raw(B, id => ok(T(id).update({ st: 'done', pend: [], done: ts(), at: ts() })), rid);
    r8.aOk = await raw(P, id => ok(T(id).update({ ka: 1, ta: ts(), at: ts() })), rid);
    r8.bOffer = await raw(B, id => ok(T(id).update({ ob: ['152n'], rv: firebase.firestore.FieldValue.increment(1), at: ts() })), rid);
    r8.staleOk = await raw(B, id => ok(T(id).update({ kb: 1, tb: ts(), at: ts() })), rid);
    r8.bOk = await raw(B, id => ok(T(id).update({ kb: 2, tb: ts(), at: ts() })), rid);
    check(r8.otherOffer === 'permission-denied', "B can't write A's offer", r8.otherOffer);
    check(r8.mine === 'ok', 'A can write its own', r8.mine);
    check(r8.otherConfirm === 'permission-denied', "B can't confirm for A", r8.otherConfirm);
    check(r8.doneNoOk === 'permission-denied', "B can't finish it without both confirmations", r8.doneNoOk);
    check(r8.aOk === 'ok' && r8.bOffer === 'ok', '(A confirms, then B changes its offer)', [r8.aOk, r8.bOffer]);
    check(r8.staleOk === 'permission-denied', "B can't confirm an offer version that's gone", r8.staleOk);
    check(r8.bOk === 'ok', '(B confirms the current one)');
    const users = [P.uid, B.uid];
    r8.doneAStale = await raw(B, ([id, u]) => ok(T(id).update({ st: 'done', pend: u, done: ts(), at: ts() })), [rid, users]);
    check(r8.doneAStale === 'permission-denied', "B can't finish it while A's confirmation is for the old offer", r8.doneAStale);
    r8.aOk2 = await raw(P, id => ok(T(id).update({ ka: 2, ta: ts(), at: ts() })), rid);
    r8.early = await raw(B, ([id, u]) => ok(T(id).update({ st: 'done', pend: u, done: ts(), at: ts() })), [rid, users]);
    check(r8.aOk2 === 'ok' && r8.early === 'permission-denied', 'both confirmed: finishing it before the 3 s is refused', r8.early);
    r8.badPend = await raw(B, ([id, u]) => { return new Promise(r => setTimeout(r, 3500)).then(() => ok(T(id).update({ st: 'done', pend: [u[1]], done: ts(), at: ts() }))); }, [rid, users]);
    check(r8.badPend === 'permission-denied', "finishing it with A left out of pend is refused", r8.badPend);
    r8.done = await raw(B, ([id, u]) => ok(T(id).update({ st: 'done', pend: u, done: ts(), at: ts() })), [rid, users]);
    check(r8.done === 'ok', 'after 3 s with both confirmations it finishes', r8.done);
    r8.takeA = await raw(B, ([id, u]) => ok(T(id).update({ pend: [u[1]], at: ts() })), [rid, users]);
    check(r8.takeA === 'permission-denied', "B can't take A off pend", r8.takeA);
    r8.selfNoSave = await raw(B, ([id, u]) => ok(T(id).update({ pend: [u[0]], at: ts() })), [rid, users]);
    check(r8.selfNoSave === 'permission-denied', "B can't take itself off pend without a save that records the trade", r8.selfNoSave);
    r8.lockAway = await raw(B, async ([id, a]) => {
      const nid = fs.collection('trades').doc().id;
      const b = fs.batch();
      b.set(T(nid), { a: me, b: a, users: [me, a], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
      b.set(L(me), { t: nid, at: ts() });
      return ok(b.commit());
    }, [rid, P.uid]);
    check(r8.lockAway === 'permission-denied', "B can't start another trade while this finished one isn't in its save", r8.lockAway);
    r8.otherLock = await raw(B, ([id, a]) => ok(L(a).set({ t: id, at: ts() })), [rid, P.uid]);
    check(r8.otherLock === 'permission-denied', "B can't write A's lock", r8.otherLock);
    r8.chatAs = await raw(B, ([id, a]) => ok(T(id).collection('m').add({ u: a, t: 'hi', at: ts() })), [rid, P.uid]);
    check(r8.chatAs === 'permission-denied', "B can't chat as A", r8.chatAs);
    r8.asDone = await raw(B, a => {
      const id = fs.collection('trades').doc().id, b = fs.batch();
      b.set(T(id), { a: me, b: a, users: [me, a], na: G.Social.me.name, st: 'done', oa: [], ob: ['25n'], rv: 1, ka: 1, kb: 1, ta: ts(), tb: ts(), ha: ts(), hb: ts(), pend: [me, a], at: ts() });
      return ok(b.commit());
    }, P.uid);
    check(r8.asDone === 'permission-denied', "B can't make a trade that's already done", r8.asDone);
    r8.stranger = await raw(B, () => {
      const id = fs.collection('trades').doc().id, b = fs.batch(), x = 'nobodyAtAll' + Date.now();
      b.set(T(id), { a: me, b: x, users: [me, x], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
      b.set(L(me), { t: id, at: ts() });
      return ok(b.commit());
    });
    check(r8.stranger === 'permission-denied', "B can't trade with someone who isn't a friend", r8.stranger);
    r8.fakeName = await raw(B, a => {
      const id = fs.collection('trades').doc().id, b = fs.batch();
      b.set(T(id), { a: me, b: a, users: [me, a], na: 'SomeoneElse', st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
      b.set(L(me), { t: id, at: ts() });
      return ok(b.commit());
    }, P.uid);
    check(r8.fakeName === 'permission-denied', "B can't send a request under another name", r8.fakeName);
    // The raw trade is done: each game picks it up on its next load. (B's offer, Chikorita, is one B no
    // longer has: a cheat's offer. A still gets it, which is a cheater gifting, and B just loses nothing.)
    await B.reload({ waitUntil: 'load' }); await pastStart(B, '#scr-menu');
    await P.reload({ waitUntil: 'load' }); await pastStart(P, '#scr-menu');
    check(await pendClear(P, rid), 'the finished raw trade gets applied by both games on their next load');
    check(!(await has(P, '133s')) && await has(B, '133s'), 'A gave its shiny Eevee to B');

    console.log('9. One Pokémon in two trades (two tabs): the first can no longer finish');
    const t9 = await raw(P, async b => {
      const mk = async () => {
        const id = fs.collection('trades').doc().id, bt = fs.batch();
        bt.set(T(id), { a: me, b, users: [me, b], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
        bt.set(L(me), { t: id, at: ts() });
        await bt.commit();
        return id;
      };
      return mk();
    }, B.uid);
    await B.evaluate(() => { G.Trade.decline = () => {}; });
    await raw(B, id => { const b = fs.batch(); b.update(T(id), { st: 'open', hb: ts(), at: ts() }); b.set(L(me), { t: id, at: ts() }); return b.commit(); }, t9);
    await raw(P, id => T(id).update({ oa: ['6n'], rv: firebase.firestore.FieldValue.increment(1), at: ts() }), t9);
    await raw(P, id => T(id).update({ ka: 1, ta: ts(), at: ts() }), t9);
    await raw(B, id => T(id).update({ kb: 1, tb: ts(), at: ts() }), t9);
    // "Another tab": A's lock moves to a new trade (the open one isn't finished, so that's allowed).
    const moved = await raw(P, async b => {
      const id = fs.collection('trades').doc().id, bt = fs.batch();
      bt.set(T(id), { a: me, b, users: [me, b], na: G.Social.me.name, st: 'ask', oa: [], ob: [], rv: 0, ka: 0, kb: 0, ta: null, tb: null, ha: ts(), hb: null, pend: [], at: ts() });
      bt.set(L(me), { t: id, at: ts() });
      return ok(bt.commit());
    }, B.uid);
    check(moved === 'ok', "A's other tab starts a new trade");
    await sleep(3500);
    const late = await raw(B, ([id, u]) => ok(T(id).update({ st: 'done', pend: u, done: ts(), at: ts() })), [t9, users]);
    check(late === 'permission-denied', 'the first trade (both confirmed) can no longer finish', late);
    check(await has(P, '6n'), 'A still has Charizard');

    check(!A.errs.length && !A2.errs.length && !B.errs.length, 'no page errors', A.errs.concat(A2.errs, B.errs));

    console.log('10. The built index.html (node fork/build.cjs first)');
    const wctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, serviceWorkers: 'block' });
    await wctx.route('**/firebasejs/**', r => r.abort());          // no cloud: a guest
    const w = await wctx.newPage(), werrs = [];
    w.on('pageerror', e => werrs.push(String(e)));
    await w.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(w, '#btn-guest');
    await w.click('#btn-guest');
    await pickStarter(w);
    const wi = w.locator('#scr-menu [data-go="trade"]');
    check(await wi.isVisible() && /Trade/.test(await wi.textContent()), 'the built game has the Trade item in its main menu');
    await wi.click();
    await sleep(400);
    check(await w.evaluate(() => { const t = document.querySelector('.toast'); return !!t && t.style.display !== 'none' && t.textContent.length > 0; })
      && !(await w.isVisible('#scr-trade-friends')), 'a guest is told trading needs an account (the friend picker stays shut)');
    check(!werrs.length, 'no page errors on the built page', werrs);
    await wctx.close();
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll trade checks passed');
  process.exit(failures ? 1 : 0);
})();
