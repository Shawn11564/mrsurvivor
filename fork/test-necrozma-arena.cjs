#!/usr/bin/env node
// A legendary boss never ends up where you can't walk to (TODO 120; a player saw Necrozma "jump over the
// wall onto the other side and sit there until the time ran out"). Headless Edge on dev.html, fake clock,
// the real fights and the real enemy AI (js/entities/enemy.js: walk, dash, leap):
//
//   node fork/serve.cjs                 (in the repo root)
//   node fork/test-necrozma-arena.cjs [base-url] [--rounds N] [--only raid|rift|wild]
//
//   raid  the Necrozma raid (js/fork/lab/necrozma.js), its whole 3:30
//   rift  a rift (js/systems/rift.js) with Necrozma as its legendary, its whole 2:00
//   wild  Necrozma as a wild legendary on the open map (js/fork/lab/wild-legends.js), 2:00
//
// You can't be hurt and hop to a random open spot every 2.5 s, so the boss chases, dashes and leaps at you
// from every side, past pillars and rocks. Game speed x2 makes each frame the game's largest step (1/30 s,
// a slow phone). After every frame the boss's centre must be on open ground joined to where you stand.
const { chromium, pastStart, BASE: DEF } = require('./pw.cjs');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = args.find((a, i) => !a.startsWith('--') && !['--rounds', '--only'].includes(args[i - 1])) || DEF;
const ROUNDS = +opt('--rounds') || 3;
const MODES = opt('--only') ? [opt('--only')] : ['raid', 'rift', 'wild'];

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
    await page.clock.install();
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await pastStart(page, '#btn-guest');
    await page.locator('#btn-guest').click();
    await page.waitForFunction(() => G.DB.save && G.Necrozma && G.WildLegends);
    await page.evaluate(() => {
      const s = G.DB.save; s.owned[4] = { at: 1 }; s.partner = s.starter = 4; G.DB.commit();
      G.Settings.set('underdogLadder', false); G.Settings.set('lab', false);
    });

    for (const mode of MODES) {
      console.log(mode);
      for (let n = 0; n < ROUNDS; n++) {
        await page.evaluate(() => {
          if (G.Game.state !== 'ui') { G.UI.hideAll(); G.Game.quit(); }
          G.UI.hideAll(); G.Flow.goMenu(); G.Game.startRun(null, { dex: 4, shiny: false });
        });
        await page.clock.runFor(500);
        await page.waitForFunction(() => G.Game.state === 'playing');
        const info = await page.evaluate(([mode, n]) => {
          const pl = G.Game.player, ts = G.World.TS;
          pl.god = true; pl.xpMul = 0; pl.moves.length = 0; pl.slots.length = 0;   // no damage: the fight runs its time
          G.Spawner.update = () => {}; G.EnemyMgr.clear(); G.LabPower.reset();
          const ctx = { mode, ts, bad: [], frames: 0, hopT: 0, t: 0 };
          if (mode === 'raid') {
            pl._labEternatus = 1; G.Game.debugTime(2700); G.Judgment.update(0, pl, 2700);
            const R = G.Necrozma.raid;
            Object.assign(ctx, { cx: R.x, cy: R.y, reach: 18, hopR: 12, len: 215,
              boss: () => G.EnemyMgr.get(R.bossId), on: () => G.Necrozma.raid === R && R.phase === 'fight' });
          } else if (mode === 'rift') {
            G.Game.debugTime(1200);
            const leg = G.DEX.filter(p => p.leg && p.dex !== 800);
            leg.forEach(p => { p.leg = false; });                      // the rift's legendary: Necrozma
            G.Rift.debugArena('psychic');
            leg.forEach(p => { p.leg = true; });
            const e0 = G.EnemyMgr.all().find(e => e.legend);
            Object.assign(ctx, { cx: e0.x, cy: e0.y + ts * 3.5, reach: 14, hopR: 9, len: 125,
              boss: () => G.EnemyMgr.all().find(e => e.legend && !e.dead), on: () => G.Rift.inArena && !!ctx.boss() });
            ctx.dex = e0.dex;
          } else {
            G.Game.debugTime(1200);
            const e0 = G.WildLegends.spawn(800);
            e0.x = pl.x + 300; e0.y = pl.y; G.World.collide(e0);
            Object.assign(ctx, { cx: pl.x, cy: pl.y, reach: 45, hopR: 14, len: 120,
              boss: () => (e0.dead ? null : e0), on: () => !e0.dead && ctx.t < 120 });
            ctx.dex = e0.dex;
          }
          const ctr = [Math.floor(ctx.cx / ts), Math.floor(ctx.cy / ts)];
          // Open ground (not wall) joined 4-way to the tile at (px, py), within `reach` tiles of the centre.
          ctx.region = (px, py) => {
            const sx = Math.floor(px / ts), sy = Math.floor(py / ts), seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
            while (q.length) {
              const [x, y] = q.pop();
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
                if (seen.has(k) || Math.hypot(nx - ctr[0], ny - ctr[1]) > ctx.reach) continue;
                if (G.World.isWall(nx * ts + ts / 2, ny * ts + ts / 2)) continue;
                seen.add(k); q.push([nx, ny]);
              }
            }
            return seen;
          };
          ctx.open = [...ctx.region(pl.x, pl.y)].map(k => k.split(',').map(Number))
            .filter(([x, y]) => Math.hypot(x - ctr[0], y - ctr[1]) < ctx.hopR && G.World.isFree(x * ts + ts / 2, y * ts + ts / 2, 14));
          let seed = 7 + n * 101;
          const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          ctx.reg = ctx.region(pl.x, pl.y);
          // After every frame: where's the boss?
          ctx.watch = () => {
            ctx.t += 1 / 30;
            const e = ctx.boss();
            if (!e || !ctx.on()) return;
            ctx.frames++;
            if (e.jump) return;                                  // mid-leap it's in the air
            const tx = Math.floor(e.x / ts), ty = Math.floor(e.y / ts), inWall = G.World.isWall(e.x, e.y);
            if ((inWall || !ctx.reg.has(tx + ',' + ty)) && ctx.bad.length < 6)
              ctx.bad.push({ t: +ctx.t.toFixed(2), at: [tx - ctr[0], ty - ctr[1]], inWall, cast: e.ai && e.ai.cast && e.ai.cast.id });
          };
          ctx.hop = () => {
            if ((ctx.hopT -= 1 / 30) > 0) return;
            ctx.hopT = 2.5;
            const [x, y] = ctx.open[Math.floor(rnd() * ctx.open.length)];
            pl.x = x * ts + ts / 2; pl.y = y * ts + ts / 2;
            ctx.reg = ctx.region(pl.x, pl.y);
          };
          window.__ctx = ctx;
          G.Game.debugSpeed(2);
          const tick = () => { if (window.__ctx !== ctx || !ctx.on()) return; requestAnimationFrame(tick); ctx.hop(); ctx.watch(); };
          requestAnimationFrame(tick);
          const b = ctx.boss();
          return { dex: b && b.dex, r: b && Math.round(b.r), open: ctx.open.length, len: ctx.len, ai: b && b.ai && b.ai.melee };
        }, [mode, n]);
        for (let s = 0; s < info.len / 2 + 5; s++) {
          await page.clock.runFor(1000);
          if (!(await page.evaluate(() => window.__ctx.on()))) break;
        }
        const res = await page.evaluate(() => { const c = window.__ctx; G.Game.debugSpeed(1); return { frames: c.frames, t: +c.t.toFixed(1), bad: c.bad }; });
        const all = Object.assign({}, info, res);
        check(all.frames > 1000 && !all.bad.length, `${mode} ${n + 1}: the boss stays on ground you can reach`, all);
      }
    }
    check(!errors.length, 'no page errors', errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
