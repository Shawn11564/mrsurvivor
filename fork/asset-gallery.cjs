/* ============ fork/asset-gallery.cjs — the gallery behind fork/asset-admin.cjs (MrSurvivor) ============
 * Every PNG the game ships (assets/pokemon, assets/icons) and every icon it draws with code
 * (G.Icons, listed by the page, which draws them), with new versions staged in memory until
 * they're applied to the checkout:
 *   - a file keeps its exact size (a sprite sheet's frame grid is fixed in js/data/sprites-meta.js);
 *     applying it writes it in place and puts its hash in js/fork/asset-rev.json, so players get
 *     it past the service worker's cache (js/fork/asset-overrides.js)
 *   - a code icon's PNG is its size ×1 to ×16 (same shape); applying it writes
 *     assets/icons/code/<name>.png and its entry in js/fork/icon-overrides.json
 * Names: a download is called what an upload must be called to land back on it, so a folder
 * of edited files can be dropped in one go: pokemon__150__Idle.png (assets/pokemon/150/Idle.png;
 * a real path inside a zip works too) and code-icon__lb-g-type.png (or @4x for a bigger one).
 * Check: node fork/test-asset-admin.cjs.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const imp = require('./import-radiant.cjs');
const ROOT = path.join(__dirname, '..');
const DIRS = ['assets/pokemon', 'assets/icons'];
const CODE = 'assets/icons/code';
const REV_FILE = path.join(ROOT, 'js', 'fork', 'asset-rev.json');
const ICON_FILE = path.join(ROOT, 'js', 'fork', 'icon-overrides.json');
const MAX_PNG = 32 << 20, MAX_STAGED = 1 << 30, MAX_SIDE = 16384;

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; } };
const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(sorted(o), null, 2) + '\n');
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
const safe = n => n.replace(/:/g, '.').replace(/\//g, '_');                 // code icon -> file name
const fileName = rel => rel.replace(/^assets\//, '').split('/').join('__');   // download name of a file
const iconName = (n, k = 1) => `code-icon__${safe(n)}${k > 1 ? '@' + k + 'x' : ''}.png`;

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
function headSize(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(24);
  try { fs.readSync(fd, b, 0, 24, 0); } finally { fs.closeSync(fd); }
  return pngSize(b);
}

// ---------------- the files on disk ----------------
let idx = null;                                   // 'assets/pokemon/150/Idle.png' -> [w, h, bytes]
function index() {
  if (idx) return idx;
  idx = {};
  const walk = rel => {
    for (const f of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel + '/' + f.name;
      if (f.isDirectory()) { if (r !== CODE) walk(r); continue; }
      if (!f.isFile() || !/\.png$/i.test(f.name)) continue;
      const file = path.join(ROOT, r), sz = headSize(file);
      if (sz) idx[r] = [sz[0], sz[1], fs.statSync(file).size];
    }
  };
  for (const d of DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(d);
  return idx;
}
/** A gallery path -> its file, only inside the gallery's folders (no .., no links out). */
function fileOf(rel) {
  if (typeof rel !== 'string' || !index()[rel]) return null;
  const file = path.resolve(ROOT, rel);
  if (!DIRS.some(d => file.startsWith(path.join(ROOT, d) + path.sep))) return null;
  try { if (fs.lstatSync(file).isSymbolicLink()) return null; } catch (e) { return null; }
  return file;
}

// ---------------- code icons (the page says what they are) ----------------
let natives = {};                                 // name -> [w, h] of the code drawing
const bySafe = () => new Map(Object.keys(natives).map(n => [safe(n), n]));
function setNatives(list) {
  natives = {};
  for (const [n, s] of Object.entries(list || {})) if (typeof n === 'string' && n.length < 80 && Array.isArray(s) && s[0] > 0 && s[1] > 0 && s[0] < 512 && s[1] < 512) natives[n] = [s[0] | 0, s[1] | 0];
  return Object.keys(natives).length;
}

