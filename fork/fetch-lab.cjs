/* ============ fork/fetch-lab.cjs — datos del modo Lab (fork MrSurvivor) ============
 *   node fork/fetch-lab.cjs            descarga lo que falte y escribe js/fork/lab/lab-data.js
 *   node fork/fetch-lab.cjs --fresh    vuelve a descargarlo todo
 *   node fork/fetch-lab.cjs --stats    además, cuántos movimientos puede aprender cada uno
 *
 * Fuentes (una vez; el juego no toca internet):
 *   - PokeAPI (volcado CSV de su repositorio): qué movimientos aprende cada especie y cómo,
 *     sus habilidades y los nombres en inglés de las habilidades.
 *   - SpriteCollab (tracker.json): qué animaciones de Mundo Misterioso tiene cada especie.
 * Cada descarga va a su propia carpeta en tools/cache/lab/ (no se sube al repositorio).
 *
 * Sólo se guardan los movimientos que el juego tiene (js/data/moves.js), por el movimiento de
 * verdad que representa cada uno (REAL: nuestro giga-drain es Hierba Lazo...). Ver fork/LAB.md.
 */
const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tools', 'cache', 'lab');
const OUT = path.join(ROOT, 'js', 'fork', 'lab', 'lab-data.js');
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const FILES = {
  pokemon_moves: CSV + 'pokemon_moves.csv',
  pokemon_abilities: CSV + 'pokemon_abilities.csv',
  abilities: CSV + 'abilities.csv',
  ability_names: CSV + 'ability_names.csv',
  moves: CSV + 'moves.csv',
  pokemon_species: CSV + 'pokemon_species.csv',
  pokemon_evolution: CSV + 'pokemon_evolution.csv',
  tracker: 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json'
};
const FRESH = process.argv.includes('--fresh'), STATS = process.argv.includes('--stats');

// Movimientos del juego que no se llaman como el movimiento de verdad que son.
const REAL = { 'giga-drain': 'grass-knot', 'leaf-storm': 'petal-blizzard' };
// pokemon_move_methods.csv: 1 nivel, 2 huevo, 3 tutor, 4 MT/MO. El resto (eventos, formas) no cuenta.
const METHOD = { 1: 'lv', 2: 'egg', 3: 'tutor', 4: 'tm' };
const EN = 9;                                  // languages.csv: inglés

function get(url, file) {
  return new Promise((ok, ko) => {
    https.get(url, { headers: { 'User-Agent': 'mrsurvivor-lab/1.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); get(r.headers.location, file).then(ok, ko); return; }
      if (r.statusCode !== 200) { r.resume(); ko(new Error(url + ': HTTP ' + r.statusCode)); return; }
      const tmp = file + '.part', out = fs.createWriteStream(tmp);
      r.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, file); ok(); }));
      out.on('error', ko);
    }).on('error', ko);
  });
}

/** Ruta de una descarga (cada una en su carpeta), bajándola si hace falta. */
async function source(name) {
  const url = FILES[name], dir = path.join(CACHE, name), file = path.join(dir, path.basename(url));
  if (FRESH || !fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('lab: downloading ' + url);
    await get(url, file);
  }
  return file;
}

/** CSV con comillas (los textos de PokeAPI llevan comas y saltos de línea). → [{col: valor}] */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const readCsv = f => parseCsv(fs.readFileSync(f, 'utf8'));

