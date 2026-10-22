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
//    And "no Spanish left": every text upstream's game can show (its source's strings and templates,
//    dev.html's text: spanishSources) and its data (achievements, missions, items, moves, upgrades,
//    the personality test), through the game's English, has no Spanish word left (one in upstream's
//    comments or a dictionary's keys that no English text uses). The walk can't see a text that is in
//    no dictionary at all; this can. What it found is in js/fork/en-fixes.js and js/fork/trait-names.js.
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
  // It rewrites js/lang/*.js with upstream's build_langs, without fork/build.cjs's branding
  // ("PokéSurvivor" in the French... dictionaries): the built ones are put back after it.
  const LANG = path.join(ROOT, 'js', 'lang'), built = new Map(fs.readdirSync(LANG).map(f => [f, fs.readFileSync(path.join(LANG, f))]));
  let r;
  try { r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(ROOT, 'tests', 'i18n.test.cjs')], { encoding: 'utf8', cwd: ROOT }); }
  finally { for (const [f, b] of built) fs.writeFileSync(path.join(LANG, f), b); }
  const out = r.stdout + r.stderr;
  const fails = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1]);
  const pass = (out.match(/^# pass (\d+)/m) || [])[1] | 0;
  check(pass > 10 && fails.length === 1 && /^locale precedence/.test(fails[0]),
    'all pass but "locale precedence" (it expects the browser\'s language)', { pass, fails });
  const unbranded = [...built].filter(([, b]) => b.includes('PokéSurvivor')).map(([f]) => f);
  check(!unbranded.length && [...built].every(([f]) => fs.readFileSync(path.join(LANG, f)).equals(built.get(f))),
    'js/lang/*.js: branded by the build, and left as built', unbranded);
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

/**
 * What could still show in Spanish, for "no Spanish left" (part 4). The walk only flags what
 * SPANISH knows or what the dictionary would still change, so a text that is in no English
 * dictionary at all ("Impulsivo", "Shinies conseguidos") went by. This gathers every text upstream's
 * game could show: its string literals, its templates (whole, with {x} for each ${...}, and the text
 * between their tags) and dev.html's text. Not console messages, the Spanish half of a
 * ['Spanish', 'English'] pair (the changelog, login notices) or of `en ? 'English' : 'Spanish'`.
 * And two vocabularies: the words English uses (the English dictionaries, every fork string, the
 * Pokémon, those English halves) and the Spanish ones (upstream's comments, dev.html's text and the
 * dictionaries' keys), less the English ones. Part 4 runs the texts through the game's English and
 * flags any that still has a Spanish word. js/fork/en-fixes.js and trait-names.js fix what it found.
 * loaded: the dictionaries the page loaded, [[keys, English values], ...].
 */
function spanishSources(loaded) {
  const acorn = require(require.resolve('acorn', { paths: [__dirname, process.env.PLAYWRIGHT_DIR || path.join(__dirname, '..', '..', 'commandcenter')] }));
  const words = s => (String(s).toLowerCase().match(/[\p{L}’']+/gu) || []).map(w => w.replace(/^['’]+|['’]+$/g, '')).filter(w => w.length > 1);
  const english = new Set(), spanish = new Set(), texts = new Map();
  const tidy = s => String(s).replace(/\s+/g, ' ').trim();
  // A text and the other ways it may reach the screen (a template whose ends are HTML: without them).
  const add = (alts, where) => {
    alts = [...new Set(alts.map(tidy))].filter(s => /\p{L}{2}/u.test(s) && !/[{}<>=;\\]|=>|^[.#[(]/.test(s.replace(/\{x\}/g, '')));
    if (!alts.length || texts.has(alts[0])) return;
    const s = alts[0];
    if (!/\s/.test(s) && !uiKeys.has(s)) return;                         // one word: only a UI text (a dictionary's key), not code
    if (/^[a-z0-9 _-]+$/.test(s) && /-/.test(s)) return;                   // CSS class lists
    if (NEVER_SHOWN_TEXTS.includes(s)) return;
    texts.set(s, { where, alts });
  };
  // The dictionaries: Spanish keys, English values. (Their keys aren't texts to check: the changelog's
  // Spanish column and texts the game no longer has are in them.)
  const dicts = [], uiKeys = new Set();
  const sb = { G: { I18n: { add: (d, l = 'en') => dicts.push([d, l]) } }, console };
  sb.window = sb; vm.createContext(sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'js/data')).filter(f => /^lang-.*\.js$/.test(f))) vm.runInContext(read('js/data/' + f), sb, { filename: f });
  for (const [d, l] of dicts) for (const [k, v] of Object.entries(d)) {
    words(k).forEach(w => spanish.add(w));
    uiKeys.add(k);
    if (l === 'en') words(v).forEach(w => english.add(w));
  }
  for (const m of read('js/data/pokedex.js').matchAll(/"name":"([^"]+)"/g)) words(m[1]).forEach(w => english.add(w));
  const files = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = dir + '/' + e.name;
      if (e.isDirectory()) files(r, out);
      else if (r.endsWith('.js') && !/app\.min|\/lang-|\/lang\/|pokedex|sprites-meta|lab-data|lab-anims|mega-sprites|radiant-list/.test(r)) out.push(r);
    }
    return out;
  };
  const tokens = f => [...acorn.tokenizer(read(f), { ecmaVersion: 'latest', onComment: (block, text) => { if (!f.startsWith('js/fork/')) words(text).forEach(w => spanish.add(w)); } })];
  // Every dictionary the page loaded (the fork's too): keys are Spanish, English values English. The
  // fork's other strings are English (it writes in English), but not the Spanish keys of its tables.
  for (const [keys, enValues] of loaded) {
    keys.forEach(k => { uiKeys.add(k); words(k).forEach(w => spanish.add(w)); });
    enValues.forEach(v => words(v).forEach(w => english.add(w)));
  }
  for (const f of files('js/fork')) for (const t of tokens(f)) {
    if ((t.type.label === 'string' || t.type.label === 'template') && !uiKeys.has(String(t.value).trim())) words(t.value).forEach(w => english.add(w));
  }

  for (const f of files('js').filter(f => !f.startsWith('js/fork/'))) {
    const toks = tokens(f);
    const L = i => toks[i] && toks[i].type.label;
    const skip = new Set();
    // The literal starting at i (a string, or a template from its `): [text, last index, its own
    // chunks' indices (not those of templates nested in its ${...})], or null. A template's ${...} is
    // {x}, or a tag when it puts HTML there (an icon, a sprite, '<b>...'): the text either side of it
    // is then a text of its own on the page, like the text either side of a tag.
    const literal = i => {
      if (L(i) === 'string') return [String(toks[i].value), i, [i]];
      if (L(i) !== '`') return null;
      const chunks = [], own = [];
      let j = i + 1, slotHtml = false;
      for (let depth = 0; j < toks.length; j++) {
        const l = L(j);
        if (depth === 0 && l === '`') break;
        if (l === '${') { if (++depth === 1) { slotHtml = false; chunks.push(null); } }
        else if (l === '{') { if (depth) depth++; }
        else if (l === '}') { if (depth && --depth === 0) chunks[chunks.lastIndexOf(null)] = slotHtml ? '<x>' : '{x}'; }
        else if (depth === 0 && l === 'template') { chunks.push(String(toks[j].value || '')); own.push(j); }
        else if (depth && /^(html|spriteCanvas|Icons)$|<\w/.test(String(toks[j].value || ''))) slotHtml = true;
      }
      return [chunks.map(c => c === null ? '{x}' : c).join(''), j, own];
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (skip.has(i)) continue;
      // console.x(...) and Error(...): not shown.
      const call = L(i) === 'name' && t.value === 'console' && L(i + 1) === '.' && L(i + 3) === '(' ? i + 3
        : L(i) === 'name' && /Error$/.test(t.value) && L(i + 1) === '(' ? i + 1 : 0;
      if (call) {
        for (let depth = 0, j = call; j < toks.length; j++) {
          if (L(j) === '(') depth++;
          else if (L(j) === ')' && --depth === 0) { i = j; break; }
        }
        continue;
      }
      // ['Spanish' + ..., 'English' + ...]: only the English one shows.
      if (L(i) === '[') {
        let j = i + 1, commas = [], ok = true;
        for (; j < toks.length && L(j) !== ']'; j++) { if (L(j) === ',') commas.push(j); else if (L(j) !== 'string' && L(j) !== '+/-') { ok = false; break; } }
        // (Texts, with spaces: a pair of words like a starter's traits ['impulsivo', 'valiente'] is Spanish.)
        const spaced = k => L(k) === 'string' && /\s/.test(toks[k].value);
        if (ok && commas.length === 1 && spaced(i + 1) && spaced(commas[0] + 1)) {
          for (let k = commas[0] + 1; k < j; k++) if (L(k) === 'string') words(toks[k].value).forEach(w => english.add(w));
          i = j;
          continue;
        }
      }
      // en ? 'English' : 'Spanish'
      if (L(i) === 'name' && t.value === 'en' && L(i + 1) === '?') {
        // Each branch: literals joined with +. The first is English, the second never shows here.
        const branch = (j, take) => {
          for (;;) {
            const lit = literal(j);
            if (!lit) return j;
            if (take) words(lit[0]).forEach(w => english.add(w));
            j = lit[1] + 1;
            if (L(j) !== '+/-') return j;
            j++;
          }
        };
        const j = branch(i + 2, true);
        if (L(j) === ':') i = branch(j + 1, false) - 1;
        continue;
      }
      const lit = literal(i);
      if (!lit) continue;
      const [s, end, own] = lit;
      own.forEach(k => skip.add(k));
      // Each text between tags. Strings that are pieces of 'Text ' + name + ' more' (or ternary branches,
      // a ? 'this' : 'that') are marked: part 4 lets a piece of a translated template go by.
      const joined = L(i) === 'string' && (['+/-', '?', ':'].includes(L(i - 1)) || ['+/-', ':'].includes(L(end + 1)));
      for (const part of s.split(/<[^>]*>/)) add([part], joined ? f + ' (piece)' : f);
    }
  }
  // (Not the moderators' screen, #scr-mod.)
  const html = read('dev.html').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<section id="scr-mod"[\s\S]*?<\/section>/g, '');
  for (const m of html.matchAll(/>([^<]+)</g)) { words(m[1]).forEach(w => spanish.add(w)); add([m[1]], 'dev.html'); }
  for (const m of html.matchAll(/(?:title|placeholder|aria-label|alt)="([^"]+)"/g)) add([m[1]], 'dev.html');
  for (const w of english) spanish.delete(w);
  for (const w of SAME_IN_ENGLISH) spanish.delete(w);
  return { texts: [...texts.values()], spanish: [...spanish] };
}
// Words that read the same in English (names), and texts English players never see.
const SAME_IN_ENGLISH = ['rb', 'poké', 'pokeapi', 'kanto', 'johto', 'hoenn', 'sinnoh', 'teselia', 'kalos', 'alola', 'galar', 'paldea', 'hisui', 'jpter', 'gmail', 'google'];
const NEVER_SHOWN_TEXTS = [
  'filas del ranking',              // js/net/social.js deleteAccount: a step's name, for console.warn
  'Moderación'                      // dev.html #rk-mod: the admin's button to the moderators' screen
];
const NEVER_SHOWN_EN = [
  /^js\/ui\/mod-ui\.js$/,           // the moderators' hidden screen (#scr-mod), not for players
  /^js\/noframe\.js$/,              // "not the official site" in every language, one per language
  /^js\/boot\.js$/,                 // the loading line in every language
  /^js\/core\/locales\.js$/,        // language names, each in its own language
  /^js\/core\/firebase-config\.js$/ // upstream's example config
];

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

    // No Spanish left: every text upstream's game can show (spanishSources) and its data tables
    // (achievements, missions, items, moves, upgrades, the personality test), through the game's
    // English: none may still have a Spanish word. js/fork/en-fixes.js, js/fork/trait-names.js.
    const src = spanishSources(await page.evaluate(() => window.__dicts.map(([d, l]) =>
      [Object.keys(d), l === 'en' ? Object.values(d).filter(v => typeof v === 'string') : []])));
    const SPANISH_ONLY = new Set(src.spanish);
    {
      const texts = src.texts.filter(t => !NEVER_SHOWN_EN.some(re => re.test(t.where.replace(/ \(piece\)$/, ''))));
      const res = await page.evaluate(texts => {
        // English keys with slots: a template whose finished sentences each have their entry ("Peor
        // para {x}: ... el ataque físico."), or a piece of 'Text ' + name + ' more', is covered by them.
        const keys = [];
        for (const [d, l] of window.__dicts) if (l === 'en') for (const k of Object.keys(d)) if (/\{(?:x|name)\}/.test(k)) keys.push(k.replace(/\{name\}/g, '{x}'));
        const esc = s => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
        const covered = (s, piece) => (piece && s.length > 3 && keys.some(k => k.includes(s))) ||
          (s.includes('{x}') && (re => keys.some(k => re.test(k)))(new RegExp('^' + s.split('{x}').map(esc).join('.+?') + '$')));
        const out = [];
        const put = (alts, where) => {
          alts = alts.filter(s => typeof s === 'string' && /\p{L}/u.test(s));
          if (alts.length) out.push({ s: alts[0], where, en: alts.map(s => covered(s, where.endsWith('(piece)')) ? '' : G.I18n.t(s.trim())) });
        };
        for (const t of texts) put(t.alts, t.where);
        for (const a of G.AchDefs.LIST) { put([a.name], 'achievement'); put([a.desc], 'achievement'); put([a.title], 'achievement title'); }
        for (const m of [...G.MissionDefs.daily, ...G.MissionDefs.weekly]) for (const n of [1, ...(m.goals || [])]) put([m.text(n, 'fire')], 'mission');
        for (const it of G.Items.LIST) for (const k of ['name', 'desc', 'short']) put([it[k]], 'item');
        for (const u of G.Upgrades.LIST) for (const k of ['name', 'desc']) put([u[k]], 'upgrade');
        for (const m of Object.values(G.Moves.BY_ID)) { put([m.name], 'move'); put([m.desc], 'move'); }
        for (const [k, v] of Object.entries(G.TRAIT_TEXT)) { put([k[0].toUpperCase() + k.slice(1)], 'trait'); put([v], 'trait'); }
        for (const q of G.PERSONALITY_TEST) { put([q.q], 'personality test'); q.a.forEach(a => put([a.t], 'personality test')); }
        for (const s of G.STARTERS) put([s.traits.join(', ')], 'starter traits');
        // Built from pieces where they're drawn: a level-up card's tag (js/systems/levelup.js), the
        // HUD's buff chips (js/ui/hud.js LBL).
        put(['Nv.' + 3 + ' > ' + 4], 'level-up tag');
        for (const l of ['ATK', 'AT.E', 'VEL', 'DEF', 'REG']) put([l + ' ×' + 2], 'HUD buff chip');
        return out;
      }, texts);
      const words = s => (String(s).toLowerCase().match(/[\p{L}’']+/gu) || []).map(w => w.replace(/^['’]+|['’]+$/g, ''));
      // Flagged when every way it can show still has a Spanish word.
      const left = res.filter(r => r.en.every(t => words(t).some(w => SPANISH_ONLY.has(w))));
      check(res.length > 2000 && !left.length, `no Spanish left in the game's texts and data (${res.length} through the English pass)`,
        left.length ? left.slice(0, 15).map(r => `${r.s.slice(0, 60)} → ${r.en[0].slice(0, 60)} @ ${r.where}`) : undefined);
      if (LIST) for (const r of left) console.log('    ' + JSON.stringify(r.s) + ' → ' + JSON.stringify(r.en[0]) + '  @ ' + r.where + '  {' + [...new Set(words(r.en[0]).filter(w => SPANISH_ONLY.has(w)))].join(',') + '}');
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
        const why = /[ñ¿¡áíóú]/i.test(s) ? 'accent' : SPANISH.test(s) ? 'word' : t.toLowerCase() !== s.toLowerCase() ? 'translatable'
          : (s.toLowerCase().match(/[\p{L}’']+/gu) || []).some(w => SPANISH_ONLY.has(w)) ? 'Spanish word' : null;
        if (why && !flagged.has(s)) flagged.set(s, `${where} [${why}]${t !== s ? ' → ' + t : ''}`);
      }
      areas.push(`${where}: ${texts.length} (${seen.size - before} new)`);
    }
    const shot = async () => page.waitForTimeout(350);

    await pastStart(page, '#btn-guest');
    await shot(); await collect('login');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await shot(); await collect('after guest (starter grid / notices)');
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
    // A new player's first screen: the partner list (no personality test since js/fork/starter-pick.js).
    await page.evaluate(() => G.TestUI.start()); await shot(); await collect('starters (first screen)');
    // Every personality trait, as the result screen (capitalised) and the starter list (lower case) show
    // it, through the page's own translation pass. The walk above can't flag these: a Spanish word in
    // no dictionary isn't 'translatable', and SPANISH doesn't list them. js/fork/trait-names.js.
    const traits = await page.evaluate(async () => {
      const ts = [...new Set(G.STARTERS.flatMap(s => s.traits))], el = document.getElementById('res-trait'), info = document.getElementById('starter-info');
      const out = [];
      for (const t of ts) {
        el.textContent = t.charAt(0).toUpperCase() + t.slice(1); info.textContent = t + ', ' + t;
        await new Promise(r => setTimeout(r, 30));
        out.push([t, el.textContent, info.textContent]);
      }
      return out;
    });
    const EN_TRAITS = ['brave', 'impulsive', 'careful', 'loyal', 'patient', 'kind', 'shy', 'mischievous', 'serene', 'clever', 'cheerful', 'determined', 'proud', 'lone wolf', 'laid-back', 'chaotic'];
    const badTraits = traits.filter(([, cap, low]) => !EN_TRAITS.some(e => cap === e.charAt(0).toUpperCase() + e.slice(1) && low === e + ', ' + e));
    check(traits.length === 16 && !badTraits.length, 'all 16 personality traits show in English (result screen and starter list)', badTraits.length ? badTraits : undefined);
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
      // (A shiny caught first, for the game over's "Shinies caught" list and its toast.)
      await page.evaluate(() => { G.onShinyCaught({ dex: 25, name: 'Pikachu' }); const pl = G.Game.player; pl.invuln = 0; pl.hurt(1e9); });
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
