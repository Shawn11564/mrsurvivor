#!/usr/bin/env node
/* ============ fork/asset-admin.cjs — the local Asset Admin (MrSurvivor) ============
 *   node fork/asset-admin.cjs [--port 8130] [--no-open]     (or double-click fork/Asset Admin.bat / .command)
 *
 * A page on this PC only (127.0.0.1, a random key in the link it opens), never on the site, with
 * three tabs: the Gallery (every PNG and code-drawn icon: download, upload new versions, apply;
 * fork/asset-gallery.cjs), Radiants (fork/radiant-admin.html, fork/radiant-admin.cjs) and the
 * Radiant Sprite Kit (radiant-kit/index.html).
 *
 * Who can publish: whoever can push to the GitHub repo (its collaborators with write access).
 * The repo is public, so anyone can run this page, but a push from anyone else is refused by
 * GitHub, and there's nothing else that takes uploads: the game only reads files from the site.
 *
 * GitHub sync (so two people can't trip over each other):
 *   - at start, and every minute: fetch, and fast-forward main to GitHub's when it's behind.
 *     Until the first sync is done, the page is blocked behind its progress and nothing can be
 *     changed (423). It also checks once that this PC can push (git push --dry-run).
 *   - local changes the tool made stay: the version lists (asset-rev.json, icon-overrides.json,
 *     radiants.json) are put back to HEAD for the fast-forward and then merged: GitHub's, with this
 *     checkout's own changes on top (radiant-list.js is regenerated). A file changed on both sides
 *     stops the sync with its name.
 *   - publish syncs first, commits only the files the tool manages, and pushes; if GitHub has moved
 *     on in between (someone else published), it undoes its commit, syncs and tries again. If the
 *     push fails for any other reason the commit is undone too, so the changes stay visible.
 * One thing at a time: syncs, applies, imports and publishes queue behind each other.
 * Check: node fork/test-asset-admin.cjs (and fork/test-radiant-admin.cjs for the Radiants tab).
 */
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');
const imp = require('./import-radiant.cjs');
const rad = require('./radiant-admin.cjs');
const gallery = require('./asset-gallery.cjs');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const KEY = crypto.randomBytes(16).toString('hex');
const SYNC_EVERY = +(process.env.ASSET_ADMIN_SYNC_MS || 60000);
const HOLD = +(process.env.ASSET_ADMIN_HOLD_MS || 0);         // tests: the first fetch waits this long

// What a publish may commit: the radiants', the gallery's and the version lists.
const PATHS = [...rad.PATHS, ':(glob)assets/pokemon/**', ':(glob)assets/icons/**', 'js/fork/asset-rev.json', 'js/fork/icon-overrides.json'];
const LISTS = ['js/fork/asset-rev.json', 'js/fork/icon-overrides.json', 'js/fork/radiants.json'];
const GENERATED = ['js/fork/radiant-list.js'];

