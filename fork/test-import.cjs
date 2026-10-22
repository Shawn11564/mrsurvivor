#!/usr/bin/env node
// Import from the original PokéSurvivor (js/fork/import-save.js + G.DB.adopt in js/core/db.js),
// end to end in headless Edge, on two origins of the local server:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-import.cjs [port]
//
//   "original site"  http://localhost:<port>/dev.html   — the game's own save code writes the
//                    save (local account), then the exact snippet we show players runs there.
//   "MrSurvivor"     http://127.0.0.1:<port>/dev.html   — a second local account pastes the code.
// Firebase is blocked in both, so the game uses its local accounts and no real cloud is touched.
// Checks: the snippet copies a code (clipboard) or downloads it (no clipboard); the import
// merges everything and keeps the account's name; importing twice changes nothing; a broken
// code is refused; the import survives a reload; and the branded build (index.html) still
// says PokéSurvivor / pokesurvivor.com in the dialog (fork/brand.cjs must not rewrite them).
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const PORT = process.argv[2] || require('./pw.cjs').PORT;
const UP = `http://localhost:${PORT}`, OURS = `http://127.0.0.1:${PORT}`;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

async function fresh(browser, perms = []) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true });
  if (perms.length) await ctx.grantPermissions(perms, { origin: UP });
  // No Firebase: the game falls back to local accounts (this browser only).
  // SLOW_FIREBASE=<ms> delays that failure, to recreate a slow cold start (see pastStart in pw.cjs).
  const slow = +process.env.SLOW_FIREBASE || 0;
  await ctx.route(/gstatic\.com|googleapis\.com|firebaseio\.com|firebasedatabase\.app/, r => slow ? setTimeout(() => r.abort(), slow) : r.abort());
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e)));
  page.dialogs = [];
  page.on('dialog', d => { page.dialogs.push(d.message()); d.type() === 'prompt' ? d.accept('1') : d.accept(); });
  return { ctx, page };
}

