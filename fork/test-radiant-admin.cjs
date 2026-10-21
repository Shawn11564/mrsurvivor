#!/usr/bin/env node
// The local radiant admin page (fork/radiant-admin.cjs + fork/radiant-admin.html, the Radiants tab of
// fork/asset-admin.cjs, which fork/radiant-admin.cjs starts), in headless Edge:
//
//   node fork/test-radiant-admin.cjs
//
// The real server runs in a throwaway copy of the repo that is its own git repo, with a bare
// repo as "origin" and an unrelated change left in the checkout. On zips made from the real
// sheets with every RGB inverted (a "recolour"):
//   1. Only this PC with the key: no key, a wrong key or another Host header is refused.
//   2. Dropping two zips (the Kit's layout with Charizard, its Lab and Mega; the older layout
//      with Mewtwo) and a broken one (Bulbasaur missing a sheet) shows a card for each: new,
//      sheet count, warnings, the broken one can't be picked.
//   3. Preview: the normal and the radiant frames are drawn, and differ.
//   4. Rarity: Mewtwo set to Common; the odds line follows the game's weights. Import copies
//      the sheets, keeps the rarities in radiants.json, and both lists agree.
//   5. Changing a radiant's rarity from the table is saved.
//   6. Publish commits only the radiant files (the unrelated change stays out) with a message
//      naming them, pushes main to origin; nothing left to publish afterwards. Another commit
//      not pushed yet blocks it until the box is ticked.
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('./pw.cjs');
const { recolour, zipOf, sandbox, kit, rarity } = require('./radiant-fixtures.cjs');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