// ---------------- git ----------------
// trimEnd, not trim: a status line can start with a space (" M file").
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
/** git over the network: async (the page keeps polling), with a time limit. prompt: may ask to sign in. */
const gitNet = (a, { timeout = 120000, prompt = false } = {}) => new Promise((ok, no) => {
  const env = Object.assign({}, process.env, prompt ? {} : { GIT_TERMINAL_PROMPT: '0' });
  execFile('git', a, { cwd: ROOT, encoding: 'utf8', timeout, env, maxBuffer: 16 << 20 }, (e, out, err) => {
    if (e) no(Object.assign(new Error(String(err || e.message).trim() || (e.killed ? 'timed out' : 'failed')), { killed: e.killed }));
    else ok((out + err).trim());
  });
});
const show = (rev, f) => { try { return JSON.parse(git('show', `${rev}:${f}`)); } catch (e) { return null; } };
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
// -z: paths as they are (no quoting), one per NUL.
const changedPaths = () => execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...PATHS], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  .split('\0').filter(Boolean).map(l => l.slice(3));
/** git with exactly these paths (from stdin: any number, any name). */
const gitPaths = (a, paths) => execFileSync('git', [...a, '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd: ROOT, encoding: 'utf8', input: paths.join('\0'), stdio: ['pipe', 'pipe', 'pipe'] });
const count = range => { try { return +git('rev-list', '--count', range); } catch (e) { return 0; } };

// ---------------- one thing at a time ----------------
let queue = Promise.resolve();
const lock = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

// ---------------- sync with GitHub ----------------
const sync = { phase: 'starting', ready: false, steps: [], error: null, behind: 0, ahead: 0, at: null, canPush: null, pushNote: '', busy: false, conflicts: [] };
const step = (text, state = 'run') => { const s = { text, state, at: Date.now() }; sync.steps.push(s); if (sync.steps.length > 12) sync.steps.shift(); return s; };

/** Our changes to a version list (vs. base) put on top of theirs; keys we removed go too. */
function mergeList(base, ours, theirs) {
  const out = Object.assign({}, theirs || {});
  base = base || {}; ours = ours || {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(ours)])) {
    if (JSON.stringify(base[k]) === JSON.stringify(ours[k])) continue;
    if (k in ours) out[k] = ours[k]; else delete out[k];
  }
  return Object.fromEntries(Object.keys(out).sort((a, b) => (+a && +b ? a - b : a < b ? -1 : 1)).map(k => [k, out[k]]));
}

/** Fast-forward to origin/main keeping the tool's local changes (see the header). */
function fastForward() {
  const saved = LISTS.map(f => ({ f, base: show('HEAD', f), ours: readJson(f) }));
  const dirty = new Set(git('status', '--porcelain', '--', ...LISTS, ...GENERATED).split('\n').filter(Boolean).map(l => l.slice(3)));
  for (const f of [...LISTS, ...GENERATED]) if (dirty.has(f)) git('checkout', 'HEAD', '--', f);
  const putBack = () => { for (const s of saved) if (s.ours) fs.writeFileSync(path.join(ROOT, s.f), JSON.stringify(s.ours, null, 2) + '\n'); };
  try { git('merge', '--ff-only', 'origin/main'); }
  catch (e) {
    putBack();
    if (dirty.has('js/fork/radiants.json')) rad.relist({});
    const files = String(e.stderr || e.message).split('\n').filter(l => /^\s+\S/.test(l)).map(l => l.trim());
    throw Object.assign(new Error(files.length
      ? `These files were changed here AND on GitHub, so they can't be merged: ${files.join(', ')}. Undo your change to them (the button below), or publish it first from the other copy.`
      : 'Couldn\'t bring this copy up to date: ' + String(e.stderr || e.message).trim()), { conflicts: files });
  }
  let radiants = false;
  for (const s of saved) {
    if (!s.ours || JSON.stringify(s.ours) === JSON.stringify(s.base)) continue;
    const merged = mergeList(s.base, s.ours, readJson(s.f));
    fs.writeFileSync(path.join(ROOT, s.f), JSON.stringify(merged, null, 2) + '\n');
    if (s.f === 'js/fork/radiants.json') radiants = true;
  }
  if (radiants) rad.relist({});
}

