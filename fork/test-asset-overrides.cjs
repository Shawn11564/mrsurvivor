#!/usr/bin/env node
// Art swapped from the Asset Admin, in the game (js/fork/asset-overrides.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-asset-overrides.cjs [base-url]
//
//   1. A sheet in asset-rev.json is asked for with ?v=<hash> (others as before), also when the
//      game asked for it before the list came in (it's asked for again).
//   2. A code icon in icon-overrides.json: G.Icons.html/url give its PNG, at the code icon's
//      size; G.Icons.draw draws the PNG at the same place and size; the <img> already on screen
//      and the CSS variable change; a Lab card's arrow uses it too (an own-size PNG at half its size, 9).
//   3. Bad entries are ignored: a path out of assets/icons/code/, a bad hash, a path with "..".
//   4. With the service worker (which keeps art forever): the sheet with ?v= is fetched and
//      kept as its own entry, so the new version reaches a player who had the old one.
const fs = require('fs'), path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const { encode } = require('./radiant-fixtures.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const REPO = path.join(__dirname, '..');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const solid = (w, h, rgba) => { const px = Buffer.alloc(w * h * 4); for (let i = 0; i < px.length; i += 4) px.set(rgba, i); return encode({ w, h, px }); };

const V = 'abc123def0';
const REV = { 'assets/pokemon/4/Idle.png': V, 'assets/../fork/x.png': 'abc123', 'assets/pokemon/4/Walk.png': 'NOT-HEX' };
const ICONS = {
  coin: { file: 'assets/icons/code/coin.png', v: '1111111111', w: 48, h: 48 },
  'lb-y': { file: 'assets/icons/code/lb-y.png', v: '2222222222', w: 52, h: 52 },
  'lb-g': { file: 'assets/icons/code/lb-g.png', v: '4444444444', w: 18, h: 18, own: true },    // its own size (the artist's arrows)
  heart: { file: '../../evil.png', v: '3333333333', w: 12, h: 12 },
  star: { file: 'assets/icons/code/star.png', v: 'zz', w: 12, h: 12 }
};

async function game(browser, { rev = REV, icons = ICONS, hold = false, slowArt = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('request', r => reqs.push(r.url()));
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/js/fork/asset-rev.json*', async r => { if (hold) await held; r.fulfill({ contentType: 'application/json', body: JSON.stringify(rev) }); });
  await page.route('**/js/fork/icon-overrides.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(icons) }));
  // slowArt: badge-art.js (which adds the arrows to G.Icons) comes late, so the lists are in first.
  if (slowArt) await page.route('**/js/fork/lab/badge-art.js*', async r => { await new Promise(ok => setTimeout(ok, slowArt)); r.continue(); });
  await page.route('**/assets/icons/code/*.png*', r => { const n = r.request().url().match(/code\/([^/?]+)\.png/)[1];
    r.fulfill({ contentType: 'image/png', body: n === 'coin' ? solid(48, 48, [255, 0, 200, 255]) : n === 'lb-g' ? solid(18, 18, [0, 200, 0, 255]) : solid(52, 52, [0, 255, 255, 255]) }); });
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.AssetOverrides && G.DB, null, { timeout: 30000 });
  await page.addStyleTag({ url: BASE + '/css/brand.css' });
  return { ctx, page, errs, reqs, release };
}
const startRun = (page, dex, lab = false) => page.evaluate(([dex, lab]) => {
  if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
  G.UI.hideAll(); G.Game.toUI();
  G.DB.grant(dex, 't'); G.DB.save.partner = dex; G.Settings.set('lab', lab); G.Settings.set('underdogLadder', false); G.DB.commit();
  G.Game.startRun(); G.Game.player.hurt = () => {};
}, [dex, lab]);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    console.log('1. Sheets in asset-rev.json');
    let g = await game(browser);
    await g.page.evaluate(() => G.AssetOverrides.loaded);
    await pastStart(g.page, '#btn-guest'); await g.page.click('#btn-guest');
    await g.page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await startRun(g.page, 4);
    await g.page.waitForTimeout(800);
    const idle = g.reqs.filter(u => /assets\/pokemon\/4\/Idle\.png/.test(u)), walk = g.reqs.filter(u => /assets\/pokemon\/4\/Walk\.png/.test(u));
    check(idle.length && idle.every(u => u.includes('?v=' + V)), 'Charmander\'s Idle (in the list): asked for with ?v=' + V, idle.map(u => u.split('/').slice(-2).join('/')));
    check(walk.length && walk.every(u => !u.includes('v=')), 'its Walk (a bad hash in the list): as before', walk.map(u => u.split('/').slice(-2).join('/')));
    check(JSON.stringify(Object.keys(await g.page.evaluate(() => G.AssetOverrides.rev()))) === '["assets/pokemon/4/Idle.png"]', 'only the good entry is used ("..", bad hash dropped)');

    console.log('2. Code icons in icon-overrides.json');
    // The PNGs swap in once they've loaded (the CSS variable is the last thing to change).
    await g.page.waitForFunction(() => /code\/coin\.png/.test(document.documentElement.style.getPropertyValue('--ico-coin')), null, { timeout: 10000 }).catch(() => {});
    const ic = await g.page.evaluate(async () => {
      const code = document.createElement('canvas');
      const out = { names: G.AssetOverrides.icons().sort(), html: G.Icons.html('coin', 24), url: G.Icons.url('coin'), css: document.documentElement.style.getPropertyValue('--ico-coin') };
      // Canvas: what G.Icons.draw puts down for the badge (13×13 drawn at 26).
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), seen = [], od = x.drawImage;
      x.drawImage = function (img, ...a) { seen.push([img.src || 'canvas', ...a.map(Math.round)]); return od.apply(this, arguments); };
      G.Icons.draw(x, 'lb-y', 10, 10, 26);
      const px = x.getImageData(20, 20, 1, 1).data;
      out.draw = seen; out.px = [...px];
      out.size = [G.Icons.canvas('lb-y').width, G.Icons.canvas('coin').width];
      // Its own size: 18 where the game asks for 13, 36 where it asks for 26, and that's what layouts measure.
      const seen2 = []; x.drawImage = function (img, ...a) { seen2.push(a.map(Math.round)); return od.apply(this, arguments); };
      G.Icons.draw(x, 'lb-g', 0, 0, 13);
      G.Icons.draw(x, 'lb-g', 0, 0, 6.5);
      const wh = h => h.match(/width="(\d+)" height="(\d+)"/).slice(1).join('x');
      out.own = { h13: wh(G.Icons.html('lb-g', 13)), h26: wh(G.Icons.html('lb-g', 26)), h7: wh(G.Icons.html('lb-g', 6.5)),
        canvas: G.Icons.canvas('lb-g').width, draw: seen2[0], half: seen2[1] };
      out.domOld = [...document.querySelectorAll('img.pix')].filter(i => /code\/coin\.png/.test(i.src)).length;
      return out;
    });
    check(ic.names.join() === 'coin,lb-g,lb-y', 'the two good ones are used (a path out of code/ and a bad hash: not)', ic.names);
    check(/code\/coin\.png\?v=1111111111/.test(ic.html) && /width="24" height="24"/.test(ic.html) && /code\/coin\.png/.test(ic.url) && /code\/coin\.png/.test(ic.css),
      'coin: html (its PNG, at the code icon\'s 24×24), url and the CSS variable', [ic.html.slice(0, 90), ic.url.slice(0, 90), ic.css.slice(0, 90)]);
    check(ic.draw.length === 1 && /code\/lb-y\.png/.test(ic.draw[0][0]) && ic.draw[0].slice(1).join() === '10,10,26,26' && ic.px[0] === 0 && ic.px[1] === 255,
      'draw: the PNG, at the same place and size as the code drawing (10,10 26×26)', ic.draw);
    check(ic.size.join() === '13,12', 'G.Icons.canvas keeps the code icon\'s size (layout doesn\'t move)', ic.size);
    check(ic.own.h13 === '18x18' && ic.own.h26 === '36x36' && ic.own.canvas === 18 && ic.own.draw && ic.own.draw[2] === 18,
      'a PNG with its own size (18×18 for a 13×13 arrow): shown 18 / 36, measured 18', ic.own);
    check(ic.own.h7 === '9x9' && ic.own.half && ic.own.half[2] === 9, 'and asked for at half the code size (6.5): half the PNG, 9', ic.own);
    await startRun(g.page, 4, true);
    await g.page.evaluate(() => { const p = G.Game.player; G.Game.state = 'levelup';
      // Until a card's chip has a green arrow (Charmander: a Fire or a special move).
      for (let i = 0; i < 60; i++) { G.RunUI.showLevelUp(p.level, G.LevelUp.offer(p), () => {}); if ([...document.querySelectorAll('#cards .lb-a')].some(a => /code\/lb-g\.png/.test(a.getAttribute('src')))) break; } });
    const card = await g.page.$$eval('#cards .lb-a', as => as.filter(a => /code\/lb-g\.png/.test(a.getAttribute('src'))).map(a => [a.getAttribute('src').split('/').pop(), a.width, a.height]));
    check(card.length && card.every(([, w, h]) => w === 12 && h === 12), 'a Lab card\'s green arrow is the PNG, at 2/3 of its 18×18 (the cards\' are a bit bigger since 45a4722)', card);
    check(!g.errs.length, 'no page errors', g.errs);
    await g.ctx.close();

    console.log('   the lists in before the script that adds the arrows has run');
    g = await game(browser, { slowArt: 2500 });
    await g.page.evaluate(() => G.AssetOverrides.loaded);
    await g.page.waitForFunction(() => /code\/coin\.png/.test(document.documentElement.style.getPropertyValue('--ico-coin')), null, { timeout: 10000 }).catch(() => {});
    const late = await g.page.evaluate(() => ({ y: G.Icons.canvas('lb-y').width, g: G.Icons.canvas('lb-g').width, code: G.LabBadgeArt.NAMES.join() }));
    check(late.y === 13 && late.g === 18, 'the arrows are right (13, and 18 for the own-size one), not ui/icons.js\'s stand-in star (12)', late);
    await g.ctx.close();

    console.log('   asked for before the list came in');
    g = await game(browser, { hold: true });
    await pastStart(g.page, '#btn-guest'); await g.page.click('#btn-guest');
    await g.page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    await startRun(g.page, 4);
    await g.page.waitForTimeout(600);
    const before = g.reqs.filter(u => /4\/Idle\.png/.test(u));
    g.release();
    await g.page.evaluate(() => G.AssetOverrides.loaded);
    await g.page.waitForTimeout(600);
    const after = g.reqs.filter(u => /4\/Idle\.png/.test(u));
    const srcNow = await g.page.evaluate(() => [...document.querySelectorAll('img')].length >= 0 && G.Sprites.sheet(4, 'Idle').img.src);
    check(before.length && before.every(u => !u.includes('v=')) && after.some(u => u.includes('?v=' + V)) && srcNow.includes('?v=' + V),
      'the sheet asked for before the list: asked for again with ?v= (and that\'s what it shows)', { before: before.length, after: after.length, srcNow: srcNow.split('/').slice(-2).join('/') });
    await g.ctx.close();

    console.log('   the built index.html (node fork/build.cjs; G is sealed there, so by its requests)');
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' });
      const page = await ctx.newPage(), reqs = [];
      page.on('request', r => reqs.push(r.url()));
      await page.route('**/js/fork/asset-rev.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(REV) }));
      await page.route('**/js/fork/icon-overrides.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ICONS) }));
      await page.route('**/assets/icons/code/*.png*', r => r.fulfill({ contentType: 'image/png', body: solid(48, 48, [255, 0, 200, 255]) }));
      await page.goto(BASE + '/index.html', { waitUntil: 'load' });
      await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
      await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
      await page.waitForTimeout(800);
      const has = re => reqs.some(u => re.test(u));
      check(has(/js\/fork\/asset-rev\.json\?t=/) && has(/js\/fork\/icon-overrides\.json\?t=/) && has(/assets\/icons\/code\/coin\.png\?v=1111111111/) && !has(/evil\.png/),
        'it reads both lists and loads the coin\'s PNG (not the bad entry)', reqs.filter(u => /asset-rev|icon-over|icons\/code/.test(u)).map(u => u.split('/').slice(-2).join('/')));
      // The quiz draws the starters before the list is in: Charmander's Idle, then again with ?v=.
      const idle = reqs.filter(u => /pokemon\/4\/Idle\.png/.test(u));
      check(idle.length && idle[idle.length - 1].includes('?v=' + V), 'a swapped sheet asked for before the list: asked for again with ?v=', idle.map(u => u.split('/').slice(-2).join('/')));
      await ctx.close();
    }

    console.log('4. With the service worker');
    const file = path.join(REPO, 'js/fork/asset-rev.json'), was = fs.readFileSync(file);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'allow', locale: 'en-US' });
    try {
      const page = await ctx.newPage();
      const run = async () => {
        await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
        await page.waitForFunction(() => window.G && G.AssetOverrides && G.DB, null, { timeout: 30000 });
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.evaluate(() => G.AssetOverrides.loaded);
        // The first time as a guest; after that the guest's save opens the menu.
        await pastStart(page, '#btn-guest, #scr-menu');
        if (await page.isVisible('#btn-guest')) { await page.click('#btn-guest'); await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 }); }
        await startRun(page, 4);
        await page.waitForFunction(() => G.Sprites.sheet(4, 'Idle').ready, null, { timeout: 15000 });
        return page.evaluate(async () => (await (await caches.open('ps-art-v1')).keys()).map(r => r.url).filter(u => /pokemon\/4\/Idle\.png/.test(u)));
      };
      fs.writeFileSync(file, '{}\n');
      await run();                                            // the SW installs and keeps the old sheet
      const first = await run();
      check(first.length === 1 && !first[0].includes('v='), 'a player with the old sheet: kept in the SW\'s art cache', first.map(u => u.split('/').slice(-2).join('/')));
      fs.writeFileSync(file, JSON.stringify({ 'assets/pokemon/4/Idle.png': V }) + '\n');
      const second = await run();
      check(second.some(u => u.includes('?v=' + V)), 'after a swap: the new one is fetched and kept as its own entry (not the old one served)', second.map(u => u.split('/').slice(-2).join('/')));
      check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the page was under the service worker');
    } finally { fs.writeFileSync(file, was); await ctx.close(); }
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll asset override checks passed');
  process.exit(failures ? 1 : 0);
})();
