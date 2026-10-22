// Serves this checkout for the fork's checks on its own port (fork/pw.cjs: 8123 in the main checkout,
// 8130-8189 in a git worktree, TEST_PORT overrides):  node fork/serve.cjs
const { spawn } = require('child_process');
const { PORT, BASE, ROOT } = require('./pw.cjs');
console.log(`serving ${ROOT} at ${BASE}/`);
const py = spawn(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
py.on('exit', code => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => py.kill());