function doSync(why) {
  return lock(async () => {
    sync.busy = true; sync.error = null; sync.conflicts = [];
    if (why !== 'auto') sync.steps = [];
    try {
      let s = step('Checking this copy of the game');
      let branch;
      try { branch = git('rev-parse', '--abbrev-ref', 'HEAD'); } catch (e) { throw new Error('This folder isn\'t a git copy of the game. Clone it from GitHub first (fork/ARTIST.md).'); }
      if (branch !== 'main') throw new Error(`This copy is on the branch "${branch}". Switch it to main first (git switch main).`);
      try { git('remote', 'get-url', 'origin'); } catch (e) { throw new Error('This copy has no "origin" (the GitHub repo). Clone it from GitHub (fork/ARTIST.md).'); }
      s.state = 'done';
      s = step('Fetching the latest version from GitHub');
      if (HOLD && why === 'start') await new Promise(r => setTimeout(r, HOLD));
      try { await gitNet(['fetch', '--quiet', 'origin', 'main']); }
      catch (e) { throw new Error(`Couldn't reach GitHub (${e.killed ? 'it took over 2 minutes' : e.message}). Check the internet connection, then press "Try again".`); }
      s.state = 'done';
      sync.behind = count('HEAD..origin/main'); sync.ahead = count('origin/main..HEAD');
      if (sync.behind && sync.ahead) throw new Error(`This copy has ${sync.ahead} commit(s) that aren't on GitHub, and GitHub has ${sync.behind} new one(s). That needs sorting out by hand (git pull --rebase), it isn't something the tool does.`);
      if (sync.behind) {
        s = step(`Updating to GitHub's version (${sync.behind} new change${sync.behind > 1 ? 's' : ''})`);
        fastForward();
        sync.behind = 0; gallery.refresh();
        s.state = 'done';
      } else step('Already up to date', 'done');
      if (sync.canPush === null) {
        s = step('Checking you can publish (a GitHub sign-in window may open)');
        try { await gitNet(['push', '--dry-run', '--quiet', 'origin', 'HEAD:main'], { timeout: 180000, prompt: true }); sync.canPush = true; sync.pushNote = ''; s.state = 'done'; }
        catch (e) {
          sync.canPush = false; s.state = 'warn';
          sync.pushNote = /403|denied|not allowed|Permission/i.test(e.message)
            ? 'GitHub says this account can\'t push to the repo. Ask Shawn to add you as a collaborator (with Write) and accept the invite.'
            : 'Couldn\'t sign in to GitHub to publish: ' + e.message.split('\n')[0] + ' (fork/ARTIST.md, "Signing in"). You can still browse, download and prepare changes.';
        }
      }
      sync.ready = true; sync.phase = 'ready'; sync.at = Date.now();
    } catch (e) {
      sync.error = e.message; sync.phase = 'error'; sync.conflicts = e.conflicts || [];
      const last = sync.steps[sync.steps.length - 1];
      if (last && last.state === 'run') last.state = 'fail';
      if (why === 'publish') throw e;
    } finally { sync.busy = false; }
  });
}

/**
 * Undo changes the tool made that aren't published: each file back to HEAD (a new one deleted), and
 * its entries in the version lists back to HEAD's. Only files the tool manages that git lists as changed.
 */
function revert(paths) {
  const changed = new Set(changedPaths()), done = [];
  const tracked = new Set(git('ls-files', '--', ...PATHS).split('\n'));
  for (const p of paths) {
    if (!changed.has(p) || LISTS.includes(p) || GENERATED.includes(p)) continue;
    if (tracked.has(p)) git('checkout', 'HEAD', '--', p); else fs.rmSync(path.join(ROOT, p), { force: true });
    done.push(p);
  }
  // The lists: those files' entries back to HEAD's (the whole list, if it's one of the paths).
  const fix = (f, mine) => {
    if (!changed.has(f)) return;
    if (paths.includes(f)) { git('checkout', 'HEAD', '--', f); return; }
    const head = show('HEAD', f) || {}, cur = readJson(f) || {};
    for (const k of Object.keys(Object.assign({}, head, cur))) if (mine(k, cur[k] || head[k])) { if (k in head) cur[k] = head[k]; else delete cur[k]; }
    if (JSON.stringify(cur) === JSON.stringify(head)) git('checkout', 'HEAD', '--', f);
    else fs.writeFileSync(path.join(ROOT, f), JSON.stringify(cur, null, 2) + '\n');
  };
  fix('js/fork/asset-rev.json', k => done.includes(k));
  fix('js/fork/icon-overrides.json', (k, e) => !!e && done.includes(e.file));
  if (paths.includes('js/fork/radiants.json') && changed.has('js/fork/radiants.json')) { git('checkout', 'HEAD', '--', 'js/fork/radiants.json'); rad.relist({}); }
  gallery.refresh();
  return done;
}

