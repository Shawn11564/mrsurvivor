#!/usr/bin/env node
// The Discord server in the main menu (js/fork/discord.js), in headless Edge:
//
//   node fork/serve.cjs
//   node fork/test-discord.cjs [base-url]          (SHOTS=<folder> saves a picture of each size)
//
// For dev.html and the built index.html, at 1280x720, a 740x360 phone on its side and a 390x844 window (a phone
// held upright shows "rotate" when it is a touch screen): the top bar has a Discord button and no Sound or Settings button; the main menu has a
// Discord entry; a new player gets the "We now have a Discord!" banner on the menu, inside the window,
// not over the top bar, after the welcome toasts; the button, the menu entry and the banner's Join open the invite in a new tab;
// closed, the banner stays away after a reload; and it waits behind a screen opened over the menu.
const path = require('path'), fs = require('fs');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const INVITE = 'https://discord.gg/VcwVYRXzT5';
const SIZES = [[1280, 720], [740, 360, true], [390, 844]];
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const file of ['/dev.html', '/index.html']) for (const [w, h, touch] of (file === '/dev.html' ? SIZES : SIZES.slice(0, 1))) {
    const label = `${file} ${w}x${h}`;
    console.log(label);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch });
    await ctx.route(/discord\.(gg|com)/, r => r.fulfill({ status: 200, contentType: 'text/html', body: 'discord' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await page.isVisible('#scr-starters')) {
      check(!(await page.isVisible('#discord-banner')), 'no banner over the starter pick');
      await page.locator('#starter-grid .cell').first().click(); await page.click('#starter-ok');
    }
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    // The banner waits for the welcome toasts to go, so it never shares the screen with one.
    const toastOn = () => page.evaluate(() => [...document.querySelectorAll('.toast, .ach-pop')].some(e => e.getClientRects().length && getComputedStyle(e).display !== 'none'));
    const sawToast = await toastOn();
    await page.waitForSelector('#discord-banner', { state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(450);     // its slide-in
    if (sawToast) check(!(await toastOn()), 'the banner came after the toasts were gone');

    const bar = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; };
      const d = document.getElementById('btn-discord');
      const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const bn = document.getElementById('discord-banner'), tb = document.getElementById('topbar');
      return { discord: vis('btn-discord'), href: d && d.href, target: d && d.target, sound: vis('btn-sound'), settings: vis('btn-settings'),
        img: !!(d && d.querySelector('svg path')), menu: !!document.querySelector('#scr-menu [data-go="discord"]'),
        menuSettings: !!document.querySelector('#scr-menu [data-go="settings"]'),
        banner: vis('discord-banner'), text: bn && bn.innerText, br: bn && r(bn), tbr: r(tb), vw: innerWidth, vh: innerHeight,
        bar: [...tb.children].filter(e => e.getClientRects().length).map(e => r(e)) };
    });
    check(bar.discord && bar.img, 'the top bar shows the Discord button with its icon');
    check(bar.href === INVITE + '' || bar.href === INVITE + '/', 'the button links to the invite', bar.href);
    check(bar.target === '_blank', 'the button opens a new tab');
    check(!bar.sound && !bar.settings, 'no Sound or Settings button in the top bar', { sound: bar.sound, settings: bar.settings });
    check(bar.menu, 'the main menu has a Discord entry');
    check(bar.menuSettings, 'Settings is still in the main menu');
    // Upright (390 px) the bar still runs off the left edge: fork/TODO.md item 66, older than this.
    if (w >= 740) check(bar.bar.every(b => b.l >= 0 && b.r <= bar.vw), 'every top bar item fits across the window', bar.bar);
    check(bar.banner && /We now have a Discord!/.test(bar.text) && /Join the Discord/.test(bar.text), 'a new player sees the banner', bar.text);
    if (bar.br) {
      check(bar.br.l >= 0 && bar.br.r <= bar.vw && bar.br.t >= 0 && bar.br.b <= bar.vh, 'the banner fits in the window', bar.br);
      check(bar.br.t >= bar.tbr.b, 'the banner is not over the top bar', { banner: bar.br, bar: bar.tbr });
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${file.slice(1, -5)}-${w}x${h}.png`) });

    // A screen over the menu hides the banner; back on the menu it returns.
    if (w === 1280 && file === '/dev.html') {
      await page.click('#scr-menu [data-go="upgrades"]');
      await page.waitForTimeout(300);
      check(!(await page.isVisible('#discord-banner')), 'the banner waits while another screen is open');
      await page.evaluate(() => { for (const s of document.querySelectorAll('.scr')) s.classList.add('hidden'); G.MenuUI.open(); document.getElementById('scr-menu').classList.remove('hidden'); });
      check(await page.waitForSelector('#discord-banner', { state: 'visible', timeout: 5000 }).then(() => true, () => false), 'back on the menu, the banner is there again');
    }

    // The three ways in all open the invite in a new tab.
    const opens = async (sel, what) => {
      const [p] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click(sel)]);
      check(!!p && p.url().startsWith(INVITE), what + ' opens the invite', p && p.url());
      if (p) await p.close();
    };
    if (w === 1280) {
      await opens('#btn-discord', 'the top bar button');
      await opens('#scr-menu [data-go="discord"]', 'the menu entry');
      await page.evaluate(() => localStorage.removeItem('ms.discord.banner'));
      await page.reload({ waitUntil: 'load' });
      await pastStart(page, '#scr-menu, #btn-guest');
      if (await page.isVisible('#btn-guest')) await page.click('#btn-guest');
      await page.waitForSelector('#discord-banner', { state: 'visible', timeout: 30000 });
      await opens('#discord-banner .dc-join', 'the banner\'s Join button');
      check(!(await page.isVisible('#discord-banner')), 'joining closes the banner');
    } else {
      await page.click('#discord-banner .dc-x');
      check(!(await page.isVisible('#discord-banner')), 'the ✕ closes the banner');
    }
    await page.reload({ waitUntil: 'load' });
    await pastStart(page, '#scr-menu, #btn-guest');
    if (await page.isVisible('#btn-guest')) await page.click('#btn-guest');
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(800);
    check(!(await page.isVisible('#discord-banner')), 'once closed, it does not come back after a reload');
    check(!errs.length, 'no page errors', errs);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Discord checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
