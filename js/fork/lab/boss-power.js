/* ============ boss-power.js — late bosses keep up with your build (Lab first, MrSurvivor fork) ============
 * A strong build one-shot rift and wild legendaries at 45:00: their HP grows with the clock (rift.js 3200 + 9 HP a
 * second, wild-legends.js 2600 + 6) while a build's damage grows far faster. In a Lab run, on the machine that
 * runs the enemies:
 *   - A POWER METER: every hit lands in G.Judgment.noteDmg (Enemy.hurt calls it on that machine, the guests' hits
 *     included), so each second keeps the most damage one enemy took and the biggest single hit; power() is the
 *     mean of the 5 best seconds of the last 60 (the team's single-target damage per second), maxHit() the
 *     biggest hit of the last 60 s.
 *   - From 15:00 a boss that joins the fight gets at least power() × S seconds of HP, S growing with the clock
 *     (u = (t − 15:00)/30 min, up to 1.5): a boss slot 10 + 14u (17 s at 30:00, 24 s at 45:00, 31 s at 60:00),
 *     a wild legendary 7 + 9u (11.5 / 16 / 20.5 s), the rift's legendary 14 + 16u (22 / 30 / 38 s), and never
 *     less than HITS of your biggest hits.
 *   - From 20:00 they can't be burst: one hit takes at most HIT_CAP of a boss's max HP (Enemy.hurt, this file
 *     loads before every Lab file that changes a hit's damage, so the cap applies to the final number).
 *   - From 30:00 they grow like the horde (js/fork/lab/endgame.js): HP × 1.2^((t − 30:00)/2 min) (×3.9 at 45:00)
 *     and the full horde damage factor (×8.1 at 45:00, ×34 at 60:00), their XP × √(the HP gained),
 *     at most ×3. Wild legendaries also get the bosses' own clock, which they lacked: HP × (1 + t/10 min) and
 *     damage × (1 + t/30 min), as rift-scaling.js gives the rift's.
 * Not for Arceus's Judgment, Eternatus and its obelisks, or a raid's or a site's guardian (_noPower: those set
 * their HP from power() themselves). Load order: before js/fork/rift-scaling.js and js/fork/lab/kinds.js (inner
 * wrapper of G.EnemyMgr.add, so the floor sees what rift-scaling and mega-rift made of the legendary, and of
 * Enemy.hurt). Hooks: G.Judgment.noteDmg / update / reset, G.EnemyMgr.add, G.Enemy.prototype.hurt.
 * Tests: fork/test-boss-power.cjs, fork/test-damage-pace.cjs (ordinary attacks after defenses).
 */
G.LabPower = (() => {
  const KEEP = 60, TOP = 5, FROM = 900, CAP_FROM = 1200, REGIME = 1800, HIT_CAP = 0.1, HITS = 8, XP_MAX = 3;
  const SECS = { slot: [10, 14], wild: [7, 9], rift: [14, 16] };
  const lab = () => !!(G.Lab && G.Lab.active);
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const after = (t, from) => Math.max(0, t - from);
  let hits = new Map(), big = 0, acc = 0, samples = [], peaks = [];

  function reset() { hits = new Map(); big = 0; acc = 0; samples = []; peaks = []; }
  function power() {
    const top = samples.slice().sort((a, b) => b - a).slice(0, TOP);
    return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  }
  const maxHit = () => peaks.reduce((a, b) => Math.max(a, b), 0);
  const u = t => G.U.clamp(after(t, FROM) / 1800, 0, 1.5);
  /** Seconds of the team's damage a boss of that kind lasts at least, at t. */
  function secs(kind, t) { const s = SECS[kind] || SECS.slot; return s[0] + s[1] * u(t); }
  /** The least HP a boss of that kind gets at t (0 before 15:00). */
  function floor(kind, t) { return t < FROM ? 0 : Math.max(power() * secs(kind, t), maxHit() * HITS); }
  const hpK = t => Math.pow(1.2, after(t, REGIME) / 120);
  const dmgK = t => G.LabEndgame ? G.LabEndgame.dmg(t) : 1;
  // Raids bypass the normal boss clock. Give ordinary hits the legendary damage clock too.
  const raidDmgK = t => (1 + Math.max(0, t) / 1800) * dmgK(t);

  // ---------------- the meter ----------------
  const J = G.Judgment, note = J.noteDmg;
  J.noteDmg = function (d, e) {
    if (e && !e.remote && d > 0 && Number.isFinite(d)) {
      hits.set(e.id, (hits.get(e.id) || 0) + d);
      if (d > big) big = d;
    }
    return note.apply(this, arguments);
  };
  const jUpdate = J.update;
  J.update = function (dt) {
    acc += dt;
    if (acc >= 1) {
      let best = 0;
      for (const v of hits.values()) if (v > best) best = v;
      samples.push(best / acc); peaks.push(big);
      if (samples.length > KEEP) samples.shift();
      if (peaks.length > KEEP) peaks.shift();
      hits.clear(); big = 0; acc = 0;
    }
    return jUpdate.apply(this, arguments);
  };
  const jReset = J.reset;
  J.reset = function () { reset(); return jReset.apply(this, arguments); };

  // ---------------- late bosses ----------------
  const kindOf = e => (e.legend && G.Rift.inArena ? 'rift' : e.wildLegend ? 'wild' : 'slot');
  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    if (e && e.boss && !e.remote && !e._power && !e.judge && !e.eternatus && !e.obelisk && !e._noPower && lab() && authority() && G.Game.st) {
      const t = G.Game.st.time;
      e._power = true;
      if (t >= FROM) {
        const kind = kindOf(e), was = e.maxHp;
        let hp = e.maxHp * hpK(t);
        if (kind === 'wild') { hp *= 1 + t / 600; e.dmg *= 1 + t / 1800; }
        hp = Math.max(hp, floor(kind, t));
        e.maxHp = e.hp = Math.round(hp);
        e.dmg *= dmgK(t);
        e.xp = Math.round(e.xp * Math.min(XP_MAX, Math.sqrt(e.maxHp / Math.max(1, was))));
        if (t >= CAP_FROM) e._hitCap = HIT_CAP;
      }
    }
    return add.apply(this, arguments);
  };

  const E = G.Enemy.prototype, hurt = E.hurt;
  E.hurt = function (amount) {
    if (this._hitCap && !this.remote && amount > this.maxHp * this._hitCap) {
      const a = [...arguments];
      a[0] = this.maxHp * this._hitCap;
      return hurt.apply(this, a);
    }
    return hurt.apply(this, arguments);
  };

  return { FROM, CAP_FROM, HIT_CAP, HITS, SECS, power, maxHit, secs, floor, hpK, dmgK, raidDmgK, reset,
    /** For the checks: what the meter holds. */
    get samples() { return samples.slice(); } };
})();
