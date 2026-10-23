/* ============ support.js — co-op support moves in Lab mode (MrSurvivor fork) ============
 * fork/TODO.md item 46, fork/LAB.md "Co-op support moves". Moves that help teammates, so a build in a
 * co-op run can turn into a support or a tank. They only exist in co-op Lab runs: they are never in a
 * species' Lab list (lab.js leaves `coop` moves out, lab-tms.js doesn't sell them, Metronome never
 * calls them); the only way to get one is the co-op card this file deals into the level-up hand, for a
 * species that learns the move in the games (G.Lab.learnOf, from fork/fetch-lab.cjs).
 *
 * Kind 'ally' (js/fork/lab/lab-moves.js): on their own from any slot, each on its own clock (`_st`),
 * when the team needs it; `ally` says what it does:
 *   heal   Heal Pulse: when a teammate in reach is below `below` HP, every teammate in reach (not you)
 *          gets `amount` of their max HP back
 *   scent  Aromatherapy: when you or a teammate in reach is below `below`, you and they heal `amount`
 *          of max HP a second for `dur` s
 *   guard  Wide Guard: when enemies are near the team, you and every teammate in reach block the next
 *          `count` hits within `dur` s (not "pure" damage: Arceus's judgment)
 *   block  Block: when 2+ enemies close in on a teammate in reach, you stand guard for `dur` s: the
 *          enemies within `radius` of you come for you instead (a decoy that follows you, mech.js's;
 *          bosses ignore it) and you take `amount` less damage (up to BLOCK_CAP)
 *   help   Helping Hand: when a teammate in reach is fighting, every teammate in reach (not you) deals
 *          `amount` more damage (up to HELP_CAP) for `dur` s
 *
 * Co-op: each player's HP and damage are their own, so nothing new travels. The caster's cast reaches
 * every other screen as a ghost cast (Combat.ghostCast: the host's to its guests, a guest's to the host,
 * which passes it on to the other guests), and there EXTRA.ally.run applies the effect to that screen's
 * own player if it stands in reach of the caster (with SLACK px for the lag), like Tailwind (mech.js).
 * Teammates' effects are drawn on every screen (timers only). Block's decoy is made on every screen;
 * the enemies' AI that follows it runs on the host (mech.js decoyFor).
 *
 * Hooks (chained): G.Combat.tick (the clocks), G.Combat.EXTRA.ally, Player.cast/hurt/atkFor/draw,
 * Combat.updateFields/clearFields, G.LevelUp.offer (the co-op card), G.Lab.pauseLine.
 * Texts in English only. Test: fork/test-lab-support.cjs (solo Lab, normal and co-op runs).
 */
