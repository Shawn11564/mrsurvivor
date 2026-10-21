#!/usr/bin/env node
// Upstream's own TURN server is switched off in MrSurvivor (one line at the top of turnUser() in
// js/net/net.js, `G.FORK_NO_TURN`): co-op stays direct-only, and nothing ever asks upstream's
// ice.pokesurvivor.com for credentials (that would send the player's login token there).
// No server needed:
//
//   node fork/test-net-turn-off.cjs
//
// It runs upstream's tests/net.test.cjs twice, from a patched copy in a temp folder:
//   1. As shipped: no test ever reaches fetch() or getIdToken() (counted across all of them).
//      Upstream's 4 "own TURN" tests fail, as they should with TURN off; every other one passes.
//   2. With the switch turned back on (G.FORK_NO_TURN = false): all of upstream's tests pass,
//      so the merge kept their retry logic working.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'tests', 'net.test.cjs'), 'utf8');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

function patch(src, pairs) {
  for (const [a, b] of pairs) {
    if (!src.includes(a)) throw new Error('upstream test changed, update fork/test-net-turn-off.cjs: ' + a);
    src = src.split(a).join(b);
  }
  return src;
}

function run(name, src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-net-'));
  for (const f of fs.readdirSync(path.join(ROOT, 'tests'))) if (f.endsWith('.cjs')) fs.copyFileSync(path.join(ROOT, 'tests', f), path.join(dir, f));
  const file = path.join(dir, name);
  fs.writeFileSync(file, src.replace("path.join(__dirname, '..', file)", `path.join(${JSON.stringify(ROOT)}, file)`));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  const out = r.stdout + r.stderr;
  const fails = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1]);
  const pass = (out.match(/^# pass (\d+)/m) || [])[1] | 0;
  return { fails, pass, out };
}

console.log('1. TURN off (as shipped)');
const off = run('net-off.test.cjs', patch(SRC, [
  ["const fetch = async (url, opt) => { calls.push([url, opt]);", "const fetch = async (url, opt) => { globalThis.__asked++; calls.push([url, opt]);"],
  ["getIdToken: async () => 'token'", "getIdToken: async () => { globalThis.__asked++; return 'token'; }"],
]) + `
globalThis.__asked = globalThis.__asked || 0;
test('fork: TURN off, no credential request in any test', () => { assert.equal(globalThis.__asked, 0); });
`);
check(!off.fails.includes('fork: TURN off, no credential request in any test') && /ok \d+ - fork: TURN off/.test(off.out),
  'no test asked for TURN credentials (fetch / getIdToken never called)');
const unexpected = off.fails.filter(n => !/^own TURN:/.test(n));
check(off.fails.length > 0 && !unexpected.length, 'only upstream\'s "own TURN" tests fail; the rest pass', { failing: off.fails.length, pass: off.pass, unexpected });

console.log('2. TURN switched back on (upstream\'s logic still works)');
const on = run('net-on.test.cjs', patch(SRC, [["G = { NetCodec: codec(),", "G = { FORK_NO_TURN: false, NetCodec: codec(),"]]));
check(!on.fails.length && on.pass > 0, 'all of upstream\'s net tests pass', { pass: on.pass, fails: on.fails });

console.log(failures ? `\n${failures} check(s) failed` : '\nAll TURN-off checks passed');
process.exit(failures ? 1 : 0);
