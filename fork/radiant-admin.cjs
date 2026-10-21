#!/usr/bin/env node
/* ============ fork/radiant-admin.cjs — the local radiant admin page (MrSurvivor) ============
 *   node fork/radiant-admin.cjs [--port 8130] [--no-open]
 *
 * A page on this PC only (127.0.0.1, with a random key in the link it opens), never on the site:
 *   1. Drop the artists' zips (the Radiant Sprite Kit's layout, assets/0150_mewtwo/...): every
 *      Pokémon in them is checked like fork/import-radiant.cjs does (same code), with an
 *      animated preview, normal next to radiant, of every sheet.
 *   2. Pick which to import and each one's rarity (1-5, its weight in the Radiant Ritual; the
 *      Pokémon's own rarity by default). Import copies the sheets to assets/pokemon/{dex}/r/,
 *      r/lab/ and m{dex}/r/, keeps the rarity in js/fork/radiants.json and runs fork/radiants.cjs.
 *      The rarity of radiants already in the game can be changed too.
 *   3. Publish commits ONLY the radiant files (those sheets, radiants.json, radiant-list.js),
 *      whatever else is changed in the checkout, and pushes main. The game reads radiants.json
 *      when it loads and when the ritual opens (refresh in js/fork/radiant.js), so they're live
 *      once GitHub Pages has deployed (a minute or two), with no rebuild.
 * Check: node fork/test-radiant-admin.cjs.
 */
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const imp = require('./import-radiant.cjs');
const ROOT = path.join(__dirname, '..');
const MON = path.join(ROOT, 'assets', 'pokemon');
const JSON_FILE = path.join(ROOT, 'js', 'fork', 'radiants.json');
const args = process.argv.slice(2);
const PORT = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8130;     // 0: any free port
const KEY = crypto.randomBytes(16).toString('hex');
// What a publish may commit: the radiant sheets and the two lists, nothing else.
const PATHS = [':(glob)assets/pokemon/*/r/**', 'js/fork/radiants.json', 'js/fork/radiant-list.js'];

const G = imp.gameData();
const uploads = new Map();                        // id -> { name, mons: Map(dex -> { files, labels }) }

// trimEnd, not trim: a status line can start with a space (" M file").
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const radiants = () => { try { return JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch (e) { return {}; } };
/** The ritual's weights, read from the game so the page's odds can't drift from it. */
function weights() {
  const m = fs.readFileSync(path.join(ROOT, 'js', 'fork', 'radiant.js'), 'utf8').match(/const WEIGHT = (\{[^}]*\})/);
  return m ? JSON.parse(m[1].replace(/(\d+):/g, '"$1":')) : { 1: 40, 2: 25, 3: 15, 4: 7, 5: 3 };
}
const name = d => (G.DEX.find(p => p.dex === +d) || {}).name || '#' + d;

function state() {
  const st = { radiants: radiants(), weights: weights(), git: null };
  try {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    let ahead = 0;
    try { ahead = +git('rev-list', '--count', `origin/${branch}..HEAD`); } catch (e) { /* no upstream */ }
    const changed = git('status', '--porcelain', '--untracked-files=all', '--', ...PATHS).split('\n').filter(Boolean).map(l => l.slice(3));
    st.git = { branch, ahead, changed, aheadLog: ahead ? git('log', '--oneline', `origin/${branch}..HEAD`).split('\n') : [] };
  } catch (e) { st.git = { error: String(e.stderr || e.message).trim() }; }
  return st;
}

function check(id) {
  const up = uploads.get(id), cur = radiants();
  return [...up.mons].sort((a, b) => a[0] - b[0]).map(([dex, m]) => {
    const r = imp.checkMon(dex, m.files, [...m.labels], G);
    const mon = G.DEX.find(p => p.dex === dex);
    const sheets = [];
    for (const part of ['base', 'lab', 'mega']) for (const anim of Object.keys(m.files[part] || {})) sheets.push({ part, anim });
    return { id, dex, name: r.name, errors: r.errors, warnings: r.warnings, ok: r.copy.length > 0, sheets, lab: r.lab, mega: r.mega,
      count: r.copy.length, exists: !!cur[dex], rarity: (cur[dex] && cur[dex].rarity) || (mon && mon.rarity) || 1, monRarity: mon ? mon.rarity : 1 };
  });
}

/** Copy one checked Pokémon in, dropping old radiant sheets it doesn't replace. */
function importOne(id, dex) {
  const m = uploads.get(id) && uploads.get(id).mons.get(dex);
  if (!m) throw new Error(`#${dex}: upload not found (drop the zip again)`);
  const r = imp.checkMon(dex, m.files, [...m.labels], G);
  if (!r.copy.length) throw new Error(`#${dex}: ${r.errors.join('; ')}`);
  const keep = new Set(r.copy.map(([, to]) => path.resolve(to)));
  for (const dir of [path.join(MON, String(dex), 'r'), path.join(MON, String(dex), 'r', 'lab'), path.join(MON, 'm' + dex, 'r')])
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.png') && !keep.has(path.resolve(dir, f))) fs.rmSync(path.join(dir, f));
  for (const [buf, to] of r.copy) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf); }
  return r;
}

