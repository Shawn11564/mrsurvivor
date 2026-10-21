#!/usr/bin/env node
// The Asset Admin (fork/asset-admin.cjs + .html, fork/asset-gallery.cjs), in headless Edge:
//
//   node fork/test-asset-admin.cjs
//
// The real server runs in a throwaway copy of the repo that is its own git repo, with a bare repo
// as "origin", a second clone of it as "the other person", and an unrelated change left in the
// checkout:
//   1. Only this PC with the key; another Host, another Origin, paths outside the game: refused.
//   2. The first sync with GitHub: the page is blocked behind its progress and changes are refused
//      (423) until it's done, then it unlocks.
//   3. Gallery: a tile per Pokémon, its files by part; Radiants and Sprite Kit tabs load.
//   4. Download a sheet: named pokemon__150__Idle.png, the same bytes as the game's.
//   5. Bulk upload (a zip, matched by name): right ones staged; wrong size, no match and the Sprite
//      Kit's layout refused with the reason. One file onto a file, whatever its name.
//   6. Code icons: all of them listed, drawn by the game's code; ×4 download; a ×4 PNG staged,
//      a size that isn't a multiple refused.
//   7. Apply: files replaced, their hashes in asset-rev.json, the icon in icon-overrides.json.
//   8. The other person publishes meanwhile: "Check GitHub now" brings it in and keeps ours
//      (both lists merged).
//   9. Publish: only the tool's files, a message naming them, pushed; nothing left after.
//  10. The other person publishes in the very moment we push: the push is refused, the tool syncs
//      and pushes again; both commits are on origin.
//  11. A file changed here and on GitHub: the sync stops and names it, ours is kept until
//      "Undo my changes to them", then the sync finishes.
//  12. Undo an applied change from the "changed files" list: file and hash back to what's live.
//  13. Back to the code drawing: the icon's PNG and its entry go.
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('./pw.cjs');
const { recolour, zipOf, sandbox, encode, decode } = require('./radiant-fixtures.cjs');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

const T = sandbox('assetadmin-');
const MON = path.join(T, 'assets/pokemon');
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...a) => sh(T, ...a);
const ORIGIN = T + '-origin.git', OTHER = T + '-other';
execFileSync('git', ['init', '--bare', '-b', 'main', ORIGIN], { stdio: 'ignore' });
fs.writeFileSync(path.join(T, 'notes.txt'), 'one\n');
git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test'); git('config', 'core.autocrlf', 'false');
execFileSync(process.execPath, [path.join(T, 'fork/radiants.cjs')], { cwd: T, stdio: 'ignore' });
git('add', '-A'); git('commit', '-m', 'start'); git('remote', 'add', 'origin', ORIGIN); git('push', '-u', 'origin', 'main');
fs.writeFileSync(path.join(T, 'notes.txt'), 'one\nwork in progress\n');           // not the tool's: must stay out
execFileSync('git', ['clone', '-q', '-c', 'core.autocrlf=false', ORIGIN, OTHER], { stdio: 'ignore' });
for (const [k, v] of [['user.email', 'artist@example.com'], ['user.name', 'Artist'], ['core.autocrlf', 'false']]) sh(OTHER, 'config', k, v);
/** The other person changes files and (unless hold) pushes. */
function other(files, msg, hold = false) {
  sh(OTHER, 'pull', '-q', '--ff-only');
  for (const [rel, data] of Object.entries(files)) fs.writeFileSync(path.join(OTHER, rel), data);
  sh(OTHER, 'add', '-A'); sh(OTHER, 'commit', '-q', '-m', msg);
  if (!hold) sh(OTHER, 'push', '-q', 'origin', 'main');
}

const U = path.join(T, 'uploads'); fs.mkdirSync(U);
const crop = file => { const img = decode(fs.readFileSync(file)); const w = img.w - 1, px = Buffer.alloc(w * img.h * 4);
  for (let y = 0; y < img.h; y++) img.px.copy(px, y * w * 4, y * img.w * 4, y * img.w * 4 + w * 4); return encode({ w, h: img.h, px }); };
