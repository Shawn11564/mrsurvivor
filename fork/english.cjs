/* ============ fork/english.cjs — English first, applied at build time ============
 * MrSurvivor's primary and default language is English: js/core/locales.js plays the game in
 * English unless the player picks another language in Settings. Upstream writes Spanish first,
 * so fork/build.cjs runs these over the pages it serves, after fork/brand.cjs:
 *   - index.html (the game at /) takes its head from en/index.html, the English game page that
 *     upstream's make_seo_pages.py writes from dev.html with upstream's own English (title,
 *     description, the link preview's og:/twitter: tags, the loading screen, the guide links).
 *   - both game pages: what upstream leaves Spanish in its English page too (the preview picture's
 *     alt text, the structured data, <noscript>), and en/index.html points at / as the canonical
 *     page, since / is English now.
 *   - the link preview's picture is the English, MrSurvivor one: assets/fork/og-image.jpg
 *     (fork/make-og-image.cjs makes it).
 *   - the site pages and sitemap.xml give the English page as the default (hreflang x-default).
 *   - manifest.webmanifest and 404.html in English.
 *   - the donation lines, which aren't true here (MrSurvivor takes no donations: CLAUDE.local.md).
 * Like brand.cjs: rules are idempotent, and a REQUIRED one that stops matching upstream fails the
 * build, so an upstream rewording can't quietly bring Spanish back.
 */
const fs = require('fs'), path = require('path');
const { BRAND } = require('./brand.cjs');

const SITE = `https://${BRAND.domain}/`;
const OG_IMAGE = 'assets/fork/og-image.jpg';
const UPSTREAM_LINK = `<a href="${BRAND.upstream.repo}">Pok&eacute;Survivor</a>`;
// The game's languages (js/core/locales.js), English first.
const LANGS = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'locales.js'), 'utf8');
  const ids = [...src.matchAll(/\['([\w-]+)', '[^']+', '[\w-]+'\]/g)].map(m => m[1]);
  return ['en', ...ids.filter(id => id !== 'en')];
})();

// The Pokémon whose Spanish name isn't their English one (js/fork/en-names.js): the English site
// pages show the English one (the game gets them through its dictionary).
const EN_NAMES = (() => {
  const G = { I18n: { add() {} } };
  require('vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'fork', 'en-names.js'), 'utf8'), { G });
  return G.FORK_EN_NAMES;
})();
const NAME_RX = new RegExp(`(?<![\\p{L}])(${Object.keys(EN_NAMES).join('|')})(?![\\p{L}])`, 'gu');

// The root page's tags that come from en/index.html (upstream's English).
const FROM_EN = [
  /<html lang="[^"]*">/,
  /<title>[^<]*<\/title>/,
  /<meta name="description" content="[^"]*">/,
  /<meta property="og:locale" content="[^"]*">/,
  /<meta property="og:title" content="[^"]*">/,
  /<meta property="og:description" content="[^"]*">/,
  /<meta name="twitter:title" content="[^"]*">/,
  /<meta name="twitter:description" content="[^"]*">/,
  /"description": "[^"]*"/,
  /<p>[^<]*<\/p>\s*<p class="boot-ld">[^<]*<\/p>/,
];

/** The root page (index.html as tools/build.js wrote it) with the English page's head. */
function rootFromEnglish(root, en) {
  for (const rx of FROM_EN) {
    if (!rx.test(root)) continue;              // not in this build (tools/build.js --sin-seo)
    const m = rx.exec(en);
    if (!m) throw new Error(`fork/english.cjs: en/index.html has no ${rx}; update FROM_EN`);
    root = root.replace(rx, () => m[0]);
  }
  return root.replace(/href="guia\/"/g, 'href="en/guide/"').replace(/href="pokedex\/"/g, 'href="en/pokedex/"');
}

