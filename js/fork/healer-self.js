/* ============ healer-self.js — enemy healers don't heal themselves (MrSurvivor fork) ============
 * A healer's heal (Enemy.healAround in js/entities/enemy.js) heals every hurt enemy within 150 px,
 * and G.EnemyMgr.queryCircle finds the healer too, so a lone healer topped itself up every cast.
 * While it heals, queryCircle leaves the healer out: it heals the others (another healer included)
 * and not itself. Its ring and sound stay. Test: fork/test-healer.cjs.
 */
(() => {
  const P = G.Enemy.prototype, healAround = P.healAround;
  P.healAround = function () {
    const M = G.EnemyMgr, query = M.queryCircle, me = this;
    M.queryCircle = function () { return query.apply(this, arguments).filter(e => e !== me); };
    try { return healAround.apply(this, arguments); } finally { M.queryCircle = query; }
  };
})();
