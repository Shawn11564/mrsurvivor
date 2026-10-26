/* ============ anims.js — animations for the signature moves (MrSurvivor fork) ============
 * Phase 5 of fork/LAB.md. Each signature (js/fork/lab/lab-moves.js) says which Mystery Dungeon
 * animations it prefers (anim: ['Kick', 'Attack']). The usual 7 are already there; the rest are
 * downloaded by fork/fetch-lab-anims.py to assets/pokemon/{dex}/lab/ and their geometry is in G.LAB_ANIMS
 * (js/fork/lab/lab-anims.js). Here they're added to G.SPRITE_META as 'lab/{Anim}', so
 * G.Sprites loads and draws them like any other (the path follows: {dex}/lab/Kick.png).
 *
 *   pick(pl, prefs)  the first of prefs that this Pokémon has (in its current look), or null
 *   len(pl, a)       how long it lasts, in seconds
 *   preload(pl)      loads its signatures' sheets when the run starts (so they don't flicker the first time)
 * Used by Player.cast (js/fork/lab/kinds.js).
 */
G.LabAnims = (() => {
  const BASE = new Set(G.Sprites.ANIMS);
  const LAB = G.LAB_ANIMS || {};
  for (const dex in LAB) {
    const m = G.SPRITE_META[dex], x = LAB[dex];
    if (!m) continue;
    for (const k in x.a) m.a['lab/' + k] = x.a[k];
    if (x.sa) { m.sa = m.sa || {}; for (const k in x.sa) m.sa['lab/' + k] = x.sa[k]; }
    if (x.sm) m.sm = (m.sm || []).concat(x.sm.map(k => 'lab/' + k));
  }

  function pick(pl, prefs) {
    // Not in another look (Mega Evolution, Transform, the admin menu): those are other sheets.
    if (!prefs || !pl || !pl.anim || pl.anim.dex !== pl.dex) return null;
    const m = G.SPRITE_META[pl.dex];
    if (!m) return null;
    const shiny = pl.anim.shiny;
    for (const p of prefs) {
      if (BASE.has(p)) return p;
      const k = 'lab/' + p;
      if (m.a[k] && !(shiny && m.sm && m.sm.includes(k))) return k;
    }
    return null;
  }

  function len(pl, a) {
    const g = G.Sprites.animMeta(pl.dex, a, pl.anim && pl.anim.shiny);
    return g ? g.d.reduce((s, d) => s + d, 0) / 60 : 0;
  }

  /** Your Pokémon's signature sheets (G.Lab, when a run starts). */
  function preload(pl) {
    const m = pl && G.SPRITE_META[pl.dex];
    if (!m) return;
    for (const id of G.Lab.SIG[pl.dex] || []) {
      const a = pick(pl, G.Moves.BY_ID[id].anim);
      if (a && !BASE.has(a)) G.Sprites.sheet(pl.dex, a, pl.shiny);
    }
  }

  return { pick, len, preload };
})();
