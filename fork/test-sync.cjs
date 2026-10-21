/* ============ fork/test-sync.cjs — regression check for fork/sync.cjs ============
 *   node fork/test-sync.cjs [--keep]
 *
 * In a throwaway clone (the real checkout is never touched):
 *   1. "fork" = upstream/main~3 + the fork files as they are on disk now, built.
 *   2. "fake upstream" = upstream/main + a probe commit: a dev.html paragraph, a
 *      js/ui/ui.js line and a contacto/ page line, released with upstream's own
 *      `node tools/build.js` (so its index.html/app.min.js change too, as in a real release).
 *   3. `node fork/sync.cjs --from fake` must merge with no conflicts, and the result must
 *      carry every probe, branded, with the fork's credit and no upstream name or contact.
 *      It must also stay English first (fork/english.cjs): the English default in
 *      js/core/locales.js, an English / with our link preview, and the fork's README.md
 *      kept over upstream's (merge=ours), though the probe release edits it.
 *   4. A fork edit on the same line as upstream's must stop the sync and name the file.
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const SRC = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'mrsurvivor-sync-test-' + Date.now());
const KEEP = process.argv.includes('--keep');
const git = (...a) => execFileSync('git', a, { cwd: TMP, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const node = (args, env = {}) => spawnSync(process.execPath, args, { cwd: TMP, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 << 20 });
const read = f => fs.readFileSync(path.join(TMP, f), 'utf8');
const edit = (f, anchor, insert) => {
  const t = read(f);
  if (!t.includes(anchor)) throw new Error(`probe anchor missing in ${f}: ${anchor}`);
  fs.writeFileSync(path.join(TMP, f), t.replace(anchor, insert + anchor));
};
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };
const FORK_FILES = ['fork/brand.cjs', 'fork/build.cjs', 'fork/sync.cjs', 'fork/test-sync.cjs', 'fork/README.md',
  'fork/english.cjs', 'assets/fork/og-image.jpg', 'js/core/locales.js', 'README.md',
  'css/brand.css', '.gitattributes', 'js/core/firebase-config.js', 'CLAUDE.local.md'];

try {
  console.log('test-sync: cloning into ' + TMP);
  execFileSync('git', ['clone', '-q', '--no-checkout', SRC, TMP]);
  git('fetch', '-q', SRC, '+refs/remotes/upstream/main:refs/remotes/upstream/main');
  git('config', 'user.name', 'test'); git('config', 'user.email', 'test@localhost');

  // 1. the fork, a few upstream commits behind
  git('checkout', '-q', '-b', 'fork', 'upstream/main~3');
  for (const f of FORK_FILES) {
    if (!fs.existsSync(path.join(SRC, f))) continue;
    fs.mkdirSync(path.dirname(path.join(TMP, f)), { recursive: true });
    fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
  }
  console.log('test-sync: building the fork…');
  let r = node(['fork/build.cjs']);
  if (r.status !== 0) throw new Error('fork build failed:\n' + r.stdout.slice(-2000) + r.stderr.slice(-2000));
  git('add', '-A'); git('commit', '-q', '-m', 'fork');
  const forkHead = git('rev-parse', 'HEAD');

  // 2. fake upstream release on top of the real upstream/main
  git('checkout', '-q', '-b', 'fake', 'upstream/main');
  edit('dev.html', '<h3>Contenido de terceros</h3>', '<p>upstream-probe-dev</p>\n    ');
  edit('js/ui/ui.js', '  const CONTACT =', '  // upstream-probe-js\n');
  edit('contacto/index.html', '<ul class="contact">', '<p>upstream-probe-contacto</p>\n  ');
  fs.appendFileSync(path.join(TMP, 'README.md'), '\nupstream-probe-readme\n');
  console.log('test-sync: releasing the fake upstream with tools/build.js…');
  r = node(['tools/build.js']);
  if (r.status !== 0) throw new Error('upstream build failed:\n' + r.stderr.slice(-2000));
  git('add', '-A'); git('commit', '-q', '-m', 'upstream probe release');
  const fake = git('rev-parse', 'HEAD');

  // 3. clean sync
  git('checkout', '-q', 'fork');
  console.log('test-sync: node fork/sync.cjs --from fake…');
  r = node(['fork/sync.cjs', '--from', 'fake']);
  check(r.status === 0, 'sync exits 0' + (r.status ? ':\n' + r.stdout.slice(-1500) + r.stderr.slice(-1500) : ''));
  check(git('rev-parse', 'HEAD^1') === forkHead && git('rev-parse', 'HEAD^2') === fake, 'HEAD is a merge of fork + upstream');
  check(git('status', '--porcelain') === '', 'working tree clean after sync');
  const bundle = read('tools/cache/app.js');
  check(read('index.html').includes('upstream-probe-dev'), "upstream's dev.html change is in the built index.html");
  check(bundle.includes('upstream-probe-js'), "upstream's js change is in the bundle");
  check(read('contacto/index.html').includes('upstream-probe-contacto'), "upstream's contacto/ change landed (pristine page re-branded)");
  check(read('js/core/firebase-config.js') === fs.readFileSync(path.join(SRC, 'js/core/firebase-config.js'), 'utf8'), "the fork's firebase-config.js survived");
  check(bundle.includes('Fork of Pok&eacute;Survivor by JPTER78'), 'about-box credit is in the bundle');
  check(read('index.html').includes('Required Notice: Copyright 2026 JPTER78'), 'legal credit + Required Notice in index.html');
  check(/css\/brand\.css\?v=/.test(read('index.html')) && /css\/brand\.css\?v=/.test(read('en/index.html')), 'brand.css linked in both game pages');
  check(read('CNAME').trim() === 'play.mrshawn.dev', 'CNAME is the fork domain');
  const idx = read('index.html');
  check(/<html lang="en">/.test(idx) && idx.includes('<meta property="og:title" content="MrSurvivor – Survive the Pokémon hordes">')
    && idx.includes('<meta property="og:image" content="https://play.mrshawn.dev/assets/fork/og-image.jpg">'), 'index.html is English, with our link preview');
  check(read('js/core/locales.js').includes("const lang = normalize(saved) || 'en';"), 'English is still the default language (js/core/locales.js)');
  const lf = s => s.replace(/\r\n/g, '\n');
  check(lf(read('README.md')) === lf(fs.readFileSync(path.join(SRC, 'README.md'), 'utf8')), "the fork's README.md survived upstream's edit (merge=ours)");
  const g = spawnSync('git', ['grep', '-lE', 'PokéSurvivor|pokesurvivor\\.com|jpieratorregrosa', 'HEAD', '--',
    '*.html', '*.webmanifest', '*.xml', '*.txt', 'js/lang', ':!dev.html'], { cwd: TMP, encoding: 'utf8' });
  check(g.status === 1, 'no served file names upstream or its contact' + (g.stdout ? ':\n' + g.stdout : ''));

  // 4. a real conflict stops the sync and names the file
  git('checkout', '-q', '-b', 'fork2', forkHead);
  edit('js/ui/ui.js', '  const CONTACT =', '  // fork-edit-on-the-same-line\n');
  git('commit', '-q', '-am', 'fork edits the line upstream edits');
  r = node(['fork/sync.cjs', '--from', 'fake']);
  check(r.status === 1 && /conflict[\s\S]*js\/ui\/ui\.js/.test(r.stderr), 'same-line edit stops the sync and names js/ui/ui.js');
  const unmerged = git('diff', '--name-only', '--diff-filter=U');
  check(unmerged === 'js/ui/ui.js', 'only the real source conflict is left (generated files never conflict): ' + JSON.stringify(unmerged));
  git('merge', '--abort');
} catch (e) {
  console.error('test-sync: ERROR ' + e.message);
  failures++;
} finally {
  if (KEEP) console.log('test-sync: kept ' + TMP);
  else fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(failures ? `test-sync: ${failures} FAILED` : 'test-sync: all passed');
process.exit(failures ? 1 : 0);
