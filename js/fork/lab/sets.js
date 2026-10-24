/* ============ sets.js — set bonuses in Lab runs (MrSurvivor fork) ============
 * Plan B4 (Brotato's sets), fork/LAB.md "Phase 11: builds". In a Lab run, what your move slots hold
 * turns on bonuses for as long as it holds them:
 *   3 damaging moves of one type:
 *     Fire       every Fire hit adds one more burn stack
 *     Water      Water hits slow enemies (30 % for 1.5 s)
 *     Electric   Electric hits jump to one more enemy within 120 px for 35 % of the move's damage
 *     Grass      Grass moves heal you 12 % of the damage they deal
 *     Fighting   +20 % physical damage, and the close-range cut (25 % less damage taken) with any move active
 *   3 physical moves   lifesteal: 8 % of all physical damage heals you
 *   2 priority moves   switching moves leaves at most 10 % of the cooldown (the game's switch leaves 35 %)
 * Healing from sets is capped at HEAL_CAP of your max HP a second. Several sets add up.
 * Shown: chips under the HP bar (G.HUD.belowHp), a line in the pause menu, and a note on a new-move card
 * that would complete a set.
 * Hooks: G.LabHits (after each of your hits), Player.prototype.atkFor / hurt / setActive, Combat.tick
 * (pays the healing), G.LevelUp.offer. Co-op: each player's own sets; burns, slows
 * and hits go through applyBurn / applySlow / Combat.hit, which a guest forwards to the host.
 * Test: fork/test-builds.cjs --only sets.
 */