G.LabSupport = (() => {
  const C = G.Combat, X = C.EXTRA, P = G.Player.prototype;
  const lab = () => !!(G.Lab && G.Lab.active);
  const coop = () => !!(G.Coop && G.Coop.active);
  const now = () => performance.now();
  const col = m => G.U.TYPE_COLOR[m.type];
  const boss = e => e.boss || e.judge;
  const COOP = new Set(G.LabMoves.filter(d => d.coop).map(d => d.id));
  const SLACK = 40;                         // px: where a teammate stands on your screen lags behind
  const CARD_IN = 0.5;                      // a co-op card in 1 hand of 2 (while you have a free slot)
  const HELP_CAP = 0.6, BLOCK_CAP = 0.6;
  const GUARD_COL = '#c9b06b', HELP_COL = '#ffd23f', BLOCK_COL = '#8fb7ff', HOT_COL = '#7fe08a';

  Object.assign(G.Icons.KIND_GLYPH, { ally: ['.#.#.', '#####', '#####', '.###.', '..#..'] });

  // The texts stay as they are when the game sends them through its dictionary.
  const kept = new Set();
  function keep(...texts) {
    const d = {};
    for (const t of texts) if (t && !kept.has(t)) { kept.add(t); d[t] = t; }
    if (Object.keys(d).length) { G.I18n.add(d, 'en'); G.I18n.add(d, 'en', 'move'); }
  }
  for (const d of G.LabMoves) if (d.coop) keep(d.name, d.desc, d.evo && d.evo[0], d.evoMod && d.evoMod.t, ...(d.ups || []).map(u => u.t));
  keep('Blocked!', 'Guard!', 'Co-op');

  const me = () => G.Game.player;
  /** Everyone alive on this screen: you and your teammates' puppets. */
  const team = () => [me()].concat(coop() ? G.Coop.puppets() : []).filter(p => p && !p.dead);
  const near = (a, b, r) => G.U.dist2(a.x, a.y, b.x, b.y) <= r * r;
  const enemiesNear = (p, r, n = 1, bosses = true) => {
    let k = 0;
    for (const e of G.EnemyMgr.queryCircle(p.x, p.y, r)) if (!e.dead && (bosses || !boss(e)) && ++k >= n) return true;
    return false;
  };

  // ---------------- when each one goes off (your screen, your moves) ----------------
  /** How far from you a teammate counts for the move going off (Block looks a quarter further than it pulls). */
  const reachOf = m => (m.radius || 220) * (m.ally === 'block' ? 1.25 : 1);
  function wants(pl, m) {
    const r = reachOf(m), mates = team().filter(p => p !== pl && near(pl, p, r));
    switch (m.ally) {
      case 'heal':  return mates.some(p => p.hp < p.maxHp * (m.below || 0.6));
      case 'scent': return [pl].concat(mates).some(p => p.hp < p.maxHp * (m.below || 0.75));
      case 'guard': return [pl].concat(mates).some(p => enemiesNear(p, 160));
      case 'block': return mates.some(p => enemiesNear(p, 130, 2, false));
      case 'help':  return mates.some(p => enemiesNear(p, 300));
    }
    return false;
  }
  const ctick = C.tick;
  C.tick = function (dt, pl) {
    const r = ctick.apply(this, arguments);
    if (!pl || pl.dead || pl.remote || !lab() || pl._labRest > 0) return r;
    for (const grp of pl.slots) for (const m of grp) {
      if (m.kind !== 'ally') continue;
      m._st = (m._st || 0) - dt;
      if (m._st > 0) continue;
      if (!wants(pl, m)) { m._st = 0.2; continue; }
      m._st = Math.max(0.05, m.cd * pl.cdMul);
      if (grp === pl.activeGroup()) pl.cast(m);
      if (coop()) G.Coop.cast(pl, m);
      m.castAt = now();
      C.run(pl, m);
    }
    return r;
  };
  // They look like a stat boost being cast (Player.cast picks the animation and sound by kind).
  const pcast = P.cast;
  P.cast = function (m) {
    return pcast.call(this, m && m.kind === 'ally' ? { kind: 'buff', cd: m.cd, type: m.type, anim: m.anim } : m);
  };

  // ---------------- what they do (every screen: yours for real, the others' drawn) ----------------
  const follow = [];                       // Block's decoys (mech.js), kept on their user
  X.ally = {
    target: true, reach: () => 0,           // never from Combat.tickMove: C.tick above fires them
    run(pl, m, ghost) {
      if (!lab()) return;
      const self = me(), r = (m.radius || 220) + (ghost ? SLACK : 0), c = col(m);
      G.FX.ring(pl.x, pl.y, 8, m.radius || 220, c, 0.45, 3);
      if (m.ally === 'block') { block(pl, m, ghost); return; }
      for (const p of team()) {
        if (p !== pl && !near(pl, p, r)) continue;
        const mine = p === self && !p.remote, other = p !== pl;
        if ((m.ally === 'heal' || m.ally === 'help') && !other) continue;       // for teammates only
        if (other) beam(pl, p, m.ally === 'help' ? HELP_COL : m.ally === 'guard' ? GUARD_COL : c);
        if (m.ally === 'heal') {
          if (mine) p.heal(p.maxHp * (m.amount || 0.22));
          for (let i = 0; i < 6; i++) G.FX.sp('heart', 'psychic', p.x + G.U.rand(-12, 12), p.y - G.U.rand(0, p.bodyH), { vy: -60, life: 0.7 });
        } else if (m.ally === 'scent') {
          if (mine) { const h = p._labHot; if (!h || h.k <= m.amount || h.t <= 0) p._labHot = { k: m.amount || 0.03, t: m.dur || 5, acc: 0, tick: 0.5 }; }
          else p._labHotV = m.dur || 5;
          for (let i = 0; i < 5; i++) G.FX.sp('leaf', 'grass', p.x + G.U.rand(-14, 14), p.y - G.U.rand(0, p.bodyH), { vy: -40, life: 0.8 });
        } else if (m.ally === 'guard') {
          const n = Math.max(1, Math.round(m.count || 2)), t = m.dur || 8;
          if (mine) p._labWide = { n: Math.max(n, (p._labWide && p._labWide.t > 0 && p._labWide.n) || 0), t };
          else p._labWideV = t;
          G.FX.ring(p.x, p.y, 6, p.r * 2.2, GUARD_COL, 0.4, 3);
        } else if (m.ally === 'help') {
          const k = Math.min(HELP_CAP, m.amount || 0.3), t = m.dur || 6, h = p._labHelp;
          if (mine) { if (!h || h.t <= 0 || h.k <= k) p._labHelp = { k, t }; else h.t = Math.max(h.t, t); }
          else p._labHelpV = t;
          G.FX.burst(p.x, p.y - p.bodyH * 0.6, HELP_COL, 10, 120);
        }
      }
    }
  };
  /** A line of light from the caster to a teammate it helps (drawn for a moment). */
  function beam(a, b, c) {
    const n = 8;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      G.FX.px(a.x + (b.x - a.x) * k, a.y - a.bodyH * 0.5 + (b.y - b.bodyH * 0.5 - a.y + a.bodyH * 0.5) * k, c, { life: 0.35 + k * 0.2 });
    }
  }
  /** Block: a decoy that follows its user (enemies within `radius` come for it), and less damage. */
  function block(pl, m, ghost) {
    const life = m.dur || 5;
    const d = G.LabMech.decoy(pl, m, pl.x, pl.y, life, m.radius || 240);
    d.follow = pl;
    follow.push(d);
    if (!ghost && !pl.remote) pl._labBlock = { k: Math.min(BLOCK_CAP, m.amount || 0.35), t: life };
    else pl._labBlockV = life;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, 'Guard!', BLOCK_COL, true);
  }

  // ---------------- your Pokémon ----------------
  const phurt = P.hurt;
  P.hurt = function (amount, type = null, pure = false, cat = null) {
    if (this.remote || this.invuln > 0 || this.dead || this.god || pure) return phurt.apply(this, arguments);
    const g = this._labWide;
    if (g && g.n > 0 && g.t > 0) {
      g.n--;
      if (g.n <= 0) this._labWide = null;
      this.invuln = Math.max(this.invuln, 0.45);
      G.FX.dmgText(this.x, this.y - this.bodyH - 4, 'Blocked!', GUARD_COL);
      G.FX.ring(this.x, this.y, 4, this.r * 2.4, GUARD_COL, 0.35, 4);
      return;
    }
    const b = this._labBlock;
    if (b && b.t > 0) amount *= 1 - b.k;
    return phurt.call(this, amount, type, pure, cat);
  };
  const atkFor = P.atkFor;
  P.atkFor = function (m) {
    const k = atkFor.apply(this, arguments), h = this._labHelp;
    return h && h.t > 0 && !this.remote ? k * (1 + h.k) : k;
  };
  const pdraw = P.draw;
  P.draw = function (ctx) {
    pdraw.apply(this, arguments);
    if (this.dead) return;
    const g = this._labWide && this._labWide.n > 0 ? this._labWide.t : this._labWideV || 0;
    const b = this._labBlock ? this._labBlock.t : this._labBlockV || 0;
    if (!(g > 0) && !(b > 0)) return;
    const t = now() / 1000;
    ctx.save();
    if (g > 0) {
      // Wide Guard: a stone hexagon around you, one pip per hit it still blocks (yours only: you know).
      ctx.globalAlpha = 0.55 * Math.min(1, g * 2); ctx.strokeStyle = GUARD_COL; ctx.lineWidth = 2;
      const rx = this.r * 1.9, ry = this.bodyH * 0.75, cy = this.y - this.bodyH * 0.45;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i / 6 * 6.2832 + t * 0.6; ctx[i ? 'lineTo' : 'moveTo'](this.x + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
      ctx.stroke();
      const n = this._labWide ? this._labWide.n : 0;
      ctx.fillStyle = GUARD_COL; ctx.globalAlpha = 0.9;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(this.x + (i - (n - 1) / 2) * 6, this.y - this.bodyH - 6, 2, 0, 6.2832); ctx.fill(); }
    }
    if (b > 0) {
      // Block: a blue ring at your feet, pulsing.
      ctx.globalAlpha = 0.6 * Math.min(1, b * 2); ctx.strokeStyle = BLOCK_COL; ctx.lineWidth = 2.5;
      const k = 1 + Math.sin(t * 6) * 0.08;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.8 * k, this.r * 0.75 * k, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  };

  // ---------------- every frame ----------------
  function tickPlayer(p, dt) {
    const h = p._labHot;
    if (h) {
      if (!p.dead) h.acc += p.maxHp * h.k * Math.min(dt, Math.max(0, h.t));
      h.t -= dt; h.tick -= dt;
      if ((h.tick <= 0 || h.t <= 0) && h.acc > 0) { if (!p.dead) p.heal(h.acc); h.acc = 0; h.tick = 0.5; }
      if (h.t <= 0) p._labHot = null;
    }
    for (const k of ['_labWide', '_labHelp', '_labBlock']) if (p[k] && (p[k].t -= dt) <= 0) p[k] = null;
    for (const k of ['_labWideV', '_labHelpV', '_labBlockV', '_labHotV']) if (p[k] > 0) p[k] -= dt;
    if (p.dead) return;
    // Sparkles while it lasts: gold for Helping Hand, green for Aromatherapy.
    if ((p._labHelp || p._labHelpV > 0) && Math.random() < dt * 8) G.FX.px(p.x + G.U.rand(-10, 10), p.y - G.U.rand(4, p.bodyH), HELP_COL, { vy: -50, life: 0.5 });
    if ((p._labHot || p._labHotV > 0) && Math.random() < dt * 6) G.FX.px(p.x + G.U.rand(-10, 10), p.y - G.U.rand(0, p.bodyH * 0.6), HOT_COL, { vy: -35, life: 0.6 });
  }
  const update = C.updateFields;
  C.updateFields = function (dt) {
    update.apply(this, arguments);
    const pl = me();
    if (pl) tickPlayer(pl, dt);
    if (coop()) for (const p of G.Coop.puppets()) tickPlayer(p, dt);
    for (let i = follow.length - 1; i >= 0; i--) {
      const d = follow[i];
      if (d.gone || d.t >= d.life || !d.follow || d.follow.dead) { d.gone = true; follow.splice(i, 1); continue; }
      d.x = d.follow.x; d.y = d.follow.y;
    }
  };
  const clear = C.clearFields;
  C.clearFields = function (owner) {
    clear.apply(this, arguments);
    for (let i = follow.length - 1; i >= 0; i--) if (!owner || follow[i].owner === owner) follow.splice(i, 1);
  };

  // ---------------- the co-op card ----------------
  /** The co-op moves pl's species learns in the games that pl could take now. */
  function learnable(pl) {
    const L = G.Lab.learnOf(pl.mon.dex);
    return [...COOP].filter(id => L[id] && !pl.hasMove(id) && !(pl.banned && pl.banned.has(id)));
  }
  function card(id) {
    const d = G.Moves.BY_ID[id], tag = 'Co-op · ' + G.T(G.U.TYPE_NAME[d.type]);
    keep(tag);
    return { w: 10, type: 'new', key: 'new:' + id, coop: true, icon: 'move:' + id, color: G.U.TYPE_COLOR[d.type],
      tag, cat: '', title: G.T(d.name, 'move'), desc: d.desc, apply: p => p.addMove(id) };
  }
  // In a co-op Lab run with a free slot, in 1 hand of 2 a co-op move it learns takes the last new-move card's
  // place (else the last stat card's). Never in solo or in a normal run.
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const hand = offer.apply(this, arguments);
    if (!lab() || !coop() || !pl || pl !== me() || !Array.isArray(hand) || pl.slots.length >= pl.maxMoves) return hand;
    if (hand.some(c => c.coop) || Math.random() >= CARD_IN) return hand;
    const can = learnable(pl);
    if (!can.length) return hand;
    let i = hand.map(c => c.type).lastIndexOf('new');
    if (i < 0) i = hand.map(c => c.type).lastIndexOf('stat');
    if (i < 0) return hand;
    hand[i] = card(G.U.pick(can));
    return hand;
  };

  // Pause: in a co-op Lab run, the support moves it can learn here.
  G.Lab.pauseLine(pl => {
    if (!coop()) return '';
    const L = G.Lab.learnOf(pl.mon.dex), ids = [...COOP].filter(id => L[id]);
    if (!ids.length) return '';
    return 'Co-op support moves it can learn: ' + ids.map(id => `<span data-move="${id}" title="${G.Lab.esc(G.T(G.Moves.BY_ID[id].name, 'move'))}">${G.Icons.html('move:' + id, 16)}</span>`).join('');
  });

  return {
    COOP, CARD_IN, HELP_CAP, BLOCK_CAP, SLACK, wants, learnable, card,
    /** This screen's player's support effects right now (for checks). */
    state: p => {
      p = p || me();
      return p ? { hot: p._labHot && +p._labHot.k, guard: p._labWide ? p._labWide.n : 0, help: p._labHelp ? p._labHelp.k : 0, block: p._labBlock ? p._labBlock.k : 0 } : null;
    },
    follows: () => follow
  };
})();
