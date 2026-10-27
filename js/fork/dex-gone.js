/* ============ dex-gone.js — forms taken out of the game (MrSurvivor fork) ============
 * Forms js/fork/extra-dex-data.js still has (fork/fetch-extra-dex.py makes them) but the owner removed. They were
 * Pokémon of their own on 2026-10-26. js/fork/extra-dex.js leaves them out of G.DEX (gacha banners, collection, wild
 * and rift pools, trades, the Radiant Kit) but keeps their G.DEX_BY row and sheets, so old leaderboard scores still
 * draw. A save that owns one gets the Pokémon named here instead (G.forkMigrate). fork/build.cjs reads it too (no
 * site pages for them).
 *   G.FORK_DEX_GONE   form dex -> the dex a save gets instead
 * Test: fork/test-extra-dex.cjs.
 */
G.FORK_DEX_GONE = {
  1578: 710, // Small Pumpkaboo (owner, 2026-10-27)
  1579: 710, // Large Pumpkaboo
  1580: 710, // Super Size Pumpkaboo
  1581: 711 // Super Size Gourgeist
};
