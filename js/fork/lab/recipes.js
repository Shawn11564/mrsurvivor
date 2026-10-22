/* ============ recipes.js — bond recipes in Lab runs (MrSurvivor fork) ============
 * Plan B4 (Vampire Survivors' unions), fork/LAB.md "Phase 11: builds". A bond (a legendary's reward,
 * js/game.js offerBond → Player.fuse) puts moves in one slot so they cast together. In a Lab run some
 * pairs in the same slot also change how a move works, for as long as they share it:
 *   Sunny Day + Solar Beam       Solar Beam fires at once: no charge
 *   Rain Dance + Thunder Shock   the bolts home in (never miss) and each hit jumps to 2 more enemies (40 %)
 *   Will-O-Wisp + Hex            Hex's chain burns every enemy it hits, so its later hops hit statused ones
 *   Snowscape + Ice Beam         Ice Beam freezes: its hits stop enemies for 0.5 s (once every 2 s each)
 *   Leech Seed + Giga Drain      Giga Drain plants Leech Seed on everything it touches
 * The bond screen says which pick makes a recipe (under the card's bond note), and the move's box and
 * the pause menu name it.
 * Each frame (Combat.tick) the slots are checked: a recipe's move gets m._recipe and its changes once
 * (m._recipeOn), so a resumed run (js/fork/lab/resume.js rebuilds the slots) gets them back by itself.
 * Co-op: G.Coop.cast sends the recipe in the level's hundreds (lvl + 100 × its number, next to
 * branches.js's tens) and G.Combat.ghostCast reads it back, so a teammate's Solar Beam fires at once on
 * your screen too; jumps, burns and stops go through Combat.hit / applyBurn / applyStun.
 * Test: fork/test-builds.cjs --only recipes.
 */
