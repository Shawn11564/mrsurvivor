#!/usr/bin/env node
// The Lab switch next to Play (js/fork/lab/lab-toggle.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-lab-toggle.cjs [base-url]
//
//   1. On the menu, at the right end of the Play button's row: a "LAB" switch and an "i".
//   2. The switch is the Lab mode setting: flipping it turns Lab mode on (Settings → Experimental shows it
//      on, the Play button's Underdog tag appears) without starting a run, and the other way round:
//      changed in Settings, the switch follows. It stays after a reload.
//   3. The "i": hidden until hovered, then what Lab mode is and what it doesn't count for (leaderboards,
//      achievements, records) and that the host decides in co-op. A tap opens it too (touch screens).
//   4. Play still starts a run.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[10] = { at: Date.now(), from: 'starter' }; s.partner = 10; s.starter = 10; G.Settings.set('lab', false); G.Settings.set('underdogLadder', false); G.DB.commit(); G.Flow.goMenu(); });
    await page.waitForSelector('#scr-menu [data-go=play]', { state: 'visible' });
    const state = () => page.evaluate(() => {
      const play = document.querySelector('#scr-menu [data-go=play]').getBoundingClientRect(), sw = document.getElementById('lab-q'), i = document.querySelector('.lab-i');
      const r = sw && sw.getBoundingClientRect(), ri = i && i.getBoundingClientRect(), tip = document.querySelector('.lab-tip');
      const tag = document.getElementById('ud-play');
      return { has: !!sw && !!i, on: sw ? document.getElementById('lab-q-on').checked : null, lab: !!G.Settings.get('lab'),
        right: r ? r.left > play.left + play.width / 2 && ri.right <= play.right + 1 : false, row: r ? r.top < play.bottom && r.bottom > play.top && ri.top < play.bottom && ri.bottom > play.top : false,
        visible: r ? r.width > 0 && r.height > 0 : false, tip: tip ? { shown: getComputedStyle(tip).visibility === 'visible' && getComputedStyle(tip).opacity !== '0', text: tip.textContent.replace(/\s+/g, ' ').trim() } : null,
        tag: !!tag && !tag.classList.contains('hidden'), st: G.Game.state };
    });

    console.log('1. Next to Play');
    let s = await state();
    check(s.has && s.visible && s.right && s.row, 'a LAB switch and an "i" on the Play button row, at its right end', s);
    check(s.on === false && !s.lab, 'off, like the setting', s);

    console.log('2. It is the setting');
    await page.click('#lab-q');
    s = await state();
    check(s.on === true && s.lab && s.st === 'ui', 'flipped on: Lab mode is on, no run started', s);
    check(s.tag, 'the Play button now shows the Underdog tag');
    const setOn = await page.evaluate(async () => { G.SettingsUI.open('lab'); await new Promise(r => setTimeout(r, 100)); const i = document.querySelector('#scr-settings button.switch[data-k="lab"]'); const r = i ? i.classList.contains('gold') : null; G.SettingsUI.close(); return r; });
    check(setOn === true, 'Settings → Experimental shows it on', setOn);
    await page.evaluate(() => G.Settings.set('lab', false));
    s = await state();
    check(s.on === false && !s.tag, 'turned off in Settings: the switch follows, the tag goes', s);
    await page.click('#lab-q');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && document.getElementById('lab-q') && G.UI.isOpen('scr-menu'), null, { timeout: 30000 });
    s = await state();
    check(s.on === true && s.lab, 'on after a reload', s);

    console.log('3. The "i"');
    await page.mouse.move(5, 5);
    s = await state();
    check(s.tip && !s.tip.shown, 'hidden until hovered', s.tip);
    await page.hover('.lab-i');
    await page.waitForTimeout(250);
    s = await state();
    check(s.tip && s.tip.shown && /leaderboards/.test(s.tip.text) && /achievements/.test(s.tip.text) && /records/.test(s.tip.text) && /host/.test(s.tip.text),
      'hovered: what Lab mode is, no leaderboards / achievements / records, the host decides in co-op', s.tip);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('.lab-i').click());
    await page.waitForTimeout(250);
    s = await state();
    check(s.tip && s.tip.shown, 'a tap opens it too', s.tip);

    console.log('4. Play');
    await page.evaluate(() => document.querySelector('#scr-menu [data-go=play]').click());
    check(await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 10000 }).then(() => true, () => false), 'Play still starts a run');
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab switch checks passed');
  process.exit(failures ? 1 : 0);
})();
