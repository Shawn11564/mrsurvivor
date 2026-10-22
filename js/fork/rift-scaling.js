/* ============ rift-scaling.js — rift legendaries get harder as the run goes on (MrSurvivor fork) ============
 * js/systems/rift.js gives the rift's legendary 3200 + 9 HP a second of run and 36 + t/20 damage: linear,
 * so later on it fell far behind (at 15:00, 11 300 HP against a regular boss's 16 000 × 2.5 = 40 000).
 * On top of that, as it enters the arena:
 *   HP      × (1 + t/600)    the regular bosses' curve (G.Enemies.bossScale): ×2.5 at 15:00, ×4 at 30:00
 *   damage  × (1 + t/1800)   contact and shots (shotDmg follows dmg): ×1.5 at 15:00, ×2 at 30:00
 *   XP      × (1 + t/1200)   a bit more for the longer fight
 * Only the rift's legendary (e.legend, set by rift.js, in the arena), on the machine that runs the enemies
 * (a guest's copy gets the host's numbers). Test: fork/test-rift-scaling.cjs.
 */
(() => {
  const HP = 600, DMG = 1800, XP = 1200;
  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    if (e && e.legend && !e.remote && !e._riftScaled && G.Rift.inArena && G.Game.st) {
      const t = G.Game.st.time;
      e._riftScaled = true;
      e.maxHp = e.hp = Math.round(e.maxHp * (1 + t / HP));
      e.dmg *= 1 + t / DMG;
      e.xp = Math.round(e.xp * (1 + t / XP));
    }
    return add.apply(this, arguments);
  };
})();
