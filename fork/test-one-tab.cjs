#!/usr/bin/env node
// One tab at a time (js/fork/one-tab.js), in headless Edge:
//
//   node fork/serve.cjs
//   node fork/test-one-tab.cjs [base-url]
//
// dev.html, an account in local mode with two tabs in the same browser:
// the first tab plays and rolls the gacha; a second tab opened beside it shows "Open in another tab"
// and never opens the save (no gacha there); "Play here" moves the game to the second tab, which then
// has the first tab's roll, while the first tab parks and can't write to localStorage any more; and a
// tab that missed the switch (the owner changed under it) parks too. The built index.html: the same
// switch, seen on screen, as a guest.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The parked screen, waited for across the reload a parked tab does.
const parked = page => page.waitForFunction(() => {
  const el = document.getElementById('one-tab');
  return !!el && el.getClientRects().length > 0 && G.OneTab && G.OneTab.state === 'parked';
}, null, { timeout: 30000 }).then(() => true, () => false);

const look = page => page.evaluate(() => ({
  state: G.OneTab && G.OneTab.state, save: !!G.DB.save, menu: !document.getElementById('scr-menu').classList.contains('hidden'),
  t1: G.DB.save ? G.DB.save.tickets.t1 : null, owned: G.DB.save ? Object.keys(G.DB.save.owned).length : null
}));

async function run(browser, file) {
  console.log(file);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, serviceWorkers: 'block' });
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const errs = [];
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto(BASE + '/' + file, { waitUntil: 'load' }); return p; };

  // Tab A: a new account with 20 tickets, rolls once.
  const a = await open();
  await pastStart(a, '#login-form, #scr-menu');
  const name = 'ot' + Date.now().toString(36).slice(-6);
  const r = await a.evaluate(async n => {
    const res = await G.DB.register(n, 'pw-' + n);
    if (!res.ok) return res;
    const s = G.DB.save; s.partner = 4; s.owned[4] = { at: Date.now(), from: 'test' }; s.tickets.t1 = 20; G.DB.commit();
    G.Flow.afterLogin();
    for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
    return { ok: true };
  }, name);
  if (!r.ok) throw new Error('register: ' + JSON.stringify(r));
  await a.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
  check((await look(a)).state === 'owner', 'the first tab plays');
  const rolled = await a.evaluate(() => { const got = G.Gacha.pull(G.DB.save, 1, 1, 't1'); const ok = G.DB.commit(); return { got: !!got, ok, t1: G.DB.save.tickets.t1 }; });
  check(rolled.got && rolled.ok && rolled.t1 === 19, 'it rolls the gacha and saves', rolled);

  // Tab B, beside it: parked, no save, no menu.
  const b = await open();
  check(await parked(b), 'a second tab shows "Open in another tab"');
  await sleep(1500);
  const lb = await look(b);
  check(!lb.save && !lb.menu, 'and never opens the save (nothing to roll with)', lb);
  check((await look(a)).state === 'owner' && await a.evaluate(() => G.DB.commit()), 'the first tab keeps playing and saving');

  // "Play here" on B: B plays with A's roll, A parks.
  await b.click('#one-tab-here');
  await pastStart(b, '#scr-menu');
  const lb2 = await look(b);
  check(lb2.state === 'owner' && lb2.t1 === 19, '"Play here" moves the game to the second tab, with the first tab\'s roll', lb2);
  check(await parked(a), 'the first tab parks');
  const la = await look(a);
  check(!la.save, 'and drops its save', la);
  const key = 'ps.save.' + name.toLowerCase();
  const wrote = await a.evaluate(k => { const before = localStorage.getItem(k); localStorage.setItem(k, '{}'); localStorage.removeItem(k); return localStorage.getItem(k) === before && before !== null; }, key);
  check(wrote, 'a parked tab can\'t change the save in localStorage');

  // A tab that missed the switch: the owner changes under it, and it parks before saving again.
  await a.evaluate(() => localStorage.setItem('ms.tab.owner', 'someone'));
  check(await parked(b), 'a playing tab whose turn was taken parks');

  check(!errs.length, 'no page errors', errs);
  await ctx.close();
}

// The built page (G isn't reachable from outside there): the same switch, seen on screen, as a guest.
async function built(browser) {
  console.log('index.html');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, serviceWorkers: 'block' });
  await ctx.route('**/firebasejs/**', r => r.abort());
  const errs = [];
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto(BASE + '/index.html', { waitUntil: 'load' }); return p; };
  const shown = (p, sel) => p.waitForFunction(s => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel, { timeout: 30000 }).then(() => true, () => false);
  const a = await open();
  await pastStart(a, '#btn-guest, #scr-menu, #scr-starters');
  const b = await open();
  check(await shown(b, '#one-tab'), 'a second tab shows "Open in another tab"');
  check(!(await a.$('#one-tab')), 'the first tab doesn\'t');
  await b.click('#one-tab-here');
  await pastStart(b, '#btn-guest, #scr-menu, #scr-starters');
  check(!(await b.$('#one-tab')), '"Play here" opens the game in the second tab');
  check(await shown(a, '#one-tab'), 'and parks the first');
  check(!errs.length, 'no page errors', errs);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    await run(browser, 'dev.html');
    await built(browser);
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll one-tab checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
