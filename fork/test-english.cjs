#!/usr/bin/env node
// English first (CLAUDE.local.md, fork/README.md "English first"): MrSurvivor plays and presents
// itself in English unless the player picks another language in Settings.
//
//   python -m http.server 8123          (in the repo root; `node fork/build.cjs` first)
//   node fork/test-english.cjs [base-url] [--pages-only] [--no-walk] [--list]
//
// 1. Language choice (js/core/locales.js + js/core/i18n.js, as the browser runs them): with nothing
//    saved, every browser language (Spanish, French, Chinese, Japanese...) and every path gets English;
//    a language picked in Settings (`ps.lang`) still wins; blocked storage gets English.
// 2. Upstream's tests/i18n.test.cjs: only its "locale precedence" test fails (it expects the
//    browser's language); every dictionary, template and coverage test passes.
// 3. The built pages (no server): / is the English page (html lang, title, description, the link
//    preview's og:/twitter: tags, structured data, loading screen, <noscript>) and its preview picture
//    is ours (assets/fork/og-image.jpg, 1200×630); en/index.html names / as canonical; the manifest
//    and 404 are English; the sitemap and site pages give the English page as the default; no page
//    offers donations.
// 4. The game (server, headless Edge with a Spanish browser and nothing saved): it starts in English,
//    and the login screen, main menu, every menu screen and Settings tab, the What's new and legal
//    screens, a run (canvas text, level-up cards, pause, a Lab run) and the game over screen show no
//    Spanish: no ñ ¿ ¡ á í ó ú, no Spanish words, nothing the dictionary would still translate.
//    --list prints everything flagged (and the texts seen) instead of just the first few.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8123';
const PAGES_ONLY = args.includes('--pages-only'), LIST = args.includes('--list'), NO_WALK = args.includes('--no-walk');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// ---------------------------------------------------------------- 1. language choice
console.log('1. Language choice');
function boot(saved, nav, pathname = '/', blocked = false) {
  const ctx = { G: {}, navigator: { language: nav, languages: [nav] }, location: { pathname, reload() {} },
    localStorage: { getItem: k => { if (blocked) throw Error('blocked'); return k === 'ps.lang' ? saved : null; }, setItem() {} },
    document: { documentElement: {}, write() {} }, CanvasRenderingContext2D: class { fillText() {} strokeText() {} measureText() { return {}; } },
    confirm() {}, alert() {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/core/locales.js'), ctx);
  vm.runInContext(read('js/core/i18n.js'), ctx);
  return { lang: ctx.G.I18n.lang, html: ctx.document.documentElement.lang };
}
for (const nav of ['es-ES', 'es-MX', 'es', 'fr-FR', 'it-IT', 'pt-BR', 'zh-TW', 'zh-CN', 'ja-JP', 'en-GB', '']) {
  const b = boot(null, nav);
  check(b.lang === 'en' && b.html === 'en', `nothing saved, browser "${nav}": English`, b);
}
check(boot(null, 'es-ES', '/en/').lang === 'en' && boot(null, 'es-ES', '/guia/').lang === 'en', 'any path: English');
for (const saved of ['es', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant', 'en']) check(boot(saved, 'en-US').lang === saved, `picked "${saved}" in Settings: ${saved}`);
check(boot('unknown', 'es-ES').lang === 'en', 'an unknown saved language: English');
check(boot(null, 'es-ES', '/', true).lang === 'en', 'storage blocked: English');

// ---------------------------------------------------------------- 2. upstream's i18n tests
console.log('2. Upstream\'s tests/i18n.test.cjs');
{
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(ROOT, 'tests', 'i18n.test.cjs')], { encoding: 'utf8', cwd: ROOT });
  const out = r.stdout + r.stderr;
  const fails = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1]);
  const pass = (out.match(/^# pass (\d+)/m) || [])[1] | 0;
  check(pass > 10 && fails.length === 1 && /^locale precedence/.test(fails[0]),
    'all pass but "locale precedence" (it expects the browser\'s language)', { pass, fails });
}

// ---------------------------------------------------------------- 3. built pages
console.log('3. Built pages');
// Spanish: its accents and punctuation, its everyday words, or a lowercase "y" (and) between words
// (a capital Y is the controller's button).
const SPANISH_WORDS = /[ñ¿¡áíóú]|\b(?:de|del|la|las|los|el|que|con|para|por|una|tu|tus|sus|es|más|sin|al|lo|se|ya|muy|cada|también|cuando|puedes|gratis|juego|jugar|partida|compañero|hordas|navegador|móvil|cooperativo|amigos|anuncios|descargas|Cargando)\b/i;
const SPANISH = { test: s => SPANISH_WORDS.test(s) || /\p{L} y \p{L}/u.test(s) };
const meta = (html, rx) => (rx.exec(html) || [])[1];
{
  const SITE = `https://${require('./brand.cjs').BRAND.domain}/`;
  const idx = read('index.html');
  check(/<html lang="en">/.test(idx), 'index.html: <html lang="en">');
  const head = {
    title: meta(idx, /<title>([^<]*)<\/title>/),
    description: meta(idx, /<meta name="description" content="([^"]*)">/),
    'og:title': meta(idx, /<meta property="og:title" content="([^"]*)">/),
    'og:description': meta(idx, /<meta property="og:description" content="([^"]*)">/),
    'og:image:alt': meta(idx, /<meta property="og:image:alt" content="([^"]*)">/),
    'twitter:title': meta(idx, /<meta name="twitter:title" content="([^"]*)">/),
    'twitter:description': meta(idx, /<meta name="twitter:description" content="([^"]*)">/),
    'ld+json': meta(idx, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/),
    loading: meta(idx, /<div id="boot"[\s\S]*?(<p>[\s\S]*?)<\/div>/),
    noscript: meta(idx, /<noscript>([\s\S]*?)<\/noscript>/),
  };
  // (Addresses and language codes aren't text: the structured data's ids end in #juego.)
  for (const [k, v] of Object.entries(head)) {
    const text = v && v.replace(/"https?:[^"]*"/g, '""').replace(/"inLanguage": \[[^\]]*\]/g, '');
    check(!!v && !SPANISH.test(text), `index.html ${k} is English`, v && SPANISH.test(text) ? text.slice(0, 160) : undefined);
  }
  check(meta(idx, /<meta property="og:locale" content="([^"]*)">/) === 'en_US', 'index.html og:locale en_US');
  check(meta(idx, /<link rel="canonical" href="([^"]*)">/) === SITE && meta(idx, /<meta property="og:url" content="([^"]*)">/) === SITE, 'index.html: canonical and og:url are /');
  const ld = JSON.parse(head['ld+json']);
  check(ld['@graph'].every(n => Array.isArray(n.inLanguage) && n.inLanguage[0] === 'en'), 'structured data: English first');
  const img = meta(idx, /<meta property="og:image" content="([^"]*)">/), tw = meta(idx, /<meta name="twitter:image" content="([^"]*)">/);
  check(img === SITE + 'assets/fork/og-image.jpg' && tw === img, 'the preview picture is ours', img);
  const jpg = fs.readFileSync(path.join(ROOT, 'assets', 'fork', 'og-image.jpg'));
  // JPEG size: the first SOF0/SOF2 frame header.
  let w = 0, h = 0;
  for (let i = 2; i < jpg.length;) { const m = jpg[i + 1], len = jpg.readUInt16BE(i + 2); if (m === 0xc0 || m === 0xc2) { h = jpg.readUInt16BE(i + 5); w = jpg.readUInt16BE(i + 7); break; } i += 2 + len; }
  check(jpg[0] === 0xff && jpg[1] === 0xd8 && w === 1200 && h === 630, 'assets/fork/og-image.jpg is a 1200×630 JPEG', { w, h });
  const en = read('en/index.html');
  check(meta(en, /<link rel="canonical" href="([^"]*)">/) === SITE && /<html lang="en">/.test(en), 'en/index.html: English, canonical is /');
  check(meta(en, /<meta property="og:image" content="([^"]*)">/) === img && !SPANISH.test(meta(en, /<meta property="og:image:alt" content="([^"]*)">/)), 'en/index.html: same preview picture, English alt');
  const man = JSON.parse(read('manifest.webmanifest'));
  check(man.lang === 'en' && !SPANISH.test(man.description), 'manifest.webmanifest: English', { lang: man.lang, description: man.description });
  const nf = read('404.html');
  check(/<html lang="en">/.test(nf) && !SPANISH.test(nf.replace(/<[^>]+>/g, ' ')), '404.html: English');
  const sm = read('sitemap.xml');
  const xd = [...sm.matchAll(/hreflang="en" href="([^"]+)"\/><xhtml:link rel="alternate" hreflang="x-default" href="([^"]+)"/g)];
  check(xd.length > 5 && xd.every(m => m[1] === m[2]), 'sitemap.xml: x-default is the English page', xd.length);
  check(!sm.includes(`<loc>${SITE}en/</loc>`) && !/apoyar|en\/support/.test(sm), 'sitemap.xml: / once (no separate /en/), no support pages');
  const html = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const r = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!/^(\.git|assets|node_modules|tools|fork|docs|infra|tests|videos|js|css)$/.test(e.name)) walk(r); }
      else if (r.endsWith('.html') && r !== 'dev.html') html.push(r);
    }
  })('');
  // (The game pages carry upstream's support screen, never shown here: js/data/funding.js has no
  // accounts once branded. Part 4 checks what the game shows.)
  const bad = html.filter(r => !/^(en\/)?index\.html$/.test(r) && /donation|donaci[oó]n/i.test(read(r).replace(/no donations/g, '')));
  check(html.length > 20 && !bad.length, `no site page offers donations (${html.length} pages)`, bad);
  const xbad = html.filter(r => { const p = read(r); const m = /hreflang="en" href="([^"]+)">\s*<link rel="alternate" hreflang="x-default" href="([^"]+)"/.exec(p); return m && m[1] !== m[2]; });
  check(!xbad.length, 'site pages: x-default is the English page', xbad);
}

