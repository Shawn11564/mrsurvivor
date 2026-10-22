/* ============ xp-pace.js — XP per kill keeps pace with the run (Lab first, MrSurvivor fork) ============
 * An enemy's XP comes from its tier (js/data/enemies.js) and the spawner's ×5.6 (elites ×1.6), with no
 * time term, while its HP grows ×(1 + t/95) and the spawn cap binds from about minute 8: kills per
 * second, so XP per second, fall off after the last tier arrives (8:20) and levels dry up (plan C1.2).
 * In a Lab run, each enemy that joins the fight brings
 *   XP × (1 + max(0, t − 500) / 600)     ×1 until 8:20, ×1.67 at 15:00, ×2.67 at 25:00, ×3.17 at 30:00
 * Regular enemies only (horde, summoned and shiny ones included): bosses (their table grows already,
 * js/fork/lab/boss-slots.js), rift legendaries (js/fork/rift-scaling.js), wild legendaries, Arceus's
 * Judgment and Eternatus's obelisks keep their own numbers.
 * It multiplies with the player's own XP multipliers (pl.xpMul: the Underdog bonus of
 * js/fork/lab/growth.js, up to +60 %, and the XP upgrade card) in Player.gainXp, as every XP source
 * does: an underdog keeps its +N % share of a bigger number (Underdog +60 % at 25:00: ×2.67 × 1.6 = ×4.27).
 * On the machine that runs the enemies (a guest's copy gets the host's numbers).
 * Hook: G.EnemyMgr.add (the rift-scaling.js pattern). Test: fork/test-xp-pace.cjs.
 */
G.LabXpPace = (() => {
  const FROM = 500, PER = 600;
  const factor = t => 1 + Math.max(0, t - FROM) / PER;
  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    if (e && !e.remote && !e._xpPaced && !e.boss && !e.legend && !e.wildLegend && !e.judge && !e.obelisk
      && G.Lab && G.Lab.active && G.Game.st && e.xp > 0) {
      e._xpPaced = true;
      e.xp = Math.round(e.xp * factor(G.Game.st.time));
    }
    return add.apply(this, arguments);
  };
  return { FROM, PER, factor };
})();
