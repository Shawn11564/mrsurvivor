/* ============ fly-water.js — Flying types fly over water (MrSurvivor Lab) ============
 * In a Lab run your Pokémon flies over water and swamp if it's Flying type: no slowdown (it was x0.6 in
 * water, x0.45 in swamp) and no splashing. Lava, poison, sparks and ice work as before (only the water
 * kinds, the ones that just slow you). Enemies that hover already ignore the terrain (enemy.js flying).
 * How: a biome has one liquid kind, so while the run's liquid only slows (G.World.liquidEffect: slow) the
 * player's update runs with Levitate on top of its ability (player.js: "Levitación: flota por encima del
 * agua"), the ability object itself left untouched; the speed it walks at reads inLiquid, which Levitate
 * keeps false. Checked by fork/test-fly-water.cjs.
 */
(() => {
  const P = G.Player.prototype, update = P.update;
  const flies = pl => !!(G.Lab && G.Lab.active) && pl === G.Game.player && pl.mon && pl.mon.types.includes('flying')
    && !!G.World.liquidEffect(pl.mon.types).slow;

  P.update = function () {
    if (!flies(this)) return update.apply(this, arguments);
    const abil = this.abil;
    this.abil = Object.create(abil || null, { levitate: { value: true } });
    try { return update.apply(this, arguments); }
    finally { if (this.abil && Object.getPrototypeOf(this.abil) === abil && this.abil.levitate === true) this.abil = abil; }
  };
})();
