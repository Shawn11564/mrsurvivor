/* ============ revive-grace.js — 3 s without damage after a revive (MrSurvivor fork) ============
 * Player.revive (a teammate's revive, the rift, Eternatus, the Revive card) gave 2 s of invuln, but
 * traps, explosions, lava, Arceus's touch and the Eternabeam set invuln to 0 before they hit, so a
 * player stood back up could go straight down again. Now for GRACE seconds after a revive nothing
 * hurts (Player.hurt does nothing; the weather's and Solar Power's small never-KO chip aside), and
 * you blink for all of it. Only your own Pokémon: a teammate's copy takes no damage here anyway.
 * The grace counts in game time (Player.update), so a pause doesn't use it up.
 * Test: fork/test-revive-grace.cjs.
 */
(() => {
  const GRACE = 3;
  const P = G.Player.prototype, revive = P.revive, hurt = P.hurt, update = P.update;
  P.revive = function () {
    const r = revive.apply(this, arguments);
    this.graceT = GRACE;
    this.invuln = Math.max(this.invuln || 0, GRACE);
    return r;
  };
  P.hurt = function () {
    if (this.graceT > 0 && !this.dead) { this.invuln = Math.max(this.invuln || 0, this.graceT); return; }
    return hurt.apply(this, arguments);
  };
  P.update = function (dt) {
    if (this.graceT > 0) this.graceT -= dt;
    return update.apply(this, arguments);
  };
})();
