#!/usr/bin/env node
// Sound only while the tab is open and focused (js/fork/focus-audio.js), in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-focus-audio.cjs [base-url]
//
// Headless pages all say they have the focus; with focus emulation off (CDP) bringing another page to the
// front really takes it away (window blur, document.hasFocus() false), as another window or tab would.
//   1. dev.html: after a click the game's AudioContext runs and the menu music plays; another page in front:
//      the context is suspended (no music, no effects) within half a second; back in front it runs again by
//      itself (no click), the same track, and the music clock moves on again.
//   2. A sound effect played while the page is in the background doesn't come out later in a burst: the
//      context stays suspended, and on returning the clock goes on from where it stopped.
//   3. The built index.html does the same.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=user-gesture-required'] });
  const run = async (file, label) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => {
      try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ }
      // The game hides its AudioContext (and, on index.html, G): the test keeps its own handle on it the
      // same way, before the game's scripts run.
      const AC = window.AudioContext;
      window.AudioContext = class extends AC { constructor(o) { super(o); window.__ctx = window.__ctx || this; } };
    });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await (await ctx.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: false });   // after the load: it resets
    await page.bringToFront();
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');                                  // a real click: the sound unlocks
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    const st = () => page.evaluate(() => ({ state: window.__ctx && window.__ctx.state, t: window.__ctx && +window.__ctx.currentTime.toFixed(2), focus: document.hasFocus() }));
    const until = async (f, ms = 3000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(); if (f(s)) return s; await sleep(50); } return s; };

    const on = await until(s => s.state === 'running');
    check(on.state === 'running' && on.focus, `${label}: after a click the sound runs`, on);
    const other = await ctx.newPage();
    await other.goto(BASE + '/version.json');
    await other.bringToFront();
    const t0 = Date.now(), off = await until(s => s.state === 'suspended', 2000), took = Date.now() - t0;
    check(off.state === 'suspended' && !off.focus && took < 500, `${label}: another page in front: the sound stops (within half a second)`, { ...off, took });
    // 2. an effect while in the background, and the clock while away
    if (file === '/dev.html') await page.evaluate(() => { G.Audio.sfx('levelup'); G.Audio.sfx('click'); });
    await sleep(800);
    const away = await st();
    check(away.state === 'suspended' && Math.abs(away.t - off.t) < 0.05, `${label}: it stays silent while away (the clock doesn't move)`, { off: off.t, away: away.t });
    await page.bringToFront();
    const back = await until(s => s.state === 'running');
    await sleep(400);
    const later = await st();
    check(back.state === 'running' && back.focus, `${label}: back in front, the sound comes back by itself (no click)`, back);
    check(later.t > back.t && back.t - away.t < 0.2, `${label}: and goes on from where it stopped`, { away: away.t, back: back.t, later: later.t });
    if (file === '/dev.html') {
      const track = await page.evaluate(() => G.Audio.track);
      check(!!track, 'dev.html: the menu music is playing again', track);
    }
    check(!errs.length, `${label}: no page errors`, errs.slice(0, 3));
    await ctx.close();
  };
  try {
    console.log('1-2. dev.html');
    await run('/dev.html', 'dev.html');
    console.log('3. The built page');
    await run('/index.html', 'index.html');
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll focus audio checks passed');
  process.exit(failures ? 1 : 0);
})();
