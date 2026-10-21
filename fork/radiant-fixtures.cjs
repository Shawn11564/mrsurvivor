// Test helpers for the radiant importer (fork/test-import-radiant.cjs, fork/test-radiant-admin.cjs):
// recoloured sheets made from the real ones, zips as artists send them, and a throwaway copy of
// the bits of the repo the importer reads and writes.
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { decode } = require('./import-radiant.cjs');
const REPO = path.join(__dirname, '..');

function encode({ w, h, px }) {                   // RGBA 8-bit, filter 0
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** The real sheet with every RGB inverted (same outline); edit(img) can change it further. */
function recolour(file, edit) {
  const img = decode(fs.readFileSync(file));
  for (let i = 0; i < img.px.length; i += 4) if (img.px[i + 3]) { img.px[i] ^= 255; img.px[i + 1] ^= 255; img.px[i + 2] ^= 255; }
  if (edit) edit(img);
  return encode(img);
}
function zipOf(files) {                           // { name: Buffer }, deflated like most zip tools
  const parts = [], dir = []; let off = 0;
  for (const [n, data] of Object.entries(files)) {
    const name = Buffer.from(n), comp = zlib.deflateRawSync(data), crc = zlib.crc32(data) >>> 0;
    const loc = Buffer.alloc(30), cen = Buffer.alloc(46);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(name.length, 26);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(off, 42);
    parts.push(loc, name, comp); dir.push(cen, name); off += 30 + name.length + comp.length;
  }
  const d = Buffer.concat(dir), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10);
  end.writeUInt32LE(d.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, d, end]);
}

/** A throwaway copy of what the importer and the admin page use, with a few Pokémon's sheets. */
function sandbox(prefix) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const copy = rel => { const to = path.join(T, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(path.join(REPO, rel), to, { recursive: true }); };
  ['fork/import-radiant.cjs', 'fork/radiants.cjs', 'fork/radiant-admin.cjs', 'fork/radiant-admin.html', 'js/fork/radiant.js',
   'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/fork/mega-sprites.js', 'js/fork/lab/lab-anims.js'].forEach(copy);
  for (const d of ['6', 'm6', '150', 'm150', '1']) for (const f of fs.readdirSync(path.join(REPO, 'assets/pokemon', d))) if (f.endsWith('.png')) copy(`assets/pokemon/${d}/${f}`);
  for (const d of ['6/lab', '150/lab']) copy(`assets/pokemon/${d}`);
  return T;
}

/** The Kit's files for one form (every sheet in src), recoloured. opts: skip, same (left as is), edit. */
function kit(dir, src, opts = {}) {
  const out = {};
  for (const a of fs.readdirSync(src).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))) {
    if ((opts.skip || []).includes(a)) continue;
    const file = path.join(src, a + '.png');
    out[`${dir}/${a}.png`] = (opts.same || []).includes(a) ? fs.readFileSync(file) : recolour(file, (opts.edit || {})[a]);
  }
  return out;
}

/** A Pokémon's gacha rarity, from the game's data. */
function rarity(dex) {
  const G = {};
  require('vm').runInNewContext(fs.readFileSync(path.join(REPO, 'js/data/pokedex.js'), 'utf8'), { G });
  return G.DEX.find(p => p.dex === dex).rarity;
}

module.exports = { encode, recolour, zipOf, sandbox, kit, rarity, decode };
