#!/usr/bin/env node
// Overhealth from the Sitrus Berry in Lab runs (js/fork/lab/overhealth.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-overhealth.cjs [base-url]
//
// The berry is the level-up card the game offers (G.LevelUp.offer, card-rarity.js's tiers too, rolled
// common here), applied the way game.js does (card.apply).
//   1. Lab, 10 HP short of full: the berry (45% of max HP) fills HP and the rest is Overhealth; its card says so.
//   2. Hits take the Overhealth first (HP stays full), then HP.
//   3. Overhealth lost doesn't come back: regeneration and heals refill HP only.
//   4. It stacks up to your max HP at most (three berries at full HP).
//   5. The HUD shows it: a gold strip under the top left's HP bar and over the bar above your Pokémon, gone at 0.
//   6. Outside the Lab the berry only heals, as before.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nothing */ } });
  try {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters, #scr-menu', { state: 'visible', timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; G.DB.commit();
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      window.__run = async lab => {
        if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('lab', lab); G.Settings.set('underdogLadder', false);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        await __wait(() => G.Game.state === 'playing');
        G.Spawner.update = () => {}; G.EnemyMgr.clear();
        const pl = G.Game.player; pl.regenFlat = 0; pl.invuln = 0;
        return !!(G.Lab && G.Lab.active);
      };
      // The berry card as the level-up hand offers it (common), applied as game.js does.
      window.__berry = () => {
        const pl = G.Game.player, cr = G.CardRarity, roll = cr && cr.roll;
        if (cr) cr.roll = () => cr.TIERS[0];
        let card = null;
        for (let i = 0; i < 400 && !card; i++) card = (G.LevelUp.offer(pl) || []).find(c => c.key === 'stat:heal') || null;
        if (cr) cr.roll = roll;
        if (!card) return null;
        card.apply(pl);
        return { desc: card.desc };
      };
      // A hit as an enemy's (pure: exactly `d`), past the hit's invulnerability.
      window.__hit = d => { const pl = G.Game.player; pl.invuln = 0; pl.hurt(d, null, true); pl.invuln = 0; return { hp: +pl.hp.toFixed(2), max: pl.maxHp }; };
      window.__oh = () => (G.Overhealth ? +G.Overhealth.of(G.Game.player).toFixed(2) : 0);
      // Gold (#ffd23f) pixels: under the top left's bar, and over the bar above your Pokémon.
      window.__gold = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cv = document.getElementById('game'), cx = cv.getContext('2d'), cam = G.Camera, d = cam.dpr || 1, sa = G.Touch.safeArea(), pl = G.Game.player;
        const gold = (x, y) => { const q = cx.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data; return Math.abs(q[0] - 0xff) + Math.abs(q[1] - 0xd2) + Math.abs(q[2] - 0x3f) < 60; };
        let top = 0, above = 0;
        for (let i = 0; i < 20; i++) if (gold(16 + sa.left + 48 + 2 + i * 2, 20 + sa.top + 17 + 11 + 2)) top++;
        const b = G.HpAbove.box(pl), k = cam.scale;
        for (let i = 0; i < 10; i++) if (gold((b.x + 1 + i * 2 - cam.left()) * k, (b.y - 2.5 - cam.top()) * k)) above++;
        res({ top, above });
      })));
    });

    console.log('1. The berry past full HP');
    const lab = await page.evaluate(() => __run(true));
    const b1 = await page.evaluate(() => { const pl = G.Game.player; pl.hp = pl.maxHp - 10; const c = __berry(); return { c, hp: pl.hp, max: pl.maxHp, oh: __oh() }; });
    const want = +(b1.max * 0.45 - 10).toFixed(2);
    check(lab && b1.c && b1.hp === b1.max && Math.abs(b1.oh - want) < 0.05, `Lab: HP full and the rest (${want}) as Overhealth`, b1);
    check(b1.c && /Overhealth/i.test(b1.c.desc), 'the berry\'s card says so', b1.c && b1.c.desc);

    console.log('2. Hits take it first');
    const h1 = await page.evaluate(() => { const r = __hit(20); return { ...r, oh: __oh() }; });
    check(h1.hp === h1.max && Math.abs(h1.oh - (want - 20)) < 0.05, 'a hit of 20: HP stays full, 20 off the Overhealth', h1);
    const h2 = await page.evaluate(() => { const r = __hit(20); return { ...r, oh: __oh() }; });
    check(Math.abs(h2.hp - (h2.max - (20 - (want - 20)))) < 0.05 && h2.oh === 0, 'the next 20: what\'s left of it, then HP', h2);

    console.log('3. Lost for good');
    const r3 = await page.evaluate(async () => { const pl = G.Game.player; pl.regenFlat = 50; await new Promise(r => setTimeout(r, 1500)); pl.regenFlat = 0; pl.heal(100); return { hp: pl.hp, max: pl.maxHp, oh: __oh() }; });
    check(r3.hp === r3.max && r3.oh === 0, 'regeneration and a heal fill HP, not the Overhealth', r3);

    console.log('4. Up to max HP');
    const r4 = await page.evaluate(() => { __berry(); __berry(); __berry(); const pl = G.Game.player; return { oh: __oh(), max: pl.maxHp }; });
    check(r4.oh === r4.max, 'three berries at full HP: Overhealth stops at your max HP', r4);

    console.log('5. On the HUD');
    const g1 = await page.evaluate(() => __gold());
    check(g1.top >= 18 && g1.above >= 8, 'gold under the top left\'s bar and over the one above you', g1);
    await page.evaluate(() => __hit(1e6 / 1e6 * G.Game.player.maxHp));
    const g0 = await page.evaluate(async () => { const r = await __gold(); return { ...r, oh: __oh() }; });
    check(g0.oh === 0 && g0.top === 0 && g0.above === 0, 'gone once it\'s used up', g0);

    console.log('6. Outside the Lab');
    const n = await page.evaluate(async () => { const lab = await __run(false); const pl = G.Game.player; pl.hp = pl.maxHp - 10; const c = __berry(); const r = __hit(20); return { lab, c, ...r, oh: __oh() }; });
    check(!n.lab && n.c && n.hp === n.max - 20 && n.oh === 0 && !/Overhealth/i.test(n.c.desc), 'the berry only heals, the hit takes HP', n);
    check(!errs.length, 'no page errors', errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll Overhealth checks passed');
  process.exit(failures ? 1 : 0);
})();
