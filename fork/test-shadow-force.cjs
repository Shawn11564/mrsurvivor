#!/usr/bin/env node
// Shadow Force (Giratina's signature) is not a copy of Phantom Force: it chains (chainLeap in
// js/fork/lab/kinds.js, `chain` in js/fork/lab/lab-moves.js). Headless Edge on dev.html, Lab run:
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-shadow-force.cjs [base-url]
//
// Three dummies 150 px apart, on open ground:
//   1. Phantom Force strikes once: only the enemy it lands on.
//   2. Shadow Force strikes all three in turn, and Giratina can't be hit until the last strike.
//   3. Only Giratina learns Shadow Force; Phantom Force is the common Ghost move.
//   4. No evolved move is named after a real Lab move (js/fork/evo-names.js): Shadow Ball evolves into
//      Poltergeist, Ominous Wind into Infernal Parade, Fire Spin into Fiery Dance, Fly (Lab) into
//      Dual Wingbeat... (upstream: Phantom Force, Shadow Force, Sacred Fire; Sky Attack) — none clash.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.LabMoves, null, { timeout: 30000 });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });
    const strike = id => page.evaluate(async id => {
      G.Settings.set('lab', true); G.Settings.set('underdogLadder', false); G.DB.grant(487, 't');
      if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
      G.UI.hideAll(); G.Game.toUI();
      G.Game.startRun(null, { dex: 487 });
      const pl = G.Game.player; pl.xpMul = 0;
      for (const n of ['Spawner', 'Events', 'Rift', 'Hazards']) G[n].update = () => {};
      G.Weather.clear();
      // Open ground, so nothing solid stops the leaps.
      const ok = (x, y) => { for (let a = 0; a < 6.283; a += 0.4) for (let r = 0; r <= 420; r += 16) if (!G.World.isFree(x + Math.cos(a) * r, y + Math.sin(a) * r, pl.r, true)) return false; return true; };
      if (!ok(pl.x, pl.y)) outer: for (let r = 64; r < 8000; r += 64) for (let a = 0; a < 6.283; a += 0.5) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (ok(x, y)) { pl.x = x; pl.y = y; break outer; } }
      pl.slots.length = 0; pl.moves.length = 0; pl.maxMoves = 4; G.EnemyMgr.clear(); G.Combat.clearFields();
      const ds = [0, 1, 2].map(i => {
        const e = new G.Enemy({ dex: 19, name: 'D' + i, hp: 1e6, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, pl.x + 120 + i * 150, pl.y, { hp: 1, spd: 1, dmg: 1 }, false);
        e.types = ['none']; G.EnemyMgr.add(e); return e;
      });
      pl.addMove(id);
      const m = pl.moves[0];
      // Untouchable: from the first leap until it's over, a hit would do nothing.
      let leapT = 0, hurtWhileLeaping = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 4000) {
        if (pl._labLeap) { leapT++; const h = pl.hp; pl.hurt(5, null, false, 'physical'); if (pl.hp < h) hurtWhileLeaping++; pl.hp = h; }
        if (ds.every(e => e.hp < e.maxHp)) break;
        await new Promise(r => setTimeout(r, 25));
      }
      await new Promise(r => setTimeout(r, 300));
      const hit = ds.filter(e => e.hp < e.maxHp).length;
      pl.moves.length = 0;
      return { hit, leapT, hurtWhileLeaping };
    }, id);

    console.log('1. Phantom Force');
    const pf = await strike('phantom-force');
    check(pf.hit === 1, 'strikes once: only the enemy it lands on', pf);

    console.log('2. Shadow Force');
    const sf = await strike('shadow-force');
    check(sf.hit === 3, 'strikes all three enemies in turn', sf);
    check(sf.leapT > 0 && sf.hurtWhileLeaping === 0, 'and Giratina can\'t be hit until the last strike', sf);

    console.log('3. Who learns them');
    const who = await page.evaluate(() => {
      const sig = G.Moves.BY_ID['shadow-force'].sig, pfDef = G.Moves.BY_ID['phantom-force'];
      const learns = (dex, id) => G.LabMoves.find(m => m.id === id) && G.Lab.poolFor(G.DEX_BY[dex]).includes(id);
      return { sig: sig && sig.dex, pfSig: !!pfDef.sig, giratina: learns(487, 'shadow-force'), gengar: learns(94, 'shadow-force'), descs: [G.Moves.BY_ID['shadow-force'].desc, pfDef.desc] };
    });
    check(JSON.stringify(who.sig) === '[487]' && !who.pfSig && who.giratina && !who.gengar, 'Shadow Force is Giratina\'s alone; Phantom Force is not a signature', who);
    check(who.descs[0] !== who.descs[1] && /three times/.test(who.descs[0]), 'their descriptions say how they differ', who.descs);   // up to three strikes, each on everything where you land
    console.log('4. No evolution named after another move');
    const ev = await page.evaluate(() => {
      const en = (s) => G.T(s, 'move');
      const lab = new Map(G.LabMoves.map(m => [m.name, m]));
      const clash = Object.entries(G.Moves.EVO).filter(([id, e]) => e && e[0] && !String(e[0]).includes('★') && lab.has(en(e[0])) && lab.get(en(e[0])).id !== id)
        .map(([id, e]) => id + ' -> ' + en(e[0]));
      return { sb: en(G.Moves.EVO['shadow-ball'][0]), ow: en(G.Moves.EVO['ominous-wind'][0]), fs: en(G.Moves.EVO['fire-spin'][0]),
        fly: en(G.Moves.EVO['fly'][0]), es: G.Moves.EVO['fire-spin'][0], clash };
    });
    check(ev.sb === 'Poltergeist' && ev.ow === 'Infernal Parade', 'Shadow Ball evolves into Poltergeist, Ominous Wind into Infernal Parade (not Phantom/Shadow Force)', ev);
    check(ev.fs === 'Fiery Dance' && ev.es === 'Danza Llama' && ev.fly === 'Dual Wingbeat', 'Fire Spin evolves into Fiery Dance (Danza Llama), Fly into Dual Wingbeat', ev);
    check(!ev.clash.length, 'no evolved move shares its name with a real Lab move', ev.clash);
    check(!errs.length, 'no page errors', errs);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll Shadow Force checks passed');
  process.exit(failures ? 1 : 0);
})();
