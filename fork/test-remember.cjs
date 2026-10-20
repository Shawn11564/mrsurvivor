#!/usr/bin/env node
// Screens remember their state across reloads (js/fork/remember.js, js/ui/menu.js), in headless Edge.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-remember.cjs [base-url]
//
//   1. Settings opens on the last tab you looked at, after a reload too, and so does the
//      Settings button in the pause menu (it used to always open Sound).
//   2. Missions / Achievements / Profile opens on its last tab after a reload; opening it from
//      the name pill (Profile) uses and remembers Profile.
//   3. The Pokémon screen keeps its generation, filters and sort after a reload (not the search).
//   4. The same on the built index.html.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// Into the menu as a guest. dev.html skips the starter quiz; the built page answers it.
async function toMenu(page, file) {
  await page.goto(BASE + '/' + file, { waitUntil: 'load' });
  if (file === 'dev.html') await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.SettingsUI, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  if (file === 'dev.html') {
    await page.evaluate(() => { G.DB.save.owned[4] = G.DB.save.owned[4] || { at: Date.now() }; G.DB.save.partner = 4; G.MenuUI.open(); });
  } else {
    for (let i = 0; i < 20 && !(await page.isVisible('#scr-result')); i++) {
      await page.click('#test-a button >> nth=0').catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.click('#res-ok');
  }
  await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
}
const onTab = (page, sel) => page.evaluate(s => { const b = document.querySelector(s + ' .on'); return b && (b.dataset.t || b.dataset.tab); }, sel);
const dexState = page => page.evaluate(() => ({
  gen: [...document.querySelectorAll('#dex-gens .gen-tab')].findIndex(b => b.classList.contains('on')),
  filters: [...document.querySelectorAll('#dex-filters .chip.on')].map(c => c.textContent.trim()),
  sort: (document.querySelector('#dex-sort .chip.on') || {}).textContent,
  type: document.getElementById('dex-type').value,
  q: document.getElementById('dex-q').value
}));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await toMenu(page, 'dev.html');

  console.log('Before the reload');
  await page.click('#btn-settings');
  check(await onTab(page, '#set-tabs') === 'sound', 'Settings opens on Sound the first time');
  await page.click('#set-tabs [data-t="ctl"]');
  await page.click('#set-close');
  await page.click('#btn-settings');
  check(await onTab(page, '#set-tabs') === 'ctl', 'reopened: Controls');
  await page.click('#set-close');

  await page.click('#scr-menu [data-go="goals"]');
  check(await onTab(page, '#goals-tabs') === 'missions', 'Missions screen opens on Missions the first time');
  await page.click('#goals-tabs [data-tab="ach"]');
  await page.evaluate(() => G.MenuUI.open());

  await page.click('#scr-menu [data-go="dex"]');
  await page.click('#dex-gens .gen-tab >> nth=0');                       // All
  await page.click('#dex-filters .chip >> nth=1');                    // Owned
  await page.click('#dex-filters .chip >> nth=-1');                     // a rarity
  await page.click('#dex-sort .chip >> nth=2');                         // Rarity
  await page.selectOption('#dex-type', 'fire');
  await page.fill('#dex-q', 'char');
  await page.waitForTimeout(300);
  const before = await dexState(page);
  await page.evaluate(() => G.MenuUI.open());

  console.log('After a reload');
  await toMenu(page, 'dev.html');
  await page.click('#btn-settings');
  check(await onTab(page, '#set-tabs') === 'ctl', 'Settings opens on Controls');
  await page.click('#set-close');
  await page.click('#scr-menu [data-go="goals"]');
  check(await onTab(page, '#goals-tabs') === 'ach', 'Missions screen opens on Achievements');
  await page.evaluate(() => G.MenuUI.open());
  await page.click('#user-pill');
  check(await onTab(page, '#goals-tabs') === 'profile', 'the name pill opens Profile');
  await page.evaluate(() => G.MenuUI.open());
  await page.click('#scr-menu [data-go="goals"]');
  check(await onTab(page, '#goals-tabs') === 'profile', 'and the screen remembers Profile');
  await page.evaluate(() => G.MenuUI.open());
  await page.click('#scr-menu [data-go="dex"]');
  const after = await dexState(page);
  check(after.gen === 0 && after.sort === before.sort && after.type === 'fire'
    && JSON.stringify(after.filters) === JSON.stringify(before.filters),
    'Pokémon screen keeps generation, filters, sort and type', { before, after });
  check(after.q === '', 'but not the search');
  await page.evaluate(() => G.MenuUI.open());

  console.log('In a run');
  await page.evaluate(() => G.Game.startRun());
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#btn-pause-settings', { state: 'visible', timeout: 10000 });
  await page.click('#btn-pause-settings');
  check(await onTab(page, '#set-tabs') === 'ctl', 'the pause menu\'s Settings button opens Controls too');
  await page.click('#set-tabs [data-t="lab"]');
  await page.click('#set-close');
  await page.click('#btn-pause-settings');
  check(await onTab(page, '#set-tabs') === 'lab', 'and Experimental after picking it there');
  check(!errors.length, 'no page errors', errors);

  console.log('Built page (index.html)');
  const built = await ctx.newPage();
  const berr = [];
  built.on('pageerror', e => berr.push(String(e)));
  await toMenu(built, 'index.html');
  await built.click('#btn-settings');
  check(await onTab(built, '#set-tabs') === 'lab', 'Settings opens on the remembered tab (Experimental)');
  await built.click('#set-close');
  await built.click('#scr-menu [data-go="dex"]');
  check((await dexState(built)).type === 'fire', 'the Pokémon screen keeps its type filter');
  check(!berr.length, 'no page errors on the built page', berr);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll remember checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
