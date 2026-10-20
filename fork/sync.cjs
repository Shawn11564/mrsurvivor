/* ============ fork/sync.cjs — pull upstream's updates into MrSurvivor ============
 *   node fork/sync.cjs                 fetch JPTER78's main, merge, rebuild, commit
 *   node fork/sync.cjs --from <ref>    merge another ref instead (tests use this)
 *
 * Generated/branded files are `merge=ours` (.gitattributes), so the merge only stops
 * on real source conflicts: two sides editing the same lines of the same file. Then
 * fork/build.cjs rebuilds everything from the merged sources and the merge is committed.
 * On a conflict or a failed build it stops with the merge in progress: fix and
 * re-run `node fork/build.cjs`, then commit, or `git merge --abort` to back out.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (msg) => { console.error('sync: ' + msg); process.exit(1); };

const fromArg = process.argv.indexOf('--from');
const REF = fromArg > 0 ? process.argv[fromArg + 1] : 'upstream/main';

if (git('status', '--porcelain')) die('working tree has uncommitted changes; commit or stash them first.');
git('config', 'merge.ours.driver', 'true');
if (fromArg < 0) { console.log('sync: fetching upstream…'); git('fetch', 'upstream'); }

const count = Number(git('rev-list', '--count', `HEAD..${REF}`));
if (!count) { console.log(`sync: already up to date with ${REF}.`); process.exit(0); }
console.log(`sync: merging ${count} upstream commit(s) from ${REF}:`);
console.log(git('log', '--format=  %h %<(80,trunc)%s', `HEAD..${REF}`));

const merge = spawnSync('git', ['merge', '--no-ff', '--no-commit', REF], { cwd: ROOT, encoding: 'utf8' });
const conflicts = git('diff', '--name-only', '--diff-filter=U');
if (conflicts) {
  die('these files conflict (you and upstream changed the same lines):\n  ' + conflicts.split('\n').join('\n  ') +
    '\nResolve them, then `node fork/build.cjs`, `git add -A`, `git commit`. Or `git merge --abort`.');
}
if (merge.status !== 0) die('git merge failed:\n' + merge.stdout + merge.stderr);

console.log('sync: rebuilding MrSurvivor from the merged sources…');
const build = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs'), ...process.argv.slice(2).filter(a => /^--(expose|sin-seo|forzar)$/.test(a))],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, FORK_UPSTREAM: REF } });
if (build.status !== 0) die('build failed; the merge is still in progress. Fix it, re-run `node fork/build.cjs`, then commit (or `git merge --abort`).');

git('add', '-A');
git('commit', '-q', '-m', `Merge ${count} upstream commit(s) from ${REF} and rebuild MrSurvivor`);
console.log(`sync: done (${git('log', '-1', '--format=%h')}). Play a run on http://127.0.0.1:8123/ before publishing.`);
