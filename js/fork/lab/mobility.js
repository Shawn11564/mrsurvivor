/* ============ mobility.js — moves that move you, in Lab runs (MrSurvivor fork) ============
 * fork/PLAN-2026-10-22.md section A (stream A); fork/LAB.md "Close range and mobility".
 *
 * The way you walk, and back (A2, policy (a), the owner's choice G1): a dash or a recoil charge
 * goes the way you're walking (pl.moveAngle), or towards your aim when you stand still (with Manual aim:
 * always the aim). It hits everything along that line and leaves you where you started, like the whip
 * of Vampire Survivors: the move is directional, you're never displaced. It only fires when an enemy
 * lies on that line within its length (the clock waits, like js/fork/manual-fire.js). No camera kick.
 * The dash is drawn here (G.Combat.EXTRA.dash.over, a one-line hook in combat.js run); recoil and roll
 * are Lab kinds (js/fork/lab/kinds.js) and use the aim this file sets when they fire. A teammate's
 * copy (ghost) draws the line from its aim, which the cast message carries, as before.
 * Per move (A3): `pivot` (U-turn, Volt Switch, Flip Turn, Parting Shot): after the hit you switch to the
 * next slot (pl.cycle(1)); `rush` (Flame Charge): each cast stacks a speed boost; `meek` on a dash
 * (Parting Shot) marks the enemies it hits so they deal less (G.LabKinds2.mark).
 *
 * Mover grace (A1.2): for RELOC s after a dash or recoil, or a leap that lands by the target, nothing hurts you (Player.hurt does
 * nothing, like js/fork/revive-grace.js). Their own invulnerability didn't cover what kills close
 * players: hazards and lava set invuln to 0 before they hit (hazards.js, player.js). A leap's grace runs
 * to RELOC s after it lands. Game time (Player.update), so a pause doesn't use it up. A new grace starts
 * at most once per RELOC_EVERY s: an evolved Quick Attack recharges in under 0.5 s and would otherwise
 * never be hit at all.
 *
 * Only your own Pokémon, only in Lab runs. Hooks: G.Combat.EXTRA.dash.over, wraps G.Combat.tick,
 * G.Player.prototype.cast (after Lab's kinds), hurt and update. Test: fork/test-close-range.cjs.
 */