const solid = (w, h, rgba) => { const px = Buffer.alloc(w * h * 4); for (let i = 0; i < px.length; i += 4) px.set(rgba, i); return encode({ w, h, px }); };
const NEW = {
  idle150: recolour(path.join(MON, '150/Idle.png')),
  walk6: recolour(path.join(MON, '6/Walk.png')),
  attack150: recolour(path.join(MON, '150/Attack.png')),
  icon: solid(52, 52, [255, 0, 200, 255])
};
fs.writeFileSync(path.join(U, 'bulk.zip'), zipOf({
  'my edits/pokemon__150__Idle.png': NEW.idle150,                // the download's name
  'my edits/assets/pokemon/6/Walk.png': NEW.walk6,               // a real path
  'my edits/pokemon__150__Walk.png': crop(path.join(MON, '150/Walk.png')),   // one pixel narrower
  'my edits/foo.png': NEW.walk6,                                 // no idea where it goes
  'assets/0150_mewtwo/Idle.png': NEW.idle150,                    // the Sprite Kit's layout (a radiant)
  '__MACOSX/._x.png': Buffer.from('junk')
}));
fs.writeFileSync(path.join(U, 'whatever-name.png'), NEW.attack150);
fs.writeFileSync(path.join(U, 'code-icon__lb-g-type@4x.png'), NEW.icon);
fs.writeFileSync(path.join(U, 'code-icon__coin.png'), solid(20, 20, [0, 0, 0, 255]));

