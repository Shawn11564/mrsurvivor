#!/usr/bin/env node
// One ability per run (js/fork/lab/abilities.js setAbility, plan D2 "resolver A"), in headless Edge on
// dev.html, as a guest, with real runs (G.Game.startRun) and real hits:
//
//   node fork/serve.cjs                 (in the repo root, another terminal)
//   node fork/test-lab-abilities.cjs [base-url]
//
//   1. Blaze (Charmander, slot 0): Ember at 1/5 HP hits a dummy x1.5 harder than at full HP, not x2.0
//      (Lab's x1.5 and upstream's x1.35 both ran); upstream's effect is off (pl.abil null).
//   2. Thick Fat (Snorlax, given by an Ability Capsule, slot 1): a Fire hit does x0.5 of a Normal one, not x0.3.
//   3. Sturdy (Geodude, capsule): one save from full HP, and the next lethal hit knocks it out (there
//      were two Sturdies: upstream's and Lab's, each with its own timer).
//   4. The 1-in-20 hidden roll: a save whose roll gives Charmander its hidden ability runs Lab's Solar Power.
//   5. An ability Lab doesn't implement (Gengar's Cursed Body): upstream's runs, Lab adds nothing, and the
//      LAB tag and pause menu name it.
//   6. Lab off: upstream's ability, nothing from Lab.
//   7. The collection card: with the Lab setting on, "In Lab: ..." under an ability Lab has its own version
//      of; nothing for Cursed Body, nothing with Lab off.
//   8. Evolving in a Lab run (plan D3, js/fork/lab/growth.js): the nature carries over (a Modest Charmeleon), one
//      Blaze still, the shiny's stat rolls survive; the ability slot is kept (hidden Solar Power stays) and
//      re-resolved: Munchlax's Pickup (Lab's +20 % coins) becomes Snorlax's Immunity and the coins go back,
//      Venonat's Compound Eyes (upstream's +6 % crits) becomes Venomoth's Shield Dust and the crits go back.
const { chromium, pastStart, pickStarter } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save && G.MenuUI && G.Lab, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save;
      for (const d of [4, 143, 74, 94]) s.owned[d] = { at: Date.now() };
      s.partner = 4; s.starter = 4; G.DB.commit();
      window.__wait = ms => new Promise(r => setTimeout(r, ms));
      window.__until = (f, ms = 4000) => new Promise(r => { const t0 = performance.now(); (function k() { if (f()) return r(true); if (performance.now() - t0 > ms) return r(false); setTimeout(k, 30); })(); });
      // A real run with this Pokémon (and this capsule slot, or none), in a quiet arena.
      window.__run = async (dex, slot, lab = true, shiny = false) => {
        const s = G.DB.save;
        s.pabil = s.pabil || {};
        if (slot == null) delete s.pabil[dex]; else s.pabil[dex] = [slot, Date.now()];
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex, shiny });
        await __until(() => G.Game.state === 'playing' && G.Game.player);
        for (const k of ['Spawner', 'Events', 'Rift', 'Hazards']) G[k].update = G[k].update && (() => {});
        G.Weather.clear(); G.EnemyMgr.clear();
        const pl = G.Game.player;
        pl.xpMul = 0;
        return pl;
      };
      window.__end = () => { G.Game.quit(); G.UI.hideAll(); G.Flow.goMenu(); };
      window.__dummy = (x, y) => {
        const e = new G.Enemy({ dex: 19, name: 'Dummy', hp: 1e7, spd: 0, dmg: 1, xp: 0, behavior: 'chase' }, x, y, { hp: 1, spd: 1, dmg: 1 }, false);
        e.types = ['none']; e.touchCd = 99;
        G.EnemyMgr.add(e);
        return e;
      };
      // Ember on a dummy at full HP and at 1/5 HP: what each hit deals (only Ember, no crits).
      window.__blazeK = async pl => {
        pl.invuln = 1e9; pl.slots.length = 0; pl.moves.length = 0; pl.addMove('ember'); pl.active = 0;
        const m = pl.moves[0], crit = pl.critChance;
        pl.critChance = 0;
        const one = async () => {
          G.EnemyMgr.clear();
          const e = __dummy(pl.x + 90, pl.y);
          pl.target = e; m.t = 0; m.dealt = 0;
          await __until(() => m.dealt > 0);
          await __wait(60);
          return m.dealt;
        };
        pl.hp = pl.maxHp;
        const full = await one();
        pl.hp = pl.maxHp * 0.2;
        const low = await one();
        pl.hp = pl.maxHp; pl.critChance = crit; G.EnemyMgr.clear();
        return { full, low, k: +(low / full).toFixed(3) };
      };
    });
    // Spawner etc. are restored by a reload between parts that need them (none do here).

    console.log('1. Blaze');
    const blaze = await page.evaluate(async () => {
      const pl = await __run(4, 0);
      const { full, low } = await __blazeK(pl);
      const r = { labAbility: pl.labAbility, abil: pl.abil, abilId: pl.abilId, full, low, k: +(low / full).toFixed(3),
                  hud: document.getElementById('lab-hud').textContent };
      __end();
      return r;
    });
    check(blaze.labAbility === 'blaze' && blaze.abil === null && blaze.abilId === 'blaze', 'Charmander runs Lab\'s Blaze and not upstream\'s', blaze);
    check(Math.abs(blaze.k - 1.5) < 0.02, `Ember at 1/5 HP deals x${blaze.k} of full HP (x1.5, not x2.0)`, blaze);
    check(/LAB · Blaze/.test(blaze.hud), 'the LAB tag names it', blaze.hud);

    console.log('2. Thick Fat (capsule)');
    const fat = await page.evaluate(async () => {
      const pl = await __run(143, 1);
      const hit = type => { pl.maxHp = pl.hp = 1e7; pl.invuln = 0; pl.hurt(1000, type); return 1e7 - pl.hp; };
      const fire = hit('fire'), normal = hit('normal');
      const r = { labAbility: pl.labAbility, abil: pl.abil, fire, normal, k: +(fire / normal).toFixed(3) };
      pl.invuln = 0; __end();
      return r;
    });
    check(fat.labAbility === 'thick-fat' && fat.abil === null, 'a capsuled Snorlax runs Lab\'s Thick Fat only', fat);
    check(Math.abs(fat.k - 0.5) < 0.01, `a Fire hit does x${fat.k} of a Normal one (x0.5, not x0.3)`, fat);

    console.log('3. Sturdy (capsule)');
    const sturdy = await page.evaluate(async () => {
      const pl = await __run(74, 1);
      pl.hp = pl.maxHp; pl.invuln = 0; pl.hurt(1e7, 'normal');
      const first = { dead: pl.dead, hp: Math.round(pl.hp) };
      pl.hp = pl.maxHp; pl.invuln = 0; pl.hurt(1e7, 'normal');
      const second = { dead: pl.dead };
      pl.dead = false; pl.hp = pl.maxHp; pl.invuln = 0;         // back up before the game notices
      const r = { labAbility: pl.labAbility, abil: pl.abil, first, second };
      __end();
      return r;
    });
    check(sturdy.labAbility === 'sturdy' && sturdy.abil === null, 'a capsuled Geodude runs Lab\'s Sturdy only', sturdy);
    check(!sturdy.first.dead && sturdy.first.hp === 1, 'a lethal hit from full HP leaves it at 1 HP', sturdy.first);
    check(sturdy.second.dead, 'the next lethal hit knocks it out (one Sturdy, not two)', sturdy.second);

    console.log('4. Hidden roll');
    const hidden = await page.evaluate(async () => {
      const s = G.DB.save, created0 = s.created;
      if (s.pabil) delete s.pabil[4];
      let c = 1;
      while (G.Mons.abilityOf(4).slot !== 2 && c < 5000) s.created = ++c;
      const slot = G.Mons.abilityOf(4).slot;
      const pl = await __run(4, null);
      const r = { slot, created: c, labAbility: pl.labAbility, abil: pl.abil, info: G.Lab.ability && G.Lab.ability.name };
      __end();
      s.created = created0;
      return r;
    });
    check(hidden.slot === 2 && hidden.labAbility === 'solar-power' && hidden.abil === null && hidden.info === 'Solar Power',
      'a save that rolled Charmander\'s hidden ability runs Lab\'s Solar Power', hidden);

    console.log('5. An ability Lab doesn\'t implement');
    const gengar = await page.evaluate(async () => {
      const pl = await __run(94, null);
      await __wait(500);
      G.Game.togglePause();
      const pause = (document.querySelector('#pause-sum .lab-pause') || {}).textContent || '';
      G.UI.hide('scr-pause'); G.Game.togglePause();
      const r = { abilId: pl.abilId, labAbility: pl.labAbility, upstream: !!pl.abil && !!pl.abil.contact,
                  hud: document.getElementById('lab-hud').textContent, pause: pause.replace(/\s+/g, ' ').trim().slice(0, 160) };
      __end();
      return r;
    });
    check(gengar.abilId === 'cursed-body' && gengar.labAbility === null && gengar.upstream, 'Gengar runs upstream\'s Cursed Body and nothing from Lab', gengar);
    check(/LAB · Cursed Body/.test(gengar.hud) && /Ability: Cursed Body/.test(gengar.pause), 'the LAB tag and the pause menu name it', gengar);

    console.log('6. Lab off');
    const off = await page.evaluate(async () => {
      const pl = await __run(4, 0, false);
      const r = { lab: G.Lab.active, abilId: pl.abilId, labAbility: pl.labAbility || null, upstream: !!pl.abil && !!pl.abil.out };
      __end();
      return r;
    });
    check(!off.lab && off.abilId === 'blaze' && off.labAbility === null && off.upstream, 'a normal run has upstream\'s Blaze only', off);

    console.log('7. The collection card');
    const card = async (name, lab) => {
      await page.evaluate(lab => { G.Settings.set('lab', lab); G.UI.hideAll(); G.MenuUI.open(); }, lab);
      await page.click('#scr-menu [data-go=dex]');
      await page.waitForSelector('#dex-grid .cell');
      await page.fill('#dex-q', name);                     // the grid loads in batches: search for it
      await page.waitForTimeout(350);
      await page.locator('#dex-grid .cell', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).click();
      await page.waitForSelector('#dex-detail .mx-desc', { timeout: 8000 });
      return page.evaluate(() => { const n = document.querySelector('#dex-detail .lab-abil-note'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; });
    };
    await page.evaluate(() => { G.DB.save.pabil[4] = [0, Date.now()]; });
    const c1 = await card('Charmander', true), c2 = await card('Gengar', true), c3 = await card('Charmander', false);
    check(!!c1 && /In Lab: Fire moves deal 50% more damage/.test(c1), 'Charmander\'s card says what Blaze does in Lab', c1);
    check(c2 === null, 'Gengar\'s card has no Lab line (Lab has no Cursed Body)', c2);
    check(c3 === null, 'no Lab line with the Lab setting off', c3);

    console.log('8. Evolving (plan D3)');
    const evo = await page.evaluate(async () => {
      const s = G.DB.save, out = {};
      const evolve = (pl, to) => { pl.level = 99; const c = G.LevelUp.offer(pl).find(c => c.key === 'grow:' + to); if (c) c.apply(pl); return !!c; };
      // A shiny Modest Charmander, first ability: the nature, Blaze (once) and the shiny's stat rolls carry over.
      s.pnat = { 4: ['modest', Date.now()] };
      let pl = await __run(4, 0, true, true);
      const vs0 = JSON.stringify(pl._vstats), spd0 = pl.spdMul;
      out.ok5 = evolve(pl, 5);
      const k = await __blazeK(pl);
      out.char = { dex: pl.dex, nature: pl.mon.nature, sa: +(pl.mon.sa / G.DEX_BY[5].sa).toFixed(3), pa: +(pl.mon.pa / G.DEX_BY[5].pa).toFixed(3),
                   baseAtk: pl.baseAtk === pl.mon.atk, labAbility: pl.labAbility, abil: pl.abil, k: k.k, vstats: JSON.stringify(pl._vstats) === vs0 && !!pl._vstats,
                   spd: pl.spdMul === spd0, hud: document.getElementById('lab-hud').textContent };
      __end();
      // Its hidden ability (capsule): Charmeleon keeps the hidden slot (Solar Power, not Blaze).
      pl = await __run(4, 2);
      evolve(pl, 5);
      out.hidden = { dex: pl.dex, labAbility: pl.labAbility, abilId: pl.abilId, info: G.Lab.ability && G.Lab.ability.name };
      __end();
      // Munchlax's Pickup (Lab's: +20 % coins) becomes Snorlax's Immunity (upstream's): the coins go back.
      out.munchTargets = G.LabGrowth.targets(446).map(t => t[0]);
      s.owned[446] = { at: Date.now() };
      pl = await __run(446, 0);
      const c0 = pl.coinMul, lab0 = pl.labAbility;
      evolve(pl, 143);
      out.munch = { lab0, k0: +(c0 / pl.coinMul).toFixed(3), dex: pl.dex, abilId: pl.abilId, labAbility: pl.labAbility, upstream: !!pl.abil,
                    hud: document.getElementById('lab-hud').textContent };
      __end();
      // Venonat's Compound Eyes (upstream's, +6 % crits at the start) becomes Venomoth's Shield Dust: the crits go back.
      s.owned[48] = { at: Date.now() };
      pl = await __run(48, 0);
      const cr0 = pl.critChance, id0 = pl.abilId;
      evolve(pl, 49);
      out.veno = { id0, drop: +(cr0 - pl.critChance).toFixed(3), dex: pl.dex, abilId: pl.abilId, labAbility: pl.labAbility };
      __end();
      return out;
    });
    check(evo.ok5 && evo.char.dex === 5 && evo.char.nature === 'modest' && evo.char.sa === 1.1 && evo.char.pa === 0.9 && evo.char.baseAtk,
      'a Modest Charmander evolves into a Modest Charmeleon (Sp. Atk x1.1, Attack x0.9)', evo.char);
    check(evo.char.labAbility === 'blaze' && evo.char.abil === null && Math.abs(evo.char.k - 1.5) < 0.02 && /LAB · Blaze/.test(evo.char.hud),
      `Charmeleon still has one Blaze (Ember at 1/5 HP x${evo.char.k})`, evo.char);
    check(evo.char.vstats && evo.char.spd, "the shiny's stat rolls survive the evolution", evo.char);
    check(evo.hidden.dex === 5 && evo.hidden.labAbility === 'solar-power' && evo.hidden.info === 'Solar Power', 'the hidden slot is kept: Charmeleon has Solar Power, not Blaze', evo.hidden);
    check(evo.munchTargets.includes(143) && evo.munch.lab0 === 'pickup' && evo.munch.dex === 143 && evo.munch.abilId === 'immunity' && evo.munch.labAbility === null && evo.munch.upstream,
      "Munchlax's Pickup becomes Snorlax's Immunity (upstream's, nothing from Lab)", evo.munch);
    check(evo.munch.k0 === 1.2 && /LAB · Immunity/.test(evo.munch.hud), "Pickup's +20 % coins are taken back, and the tag says Immunity", evo.munch);
    check(evo.veno.id0 === 'compound-eyes' && evo.veno.dex === 49 && evo.veno.abilId === 'shield-dust' && evo.veno.drop === 0.06,
      "Venonat's Compound Eyes (+6 % crits) goes when it becomes Venomoth (Shield Dust)", evo.veno);

    console.log('9. The ability shown in every run (plan D6)');
    const shown = await page.evaluate(async () => {
      const tag = () => { const h = document.getElementById('abil-hud'); return h && !h.classList.contains('hidden') ? h.textContent : null; };
      const pause = () => { G.Game.togglePause(); const b = document.querySelector('#pause-sum .abil-pause'), l = document.querySelector('#pause-sum .lab-pause:not(.abil-pause)');
        const r = { abil: b ? b.textContent.replace(/\s+/g, ' ').trim() : null, lab: !!l }; G.UI.hide('scr-pause'); G.Game.togglePause(); return r; };
      const out = {};
      let pl = await __run(4, 0, false);                 // a normal run: upstream's Blaze
      await __wait(600);
      out.normal = { tag: tag(), pause: pause() };
      __end();
      await __wait(600);
      out.menu = tag();
      pl = await __run(4, 0, true);                      // a Lab run: Lab's tag and block, not this one
      await __wait(600);
      out.lab = { tag: tag(), pause: pause(), labTag: document.getElementById('lab-hud').textContent };
      __end();
      return out;
    });
    check(shown.normal.tag === 'Ability · Blaze', 'a normal run shows "Ability · Blaze" at the top', shown);
    check(!!shown.normal.pause.abil && /^Ability: Blaze \+35 %/.test(shown.normal.pause.abil.replace('+35%', '+35 %')) && !shown.normal.pause.lab,
      'its pause menu says the ability and upstream\'s effect (+35 %)', shown.normal.pause);
    check(shown.menu === null, 'nothing in the menu', shown.menu);
    check(shown.lab.tag === null && !shown.lab.pause.abil && shown.lab.pause.lab && /LAB · Blaze/.test(shown.lab.labTag), 'a Lab run keeps only Lab\'s tag and block', shown.lab);

    // The built page (G is sealed there: only the UI, as a player): a normal run shows the tag and the pause line.
    const built = await (await browser.newContext({ viewport: { width: 1200, height: 750 } })).newPage();
    await built.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
    built.on('pageerror', e => errors.push('built: ' + String(e)));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    await built.click('#btn-guest');
    await pickStarter(built);
    await built.click('#scr-menu [data-go="play"]');
    const btag = await built.waitForFunction(() => { const h = document.getElementById('abil-hud'); return h && !h.classList.contains('hidden') && h.textContent; }, null, { timeout: 30000 })
      .then(h => h.jsonValue(), () => null);
    await built.keyboard.press('Escape');
    await built.waitForSelector('#pause-sum .abil-pause', { timeout: 5000 }).catch(() => {});
    const bpause = await built.evaluate(() => { const b = document.querySelector('#pause-sum .abil-pause'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
    if (process.env.SHOTS) await built.screenshot({ path: require('path').join(process.env.SHOTS, 'ability-pause.png') });
    check(/^Ability · \S/.test(btag || '') && /^Ability: \S/.test(bpause || ''), 'the built game (index.html): a normal run shows its ability at the top and in the pause menu', { btag, bpause });

    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Lab ability checks passed');
  process.exit(failures ? 1 : 0);
})();
