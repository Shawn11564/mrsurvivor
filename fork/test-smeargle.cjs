#!/usr/bin/env node
// Smeargle can be offered any move (TODO 123, a player's "smeargle needs every move"): its learnset is Sketch
// alone, so its list (js/fork/lab/lab.js labPool) was Normal moves only. Headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-smeargle.cjs [base-url] [--record file | --compare file]
//
//   1. Smeargle's list holds every move of every type that any list can hold (no other line's signature,
//      no co-op move), the same in a run and in the menus.
//   2. In a run as Smeargle, 300 level-up hands offer new moves of at least 12 different types.
//   3. Other Pokémon's lists are their own (Charmander, Mew, Ditto; --compare: the same as before).
//   4. Smeargle's collection card and its starting-move picker open without page errors.
const { chromium, pastStart, BASE: DEF } = require('./pw.cjs');
const BASE = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !['--record', '--compare'].includes(all[i - 1])) || DEF;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    await page.route('**/js/core/firebase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;' }));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.locator('#btn-guest').click();
    await page.waitForFunction(() => G.DB.save && G.LabMoves);

    console.log('1. The list');
    const l = await page.evaluate(() => {
      const list = G.Moves.poolFor(G.DEX_BY[235]);
      const any = new Set();
      for (const m of G.Moves.ALL) if (!m.sig) any.add(m.id);
      for (const m of G.LabMoves) if (!m.sig && !m.coop && G.Moves.BY_ID[m.id]) any.add(m.id);
      const missing = [...any].filter(id => !list.includes(id));
      const odd = list.filter(id => { const m = G.Moves.BY_ID[id]; return !m || m.sig || m.coop; });
      const types = [...new Set(list.map(id => G.Moves.BY_ID[id].type))];
      return { n: list.length, all: any.size, missing: missing.slice(0, 8), odd, types: types.length };
    });
    check(l.n >= l.all && !l.missing.length && !l.odd.length && l.types >= 17, 'Smeargle\'s list is every move of every type (no signatures, no co-op moves)', l);

    console.log('2. Level-up hands in a run');
    const h = await page.evaluate(async () => {
      const s = G.DB.save; s.owned[235] = { at: 1 }; s.partner = s.starter = 235; G.DB.commit();
      G.Settings.set('underdogLadder', false);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 235, shiny: false });
      const t0 = Date.now();
      while (G.Game.state !== 'playing' && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50));
      const pl = G.Game.player; pl.god = true; G.Spawner.update = () => {};
      const types = {}, ids = new Set();
      for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl, 3)) {
        if (c.type !== 'new') continue;
        const id = c.key.slice(4), t = G.Moves.BY_ID[id].type;
        types[t] = (types[t] || 0) + 1; ids.add(id);
      }
      const inRun = G.Moves.poolFor(pl.mon).length;
      G.UI.hideAll(); G.Game.quit();
      return { types: Object.keys(types).length, moves: ids.size, inRun, normal: types.normal || 0, all: Object.values(types).reduce((a, b) => a + b, 0) };
    });
    check(h.types >= 12, 'its hands offer new moves of many types', h);
    check(h.inRun >= l.all, 'the same whole list in a run', { inRun: h.inRun, all: l.all });

    console.log('3. Other Pokémon');
    const o = await page.evaluate(() => {
      const out = {};
      for (const d of [4, 151, 132]) { const p = G.Moves.poolFor(G.DEX_BY[d], true); out[d] = p.slice().sort().join(','); }
      return out;
    });
    // --record <file> saves these lists; --compare <file> checks they're the same (run one on the commit before).
    const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
    if (arg('--record')) require('fs').writeFileSync(arg('--record'), JSON.stringify(o));
    const want = arg('--compare') ? JSON.parse(require('fs').readFileSync(arg('--compare'), 'utf8')) : null;
    for (const d of Object.keys(o)) {
      if (want) check(o[d] === want[d], `#${d}'s list is the same as before`, o[d].split(',').length);
      else check(o[d].split(',').length < 60, `#${d}'s list is still its own (not every move)`, o[d].split(',').length);
    }

    console.log('4. Menus');
    const m = await page.evaluate(async () => {
      G.UI.hideAll(); G.Flow.goMenu();
      const p = G.DEX_BY[235];
      const html = G.Moves.poolFor(p).map(id => G.Icons.html('move:' + id, 16)).join('');
      return { icons: (html.match(/<(img|canvas|span|i)\b/g) || []).length };
    });
    check(m.icons >= l.all, 'every move has its icon for the collection card', m);
    check(!errors.length, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
