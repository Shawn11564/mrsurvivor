/* ============ sheet-budget.js — sprite sheets that are no longer needed can go (MrSurvivor fork) ============
 * js/core/sprites.js keeps at most ~200 sprite sheets and drops the ones nobody drew for 20 s. But every
 * 10 s js/systems/spawner.js preloads G.Enemies.upcomingDex(t, 60), which is every tier that has ever
 * started plus every boss that has already come (all 7 animations each), and preloading counts as using
 * them. So the whole run's cast stayed in memory: at 15-19 min of a real run 337 sheets (59 Mpx decoded,
 * about 235 MB) plus 157 white hit-flash copies (27 Mpx, about 107 MB), and the cap never held.
 * Now, past the run's start, the preload list is what is about to come (tiers and bosses that start
 * within the next minute, or started under 30 s ago) and the species alive right now (so their attack,
 * hurt and faint animations stay ready). A species from an old tier that spawns again loads its sheets
 * on the spot (off screen, where everything spawns), and all of its animations are asked for when it
 * spawns. Nothing changes in what is drawn. Test: fork/test-perf.cjs (part 1).
 */
G.SheetBudget = (() => {
  const RECENT = 30;                  // s: a tier or boss that started this recently is still preloaded

  const upcoming = G.Enemies.upcomingDex;
  G.Enemies.upcomingDex = function (t, ahead = 60) {
    if (!(t > 0)) return upcoming.apply(this, arguments);      // the run's start: as upstream
    const out = new Set();
    for (const tier of G.Enemies.cast) if (tier.from <= t + ahead && tier.from > t - RECENT) for (const e of tier.list) out.add(e.dex);
    for (const b of G.Enemies.BOSSES) if (b.at <= t + ahead && b.at > t - RECENT) out.add(b.dex);
    for (const e of G.EnemyMgr.all()) if (!e.dead && typeof e.dex === 'number') out.add(e.dex);
    return [...out];
  };

  // A newly spawned enemy asks for all its animations at once (it spawns off screen, so they are ready
  // by the time it walks in, attacks or faints).
  const add = G.EnemyMgr.add;
  G.EnemyMgr.add = function (e) {
    if (e && typeof e.dex === 'number') for (const a of G.Sprites.ANIMS) G.Sprites.sheet(e.dex, a, !!e.shiny);
    return add.apply(this, arguments);
  };

  return { RECENT };
})();
