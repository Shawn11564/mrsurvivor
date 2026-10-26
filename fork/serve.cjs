// Serves this checkout for the fork's checks on its own port (fork/pw.cjs: 8123 in the main checkout,
// 8130-8189 in a git worktree, TEST_PORT overrides):  node fork/serve.cjs
// HTTP/1.1, so the browser keeps its connections open. Python's default HTTP/1.0 closes one per file, and a
// check that loads every sprite sheet (fork/test-extra-dex.cjs, ~1400) then now and then got a sheet refused by
// Windows (net::ERR_NO_BUFFER_SPACE: out of socket buffers). --protocol needs Python 3.11; older ones serve 1.0.
const { spawn, spawnSync } = require('child_process');
const { PORT, BASE, ROOT } = require('./pw.cjs');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const v = spawnSync(PY, ['-c', 'import sys; print(int(sys.version_info >= (3, 11)))'], { encoding: 'utf8' });
const keepAlive = String(v.stdout).trim() === '1';
console.log(`serving ${ROOT} at ${BASE}/` + (keepAlive ? '' : ' (HTTP/1.0: Python older than 3.11)'));
const py = spawn(PY, ['-m', 'http.server', PORT, '--bind', '127.0.0.1', ...(keepAlive ? ['--protocol', 'HTTP/1.1'] : [])],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
py.on('exit', code => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => py.kill());
