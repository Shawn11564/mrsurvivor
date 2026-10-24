#!/usr/bin/env node
// Stat-boosting moves on the same stat stack, each with its own timer (Player.addBuff, js/entities/player.js).
// It drives dev.html in headless Edge; the moves are cast by the real combat code (G.Combat.tick
// from the game loop), only the setup is scripted (which moves are in the slots, no enemies).
//
//   node fork/serve.cjs                  (or python -m http.server 8123, in the repo root)
//   node fork/test-buff-stack.cjs [base-url]
//
// Checks:
//   1. Swords Dance + Dragon Dance (both Attack) add up: 5 + 5 stacks = ATK ×10 and the damage
//      multiplier of both (they used to share one Attack boost capped at 5 stacks).
//   2. Each has its own timer: with Swords Dance stopped and Dragon Dance still casting, the two
//      slots show different times, and Swords Dance's stacks run out on their own while Dragon
//      Dance's stay (the slot timer of the stopped one goes away).
//   3. Lab: Bulk Up (Attack + Defense) stacks with Swords Dance the same way.
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

/** A run (Lab or not) with Mew, no enemies, kept alive. */
async function start(page, lab) {
  await page.evaluate(async on => {
    const s = G.DB.save;
    s.owned[151] = s.owned[151] || { at: 1 };
    s.partner = 151; G.Settings.set('lab', on);
    const until = async (f, ms = 15000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await new Promise(r => setTimeout(r, 40)); };
    if (G.Game.player && G.Game.state !== 'ui') {
      G.Game.quit();
      await until(() => G.UI.isOpen('scr-over'));
      document.getElementById('btn-again').click();
      await until(() => G.Game.state === 'ui');
    }
    G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun();
    await until(() => G.Game.state === 'playing' && G.Game.player, 20000);
    for (const k of ['Spawner', 'Events', 'Rift', 'Hazards', 'Judgment']) if (G[k]) G[k].update = () => {};
    G.LevelUp.offer = () => [];
    G.EnemyMgr.clear();
    const pl = G.Game.player;
    pl.xpMul = 0; pl.labAbility = null;
    (function loop() { const p = G.Game.player; if (p) { p.invuln = 99; p.hp = p.maxHp; } requestAnimationFrame(loop); })();
  }, lab);
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 30000 });
}

/**
 * Two buff moves, each in its own slot (both cast from any slot, as evolved ones do). The first
 * casts alone until it has all its stacks, then the second joins; then the first stops.
 */
function twoBuffs([a, b, stat, watchMs]) {
  const pl = G.Game.player, frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const wait = async (f, ms) => { const end = performance.now() + ms; while (performance.now() < end && !f()) await frame(); return !!f(); };
  for (const k in pl.buffs) Object.assign(pl.buffs[k], { n: 0, t: 0 }, pl.buffs[k].src ? { src: {} } : {});
  const ma = G.Moves.instance(a, 1), mb = G.Moves.instance(b, 1);
  pl.slots = [[ma], [mb]]; pl.moves = [ma, mb]; pl.active = 0; pl.passiveBuffs = true;
  const B = pl.buffs[stat], phys = { cat: 'physical' }, base = pl.atkFor(phys) / (1 + B.n * B.amount);
  const out = { a: ma.stacks, b: mb.stacks };
  return (async () => {
    ma.t = 0; mb.t = 1e9;
    await wait(() => B.n >= ma.stacks, 8000);
    out.nA = B.n;
    mb.t = 0;
    await wait(() => B.n >= ma.stacks + mb.stacks, 8000);
    await frame();
    out.nBoth = B.n;
    out.mul = pl.atkFor(phys) / base;
    out.others = Object.fromEntries(Object.entries(pl.buffs).filter(([k, v]) => k !== stat && v.n > 0).map(([k, v]) => [k, v.n]));
    // Stop the first one; the second keeps casting. Watch the slot timers ("6.2s") the HUD draws.
    ma.t = 1e9;
    const P = CanvasRenderingContext2D.prototype, orig = P.fillText, frames = [];
    let cur = [];
    P.fillText = function (s) { if (/^\d+(\.\d)?s$/.test(String(s))) cur.push(String(s)); return orig.apply(this, arguments); };
    const end = performance.now() + watchMs;
    while (performance.now() < end) { await frame(); frames.push({ ms: performance.now(), n: B.n, secs: cur }); cur = []; }
    P.fillText = orig;
    ma.t = mb.t = 1e9;
    out.differ = frames.some(f => f.secs.length === 2 && f.secs[0] !== f.secs[1]);
    const late = frames.slice(-20);
    out.lateN = late.map(f => f.n);
    out.lateSecs = late.map(f => f.secs.length);
    pl.slots = []; pl.moves = []; pl.passiveBuffs = false;
    return out;
  })();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.DB.playAsGuest && G.Game && G.EnemyMgr, null, { timeout: 60000 });
  await pastStart(page, '#btn-guest');
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 15000 });

  // ---------------- 1-2. Swords Dance + Dragon Dance ----------------
  console.log('Swords Dance + Dragon Dance: they stack, each with its own timer');
  await start(page, false);
  const r = await page.evaluate(twoBuffs, ['swords-dance', 'dragon-dance', 'patk', 9000]);
  const want = r.a + r.b, mul = 1 + r.a * 0.13 + r.b * 0.11;
  check(r.nBoth === want, `ATK stacks reach ${want} with both (${r.a} + ${r.b}); got ${r.nBoth} (Swords Dance alone: ${r.nA})`);
  check(Math.abs(r.mul - mul) < 0.01, `physical damage ×${mul.toFixed(2)} with both; got ×${r.mul.toFixed(2)}`);
  check(r.differ, 'with Swords Dance stopped, its slot and Dragon Dance\'s show different times');
  check(r.lateN.every(n => n === r.b), `Swords Dance's stacks run out on their own, Dragon Dance's ${r.b} stay (last frames: ${[...new Set(r.lateN)].join(', ')})`);
  check(r.lateSecs.every(n => n === 1), `only Dragon Dance's slot still shows a timer (timers per frame: ${[...new Set(r.lateSecs)].join(', ')})`);

  // ---------------- 3. Lab: Bulk Up + Swords Dance ----------------
  console.log('Lab: Bulk Up + Swords Dance stack');
  await start(page, true);
  const lab = await page.evaluate(() => G.Lab.active && !!G.Moves.BY_ID['bulk-up']);
  check(lab, 'Lab run with Bulk Up');
  if (lab) {
    const l = await page.evaluate(twoBuffs, ['bulk-up', 'swords-dance', 'patk', 500]);
    check(l.nBoth === l.a + l.b, `ATK stacks reach ${l.a + l.b} with both; got ${l.nBoth} (Bulk Up alone: ${l.nA})`);
    check(Math.abs(l.mul - (1 + l.a * 0.1 + l.b * 0.13)) < 0.02, `physical damage ×${(1 + l.a * 0.1 + l.b * 0.13).toFixed(2)}; got ×${l.mul.toFixed(2)}`);
    check(l.others.def === l.a, `Bulk Up's Defense stacks too (${l.a}); got ${l.others.def}`);
  }

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