(async () => {
  const srv = spawn(process.execPath, [path.join(T, 'fork/asset-admin.cjs'), '--port', '0', '--no-open'], { cwd: T,
    env: Object.assign({}, process.env, { ASSET_ADMIN_HOLD_MS: '5000', ASSET_ADMIN_SYNC_MS: '600000' }) });
  let log = '';
  srv.stderr.on('data', d => { log += d; });
  const url = await new Promise((ok, no) => {
    srv.stdout.on('data', d => { log += d; const m = log.match(/(http:\/\/127\.0\.0\.1:\d+\/#k=[0-9a-f]+)/); if (m) ok(m[1]); });
    setTimeout(() => no(new Error('server did not start: ' + log)), 15000);
  });
  const base = url.split('/#')[0], key = url.split('#k=')[1];
  const raw = (p, opts = {}) => new Promise(ok => {
    const u = new URL(base + p);
    const req = require('http').request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', agent: false,
      headers: Object.assign({ host: u.host, 'x-key': key }, opts.headers || {}) }, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => ok({ status: r.statusCode, body: b })); });
    req.on('error', () => ok({ status: 0 })); req.end(opts.body);
  });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    console.log('1. This PC, with the key');
    check((await raw('/api/state', { headers: { 'x-key': '' } })).status === 403 && (await raw('/api/state', { headers: { 'x-key': 'nope' } })).status === 403, 'no key or a wrong key: refused');
    check((await raw('/api/state', { headers: { host: 'evil.example:80' } })).status === 403, 'another Host header (DNS rebinding): refused');
    check((await raw('/api/unstage', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } })).status === 403, 'a change from another site (Origin): refused');
    const outside = await Promise.all(['/assets/../fork/asset-admin.cjs', '/assets/..%2Fnotes.txt', '/js/..%2F..%2Fnotes.txt', '/fork/asset-gallery.cjs', '/.git/config'].map(p => raw(p).then(r => r.status)));
    check(outside.every(s => s === 404), 'nothing outside assets/, js/ and the tool\'s pages is served', outside);

    console.log('2. The first sync with GitHub');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    await page.waitForSelector('#gate-steps li');
    const gate = await page.evaluate(() => ({ shown: !document.getElementById('gate').hidden, text: document.getElementById('gate').textContent }));
    const blocked = await raw('/api/stage', { method: 'POST', body: NEW.icon, headers: { 'x-name': 'code-icon__lb-g-type@4x.png' } });
    check(gate.shown && /Fetching the latest version from GitHub/.test(gate.text), 'the page is blocked behind the sync\'s progress', gate.text.slice(0, 160));
    check(blocked.status === 423 && /syncing/i.test(blocked.body), 'a change while it syncs: refused (423)', blocked.status);
    await page.waitForFunction(() => document.getElementById('gate').hidden, null, { timeout: 30000 });
    const s0 = await page.evaluate(() => AssetAdmin.state() && AssetAdmin.state().sync);
    check(!!s0, 'the sync screen only goes once the gallery\'s data is in');
    check(s0.ready && s0.canPush === true && !s0.error, 'then it unlocks, and says this PC can publish', { ready: s0.ready, canPush: s0.canPush });

    console.log('3. Gallery');
    await page.waitForFunction(() => document.querySelectorAll('#grid .tile').length > 0);
    const tiles = await page.$$eval('#grid .tile', ts => ts.map(t => t.dataset.id));
    check(tiles.join() === 'mon:1,mon:6,mon:150', 'a tile per Pokémon (Mega and Lab sheets go with theirs)', tiles);
    await page.click('.tile[data-id="mon:150"]');
    const groups = await page.$$eval('#detail .group', g => g.map(x => x.textContent));
    const nFiles = await page.$$eval('#detail .file', f => f.length);
    const want = ['150', 'm150', '150/lab'].reduce((n, d) => n + fs.readdirSync(path.join(MON, d)).filter(f => f.endsWith('.png')).length, 0);
    check(nFiles === want && groups.join() === 'Normal,Lab,Mega · Normal', `Mewtwo: its ${want} files, by part`, { nFiles, groups });
    for (const [t, re] of [['radiants', /Radiants in the game/], ['kit', /Radiant Sprite Kit/]]) {
      await page.click(`.tabs button[data-tab="${t}"]`);
      const fr = await (await page.waitForSelector(`#pane-${t} iframe`)).contentFrame();
      await fr.waitForLoadState('load');
      await fr.waitForFunction(r => new RegExp(r).test(document.body.textContent), re.source, { timeout: 15000 });
      check(true, `the ${t === 'kit' ? 'Sprite Kit' : 'Radiants'} tab loads`);
    }
    check(await page.frame({ url: /radiants\.html/ }).evaluate(() => document.getElementById('pub-box').hidden), 'the Radiants tab hides its own Publish (the bar publishes everything)');
    await page.click('.tabs button[data-tab="gallery"]');

    console.log('4. Download');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#detail .file[data-key="assets/pokemon/150/Idle.png"] .dl1')]);
    const got = fs.readFileSync(await dl.path());
    check(dl.suggestedFilename() === 'pokemon__150__Idle.png' && got.equals(fs.readFileSync(path.join(MON, '150/Idle.png'))), 'named pokemon__150__Idle.png, the game\'s bytes', dl.suggestedFilename());

    console.log('5. Uploads');
    await page.setInputFiles('#up-file', path.join(U, 'bulk.zip'));
    await page.waitForFunction(() => /staged/.test(document.getElementById('results').textContent), null, { timeout: 15000 });
    const res = await page.textContent('#results');
    const keys = () => page.evaluate(() => AssetAdmin.state().staged.map(s => s.key).sort());
    check(JSON.stringify(await keys()) === JSON.stringify(['assets/pokemon/150/Idle.png', 'assets/pokemon/6/Walk.png']), 'by name: the download\'s name and a real path, staged', await keys());
    check(/2 new versions staged, 3 not/.test(res) && /has to stay \d+×\d+/.test(res) && /no match/.test(res) && /Radiant Sprite Kit's layout/.test(res) && !/MACOSX/.test(res),
      'refused with the reason: the wrong size, no match, the Sprite Kit\'s layout (junk skipped)', res.replace(/\s+/g, ' ').slice(0, 300));
    await page.click('#detail .file[data-key="assets/pokemon/150/Attack.png"] .up1');
    await page.setInputFiles('#up-file', path.join(U, 'whatever-name.png'));
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 3);
    check((await keys()).includes('assets/pokemon/150/Attack.png'), 'one file onto a file: staged there, whatever its name');
    check(await page.locator('#detail .file[data-key="assets/pokemon/150/Attack.png"] figure').count() === 2, 'the file shows now and new side by side');
    // Any image onto a file: it takes the file's name and becomes a PNG (a JPG, with a random name).
    const jpg = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 288; c.height = 448;
      const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 288, 448);
      const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9)); return [...new Uint8Array(await b.arrayBuffer())]; });
    await page.click('#detail .file[data-key="assets/pokemon/150/Walk.png"] .up1');
    await page.setInputFiles('#up-file', { name: 'my new walk FINAL.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 4);
    const conv = await page.textContent('#results');
    const w = await page.evaluate(() => AssetAdmin.state().staged.find(s => s.key === 'assets/pokemon/150/Walk.png'));
    check(/my new walk FINAL\.jpg → saved as pokemon__150__Walk\.png, converted from JPG to PNG/.test(conv) && w && w.w === 288 && w.from === 'pokemon__150__Walk.png',
      'a JPG with any name onto Walk: saved as pokemon__150__Walk.png, converted to PNG (and said so)', conv.replace(/\s+/g, ' ').slice(0, 200));
    await page.click('#detail .file[data-key="assets/pokemon/150/Walk.png"] .un1');
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 3);

    console.log('6. Code icons');
    await page.click('#cats button[data-cat="code"]');
    const code = await page.evaluate(() => AssetAdmin.code().map(c => c.n));
    check(code.length > 300 && ['coin', 'lb-g-type', 'type:fire', 'move:ember', 'eff:down:1/2'].every(n => code.includes(n)), `${code.length} code icons, interface, badges, types, moves and arrows`, code.length);
    await page.fill('#q', 'lb-g-type');
    await page.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1);
    await page.click('.tile[data-id="icon:lb-g-type"]');
    const [dl4] = await Promise.all([page.waitForEvent('download'), page.click('#detail .dlc[data-k="4"]')]);
    const d4 = decode(fs.readFileSync(await dl4.path()));
    check(dl4.suggestedFilename() === 'code-icon__lb-g-type@4x.png' && d4.w === 52 && d4.h === 52, 'the ×4 download: 52×52, named code-icon__lb-g-type@4x.png', [dl4.suggestedFilename(), d4.w, d4.h]);
    await page.setInputFiles('#up-file', [path.join(U, 'code-icon__lb-g-type@4x.png'), path.join(U, 'code-icon__coin.png')]);
    await page.waitForFunction(() => /1 new version staged, 1 not/.test(document.getElementById('results').textContent), null, { timeout: 15000 });
    const r6 = await page.textContent('#results');
    const ic = await page.evaluate(() => AssetAdmin.state().staged.find(s => s.key === 'icon:lb-g-type'));
    check(ic && ic.k === 4 && ic.w === 52, 'a ×4 PNG of lb-g-type: staged (×4)', ic && { k: ic.k, w: ic.w });
    const coin = await page.evaluate(() => AssetAdmin.code().find(c => c.n === 'coin'));
    check(new RegExp(`coin.*has to be ${coin.w}×${coin.h} or a whole multiple`).test(r6.replace(/\s+/g, ' ')),
      `a 20×20 coin: refused (not a multiple of ${coin.w}×${coin.h})`, r6.replace(/\s+/g, ' ').slice(0, 200));

    console.log('7. Apply');
    await page.click('#apply');
    await page.waitForFunction(() => /replaced in this copy/.test(document.getElementById('results').textContent), null, { timeout: 15000 });
    const same = (rel, buf) => fs.readFileSync(path.join(T, rel)).equals(buf);
    check(same('assets/pokemon/150/Idle.png', NEW.idle150) && same('assets/pokemon/6/Walk.png', NEW.walk6) && same('assets/pokemon/150/Attack.png', NEW.attack150),
      'the three sheets replaced on disk');
    const REV = () => JSON.parse(fs.readFileSync(path.join(T, 'js/fork/asset-rev.json'), 'utf8'));
    const ICO = () => JSON.parse(fs.readFileSync(path.join(T, 'js/fork/icon-overrides.json'), 'utf8'));
    const hash = b => require('crypto').createHash('sha1').update(b).digest('hex').slice(0, 10);
    check(REV()['assets/pokemon/150/Idle.png'] === hash(NEW.idle150) && Object.keys(REV()).length === 3, 'their hashes in asset-rev.json', REV());
    check(ICO()['lb-g-type'] && ICO()['lb-g-type'].file === 'assets/icons/code/lb-g-type.png' && same('assets/icons/code/lb-g-type.png', NEW.icon) && ICO()['lb-g-type'].w === 52,
      'the icon: assets/icons/code/lb-g-type.png and its entry', ICO());
    check(await page.evaluate(() => AssetAdmin.state().staged.length) === 0, 'nothing staged after');

    console.log('8. The other person publishes meanwhile');
    const theirIdle = recolour(path.join(MON, '1/Idle.png'));
    const theirRev = JSON.stringify({ 'assets/pokemon/1/Idle.png': hash(theirIdle) }, null, 2) + '\n';
    other({ 'assets/pokemon/1/Idle.png': theirIdle, 'js/fork/asset-rev.json': theirRev }, 'Assets: Bulbasaur (#1) Idle');
    await page.click('#sync-now');
    await page.waitForFunction(() => { const s = AssetAdmin.state().sync; return s && !s.busy && /Updating to GitHub/.test(s.steps.map(x => x.text).join()); }, null, { timeout: 30000 });
    check(git('rev-parse', 'HEAD') === sh(ORIGIN, 'rev-parse', 'main'), 'this copy is now at GitHub\'s version', await page.evaluate(() => AssetAdmin.state().sync));
    check(same('assets/pokemon/1/Idle.png', theirIdle) && same('assets/pokemon/150/Idle.png', NEW.idle150), 'their file came in; ours are still here');
    check(Object.keys(REV()).length === 4 && REV()['assets/pokemon/1/Idle.png'] === hash(theirIdle) && REV()['assets/pokemon/150/Idle.png'] === hash(NEW.idle150), 'asset-rev.json: theirs and ours, merged', Object.keys(REV()));

    console.log('9. Publish');
    await page.waitForFunction(() => !document.getElementById('publish').disabled, null, { timeout: 10000 });
    await page.click('#publish');
    await page.waitForFunction(() => !/Syncing with GitHub, committing/.test(document.getElementById('pub-out').textContent), null, { timeout: 60000 });
    const out = await page.textContent('#pub-out');
    check(/^Published/.test(out), 'published', out.slice(0, 200));
    const remote = (...a) => sh(ORIGIN, ...a);
    const msg = remote('log', '-1', '--format=%s', 'main');
    check(msg === 'Assets: Charizard (#6) Walk; Mewtwo (#150) Attack, Idle; code icons lb-g-type', 'the message names them', msg);
    const inCommit = remote('show', '--name-only', '--format=', 'main').split('\n').sort();
    check(JSON.stringify(inCommit) === JSON.stringify(['assets/icons/code/lb-g-type.png', 'assets/pokemon/150/Attack.png', 'assets/pokemon/150/Idle.png', 'assets/pokemon/6/Walk.png', 'js/fork/asset-rev.json', 'js/fork/icon-overrides.json']),
      'only the tool\'s files are in it', inCommit);
    check(/work in progress/.test(fs.readFileSync(path.join(T, 'notes.txt'), 'utf8')) && /notes\.txt/.test(git('status', '--porcelain')), 'the unrelated change is still there, uncommitted');
    await page.waitForFunction(() => /Nothing to publish/.test(document.getElementById('pub-n').textContent), null, { timeout: 10000 });
    check(await page.isDisabled('#publish'), 'nothing left to publish');

    console.log('10. Someone publishes in the very moment we push');
    other({ 'assets/pokemon/1/Walk.png': recolour(path.join(MON, '1/Walk.png')) }, 'Assets: Bulbasaur (#1) Walk', true);
    const hook = path.join(T, '.git/hooks/pre-push');
    fs.writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\nif [ ! -f "${T.replace(/\\/g, '/')}/.raced" ]; then touch "${T.replace(/\\/g, '/')}/.raced"; cd "${OTHER.replace(/\\/g, '/')}" && git push -q origin main; fi\nexit 0\n`);
    fs.chmodSync(hook, 0o755);
    await page.click('#cats button[data-cat="mon"]'); await page.fill('#q', '');
    await page.waitForSelector('.tile[data-id="mon:6"]');
    await page.click('.tile[data-id="mon:6"]');
    await page.waitForSelector('#detail .file[data-key="assets/pokemon/6/Idle.png"]');
    await page.click('#detail .file[data-key="assets/pokemon/6/Idle.png"] .up1');
    const idle6 = recolour(path.join(MON, '6/Idle.png'));
    fs.writeFileSync(path.join(U, 'x.png'), idle6);
    await page.setInputFiles('#up-file', path.join(U, 'x.png'));
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 1);
    await page.click('#apply');
    await page.waitForFunction(() => !document.getElementById('publish').disabled, null, { timeout: 10000 });
    await page.click('#publish');
    await page.waitForFunction(() => /Published 0|Published [0-9a-f]|Couldn't|Someone/.test(document.getElementById('pub-out').textContent) && !/Syncing with GitHub, committing/.test(document.getElementById('pub-out').textContent), null, { timeout: 60000 });
    const out10 = await page.textContent('#pub-out');
    const log10 = remote('log', '-3', '--format=%s', 'main').split('\n');
    check(fs.existsSync(path.join(T, '.raced')) && /^Published/.test(out10), 'the first push was refused (they got in first); synced and pushed again', out10.slice(0, 120));
    check(log10[0] === 'Assets: Charizard (#6) Idle' && log10[1] === 'Assets: Bulbasaur (#1) Walk', 'both commits are on origin, ours on top', log10);
    fs.rmSync(hook);

    console.log('11. A file changed here and on GitHub');
    const mine = recolour(path.join(MON, '6/Hurt.png'), img => { img.px[3] = 0; });
    other({ 'assets/pokemon/6/Hurt.png': recolour(path.join(MON, '6/Hurt.png')) }, 'Assets: Charizard (#6) Hurt');
    await page.click('#detail .file[data-key="assets/pokemon/6/Hurt.png"] .up1');
    fs.writeFileSync(path.join(U, 'y.png'), mine);
    await page.setInputFiles('#up-file', path.join(U, 'y.png'));
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 1);
    await page.click('#apply');
    await page.waitForFunction(() => /replaced/.test(document.getElementById('results').textContent));
    await page.click('#sync-now');
    await page.waitForFunction(() => { const s = AssetAdmin.state().sync; return s && !s.busy && s.error; }, null, { timeout: 30000 });
    const err = await page.evaluate(() => AssetAdmin.state().sync.error);
    check(/assets\/pokemon\/6\/Hurt\.png/.test(err) && /changed here AND on GitHub/.test(err), 'the sync stops and names the file', err);
    check(same('assets/pokemon/6/Hurt.png', mine) && REV()['assets/pokemon/6/Hurt.png'] === hash(mine), 'ours is kept, with its hash', REV()['assets/pokemon/6/Hurt.png']);
    check(await page.isVisible('#banners .banner.bad') && await page.evaluate(() => document.getElementById('gate').hidden), 'a banner says so; the tool stays usable');
    await page.click('#b-undo');
    await page.waitForFunction(() => { const s = AssetAdmin.state().sync; return s && !s.busy && !s.error && s.at; }, null, { timeout: 30000 });
    await page.waitForFunction(() => !(AssetAdmin.state().sync.conflicts || []).length);
    check(git('rev-parse', 'HEAD') === sh(ORIGIN, 'rev-parse', 'main') && same('assets/pokemon/6/Hurt.png', fs.readFileSync(path.join(OTHER, 'assets/pokemon/6/Hurt.png'))) && !REV()['assets/pokemon/6/Hurt.png'],
      '"Undo my changes to them": ours goes (and its hash), the sync finishes, theirs is in', REV()['assets/pokemon/6/Hurt.png']);

    console.log('12. Undo an applied change from the list');
    await page.click('#detail .file[data-key="assets/pokemon/6/Faint.png"] .up1');
    fs.writeFileSync(path.join(U, 'z.png'), recolour(path.join(MON, '6/Faint.png')));
    await page.setInputFiles('#up-file', path.join(U, 'z.png'));
    await page.waitForFunction(() => AssetAdmin.state().staged.length === 1);
    await page.click('#apply');
    await page.waitForFunction(() => !document.getElementById('ch-toggle').hidden);
    await page.click('#ch-toggle');
    await page.click('#changed tr[data-p="assets/pokemon/6/Faint.png"] .undo1');
    await page.waitForFunction(() => /back to what's live/.test(document.getElementById('results').textContent));
    check(!/Faint/.test(git('status', '--porcelain')) && !REV()['assets/pokemon/6/Faint.png'] && /^M notes\.txt$/m.test(git('status', '--porcelain')),
      'the file and its hash are back to what\'s live; nothing else touched', git('status', '--porcelain'));

    console.log('13. Back to the code drawing');
    await page.click('#cats button[data-cat="code"]'); await page.fill('#q', 'lb-g-type');
    await page.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1);
    await page.click('.tile[data-id="icon:lb-g-type"]');
    await page.click('#detail .unov');
    await page.waitForFunction(() => !AssetAdmin.overrides()['lb-g-type']);
    check(!ICO()['lb-g-type'] && !fs.existsSync(path.join(T, 'assets/icons/code/lb-g-type.png')), 'the PNG and its entry are gone (publish to send it)');
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  await new Promise(ok => { srv.once('exit', ok); srv.kill(); });
  for (const d of [T, ORIGIN, OTHER]) try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp dir: Windows may hold it a moment */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll asset admin checks passed');
  process.exit(failures ? 1 : 0);
})();
