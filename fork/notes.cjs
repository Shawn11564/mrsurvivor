/* fork/notes.cjs: reads the owner's MrSurvivor notes tab straight out of Lightning Notes, for the
 * /notes skill (.claude/skills/notes/SKILL.md). Lightning Notes has no export, but it keeps
 * %APPDATA%\dev.thund.lightningnotes\session.json (the tabs) and buffers\<id>.txt (each tab's live
 * text, written 250 ms after typing stops); pasted pictures are `![](lnimg:<name>#WxH)` in the text
 * and images\<name> on disk.
 *
 *   node fork/notes.cjs                 the lines not seen before, as JSON (with their heading and
 *                                       pictures resolved to files); exit 3 = which tab? (candidates printed)
 *   node fork/notes.cjs --tab <id>      remember which tab is MrSurvivor's
 *   node fork/notes.cjs --mark <n,...>  mark lines (by number, or "all") as seen
 *   node fork/notes.cjs --watch-start <job id> / --watch-end
 *   node fork/notes.cjs --poll          as the default, and counts empty polls for a watch: prints
 *                                       "stop": true after 3 empty polls in a row or 2 hours
 *
 * State (tab id, seen lines, the watch) is in the main checkout's .claude/notes-state.json, never
 * committed, shared by every worktree.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');

const LN = path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'), 'dev.thund.lightningnotes');
const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: __dirname, encoding: 'utf8' }).trim();
const MAIN = path.dirname(path.resolve(__dirname, common));
const STATE = path.join(MAIN, '.claude', 'notes-state.json');
const MAX_EMPTY = 3, MAX_MS = 2 * 3600e3;

const args = process.argv.slice(2), flag = f => args.indexOf(f), val = f => flag(f) >= 0 ? args[flag(f) + 1] : null;
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { tab: null, seen: [], watch: null };
const save = () => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); };
const out = o => console.log(JSON.stringify(o, null, 1));
const key = t => crypto.createHash('sha1').update(t.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex').slice(0, 16);

function tabs() {
  const s = JSON.parse(fs.readFileSync(path.join(LN, 'session.json'), 'utf8'));
  const all = [];
  for (const w of s.windows || []) for (const t of w.tabs || []) {
    const f = path.join(LN, 'buffers', t.id + '.txt');
    const text = t.path && !t.dirty && fs.existsSync(t.path) ? fs.readFileSync(t.path, 'utf8') : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    all.push({ id: t.id, file: t.path, text });
  }
  return all;
}

if (flag('--watch-start') >= 0) { state.watch = { job: val('--watch-start'), since: Date.now(), empty: 0 }; save(); out({ watch: state.watch }); process.exit(0); }
if (flag('--watch-end') >= 0) { state.watch = null; save(); out({ watch: null }); process.exit(0); }

const all = tabs();
if (flag('--tab') >= 0) {
  if (!all.some(t => t.id === val('--tab'))) { console.error('no such tab'); process.exit(2); }
  state.tab = val('--tab'); save(); out({ tab: state.tab }); process.exit(0);
}
// The tab: the one remembered, else one whose first line names the game.
let tab = all.find(t => t.id === state.tab) || all.find(t => /^\W*(mr|poke|poké)survivor\b/i.test((t.text.split(/\r?\n/).find(l => l.trim()) || '')));
if (!tab) {
  out({ which: 'tab', candidates: all.map(t => ({ id: t.id, file: t.file, start: t.text.split(/\r?\n/).filter(l => l.trim()).slice(0, 3) })) });
  process.exit(3);
}
if (state.tab !== tab.id) { state.tab = tab.id; save(); }

// Lines with their heading (the last line ending in ':' or starting with '#' above them) and pictures.
const seen = new Set(state.seen);
const lines = tab.text.split(/\r?\n/);
let heading = null;
const items = [];
lines.forEach((raw, i) => {
  const l = raw.trim();
  if (!l) return;
  const pics = [...l.matchAll(/!\[[^\]]*\]\(lnimg:([^)#]+)(?:#[^)]*)?\)/g)].map(m => path.join(LN, 'images', m[1]));
  const text = l.replace(/!\[[^\]]*\]\(lnimg:[^)]*\)/g, '').trim();
  const done = /^[-*]\s*\[[xX]\]/.test(l);
  const isHead = /^#/.test(l) || (/:$/.test(l) && !pics.length);
  if (!seen.has(key(l))) items.push({ n: i + 1, text, heading, done, pictures: pics.filter(p => fs.existsSync(p)) });
  if (isHead) heading = text.replace(/^#+\s*/, '');
});

if (flag('--mark') >= 0) {
  const which = val('--mark');
  const pick = which === 'all' ? lines.map((_, i) => i + 1) : which.split(',').map(Number);
  for (const n of pick) if (lines[n - 1] && lines[n - 1].trim()) seen.add(key(lines[n - 1]));
  state.seen = [...seen]; save(); out({ marked: pick.length, seen: state.seen.length }); process.exit(0);
}

const res = { tab: tab.id, total: lines.filter(l => l.trim()).length, unseen: items.length, items };
if (flag('--poll') >= 0 && state.watch) {
  state.watch.empty = items.length ? 0 : state.watch.empty + 1; save();
  const why = state.watch.empty >= MAX_EMPTY ? `${MAX_EMPTY} polls in a row with nothing new` : Date.now() - state.watch.since > MAX_MS ? 'the 2-hour limit' : null;
  res.watch = { job: state.watch.job, empty: state.watch.empty, stop: !!why, why };
}
out(res);
