/* ============ shiny.js — shinies, more than just another colour (MrSurvivor fork) ============
 * Phase 7 of fork/LAB.md. In a run with your Pokémon shiny:
 *   - its attacks come out in ITS colours: the normal and shiny Idle sheets are compared, the
 *     pixels that change are taken and their most STRIKING colour gives a 5-tone palette (G.VFX.PAL 'shiny{dex}');
 *     each of its moves carries it in m.look (lab.js puts it above the type's).
 *     The vote (paletteFrom), like the wool colour of Pokeblocks' pokédolls
 *     (ColorFactory.sampleDominantWools): each pixel weighs 0.05 + chroma² (chroma = max - min of RGB:
 *     vivid and light at once), so a red accent beats a black or grey body even when it covers
 *     less. True greys (chroma < 0.06) are counted apart and only win if there is almost no colour (the
 *     palette comes out grey: shiny Rayquaza). The hue is the circular mean of the best 30° window
 *     (red isn't split between 355° and 5°). Shiny Charizard throws reddish flames (its wings);
 *     shiny Gyarados, red water; shiny Metagross, golden. If its colour barely changes (or the sheet
 *     can't be read), its attacks stay as they always are.
 *   - RADIANTS (js/fork/radiant.js), the same with their r/Idle sheet ('radiant{dex}'); while you play
 *     the radiant you don't count as shiny, and its extras are bigger than the shiny's (RBONUS).
 *   - one more card reroll for the shiny, two for the radiant (BONUS / RBONUS). They also gave
 *     +10 % / +20 % XP and coins until 2026-10-22; now shinies and radiants roll stat boosts in
 *     every run instead (js/fork/variant-stats.js). The collection card shows both (js/fork/lab/variant-bonus.js).
 * Co-op: a shiny teammate's ghost (Combat.ghostCast) also comes out in its palette.
 * Test: fork/test-lab.cjs.
 */
