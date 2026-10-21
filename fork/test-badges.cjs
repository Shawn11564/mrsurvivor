#!/usr/bin/env node
// The move badges in Lab runs (js/fork/lab/badges.js), in headless Edge on dev.html.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-badges.cjs [base-url]
//
//   1. The 4 arrows build (13×13 code drawings).
//   2. Which arrows real Pokémon get: Charmander's Ember (type + special, both green), Charizard's
//      (no type arrow: two types, no bonus), a weak-side move (yellow, red under 65%), buffs.
//   3. Level-up cards in a Lab run: each arrow in the chip after its word ("New · Fire ▲ · Special ▲");
//      no switch or button left; nothing with Lab off.
//   4. The move tooltip, with a real mouse over the slot: each arrow after its word.
//   5. The enemy arrows: what enemy.js draws over a super-effective enemy is our green arrow.
//   6. The built index.html (node fork/build.cjs): no setting left, and its CSS places the arrows.
// Set SHOTS=<dir> to save screenshots of the cards, the tooltip and the enemies.
const path = require('path');
const { chromium, pastStart } = require('./pw.cjs');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', locale: 'en-US' })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.G && G.DB && G.LabBadges, null, { timeout: 30000 });
    // The badges' CSS is in the fork's css/brand.css, which only the built pages link (fork/build.cjs).
    await page.addStyleTag({ url: BASE + '/css/brand.css' });
    await pastStart(page, '#btn-guest');
    await page.click('#btn-guest');
    await page.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });

    const start = (dex, lab = true, moveId = null) => page.evaluate(([dex, lab, moveId]) => {
      if (G.Game.player && G.Game.state !== 'ui') G.Game.quit();
      G.UI.hideAll(); G.Game.toUI();
      G.DB.grant(dex, 't'); G.DB.save.partner = dex; G.Settings.set('lab', lab); G.Settings.set('underdogLadder', false); G.DB.commit();
      G.Game.startRun();
      const p = G.Game.player;
      p.hurt = () => {};
      if (moveId) { const m = G.Moves.instance(moveId, 1); m.t = 1e9; p.slots = [[m]]; p.moves = [m]; p.active = 0; }
      G.EnemyMgr.clear();
    }, [dex, lab, moveId]);

    console.log('1. The arrows');
    const icons = await page.evaluate(() => G.LabBadges.NAMES.map(n => { const c = G.Icons.canvas(n); return [n, c.width, c.height]; }));
    check(icons.map(i => i[0]).join() === 'lb-g,lb-m,lb-y,lb-r' && icons.every(([, w, h]) => w === 13 && h === 13), 'the 4 arrows, 13×13 code drawings', icons);

    console.log('2. Which arrows');
    const mk = await page.evaluate(() => {
      const M = (dex, id) => G.LabBadges.marks(G.DEX_BY[dex], G.Moves.BY_ID[id]);
      // The Pokémon whose weak side is weakest (the only red cases).
      const worst = G.DEX.reduce((a, m) => (Math.min(m.pa, m.sa) / m.atk < Math.min(a.pa, a.sa) / a.atk ? m : a));
      const wcat = worst.pa < worst.sa ? 'physical' : 'special';
      const wmove = G.Moves.ALL.find(m => m.cat === wcat && m.kind !== 'buff');
      // A Pokémon whose weak side is between 65 and 95 %.
      const mid = G.DEX.find(m => { const f = Math.min(m.pa, m.sa) / m.atk; return f >= 0.65 && f < 0.95; });
      const mcat = mid.pa < mid.sa ? 'physical' : 'special';
      const mmove = G.Moves.ALL.find(m => m.cat === mcat && m.kind !== 'buff');
      return {
        charmander: M(4, 'ember'), charizard: M(6, 'ember'),
        worst: [worst.name, +(Math.min(worst.pa, worst.sa) / worst.atk).toFixed(2), G.LabBadges.marks(worst, wmove).cat],
        mid: [mid.name, +(Math.min(mid.pa, mid.sa) / mid.atk).toFixed(2), G.LabBadges.marks(mid, mmove).cat],
        gengarSide: G.Stats.sideOf(G.DEX_BY[94]),
        nasty: M(94, 'nasty-plot'), swords: M(94, 'swords-dance'), agility: M(94, 'agility')
      };
    });
    check(mk.charmander.type === 'lb-g' && mk.charmander.cat === 'lb-g', "Charmander's Ember: green after the type and after Special", mk.charmander);
    check(!mk.charizard.type && mk.charizard.cat === 'lb-g', "Charizard's Ember: none after the type (two types), green after Special", mk.charizard);
    check(mk.mid[2] === 'lb-y', 'weak side at 65-95 %: yellow', mk.mid);
    check(mk.worst[1] < 0.65 && mk.worst[2] === 'lb-r', 'weak side under 65 %: red', mk.worst);
    check(mk.gengarSide === 'special' && mk.nasty.cat === 'lb-g' && mk.swords.cat === 'lb-y' && !mk.agility.cat && !mk.agility.type,
      'Gengar: Nasty Plot green, Swords Dance yellow, Agility nothing', [mk.nasty, mk.swords, mk.agility]);

    console.log('3. Level-up cards');
    // Shows the level-up screen until a hand has a new-move card with arrows (by its .lb-a, not its
    // text: the chip's "Nuevo ·" is translated later, by i18n's observer, and this loop never lets it run).
    const cards = () => page.evaluate(async () => {
      const p = G.Game.player;
      for (let i = 0; i < 80; i++) {
        G.Game.state = 'levelup';
        G.RunUI.showLevelUp(p.level, G.LevelUp.offer(p), () => {});
        if (!G.Lab.active || document.querySelector('#cards .lb-a')) break;
      }
      await new Promise(r => setTimeout(r, 50));
      return {
        cards: [...document.querySelectorAll('#cards .card')].map(c => {
          const chip = c.querySelector('.tag-chip');
          return { name: c.querySelector('.nm').firstChild.textContent.trim(), chip: chip.textContent.trim(), html: chip.innerHTML,
            a: [...chip.querySelectorAll('.lb-a')].map(i => i.getAttribute('src')) };
        }),
        btn: !!document.getElementById('lvl-badges')
      };
    });
    const urls = await page.evaluate(() => Object.fromEntries(G.LabBadges.NAMES.map(n => [G.Icons.url(n), n])));
    await start(4, true);
    let c = await cards();
    const card = c.cards.find(x => x.a.length);
    check(!c.btn, 'no switch on the level-up screen any more');
    const want = card && await page.evaluate(n => {
      const d = Object.values(G.Moves.BY_ID).find(m => G.T(m.name, 'move') === n);
      const k = d && G.LabBadges.marks(G.Game.player.mon, d);
      return k && { a: [k.type, k.cat].filter(Boolean), type: !!k.type,
        chip: G.I18n.f('Nuevo · {x}', G.T(G.U.TYPE_NAME[d.type])) + ' · ' + G.T(d.cat ? G.Stats.NAME[d.cat] : 'Mejora') };
    }, card.name);
    check(want && JSON.stringify(card.a.map(u => urls[u])) === JSON.stringify(want.a), `${card && card.name}: arrows ${want && want.a} in the chip`, card && card.a.map(u => urls[u]));
    // Each after its word: the type arrow right after the type, the other after " · Special".
    check(want && card.chip.replace(/\s+/g, ' ') === want.chip && (want.type ? /^[^<]*<img[^>]*>\s*<span[^>]*> · [^<]*<\/span><img/ : /<span[^>]*> · [^<]*<\/span><img/).test(card.html),
      `chip text stays "${want && want.chip}", each arrow after its word`, card && card.html.slice(0, 160));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-cards.png') });
    await start(4, false);
    c = await cards();
    check(c.cards.every(x => !x.a.length), 'Lab off: no arrows');

    console.log('4. Tooltip');
    const hover = () => page.evaluate(() => {
      const pl = G.Game.player, K = G.Settings.get('hudSize') || 1, S = 54 * K, GAP = 9 * K, n = Math.max(1, pl.slots.length);
      const sx = (innerWidth - (n * S + (n - 1) * GAP)) / 2, sy = innerHeight - S - 18;
      return { x: sx + S / 2, y: sy + S / 2 };
    });
    // What the tooltip draws over a few frames: texts (rawCanvas) and icons (G.Icons.draw), with x.
    const tip = () => page.evaluate(() => new Promise(res => {
      const txt = [], ico = [], ot = G.I18n.rawCanvas, oi = G.Icons.draw;
      G.I18n.rawCanvas = function (ctx, k, s, x) { if (k === 'fillText') txt.push([String(s), Math.round(ctx.getTransform().e + x)]); return ot.apply(this, arguments); };
      G.Icons.draw = function (ctx, n, x) { if (/^lb-/.test(n)) ico.push([n, Math.round(ctx.getTransform().e + x)]); return oi.apply(this, arguments); };
      setTimeout(() => { G.I18n.rawCanvas = ot; G.Icons.draw = oi; res({ txt, ico }); }, 300);
    }));
    await start(4, true, 'ember');
    await page.evaluate(() => { G.UI.hideAll(); G.Game.state = 'playing'; G.Game.debugSpeed(0); });
    const pos = await hover();
    await page.mouse.move(pos.x, pos.y);
    const t = await tip();
    const firstOf = (list, n) => list.find(([s]) => s === n);
    const names = await page.evaluate(() => [G.T(G.U.TYPE_NAME.fire), G.T(G.Stats.NAME.special)]);
    const fire = firstOf(t.txt, names[0]), spec = firstOf(t.txt, names[1]);
    const arrows = t.ico.filter(([n]) => n === 'lb-g').map(x => x[1]);
    const a1 = Math.min(...arrows), a2 = Math.max(...arrows);
    check(arrows.length >= 2 && fire && spec && fire[1] < a1 && a1 < spec[1] && spec[1] < a2,
      `"${names[0]}" ▲ "${names[1]}" ▲, each arrow after its word`, { fire, spec, arrows: [a1, a2] });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-tip.png') });
    await page.mouse.move(640, 150);

    console.log('5. Enemy arrows');
    // A Grass enemy (Ember: x2), drawn over a few frames; which images enemy.js put on the canvas.
    const en = await page.evaluate(async () => {
      const pl = G.Game.player;
      G.EnemyMgr.clear();
      let def = null;
      // A Grass-only enemy: from the arena's cast, or its hordes (the cast changes with the arena).
      const defs = G.Enemies.cast.flatMap(t => t.list).concat(...G.Enemies.hordeTypes(600).map(t => G.Enemies.hordeDefs(t, 600)));
      for (const d of defs) {
        const ty = d.types || (G.DEX_BY[d.dex] || {}).types || [];
        if (!def && ty.length === 1 && ty[0] === 'grass') def = d;
      }
      const e = new G.Enemy(def, pl.x + 60, pl.y - 40, G.Enemies.scale(0));
      e.spd = 0; G.EnemyMgr.add(e);
      const seen = new Set(), od = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img) { seen.add(img); return od.apply(this, arguments); };
      await new Promise(r => setTimeout(r, 300));
      CanvasRenderingContext2D.prototype.drawImage = od;
      return { name: e.name, green: seen.has(G.Icons.canvas('lb-g')) };
    });
    check(en.green, `${en.name} (Grass, vs Ember) gets the green arrow`, en);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-enemy.png') });

    console.log('6. Built index.html');
    // G is sealed in app.min.js (fork/build.cjs), so as a player would: guest, the starter quiz,
    // Settings → Experimental. The CSS is checked on a span with the arrows' class.
    const built = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    built.on('pageerror', e => errs.push('index.html: ' + e.message));
    await built.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pastStart(built, '#btn-guest');
    await built.click('#btn-guest');
    await built.waitForSelector('#scr-test', { state: 'visible', timeout: 15000 });
    for (let i = 0; i < 20 && !(await built.isVisible('#scr-result')); i++) {
      await built.click('#test-a button >> nth=0').catch(() => {});
      await built.waitForTimeout(250);
    }
    await built.click('#res-ok');
    await built.waitForSelector('#scr-menu', { state: 'visible', timeout: 15000 });
    await built.click('#btn-settings');
    await built.click('#set-tabs [data-t="lab"]');
    const rows = await built.locator('#set-body .switch').evaluateAll(b => b.map(x => x.dataset.k));
    const css = await built.evaluate(() => {
      const d = document.createElement('img'); d.className = 'lb-a'; document.body.appendChild(d);
      const s = getComputedStyle(d), out = { display: s.display, align: s.verticalAlign }; d.remove(); return out;
    });
    check(rows.includes('lab') && !rows.includes('labPlainArrows'), 'index.html: Settings → Experimental has Lab mode and no arrows switch', rows);
    check(css.display !== 'none' && css.align === '-3px', 'index.html: its brand.css places the arrows', css);
    await built.close();

    check(errs.length === 0, 'no page errors', errs.slice(0, 3));
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