if (PAGES_ONLY) finish();
else game().then(finish, e => { console.error(e); failures++; finish(); });

function finish() {
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll English-first checks passed');
  process.exit(failures ? 1 : 0);
}

/** The fork's own texts: its string literals that read as words (js/fork, not the generated data). */
function forkTexts() {
  const acorn = require(require.resolve('acorn', { paths: [__dirname, process.env.PLAYWRIGHT_DIR || path.join(__dirname, '..', '..', 'commandcenter')] }));
  const out = new Set();
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = dir + '/' + e.name;
      if (e.isDirectory()) { walk(r); continue; }
      if (!r.endsWith('.js') || /lab-data|lab-anims|mega-sprites|radiant-list/.test(r)) continue;
      for (const t of acorn.tokenizer(read(r), { ecmaVersion: 'latest' })) {
        const parts = t.type.label === 'string' ? [t.value] : t.type.label === 'template' ? [t.value] : [];
        for (const s0 of parts) {
          const s = String(s0 || '').trim();
          // Words: letters and spaces, not ids, paths, CSS, HTML or code.
          if (/\p{L}{3}/u.test(s) && /^[\p{L}]/u.test(s) && !/[<>{}=#\\/_|;]|^\w+$|\$\{/u.test(s) && /\s/.test(s)) out.add(s);
        }
      }
    }
  })('js/fork');
  return [...out];
}

