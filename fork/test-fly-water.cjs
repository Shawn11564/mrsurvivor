#!/usr/bin/env node
// Flying types fly over water in Lab runs (js/fork/lab/fly-water.js), in headless Edge on dev.html:
//
//   node fork/serve.cjs            (or python -m http.server 8123 in the main checkout)
//   node fork/test-fly-water.cjs [base-url]
//
// The player is put at the start of a stretch of water (or swamp) and the right arrow is held for 0.6 s:
// the distance walked is the game's own movement (player.update with G.Input), compared with the same walk
// on dry land.
//   1. Lab, water: Pidgey (Normal/Flying) and Charizard (Fire/Flying) walk as far as on land and don't
//      splash (inLiquid is false); Charmander (Fire) is slowed (×0.6), as before.
//   2. Lab, swamp: Pidgey isn't slowed either.
//   3. Outside the Lab nothing changes: Pidgey is slowed in water.
//   4. Lab, lava: a Flying type over lava still takes the lava's damage (only water and swamp are flown over).
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
      const s = G.DB.save;
      for (const d of [4, 6, 16]) s.owned[d] = s.owned[d] || { at: Date.now() };
      s.partner = 4; G.DB.commit();
      window.__wait = (f, ms = 15000) => new Promise(res => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > ms) { clearInterval(i); res(f()); } }, 30); });
      // A run with `dex` in biome `biome`, nothing spawning, god mode.
      window.__run = async (lab, dex, biome) => {
        if (G.Game.state !== 'ui') { G.Game.quit(); await __wait(() => G.UI.isOpen('scr-over')); document.getElementById('btn-again').click(); await __wait(() => G.Game.state === 'ui'); }
        G.Settings.set('lab', lab);
        G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex, shiny: false });
        await __wait(() => G.Game.state === 'playing');
        G.Spawner.update = () => {}; G.EnemyMgr.clear();
        G.World.setBiome(biome, true);
        const pl = G.Game.player; pl.god = true;
        return { lab: !!(G.Lab && G.Lab.active), kind: G.World.liquidKind(), types: pl.mon.types };
      };
      // The start of a row of `n` tiles of one terrain (liquid or dry land) to the right, near the player.
      window.__row = (liquid, n = 9) => {
        const TS = G.World.TS, pl = G.Game.player, x0 = Math.floor(pl.x / TS), y0 = Math.floor(pl.y / TS);
        for (let r = 0; r < 120; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = x0 + dx, ty = y0 + dy;
          let ok = true;
          for (let k = 0; k < n && ok; k++) {
            const x = (tx + k + 0.5) * TS, y = (ty + 0.5) * TS;
            ok = liquid ? G.World.isLiquid(x, y) : (G.World.isFree ? G.World.isFree(x, y) : !G.World.isWall(x, y)) && !G.World.isLiquid(x, y);
            for (const oy of [-TS, TS]) if (ok && !liquid && (G.World.isLiquid(x, y + oy) || G.World.isWall(x, y + oy))) ok = false;
          }
          if (ok) return { x: (tx + 0.5) * TS, y: (ty + 0.5) * TS };
        }
        return null;
      };
    });
    // Holds → for `ms` from the start of a row; the distance walked, and whether it counted as in the liquid.
    const walk = async (liquid, ms = 600) => {
      const at = await page.evaluate(l => { const p = __row(l); if (p) { const pl = G.Game.player; pl.x = p.x; pl.y = p.y; pl.svx = pl.svy = 0; } return p; }, liquid);
      if (!at) return { none: true };
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__x0 = G.Game.player.x; window.__wet = 0; window.__dry = 0;
        (function look() { const pl = G.Game.player; if (!pl || window.__x0 == null) return; pl.inLiquid ? __wet++ : __dry++; requestAnimationFrame(look); })(); });
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(ms);
      await page.keyboard.up('ArrowRight');
      return page.evaluate(() => { const r = { d: Math.round(G.Game.player.x - __x0), wet: __wet, dry: __dry }; window.__x0 = null; return r; });
    };
    const ratio = async () => {
      const land = await walk(false), wet = await walk(true);
      return { land: land.d, water: wet.d, k: land.d ? +(wet.d / land.d).toFixed(2) : null, inLiquid: wet.wet > wet.dry, none: land.none || wet.none };
    };

    console.log('1. Lab, water');
    for (const [dex, name, fly] of [[16, 'Pidgey', true], [6, 'Charizard', true], [4, 'Charmander', false]]) {
      const r = await page.evaluate(([d]) => __run(true, d, 0), [dex]);
      const m = await ratio();
      if (fly) check(r.lab && r.kind === 'water' && m.k >= 0.9 && !m.inLiquid, `${name} (${r.types.join('/')}) flies over water at full speed`, { ...r, ...m });
      else check(r.lab && m.k > 0.45 && m.k < 0.75 && m.inLiquid, `${name} (${r.types.join('/')}) is still slowed in water`, { ...r, ...m });
    }

    console.log('2. Lab, swamp');
    {
      const r = await page.evaluate(() => __run(true, 16, 6));
      const m = await ratio();
      check(r.kind === 'swamp' && m.k >= 0.9 && !m.inLiquid, 'Pidgey flies over swamp at full speed', { ...r, ...m });
    }

    console.log('3. Outside the Lab');
    {
      const r = await page.evaluate(() => __run(false, 16, 0));
      const m = await ratio();
      check(!r.lab && m.k > 0.45 && m.k < 0.75 && m.inLiquid, 'Pidgey outside the Lab is slowed in water as before', { ...r, ...m });
    }

    console.log('4. Lab, lava');
    {
      const r = await page.evaluate(() => __run(true, 16, 2));
      const hurt = await page.evaluate(async () => {
        const pl = G.Game.player, p = __row(true, 2);
        if (!p) return null;
        pl.god = false; pl.hp = pl.maxHp; pl.invuln = 0;
        const hold = () => { if (G.Game.player !== pl || window.__lava) return; pl.x = p.x; pl.y = p.y; requestAnimationFrame(hold); };
        hold();
        await new Promise(r => setTimeout(r, 1500));
        window.__lava = true;
        const out = { hp: pl.hp, max: pl.maxHp, inLiquid: pl.inLiquid };
        pl.god = true; pl.hp = pl.maxHp;
        return out;
      });
      check(r.kind === 'lava' && hurt && hurt.hp < hurt.max && hurt.inLiquid, 'a Flying type over lava still gets burned', { ...r, ...hurt });
    }
    check(!errs.length, 'no page errors', errs.slice(0, 3));
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll fly-over-water checks passed');
  process.exit(failures ? 1 : 0);
})();
