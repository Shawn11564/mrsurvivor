#!/usr/bin/env node
/* ============ fork/radiant-admin.cjs — the radiants side of the Asset Admin (MrSurvivor) ============
 *   node fork/radiant-admin.cjs [--port 8130] [--no-open]   (= fork/asset-admin.cjs on its Radiants tab)
 *
 * The page (fork/radiant-admin.html) is the Radiants tab of fork/asset-admin.cjs, which serves it
 * and its API on this PC only; this file is what that API does:
 *   1. Drop the artists' zips (the Radiant Sprite Kit's layout, assets/0150_mewtwo/...): every
 *      Pokémon in them is checked like fork/import-radiant.cjs does (same code), with an
 *      animated preview, normal next to radiant, of every sheet.
 *   2. Pick which to import and each one's rarity (1-5, its tier in the Radiant Ritual's odds; the
 *      Pokémon's own rarity by default). Import copies the sheets to assets/pokemon/{dex}/r/,
 *      r/lab/ and m{dex}/r/, keeps the rarity in js/fork/radiants.json and runs fork/radiants.cjs.
 *      The rarity of radiants already in the game can be changed too.
 *   3. Publish (fork/asset-admin.cjs) commits only the files the tool manages (these and the
 *      gallery's), whatever else is changed in the checkout, and pushes main. The game reads
 *      radiants.json when it loads and when the ritual opens (refresh in js/fork/radiant.js), so
 *      they're live once GitHub Pages has deployed (a minute or two), with no rebuild. A sheet
 *      imported over an old one gets a new hash in js/fork/asset-rev.json, or players' service
 *      worker would keep showing the old one.
 * Check: node fork/test-radiant-admin.cjs.
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const imp = require('./import-radiant.cjs');
const gallery = require('./asset-gallery.cjs');
const ROOT = path.join(__dirname, '..');
const MON = path.join(ROOT, 'assets', 'pokemon');
const JSON_FILE = path.join(ROOT, 'js', 'fork', 'radiants.json');
// The radiant files a publish commits (fork/asset-admin.cjs adds the gallery's).
const PATHS = [':(glob)assets/pokemon/*/r/**', 'js/fork/radiants.json', 'js/fork/radiant-list.js'];

const G = imp.gameData();
const uploads = new Map();                        // id -> { name, mons: Map(dex -> { files, labels }) }

const radiants = () => { try { return JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch (e) { return {}; } };
/** The ritual's share for each rarity tier, read from the game so the page's odds can't drift from it. */
function weights() {
  const m = fs.readFileSync(path.join(ROOT, 'js', 'fork', 'radiant.js'), 'utf8').match(/const SHARE = (\{[^}]*\})/);
  return m ? JSON.parse(m[1].replace(/(\d+):/g, '"$1":')) : { 1: 40, 2: 30, 3: 18, 4: 9, 5: 3 };
}
const name = d => (G.DEX.find(p => p.dex === +d) || {}).name || '#' + d;

function check(id) {
  const up = uploads.get(id), cur = radiants();
  return [...up.mons].sort((a, b) => a[0] - b[0]).map(([dex, m]) => {
    const r = imp.checkMon(dex, m.files, [...m.labels], G);
    const mon = G.DEX.find(p => p.dex === dex);
    const sheets = [];
    for (const part of ['base', 'lab', 'mega']) for (const anim of Object.keys(m.files[part] || {})) sheets.push({ part, anim });
    return { id, dex, name: r.name, errors: r.errors, warnings: r.warnings, ok: r.copy.length > 0, sheets, lab: r.lab, mega: r.mega,
      count: r.copy.length, exists: !!cur[dex], rarity: (cur[dex] && cur[dex].rarity) || (mon && mon.rarity) || 1, monRarity: mon ? mon.rarity : 1 };
  });
}

/** Copy one checked Pokémon in, dropping old radiant sheets it doesn't replace. */
function importOne(id, dex) {
  const m = uploads.get(id) && uploads.get(id).mons.get(dex);
  if (!m) throw new Error(`#${dex}: upload not found (drop the zip again)`);
  const r = imp.checkMon(dex, m.files, [...m.labels], G);
  if (!r.copy.length) throw new Error(`#${dex}: ${r.errors.join('; ')}`);
  const keep = new Set(r.copy.map(([, to]) => path.resolve(to)));
  const over = r.copy.map(([, to]) => to).filter(to => fs.existsSync(to)).map(to => path.relative(ROOT, to).split(path.sep).join('/'));
  for (const dir of [path.join(MON, String(dex), 'r'), path.join(MON, String(dex), 'r', 'lab'), path.join(MON, 'm' + dex, 'r')])
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.png') && !keep.has(path.resolve(dir, f))) fs.rmSync(path.join(dir, f));
  for (const [buf, to] of r.copy) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf); }
  gallery.bump(over);
  return r;
}

/** Rarities into radiants.json, then fork/radiants.cjs rewrites both lists from what's on disk. */
function relist(rarities) {
  const j = radiants();
  for (const [d, r] of Object.entries(rarities || {})) if (+r >= 1 && +r <= 5) j[d] = Object.assign({}, j[d], { rarity: +r });
  fs.writeFileSync(JSON_FILE, JSON.stringify(j, null, 2) + '\n');
  return execFileSync(process.execPath, [path.join(__dirname, 'radiants.cjs')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * What changed among the radiants, for the commit message: "Charizard (#6) new, Mewtwo (#150)".
 * changed: the paths git lists; before: radiants.json at HEAD.
 */
function summary(changed, before) {
  const was = radiants();
  const dexes = [...new Set(changed.map(f => (f.match(/assets\/pokemon\/m?(\d+)\/r\//) || [])[1]).filter(Boolean))].map(Number);
  for (const d in was) if (!dexes.includes(+d) && JSON.stringify(was[d]) !== JSON.stringify(before[d])) dexes.push(+d);
  const gone = Object.keys(before).filter(d => !was[d]).map(Number);
  const what = dexes.sort((a, b) => a - b).map(d => `${name(d)} (#${d})${before[d] ? '' : ' new'}`).concat(gone.map(d => `${name(d)} (#${d}) removed`));
  return what.length ? 'Radiants: ' + what.join(', ') : changed.some(f => /^js\/fork\/radiant/.test(f)) ? 'Radiants: list update' : '';
}

module.exports = { G, uploads, radiants, weights, name, check, importOne, relist, summary, PATHS, JSON_FILE };

if (require.main === module) require('./asset-admin.cjs').start({ tab: 'radiants' });
