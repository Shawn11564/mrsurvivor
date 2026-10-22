/* ============ regen-pct.js — Synthesis heals a share of your max HP (MrSurvivor fork) ============
 * The Synthesis upgrade (js/data/upgrades.js 'regen') gave a flat +0.2 HP/s a level, +1 HP/s at 5:
 * it barely mattered once enemy damage grows (×2.4 at 10 min, ×5.3 at 30) and one in-run Synthesis
 * card gave +0.9/s. Now each level is +0.25 % of max HP a second (1.25 %/s at 5), worked out on the
 * live max HP, so HP cards and upgrades raise it too. G.Upgrades.perks gives regen 0 and regenPct;
 * the run's player gets regenPct (G.Game.startRun) and Player's regen getter adds regenPct × maxHp.
 * The in-run card and abilities (regenFlat) add on top. Test: fork/test-regen.cjs.
 */
(() => {
  const PER = 0.0025, OLD = 0.2;                      // a level: now 0.25 % of max HP/s; upstream's 0.2 HP/s
  const perks = G.Upgrades.perks;
  G.Upgrades.perks = function () {
    const p = perks.apply(this, arguments);
    p.regenPct = Math.round((p.regen || 0) / OLD) * PER;
    p.regen = 0;
    return p;
  };
  const P = G.Player.prototype, d = Object.getOwnPropertyDescriptor(P, 'regen');
  Object.defineProperty(P, 'regen', { configurable: true, get() { return d.get.call(this) + (this.regenPct || 0) * this.maxHp; } });
  // game.js loads after the fork's files: wrap it once loading is done (as js/fork/prestige.js does).
  function wrapRun() {
    const startRun = G.Game.startRun;
    G.Game.startRun = function () {
      const r = startRun.apply(this, arguments);
      const pl = G.Game.player;
      if (pl && pl.mon) pl.regenPct = G.Upgrades.perks(G.DB.upgradesOf(pl.mon.dex)).regenPct;
      return r;
    };
  }
  if (G.Game) wrapRun(); else addEventListener('DOMContentLoaded', wrapRun);
  G.I18n.add({ '+0.2 vida/s': '+0.25% max HP/s' }, 'en');
})();
