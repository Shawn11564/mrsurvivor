#!/usr/bin/env node
// The run's end screen fits the screen without scrolling (js/fork/over-fit.js), in headless Edge:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-over-fit.cjs [base-url]          SHOTS=<dir> for screenshots
//
//   1. dev.html at 3840×2160, 2560×1440, 1920×1080 and 1280×720: a long run's end screen (what knocked you
//      out and the last hits, Arceus, coins with the breakdown, tickets, four moves in the table, two
//      shinies, the record) is inside the window and doesn't scroll; the text stays readable (the box's
//      zoom is at least over-fit's MIN), and a real click on "Back to menu" works. Before, it was
//      about 1.4 times the room and scrolled at every size.
//   2. A short run at 4K isn't zoomed down at all.
//   3. The built index.html at 4K: the end screen's box is the wide one (G is sealed there).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  async function open(w, h) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(w + ': ' + e.message));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.UIScale && G.OverFit, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await page.evaluate(async () => {
      G.DB.grant(4, 't'); G.DB.save.partner = 4; G.Settings.set('lab', false); G.DB.commit();
      G.UI.hideAll(); G.Game.toUI(); G.Game.startRun();
      await new Promise(r => setTimeout(r, 1000));
      G.Game.player.hurt = () => {};
    });
    return page;
  }
  // The end screen with what a long run gives it (the real showOver and the fork's wrappers draw it).
  const longRun = page => page.evaluate(async () => {
    const pl = G.Game.player;
    for (const m of ['tackle', 'quickattack', 'flamethrower']) pl.addMove(m);
    pl.moves.forEach((m, i) => { m.dealt = 120000 - i * 20000; m.lvl = 5 + i; });
    pl.dmgDealt = 380000;
    pl.killedBy = { name: 'Gyarados', dex: 130, how: 'touch', boss: true, dmg: 90 };
    pl.deathLog = [1, 2, 3, 4, 5].map(i => ({ name: 'Golbat', dex: 42, how: 'shot', dmg: 40 + i }));
    G.RunUI.showOver({ dead: true, time: 1500, level: 48, kills: 2140, bosses: 6, judge: { time: 1800, bosses: 3 }, coins: 1840,
      breakdown: 'Time 600 · Defeated 640 · Bosses 300 · Level 300', t1: 3, t10: 1,
      mine: G.RunStats.mine(1500), moves: [], caught: [{ dex: 25, isNew: true }, { dex: 133, isNew: false }], record: true }, () => G.UI.hide('scr-over'));
  });
  const measure = page => page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 500));
    const b = document.querySelector('#scr-over > .box'), r = b.getBoundingClientRect(), btn = document.getElementById('btn-again').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, scrolls: b.scrollHeight > b.clientHeight + 1,
      zoom: +(+(b.style.zoom || 1)).toFixed(2), btnIn: btn.top >= 0 && btn.bottom <= innerHeight, btn: { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 } };
  });

  try {
    console.log('1. A long run');
    for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080], [1280, 720]]) {
      const page = await open(w, h);
      await longRun(page);
      const m = await measure(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/over-${w}.png` });
      const MIN = await page.evaluate(() => G.OverFit.MIN);
      check(m.top >= 0 && m.bottom <= m.h && !m.scrolls && m.btnIn && m.zoom >= MIN, `${w}×${h}: the whole end screen is on screen, no scrolling (zoom ${m.zoom})`, m);
      await page.mouse.click(m.btn.x, m.btn.y);
      check(!(await page.evaluate(() => G.UI.isOpen('scr-over'))), `${w}×${h}: a real click on Back to menu works`);
      if (w === 3840) {
        console.log('2. A short run');
        await page.evaluate(() => G.RunUI.showOver({ dead: true, time: 60, level: 3, kills: 12, bosses: 0, coins: 20, breakdown: '', mine: G.RunStats.mine(60), moves: [], caught: [] }, () => {}));
        const s = await measure(page);
        check(!s.scrolls && s.zoom === 1, 'a short run at 4K: it fits as it is, not zoomed down', s);
      }
      await page.context().close();
    }

    console.log('3. The built index.html');
    const ctx = await browser.newContext({ viewport: { width: 3840, height: 2160 }, serviceWorkers: 'block', locale: 'en-US' });
    const built = await ctx.newPage();
    built.on('pageerror', e => errs.push('index.html: ' + e.message));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    const bw = await built.evaluate(() => {
      const s = document.getElementById('scr-over');
      s.classList.remove('hidden');
      const w = s.querySelector('.box').getBoundingClientRect().width / +getComputedStyle(document.documentElement).getPropertyValue('--ui-k');
      s.classList.add('hidden');
      return Math.round(w);
    });
    check(bw > 900, 'index.html: the end screen\'s box is the wide one', bw);
    await ctx.close();

    check(!errs.length, 'no page errors', errs);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
