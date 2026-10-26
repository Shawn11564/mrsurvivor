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
// The reward (an account in local mode, at 1280x720 and 740x360): a purple ×10 ticket with +5 next to the button and on
// the banner's Join until the invite is opened; opening it gives 5 ×10 tickets once, and never again (more clicks,
// a reload and logging back in, a merge with a newer copy that hadn't claimed it); a guest gets no badge and no tickets.
const path = require('path'), fs = require('fs');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const INVITE = 'https://discord.gg/VcwVYRXzT5';
const SIZES = [[1280, 720], [740, 360, true], [390, 844]];
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// What the reward looks like on the page now.
const state = page => page.evaluate(() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  const tix = el => { const t = el && el.querySelector('.dc-tix'); return t && vis(t) ? { img: !!t.querySelector('img'), text: t.innerText.trim() } : null; };
  const s = G.DB.save, tb = document.getElementById('topbar'), toast = document.querySelector('.toast');
  return { t10: s.tickets.t10, at: s.discord || 0, btn: tix(document.getElementById('btn-discord')), join: tix(document.querySelector('#discord-banner .dc-join')),
    gift: vis(document.querySelector('#discord-banner .dc-gift')), toast: vis(toast) ? toast.textContent : '', vw: innerWidth,
    bar: [...tb.children].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right }; }) };
});

// The reward, for an account (local mode: no Firebase).
async function reward(browser, w, h, touch) {
  const label = `reward ${w}x${h}`;
  console.log(label);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch });
  await ctx.route(/discord\.(gg|com)/, r => r.fulfill({ status: 200, contentType: 'text/html', body: 'discord' }));
  await ctx.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  const name = 'dc' + w + Date.now().toString(36).slice(-5);
  const login = async fresh => {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#login-form, #scr-menu');
    const r = await page.evaluate(async ([n, fresh]) => {
      const res = fresh ? await G.DB.register(n, 'pw-' + n) : (G.DB.save ? { ok: true } : await G.DB.login(n, 'pw-' + n));
      if (!res.ok) return res;
      if (fresh) { const s = G.DB.save; s.partner = 4; s.owned[4] = { at: Date.now(), from: 'test' }; G.DB.commit(); }
      if (document.getElementById('scr-menu').classList.contains('hidden')) G.Flow.afterLogin();
      for (const id of ['scr-savenote', 'scr-recover']) document.getElementById(id).classList.add('hidden');
      return { ok: true, guest: G.DB.guest, mode: G.DB.mode };
    }, [name, fresh]);
    if (!r.ok || r.guest) throw new Error(label + ' login: ' + JSON.stringify(r));
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
  };
  await login(true);
  await page.waitForSelector('#discord-banner', { state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(450);     // the banner's slide-in
  let st = await state(page);
  check(!!st.btn && st.btn.img && st.btn.text === '+5', 'an account sees the purple ticket with +5 on the Discord button', st.btn);
  check(!!st.join && st.join.img && st.join.text === '+5', '...and on the banner\'s Join', st.join);
  check(st.gift, 'the banner says what joining gives');
  check(st.bar.every(b => b.l >= 0 && b.r <= st.vw), 'every top bar item still fits across the window', st.bar);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `reward-${w}x${h}.png`) });
  const before = st.t10;
  const [p] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click(w === 1280 ? '#btn-discord' : '#discord-banner .dc-join')]);
  check(!!p && p.url().startsWith(INVITE), 'it still opens the invite', p && p.url());
  if (p) await p.close();
  await page.waitForFunction(() => G.DB.save.discord > 0, null, { timeout: 5000 }).catch(() => {});
  st = await state(page);
  check(st.t10 === before + 5 && st.at > 0, 'opening the invite gives 5 ×10 tickets', { before, after: st.t10 });
  check(/\+5 ×10 tickets/.test(st.toast), 'a toast says so', st.toast);
  check(!st.btn && !st.join, 'the badges are gone once claimed', { btn: st.btn, join: st.join });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `reward-${w}x${h}-claimed.png`) });
  const pill = await page.evaluate(() => document.getElementById('tickets-pill').innerText);
  check(pill.includes(String(st.t10)), 'the ticket count at the top shows them', pill);
  if (w === 1280) {
    await page.click('#btn-discord');
    await page.click('#scr-menu [data-go="discord"]');
    await page.waitForTimeout(500);
    for (const q of ctx.pages()) if (q !== page) await q.close();
    check((await state(page)).t10 === before + 5, 'opening it again gives nothing more');
  }
  // A merge with a newer copy that hadn't claimed it (another device) keeps the claim.
  const m = await page.evaluate(() => {
    const now = JSON.parse(JSON.stringify(G.DB.save)), old = JSON.parse(JSON.stringify(now));
    delete old.discord; old.updated = Date.now() + 5000;
    const r = G.DB.merge(now, old);
    return { at: r.discord || 0 };
  });
  check(m.at > 0, 'a merge with a newer copy without the claim keeps it', m);
  // A reload (and logging back in if asked): still claimed, no badge.
  await login(false);
  await page.waitForTimeout(500);
  st = await state(page);
  check(st.at > 0 && st.t10 === before + 5 && !st.btn, 'after a reload the account has its tickets and no badge', { t10: st.t10, btn: st.btn });
  check(!errs.length, 'no page errors', errs);
  await ctx.close();
}

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
      const dev = file === '/dev.html';     // the built page keeps G to itself
      const g0 = dev && await page.evaluate(() => ({ t10: G.DB.save.tickets.t10, guest: G.DB.guest }));
      check(!(await page.$('.dc-tix')), 'a guest sees no ticket badge');
      await opens('#btn-discord', 'the top bar button');
      if (dev) check(g0.guest && await page.evaluate(t => G.DB.save.tickets.t10 === t && !G.DB.save.discord, g0.t10), 'a guest gets no tickets for it');
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
  for (const [w, h, touch] of SIZES.slice(0, 2)) await reward(browser, w, h, touch);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Discord checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