G.LabRecipes = (() => {
  const PINK = '#ff8ad8';
  const once = (e, key, ms) => { const t = performance.now(); if ((e[key] || 0) > t) return false; e[key] = t + ms; return true; };
  const RECIPES = [
    { id: 'sun-solar', a: 'sunny-day', b: 'solar-beam', n: 'Solar Flare', t: 'Solar Beam fires at once: no charge.',
      mod: m => { if (m.id === 'solar-beam') m.charge = 0.05; } },
    { id: 'rain-thunder', a: 'rain-dance', b: 'thunder-shock', n: 'Thunderstorm', t: 'Thunder Shock\'s bolts home in, and each hit jumps to 2 more enemies.',
      mod: m => { if (m.id === 'thunder-shock') m.homing = Math.max(m.homing || 0, 8); },
      hit: (pl, e, m) => {
        if (m.id !== 'thunder-shock') return;
        const col = G.U.TYPE_COLOR.electric;
        const near = G.EnemyMgr.queryCircle(e.x, e.y, 140).filter(o => o !== e && !o.dead)
          .sort((p, q) => G.U.dist2(e.x, e.y, p.x, p.y) - G.U.dist2(e.x, e.y, q.x, q.y)).slice(0, 2);
        for (const o of near) {
          const fy = e.y - e.bodyH * 0.5, ty = o.y - o.bodyH * 0.5;
          G.FX.beam(e.x, fy, Math.atan2(ty - fy, o.x - e.x), Math.hypot(o.x - e.x, ty - fy), 6, col, G.VFX.forMove(m));
          G.Combat.hit(pl, o, m.dmg * pl.atkFor(m) * 0.4, col, o.x - e.x, o.y - e.y, 0, m);
        }
      } },
    { id: 'wisp-hex', a: 'will-o-wisp', b: 'hex', n: 'Infernal Hex', t: 'Hex\'s chain burns every enemy it hits, so its later hops hit harder.',
      mod: m => { if (m.id === 'hex') m.burn = Math.max(m.burn || 0, 1); } },
    { id: 'snow-beam', a: 'snowscape', b: 'ice-beam', n: 'Deep Freeze', t: 'Ice Beam freezes: its hits stop enemies for 0.5 s (once every 2 s each).',
      hit: (pl, e, m) => { if (m.id === 'ice-beam' && !e.dead && once(e, '_labFrzAt', 2000)) e.applyStun(0.5); } },
    { id: 'seed-drain', a: 'leech-seed', b: 'giga-drain', n: 'Root Network', t: 'Giga Drain plants Leech Seed on everything it touches.',
      mod: m => { if (m.id === 'giga-drain') m.seed = 3; } }
  ];
  const BY = Object.fromEntries(RECIPES.map(r => [r.id, r]));
  const IDX = Object.fromEntries(RECIPES.map((r, i) => [r.id, i + 1]));
  const lab = () => !!(G.Lab && G.Lab.active);
  const esc = s => G.Lab.esc(s);
  /** Recipes that two (or more) moves make together. */
  const between = (ms) => RECIPES.filter(r => ms.some(m => m.id === r.a) && ms.some(m => m.id === r.b));
  const recipeOf = m => m && m._recipe && BY[m._recipe];

  /** Gives each move in a recipe slot its recipe (once). */
  function refresh(pl) {
    if (!pl || !pl.slots) return;
    for (const g of pl.slots) {
      if (g.length < 2) continue;
      for (const r of between(g)) for (const m of g) {
        if (m.id !== r.a && m.id !== r.b) continue;
        if (m._recipe !== r.id) { m._recipe = r.id; m._recipeOn = false; }
        if (!m._recipeOn) { if (r.mod) r.mod(m); m._recipeOn = true; }
      }
    }
  }
  const tick = G.Combat.tick;
  G.Combat.tick = function (dt, pl) {
    if (pl && pl === G.Game.player && lab()) refresh(pl);
    return tick.apply(this, arguments);
  };
  const P = G.Player.prototype, fuse = P.fuse;
  P.fuse = function () {
    const g = fuse.apply(this, arguments);
    if (lab() && this === G.Game.player && g) {
      refresh(this);
      for (const r of between(g)) { G.Spawner.say('Recipe: ' + r.n, 3, true); G.FX.ring(this.x, this.y, 8, 150, PINK, 0.9, 6); }
    }
    return g;
  };
  G.LabHits.on((pl, e, m) => { const r = recipeOf(m); if (r && r.hit) r.hit(pl, e, m); });

  // ---------------- co-op: the recipe travels with each cast ----------------
  const coopCast = G.Coop.cast;
  G.Coop.cast = function (pl, m) {
    const i = m && m._recipe && IDX[m._recipe];
    if (!i) return coopCast.apply(this, arguments);
    const lv = m.lvl;
    m.lvl = lv + 100 * i;
    try { return coopCast.apply(this, arguments); } finally { m.lvl = lv; }
  };
  const ghostCast = G.Combat.ghostCast;
  G.Combat.ghostCast = function (pl, id, lvl, aim, evolved) {
    const i = Math.floor((lvl | 0) / 100), r = RECIPES[i - 1];
    if (!r) return ghostCast.apply(this, arguments);
    const inst = G.Moves.instance;
    G.Moves.instance = function (id2) {
      const s = inst.apply(this, arguments);
      if (id2 === id && r.mod) { r.mod(s); s._recipe = r.id; s._recipeOn = true; }
      return s;
    };
    try { return ghostCast.call(this, pl, id, (lvl | 0) - 100 * i, aim, evolved); } finally { G.Moves.instance = inst; }
  };

  // ---------------- the bond screen: which pick makes a recipe ----------------
  let opt = null;
  const showBond = G.RunUI.showBond;
  G.RunUI.showBond = function (o) {
    opt = o;
    const r = showBond.apply(this, arguments);
    annotate();
    return r;
  };
  const nameOf = m => G.T(m.name, 'move');
  function annotate() {
    const box = document.getElementById('bond-cards');
    if (!box || !opt || !lab()) return;
    const cards = [...box.querySelectorAll('.card')];
    if (!cards.length || cards.some(el => el.dataset.recipes)) return;
    const loose = opt.loose || [];
    const step2 = opt.mode === 'pair' && cards.length === loose.length - 1;
    const shown = cards.map(el => { const nm = el.querySelector('.nm'); const t = nm ? nm.textContent : ''; return loose.find(m => t.startsWith(nameOf(m))); });
    const first = step2 ? loose.find(m => !shown.includes(m)) : null;
    cards.forEach((el, i) => {
      el.dataset.recipes = '1';
      const m = shown[i];
      if (!m) return;
      const partners = opt.mode === 'add' ? opt.group : step2 ? [first] : loose.filter(x => x !== m);
      const rs = RECIPES.filter(r => partners.some(p => p && between([m, p]).includes(r)));
      if (!rs.length) return;
      el.classList.add('recipe');
      el.style.boxShadow = `0 0 0 2px ${PINK}, 0 0 14px ${PINK}77`;
      const txt = el.querySelector('.txt');
      if (txt) txt.insertAdjacentHTML('beforeend', rs.map(r => `<div class="ds bond-recipe" style="color:${PINK}">Recipe: <b>${esc(r.n)}</b>. ${esc(r.t)}</div>`).join(''));
    });
  }
  const box = document.getElementById('bond-cards');
  if (box && window.MutationObserver) new MutationObserver(() => annotate()).observe(box, { childList: true });

  // ---------------- what you see ----------------
  const tipNotes = G.MoveText.tipNotes;
  G.MoveText.tipNotes = function (m) {
    const out = tipNotes.apply(this, arguments), r = recipeOf(m);
    if (r) out.push(['Recipe: ' + r.n + '. ' + r.t, PINK]);
    return out;
  };
  G.Lab.pauseLine(pl => {
    const got = [...new Set(pl.moves.map(m => m._recipe).filter(id => BY[id]))];
    return got.length ? 'Recipes: ' + got.map(id => `<b>${esc(BY[id].n)}</b> (${esc(BY[id].t)})`).join(' ') : '';
  });
  G.I18n.add(Object.fromEntries(RECIPES.map(r => [r.n, r.n])), 'en');

  return { RECIPES, BY, between, refresh };
})();
