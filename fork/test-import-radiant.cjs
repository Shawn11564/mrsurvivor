#!/usr/bin/env node
// Importing an artist's radiant recolours (fork/import-radiant.cjs), no browser or server needed:
//
//   node fork/test-import-radiant.cjs
//
// Runs the real importer (and fork/radiants.cjs after it) in a throwaway copy of the bits of the
// repo it reads, on zips made here from the real sheets with every RGB inverted (a "recolour"):
//   1. The Kit's layout, re-zipped inside an extra folder, two Pokémon in one zip: Charizard with
//      its Lab and Mega lands in 6/r/, 6/r/lab/, m6/r/; Mewtwo in a folder named "0150_pikachu" is
//      imported by its number, with a warning for the name and for the missing Mega.
//   2. The Kit's older layout (assets/pokemon/{dex}/r/, what the first artist zip used) still imports.
//   3. An unzipped folder imports the same as a zip.
//   4. Turned away, nothing written: a sheet of the wrong size, a missing sheet, a number the game
//      doesn't have, a zip with no Pokémon folder.
//   5. Warned (and refused with --strict): a frame moved one pixel (named by its cell), a sheet
//      that wasn't recoloured. --dry-run writes nothing.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { recolour, zipOf, sandbox, kit, rarity } = require('./radiant-fixtures.cjs');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// A throwaway copy of what the importer reads: its scripts, the game data, a few Pokémon's sheets.
const T = sandbox('radimport-');
fs.mkdirSync(path.join(T, 'js/fork'), { recursive: true });
const MON = path.join(T, 'assets/pokemon');
const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [path.join(T, 'fork/import-radiant.cjs'), ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const write = (name, files) => { const f = path.join(T, name); fs.writeFileSync(f, zipOf(files)); return f; };
const list = () => { const s = fs.readFileSync(path.join(T, 'js/fork/radiant-list.js'), 'utf8'); return JSON.parse(s.match(/G\.RADIANTS = (\{.*\});/)[1]); };
const radiant = rel => fs.existsSync(path.join(MON, rel));
const reset = () => { for (const d of ['6', 'm6', '150', 'm150', '1']) fs.rmSync(path.join(MON, d, 'r'), { recursive: true, force: true }); for (const f of ['radiant-list.js', 'radiants.json']) fs.rmSync(path.join(T, 'js/fork', f), { force: true }); };
const sameAs = (rel, buf) => radiant(rel) && Buffer.compare(fs.readFileSync(path.join(MON, rel)), buf) === 0;

try {
  console.log('1. The Kit\'s layout, inside an extra folder, two Pokémon');
  const zard = { ...kit('My recolours/assets/0006_charizard', path.join(MON, '6')), ...kit('My recolours/assets/0006_charizard/lab', path.join(MON, '6/lab')),
    ...kit('My recolours/assets/0006_charizard/mega', path.join(MON, 'm6')) };
  const two = { ...zard, ...kit('My recolours/assets/0150_pikachu', path.join(MON, '150')), 'My recolours/README.txt': Buffer.from('hi'), '__MACOSX/._x.png': Buffer.from('junk') };
  let r = run([write('two.zip', two)]);
  check(r.code === 0, 'exit 0', r.code ? r.out : undefined);
  check(ANIMS.every(a => sameAs(`6/r/${a}.png`, zard[`My recolours/assets/0006_charizard/${a}.png`])), 'Charizard\'s 7 sheets are in 6/r/, byte for byte');
  check(sameAs('6/r/lab/SpAttack.png', zard['My recolours/assets/0006_charizard/lab/SpAttack.png']), 'its Lab sheet in 6/r/lab/');
  check(ANIMS.every(a => radiant(`m6/r/${a}.png`)), 'its Mega in m6/r/');
  check(ANIMS.every(a => radiant(`150/r/${a}.png`)) && radiant('150/r/lab/SpAttack.png') === false, 'Mewtwo ("0150_pikachu") lands in 150/r/ by its number');
  check(/folder "0150_pikachu" says "pikachu", but #150 is Mewtwo/.test(r.out), 'warns that the name doesn\'t match');
  check(/#150 Mewtwo[\s\S]*no Mega sheets/.test(r.out), 'warns that Mewtwo has no Mega sheets');
  const L = list();
  check(JSON.stringify(L['6']) === `{"lab":["SpAttack"],"mega":true,"rarity":${rarity(6)}}` && JSON.stringify(L['150']) === `{"rarity":${rarity(150)}}`, 'radiants.cjs puts both in the ritual\'s pool', L);

  console.log('2. The older layout');
  reset();
  const old = kit('0150_mewtwo/assets/pokemon/150/r', path.join(MON, '150'));
  Object.assign(old, kit('0150_mewtwo/assets/pokemon/150/r/lab', path.join(MON, '150/lab')));
  r = run([write('old.zip', old)]);
  check(r.code === 0 && ANIMS.every(a => radiant(`150/r/${a}.png`)) && radiant('150/r/lab/SpAttack.png'), 'assets/pokemon/150/r/ (in a wrapper folder) imports', r.code ? r.out : undefined);
  check(JSON.stringify(list()['150']) === `{"lab":["SpAttack"],"rarity":${rarity(150)}}`, 'with its Lab sheet in the pool entry');

  console.log('3. An unzipped folder');
  reset();
  const dir = path.join(T, 'unzipped');
  for (const [n, b] of Object.entries(kit('assets/0001_bulbasaur', path.join(MON, '1')))) { fs.mkdirSync(path.join(dir, path.dirname(n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), b); }
  r = run([dir]);
  check(r.code === 0 && ANIMS.every(a => radiant(`1/r/${a}.png`)) && 'list' && list()['1'], 'imports like a zip', r.code ? r.out : undefined);

  console.log('4. Turned away');
  reset();
  const crop = img => { img.w -= 1; const px = Buffer.alloc(img.w * img.h * 4); for (let y = 0; y < img.h; y++) img.px.copy(px, y * img.w * 4, y * (img.w + 1) * 4, y * (img.w + 1) * 4 + img.w * 4); img.px = px; };
  r = run([write('small.zip', kit('assets/0001_bulbasaur', path.join(MON, '1'), { edit: { Idle: crop } }))]);
  check(r.code === 1 && /Idle\.png is \d+×\d+, the normal sheet is/.test(r.out) && !radiant('1/r'), 'a sheet of the wrong size: nothing written', r.out.trim().split('\n').slice(-3));
  r = run([write('missing.zip', kit('assets/0001_bulbasaur', path.join(MON, '1'), { skip: ['Faint'] }))]);
  check(r.code === 1 && /missing Faint\.png/.test(r.out) && !radiant('1/r'), 'a missing sheet: nothing written');
  r = run([write('nodex.zip', { 'assets/9999_missingno/Idle.png': recolour(path.join(MON, '1/Idle.png')) })]);
  check(r.code === 1 && /no Pokémon with this number/.test(r.out), 'a number the game doesn\'t have');
  r = run([write('flat.zip', { 'Idle.png': recolour(path.join(MON, '1/Idle.png')) })]);
  check(r.code === 1 && /no radiant sheets found/.test(r.out), 'a zip with no Pokémon folder');
  // A Mega with a wrong-size sheet is left out, the rest still comes in.
  r = run([write('badmega.zip', { ...kit('assets/0006_charizard', path.join(MON, '6')), ...kit('assets/0006_charizard/mega', path.join(MON, 'm6'), { edit: { Walk: crop } }) })]);
  check(r.code === 0 && radiant('6/r/Idle.png') && !radiant('m6/r') && /Mega left out/.test(r.out) && JSON.stringify(list()['6']) === `{"rarity":${rarity(6)}}`, 'a broken Mega is left out, the radiant still comes in');

  console.log('5. Warnings, --strict and --dry-run');
  reset();
  // Move every pixel of Idle's first frame (col 1, row 1) one to the right.
  const shift = img => { const g = { w: 0 }; const s = fs.readFileSync(path.join(T, 'js/data/sprites-meta.js'), 'utf8');
    g.w = +s.match(/\b1: \{"s":\d+,"a":\{(?:[^}]*\},)*?"Idle":\{"w":(\d+)/)[1];
    const h = img.h / 8;
    for (let y = 0; y < h; y++) for (let x = g.w - 1; x > 0; x--) for (let c = 0; c < 4; c++) img.px[(y * img.w + x) * 4 + c] = img.px[(y * img.w + x - 1) * 4 + c];
    for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) img.px[(y * img.w) * 4 + c] = 0; };
  const warny = write('warn.zip', kit('assets/0001_bulbasaur', path.join(MON, '1'), { edit: { Idle: shift }, same: ['Hurt'] }));
  r = run([warny, '--dry-run']);
  check(r.code === 0 && /Idle\.png: \d+ pixel\(s\) differ from the normal outline .* in frame col 1 row 1/.test(r.out), 'a moved frame is named by its cell', r.out.match(/Idle\.png:.*/) && r.out.match(/Idle\.png:.*/)[0]);
  check(/Hurt\.png is the same as the normal sheet/.test(r.out), 'an unrecoloured sheet is pointed out');
  check(/would import/.test(r.out) && !radiant('1/r') && !fs.existsSync(path.join(T, 'js/fork/radiant-list.js')), '--dry-run writes nothing');
  r = run([warny, '--strict']);
  check(r.code === 1 && /not imported/.test(r.out) && !radiant('1/r'), '--strict refuses it');
  r = run([warny]);
  check(r.code === 0 && radiant('1/r/Idle.png'), 'without --strict, it imports with the warnings');
} catch (e) { console.error(e); failures++; }
fs.rmSync(T, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll radiant import checks passed');
process.exit(failures ? 1 : 0);