async function register(page, base, file, name, pass) {
  await page.goto(`${base}/${file}`, { waitUntil: 'load' });
  await pastStart(page, '#login-form');
  await page.waitForFunction(() => window.G && G.DB && G.DB.mode === 'local', null, { timeout: 20000 }).catch(() => {});
  await page.click('#scr-login .tab[data-tab="register"]');
  await page.fill('#f-user', name);
  await page.fill('#f-pass', pass);
  await page.click('#btn-auth');
  await page.waitForFunction(() => G.DB.loggedIn && !G.DB.guest, null, { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    console.log('Original site: a real local save');
    let { ctx, page } = await fresh(browser, ['clipboard-read', 'clipboard-write']);
    await register(page, UP, 'dev.html', 'upplayer', 'pw-up-123');
    const upSave = await page.evaluate(() => {
      const s = G.DB.save;
      s.partner = 6; s.starter = 4;
      for (const d of [1, 4, 6, 25, 150]) G.DB.grant ? G.DB.grant(d, 'gacha') : (s.owned[d] = { at: Date.now(), from: 'gacha' });
      s.shiny[25] = { at: Date.now(), from: 'wild' };
      s.coins += 4321;
      s.stats.runs = 42; s.stats.bestTime = 900;
      s.pupg[6] = { hp: 2 };
      G.DB.commit();
      const k = Object.keys(localStorage).find(k => k.startsWith('ps.save.'));
      return { key: k, owned: Object.keys(s.owned).map(Number), coins: s.coins, name: s.name };
    });
    check(!!upSave.key, `the game wrote its save to localStorage (${upSave.key}: ${upSave.owned.length} Pokémon, ${upSave.coins} coins)`);
    // The snippet players get, taken from our page.
    const ours = await fresh(browser);
    await register(ours.page, OURS, 'dev.html', 'mrplayer', 'pw-mr-123');
    const snippet = await ours.page.evaluate(() => G.ImportSave.snippet());
    const before = await ours.page.evaluate(() => {
      const s = G.DB.save; s.partner = 1; s.owned[1] = { at: Date.now(), from: 'starter' }; s.owned[7] = { at: Date.now(), from: 'wild' };
      s.coins += 100; G.DB.commit();
      return { owned: Object.keys(s.owned).map(Number), coins: s.coins, name: s.name };
    });

    // Run it like the console does: copy() isn't there, so it uses the clipboard.
    await page.evaluate(snippet);
    await page.waitForTimeout(500);
    const code = await page.evaluate(() => navigator.clipboard.readText());
    check(code.startsWith('MRSV1:') && code.length > 100, `snippet copied a code (${code.length} chars)`);
    check(page.dialogs.some(m => m.includes(upSave.name)), 'snippet told the player whose save it copied: ' + page.dialogs.slice(-1));

    // Clipboard refused (as when the page isn't focused): it downloads the code instead.
    const noClip = await fresh(browser);
    await noClip.page.goto(`${UP}/dev.html`);
    await noClip.page.evaluate(([k, v]) => {
      localStorage.setItem(k, v);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')) } });
    }, [upSave.key, await page.evaluate(k => localStorage.getItem(k), upSave.key)]);
    const [dl] = await Promise.all([noClip.page.waitForEvent('download', { timeout: 10000 }), noClip.page.evaluate(snippet)]);
    const file = await dl.path().then(p => require('fs').readFileSync(p, 'utf8'));
    check(dl.suggestedFilename() === 'pokesurvivor-save.txt' && file === code, 'without the clipboard it downloads the same code as a file');
    await noClip.ctx.close();
    await ctx.close();

    console.log('MrSurvivor: paste and import');
    page = ours.page;
    await page.evaluate(() => G.MenuUI.open());
    await page.click('#btn-settings');
    await page.click('#set-tabs [data-t="acc"]');
    await page.click('#set-import');
    await page.waitForSelector('#scr-import');
    await page.fill('#scr-import [data-a="paste"]', code);
    // Coins right before and after the merge itself (achievements unlocked by the imported
    // collection can pay out a moment later, on their own).
    await page.evaluate(() => {
      const adopt = G.DB.adopt;
      G.DB.adopt = d => { const b = G.DB.save.coins, ach = Object.keys(G.DB.save.ach).length, r = adopt(d);
        window.__adopt = { b, a: G.DB.save.coins, ach }; return r; };
    });
    await page.click('#scr-import [data-a="go"]');
    const msg = await page.textContent('#scr-import [data-a="msg"]');
    const after = await page.evaluate(() => ({ owned: Object.keys(G.DB.save.owned).map(Number), coins: G.DB.save.coins, name: G.DB.save.name,
      shiny25: !!G.DB.save.shiny[25], runs: G.DB.save.stats.runs, best: G.DB.save.stats.bestTime, upg: G.DB.save.pupg[6] }));
    const union = [...new Set([...before.owned, ...upSave.owned])];
    check(union.every(d => after.owned.includes(d)), `collection is the union of both (${after.owned.sort((a, b) => a - b)})`);
    check(after.shiny25 && after.runs === 42 && after.best === 900 && after.upg && after.upg.hp === 2, 'shinies, stats and upgrades came over');
    // Both accounts started with the same 500: that counts once, plus what each side earned.
    const START = await page.evaluate(() => G.DB.START_COINS);
    const ad = await page.evaluate(() => Object.assign(window.__adopt, { achNow: Object.keys(G.DB.save.ach).length }));
    check(ad.a === ad.b + (upSave.coins - START),
      `coins: ${ad.b} here + ${upSave.coins} imported, starting ${START} counted once = ${ad.a}` +
      (after.coins !== ad.a ? ` (then ${after.coins - ad.a} from ${ad.achNow - ad.ach} achievements the new Pokémon unlocked)` : ''));
    check(after.name === before.name, `kept this account's name (${after.name})`);
    check(/Imported!/.test(msg), 'success message: ' + msg);

    // Same code again: nothing changes (no duplicated coins).
    await page.click('#scr-import [data-a="close"]');
    await page.click('#set-import');
    await page.fill('#scr-import [data-a="paste"]', code);
    await page.click('#scr-import [data-a="go"]');
    const again = await page.evaluate(() => ({ owned: Object.keys(G.DB.save.owned).length, coins: G.DB.save.coins }));
    check(again.coins === after.coins && again.owned === after.owned.length, `importing twice changes nothing (${again.coins} coins)`);

    // Broken code: refused, save untouched.
    await page.click('#scr-import [data-a="close"]');
    await page.click('#set-import');
    await page.fill('#scr-import [data-a="paste"]', code.slice(0, 60));
    await page.click('#scr-import [data-a="go"]');
    const bad = await page.textContent('#scr-import [data-a="msg"]');
    check(/not a save code/i.test(bad) && (await page.evaluate(() => G.DB.save.coins)) === after.coins, 'a cut-off code is refused: ' + bad);

    // Reload: the imported save is what loads.
    await page.reload({ waitUntil: 'load' });
    await pastStart(page, '#scr-menu, #scr-starters');
    await page.waitForFunction(() => window.G && G.DB && G.DB.loggedIn, null, { timeout: 20000 });
    const reloaded = await page.evaluate(() => ({ owned: Object.keys(G.DB.save.owned).length, coins: G.DB.save.coins }));
    check(reloaded.owned === after.owned.length && reloaded.coins === after.coins, 'the import is still there after a reload');
    check(page.errs.length === 0, 'no page errors on MrSurvivor' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));

    // The branded build: the dialog must still name the original site.
    console.log('Branded build (index.html)');
    await page.goto(`${OURS}/index.html`, { waitUntil: 'load' });
    await pastStart(page, '#btn-settings');
    await page.click('#btn-settings');
    await page.click('#set-tabs [data-t="acc"]');
    const btn = await page.textContent('#set-import');
    await page.click('#set-import');
    const link = await page.getAttribute('#scr-import a[target="_blank"]', 'href');
    const title = await page.textContent('#scr-import h3');
    check(/PokéSurvivor/.test(btn) && /PokéSurvivor/.test(title), `button and title name the original game: "${btn.trim()}" / "${title.trim()}"`);
    check(link === 'https://pokesurvivor.com/', 'link goes to the original site: ' + link);
    check(page.errs.length === 0, 'no page errors on the branded build' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ours.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
