#!/usr/bin/env node
// The move dex (js/fork/move-dex.js): the collection screen's Pokémon / Moves switch, in headless
// Edge, as a guest, through real clicks:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-move-dex.cjs [base-url]
//
//   1. index.html (the built bundle players get): the collection has the switch, and Moves lists
//      the game's moves.
//   2. dev.html, even with the old Lab setting off: one list of every move, the game's and the fork's, with no Lab
//      chip or LAB tag (every run has them all since 2026-10-25).
//      Each row says what the move evolves into ("→ Inferno"), the same as its card (G.Moves.evoInfo at max level);
//      a move that doesn't evolve says nothing (2026-10-24, TODO 83).
//   3. Filters: search, type, category, and sorting by damage.
//   4. A move's card (Ember): its Lv.1 and max-level numbers are G.Moves.instance's, one line per
//      upgrade, its evolution, who learns it (its learners, then other Fire Pokémon); a fork move names its learners.
//   5. Pokémon brings the dex back; everything shown is English (no Spanish from the data).
//   6. A phone (390 px): no sideways scroll, and tapping a move scrolls its card into view.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const SPANISH = /daño|proyectil|recarga|perforaci|enemig|alcance|duraci|Cualquier|Todos los|Físic|Especial\b|Estado\b/i;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const open = async (path, w, h) => {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    page.errs = [];
    page.on('pageerror', e => page.errs.push(String(e)));
    await page.goto(BASE + path, { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await page.isVisible('#scr-starters')) { await page.locator('#starter-grid .cell').first().click(); await page.click('#starter-ok'); }
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await page.click('#scr-menu [data-go=dex]');
    await page.waitForSelector('#scr-dex', { state: 'visible' });
    return page;
  };
  const rows = page => page.$$eval('#mdex-list .mdex-row', els => els.map(e => ({ id: e.dataset.move, text: e.textContent.replace(/\s+/g, ' ').trim(), lab: !!e.querySelector('.lab-badge') })));
  try {
    console.log('1. The built page');
    const built = await open('/index.html', 1280, 800);
    check(await built.isVisible('.mdex-switch [data-v=moves]'), 'the collection has the Moves switch');
    await built.click('.mdex-switch [data-v=moves]');
    const bRows = await rows(built);
    check(bRows.length >= 100 && !(await built.isVisible('#dex-grid')), 'Moves lists the moves and hides the Pokémon grid', bRows.length);
    const bEvo = await built.$$eval('#mdex-list .mdex-row .mdex-evo', els => els.map(e => e.textContent.trim()).filter(t => /^→ \S/.test(t)).length);
    check(bEvo > 30, 'its rows say what the moves evolve into', bEvo);
    check(!built.errs.length, 'no page errors on index.html', built.errs.slice(0, 3));
    await built.context().close();

    const page = await open('/dev.html', 1280, 800);
    await page.evaluate(() => G.Settings.set('lab', false));
    await page.click('.mdex-switch [data-v=moves]');
    console.log('2. All the moves');
    const want = await page.evaluate(() => ({ all: G.Moves.ALL.map(m => m.id).sort(), labOnly: Object.values(G.Moves.BY_ID).filter(m => m.lab && !G.Moves.ALL.includes(m)).map(m => m.id).sort() }));
    let r = await rows(page);
    const every = want.all.concat(want.labOnly).sort();
    check(JSON.stringify(r.map(x => x.id).sort()) === JSON.stringify(every), 'one list: the game\'s moves and the fork\'s, even with the old Lab setting off', { shown: r.length, want: every.length });
    const tags = await page.evaluate(() => [...document.querySelectorAll('#mdex .chip, #mdex-list .mdex-row')].filter(e => /\bLAB\b|\bLab\b/.test(e.textContent) || e.querySelector('.lab-badge')).length);
    check(!r.some(x => x.lab) && !tags, 'no Lab chip and no row tagged LAB', tags);

    // Each row: what it evolves into, as G.Moves.evoInfo says at max level (and the card), nothing if it doesn't.
    const evo = await page.evaluate(() => {
      const want = id => { try { const d = G.Moves.BY_ID[id], e = G.Moves.evoInfo(G.Moves.instance(id, d.maxLvl || 1), null); return e ? G.T(e.name, 'move') : null; } catch (err) { return null; } };
      const out = { rows: 0, with: 0, bad: [] };
      for (const el of document.querySelectorAll('#mdex-list .mdex-row')) {
        const id = el.dataset.move, w = want(id), e = el.querySelector('.mdex-evo'), got = e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
        out.rows++;
        if (w) out.with++;
        if (w ? got !== '→ ' + w : got) out.bad.push({ id, want: w, got });
      }
      return out;
    });
    check(evo.rows > 100 && evo.with > 50 && !evo.bad.length, `each row says what its move evolves into (${evo.with} of ${evo.rows} evolve), nothing if it doesn't`, evo.bad.slice(0, 5));

    console.log('3. Filters');
    await page.fill('#mdex-q', 'flame');
    await page.waitForTimeout(300);
    r = await rows(page);
    check(r.length > 0 && r.every(x => /flame/i.test(x.text)), 'search "flame"', r.map(x => x.id));
    await page.fill('#mdex-q', ''); await page.waitForTimeout(300);
    await page.selectOption('#mdex-type', 'fire');
    r = await rows(page);
    const fireOk = await page.evaluate(ids => ids.every(id => G.Moves.BY_ID[id].type === 'fire'), r.map(x => x.id));
    check(r.length > 3 && fireOk, 'type: Fire', r.length);
    await page.click('#mdex-chips .chip:has-text("Physical")');
    r = await rows(page);
    const physOk = await page.evaluate(ids => ids.every(id => G.Moves.BY_ID[id].cat === 'physical' && G.Moves.BY_ID[id].type === 'fire'), r.map(x => x.id));
    check(r.length > 0 && physOk, 'Fire + Physical', r.map(x => x.id));
    await page.click('#mdex-chips .chip:has-text("All")');
    await page.selectOption('#mdex-type', '');
    await page.click('#mdex-sort .chip:has-text("Damage")');
    r = await rows(page);
    const dm = await page.evaluate(ids => ids.map(id => G.Moves.BY_ID[id].dmg || 0), r.map(x => x.id));
    check(dm.every((v, i) => !i || dm[i - 1] >= v), 'sorted by damage, highest first', dm.slice(0, 5));

    console.log('4. A move\'s card');
    await page.fill('#mdex-q', 'ember'); await page.waitForTimeout(300);
    await page.click('#mdex-list .mdex-row[data-move=ember]');
    const card = await page.evaluate(() => {
      const d = document.getElementById('mdex-detail'), lo = G.Moves.instance('ember', 1), def = G.Moves.BY_ID.ember, hi = G.Moves.instance('ember', def.maxLvl);
      const dmgRow = [...d.querySelectorAll('.mdex-stats tr')].find(tr => /Damage/.test(tr.textContent));
      return { text: d.textContent.replace(/\s+/g, ' '), dmg: dmgRow && [...dmgRow.cells].slice(1).map(c => c.textContent), want: [String(Math.round(lo.dmg)), String(Math.round(hi.dmg))],
               ups: d.querySelectorAll('.mdex-ups li').length, wantUps: def.ups.length, evo: G.T(G.Moves.EVO.ember[0], 'move') };
    });
    check(JSON.stringify(card.dmg) === JSON.stringify(card.want), 'Lv.1 and max-level damage are the game\'s', card.dmg);
    check(card.ups === card.wantUps, 'one line per upgrade', card.ups);
    check(card.text.includes(card.evo) && /Evolves/.test(card.text), 'its evolution: ' + card.evo);
    const rowEvo = await page.textContent('#mdex-list .mdex-row[data-move=ember] .mdex-evo').catch(() => '');
    check(rowEvo.includes(card.evo), 'and its row says the same', rowEvo);
    check(/Learned by \d+ Pokémon/.test(card.text) && /Other Fire-type Pokémon can get it too/.test(card.text) && !/normal runs|\bLab\b|\bLAB\b/.test(card.text),
      'who learns it: its learners, then other Fire-type Pokémon (no "normal runs", no Lab tag)', card.text.slice(-160));
    await page.fill('#mdex-q', 'swift'); await page.waitForTimeout(300);
    await page.click('#mdex-list .mdex-row[data-move=swift]');
    const sw = await page.textContent('#mdex-detail');
    check(!/\bLAB\b|\bLab\b/.test(sw) && /Learned by \d+ Pokémon/.test(sw), 'a move the fork added names its learners, with no Lab tag', sw.replace(/\s+/g, ' ').slice(-140));
    await page.fill('#mdex-q', ''); await page.waitForTimeout(300);

    console.log('5. Back to Pokémon; English');
    // Every text node on its own (textContent runs "Name" + "Special" into "eSpecial").
    const shownText = await page.evaluate(() => { const w = document.createTreeWalker(document.getElementById('mdex'), NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode.nodeValue); return out.join(' | '); });
    const spanish = (shownText.match(new RegExp(SPANISH.source, 'gi')) || []).slice(0, 5);
    check(!spanish.length, 'no Spanish in the move dex', spanish);
    await page.click('.mdex-switch [data-v=mons]');
    check(await page.isVisible('#dex-grid') && !(await page.isVisible('#mdex')), 'Pokémon brings the dex back');
    check(!page.errs.length, 'no page errors on dev.html', page.errs.slice(0, 3));
    await page.context().close();

    console.log('6. A phone');
    const phone = await open('/dev.html', 390, 800);
    await phone.click('.mdex-switch [data-v=moves]');
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(wide <= 0, 'no sideways scroll at 390 px', wide);
    await phone.click('#mdex-list .mdex-row:nth-child(6)');
    await phone.waitForTimeout(900);
    const top = await phone.evaluate(() => document.getElementById('mdex-detail').getBoundingClientRect().top);
    check(top >= -2 && top < 800, 'tapping a move scrolls its card into view', Math.round(top));
    await phone.context().close();
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll move dex checks passed');
  process.exit(failures ? 1 : 0);
})();
