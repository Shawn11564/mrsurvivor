#!/usr/bin/env node
// Rarities on the run's upgrade cards (js/fork/card-rarity.js), in headless Edge on dev.html:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-card-rarity.cjs [base-url] [screenshot.png]
//
//   1. Over 8000 real offers, the upgrade cards come out about 60/25/10/4/1 % Common to Legendary;
//      gold ones (that ask for an evolution) never get one.
//   2. The text says the multiplied number ("Potencia" Epic: "+20% damage with every move"), and
//      taking it does that: ×1.2 damage, and it counts 2 towards Potencia's cap of 40.
//   3. Near the cap a card doesn't overshoot it (it comes out lower).
//   4. On screen, in English: the chip says the rarity in its colour, the card has its border;
//      also after a reroll (R or the button).
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;
const SHOT = process.argv[3];

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('ps.savenote.1', '1'); localStorage.setItem('ps.ranknote.1', '1'); localStorage.setItem('ps.lang', 'en'); } catch (e) { /* nada */ } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.$eval('#btn-guest', e => e.click());
    await page.waitForFunction(() => G.DB.save, null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: Date.now(), from: 'starter' }; s.partner = 4; s.starter = 4; G.DB.commit();
      G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
    });
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; p.xpMul = 0; requestAnimationFrame(alive); })(); });

    console.log('1. Odds');
    const odds = await page.evaluate(() => {
      const pl = G.Game.player, n = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, gold = { n: 0, rar: 0 };
      // Moves full, so offers are mostly upgrade cards.
      for (let i = 0; i < 8000; i++) for (const c of G.LevelUp.offer(pl)) {
        if (c.type !== 'stat') continue;
        if (c.color === '#ffd23f') { gold.n++; continue; }
        if (c.rarity > 1 && c.color === G.Gacha.RARITY_COLOR[c.rarity] && c.tag === G.Gacha.RARITY_NAME[c.rarity]) n[c.rarity]++;
        else if (!c.rarity && c.tag === 'Mejora') n[1]++;
      }
      const total = Object.values(n).reduce((a, b) => a + b, 0);
      return { total, pct: Object.fromEntries(Object.entries(n).map(([k, v]) => [k, +(v / total * 100).toFixed(2)])) };
    });
    const p = odds.pct, near = (v, want, tol) => Math.abs(v - want) <= tol;
    check(odds.total > 4000 && near(p[1], 60, 4) && near(p[2], 25, 3) && near(p[3], 10, 2) && near(p[4], 4, 1.2) && near(p[5], 1, 0.6),
      'about 60 / 25 / 10 / 4 / 1 % Common to Legendary', odds);

    console.log('2. Text and effect');
    const epic = await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity;
      const roll = R.roll;
      R.roll = () => R.TIERS[3];                 // Epic, ×2, for this offer
      let c = null;
      for (let i = 0; i < 300 && !c; i++) c = G.LevelUp.offer(pl).find(x => x.key === 'stat:atk');
      R.roll = roll;
      if (!c) return null;
      const before = pl.atkMul, t0 = pl.statsTaken.atk || 0;
      c.apply(pl);
      return { tag: c.tag, desc: c.desc, en: G.T(c.desc), mul: +(pl.atkMul / before).toFixed(4), counted: (pl.statsTaken.atk || 0) - t0 };
    });
    check(epic && epic.tag === 'Épica' && epic.en === '+20% damage with every move.', 'an Epic Potencia says +20% damage (in English too)', epic);
    check(epic && epic.mul === 1.2 && epic.counted === 2, 'taking it gives ×1.2 damage and counts 2 towards the cap', epic);
    // Legendary is ×2 since 2026-10-22 (was ×3): same number as Epic, its own colour.
    const leg = await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity, roll = R.roll;
      R.roll = () => R.TIERS[4];
      let c = null;
      for (let i = 0; i < 300 && !c; i++) c = G.LevelUp.offer(pl).find(x => x.key === 'stat:atk');
      R.roll = roll;
      if (!c) return null;
      const before = pl.atkMul, t0 = pl.statsTaken.atk || 0;
      c.apply(pl);
      return { rarity: c.rarity, rk: c.rk, en: G.T(c.desc), mul: +(pl.atkMul / before).toFixed(4), counted: (pl.statsTaken.atk || 0) - t0 };
    });
    check(leg && leg.rarity === 5 && leg.rk === 2 && leg.en === '+20% damage with every move.' && leg.mul === 1.2 && leg.counted === 2,
      'a Legendary Potencia is ×2: says +20% damage, gives ×1.2 and counts 2 towards the cap', leg);
    const legCap = await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity, roll = R.roll;
      pl.statsTaken.atk = 38;                     // two left: a ×2 Legendary fits whole
      // The real roll, with its die on the Legendary 1 %: it drops a rarity only if it doesn't fit.
      R.roll = m => { const r = Math.random; Math.random = () => 0.995; try { return roll(m); } finally { Math.random = r; } };
      let c = null;
      for (let i = 0; i < 300 && !c; i++) c = G.LevelUp.offer(pl).find(x => x.key === 'stat:atk');
      R.roll = roll;
      return c && { rarity: c.rarity, rk: c.rk };
    });
    check(legCap && legCap.rarity === 5 && legCap.rk === 2, 'with two Potencia left, a Legendary still fits whole', legCap);

    console.log('3. The cap');
    const cap = await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity, roll = R.roll;
      pl.statsTaken.atk = 39;                     // Potencia: max 40, one left
      const ks = [];
      for (let i = 0; i < 400; i++) for (const c of G.LevelUp.offer(pl)) if (c.key === 'stat:atk') ks.push(c.rk || 1);
      return { seen: ks.length, max: Math.max(...ks) };
    });
    check(cap.seen > 20 && cap.max <= 1, 'with one Potencia left, its card never comes out above ×1', cap);

    console.log('4. On screen');
    const ui = await page.evaluate(() => {
      const pl = G.Game.player, R = G.CardRarity, roll = R.roll;
      pl.statsTaken = {};
      R.roll = () => R.TIERS[4];                  // Legendary
      let list = null;
      for (let i = 0; i < 300 && !list; i++) { const l = G.LevelUp.offer(pl); if (l.some(c => c.rarity === 5)) list = l; }
      G.RunUI.showLevelUp(pl.level, list, () => {});
      const i = list.findIndex(c => c.rarity === 5);
      R.roll = roll;
      return { i };
    });
    await page.waitForTimeout(300);
    const look = await page.evaluate(i => {
      const el = document.querySelectorAll('#cards .card')[i], chip = el && el.querySelector('.tag-chip');
      return el && { chip: chip.textContent.trim(), bg: chip.style.background, shadow: el.style.boxShadow, cls: el.className };
    }, ui.i);
    check(look && look.chip === 'Legendary' && /255, 203, 61|#ffcb3d/i.test(look.bg) && /255, 203, 61|#ffcb3d/i.test(look.shadow) && /rarity-5/.test(look.cls),
      'a Legendary card: chip "Legendary" in gold, gold border', look);
    if (SHOT) { await page.waitForTimeout(1500); await page.locator('#scr-levelup').screenshot({ path: SHOT }); }   // after the cards' fade-in
    // A reroll (the button) paints the new hand too.
    await page.evaluate(() => { const R = G.CardRarity; R.__roll = R.roll; R.roll = () => R.TIERS[3]; G.Game.player.rerollBonus = 3; });
    let painted = false;
    for (let i = 0; i < 6 && !painted; i++) {
      await page.evaluate(() => { const b = document.getElementById('lvl-reroll'); b.classList.remove('hidden'); b.click(); });
      await page.waitForTimeout(150);
      painted = await page.evaluate(() => [...document.querySelectorAll('#cards .card')].some(el => /rarity-4/.test(el.className) && /Epic/.test(el.textContent)));
    }
    check(painted, 'after a reroll with the button, an Epic card is painted too');
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll card rarity checks passed');
  process.exit(failures ? 1 : 0);
})();
