#!/usr/bin/env node
// Type-matchup hints, checked in the game in headless Edge. It drives dev.html: same
// source files as the build, but G is reachable (the build seals it in a closure).
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-gameplay.cjs [base-url] [screenshot-dir]
//
// Checks:
//   1. Over each enemy, the arrow drawn by Enemy.draw (js/entities/enemy.js, typeMark)
//      matches the type chart for the player's active attack: an up arrow when it hits
//      hard, a down arrow when resisted, each with the games' multiplier inside
//      ('eff:up:x2', 'eff:down:1/2'...), nothing when neutral or when the slot is a buff.
//   2. HUD, with a real mouse: hovering a move or the held item draws its description
//      (name, type, category, damage per hit; js/ui/hud.js drawTip); dragging a move onto
//      another swaps them (js/core/touch.js drag, Player.swapSlots) and the order survives
//      learning a move; a plain click still selects; holding left click on the map aims
//      at the cursor (Touch.mapHeld, Player.handAim).
//   3. Gacha: Skip during a ×10 pull goes straight to the results (js/ui/gacha-ui.js, G.Slots.stop),
//      and the next pull still plays normally.
//   4. Level-up cards: a new attack of your Pokémon's type on its good side
//      (physical/special) is flagged `own` (js/systems/levelup.js) and rendered as
//      .card.stab with the "Tu tipo" chip (js/ui/run-ui.js); other cards are not.
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.argv[3] || null;

