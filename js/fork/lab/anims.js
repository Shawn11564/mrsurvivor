/* ============ anims.js — animaciones de los movimientos de firma del modo Lab (fork MrSurvivor) ============
 * Fase 5 de fork/LAB.md. Cada firma (js/fork/lab/lab-moves.js) dice qué animaciones de Mundo
 * Misterioso prefiere (anim: ['Kick', 'Attack']). Las 7 de siempre ya están; las demás las baja
 * fork/fetch-lab-anims.py a assets/pokemon/{dex}/lab/ y su geometría va en G.LAB_ANIMS
 * (js/fork/lab/lab-anims.js). Aquí se añaden a G.SPRITE_META como 'lab/{Anim}', así que
 * G.Sprites las carga y las dibuja como cualquier otra (la ruta sale sola: {dex}/lab/Kick.png).
 *
 *   pick(pl, prefs)  la primera de prefs que tiene ese Pokémon (con su aspecto de ahora), o null
 *   len(pl, a)       lo que dura, en segundos
 *   preload(pl)      baja las de sus firmas al empezar la partida (que no parpadeen la primera vez)
 * La usa Player.cast (js/fork/lab/kinds.js).
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
    // Con otro aspecto (megaevolución, Transformación, el menú de admin) no: son otras hojas.
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

  /** Las hojas de las firmas de tu Pokémon (G.Lab al empezar una partida Lab). */
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