G.LabShiny = (() => {
  const BONUS = { rerolls: 1 };      // shiny
  const RBONUS = { rerolls: 2 };     // radiant: always more than the shiny
  const W_BASE = 0.05, GREY = 0.06;          // each pixel's vote: W_BASE + chroma²; below GREY, grey
  const pals = {};                         // 'shiny6' / 'radiant6' -> that key | null (no clear difference) ; not computed yet: undefined

  const hex = (h, s, l) => {
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function pixels(dex, shiny) {
    const s = G.Sprites.sheet(dex, 'Idle', shiny);
    if (!s || !s.ready) return null;
    const c = document.createElement('canvas');
    c.width = s.img.width; c.height = s.img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(s.img, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }

  /**
   * The palette of the colours that change from sheet `a` (normal) to `b` (shiny or radiant), with
   * the most striking colour first (see above). → [5 colours] or null if it barely changes.
   */
  function paletteFrom(a, b) {
    const same = a.width === b.width && a.height === b.height;
    const bins = new Array(24).fill(0), vx = new Array(24).fill(0), vy = new Array(24).fill(0), sat = new Array(24).fill(0);
    let neutral = 0, n = 0;
    for (let i = 0; i < b.data.length; i += 4) {
      if (b.data[i + 3] < 128) continue;
      const r = b.data[i], g = b.data[i + 1], bl = b.data[i + 2];
      // The pixels that change from the normal one to the other (or all of the other, if the sheets don't match).
      if (same && Math.abs(a.data[i] - r) + Math.abs(a.data[i + 1] - g) + Math.abs(a.data[i + 2] - bl) < 60) continue;
      const [h, s, l] = hsl(r, g, bl);
      if (l < 0.08 || l > 0.95) continue;                   // outlines and highlights
      const c = (Math.max(r, g, bl) - Math.min(r, g, bl)) / 255, w = W_BASE + c * c;
      n++;
      if (c < GREY) { neutral += w; continue; }
      const k = Math.floor(h / 15) % 24, rad = h * Math.PI / 180;
      bins[k] += w; vx[k] += w * Math.cos(rad); vy[k] += w * Math.sin(rad); sat[k] += s * w;
    }
    if (n < 40) return null;
    // The best window of two adjacent bins (30°), wrapping around: 345°-15° is one.
    let best = 0;
    for (let k = 1; k < 24; k++) if (bins[k] + bins[(k + 1) % 24] > bins[best] + bins[(best + 1) % 24]) best = k;
    const win = [best, (best + 1) % 24], cw = win.reduce((t, k) => t + bins[k], 0);
    if (cw < 0.2 * neutral) return [0.12, 0.3, 0.5, 0.72, 0.93].map(l => hex(0, 0, l));    // almost all grey: grey palette
    const h = (Math.atan2(vy[win[0]] + vy[win[1]], vx[win[0]] + vx[win[1]]) * 180 / Math.PI + 360) % 360;
    const s = G.U.clamp((sat[win[0]] + sat[win[1]]) / cw, 0.15, 0.9);
    return [hex(h, s * 0.8, 0.12), hex(h, s, 0.3), hex(h, s, 0.5), hex(h, s * 0.9, 0.72), hex(h, s * 0.5, 0.93)];
  }

  /** G.VFX.PAL key with the palette of its shiny ('shiny{dex}') or, with radiant, of its radiant
   *  ('radiant{dex}'); null if there's no clear difference, undefined if the sheets haven't loaded yet. */
  function paletteOf(dex, radiant = false) {
    const key = (radiant ? 'radiant' : 'shiny') + dex;
    if (key in pals) return pals[key];
    if (radiant ? !(G.Radiant && G.Radiant.has(dex)) : !G.Sprites.hasShiny(dex)) return (pals[key] = null);
    let a, b;
    try { a = pixels(dex, false); b = radiant ? pixels(G.Radiant.key(dex), false) : pixels(dex, true); }
    catch (e) { return (pals[key] = null); }                 // (file:// won't let us read it)
    if (!a || !b) return undefined;
    const pal = paletteFrom(a, b);
    if (!pal) return (pals[key] = null);
    G.VFX.PAL[key] = pal;
    return (pals[key] = key);
  }

  /** Its moves in its palette (the ones it already has; new ones, when it learns them). */
  function paint(p) {
    const key = p._labPal;
    if (!key) return;
    for (const m of p.moves) if (!m.look || m.look.pal !== key) m.look = Object.assign({}, m.look, { pal: key });
  }
  const P = G.Player.prototype, addMove = P.addMove;
  P.addMove = function () {
    const ok = addMove.apply(this, arguments);
    if (ok && this._labPal) paint(this);
    return ok;
  };

  // The ghosts of a shiny or radiant teammate: their instances, in the palette (Combat.ghostCast creates them).
  const ghostCast = G.Combat.ghostCast;
  G.Combat.ghostCast = function (pl) {
    const key = !G.Lab.active || !pl ? null : pl.radiant ? paletteOf(pl.dex, true) : pl.shiny ? paletteOf(pl.dex) : null;
    if (!key) return ghostCast.apply(this, arguments);
    const inst = G.Moves.instance;
    G.Moves.instance = function () { const s = inst.apply(this, arguments); s.look = Object.assign({}, s.look, { pal: key }); return s; };
    try { return ghostCast.apply(this, arguments); } finally { G.Moves.instance = inst; }
  };

  function start(p) {
    p._labPal = null;
    // With its radiant: its colours and its extras (RBONUS, not the shiny's; it stops counting as shiny).
    if (G.Radiant && G.Radiant.wants(p.dex)) {
      p.shiny = false; p._labRadiant = true;
      p.rerollBonus = (p.rerollBonus || 0) + RBONUS.rerolls;
      G.Sprites.preload([p.dex], 8000, false);         // the normal one, to compare with
      return;
    }
    if (!p.shiny) return;
    p.rerollBonus = (p.rerollBonus || 0) + BONUS.rerolls;
    p._labShiny = true;
    G.Sprites.preload([p.dex], 8000, false);           // the normal one, to compare with
  }
  // Until both sheets have loaded (and on evolving, the evolution's).
  setInterval(() => {
    const p = G.Game && G.Game.player;             // (dev.html may still be loading js/game.js)
    if (!p || !(p._labShiny || p._labRadiant) || !G.Lab.active) return;
    if (p._labPalDex !== p.dex) {
      const key = paletteOf(p.dex, !!p._labRadiant);
      if (key === undefined) return;
      p._labPalDex = p.dex; p._labPal = key;
      paint(p);
    }
  }, 300);

  G.Lab.pauseLine(p => p._labShiny ? 'Shiny: one more card reroll' + (p._labPal ? '; its moves take on its shiny colours.' : '.')
    : p._labRadiant ? 'Radiant: two more card rerolls' + (p._labPal ? '; its moves take on its radiant colours.' : '.') : '');

  return { start, paletteOf, paletteFrom, BONUS, RBONUS };
})();
