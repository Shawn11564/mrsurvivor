/* ============ fork/build.cjs — build MrSurvivor from upstream's sources ============
 *   node fork/build.cjs            (same flags as tools/build.js: --expose, --sin-seo, --forzar)
 *
 * Runs upstream's own release steps unchanged (tools/build.js, tools/export_data.js,
 * tools/make_seo_pages.py) with the branding of fork/brand.cjs applied:
 *   1. While upstream's JS tools run, fs.readFileSync hands them branded text
 *      (dev.html, js/**). So app.min.js, js/lang/*, index.html come out branded
 *      before minifying/obfuscating, without editing any upstream file.
 *   2. Every page the site serves is then branded in place. Pages the build didn't
 *      just write (contacto/, manifest, CNAME...) start from upstream's pristine copy
 *      at the last merged upstream commit, so re-running is deterministic.
 *   3. css/brand.css is linked after style.css in the game pages.
 *   4. English first (fork/english.cjs): / gets the English game page's head and link preview,
 *      and the manifest, 404, sitemap and site pages put English first.
 * Fails if a SPECIFIC rule in brand.cjs or a REQUIRED one in english.cjs no longer matches upstream.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { BRAND, brand, fired, SPECIFIC } = require('./brand.cjs');
const EN = require('./english.cjs');

const ROOT = path.join(__dirname, '..');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
// Upstream's tools read through fs; their own source and ours must not be rewritten
// (Node's module loader also uses readFileSync).
const SKIP = /^(tools|fork|node_modules|\.git)\//;

const started = Date.now();
const realRead = fs.readFileSync;
fs.readFileSync = function (file, opts) {
  const out = realRead.apply(fs, arguments);
  if (typeof out !== 'string' || typeof file !== 'string') return out;
  const r = rel(path.resolve(file));
  return r.startsWith('..') || SKIP.test(r) ? out : brand(out, r);
};
// The radiant forms on disk (js/fork/radiant-list.js), before the bundle is made.
// (A checkout from before the file existed, like fork/test-sync.cjs replays, just skips it.)
if (fs.existsSync(path.join(__dirname, 'radiants.cjs'))) execFileSync(process.execPath, [path.join(__dirname, 'radiants.cjs')], { stdio: 'inherit', cwd: ROOT });
try {
  require('../tools/build.js');
  require('../tools/export_data.js');
} finally {
  fs.readFileSync = realRead;
}
// The site pages (make_seo_pages.py) translate with the English dictionary export_data.js
// captured from upstream's files; add the fork's texts the pages show (the evolved stat moves, and
// the fork's English fixes and review: js/fork/en-fixes.js, js/fork/en-review.js).
const FORK_TEXTS = ['js/fork/buff-evos.js', 'js/fork/evo-names.js', 'js/fork/en-fixes.js', 'js/fork/en-review.js'];
const FORM_NO = [];                            // [form's number, its species' dex] for the site's dex cards
{
  const vm = require('vm'), data = path.join(ROOT, 'tools', 'cache', 'gamedata.json');
  const out = JSON.parse(realRead(data, 'utf8'));
  const G = { I18n: { add(d, language = 'en', context = '') { if (language === 'en' && !context) Object.assign(out.en, d); } } };
  // (A checkout from before a file existed, like fork/test-sync.cjs replays, just skips it.)
  for (const f of FORK_TEXTS) if (fs.existsSync(path.join(ROOT, f))) vm.runInNewContext(realRead(path.join(ROOT, f), 'utf8'), { G }, { filename: f });
  // Evolutions the fork renames (js/fork/evo-names.js): the pages show the new names too.
  for (const [id, name] of Object.entries(G.FORK_EVO_NAMES || {})) {
    const m = (out.moves || []).find(x => x.id === id);
    if (m && m.evo) m.evo.name = name;
  }
  // The fork's extra species and forms (js/fork/extra-dex-data.js) on the Pokédex and legendary pages, each
  // next to its species; a form's card shows its species' number (FORM_NO, swapped in below).
  const extra = path.join(ROOT, 'js', 'fork', 'extra-dex-data.js');
  if (fs.existsSync(extra)) {
    vm.runInNewContext(realRead(extra, 'utf8'), { G }, { filename: 'js/fork/extra-dex-data.js' });
    // (Not the forms that are a held item, js/fork/form-items.js: Origin Giratina, Rotom's appliances...)
    const items = path.join(ROOT, 'js', 'fork', 'form-items.js');
    if (fs.existsSync(items)) vm.runInNewContext(realRead(items, 'utf8'), { G }, { filename: 'js/fork/form-items.js' });
    const have = new Set(out.dex.map(p => p.dex)), no = p => p.base || p.dex;
    for (const e of G.FORK_DEX) {
      if (have.has(e.dex) || (G.FORM_ITEMS && G.FORM_ITEMS[e.dex])) continue;
      let i = out.dex.findIndex(p => no(p) > no(e));
      out.dex.splice(i < 0 ? out.dex.length : i, 0, e);
      if (e.leg) out.legends.push(e.dex);
      if (e.base) FORM_NO.push([e.dex, e.base]);
    }
  }
  fs.writeFileSync(data, JSON.stringify(out));
}
execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(ROOT, 'tools', 'make_seo_pages.py')], { stdio: 'inherit', cwd: ROOT });

// ---------------- in-place pass over what the site serves ----------------
// FORK_UPSTREAM: the upstream ref (fork/sync.cjs --from passes it; tests use a fake one).
// During a sync's uncommitted merge, MERGE_HEAD is upstream, so the base is upstream itself.
const UPSTREAM = process.env.FORK_UPSTREAM || 'upstream/main';
let base = null;
try { base = execFileSync('git', ['merge-base', 'HEAD', UPSTREAM], { cwd: ROOT, encoding: 'utf8' }).trim(); }
catch (e) { console.warn(`fork: no ${UPSTREAM} to read pristine pages from; branding them as they are`); }
try { base = execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() || base; }
catch (e) { /* not mid-merge */ }
function pristine(r) {
  if (!base) return null;
  try { return execFileSync('git', ['show', `${base}:${r}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }                   // not an upstream file
}

const SKIP_DIRS = new Set(['.git', '.claude', 'assets', 'node_modules', 'tools', 'fork', 'docs', 'infra', 'tests', 'videos']);
const SERVED = /\.html$|^manifest\.webmanifest$|^robots\.txt$|^sitemap\.xml$|^CNAME$/;
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name)); }
    else yield path.join(dir, e.name);
  }
}

// English first (fork/english.cjs): the game at / gets the head of the English game page
// make_seo_pages.py just wrote (en/index.html), before both are branded below.
{
  const idx = path.join(ROOT, 'index.html'), en = path.join(ROOT, 'en', 'index.html');
  if (!fs.existsSync(en) || fs.statSync(en).mtimeMs < started) throw new Error('fork: make_seo_pages.py wrote no en/index.html to take the English head from');
  fs.writeFileSync(idx, EN.rootFromEnglish(realRead(idx, 'utf8'), realRead(en, 'utf8')));
}

const cssHash = crypto.createHash('sha1').update(realRead(path.join(ROOT, 'css', 'brand.css'))).digest('hex').slice(0, 10);
const BRAND_LINK = `<link rel="stylesheet" href="css/brand.css?v=${cssHash}">`;
let pages = 0;
for (const file of walk(ROOT)) {
  const r = rel(file);
  if (r === 'dev.html' || !SERVED.test(path.basename(r)) && !SERVED.test(r)) continue;
  const fresh = fs.statSync(file).mtimeMs >= started;
  const src = (!fresh && pristine(r)) || realRead(file, 'utf8');
  let out = EN.english(brand(src, r), r);
  if (r === 'CNAME') out = BRAND.domain;       // as GitHub Pages writes it (no newline)
  if (r === '404.html') out = EN.NOT_FOUND;
  for (const [d, b] of FORM_NO) out = out.split(`<span class="n">#${d}</span>`).join(`<span class="n">#${String(b).padStart(3, '0')}</span>`);
  // Game pages (index.html, en/index.html) get the colour layer.
  out = out.replace(/<link rel="stylesheet" href="css\/brand\.css\?v=[^"]*">\n?/g, '');
  out = out.replace(/(<link rel="stylesheet" href="css\/style\.css\?v=[^"]+">)/, `$1\n${BRAND_LINK}`);
  if (out !== realRead(file, 'utf8')) { fs.writeFileSync(file, out); pages++; }
}

const missing = SPECIFIC.map((s, i) => i).filter(i => !fired.has(i));
if (missing.length) {
  console.error('fork: these brand rules no longer match upstream, update fork/brand.cjs:');
  for (const i of missing) console.error(`  [${i}] ${SPECIFIC[i][0]}: ${SPECIFIC[i][1].slice(0, 80)}`);
  process.exit(1);
}
const enMissing = EN.REQUIRED.filter(n => !EN.fired.has(n));
if (enMissing.length) {
  console.error('fork: these English-first rules no longer match upstream, update fork/english.cjs: ' + enMissing.join(', '));
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, EN.OG_IMAGE))) { console.error(`fork: ${EN.OG_IMAGE} is missing (node fork/make-og-image.cjs)`); process.exit(1); }
// The bundle must not carry upstream's name or domain (checked before obfuscation).
const bundle = realRead(path.join(ROOT, 'tools', 'cache', 'app.js'), 'utf8');
const leaks = ['PokéSurvivor', 'pokesurvivor.com', 'jpieratorregrosa'].filter(s => bundle.includes(s));
if (leaks.length) { console.error('fork: bundle still contains ' + leaks.join(', ')); process.exit(1); }
console.log(`fork: ${BRAND.name} built · ${pages} pages branded · brand.css?v=${cssHash}`);
