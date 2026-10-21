#!/usr/bin/env node
/* ============ fork/import-radiant.cjs — bring an artist's radiant recolours in (MrSurvivor) ============
 *   node fork/import-radiant.cjs <zip or folder>... [--dry-run] [--strict]
 *
 * The Radiant Sprite Kit (radiant-kit/index.html) hands artists a .zip laid out for people:
 *   assets/0150_mewtwo/{Anim}.png         the standard sheets (Idle, Walk, Attack...)
 *   assets/0150_mewtwo/lab/{Anim}.png     its Lab signature-move sheet, if it has one
 *   assets/0150_mewtwo/mega/{Anim}.png    its Mega (or Primal) form, if it has one
 * The number before "_" is the dex; the name after it is only for people (a mismatch is a warning).
 * Any folder above "assets/" (the artist re-zipping a folder) is ignored, and a zip may hold
 * several Pokémon. The Kit's older layout (assets/pokemon/{dex}/r/...) is read too.
 *
 * Each sheet is checked against the normal one on disk before anything is copied:
 *   error    a standard sheet missing, a size that differs, a file that isn't a PNG,
 *            a dex the game doesn't have          -> that Pokémon (or its Mega) is left out
 *   warning  pixels outside or inside the normal outline (a shifted or redrawn frame),
 *            a sheet identical to the normal one, a sheet the game doesn't use, no Mega
 * Accepted sheets go to assets/pokemon/{dex}/r/, r/lab/ and m{dex}/r/ (the layout
 * fork/radiants.cjs and js/fork/radiant.js read), then fork/radiants.cjs refreshes the pool.
 * --dry-run checks without copying; --strict treats warnings as errors.
 * Then build (node fork/build.cjs), try it, commit and push: that is how a radiant ships.
 * Check: node fork/test-import-radiant.cjs.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const MON = path.join(ROOT, 'assets', 'pokemon');

// ---------------- reading the input: a .zip or an unzipped folder -> { 'a/b.png': Buffer } ----------------

function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a .zip file');
  const n = buf.readUInt16LE(e + 10), out = {};
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const at = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(at, at + size);
    if (method === 0) out[name] = raw;
    else if (method === 8) out[name] = zlib.inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method} isn't supported (re-zip with normal "Deflate")`);
  }
  return out;
}
function readDir(dir, pre = '', out = {}) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) readDir(path.join(dir, f.name), pre + f.name + '/', out);
    else out[pre + f.name] = fs.readFileSync(path.join(dir, f.name));
  }
  return out;
}
const read = src => fs.statSync(src).isDirectory() ? readDir(src) : unzip(fs.readFileSync(src));

// ---------------- the layout: file path -> { dex, part: 'base'|'lab'|'mega', anim } ----------------

const NEW = /(?:^|\/)assets\/(\d{1,5})_([^/]*)\/(?:(lab|mega)\/)?([^/]+)\.png$/i;
const OLD = /(?:^|\/)assets\/pokemon\/(m?)(\d{1,5})\/r\/(?:(lab)\/)?([^/]+)\.png$/i;
function place(name) {
  if (/(^|\/)(__MACOSX|\.)/.test(name)) return null;                  // Mac/zip junk, dotfiles
  let m = name.match(NEW);
  if (m) return { dex: +m[1], label: m[2], part: (m[3] || 'base').toLowerCase(), anim: m[4] };
  m = name.match(OLD);
  if (m) return { dex: +m[2], label: null, part: m[1] ? 'mega' : m[3] ? 'lab' : 'base', anim: m[4] };
  return null;
}

/** Where a part's normal sheets are, and where its radiant goes. */
const dirs = (dex, part) => part === 'mega' ? [path.join(MON, 'm' + dex), path.join(MON, 'm' + dex, 'r')]
  : part === 'lab' ? [path.join(MON, String(dex), 'lab'), path.join(MON, String(dex), 'r', 'lab')]
  : [path.join(MON, String(dex)), path.join(MON, String(dex), 'r')];
const pngs = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)) : [];

/** The Kit's folder name for a Pokémon: 0150_mewtwo. */
const slug = name => String(name).normalize('NFD').replace(/\p{M}/gu, '').replace(/♀/g, '-f').replace(/♂/g, '-m')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const folder = (dex, name) => String(dex).padStart(4, '0') + '_' + slug(name);

// ---------------- PNG: decode to RGBA (enough for any sheet an editor writes) ----------------

