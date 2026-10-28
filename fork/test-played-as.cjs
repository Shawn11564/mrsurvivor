#!/usr/bin/env node
// The run's end screen says which Pokémon you played as (js/fork/played-as.js), in headless Edge:
//
//   node fork/serve.cjs                 (or any server on the repo root)
//   node fork/test-played-as.cjs [base-url]
//
// Real runs ended the real way (Quit run, or knocked out by an enemy's touch), as:
//   1. a shiny Charizard, knocked out: "You played as" with its sprite and "Shiny Charizard", above
//      "What knocked you out"
//   2. a Charizard that Mega Evolved (p.megaKey, as js/fork/mega.js sets it): "Mega X Charizard"
//   3. a radiant Pokémon (js/fork/radiant.js): "Radiant ..." with its radiant sheet
//   4. a Pokémon holding its form's item (js/fork/forms.js, the real equip): the form's name
//   5. the built bundle (js/app.min.js, made from tools/cache/app.js) has this file: index.html seals G
//      inside the bundle, so a run can't be driven there
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  async function open(file) {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(file + ': ' + e.message));
    await page.goto(BASE + '/' + file, { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.PlayedAs, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    return page;
  }
  /** A run as dex (opts.shiny), set up by `setup` in the page, ended by Quit run or a knockout: the end screen's rows. */
  const run = (page, dex, opts, setup, die) => page.evaluate(async ([dex, opts, setup, die]) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => r()));
    G.UI.hideAll(); G.Game.toUI(); G.Settings.set('lab', false);
    G.Game.startRun(null, { dex, shiny: !!opts.shiny });
    for (let i = 0; i < 200 && !(G.Game.player && G.Game.state === 'playing'); i++) await frame();
    G.Spawner.update = () => {};
    const pl = G.Game.player;
    if (setup) new Function('pl', setup)(pl);
    await new Promise(r => setTimeout(r, 3300));         // past the start countdown
    if (die) {
      G.EnemyMgr.clear();
      const e = new G.Enemy(G.Enemies.cast[0].list[0], pl.x + 6, pl.y, G.Enemies.scale(0));
      e.hp = e.maxHp = 1e7; e.spd = 0; e.dmg = 1e7; G.EnemyMgr.add(e);
      pl.god = false;
      for (let i = 0; i < 600 && !G.UI.isOpen('scr-over'); i++) { pl.invuln = 0; await frame(); }
    } else G.Game.quit();
    for (let i = 0; i < 300 && !G.UI.isOpen('scr-over'); i++) await frame();
    const rows = [...document.getElementById('over-stats').children].map(el => el.className || el.textContent.trim().slice(0, 20));
    const pa = document.querySelector('#over-stats .played-as'), cv = pa && pa.querySelector('canvas');
    return { open: G.UI.isOpen('scr-over'), rows, text: pa ? [...pa.children].map(c => c.textContent.trim()).join(' ') : null,
      sprite: !!cv && cv.width > 0, key: pa ? G.PlayedAs.of(pl).key : null };
  }, [dex, opts, setup ? setup.toString().replace(/^[^{]*{|}$/g, '') : '', !!die]);
  const back = page => page.evaluate(() => document.getElementById('btn-again').click());

  try {
    const page = await open('dev.html');
    await page.evaluate(() => { G.DB.grant(6, 't'); G.DB.save.partner = 6; G.DB.commit(); });

    console.log('1. A shiny Charizard, knocked out');
    let r = await run(page, 6, { shiny: true }, null, true);
    check(r.open && r.text === 'You played as Shiny Charizard' && r.sprite, 'the row names it with its sprite', r);
    check(r.rows[0] === 'played-as' && r.rows[1] === 'death-cause', 'first, above what knocked you out', r.rows);
    if (process.env.SHOTS) { await page.waitForTimeout(1500); await page.screenshot({ path: process.env.SHOTS + '/played-as.png' }); }   // SHOTS=<folder>: a picture of it
    await back(page);

    console.log('2. A Mega Charizard');
    r = await run(page, 6, {}, function (pl) { pl.megaKey = 'm6'; pl.mega = { mon: pl.mon, hp: 0 }; });
    check(r.text === 'You played as Mega X Charizard' && r.key === 'm6' && r.sprite, 'the Mega\'s name and sprite', r);
    await back(page);

    console.log('3. A radiant Pokémon');
    const rad = await page.evaluate(() => Object.keys(G.DEX_BY).map(Number).find(d => G.Radiant.has(d) && G.SPRITE_META[G.Radiant.key(d)]));
    if (rad) {
      const nm = await page.evaluate(d => { G.DB.grant(d, 't'); return G.DEX_BY[d].name; }, rad);
      r = await run(page, rad, {}, function (pl) { pl.radiant = true; pl.shiny = false; });
      check(r.text === 'You played as Radiant ' + nm && /\/r$/.test(String(r.key)) && r.sprite, 'Radiant ' + nm + ' with its radiant sheet', r);
      await back(page);
    } else check(false, 'a radiant Pokémon to test with');

    console.log('4. Holding a form\'s item');
    const form = await page.evaluate(() => {
      const f = Object.keys(G.FORM_ITEMS).map(Number).find(f => G.DEX_BY[f] && G.Items.BY['form' + f] && G.DEX_BY[G.FORM_ITEMS[f][0]]);
      G.DB.grant(G.FORM_ITEMS[f][0], 't');
      return { f, base: G.FORM_ITEMS[f][0], name: G.DEX_BY[f].name };
    });
    await page.evaluate(f => { window.__form = f; }, form.f);
    r = await run(page, form.base, {}, function (pl) { pl.equip('form' + window.__form); });
    check(r.text === 'You played as ' + form.name && r.key === form.f, 'the form\'s name (' + form.name + ') and sprite', r);
    await back(page);
    await page.context().close();

    console.log('5. The built bundle');
    const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
    const cache = path.join(root, 'tools', 'cache', 'app.js');
    const joined = fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : '';
    const fresh = fs.existsSync(cache) && fs.statSync(path.join(root, 'js', 'app.min.js')).mtimeMs >= fs.statSync(cache).mtimeMs;
    check(joined.includes('/* js/fork/played-as.js */') && joined.includes("G.PlayedAs = (() =>") && fresh,
      'js/app.min.js was built with js/fork/played-as.js in it (run node fork/build.cjs first)');

    check(!errs.length, 'no page errors', errs);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
