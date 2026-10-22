/* ============ pool-bloat.js — fewer new-move cards from TMs early on, and 5 vetoes (MrSurvivor fork) ============
 * Plan G7 (upstream #281, #232; doofcraft went 3 -> 5 bans). TMs taught at Kecleon's add moves of other
 * types to what a Pokémon can learn, in every run (and in Lab runs since plan D4), so a dual-type with a
 * few TMs got so many new-move cards that it never reached the stat cards. For everyone:
 *   - Veto (Upgrades) goes to 5 levels instead of 3 (G.Upgrades.BY.ban.max; levels 4 and 5 cost
 *     2,060 and 3,910 coins with upstream's formula). js/core/db.js keeps up to that many per Pokémon
 *     (a one-line hook: it cut the list at 3).
 *   - While you have fewer than 2 moves (pl.slots), each TM-taught move only enters a level-up hand's
 *     draw TM_KEEP of the time (the moves it knows without a TM always do): TM cards come about 40 %
 *     as often until its own moves are in. From the 2nd move on, as before.
 * Hooks: G.LevelUp.offer (marks whose hand is being drawn, chained) and G.Moves.poolFor (outermost: it
 * loads after js/fork/lab/lab.js, so it sees the Lab list too). Test: fork/test-pool-bloat.cjs.
 */
G.PoolBloat = (() => {
  const BANS = 5, TM_KEEP = 0.4, EARLY = 2;
  if (G.Upgrades && G.Upgrades.BY.ban) G.Upgrades.BY.ban.max = BANS;

  let drawing = null;                                 // the player whose level-up hand is being drawn
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = function (pl) {
    const was = drawing;
    drawing = pl || null;
    try { return offer.apply(this, arguments); } finally { drawing = was; }
  };

  /** TM-taught moves in this list: the ones `natural` (no TMs) leaves out. */
  const poolFor = G.Moves.poolFor;
  G.Moves.poolFor = function (mon, natural) {
    const ids = poolFor.apply(this, arguments);
    const pl = drawing;
    if (natural || !pl || pl.mon !== mon || !pl.slots || pl.slots.length >= EARLY) return ids;
    const own = new Set(poolFor.call(this, mon, true));
    return ids.filter(id => own.has(id) || Math.random() < TM_KEEP);
  };

  return { BANS, TM_KEEP, EARLY };
})();