G.LabSets = (() => {
  const HEAL_CAP = 0.03, HOP_R = 120, HOP_K = 0.35, HOPS_PER_S = 6;
  const PRIORITY = new Set(['quick-attack', 'extreme-speed', 'aqua-jet', 'ice-shard', 'shadow-sneak', 'sucker-punch', 'mach-punch',
    'bullet-punch', 'vacuum-wave', 'fake-out', 'accelerock', 'jet-punch', 'water-shuriken', 'first-impression', 'grassy-glide']);
  const SETS = [
    { id: 'fire', type: 'fire', need: 3, n: 'Fire set', t: 'every Fire hit adds one more burn stack' },
    { id: 'water', type: 'water', need: 3, n: 'Water set', t: 'Water hits slow enemies' },
    { id: 'electric', type: 'electric', need: 3, n: 'Electric set', t: 'Electric hits jump to one more enemy nearby' },
    { id: 'grass', type: 'grass', need: 3, n: 'Grass set', t: 'Grass moves heal you for 12% of their damage' },
    { id: 'fighting', type: 'fighting', need: 3, n: 'Fighting set', t: '+20% physical damage, and 25% less damage taken whatever move is active' },
    { id: 'physical', cat: 'physical', need: 3, n: 'Physical set', t: 'lifesteal: 8% of your physical damage heals you' },
    { id: 'priority', prio: true, need: 2, n: 'Priority set', t: 'after switching moves, the new move has at most 10% of its cooldown left' }
  ];
  const BY = Object.fromEntries(SETS.map(s => [s.id, s]));
  const lab = () => !!(G.Lab && G.Lab.active);
  const esc = s => G.Lab.esc(s);
  const counts = (s, moves) => moves.filter(m => s.prio ? PRIORITY.has(m.id) : m.cat && (s.type ? m.type === s.type : m.cat === s.cat)).length;
  /** The sets these moves turn on: Set of ids. */
  const compute = moves => new Set(SETS.filter(s => counts(s, moves) >= s.need).map(s => s.id));
  /** Active sets of a player (your own Pokémon in a Lab run), counted again whenever its moves change. */
  const NONE = new Set();
  function active(pl) {
    if (!lab() || api.off || !pl || pl.remote || !pl.moves) return NONE;
    const c = pl._labSetsOf, ms = pl.moves;
    if (!c || c.length !== ms.length || ms.some((m, i) => m !== c[i] || m.type !== c.t[i])) {
      pl._labSetsOf = Object.assign(ms.slice(), { t: ms.map(m => m.type) });
      pl._labSets = compute(ms);
    }
    return pl._labSets;
  }
  const has = (pl, id) => active(pl).has(id);

  // ---------------- every frame: count, heal ----------------
  const tick = G.Combat.tick;
  G.Combat.tick = function (dt, pl) {
    if (pl && pl === G.Game.player && lab()) {
      const pool = pl._labSetHeal || 0;
      if (pool > 0 && !pl.dead) {
        const h = Math.min(pool, pl.maxHp * HEAL_CAP * dt, Math.max(0, pl.maxHp - pl.hp));
        pl.hp += h;
        pl._labSetHeal = pool - Math.max(h, pl.maxHp * HEAL_CAP * dt * 0.5);   // what doesn't fit fades
        if (pl._labSetHeal < 0) pl._labSetHeal = 0;
      }
      pl._labHopT = Math.min(HOPS_PER_S, (pl._labHopT || 0) + dt * HOPS_PER_S);
    }
    return tick.apply(this, arguments);
  };

  // ---------------- after each of your hits ----------------
  const nearOther = (e, r) => {
    let best = null, bd = r * r;
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, r)) {
      if (o === e || o.dead) continue;
      const d = G.U.dist2(e.x, e.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };
  G.LabHits.on((pl, e, m, dmg) => {
    const s = active(pl);
    if (!s.size) return;
    if (m.type === 'fire' && s.has('fire') && !e.dead) e.applyBurn(1);
    if (m.type === 'water' && s.has('water') && !e.dead) e.applySlow(0.3, 1.5);
    if (m.type === 'grass' && s.has('grass')) pl._labSetHeal = Math.min(pl.maxHp * 0.2, (pl._labSetHeal || 0) + dmg * 0.12);
    if (m.cat === 'physical' && s.has('physical')) pl._labSetHeal = Math.min(pl.maxHp * 0.2, (pl._labSetHeal || 0) + dmg * 0.08);
    if (m.type === 'electric' && s.has('electric') && (pl._labHopT || 0) >= 1) {
      const o = nearOther(e, HOP_R);
      if (!o) return;
      pl._labHopT -= 1;
      const col = G.U.TYPE_COLOR.electric, fy = e.y - e.bodyH * 0.5, ty = o.y - o.bodyH * 0.5;
      G.FX.beam(e.x, fy, Math.atan2(ty - fy, o.x - e.x), Math.hypot(o.x - e.x, ty - fy), 6, col, G.VFX.forMove(m));
      G.Combat.hit(pl, o, m.dmg * pl.atkFor(m) * HOP_K, col, o.x - e.x, o.y - e.y, 0, m);
    }
  });

  // ---------------- your Pokémon ----------------
  const P = G.Player.prototype;
  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.apply(this, arguments);
    return m && m.cat === 'physical' && has(this, 'fighting') ? k * 1.2 : k;
  };
  const hurt = P.hurt;
  P.hurt = function (amount, type, pure) {
    if (!pure && !this.remote && !(this.invuln > 0) && !this.dead && has(this, 'fighting')) {
      const g = this.activeGroup(), CLOSE = (G.LabKinds2 && G.LabKinds2.CLOSE) || new Set();
      // Only when the active move doesn't already give it (melee in player.js, kinds2.js's close kinds).
      if (!g.some(m => m.kind === 'melee' || CLOSE.has(m.kind))) { arguments[0] = amount * 0.75; }
    }
    return hurt.apply(this, arguments);
  };
  const setActive = P.setActive;
  P.setActive = function () {
    const was = this.active, r = setActive.apply(this, arguments);
    if (this.active !== was && has(this, 'priority')) for (const m of this.activeGroup()) m.t = Math.min(m.t, m.cd * 0.1);
    return r;
  };

  // ---------------- what you see ----------------
  const COL = { physical: '#e8794a', priority: '#c9d3e6' };
  const colOf = s => s.type ? G.U.TYPE_COLOR[s.type] : COL[s.id];
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  function draw(ctx, pl, px, y) {
    const on = SETS.filter(s => active(pl).has(s.id));
    if (!on.length) return 0;
    ctx.save();
    ctx.font = F(800, 9);
    ctx.textBaseline = 'middle';
    let x = px, row = 0;
    for (const s of on) {
      const label = s.n.toUpperCase(), w = ctx.measureText(label).width + 10;
      if (x + w > px + 216 && x > px) { x = px; row++; }
      const yy = y + row * 17;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - 1, yy - 1, w + 2, 15, 5); else ctx.rect(x - 1, yy - 1, w + 2, 15); ctx.fill();
      ctx.fillStyle = colOf(s);
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, yy, w, 13, 4); else ctx.rect(x, yy, w, 13); ctx.fill();
      ctx.fillStyle = '#10131a';
      ctx.fillText(label, x + 5, yy + 7);
      x += w + 4;
    }
    ctx.restore();
    return (row + 1) * 17 + 2;
  }
  const below = G.HUD.belowHp;
  G.HUD.belowHp = (ctx, pl, px, y) => {
    const h = below ? below(ctx, pl, px, y) || 0 : 0;
    if (!pl || pl !== G.Game.player || !lab()) return h;
    try { return h + draw(ctx, pl, px, y + h); } catch (e) { return h; }   // never break the HUD
  };
  G.Lab.pauseLine(pl => {
    const s = active(pl), on = SETS.filter(x => s.has(x.id));
    const near = SETS.filter(x => !s.has(x.id) && counts(x, pl.moves) === x.need - 1);
    const out = [];
    if (on.length) out.push('Sets: ' + on.map(x => `<b>${esc(x.n)}</b> (${esc(x.t)})`).join(', ') + '.');
    if (near.length) out.push('One move away: ' + near.map(x => esc(x.n)).join(', ') + '.');
    return out.join(' ');
  });
  // A new-move card that would complete a set says so.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!lab() || !pl || pl !== G.Game.player || !Array.isArray(hand)) return hand;
    const now = active(pl);
    for (const c of hand) {
      if (!c || c.type !== 'new' || !c.key || typeof c.desc !== 'string') continue;
      const d = G.Moves.BY_ID[c.key.slice(4)];
      if (!d) continue;
      const got = SETS.filter(s => !now.has(s.id) && compute(pl.moves.concat([Object.assign({ id: d.id }, d)])).has(s.id));
      if (got.length) c.desc += ' <span class="fit-good">Completes the ' + got.map(s => esc(s.n) + ': ' + esc(s.t)).join('; the ') + '.</span>';
    }
    return hand;
  };
  G.I18n.add(Object.fromEntries(SETS.map(s => [s.n.toUpperCase(), s.n.toUpperCase()])), 'en');

  // off: no sets at all (fork/survival-lab.cjs --no-sets measures what they add).
  const api = { SETS, BY, PRIORITY, active, compute, counts, HEAL_CAP, off: false };
  return api;
})();