/** Carga los datos del juego (pokedex.js, moves.js y los del Lab) con un G de mentira. */
function gameData() {
  const G = { U: {}, I18n: { add() {} } };
  const ctx = vm.createContext({ G, window: {}, console });
  for (const f of ['js/data/pokedex.js', 'js/data/moves.js', 'js/fork/lab/lab-moves.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return G;
}

(async () => {
  const G = gameData();
  const files = {};
  for (const k of Object.keys(FILES)) files[k] = await source(k);

  // ---------------- movimientos ----------------
  const moveIdByName = {}, powerOf = {};
  for (const m of readCsv(files.moves)) { moveIdByName[m.identifier] = +m.id; powerOf[m.identifier] = m.power ? +m.power : 0; }
  const catalog = G.Moves.ALL.map(m => m.id).concat(G.LabMoves.map(m => m.id));
  const all = Object.assign({}, G.Moves.BY_ID, Object.fromEntries(G.LabMoves.map(m => [m.id, m])));
  const catalogByApi = {};
  const missing = [];
  for (const id of catalog) {
    const api = moveIdByName[REAL[id] || id];
    if (api) catalogByApi[api] = id; else missing.push(id);
  }
  if (missing.length) console.warn('lab: moves with no PokeAPI match (never in a learnset): ' + missing.join(', '));

  const dexSet = new Set(G.DEX.map(p => p.dex));
  const learn = {};                       // dex -> { id: 'lv' | 'egg' | 'tutor' | 'tm' } (el mejor método)
  const RANK = { lv: 0, egg: 1, tutor: 2, tm: 3 };
  for (const r of readCsv(files.pokemon_moves)) {
    const dex = +r.pokemon_id, how = METHOD[r.pokemon_move_method_id], id = catalogByApi[r.move_id];
    if (!dexSet.has(dex) || !how || !id) continue;
    const L = learn[dex] = learn[dex] || {};
    if (!L[id] || RANK[how] < RANK[L[id]]) L[id] = how;
  }

  // ---------------- habilidades ----------------
  const abilName = {}, abilIdent = {};
  for (const a of readCsv(files.abilities)) abilIdent[a.id] = a.identifier;
  for (const n of readCsv(files.ability_names)) if (+n.local_language_id === EN) abilName[abilIdent[n.ability_id]] = n.name;
  const abil = {};                        // dex -> [[identifier, oculta]] por slot
  for (const r of readCsv(files.pokemon_abilities)) {
    const dex = +r.pokemon_id;
    if (!dexSet.has(dex)) continue;
    (abil[dex] = abil[dex] || []).push([+r.slot, abilIdent[r.ability_id], r.is_hidden === '1']);
  }
  const usedAbil = new Set();
  for (const d in abil) { abil[d].sort((a, b) => a[0] - b[0]); for (const a of abil[d]) usedAbil.add(a[1]); }

  // ---------------- evoluciones (fase 6) ----------------
  // fam[dex]: su cadena evolutiva (la de PokeAPI); evo[dex]: a qué evoluciona y a qué nivel en los
  // juegos ("dex:nivel" separados por comas; nivel 0 = por objeto, intercambio, amistad...).
  const fam = {}, from = {}, evoLvl = {};
  for (const r of readCsv(files.pokemon_species)) {
    const d = +r.id;
    if (!dexSet.has(d)) continue;
    fam[d] = +r.evolution_chain_id;
    if (r.evolves_from_species_id && dexSet.has(+r.evolves_from_species_id)) from[d] = +r.evolves_from_species_id;
  }
  for (const r of readCsv(files.pokemon_evolution)) {
    const d = +r.evolved_species_id, lv = r.minimum_level ? +r.minimum_level : 0;
    if (!from[d]) continue;
    // Varias formas de evolucionar (por juego): el nivel más bajo que haya.
    if (!(d in evoLvl) || (lv && (!evoLvl[d] || lv < evoLvl[d]))) evoLvl[d] = lv;
  }
  const evo = {};
  for (const d in from) (evo[from[d]] = evo[from[d]] || []).push(d + ':' + (evoLvl[d] || 0));

  // ---------------- animaciones de SpriteCollab ----------------
  const tracker = JSON.parse(fs.readFileSync(files.tracker, 'utf8'));
  const animNames = new Set();
  const animsOf = {};
  for (const dex of dexSet) {
    const t = tracker[String(dex).padStart(4, '0')];
    const a = t && t.sprite_files ? Object.keys(t.sprite_files).filter(k => t.sprite_files[k]) : [];
    animsOf[dex] = a;
    a.forEach(n => animNames.add(n));
  }
  const ANIMS = [...animNames].sort();

  // ---------------- salida ----------------
  // Compacto: los movimientos por su índice en MOVES (base 36), en cuatro grupos separados
  // por '|' según cómo los aprende (nivel|huevo|tutor|MT); las animaciones, en bits (base 36).
  const MOVES = catalog;
  const GROUPS = ['lv', 'egg', 'tutor', 'tm'];
  // POWER: potencia del movimiento de verdad en los juegos (0 = de estado), por índice de MOVES.
  const POWER = MOVES.map(id => powerOf[REAL[id] || id] || 0);
  const out = { MOVES, POWER, ANIMS, learn: {}, abil: {}, abilName: {}, anims: {}, fam, evo: {} };
  for (const d in evo) out.evo[d] = evo[d].join(',');
  for (const p of G.DEX) {
    const L = learn[p.dex] || {};
    out.learn[p.dex] = GROUPS.map(g => Object.keys(L).filter(id => L[id] === g).map(id => MOVES.indexOf(id).toString(36)).join(',')).join('|');
    out.abil[p.dex] = (abil[p.dex] || []).map(([, id, hidden]) => (hidden ? '*' : '') + id).join(' ');
    let bits = 0n;
    for (const a of animsOf[p.dex]) bits |= 1n << BigInt(ANIMS.indexOf(a));
    out.anims[p.dex] = bits.toString(36);
  }
  for (const a of [...usedAbil].sort()) out.abilName[a] = abilName[a] || a;

  const js = `/* ============ lab-data.js — GENERADO por fork/fetch-lab.cjs, no editar a mano ============
 * Datos del modo Lab (fork/LAB.md), de PokeAPI y SpriteCollab:
 *   MOVES      ids de los movimientos del juego (js/data/moves.js y lab-moves.js), por índice
 *   POWER      su potencia en los juegos (0 = movimiento de estado), mismo índice
 *   learn[dex] "nivel|huevo|tutor|MT": en cada grupo, índices de MOVES en base 36 separados por comas
 *   abil[dex]  sus habilidades por orden de slot; * = oculta
 *   abilName   nombre en inglés de cada habilidad
 *   ANIMS      animaciones de Mundo Misterioso; anims[dex] = las que tiene, en bits (base 36)
 *   fam[dex]   su cadena evolutiva; evo[dex] "dex:nivel,..." a qué evoluciona (nivel 0 = sin nivel)
 */
G.LabData = ${JSON.stringify(out)};
`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, js);
  console.log(`lab: wrote ${path.relative(ROOT, OUT)} (${(js.length / 1024).toFixed(0)} KB, ${G.DEX.length} species, ${usedAbil.size} abilities, ${ANIMS.length} animations)`);

  if (STATS) {
    const POOL = {};
    for (const m of Object.values(all)) (POOL[m.type] = POOL[m.type] || []).push(m.id);
    const rows = G.DEX.map(p => {
      const L = learn[p.dex] || {};
      const own = id => p.types.includes(all[id].type);
      const ids = Object.keys(L);
      const typeAll = p.types.flatMap(t => POOL[t] || []);
      return {
        dex: p.dex, name: p.name, types: p.types.join('/'),
        typePool: typeAll.length,
        ownNoTm: ids.filter(id => own(id) && L[id] !== 'tm').length,
        ownAll: ids.filter(id => own(id)).length,
        normal: ids.filter(id => all[id].type === 'normal').length,
        cover: ids.filter(id => !own(id) && all[id].type !== 'normal').length
      };
    });
    const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
    console.log('avg  typePool', avg('typePool'), ' ownNoTm', avg('ownNoTm'), ' ownAll', avg('ownAll'), ' normal', avg('normal'), ' cover', avg('cover'));
    const hist = k => { const h = {}; for (const r of rows) h[r[k]] = (h[r[k]] || 0) + 1; return JSON.stringify(h); };
    console.log('ownAll histogram', hist('ownAll'));
    console.log('ownNoTm histogram', hist('ownNoTm'));
    for (const d of [1, 4, 6, 10, 25, 94, 126, 129, 132, 150, 235, 292, 448, 658]) {
      const r = rows.find(x => x.dex === d);
      if (r) console.log(JSON.stringify(r), Object.entries(learn[d] || {}).map(([k, v]) => k + ':' + v).join(' '));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
