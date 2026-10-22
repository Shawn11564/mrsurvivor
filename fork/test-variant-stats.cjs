#!/usr/bin/env node
// Shiny and radiant stat rolls (js/fork/variant-stats.js), in headless Edge on dev.html, real runs:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-variant-stats.cjs [base-url]
//
// At the start of every run (normal and Lab) a shiny gets N of its 6 stats (HP, Attack, Sp. Atk,
// Defense, Sp. Def, Speed) +10 %, a radiant +20 %, picked at random; N by the Pokémon's rarity:
// Common 4, Uncommon 3, Rare 2, Epic 1, Legendary 1. The XP and coin extras are gone (rerolls stay, Lab).
//   1. A normal Pokémon: no roll. Its numbers are the baseline for 2.
//   2. Shiny Bulbasaur (Common): 4 different stats, each one +10 % against the baseline (max HP, damage
//      of physical / special moves, damage taken from physical / special hits, speed), the others ×1.
//   3. Count by rarity (Ivysaur 3, Raticate 2, Venusaur 1, Articuno 1) and radiant Arcanine: +20 %.
//   4. A new roll every run: 12 runs of shiny Bulbasaur don't all get the same 4.
//   5. The banner at the start says which (e.g. "Shiny: +10% HP, Attack, Defense, Speed").
//   6. Lab run, shiny: no XP or coin extra any more, still +1 reroll.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.VariantStats !== undefined, null, { timeout: 30000 }).catch(() => {});
    // A run with dex as 'normal' | 'shiny' | 'radiant': the roll, the banner and its numbers.
    const run = (dex, kind, lab = false) => page.evaluate(async ([dex, kind, lab]) => {
      const s = G.DB.save;
      s.owned[dex] = { at: Date.now() }; s.partner = dex; s.starter = s.starter || dex;
      s.pnat = Object.assign(s.pnat || {}, { [dex]: ['hardy', Date.now()] });
      s.shiny = s.shiny || {}; s.radiant = s.radiant || {}; s.radOff = s.radOff || {};
      delete s.shiny[dex]; delete s.radiant[dex];
      if (kind === 'shiny') s.shiny[dex] = { at: Date.now() };
      if (kind === 'radiant') { s.radiant[dex] = { at: Date.now() }; delete s.radOff[dex]; }
      s.partnerShiny = kind === 'shiny';
      if (G.ShinyPref && kind === 'shiny') G.ShinyPref.set(dex, true);
      G.Settings.set('lab', lab); G.DB.commit();
      G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
      const wait = f => new Promise(res => { const i = setInterval(() => { if (f()) { clearInterval(i); res(); } }, 20); });
      await wait(() => G.Game.state === 'playing');
      G.Spawner.update = () => {}; G.EnemyMgr.clear();
      const pl = G.Game.player, banner = G.Spawner.banner();
      // Damage taken from a physical and a special hit (same amount, no type), with invuln cleared.
      const taken = cat => { pl.god = false; pl.invuln = 0; pl.graceT = 0; const h = pl.hp = pl.maxHp; pl.hurt(10, null, false, cat); const d = h - pl.hp; pl.hp = pl.maxHp; return d; };
      const out = {
        kind: pl.radiant ? 'radiant' : pl.shiny ? 'shiny' : 'normal', roll: pl._vstats ? { k: pl._vstats.k, ids: pl._vstats.ids.slice() } : null,
        banner: banner ? banner.text : '', hp: pl.maxHp, phys: pl.atkFor({ cat: 'physical' }), spec: pl.atkFor({ cat: 'special' }),
        tp: taken('physical'), ts: taken('special'), spd: pl.spd, xp: pl.xpMul, coin: pl.coinMul, rr: pl.rerollBonus || 0
      };
      G.Game.quit();
      await wait(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await wait(() => G.Game.state === 'ui');
      return out;
    }, [dex, kind, lab]);

    console.log('1. A normal Pokémon');
    const base = await run(1, 'normal');
    check(base.kind === 'normal' && !base.roll, 'no roll', base);

    console.log('2. Shiny Bulbasaur (Common)');
    const sh = await run(1, 'shiny');
    const ratio = { hp: sh.hp / base.hp, atk: sh.phys / base.phys, satk: sh.spec / base.spec, def: base.tp / sh.tp, sdef: base.ts / sh.ts, spd: sh.spd / base.spd };
    const got = Object.keys(ratio).filter(k => Math.abs(ratio[k] - 1.1) < 0.02), same = Object.keys(ratio).filter(k => Math.abs(ratio[k] - 1) < 0.005);
    check(sh.roll && sh.roll.k === 0.1 && sh.roll.ids.length === 4 && new Set(sh.roll.ids).size === 4, 'a roll of 4 different stats at +10 %', sh.roll);
    check(sh.roll && got.sort().join() === sh.roll.ids.slice().sort().join() && got.length + same.length === 6,
      'exactly those 4 are +10 % (HP, damage, damage taken, speed measured), the others unchanged', { ratio, got, roll: sh.roll && sh.roll.ids });

    console.log('3. Count by rarity, and a radiant');
    for (const [dex, want, r] of [[2, 3, 'Uncommon'], [20, 2, 'Rare'], [3, 1, 'Epic'], [144, 1, 'Legendary']]) {
      const x = await run(dex, 'shiny');
      check(x.roll && x.roll.ids.length === want && x.roll.k === 0.1, `${r} (#${dex}): ${want}`, x.roll);
    }
    const rad = await run(59, 'radiant');
    const rr = await page.evaluate(() => G.DEX_BY[59].rarity);
    check(rad.kind === 'radiant' && rad.roll && rad.roll.k === 0.2 && rad.roll.ids.length === { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 }[rr], `radiant Arcanine (rarity ${rr}): +20 %`, rad.roll);

    console.log('4. A new roll every run');
    const sets = new Set();
    for (let i = 0; i < 12; i++) { const x = await run(1, 'shiny'); sets.add(x.roll.ids.slice().sort().join()); }
    check(sets.size > 1, `12 runs: ${sets.size} different rolls`, [...sets]);

    console.log('5. The banner');
    const names = { hp: 'HP', atk: 'Attack', satk: 'Sp. Atk', def: 'Defense', sdef: 'Sp. Def', spd: 'Speed' };
    check(/^Shiny: \+10%/.test(sh.banner) && sh.roll.ids.every(id => sh.banner.includes(names[id])), 'shiny: "Shiny: +10% ..." naming the 4', sh.banner);
    check(/^Radiant: \+20%/.test(rad.banner), 'radiant: "Radiant: +20% ..."', rad.banner);
    check(!base.banner || !/Shiny|Radiant/.test(base.banner), 'normal: none', base.banner);

    console.log('6. Lab: no XP or coin extra, rerolls stay');
    const labN = await run(1, 'normal', true), labS = await run(1, 'shiny', true);
    check(labS.xp === labN.xp && labS.coin === labN.coin, 'shiny in Lab: the same XP and coins as the normal one', { labN, labS });
    check(labS.rr === labN.rr + 1, 'and still one more card reroll', { normal: labN.rr, shiny: labS.rr });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll shiny / radiant stat checks passed');
  process.exit(failures ? 1 : 0);
})();