G.LabMobility = (() => {
  const C = G.Combat;
  const RELOC = 0.5, RELOC_EVERY = 1.2;
  const lab = () => !!(G.Lab && G.Lab.active);
  const col = m => G.U.TYPE_COLOR[m.type];

  // ---------------- policy (a) ----------------
  /** Moves that go along a line from you (dash, recoil). A roll (Rollout, Ice Ball) doesn't move you any
   *  more (kinds.js) and swings at the target like melee: the way you walk, it missed whoever you were
   *  circling (Rollout lasted 45 s in fork/survival-lab.cjs instead of 143). */
  const lined = m => m.kind === 'dash' || m.kind === 'recoil';
  /** Where a mover goes: the way you walk, else your aim (with Manual aim, always the aim). */
  const dirFor = pl => pl.walking && !pl.manualAim ? pl.moveAngle : pl.aim;
  /** How far a line move goes from (x, y) along a before a wall (8 px steps, like combat.js dash). */
  function lineLen(pl, m, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    let len = 0;
    for (let d = 8; d <= m.radius; d += 8) {
      if (!G.World.isFree(pl.x + ca * d, pl.y + sa * d, pl.r * 0.8, true)) break;
      len = d;
    }
    return len;
  }
  /** The enemies `m` would hit from where you are, going towards a. */
  function struck(pl, m, a) {
    const out = [];
    if (m.kind === 'ramp') {
      const half = Math.min(m.arc || 2, 6.2832) / 2;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) if (!e.dead && C.inArc(pl.x, pl.y, e.x, e.y, a, half)) out.push(e);
      return out;
    }
    const len = lineLen(pl, m, a), w = m.width || 34, ex = pl.x + Math.cos(a) * len, ey = pl.y + Math.sin(a) * len;
    for (const e of G.EnemyMgr.queryCircle((pl.x + ex) / 2, (pl.y + ey) / 2, len / 2 + w)) {
      if (!e.dead && C.segDist2(pl.x, pl.y, ex, ey, e.x, e.y) <= (w / 2 + e.r) ** 2) out.push(e);
    }
    return out;
  }

  // A mover about to fire: aim it (dirFor) if an enemy lies on its line, else hold its clock.
  const tick = C.tick;
  C.tick = function (dt, pl) {
    if (pl && !pl.remote && !pl.dead && lab()) {
      for (const m of pl.activeGroup()) {
        if (!lined(m) || m.t - dt > 0) continue;
        const a = dirFor(pl);
        if (struck(pl, m, a).length) pl.aim = a;
        else m.t = dt + 1e-4;
      }
    }
    return tick.apply(this, arguments);
  };

  /** Lab's dash: along pl.aim, hit, and you stay where you were. */
  function dash(pl, m) {
    const c = col(m), v = G.VFX.forMove(m), a = pl.aim, ca = Math.cos(a), sa = Math.sin(a);
    const sx = pl.x, sy = pl.y, len = lineLen(pl, m, a), ex = sx + ca * len, ey = sy + sa * len;
    for (let d = 0; d <= len; d += 22) G.FX.sp(v.proj || 'streak', v.pal, sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.22, angle: a });
    G.FX.slash(ex, ey - G.LIFT * 0.5, a, 34, 2.2, c, v);
    G.FX.ring(sx, sy, 4, pl.r * 2.2, c, 0.25, 2);                      // back where you started
    pl.invuln = Math.max(pl.invuln || 0, 0.3);
    const w = m.width || 34, dmg = m.dmg * pl.atkFor(m), mx = (sx + ex) / 2, my = (sy + ey) / 2;
    for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
      if (C.segDist2(sx, sy, ex, ey, e.x, e.y) > (w / 2 + e.r) ** 2) continue;
      C.hit(pl, e, dmg, c, ca, sa, m.knock || 0, m);
      if (m.meek && !e.dead && G.LabKinds2) G.LabKinds2.mark(e, { meek: m.meek, dur: m.markDur || 4 });
    }
    for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) {
      if (C.segDist2(sx, sy, ex, ey, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, dmg, c);
    }
  }
  /** After a dash or recoil: Flame Charge's speed stack, a pivot's slot switch. */
  function after(pl, m) {
    if (m.rush) pl.addBuff('spd', m.rush, m.rushDur || 4, m.rushStacks || 3, m.id);
    if (m.pivot && pl.slots.length > 1) pl.cycle(1);
  }
  C.EXTRA.dash = {
    target: true, reach: m => m.radius + 60,                           // as combat.js reach
    over(pl, m, ghost) {
      if (ghost || !lab()) return false;                                // a teammate's copy, a normal run: combat.js
      dash(pl, m);
      after(pl, m);
      return true;
    }
  };

  // ---------------- mover grace (A1.2) ----------------
  /** Seconds of grace a cast of `m` gives (0: none). */
  function graceFor(m) {
    if (!m) return 0;
    if (lined(m)) return RELOC;
    // A leap that comes down by the target ('stay' and 'back' keep you out of the crowd: no grace).
    if (m.kind === 'leap' && m.land !== 'stay' && m.land !== 'back') return (m.dur || 0.65) + Math.max(0, (m.chain || 1) - 1) * (m.chainDur || 0.32) + RELOC;
    return 0;
  }
  const P = G.Player.prototype, cast = P.cast, hurt = P.hurt, update = P.update;
  P.cast = function (m) {
    const g = !this.remote && lab() ? graceFor(m) : 0, t = G.Game.st.time;
    if (g && !(t - (this._relocAt || -1e9) < RELOC_EVERY)) { this._relocT = Math.max(this._relocT || 0, g); this._relocAt = t; }
    return cast.apply(this, arguments);
  };
  P.hurt = function () {
    if (this._relocT > 0 && !this.dead && !this.remote) { this.invuln = Math.max(this.invuln || 0, Math.min(this._relocT, 0.1)); return; }
    return hurt.apply(this, arguments);
  };
  P.update = function (dt) {
    if (this._relocT > 0) this._relocT -= dt;
    return update.apply(this, arguments);
  };

  return { RELOC, RELOC_EVERY, graceFor, dirFor, struck, lined, after };
})();
