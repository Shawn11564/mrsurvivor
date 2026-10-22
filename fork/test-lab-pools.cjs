#!/usr/bin/env node
// What a Pokémon can learn, in normal and Lab runs (js/fork/lab/lab.js poolFor), in headless Edge on dev.html,
// as a guest:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-lab-pools.cjs [base-url]
//
//   1. `natural` reaches upstream's poolFor through Lab's wrapper (plan D1): G.Mons.natural ("does it know
//      this without a TM?") is false for a TM it was taught, so Kecleon's "already knows it" is right.
//   2. Lab lists don't depend on the nature (plan D10): every species' Lab list is the same whether the
//      first one asked for is an Adamant copy or a Modest one (two page loads, the list is cached per
//      species), and a real Lab run with a Modest partner lists in the pause menu what the picker lists.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra).slice(0, 400) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    const open = async () => {
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
      await pastStart(page, '#btn-guest, #scr-menu');     // a guest save from an earlier page comes back (guest-save.js)
      if (await page.$eval('#btn-guest', e => e.getClientRects().length > 0).catch(() => false)) await page.$eval('#btn-guest', e => e.click());
      await page.waitForFunction(() => G.DB.save && G.MenuUI && G.Lab, null, { timeout: 30000 });
      return page;
    };

    console.log('1. natural goes through');
    let page = await open();
    const nat = await page.evaluate(() => {
      const dex = 150, s = G.DB.save;                  // Mewtwo: Shadow Ball by TM (upstream's example)
      const tm = G.TM_OF(dex).find(id => G.Moves.BY_ID[id] && !G.Moves.poolFor(G.DEX_BY[dex], true).includes(id));
      s.ptm = s.ptm || {}; s.ptm[dex] = [tm];
      return { tm, natural: G.Mons.natural(dex, tm), inPool: G.Moves.poolFor(G.DEX_BY[dex]).includes(tm), inNatural: G.Moves.poolFor(G.DEX_BY[dex], true).includes(tm) };
    });
    check(!!nat.tm && nat.inPool, 'a taught TM is in its (normal) pool', nat);
    check(!nat.inNatural && !nat.natural, 'poolFor(mon, true) leaves it out, so G.Mons.natural says it needed a TM', nat);
    await page.close();

    console.log('2. Lab lists don\'t depend on the nature');
    // Every species with a Lab list, asked first with a copy that has `nature` (G.Mons.monFor, the run's copy).
    const lists = async nature => {
      const p = await open();
      const out = await p.evaluate(nature => {
        const s = G.DB.save, r = {};
        for (const mon of G.DEX) { s.pnat = s.pnat || {}; s.pnat[mon.dex] = [nature, Date.now()]; r[mon.dex] = G.Lab.poolFor(G.Mons.monFor(mon.dex)).sort().join(','); }
        return r;
      }, nature);
      await p.close();
      return out;
    };
    const a = await lists('adamant'), m = await lists('modest');
    const differ = Object.keys(a).filter(d => a[d] !== m[d]);
    check(Object.keys(a).length > 500 && differ.length === 0, `${Object.keys(a).length} species: the same Lab list with an Adamant or a Modest nature (${differ.length} differ)`, differ.slice(0, 20));

    // A real Lab run with a Modest partner: the pause list is the picker's list (G.DEX_BY).
    page = await open();
    const run = await page.evaluate(async () => {
      const wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      const dex = 4, s = G.DB.save;
      s.owned[dex] = { at: Date.now() }; s.partner = dex; s.starter = dex; s.pnat = { [dex]: ['modest', Date.now()] }; G.DB.commit();
      G.Settings.set('lab', true);
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      await wait(() => G.Game.state === 'playing' && G.Game.player);
      const pl = G.Game.player, inRun = G.Moves.poolFor(pl.mon).sort().join(',');
      G.Game.quit();
      G.Settings.set('lab', false);
      return { nature: pl.mon.nature, inRun, picker: G.Lab.poolFor(G.DEX_BY[dex]).sort().join(',') };
    });
    check(run.nature === 'modest' && run.inRun === run.picker, 'a Lab run with a Modest Charmander lists what the picker lists', run);
    await page.close();

    console.log('3. Taught TMs in Lab runs (plan D4)');
    page = await open();
    const tm = await page.evaluate(async () => {
      const wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      const dex = 4, s = G.DB.save, out = {};
      s.owned[dex] = { at: Date.now() }; s.partner = dex; s.starter = dex; s.pupg = { [dex]: { start: 1 } };
      // A TM Charmander can learn that its Lab list doesn't have (and that isn't a booster, so it can start with it).
      const id = out.id = G.TM_OF(dex).find(id => G.Moves.BY_ID[id] && G.Moves.BY_ID[id].kind !== 'buff' && !G.Lab.poolFor(G.DEX_BY[dex], true).includes(id));
      s.ptm = { [dex]: [id] }; G.DB.commit();
      G.Settings.set('lab', true);
      G.UI.hideAll(); G.Flow.goMenu();
      out.picker = G.startChoices(dex).includes(id);                     // the Lab start picks (menus, Lab on)
      G.Game.startRun();
      await wait(() => G.Game.state === 'playing' && G.Game.player);
      const pl = G.Game.player;
      out.lab = G.Lab.active;
      out.pool = G.Moves.poolFor(pl.mon).includes(id);
      let seen = 0;
      for (let i = 0; i < 400; i++) if (G.LevelUp.offer(pl).some(c => c.key === 'new:' + id)) seen++;
      out.offered = seen;
      G.Game.togglePause();
      const span = document.querySelector(`#pause-sum .lab-pool [data-move="${id}"]`);
      out.pause = span ? span.title : null;
      G.UI.hide('scr-pause'); G.Game.togglePause();
      // Evolving into Charmeleon: still there (it was taught to Charmander).
      pl.level = 99;
      const c = G.LevelUp.offer(pl).find(c => c.key === 'grow:5');
      if (c) c.apply(pl);
      out.evolved = pl.dex === 5 && G.Moves.poolFor(pl.mon).includes(id);
      G.Game.quit();
      // Starting a Lab run with it (Upgrades → Starting move, the Lab pick).
      s.pstartLab = { [dex]: id }; G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      await wait(() => G.Game.state === 'playing' && G.Game.player);
      out.first = G.Game.player.moves[0].id;
      G.Game.quit();
      G.Settings.set('lab', false);
      return out;
    });
    check(!!tm.id && tm.lab && tm.pool, "a taught TM is in the Lab run's list", tm);
    check(tm.offered > 0, `the level-up cards offer it (${tm.offered} hands of 400)`, tm);
    check(!!tm.pause && /\(TM\)/.test(tm.pause), 'the pause menu lists it, marked TM', tm);
    check(tm.evolved, 'it stays in the list after evolving into Charmeleon', tm);
    check(tm.picker && tm.first === tm.id, 'the Lab start picks have it, and a Lab run starts with it', tm);
    await page.close();

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab pool checks passed');
  process.exit(failures ? 1 : 0);
})();
