/* ============ shiny.js — los shiny, algo más que otro color, en el modo Lab (fork MrSurvivor) ============
 * Fase 7 de fork/LAB.md. En una partida Lab con tu Pokémon shiny:
 *   - sus ataques salen con SUS colores: se comparan la hoja Idle normal y la shiny, se toman los
 *     píxeles que cambian y su tono más frecuente da una paleta de 5 tonos (G.VFX.PAL 'shiny{dex}');
 *     cada movimiento suyo la lleva en m.look (lab.js la pone por encima de la del tipo).
 *     Charizard shiny tira llamas negras; Gyarados shiny, agua roja. Si el shiny apenas cambia de
 *     color (o la hoja no se puede leer), sus ataques se quedan como siempre.
 *   - pequeños extras que no tocan el ranking (no hay ranking en el Lab): +10 % de experiencia,
 *     +10 % de monedas y un cambio de cartas más (BONUS).
 * Cooperativo: el fantasma de un compañero shiny (Combat.ghostCast) también sale con su paleta.
 * Prueba: fork/test-lab.cjs.
 */
G.LabShiny = (() => {
  const BONUS = { xp: 0.1, coins: 0.1, rerolls: 1 };
  const pals = {};                         // dex -> 'shiny{dex}' | null (no se distingue) ; sin calcular: undefined

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

  /** La paleta de su shiny: 'shiny{dex}', null si no hay diferencia clara, undefined si aún no se puede. */
  function paletteOf(dex) {
    if (dex in pals) return pals[dex];
    if (!G.Sprites.hasShiny(dex)) return (pals[dex] = null);
    let a, b;
    try { a = pixels(dex, false); b = pixels(dex, true); } catch (e) { return (pals[dex] = null); }   // (file:// no deja leerla)
    if (!a || !b) return undefined;
    // Los píxeles que cambian de la normal a la shiny (o toda la shiny, si las hojas no casan).
    const same = a.width === b.width && a.height === b.height;
    const bins = new Array(24).fill(0), sum = new Array(24).fill(0), sat = new Array(24).fill(0);
    for (let i = 0; i < b.data.length; i += 4) {
      if (b.data[i + 3] < 128) continue;
      if (same && Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) < 60) continue;
      const [h, s, l] = hsl(b.data[i], b.data[i + 1], b.data[i + 2]);
      if (l < 0.08 || l > 0.95) continue;
      const k = Math.floor(h / 15) % 24, w = 0.25 + s;
      bins[k] += w; sum[k] += h * w; sat[k] += s * w;
    }
    const best = bins.indexOf(Math.max(...bins)), total = bins.reduce((x, y) => x + y, 0);
    if (total < 20) return (pals[dex] = null);
    const h = sum[best] / bins[best], s = G.U.clamp(sat[best] / bins[best], 0.15, 0.9);
    const key = 'shiny' + dex;
    G.VFX.PAL[key] = [hex(h, s * 0.8, 0.12), hex(h, s, 0.3), hex(h, s, 0.5), hex(h, s * 0.9, 0.72), hex(h, s * 0.5, 0.93)];
    return (pals[dex] = key);
  }

  /** Sus movimientos con su paleta (los que ya tiene; los nuevos, al aprenderlos). */
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

  // Los fantasmas de un compañero shiny: sus instancias, con la paleta (Combat.ghostCast las crea).
  const ghostCast = G.Combat.ghostCast;
  G.Combat.ghostCast = function (pl) {
    const key = G.Lab.active && pl && pl.shiny ? paletteOf(pl.dex) : null;
    if (!key) return ghostCast.apply(this, arguments);
    const inst = G.Moves.instance;
    G.Moves.instance = function () { const s = inst.apply(this, arguments); s.look = Object.assign({}, s.look, { pal: key }); return s; };
    try { return ghostCast.apply(this, arguments); } finally { G.Moves.instance = inst; }
  };

  function start(p) {
    p._labPal = null;
    if (!p.shiny) return;
    p.xpMul *= 1 + BONUS.xp; p.coinMul *= 1 + BONUS.coins; p.rerollBonus = (p.rerollBonus || 0) + BONUS.rerolls;
    p._labShiny = true;
    G.Sprites.preload([p.dex], 8000, false);           // la normal, para compararla
  }
  // Hasta que las dos hojas estén cargadas (y al evolucionar, la de la evolución).
  setInterval(() => {
    const p = G.Game.player;
    if (!p || !p._labShiny || !G.Lab.active) return;
    if (p._labPalDex !== p.dex) {
      const key = paletteOf(p.dex);
      if (key === undefined) return;
      p._labPalDex = p.dex; p._labPal = key;
      paint(p);
    }
  }, 300);

  G.Lab.pauseLine(p => p._labShiny ? 'Shiny: +10% XP, +10% coins and one more card reroll' + (p._labPal ? '; its moves take its shiny colours.' : '.') : '');

  return { start, paletteOf, BONUS };
})();