// ---------------- what an upload is a new version of ----------------
/** { target } (a file), { icon } (a code icon) or { error }. */
function match(name) {
  let n = String(name).replace(/\\/g, '/').replace(/^\.?\//, '');
  const base = n.split('/').pop();
  const ic = base.match(/^code-icon__(.+?)(?:@\d+x)?\.png$/i);
  if (ic) { const nm = bySafe().get(ic[1]); return nm ? { icon: nm } : { error: `no code icon called "${ic[1]}"` }; }
  if (!/\.png$/i.test(base)) return { error: 'not a .png' };
  if (/(^|\/)assets\/\d{1,5}_[^/]+\//.test(n) || /(^|\/)\d{4}_[a-z0-9-]+\/(lab\/|mega\/)?[^/]+\.png$/i.test(n))
    return { error: 'this is the Radiant Sprite Kit\'s layout: import radiants in the Radiants tab' };
  if (base.includes('__')) n = base.split('__').join('/');
  const I = index(), keys = Object.keys(I);
  const at = n.lastIndexOf('assets/');
  if (at >= 0) { const t = n.slice(at); return I[t] ? { target: t } : { error: `no ${t} in the game` }; }
  const segs = n.split('/');
  for (let k = 0; k <= segs.length - 2; k++) {
    const suf = segs.slice(k).join('/');
    if (I['assets/' + suf]) return { target: 'assets/' + suf };
    const hits = keys.filter(p => p.endsWith('/' + suf));
    if (hits.length === 1) return { target: hits[0] };
    if (hits.length > 1) return { error: `"${suf}" matches ${hits.length} files: use the full name (like ${fileName(hits[0])})` };
  }
  return { error: 'no match: name it like its download (pokemon__150__Idle.png), or drop it on the file' };
}

// ---------------- staged new versions ----------------
const staged = new Map();                         // key ('assets/...' or 'icon:<name>') -> entry
const stagedBytes = () => [...staged.values()].reduce((s, e) => s + e.buf.length, 0);
const view = e => ({ key: e.key, target: e.target || null, icon: e.icon || null, from: e.from, w: e.w, h: e.h,
  old: e.old, k: e.k || null, bytes: e.buf.length });

/** Checks buf as a new version of `to` ({ target } or { icon }): the entry, or { error }. */
function vet(to, buf, from) {
  if (buf.length > MAX_PNG) return { error: 'over 32 MB' };
  const sz = pngSize(buf);
  if (!sz) return { error: 'not a PNG' };
  if (sz[0] > MAX_SIDE || sz[1] > MAX_SIDE) return { error: `${sz[0]}×${sz[1]} is too big` };
  try { imp.decode(buf); } catch (e) { return { error: 'can\'t read it: ' + e.message }; }
  if (to.target) {
    const file = fileOf(to.target);
    if (!file) return { error: `no ${to.target} in the game` };
    const [ow, oh] = index()[to.target];
    if (sz[0] !== ow || sz[1] !== oh) return { error: `it's ${sz[0]}×${sz[1]}: ${to.target} has to stay ${ow}×${oh} (its frame grid)` };
    if (buf.equals(fs.readFileSync(file))) return { error: 'same as the file in the game' };
    return { key: to.target, target: to.target, buf, w: sz[0], h: sz[1], old: [ow, oh], from };
  }
  const nv = natives[to.icon];
  if (!nv) return { error: `no code icon called "${to.icon}"` };
  const k = sz[0] / nv[0];
  if (!Number.isInteger(k) || k < 1 || k > 16 || sz[1] !== nv[1] * k)
    return { error: `it's ${sz[0]}×${sz[1]}: ${to.icon} has to be ${nv[0]}×${nv[1]} or a whole multiple (×2 = ${nv[0] * 2}×${nv[1] * 2}, ×4 = ${nv[0] * 4}×${nv[1] * 4}...)` };
  return { key: 'icon:' + to.icon, icon: to.icon, buf, w: sz[0], h: sz[1], old: nv, k, from };
}

/**
 * One upload: a PNG (aimed at `target` / `icon`, or matched by its name) or a zip of them.
 * -> [{ from, ok, key?, error? }]
 */
function stage(buf, name, aim) {
  const files = /\.zip$/i.test(name) || buf.readUInt32LE(0) === 0x04034b50 ? imp.unzip(buf) : { [name]: buf };
  const out = [];
  for (const [n, b] of Object.entries(files)) {
    if (/(^|\/)(__MACOSX|\.)/.test(n) || /(^|\/)(Thumbs\.db|desktop\.ini|README\.txt|CREDITS\.txt)$/i.test(n)) continue;
    const to = aim && (aim.target || aim.icon) && Object.keys(files).length === 1 ? aim : match(n);
    if (to.error) { out.push({ from: n, ok: false, error: to.error }); continue; }
    const e = vet(to, b, n);
    if (e.error) { out.push({ from: n, ok: false, error: e.error, target: to.target, icon: to.icon }); continue; }
    if (stagedBytes() + b.length > MAX_STAGED) { out.push({ from: n, ok: false, error: 'over 1 GB staged: apply what you have first' }); continue; }
    const was = staged.has(e.key);
    staged.set(e.key, e);
    out.push({ from: n, ok: true, key: e.key, replaced: was });
  }
  return out;
}

// ---------------- applying: into the checkout ----------------
function apply(keys) {
  const rev = readJson(REV_FILE), ico = readJson(ICON_FILE), done = [];
  for (const k of keys && keys.length ? keys : [...staged.keys()]) {
    const e = staged.get(k);
    if (!e) continue;
    if (e.target) {
      const file = fileOf(e.target), sz = file && headSize(file);
      if (!sz || sz[0] !== e.w || sz[1] !== e.h) throw new Error(`${e.target} changed on disk: stage it again`);
      fs.writeFileSync(file + '.new', e.buf); fs.renameSync(file + '.new', file);
      rev[e.target] = hash(e.buf);
      idx[e.target] = [e.w, e.h, e.buf.length];
    } else {
      const rel = `${CODE}/${safe(e.icon)}.png`;
      fs.mkdirSync(path.join(ROOT, CODE), { recursive: true });
      fs.writeFileSync(path.join(ROOT, rel), e.buf);
      ico[e.icon] = { file: rel, v: hash(e.buf), w: e.w, h: e.h };
    }
    staged.delete(k);
    done.push(k);
  }
  writeJson(REV_FILE, rev); writeJson(ICON_FILE, ico);
  return done;
}
/** Back to the code drawing: removes the icon's PNG and its entry. */
function unoverride(name) {
  const ico = readJson(ICON_FILE), e = ico[name];
  if (!e) return false;
  const file = path.resolve(ROOT, e.file);
  if (file.startsWith(path.join(ROOT, CODE) + path.sep) && fs.existsSync(file)) fs.rmSync(file);
  delete ico[name];
  writeJson(ICON_FILE, ico);
  return true;
}
/** Files written some other way (a radiant imported over an old one): new hashes in asset-rev.json. */
function bump(rels) {
  if (!rels.length) return;
  const rev = readJson(REV_FILE);
  for (const r of rels) { const f = path.join(ROOT, r); if (fs.existsSync(f)) rev[r] = hash(fs.readFileSync(f)); }
  writeJson(REV_FILE, rev);
  idx = null;
}

module.exports = {
  index, fileOf, setNatives, match, stage, staged, view, apply, unoverride, bump,
  overrides: () => readJson(ICON_FILE), revs: () => readJson(REV_FILE),
  fileName, iconName, safe, CODE, REV_FILE, ICON_FILE, refresh: () => { idx = null; }
};