// ---------------- state and publish ----------------
function state() {
  const st = { radiants: rad.radiants(), weights: rad.weights(), git: null, sync: syncView(), staged: [...gallery.staged.values()].map(gallery.view) };
  try {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const ahead = count('origin/main..HEAD');
    st.git = { branch, ahead, behind: count('HEAD..origin/main'), changed: changedPaths(), aheadLog: ahead ? git('log', '--oneline', 'origin/main..HEAD').split('\n') : [] };
  } catch (e) { st.git = { error: String(e.stderr || e.message).trim() }; }
  return st;
}
const syncView = () => Object.assign({}, sync, { steps: sync.steps.map(s => ({ text: s.text, state: s.state })) });

/** "Assets: Mewtwo (#150) Idle, shiny Walk; app icons icon-192; code icons lb-g-type" */
function assetSummary(changed) {
  const mons = new Map(), app = [], code = [];
  for (const f of changed) {
    let m;
    if ((m = f.match(/^assets\/pokemon\/(m?)(\d+)\/(?!r\/)(?:(s|lab)\/)?([^/]+)\.png$/))) {
      const dex = +m[2], label = (m[1] ? 'Mega ' : '') + (m[3] === 's' ? 'shiny ' : m[3] === 'lab' ? 'Lab ' : '') + m[4];
      if (!mons.has(dex)) mons.set(dex, []);
      mons.get(dex).push(label);
    } else if ((m = f.match(/^assets\/icons\/code\/([^/]+)\.png$/))) code.push(m[1]);
    else if ((m = f.match(/^assets\/icons\/([^/]+)\.png$/))) app.push(m[1]);
  }
  const parts = [...mons].sort((a, b) => a[0] - b[0]).map(([d, l]) => `${rad.name(d)} (#${d}) ${l.join(', ')}`);
  if (app.length) parts.push('app icons ' + app.join(', '));
  if (code.length) parts.push('code icons ' + code.join(', '));
  if (!parts.length && changed.some(f => /asset-rev|icon-overrides/.test(f))) parts.push('version list');
  return parts.length ? 'Assets: ' + parts.join('; ') : '';
}

async function publish({ allowAhead }) {
  for (let tries = 0; ; tries++) {
    await doSync('publish');
    const out = await lock(async () => {
      const st = state();
      if (!st.git || st.git.error) throw new Error('git: ' + (st.git && st.git.error));
      if (!st.git.changed.length) throw new Error('Nothing to publish: nothing the tool manages has changed.');
      if (st.git.ahead && !allowAhead) throw new Error(`main has ${st.git.ahead} other commit(s) not pushed yet; they would go too.`);
      const msg = [rad.summary(st.git.changed, show('HEAD', 'js/fork/radiants.json') || {}), assetSummary(st.git.changed)].filter(Boolean).join('; ') || 'Assets: update';
      // Exactly the changed files (a pattern that matches nothing, like no radiants yet, would stop git).
      gitPaths(['add', '-A'], st.git.changed);
      gitPaths(['commit', '-m', msg], st.git.changed);     // --only these paths: other changes stay out
      const sha = git('rev-parse', '--short', 'HEAD');
      try { const o = await gitNet(['push', 'origin', 'HEAD:main'], { timeout: 180000, prompt: true }); sync.canPush = true; return { sha, msg, out: o }; }
      catch (e) {
        git('reset', '--soft', 'HEAD~1');                  // back to uncommitted: nothing is lost or hidden
        if (/\(fetch first\)|non-fast-forward|cannot lock ref|failed to update ref/i.test(e.message)) return { retry: true };     // someone published in between
        throw new Error('Couldn\'t publish: GitHub refused the push. ' + (/403|denied|Permission/i.test(e.message)
          ? 'This account doesn\'t have write access to the repo.' : e.message.split('\n')[0]) + ' Your changes are still here, not published.');
      }
    });
    if (!out.retry) return out;
    if (tries >= 2) throw new Error('Someone else kept publishing at the same moment. Try again in a minute.');
  }
}

