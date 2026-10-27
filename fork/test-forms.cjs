#!/usr/bin/env node
// Forms held as an item, like the Mega Stone (js/fork/forms.js, js/fork/form-items.js, js/fork/extra-dex.js), in headless Edge:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-forms.cjs [base-url]
//
//   1. The 24 forms of G.FORM_ITEMS aren't Pokémon: not in G.DEX, any gacha banner, rift or wild pool; their
//      G.DEX_BY row, sheets, item and icon are there.
//   2. A guest save from 2026-10-26 that owns some (shiny Heat Rotom as partner, with upgrades and runs; Origin
//      Giratina next to a Giratina with its own upgrades; Black Kyurem as a favourite) loads with their base Pokémon:
//      Rotom (shiny, partner, the upgrades), Giratina (the higher level of each upgrade), Kyurem (the favourite),
//      and no form left anywhere in the save.
//   3. Rotom's card in the collection says it can change form and names its five; Pikachu's doesn't.
//   4. A run as Rotom: a rift won at 6:40 on the luckiest roll offers one of its five items. Holding the Microwave
//      Oven: Heat Rotom's sheets and types (Electric/Fire), ×1.25 damage, +15 % HP. Swapping it for Leftovers puts
//      it all back. Its texts stay English.
//   5. A level up on the luckiest roll offers one too; Pikachu never gets one.
//   6. Floette holding the Eternal Flower evolves into Florges: Florges' sheets and types, no form bonus left.
//   7. The built index.html: the collection counts 1040 and "479" finds only Rotom.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