const T = sandbox('radadmin-');
const MON = path.join(T, 'assets/pokemon');
const git = (...a) => execFileSync('git', a, { cwd: T, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ORIGIN = T + '-origin.git';
execFileSync('git', ['init', '--bare', '-b', 'main', ORIGIN], { stdio: 'ignore' });
fs.writeFileSync(path.join(T, 'notes.txt'), 'one\n');
git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
git('config', 'core.autocrlf', 'false');
execFileSync(process.execPath, [path.join(T, 'fork/radiants.cjs')], { cwd: T, stdio: 'ignore' });
git('add', '-A'); git('commit', '-m', 'start'); git('remote', 'add', 'origin', ORIGIN); git('push', '-u', 'origin', 'main');
fs.writeFileSync(path.join(T, 'notes.txt'), 'one\nwork in progress\n');           // not a radiant: must stay out

const Z = path.join(T, 'zips'); fs.mkdirSync(Z);
fs.writeFileSync(path.join(Z, '0006_charizard.zip'), zipOf({ ...kit('assets/0006_charizard', path.join(MON, '6')),
  ...kit('assets/0006_charizard/lab', path.join(MON, '6/lab')), ...kit('assets/0006_charizard/mega', path.join(MON, 'm6')), 'README.txt': Buffer.from('x') }));
fs.writeFileSync(path.join(Z, '0150_mewtwo.zip'), zipOf({ ...kit('0150_mewtwo/assets/pokemon/150/r', path.join(MON, '150')),
  ...kit('0150_mewtwo/assets/pokemon/150/r/lab', path.join(MON, '150/lab')) }));
fs.writeFileSync(path.join(Z, '0001_bulbasaur.zip'), zipOf(kit('assets/0001_bulbasaur', path.join(MON, '1'), { skip: ['Faint'] })));

(async () => {
  const srv = spawn(process.execPath, [path.join(T, 'fork/radiant-admin.cjs'), '--port', '0', '--no-open'], { cwd: T });
  let log = '';
  srv.stderr.on('data', d => { log += d; });
  const url = await new Promise((ok, no) => {
    srv.stdout.on('data', d => { log += d; const m = log.match(/(http:\/\/127\.0\.0\.1:\d+\/#k=[0-9a-f]+)/); if (m) ok(m[1]); });
    setTimeout(() => no(new Error('server did not start: ' + log)), 15000);
  });
  const base = url.split('/#')[0], key = url.split('#k=')[1];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    console.log('1. This PC, with the key');
    const st = (h = {}) => fetch(base + '/api/state', { headers: h }).then(r => r.status);
    check(await st() === 403 && await st({ 'x-key': 'nope' }) === 403 && await st({ 'x-key': key }) === 200, 'no key or a wrong key: refused; the key: ok');
    const other = await new Promise(ok => require('http').get(base + '/api/state', { agent: false, headers: { host: 'evil.example:80', 'x-key': key } },
      r => { r.resume(); ok(r.statusCode); }).on('error', () => ok(0)));
    check(other === 403, 'another Host header (DNS rebinding): refused');

    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    // Nothing can change until the Asset Admin's first sync with GitHub (here, the bare origin) is done.
    for (let i = 0; i < 100; i++) { const s = await fetch(base + '/api/sync', { headers: { 'x-key': key } }).then(r => r.json()); if (s.ready) break; await new Promise(r => setTimeout(r, 200)); }
    await page.goto(base + '/radiants.html#k=' + key);
    await page.waitForFunction(() => window.RadiantAdmin && RadiantAdmin.state());
    check(/None yet/.test(await page.textContent('#current')), 'the game has no radiants yet');

    console.log('2. Dropping the zips');
    await page.setInputFiles('#file', ['0006_charizard.zip', '0150_mewtwo.zip', '0001_bulbasaur.zip'].map(f => path.join(Z, f)));
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 3, null, { timeout: 15000 });
    const card = dex => page.locator(`.card[data-dex="${dex}"]`);
    const zard = await card(6).textContent(), two = await card(150).textContent(), bulba = await card(1).textContent();
    check(/new radiant/.test(zard) && /15 sheets · Lab · Mega/.test(zard) && /All sheets check out/.test(zard), 'Charizard: new, 15 sheets with Lab and Mega, all fine');
    check(/8 sheets · Lab/.test(two) && /no Mega sheets/.test(two), 'Mewtwo (older layout): 8 sheets, warned about its missing Mega');
    check(/can't import/.test(bulba) && /missing Faint\.png/.test(bulba) && await card(1).locator('.pick').isDisabled(), 'Bulbasaur missing a sheet: shown, can\'t be picked');
    check(await card(6).locator('.rar').inputValue() === String(rarity(6)), 'rarity defaults to the Pokémon\'s own', rarity(6));

    console.log('3. Preview');
    await card(6).locator('.pv').click();
    await page.waitForTimeout(600);
    const px = await card(6).evaluate(el => [...el.querySelectorAll('.stage canvas')].slice(0, 2).map(c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { n++; sum += d[i] + d[i + 1] + d[i + 2]; }
      return { n, avg: n ? sum / n : 0 };
    }));
    check(px.length === 2 && px[0].n > 50 && px[0].n === px[1].n && Math.abs(px[0].avg - px[1].avg) > 30, 'normal and radiant frames are drawn: same outline, other colours', px);
    await card(6).locator('.sheets button', { hasText: 'Mega Attack' }).click();
    check(await card(6).locator('.sheets button.on').textContent() === 'Mega Attack', 'every sheet can be previewed (Mega Attack)');

    console.log('4. Rarity and import');
    await card(150).locator('.rar').selectOption('1');
    const W = await page.evaluate(() => RadiantAdmin.state().weights);
    const want = (100 * W[1] / (W[1] + W[rarity(6)])).toFixed(1) + '%';
    const oddsLine = await page.textContent('#odds');
    check(oddsLine.includes('Mewtwo ' + want), `the odds line uses the game's weights (Mewtwo ${want})`, oddsLine);
    await page.click('#import');
    await page.waitForFunction(() => /sheets copied/.test(document.getElementById('import-out').textContent), null, { timeout: 20000 });
    const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
    const has = rel => fs.existsSync(path.join(MON, rel));
    check(ANIMS.every(a => has(`6/r/${a}.png`) && has(`m6/r/${a}.png`) && has(`150/r/${a}.png`)) && has('6/r/lab/SpAttack.png') && has('150/r/lab/SpAttack.png') && !has('1/r'),
      'sheets copied to 6/r/, 6/r/lab/, m6/r/, 150/r/ (not Bulbasaur)');
    const J = JSON.parse(fs.readFileSync(path.join(T, 'js/fork/radiants.json'), 'utf8'));
    const L = JSON.parse(fs.readFileSync(path.join(T, 'js/fork/radiant-list.js'), 'utf8').match(/G\.RADIANTS = (\{.*\});/)[1]);
    check(J[6].rarity === rarity(6) && J[150].rarity === 1 && J[6].mega && J[150].lab.join() === 'SpAttack', 'radiants.json: Charizard its own rarity, Mewtwo Common', J);
    check(JSON.stringify(J) === JSON.stringify(L), 'radiant-list.js says the same');
    check((await page.locator('.card').count()) === 1 && /Mewtwo/.test(await page.textContent('#current')), 'imported cards go; the table lists them');

    console.log('5. Changing a rarity');
    await page.locator('tr[data-dex="150"] .cur-rar').selectOption('5');
    await page.click('#save-rar');
    await page.waitForFunction(() => /Saved/.test(document.getElementById('rar-note') ? document.getElementById('rar-note').textContent : '') || RadiantAdmin.state().radiants[150].rarity === 5);
    check(JSON.parse(fs.readFileSync(path.join(T, 'js/fork/radiants.json'), 'utf8'))[150].rarity === 5, 'Mewtwo is Legendary in radiants.json');

    console.log('6. Publish');
    const files = await page.textContent('#git');
    check(/radiant files? to publish/.test(files) && !/notes\.txt/.test(files), 'the list shows radiant files only');
    await page.click('#publish');
    await page.waitForFunction(() => /Published|failed|nothing/i.test(document.getElementById('pub-out').textContent), null, { timeout: 30000 });
    const out = await page.textContent('#pub-out');
    check(/Published/.test(out), 'published', out.slice(0, 200));
    const remote = (...a) => execFileSync('git', ['--git-dir', ORIGIN, ...a], { encoding: 'utf8' }).trim();
    const shown = remote('show', '--stat', '--format=%s', 'main');
    check(/^Radiants: Charizard \(#6\) new, Mewtwo \(#150\) new/.test(shown), 'origin/main got the commit, naming them', shown.split('\n')[0]);
    const inCommit = remote('show', '--name-only', '--format=', 'main').split('\n');
    // Charizard 7 + Lab 1 + Mega 7, Mewtwo 7 + Lab 1 = 23 sheets, and the two lists.
    check(inCommit.length === 25 && inCommit.every(f => /^assets\/pokemon\/m?\d+\/r\//.test(f) || /^js\/fork\/(radiants\.json|radiant-list\.js)$/.test(f)), 'only the 23 sheets and the two lists are in it', inCommit.length);
    check(/work in progress/.test(fs.readFileSync(path.join(T, 'notes.txt'), 'utf8')) && /notes\.txt/.test(git('status', '--porcelain')), 'the unrelated change is still there, uncommitted');
    check(await page.isDisabled('#publish') && /No radiant changes/.test(await page.textContent('#git')), 'nothing left to publish');

    // Another local commit not pushed yet: publish waits for the box.
    git('commit', '-am', 'something else');
    await page.locator('tr[data-dex="6"] .cur-rar').selectOption('1');
    await page.click('#save-rar');
    await page.waitForFunction(() => RadiantAdmin.state().git.ahead === 1, null, { timeout: 10000 });
    check(await page.isDisabled('#publish') && await page.isVisible('#ahead-ok') && /something else/.test(await page.textContent('#ahead-text')), 'an unpushed commit: publish waits for the box, naming it');
    // Only modified files now (" M path" lines): every path listed in full.
    const listed = await page.$eval('#git pre', e => e.textContent.split('\n'));
    check(listed.join() === 'js/fork/radiant-list.js,js/fork/radiants.json', 'modified files are listed by their full path', listed);
    await page.check('#ahead-box');
    await page.click('#publish');
    await page.waitForFunction(() => /Published/.test(document.getElementById('pub-out').textContent), null, { timeout: 30000 });
    check(remote('log', '--format=%s', '-2', 'main').split('\n').join(' | ') === 'Radiants: Charizard (#6) | something else', 'with the box ticked, both go; a rarity change is named');
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  await new Promise(ok => { srv.once('exit', ok); srv.kill(); });
  for (const d of [T, ORIGIN]) try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp dir: Windows may hold it a moment */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll radiant admin checks passed');
  process.exit(failures ? 1 : 0);
})();
