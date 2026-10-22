/* ============ mobility.js — moves that move you, in Lab runs (MrSurvivor fork) ============
 * fork/PLAN-2026-10-22.md section A (stream A); fork/LAB.md "Close range and mobility".
 *
 * Relocation grace (A1.2): for RELOC s after a dash, recoil, leap or roll moves you, nothing hurts you
 * (Player.hurt does nothing, like js/fork/revive-grace.js). A move's own invulnerability didn't cover
 * what kills close players: hazards and lava set invuln to 0 before they hit (hazards.js, player.js),
 * and a mover drops you into the crowd. A leap's grace runs to RELOC s after it lands. Game time
 * (Player.update), so a pause doesn't use it up. A new grace starts at most once per RELOC_EVERY s:
 * an evolved Quick Attack recharges in under 0.5 s and would otherwise never be hit at all.
 *
 * Only your own Pokémon, only in Lab runs. Hooks: wraps G.Player.prototype.cast (after Lab's kinds),
 * hurt and update. Test: fork/test-close-range.cjs.
 */
G.LabMobility = (() => {
  const RELOC = 0.5, RELOC_EVERY = 1.2;
  const lab = () => !!(G.Lab && G.Lab.active);
  /** Seconds of grace a cast of `m` gives (0: it doesn't move you). */
  function graceFor(m) {
    if (!m) return 0;
    if (m.kind === 'dash' || m.kind === 'recoil' || (m.kind === 'ramp' && m.roll)) return RELOC;
    if (m.kind === 'leap') return (m.dur || 0.65) + Math.max(0, (m.chain || 1) - 1) * (m.chainDur || 0.32) + RELOC;
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

  return { RELOC, RELOC_EVERY, graceFor };
})();
