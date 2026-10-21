#!/usr/bin/env node
// The move badges mockup in Lab runs (js/fork/lab/badges.js), in headless Edge on dev.html.
//
//   python -m http.server 8123          (in the repo root, in another terminal)
//   node fork/test-badges.cjs [base-url]
//
//   1. The 16 icons build: 4 plain arrows and 7 move badges at 13×13, 5 enemy arrows that stay small.
//   2. Which badges real Pokémon get: Charmander's Ember (type + special, both green), Charizard's
//      (no type badge: two types, no bonus), a weak-side move (yellow, red under 65%), buffs.
//   3. Level-up cards in a Lab run: symbols after the name; the B key / setting switches to plain
//      arrows inside the chip ("New · Fire ▲ · Special ▲"); nothing with Lab off.
//   4. The move tooltip, with a real mouse over the slot: the badges, or the plain arrows next to
//      their words.
//   5. The enemy arrows: what enemy.js draws over a super-effective enemy is our canvas.
//   6. The built index.html (node fork/build.cjs) has the badges and links their CSS itself.
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

    console.log('1. Icons');
    const icons = await page.evaluate(() => G.LabBadges.NAMES.map(n => { const c = G.Icons.canvas(n); return [n, c.width, c.height]; }));
    check(icons.length === 16, '16 icons', icons.length);
    const small = icons.filter(([n]) => /^lb-[gmyr](-(type|phys|spec))?$/.test(n));
    check(small.length === 11 && small.every(([, w, h]) => w === 13 && h === 13), '4 plain arrows + 7 move badges, all 13×13', small);
    const eff = icons.filter(([n]) => /\d/.test(n));
    check(eff.length === 5 && eff.every(([, w, h]) => w <= 19 && h <= 16), '5 enemy arrows, at most 19×16', eff);

    console.log('2. Which badges');
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
      const gengar = G.DEX_BY[94];
      return {
        charmander: M(4, 'ember'), charizard: M(6, 'ember'),
        worst: [worst.name, +(Math.min(worst.pa, worst.sa) / worst.atk).toFixed(2), G.LabBadges.marks(worst, wmove).cat, wcat],
        mid: [mid.name, +(Math.min(mid.pa, mid.sa) / mid.atk).toFixed(2), G.LabBadges.marks(mid, mmove).cat, mcat],
        gengarSide: G.Stats.sideOf(gengar),
        nasty: M(94, 'nasty-plot'), swords: M(94, 'swords-dance'), agility: M(94, 'agility')
      };
    });
    check(mk.charmander.type === 'lb-g-type' && mk.charmander.cat === 'lb-g-spec', "Charmander's Ember: green type + green special", mk.charmander);
    check(!mk.charizard.type && mk.charizard.cat === 'lb-g-spec', "Charizard's Ember: no type badge (two types), green special", mk.charizard);
    check(mk.mid[2] === 'lb-y-' + (mk.mid[3] === 'physical' ? 'phys' : 'spec'), 'weak side at 65-95 %: yellow', mk.mid);
    check(mk.worst[1] < 0.65 && mk.worst[2] === 'lb-r-' + (mk.worst[3] === 'physical' ? 'phys' : 'spec'), 'weak side under 65 %: red', mk.worst);
    check(mk.gengarSide === 'special' && mk.nasty.cat === 'lb-g-spec' && mk.swords.cat === 'lb-y-phys' && !mk.agility.cat && !mk.agility.type,
      'Gengar: Nasty Plot green, Swords Dance yellow, Agility nothing', [mk.nasty, mk.swords, mk.agility]);

    console.log('3. Level-up cards');
    await page.evaluate(() => G.Settings.set(G.LabBadges.KEY, false));
    // Shows the level-up screen until it has a new-move card, and reads the cards.
    const cards = () => page.evaluate(async () => {
      const p = G.Game.player;
      for (let i = 0; i < 40; i++) {
        G.Game.state = 'levelup';
        G.RunUI.showLevelUp(p.level, G.LevelUp.offer(p), () => {});
        if (document.querySelector('#cards .lb-s, #cards .card .tag-chip')) {
          const any = [...document.querySelectorAll('#cards .card')].some(c => /New ·/.test(c.textContent));
          if (any || i > 30) break;
        }
      }
      await new Promise(r => setTimeout(r, 50));
      const vis = el => !!el && getComputedStyle(el).display !== 'none';
      return [...document.querySelectorAll('#cards .card')].map(c => {
        const chip = c.querySelector('.tag-chip');
        return {
          name: c.querySelector('.nm').firstChild.textContent.trim(), chip: chip.textContent.trim(),
          s: [...c.querySelectorAll('.lb-s img')].map(i => i.getAttribute('src')), sVis: vis(c.querySelector('.lb-s')),
          a: [...c.querySelectorAll('.lb-a')].map(i => i.getAttribute('src')), aVis: [...c.querySelectorAll('.lb-a')].some(vis)
        };
      }).concat([{ btn: vis(document.getElementById('lvl-badges')), btnText: (document.getElementById('lvl-badges') || {}).textContent }]);
    });
    const urls = await page.evaluate(() => Object.fromEntries(G.LabBadges.NAMES.map(n => [G.Icons.url(n), n])));
    const named = list => list.map(u => urls[u] || '?');
    await start(4, true);
    let c = await cards();
    let btn = c.pop();
    const ember = c.find(x => x.s.length);
    check(btn.btn && /arrows \+ symbols/.test(btn.btnText), 'Lab run: the switch is on the level-up screen ("arrows + symbols")', btn.btnText);
    check(!!ember && ember.sVis && !ember.aVis, 'a new-move card shows the symbol badges, not the plain arrows', ember && { name: ember.name, sVis: ember.sVis, aVis: ember.aVis });
    const want = ember && await page.evaluate(n => {
      const d = Object.values(G.Moves.BY_ID).find(m => G.T(m.name, 'move') === n);
      const k = d && G.LabBadges.marks(G.Game.player.mon, d);
      return k && { s: [k.type, k.cat].filter(Boolean), a: [k.type, k.cat].filter(Boolean).map(x => x.split('-').slice(0, 2).join('-')),
        chip: G.I18n.f('Nuevo · {x}', G.T(G.U.TYPE_NAME[d.type])) + ' · ' + G.T(d.cat ? G.Stats.NAME[d.cat] : 'Mejora') };
    }, ember.name);
    check(want && JSON.stringify(named(ember.s)) === JSON.stringify(want.s), `${ember && ember.name}: badges ${want && want.s}`, named(ember ? ember.s : []));
    check(want && JSON.stringify(named(ember.a)) === JSON.stringify(want.a), `${ember && ember.name}: plain arrows ${want && want.a} in the chip`, named(ember ? ember.a : []));
    check(want && ember.chip.replace(/\s+/g, ' ') === want.chip, `chip text stays "${want && want.chip}"`, ember && ember.chip);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-cards-symbols.png') });
    await page.keyboard.press('b');
    c = await page.evaluate(() => {
      const vis = el => !!el && getComputedStyle(el).display !== 'none';
      return { plain: G.Settings.get(G.LabBadges.KEY), s: [...document.querySelectorAll('#cards .lb-s')].some(vis),
        a: [...document.querySelectorAll('#cards .lb-a')].some(vis), btn: document.getElementById('lvl-badges').textContent };
    });
    check(c.plain && !c.s && c.a && /arrows only/.test(c.btn), 'B: plain arrows in the chip, symbols hidden, button says "arrows only"', c);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-cards-plain.png') });
    await page.keyboard.press('b');
    check(await page.evaluate(() => !G.Settings.get(G.LabBadges.KEY)), 'B again: back to symbols');
    await start(4, false);
    c = await cards();
    btn = c.pop();
    check(!btn.btn && c.every(x => !x.s.length && !x.a.length), 'Lab off: no badges, no switch', btn);

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
    await page.evaluate(() => { G.UI.hideAll(); G.Game.state = 'playing'; G.Game.debugSpeed(0); G.Settings.set(G.LabBadges.KEY, false); });
    let pos = await hover();
    await page.mouse.move(pos.x, pos.y);
    let t = await tip();
    const firstOf = (list, n) => list.find(([s]) => s === n);
    check(firstOf(t.ico, 'lb-g-type') && firstOf(t.ico, 'lb-g-spec') && !firstOf(t.ico, 'lb-g'), 'symbols: the tooltip draws the type and special badges', [...new Set(t.ico.map(x => x[0]))]);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-tip-symbols.png') });
    await page.evaluate(() => G.Settings.set(G.LabBadges.KEY, true));
    t = await tip();
    const names = await page.evaluate(() => [G.T(G.U.TYPE_NAME.fire), G.T(G.Stats.NAME.special)]);
    const fire = firstOf(t.txt, names[0]), spec = firstOf(t.txt, names[1]);
    const arrows = t.ico.filter(([n]) => n === 'lb-g').map(x => x[1]);
    const a1 = Math.min(...arrows), a2 = Math.max(...arrows);
    check(arrows.length >= 2 && fire && spec && fire[1] < a1 && a1 < spec[1] && spec[1] < a2,
      `plain arrows: "${names[0]}" ▲ "${names[1]}" ▲, each arrow after its word`, { fire, spec, arrows: [a1, a2] });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-tip-plain.png') });
    await page.mouse.move(640, 150);

    console.log('5. Enemy arrows');
    // A Grass enemy (Ember: x2), drawn over a few frames; which images enemy.js put on the canvas.
    const enemy = plainMode => page.evaluate(async plainMode => {
      G.Settings.set(G.LabBadges.KEY, plainMode);
      const pl = G.Game.player;
      G.EnemyMgr.clear();
      let def = null;
      for (const tier of G.Enemies.cast) for (const d of tier.list) {
        const ty = (G.DEX_BY[d.dex] || {}).types || [];
        if (!def && ty.length === 1 && ty[0] === 'grass') def = d;
      }
      const e = new G.Enemy(def, pl.x + 60, pl.y - 40, G.Enemies.scale(0));
      e.spd = 0; G.EnemyMgr.add(e);
      const seen = new Set(), od = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img) { seen.add(img); return od.apply(this, arguments); };
      await new Promise(r => setTimeout(r, 300));
      CanvasRenderingContext2D.prototype.drawImage = od;
      const has = n => seen.has(G.Icons.canvas(n));
      return { name: e.name, sym: has('lb-g-x2'), plain: has('lb-g') };
    }, plainMode);
    let en = await enemy(false);
    check(en.sym && !en.plain, `symbols: ${en.name} (Grass, vs Ember) gets the green x2 arrow`, en);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-enemy-symbols.png') });
    en = await enemy(true);
    check(en.plain && !en.sym, `plain arrows: ${en.name} gets the green arrow without the number`, en);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'badges-enemy-plain.png') });
    await page.evaluate(() => G.Settings.set(G.LabBadges.KEY, false));

    console.log('6. Built index.html');
    // G is sealed in app.min.js (fork/build.cjs), so as a player would: guest, the starter quiz,
    // Settings → Experimental. The CSS is checked on two spans with the badges' classes.
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
    const row = await built.locator('#set-body .switch[data-k="labPlainArrows"]').count();
    const css = await built.evaluate(() => {
      const d = document.createElement('span');
      d.innerHTML = '<span class="lb-s">s</span><span class="lb-a">a</span>';
      document.body.appendChild(d);
      const disp = () => [d.querySelector('.lb-s'), d.querySelector('.lb-a')].map(e => getComputedStyle(e).display);
      const sym = disp();
      document.body.classList.add('lb-plain');
      const plain = disp();
      document.body.classList.remove('lb-plain'); d.remove();
      return { sym, plain };
    });
    check(row === 1, 'index.html: the "Plain arrows only" switch is in Settings → Experimental', row);
    check(css.sym[0] !== 'none' && css.sym[1] === 'none' && css.plain[0] === 'none' && css.plain[1] !== 'none',
      'index.html: its brand.css shows the symbols, or the plain arrows with body.lb-plain', css);
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