function decode(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w, h, depth, type, inter, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (t === 'PLTE') pal = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (inter) throw new Error('interlaced PNG (save it again without interlacing)');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bpp = Math.max(1, ch * depth >> 3), stride = (w * ch * depth + 7) >> 3;
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      px[o + x] = (src[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  const out = Buffer.alloc(w * h * 4), max = (1 << depth) - 1;
  const sample = (y, i) => depth === 8 ? px[y * stride + i] : depth === 16 ? px[y * stride + i * 2]
    : (px[y * stride + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & max;
  const to8 = v => depth === 16 || depth === 8 ? v : Math.round(v * 255 / max);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4, s = i => sample(y, x * ch + i);
    if (type === 3) { const k = s(0); out[q] = pal[k * 3]; out[q + 1] = pal[k * 3 + 1]; out[q + 2] = pal[k * 3 + 2]; out[q + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (type === 0 || type === 4) { const g = to8(s(0)); out[q] = out[q + 1] = out[q + 2] = g; out[q + 3] = type === 4 ? to8(s(1)) : 255; }
    else { out[q] = to8(s(0)); out[q + 1] = to8(s(1)); out[q + 2] = to8(s(2)); out[q + 3] = type === 6 ? to8(s(3)) : 255; }
  }
  return { w, h, px: out };
}

// ---------------- checking one Pokémon ----------------

/** The game's data (names, frame sizes): the same files the game loads. */
function gameData() {
  const G = {};
  for (const f of ['js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/fork/mega-sprites.js', 'js/fork/lab/lab-anims.js']) {
    const file = path.join(ROOT, f);
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), { G });
  }
  return G;
}

/** Compare a recolour with its normal sheet: [errors, warnings]. */
function compare(newBuf, normFile, label, geo) {
  let a, b;
  try { b = decode(newBuf); } catch (e) { return [[`${label}: ${e.message}`], []]; }
  try { a = decode(fs.readFileSync(normFile)); } catch (e) { return [[`${label}: can't read the normal sheet (${e.message})`], []]; }
  if (a.w !== b.w || a.h !== b.h) return [[`${label} is ${b.w}×${b.h}, the normal sheet is ${a.w}×${a.h}`], []];
  let out = 0, inn = 0, same = true; const where = new Set();
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = a.px[i * 4 + 3] > 0, ob = b.px[i * 4 + 3] > 0;
    if (oa !== ob) {
      ob ? out++ : inn++;
      if (geo) where.add(`col ${Math.floor((i % a.w) / geo.w) + 1} row ${Math.floor(Math.floor(i / a.w) / geo.h) + 1}`);
    }
    if (same && (oa || ob) && (a.px[i * 4] !== b.px[i * 4] || a.px[i * 4 + 1] !== b.px[i * 4 + 1] || a.px[i * 4 + 2] !== b.px[i * 4 + 2] || a.px[i * 4 + 3] !== b.px[i * 4 + 3])) same = false;
  }
  const warn = [];
  if (out || inn) {
    const frames = [...where];
    warn.push(`${label}: ${out + inn} pixel(s) differ from the normal outline (${out} added, ${inn} erased)` +
      (frames.length ? `, in frame ${frames.slice(0, 4).join(', ')}${frames.length > 4 ? ` and ${frames.length - 4} more` : ''}` : ''));
  }
  if (same) warn.push(`${label} is the same as the normal sheet (not recoloured)`);
  return [[], warn];
}

/** Check one Pokémon's files ({ part: { anim: Buffer } }): what to copy and what's wrong. */
function checkMon(dex, files, labels, G) {
  const res = { dex, name: '', copy: [], errors: [], warnings: [], mega: false, lab: [] };
  const mon = G.DEX && G.DEX.find(p => p.dex === dex);
  if (!mon || !fs.existsSync(path.join(MON, String(dex)))) { res.errors.push(`#${dex}: the game has no Pokémon with this number`); return res; }
  res.name = mon.name;
  const want = folder(dex, mon.name);
  for (const l of labels) if (l !== null && slug(l) !== slug(mon.name))
    res.warnings.push(`folder "${String(dex).padStart(4, '0')}_${l}" says "${l}", but #${dex} is ${mon.name} (imported as ${mon.name}; the Kit names it ${want})`);
  const geoOf = (part, anim) => part === 'mega' ? G.SPRITE_META && G.SPRITE_META['m' + dex] && G.SPRITE_META['m' + dex].a[anim]
    : part === 'lab' ? G.LAB_ANIMS && G.LAB_ANIMS[dex] && G.LAB_ANIMS[dex].a[anim]
    : G.SPRITE_META && G.SPRITE_META[dex] && G.SPRITE_META[dex].a[anim];
  const PART = { base: '', lab: 'lab/', mega: 'mega/' };

  for (const part of ['base', 'lab', 'mega']) {
    const got = files[part] || {}, [normDir, outDir] = dirs(dex, part), need = pngs(normDir);
    const names = Object.keys(got);
    if (!names.length) {
      if (part === 'mega' && need.length) res.warnings.push(`no Mega sheets: the radiant ${mon.name} would turn into the normal-coloured Mega`);
      if (part === 'base') res.errors.push(`no standard sheets (${need.join(', ')})`);
      continue;
    }
    if (!need.length) { res.warnings.push(`${PART[part]}: ${mon.name} has no ${part === 'mega' ? 'Mega' : 'Lab'} sheets in the game, skipped`); continue; }
    const errs = [], ok = [];
    for (const a of names) {
      const label = PART[part] + a + '.png';
      const real = need.find(n => n.toLowerCase() === a.toLowerCase());
      if (!real) { res.warnings.push(`${label}: the game has no "${a}" sheet for this form, skipped`); continue; }
      const [e, w] = compare(got[a], path.join(normDir, real + '.png'), label, geoOf(part, real));
      errs.push(...e); res.warnings.push(...w);
      if (!e.length) ok.push([got[a], path.join(outDir, real + '.png')]);
    }
    // The standard set and the Mega are all-or-nothing (fork/radiants.cjs needs every sheet); Lab sheets go one by one.
    const missing = part === 'lab' ? [] : need.filter(n => !names.some(a => a.toLowerCase() === n.toLowerCase()));
    if (missing.length) errs.push(`${PART[part]}missing ${missing.map(n => n + '.png').join(', ')}`);
    if (part !== 'lab' && errs.length) {
      res.errors.push(...errs.map(e => (part === 'mega' ? 'Mega left out: ' : '') + e));
      continue;
    }
    res.errors.push(...errs);
    res.copy.push(...ok);
    if (part === 'mega') res.mega = true;
    if (part === 'lab') res.lab = ok.map(([, f]) => path.basename(f, '.png'));
  }
  // Without the standard set there's no radiant at all.
  if (res.errors.some(e => !e.startsWith('Mega left out') && !e.startsWith('lab/'))) res.copy = [];
  return res;
}

/** Group an input's files by Pokémon. */
function group(files) {
  const mons = new Map(), ignored = [];
  for (const [name, buf] of Object.entries(files)) {
    const at = place(name);
    if (!at) { if (/\.png$/i.test(name)) ignored.push(name); continue; }
    if (!mons.has(at.dex)) mons.set(at.dex, { files: {}, labels: new Set() });
    const m = mons.get(at.dex);
    (m.files[at.part] = m.files[at.part] || {})[at.anim] = buf;
    m.labels.add(at.label);
  }
  return { mons, ignored };
}

function main() {
  const args = process.argv.slice(2), dry = args.includes('--dry-run'), strict = args.includes('--strict');
  const inputs = args.filter(a => !a.startsWith('--'));
  if (!inputs.length) {
    console.log('Usage: node fork/import-radiant.cjs <zip or folder>... [--dry-run] [--strict]');
    process.exit(2);
  }
  const G = gameData();
  let failed = 0, imported = 0;
  for (const src of inputs) {
    console.log(`\n${src}`);
    let files;
    try { files = read(src); } catch (e) { console.log(`  ERROR ${e.message}`); failed++; continue; }
    const { mons, ignored } = group(files);
    if (!mons.size) {
      console.log('  ERROR no radiant sheets found. Expected assets/0150_mewtwo/Idle.png (the Kit\'s layout).');
      failed++;
    }
    for (const p of ignored) console.log(`  warning: ${p} isn't in a Pokémon folder, skipped`);
    for (const [dex, m] of [...mons].sort((a, b) => a[0] - b[0])) {
      const r = checkMon(dex, m.files, [...m.labels], G);
      console.log(`  #${dex} ${r.name}`);
      for (const e of r.errors) console.log(`    ERROR ${e}`);
      for (const w of r.warnings) console.log(`    warning: ${w}`);
      if (!r.copy.length || (strict && (r.errors.length || r.warnings.length))) {
        console.log(`    -> not imported`); failed++; continue;
      }
      if (!dry) for (const [buf, to] of r.copy) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf); }
      imported++;
      const extra = [r.lab.length && `Lab: ${r.lab.join(', ')}`, r.mega && 'Mega'].filter(Boolean).join(', ');
      console.log(`    -> ${dry ? 'would import' : 'imported'} ${r.copy.length} sheet(s) to assets/pokemon/${dex}/r/${extra ? ' (' + extra + ')' : ''}`);
    }
  }
  if (imported && !dry) {
    console.log('');
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'radiants.cjs')], { stdio: 'inherit' });
    console.log('Next: node fork/build.cjs, try it in dev.html, then commit and push.');
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { unzip, place, folder, slug, decode, checkMon, group, gameData };
if (require.main === module) main();