const GAME = f => f === 'index.html' || f === 'en/index.html';
const SUPPORT = f => f === 'en/support/index.html' || f === 'apoyar/index.html';
const NOINDEX = '<meta name="robots" content="noindex">';
// [name, applies to (file), from (string or RegExp), to]. REQUIRED ones must fire in every build.
const RULES = [
  // ---- both game pages
  ['og-image', f => f.endsWith('.html'), /assets\/og-image\.jpg/g, OG_IMAGE],
  ['og-alt', GAME, /<meta property="og:image:alt" content="[^"]*">/,
    `<meta property="og:image:alt" content="${BRAND.name}: survive the Pokémon hordes. Free, in your browser and on mobile, co-op for up to 4.">`],
  ['ld-lang', GAME, /"inLanguage": (?:"[^"]*"|\[[^\]]*\])/g, `"inLanguage": ${JSON.stringify(LANGS).replace(/","/g, '", "')}`],
  ['ld-genre', GAME, /"genre": \[[^\]]*\]/, '"genre": ["Roguelike", "Bullet heaven", "Action", "Survival"]'],
  ['ld-platform', GAME, /"gamePlatform": \[[^\]]*\]/, '"gamePlatform": ["Web browser", "PC", "Android", "iOS"]'],
  ['ld-os', GAME, /"operatingSystem": "[^"]*"/, '"operatingSystem": "Any with a modern web browser"'],
  ['noscript-js', GAME, /<p>(\S+) necesita JavaScript para funcionar\. Actívalo para jugar\.<\/p>/,
    (m, name) => `<p>${name} needs JavaScript to run. Turn it on to play.</p>`],
  ['noscript-about', GAME, /<p>Fan game gratuito de supervivencia con (\d+) Pokémon de las 9 regiones: [^<]*<\/p>/,
    (m, n) => `<p>A free Pokémon survival fan game with ${n} Pokémon from all 9 regions: pick your partner, survive the hordes, evolve your moves, take on legendaries and play co-op with up to 3 friends.</p>`],
  ['noscript-links', GAME, /<a href="([^"]*)">Guía del juego<\/a> · <a href="([^"]*)">Pokédex: todos los Pokémon jugables<\/a>/,
    (m, a, b) => `<a href="${a}">Game guide</a> · <a href="${b}">Pokédex: every playable Pokémon</a>`],
  // ---- en/index.html is the same English game as /
  ['en-canonical', f => f === 'en/index.html', `<link rel="canonical" href="${SITE}en/">`, `<link rel="canonical" href="${SITE}">`],
  ['en-og-url', f => f === 'en/index.html', `<meta property="og:url" content="${SITE}en/">`, `<meta property="og:url" content="${SITE}">`],
  // ---- site pages: English is the default language
  ['x-default', f => f.endsWith('.html'), /(<link rel="alternate" hreflang="en" href="([^"]+)">\s*<link rel="alternate" hreflang="x-default" href=")[^"]+(">)/,
    (m, a, en, b) => a + en + b],
  ['sitemap-home', f => f === 'sitemap.xml', new RegExp(`(<url><loc>${SITE.replace(/[./]/g, '\\$&')}</loc>(?:(?!</url>).)*?)(?:<xhtml:link [^>]*/>)+(</url>)(\\r?\\n)\\s*<url><loc>${SITE.replace(/[./]/g, '\\$&')}en/</loc>.*?</url>\\r?\\n`),
    (m, a, b, nl) => a + b + nl],
  ['sitemap-x-default', f => f === 'sitemap.xml', /(<xhtml:link rel="alternate" hreflang="en" href="([^"]+)"\/><xhtml:link rel="alternate" hreflang="x-default" href=")[^"]+("\/>)/g,
    (m, a, en, b) => a + en + b],
  ['sitemap-support', f => f === 'sitemap.xml', /\s*<url><loc>[^<]*\/(?:apoyar|en\/support)\/<\/loc>.*?<\/url>/g, ''],
  ['manifest-desc', f => f === 'manifest.webmanifest', /"description": "[^"]*"/, '"description": "A free fan game: survive the hordes with your Pokémon partner. No ads, nothing to buy."'],
  ['manifest-lang', f => f === 'manifest.webmanifest', /"lang": "[^"]*"/, '"lang": "en"'],
  ['en-names', f => f.startsWith('en/') && f.endsWith('.html'), NAME_RX, m => EN_NAMES[m]],
  // Co-op is for 4 players in all (js/net/social.js MAX_PLAYERS): you and up to 3 friends.
  ['coop-friends', f => f.endsWith('.html'), /with up to 4 friends/g, 'with up to 3 friends'],
  // ---- no donations here
  ['foot-donations', f => f.endsWith('.html'), ' with no ads or purchases (only voluntary donations for the servers).', ' with no ads or purchases.'],
  ['foot-donaciones', f => f.endsWith('.html'), ' sin anuncios ni compras (sólo donaciones voluntarias para los servidores).', ' sin anuncios ni compras.'],
  ['foot-support-link', f => f.endsWith('.html') && !GAME(f), / · <a href="[^"]*(?:en\/support|apoyar)\/">[^<]*<\/a>/g, ''],
  ['foot-github', f => f.endsWith('.html') && !GAME(f), `<p><a href="${BRAND.upstream.repo}">GitHub</a></p>`,
    `<p><a href="${BRAND.repo}">GitHub</a> · Fork of ${UPSTREAM_LINK} by ${BRAND.upstream.author}</p>`],
  ['faq-donation', f => f.endsWith('.html'), ' If you like, you can support it with a voluntary donation, which only pays for the servers and gives no advantages.', ''],
  ['faq-donacion', f => f.endsWith('.html'), ' Si quieres, puedes apoyarlo con una donación voluntaria, que se usa sólo para los servidores y no da ventajas.', ''],
  // The support pages (no longer linked or in the sitemap): what's true here, for an old link.
  ['support-noindex', SUPPORT, /<meta name="viewport"[^>]*>(?!\n<meta name="robots")/, m => m + '\n' + NOINDEX],
  ['support-title', SUPPORT, /<title>[^<]*<\/title>/, `<title>Support ${BRAND.name}</title>`],
  ['support-desc', SUPPORT, /(<meta (?:name="description"|property="og:description") content=")[^"]*(">)/g,
    (m, a, b) => `${a}${BRAND.name} is free: no ads, nothing to buy and no donations.${b}`],
  ['support-og-title', SUPPORT, /(<meta property="og:title" content=")[^"]*(">)/, (m, a, b) => `${a}Support ${BRAND.name}${b}`],
  ['support-body', SUPPORT, /<main>[\s\S]*<\/main>/, () => `<main>
<article class="doc" lang="en"><h1>Support ${BRAND.name}</h1>
<p class="lead">${BRAND.name} is and will stay <b>free</b>: no ads, nothing to buy and no donations.</p>
<p>The best way to help is to play it with your friends, tell others about it and report bugs on <a href="${BRAND.repo}/issues">GitHub</a>.</p>
<p>${BRAND.name} is a fan-made fork of ${UPSTREAM_LINK} by ${BRAND.upstream.author}.</p>
<p class="cta"><a class="btn" href="/">Back to the game</a></p></article>
</main>`],
];
const REQUIRED = ['og-image', 'og-alt', 'ld-lang', 'ld-genre', 'ld-platform', 'ld-os', 'noscript-js', 'noscript-about',
  'noscript-links', 'en-canonical', 'en-og-url', 'x-default', 'sitemap-home', 'sitemap-x-default', 'sitemap-support',
  'manifest-desc', 'manifest-lang', 'foot-donations', 'foot-donaciones', 'foot-support-link', 'foot-github',
  'faq-donation', 'faq-donacion', 'support-noindex', 'support-title', 'support-desc', 'support-og-title', 'support-body'];

const fired = new Set();
function english(text, file) {
  const f = file.replace(/\\/g, '/');
  for (const [name, applies, from, to] of RULES) {
    if (!applies(f)) continue;
    const hit = typeof from === 'string' ? text.includes(from) : (from.lastIndex = 0, from.test(text));
    if (!hit) {
      // Already applied (a second pass over the same page) counts as matching.
      if (typeof to === 'string' && to && text.includes(to)) fired.add(name);
      continue;
    }
    fired.add(name);
    text = typeof from === 'string' ? text.split(from).join(to)
      : text.replace(from, to);
  }
  return text;
}

/** 404.html (upstream's is Spanish first): ours, in English. */
const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>404 · ${BRAND.name}</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/assets/icons/icon-48.png"><link rel="stylesheet" href="/css/pages.css"></head>
<body><header class="top"><a class="brand" href="/">${BRAND.name}</a><nav><a href="/en/guide/">Guide</a><a href="/en/pokedex/">Pokédex</a><a class="play" href="/">Play free</a></nav></header>
<main><article class="doc center"><h1>404 · You got lost in the dungeon</h1><p class="lead">This page doesn't exist. But the hordes are still waiting…</p>
<p class="cta"><a class="btn" href="/">Back to the game</a></p></article></main></body></html>
`;

module.exports = { english, rootFromEnglish, fired, REQUIRED, NOT_FOUND, OG_IMAGE, LANGS };
