#!/usr/bin/env node
// The fork's extra species and forms (js/fork/extra-dex.js, data from fork/fetch-extra-dex.py), in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-extra-dex.cjs [base-url]
//
//   1. dev.html: every row of js/fork/extra-dex-data.js is in G.DEX next to its species, with its sprite geometry,
//      ability slots, learnset and family; every sheet it names loads (normal and shiny).
//   2. They are real Pokémon: in the gacha banner of the generation that introduced them, with run abilities and
//      TMs; evolutions follow the games (Pikachu -> Raichu or Alolan Raichu, Perrserker only from Galarian Meowth).
//   3. The collection: searching "26" shows Raichu and Alolan Raichu, both as Nº 026; the card says Nº 026.
//   4. Runs as Alolan Raichu, Miraidon and Origin Giratina play without errors and draw their own sheets;
//      Galarian Meowth evolves into Perrserker mid-run.
//   5. The built index.html: the collection counts them and finds them (G is sealed there, so through the page).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const open = async file => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.errs = []; page.on('pageerror', e => page.errs.push(String(e)));
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.goto(BASE + file, { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    return page;
  };
  try {
    const page = await open('/dev.html');
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.Game && G.LabGrowth && G.LabData, null, { timeout: 30000 });

    console.log('1. Data');
    const data = await page.evaluate(() => {
      const rows = G.FORK_DEX, bad = [];
      for (const e of rows) {
        const i = G.DEX.indexOf(e), prev = G.DEX[i - 1];
        if (G.DEX_BY[e.dex] !== e) bad.push(e.dex + ' not in G.DEX_BY');
        if (!G.SPRITE_META[e.dex]) bad.push(e.dex + ' no sprite meta');
        if (!G.DEX_ABIL[e.dex] || !G.DEX_ABIL[e.dex][0]) bad.push(e.dex + ' no ability slots');
        if (!G.LabData.learn[e.dex] || !G.LabData.abil[e.dex]) bad.push(e.dex + ' no learnset or run abilities');
        if (e.base && G.LabData.fam[e.dex] !== G.LabData.fam[e.base]) bad.push(e.dex + ' not in its species\' family');
        if (i < 1 || G.dexNo(prev) > G.dexNo(e) || (G.DEX[i + 1] && G.dexNo(G.DEX[i + 1]) < G.dexNo(e))) bad.push(e.dex + ' out of order');
      }
      return { n: rows.length, total: G.DEX.length, forms: rows.filter(e => e.base).length, bad,
        names: [1008, 1003, 999, 870, 837, 1503, 1567].map(d => G.DEX_BY[d] && G.DEX_BY[d].name) };
    });
    check(data.n >= 102 && data.total === 966 + data.n, 'all of them are in the dex', { n: data.n, total: data.total, forms: data.forms });
    check(!data.bad.length, 'each with sprites, abilities, learnset, family, next to its species', data.bad.slice(0, 8));
    check(data.names.join() === 'Miraidon,Ting-Lu,Gimmighoul,Falinks,Rolycoly,Alolan Raichu,Origin Giratina', 'names', data.names);

    const sheets = await page.evaluate(async () => {
      const urls = [];
      for (const e of G.FORK_DEX) {
        const m = G.SPRITE_META[e.dex];
        for (const a of Object.keys(m.a)) urls.push(`assets/pokemon/${e.dex}/${a}.png`);
        if (m.sh) for (const a of Object.keys(m.a)) if (!(m.sm || []).includes(a)) urls.push(`assets/pokemon/${e.dex}/s/${a}.png`);
      }
      const load = u => new Promise(ok => { const im = new Image(); im.onload = () => ok(im.width > 0 ? null : u); im.onerror = () => ok(u); im.src = u; });
      const bad = [];
      for (let i = 0; i < urls.length; i += 40) bad.push(...(await Promise.all(urls.slice(i, i + 40).map(load))).filter(Boolean));
      return { n: urls.length, bad };
    });
    check(sheets.n > 1000 && !sheets.bad.length, 'every sheet they name loads (normal and shiny)', { n: sheets.n, bad: sheets.bad.slice(0, 5) });

    console.log('2. Gacha, abilities, TMs, evolutions');
    const sys = await page.evaluate(() => {
      const inPool = (d) => { const p = G.DEX_BY[d]; return G.Gacha.pool(p.rarity, p.gen).some(x => x.dex === d); };
      const tg = d => G.LabGrowth.targets(d).map(t => t[0]);
      return {
        pools: [1503, 1519, 1541, 1553, 1008, 1003, 999, 870, 837, 1567].filter(d => !inPool(d)),
        abil: G.Mons.abilityOf(1503).id, labAbil: G.LabData.abil[1503],
        tm: G.TM_OF(1503).length, tmBase: G.TM_OF(26).length,
        pool: G.Moves.poolFor(G.DEX_BY[1503], true).map(id => G.Moves.BY_ID[id].type),
        pika: tg(25), meowth: tg(52), gmeowth: tg(1519), rockruff: tg(744), wooper: tg(194), pwooper: tg(1556)
      };
    });
    check(!sys.pools.length, 'in their generation\'s banner at their rarity', sys.pools);
    check(sys.abil === 'surge-surfer' && /surge-surfer/.test(sys.labAbil), 'Alolan Raichu has its own ability', [sys.abil, sys.labAbil]);
    check(sys.tm > 5, 'and TMs to learn', [sys.tm, sys.tmBase]);
    check(sys.pool.includes('psychic') && sys.pool.includes('electric'), 'and Psychic and Electric moves in its pool', sys.pool);
    check(sys.pika.includes(26) && sys.pika.includes(1503), 'Pikachu evolves into Raichu or Alolan Raichu', sys.pika);
    check(!sys.meowth.includes(863) && sys.gmeowth.includes(863), 'Perrserker only from Galarian Meowth', [sys.meowth, sys.gmeowth]);
    check([745, 1587, 1588].every(d => sys.rockruff.includes(d)), 'Rockruff: all three Lycanroc', sys.rockruff);
    check(!sys.wooper.includes(980) && sys.pwooper.includes(980), 'Clodsire only from Paldean Wooper', [sys.wooper, sys.pwooper]);

    console.log('3. Collection');
    await page.evaluate(() => { const s = G.DB.save; for (const d of [26, 1503, 1008, 1567, 1519]) s.owned[d] = s.owned[d] || { at: Date.now() }; s.partner = 1503; G.DB.commit(); G.UI.hideAll(); G.Flow.goMenu(); });
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await page.click('#scr-menu [data-go="dex"]');
    await page.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    await page.fill('#dex-q', '26');
    await page.waitForFunction(() => document.querySelectorAll('#dex-grid .cell').length === 2, null, { timeout: 5000 }).catch(() => {});
    const cells = await page.$$eval('#dex-grid .cell', cs => cs.map(c => [c.dataset.dex, c.querySelector('.no').textContent.trim()]));
    check(JSON.stringify(cells) === '[["26","026"],["1503","026"]]', '"26" finds Raichu and Alolan Raichu, both Nº 026', cells);
    await page.click('#dex-grid .cell[data-dex="1503"]');
    await page.waitForFunction(() => /Alolan Raichu/.test(document.getElementById('scr-dex').textContent) && /N(º|o.) 026/.test(document.getElementById('scr-dex').textContent), null, { timeout: 5000 })
      .then(() => check(true, 'its card: Alolan Raichu, Nº 026'), () => check(false, 'its card: Alolan Raichu, Nº 026'));

    console.log('4. Runs');
    for (const [dex, name] of [[1503, 'Alolan Raichu'], [1008, 'Miraidon'], [1567, 'Origin Giratina']]) {
      const r = await page.evaluate(async d => {
        const wait = async (f, ms = 20000) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 50)); } return true; };
        if (G.Game.state === 'playing') { G.Game.quit(); await wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await wait(() => G.Game.state === 'ui'); }
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: d, shiny: false });
        await wait(() => G.Game.state === 'playing');
        const pl = G.Game.player; pl.god = true; pl.xpMul = 0;
        await new Promise(r => setTimeout(r, 4000));
        return { dex: pl.dex, name: pl.mon && pl.mon.name, moves: (pl.moves || []).map(m => m.id), key: pl.anim && (pl.anim.dex || pl.anim.key), state: G.Game.state, t: +G.Game.st.time.toFixed(1) };
      }, dex);
      check(r.dex === dex && r.name === name && r.moves.length > 0 && String(r.key) === String(dex) && r.t >= 2, `a run as ${name}: its own sheets and moves`, r);
    }
    const evo = await page.evaluate(async () => {
      const wait = async (f, ms = 20000) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 50)); } return true; };
      G.Game.quit(); await wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await wait(() => G.Game.state === 'ui');
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 1519, shiny: false });
      await wait(() => G.Game.state === 'playing');
      const pl = G.Game.player; pl.god = true; pl.xpMul = 0;
      const before = pl.dex;
      G.LabGrowth.evolveTo(pl, 863);
      await new Promise(r => setTimeout(r, 1500));
      return { before, after: pl.dex, name: pl.mon.name, key: pl.anim && (pl.anim.dex || pl.anim.key) };
    });
    check(evo.before === 1519 && evo.after === 863 && evo.name === 'Perrserker', 'Galarian Meowth evolves into Perrserker in a run', evo);
    check(!page.errs.length, 'no page errors on dev.html', page.errs.slice(0, 3));
    await page.evaluate(() => { if (G.Game.state === 'playing') G.Game.quit(); });

    console.log('5. Built index.html');
    const built = await open('/index.html');
    await built.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await built.isVisible('#scr-starters')) { await built.click('#starter-grid .cell'); await built.click('#starter-ok'); }
    await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await built.click('#scr-menu [data-go="dex"]');
    await built.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    const total = await built.$eval('#dex-total', e => e.textContent);
    check(/\/ 1068$/.test(total.trim()), 'the collection counts them', total);
    await built.fill('#dex-q', '1008');
    await built.waitForFunction(() => document.querySelectorAll('#dex-grid .cell').length === 1, null, { timeout: 5000 }).catch(() => {});
    const mira = await built.$$eval('#dex-grid .cell', cs => cs.map(c => [c.dataset.dex, c.querySelector('.no').textContent.trim()]));
    check(JSON.stringify(mira) === '[["1008","1008"]]', 'and finds Miraidon', mira);
    await built.fill('#dex-q', '128');
    await built.waitForFunction(() => document.querySelectorAll('#dex-grid .cell').length === 4, null, { timeout: 5000 }).catch(() => {});
    const tauros = await built.$$eval('#dex-grid .cell', cs => cs.map(c => c.dataset.dex));
    check(tauros.join() === '128,1553,1554,1555', 'Tauros and its three Paldean breeds', tauros);
    check(!built.errs.length, 'no page errors on index.html', built.errs.slice(0, 3));
  } catch (e) {
    console.log('  FAIL ' + (e.stack || e));
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
