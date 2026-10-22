/* ============ close-target.js — close-range moves aim at what they can reach (MrSurvivor fork) ============
 * Every run (fork/PLAN-2026-10-22.md A1.6 and A1.7, bugs):
 *  - Melee, spin, grab, bind, ramp and focus aim at the nearest enemy IN REACH. Player.update picks
 *    "touching you > boss within 330 px > nearest", and Combat.tickMove waits until that target is in
 *    reach: with a boss 250 px away and enemies at your feet (not quite touching), a melee move just
 *    stood there (upstream issues #186 and #208). Now, when the picked target is out of reach, the
 *    target becomes a boss in reach if there is one, else the nearest enemy in reach.
 *  - Movers (dash, Lab's recoil and leap, and a rolling ramp) never fire at a rock or a chest. With no
 *    enemy near, Player.update aims at the nearest breakable prop, and a dash at it dragged you across
 *    the map. Their clock is held just above 0 (like js/fork/manual-fire.js) while the target is a prop,
 *    so the first enemy gets them at once. Other moves still break props.
 * Only your own Pokémon, and not with manual aim (you choose there).
 * Hooks: wraps G.Player.prototype.update (after the game's target pick) and G.Combat.tick.
 * Test: fork/test-close-range.cjs.
 */
G.CloseTarget = (() => {
  const C = G.Combat;
  const REACH = new Set(['melee', 'spin', 'grab', 'bind', 'ramp', 'focus']);
  const MOVERS = new Set(['dash', 'recoil', 'leap']);
  const mover = m => MOVERS.has(m.kind) || (m.kind === 'ramp' && !!m.roll);
  const near = (pl, e, r) => G.U.dist(pl.x, pl.y, e.x, e.y) <= r;

  /** A boss in reach, else the nearest enemy in reach, else null. */
  function inReach(pl, r) {
    let best = null, bd = Infinity, boss = null, bb = Infinity;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, r)) {
      if (e.dead || !e.hurt) continue;
      const d = G.U.dist(pl.x, pl.y, e.x, e.y);
      if (d > r) continue;
      if ((e.boss || e.judge) && d < bb) { bb = d; boss = e; }
      if (d < bd) { bd = d; best = e; }
    }
    return boss || best;
  }

  const P = G.Player.prototype, update = P.update;
  P.update = function (dt) {
    const out = update.apply(this, arguments);
    if (this.remote || this.dead || this.manualAim) return out;
    const m = this.activeMove();
    if (!m || !REACH.has(m.kind)) return out;
    const r = C.reach(m), t = this.target;
    if (t && t.hurt && !t.dead && near(this, t, r)) return out;
    const e = inReach(this, r);
    if (e) { this.target = e; this.aim = Math.atan2(e.y - this.y, e.x - this.x); }
    return out;
  };

  const tick = C.tick;
  C.tick = function (dt, pl) {
    if (pl && !pl.remote && !pl.dead && !pl.manualAim && pl.target && !pl.target.hurt) {
      for (const m of pl.activeGroup()) if (mover(m) && m.t - dt <= 0) m.t = dt + 1e-4;
    }
    return tick.apply(this, arguments);
  };

  return { REACH, MOVERS, mover, inReach };
})();