// ---------------- the server ----------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const HEAD = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "frame-ancestors 'self'", 'Cross-Origin-Resource-Policy': 'same-origin' };
const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, Object.assign({ 'Content-Type': type }, HEAD, extra));
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const body = (req, max) => new Promise((ok, no) => {
  const c = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > max) { no(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else c.push(d); });
  req.on('end', () => ok(Buffer.concat(c))); req.on('error', no);
});
const json = async req => JSON.parse((await body(req, 1 << 20)).toString() || '{}');
// Pages and read-only files the tabs use. The rest of the repo isn't served.
const PAGES = { '/': 'fork/asset-admin.html', '/index.html': 'fork/asset-admin.html', '/radiants.html': 'fork/radiant-admin.html',
  '/radiant-kit/': 'radiant-kit/index.html', '/radiant-kit/index.html': 'radiant-kit/index.html',
  '/CREDITS.md': 'CREDITS.md', '/CREDITS-LAB.md': 'CREDITS-LAB.md', '/CREDITS-MEGAS.md': 'CREDITS-MEGAS.md' };
const CHANGES = new Set(['stage', 'unstage', 'apply', 'unoverride', 'check', 'import', 'rarity', 'publish']);

const server = http.createServer(async (req, res) => {
  try {
    // Only this PC, by its own name (no other site, no DNS tricks).
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return send(res, 403, { error: 'host' });
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && PAGES[u.pathname]) {
      const f = path.join(ROOT, PAGES[u.pathname]);
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]) : send(res, 404, { error: 'not found' });
    }
    if (!u.pathname.startsWith('/api/')) {
      // Read-only: the game's art, data scripts and fonts, for the previews.
      if (req.method !== 'GET') return send(res, 405, { error: 'read only' });
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      const okDir = ['assets', 'js'].some(d => file.startsWith(path.join(ROOT, d) + path.sep));
      if (!okDir || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    if ((req.headers['x-key'] || u.searchParams.get('k')) !== KEY) return send(res, 403, { error: 'key' });
    // A change only from this page itself (not a form or script on another site).
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return send(res, 403, { error: 'origin' });
    const parts = u.pathname.split('/').slice(2).map(decodeURIComponent);
    const what = parts[0];
    if (req.method === 'POST' && CHANGES.has(what) && !sync.ready)
      return send(res, 423, { error: 'Still syncing with GitHub: wait for it to finish.', sync: syncView() });

    if (req.method === 'GET' && what === 'state') return send(res, 200, state());
    if (req.method === 'GET' && what === 'sync') return send(res, 200, syncView());
    if (req.method === 'POST' && what === 'sync') {
      if ((await json(req)).recheckPush) sync.canPush = null;      // "Check again" after accepting an invite
      doSync('manual'); return send(res, 202, syncView());
    }

    // ---- gallery ----
    if (req.method === 'GET' && what === 'index') return send(res, 200, { files: gallery.index(), overrides: gallery.overrides(), revs: gallery.revs() });
    if (req.method === 'POST' && what === 'icons') return send(res, 200, { count: gallery.setNatives((await json(req)).icons) });
    if (req.method === 'GET' && what === 'staged') {
      const e = gallery.staged.get(parts.slice(1).join('/'));
      return e ? send(res, 200, e.buf, 'image/png') : send(res, 404, { error: 'not staged' });
    }
    if (req.method === 'POST' && what === 'stage') {
      const name = decodeURIComponent(req.headers['x-name'] || 'upload.png');
      const aim = { target: req.headers['x-target'] ? decodeURIComponent(req.headers['x-target']) : null, icon: req.headers['x-icon'] ? decodeURIComponent(req.headers['x-icon']) : null };
      let results;
      try { results = gallery.stage(await body(req, 1200 << 20), name, aim); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.message }); }
      return send(res, 200, { results, state: state() });
    }
    if (req.method === 'POST' && what === 'unstage') {
      const { keys = [] } = await json(req);
      for (const k of keys.length ? keys : [...gallery.staged.keys()]) gallery.staged.delete(k);
      return send(res, 200, state());
    }
    if (req.method === 'POST' && what === 'apply') {
      const { keys = [] } = await json(req);
      const done = await lock(() => gallery.apply(keys));
      return send(res, 200, { done, index: gallery.index(), overrides: gallery.overrides(), state: state() });
    }
    // Undo (allowed while blocked: it's the way out of a conflict at start).
    if (req.method === 'POST' && what === 'revert') {
      const { paths = [] } = await json(req);
      const done = await lock(() => revert(paths));
      return send(res, 200, { done, state: state() });
    }
    if (req.method === 'POST' && what === 'unoverride') {
      const { name } = await json(req);
      await lock(() => gallery.unoverride(name));
      return send(res, 200, { overrides: gallery.overrides(), state: state() });
    }

    // ---- radiants (fork/radiant-admin.html) ----
    if (req.method === 'GET' && what === 'file') {           // /api/file/{id}/{dex}/{part}/{anim}
      const [, id, dex, part, anim] = parts;
      const m = rad.uploads.get(id) && rad.uploads.get(id).mons.get(+dex);
      const buf = m && m.files[part] && m.files[part][anim];
      return buf ? send(res, 200, buf, 'image/png') : send(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && what === 'check') {
      const id = crypto.randomBytes(6).toString('hex');
      let files;
      try { files = imp.unzip(await body(req, 1200 << 20)); } catch (e) { return send(res, 400, { error: e.message }); }
      const { mons, ignored } = imp.group(files);
      rad.uploads.set(id, { name: decodeURIComponent(req.headers['x-name'] || 'upload.zip'), mons });
      return send(res, 200, { id, ignored, mons: rad.check(id) });
    }
    if (req.method === 'POST' && what === 'import') {
      const { picks = [] } = await json(req);
      const r = await lock(() => {
        const done = [], rar = {};
        for (const p of picks) { const x = rad.importOne(p.id, +p.dex); done.push({ dex: +p.dex, name: x.name, count: x.copy.length, warnings: x.warnings }); rar[p.dex] = p.rarity; }
        return { done, out: rad.relist(rar) };
      });
      return send(res, 200, Object.assign(r, { state: state() }));
    }
    if (req.method === 'POST' && what === 'rarity') {
      const { rarities = {} } = await json(req);
      const out = await lock(() => rad.relist(rarities));
      return send(res, 200, { out, state: state() });
    }
    if (req.method === 'POST' && what === 'publish') {
      const opts = await json(req);
      try { return send(res, 200, Object.assign(await publish(opts), { state: state() })); }
      catch (e) { return send(res, 409, { error: e.message, state: state() }); }
    }
    send(res, 404, { error: 'unknown' });
  } catch (e) { send(res, e.code === 413 ? 413 : 500, { error: e.message }); }
});

function start({ tab } = {}) {
  const PORT = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8130;     // 0: any free port
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy: the Asset Admin is probably open already (or use --port 8131).` : e.message);
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/#k=${KEY}${tab ? '&tab=' + tab : ''}`;
    console.log(`Asset Admin: ${url}\n(this PC only; keep this window open while you use it, Ctrl+C or close it to stop)`);
    if (!args.includes('--no-open')) {
      const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      try { require('child_process').spawn(cmd, a, { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* open it by hand */ }
    }
    doSync('start');
    setInterval(() => { if (!sync.busy && sync.ready) doSync('auto'); }, SYNC_EVERY).unref();
  });
}

module.exports = { start, mergeList, PATHS };
if (require.main === module) start({ tab: (args.find(a => a.startsWith('--tab=')) || '').slice(6) || null });
