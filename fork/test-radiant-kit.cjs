#!/usr/bin/env node
// The Radiant Sprite Kit page (radiant-kit/index.html), in headless Edge.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-radiant-kit.cjs [base-url]
//
//   1. Search finds Pokémon by name, by number (6, #6), by type and by "mega".
//   2. Charizard with "Mega" ticked downloads a .zip with its 7 sheets in 6/r/, its Lab sheet
//      in 6/r/lab/, its Mega's 7 in m6/r/ and CREDITS.txt, each byte for byte the default
//      sheet; unticked, no Mega files. A Pokémon with no Mega has the box disabled.
//   3. Every species' list matches the sheets on disk (nothing missing, nothing extra).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// Reads a zip's central directory (stored or deflated entries).
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const raw = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
    out[name] = { data: method === 8 ? zlib.inflateRawSync(raw) : raw, crc };
    p += 46 + nl + xl + cl;
  }
  return out;
}
const crc32 = b => (zlib.crc32 ? zlib.crc32(b) : null);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/radiant-kit/', { waitUntil: 'load' });

  console.log('Search');
  const names = q => page.evaluate(q => RadiantKit.search(q).map(p => p.name), q);
  check((await names('charizard'))[0] === 'Charizard', 'by name');
  check((await names('6'))[0] === 'Charizard' && (await names('#6'))[0] === 'Charizard', 'by number, with and without #');
  const fire = await names('fire');
  check(fire.includes('Charmander') && !fire.includes('Squirtle'), 'by type');
  const mega = await names('mega');
  check(mega.includes('Charizard') && !mega.includes('Charmander'), 'by "mega"', mega.length);
  const epic = await page.evaluate(() => RadiantKit.search('epic'));
  check(epic.length > 0 && epic.every(p => p.rarity === 4), 'by rarity ("epic")', epic.length);
  await page.fill('#q', 'charizard');
  await page.waitForSelector('#results button');
  check(await page.$$eval('#results button', b => b.length) === 1, 'the result list follows the search');

  console.log('Rarity');
  // The game's colours (js/systems/gacha.js) and names (Spanish there, English here).
  const RAR = { 1: ['Common', 'rgb(159, 177, 201)'], 2: ['Uncommon', 'rgb(95, 224, 138)'], 3: ['Rare', 'rgb(79, 180, 255)'],
                4: ['Epic', 'rgb(196, 123, 255)'], 5: ['Legendary', 'rgb(255, 203, 61)'] };
  const gacha = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'systems', 'gacha.js'), 'utf8')
    .match(/RARITY_COLOR = (\{[^}]+\})/)[1].replace(/(\d):/g, '"$1":').replace(/'/g, '"');
  const hex = JSON.parse(gacha), rgb = h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
  check(Object.keys(RAR).every(k => rgb(hex[k]) === RAR[k][1]), 'the page\'s colours match the game\'s', hex);
  const zard = await page.evaluate(() => G.DEX_BY[6].rarity);
  const card = await page.$eval('#results button', b => ({ color: getComputedStyle(b.querySelector('.nm')).color, rar: b.querySelector('.rar').textContent }));
  check(card.color === RAR[zard][1] && card.rar.includes(RAR[zard][0]), `the result card: name in its rarity colour and "${RAR[zard][0]}"`, card);

  console.log('Download');
  async function grab() {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]);
    const file = await dl.path();
    return { name: dl.suggestedFilename(), files: unzip(fs.readFileSync(file)) };
  }
  const same = (files, from, to) => {
    const z = files[to];
    const src = fs.readFileSync(path.join(ROOT, from));
    return !!z && Buffer.compare(z.data, src) === 0 && (crc32(src) === null || z.crc === crc32(src));
  };
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];

  await page.click('#results button');
  const head = await page.evaluate(() => ({ color: getComputedStyle(document.querySelector('#p-name span')).color, rar: document.getElementById('p-rar').textContent }));
  check(head.color === RAR[zard][1] && head.rar.includes(RAR[zard][0]) && head.rar.includes('★'.repeat(zard)), 'the chosen Pokémon: coloured name, stars and rarity', head);
  check(await page.isEnabled('#mega'), 'Charizard: the Mega box can be ticked');
  await page.check('#mega');
  let z = await grab();
  check(z.name === 'radiant-6-charizard-mega.zip', 'zip name', z.name);
  check(ANIMS.every(a => same(z.files, `assets/pokemon/6/${a}.png`, `assets/pokemon/6/r/${a}.png`)), 'the 7 sheets, as assets/pokemon/6/r/{Anim}.png');
  check(same(z.files, 'assets/pokemon/6/lab/SpAttack.png', 'assets/pokemon/6/r/lab/SpAttack.png'), 'its Lab sheet, as 6/r/lab/SpAttack.png');
  check(ANIMS.every(a => same(z.files, `assets/pokemon/m6/${a}.png`, `assets/pokemon/m6/r/${a}.png`)), 'the Mega\'s 7 sheets, as assets/pokemon/m6/r/{Anim}.png');
  const cred = z.files['CREDITS.txt'] && z.files['CREDITS.txt'].data.toString();
  check(!!cred && cred.includes('CHUNSOFT') && cred.includes('Kevin0itachi'), 'CREDITS.txt names the sprite and Mega artists');
  check(Object.keys(z.files).length === 16, 'nothing else in it', Object.keys(z.files));

  await page.uncheck('#mega');
  z = await grab();
  check(z.name === 'radiant-6-charizard.zip' && !Object.keys(z.files).some(f => f.includes('/m6/')), 'unticked: no Mega files', Object.keys(z.files).length);

  await page.fill('#q', '#1');
  await page.press('#q', 'Enter');
  await page.waitForFunction(() => document.getElementById('p-name').textContent.startsWith('Bulbasaur'));
  check(!(await page.isEnabled('#mega')), 'Bulbasaur (no Mega): the box is disabled');
  z = await grab();
  check(Object.keys(z.files).sort().join() === ANIMS.map(a => `assets/pokemon/1/r/${a}.png`).concat('CREDITS.txt').sort().join(),
    'Bulbasaur: just its 7 sheets and the credits');

  console.log('Every species');
  const all = await page.evaluate(() => G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => [p.dex, RadiantKit.sheets(p, true).map(s => [s[1], s[2]])]));
  const bad = [];
  for (const [dex, list] of all) {
    for (const [src, out] of list) {
      if (!fs.existsSync(path.join(ROOT, src))) bad.push('missing ' + src);
      if (out !== src.replace(/^assets\/pokemon\/(m?\d+)\//, 'assets/pokemon/$1/r/')) bad.push('name ' + out);
    }
    // Every sheet on disk for this species is in the list (the shiny s/ folder aside).
    for (const dir of [`${dex}`, `${dex}/lab`, `m${dex}`]) {
      const abs = path.join(ROOT, 'assets/pokemon', dir);
      if (!fs.existsSync(abs)) continue;
      for (const f of fs.readdirSync(abs).filter(f => f.endsWith('.png')))
        if (!list.some(([src]) => src === `assets/pokemon/${dir}/${f}`)) bad.push('not listed ' + dir + '/' + f);
    }
  }
  check(!bad.length, `${all.length} species: lists match the sheets on disk`, bad.slice(0, 10));
  check(!errs.length, 'no page errors', errs);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