let failures = 0;
const check = (ok, what) => { console.log((ok ? '  PASS ' : '  FAIL ') + what); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  // TEST_VIEW=1920x1080 to see the screenshots at another window size.
  const [vw, vh] = (process.env.TEST_VIEW || '1100x700').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.G && G.DB && G.DB.playAsGuest && G.Game && G.EnemyMgr, null, { timeout: 30000 });
  await pastStart(page, '#btn-guest');
  // Play as guest (in-memory save, nothing is written); a new save opens the starter test.
  await page.click('#btn-guest');
  await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });

  // Charmander: fire, starts with a fire move.
  await page.evaluate(() => { G.DB.save.partner = 4; G.DB.save.owned[4] = G.DB.save.owned[4] || { at: Date.now() }; G.MenuUI.open(); });

  console.log('Collection: Power sort');
  await page.click('#scr-menu [data-go="dex"]');
  await page.waitForSelector('#scr-dex', { state: 'visible' });
  const powLabel = await page.evaluate(() => G.T('Poder'));
  await page.click(`#dex-sort .chip:text-is("${powLabel}")`);
  const pow = await page.evaluate(() => {
    const nums = [...document.querySelectorAll('#dex-grid .cell .no')].map(n => parseInt(n.textContent, 10));
    const bst = nums.map(d => G.DEX_BY[d].bst);
    const sorted = bst.every((v, i) => i === 0 || bst[i - 1] >= v);
    const top = Math.max(...G.DEX.filter(p => p.gen === 1).map(p => p.bst));
    return { n: nums.length, sorted, first: nums.slice(0, 3).map(d => G.DEX_BY[d].name + ' ' + G.DEX_BY[d].bst), firstBst: bst[0], top };
  });
  check(pow.n > 10 && pow.sorted, `"${powLabel}" sorts the grid by base stat total, highest first (${pow.n} shown: ${pow.first.join(', ')}...)`);
  check(pow.firstBst === pow.top, 'the first Pokémon has the highest total of the generation shown');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'dex-power.png') });

  console.log('Upgrades: open on the partner');
  const openUpg = async () => {
    await page.evaluate(() => G.MenuUI.open());
    await page.click('#scr-menu [data-go="upgrades"]');
    await page.waitForSelector('#scr-upgrades', { state: 'visible' });
    return page.evaluate(() => +document.getElementById('upg-mon').value);
  };
  await page.evaluate(() => { for (const d of [1, 7]) G.DB.save.owned[d] = G.DB.save.owned[d] || { at: Date.now() }; });
  const u1 = await openUpg();
  await page.selectOption('#upg-mon', '7');                         // look at another Pokémon, then leave
  const u2 = await openUpg();
  await page.evaluate(() => { G.DB.save.partner = 1; });            // new partner
  const u3 = await openUpg();
  check(u1 === 4 && u2 === 4 && u3 === 1, `Upgrades opens on the current partner every time (got ${u1}, ${u2} after viewing #7, ${u3} after switching partner to #1)`);
  await page.evaluate(() => { G.DB.save.partner = 4; });

  console.log('Gacha: Skip');
  await page.evaluate(() => { G.DB.save.tickets.t1 = 30; G.MenuUI.open(); });
  await page.click('#scr-menu [data-go="gacha"]');
  await page.waitForSelector('#pull-10:not([disabled])');
  await page.click('#pull-10');
  await page.waitForSelector('#pull-skip', { state: 'visible' });
  await page.waitForTimeout(300);                                   // mid slot-machine
  // Skip sits by the lever (x 152-166, y 74-98 of the 176×170 canvas): to its right when
  // the window has room, under it otherwise; always fully on screen.
  const sp = await page.evaluate(() => {
    const c = document.getElementById('slot').getBoundingClientRect(), b = document.getElementById('pull-skip').getBoundingClientRect();
    const k = c.width / 176, lever = { l: c.left + 152 * k, r: c.left + 166 * k, t: c.top + 74 * k, b: c.top + 98 * k };
    const right = b.left >= lever.r && b.left - c.right < 30 && b.top < lever.b && b.bottom > lever.t;
    const under = b.top >= lever.b - 1 && b.top - lever.b < 30 && Math.abs(b.right - c.right) < 2;
    return { right, under, onScreen: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight };
  });
  check((vw >= 688 ? sp.right : sp.under) && sp.onScreen,
    `Skip is ${vw >= 688 ? 'right of' : 'under'} the slot machine's lever, on screen (${JSON.stringify(sp)})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gacha-skip.png') });
  const t0 = Date.now();
  await page.click('#pull-skip');
  await page.waitForSelector('#pull-close', { state: 'visible', timeout: 3000 });
  const skipMs = Date.now() - t0;
  const sk = await page.evaluate(() => ({ cards: document.querySelectorAll('#pull-results .pcard').length,
    slotHidden: document.getElementById('slot-wrap').style.display === 'none',
    skipHidden: document.getElementById('pull-skip').classList.contains('hidden') }));
  check(sk.cards === 10 && sk.slotHidden && sk.skipHidden && skipMs < 1500,
    `Skip goes straight to the 10 results (${skipMs} ms; slot machine hidden, Skip button gone)`);
  await page.waitForTimeout(600);                                   // their 0.3 s "pop" entry
  const faded = await page.evaluate(() => [...document.querySelectorAll('#pull-results .pcard')].filter(c => +getComputedStyle(c).opacity < 0.99).length);
  check(faded === 0, `all skipped-to cards end fully visible (${faded} still faded)`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gacha-skipped.png') });
  // The slot machine still works after being cut short: a normal pull plays to the end.
  await page.click('#pull-close');
  await page.click('#pull-1');
  await page.waitForSelector('#pull-close', { state: 'visible', timeout: 20000 });
  const n1 = await page.evaluate(() => document.querySelectorAll('#pull-results .pcard').length);
  check(n1 === 1, 'a normal pull after a skip still plays through and shows its card');
  await page.click('#pull-close');

  await page.evaluate(() => G.Game.startRun());
  await page.waitForFunction(() => G.Game.state === 'playing' && G.Game.player && G.Game.player.activeMove(), null, { timeout: 30000 });

  // Leaving the pause: 3 s countdown with the world still frozen (js/game.js resumeRun).
  console.log('Pause: 3 s countdown before resuming');
  // Text as drawn, after translation (the game paints through G.I18n.rawCanvas).
  const canvasText = () => page.evaluate(() => new Promise(res => {
    const seen = [], o = G.I18n.rawCanvas;
    G.I18n.rawCanvas = function (c, k, t) { if (k === 'fillText') seen.push(String(t)); return o.apply(this, arguments); };
    setTimeout(() => { G.I18n.rawCanvas = o; res([...new Set(seen)]); }, 250);
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);                                   // keys are read on the next frame
  check(await page.evaluate(() => G.Game.state === 'paused' && G.UI.isOpen('scr-pause')), 'Esc pauses');
  await page.click('#btn-resume');
  const x0 = await page.evaluate(() => G.Game.player.x);
  const r0 = Date.now();
  await page.keyboard.down('KeyD');                                 // walking right is held all along
  await page.waitForTimeout(1200);
  let ct = await canvasText();
  const mid = await page.evaluate(() => ({ st: G.Game.state, x: G.Game.player.x, pause: G.UI.isOpen('scr-pause') }));
  check(mid.st === 'resuming' && !mid.pause && Math.abs(mid.x - x0) < 0.01 && ct.includes('Resuming…') && ct.some(t => /^[123]$/.test(t)),
    `Resume: pause screen closes, "Resuming…" with a ${ct.find(t => /^[123]$/.test(t))} counting down, and the Pokémon doesn't move yet (held D): ` + JSON.stringify({ st: mid.st, pause: mid.pause, moved: mid.x - x0, label: ct.includes('Resuming…') }));
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 5000 });
  const took = (Date.now() - r0) / 1000;
  await page.waitForTimeout(400);
  const x1 = await page.evaluate(() => G.Game.player.x);
  await page.keyboard.up('KeyD');
  check(took > 2.7 && took < 3.6 && x1 > x0 + 5, `play resumes after ${took.toFixed(1)} s and the Pokémon walks (moved ${Math.round(x1 - x0)} px)`);
  // Esc during the countdown goes back to the pause; Esc again resumes through the countdown too.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => ({ st: G.Game.state, pause: G.UI.isOpen('scr-pause') }));
  check(back.st === 'paused' && back.pause, 'Esc during the countdown goes back to the pause screen');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => G.Game.state === 'resuming'), 'Esc on the pause screen also resumes through the countdown');
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'resume-countdown.png') }); }
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 5000 });

  console.log('Enemy arrows');
  const enemies = await page.evaluate(async () => {
    const pl = G.Game.player;
    G.Game.debugSpeed(0);               // freeze the world; render keeps running
    G.EnemyMgr.clear();
    // One enemy of each kind of matchup against the active move's type.
    const atk = pl.activeMove().type;
    const want = { super: null, weak: null, neutral: null };
    for (const tier of G.Enemies.cast) for (const def of tier.list) {
      const types = (G.DEX_BY[def.dex] || {}).types || ['normal'];
      const lb = G.Types.label(G.Types.mult(atk, types)) || 'neutral';
      if (!want[lb]) want[lb] = def;
    }
    for (const t of G.Enemies.hordeTypes(600)) for (const def of G.Enemies.hordeDefs(t, 600)) {
      const lb = G.Types.label(G.Types.mult(atk, def.types || G.DEX_BY[def.dex].types)) || 'neutral';
      if (!want[lb]) want[lb] = def;
    }
    const out = {};
    let i = 0;
    for (const k in want) {
      if (!want[k]) continue;
      const e = new G.Enemy(want[k], pl.x - 70 + i++ * 70, pl.y - 50, G.Enemies.scale(0));
      G.EnemyMgr.add(e);
      // The games' multiplier, written the way the arrow shows it.
      const raw = e.types.reduce((a, t) => a * (G.Types.CHART[atk][t] ?? 1), 1);
      const txt = { 4: 'x4', 2: 'x2', 0.5: '1/2', 0.25: '1/4', 0: 'x0' }[raw];
      out[k] = { id: e.id, name: e.name, types: e.types, icon: txt && 'eff:' + (raw > 1 ? 'up' : 'down') + ':' + txt };
    }
    return { atk, out };
  });
  console.log('  active move type:', enemies.atk, JSON.stringify(enemies.out));

  // Record what Enemy.draw actually paints over each enemy over a few frames.
  const drawnFor = () => page.evaluate(() => new Promise(res => {
    // The arrow belongs to the enemy whose draw() is running when it's drawn (matching by
    // distance picked the neighbour for big Pokémon, whose arrow sits further out).
    const seen = {};
    const orig = G.Icons.draw, od = G.Enemy.prototype.draw;
    let cur = null;
    G.Enemy.prototype.draw = function () { cur = this; try { return od.apply(this, arguments); } finally { cur = null; } };
    G.Icons.draw = function (ctx, name) {
      if (name.startsWith('eff:') && cur) seen[cur.id] = name;
      return orig.apply(this, arguments);
    };
    setTimeout(() => { G.Icons.draw = orig; G.Enemy.prototype.draw = od; res(seen); }, 400);
  }));

  let seen = await drawnFor();
  const o = enemies.out;
  check(o.super && seen[o.super.id] === o.super.icon, `super-effective enemy (${o.super && o.super.types}) gets ${o.super && o.super.icon} (drew ${o.super && seen[o.super.id]})`);
  check(o.weak && seen[o.weak.id] === o.weak.icon, `resisting enemy (${o.weak && o.weak.types}) gets ${o.weak && o.weak.icon} (drew ${o.weak && seen[o.weak.id]})`);
  check(o.neutral && !seen[o.neutral.id], `neutral enemy (${o.neutral && o.neutral.types}) gets no arrow`);
  if (SHOTS) {
    const box = await page.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      const k = G.Camera.scale;          // crop 280×196 world units around the player
      return { x: r.x + r.width / 2 - 140 * k, y: r.y + r.height / 2 - 160 * k, width: 280 * k, height: 196 * k };
    });
    await page.screenshot({ path: path.join(SHOTS, 'type-arrows.png'), clip: box });
  }

  // Every arrow the game can show builds, and stays small (it sits beside the HP bar).
  const sizes = await page.evaluate(() => ['eff:up:x4', 'eff:up:x2', 'eff:down:1/2', 'eff:down:1/4', 'eff:down:x0']
    .map(n => { const c = G.Icons.canvas(n); return [n, c.width, c.height]; }));
  console.log('  arrow sizes: ' + sizes.map(([n, w, h]) => `${n} ${w}x${h}`).join(', '));
  check(sizes.every(([, w, h]) => w >= 9 && w <= 16 && h >= 9 && h <= 14), 'all arrows between 9 and 16 px');
  if (SHOTS) {
    // The five arrows side by side, 4x, for a look at the digits.
    await page.evaluate(() => {
      const names = ['eff:up:x4', 'eff:up:x2', 'eff:down:1/2', 'eff:down:1/4', 'eff:down:x0'];
      const cv = document.createElement('canvas'); cv.id = 'eff-sheet'; cv.width = 90; cv.height = 16;
      const c = cv.getContext('2d'); c.fillStyle = '#3a6b35'; c.fillRect(0, 0, 90, 16);
      names.forEach((n, i) => c.drawImage(G.Icons.canvas(n), 2 + i * 17, 2));
      cv.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:64px;image-rendering:pixelated;z-index:9999';
      document.body.appendChild(cv);
    });
    await page.locator('#eff-sheet').screenshot({ path: path.join(SHOTS, 'type-arrow-sheet.png') });
    await page.evaluate(() => document.getElementById('eff-sheet').remove());
  }

  // A buff-only active slot: no arrows anywhere.
  await page.evaluate(() => {
    const pl = G.Game.player;
    pl.addMove('swords-dance');
    pl.setActive(pl.slots.findIndex(s => s[0].id === 'swords-dance'));
  });
  seen = await drawnFor();
  check(Object.keys(seen).length === 0, 'buff active: no arrows');

  console.log('HUD: descriptions, drag to reorder, hold to aim');
  // Where hud.js puts slot i (desktop layout) and the item box, in screen px.
  const hud = () => page.evaluate(() => {
    const pl = G.Game.player, K = G.Settings.get('hudSize') || 1, S = 54 * K, GAP = 9 * K, n = Math.max(1, pl.slots.length);
    const sx = (innerWidth - (n * S + (n - 1) * GAP)) / 2, sy = innerHeight - S - 18;
    return { slots: pl.slots.map((g, i) => ({ x: sx + i * (S + GAP) + S / 2, y: sy + S / 2 })),
             item: { x: sx - S - 18 * K + S / 2, y: sy + S / 2 }, S };
  });
  // Text the tooltip draws (it paints with G.I18n.rawCanvas) over a few frames.
  const tipText = () => page.evaluate(() => new Promise(res => {
    const seen = [], orig = G.I18n.rawCanvas;
    G.I18n.rawCanvas = function (ctx, k, s) { if (k === 'fillText') seen.push(String(s)); return orig.apply(this, arguments); };
    setTimeout(() => { G.I18n.rawCanvas = orig; res([...new Set(seen)]); }, 300);
  }));
  await page.evaluate(() => { G.Game.player.equip('leftovers'); G.Game.player.setActive(0); });
  let pos = await hud();
  const want = await page.evaluate(() => {
    const pl = G.Game.player, m = pl.slots[0][0], it = G.Items.BY.leftovers;
    return { name: G.T(m.name, 'move'), type: G.T(G.U.TYPE_NAME[m.type]), cat: G.T(G.Stats.NAME[m.cat]),
             dmg: G.I18n.f('{x} por golpe', Math.round(m.dmg * pl.atkFor(m)).toLocaleString(G.I18n.locale)),
             desc0: G.T(m.desc).split(/\s+/)[0], item: G.T(it.name), itemDesc0: G.T(it.desc).split(/\s+/)[0] };
  });
  await page.mouse.move(pos.slots[0].x, pos.slots[0].y);
  let tt = await tipText();
  check(tt.includes(want.name) && tt.includes(want.type) && tt.includes(want.cat) && tt.includes(want.dmg) && tt.some(s => s.startsWith(want.desc0)),
    `hovering move 1 shows name, type, category, damage, description (${[want.name, want.type, want.cat, want.dmg].join(' / ')})`);
  await page.mouse.move(pos.item.x, pos.item.y);
  tt = await tipText();
  check(tt.includes(want.item) && tt.some(s => s.startsWith(want.itemDesc0)), `hovering the item shows ${want.item} and its description`);
  await page.mouse.move(vw / 2, 200);
  tt = await tipText();
  check(!tt.includes(want.name) && !tt.includes(want.item), 'no description away from the HUD');
  if (SHOTS) { await page.mouse.move(pos.slots[0].x, pos.slots[0].y); await page.waitForTimeout(100); await page.screenshot({ path: path.join(SHOTS, 'hud-tooltip.png') }); }

  // Drag slot 1 onto slot 2: they swap, the active move stays the same move.
  const before = await page.evaluate(() => ({ ids: G.Game.player.slots.map(g => g[0].id), active: G.Game.player.activeMove().id }));
  await page.mouse.move(pos.slots[0].x, pos.slots[0].y);
  await page.mouse.down();
  await page.mouse.move(pos.slots[0].x + 20, pos.slots[0].y - 10, { steps: 4 });
  await page.mouse.move(pos.slots[1].x, pos.slots[1].y, { steps: 6 });
  if (SHOTS) { await page.waitForTimeout(100); await page.screenshot({ path: path.join(SHOTS, 'hud-drag.png') }); }
  await page.mouse.up();
  const after = await page.evaluate(() => ({ ids: G.Game.player.slots.map(g => g[0].id), active: G.Game.player.activeMove().id, bind: G.Game.player.bind }));
  check(after.ids[0] === before.ids[1] && after.ids[1] === before.ids[0], `drag swaps the slots (${before.ids} -> ${after.ids})`);
  check(after.active === before.active, 'the active move is still the same move after the swap');
  check(after.bind[after.ids[0]] === 0 && after.bind[after.ids[1]] === 1, 'run shortcuts follow the new order (arrange() keeps it)');
  // Learning a move afterwards keeps the dragged order.
  const kept = await page.evaluate(() => { const pl = G.Game.player; pl.addMove('ember') || pl.addMove('flamethrower'); return pl.slots.map(g => g[0].id); });
  check(kept[0] === after.ids[0] && kept[1] === after.ids[1], 'learning a new move keeps the dragged order: ' + kept);
  // A plain click (no drag) still selects the slot.
  pos = await hud();
  const tgt = await page.evaluate(() => G.Game.player.active === 0 ? 1 : 0);
  await page.mouse.click(pos.slots[tgt].x, pos.slots[tgt].y);
  check(await page.evaluate(t => G.Game.player.active === t, tgt), 'clicking a slot without dragging selects it');

  // Icon size (Settings > Graphics): at each size the slots are where the mouse finds them,
  // the move icon is drawn at that size, and hover and click still work.
  for (const k of [0.8, 1.3, 1]) {
    await page.evaluate(k => G.Settings.set('hudSize', k), k);
    await page.waitForTimeout(150);
    pos = await hud();
    const drawn = await page.evaluate(() => new Promise(res => {
      const seen = [], o = G.Icons.draw;
      G.Icons.draw = function (c, name, x, y, size) { if (name.startsWith('move:')) seen.push(size); return o.apply(this, arguments); };
      setTimeout(() => { G.Icons.draw = o; res(seen); }, 200);
    }));
    await page.mouse.move(pos.slots[0].x, pos.slots[0].y);
    const tk = await tipText();
    const name0 = await page.evaluate(() => G.T(G.Game.player.slots[0][0].name, 'move'));
    const target = await page.evaluate(() => G.Game.player.active === 0 ? 1 : 0);
    await page.mouse.click(pos.slots[target].x, pos.slots[target].y);
    const sel = await page.evaluate(t => G.Game.player.active === t, target);
    check(drawn.some(sz => Math.abs(sz - 32 * k) < 0.01) && tk.includes(name0) && sel,
      `icon size ${k}: slots ${pos.S} px, move icon ${32 * k} px, hover shows "${name0}", click selects`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hud-size-${k}.png`), clip: { x: 0, y: vh - 150, width: vw, height: 150 } });
  }

  // Hold left click on the map: the attack aims at the cursor, even with no enemies.
  // World still paused here; old shots (fired at the earlier enemies) are cleared, and only
  // shots created after the press count, so auto-aim before the press can't be miscounted.
  const stale = await page.evaluate(() => {
    const pl = G.Game.player, old = G.Projectiles.all().filter(p => p.owner === pl).length;
    G.EnemyMgr.clear();
    G.Projectiles.clear();
    pl.setActive(pl.slots.findIndex(g => g[0].kind === 'projectile' || g[0].kind === 'cone' || g[0].kind === 'beam'));
    return old;
  });
  const aimAt = await page.evaluate(() => {
    const pl = G.Game.player, k = G.Camera.scale;
    // 150 world px up-left of the player, in screen px.
    return { x: (pl.x - 150 - G.Camera.left()) * k, y: (pl.y - 100 - G.Camera.top()) * k, kind: pl.activeMove().kind };
  });
  await page.mouse.move(aimAt.x, aimAt.y);
  await page.mouse.down();
  await page.evaluate(() => { window.__pre = new Set(G.Projectiles.all()); G.Game.debugSpeed(1); });
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => {
    const pl = G.Game.player, w = G.Input.mouseWorld();
    const want = Math.atan2(w.y - (pl.y - G.LIFT * 0.5), w.x - pl.x);
    const shots = G.Projectiles.all().filter(p => p.owner === pl && !window.__pre.has(p));
    return { manual: pl.manualAim, err: Math.abs(Math.atan2(Math.sin(pl.aim - want), Math.cos(pl.aim - want))), shots: shots.length,
             dirOk: shots.every(p => Math.hypot(p.vx, p.vy) < 1 || Math.cos(Math.atan2(p.vy, p.vx) - want) > 0.8) };
  });
  check(held.manual && held.err < 0.05, `holding left click aims at the cursor (off by ${held.err.toFixed(3)} rad, move: ${aimAt.kind})`);
  check(aimAt.kind === 'beam' || (held.shots > 0 && held.dirOk), `the ${aimAt.kind} fires toward the cursor with no enemies around (${held.shots} shots; ${stale} old shots cleared first)`);
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(!(await page.evaluate(() => G.Game.player.manualAim)), 'releasing the click goes back to auto-aim');
  await page.evaluate(() => G.Game.debugSpeed(0));

  // Buff timer on its slot (hud.js buffLeft): stacks and seconds while it lasts, a warning
  // in the last seconds when it isn't the active move, nothing once it runs out.
  const hudText = () => page.evaluate(() => new Promise(res => {
    const seen = [], P = CanvasRenderingContext2D.prototype, o = P.fillText;
    P.fillText = function (t) { seen.push(String(t)); return o.apply(this, arguments); };
    setTimeout(() => { P.fillText = o; res([...new Set(seen)]); }, 250);
  }));
  await page.evaluate(() => {
    const pl = G.Game.player;
    G.EnemyMgr.clear();
    pl.setActive(pl.slots.findIndex(g => g[0].id === 'swords-dance'));
    G.Game.debugSpeed(1);
  });
  await page.waitForTimeout(2600);                                   // casts every ~0.85 s: a few stacks
  const sd = await page.evaluate(() => {
    const pl = G.Game.player, m = pl.slots.find(g => g[0].id === 'swords-dance')[0];
    pl.setActive(pl.slots.findIndex(g => g[0].kind !== 'buff'));     // switch away: the timer runs down
    return { n: pl.buffs.patk.n, dur: m.dur };
  });
  let txt = await hudText();
  check(sd.n >= 2 && txt.includes('×' + sd.n) && txt.some(t => /^\d\.\ds$/.test(t)),
    `Swords Dance slot shows its stacks and time left (×${sd.n}, ${txt.find(t => /^\d\.\ds$/.test(t))})`);
  // The ring at the player's feet (Player.draw): its arc is the time left, centred in front.
  const rings = () => page.evaluate(() => new Promise(res => {
    const pl = G.Game.player, P = CanvasRenderingContext2D.prototype, o = P.ellipse, od = pl.draw, seen = [];
    let inDraw = false;
    pl.draw = function () { inDraw = true; try { return od.apply(this, arguments); } finally { inDraw = false; } };
    P.ellipse = function (x, y, rx, ry, rot, a0, a1) {
      if (inDraw && this.strokeStyle === '#ff6b4d') seen.push({ sweep: (a1 - a0) / 6.2832, mid: (a0 + a1) / 2, alpha: this.globalAlpha, t: pl.buffs.patk.t, dur: pl.buffs.patk.dur });
      return o.apply(this, arguments);
    };
    setTimeout(() => { P.ellipse = o; pl.draw = od; res(seen); }, 400);
  }));
  let rg = await rings();
  const arc = rg.filter(r => r.sweep < 0.999);
  const fracOk = arc.length && arc.every(r => Math.abs(r.sweep - r.t / r.dur) < 0.05 && Math.abs(r.mid - Math.PI / 2) < 0.01);
  check(fracOk && rg.some(r => r.sweep >= 0.999 && r.alpha < 0.2) && arc.every(r => r.alpha === 0.6),
    `ring at the feet shows the time left: arc ${arc[0] && (arc[0].sweep * 100).toFixed(0)}% for ${arc[0] && arc[0].t.toFixed(1)} of ${arc[0] && arc[0].dur} s, centred in front, over a faint full ring; steady while there's time`);
  await page.waitForFunction(() => G.Game.player.buffs.patk.n > 0 && G.Game.player.buffs.patk.t < 2.2, null, { timeout: 10000 });
  rg = (await rings()).filter(r => r.sweep < 0.999);
  const al = rg.map(r => r.alpha);
  check(rg.length && Math.max(...al) - Math.min(...al) > 0.3, `in the last seconds the ring pulses (alpha ${Math.min(...al).toFixed(2)}–${Math.max(...al).toFixed(2)})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'buff-ring.png'), clip: { x: vw / 2 - 90, y: vh / 2 - 110, width: 180, height: 170 } });
  txt = await hudText();
  check(txt.includes('!'), 'in the last seconds, with another move active, the slot warns ("!")');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud-buff-timer.png'), clip: { x: 0, y: vh - 150, width: vw, height: 150 } });
  await page.waitForFunction(() => G.Game.player.buffs.patk.n === 0, null, { timeout: 10000 });
  txt = await hudText();
  check(!txt.some(t => /^×\d$/.test(t)) && !txt.includes('!'), 'once it runs out, the timer is gone');
  await page.evaluate(() => G.Game.debugSpeed(0));

  console.log('Level-up cards');
  const cards = await page.evaluate(() => {
    const pl = G.Game.player, bad = [];
    let ownSeen = 0, otherSeen = 0;
    for (let i = 0; i < 300; i++) for (const c of G.LevelUp.offer(pl)) {
      if (c.type !== 'new') { if (c.own) bad.push(c.key); continue; }
      const d = G.Moves.BY_ID[c.key.slice(4)];
      const expect = d.kind !== 'buff' && pl.mon.types.includes(d.type) && G.Stats.fit(pl.mon, d.cat) >= 0.95;
      if (!!c.own !== expect) bad.push(c.key);
      expect ? ownSeen++ : otherSeen++;
    }
    // Render a hand with a same-type card through the real level-up screen.
    let hand;
    for (let i = 0; i < 300 && !hand; i++) {
      const h = G.LevelUp.offer(pl);
      if (h.some(c => c.own) && h.some(c => !c.own)) hand = h;
    }
    G.RunUI.showLevelUp(pl.level, hand, () => {});
    const els = [...document.querySelectorAll('#cards .card')];
    const dom = els.map((el, i) => ({ own: !!hand[i].own, stab: el.classList.contains('stab'),
      chip: !!el.querySelector('.stab-chip'), border: getComputedStyle(el).borderColor }));
    return { bad, ownSeen, otherSeen, dom };
  });
  check(cards.bad.length === 0, `own flag matches type + good side on every card (${cards.ownSeen} own, ${cards.otherSeen} other)` + (cards.bad.length ? ' bad: ' + cards.bad.slice(0, 5) : ''));
  check(cards.ownSeen > 0 && cards.otherSeen > 0, 'both kinds of new-move cards were offered');
  check(cards.dom.every(d => d.own === d.stab && d.own === d.chip), 'rendered cards: .stab and chip exactly on own cards');
  console.log('  ' + JSON.stringify(cards.dom));
  if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, 'levelup-cards.png') }); }

  // Stat-boost moves: "Good for you" only when the boost is for the Pokémon's stronger side
  // (Nasty Plot for a special Pokémon, Swords/Dragon Dance for a physical one).
  const boost = await page.evaluate(() => {
    const pl = G.Game.player, CAT = { patk: 'physical', satk: 'special' }, bad = [], seen = { yes: 0, no: 0 };
    for (let i = 0; i < 400; i++) for (const c of G.LevelUp.offer(pl)) {
      if (c.type !== 'new') { if (c.boost) bad.push(c.key); continue; }
      const d = G.Moves.BY_ID[c.key.slice(4)];
      const want = d.kind === 'buff' && !!CAT[d.stat] && CAT[d.stat] === G.Stats.sideOf(pl.mon);
      if (!!c.boost !== want) bad.push(c.key);
      if (d.kind === 'buff') want ? seen.yes++ : seen.no++;
    }
    let hand;
    for (let i = 0; i < 600 && !hand; i++) { const h = G.LevelUp.offer(pl); if (h.some(c => c.boost)) hand = h; }
    if (!hand) return { bad, seen, side: G.Stats.sideOf(pl.mon) };
    G.RunUI.showLevelUp(pl.level, hand, () => {});
    const els = [...document.querySelectorAll('#cards .card')];
    return { bad, seen, side: G.Stats.sideOf(pl.mon), dom: els.map((el, i) => ({ key: hand[i].key, boost: !!hand[i].boost,
      cls: el.classList.contains('boost'), chip: !!el.querySelector('.boost-chip'), note: (el.querySelector('.fit-good') || {}).textContent || '' })) };
  });
  check(boost.bad.length === 0 && boost.seen.yes > 0, `boost flag only on the stronger side's attack boost (${boost.side} Pokémon; ${boost.seen.yes} flagged, ${boost.seen.no} other buffs)` + (boost.bad.length ? ' bad: ' + boost.bad.slice(0, 5) : ''));
  // The game translates new text with a MutationObserver: read the note once it has run.
  await page.waitForTimeout(50);
  if (boost.dom) boost.dom = await page.evaluate(dom => dom.map((d, i) => Object.assign(d, {
    note: (document.querySelectorAll('#cards .card')[i].querySelector('.fit-good') || {}).textContent || '' })), boost.dom);
  const bc = (boost.dom || []).find(d => d.boost);
  check(!!bc && boost.dom.every(d => d.boost === d.cls && d.boost === d.chip) && /^Good for Charmander: boosts its special moves, its strong side\.$/.test(bc.note),
    `rendered: ${bc && bc.key} gets .boost, the "Good for you" chip and "${bc && bc.note}"`);
  if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, 'levelup-boost.png') }); }

  // A new attack on the Pokémon's weaker side: the note says plainly that it's worse for it,
  // how much damage it does, and why. Charmander is too even (96 %, no note), so the hand is
  // rolled as Gengar, a clear special attacker.
  const weak = await page.evaluate(() => {
    const pl = G.Game.player, mon = pl.mon, max = pl.maxMoves;
    pl.mon = G.DEX_BY[94]; pl.maxMoves = 99;                     // its 4 slots are full by now
    const low = c => c.type === 'new' && G.Stats.fit(pl.mon, G.Moves.BY_ID[c.key.slice(4)].cat) < 0.95;
    let hand;
    for (let i = 0; i < 600 && !hand; i++) { const h = G.LevelUp.offer(pl); if (h.some(low)) hand = h; }
    const out = hand && { i: hand.findIndex(low), side: G.Stats.sideOf(pl.mon) };
    if (hand) { out.key = hand[out.i].key; out.pct = Math.round(G.Stats.fit(pl.mon, G.Moves.BY_ID[out.key.slice(4)].cat) * 100); G.RunUI.showLevelUp(pl.level, hand, () => {}); }
    pl.mon = mon; pl.maxMoves = max;
    return out;
  });
  await page.waitForTimeout(50);
  const wn = weak && await page.evaluate(i => (document.querySelectorAll('#cards .card')[i].querySelector('.fit-low') || {}).textContent || '', weak.i);
  check(!!weak && weak.side === 'special' && wn === `Weaker for Gengar: only ${weak.pct} % damage (it’s a special attacker).`, `weaker-side card ${weak && weak.key} says "${wn}"`);
  if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, 'levelup-weak.png') }); }

  // The very rare "Item Mastery" card (js/fork/rare-cards.js): the stat items' boosts without
  // holding them, and without their drawbacks.
  console.log('Very rare card: Item Mastery');
  const rare = await page.evaluate(() => {
    const pl = G.Game.player;
    let n = 0;
    for (let i = 0; i < 6000; i++) if (G.LevelUp.offer(pl).some(c => c.rare)) n++;
    G.RareCards.forceNext();
    window.__hand = G.LevelUp.offer(pl);
    G.RunUI.showLevelUp(pl.level, window.__hand, () => {});
    return { n, last: window.__hand.findIndex(c => c.rare), len: window.__hand.length };
  });
  check(rare.n >= 15 && rare.n <= 85, `it is very rare: in ${rare.n} of 6000 hands (expected about 40, 1 in 150)`);
  check(rare.last === rare.len - 1, 'the admin menu\'s "Rare card next" puts it in the next hand, as the last card');
  // The purple look is in the fork's css/brand.css, which only the built pages link (fork/build.cjs).
  await page.addStyleTag({ url: BASE + '/css/brand.css' });
  await page.waitForTimeout(50);
  const rc = await page.evaluate(i => { const el = document.querySelectorAll('#cards .card')[i];
    return { cls: el.classList.contains('rare'), nm: el.querySelector('.nm').textContent.replace(/\s+/g, ' ').trim(), ds: el.querySelector('.ds').textContent,
      border: getComputedStyle(el).borderColor }; }, rare.last);
  // (Purple, not the exact value: the card fades in, so the border can be mid-transition.)
  const [br, bg, bb] = (rc.border.match(/[\d.]+/g) || []).map(Number);
  check(rc.cls && bb > 200 && br > bg + 40 && bb > bg + 80 && /^Item Mastery Very rare$/.test(rc.nm) && /^For the rest of the run you get the boost of these items without holding them, and without their drawbacks: Choice Band, Life Orb, Quick Claw, Choice Scarf, Assault Vest, Lucky Egg, Amulet Coin, Leftovers\.$/.test(rc.ds),
    `rendered purple (.rare, ${rc.border}) and in English: "${rc.nm}" / "${rc.ds}"`);
  if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, 'levelup-rare.png') }); }
  const mast = await page.evaluate(() => {
    const pl = G.Game.player, k = ['atkMul', 'cdMul', 'spdMul', 'dmgReduce', 'xpMul', 'coinMul', 'regenFlat'];
    pl.equip(null);
    const b = Object.fromEntries(k.map(x => [x, pl[x]]));
    pl.equip('choiceband');                          // holding one of them when picking the card
    window.__hand.find(c => c.rare).apply(pl);
    const a = Object.fromEntries(k.map(x => [x, pl[x]]));
    const near = (x, y) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    const ok = near(a.atkMul, b.atkMul * 1.4 * 1.3) && near(a.cdMul, b.cdMul * 0.8) && near(a.spdMul, b.spdMul * 1.35) && near(a.dmgReduce, b.dmgReduce + 0.2)
      && near(a.xpMul, b.xpMul * 1.3) && near(a.coinMul, b.coinMul * 1.5) && near(a.regenFlat, b.regenFlat + pl.maxHp * 0.015);
    // No Choice Band lock: switching moves works.
    const from = pl.active, to = (pl.active + 1) % pl.slots.length;
    pl.setActive(to);
    G.RareCards.forceNext();
    const again = G.LevelUp.offer(pl).some(c => c.rare);
    G.UI.hide('scr-levelup');
    return { ok, a, b, item: pl.item, switched: pl.slots.length < 2 || pl.active === to, again };
  });
  check(mast.ok, 'picking it: every stat item\'s boost, each counted once (the held Choice Band too) ' + JSON.stringify({ before: mast.b, after: mast.a }));
  check(mast.item === null && mast.switched, `the held Choice Band is put away, so moves can be switched again (item ${mast.item})`);
  check(!mast.again, 'it is never offered again in that run');
  const drop = id => page.evaluate(id => { const pl = G.Game.player; pl.invuln = 99; G.Pickups.drop('item', pl.x, pl.y, id); }, id);
  await drop('choiceband');
  const have = await page.waitForFunction(t => (G.Spawner.banner() || {}).text === t, await page.evaluate(() => G.RareCards.HAVE), { timeout: 8000 }).then(() => true, () => false);
  check(have && await page.evaluate(() => G.Game.player.item === null), 'finding a Choice Band afterwards: "You already have its boost", not equipped');
  await drop('focussash');
  check(await page.waitForFunction(() => G.Game.player.item === 'focussash', null, { timeout: 8000 }).then(() => true, () => false),
    'other items (Focus Sash) still go in the free item slot');

  // Solo run end: no team summary, but your per-move breakdown (js/fork/run-stats.js).
  console.log('Run end: your breakdown');
  await page.evaluate(() => { G.UI.hide('scr-levelup'); G.Game.debugSpeed(1); G.Game.quit(); });
  await page.waitForSelector('#scr-over', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(700);
  const end = await page.evaluate(() => {
    const pl = G.Game.player, s = G.RunStats.mine(0, null), t = G.RunStats.tally.me || { k: 0 };
    return { party: !!document.getElementById('scr-party'), rows: document.querySelectorAll('#over-stats table tr').length - 1,
             moves: s.moves.length, sum: s.moves.reduce((a, m) => a + m.d, 0), d: s.d, kills: s.moves.reduce((a, m) => a + m.k, 0), k: t.k };
  });
  check(!end.party && end.rows === end.moves && end.moves > 0 && Math.abs(end.sum - end.d) <= end.moves && end.kills === end.k,
    'solo: no team summary; the end screen lists each attack with damage and kills that add up: ' + JSON.stringify(end));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'solo-breakdown.png') });

  // Random run (js/ui/menu.js playRandom): a random Pokémon you own, at or above the chosen
  // rarity; your partner stays the same.
  console.log('Random run');
  const legend = await page.evaluate(() => {
    const d = G.DEX.find(p => p.rarity === 5 && p.gen === 1).dex;
    G.DB.save.owned[d] = { at: Date.now() };
    G.Settings.set('randMin', 1);
    G.Flow.goMenu();
    return d;
  });
  await page.waitForSelector('#rand-go', { state: 'visible' });
  const strip = await page.evaluate(() => {
    const info = document.getElementById('menu-partner-info').getBoundingClientRect(), r = document.getElementById('menu-rand').getBoundingClientRect();
    const chips = [...document.querySelectorAll('#rand-rar button')];
    const owned = r0 => Object.keys(G.DB.save.owned).some(d => G.DEX_BY[d] && G.DEX_BY[d].rarity >= r0);
    return { under: !!document.querySelector('.partner-card #menu-rand') && r.top >= info.bottom - 1 && r.top - info.bottom < 60 && r.bottom <= innerHeight, n: chips.length, on: chips.findIndex(c => c.classList.contains('on')) + 1,
             disabledOk: chips.every((c, i) => c.disabled === !owned(i + 1)), label: document.getElementById('rand-go').textContent.trim() };
  });
  check(strip.under && strip.n === 5 && strip.on === 1 && strip.disabledOk,
    `"${strip.label}" sits under the partner card, on screen, with 5 rarity chips ("All" on; chips with nothing owned are disabled)`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'menu-random.png') });
  await page.click('#rand-rar button:nth-child(5)');
  check(await page.evaluate(() => G.Settings.get('randMin') === 5 && document.querySelector('#rand-rar button:nth-child(5)').classList.contains('on')), 'picking the legendary chip selects it and remembers it');
  await page.click('#rand-go');
  await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
  const rr = await page.evaluate(() => ({ dex: G.Game.player.dex, rarity: G.DEX_BY[G.Game.player.dex].rarity, owned: !!G.DB.save.owned[G.Game.player.dex], partner: G.DB.save.partner }));
  check(rr.rarity === 5 && rr.owned && rr.partner === 4, `legendary only: the run is with #${rr.dex}, an owned legendary; partner still #${rr.partner}`);
  await page.evaluate(() => { G.Game.debugSpeed(1); G.Game.quit(); });
  await page.waitForSelector('#scr-over', { state: 'visible', timeout: 10000 });
  await page.evaluate(() => { G.Settings.set('randMin', 1); G.Flow.goMenu(); });
  const rolled = new Set();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => { if (G.Game.state === 'playing') G.Game.quit(); G.Flow.goMenu(); });
    await page.click('#rand-go');
    await page.waitForFunction(() => G.Game.state === 'playing', null, { timeout: 15000 });
    rolled.add(await page.evaluate(() => G.Game.player.dex));
  }
  const ownedAll = await page.evaluate(() => Object.keys(G.DB.save.owned).map(Number).filter(d => G.DEX_BY[d]));
  check([...rolled].every(d => ownedAll.includes(d)) && rolled.size >= 2, `"All": 12 rolls give only owned Pokémon, and vary (${[...rolled].join(', ')} of ${ownedAll.join(', ')})`);
  await page.evaluate(() => { G.Game.quit(); });

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