// In the page: start a run as dex (ending the one going on) with god mode and no XP.
const RUN = async d => {
  const wait = async (f, ms = 20000) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 50)); } return true; };
  if (G.Game.state === 'playing') { G.Game.quit(); await wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await wait(() => G.Game.state === 'ui'); }
  G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: d, shiny: false });
  await wait(() => G.Game.state === 'playing' && G.Game.player.dex === d);
  const pl = G.Game.player; pl.god = true; pl.xpMul = 0;
  return pl.dex;
};

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
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.Game && G.Forms && G.LabGrowth, null, { timeout: 30000 });

    console.log('1. Not Pokémon of their own');
    const data = await page.evaluate(() => {
      const F = Object.keys(G.FORM_ITEMS).map(Number), inDex = new Set(G.DEX.map(p => p.dex)), bad = [];
      for (let g = 1; g <= 9; g++) for (let r = 1; r <= 5; r++) for (const p of G.Gacha.pool(r, g)) if (F.includes(p.dex)) bad.push('banner ' + g + ': ' + p.dex);
      for (const f of F) {
        if (inDex.has(f)) bad.push(f + ' in G.DEX');
        if (!G.DEX_BY[f] || !G.SPRITE_META[f]) bad.push(f + ' no G.DEX_BY row or sheets');
        if (!G.Items.BY['form' + f] || !G.Icons.UI['form' + f]) bad.push(f + ' no item or icon');
        if (!G.DEX_BY[G.FORM_ITEMS[f][0]] || !inDex.has(G.FORM_ITEMS[f][0])) bad.push(f + ' base not a Pokémon');
      }
      return { n: F.length, bad, total: G.DEX.length, rotom: G.Forms.forms(479) };
    });
    check(data.n === 24 && !data.bad.length, 'none of the 24 is in G.DEX or a banner; each has its row, sheets, item, icon and base', data.bad.slice(0, 6));
    check(data.rotom.join() === '1562,1563,1564,1565,1566', 'Rotom has its five appliances', data.rotom);

    console.log('2. An old save that owns them');
    const ups = await page.evaluate(() => {
      const s = G.DB.save, ids = G.Upgrades.LIST.map(u => u.id).slice(0, 2), now = Date.now();
      Object.assign(s.owned, { 25: { at: now }, 487: { at: now }, 1562: { at: now, from: 'gacha' }, 1567: { at: now, from: 'gacha' }, 1574: { at: now, from: 'gacha' } });
      s.shiny[1562] = { at: now, from: 'gacha' };
      s.partner = 1562; s.partnerShiny = true;
      s.pupg[1562] = { [ids[0]]: 3 };
      s.pupg[487] = { [ids[0]]: 1, [ids[1]]: 2 }; s.pupg[1567] = { [ids[0]]: 2 };
      s.pused[1562] = 4;
      s.profile.favs = [1574, 25];
      G.DB.commit();
      return ids;
    });
    await page.reload({ waitUntil: 'load' });
    await pastStart(page, '#scr-menu, #btn-guest');
    if (await page.isVisible('#btn-guest')) await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => window.G && G.DB && G.DB.save && G.DB.save.owned[25] && G.Forms, null, { timeout: 30000 });
    const conv = await page.evaluate(ids => {
      const s = G.DB.save, F = Object.keys(G.FORM_ITEMS), left = [];
      const walk = (o, at) => { for (const k of Object.keys(o)) { if (F.includes(k)) left.push(at + '.' + k); else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) walk(o[k], at + '.' + k); } };
      walk(s, 'save');
      return { left, owned: [479, 487, 646].filter(d => s.owned[d]), shiny: !!s.shiny[479], partner: s.partner, pshiny: s.partnerShiny,
        rotomUp: s.pupg[479] && s.pupg[479][ids[0]], gira: s.pupg[487], used: s.pused[479], favs: s.profile.favs };
    }, ups);
    check(!conv.left.length, 'no form is left anywhere in the save', conv.left);
    check(conv.owned.join() === '479,487,646' && conv.shiny, 'Rotom (shiny), Giratina and Kyurem are owned instead', conv);
    check(conv.partner === 479 && conv.pshiny && conv.rotomUp === 3 && conv.used === 4, 'Rotom is the partner, shiny, with Heat Rotom\'s upgrades and runs', conv);
    check(conv.gira && conv.gira[ups[0]] === 2 && conv.gira[ups[1]] === 2, 'Giratina keeps the higher level of each upgrade', conv.gira);
    check(JSON.stringify(conv.favs) === '[646,25]', 'Black Kyurem\'s favourite is Kyurem\'s', conv.favs);

    console.log('3. The collection card');
    const hints = await page.evaluate(() => ({ rotom: G.Mega.hint(479), pika: G.Mega.hint(25) }));
    check(/Can change form: Heat Rotom, Wash Rotom, Frost Rotom, Fan Rotom or Mow Rotom/.test(hints.rotom) && !/form/.test(hints.pika), 'Rotom\'s hint names its five forms; Pikachu has none', hints.rotom.replace(/<img[^>]*>/, '').slice(0, 140));
    await page.evaluate(() => { G.UI.hideAll(); G.Flow.goMenu(); });
    await page.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await page.click('#scr-menu [data-go="dex"]');
    await page.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    await page.fill('#dex-q', '479');
    await page.waitForFunction(() => document.querySelectorAll('#dex-grid .cell').length === 1, null, { timeout: 5000 }).catch(() => {});
    const cells = await page.$$eval('#dex-grid .cell', cs => cs.map(c => c.dataset.dex));
    check(cells.join() === '479', '"479" finds only Rotom', cells);
    await page.click('#dex-grid .cell[data-dex="479"]');
    const card = await page.waitForFunction(() => /Can change form: Heat Rotom/.test(document.getElementById('scr-dex').textContent), null, { timeout: 5000 }).then(() => true, () => false);
    check(card, 'its card shows the line, in English');

    console.log('4. A run as Rotom');
    await page.evaluate(RUN, 479);
    const rift = await page.evaluate(async () => {
      const wait = async (f, ms) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 30)); } return true; };
      const pl = G.Game.player;
      const rnd = Math.random; Math.random = () => 0;
      try { G.Game.debugTime(400); G.Mega.riftWon(pl); } finally { Math.random = rnd; }
      await wait(() => pl.item || G.UI.isOpen('scr-item'), 3000);
      return { dex: pl.dex, item: pl.item, form: pl.item && G.Items.BY[pl.item].form };
    });
    check(rift.dex === 479 && rift.form >= 1562 && rift.form <= 1566, 'a rift won at 6:40 on the luckiest roll gives one of Rotom\'s items', rift);
    const heat = await page.evaluate(async () => {
      const pl = G.Game.player;
      pl.equip(null);
      const atk = pl.atkMul, hp = pl.maxHp;
      pl.equip('form1562');
      await new Promise(r => setTimeout(r, 300));
      const on = { types: pl.mon.types.join('/'), key: pl.anim.dex, atk: +(pl.atkMul / atk).toFixed(3), hp: +(pl.maxHp / hp).toFixed(2), formKey: pl.formKey };
      pl.equip('leftovers');
      await new Promise(r => setTimeout(r, 300));
      const off = { types: pl.mon.types.join('/'), key: pl.anim.dex, atk: +(pl.atkMul / atk).toFixed(3), hp: pl.maxHp === hp, formKey: pl.formKey };
      const it = G.Items.BY.form1562;
      return { on, off, name: G.T(it.name), desc: G.T(it.desc), say: G.T('Heat Rotom!'), took: G.T('¡Llevas ' + it.name + '!') };
    });
    check(heat.on.types === 'electric/fire' && String(heat.on.key) === '1562' && heat.on.atk === 1.25 && heat.on.hp === 1.15, 'holding the Microwave Oven: Heat Rotom\'s sheets and types, ×1.25 damage, +15 % HP', heat.on);
    check(heat.off.types === 'electric/ghost' && String(heat.off.key) === '479' && heat.off.atk === 1 && heat.off.hp && !heat.off.formKey, 'Leftovers instead: Rotom again', heat.off);
    check(heat.name === 'Microwave Oven' && /^Rotom becomes Heat Rotom while holding it \(Electric\/Fire\)/.test(heat.desc) && heat.say === 'Heat Rotom!' && /Microwave Oven/.test(heat.took),
      'its texts stay English', [heat.name, heat.desc.slice(0, 60), heat.say, heat.took]);

    console.log('5. Level ups');
    const lv = await page.evaluate(async () => {
      const wait = async (f, ms) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 20)); } return true; };
      const pl = G.Game.player;
      pl.equip(null);
      await new Promise(r => setTimeout(r, 400));
      const rnd = Math.random; Math.random = () => 0;
      try { pl.level += 1; await wait(() => pl.item, 1500); } finally { Math.random = rnd; }
      return { item: pl.item, form: pl.item && G.Items.BY[pl.item].form };
    });
    check(lv.form >= 1562 && lv.form <= 1566, 'a level up on the luckiest roll gives one of Rotom\'s items', lv);
    await page.evaluate(RUN, 25);
    const pika = await page.evaluate(async () => {
      const pl = G.Game.player;
      await new Promise(r => setTimeout(r, 400));
      const rnd = Math.random; Math.random = () => 0;
      try { pl.level += 3; await new Promise(r => setTimeout(r, 800)); } finally { Math.random = rnd; }
      return { dex: pl.dex, item: pl.item };
    });
    check(pika.dex === 25 && !pika.item, 'Pikachu, with no forms, never gets one', pika);

    console.log('6. Evolving while holding one');
    await page.evaluate(RUN, 670);
    const evo = await page.evaluate(async () => {
      const pl = G.Game.player, atk = pl.atkMul;
      pl.equip('form1577');
      const held = { types: pl.mon.types.join('/'), key: pl.anim.dex, atk: +(pl.atkMul / atk).toFixed(3) };
      G.LabGrowth.evolveTo(pl, 671);
      await new Promise(r => setTimeout(r, 600));
      return { held, dex: pl.dex, name: pl.mon.name, key: pl.anim.dex, atk: +(pl.atkMul / atk).toFixed(3), form: pl.form, formKey: pl.formKey, item: pl.item };
    });
    check(String(evo.held.key) === '1577' && evo.held.atk === 1.25, 'Floette holding the Eternal Flower is Eternal Floette', evo.held);
    check(evo.dex === 671 && evo.name === 'Florges' && String(evo.key) === '671' && evo.atk === 1 && !evo.form && !evo.formKey, 'evolving into Florges leaves no form behind', evo);
    await page.evaluate(() => { if (G.Game.state === 'playing') G.Game.quit(); });
    check(!page.errs.length, 'no page errors on dev.html', page.errs.slice(0, 3));

    console.log('7. Built index.html');
    const built = await open('/index.html');
    await built.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    if (await built.isVisible('#scr-starters')) { await built.click('#starter-grid .cell'); await built.click('#starter-ok'); }
    await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 30000 });
    await built.click('#scr-menu [data-go="dex"]');
    await built.waitForSelector('#dex-grid .cell', { timeout: 15000 });
    const total = await built.$eval('#dex-total', e => e.textContent);
    check(/\/ 1040$/.test(total.trim()), 'the collection counts 1040', total);
    await built.fill('#dex-q', '479');
    await built.waitForFunction(() => document.querySelectorAll('#dex-grid .cell').length === 1, null, { timeout: 5000 }).catch(() => {});
    const bcells = await built.$$eval('#dex-grid .cell', cs => cs.map(c => c.dataset.dex));
    check(bcells.join() === '479', 'and "479" finds only Rotom', bcells);
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
