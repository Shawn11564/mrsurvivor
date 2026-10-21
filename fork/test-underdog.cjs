#!/usr/bin/env node
// Lab mode's Underdog XP, made visible (js/fork/lab/underdog.js), in headless Edge on dev.html.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-underdog.cjs [base-url]
//
//   1. With Lab on, Play shows the ladder before the run: every rarity's range (as the formula
//      gives them), Charmander's row (Common) highlighted with its +39%. Back and Escape don't
//      start a run; Start run does.
//   2. In the run the XP bar's last part is gold, in the bonus's share (k / (1 + k)) of the
//      fill, with "Underdog Bonus +39%" under it.
//   3. Charizard: the ladder says no bonus, and the bar has no gold and no text.
//   4. Random Pokémon shows the ladder for the Pokémon it picked.
//   5. No ladder: with Lab off, with "Show this before every Lab run" unticked, or when
//      G.Game.startRun is called directly (tests, co-op).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

async function menu(browser, { partner = 4, lab = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // Every string the canvas draws (to find the bar's label).
  await page.addInitScript(() => {
    window.__texts = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (window.__texts.length < 5000) window.__texts.push(String(t)); return f.apply(this, arguments); };
  });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.MenuUI && G.LabUnderdog, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
  await page.evaluate(({ partner, lab }) => {
    const s = G.DB.save;
    for (const d of [4, 6, 10]) G.DB.grant(d, 'test');
    s.partner = partner; G.DB.commit();
    G.Settings.set('lab', lab); G.Settings.set('underdogLadder', true); G.Settings.set('randMin', 1);
    G.MenuUI.open();
  }, { partner, lab });
  await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
  return { page, errs };
}
const inRun = page => page.evaluate(() => !!(G.Game.player && G.Game.state !== 'ui'));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  console.log('The ladder before a Lab run');
  let { page, errs } = await menu(browser);
  await page.click('#scr-menu [data-go=play]');
  await page.waitForSelector('#ud-ladder:not(.hidden)', { timeout: 5000 });
  check(!(await inRun(page)), 'Play shows the ladder first (no run yet)');
  const lad = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ud-row')].map(r => ({ me: r.classList.contains('me'), name: r.querySelector('b').textContent, range: r.querySelector('.ud-range').textContent, you: (r.querySelector('.ud-you') || {}).textContent || '' }));
    // The same ranges straight from the formula.
    const want = {};
    for (const m of G.DEX) { const k = G.LabGrowth.underdogK(m), b = want[m.rarity] = want[m.rarity] || [Infinity, 0]; b[0] = Math.min(b[0], k); b[1] = Math.max(b[1], k); }
    return { rows, want, k: G.LabGrowth.underdogK(G.DEX_BY[4]) };
  });
  check(lad.rows.map(r => r.name).join() === 'Legendary,Epic,Rare,Uncommon,Common', 'five rows, Legendary to Common', lad.rows.map(r => r.name));
  const pct = x => Math.round(x * 100);
  const expect = b => b[1] <= 0 ? 'no bonus' : b[0] <= 0 ? `up to +${pct(b[1])}%` : `+${pct(b[0])}% to +${pct(b[1])}%`;
  check(lad.rows.every((r, i) => r.range === expect(lad.want[5 - i])), 'each row\'s range is what the formula gives', lad.rows.map(r => r.range));
  const me = lad.rows.filter(r => r.me);
  check(me.length === 1 && me[0].name === 'Common' && me[0].you.includes('Charmander') && me[0].you.includes(`+${pct(lad.k)}% XP`),
    `Charmander's rarity (Common) is highlighted with its +${pct(lad.k)}%`, me);
  await page.click('#ud-back');
  check(await page.isHidden('#ud-ladder') && !(await inRun(page)), 'Back closes it without starting');
  await page.click('#scr-menu [data-go=play]');
  await page.waitForSelector('#ud-ladder:not(.hidden)');
  await page.keyboard.press('Escape');
  check(await page.isHidden('#ud-ladder') && !(await inRun(page)), 'Escape closes it too');
  await page.click('#scr-menu [data-go=play]');
  await page.waitForSelector('#ud-ladder:not(.hidden)');
  await page.click('#ud-go');
  await page.waitForFunction(() => G.Game.player && G.Game.state === 'playing', null, { timeout: 15000 });
  check(await page.evaluate(() => G.Lab.active && G.Game.player.dex === 4), 'Start run starts the Lab run');

  console.log('The XP bar');
  const hud = await page.evaluate(async () => {
    const pl = G.Game.player;
    pl.gainXp(pl.xpNext * 0.5 / pl.xpMul);                    // half the bar
    window.__texts.length = 0;
    await new Promise(r => setTimeout(r, 400));
    const cv = document.getElementById('game'), x = cv.getContext('2d'), w = cv.width;
    const f = pl.xp / pl.xpNext, u = pl._labUnder, end = w * f, start = end / (1 + u);
    const px = X => Array.from(x.getImageData(Math.round(X), 3, 1, 1).data);
    return { f, u, gold: px((start + end) / 2), base: px(start / 2), empty: px((end + w) / 2), label: window.__texts.find(t => t.startsWith('Underdog Bonus')) };
  });
  const isGold = p => p[0] > 200 && p[1] > 170 && p[2] < 140;
  check(isGold(hud.gold), 'the bonus\'s share of the fill is gold', hud.gold);
  check(!isGold(hud.base) && hud.base[2] > 150, 'the rest of the fill keeps its blue', hud.base);
  check(!isGold(hud.empty), 'the empty part has no gold', hud.empty);
  check(hud.label === `Underdog Bonus +${pct(hud.u)}%`, 'with "Underdog Bonus" and the % under it', hud.label);
  check(!errs.length, 'no page errors', errs);
  await page.close();

  console.log('A Pokémon with no bonus (Charizard)');
  ({ page, errs } = await menu(browser, { partner: 6 }));
  await page.click('#scr-menu [data-go=play]');
  await page.waitForSelector('#ud-ladder:not(.hidden)');
  const z = await page.evaluate(() => ({ me: document.querySelector('.ud-row.me b').textContent, you: document.querySelector('.ud-you').textContent }));
  check(z.me === 'Epic' && z.you.includes('no bonus'), 'the ladder highlights Epic and says no bonus', z);
  await page.click('#ud-go');
  await page.waitForFunction(() => G.Game.player && G.Game.state === 'playing', null, { timeout: 15000 });
  const zh = await page.evaluate(async () => {
    const pl = G.Game.player; pl.gainXp(pl.xpNext * 0.5 / pl.xpMul);
    window.__texts.length = 0; await new Promise(r => setTimeout(r, 300));
    const x = document.getElementById('game').getContext('2d'), w = document.getElementById('game').width;
    return { label: window.__texts.some(t => t.startsWith('Underdog')), px: Array.from(x.getImageData(Math.round(w * pl.xp / pl.xpNext) - 3, 3, 1, 1).data) };
  });
  check(!zh.label && !isGold(zh.px), 'no gold and no label on the bar', zh);
  await page.close();

  console.log('Random Pokémon');
  ({ page, errs } = await menu(browser));
  await page.click('#rand-go');
  await page.waitForSelector('#ud-ladder:not(.hidden)');
  const shown = await page.textContent('.ud-you');
  await page.click('#ud-go');
  await page.waitForFunction(() => G.Game.player && G.Game.state === 'playing', null, { timeout: 15000 });
  const rnd = await page.evaluate(() => G.Game.player.mon.name);
  check(['Charmander', 'Charizard', 'Caterpie'].includes(rnd) && shown.startsWith(rnd + ':'), 'Random Pokémon: the ladder is for the one it picked, and the run starts with it', { rnd, shown });
  await page.close();

  console.log('When there is no ladder');
  ({ page, errs } = await menu(browser, { lab: false }));
  await page.click('#scr-menu [data-go=play]');
  await page.waitForFunction(() => G.Game.player && G.Game.state === 'playing', null, { timeout: 15000 });
  check(await page.isHidden('#ud-ladder').catch(() => true), 'Lab off: Play goes straight in');
  await page.close();
  ({ page, errs } = await menu(browser));
  await page.click('#scr-menu [data-go=play]');
  await page.waitForSelector('#ud-ladder:not(.hidden)');
  await page.uncheck('#ud-show');
  await page.click('#ud-back');
  check(await page.evaluate(() => G.Settings.get('underdogLadder') === false), 'unticking "Show this before every Lab run" is kept');
  await page.click('#scr-menu [data-go=play]');
  await page.waitForFunction(() => G.Game.player && G.Game.state === 'playing', null, { timeout: 15000 });
  check(await page.isHidden('#ud-ladder'), 'then Play goes straight in');
  await page.close();
  ({ page, errs } = await menu(browser));
  await page.evaluate(() => G.Game.startRun());
  check(await inRun(page) && await page.isHidden('#ud-ladder').catch(() => true), 'G.Game.startRun called directly: no ladder');
  check(!errs.length, 'no page errors', errs);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
