#!/usr/bin/env node
// The Asset Admin publishes from a PC where git has no name and email (fork/asset-admin.cjs, identity):
//
//   node fork/test-asset-admin-identity.cjs
//
// The artist's first publish failed with "Author identity unknown": signing in to GitHub lets git
// push, but a commit also needs a name and email, and a fresh Git install has none. Here the real
// server runs in a throwaway clone with no name or email in any git config (no system or global
// config, nothing guessed from the PC's name), publishing to a bare repo standing in for GitHub:
//   1. Signed in to GitHub: the commit is the GitHub account's (its name and its private
//      noreply address), read from api.github.com with the saved sign-in (here a fake of both).
//   2. Not signed in (no saved sign-in to ask with): it still publishes, as "<PC user> (Asset Admin)".
//   3. A name and email set in git: those are used, not replaced.
//   No git config is written in any case.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { spawn, execFileSync } = require('child_process');
const { sandbox } = require('./radiant-fixtures.cjs');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

const T = sandbox('assetid-'), ORIGIN = T + '-origin.git', EMPTY = T + '-global.gitconfig';
fs.writeFileSync(EMPTY, '');
const git = (...a) => execFileSync('git', a, { cwd: T, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
execFileSync('git', ['init', '--bare', '-b', 'main', ORIGIN], { stdio: 'ignore' });
git('init', '-b', 'main'); git('config', 'core.autocrlf', 'false');
execFileSync(process.execPath, [path.join(T, 'fork/radiants.cjs')], { cwd: T, stdio: 'ignore' });
git('add', '-A'); git('-c', 'user.name=Setup', '-c', 'user.email=setup@example.com', 'commit', '-q', '-m', 'start');
git('remote', 'add', 'origin', ORIGIN); git('push', '-q', '-u', 'origin', 'main');
const config = () => fs.readFileSync(path.join(T, '.git/config'), 'utf8') + fs.readFileSync(EMPTY, 'utf8');
const config0 = config();

// The artist's PC: no name or email anywhere, and none guessed from the PC's name.
const BASE_ENV = Object.assign({}, process.env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: EMPTY, ASSET_ADMIN_SYNC_MS: '600000' });
for (const k of ['EMAIL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_CONFIG_PARAMETERS']) delete BASE_ENV[k];
const cfg = pairs => Object.assign({ GIT_CONFIG_COUNT: String(pairs.length) },
  ...pairs.map(([k, v], i) => ({ ['GIT_CONFIG_KEY_' + i]: k, ['GIT_CONFIG_VALUE_' + i]: v })));

// A fake api.github.com/user: answers only with the saved sign-in's token.
let apiHits = 0;
const api = http.createServer((req, res) => {
  apiHits++;
  const ok = req.url === '/user' && req.headers.authorization === 'Bearer tok-123';
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
  res.end(JSON.stringify(ok ? { login: 'pixel-artist', id: 4242, name: 'Pixel Artist' } : { message: 'Bad credentials' }));
});

async function publishWith(env, n) {
  const srv = spawn(process.execPath, [path.join(T, 'fork/asset-admin.cjs'), '--port', '0', '--no-open'], { cwd: T, env });
  let log = '';
  srv.stderr.on('data', d => { log += d; });
  try {
    const url = await new Promise((ok, no) => {
      srv.stdout.on('data', d => { log += d; const m = log.match(/(http:\/\/127\.0\.0\.1:\d+)\/#k=([0-9a-f]+)/); if (m) ok(m); });
      setTimeout(() => no(new Error('server did not start: ' + log)), 15000);
    });
    const call = (p, body) => fetch(url[1] + p, { method: body ? 'POST' : 'GET', headers: { 'x-key': url[2] }, body: body && JSON.stringify(body) }).then(r => r.json());
    for (let i = 0; i < 100 && !(await call('/api/sync')).ready; i++) await new Promise(r => setTimeout(r, 200));
    const rev = path.join(T, 'js/fork/asset-rev.json');
    fs.writeFileSync(rev, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(rev, 'utf8')), { ['test-' + n]: 'x' }), null, 2) + '\n');
    const r = await call('/api/publish', {});
    const author = execFileSync('git', ['log', '-1', '--format=%an <%ae>|%cn <%ce>', 'main'], { cwd: ORIGIN, encoding: 'utf8' }).trim();
    return { error: r.error, author: author.split('|')[0], committer: author.split('|')[1], log };
  } finally { srv.kill(); }
}

(async () => {
  try {
    await new Promise(r => api.listen(0, '127.0.0.1', r));
    const API = `http://127.0.0.1:${api.address().port}`;
    let plain;
    try { execFileSync('git', ['var', 'GIT_AUTHOR_IDENT'], { cwd: T, env: Object.assign({}, BASE_ENV, cfg([['user.useConfigOnly', 'true']])), stdio: 'pipe' }); plain = 'has one'; }
    catch (e) { plain = 'none'; }
    check(plain === 'none', 'the setup: git has no name or email here (like the artist\'s PC)', plain);

    console.log('1. Signed in to GitHub');
    const signedIn = await publishWith(Object.assign({}, BASE_ENV, { ASSET_ADMIN_GITHUB_API: API },
      cfg([['user.useConfigOnly', 'true'], ['credential.helper', '!f() { echo username=pixel-artist; echo password=tok-123; }; f']])), 1);
    check(!signedIn.error, 'published', signedIn.error);
    check(signedIn.author === 'Pixel Artist <4242+pixel-artist@users.noreply.github.com>' && signedIn.committer === signedIn.author,
      'as the GitHub account: its name and noreply address', signedIn.author);

    console.log('2. Not signed in');
    const before = apiHits;
    const anon = await publishWith(Object.assign({}, BASE_ENV, { ASSET_ADMIN_GITHUB_API: API }, cfg([['user.useConfigOnly', 'true']])), 2);
    check(!anon.error, 'published anyway', anon.error);
    check(anon.author === `${os.userInfo().username} (Asset Admin) <asset-admin@users.noreply.github.com>`, 'as "<PC user> (Asset Admin)"', anon.author);
    check(apiHits === before, 'GitHub isn\'t asked without a sign-in to ask with', apiHits - before);

    console.log('3. A name and email set in git');
    const own = await publishWith(Object.assign({}, BASE_ENV, { ASSET_ADMIN_GITHUB_API: API },
      cfg([['user.useConfigOnly', 'true'], ['user.name', 'Own Name'], ['user.email', 'own@example.com'], ['credential.helper', '!f() { echo username=pixel-artist; echo password=tok-123; }; f']])), 3);
    check(!own.error && own.author === 'Own Name <own@example.com>', 'used as they are', own.error || own.author);

    check(config() === config0, 'no git config written');
  } catch (e) { console.error(e); failures++; }
  api.close();
  for (const d of [T, ORIGIN, EMPTY]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* Windows: a file still open */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Asset Admin identity checks passed');
  process.exit(failures ? 1 : 0);
})();
