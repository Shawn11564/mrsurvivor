#!/usr/bin/env node
/* fork/requests.cjs: the watcher's side of Requests (js/fork/requests.js), for the /requests skill
 * (.claude/skills/requests/SKILL.md). It reads and writes the req collection in our Firestore as a
 * service account (so firestore.rules don't apply), through the REST API with no dependencies.
 *
 *   node fork/requests.cjs                  the threads waiting for Claude (st 'new'), with their messages and
 *                                           pictures saved to files, plus the open ones (working, ask), as JSON
 *   node fork/requests.cjs --poll           the same, counting empty polls for a watch: "stop": true after
 *                                           12 empty polls in a row (1 h at 5 min) or 4 h
 *   node fork/requests.cjs --list           every thread in one line each
 *   node fork/requests.cjs --show <id>      one thread in full
 *   node fork/requests.cjs --claim <id> [--text "On it"]            st working (+ a message)
 *   node fork/requests.cjs --reply <id> (--text "..." | --file msg.txt) [--commit h1,h2] [--status done|ask|working|closed|new]
 *   node fork/requests.cjs --delete <id>   remove a thread and its messages (spam, tests)
 *   node fork/requests.cjs --find <name>    a player's uid by nickname (profiles), for the staff lists
 *   node fork/requests.cjs --ping           the key works: how many threads there are
 *   node fork/requests.cjs --watch-start <job id> / --watch-end
 *
 * Key: the service account's JSON (Firebase console > Project settings > Service accounts > Generate new
 * private key) at %APPDATA%\mrsurvivor\firebase-admin.json, or MRS_FIREBASE_ADMIN=<path>. Never in the repo.
 * With FIRESTORE_EMULATOR_HOST set (fork/test-requests.cjs) it talks to the emulator as its owner; the
 * project is then --project or MRS_PROJECT (default mrsurvivor).
 * State (the token, the watch) is in the main checkout's .claude/req-state.json; pictures land in
 * .claude/req-pics/<id>-<n>.jpg. Neither is committed; every worktree shares them.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');

const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: __dirname, encoding: 'utf8' }).trim();
const MAIN = path.dirname(path.resolve(__dirname, common));
const STATE = path.join(MAIN, '.claude', 'req-state.json'), PICS = path.join(MAIN, '.claude', 'req-pics');
const KEY = process.env.MRS_FIREBASE_ADMIN || path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'), 'mrsurvivor', 'firebase-admin.json');
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const MAX_EMPTY = 12, MAX_MS = 4 * 3600e3;

const args = process.argv.slice(2), flag = f => args.indexOf(f), val = f => flag(f) >= 0 ? args[flag(f) + 1] : null;
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { watch: null };
const save = () => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); };
const out = o => console.log(JSON.stringify(o, null, 1));
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };

// ---------------- Firestore REST ----------------

let project = val('--project') || process.env.MRS_PROJECT || null, key = null;
if (!EMU) {
  if (!fs.existsSync(KEY)) die(`No service-account key at ${KEY}. Firebase console > Project settings > Service accounts > Generate new private key, save it there (or set MRS_FIREBASE_ADMIN).`, 4);
  key = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  project = project || key.project_id;
}
project = project || 'mrsurvivor';
const BASE = EMU ? `http://${EMU}/v1/projects/${project}/databases/(default)/documents` : `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

const b64 = s => Buffer.from(s).toString('base64url');
async function token() {
  if (EMU) return 'owner';
  if (state.token && state.tokenExp > Date.now() + 60e3 && state.tokenFor === key.client_email) return state.token;
  const now = Math.floor(Date.now() / 1000);
  const jwt = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: key.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(jwt).sign(key.private_key, 'base64url');
  const r = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt + '.' + sig });
  if (!r.ok) die('Token refused: ' + r.status + ' ' + await r.text(), 5);
  const j = await r.json();
  state.token = j.access_token; state.tokenExp = Date.now() + (j.expires_in || 3600) * 1000; state.tokenFor = key.client_email; save();
  return state.token;
}
async function call(method, url, body) {
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(method + ' ' + url.replace(BASE, '') + ': ' + r.status + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const enc = v => v === null || v === undefined ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: encFields(v) } };
const encFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const dec = f => 'stringValue' in f ? f.stringValue : 'integerValue' in f ? +f.integerValue : 'doubleValue' in f ? f.doubleValue
  : 'booleanValue' in f ? f.booleanValue : 'timestampValue' in f ? f.timestampValue : 'arrayValue' in f ? (f.arrayValue.values || []).map(dec)
  : 'mapValue' in f ? decFields(f.mapValue.fields || {}) : null;
const decFields = fields => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, dec(v)]));
const docOf = d => Object.assign(decFields(d.fields || {}), { id: d.name.split('/').pop() });

async function query(parent, collectionId, { orderBy, dir = 'ASCENDING', where, limit = 300 } = {}) {
  const q = { from: [{ collectionId }], limit };
  if (orderBy) q.orderBy = [{ field: { fieldPath: orderBy }, direction: dir }];
  if (where) q.where = { fieldFilter: { field: { fieldPath: where[0] }, op: where[1], value: enc(where[2]) } };
  const rows = await call('POST', (parent ? BASE + '/' + parent : BASE) + ':runQuery', { structuredQuery: q });
  return (rows || []).filter(r => r.document).map(r => docOf(r.document));
}
const getDoc = async p => docOf(await call('GET', BASE + '/' + p));
const patch = (p, fields) => call('PATCH', BASE + '/' + p + '?' + Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&'), { fields: encFields(fields) });
const add = (p, fields) => call('POST', BASE + '/' + p, { fields: encFields(fields) });

// ---------------- threads ----------------

/** Pictures (data URLs) -> files, so the session can open them. */
function savePics(id, prefix, pics) {
  const files = [];
  (pics || []).forEach((p, i) => {
    const m = /^data:image\/(\w+);base64,(.*)$/s.exec(p || '');
    if (!m) return;
    fs.mkdirSync(PICS, { recursive: true });
    const f = path.join(PICS, `${id}${prefix}-${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
    files.push(f);
  });
  return files;
}
const KINDS = { q: 'question', c: 'change' };
function brief(d) {
  return { id: d.id, status: d.st, kind: KINDS[d.k] || d.k, by: d.by, name: d.n, at: d.at, up: d.up, lastBy: d.lb, text: d.t, pics: savePics(d.id, '', d.pics) };
}
async function full(d) {
  const b = brief(d);
  const msgs = await query('req/' + d.id, 'm', { orderBy: 'at' });
  b.thread = msgs.map(m => ({ by: m.by === 'claude' ? 'claude' : m.by, name: m.by === 'claude' ? 'Claude' : m.n, at: m.at, text: m.t, commit: m.c, pics: savePics(d.id, '-' + m.id, m.pics) }));
  return b;
}
const all = () => query(null, 'req', { orderBy: 'up', dir: 'DESCENDING' });
async function reply(id, text, { commit, status } = {}) {
  const d = await getDoc('req/' + id);
  if (!d.by) die('No thread ' + id, 3);
  const now = new Date();
  if (text) {
    const m = { by: 'claude', n: 'Claude', t: text, at: now };
    if (commit && commit.length) m.c = commit;
    await add('req/' + id + '/m', m);
  }
  const up = { up: now, lb: 'claude' };
  if (status) up.st = status;
  await patch('req/' + id, up);
  return { id, status: status || d.st, posted: !!text, commit: commit || null };
}

(async () => {
  if (flag('--watch-start') >= 0) { state.watch = { job: val('--watch-start'), since: Date.now(), empty: 0 }; save(); return out({ watch: state.watch }); }
  if (flag('--watch-end') >= 0) { state.watch = null; save(); return out({ watch: null }); }
  if (flag('--ping') >= 0) { const rows = await all(); return out({ ok: true, project, emulator: !!EMU, threads: rows.length, open: rows.filter(d => !['done', 'closed'].includes(d.st)).length }); }
  if (flag('--find') >= 0) {
    const name = String(val('--find') || '').trim().toLowerCase();
    if (!name) die('--find <nickname>');
    const rows = await query(null, 'profiles', { where: ['lower', 'EQUAL', name] });
    return out({ name, found: rows.map(r => ({ uid: r.id, name: r.name })) });
  }
  if (flag('--list') >= 0) { const rows = await all(); return out({ threads: rows.map(d => ({ id: d.id, status: d.st, kind: KINDS[d.k] || d.k, name: d.n, up: d.up, lastBy: d.lb, first: (d.t || '').split('\n')[0].slice(0, 100) })) }); }
  if (flag('--show') >= 0) return out(await full(await getDoc('req/' + val('--show'))));
  if (flag('--delete') >= 0) {
    const id = val('--delete');
    const msgs = await query('req/' + id, 'm');
    for (const m of msgs) await call('DELETE', BASE + '/req/' + id + '/m/' + m.id);
    await call('DELETE', BASE + '/req/' + id);
    return out({ deleted: id, messages: msgs.length });
  }
  if (flag('--claim') >= 0) return out(await reply(val('--claim'), val('--text') || '', { status: 'working' }));
  if (flag('--reply') >= 0) {
    const text = flag('--file') >= 0 ? fs.readFileSync(val('--file'), 'utf8').trim() : (val('--text') || '');
    const status = val('--status');
    if (status && !['new', 'working', 'ask', 'done', 'closed'].includes(status)) die('--status new|working|ask|done|closed');
    if (!text && !status) die('--reply needs --text, --file or --status');
    const commit = val('--commit') ? val('--commit').split(',').map(s => s.trim()).filter(Boolean) : null;
    return out(await reply(val('--reply'), text, { commit, status }));
  }
  // Default and --poll: what's waiting.
  const rows = await all();
  const waiting = rows.filter(d => d.st === 'new'), open = rows.filter(d => d.st === 'working' || d.st === 'ask');
  const res = { items: await Promise.all(waiting.map(full)), open: open.map(d => ({ id: d.id, status: d.st, kind: KINDS[d.k] || d.k, name: d.n, up: d.up, first: (d.t || '').split('\n')[0].slice(0, 100) })) };
  if (flag('--poll') >= 0) {
    const w = state.watch;
    if (!w) res.stop = true;
    else {
      w.empty = waiting.length ? 0 : (w.empty || 0) + 1;
      w.polls = (w.polls || 0) + 1; save();
      res.watch = w;
      if (w.empty >= MAX_EMPTY || Date.now() - w.since > MAX_MS) { res.stop = true; res.why = w.empty >= MAX_EMPTY ? `${MAX_EMPTY} empty polls in a row` : '4 hours'; }
    }
  }
  out(res);
})().catch(e => die(e.message, 1));
