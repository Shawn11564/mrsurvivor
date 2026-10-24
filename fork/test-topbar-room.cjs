#!/usr/bin/env node
// Screens opened from the main menu stay below its top bar (coins, tickets, user...) (js/fork/topbar-room.js),
// in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-topbar-room.cjs [base-url]          (SHOTS=<folder> saves each screen that overlapped)
//
// Every entry the main menu and the top bar offer (menu items, the Radiant Ritual, Trade, the bar's
// buttons and pills) is clicked, at 1280x720, 1366x600, 1024x500 and on 860x412 and 740x360 touch screens
// (phones on their side), and at 2560x1440 and 3840x2160, where js/fork/ui-scale.js zooms the pages. For each screen that opens, its content (the screen's children) must start below the bar
// wherever the two share columns, fit in the window, and stay there when scrolled to the bottom (the box
// scrolls inside); the room above a screen's content ends just below the bar (the zoom didn't scale it twice). Before the fix the Kecleon Shop and the Radiant Ritual ran under the bar on a desktop,
// and at 740x360 the collection, Upgrades, Shop, gacha, ritual, goals and support screens did.
// The built index.html is checked at 1366x600.
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const SIZES = [[1280, 720], [1366, 600], [1024, 500], [860, 412, true], [740, 360, true], [2560, 1440], [3840, 2160]];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const size = async (file, [w, h, touch]) => {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await page.isVisible('#scr-starters')) { await page.locator('#starter-grid .cell').first().click(); await page.click('#starter-ok'); }
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    // dev.html only: a long collection, coins, tickets, gems and shinies, so the screens and the bar are full
    // (index.html hides G).
    await page.evaluate(() => {
      if (!window.G) return;
      const s = G.DB.save;
      for (let d = 1; d < 200; d++) s.owned[d] = s.owned[d] || { at: 1 };
      for (let d = 1; d < 30; d++) G.DB.grantShiny(d, 'test');
      s.coins = 99999; s.tickets = { t1: 50, t10: 12 }; s.gems = 1234; G.DB.commit(); G.MenuUI.open();
    });
    const menu = () => page.evaluate(() => {
      for (const s of document.querySelectorAll('.scr')) if (s.id !== 'scr-menu') s.classList.add('hidden');
      document.getElementById('scr-menu').classList.remove('hidden');
    });
    const entries = await page.evaluate(() => [...new Set([...document.querySelectorAll('#scr-menu [data-go], #scr-menu button[id], #topbar button[id], #topbar .pill[id]')]
      .filter(e => e.offsetParent && e.dataset.go !== 'play' && e.id !== 'rand-go' && e.id !== 'btn-logout' && e.id !== 'btn-full')
      .map(e => e.id ? '#' + e.id : `#scr-menu [data-go="${e.dataset.go}"]`))]);
    const label = `${w}x${h}${touch ? ' touch' : ''}${file === '/index.html' ? ' (index.html)' : ''}`;
    const bad = [], seen = [];
    for (const sel of entries) {
      await menu();
      await page.waitForTimeout(100);
      try { await page.click(sel, { timeout: 1500 }); } catch (e) { continue; }
      await page.waitForTimeout(450);
      const measure = () => page.evaluate(() => {
        const bar = document.getElementById('topbar');
        if (bar.classList.contains('hidden')) return null;
        const parts = [...bar.children].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
        const bb = Math.max(...parts.map(r => r.bottom)), bl = Math.min(...parts.map(r => r.left));
        const out = [];
        for (const s of document.querySelectorAll('.scr')) {
          if (s.id === 'scr-menu' || s.classList.contains('hidden') || getComputedStyle(s).display === 'none') continue;
          const z = parseFloat(getComputedStyle(s).zoom) || 1, padTop = parseFloat(getComputedStyle(s).paddingTop) * z;
          for (const c of s.children) {
            const r = c.getBoundingClientRect();
            if (!r.height || getComputedStyle(c).display === 'none') continue;
            out.push({ scr: s.id, el: (c.className || c.tagName).toString().slice(0, 30), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right),
                       under: r.top < bb - 0.5 && r.right > bl, below: r.bottom > innerHeight + 0.5,
                       // the screen's room above its content ends just below the bar, in window pixels (the
                       // zoom of js/fork/ui-scale.js mustn't scale it twice)
                       far: padTop > bb + 12 * z + 2, room: Math.round(padTop) });
          }
        }
        return { bb: Math.round(bb), out, h: innerHeight };
      });
      const m = await measure();
      if (!m || !m.out.length) continue;
      // Scrolled to the bottom: the content scrolls inside its box and stays put.
      await page.evaluate(() => { for (const s of document.querySelectorAll('.scr:not(.hidden)')) { s.scrollTop = 1e6; for (const b of s.querySelectorAll('*')) if (b.scrollHeight > b.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(b).overflowY)) b.scrollTop = 1e6; } });
      await page.waitForTimeout(100);
      const m2 = await measure();
      for (const [when, mm] of [['open', m], ['scrolled', m2]]) for (const o of mm.out) if (o.under || o.below || o.far) bad.push({ sel, when, ...o, bar: mm.bb });
      seen.push(m.out[0].scr);
      if (process.env.SHOTS && m.out.some(o => o.under)) await page.screenshot({ path: path.join(process.env.SHOTS, `topbar-${w}x${h}-${m.out[0].scr}.png`) });
    }
    check(seen.length >= (file === '/index.html' ? 5 : 8), `${label}: screens opened from the menu`, [...new Set(seen)]);
    check(!bad.length, `${label}: every one starts below the top bar and fits the window, scrolled too`, bad.slice(0, 6));
    check(!errs.length, `${label}: no page errors`, errs.slice(0, 3));
    await page.context().close();
  };
  try {
    for (const s of SIZES) await size('/dev.html', s);
    await size('/index.html', [1366, 600]);
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll top bar room checks passed');
  process.exit(failures ? 1 : 0);
})();