/** Rarities into radiants.json, then fork/radiants.cjs rewrites both lists from what's on disk. */
function relist(rarities) {
  const j = radiants();
  for (const [d, r] of Object.entries(rarities || {})) if (+r >= 1 && +r <= 5) j[d] = Object.assign({}, j[d], { rarity: +r });
  fs.writeFileSync(JSON_FILE, JSON.stringify(j, null, 2) + '\n');
  return execFileSync(process.execPath, [path.join(__dirname, 'radiants.cjs')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function publish({ allowAhead }) {
  const st = state();
  if (!st.git || st.git.error) throw new Error('git: ' + (st.git && st.git.error));
  if (st.git.branch !== 'main') throw new Error(`You're on "${st.git.branch}": publish only works on main.`);
  if (!st.git.changed.length) throw new Error('Nothing to publish: no radiant files have changed.');
  if (st.git.ahead && !allowAhead) throw new Error(`main has ${st.git.ahead} other commit(s) not pushed yet; they would go too.`);
  const was = radiants();
  let before = {};
  try { before = JSON.parse(git('show', 'HEAD:js/fork/radiants.json')); } catch (e) { /* new file */ }
  const dexes = [...new Set(st.git.changed.map(f => (f.match(/assets\/pokemon\/m?(\d+)\//) || [])[1]).filter(Boolean))].map(Number);
  for (const d in was) if (!dexes.includes(+d) && JSON.stringify(was[d]) !== JSON.stringify(before[d])) dexes.push(+d);
  const gone = Object.keys(before).filter(d => !was[d]).map(Number);
  const what = dexes.sort((a, b) => a - b).map(d => `${name(d)} (#${d})${before[d] ? '' : ' new'}`).concat(gone.map(d => `${name(d)} (#${d}) removed`));
  const msg = 'Radiants: ' + (what.join(', ') || 'list update');
  git('add', '-A', '--', ...PATHS);
  git('commit', '-m', msg, '--', ...PATHS);           // --only these paths: other changes stay out
  const sha = git('rev-parse', '--short', 'HEAD');
  let pushed;
  try { pushed = execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) {
    throw Object.assign(new Error(`Committed ${sha} ("${msg}") but the push failed. Pull, then push from a terminal:\n` + String(e.stderr || e.message).trim()), { committed: sha });
  }
  return { sha, msg, out: pushed.trim() };
}

// ---------------- the server ----------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = req => new Promise((ok, no) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });

const server = http.createServer(async (req, res) => {
  try {
    // Only this PC, by its own name (no other site, no DNS tricks).
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return send(res, 403, { error: 'host' });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, 'radiant-admin.html')), TYPES['.html']);
    if (!u.pathname.startsWith('/api/')) {
      // Read-only: the game's sheets, its data scripts and fonts, for the previews.
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      const okDir = ['assets', 'js'].some(d => file.startsWith(path.join(ROOT, d) + path.sep));
      if (!okDir || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    if ((req.headers['x-key'] || u.searchParams.get('k')) !== KEY) return send(res, 403, { error: 'key' });
    const parts = u.pathname.split('/').slice(2);
    if (req.method === 'GET' && parts[0] === 'state') return send(res, 200, state());
    if (req.method === 'GET' && parts[0] === 'file') {           // /api/file/{id}/{dex}/{part}/{anim}
      const [, id, dex, part, anim] = parts.map(decodeURIComponent);
      const m = uploads.get(id) && uploads.get(id).mons.get(+dex);
      const buf = m && m.files[part] && m.files[part][anim];
      return buf ? send(res, 200, buf, 'image/png') : send(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && parts[0] === 'check') {
      const id = crypto.randomBytes(6).toString('hex');
      let files;
      try { files = imp.unzip(await body(req)); } catch (e) { return send(res, 400, { error: e.message }); }
      const { mons, ignored } = imp.group(files);
      uploads.set(id, { name: decodeURIComponent(req.headers['x-name'] || 'upload.zip'), mons });
      return send(res, 200, { id, ignored, mons: check(id) });
    }
    if (req.method === 'POST' && parts[0] === 'import') {
      const { picks = [] } = JSON.parse(await body(req) || '{}');
      const done = [], rar = {};
      for (const p of picks) { const r = importOne(p.id, +p.dex); done.push({ dex: +p.dex, name: r.name, count: r.copy.length, warnings: r.warnings }); rar[p.dex] = p.rarity; }
      const out = relist(rar);
      return send(res, 200, { done, out, state: state() });
    }
    if (req.method === 'POST' && parts[0] === 'rarity') {
      const { rarities = {} } = JSON.parse(await body(req) || '{}');
      return send(res, 200, { out: relist(rarities), state: state() });
    }
    if (req.method === 'POST' && parts[0] === 'publish') {
      const opts = JSON.parse(await body(req) || '{}');
      try { return send(res, 200, Object.assign(publish(opts), { state: state() })); }
      catch (e) { return send(res, 409, { error: e.message, committed: e.committed, state: state() }); }
    }
    send(res, 404, { error: 'unknown' });
  } catch (e) { send(res, 500, { error: e.message }); }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/#k=${KEY}`;
  console.log(`Radiant admin: ${url}\n(this PC only; Ctrl+C to stop)`);
  if (!args.includes('--no-open')) {
    const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { require('child_process').spawn(cmd, a, { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* open it by hand */ }
  }
});
