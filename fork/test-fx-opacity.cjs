#!/usr/bin/env node
// Move effect opacity (js/fork/fx-opacity.js), in headless Edge on dev.html, as a guest:
//
//   python -m http.server 8123          (in the repo root)
//   node fork/test-fx-opacity.cjs [base-url]
//
// The canvas alpha actually used when each thing is drawn (CanvasRenderingContext2D spies):
//   1. Settings → Graphics has "Your move effects" (100%) and "Teammates' move effects" (60%) sliders.
//   2. Your effects at 30%: your shots and the particles of your casts never draw above 0.3; an
//      enemy's shot still draws at full; a damage number too.
//   3. A teammate's shot and the particles of a teammate's cast (ghostCast): never above 0.6.
//   4. Back to 100%: your shots at full again. Nothing is lost or drawn twice (same counts).
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
    await page.waitForFunction(() => G.DB.save && G.FxOpacity, null, { timeout: 30000 });
    await page.evaluate(() => { const s = G.DB.save; s.owned[4] = { at: Date.now() }; s.partner = 4; s.starter = 4; G.DB.commit(); G.Flow.goMenu(); });

    console.log('1. The sliders');
    const rows = await page.evaluate(() => {
      document.getElementById('btn-settings').click(); document.querySelector('#set-tabs [data-t="gfx"]').click();
      return true;
    }).then(() => page.waitForTimeout(300)).then(() => page.evaluate(() => {   // its handlers and the translation come a moment later
      const a = document.getElementById('set-fxMine'), b = document.getElementById('set-fxMates');
      const out = a && b && { mine: a.value, mates: b.value, text: document.getElementById('set-body').textContent };
      a.value = 30; a.dispatchEvent(new Event('input'));
      out.after = G.Settings.get('fxMine');
      G.SettingsUI.close();
      return out;
    }));
    check(rows && rows.mine === '100' && rows.mates === '60' && /Your move effects/.test(rows.text) && /Teammates' move effects/.test(rows.text) && rows.after === 0.3,
      'both sliders (100% and 60%), and moving yours sets it to 30%', rows);

    await page.evaluate(() => G.Game.startRun(null, { dex: 4, shiny: false }));
    await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player, null, { timeout: 15000 });
    await page.evaluate(() => { G.Spawner.update = () => {}; const p = G.Game.player; (function alive() { p.invuln = 99; p.hp = p.maxHp; requestAnimationFrame(alive); })(); });
    await page.waitForTimeout(3300);

    // In the page: the highest alpha used while drawing each kind of thing in one frame.
    const measure = () => page.evaluate(async () => {
      const A = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
      const P = CanvasRenderingContext2D.prototype, di = P.drawImage, fr = P.fillRect, ft = P.fillText;
      const pl = G.Game.player, list = G.Projectiles.all();
      const out = { me: 0, mate: 0, enemy: 0, fxMe: 0, fxMate: 0, text: 0, nMe: 0 };
      let cur = null;
      const pd = G.Projectiles.draw, fd = G.FX.draw;
      // Which projectile is being drawn: their VFX.draw calls come in list order, per pass.
      const vd = G.VFX.draw;
      G.VFX.draw = function (ctx, shape, pal, x, y) {
        const p = cur === 'proj' && list.find(q => Math.abs(q.x - x) < 0.01 && Math.abs(q.y - G.LIFT - y) < 0.01);
        const r = vd.apply(this, arguments);
        if (p) { const k = p.friendly ? (p.owner === pl ? 'me' : 'mate') : 'enemy'; out[k] = Math.max(out[k], window.__lastA || 0); if (k === 'me') out.nMe++; }
        return r;
      };
      P.drawImage = function () { window.__lastA = A.get.call(this); return di.apply(this, arguments); };
      const rects = [];
      P.fillRect = function (x, y) { if (cur === 'fx') rects.push([x, y, A.get.call(this)]); return fr.apply(this, arguments); };
      P.fillText = function () { if (cur === 'fx') out.text = Math.max(out.text, A.get.call(this)); return ft.apply(this, arguments); };
      G.Projectiles.draw = function () { cur = 'proj'; try { return pd.apply(this, arguments); } finally { cur = null; } };
      // FX: only one tag present at a time (see below), so every fillRect in that frame is that tag's.
      G.FX.draw = function () { cur = 'fx'; try { return fd.apply(this, arguments); } finally { cur = null; } };
      await new Promise(r => requestAnimationFrame(r));     // one frame (the game's loop runs first)
      G.VFX.draw = vd; P.drawImage = di; P.fillRect = fr; P.fillText = ft; G.Projectiles.draw = pd; G.FX.draw = fd;
      // Each particle tagged at birth: the alpha of the square drawn where it is.
      const PX = G.Sprites.PX, snap = v => Math.round(v / PX) * PX;
      for (const q of G.FX.lists.parts) {
        const k = q.tg === 'me' ? 'fxMe' : q.tg === 'mate' ? 'fxMate' : null;
        const r = k && rects.find(r => r[0] === snap(q.x) && r[1] === snap(q.y));
        if (r) out[k] = Math.max(out[k], r[2]);
      }
      return out;
    });
    const setup = () => page.evaluate(() => {
      const pl = G.Game.player;
      G.Projectiles.clear(); G.FX.clear(); G.EnemyMgr.clear();
      const mk = (owner, friendly, dx) => G.Projectiles.spawn({ x: pl.x + dx, y: pl.y - 40, vx: 0, vy: 0, dmg: 0, r: 6, life: 30, friendly, owner,
        vis: G.VFX.forType('fire'), color: '#f00', hits: new Set() });
      mk(pl, true, -60); mk({ id: 'mate' }, true, 0); mk(null, false, 60);
    });

    console.log('2. Your effects at 30%');
    await setup();
    // Your cast's particles: an aura in your slot, cast by the real G.Combat.tick (tagged "me").
    await page.evaluate(async () => {
      const pl = G.Game.player, m = G.Moves.instance('discharge', 1);
      G.FX.clear(); pl.slots = [[m]]; pl.moves = [m]; pl.active = 0;
      const def = G.Enemies.cast[0].list[0], e = new G.Enemy(def, pl.x + 30, pl.y, G.Enemies.scale(0)); e.hp = e.maxHp = 1e7; e.spd = 0; G.EnemyMgr.add(e);
      for (let i = 0; i < 120 && !G.FX.lists.parts.some(q => q.tg === 'me'); i++) await new Promise(r => requestAnimationFrame(r));
      pl.slots = []; pl.moves = [];
    });
    await page.waitForTimeout(50);
    const m1 = await measure();
    check(m1.me > 0 && m1.me <= 0.301 && m1.nMe >= 1, 'your shot draws at 0.3 at most', m1);
    check(m1.enemy > 0.99, 'an enemy\'s shot still draws at full', m1.enemy);
    check(m1.fxMe > 0 && m1.fxMe <= 0.301, 'the particles of your cast draw at 0.3 at most', m1.fxMe);
    await page.evaluate(() => { G.FX.clear(); G.FX.dmgText(G.Game.player.x, G.Game.player.y - 50, '123', '#fff'); });
    const m2 = await measure();
    check(m2.text > 0.99, 'a damage number is untouched', m2.text);

    console.log('3. Teammates at 60%');
    await page.evaluate(() => {
      G.FX.clear();
      // A teammate's cast (ghostCast) of Ember, at you as the "mate": its particles are tagged mate.
      G.Combat.ghostCast(G.Game.player, 'ember', 1, 0, false);
      const pl = G.Game.player; G.Combat.ghostCast(pl, 'discharge', 1, 0, false);   // an aura: a burst of particles
    });
    const m3 = await measure();
    check(m3.mate > 0 && m3.mate <= 0.601, 'a teammate\'s shot draws at 0.6 at most', m3.mate);
    check(m3.fxMate > 0 && m3.fxMate <= 0.601, 'and the particles of a teammate\'s cast too', m3.fxMate);

    console.log('4. Back to 100%');
    await page.evaluate(() => { G.Settings.set('fxMine', 1); G.Settings.set('fxMates', 1); });
    await setup();
    const n0 = await page.evaluate(() => G.Projectiles.all().length);
    const m4 = await measure();
    const n1 = await page.evaluate(() => G.Projectiles.all().length);
    check(m4.me > 0.99 && m4.nMe === 1 && n0 === 3 && n1 === 3, 'your shot at full again, drawn once, the list intact', { m4, n0, n1 });
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.error(e); failures++; }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll effect opacity checks passed');
  process.exit(failures ? 1 : 0);
})();