// ---------------------------------------------------------------- 4. the game
async function game() {
  console.log('4. The game, with a Spanish browser and nothing saved');
  const { chromium, pastStart } = require('./pw.cjs');
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    // Canvas text as drawn (after the game's translation, which wraps these on load).
    await page.addInitScript(() => {
      window.__canvas = new Set();
      const P = CanvasRenderingContext2D.prototype;
      for (const k of ['fillText', 'strokeText']) {
        const orig = P[k];
        P[k] = function (s, ...a) { if (typeof s === 'string' && /\p{L}{2}/u.test(s)) window.__canvas.add(s); return orig.call(this, s, ...a); };
      }
    });
    // The built page, through its UI (the bundle keeps the game's objects to itself).
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    const built = await page.evaluate(() => ({ nav: navigator.language, saved: localStorage.getItem('ps.lang'), html: document.documentElement.lang,
      title: document.title, guest: document.getElementById('btn-guest').textContent.trim(), boot: document.querySelector('#boot .boot-ld').textContent.trim() }));
    check(built.nav.startsWith('es') && !built.saved && built.html === 'en' && built.boot === 'Loading…' && !SPANISH.test(built.guest + ' ' + built.title),
      'index.html in a Spanish browser, nothing saved: English', built);
    // The rest on dev.html: the same sources, with the game's objects at hand. Every dictionary the
    // game loads is recorded on the way in (G.I18n.add, wrapped as i18n.js arrives).
    await page.route('**/js/core/i18n.js*', async route => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()) + '\n;(() => { const add = G.I18n.add; window.__dicts = [];' +
        ' G.I18n.add = function (d, l = "en", c = "") { window.__dicts.push([d, l, c]); return add.apply(this, arguments); }; })();' });
    });
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    const lang = await page.evaluate(() => ({ lang: G.I18n.lang, html: document.documentElement.lang }));
    check(lang.lang === 'en' && lang.html === 'en', 'dev.html: English', lang);

    // English the game would change. Whatever the game puts on the page or draws goes through the
    // dictionary, English included (a translation shown, or a fork text written in English), and its
    // word-by-word pass changes English words that are also Spanish keys ("Leaf Tornado" → "Leaf
    // Gust", "ranking" → "Leaderboard"). Every English text it can show must come out unchanged.
    {
      const fork = forkTexts().filter(s => !SPANISH.test(s));   // (Spanish ones are source text: the walk below)
      const bad = await page.evaluate(fork => {
        // English: the English translations, and the fork's texts that aren't a dictionary's Spanish
        // key or another language's translation (its tables list them all).
        const en = [], other = new Set();
        for (const [d, l, c] of window.__dicts) {
          for (const [k, v] of Object.entries(d)) {
            other.add(k);
            if (typeof v !== 'string') continue;
            if (l === 'en' && (!c || c === 'move')) en.push(v); else if (l !== 'en') other.add(v);
          }
        }
        const out = [], squash = s => s.replace(/\s+/g, ' ').toLowerCase();
        const texts = new Set([...en, ...fork.filter(s => !other.has(s))]);
        for (const s of texts) {
          if (G.I18n.has(s)) continue;                       // a Spanish text with its translation
          const t = G.I18n.t(s);
          if (squash(t) !== squash(s)) out.push(`${s} → ${t}`);
        }
        return { n: texts.size, out };
      }, fork);
      check(bad.n > 1000 && !bad.out.length, `English texts come out of the dictionary unchanged (${bad.n} checked)`, bad.out.slice(0, 20));
      if (LIST) for (const s of bad.out) console.log('    ' + s);
    }

    if (NO_WALK) { check(!errors.length, 'no page errors', errors); return; }
    const flagged = new Map(), seen = new Set(), areas = [];
    // Visible text of the open screens (DOM text and the attributes the game translates), and the canvas.
    async function collect(where) {
      const texts = await page.evaluate(() => {
        const out = [];
        const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (e.classList.contains('hidden') || cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
          const p = n.parentElement, s = n.nodeValue.trim();
          // (What's new is written in the player's language already, so it's marked translate="no".)
          if (!s || !p || p.closest('script, style, noscript, #scr-legal .fork-credit') || p.closest('[translate="no"]:not(.news-day)') || !shown(p)) continue;
          out.push(s);
        }
        document.querySelectorAll('[placeholder], [title], [aria-label], [alt]').forEach(el => {
          if (!shown(el) || el.closest('[translate="no"]')) return;
          for (const a of ['placeholder', 'title', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v && v.trim()) out.push(v.trim()); }
        });
        out.push(...window.__canvas); window.__canvas.clear();
        return out.map(s => [s, G.I18n.t(s)]);
      });
      const before = seen.size;
      for (const [s, t] of texts) {
        seen.add(s);
        // (The dictionary's word-by-word pass may only change a capital: "joystick" → "Joystick".)
        const why = /[ñ¿¡áíóú]/i.test(s) ? 'accent' : SPANISH.test(s) ? 'word' : t.toLowerCase() !== s.toLowerCase() ? 'translatable' : null;
        if (why && !flagged.has(s)) flagged.set(s, `${where} [${why}]${t !== s ? ' → ' + t : ''}`);
      }
      areas.push(`${where}: ${texts.length} (${seen.size - before} new)`);
    }
    const shot = async () => page.waitForTimeout(350);

    await pastStart(page, '#btn-guest');
    await shot(); await collect('login');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await shot(); await collect('after guest (personality test / notices)');
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.owned[25] = { at: Date.now() }; s.partner = 4; s.starter = 4; s.coins = 5000; G.DB.commit(); G.Flow.goMenu(); });
    await shot(); await collect('main menu');
    for (const go of ['dex', 'upgrades', 'gacha', 'goals', 'friends', 'rank']) {
      await page.evaluate(g => document.querySelector(`#scr-menu [data-go="${g}"]`).click(), go);
      await shot(); await collect(go);
      // The tabs inside (missions / achievements / profile, gacha banners...).
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.scr:not(.hidden) .tab, .scr:not(.hidden) .gen-tab')].filter(t => t.getClientRects().length).length);
      for (let i = 0; i < Math.min(tabs, 8); i++) {
        await page.evaluate(i => { const t = [...document.querySelectorAll('.scr:not(.hidden) .tab, .scr:not(.hidden) .gen-tab')].filter(t => t.getClientRects().length)[i]; t && t.click(); }, i);
        await shot(); await collect(go + ' tab ' + i);
      }
      if (go === 'dex') { await page.evaluate(() => { const c = document.querySelector('#scr-dex .cell'); c && c.click(); }); await shot(); await collect('dex detail'); }
      await page.evaluate(() => G.Flow.goMenu());
    }
    await page.evaluate(() => document.getElementById('btn-settings').click());
    for (const t of await page.evaluate(() => [...document.querySelectorAll('#set-tabs .gen-tab')].filter(b => !b.classList.contains('hidden')).map(b => b.dataset.t))) {
      await page.evaluate(t => document.querySelector(`#set-tabs [data-t="${t}"]`).click(), t);
      await shot(); await collect('settings ' + t);
    }
    await page.evaluate(() => G.SettingsUI.close());
    await page.evaluate(() => document.getElementById('btn-news').click()); await shot(); await collect('what\'s new');
    await page.evaluate(() => G.NewsUI.close());
    // The personality test, its result and the partner list.
    await page.evaluate(() => G.TestUI.start()); await shot(); await collect('personality test');
    for (let i = 0; i < 40 && await page.evaluate(() => G.UI.isOpen('scr-test')); i++) {
      await page.evaluate(() => document.querySelector('#test-a .answer').click()); await page.waitForTimeout(60);
    }
    await shot(); await collect('test result');
    await page.evaluate(() => document.getElementById('res-other').click()); await shot(); await collect('starters');
    await page.evaluate(() => { G.UI.chrome(true); G.Flow.goMenu(); });
    await page.evaluate(() => document.querySelector('[data-legal]').click()); await shot(); await collect('legal');
    await page.evaluate(() => G.Flow.goMenu());
    if (await page.evaluate(() => !!(G.Radiant && G.Radiant.open))) { await page.evaluate(() => G.Radiant.open()); await shot(); await collect('radiant ritual'); await page.evaluate(() => G.Flow.goMenu()); }

    // A run: HUD, a level-up, the pause, then knocked out.
    async function run(label) {
      await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
      await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
      await page.waitForTimeout(5000); await collect(label + ' HUD');
      await page.evaluate(() => { const pl = G.Game.player; G.RunUI.showLevelUp(pl.level + 1, G.LevelUp.offer(pl), () => {}); });
      await shot(); await collect(label + ' level-up');
      await page.evaluate(() => G.RunUI.closeLevelUp());
      await page.keyboard.press('Escape'); await shot(); await collect(label + ' pause');
      await page.keyboard.press('Escape'); await page.waitForTimeout(3600);
      await page.evaluate(() => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9); });
      await page.waitForFunction(() => G.UI.isOpen('scr-over'), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500); await collect(label + ' game over');
      await page.evaluate(() => G.Flow.goMenu());
    }
    await run('run');
    if (await page.evaluate(() => !!G.Lab)) {
      await page.evaluate(() => G.Settings.set('lab', true));
      await run('Lab run');
      await page.evaluate(() => G.Settings.set('lab', false));
    }

    const list = [...flagged];
    if (LIST) {
      console.log('    texts per screen: ' + areas.join(' · '));
      for (const [s, w] of list) console.log('    ' + JSON.stringify(s) + '  @ ' + w);
    }
    check(seen.size > 300, `walked the screens (${seen.size} texts seen)`);
    check(!list.length, 'no Spanish on screen', list.length ? list.slice(0, 12).map(([s, w]) => `${s.slice(0, 70)} @ ${w}`) : undefined);
    check(!errors.length, 'no page errors', errors);
  } finally { await browser.close(); }
}
