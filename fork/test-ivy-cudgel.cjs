#!/usr/bin/env node
// Ogerpon's Ivy Cudgel takes the type of the mask it wears (TODO 122, a player's "type changes": the mask
// changed Ogerpon's types but not its Ivy Cudgel's). js/fork/forms.js cudgel(). Headless Edge on dev.html:
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-ivy-cudgel.cjs [base-url]
//
//   1. Ogerpon with Ivy Cudgel (its evolved Wood Hammer), no mask: Grass, the leaf look.
//   2. Each mask (Wellspring, Hearthflame, Cornerstone): Water, Fire, Rock, drawn in that type's look, and its
//      hits get that type's effectiveness (Water on a Fire-type enemy: super effective, was Grass's not very effective).
//   3. The mask off: Grass and the leaves again.
//   4. A Wood Hammer that evolves while the mask is on becomes Ivy Cudgel of the mask's type.
//   5. Not Ogerpon: another Pokémon's Ivy Cudgel stays Grass with its form item on (Origin Giratina).
const { chromium, pastStart, BASE: DEF } = require('./pw.cjs');
const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || DEF;

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
    await page.waitForFunction(() => G.DB.save && G.Forms);
    await page.evaluate(() => {
      window.__sleep = ms => new Promise(r => setTimeout(r, ms));
      window.__run = async dex => {
        if (G.Game.state !== 'ui') { G.UI.hideAll(); G.Game.quit(); await __sleep(300); }
        const s = G.DB.save; s.owned[dex] = { at: 1 }; s.partner = s.starter = dex; G.DB.commit();
        G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex, shiny: false });
        const t0 = Date.now();
        while (G.Game.state !== 'playing' && Date.now() - t0 < 15000) await __sleep(50);
        const pl = G.Game.player;
        pl.god = true; G.Spawner.update = () => {}; G.EnemyMgr.clear();
        pl.moves.length = 0; pl.slots.length = 0; pl.addMove('wood-hammer'); pl.active = 0;
        return pl;
      };
      // What a hit of the move does to a Fire-type enemy (the game's own type chart and weather).
      window.__onFire = m => G.Types.mult(m.type, ['fire']);
      window.__state = m => ({ name: m.name, type: m.type, leaf: !!(m.look && m.look.proj === 'leaf'),
                               vfx: G.VFX.forMove(m).proj || null, fire: __onFire(m) });
    });

    console.log('1-3. Ogerpon and its masks');
    const r = await page.evaluate(async () => {
      const pl = await __run(1017), m = pl.moves[0];
      G.Moves.evolve(m);
      const out = { none: __state(m) };
      for (const [f, k] of [[1595, 'wellspring'], [1596, 'hearthflame'], [1597, 'cornerstone']]) {
        pl.equip('form' + f); await __sleep(50);
        out[k] = Object.assign(__state(m), { form: pl.form && pl.form.f, types: pl.mon.types.join('/') });
        pl.equip(null); await __sleep(50);
        out[k + 'Off'] = __state(m);
      }
      return out;
    });
    check(r.none.name === 'Ivy Cudgel' && r.none.type === 'grass' && r.none.leaf, 'no mask: Ivy Cudgel is Grass, with leaves', r.none);
    for (const [k, t] of [['wellspring', 'water'], ['hearthflame', 'fire'], ['cornerstone', 'rock']]) {
      check(r[k].form && r[k].type === t && !r[k].leaf, `${k} mask: Ivy Cudgel is ${t}, without the leaves`, r[k]);
      check(r[k + 'Off'].type === 'grass' && r[k + 'Off'].leaf, `${k} mask off: Grass and the leaves again`, r[k + 'Off']);
    }
    check(r.wellspring.fire > 1 && r.none.fire < 1, 'Wellspring\'s Ivy Cudgel is super effective on a Fire-type (Grass: not very effective)', { mask: r.wellspring.fire, none: r.none.fire });

    console.log('4. Evolving under a mask');
    const e = await page.evaluate(async () => {
      const pl = await __run(1017), m = pl.moves[0];
      pl.equip('form1596'); await __sleep(50);
      const before = __state(m);
      G.Moves.evolve(m); await __sleep(600);
      return { before, after: __state(m) };
    });
    check(e.before.type === 'grass' && e.after.name === 'Ivy Cudgel' && e.after.type === 'fire', 'Wood Hammer stays Grass; evolved under the Hearthflame Mask it is a Fire Ivy Cudgel', e);

    console.log('5. Not Ogerpon');
    const g = await page.evaluate(async () => {
      const pl = await __run(487), m = pl.moves[0];
      G.Moves.evolve(m);
      pl.equip('form1567'); await __sleep(600);
      return Object.assign(__state(m), { form: pl.form && pl.form.f, types: pl.mon.types.join('/') });
    });
    check(g.form === 1567 && g.type === 'grass', 'Origin Giratina\'s Ivy Cudgel stays Grass', g);
    check(!errors.length, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
